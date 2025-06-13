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
import {PaymentErrorHandler, PaymentErrorContext, withPaymentRetry, DEFAULT_PAYMENT_RETRY_CONFIG} from "../utils/paymentErrors";

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
  public stripe?: Stripe;
  private db = getFirestore();

  constructor() {
    // Lazy initialization - don't access secrets during construction
  }

  private initializeIfNeeded() {
    if (!this.stripe) {
      this.stripe = getStripeClient();
    }
  }
  /**
   * Create or get Stripe customer
   */
  async createOrGetCustomer(userId: string, email: string, name?: string): Promise<Stripe.Customer> {
    this.initializeIfNeeded();
    try {
      // Check if user already has a Stripe customer ID
      const userDoc = await this.db.collection("users").doc(userId).get();
      const userData = userDoc.data();

      if (userData?.stripeCustomerId) {
        // Retrieve existing customer
        try {
          const customer = await withPaymentRetry(
            () => this.stripe!.customers.retrieve(userData.stripeCustomerId),
            {userId, stripeCustomerId: userData.stripeCustomerId},
            "StripeService.createOrGetCustomer"
          );
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
      const customer = await withPaymentRetry(
        () => this.stripe!.customers.create({
          email,
          name,
          metadata: {
            userId,
            firebaseUid: userId,
          },
        }),
        {userId},
        "StripeService.createOrGetCustomer"
      );

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
    this.initializeIfNeeded();
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

      const session = await withPaymentRetry(
        (idempotencyKey) => this.stripe!.checkout.sessions.create(
          sessionConfig,
          {idempotencyKey}
        ),
        {
          userId: params.userId,
          stripeCustomerId: customer.id,
          planType: params.plan,
        },
        "StripeService.createCheckoutSession",
        DEFAULT_PAYMENT_RETRY_CONFIG,
        `checkout-${params.userId}-${params.plan}-${Date.now()}`
      );

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
    this.initializeIfNeeded();
    try {
      // Retrieve current subscription
      const subscription = await withPaymentRetry(
        () => this.stripe!.subscriptions.retrieve(params.subscriptionId, {
          expand: ["items"],
        }),
        {
          userId: "unknown",
          subscriptionId: params.subscriptionId,
        },
        "StripeService.updateSubscription"
      );

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
      const updatedSubscription = await withPaymentRetry(
        (idempotencyKey) => this.stripe!.subscriptions.update(
          params.subscriptionId,
          updateParams,
          {idempotencyKey}
        ),
        {
          userId: subscription.metadata.userId || "unknown",
          subscriptionId: params.subscriptionId,
          stripeCustomerId: subscription.customer as string,
          planType: params.plan || subscription.metadata.plan,
        },
        "StripeService.updateSubscription",
        DEFAULT_PAYMENT_RETRY_CONFIG,
        `sub-update-${params.subscriptionId}-${Date.now()}`
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
    this.initializeIfNeeded();
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
        const canceledSubscription = await withPaymentRetry(
          () => this.stripe!.subscriptions.cancel(
            params.subscriptionId,
            {
              cancellation_details: cancelParams.cancellation_details,
            }
          ),
          {
            userId: "unknown",
            subscriptionId: params.subscriptionId,
          },
          "StripeService.cancelSubscription"
        );

        logger.info("Canceled subscription immediately", {
          subscriptionId: params.subscriptionId,
        });

        return canceledSubscription;
      } else {
        // Cancel at period end
        const updatedSubscription = await withPaymentRetry(
          () => this.stripe!.subscriptions.update(
            params.subscriptionId,
            cancelParams
          ),
          {
            userId: "unknown",
            subscriptionId: params.subscriptionId,
          },
          "StripeService.cancelSubscription"
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
    this.initializeIfNeeded();
    try {
      const subscription = await withPaymentRetry(
        () => this.stripe!.subscriptions.update(
          subscriptionId,
          {
            cancel_at_period_end: false,
          }
        ),
        {
          userId: "unknown",
          subscriptionId,
        },
        "StripeService.reactivateSubscription"
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
    this.initializeIfNeeded();
    try {
      return await withPaymentRetry(
        () => this.stripe!.subscriptions.retrieve(subscriptionId, {
          expand: ["items", "customer", "latest_invoice"],
        }),
        {
          userId: "unknown",
          subscriptionId,
        },
        "StripeService.getSubscription"
      );
    } catch (error) {
      logger.error("Failed to retrieve subscription", {subscriptionId, error});
      throw this.handleStripeError(error, "Failed to retrieve subscription");
    }
  }

  /**
   * Get customer's subscriptions
   */
  async getCustomerSubscriptions(customerId: string): Promise<Stripe.Subscription[]> {
    this.initializeIfNeeded();
    try {
      const subscriptions = await withPaymentRetry(
        () => this.stripe!.subscriptions.list({
          customer: customerId,
          expand: ["data.items"],
          limit: 100,
        }),
        {
          userId: "unknown",
          stripeCustomerId: customerId,
        },
        "StripeService.getCustomerSubscriptions"
      );

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
    this.initializeIfNeeded();
    try {
      const session = await withPaymentRetry(
        () => this.stripe!.billingPortal.sessions.create({
          customer: customerId,
          return_url: returnUrl,
        }),
        {
          userId: "unknown",
          stripeCustomerId: customerId,
        },
        "StripeService.createCustomerPortalSession"
      );

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
   * Handle Stripe errors with enhanced logging and context
   */
  private handleStripeError(
    error: any,
    defaultMessage: string,
    context?: Partial<PaymentErrorContext>
  ): Error {
    // If it's already a handled error, return it
    if (error.code && Object.values(ErrorCode).includes(error.code)) {
      return error;
    }

    // Build payment error context
    const errorContext: PaymentErrorContext = {
      userId: context?.userId || "unknown",
      subscriptionId: context?.subscriptionId,
      stripeCustomerId: context?.stripeCustomerId,
      paymentMethodId: context?.paymentMethodId,
      amount: context?.amount,
      currency: context?.currency,
      planType: context?.planType,
      errorCode: error.code,
      errorMessage: error.message,
      stripeErrorType: error.type,
      ...context,
    };

    // Use enhanced error handler for Stripe errors
    if (error.type || error.code) {
      PaymentErrorHandler.handleStripeError(error, errorContext, "StripeService");
    }

    // Fallback for non-Stripe errors
    return createError(ErrorCode.STRIPE_ERROR, defaultMessage);
  }

  /**
   * Retry subscription payment
   */
  async retrySubscriptionPayment(subscriptionId: string): Promise<Stripe.Subscription> {
    this.initializeIfNeeded();
    try {
      // Retrieve the subscription
      const subscription = await withPaymentRetry(
        () => this.stripe!.subscriptions.retrieve(subscriptionId, {
          expand: ["latest_invoice"],
        }),
        {
          userId: "unknown",
          subscriptionId,
        },
        "StripeService.retrySubscriptionPayment"
      );

      if (!subscription.latest_invoice) {
        throw createError(ErrorCode.PAYMENT_FAILED, "No invoice found for subscription");
      }

      const invoice = subscription.latest_invoice as Stripe.Invoice;

      // Retry the payment
      const paymentIntentId = (invoice as any).payment_intent;
      if (!paymentIntentId) {
        throw createError(ErrorCode.PAYMENT_FAILED, "No payment intent found for invoice");
      }
      const paymentIntent = await withPaymentRetry(
        () => this.stripe!.paymentIntents.retrieve(paymentIntentId),
        {
          userId: "unknown",
          subscriptionId,
          paymentMethodId: paymentIntentId,
        },
        "StripeService.retrySubscriptionPayment"
      );

      if (paymentIntent.status === "requires_payment_method") {
        // Retry with the default payment method
        await withPaymentRetry(
          () => this.stripe!.paymentIntents.confirm(paymentIntent.id),
          {
            userId: "unknown",
            subscriptionId,
            paymentMethodId: paymentIntent.id,
          },
          "StripeService.retrySubscriptionPayment"
        );
      }

      return subscription;
    } catch (error) {
      const context: PaymentErrorContext = {
        userId: "unknown",
        subscriptionId,
        stripeErrorType: (error as any).type,
      };
      throw this.handleStripeError(error as any, "Failed to retry payment", context);
    }
  }

  /**
   * Update customer payment method
   */
  async updateCustomerPaymentMethod(
    customerId: string,
    paymentMethodId: string
  ): Promise<Stripe.Customer> {
    this.initializeIfNeeded();
    try {
      // Attach payment method to customer
      await withPaymentRetry(
        () => this.stripe!.paymentMethods.attach(paymentMethodId, {
          customer: customerId,
        }),
        {
          userId: "unknown",
          stripeCustomerId: customerId,
          paymentMethodId,
        },
        "StripeService.updateCustomerPaymentMethod"
      );

      // Set as default payment method
      const customer = await withPaymentRetry(
        () => this.stripe!.customers.update(customerId, {
          invoice_settings: {
            default_payment_method: paymentMethodId,
          },
        }),
        {
          userId: "unknown",
          stripeCustomerId: customerId,
          paymentMethodId,
        },
        "StripeService.updateCustomerPaymentMethod"
      );

      return customer;
    } catch (error) {
      const context: PaymentErrorContext = {
        userId: "unknown",
        stripeCustomerId: customerId,
        paymentMethodId,
      };
      throw this.handleStripeError(error, "Failed to update payment method", context);
    }
  }

  /**
   * Create subscription (for reactivation)
   */
  async createSubscription(params: {
    customerId: string;
    priceId: string;
    paymentMethodId?: string;
    metadata?: Record<string, string>;
  }): Promise<Stripe.Subscription> {
    this.initializeIfNeeded();
    try {
      const subscriptionParams: Stripe.SubscriptionCreateParams = {
        customer: params.customerId,
        items: [{price: params.priceId}],
        payment_behavior: "default_incomplete",
        payment_settings: {
          save_default_payment_method: "on_subscription",
        },
        expand: ["latest_invoice.payment_intent"],
        metadata: params.metadata,
      };

      if (params.paymentMethodId) {
        subscriptionParams.default_payment_method = params.paymentMethodId;
      }

      return await withPaymentRetry(
        () => this.stripe!.subscriptions.create(subscriptionParams),
        {
          userId: params.metadata?.userId || "unknown",
          stripeCustomerId: params.customerId,
          paymentMethodId: params.paymentMethodId,
        },
        "StripeService.createSubscription"
      );
    } catch (error) {
      const context: PaymentErrorContext = {
        userId: params.metadata?.userId || "unknown",
        stripeCustomerId: params.customerId,
        paymentMethodId: params.paymentMethodId,
      };
      throw this.handleStripeError(error, "Failed to create subscription", context);
    }
  }
}
