import {getFirestore, Timestamp, FieldValue} from "firebase-admin/firestore";
import {logger} from "firebase-functions/v2";
import {SubscriptionService} from "./subscriptionService";
import {StripeService} from "./stripeService";
import {sendEmailUniversal} from "../auth/config/emailConfig";
import {
  SubscriptionStatus,
  Subscription,
  PaymentFailureRecord,
  GracePeriodStatus,
} from "../types/subscription";
import {ErrorCode, createError} from "../utils/errors";
import {
  GRACE_PERIOD_CONFIG,
  PaymentErrorContext,
  PaymentErrorHandler,
} from "../utils/paymentErrors";

export interface PaymentRetrySchedule {
  subscriptionId: string;
  userId: string;
  nextRetryAt: Date;
  attemptNumber: number;
  maxAttempts: number;
  lastError?: string;
}

export interface DunningEmailData {
  userEmail: string;
  userName: string;
  planName: string;
  failureDate: Date;
  gracePeriodEndDate: Date;
  updatePaymentUrl: string;
  amount: number;
  currency: string;
  lastFourDigits?: string;
}

export class PaymentRecoveryService {
  private db = getFirestore();
  private stripeService: StripeService;
  private subscriptionService: SubscriptionService;

  constructor() {
    this.stripeService = new StripeService();
    this.subscriptionService = new SubscriptionService();
  }

  /**
   * Handle payment failure and initiate recovery process
   */
  async handlePaymentFailure(
    subscriptionId: string,
    error: any,
    paymentIntentId?: string
  ): Promise<void> {
    try {
      logger.info("Handling payment failure", {subscriptionId, error, paymentIntentId});

      // Get subscription details
      const subscription = await this.subscriptionService.getSubscription(subscriptionId);
      if (!subscription) {
        throw createError(ErrorCode.SUBSCRIPTION_NOT_FOUND, "Subscription not found");
      }

      // Create or update payment failure record
      const failureRecord = await this.createPaymentFailureRecord(
        subscription,
        error,
        paymentIntentId
      );

      // Determine grace period type based on error
      const gracePeriodType = this.determineGracePeriodType(error);
      const gracePeriodConfig = GRACE_PERIOD_CONFIG[gracePeriodType];

      // Set subscription to grace period
      await this.setGracePeriod(subscription, gracePeriodConfig, failureRecord);

      // Schedule retry
      await this.schedulePaymentRetry(subscription, failureRecord, gracePeriodConfig);

      // Send dunning email
      await this.sendDunningEmail(subscription, failureRecord, gracePeriodConfig, 0);

      // Update subscription status
      await this.subscriptionService.updateSubscription({
        subscriptionId: subscription.id,
        status: SubscriptionStatus.PAST_DUE,
      });

      // Update additional fields directly
      await this.db.collection("subscriptions").doc(subscription.id).update({
        lastPaymentError: {
          code: error.code || error.type,
          message: error.message,
          occurredAt: Timestamp.now(),
        },
        updatedAt: Timestamp.now(),
      });

      logger.info("Payment failure handled, grace period initiated", {
        subscriptionId,
        gracePeriodType,
        gracePeriodDays: gracePeriodConfig.durationDays,
      });
    } catch (error) {
      logger.error("Failed to handle payment failure", {subscriptionId, error});
      throw error;
    }
  }

  /**
   * Process scheduled payment retry
   */
  async processPaymentRetry(retrySchedule: PaymentRetrySchedule): Promise<void> {
    try {
      logger.info("Processing payment retry", retrySchedule);

      const subscription = await this.subscriptionService.getSubscription(
        retrySchedule.subscriptionId
      );
      if (!subscription) {
        throw createError(ErrorCode.SUBSCRIPTION_NOT_FOUND, "Subscription not found");
      }

      // Check if subscription is still in grace period
      if (!subscription.gracePeriod || subscription.gracePeriod.status !== GracePeriodStatus.ACTIVE) {
        logger.info("Subscription no longer in grace period, skipping retry", {
          subscriptionId: retrySchedule.subscriptionId,
        });
        return;
      }

      // Attempt payment
      const context: PaymentErrorContext = {
        userId: subscription.userId,
        subscriptionId: subscription.id,
        stripeCustomerId: subscription.stripeCustomerId,
        attemptNumber: retrySchedule.attemptNumber,
      };

      try {
        // Verify we have a Stripe subscription ID
        if (!subscription.stripeSubscriptionId) {
          throw createError(ErrorCode.INVALID_STATE, "No Stripe subscription ID found");
        }

        // Retry payment using Stripe
        await this.stripeService.retrySubscriptionPayment(subscription.stripeSubscriptionId);

        // Payment successful - clear grace period
        await this.clearGracePeriod(subscription);

        logger.info("Payment retry successful", {
          subscriptionId: subscription.id,
          attemptNumber: retrySchedule.attemptNumber,
        });
      } catch (retryError) {
        // Payment failed again
        await PaymentErrorHandler.logPaymentAttempt(context, "failed", retryError);

        // Update failure record
        const failureRecord = await this.updatePaymentFailureRecord(
          subscription.id,
          retryError,
          retrySchedule.attemptNumber
        );

        // Check if we should continue retrying
        const gracePeriodConfig = GRACE_PERIOD_CONFIG[subscription.gracePeriod.type];
        if (retrySchedule.attemptNumber < gracePeriodConfig.maxRetries) {
          // Schedule next retry
          await this.schedulePaymentRetry(
            subscription,
            failureRecord,
            gracePeriodConfig,
            retrySchedule.attemptNumber + 1
          );

          // Send follow-up dunning email if needed
          const emailInterval = this.getNextEmailInterval(
            retrySchedule.attemptNumber,
            gracePeriodConfig
          );
          if (emailInterval !== null) {
            await this.sendDunningEmail(
              subscription,
              failureRecord,
              gracePeriodConfig,
              emailInterval
            );
          }
        } else {
          // Max retries reached - suspend subscription
          await this.suspendSubscription(subscription);
        }
      }
    } catch (error) {
      logger.error("Failed to process payment retry", {retrySchedule, error});
      throw error;
    }
  }

  /**
   * Clear grace period after successful payment
   */
  private async clearGracePeriod(subscription: Subscription): Promise<void> {
    await this.db.collection("subscriptions").doc(subscription.id).update({
      gracePeriod: FieldValue.delete(),
      status: SubscriptionStatus.ACTIVE,
      lastPaymentError: FieldValue.delete(),
      updatedAt: Timestamp.now(),
    });

    // Clear payment failure records
    const failureRecords = await this.db
      .collection("paymentFailures")
      .where("subscriptionId", "==", subscription.id)
      .where("resolved", "==", false)
      .get();

    const batch = this.db.batch();
    failureRecords.forEach((doc) => {
      batch.update(doc.ref, {
        resolved: true,
        resolvedAt: Timestamp.now(),
      });
    });
    await batch.commit();

    // Send success notification
    await this.sendPaymentSuccessEmail(subscription);
  }

  /**
   * Suspend subscription after grace period expires
   */
  public async suspendSubscription(subscription: Subscription): Promise<void> {
    logger.info("Suspending subscription after grace period expiration", {
      subscriptionId: subscription.id,
    });

    // Cancel Stripe subscription if it exists
    if (subscription.stripeSubscriptionId) {
      await this.stripeService.cancelSubscription({
        subscriptionId: subscription.stripeSubscriptionId,
        cancelImmediately: true,
        reason: "payment_failure",
        feedback: "Grace period expired after multiple payment failures",
      });
    }

    // Update subscription status
    await this.subscriptionService.updateSubscription({
      subscriptionId: subscription.id,
      status: SubscriptionStatus.SUSPENDED,
    });

    // Update additional fields directly
    await this.db.collection("subscriptions").doc(subscription.id).update({
      suspendedAt: Timestamp.now(),
      suspensionReason: "payment_failure",
      updatedAt: Timestamp.now(),
    });

    // Send suspension notification
    await this.sendSuspensionEmail(subscription);

    // Remove family members if family plan
    if (subscription.plan === "family" && subscription.familyMembers) {
      for (const member of subscription.familyMembers) {
        if (member.status === "active") {
          await this.subscriptionService.removeFamilyMember({
            subscriptionId: subscription.id,
            memberId: member.userId,
            removedBy: "system",
            reason: "Subscription suspended due to payment failure",
          });
        }
      }
    }
  }

  /**
   * Reactivate suspended subscription
   */
  async reactivateSubscription(
    subscriptionId: string,
    paymentMethodId: string
  ): Promise<Subscription> {
    try {
      const subscription = await this.subscriptionService.getSubscription(subscriptionId);
      if (!subscription) {
        throw createError(ErrorCode.SUBSCRIPTION_NOT_FOUND, "Subscription not found");
      }

      if (subscription.status !== SubscriptionStatus.SUSPENDED) {
        throw createError(
          ErrorCode.INVALID_ARGUMENT,
          "Only suspended subscriptions can be reactivated"
        );
      }

      // Verify we have required Stripe data
      if (!subscription.stripeCustomerId) {
        throw createError(ErrorCode.INVALID_STATE, "No Stripe customer ID found");
      }

      if (!subscription.stripePriceId) {
        throw createError(ErrorCode.INVALID_STATE, "No Stripe price ID found");
      }

      // Update payment method
      await this.stripeService.updateCustomerPaymentMethod(
        subscription.stripeCustomerId,
        paymentMethodId
      );

      // Create new Stripe subscription
      const newStripeSubscription = await this.stripeService.createSubscription({
        customerId: subscription.stripeCustomerId,
        priceId: subscription.stripePriceId,
        paymentMethodId,
        metadata: {
          userId: subscription.userId,
          reactivated: "true",
          previousSubscriptionId: subscription.stripeSubscriptionId || "",
        },
      });

      // Update subscription status
      await this.subscriptionService.updateSubscription({
        subscriptionId: subscription.id,
        status: SubscriptionStatus.ACTIVE,
      });

      // Update additional fields directly
      await this.db.collection("subscriptions").doc(subscription.id).update({
        stripeSubscriptionId: newStripeSubscription.id,
        suspendedAt: FieldValue.delete(),
        suspensionReason: FieldValue.delete(),
        reactivatedAt: Timestamp.now(),
        gracePeriod: null,
        updatedAt: Timestamp.now(),
      });

      // Get updated subscription
      const updatedSubscription = await this.subscriptionService.getSubscription(subscription.id);
      if (!updatedSubscription) {
        throw createError(ErrorCode.INTERNAL, "Failed to get updated subscription");
      }

      // Send reactivation confirmation
      await this.sendReactivationEmail(updatedSubscription);

      return updatedSubscription;
    } catch (error) {
      logger.error("Failed to reactivate subscription", {subscriptionId, error});
      throw error;
    }
  }

  /**
   * Create payment failure record
   */
  private async createPaymentFailureRecord(
    subscription: Subscription,
    error: any,
    paymentIntentId?: string
  ): Promise<PaymentFailureRecord> {
    const failureRecord: PaymentFailureRecord = {
      id: this.db.collection("paymentFailures").doc().id,
      subscriptionId: subscription.id,
      userId: subscription.userId,
      stripeCustomerId: subscription.stripeCustomerId,
      paymentIntentId,
      errorCode: error.code || error.type,
      errorMessage: error.message,
      errorType: error.type,
      declineCode: error.decline_code,
      amount: subscription.amount,
      currency: subscription.currency || "usd",
      attemptCount: 1,
      resolved: false,
      createdAt: Timestamp.now(),
      lastAttemptAt: Timestamp.now(),
    };

    await this.db.collection("paymentFailures").doc(failureRecord.id).set(failureRecord);
    return failureRecord;
  }

  /**
   * Update payment failure record
   */
  private async updatePaymentFailureRecord(
    subscriptionId: string,
    error: any,
    attemptNumber: number
  ): Promise<PaymentFailureRecord> {
    const query = await this.db
      .collection("paymentFailures")
      .where("subscriptionId", "==", subscriptionId)
      .where("resolved", "==", false)
      .orderBy("createdAt", "desc")
      .limit(1)
      .get();

    if (query.empty) {
      throw createError(ErrorCode.NOT_FOUND, "Payment failure record not found");
    }

    const doc = query.docs[0];
    await doc.ref.update({
      errorCode: error.code || error.type,
      errorMessage: error.message,
      errorType: error.type,
      declineCode: error.decline_code,
      attemptCount: attemptNumber,
      lastAttemptAt: Timestamp.now(),
    });

    return {...doc.data(), id: doc.id} as PaymentFailureRecord;
  }

  /**
   * Set grace period for subscription
   */
  private async setGracePeriod(
    subscription: Subscription,
    config: typeof GRACE_PERIOD_CONFIG[keyof typeof GRACE_PERIOD_CONFIG],
    failureRecord: PaymentFailureRecord
  ): Promise<void> {
    const gracePeriodEndDate = new Date();
    gracePeriodEndDate.setDate(gracePeriodEndDate.getDate() + config.durationDays);

    await this.db.collection("subscriptions").doc(subscription.id).update({
      gracePeriod: {
        status: GracePeriodStatus.ACTIVE,
        type: this.determineGracePeriodType(failureRecord),
        startedAt: Timestamp.now(),
        endsAt: Timestamp.fromDate(gracePeriodEndDate),
        reason: failureRecord.errorMessage,
        paymentFailureId: failureRecord.id,
      },
      updatedAt: Timestamp.now(),
    });
  }

  /**
   * Schedule payment retry
   */
  private async schedulePaymentRetry(
    subscription: Subscription,
    failureRecord: PaymentFailureRecord,
    config: typeof GRACE_PERIOD_CONFIG[keyof typeof GRACE_PERIOD_CONFIG],
    attemptNumber: number = 1
  ): Promise<void> {
    // Calculate next retry time
    const retryDelay = PaymentErrorHandler.calculateRetryDelay(attemptNumber);
    const nextRetryAt = new Date(Date.now() + retryDelay);

    const retrySchedule: PaymentRetrySchedule = {
      subscriptionId: subscription.id,
      userId: subscription.userId,
      nextRetryAt,
      attemptNumber,
      maxAttempts: config.maxRetries,
      lastError: failureRecord.errorMessage,
    };

    // Store retry schedule
    await this.db.collection("paymentRetrySchedule").add({
      ...retrySchedule,
      createdAt: Timestamp.now(),
      processed: false,
    });

    logger.info("Payment retry scheduled", {
      subscriptionId: subscription.id,
      attemptNumber,
      nextRetryAt: nextRetryAt.toISOString(),
    });
  }

  /**
   * Determine grace period type based on error
   */
  private determineGracePeriodType(error: any): keyof typeof GRACE_PERIOD_CONFIG {
    if (error.code === "expired_card" || error.decline_code === "expired_card") {
      return "paymentMethodExpired";
    }
    if (error.code === "subscription_expired") {
      return "subscriptionExpired";
    }
    return "paymentFailed";
  }

  /**
   * Get next email interval
   */
  private getNextEmailInterval(
    attemptNumber: number,
    config: typeof GRACE_PERIOD_CONFIG[keyof typeof GRACE_PERIOD_CONFIG]
  ): number | null {
    for (const interval of config.notificationIntervals) {
      if (interval === attemptNumber) {
        return interval;
      }
    }
    return null;
  }

  /**
   * Send dunning email
   */
  private async sendDunningEmail(
    subscription: Subscription,
    failureRecord: PaymentFailureRecord,
    config: typeof GRACE_PERIOD_CONFIG[keyof typeof GRACE_PERIOD_CONFIG],
    intervalDay: number
  ): Promise<void> {
    try {
      const user = await this.db.collection("users").doc(subscription.userId).get();
      const userData = user.data();
      if (!userData) return;

      const gracePeriodEndDate = new Date();
      gracePeriodEndDate.setDate(gracePeriodEndDate.getDate() + config.durationDays);

      const emailData: DunningEmailData = {
        userEmail: userData.email,
        userName: userData.displayName || userData.email,
        planName: subscription.planDisplayName,
        failureDate: failureRecord.createdAt.toDate(),
        gracePeriodEndDate,
        updatePaymentUrl: `${process.env.FRONTEND_URL}/account/billing/update-payment`,
        amount: subscription.amount,
        currency: subscription.currency || "usd",
        lastFourDigits: failureRecord.lastFourDigits,
      };

      // Determine email content based on interval
      let subject = "Payment Failed - Action Required";
      let urgency = "standard";

      if (intervalDay === config.notificationIntervals[config.notificationIntervals.length - 1]) {
        subject = "Final Notice - Subscription Will Be Suspended";
        urgency = "critical";
      } else if (intervalDay > 0) {
        subject = "Payment Reminder - Update Your Payment Method";
        urgency = "reminder";
      }

      // Send appropriate payment email based on interval
      const templateType = intervalDay >= config.durationDays - 1 ? "paymentRetry" : "paymentFailed";

      await sendEmailUniversal({
        to: userData.email,
        templateType,
        dynamicTemplateData: {
          ...emailData,
          retryDate: new Date(Date.now() + 24 * 60 * 60 * 1000).toLocaleDateString(),
          attemptNumber: intervalDay + 1,
          subject,
          urgency,
        },
        userId: subscription.userId,
      });

      logger.info("Dunning email sent", {
        userId: subscription.userId,
        urgency,
        intervalDay,
      });
    } catch (error) {
      logger.error("Failed to send dunning email", {
        subscriptionId: subscription.id,
        error,
      });
      // Don't throw - email failure shouldn't break the recovery process
    }
  }

  /**
   * Send payment success email
   */
  private async sendPaymentSuccessEmail(subscription: Subscription): Promise<void> {
    try {
      const user = await this.db.collection("users").doc(subscription.userId).get();
      const userData = user.data();
      if (!userData) return;

      // Payment success still uses standard notification since it's not a failure scenario
      // Using 'mfa' template as a fallback for now
      await sendEmailUniversal({
        to: userData.email,
        templateType: "mfa",
        dynamicTemplateData: {
          userName: userData.displayName || userData.email,
          planName: subscription.planDisplayName,
          subject: "Payment Successful - Your Subscription is Active",
          emailType: "payment_success",
        },
        userId: subscription.userId,
      });
    } catch (error) {
      logger.error("Failed to send payment success email", {
        subscriptionId: subscription.id,
        error,
      });
    }
  }

  /**
   * Send suspension email
   */
  private async sendSuspensionEmail(subscription: Subscription): Promise<void> {
    try {
      const user = await this.db.collection("users").doc(subscription.userId).get();
      const userData = user.data();
      if (!userData) return;

      await sendEmailUniversal({
        to: userData.email,
        templateType: "subscriptionSuspended",
        dynamicTemplateData: {
          userName: userData.displayName || userData.email,
          plan: subscription.planDisplayName,
          suspensionDate: new Date().toLocaleDateString(),
          gracePeriodEnds: "N/A",
          reactivateUrl: `${process.env.FRONTEND_URL || "https://mydynastyapp.com"}/account/billing/reactivate`,
          subject: "Subscription Suspended - Payment Required",
        },
        userId: subscription.userId,
      });
    } catch (error) {
      logger.error("Failed to send suspension email", {
        subscriptionId: subscription.id,
        error,
      });
    }
  }

  /**
   * Send reactivation email
   */
  private async sendReactivationEmail(subscription: Subscription): Promise<void> {
    try {
      const user = await this.db.collection("users").doc(subscription.userId).get();
      const userData = user.data();
      if (!userData) return;

      // Reactivation success still uses standard notification
      // Using 'mfa' template as a fallback for now
      await sendEmailUniversal({
        to: userData.email,
        templateType: "mfa",
        dynamicTemplateData: {
          userName: userData.displayName || userData.email,
          planName: subscription.planDisplayName,
          subject: "Subscription Reactivated - Welcome Back!",
          emailType: "subscription_reactivated",
        },
        userId: subscription.userId,
      });
    } catch (error) {
      logger.error("Failed to send reactivation email", {
        subscriptionId: subscription.id,
        error,
      });
    }
  }
}
