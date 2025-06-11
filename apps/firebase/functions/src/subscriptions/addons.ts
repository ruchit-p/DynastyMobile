import {getFirestore, Timestamp, FieldValue} from "firebase-admin/firestore";
import {logger} from "firebase-functions/v2";
import {
  SubscriptionTier,
  SubscriptionAddon,
  AuditAction,
} from "../types/subscription";
import {createError, ErrorCode} from "../utils/errors";
import {StripeService} from "../services/stripeService";
import {SubscriptionService} from "../services/subscriptionService";
import {StorageCalculationService} from "../services/storageCalculationService";
import {
  ADDON_STORAGE,
  getAddonPriceId,
  STRIPE_PRICE_MAPPING,
  isAddonEligible,
  getAddonMonthlyPrice,
} from "../config/stripeProducts";

export interface AddonEligibilityCheck {
  isEligible: boolean;
  reason?: string;
  currentAddons?: SubscriptionAddon[];
  maxAddonsAllowed?: number;
  conflictingAddons?: string[];
}

export interface AddonPurchaseParams {
  subscriptionId: string;
  userId: string;
  addonType: keyof typeof ADDON_STORAGE;
  prorationBehavior?: "create_prorations" | "none" | "always_invoice";
  effectiveDate?: "immediate" | "next_billing_cycle";
}

export interface AddonRemovalParams {
  subscriptionId: string;
  userId: string;
  addonId: string;
  prorationBehavior?: "create_prorations" | "none" | "always_invoice";
  effectiveDate?: "immediate" | "end_of_billing_period";
  reason?: string;
}

export interface AddonCompatibilityMatrix {
  [key: string]: {
    maxQuantity: number;
    conflictsWith: string[];
    requiresTier?: SubscriptionTier[];
    requiresMinimumTier?: SubscriptionTier;
  };
}

export interface AddonUsageReport {
  subscriptionId: string;
  userId: string;
  addons: Array<{
    id: string;
    type: keyof typeof ADDON_STORAGE;
    storageGB: number;
    monthlyPrice: number;
    addedAt: Date;
    usageGB: number;
    usagePercentage: number;
    isUtilized: boolean;
    utilizationThreshold: number;
  }>;
  totalAddonStorageGB: number;
  totalAddonUsageGB: number;
  totalMonthlyAddonCost: number;
  recommendations: Array<{
    type: "optimize" | "upgrade" | "downgrade" | "remove";
    message: string;
    potentialSavings?: number;
    addonId?: string;
  }>;
}

export class AddonService {
  private db = getFirestore();
  private stripeService: StripeService;
  private subscriptionService: SubscriptionService;
  private storageService: StorageCalculationService;

  // Addon compatibility rules - updated for pricing matrix
  private compatibilityMatrix: AddonCompatibilityMatrix = {
    storage_1tb: {
      maxQuantity: 3, // Allow multiple smaller addons
      conflictsWith: [],
      requiresTier: [SubscriptionTier.PLUS], // Only Individual Plus
    },
    storage_2tb: {
      maxQuantity: 2,
      conflictsWith: [],
      requiresTier: [SubscriptionTier.PLUS], // Only Individual Plus
    },
    storage_5tb: {
      maxQuantity: 1,
      conflictsWith: [],
      requiresTier: [SubscriptionTier.PLUS], // Only Individual Plus
    },
    storage_20tb: {
      maxQuantity: 1,
      conflictsWith: ["storage_1tb", "storage_2tb", "storage_5tb"], // High-capacity addon
      requiresTier: [SubscriptionTier.PLUS], // Only Individual Plus
    },
  };

  constructor() {
    this.stripeService = new StripeService();
    this.subscriptionService = new SubscriptionService();
    this.storageService = new StorageCalculationService();
  }

  /**
   * Check addon eligibility with comprehensive validation
   */
  async checkAddonEligibility(
    subscriptionId: string,
    addonType: keyof typeof ADDON_STORAGE
  ): Promise<AddonEligibilityCheck> {
    try {
      // Get subscription
      const subscription = await this.subscriptionService.getSubscription(subscriptionId);
      if (!subscription) {
        return {
          isEligible: false,
          reason: "Subscription not found",
        };
      }

      // Check if Individual plan
      if (!isAddonEligible(subscription.plan, subscription.tier)) {
        return {
          isEligible: false,
          reason: "Addons are only available for Individual plans",
          currentAddons: subscription.addons,
        };
      }

      // Get compatibility rules for this addon
      const rules = this.compatibilityMatrix[addonType];
      if (!rules) {
        return {
          isEligible: false,
          reason: "Invalid addon type",
        };
      }

      // Check tier requirements
      if (rules.requiresTier && subscription.tier && !rules.requiresTier.includes(subscription.tier)) {
        return {
          isEligible: false,
          reason: `Addon requires one of these tiers: ${rules.requiresTier.join(", ")}`,
        };
      }

      if (rules.requiresMinimumTier && subscription.tier) {
        const tierOrder = [SubscriptionTier.LITE, SubscriptionTier.PLUS, SubscriptionTier.PRO];
        const currentTierIndex = tierOrder.indexOf(subscription.tier);
        const requiredTierIndex = tierOrder.indexOf(rules.requiresMinimumTier);

        if (currentTierIndex < requiredTierIndex) {
          return {
            isEligible: false,
            reason: `Addon requires minimum tier: ${rules.requiresMinimumTier}`,
          };
        }
      }

      // Check current addon count for this type
      const currentAddons = subscription.addons || [];
      const existingAddonCount = currentAddons.filter(
        (addon) => addon.type === addonType && addon.status === "active"
      ).length;

      if (existingAddonCount >= rules.maxQuantity) {
        return {
          isEligible: false,
          reason: `Maximum ${rules.maxQuantity} of this addon type allowed`,
          currentAddons,
          maxAddonsAllowed: rules.maxQuantity,
        };
      }

      // Check for conflicts
      const conflictingAddons = currentAddons.filter((addon) =>
        addon.status === "active" && rules.conflictsWith.includes(addon.type)
      );

      if (conflictingAddons.length > 0) {
        return {
          isEligible: false,
          reason: "Conflicts with existing addons",
          conflictingAddons: conflictingAddons.map((a) => a.type),
        };
      }

      // Check maximum total addons (example: max 3 total addons)
      const totalActiveAddons = currentAddons.filter((addon) => addon.status === "active").length;
      if (totalActiveAddons >= 3) {
        return {
          isEligible: false,
          reason: "Maximum 3 addons allowed per subscription",
          currentAddons,
        };
      }

      return {
        isEligible: true,
        currentAddons,
        maxAddonsAllowed: rules.maxQuantity,
      };
    } catch (error) {
      logger.error("Failed to check addon eligibility", {subscriptionId, addonType, error});
      return {
        isEligible: false,
        reason: "Eligibility check failed",
      };
    }
  }

  /**
   * Purchase addon with Stripe integration and proration
   */
  async purchaseAddon(params: AddonPurchaseParams): Promise<SubscriptionAddon> {
    try {
      // Validate eligibility
      const eligibility = await this.checkAddonEligibility(params.subscriptionId, params.addonType);
      if (!eligibility.isEligible) {
        throw createError(ErrorCode.ADDON_NOT_ELIGIBLE, eligibility.reason || "Addon not eligible");
      }

      // Get subscription
      const subscription = await this.subscriptionService.getSubscription(params.subscriptionId);
      if (!subscription) {
        throw createError(ErrorCode.SUBSCRIPTION_NOT_FOUND, "Subscription not found");
      }

      // Verify ownership
      if (subscription.userId !== params.userId) {
        throw createError(ErrorCode.PERMISSION_DENIED, "Not authorized to modify this subscription");
      }

      // Get addon price ID
      const addonPriceId = getAddonPriceId(params.addonType);
      if (!addonPriceId) {
        throw createError(ErrorCode.INVALID_ARGUMENT, "Invalid addon configuration");
      }

      // Add addon to Stripe subscription
      const stripeSubscription = await this.stripeService.stripe.subscriptions.retrieve(
        subscription.stripeSubscriptionId!
      );

      const subscriptionItem = await this.stripeService.stripe.subscriptionItems.create({
        subscription: stripeSubscription.id,
        price: addonPriceId,
        quantity: 1,
        proration_behavior: params.prorationBehavior || "create_prorations",
      });

      // Create addon object
      const addon: SubscriptionAddon = {
        id: subscriptionItem.id,
        type: params.addonType,
        name: this.getAddonDisplayName(params.addonType),
        storageGB: ADDON_STORAGE[params.addonType],
        priceMonthly: this.getAddonMonthlyPrice(params.addonType),
        stripeProductId: STRIPE_PRICE_MAPPING.addons[params.addonType].productId,
        stripePriceId: addonPriceId,
        addedAt: Timestamp.now(),
        status: "active",
      };

      // Update subscription in database
      await this.db.collection("subscriptions").doc(params.subscriptionId).update({
        addons: FieldValue.arrayUnion(addon),
        updatedAt: Timestamp.now(),
        lastModifiedBy: params.userId,
      });

      // Recalculate storage allocation
      await this.recalculateStorageWithAddons(params.subscriptionId);

      // Add audit log entry
      await this.subscriptionService.addAuditLogEntry(params.subscriptionId, {
        action: AuditAction.ADDON_ADDED,
        performedBy: params.userId,
        details: {
          addonType: params.addonType,
          addonId: addon.id,
          storageGB: addon.storageGB,
          priceMonthly: addon.priceMonthly,
          stripeSubscriptionItemId: subscriptionItem.id,
        },
      });

      // Send confirmation notification
      await this.sendAddonPurchaseConfirmation(params.userId, addon);

      logger.info("Addon purchased successfully", {
        subscriptionId: params.subscriptionId,
        userId: params.userId,
        addonType: params.addonType,
        addonId: addon.id,
        stripeSubscriptionItemId: subscriptionItem.id,
      });

      return addon;
    } catch (error) {
      logger.error("Failed to purchase addon", {params, error});
      throw error;
    }
  }

  /**
   * Remove addon with proration and cleanup
   */
  async removeAddon(params: AddonRemovalParams): Promise<void> {
    try {
      // Get subscription
      const subscription = await this.subscriptionService.getSubscription(params.subscriptionId);
      if (!subscription) {
        throw createError(ErrorCode.SUBSCRIPTION_NOT_FOUND, "Subscription not found");
      }

      // Verify ownership
      if (subscription.userId !== params.userId) {
        throw createError(ErrorCode.PERMISSION_DENIED, "Not authorized to modify this subscription");
      }

      // Find the addon
      const addonIndex = subscription.addons?.findIndex((addon) => addon.id === params.addonId);
      if (addonIndex === undefined || addonIndex === -1) {
        throw createError(ErrorCode.NOT_FOUND, "Addon not found");
      }

      const addon = subscription.addons![addonIndex];

      // Check if addon is active
      if (addon.status !== "active") {
        throw createError(ErrorCode.INVALID_ARGUMENT, "Addon is not active");
      }

      // Remove from Stripe subscription
      if (params.effectiveDate === "immediate") {
        await this.stripeService.stripe.subscriptionItems.del(addon.id!, {
          proration_behavior: params.prorationBehavior || "create_prorations",
        });
      } else {
        // Schedule cancellation at end of billing period
        await this.stripeService.stripe.subscriptionItems.update(addon.id!, {
          quantity: 0,
          proration_behavior: params.prorationBehavior || "create_prorations",
        });
      }

      // Update addon status in database
      const updatedAddons = [...(subscription.addons || [])];
      updatedAddons[addonIndex] = {
        ...addon,
        status: "canceled",
      };

      await this.db.collection("subscriptions").doc(params.subscriptionId).update({
        addons: updatedAddons,
        updatedAt: Timestamp.now(),
        lastModifiedBy: params.userId,
      });

      // Recalculate storage allocation
      await this.recalculateStorageWithAddons(params.subscriptionId);

      // Add audit log entry
      await this.subscriptionService.addAuditLogEntry(params.subscriptionId, {
        action: AuditAction.ADDON_REMOVED,
        performedBy: params.userId,
        details: {
          addonType: addon.type,
          addonId: addon.id,
          reason: params.reason,
          effectiveDate: params.effectiveDate,
          storageGB: addon.storageGB,
        },
      });

      // Send removal confirmation
      await this.sendAddonRemovalConfirmation(params.userId, addon, params.reason);

      logger.info("Addon removed successfully", {
        subscriptionId: params.subscriptionId,
        userId: params.userId,
        addonId: params.addonId,
        addonType: addon.type,
        effectiveDate: params.effectiveDate,
      });
    } catch (error) {
      logger.error("Failed to remove addon", {params, error});
      throw error;
    }
  }

  /**
   * Generate addon usage report with optimization recommendations
   */
  async generateAddonUsageReport(subscriptionId: string): Promise<AddonUsageReport> {
    try {
      // Get subscription
      const subscription = await this.subscriptionService.getSubscription(subscriptionId);
      if (!subscription) {
        throw createError(ErrorCode.SUBSCRIPTION_NOT_FOUND, "Subscription not found");
      }

      // Calculate current storage usage
      const storageResult = await this.storageService.calculateUserStorage(
        subscription.userId,
        subscription
      );

      // Analyze each addon
      const addonAnalysis = (subscription.addons || [])
        .filter((addon) => addon.status === "active")
        .map((addon) => {
          const utilizationThreshold = 0.7; // 70% utilization threshold
          const usageGB = Math.max(0, storageResult.usedBytes / (1024 * 1024 * 1024) - storageResult.basePlanGB);
          const addonUsageGB = Math.min(usageGB, addon.storageGB || 0);
          const usagePercentage = addon.storageGB ? (addonUsageGB / addon.storageGB) * 100 : 0;

          return {
            id: addon.id!,
            type: addon.type,
            storageGB: addon.storageGB || 0,
            monthlyPrice: addon.priceMonthly || 0,
            addedAt: addon.addedAt?.toDate() || new Date(),
            usageGB: Math.round(addonUsageGB * 100) / 100,
            usagePercentage: Math.round(usagePercentage * 100) / 100,
            isUtilized: usagePercentage >= utilizationThreshold * 100,
            utilizationThreshold: utilizationThreshold * 100,
          };
        });

      // Generate recommendations
      const recommendations: AddonUsageReport["recommendations"] = [];

      addonAnalysis.forEach((addon) => {
        if (addon.usagePercentage < 30) {
          recommendations.push({
            type: "remove",
            message: `Consider removing ${addon.type} addon - only ${addon.usagePercentage.toFixed(1)}% utilized`,
            potentialSavings: addon.monthlyPrice,
            addonId: addon.id,
          });
        } else if (addon.usagePercentage > 90) {
          recommendations.push({
            type: "upgrade",
            message: `Consider upgrading ${addon.type} addon - ${addon.usagePercentage.toFixed(1)}% utilized`,
            addonId: addon.id,
          });
        }
      });

      // Check for optimization opportunities
      const totalAddonStorage = addonAnalysis.reduce((sum, addon) => sum + addon.storageGB, 0);
      const totalAddonUsage = addonAnalysis.reduce((sum, addon) => sum + addon.usageGB, 0);
      const totalAddonCost = addonAnalysis.reduce((sum, addon) => sum + addon.monthlyPrice, 0);

      if (addonAnalysis.length > 1 && totalAddonUsage < totalAddonStorage * 0.6) {
        recommendations.push({
          type: "optimize",
          message: "Consider consolidating addons for better cost efficiency",
          potentialSavings: totalAddonCost * 0.2, // Estimated 20% savings
        });
      }

      return {
        subscriptionId,
        userId: subscription.userId,
        addons: addonAnalysis,
        totalAddonStorageGB: totalAddonStorage,
        totalAddonUsageGB: Math.round(totalAddonUsage * 100) / 100,
        totalMonthlyAddonCost: totalAddonCost,
        recommendations,
      };
    } catch (error) {
      logger.error("Failed to generate addon usage report", {subscriptionId, error});
      throw error;
    }
  }

  /**
   * Get available addons for a subscription
   */
  async getAvailableAddons(subscriptionId: string): Promise<Array<{
    type: keyof typeof ADDON_STORAGE;
    name: string;
    storageGB: number;
    priceMonthly: number;
    isEligible: boolean;
    reason?: string;
  }>> {
    const addonTypes = Object.keys(ADDON_STORAGE) as Array<keyof typeof ADDON_STORAGE>;
    const availableAddons = [];

    for (const addonType of addonTypes) {
      const eligibility = await this.checkAddonEligibility(subscriptionId, addonType);

      availableAddons.push({
        type: addonType,
        name: this.getAddonDisplayName(addonType),
        storageGB: ADDON_STORAGE[addonType],
        priceMonthly: this.getAddonMonthlyPrice(addonType),
        isEligible: eligibility.isEligible,
        reason: eligibility.reason,
      });
    }

    return availableAddons;
  }

  /**
   * Recalculate storage with addons
   */
  private async recalculateStorageWithAddons(subscriptionId: string): Promise<void> {
    try {
      const subscription = await this.subscriptionService.getSubscription(subscriptionId);
      if (!subscription) return;

      const storageResult = await this.storageService.calculateUserStorage(
        subscription.userId,
        subscription
      );

      await this.db.collection("subscriptions").doc(subscriptionId).update({
        storageAllocation: {
          basePlanGB: storageResult.basePlanGB,
          addonGB: storageResult.addonGB,
          referralBonusGB: storageResult.referralBonusGB,
          totalGB: storageResult.totalGB,
          usedBytes: storageResult.usedBytes,
          availableBytes: storageResult.availableBytes,
          lastCalculated: Timestamp.now(),
        },
        updatedAt: Timestamp.now(),
      });

      logger.info("Storage recalculated with addons", {
        subscriptionId,
        totalGB: storageResult.totalGB,
        addonGB: storageResult.addonGB,
      });
    } catch (error) {
      logger.error("Failed to recalculate storage with addons", {subscriptionId, error});
    }
  }

  /**
   * Get addon display name
   */
  private getAddonDisplayName(addonType: keyof typeof ADDON_STORAGE): string {
    const displayNames = {
      storage_1tb: "1TB Storage Add-on",
      storage_2tb: "2TB Storage Add-on",
      storage_5tb: "5TB Storage Add-on",
      storage_20tb: "20TB Storage Add-on",
    };
    return displayNames[addonType];
  }

  /**
   * Get addon monthly price (from pricing matrix)
   */
  private getAddonMonthlyPrice(addonType: keyof typeof ADDON_STORAGE): number {
    return getAddonMonthlyPrice(addonType);
  }

  /**
   * Send addon purchase confirmation
   */
  private async sendAddonPurchaseConfirmation(userId: string, addon: SubscriptionAddon): Promise<void> {
    try {
      logger.info("Would send addon purchase confirmation", {
        userId,
        addonType: addon.type,
        storageGB: addon.storageGB,
        priceMonthly: addon.priceMonthly,
      });

      // TODO: Implement email/notification sending
    } catch (error) {
      logger.error("Failed to send addon purchase confirmation", {userId, addon, error});
    }
  }

  /**
   * Send addon removal confirmation
   */
  private async sendAddonRemovalConfirmation(
    userId: string,
    addon: SubscriptionAddon,
    reason?: string
  ): Promise<void> {
    try {
      logger.info("Would send addon removal confirmation", {
        userId,
        addonType: addon.type,
        reason,
      });

      // TODO: Implement email/notification sending
    } catch (error) {
      logger.error("Failed to send addon removal confirmation", {userId, addon, error});
    }
  }
}
