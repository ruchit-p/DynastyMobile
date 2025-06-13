import {onCall, onRequest, HttpsError} from "firebase-functions/v2/https";
import {onSchedule} from "firebase-functions/v2/scheduler";
import {logger} from "firebase-functions/v2";
import {getFirestore} from "firebase-admin/firestore";
import {withAuth, RateLimitType} from "./middleware/auth";
import {StripeWebhookHandler} from "./webhooks/stripeWebhookHandler";
import {SubscriptionService} from "./services/subscriptionService";
import {StripeService} from "./services/stripeService";
import {StorageCalculationService} from "./services/storageCalculationService";
// Phase 2 services
import {CheckoutService} from "./subscriptions/checkout";
import {FamilyPlanService} from "./subscriptions/familyPlan";
import {AddonService} from "./subscriptions/addons";
// Phase 3 services
import {ReferralService} from "./services/referralService";
// Phase 4 services
import {SubscriptionValidationService} from "./services/subscriptionValidationService";
import {createError, ErrorCode} from "./utils/errors";
import {
  CreateCheckoutSessionSchema,
  UpdateSubscriptionSchema,
  AddFamilyMemberSchema,
  RemoveFamilyMemberSchema,
  CreateCustomerPortalSchema,
  // Phase 2 schemas
  EnhancedCreateCheckoutSessionSchema,
  AddFamilyMemberEnhancedSchema,
  RemoveFamilyMemberEnhancedSchema,
  PurchaseAddonSchema,
  RemoveAddonSchema,
  CheckAddonEligibilitySchema,
  GenerateStorageReportSchema,
  // Phase 3 schemas
  GenerateReferralCodeSchema,
  ValidateReferralCodeSchema,
  CreateReferralSchema,
  GetReferralStatsSchema,
  GetReferralInfoSchema,
} from "./config/stripeValidation";

// Re-export secrets for global options
export {
  STRIPE_SECRET_KEY,
  STRIPE_WEBHOOK_SECRET,
  STRIPE_PUBLISHABLE_KEY,
  STRIPE_API_VERSION,
} from "./config/stripeSecrets";

// Initialize services
const webhookHandler = new StripeWebhookHandler();
const subscriptionService = new SubscriptionService();
const stripeService = new StripeService();
const storageService = new StorageCalculationService();
// Phase 2 services
const checkoutService = new CheckoutService();
const familyPlanService = new FamilyPlanService();
const addonService = new AddonService();
// Phase 3 services
const referralService = new ReferralService();
// Phase 4 services
const validationService = new SubscriptionValidationService();

/**
 * Stripe webhook handler
 * This is a raw HTTP endpoint, not a callable function
 */
export const stripeWebhook = onRequest(
  {
    region: "us-central1",
    cors: false, // Stripe sends webhooks without CORS
    maxInstances: 10,
  },
  async (req, res) => {
    try {
      // Only accept POST requests
      if (req.method !== "POST") {
        res.status(405).send("Method Not Allowed");
        return;
      }

      // Process webhook
      const result = await webhookHandler.handleWebhook(req);

      if (result.success) {
        res.status(200).json({received: true});
      } else {
        logger.error("Webhook processing failed", result.error);
        res.status(500).json({
          error: "Webhook processing failed",
          message: result.message,
        });
      }
    } catch (error) {
      logger.error("Webhook endpoint error", {error});

      if (error instanceof HttpsError) {
        res.status(400).json({
          error: error.code,
          message: error.message,
        });
      } else {
        res.status(500).json({
          error: "internal",
          message: "Internal server error",
        });
      }
    }
  }
);

/**
 * Create checkout session for subscription
 */
export const createCheckoutSession = onCall(
  {
    region: "us-central1",
    maxInstances: 10,
  },
  withAuth(async (request) => {
    const uid = request.auth!.uid;
    const userEmail = request.auth!.token.email;
    const data = CreateCheckoutSessionSchema.parse(request.data);

    try {
      // Validate plan eligibility
      const eligibilityResult = await validationService.validatePlanEligibility(
        uid,
        data.plan as any,
        data.tier as any
      );

      if (!eligibilityResult.isValid) {
        throw createError(
          ErrorCode.FAILED_PRECONDITION,
          eligibilityResult.errors.join(", ")
        );
      }

      // Log warnings if any
      if (eligibilityResult.warnings && eligibilityResult.warnings.length > 0) {
        logger.warn("Plan eligibility warnings", {
          userId: uid,
          warnings: eligibilityResult.warnings,
        });
      }

      const session = await stripeService.createCheckoutSession({
        userId: uid,
        userEmail: userEmail || "",
        plan: data.plan as any,
        tier: data.tier as any,
        interval: data.interval,
        addons: data.addons,
        referralCode: data.referralCode,
        familyMemberIds: data.familyMemberIds,
        allowPromotionCodes: data.allowPromotionCodes,
      });

      logger.info("Checkout session created", {
        sessionId: session.id,
        userId: uid,
        plan: data.plan,
      });

      return {
        sessionId: session.id,
        url: session.url,
      };
    } catch (error) {
      logger.error("Failed to create checkout session", {error, uid: uid});
      throw error;
    }
  }, "createCheckoutSession", {
    authLevel: "auth",
    rateLimitConfig: {
      type: RateLimitType.STRIPE_CHECKOUT,
    },
  })
);

/**
 * Get user's subscription status
 */
export const getSubscriptionStatus = onCall(
  {
    region: "us-central1",
    maxInstances: 10,
  },
  withAuth(async (request) => {
    const uid = request.auth!.uid;

    try {
      const subscription = await subscriptionService.getUserSubscription(uid);
      const premiumAccess = await subscriptionService.checkPremiumAccess(uid);

      if (!subscription && !premiumAccess.hasAccess) {
        return {
          hasSubscription: false,
          hasAccess: false,
          plan: "free",
        };
      }

      if (premiumAccess.hasAccess && !premiumAccess.isOwner) {
        // User is part of a family plan
        return {
          hasSubscription: false,
          hasAccess: true,
          plan: premiumAccess.plan,
          isOwner: false,
          familyOwnerId: premiumAccess.familyOwnerId,
        };
      }

      if (!subscription) {
        return {
          hasSubscription: false,
          hasAccess: false,
          plan: "free",
        };
      }

      // Calculate storage usage
      const storageInfo = await storageService.calculateUserStorage(uid, subscription);

      return {
        hasSubscription: true,
        hasAccess: true,
        subscription: {
          id: subscription.id,
          plan: subscription.plan,
          tier: subscription.tier,
          status: subscription.status,
          interval: subscription.interval,
          currentPeriodEnd: subscription.currentPeriodEnd.toDate(),
          canceledAt: subscription.canceledAt?.toDate(),
          trialEnd: subscription.trialEnd?.toDate(),
          addons: subscription.addons,
          familyMembers: subscription.familyMembers?.filter((m) => m.status === "active"),
        },
        storage: {
          totalGB: storageInfo.totalGB,
          usedBytes: storageInfo.usedBytes,
          availableBytes: storageInfo.availableBytes,
          usagePercentage: storageInfo.usagePercentage,
          breakdown: {
            basePlanGB: storageInfo.basePlanGB,
            addonGB: storageInfo.addonGB,
            referralBonusGB: storageInfo.referralBonusGB,
          },
        },
        isOwner: true,
      };
    } catch (error) {
      logger.error("Failed to get subscription status", {error, uid});
      throw error;
    }
  }, "getSubscriptionStatus", {
    authLevel: "auth",
    rateLimitConfig: {
      type: RateLimitType.STRIPE_SUBSCRIPTION_READ,
    },
  })
);

/**
 * Update subscription (plan, addons, etc.)
 */
export const updateSubscription = onCall(
  {
    region: "us-central1",
    maxInstances: 10,
  },
  withAuth(async (request) => {
    const uid = request.auth!.uid;
    const data = UpdateSubscriptionSchema.parse(request.data);

    try {
      // Get user's subscription
      const subscription = await subscriptionService.getUserSubscription(uid);
      if (!subscription) {
        throw createError(ErrorCode.SUBSCRIPTION_NOT_FOUND, "No active subscription found");
      }

      // Verify ownership
      if (subscription.userId !== uid) {
        throw createError(ErrorCode.PERMISSION_DENIED, "Not authorized to update this subscription");
      }

      // Validate plan change if changing plan/tier
      if (data.plan && (data.plan !== subscription.plan || data.tier !== subscription.tier)) {
        const planChangeValidation = await validationService.validatePlanChange(
          subscription.id,
          data.plan as any,
          data.tier as any
        );

        if (!planChangeValidation.allowed) {
          throw createError(
            ErrorCode.PLAN_CHANGE_INVALID,
            planChangeValidation.reason || "Plan change not allowed"
          );
        }

        // Log any required actions
        if (planChangeValidation.requiresAction && planChangeValidation.requiresAction.length > 0) {
          logger.info("Plan change requires actions", {
            subscriptionId: subscription.id,
            actions: planChangeValidation.requiresAction,
          });
        }

        // Include cost estimate in response
        if (planChangeValidation.estimatedCost) {
          logger.info("Plan change cost estimate", {
            subscriptionId: subscription.id,
            cost: planChangeValidation.estimatedCost,
          });
        }
      }

      // Update in Stripe
      const updatedStripeSubscription = await stripeService.updateSubscription({
        subscriptionId: subscription.stripeSubscriptionId || "",
        plan: data.plan as any,
        tier: data.tier as any,
        addons: data.addons,
        cancelAtPeriodEnd: data.cancelAtPeriodEnd,
        prorationBehavior: data.prorationBehavior,
      });

      // Sync to our database
      const updatedSubscription = await subscriptionService.syncFromStripe(
        updatedStripeSubscription.id
      );

      logger.info("Subscription updated", {
        subscriptionId: subscription.id,
        uid,
        updates: data,
      });

      return {
        success: true,
        subscription: {
          id: updatedSubscription.id,
          plan: updatedSubscription.plan,
          tier: updatedSubscription.tier,
          status: updatedSubscription.status,
          currentPeriodEnd: updatedSubscription.currentPeriodEnd.toDate(),
        },
      };
    } catch (error) {
      logger.error("Failed to update subscription", {error, uid});
      throw error;
    }
  }, "updateSubscription", {
    authLevel: "verified",
    rateLimitConfig: {
      type: RateLimitType.STRIPE_SUBSCRIPTION_UPDATE,
    },
  })
);

/**
 * Cancel subscription
 */
export const cancelSubscription = onCall(
  {
    region: "us-central1",
    maxInstances: 10,
  },
  withAuth(async (request) => {
    const uid = request.auth!.uid;
    const {reason, cancelImmediately = false} = request.data;

    try {
      const subscription = await subscriptionService.getUserSubscription(uid);
      if (!subscription) {
        throw createError(ErrorCode.SUBSCRIPTION_NOT_FOUND, "No active subscription found");
      }

      if (subscription.userId !== uid) {
        throw createError(ErrorCode.PERMISSION_DENIED, "Not authorized to cancel this subscription");
      }

      const canceledSubscription = await subscriptionService.cancelSubscription(
        subscription.id,
        reason,
        cancelImmediately
      );

      logger.info("Subscription canceled", {
        subscriptionId: subscription.id,
        uid,
        cancelImmediately,
      });

      return {
        success: true,
        subscription: {
          id: canceledSubscription.id,
          status: canceledSubscription.status,
          canceledAt: canceledSubscription.canceledAt?.toDate(),
          currentPeriodEnd: canceledSubscription.currentPeriodEnd.toDate(),
        },
      };
    } catch (error) {
      logger.error("Failed to cancel subscription", {error, uid});
      throw error;
    }
  }, "cancelSubscription", {
    authLevel: "verified",
    rateLimitConfig: {
      type: RateLimitType.STRIPE_SUBSCRIPTION_UPDATE,
    },
  })
);

/**
 * Reactivate canceled subscription
 */
export const reactivateSubscription = onCall(
  {
    region: "us-central1",
    maxInstances: 10,
  },
  withAuth(async (request) => {
    const uid = request.auth!.uid;

    try {
      const subscription = await subscriptionService.getUserSubscription(uid);
      if (!subscription) {
        throw createError(ErrorCode.SUBSCRIPTION_NOT_FOUND, "No subscription found");
      }

      if (subscription.userId !== uid) {
        throw createError(ErrorCode.PERMISSION_DENIED, "Not authorized to reactivate this subscription");
      }

      if (!subscription.canceledAt) {
        throw createError(ErrorCode.INVALID_ARGUMENT, "Subscription is not canceled");
      }

      const reactivatedStripeSubscription = await stripeService.reactivateSubscription(
        subscription.stripeSubscriptionId || ""
      );

      const updatedSubscription = await subscriptionService.syncFromStripe(
        reactivatedStripeSubscription.id
      );

      logger.info("Subscription reactivated", {
        subscriptionId: subscription.id,
        uid,
      });

      return {
        success: true,
        subscription: {
          id: updatedSubscription.id,
          status: updatedSubscription.status,
          currentPeriodEnd: updatedSubscription.currentPeriodEnd.toDate(),
        },
      };
    } catch (error) {
      logger.error("Failed to reactivate subscription", {error, uid});
      throw error;
    }
  }, "reactivateSubscription", {
    authLevel: "verified",
    rateLimitConfig: {
      type: RateLimitType.STRIPE_SUBSCRIPTION_UPDATE,
    },
  })
);

/**
 * Add family member to subscription
 */
export const addFamilyMember = onCall(
  {
    region: "us-central1",
    maxInstances: 10,
  },
  withAuth(async (request) => {
    const uid = request.auth!.uid;
    const data = AddFamilyMemberSchema.parse(request.data);

    try {
      const subscription = await subscriptionService.getUserSubscription(uid);
      if (!subscription) {
        throw createError(ErrorCode.SUBSCRIPTION_NOT_FOUND, "No active subscription found");
      }

      if (subscription.userId !== uid) {
        throw createError(ErrorCode.PERMISSION_DENIED, "Not authorized to manage this subscription");
      }

      if (subscription.plan !== "family") {
        throw createError(ErrorCode.INVALID_ARGUMENT, "Not a family plan subscription");
      }

      // Validate family member addition
      const memberValidation = await validationService.validateFamilyMemberAddition(
        subscription.id,
        data.memberId,
        false // Default to false since AddFamilyMemberSchema doesn't include relationshipVerified
      );

      if (!memberValidation.isValid) {
        throw createError(
          ErrorCode.FAILED_PRECONDITION,
          memberValidation.errors.join(", ")
        );
      }

      // Log warnings if any
      if (memberValidation.warnings && memberValidation.warnings.length > 0) {
        logger.warn("Family member addition warnings", {
          subscriptionId: subscription.id,
          warnings: memberValidation.warnings,
        });
      }

      await subscriptionService.addFamilyMember({
        subscriptionId: subscription.id,
        memberId: data.memberId,
        memberEmail: data.memberEmail,
        memberName: data.memberName,
        invitedBy: uid,
      });

      logger.info("Family member added", {
        subscriptionId: subscription.id,
        memberId: data.memberId,
        invitedBy: uid,
      });

      return {
        success: true,
        message: "Family member added successfully",
      };
    } catch (error) {
      logger.error("Failed to add family member", {error, uid});
      throw error;
    }
  }, "addFamilyMember", {
    authLevel: "verified",
    rateLimitConfig: {
      type: RateLimitType.STRIPE_FAMILY_UPDATE,
    },
  })
);

/**
 * Remove family member from subscription
 */
export const removeFamilyMember = onCall(
  {
    region: "us-central1",
    maxInstances: 10,
  },
  withAuth(async (request) => {
    const uid = request.auth!.uid;
    const data = RemoveFamilyMemberSchema.parse(request.data);

    try {
      const subscription = await subscriptionService.getUserSubscription(uid);
      if (!subscription) {
        throw createError(ErrorCode.SUBSCRIPTION_NOT_FOUND, "No active subscription found");
      }

      if (subscription.userId !== uid) {
        throw createError(ErrorCode.PERMISSION_DENIED, "Not authorized to manage this subscription");
      }

      await subscriptionService.removeFamilyMember({
        subscriptionId: subscription.id,
        memberId: data.memberId,
        removedBy: uid,
        reason: data.reason,
      });

      logger.info("Family member removed", {
        subscriptionId: subscription.id,
        memberId: data.memberId,
        removedBy: uid,
      });

      return {
        success: true,
        message: "Family member removed successfully",
      };
    } catch (error) {
      logger.error("Failed to remove family member", {error, uid});
      throw error;
    }
  }, "removeFamilyMember", {
    authLevel: "verified",
    rateLimitConfig: {
      type: RateLimitType.STRIPE_FAMILY_UPDATE,
    },
  })
);

/**
 * Create customer portal session
 */
export const createCustomerPortalSession = onCall(
  {
    region: "us-central1",
    maxInstances: 10,
  },
  withAuth(async (request) => {
    const uid = request.auth!.uid;
    const {returnUrl} = CreateCustomerPortalSchema.parse(request.data);

    try {
      // Get user's Stripe customer ID
      const db = getFirestore();
      const userDoc = await db.collection("users").doc(uid).get();
      const stripeCustomerId = userDoc.data()?.stripeCustomerId;

      if (!stripeCustomerId) {
        throw createError(ErrorCode.NOT_FOUND, "No billing account found");
      }

      const session = await stripeService.createCustomerPortalSession(
        stripeCustomerId,
        returnUrl
      );

      logger.info("Customer portal session created", {
        uid,
        sessionId: session.id,
      });

      return {
        url: session.url,
      };
    } catch (error) {
      logger.error("Failed to create customer portal session", {error, uid});
      throw error;
    }
  }, "createCustomerPortalSession", {
    authLevel: "verified",
    rateLimitConfig: {
      type: RateLimitType.STRIPE_PORTAL,
    },
  })
);

/**
 * Get subscription history
 */
export const getSubscriptionHistory = onCall(
  {
    region: "us-central1",
    maxInstances: 10,
  },
  withAuth(async (request) => {
    const uid = request.auth!.uid;

    try {
      const history = await subscriptionService.getUserSubscriptionHistory(uid);

      return {
        subscriptions: history.map((sub) => ({
          id: sub.id,
          plan: sub.plan,
          tier: sub.tier,
          status: sub.status,
          interval: sub.interval,
          startDate: sub.createdAt.toDate(),
          endDate: sub.canceledAt?.toDate(),
          currentPeriodEnd: sub.currentPeriodEnd.toDate(),
        })),
      };
    } catch (error) {
      logger.error("Failed to get subscription history", {error, uid});
      throw error;
    }
  }, "getSubscriptionHistory", {
    authLevel: "auth",
    rateLimitConfig: {
      type: RateLimitType.STRIPE_SUBSCRIPTION_READ,
    },
  })
);

/**
 * Scheduled function to check for expired trials
 */
export const checkExpiredTrials = onSchedule(
  {
    schedule: "every day 09:00",
    timeZone: "America/Los_Angeles",
    region: "us-central1",
  },
  async () => {
    try {
      logger.info("Checking for expired trials");

      // This would query for subscriptions with expired trials
      // and update their status accordingly
      // Implementation depends on business requirements

      logger.info("Expired trials check completed");
    } catch (error) {
      logger.error("Failed to check expired trials", {error});
    }
  }
);

/**
 * Scheduled function to sync subscription statuses
 */
export const syncSubscriptionStatuses = onSchedule(
  {
    schedule: "every 6 hours",
    timeZone: "America/Los_Angeles",
    region: "us-central1",
  },
  async () => {
    try {
      logger.info("Syncing subscription statuses");

      // This would sync subscription statuses from Stripe
      // to ensure our database is up to date
      // Implementation depends on scale and requirements

      logger.info("Subscription sync completed");
    } catch (error) {
      logger.error("Failed to sync subscriptions", {error});
    }
  }
);

// ============================================================================
// PHASE 2: Enhanced Stripe Integration
// ============================================================================

/**
 * Enhanced checkout session creation (Phase 2.1)
 */
export const createEnhancedCheckoutSession = onCall(
  {
    region: "us-central1",
    maxInstances: 10,
  },
  withAuth(async (request) => {
    const uid = request.auth!.uid;
    const userEmail = request.auth!.token.email;
    const data = EnhancedCreateCheckoutSessionSchema.parse(request.data);

    try {
      // Validate plan eligibility
      const eligibilityResult = await validationService.validatePlanEligibility(
        uid,
        data.plan as any,
        data.tier as any
      );

      if (!eligibilityResult.isValid) {
        throw createError(
          ErrorCode.FAILED_PRECONDITION,
          eligibilityResult.errors.join(", ")
        );
      }

      // Validate family members if provided
      if (data.familyMemberIds && data.familyMemberIds.length > 0) {
        if (data.plan !== "family") {
          throw createError(
            ErrorCode.INVALID_ARGUMENT,
            "Family members can only be added to family plans"
          );
        }
      }

      // Validate addons if provided
      if (data.addons && data.addons.length > 0) {
        if (data.plan !== "individual" || data.tier !== "plus") {
          throw createError(
            ErrorCode.ADDON_INVALID,
            "Addons are only available for Individual Plus plans"
          );
        }
      }

      // Log warnings if any
      if (eligibilityResult.warnings && eligibilityResult.warnings.length > 0) {
        logger.warn("Enhanced checkout warnings", {
          userId: uid,
          warnings: eligibilityResult.warnings,
        });
      }

      const session = await checkoutService.createCheckoutSession({
        userId: uid,
        userEmail: userEmail || "",
        plan: data.plan as any,
        tier: data.tier as any,
        interval: data.interval,
        successUrl: data.successUrl,
        cancelUrl: data.cancelUrl,
        referralCode: data.referralCode,
        familyMemberIds: data.familyMemberIds,
        addons: data.addons,
        couponCode: data.couponCode,
        allowPromotionCodes: data.allowPromotionCodes,
      });

      logger.info("Enhanced checkout session created", {
        sessionId: session.id,
        userId: uid,
        plan: data.plan,
        tier: data.tier,
      });

      return {
        sessionId: session.id,
        url: session.url,
      };
    } catch (error) {
      logger.error("Failed to create enhanced checkout session", {error, uid});
      throw error;
    }
  }, "createEnhancedCheckoutSession", {
    authLevel: "auth",
    rateLimitConfig: {
      type: RateLimitType.STRIPE_CHECKOUT,
    },
  })
);

/**
 * Add family member with enhanced validation (Phase 2.2)
 */
export const addFamilyMemberEnhanced = onCall(
  {
    region: "us-central1",
    maxInstances: 10,
  },
  withAuth(async (request) => {
    const uid = request.auth!.uid;
    const data = AddFamilyMemberEnhancedSchema.parse(request.data);

    try {
      const invitation = await familyPlanService.addFamilyMember({
        subscriptionId: data.subscriptionId,
        memberId: data.memberId,
        memberEmail: data.memberEmail,
        memberName: data.memberName,
        familyOwnerId: uid,
        invitedBy: uid,
      });

      logger.info("Enhanced family member added", {
        subscriptionId: data.subscriptionId,
        memberId: data.memberId,
        invitationId: invitation.id,
        invitedBy: uid,
      });

      return {
        success: true,
        invitation,
      };
    } catch (error) {
      logger.error("Failed to add family member (enhanced)", {error, uid});
      throw error;
    }
  }, "addFamilyMemberEnhanced", {
    authLevel: "verified",
    rateLimitConfig: {
      type: RateLimitType.STRIPE_FAMILY_UPDATE,
    },
  })
);

/**
 * Remove family member with enhanced tracking (Phase 2.2)
 */
export const removeFamilyMemberEnhanced = onCall(
  {
    region: "us-central1",
    maxInstances: 10,
  },
  withAuth(async (request) => {
    const uid = request.auth!.uid;
    const data = RemoveFamilyMemberEnhancedSchema.parse(request.data);

    try {
      await familyPlanService.removeFamilyMember({
        subscriptionId: data.subscriptionId,
        memberId: data.memberId,
        reason: data.reason,
        notifyMember: data.notifyMember,
        familyOwnerId: uid,
        removedBy: uid,
      });

      logger.info("Enhanced family member removed", {
        subscriptionId: data.subscriptionId,
        memberId: data.memberId,
        reason: data.reason,
        removedBy: uid,
      });

      return {
        success: true,
        message: "Family member removed successfully",
      };
    } catch (error) {
      logger.error("Failed to remove family member (enhanced)", {error, uid});
      throw error;
    }
  }, "removeFamilyMemberEnhanced", {
    authLevel: "verified",
    rateLimitConfig: {
      type: RateLimitType.STRIPE_FAMILY_UPDATE,
    },
  })
);

/**
 * Purchase storage addon (Phase 2.3)
 */
export const purchaseAddon = onCall(
  {
    region: "us-central1",
    maxInstances: 10,
  },
  withAuth(async (request) => {
    const uid = request.auth!.uid;
    const data = PurchaseAddonSchema.parse(request.data);

    try {
      // Validate addon purchase
      const addonValidation = await validationService.validateAddonPurchase(
        data.subscriptionId,
        data.addonType as any
      );

      if (!addonValidation.isValid) {
        throw createError(
          ErrorCode.ADDON_INVALID,
          addonValidation.errors.join(", ")
        );
      }

      // Log warnings if any
      if (addonValidation.warnings && addonValidation.warnings.length > 0) {
        logger.warn("Addon purchase warnings", {
          subscriptionId: data.subscriptionId,
          warnings: addonValidation.warnings,
        });
      }

      const addon = await addonService.purchaseAddon({
        subscriptionId: data.subscriptionId,
        userId: uid,
        addonType: data.addonType as any,
        prorationBehavior: data.prorationBehavior as any,
        effectiveDate: data.effectiveDate as any,
      });

      logger.info("Addon purchased", {
        subscriptionId: data.subscriptionId,
        userId: uid,
        addonType: data.addonType,
        addonId: addon.id,
      });

      return {
        success: true,
        addon,
      };
    } catch (error) {
      logger.error("Failed to purchase addon", {error, uid});
      throw error;
    }
  }, "purchaseAddon", {
    authLevel: "verified",
    rateLimitConfig: {
      type: RateLimitType.STRIPE_ADDON_MANAGE,
    },
  })
);

/**
 * Remove storage addon (Phase 2.3)
 */
export const removeAddon = onCall(
  {
    region: "us-central1",
    maxInstances: 10,
  },
  withAuth(async (request) => {
    const uid = request.auth!.uid;
    const data = RemoveAddonSchema.parse(request.data);

    try {
      await addonService.removeAddon({
        subscriptionId: data.subscriptionId,
        userId: uid,
        addonId: data.addonId,
        prorationBehavior: data.prorationBehavior as any,
        effectiveDate: data.effectiveDate as any,
        reason: data.reason,
      });

      logger.info("Addon removed", {
        subscriptionId: data.subscriptionId,
        userId: uid,
        addonId: data.addonId,
        reason: data.reason,
      });

      return {
        success: true,
        message: "Addon removed successfully",
      };
    } catch (error) {
      logger.error("Failed to remove addon", {error, uid});
      throw error;
    }
  }, "removeAddon", {
    authLevel: "verified",
    rateLimitConfig: {
      type: RateLimitType.STRIPE_ADDON_MANAGE,
    },
  })
);

/**
 * Check addon eligibility (Phase 2.3)
 */
export const checkAddonEligibility = onCall(
  {
    region: "us-central1",
    maxInstances: 10,
  },
  withAuth(async (request) => {
    const uid = request.auth!.uid;
    const data = CheckAddonEligibilitySchema.parse(request.data);

    try {
      const eligibility = await addonService.checkAddonEligibility(
        data.subscriptionId,
        data.addonType as any
      );

      logger.info("Addon eligibility checked", {
        subscriptionId: data.subscriptionId,
        userId: uid,
        addonType: data.addonType,
        isEligible: eligibility.isEligible,
      });

      return eligibility;
    } catch (error) {
      logger.error("Failed to check addon eligibility", {error, uid});
      throw error;
    }
  }, "checkAddonEligibility", {
    authLevel: "auth",
    rateLimitConfig: {
      type: RateLimitType.STRIPE_SUBSCRIPTION_READ,
    },
  })
);

/**
 * Generate addon usage report (Phase 2.3)
 */
export const generateAddonUsageReport = onCall(
  {
    region: "us-central1",
    maxInstances: 10,
  },
  withAuth(async (request) => {
    const uid = request.auth!.uid;
    const data = GenerateStorageReportSchema.parse(request.data);

    try {
      const report = await addonService.generateAddonUsageReport(data.subscriptionId);

      // Verify ownership
      if (report.userId !== uid) {
        throw createError(ErrorCode.PERMISSION_DENIED, "Not authorized to access this report");
      }

      logger.info("Addon usage report generated", {
        subscriptionId: data.subscriptionId,
        userId: uid,
        totalAddonCost: report.totalMonthlyAddonCost,
        recommendationCount: report.recommendations.length,
      });

      return report;
    } catch (error) {
      logger.error("Failed to generate addon usage report", {error, uid});
      throw error;
    }
  }, "generateAddonUsageReport", {
    authLevel: "verified",
    rateLimitConfig: {
      type: RateLimitType.STRIPE_SUBSCRIPTION_READ,
    },
  })
);

/**
 * Get available addons for subscription (Phase 2.3)
 */
export const getAvailableAddons = onCall(
  {
    region: "us-central1",
    maxInstances: 10,
  },
  withAuth(async (request) => {
    const uid = request.auth!.uid;
    const {subscriptionId} = request.data;

    try {
      // Verify subscription ownership first
      const subscription = await subscriptionService.getUserSubscription(uid);
      if (!subscription || subscription.id !== subscriptionId) {
        throw createError(ErrorCode.PERMISSION_DENIED, "Not authorized to access this subscription");
      }

      const availableAddons = await addonService.getAvailableAddons(subscriptionId);

      logger.info("Available addons retrieved", {
        subscriptionId,
        userId: uid,
        availableCount: availableAddons.filter((a) => a.isEligible).length,
      });

      return {
        addons: availableAddons,
      };
    } catch (error) {
      logger.error("Failed to get available addons", {error, uid});
      throw error;
    }
  }, "getAvailableAddons", {
    authLevel: "auth",
    rateLimitConfig: {
      type: RateLimitType.STRIPE_SUBSCRIPTION_READ,
    },
  })
);

/**
 * Get family plan shared storage report (Phase 2.2)
 */
export const getFamilyStorageReport = onCall(
  {
    region: "us-central1",
    maxInstances: 10,
  },
  withAuth(async (request) => {
    const uid = request.auth!.uid;
    const {subscriptionId} = request.data;

    try {
      // Verify subscription ownership first
      const subscription = await subscriptionService.getUserSubscription(uid);
      if (!subscription || subscription.id !== subscriptionId) {
        throw createError(ErrorCode.PERMISSION_DENIED, "Not authorized to access this subscription");
      }

      const report = await familyPlanService.generateFamilyStorageReport(subscriptionId);

      logger.info("Family storage report generated", {
        subscriptionId,
        userId: uid,
        memberCount: report.memberUsage.length,
        totalUsageGB: report.usedStorageGB,
      });

      return report;
    } catch (error) {
      logger.error("Failed to generate family storage report", {error, uid});
      throw error;
    }
  }, "getFamilyStorageReport", {
    authLevel: "verified",
    rateLimitConfig: {
      type: RateLimitType.STRIPE_SUBSCRIPTION_READ,
    },
  })
);

// ============================================================================
// PHASE 3: Referral System Implementation
// ============================================================================

/**
 * Generate referral code for user (Phase 3.1)
 */
export const generateReferralCode = onCall(
  {
    region: "us-central1",
    maxInstances: 10,
  },
  withAuth(async (request) => {
    const uid = request.auth!.uid;
    GenerateReferralCodeSchema.parse(request.data);

    try {
      const referralCode = await referralService.generateReferralCode(uid);

      logger.info("Referral code generated", {
        userId: uid,
        referralCode,
      });

      return {
        referralCode,
      };
    } catch (error) {
      logger.error("Failed to generate referral code", {error, uid});
      throw error;
    }
  }, "generateReferralCode", {
    authLevel: "auth",
    rateLimitConfig: {
      type: RateLimitType.STRIPE_SUBSCRIPTION_READ,
    },
  })
);

/**
 * Validate referral code (Phase 3.1)
 */
export const validateReferralCode = onCall(
  {
    region: "us-central1",
    maxInstances: 10,
  },
  withAuth(async (request) => {
    const uid = request.auth!.uid;
    const data = ValidateReferralCodeSchema.parse(request.data);

    try {
      const validation = await referralService.validateReferralCode(
        data.referralCode,
        uid
      );

      logger.info("Referral code validated", {
        userId: uid,
        referralCode: data.referralCode,
        isValid: validation.isValid,
      });

      return validation;
    } catch (error) {
      logger.error("Failed to validate referral code", {error, uid});
      throw error;
    }
  }, "validateReferralCode", {
    authLevel: "auth",
    rateLimitConfig: {
      type: RateLimitType.STRIPE_SUBSCRIPTION_READ,
    },
  })
);

/**
 * Create referral when user signs up with referral code (Phase 3.1)
 */
export const createReferral = onCall(
  {
    region: "us-central1",
    maxInstances: 10,
  },
  withAuth(async (request) => {
    const uid = request.auth!.uid;
    const data = CreateReferralSchema.parse(request.data);

    try {
      // Find referrer user ID from referral code
      const db = getFirestore();
      const referrerQuery = await db.collection("users")
        .where("referralCode", "==", data.referralCode)
        .limit(1)
        .get();

      if (referrerQuery.empty) {
        throw createError(ErrorCode.REFERRAL_INVALID, "Invalid referral code");
      }

      const referrerUserId = referrerQuery.docs[0].id;

      const referral = await referralService.createReferral({
        referrerUserId,
        referredUserId: uid,
        referralCode: data.referralCode,
        metadata: data.metadata,
      });

      logger.info("Referral created", {
        referralId: referral.id,
        referrerUserId,
        referredUserId: uid,
      });

      return {
        success: true,
        referral,
      };
    } catch (error) {
      logger.error("Failed to create referral", {error, uid});
      throw error;
    }
  }, "createReferral", {
    authLevel: "auth",
    rateLimitConfig: {
      type: RateLimitType.STRIPE_SUBSCRIPTION_READ,
    },
  })
);

/**
 * Complete referral when user becomes paying customer (Phase 3.2)
 */
export const completeReferral = onCall(
  {
    region: "us-central1",
    maxInstances: 10,
  },
  withAuth(async (request) => {
    const uid = request.auth!.uid;

    try {
      await referralService.completeReferral(uid);

      logger.info("Referral completed", {
        referredUserId: uid,
      });

      return {
        success: true,
        message: "Referral completed successfully",
      };
    } catch (error) {
      logger.error("Failed to complete referral", {error, uid});
      throw error;
    }
  }, "completeReferral", {
    authLevel: "verified",
    rateLimitConfig: {
      type: RateLimitType.STRIPE_SUBSCRIPTION_UPDATE,
    },
  })
);

/**
 * Get referral statistics for user (Phase 3.1)
 */
export const getReferralStats = onCall(
  {
    region: "us-central1",
    maxInstances: 10,
  },
  withAuth(async (request) => {
    const uid = request.auth!.uid;
    GetReferralStatsSchema.parse(request.data);

    try {
      const stats = await referralService.getReferralStats(uid);

      logger.info("Referral stats retrieved", {
        userId: uid,
        totalReferrals: stats.totalReferrals,
        completedReferrals: stats.completedReferrals,
      });

      return stats;
    } catch (error) {
      logger.error("Failed to get referral stats", {error, uid});
      throw error;
    }
  }, "getReferralStats", {
    authLevel: "auth",
    rateLimitConfig: {
      type: RateLimitType.STRIPE_SUBSCRIPTION_READ,
    },
  })
);

/**
 * Get referral information for user (Phase 3.1)
 */
export const getReferralInfo = onCall(
  {
    region: "us-central1",
    maxInstances: 10,
  },
  withAuth(async (request) => {
    const uid = request.auth!.uid;
    GetReferralInfoSchema.parse(request.data);

    try {
      const referralInfo = await referralService.getReferralInfo(uid);

      logger.info("Referral info retrieved", {
        userId: uid,
        hasReferralCode: !!referralInfo?.referralCode,
        totalReferrals: referralInfo?.totalReferrals || 0,
      });

      return {
        referralInfo,
      };
    } catch (error) {
      logger.error("Failed to get referral info", {error, uid});
      throw error;
    }
  }, "getReferralInfo", {
    authLevel: "auth",
    rateLimitConfig: {
      type: RateLimitType.STRIPE_SUBSCRIPTION_READ,
    },
  })
);

/**
 * Scheduled function to cleanup expired referrals
 */
export const cleanupExpiredReferrals = onSchedule(
  {
    schedule: "every day 03:00",
    timeZone: "America/Los_Angeles",
    region: "us-central1",
  },
  async () => {
    try {
      logger.info("Starting cleanup of expired referrals");

      const cleanedCount = await referralService.cleanupExpiredReferrals();

      logger.info("Expired referrals cleanup completed", {
        cleanedCount,
      });
    } catch (error) {
      logger.error("Failed to cleanup expired referrals", {error});
    }
  }
);
