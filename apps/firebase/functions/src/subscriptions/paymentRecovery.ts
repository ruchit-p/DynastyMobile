import {onCall} from "firebase-functions/v2/https";
import {onSchedule} from "firebase-functions/v2/scheduler";
import {getFirestore, Timestamp} from "firebase-admin/firestore";
import {logger} from "firebase-functions/v2";
import {PaymentRecoveryService} from "../services/paymentRecoveryService";
import {PaymentLoggingService, PaymentEventType, PaymentStatus} from "../services/paymentLoggingService";
import {withAuth, RateLimitType} from "../middleware";
import {validateRequest} from "../utils/request-validator";
import {createError, ErrorCode} from "../utils/errors";

const paymentRecoveryService = new PaymentRecoveryService();
const paymentLoggingService = new PaymentLoggingService();
const db = getFirestore();

/**
 * Reactivate a suspended subscription
 */
export const reactivateSubscription = onCall(
  {
    region: "us-central1",
    memory: "512MiB",
  },
  withAuth(async (request) => {
    const userId = request.auth!.uid;
    const data = request.data;

    // Validate request
    validateRequest(data, {
      rules: [
        {field: "subscriptionId", type: "id", required: true},
        {field: "paymentMethodId", type: "string", required: true,
          custom: (value) => {
            if (!/^pm_[a-zA-Z0-9_]+$/.test(value)) {
              throw new Error("Invalid payment method ID format");
            }
          }},
      ],
      xssCheck: false,
    });

    try {
      // Log the reactivation attempt
      await paymentLoggingService.logPaymentEvent(
        PaymentEventType.SUBSCRIPTION_REACTIVATED,
        {
          userId,
          subscriptionId: data.subscriptionId,
          paymentMethodId: data.paymentMethodId,
        },
        PaymentStatus.PENDING
      );

      // Reactivate subscription
      const subscription = await paymentRecoveryService.reactivateSubscription(
        data.subscriptionId,
        data.paymentMethodId
      );

      // Log success
      await paymentLoggingService.logPaymentEvent(
        PaymentEventType.SUBSCRIPTION_REACTIVATED,
        {
          userId,
          subscriptionId: subscription.id,
        },
        PaymentStatus.SUCCESS
      );

      return {
        success: true,
        subscription,
      };
    } catch (error) {
      // Log failure
      await paymentLoggingService.logPaymentEvent(
        PaymentEventType.SUBSCRIPTION_REACTIVATION_FAILED,
        {
          userId,
          subscriptionId: data.subscriptionId,
          errorMessage: error instanceof Error ? error.message : String(error),
        },
        PaymentStatus.FAILED
      );

      logger.error("Failed to reactivate subscription", {
        userId,
        subscriptionId: data.subscriptionId,
        error,
      });
      throw error;
    }
  }, "reactivateSubscription", "verified", {
    type: RateLimitType.SUBSCRIPTION_MODIFY,
    maxRequests: 5,
    windowSeconds: 3600
  })
);

/**
 * Get payment failure details for a subscription
 */
export const getPaymentFailureDetails = onCall(
  {
    region: "us-central1",
    memory: "256MiB",
  },
  withAuth(async (request) => {
    const userId = request.auth!.uid;
    const {subscriptionId} = request.data;

    try {
      // Verify user owns the subscription
      const subscription = await db.collection("subscriptions").doc(subscriptionId).get();
      if (!subscription.exists || subscription.data()?.userId !== userId) {
        throw createError(ErrorCode.PERMISSION_DENIED, "Access denied");
      }

      // Get payment failure records
      const failureRecords = await db
        .collection("paymentFailures")
        .where("subscriptionId", "==", subscriptionId)
        .where("resolved", "==", false)
        .orderBy("createdAt", "desc")
        .limit(5)
        .get();

      const failures = failureRecords.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
        createdAt: doc.data().createdAt.toDate(),
        lastAttemptAt: doc.data().lastAttemptAt.toDate(),
      }));

      // Get retry schedule
      const retrySchedule = await db
        .collection("paymentRetrySchedule")
        .where("subscriptionId", "==", subscriptionId)
        .where("processed", "==", false)
        .orderBy("nextRetryAt", "asc")
        .limit(1)
        .get();

      const nextRetry = retrySchedule.empty ? null : {
        ...retrySchedule.docs[0].data(),
        nextRetryAt: retrySchedule.docs[0].data().nextRetryAt.toDate(),
      };

      return {
        failures,
        nextRetry,
        gracePeriod: subscription.data()?.gracePeriod,
      };
    } catch (error) {
      logger.error("Failed to get payment failure details", {
        userId,
        subscriptionId,
        error,
      });
      throw error;
    }
  }, "getPaymentFailureDetails", "verified", {
    type: RateLimitType.API,
    maxRequests: 20,
    windowSeconds: 60
  })
);

/**
 * Get payment metrics dashboard
 */
export const getPaymentMetrics = onCall(
  {
    region: "us-central1",
    memory: "512MiB",
  },
  withAuth(async (request) => {
    const {startDate, endDate, userId} = request.data;

    try {
      const start = startDate ? new Date(startDate) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      const end = endDate ? new Date(endDate) : new Date();

      const metrics = await paymentLoggingService.getPaymentMetrics(start, end, userId);

      return {
        success: true,
        metrics,
      };
    } catch (error) {
      logger.error("Failed to get payment metrics", {error});
      throw error;
    }
  }, "getPaymentMetrics", "onboarded", {
    type: RateLimitType.API,
    maxRequests: 10,
    windowSeconds: 60
  })
);

/**
 * Get payment monitoring dashboard
 */
export const getPaymentMonitoringDashboard = onCall(
  {
    region: "us-central1",
    memory: "512MiB",
  },
  withAuth(async (_request) => {
    try {
      const dashboard = await paymentLoggingService.getMonitoringDashboard();

      return {
        success: true,
        dashboard,
      };
    } catch (error) {
      logger.error("Failed to get payment monitoring dashboard", {error});
      throw error;
    }
  }, "getPaymentMonitoringDashboard", "onboarded", {
    type: RateLimitType.API,
    maxRequests: 10,
    windowSeconds: 60
  })
);

/**
 * Debug payment issues for a user
 */
export const debugPaymentIssues = onCall(
  {
    region: "us-central1",
    memory: "512MiB",
  },
  withAuth(async (request) => {
    const {userId, startTime, endTime} = request.data;

    if (!userId) {
      throw createError(ErrorCode.INVALID_ARGUMENT, "userId is required");
    }

    try {
      const start = new Date(startTime || Date.now() - 7 * 24 * 60 * 60 * 1000);
      const end = endTime ? new Date(endTime) : new Date();

      const debugInfo = await paymentLoggingService.getPaymentDebugInfo(userId, start, end);

      return {
        success: true,
        logs: debugInfo,
        count: debugInfo.length,
      };
    } catch (error) {
      logger.error("Failed to debug payment issues", {userId, error});
      throw error;
    }
  }, "debugPaymentIssues", "onboarded", {
    type: RateLimitType.API,
    maxRequests: 5,
    windowSeconds: 300
  })
);

/**
 * Scheduled function to process payment retries
 */
export const processScheduledPaymentRetries = onSchedule(
  {
    schedule: "every 30 minutes",
    region: "us-central1",
    memory: "512MiB",
    timeoutSeconds: 540, // 9 minutes
  },
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async (_event: any) => {
    logger.info("Processing scheduled payment retries");

    try {
      // Get pending retry schedules
      const now = new Date();
      const pendingRetries = await db
        .collection("paymentRetrySchedule")
        .where("processed", "==", false)
        .where("nextRetryAt", "<=", Timestamp.fromDate(now))
        .limit(50) // Process up to 50 retries per run
        .get();

      logger.info(`Found ${pendingRetries.size} pending payment retries`);

      const results = {
        processed: 0,
        succeeded: 0,
        failed: 0,
      };

      // Process each retry
      for (const doc of pendingRetries.docs) {
        const retryData = doc.data();

        try {
          // Mark as processed to prevent duplicate processing
          await doc.ref.update({
            processed: true,
            processedAt: Timestamp.now(),
          });

          // Process the retry
          await paymentRecoveryService.processPaymentRetry({
            subscriptionId: retryData.subscriptionId,
            userId: retryData.userId,
            nextRetryAt: retryData.nextRetryAt.toDate(),
            attemptNumber: retryData.attemptNumber,
            maxAttempts: retryData.maxAttempts,
            lastError: retryData.lastError,
          });

          results.succeeded++;
        } catch (error) {
          results.failed++;
          logger.error("Failed to process payment retry", {
            retryId: doc.id,
            subscriptionId: retryData.subscriptionId,
            error,
          });
        }

        results.processed++;
      }

      logger.info("Payment retry processing completed", results);
    } catch (error) {
      logger.error("Failed to process payment retries", {error});
      throw error;
    }
  }
);

/**
 * Scheduled function to check grace period expirations
 */
export const checkGracePeriodExpirations = onSchedule(
  {
    schedule: "every 6 hours",
    region: "us-central1",
    memory: "512MiB",
  },
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async (_event: any) => {
    logger.info("Checking grace period expirations");

    try {
      const now = Timestamp.now();

      // Find subscriptions with expired grace periods
      const expiredGracePeriods = await db
        .collection("subscriptions")
        .where("gracePeriod.status", "==", "active")
        .where("gracePeriod.endsAt", "<=", now)
        .limit(20)
        .get();

      logger.info(`Found ${expiredGracePeriods.size} expired grace periods`);

      for (const doc of expiredGracePeriods.docs) {
        const subscription = doc.data();

        try {
          // Suspend the subscription
          await paymentRecoveryService.suspendSubscription({
            id: doc.id,
            ...subscription,
          } as any);

          logger.info("Suspended subscription due to grace period expiration", {
            subscriptionId: doc.id,
            userId: subscription.userId,
          });
        } catch (error) {
          logger.error("Failed to suspend subscription", {
            subscriptionId: doc.id,
            error,
          });
        }
      }
    } catch (error) {
      logger.error("Failed to check grace period expirations", {error});
      throw error;
    }
  }
);

/**
 * Scheduled function to cleanup old payment logs
 */
export const cleanupOldPaymentLogs = onSchedule(
  {
    schedule: "every 24 hours",
    region: "us-central1",
    memory: "256MiB",
  },
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async (_event: any) => {
    logger.info("Cleaning up old payment logs");

    try {
      const retentionDays = 90; // Keep logs for 90 days
      const count = await paymentLoggingService.cleanupOldLogs(retentionDays);

      logger.info(`Cleaned up ${count} old payment logs`);
    } catch (error) {
      logger.error("Failed to cleanup old payment logs", {error});
      throw error;
    }
  }
);
