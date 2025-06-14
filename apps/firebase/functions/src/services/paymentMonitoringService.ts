import {logger} from "firebase-functions/v2";
import {defineSecret} from "firebase-functions/params";
import {getFirestore, Timestamp, FieldValue} from "firebase-admin/firestore";
import {alertingService} from "./alertingService";
import {PaymentError, PaymentErrorSeverity} from "../utils/paymentErrors";

// Define secrets for external monitoring services
const sentryDsn = defineSecret("SENTRY_DSN");
const datadogApiKey = defineSecret("DATADOG_API_KEY");
const datadogAppKey = defineSecret("DATADOG_APP_KEY");

/**
 * Payment monitoring service that integrates with multiple monitoring platforms
 * including internal alerting service, Sentry, and DataDog
 */
export class PaymentMonitoringService {
  private static instance: PaymentMonitoringService;
  private db = getFirestore();
  private sentryClient: any = null;
  private datadogClient: any = null;
  private initialized = false;

  private constructor() {}

  static getInstance(): PaymentMonitoringService {
    if (!PaymentMonitoringService.instance) {
      PaymentMonitoringService.instance = new PaymentMonitoringService();
    }
    return PaymentMonitoringService.instance;
  }

  /**
   * Initialize monitoring service with external integrations
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    try {
      // Initialize Sentry if DSN is available
      if (process.env.SENTRY_DSN || sentryDsn.value()) {
        const Sentry = await import("@sentry/node");
        Sentry.init({
          dsn: process.env.SENTRY_DSN || sentryDsn.value(),
          environment: process.env.ENVIRONMENT || "production",
          tracesSampleRate: 0.1,
          beforeSend(event) {
            // Filter sensitive payment data
            if (event.extra) {
              delete event.extra.cardNumber;
              delete event.extra.cvv;
              delete event.extra.stripeSecretKey;
            }
            return event;
          },
        });
        this.sentryClient = Sentry;
        logger.info("Sentry initialized for payment monitoring");
      }

      // Initialize DataDog if API keys are available
      if ((process.env.DATADOG_API_KEY || datadogApiKey.value()) && 
          (process.env.DATADOG_APP_KEY || datadogAppKey.value())) {
        // Note: For production, you'd use the official DataDog client
        // This is a placeholder for the integration
        this.datadogClient = {
          apiKey: process.env.DATADOG_API_KEY || datadogApiKey.value(),
          appKey: process.env.DATADOG_APP_KEY || datadogAppKey.value(),
        };
        logger.info("DataDog initialized for payment monitoring");
      }

      this.initialized = true;
    } catch (error) {
      logger.error("Failed to initialize payment monitoring service", {error});
      // Continue without external monitoring
    }
  }

  /**
   * Report payment error to all monitoring services
   */
  async reportPaymentError(error: PaymentError): Promise<void> {
    await this.initialize();

    const errorData = {
      id: error.id,
      code: error.code,
      message: error.message,
      severity: error.severity,
      type: error.type,
      stripeErrorCode: error.stripeErrorCode,
      userId: error.userId,
      customerId: error.customerId,
      amount: error.amount,
      currency: error.currency,
      timestamp: error.timestamp,
      metadata: error.metadata,
    };

    // 1. Log to Firestore for internal tracking
    await this.logToFirestore(errorData);

    // 2. Send to internal alerting service
    await this.sendToAlertingService(error);

    // 3. Send to Sentry
    if (this.sentryClient) {
      await this.sendToSentry(error);
    }

    // 4. Send to DataDog
    if (this.datadogClient) {
      await this.sendToDataDog(error);
    }

    // 5. Log critical errors to console for immediate visibility
    if (error.severity === PaymentErrorSeverity.CRITICAL) {
      logger.error("CRITICAL PAYMENT ERROR", errorData);
    }
  }

  /**
   * Log error to Firestore for persistence and analysis
   */
  private async logToFirestore(errorData: any): Promise<void> {
    try {
      await this.db.collection("payment_errors").add({
        ...errorData,
        createdAt: FieldValue.serverTimestamp(),
        processed: false,
      });
    } catch (error) {
      logger.error("Failed to log payment error to Firestore", {error});
    }
  }

  /**
   * Send error to internal alerting service
   */
  private async sendToAlertingService(error: PaymentError): Promise<void> {
    try {
      // Map payment error severity to alert severity
      const alertSeverity = this.mapPaymentSeverityToAlertSeverity(error.severity);

      // Create alert through alerting service
      await alertingService.createAlert({
        ruleId: `payment-error-${error.type}`,
        ruleName: `Payment Error: ${error.type}`,
        category: "technical",
        severity: alertSeverity,
        title: `Payment Error: ${error.code}`,
        message: error.message,
        details: {
          errorId: error.id,
          stripeErrorCode: error.stripeErrorCode,
          userId: error.userId,
          customerId: error.customerId,
          amount: error.amount,
          currency: error.currency,
        },
        source: "payment-monitoring",
      });
    } catch (error) {
      logger.error("Failed to send payment error to alerting service", {error});
    }
  }

  /**
   * Send error to Sentry for external monitoring
   */
  private async sendToSentry(error: PaymentError): Promise<void> {
    try {
      this.sentryClient.captureException(new Error(error.message), {
        level: this.mapPaymentSeverityToSentryLevel(error.severity),
        tags: {
          type: "payment_error",
          error_code: error.code,
          stripe_error_code: error.stripeErrorCode || "none",
          payment_type: error.type,
        },
        extra: {
          errorId: error.id,
          userId: error.userId,
          customerId: error.customerId,
          amount: error.amount,
          currency: error.currency,
          metadata: error.metadata,
        },
        user: {
          id: error.userId,
        },
      });
    } catch (err) {
      logger.error("Failed to send payment error to Sentry", {err});
    }
  }

  /**
   * Send error to DataDog for metrics and monitoring
   */
  private async sendToDataDog(error: PaymentError): Promise<void> {
    try {
      // In production, use the official DataDog client
      // This is a placeholder showing what metrics to track
      const metrics = {
        "payment.error.count": 1,
        "payment.error.amount": error.amount || 0,
      };

      const tags = [
        `error_type:${error.type}`,
        `error_code:${error.code}`,
        `severity:${error.severity}`,
        `stripe_error:${error.stripeErrorCode || "none"}`,
        `environment:${process.env.ENVIRONMENT || "production"}`,
      ];

      // Log the metrics (in production, send to DataDog API)
      logger.info("DataDog metrics", {metrics, tags});

      // Create DataDog event for critical errors
      if (error.severity === PaymentErrorSeverity.CRITICAL) {
        const event = {
          title: `Critical Payment Error: ${error.code}`,
          text: error.message,
          alert_type: "error",
          priority: "high",
          tags,
        };
        logger.info("DataDog event", event);
      }
    } catch (err) {
      logger.error("Failed to send payment error to DataDog", {err});
    }
  }

  /**
   * Map payment severity to alert severity
   */
  private mapPaymentSeverityToAlertSeverity(
    severity: PaymentErrorSeverity
  ): "low" | "medium" | "high" | "critical" {
    switch (severity) {
    case PaymentErrorSeverity.LOW:
      return "low";
    case PaymentErrorSeverity.MEDIUM:
      return "medium";
    case PaymentErrorSeverity.HIGH:
      return "high";
    case PaymentErrorSeverity.CRITICAL:
      return "critical";
    default:
      return "medium";
    }
  }

  /**
   * Map payment severity to Sentry level
   */
  private mapPaymentSeverityToSentryLevel(
    severity: PaymentErrorSeverity
  ): "debug" | "info" | "warning" | "error" | "fatal" {
    switch (severity) {
    case PaymentErrorSeverity.LOW:
      return "info";
    case PaymentErrorSeverity.MEDIUM:
      return "warning";
    case PaymentErrorSeverity.HIGH:
      return "error";
    case PaymentErrorSeverity.CRITICAL:
      return "fatal";
    default:
      return "error";
    }
  }

  /**
   * Get payment error statistics
   */
  async getErrorStatistics(
    startDate: Date,
    endDate: Date
  ): Promise<{
    totalErrors: number;
    errorsByType: Record<string, number>;
    errorsBySeverity: Record<string, number>;
    errorsByDay: Record<string, number>;
  }> {
    const errors = await this.db
      .collection("payment_errors")
      .where("timestamp", ">=", Timestamp.fromDate(startDate))
      .where("timestamp", "<=", Timestamp.fromDate(endDate))
      .get();

    const stats = {
      totalErrors: errors.size,
      errorsByType: {} as Record<string, number>,
      errorsBySeverity: {} as Record<string, number>,
      errorsByDay: {} as Record<string, number>,
    };

    errors.forEach((doc) => {
      const data = doc.data();
      
      // Count by type
      stats.errorsByType[data.type] = (stats.errorsByType[data.type] || 0) + 1;
      
      // Count by severity
      stats.errorsBySeverity[data.severity] = (stats.errorsBySeverity[data.severity] || 0) + 1;
      
      // Count by day
      const day = data.timestamp.toDate().toISOString().split("T")[0];
      stats.errorsByDay[day] = (stats.errorsByDay[day] || 0) + 1;
    });

    return stats;
  }
}

// Export singleton instance
export const paymentMonitoringService = PaymentMonitoringService.getInstance();