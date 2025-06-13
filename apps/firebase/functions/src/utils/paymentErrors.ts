import {logger} from "firebase-functions/v2";
import {ErrorCode, createError, handleError} from "./errors";

/**
 * Payment error severity levels for monitoring and alerting
 */
export enum PaymentErrorSeverity {
  LOW = "low", // Informational, no action needed
  MEDIUM = "medium", // Needs attention but not critical
  HIGH = "high", // Critical, needs immediate attention
  CRITICAL = "critical", // Service-affecting, requires immediate action
}

/**
 * Payment error context for enhanced logging and recovery
 */
export interface PaymentErrorContext {
  userId: string;
  subscriptionId?: string;
  stripeCustomerId?: string;
  paymentMethodId?: string;
  amount?: number;
  currency?: string;
  planType?: string;
  attemptNumber?: number;
  lastAttemptAt?: Date;
  errorCode?: string;
  errorMessage?: string;
  stripeErrorType?: string;
  [key: string]: any;
}

/**
 * Payment retry configuration
 */
export interface PaymentRetryConfig {
  maxAttempts: number;
  initialDelayMs: number;
  maxDelayMs: number;
  backoffMultiplier: number;
  retryableErrors: string[];
}

/**
 * Default retry configuration for payment operations
 */
export const DEFAULT_PAYMENT_RETRY_CONFIG: PaymentRetryConfig = {
  maxAttempts: 3,
  initialDelayMs: 5000, // 5 seconds
  maxDelayMs: 300000, // 5 minutes
  backoffMultiplier: 2,
  retryableErrors: [
    "network_error",
    "api_connection_error",
    "rate_limit_error",
    "processing_error",
    "lock_timeout",
  ],
};

/**
 * Maps Stripe error types to our error codes and severity levels
 */
export const STRIPE_ERROR_MAPPING: Record<string, {code: ErrorCode; severity: PaymentErrorSeverity}> = {
  // Card errors
  card_declined: {code: ErrorCode.PAYMENT_FAILED, severity: PaymentErrorSeverity.MEDIUM},
  expired_card: {code: ErrorCode.PAYMENT_FAILED, severity: PaymentErrorSeverity.MEDIUM},
  incorrect_cvc: {code: ErrorCode.PAYMENT_FAILED, severity: PaymentErrorSeverity.LOW},
  processing_error: {code: ErrorCode.PAYMENT_FAILED, severity: PaymentErrorSeverity.MEDIUM},
  incorrect_number: {code: ErrorCode.PAYMENT_FAILED, severity: PaymentErrorSeverity.LOW},

  // Payment method errors
  payment_method_required: {code: ErrorCode.PAYMENT_METHOD_REQUIRED, severity: PaymentErrorSeverity.HIGH},
  payment_method_unaccepted: {code: ErrorCode.PAYMENT_FAILED, severity: PaymentErrorSeverity.MEDIUM},

  // Customer errors
  customer_not_found: {code: ErrorCode.NOT_FOUND, severity: PaymentErrorSeverity.HIGH},
  subscription_not_found: {code: ErrorCode.SUBSCRIPTION_NOT_FOUND, severity: PaymentErrorSeverity.HIGH},

  // API errors
  api_connection_error: {code: ErrorCode.SERVICE_UNAVAILABLE, severity: PaymentErrorSeverity.CRITICAL},
  api_error: {code: ErrorCode.STRIPE_ERROR, severity: PaymentErrorSeverity.HIGH},
  authentication_error: {code: ErrorCode.STRIPE_ERROR, severity: PaymentErrorSeverity.CRITICAL},
  rate_limit_error: {code: ErrorCode.RATE_LIMITED, severity: PaymentErrorSeverity.MEDIUM},

  // Validation errors
  invalid_request_error: {code: ErrorCode.INVALID_ARGUMENT, severity: PaymentErrorSeverity.LOW},
  idempotency_error: {code: ErrorCode.STRIPE_ERROR, severity: PaymentErrorSeverity.MEDIUM},
};

/**
 * Grace period configuration for different error types
 */
export const GRACE_PERIOD_CONFIG = {
  paymentFailed: {
    durationDays: 7,
    maxRetries: 3,
    notificationIntervals: [0, 3, 6], // Days after failure
  },
  subscriptionExpired: {
    durationDays: 3,
    maxRetries: 1,
    notificationIntervals: [0, 2],
  },
  paymentMethodExpired: {
    durationDays: 14,
    maxRetries: 5,
    notificationIntervals: [0, 7, 13],
  },
};

/**
 * Enhanced error handler for payment-related errors
 */
export class PaymentErrorHandler {
  /**
   * Handle Stripe-specific errors with appropriate mapping and logging
   */
  static handleStripeError(
    error: any,
    context: PaymentErrorContext,
    functionName: string
  ): never {
    // Log comprehensive error details
    logger.error(`[${functionName}] Stripe payment error`, {
      ...context,
      stripeError: {
        type: error.type,
        code: error.code,
        decline_code: error.decline_code,
        message: error.message,
        param: error.param,
        charge: error.charge,
        payment_intent: error.payment_intent,
        payment_method: error.payment_method,
        setup_intent: error.setup_intent,
      },
    });

    // Determine error mapping
    const errorMapping = STRIPE_ERROR_MAPPING[error.code] ||
                        STRIPE_ERROR_MAPPING[error.type] ||
                        {code: ErrorCode.STRIPE_ERROR, severity: PaymentErrorSeverity.HIGH};

    // Track error metrics
    this.trackPaymentError(error, errorMapping.severity, context);

    // Create user-friendly error message
    const userMessage = this.getUserFriendlyMessage(error, errorMapping.code);

    // Throw standardized error
    throw createError(errorMapping.code, userMessage, {
      ...context,
      severity: errorMapping.severity,
      stripeErrorCode: error.code,
      stripeErrorType: error.type,
      retryable: this.isRetryableError(error),
    });
  }

  /**
   * Check if an error is retryable
   */
  static isRetryableError(error: any): boolean {
    const retryableTypes = ["api_connection_error", "rate_limit_error"];
    const retryableCodes = ["lock_timeout", "processing_error", "network_error"];

    return retryableTypes.includes(error.type) ||
           retryableCodes.includes(error.code) ||
           (error.statusCode && error.statusCode >= 500);
  }

  /**
   * Get user-friendly error message based on error type
   */
  static getUserFriendlyMessage(error: any, errorCode: ErrorCode): string {
    // Card-specific messages
    if (error.type === "StripeCardError") {
      switch (error.decline_code || error.code) {
      case "insufficient_funds":
        return "Your card has insufficient funds. Please try another payment method.";
      case "card_declined":
        return "Your card was declined. Please check with your bank or try another card.";
      case "expired_card":
        return "Your card has expired. Please update your payment method.";
      case "incorrect_cvc":
        return "The security code (CVC) is incorrect. Please check and try again.";
      case "processing_error":
        return "An error occurred processing your card. Please try again.";
      default:
        return "There was an issue with your payment method. Please try another card.";
      }
    }

    // Use default messages for error codes
    const defaultMessages: Partial<Record<ErrorCode, string>> = {
      [ErrorCode.PAYMENT_METHOD_REQUIRED]: "Please add a payment method to continue.",
      [ErrorCode.STRIPE_ERROR]: "A payment processing error occurred. Please try again later.",
      [ErrorCode.SERVICE_UNAVAILABLE]: "Payment service is temporarily unavailable. Please try again later.",
      [ErrorCode.RATE_LIMITED]: "Too many payment attempts. Please wait a few minutes and try again.",
    };

    return defaultMessages[errorCode] || error.message || "An unexpected payment error occurred.";
  }

  /**
   * Track payment error for monitoring and alerting
   */
  static trackPaymentError(
    error: any,
    severity: PaymentErrorSeverity,
    context: PaymentErrorContext
  ): void {
    const errorMetrics = {
      timestamp: new Date().toISOString(),
      severity,
      errorType: error.type || "unknown",
      errorCode: error.code || "unknown",
      userId: context.userId,
      subscriptionId: context.subscriptionId,
      amount: context.amount,
      currency: context.currency,
      planType: context.planType,
      attemptNumber: context.attemptNumber || 1,
    };

    // Log to monitoring system
    logger.log({
      severity: this.mapSeverityToLogLevel(severity),
      message: "Payment error tracked",
      labels: {
        type: "payment_error",
        severity,
      },
      data: errorMetrics,
    });

    // TODO: Send to monitoring dashboard (e.g., Sentry, DataDog)
    // TODO: Trigger alerts for critical errors
  }

  /**
   * Map payment error severity to logging severity
   */
  private static mapSeverityToLogLevel(severity: PaymentErrorSeverity): string {
    switch (severity) {
    case PaymentErrorSeverity.LOW:
      return "INFO";
    case PaymentErrorSeverity.MEDIUM:
      return "WARNING";
    case PaymentErrorSeverity.HIGH:
      return "ERROR";
    case PaymentErrorSeverity.CRITICAL:
      return "CRITICAL";
    default:
      return "ERROR";
    }
  }

  /**
   * Calculate retry delay with exponential backoff
   */
  static calculateRetryDelay(
    attemptNumber: number,
    config: PaymentRetryConfig = DEFAULT_PAYMENT_RETRY_CONFIG
  ): number {
    const delay = Math.min(
      config.initialDelayMs * Math.pow(config.backoffMultiplier, attemptNumber - 1),
      config.maxDelayMs
    );

    // Add jitter to prevent thundering herd
    const jitter = Math.random() * 0.1 * delay;
    return Math.floor(delay + jitter);
  }

  /**
   * Determine if operation should be retried
   */
  static shouldRetry(
    error: any,
    attemptNumber: number,
    config: PaymentRetryConfig = DEFAULT_PAYMENT_RETRY_CONFIG
  ): boolean {
    if (attemptNumber >= config.maxAttempts) {
      return false;
    }

    return this.isRetryableError(error);
  }

  /**
   * Log payment attempt for audit trail
   */
  static async logPaymentAttempt(
    context: PaymentErrorContext,
    status: "success" | "failed" | "retry",
    error?: any
  ): Promise<void> {
    const logEntry = {
      timestamp: new Date().toISOString(),
      userId: context.userId,
      subscriptionId: context.subscriptionId,
      stripeCustomerId: context.stripeCustomerId,
      paymentMethodId: context.paymentMethodId,
      amount: context.amount,
      currency: context.currency,
      planType: context.planType,
      attemptNumber: context.attemptNumber || 1,
      status,
      error: error ? {
        code: error.code,
        type: error.type,
        message: error.message,
        decline_code: error.decline_code,
      } : undefined,
    };

    logger.info("Payment attempt logged", logEntry);

    // TODO: Store in payment_attempts collection for audit trail
  }
}

/**
 * Retry wrapper for payment operations
 */
export async function withPaymentRetry<T>(
  operation: (idempotencyKey?: string) => Promise<T>,
  context: PaymentErrorContext,
  functionName: string,
  config: PaymentRetryConfig = DEFAULT_PAYMENT_RETRY_CONFIG,
  idempotencyKeyBase?: string
): Promise<T> {
  let lastError: any;

  for (let attempt = 1; attempt <= config.maxAttempts; attempt++) {
    try {
      context.attemptNumber = attempt;

      // Generate idempotency key for this attempt
      const idempotencyKey = idempotencyKeyBase ?
        `${idempotencyKeyBase}-attempt-${attempt}-${Date.now()}` :
        undefined;

      // Log attempt
      await PaymentErrorHandler.logPaymentAttempt(context, "retry");

      // Execute operation with idempotency key
      const result = await operation(idempotencyKey);

      // Log success
      await PaymentErrorHandler.logPaymentAttempt(context, "success");

      return result;
    } catch (error) {
      lastError = error;

      // Log failure
      await PaymentErrorHandler.logPaymentAttempt(context, "failed", error);

      // Check if we should retry
      if (!PaymentErrorHandler.shouldRetry(error, attempt, config)) {
        break;
      }

      // Calculate delay before next attempt
      if (attempt < config.maxAttempts) {
        const delay = PaymentErrorHandler.calculateRetryDelay(attempt, config);
        logger.info(`Retrying payment operation in ${delay}ms`, {
          attempt,
          maxAttempts: config.maxAttempts,
          delay,
          functionName,
          ...context,
        });

        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }

  // All attempts failed
  if (lastError.type && lastError.code) {
    // Stripe error
    PaymentErrorHandler.handleStripeError(lastError, context, functionName);
  } else {
    // Generic error
    handleError(lastError, functionName, ErrorCode.PAYMENT_FAILED, context);
  }

  // TypeScript satisfaction (unreachable)
  throw lastError;
}
