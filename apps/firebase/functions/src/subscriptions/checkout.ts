import {getFirestore, Timestamp} from "firebase-admin/firestore";
import {logger} from "firebase-functions/v2";
import Stripe from "stripe";
import {StripeService} from "../services/stripeService";
import {SubscriptionService} from "../services/subscriptionService";
import {
  SubscriptionPlan,
  SubscriptionTier,
} from "../types/subscription";
import {createError, ErrorCode} from "../utils/errors";
import {
  getStripePriceId,
  getAddonPriceId,
  isEligibleForPlan,
  PLAN_LIMITS,
} from "../config/stripeProducts";

export interface CreateCheckoutSessionParams {
  userId: string;
  userEmail: string;
  plan: SubscriptionPlan;
  tier?: SubscriptionTier;
  interval: "month" | "year";
  successUrl: string;
  cancelUrl: string;
  referralCode?: string;
  familyMemberIds?: string[];
  addons?: string[];
  couponCode?: string;
  allowPromotionCodes?: boolean;
}

export interface CustomerLookupResult {
  customerId: string;
  customer: Stripe.Customer;
  isNewCustomer: boolean;
}

export class CheckoutService {
  private db = getFirestore();
  private stripeService: StripeService;
  private subscriptionService: SubscriptionService;

  constructor() {
    this.stripeService = new StripeService();
    this.subscriptionService = new SubscriptionService();
  }

  /**
   * Create checkout session with enhanced customer and metadata management
   */
  async createCheckoutSession(params: CreateCheckoutSessionParams): Promise<Stripe.Checkout.Session> {
    try {
      // Validate plan configuration
      await this.validateCheckoutParams(params);

      // Get or create Stripe customer
      const customerResult = await this.getOrCreateCustomer(params.userId, params.userEmail);

      // Build line items for checkout
      const lineItems = await this.buildLineItems(params);

      // Prepare metadata
      const metadata = await this.buildMetadata(params);

      // Create checkout session
      const session = await this.stripeService.stripe!.checkout.sessions.create({
        customer: customerResult.customerId,
        payment_method_types: ["card"],
        line_items: lineItems,
        mode: "subscription",
        success_url: params.successUrl,
        cancel_url: params.cancelUrl,
        allow_promotion_codes: params.allowPromotionCodes || false,
        billing_address_collection: "required",
        tax_id_collection: {
          enabled: true,
        },
        customer_update: {
          address: "auto",
        },
        metadata,
        subscription_data: {
          metadata: {
            ...metadata,
            userId: params.userId,
            userEmail: params.userEmail,
            plan: params.plan,
            tier: params.tier || "",
            interval: params.interval,
          },
        },
        expires_at: Math.floor(Date.now() / 1000) + (24 * 60 * 60), // 24 hours
      });

      // Log checkout session creation
      await this.logCheckoutEvent(params.userId, session, "created");

      // Send checkout confirmation email
      await this.sendCheckoutConfirmationEmail(params.userEmail, session);

      logger.info("Checkout session created successfully", {
        sessionId: session.id,
        userId: params.userId,
        plan: params.plan,
        tier: params.tier,
        customerId: customerResult.customerId,
        isNewCustomer: customerResult.isNewCustomer,
      });

      return session;
    } catch (error) {
      logger.error("Failed to create checkout session", {
        userId: params.userId,
        plan: params.plan,
        error,
      });
      throw error;
    }
  }

  /**
   * Get or create Stripe customer with email synchronization
   */
  async getOrCreateCustomer(userId: string, userEmail: string): Promise<CustomerLookupResult> {
    try {
      // Check if user already has a Stripe customer ID
      const userDoc = await this.db.collection("users").doc(userId).get();
      const userData = userDoc.data();

      if (userData?.stripeCustomerId) {
        try {
          const customer = await this.stripeService.stripe!.customers.retrieve(
            userData.stripeCustomerId
          ) as Stripe.Customer;

          // Verify email matches and update if necessary
          if (customer.email !== userEmail) {
            await this.stripeService.stripe!.customers.update(userData.stripeCustomerId, {
              email: userEmail,
            });
            logger.info("Updated customer email in Stripe", {
              customerId: userData.stripeCustomerId,
              userId,
              oldEmail: customer.email,
              newEmail: userEmail,
            });
          }

          return {
            customerId: userData.stripeCustomerId,
            customer,
            isNewCustomer: false,
          };
        } catch (error) {
          logger.warn("Failed to retrieve existing customer, creating new one", {
            userId,
            stripeCustomerId: userData.stripeCustomerId,
            error,
          });
          // Fall through to create new customer
        }
      }

      // Create new customer
      const customer = await this.stripeService.stripe!.customers.create({
        email: userEmail,
        metadata: {
          userId,
          firebaseUid: userId,
          createdVia: "checkout",
          createdAt: new Date().toISOString(),
        },
      });

      // Update user document with Stripe customer ID
      await this.db.collection("users").doc(userId).update({
        stripeCustomerId: customer.id,
        updatedAt: Timestamp.now(),
      });

      logger.info("Created new Stripe customer", {
        customerId: customer.id,
        userId,
        userEmail,
      });

      return {
        customerId: customer.id,
        customer,
        isNewCustomer: true,
      };
    } catch (error) {
      logger.error("Failed to get or create customer", {userId, userEmail, error});
      throw createError(ErrorCode.CUSTOMER_CREATION_FAILED, "Failed to setup billing account");
    }
  }

  /**
   * Build line items for checkout session
   */
  private async buildLineItems(params: CreateCheckoutSessionParams): Promise<Stripe.Checkout.SessionCreateParams.LineItem[]> {
    const lineItems: Stripe.Checkout.SessionCreateParams.LineItem[] = [];

    // Main subscription line item
    const priceId = getStripePriceId(params.plan, params.tier, params.interval);
    if (!priceId) {
      throw createError(ErrorCode.INVALID_ARGUMENT, "Invalid plan configuration");
    }

    lineItems.push({
      price: priceId,
      quantity: 1,
    });

    // Add addon line items (only for Individual plans)
    if (params.addons && params.addons.length > 0) {
      if (params.plan !== SubscriptionPlan.INDIVIDUAL) {
        throw createError(ErrorCode.INVALID_ARGUMENT, "Addons are only available for Individual plans");
      }

      for (const addonType of params.addons) {
        try {
          const addonPriceId = getAddonPriceId(addonType as any);
          lineItems.push({
            price: addonPriceId,
            quantity: 1,
          });
        } catch (error) {
          logger.warn("Invalid addon type", {addonType, userId: params.userId});
          throw createError(ErrorCode.INVALID_ARGUMENT, `Invalid addon type: ${addonType}`);
        }
      }
    }

    return lineItems;
  }

  /**
   * Build metadata for checkout session
   */
  private async buildMetadata(params: CreateCheckoutSessionParams): Promise<Record<string, string>> {
    const metadata: Record<string, string> = {
      userId: params.userId,
      userEmail: params.userEmail,
      plan: params.plan,
      interval: params.interval,
      createdAt: new Date().toISOString(),
      source: "web",
    };

    if (params.tier) {
      metadata.tier = params.tier;
    }

    if (params.referralCode) {
      // Validate referral code
      const isValid = await this.validateReferralCode(params.referralCode, params.userId);
      if (isValid) {
        metadata.referralCode = params.referralCode;
      } else {
        logger.warn("Invalid referral code provided", {
          referralCode: params.referralCode,
          userId: params.userId,
        });
      }
    }

    if (params.familyMemberIds && params.familyMemberIds.length > 0) {
      if (params.plan !== SubscriptionPlan.FAMILY) {
        throw createError(ErrorCode.INVALID_ARGUMENT, "Family members can only be added to family plans");
      }
      metadata.familyMemberIds = JSON.stringify(params.familyMemberIds);
    }

    if (params.addons && params.addons.length > 0) {
      metadata.addons = JSON.stringify(params.addons);
    }

    return metadata;
  }

  /**
   * Validate checkout parameters
   */
  private async validateCheckoutParams(params: CreateCheckoutSessionParams): Promise<void> {
    // Validate plan eligibility
    if (!isEligibleForPlan(params.plan, params.tier)) {
      throw createError(ErrorCode.INVALID_ARGUMENT, "Invalid plan configuration");
    }

    // Validate family member count
    if (params.familyMemberIds && params.familyMemberIds.length > 0) {
      if (params.plan !== SubscriptionPlan.FAMILY) {
        throw createError(ErrorCode.INVALID_ARGUMENT, "Family members can only be added to family plans");
      }

      if (params.familyMemberIds.length >= PLAN_LIMITS.family.maxMembers) {
        throw createError(
          ErrorCode.FAMILY_MEMBER_LIMIT_EXCEEDED,
          `Family plan supports up to ${PLAN_LIMITS.family.maxMembers} members including the owner`
        );
      }

      // Validate each family member exists
      for (const memberId of params.familyMemberIds) {
        const memberDoc = await this.db.collection("users").doc(memberId).get();
        if (!memberDoc.exists) {
          throw createError(ErrorCode.NOT_FOUND, `Family member not found: ${memberId}`);
        }

        // Check if member is already in a family plan
        const existingSubscription = await this.subscriptionService.getUserSubscription(memberId);
        if (existingSubscription && existingSubscription.plan === SubscriptionPlan.FAMILY) {
          const memberData = memberDoc.data();
          throw createError(
            ErrorCode.FAMILY_MEMBER_ALREADY_IN_PLAN,
            `User ${memberData?.displayName || memberId} is already in a family plan`
          );
        }
      }
    }

    // Validate addons
    if (params.addons && params.addons.length > 0) {
      if (params.plan !== SubscriptionPlan.INDIVIDUAL) {
        throw createError(ErrorCode.INVALID_ARGUMENT, "Addons are only available for Individual plans");
      }

      // Check for duplicate addons
      const uniqueAddons = new Set(params.addons);
      if (uniqueAddons.size !== params.addons.length) {
        throw createError(ErrorCode.INVALID_ARGUMENT, "Duplicate addons are not allowed");
      }

      // Validate maximum addon count (example: max 3 addons)
      if (params.addons.length > 3) {
        throw createError(ErrorCode.ADDON_LIMIT_EXCEEDED, "Maximum 3 addons allowed per subscription");
      }
    }

    // Check if user already has an active subscription
    const existingSubscription = await this.subscriptionService.getUserSubscription(params.userId);
    if (existingSubscription && existingSubscription.status === "active") {
      throw createError(
        ErrorCode.SUBSCRIPTION_ALREADY_EXISTS,
        "User already has an active subscription. Use upgrade/downgrade instead."
      );
    }
  }

  /**
   * Validate referral code
   */
  private async validateReferralCode(referralCode: string, userId: string): Promise<boolean> {
    try {
      // Find referral by code
      const referralQuery = await this.db.collection("referrals")
        .where("referralCode", "==", referralCode)
        .where("status", "==", "pending")
        .limit(1)
        .get();

      if (referralQuery.empty) {
        return false;
      }

      const referralDoc = referralQuery.docs[0];
      const referralData = referralDoc.data();

      // Check if user is trying to use their own referral code
      if (referralData.referrerUserId === userId) {
        return false;
      }

      // Check if referral has expired
      if (referralData.expiresAt && referralData.expiresAt.toDate() < new Date()) {
        return false;
      }

      return true;
    } catch (error) {
      logger.error("Failed to validate referral code", {referralCode, userId, error});
      return false;
    }
  }

  /**
   * Log checkout event for audit trail
   */
  private async logCheckoutEvent(
    userId: string,
    session: Stripe.Checkout.Session,
    event: "created" | "completed" | "expired"
  ): Promise<void> {
    try {
      await this.db.collection("checkoutEvents").add({
        userId,
        sessionId: session.id,
        event,
        sessionData: {
          amount_total: session.amount_total,
          currency: session.currency,
          customer: session.customer,
          mode: session.mode,
          status: session.status,
        },
        timestamp: Timestamp.now(),
      });
    } catch (error) {
      logger.error("Failed to log checkout event", {userId, sessionId: session.id, event, error});
      // Don't throw - this is non-critical
    }
  }

  /**
   * Send checkout confirmation email
   */
  private async sendCheckoutConfirmationEmail(
    userEmail: string,
    session: Stripe.Checkout.Session
  ): Promise<void> {
    try {
      // This would integrate with your email service
      // For now, just log that we would send an email
      logger.info("Would send checkout confirmation email", {
        userEmail,
        sessionId: session.id,
        checkoutUrl: session.url,
      });

      // TODO: Implement email sending logic using your email service
      // await emailService.sendCheckoutConfirmation({
      //   to: userEmail,
      //   sessionId: session.id,
      //   checkoutUrl: session.url,
      // });
    } catch (error) {
      logger.error("Failed to send checkout confirmation email", {
        userEmail,
        sessionId: session.id,
        error,
      });
      // Don't throw - this is non-critical
    }
  }

  /**
   * Handle checkout session completion
   */
  async handleCheckoutCompleted(sessionId: string): Promise<void> {
    try {
      const session = await this.stripeService.stripe!.checkout.sessions.retrieve(sessionId, {
        expand: ["subscription", "customer"],
      });

      if (!session.subscription) {
        logger.warn("Checkout session completed without subscription", {sessionId});
        return;
      }

      const subscription = session.subscription as Stripe.Subscription;
      const metadata = session.metadata || {};

      // Create subscription in our database
      await this.subscriptionService.createSubscription({
        userId: metadata.userId,
        userEmail: metadata.userEmail,
        stripeSubscriptionId: subscription.id,
        stripeCustomerId: session.customer as string,
        plan: metadata.plan as SubscriptionPlan,
        tier: metadata.tier as SubscriptionTier,
        interval: metadata.interval as "month" | "year",
        status: this.stripeService.mapSubscriptionStatus(subscription.status),
        currentPeriodStart: new Date((subscription as any).current_period_start * 1000),
        currentPeriodEnd: new Date((subscription as any).current_period_end * 1000),
        trialEnd: subscription.trial_end ? new Date(subscription.trial_end * 1000) : undefined,
        referralCode: metadata.referralCode,
        familyMemberIds: metadata.familyMemberIds ? JSON.parse(metadata.familyMemberIds) : undefined,
        addons: metadata.addons ? JSON.parse(metadata.addons) : undefined,
      });

      // Log completion
      await this.logCheckoutEvent(metadata.userId, session, "completed");

      logger.info("Checkout session completed and subscription created", {
        sessionId,
        subscriptionId: subscription.id,
        userId: metadata.userId,
      });
    } catch (error) {
      logger.error("Failed to handle checkout completion", {sessionId, error});
      throw error;
    }
  }

  /**
   * Handle checkout session expiration
   */
  async handleCheckoutExpired(sessionId: string): Promise<void> {
    try {
      const session = await this.stripeService.stripe!.checkout.sessions.retrieve(sessionId);
      const metadata = session.metadata || {};

      if (metadata.userId) {
        await this.logCheckoutEvent(metadata.userId, session, "expired");
      }

      logger.info("Checkout session expired", {sessionId, userId: metadata.userId});
    } catch (error) {
      logger.error("Failed to handle checkout expiration", {sessionId, error});
      // Don't throw - this is non-critical
    }
  }
}
