import {getFirestore, Timestamp} from "firebase-admin/firestore";
import {logger} from "firebase-functions/v2";
import {PaymentErrorContext} from "../utils/paymentErrors";

export interface PaymentLog {
  id?: string;
  timestamp: Timestamp;
  userId: string;
  subscriptionId?: string;
  stripeCustomerId?: string;
  paymentMethodId?: string;
  stripePaymentIntentId?: string;
  stripeChargeId?: string;
  eventType: PaymentEventType;
  status: PaymentStatus;
  amount?: number;
  currency?: string;
  planType?: string;
  errorDetails?: {
    code: string;
    message: string;
    type?: string;
    declineCode?: string;
    stripeRequestId?: string;
  };
  metadata?: Record<string, any>;
  attemptNumber?: number;
  processingDurationMs?: number;
  ipAddress?: string;
  userAgent?: string;
}

export enum PaymentEventType {
  // Checkout events
  CHECKOUT_SESSION_CREATED = "checkout_session_created",
  CHECKOUT_SESSION_COMPLETED = "checkout_session_completed",
  CHECKOUT_SESSION_EXPIRED = "checkout_session_expired",

  // Payment events
  PAYMENT_INTENT_CREATED = "payment_intent_created",
  PAYMENT_INTENT_SUCCEEDED = "payment_intent_succeeded",
  PAYMENT_INTENT_FAILED = "payment_intent_failed",
  PAYMENT_METHOD_ATTACHED = "payment_method_attached",
  PAYMENT_METHOD_DETACHED = "payment_method_detached",
  PAYMENT_METHOD_UPDATED = "payment_method_updated",
  PAYMENT_SUCCEEDED = "payment_succeeded",
  PAYMENT_FAILED = "payment_failed",
  PAYMENT_ACTION_REQUIRED = "payment_action_required",
  ONE_TIME_PAYMENT_SUCCEEDED = "one_time_payment_succeeded",
  ONE_TIME_PAYMENT_FAILED = "one_time_payment_failed",

  // Invoice events
  INVOICE_UPCOMING = "invoice_upcoming",
  INVOICE_FINALIZED = "invoice_finalized",
  INVOICE_PAID = "invoice_paid",
  INVOICE_PAYMENT_FAILED = "invoice_payment_failed",

  // Subscription events
  SUBSCRIPTION_CREATED = "subscription_created",
  SUBSCRIPTION_UPDATED = "subscription_updated",
  SUBSCRIPTION_CANCELED = "subscription_canceled",
  SUBSCRIPTION_REACTIVATED = "subscription_reactivated",
  SUBSCRIPTION_REACTIVATION_FAILED = "subscription_reactivation_failed",
  SUBSCRIPTION_SUSPENDED = "subscription_suspended",

  // Retry events
  PAYMENT_RETRY_SCHEDULED = "payment_retry_scheduled",
  PAYMENT_RETRY_ATTEMPTED = "payment_retry_attempted",
  PAYMENT_RETRY_SUCCEEDED = "payment_retry_succeeded",
  PAYMENT_RETRY_FAILED = "payment_retry_failed",

  // Recovery events
  GRACE_PERIOD_STARTED = "grace_period_started",
  GRACE_PERIOD_ENDED = "grace_period_ended",
  DUNNING_EMAIL_SENT = "dunning_email_sent",

  // Webhook events
  WEBHOOK_RECEIVED = "webhook_received",
  WEBHOOK_PROCESSED = "webhook_processed",
  WEBHOOK_FAILED = "webhook_failed",
  WEBHOOK_ERROR = "webhook_error",
}

export enum PaymentStatus {
  SUCCESS = "success",
  FAILED = "failed",
  PENDING = "pending",
  PROCESSING = "processing",
  CANCELED = "canceled",
}

export interface PaymentMetrics {
  periodStart: Date;
  periodEnd: Date;
  totalAttempts: number;
  successfulPayments: number;
  failedPayments: number;
  successRate: number;
  totalRevenue: number;
  averageTransactionValue: number;
  errorBreakdown: Record<string, number>;
  retrySuccessRate: number;
  averageRetryCount: number;
}

export interface PaymentErrorPattern {
  errorCode: string;
  count: number;
  lastOccurred: Date;
  affectedUsers: string[];
  commonMetadata?: Record<string, any>;
}

export class PaymentLoggingService {
  private db = getFirestore();
  private readonly LOGS_COLLECTION = "paymentLogs";
  private readonly METRICS_COLLECTION = "paymentMetrics";
  private readonly ERROR_PATTERNS_COLLECTION = "paymentErrorPatterns";

  /**
   * Log a payment event
   */
  async logPaymentEvent(
    eventType: PaymentEventType,
    context: PaymentErrorContext,
    status: PaymentStatus,
    metadata?: Record<string, any>
  ): Promise<void> {
    try {
      const logEntry: PaymentLog = {
        timestamp: Timestamp.now(),
        userId: context.userId,
        subscriptionId: context.subscriptionId,
        stripeCustomerId: context.stripeCustomerId,
        paymentMethodId: context.paymentMethodId,
        eventType,
        status,
        amount: context.amount,
        currency: context.currency,
        planType: context.planType,
        attemptNumber: context.attemptNumber,
        metadata: {
          ...metadata,
          environment: process.env.NODE_ENV || "development",
          functionVersion: process.env.FUNCTION_VERSION || "unknown",
        },
      };

      // Add error details if present
      if (context.errorCode || context.errorMessage) {
        logEntry.errorDetails = {
          code: context.errorCode || "unknown",
          message: context.errorMessage || "Unknown error",
          type: context.stripeErrorType,
        };
      }

      // Store in Firestore
      const docRef = await this.db.collection(this.LOGS_COLLECTION).add(logEntry);

      // Also log to Cloud Logging for real-time monitoring
      logger.log({
        severity: this.getLogSeverity(eventType, status),
        message: `Payment event: ${eventType}`,
        labels: {
          type: "payment_log",
          eventType,
          status,
          userId: context.userId,
        },
        data: {
          logId: docRef.id,
          ...logEntry,
        },
      });

      // Update error patterns if this is an error
      if (status === PaymentStatus.FAILED && logEntry.errorDetails) {
        await this.updateErrorPattern(logEntry.errorDetails.code, context.userId);
      }

      // Update real-time metrics
      await this.updateMetrics(eventType, status, context.amount);
    } catch (error) {
      logger.error("Failed to log payment event", {eventType, context, error});
      // Don't throw - logging failure shouldn't break payment processing
    }
  }

  /**
   * Log webhook event
   */
  async logWebhookEvent(
    eventId: string,
    eventType: string,
    status: "received" | "processed" | "failed",
    processingDurationMs: number,
    error?: any
  ): Promise<void> {
    try {
      const webhookLog = {
        timestamp: Timestamp.now(),
        stripeEventId: eventId,
        stripeEventType: eventType,
        status,
        processingDurationMs,
        error: error ? {
          message: error.message,
          code: error.code,
          stack: error.stack,
        } : undefined,
      };

      await this.db.collection("webhookLogs").add(webhookLog);

      logger.info("Webhook event logged", {
        eventId,
        eventType,
        status,
        duration: processingDurationMs,
      });
    } catch (error) {
      logger.error("Failed to log webhook event", {eventId, eventType, error});
    }
  }

  /**
   * Get payment metrics for a time period
   */
  async getPaymentMetrics(
    startDate: Date,
    endDate: Date,
    userId?: string
  ): Promise<PaymentMetrics> {
    try {
      let query = this.db.collection(this.LOGS_COLLECTION)
        .where("timestamp", ">=", Timestamp.fromDate(startDate))
        .where("timestamp", "<=", Timestamp.fromDate(endDate));

      if (userId) {
        query = query.where("userId", "==", userId);
      }

      const logs = await query.get();

      const metrics: PaymentMetrics = {
        periodStart: startDate,
        periodEnd: endDate,
        totalAttempts: 0,
        successfulPayments: 0,
        failedPayments: 0,
        successRate: 0,
        totalRevenue: 0,
        averageTransactionValue: 0,
        errorBreakdown: {},
        retrySuccessRate: 0,
        averageRetryCount: 0,
      };

      let retryAttempts = 0;
      let successfulRetries = 0;
      const retryCountByUser: Record<string, number> = {};

      logs.forEach((doc) => {
        const log = doc.data() as PaymentLog;

        // Count payment attempts
        if (log.eventType === PaymentEventType.PAYMENT_INTENT_CREATED ||
            log.eventType === PaymentEventType.PAYMENT_RETRY_ATTEMPTED) {
          metrics.totalAttempts++;
        }

        // Count successes and failures
        if (log.status === PaymentStatus.SUCCESS) {
          metrics.successfulPayments++;
          if (log.amount) {
            metrics.totalRevenue += log.amount;
          }
        } else if (log.status === PaymentStatus.FAILED) {
          metrics.failedPayments++;

          // Track error breakdown
          if (log.errorDetails?.code) {
            metrics.errorBreakdown[log.errorDetails.code] =
              (metrics.errorBreakdown[log.errorDetails.code] || 0) + 1;
          }
        }

        // Track retries
        if (log.eventType === PaymentEventType.PAYMENT_RETRY_ATTEMPTED) {
          retryAttempts++;
          retryCountByUser[log.userId] = (retryCountByUser[log.userId] || 0) + 1;
        }
        if (log.eventType === PaymentEventType.PAYMENT_RETRY_SUCCEEDED) {
          successfulRetries++;
        }
      });

      // Calculate derived metrics
      if (metrics.totalAttempts > 0) {
        metrics.successRate = (metrics.successfulPayments / metrics.totalAttempts) * 100;
      }
      if (metrics.successfulPayments > 0) {
        metrics.averageTransactionValue = metrics.totalRevenue / metrics.successfulPayments;
      }
      if (retryAttempts > 0) {
        metrics.retrySuccessRate = (successfulRetries / retryAttempts) * 100;
      }
      if (Object.keys(retryCountByUser).length > 0) {
        const totalRetries = Object.values(retryCountByUser).reduce((sum, count) => sum + count, 0);
        metrics.averageRetryCount = totalRetries / Object.keys(retryCountByUser).length;
      }

      return metrics;
    } catch (error) {
      logger.error("Failed to calculate payment metrics", {startDate, endDate, error});
      throw error;
    }
  }

  /**
   * Get error patterns
   */
  async getErrorPatterns(
    limit: number = 10
  ): Promise<PaymentErrorPattern[]> {
    try {
      const patterns = await this.db.collection(this.ERROR_PATTERNS_COLLECTION)
        .orderBy("count", "desc")
        .limit(limit)
        .get();

      return patterns.docs.map((doc) => ({
        ...doc.data(),
        errorCode: doc.id,
      } as PaymentErrorPattern));
    } catch (error) {
      logger.error("Failed to get error patterns", {error});
      throw error;
    }
  }

  /**
   * Create monitoring dashboard data
   */
  async getMonitoringDashboard(): Promise<{
    realtimeMetrics: {
      last24Hours: PaymentMetrics;
      last7Days: PaymentMetrics;
      last30Days: PaymentMetrics;
    };
    topErrors: PaymentErrorPattern[];
    alertThresholds: {
      failureRate: number;
      currentFailureRate: number;
      isAlerting: boolean;
    };
  }> {
    const now = new Date();
    const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    const [last24Hours, last7Days, last30Days, topErrors] = await Promise.all([
      this.getPaymentMetrics(oneDayAgo, now),
      this.getPaymentMetrics(sevenDaysAgo, now),
      this.getPaymentMetrics(thirtyDaysAgo, now),
      this.getErrorPatterns(5),
    ]);

    // Check alert thresholds
    const failureRateThreshold = 10; // Alert if failure rate > 10%
    const currentFailureRate = 100 - last24Hours.successRate;
    const isAlerting = currentFailureRate > failureRateThreshold;

    if (isAlerting) {
      logger.error("Payment failure rate alert triggered", {
        currentFailureRate,
        threshold: failureRateThreshold,
        last24Hours,
      });
      // TODO: Send alert to monitoring system
    }

    return {
      realtimeMetrics: {
        last24Hours,
        last7Days,
        last30Days,
      },
      topErrors,
      alertThresholds: {
        failureRate: failureRateThreshold,
        currentFailureRate,
        isAlerting,
      },
    };
  }

  /**
   * Get debugging information for a specific payment
   */
  async getPaymentDebugInfo(
    userId: string,
    startTime: Date,
    endTime?: Date
  ): Promise<PaymentLog[]> {
    try {
      let query = this.db.collection(this.LOGS_COLLECTION)
        .where("userId", "==", userId)
        .where("timestamp", ">=", Timestamp.fromDate(startTime));

      if (endTime) {
        query = query.where("timestamp", "<=", Timestamp.fromDate(endTime));
      }

      const logs = await query.orderBy("timestamp", "desc").get();

      return logs.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      } as PaymentLog));
    } catch (error) {
      logger.error("Failed to get payment debug info", {userId, error});
      throw error;
    }
  }

  /**
   * Update error pattern tracking
   */
  private async updateErrorPattern(errorCode: string, userId: string): Promise<void> {
    try {
      const patternRef = this.db.collection(this.ERROR_PATTERNS_COLLECTION).doc(errorCode);

      await this.db.runTransaction(async (transaction) => {
        const doc = await transaction.get(patternRef);

        if (doc.exists) {
          const data = doc.data() as PaymentErrorPattern;
          const affectedUsers = new Set(data.affectedUsers);
          affectedUsers.add(userId);

          transaction.update(patternRef, {
            count: data.count + 1,
            lastOccurred: new Date(),
            affectedUsers: Array.from(affectedUsers).slice(-100), // Keep last 100 users
          });
        } else {
          transaction.set(patternRef, {
            count: 1,
            lastOccurred: new Date(),
            affectedUsers: [userId],
          });
        }
      });
    } catch (error) {
      logger.error("Failed to update error pattern", {errorCode, error});
    }
  }

  /**
   * Update real-time metrics
   */
  private async updateMetrics(
    eventType: PaymentEventType,
    status: PaymentStatus,
    amount?: number
  ): Promise<void> {
    try {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const metricId = `daily_${today.toISOString().split("T")[0]}`;

      const metricRef = this.db.collection(this.METRICS_COLLECTION).doc(metricId);

      await this.db.runTransaction(async (transaction) => {
        const doc = await transaction.get(metricRef);

        const updates: any = {
          lastUpdated: Timestamp.now(),
        };

        if (status === PaymentStatus.SUCCESS && amount) {
          updates.totalRevenue = (doc.data()?.totalRevenue || 0) + amount;
          updates.successCount = (doc.data()?.successCount || 0) + 1;
        } else if (status === PaymentStatus.FAILED) {
          updates.failureCount = (doc.data()?.failureCount || 0) + 1;
        }

        if (doc.exists) {
          transaction.update(metricRef, updates);
        } else {
          transaction.set(metricRef, {
            date: Timestamp.fromDate(today),
            ...updates,
            totalRevenue: updates.totalRevenue || 0,
            successCount: updates.successCount || 0,
            failureCount: updates.failureCount || 0,
          });
        }
      });
    } catch (error) {
      logger.error("Failed to update metrics", {eventType, status, error});
    }
  }

  /**
   * Get log severity based on event type and status
   */
  private getLogSeverity(eventType: PaymentEventType, status: PaymentStatus): string {
    if (status === PaymentStatus.FAILED) {
      if (eventType === PaymentEventType.SUBSCRIPTION_SUSPENDED) {
        return "CRITICAL";
      }
      return "ERROR";
    }

    if (status === PaymentStatus.SUCCESS) {
      return "INFO";
    }

    return "WARNING";
  }

  /**
   * Clean up old logs (for GDPR compliance)
   */
  async cleanupOldLogs(retentionDays: number = 90): Promise<number> {
    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - retentionDays);

      const oldLogs = await this.db.collection(this.LOGS_COLLECTION)
        .where("timestamp", "<", Timestamp.fromDate(cutoffDate))
        .get();

      const batch = this.db.batch();
      let count = 0;

      oldLogs.forEach((doc) => {
        batch.delete(doc.ref);
        count++;
      });

      if (count > 0) {
        await batch.commit();
        logger.info(`Cleaned up ${count} old payment logs`);
      }

      return count;
    } catch (error) {
      logger.error("Failed to cleanup old logs", {error});
      throw error;
    }
  }
}
