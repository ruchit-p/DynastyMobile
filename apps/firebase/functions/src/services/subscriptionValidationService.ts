import {getFirestore} from "firebase-admin/firestore";
import {logger} from "firebase-functions/v2";
import {SubscriptionService} from "./subscriptionService";
import {StorageCalculationService} from "./storageCalculationService";
import {
  SubscriptionPlan,
  SubscriptionTier,
  SubscriptionStatus,
  Subscription,
} from "../types/subscription";
import {ErrorCode, createError} from "../utils/errors";
import {
  STORAGE_LIMITS,
  ADDON_RULES,
  PLAN_CHANGE_RULES,
} from "../config/subscriptionValidationSchemas";
import {
  getStorageAllocation,
  isAddonEligible,
  PLAN_LIMITS,
  ADDON_STORAGE,
} from "../config/stripeProducts";

export interface ValidationResult {
  isValid: boolean;
  errors: string[];
  warnings?: string[];
}

export interface PlanChangeValidation {
  allowed: boolean;
  reason?: string;
  requiresAction?: string[];
  estimatedCost?: {
    immediateCharge?: number;
    nextBillingAmount?: number;
    credit?: number;
  };
}

export class SubscriptionValidationService {
  private db = getFirestore();
  private subscriptionService: SubscriptionService;
  private storageService: StorageCalculationService;

  constructor() {
    this.subscriptionService = new SubscriptionService();
    this.storageService = new StorageCalculationService();
  }

  /**
   * Validate plan eligibility for a user
   */
  async validatePlanEligibility(
    userId: string,
    plan: SubscriptionPlan,
    tier?: SubscriptionTier
  ): Promise<ValidationResult> {
    const errors: string[] = [];
    const warnings: string[] = [];

    try {
      // Check if user already has a subscription
      const existingSubscription = await this.subscriptionService.getUserSubscription(userId);

      if (existingSubscription && existingSubscription.status === SubscriptionStatus.ACTIVE) {
        errors.push("User already has an active subscription. Use plan change instead.");
        return {isValid: false, errors};
      }

      // Validate plan/tier combination
      if (plan === SubscriptionPlan.INDIVIDUAL) {
        if (!tier || tier !== SubscriptionTier.PLUS) {
          errors.push("Individual plan requires 'plus' tier");
        }
      } else if (plan === SubscriptionPlan.FAMILY) {
        if (!tier || !["family_2_5tb", "family_7_5tb", "family_12tb"].includes(tier)) {
          errors.push("Family plan requires valid tier selection");
        }
      }

      // Check for any outstanding payments
      const hasOutstandingPayments = await this.checkOutstandingPayments(userId);
      if (hasOutstandingPayments) {
        errors.push("Outstanding payments must be resolved before subscribing");
      }

      // Check if user has been suspended recently
      const recentSuspension = await this.checkRecentSuspension(userId);
      if (recentSuspension) {
        warnings.push("Account was recently suspended. Additional verification may be required.");
      }

      return {
        isValid: errors.length === 0,
        errors,
        warnings,
      };
    } catch (error) {
      logger.error("Failed to validate plan eligibility", {userId, plan, tier, error});
      throw error;
    }
  }

  /**
   * Validate plan change request
   */
  async validatePlanChange(
    subscriptionId: string,
    newPlan: SubscriptionPlan,
    newTier?: SubscriptionTier
  ): Promise<PlanChangeValidation> {
    try {
      const subscription = await this.subscriptionService.getSubscription(subscriptionId);
      if (!subscription) {
        throw createError(ErrorCode.SUBSCRIPTION_NOT_FOUND, "Subscription not found");
      }

      // Check if plan change is allowed
      const currentPlan = subscription.plan;
      const currentTier = subscription.tier;

      // Free plan validation
      if (newPlan === SubscriptionPlan.FREE) {
        return {
          allowed: false,
          reason: "Cannot downgrade to free plan. Please cancel subscription instead.",
        };
      }

      // Check upgrade/downgrade paths
      const upgradePaths = PLAN_CHANGE_RULES.upgradePaths[currentPlan] || [];
      const downgradePaths = PLAN_CHANGE_RULES.downgradePaths[currentPlan] || [];
      const isUpgrade = upgradePaths.includes(newPlan);
      const isDowngrade = downgradePaths.includes(newPlan);
      const isTierChange = currentPlan === newPlan && currentTier !== newTier;

      if (!isUpgrade && !isDowngrade && !isTierChange) {
        return {
          allowed: false,
          reason: "Invalid plan change path",
        };
      }

      // Validate tier changes
      if (isTierChange && currentPlan === SubscriptionPlan.FAMILY && currentTier && newTier) {
        const allowedTierChanges = PLAN_CHANGE_RULES.tierChanges.family[currentTier as keyof typeof PLAN_CHANGE_RULES.tierChanges.family] || [];
        if (!allowedTierChanges.includes(newTier)) {
          return {
            allowed: false,
            reason: "Invalid tier change for family plan",
          };
        }
      }

      // Check restrictions
      const requiredActions: string[] = [];

      // Family member restriction
      if (currentPlan === SubscriptionPlan.FAMILY && subscription.familyMembers) {
        const activeMembers = subscription.familyMembers.filter((m) => m.status === "active");
        if (activeMembers.length > 0 && newPlan === SubscriptionPlan.INDIVIDUAL) {
          return {
            allowed: false,
            reason: PLAN_CHANGE_RULES.restrictions.familyMemberRestriction,
            requiresAction: ["Remove all family members before downgrading"],
          };
        }
      }

      // Annual plan restriction
      if (subscription.interval === "year" && !this.isNearRenewal(subscription)) {
        requiredActions.push("Annual plan changes take effect at next renewal");
      }

      // Outstanding balance restriction
      const hasOutstandingBalance = await this.checkOutstandingPayments(subscription.userId);
      if (hasOutstandingBalance) {
        return {
          allowed: false,
          reason: PLAN_CHANGE_RULES.restrictions.outstandingBalanceRestriction,
        };
      }

      // Storage validation for downgrades
      if (isDowngrade || (isTierChange && this.isStorageDowngrade(currentPlan, currentTier, newPlan, newTier))) {
        const storageValidation = await this.validateStorageForPlanChange(
          subscription,
          newPlan,
          newTier
        );
        if (!storageValidation.allowed) {
          return storageValidation;
        }
      }

      // Calculate cost implications
      const costEstimate = await this.calculatePlanChangeCost(
        subscription,
        newPlan,
        newTier
      );

      return {
        allowed: true,
        requiresAction: requiredActions.length > 0 ? requiredActions : undefined,
        estimatedCost: costEstimate,
      };
    } catch (error) {
      logger.error("Failed to validate plan change", {subscriptionId, newPlan, newTier, error});
      throw error;
    }
  }

  /**
   * Validate family member addition
   */
  async validateFamilyMemberAddition(
    subscriptionId: string,
    memberId: string,
    relationshipVerified: boolean
  ): Promise<ValidationResult> {
    const errors: string[] = [];
    const warnings: string[] = [];

    try {
      const subscription = await this.subscriptionService.getSubscription(subscriptionId);
      if (!subscription) {
        errors.push("Subscription not found");
        return {isValid: false, errors};
      }

      // Check if subscription is family plan
      if (subscription.plan !== SubscriptionPlan.FAMILY) {
        errors.push("Only family plans can add family members");
        return {isValid: false, errors};
      }

      // Check member limit
      const currentMembers = subscription.familyMembers?.filter((m) => m.status === "active") || [];
      if (currentMembers.length >= PLAN_LIMITS.family.maxMembers - 1) { // -1 for owner
        errors.push(`Family plan limited to ${PLAN_LIMITS.family.maxMembers} members including owner`);
      }

      // Check if member already exists
      if (currentMembers.some((m) => m.userId === memberId)) {
        errors.push("Member is already part of this family plan");
      }

      // Check if member has their own subscription
      const memberSubscription = await this.subscriptionService.getUserSubscription(memberId);
      if (memberSubscription && memberSubscription.status === SubscriptionStatus.ACTIVE) {
        errors.push("Member already has an active subscription");
      }

      // Check if member is in another family plan
      const memberData = await this.db.collection("users").doc(memberId).get();
      if (memberData.exists && memberData.data()?.familyPlanOwnerId) {
        errors.push("Member is already part of another family plan");
      }

      // Validate family relationship
      if (!relationshipVerified) {
        warnings.push("Family relationship should be verified for security");
      }

      return {
        isValid: errors.length === 0,
        errors,
        warnings,
      };
    } catch (error) {
      logger.error("Failed to validate family member addition", {
        subscriptionId,
        memberId,
        error,
      });
      throw error;
    }
  }

  /**
   * Validate addon purchase
   */
  async validateAddonPurchase(
    subscriptionId: string,
    addonType: keyof typeof ADDON_STORAGE
  ): Promise<ValidationResult> {
    const errors: string[] = [];
    const warnings: string[] = [];

    try {
      const subscription = await this.subscriptionService.getSubscription(subscriptionId);
      if (!subscription) {
        errors.push("Subscription not found");
        return {isValid: false, errors};
      }

      // Check addon eligibility
      if (!isAddonEligible(subscription.plan, subscription.tier, addonType)) {
        errors.push("Addons are only available for Individual Plus plans");
      }

      // Check if addon already exists
      const existingAddons = subscription.addons || [];
      if (existingAddons.some((a) => a.type === addonType && a.status === "active")) {
        errors.push("This addon is already active on your subscription");
      }

      // Check addon limit
      const activeAddons = existingAddons.filter((a) => a.status === "active");
      if (activeAddons.length >= ADDON_RULES.maxAddonsPerSubscription) {
        errors.push(`Maximum ${ADDON_RULES.maxAddonsPerSubscription} addons allowed per subscription`);
      }

      // Validate addon combinations
      const newAddonList = [...activeAddons.map((a) => a.type), addonType];
      if (!this.isValidAddonCombination(newAddonList)) {
        errors.push("This addon combination is not allowed");
        warnings.push("storage_20tb cannot be combined with other storage addons");
      }

      return {
        isValid: errors.length === 0,
        errors,
        warnings,
      };
    } catch (error) {
      logger.error("Failed to validate addon purchase", {
        subscriptionId,
        addonType,
        error,
      });
      throw error;
    }
  }

  /**
   * Validate storage allocation
   */
  async validateStorageAllocation(
    userId: string,
    uploadSizeBytes: number,
    fileType?: string
  ): Promise<ValidationResult> {
    const errors: string[] = [];
    const warnings: string[] = [];

    try {
      // Get user's subscription and storage info
      const subscription = await this.subscriptionService.getUserSubscription(userId);
      const storageCalc = await this.storageService.calculateUserStorage(userId, subscription || undefined);

      // Check if upload would exceed limit
      const validation = await this.storageService.validateStorageLimit(
        userId,
        uploadSizeBytes,
        subscription || undefined
      );

      if (!validation.allowed) {
        errors.push(validation.reason || "Storage limit would be exceeded");
      }

      // Check file size limits based on plan
      const limits = this.getStorageLimitsForPlan(
        subscription?.plan || SubscriptionPlan.FREE,
        subscription?.tier
      );

      if (uploadSizeBytes > limits.maxFileSize) {
        errors.push("File size exceeds maximum allowed size for your plan");
      }

      // Type-specific validation
      if (fileType) {
        if (fileType.startsWith("image/") && uploadSizeBytes > limits.maxPhotoSize) {
          errors.push("Photo size exceeds maximum allowed size for your plan");
        }
      }

      // Warnings
      const usagePercentage = (storageCalc.usedBytes / (storageCalc.totalGB * 1024 * 1024 * 1024)) * 100;
      if (usagePercentage > 80) {
        warnings.push(`Storage usage is at ${usagePercentage.toFixed(1)}%. Consider upgrading your plan.`);
      }

      return {
        isValid: errors.length === 0,
        errors,
        warnings,
      };
    } catch (error) {
      logger.error("Failed to validate storage allocation", {
        userId,
        uploadSizeBytes,
        error,
      });
      throw error;
    }
  }

  /**
   * Validate quota enforcement
   */
  async validateQuotaEnforcement(
    userId: string,
    operation: "upload" | "download" | "share",
    metadata?: Record<string, any>
  ): Promise<ValidationResult> {
    const errors: string[] = [];
    const warnings: string[] = [];

    try {
      const subscription = await this.subscriptionService.getUserSubscription(userId);
      const plan = subscription?.plan || SubscriptionPlan.FREE;

      // Free plan restrictions
      if (plan === SubscriptionPlan.FREE) {
        switch (operation) {
        case "upload":
          errors.push("Free plan does not include storage. Please upgrade to upload files.");
          break;
        case "share":
          if (metadata?.shareType === "public") {
            errors.push("Public sharing is not available on free plan");
          }
          break;
        }
      }

      // Check if subscription is active
      if (subscription && subscription.status !== SubscriptionStatus.ACTIVE) {
        if (subscription.status === SubscriptionStatus.PAST_DUE) {
          warnings.push("Subscription is past due. Some features may be limited.");
        } else if (subscription.status === SubscriptionStatus.SUSPENDED) {
          errors.push("Subscription is suspended. Please update payment method.");
        }
      }

      return {
        isValid: errors.length === 0,
        errors,
        warnings,
      };
    } catch (error) {
      logger.error("Failed to validate quota enforcement", {
        userId,
        operation,
        error,
      });
      throw error;
    }
  }

  /**
   * Helper: Check outstanding payments
   */
  private async checkOutstandingPayments(userId: string): Promise<boolean> {
    const paymentFailures = await this.db
      .collection("paymentFailures")
      .where("userId", "==", userId)
      .where("resolved", "==", false)
      .limit(1)
      .get();

    return !paymentFailures.empty;
  }

  /**
   * Helper: Check recent suspension
   */
  private async checkRecentSuspension(userId: string): Promise<boolean> {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const history = await this.db
      .collection("subscriptionHistory")
      .where("userId", "==", userId)
      .where("action", "==", "suspended")
      .where("performedAt", ">", thirtyDaysAgo)
      .limit(1)
      .get();

    return !history.empty;
  }

  /**
   * Helper: Check if near renewal
   */
  private isNearRenewal(subscription: Subscription): boolean {
    const daysUntilRenewal = Math.floor(
      (subscription.currentPeriodEnd.toDate().getTime() - Date.now()) / (1000 * 60 * 60 * 24)
    );
    return daysUntilRenewal <= 7;
  }

  /**
   * Helper: Check if storage downgrade
   */
  private isStorageDowngrade(
    currentPlan: SubscriptionPlan,
    currentTier: SubscriptionTier | undefined,
    newPlan: SubscriptionPlan,
    newTier: SubscriptionTier | undefined
  ): boolean {
    const currentStorage = getStorageAllocation(currentPlan, currentTier);
    const newStorage = getStorageAllocation(newPlan, newTier);
    return newStorage < currentStorage;
  }

  /**
   * Helper: Validate storage for plan change
   */
  private async validateStorageForPlanChange(
    subscription: Subscription,
    newPlan: SubscriptionPlan,
    newTier?: SubscriptionTier
  ): Promise<PlanChangeValidation> {
    const currentUsage = await this.storageService.calculateUserStorage(
      subscription.userId,
      subscription
    );
    const newStorage = getStorageAllocation(newPlan, newTier);
    const newStorageBytes = newStorage * 1024 * 1024 * 1024;

    if (currentUsage.usedBytes > newStorageBytes) {
      const excessGB = (currentUsage.usedBytes - newStorageBytes) / (1024 * 1024 * 1024);
      return {
        allowed: false,
        reason: `Current storage usage (${(currentUsage.usedBytes / (1024 * 1024 * 1024)).toFixed(2)}GB) exceeds new plan limit (${newStorage}GB)`,
        requiresAction: [`Remove at least ${excessGB.toFixed(2)}GB of data before downgrading`],
      };
    }

    return {allowed: true};
  }

  /**
   * Helper: Calculate plan change cost
   */
  private async calculatePlanChangeCost(
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _subscription: Subscription,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _newPlan: SubscriptionPlan,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _newTier?: SubscriptionTier
  ): Promise<PlanChangeValidation["estimatedCost"]> {
    // TODO: Implement cost calculation logic
    // This would integrate with Stripe to calculate prorations
    return {
      immediateCharge: 0,
      nextBillingAmount: 0,
      credit: 0,
    };
  }

  /**
   * Helper: Get storage limits for plan
   */
  private getStorageLimitsForPlan(
    plan: SubscriptionPlan,
    tier?: SubscriptionTier
  ): typeof STORAGE_LIMITS.free {
    if (plan === SubscriptionPlan.FREE) {
      return STORAGE_LIMITS.free;
    }

    if (plan === SubscriptionPlan.INDIVIDUAL && tier === SubscriptionTier.PLUS) {
      return STORAGE_LIMITS.individual.plus;
    }

    if (plan === SubscriptionPlan.FAMILY && tier) {
      const familyTier = tier as keyof typeof STORAGE_LIMITS.family;
      return STORAGE_LIMITS.family[familyTier] || STORAGE_LIMITS.family.family_2_5tb;
    }

    return STORAGE_LIMITS.free;
  }

  /**
   * Helper: Validate addon combination
   */
  private isValidAddonCombination(addons: string[]): boolean {
    // storage_20tb cannot be combined with others
    if (addons.includes("storage_20tb") && addons.length > 1) {
      return false;
    }

    // Check against valid combinations
    const addonString = addons.sort().join(",");
    return ADDON_RULES.validCombinations.some(
      (combo) => combo.sort().join(",") === addonString
    );
  }
}
