/**
 * Standardized Error Handler for Firebase Functions
 * Provides consistent error handling and response formatting
 * Bridges with web client error handling system
 */

import {logger} from "firebase-functions/v2";
import {HttpsError} from "firebase-functions/v2/https";
import {ErrorCode, ErrorMessages, createError} from "./errors";

/**
 * Enhanced error interface for standardized responses
 */
export interface StandardizedErrorResponse {
  success: false;
  error: {
    code: string;
    message: string;
    details?: any;
    timestamp: number;
    requestId?: string;
  };
}

/**
 * Success response interface
 */
export interface StandardizedSuccessResponse<T = any> {
  success: true;
  data: T;
  metadata?: {
    timestamp: number;
    requestId?: string;
    version?: string;
  };
}

export type StandardizedResponse<T = any> = StandardizedSuccessResponse<T> | StandardizedErrorResponse;

/**
 * Error context for enhanced logging and debugging
 */
export interface ErrorContext {
  userId?: string;
  action?: string;
  component?: string;
  requestId?: string;
  clientInfo?: {
    userAgent?: string;
    ip?: string;
    platform?: string;
  };
  metadata?: Record<string, any>;
}

/**
 * Standardized Error Handler Class for Firebase Functions
 */
export class StandardizedErrorHandler {
  private static instance: StandardizedErrorHandler;
  
  private constructor() {}

  static getInstance(): StandardizedErrorHandler {
    if (!StandardizedErrorHandler.instance) {
      StandardizedErrorHandler.instance = new StandardizedErrorHandler();
    }
    return StandardizedErrorHandler.instance;
  }

  /**
   * Handle and format errors consistently
   */
  handleError(
    error: any,
    context?: ErrorContext,
    customMessage?: string
  ): never {
    const requestId = context?.requestId || this.generateRequestId();
    const timestamp = Date.now();

    // Parse the error
    let errorCode: ErrorCode;
    let errorMessage: string;
    let errorDetails: any;

    if (error instanceof HttpsError) {
      // Already an HttpsError - extract info
      errorCode = this.mapHttpsErrorCodeToStandard(error.code);
      errorMessage = customMessage || error.message;
      errorDetails = error.details;
    } else if (this.isStandardErrorCode(error)) {
      // Standard error code passed
      errorCode = error;
      errorMessage = customMessage || ErrorMessages[error];
      errorDetails = undefined;
    } else if (error instanceof Error) {
      // Generic Error object
      errorCode = ErrorCode.INTERNAL;
      errorMessage = customMessage || error.message;
      errorDetails = {
        originalMessage: error.message,
        stack: error.stack,
      };
    } else {
      // Unknown error type
      errorCode = ErrorCode.UNKNOWN;
      errorMessage = customMessage || "An unknown error occurred";
      errorDetails = { originalError: String(error) };
    }

    // Enhanced logging with context
    this.logError(errorCode, errorMessage, context, errorDetails, requestId);

    // Create and throw standardized HttpsError
    const httpsError = createError(errorCode, errorMessage, {
      ...errorDetails,
      timestamp,
      requestId,
      context: context ? this.sanitizeContext(context) : undefined,
    });

    throw httpsError;
  }

  /**
   * Create standardized success response
   */
  createSuccessResponse<T>(
    data: T,
    metadata?: {
      requestId?: string;
      version?: string;
      [key: string]: any;
    }
  ): StandardizedSuccessResponse<T> {
    return {
      success: true,
      data,
      metadata: {
        timestamp: Date.now(),
        ...metadata,
      },
    };
  }

  /**
   * Create standardized error response (for non-throwing contexts)
   */
  createErrorResponse(
    error: any,
    context?: ErrorContext,
    customMessage?: string
  ): StandardizedErrorResponse {
    const requestId = context?.requestId || this.generateRequestId();
    const timestamp = Date.now();

    let errorCode: string;
    let errorMessage: string;
    let errorDetails: any;

    if (error instanceof HttpsError) {
      errorCode = error.code;
      errorMessage = customMessage || error.message;
      errorDetails = error.details;
    } else if (this.isStandardErrorCode(error)) {
      errorCode = error;
      errorMessage = customMessage || ErrorMessages[error];
      errorDetails = undefined;
    } else if (error instanceof Error) {
      errorCode = ErrorCode.INTERNAL;
      errorMessage = customMessage || error.message;
      errorDetails = {
        originalMessage: error.message,
      };
    } else {
      errorCode = ErrorCode.UNKNOWN;
      errorMessage = customMessage || "An unknown error occurred";
      errorDetails = { originalError: String(error) };
    }

    // Log the error
    this.logError(errorCode as ErrorCode, errorMessage, context, errorDetails, requestId);

    return {
      success: false,
      error: {
        code: errorCode,
        message: errorMessage,
        details: errorDetails,
        timestamp,
        requestId,
      },
    };
  }

  /**
   * Wrap function execution with standardized error handling
   */
  async wrapExecution<T>(
    operation: () => Promise<T>,
    context?: ErrorContext
  ): Promise<StandardizedResponse<T>> {
    try {
      const result = await operation();
      return this.createSuccessResponse(result, {
        requestId: context?.requestId,
      });
    } catch (error) {
      return this.createErrorResponse(error, context);
    }
  }

  /**
   * Enhanced logging with structured data
   */
  private logError(
    errorCode: ErrorCode,
    message: string,
    context?: ErrorContext,
    details?: any,
    requestId?: string
  ): void {
    const logData = {
      errorCode,
      message,
      requestId,
      timestamp: new Date().toISOString(),
      userId: context?.userId,
      action: context?.action,
      component: context?.component,
      clientInfo: context?.clientInfo,
      details: details ? this.sanitizeDetails(details) : undefined,
    };

    // Log at appropriate level based on error severity
    const severity = this.getErrorSeverity(errorCode);
    
    switch (severity) {
      case 'critical':
        logger.error(`CRITICAL ERROR: ${message}`, logData);
        break;
      case 'high':
        logger.error(`HIGH SEVERITY: ${message}`, logData);
        break;
      case 'medium':
        logger.warn(`MEDIUM SEVERITY: ${message}`, logData);
        break;
      case 'low':
        logger.info(`LOW SEVERITY: ${message}`, logData);
        break;
      default:
        logger.warn(`ERROR: ${message}`, logData);
    }
  }

  /**
   * Get error severity for logging
   */
  private getErrorSeverity(errorCode: ErrorCode): 'critical' | 'high' | 'medium' | 'low' {
    const criticalErrors = [
      ErrorCode.INTERNAL,
      ErrorCode.SERVICE_UNAVAILABLE,
    ];

    const highErrors = [
      ErrorCode.RATE_LIMITED,
      ErrorCode.RESOURCE_EXHAUSTED,
      ErrorCode.PERMISSION_DENIED,
    ];

    const lowErrors = [
      ErrorCode.NOT_FOUND,
      ErrorCode.INVALID_ARGUMENT,
      ErrorCode.UNAUTHENTICATED,
    ];

    if (criticalErrors.includes(errorCode)) return 'critical';
    if (highErrors.includes(errorCode)) return 'high';
    if (lowErrors.includes(errorCode)) return 'low';
    return 'medium';
  }

  /**
   * Map HttpsError codes to our standard error codes
   */
  private mapHttpsErrorCodeToStandard(httpsCode: string): ErrorCode {
    const codeMap: Record<string, ErrorCode> = {
      'unauthenticated': ErrorCode.UNAUTHENTICATED,
      'permission-denied': ErrorCode.PERMISSION_DENIED,
      'not-found': ErrorCode.NOT_FOUND,
      'already-exists': ErrorCode.ALREADY_EXISTS,
      'invalid-argument': ErrorCode.INVALID_ARGUMENT,
      'resource-exhausted': ErrorCode.RESOURCE_EXHAUSTED,
      'failed-precondition': ErrorCode.FAILED_PRECONDITION,
      'aborted': ErrorCode.ABORTED,
      'internal': ErrorCode.INTERNAL,
      'unavailable': ErrorCode.SERVICE_UNAVAILABLE,
      'unknown': ErrorCode.UNKNOWN,
    };

    return codeMap[httpsCode] || ErrorCode.UNKNOWN;
  }

  /**
   * Check if value is a standard error code
   */
  private isStandardErrorCode(value: any): value is ErrorCode {
    return Object.values(ErrorCode).includes(value);
  }

  /**
   * Generate unique request ID for tracking
   */
  private generateRequestId(): string {
    return `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Sanitize context for logging (remove sensitive data)
   */
  private sanitizeContext(context: ErrorContext): Partial<ErrorContext> {
    return {
      userId: context.userId ? `user_${context.userId.slice(0, 8)}...` : undefined,
      action: context.action,
      component: context.component,
      clientInfo: {
        platform: context.clientInfo?.platform,
        // Don't log full user agent or IP for privacy
      },
      metadata: context.metadata ? this.sanitizeMetadata(context.metadata) : undefined,
    };
  }

  /**
   * Sanitize metadata for logging
   */
  private sanitizeMetadata(metadata: Record<string, any>): Record<string, any> {
    const sensitiveKeys = ['password', 'token', 'secret', 'key', 'credential'];
    const sanitized: Record<string, any> = {};

    for (const [key, value] of Object.entries(metadata)) {
      if (sensitiveKeys.some(sensitive => key.toLowerCase().includes(sensitive))) {
        sanitized[key] = '[REDACTED]';
      } else {
        sanitized[key] = value;
      }
    }

    return sanitized;
  }

  /**
   * Sanitize error details for logging
   */
  private sanitizeDetails(details: any): any {
    if (typeof details === 'object' && details !== null) {
      if (details.stack) {
        // Truncate stack traces for logs
        details.stack = details.stack.split('\n').slice(0, 5).join('\n');
      }
      return this.sanitizeMetadata(details);
    }
    return details;
  }

  /**
   * Validate and normalize error responses for consistency
   */
  validateErrorResponse(response: any): StandardizedErrorResponse {
    if (response && typeof response === 'object' && response.success === false) {
      return response;
    }

    // If not a proper error response, create one
    return this.createErrorResponse(ErrorCode.UNKNOWN, undefined, "Invalid error response format");
  }
}

// Export singleton instance
export const standardizedErrorHandler = StandardizedErrorHandler.getInstance();

/**
 * Convenience function for handling errors in Firebase Functions
 */
export function handleError(
  error: any,
  context?: ErrorContext,
  customMessage?: string
): never {
  return standardizedErrorHandler.handleError(error, context, customMessage);
}

/**
 * Convenience function for creating success responses
 */
export function createSuccessResponse<T>(
  data: T,
  metadata?: Record<string, any>
): StandardizedSuccessResponse<T> {
  return standardizedErrorHandler.createSuccessResponse(data, metadata);
}

/**
 * Convenience function for wrapping operations with error handling
 */
export async function withErrorHandling<T>(
  operation: () => Promise<T>,
  context?: ErrorContext
): Promise<StandardizedResponse<T>> {
  return standardizedErrorHandler.wrapExecution(operation, context);
}