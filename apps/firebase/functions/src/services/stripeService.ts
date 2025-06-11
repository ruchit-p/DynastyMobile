import Stripe from "stripe";
import {logger} from "firebase-functions/v2";
import {getFirestore, Timestamp} from "firebase-admin/firestore";
import {
  getStripeClient,
  createCheckoutSessionConfig,
  createSubscriptionUpdateParams,
  STRIPE_CONFIG,
} from "../config/stripeConfig";
import {
  getStripePriceId,
  getAddonPriceId,
  isAddonEligible,
} from "../config/stripeProducts";
import {
  CheckoutSessionMetadata,
} from "../types/stripe";
import {
  SubscriptionPlan,
  SubscriptionTier,
  SubscriptionStatus,
} from "../types/subscription";
import {createError, ErrorCode} from "../utils/errors";

export interface CreateCheckoutSessionParams {
  userId: string;
  userEmail: string;
  plan: SubscriptionPlan;
  tier?: SubscriptionTier;
  interval?: "month" | "year";
  addons?: string[];
  referralCode?: string;
  familyMemberIds?: string[];
  allowPromotionCodes?: boolean;
}

export interface UpdateSubscriptionParams {
  subscriptionId: string;
  plan?: SubscriptionPlan;
  tier?: SubscriptionTier;
  addons?: string[];
  cancelAtPeriodEnd?: boolean;
  prorationBehavior?: Stripe.SubscriptionUpdateParams.ProrationBehavior;
}

export interface CancelSubscriptionParams {
  subscriptionId: string;
  cancelImmediately?: boolean;
  reason?: string;
  feedback?: string;
}

export class StripeService {
  public stripe: Stripe;
  private db = getFirestore();

  constructor() {
    this.stripe = getStripeClient();
  }

  /**
   * Create or get Stripe customer
   */
  async createOrGetCustomer(userId: string, email: string, name?: string): Promise<Stripe.Customer> {
    try {
      // Check if user already has a Stripe customer ID
      const userDoc = await this.db.collection("users").doc(userId).get();
      const userData = userDoc.data();

      if (userData?.stripeCustomerId) {
        // Retrieve existing customer
        try {
          const customer = await this.stripe.customers.retrieve(userData.stripeCustomerId);
          if (!customer.deleted) {
            return customer as Stripe.Customer;
          }
        } catch (error) {
          logger.warn("Failed to retrieve existing customer, creating new one", {
            customerId: userData.stripeCustomerId,
            error,
          });
        }
      }

      // Create new customer
      const customer = await this.stripe.customers.create({
        email,
        name,
        metadata: {
          userId,
          firebaseUid: userId,
        },
      });

      // Update user document with customer ID
      await this.db.collection("users").doc(userId).update({
        stripeCustomerId: customer.id,
        updatedAt: Timestamp.now(),
      });

      logger.info("Created new Stripe customer", {
        customerId: customer.id,
        userId,
      });

      return customer;
    } catch (error) {
      logger.error("Failed to create or get customer", {userId, error});
      throw this.handleStripeError(error, "Failed to create customer");
    }
  }

  /**
   * Create a checkout session for subscription
   */
  async createCheckoutSession(params: CreateCheckoutSessionParams): Promise<Stripe.Checkout.Session> {
    try {
      // Validate plan and tier
      if (params.plan === SubscriptionPlan.INDIVIDUAL && !params.tier) {
        throw createError(ErrorCode.INVALID_ARGUMENT, "Tier is required for Individual plan");
      }

      // Get or create customer
      const customer = await this.createOrGetCustomer(
        params.userId,
        params.userEmail
      );

      // Build line items
      const lineItems: Stripe.Checkout.SessionCreateParams.LineItem[] = [];

      // Main subscription
      const priceId = getStripePriceId(params.plan, params.tier, params.interval);
      if (priceId) {
        lineItems.push({
          price: priceId,
          quantity: 1,
        });
      }

      // Add addons (only for Individual plan)
      if (params.addons && params.addons.length > 0) {
        if (!isAddonEligible(params.plan, params.tier)) {
          throw createError(ErrorCode.ADDON_INVALID, "Addons are not available for this plan");
        }

        params.addons.forEach((addonType) => {
          const addonPriceId = getAddonPriceId(addonType as any);
          lineItems.push({
            price: addonPriceId,
            quantity: 1,
          });
        });
      }

      if (lineItems.length === 0) {
        throw createError(ErrorCode.INVALID_ARGUMENT, "No items to checkout");
      }

      // Build metadata
      const metadata: CheckoutSessionMetadata = {
        userId: params.userId,
        userEmail: params.userEmail,
        plan: params.plan,
        tier: params.tier,
        addons: params.addons ? JSON.stringify(params.addons) : undefined,
        referralCode: params.referralCode,
        familyMemberIds: params.familyMemberIds ? JSON.stringify(params.familyMemberIds) : undefined,
        source: "web", // Can be updated based on where checkout was initiated
      };

      // Build subscription data
      const subscriptionData: Stripe.Checkout.SessionCreateParams.SubscriptionData = {
        metadata: {
          userId: params.userId,
          plan: params.plan,
          tier: params.tier || "",
          referralCode: params.referralCode || "",
        },
      };

      // Add trial period for new subscriptions
      if (params.plan === SubscriptionPlan.INDIVIDUAL || params.plan === SubscriptionPlan.FAMILY) {
        const trialDays = STRIPE_CONFIG.TRIAL_PERIOD_DAYS[params.plan.toUpperCase() as keyof typeof STRIPE_CONFIG.TRIAL_PERIOD_DAYS];
        if (trialDays) {
          subscriptionData.trial_period_days = trialDays;
        }
      }

      // Create checkout session
      const sessionConfig = createCheckoutSessionConfig({
        customerId: customer.id,
        lineItems,
        metadata: metadata as any,
        subscriptionData,
        allowPromotionCodes: params.allowPromotionCodes,
      });

      const session = await this.stripe.checkout.sessions.create(sessionConfig);

      logger.info("Created checkout session", {
        sessionId: session.id,
        userId: params.userId,
        plan: params.plan,
        tier: params.tier,
      });

      return session;
    } catch (error) {
      logger.error("Failed to create checkout session", {params, error});
      throw this.handleStripeError(error, "Failed to create checkout session");
    }
  }

  /**
   * Update an existing subscription
   */
  async updateSubscription(params: UpdateSubscriptionParams): Promise<Stripe.Subscription> {
    try {
      // Retrieve current subscription
      const subscription = await this.stripe.subscriptions.retrieve(params.subscriptionId, {
        expand: ["items"],
      });

      if (!subscription) {
        throw createError(ErrorCode.SUBSCRIPTION_NOT_FOUND, "Subscription not found");
      }

      // Build update parameters
      const updateParams = createSubscriptionUpdateParams({
        cancelAtPeriodEnd: params.cancelAtPeriodEnd,
        prorationBehavior: params.prorationBehavior,
      });

      // Handle plan/tier changes
      if (params.plan && (params.plan !== SubscriptionPlan.FREE)) {
        const newPriceId = getStripePriceId(params.plan, params.tier);
        if (!newPriceId) {
          throw createError(ErrorCode.INVALID_ARGUMENT, "Invalid plan configuration");
        }

        // Find the main subscription item (not addons)
        const mainItem = subscription.items.data.find((item) =>
          !item.price.metadata?.addonType
        );

        if (!mainItem) {
          throw createError(ErrorCode.INTERNAL, "Could not find main subscription item");
        }

        updateParams.items = [{
          id: mainItem.id,
          price: newPriceId,
        }];

        // Update metadata
        updateParams.metadata = {
          ...subscription.metadata,
          plan: params.plan,
          tier: params.tier || "",
        };
      }

      // Handle addon changes (only for Individual plan)
      if (params.addons !== undefined) {
        const currentPlan = subscription.metadata.plan as SubscriptionPlan;
        const currentTier = subscription.metadata.tier as SubscriptionTier;

        if (!isAddonEligible(currentPlan, currentTier)) {
          throw createError(ErrorCode.ADDON_INVALID, "Addons are not available for this plan");
        }

        // Get current addon items
        const addonItems = subscription.items.data.filter((item) =>
          item.price.metadata?.addonType
        );

        // Remove all current addons
        updateParams.items = updateParams.items || [];
        addonItems.forEach((item) => {
          updateParams.items!.push({
            id: item.id,
            deleted: true,
          });
        });

        // Add new addons
        params.addons.forEach((addonType) => {
          const addonPriceId = getAddonPriceId(addonType as any);
          updateParams.items!.push({
            price: addonPriceId,
            quantity: 1,
          });
        });
      }

      // Update subscription
      const updatedSubscription = await this.stripe.subscriptions.update(
        params.subscriptionId,
        updateParams
      );

      logger.info("Updated subscription", {
        subscriptionId: params.subscriptionId,
        updates: params,
      });

      return updatedSubscription;
    } catch (error) {
      logger.error("Failed to update subscription", {params, error});
      throw this.handleStripeError(error, "Failed to update subscription");
    }
  }

  /**
   * Cancel a subscription
   */
  async cancelSubscription(params: CancelSubscriptionParams): Promise<Stripe.Subscription> {
    try {
      const cancelParams: Stripe.SubscriptionUpdateParams = {
        cancel_at_period_end: !params.cancelImmediately,
        cancellation_details: {
          comment: params.reason,
          feedback: params.feedback as any,
        },
      };

      if (params.cancelImmediately) {
        // Cancel immediately
        const canceledSubscription = await this.stripe.subscriptions.cancel(
          params.subscriptionId,
          {
            cancellation_details: cancelParams.cancellation_details,
          }
        );

        logger.info("Canceled subscription immediately", {
          subscriptionId: params.subscriptionId,
        });

        return canceledSubscription;
      } else {
        // Cancel at period end
        const updatedSubscription = await this.stripe.subscriptions.update(
          params.subscriptionId,
          cancelParams
        );

        logger.info("Scheduled subscription cancellation", {
          subscriptionId: params.subscriptionId,
          cancelAt: new Date((updatedSubscription as any).current_period_end * 1000),
        });

        return updatedSubscription;
      }
    } catch (error) {
      logger.error("Failed to cancel subscription", {params, error});
      throw this.handleStripeError(error, "Failed to cancel subscription");
    }
  }

  /**
   * Reactivate a canceled subscription
   */
  async reactivateSubscription(subscriptionId: string): Promise<Stripe.Subscription> {
    try {
      const subscription = await this.stripe.subscriptions.update(
        subscriptionId,
        {
          cancel_at_period_end: false,
        }
      );

      logger.info("Reactivated subscription", {
        subscriptionId,
      });

      return subscription;
    } catch (error) {
      logger.error("Failed to reactivate subscription", {subscriptionId, error});
      throw this.handleStripeError(error, "Failed to reactivate subscription");
    }
  }

  /**
   * Get subscription by ID
   */
  async getSubscription(subscriptionId: string): Promise<Stripe.Subscription> {
    try {
      return await this.stripe.subscriptions.retrieve(subscriptionId, {
        expand: ["items", "customer", "latest_invoice"],
      });
    } catch (error) {
      logger.error("Failed to retrieve subscription", {subscriptionId, error});
      throw this.handleStripeError(error, "Failed to retrieve subscription");
    }
  }

  /**
   * Get customer's subscriptions
   */
  async getCustomerSubscriptions(customerId: string): Promise<Stripe.Subscription[]> {
    try {
      const subscriptions = await this.stripe.subscriptions.list({
        customer: customerId,
        expand: ["data.items"],
        limit: 100,
      });

      return subscriptions.data;
    } catch (error) {
      logger.error("Failed to retrieve customer subscriptions", {customerId, error});
      throw this.handleStripeError(error, "Failed to retrieve subscriptions");
    }
  }

  /**
   * Create customer portal session
   */
  async createCustomerPortalSession(customerId: string, returnUrl: string): Promise<Stripe.BillingPortal.Session> {
    try {
      const session = await this.stripe.billingPortal.sessions.create({
        customer: customerId,
        return_url: returnUrl,
      });

      logger.info("Created customer portal session", {
        customerId,
        sessionId: session.id,
      });

      return session;
    } catch (error) {
      logger.error("Failed to create customer portal session", {customerId, error});
      throw this.handleStripeError(error, "Failed to create billing portal session");
    }
  }

  /**
   * Map Stripe subscription status to our internal status
   */
  mapSubscriptionStatus(stripeStatus: Stripe.Subscription.Status): SubscriptionStatus {
    const statusMap: Record<Stripe.Subscription.Status, SubscriptionStatus> = {
      active: SubscriptionStatus.ACTIVE,
      past_due: SubscriptionStatus.PAST_DUE,
      unpaid: SubscriptionStatus.UNPAID,
      canceled: SubscriptionStatus.CANCELED,
      incomplete: SubscriptionStatus.INCOMPLETE,
      incomplete_expired: SubscriptionStatus.INCOMPLETE_EXPIRED,
      trialing: SubscriptionStatus.TRIALING,
      paused: SubscriptionStatus.PAUSED,
    };

    return statusMap[stripeStatus] || SubscriptionStatus.CANCELED;
  }

  /**
   * Handle Stripe errors
   */
  private handleStripeError(error: any, defaultMessage: string): Error {
    if (error.type === "StripeCardError") {
      return createError(ErrorCode.PAYMENT_FAILED, error.message);
    }

    if (error.type === "StripeInvalidRequestError") {
      return createError(ErrorCode.INVALID_REQUEST, error.message);
    }

    if (error.type === "StripeAPIError" || error.type === "StripeConnectionError") {
      return createError(ErrorCode.SERVICE_UNAVAILABLE, "Payment service temporarily unavailable");
    }

    if (error.type === "StripeAuthenticationError") {
      logger.error("Stripe authentication error - check API keys", {error});
      return createError(ErrorCode.INTERNAL, defaultMessage);
    }

    if (error.code && Object.values(ErrorCode).includes(error.code)) {
      return error;
    }

    return createError(ErrorCode.STRIPE_ERROR, defaultMessage);
  }
}
