import {logger} from "firebase-functions/v2";
import Stripe from "stripe";
import {SubscriptionService} from "../../services/subscriptionService";
import {StripeService} from "../../services/stripeService";
import {WebhookProcessorResult} from "../stripeWebhookHandler";
import {SubscriptionStatus, SubscriptionPlan, SubscriptionTier} from "../../types/subscription";
import {createError, ErrorCode} from "../../utils/errors";
import {getFirestore, Timestamp} from "firebase-admin/firestore";

export class SubscriptionWebhookProcessor {
  private subscriptionService: SubscriptionService;
  private stripeService: StripeService;
  private db = getFirestore();

  constructor() {
    this.subscriptionService = new SubscriptionService();
    this.stripeService = new StripeService();
  }

  /**
   * Process subscription-related webhook events
   */
  async processEvent(event: Stripe.Event): Promise<WebhookProcessorResult> {
    try {
      const subscription = event.data.object as Stripe.Subscription;

      switch (event.type) {
      case "customer.subscription.created":
        return await this.handleSubscriptionCreated(subscription);

      case "customer.subscription.updated":
        return await this.handleSubscriptionUpdated(subscription);

      case "customer.subscription.deleted":
        return await this.handleSubscriptionDeleted(subscription);

      case "customer.subscription.trial_will_end":
        return await this.handleTrialWillEnd(subscription);

      case "customer.subscription.paused":
        return await this.handleSubscriptionPaused(subscription);

      case "customer.subscription.resumed":
        return await this.handleSubscriptionResumed(subscription);

      default:
        return {
          success: true,
          message: `Unhandled subscription event: ${event.type}`,
        };
      }
    } catch (error) {
      logger.error("Subscription webhook processing error", {
        eventType: event.type,
        eventId: event.id,
        error,
      });
      return {
        success: false,
        error: error as Error,
      };
    }
  }

  /**
   * Process checkout session events
   */
  async processCheckoutEvent(event: Stripe.Event): Promise<WebhookProcessorResult> {
    try {
      const session = event.data.object as Stripe.Checkout.Session;

      switch (event.type) {
      case "checkout.session.completed":
        return await this.handleCheckoutCompleted(session);

      case "checkout.session.expired":
        return await this.handleCheckoutExpired(session);

      default:
        return {
          success: true,
          message: `Unhandled checkout event: ${event.type}`,
        };
      }
    } catch (error) {
      logger.error("Checkout webhook processing error", {
        eventType: event.type,
        eventId: event.id,
        error,
      });
      return {
        success: false,
        error: error as Error,
      };
    }
  }

  /**
   * Handle subscription created event
   */
  private async handleSubscriptionCreated(
    stripeSubscription: Stripe.Subscription
  ): Promise<WebhookProcessorResult> {
    try {
      const metadata = stripeSubscription.metadata;
      const userId = metadata.userId;

      if (!userId) {
        throw createError(ErrorCode.INVALID_ARGUMENT, "Missing userId in subscription metadata");
      }

      // Check if subscription already exists
      const existingSubscription = await this.db.collection("subscriptions")
        .doc(stripeSubscription.id)
        .get();

      if (existingSubscription.exists) {
        logger.info("Subscription already exists, skipping creation", {
          subscriptionId: stripeSubscription.id,
        });
        return {
          success: true,
          message: "Subscription already exists",
        };
      }

      // Get customer details
      const customer = await this.stripeService.stripe.customers.retrieve(
        stripeSubscription.customer as string
      ) as Stripe.Customer;

      // Extract plan and tier from metadata or price
      const plan = metadata.plan as SubscriptionPlan || SubscriptionPlan.INDIVIDUAL;
      const tier = metadata.tier as SubscriptionTier;

      // Create subscription in our database
      await this.subscriptionService.createSubscription({
        userId,
        userEmail: customer.email!,
        stripeSubscriptionId: stripeSubscription.id,
        stripeCustomerId: customer.id,
        plan,
        tier,
        interval: stripeSubscription.items.data[0].price.recurring?.interval as "month" | "year",
        status: this.stripeService.mapSubscriptionStatus(stripeSubscription.status),
        currentPeriodStart: new Date((stripeSubscription as any).current_period_start * 1000),
        currentPeriodEnd: new Date((stripeSubscription as any).current_period_end * 1000),
        trialEnd: stripeSubscription.trial_end ?
          new Date(stripeSubscription.trial_end * 1000) :
          undefined,
        referralCode: metadata.referralCode,
      });

      logger.info("Subscription created from webhook", {
        subscriptionId: stripeSubscription.id,
        userId,
        plan,
        tier,
      });

      return {
        success: true,
        message: "Subscription created successfully",
      };
    } catch (error) {
      logger.error("Failed to handle subscription created", {
        subscriptionId: stripeSubscription.id,
        error,
      });
      return {
        success: false,
        error: error as Error,
      };
    }
  }

  /**
   * Handle subscription updated event
   */
  private async handleSubscriptionUpdated(
    stripeSubscription: Stripe.Subscription
  ): Promise<WebhookProcessorResult> {
    try {
      // Sync subscription from Stripe
      const subscription = await this.subscriptionService.syncFromStripe(stripeSubscription.id);

      // Check for important changes
      const previousAttributes = (stripeSubscription as any).previous_attributes || {};

      // Handle status changes
      if (previousAttributes.status) {
        await this.handleStatusChange(
          subscription.id,
          previousAttributes.status,
          stripeSubscription.status
        );
      }

      // Handle plan changes
      if (previousAttributes.items) {
        await this.handlePlanChange(subscription.id, stripeSubscription);
      }

      // Handle cancellation schedule changes
      if (previousAttributes.cancel_at_period_end !== undefined) {
        await this.handleCancellationChange(
          subscription.id,
          stripeSubscription.cancel_at_period_end
        );
      }

      logger.info("Subscription updated from webhook", {
        subscriptionId: stripeSubscription.id,
        changes: Object.keys(previousAttributes),
      });

      return {
        success: true,
        message: "Subscription updated successfully",
      };
    } catch (error) {
      logger.error("Failed to handle subscription updated", {
        subscriptionId: stripeSubscription.id,
        error,
      });
      return {
        success: false,
        error: error as Error,
      };
    }
  }

  /**
   * Handle subscription deleted event
   */
  private async handleSubscriptionDeleted(
    stripeSubscription: Stripe.Subscription
  ): Promise<WebhookProcessorResult> {
    try {
      const subscription = await this.subscriptionService.syncFromStripe(stripeSubscription.id);

      // Update subscription status to canceled
      await this.subscriptionService.updateSubscription({
        subscriptionId: subscription.id,
        status: SubscriptionStatus.CANCELED,
        canceledAt: new Date(),
      });

      // Remove family members if family plan
      if (subscription.plan === SubscriptionPlan.FAMILY && subscription.familyMembers) {
        for (const member of subscription.familyMembers) {
          if (member.status === "active") {
            await this.subscriptionService.removeFamilyMember({
              subscriptionId: subscription.id,
              memberId: member.userId,
              removedBy: "system",
              reason: "Subscription canceled",
            });
          }
        }
      }

      logger.info("Subscription deleted from webhook", {
        subscriptionId: stripeSubscription.id,
      });

      return {
        success: true,
        message: "Subscription deleted successfully",
      };
    } catch (error) {
      logger.error("Failed to handle subscription deleted", {
        subscriptionId: stripeSubscription.id,
        error,
      });
      return {
        success: false,
        error: error as Error,
      };
    }
  }

  /**
   * Handle trial will end event (send notification)
   */
  private async handleTrialWillEnd(
    stripeSubscription: Stripe.Subscription
  ): Promise<WebhookProcessorResult> {
    try {
      const subscription = await this.subscriptionService.syncFromStripe(stripeSubscription.id);

      // Create notification for user
      await this.db.collection("notifications").add({
        userId: subscription.userId,
        type: "trial_ending",
        title: "Your trial is ending soon",
        message: "Your free trial will end in 3 days. Add a payment method to continue enjoying premium features.",
        data: {
          subscriptionId: subscription.id,
          trialEndDate: stripeSubscription.trial_end,
        },
        read: false,
        createdAt: Timestamp.now(),
      });

      logger.info("Trial ending notification created", {
        subscriptionId: stripeSubscription.id,
        userId: subscription.userId,
      });

      return {
        success: true,
        message: "Trial ending notification sent",
      };
    } catch (error) {
      logger.error("Failed to handle trial will end", {
        subscriptionId: stripeSubscription.id,
        error,
      });
      return {
        success: false,
        error: error as Error,
      };
    }
  }

  /**
   * Handle subscription paused event
   */
  private async handleSubscriptionPaused(
    stripeSubscription: Stripe.Subscription
  ): Promise<WebhookProcessorResult> {
    try {
      const subscription = await this.subscriptionService.syncFromStripe(stripeSubscription.id);

      await this.subscriptionService.updateSubscription({
        subscriptionId: subscription.id,
        status: SubscriptionStatus.PAUSED,
      });

      logger.info("Subscription paused from webhook", {
        subscriptionId: stripeSubscription.id,
      });

      return {
        success: true,
        message: "Subscription paused successfully",
      };
    } catch (error) {
      logger.error("Failed to handle subscription paused", {
        subscriptionId: stripeSubscription.id,
        error,
      });
      return {
        success: false,
        error: error as Error,
      };
    }
  }

  /**
   * Handle subscription resumed event
   */
  private async handleSubscriptionResumed(
    stripeSubscription: Stripe.Subscription
  ): Promise<WebhookProcessorResult> {
    try {
      const subscription = await this.subscriptionService.syncFromStripe(stripeSubscription.id);

      await this.subscriptionService.updateSubscription({
        subscriptionId: subscription.id,
        status: this.stripeService.mapSubscriptionStatus(stripeSubscription.status),
      });

      logger.info("Subscription resumed from webhook", {
        subscriptionId: stripeSubscription.id,
      });

      return {
        success: true,
        message: "Subscription resumed successfully",
      };
    } catch (error) {
      logger.error("Failed to handle subscription resumed", {
        subscriptionId: stripeSubscription.id,
        error,
      });
      return {
        success: false,
        error: error as Error,
      };
    }
  }

  /**
   * Handle checkout session completed
   */
  private async handleCheckoutCompleted(
    session: Stripe.Checkout.Session
  ): Promise<WebhookProcessorResult> {
    try {
      // Get subscription ID from session
      const subscriptionId = session.subscription as string;
      if (!subscriptionId) {
        logger.warn("No subscription ID in checkout session", {
          sessionId: session.id,
        });
        return {
          success: true,
          message: "No subscription to process",
        };
      }

      // The subscription.created webhook will handle the actual creation
      // We just log the successful checkout here
      logger.info("Checkout session completed", {
        sessionId: session.id,
        subscriptionId,
        customerEmail: session.customer_email,
      });

      // Process family member invitations if specified in metadata
      const metadata = session.metadata;
      if (metadata?.familyMemberIds) {
        const memberIds = JSON.parse(metadata.familyMemberIds);
        // This will be handled when the subscription is created
        logger.info("Family member invitations will be processed", {
          subscriptionId,
          memberCount: memberIds.length,
        });
      }

      return {
        success: true,
        message: "Checkout completed successfully",
      };
    } catch (error) {
      logger.error("Failed to handle checkout completed", {
        sessionId: session.id,
        error,
      });
      return {
        success: false,
        error: error as Error,
      };
    }
  }

  /**
   * Handle checkout session expired
   */
  private async handleCheckoutExpired(
    session: Stripe.Checkout.Session
  ): Promise<WebhookProcessorResult> {
    try {
      logger.info("Checkout session expired", {
        sessionId: session.id,
        customerEmail: session.customer_email,
      });

      // Could send an email reminder here if needed

      return {
        success: true,
        message: "Checkout expiration handled",
      };
    } catch (error) {
      logger.error("Failed to handle checkout expired", {
        sessionId: session.id,
        error,
      });
      return {
        success: false,
        error: error as Error,
      };
    }
  }

  /**
   * Handle subscription status changes
   */
  private async handleStatusChange(
    subscriptionId: string,
    oldStatus: string,
    newStatus: string
  ): Promise<void> {
    logger.info("Subscription status changed", {
      subscriptionId,
      oldStatus,
      newStatus,
    });

    // Send notifications for important status changes
    const subscription = await this.subscriptionService.getSubscription(subscriptionId);
    if (!subscription) return;

    const notificationTypes: Record<string, { title: string; message: string }> = {
      past_due: {
        title: "Payment failed",
        message: "We couldn't process your payment. Please update your payment method to continue.",
      },
      unpaid: {
        title: "Subscription suspended",
        message: "Your subscription has been suspended due to payment issues. Please update your payment method.",
      },
      active: {
        title: "Subscription reactivated",
        message: "Your subscription is now active again. Welcome back!",
      },
    };

    const notification = notificationTypes[newStatus];
    if (notification) {
      await this.db.collection("notifications").add({
        userId: subscription.userId,
        type: "subscription_status_change",
        title: notification.title,
        message: notification.message,
        data: {
          subscriptionId,
          oldStatus,
          newStatus,
        },
        read: false,
        createdAt: Timestamp.now(),
      });
    }
  }

  /**
   * Handle plan changes
   */
  private async handlePlanChange(
    subscriptionId: string,
    stripeSubscription: Stripe.Subscription
  ): Promise<void> {
    logger.info("Subscription plan changed", {
      subscriptionId,
      status: stripeSubscription.status,
    });

    // The subscription update will be handled by the main update handler
    // Here we can add any additional plan-specific logic
  }

  /**
   * Handle cancellation changes
   */
  private async handleCancellationChange(
    subscriptionId: string,
    cancelAtPeriodEnd: boolean
  ): Promise<void> {
    const subscription = await this.subscriptionService.getSubscription(subscriptionId);
    if (!subscription) return;

    if (cancelAtPeriodEnd) {
      // Subscription scheduled for cancellation
      await this.db.collection("notifications").add({
        userId: subscription.userId,
        type: "subscription_cancellation_scheduled",
        title: "Subscription cancellation scheduled",
        message: `Your subscription will be canceled at the end of the current billing period on ${subscription.currentPeriodEnd.toDate().toLocaleDateString()}.`,
        data: {
          subscriptionId,
          cancelDate: subscription.currentPeriodEnd.toDate(),
        },
        read: false,
        createdAt: Timestamp.now(),
      });
    } else {
      // Cancellation was reversed
      await this.db.collection("notifications").add({
        userId: subscription.userId,
        type: "subscription_cancellation_reversed",
        title: "Subscription reactivated",
        message: "Your subscription cancellation has been reversed. Your subscription will continue as normal.",
        data: {
          subscriptionId,
        },
        read: false,
        createdAt: Timestamp.now(),
      });
    }
  }
}
