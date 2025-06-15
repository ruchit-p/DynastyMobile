import {getFirestore, Timestamp} from "firebase-admin/firestore";
import {logger} from "firebase-functions/v2";
import {
  SubscriptionPlan,
  SubscriptionTier,
  Subscription,
  StorageAllocation,
  ReferralInfo,
} from "../types/subscription";
import {
  getStorageAllocation,
  STORAGE_ALLOCATIONS,
  ADDON_STORAGE,
  REFERRAL_CONFIG,
} from "../config/stripeProducts";
import {createError, ErrorCode} from "../utils/errors";
import {storageNotificationService} from "./storageNotificationService";

export interface StorageCalculationResult {
  basePlanGB: number;
  addonGB: number;
  referralBonusGB: number;
  totalGB: number;
  usedBytes: number;
  availableBytes: number;
  usagePercentage: number;
  isOverLimit: boolean;
}

export interface FamilyStorageBreakdown {
  totalFamilyStorageGB: number;
  sharedUsageBytes: number;
  memberBreakdown: Array<{
    userId: string;
    email: string;
    displayName: string;
    usageBytes: number;
    usagePercentage: number;
  }>;
  availableBytes: number;
}

export class StorageCalculationService {
  private db = getFirestore();

  /**
   * Calculate storage allocation for a user
   */
  async calculateUserStorage(
    userId: string,
    subscription?: Subscription
  ): Promise<StorageCalculationResult> {
    try {
      // Get subscription if not provided
      if (!subscription) {
        const subscriptionDoc = await this.db.collection("subscriptions").doc(userId).get();
        if (!subscriptionDoc.exists) {
          // Default to free plan
          return this.calculateFreeStorage(userId);
        }
        subscription = subscriptionDoc.data() as Subscription;
      }

      // Calculate base storage
      const basePlanGB = getStorageAllocation(subscription.plan, subscription.tier);

      // Calculate addon storage
      let addonGB = 0;
      if (subscription.addons && subscription.addons.length > 0) {
        subscription.addons.forEach((addon) => {
          if (addon.status === "active" && ADDON_STORAGE[addon.type]) {
            addonGB += ADDON_STORAGE[addon.type];
          }
        });
      }

      // Calculate referral bonus
      const referralBonusGB = this.calculateReferralBonus(
        subscription.referralInfo,
        subscription.plan,
        subscription.tier
      );

      // Calculate total
      const totalGB = basePlanGB + addonGB + referralBonusGB;
      const totalBytes = totalGB * 1024 * 1024 * 1024; // Convert GB to bytes

      // Get current usage
      const usedBytes = await this.getUserStorageUsage(userId);
      const availableBytes = Math.max(0, totalBytes - usedBytes);
      const usagePercentage = totalBytes > 0 ? (usedBytes / totalBytes) * 100 : 0;

      const result: StorageCalculationResult = {
        basePlanGB,
        addonGB,
        referralBonusGB,
        totalGB,
        usedBytes,
        availableBytes,
        usagePercentage,
        isOverLimit: usedBytes > totalBytes,
      };

      // Update subscription with latest calculation
      await this.updateStorageAllocation(userId, subscription.id, result);

      // Check if we need to send storage notifications
      try {
        await storageNotificationService.checkAndNotifyStorageLimit(userId, result);
      } catch (notificationError) {
        // Log but don't fail the calculation if notification fails
        logger.warn("Failed to check storage notifications", {userId, error: notificationError});
      }

      return result;
    } catch (error) {
      logger.error("Failed to calculate user storage", {userId, error});
      throw error;
    }
  }

  /**
   * Calculate storage for free plan users
   */
  private async calculateFreeStorage(userId: string): Promise<StorageCalculationResult> {
    const basePlanGB = STORAGE_ALLOCATIONS.free.baseStorageGB;

    // Check for referral bonuses even for free users
    const referralInfo = await this.getUserReferralInfo(userId);
    const referralBonusGB = this.calculateReferralBonus(
      referralInfo,
      SubscriptionPlan.FREE
    );

    const totalGB = basePlanGB + referralBonusGB;
    const totalBytes = totalGB * 1024 * 1024 * 1024;

    const usedBytes = await this.getUserStorageUsage(userId);
    const availableBytes = Math.max(0, totalBytes - usedBytes);
    const usagePercentage = totalBytes > 0 ? (usedBytes / totalBytes) * 100 : 0;

    const result: StorageCalculationResult = {
      basePlanGB,
      addonGB: 0,
      referralBonusGB,
      totalGB,
      usedBytes,
      availableBytes,
      usagePercentage,
      isOverLimit: usedBytes > totalBytes,
    };

    // Check if we need to send storage notifications for free users
    try {
      await storageNotificationService.checkAndNotifyStorageLimit(userId, result);
    } catch (notificationError) {
      // Log but don't fail the calculation if notification fails
      logger.warn("Failed to check storage notifications for free user", {userId, error: notificationError});
    }

    return result;
  }

  /**
   * Calculate referral bonus storage
   */
  private calculateReferralBonus(
    referralInfo?: ReferralInfo,
    plan?: SubscriptionPlan,
    tier?: SubscriptionTier
  ): number {
    if (!referralInfo || referralInfo.activeReferrals === 0) {
      return 0;
    }

    // Get max referral bonus for the plan
    let maxReferralBonusGB = 0;
    if (plan === SubscriptionPlan.FREE) {
      maxReferralBonusGB = STORAGE_ALLOCATIONS.free.maxReferralBonusGB;
    } else if (plan === SubscriptionPlan.INDIVIDUAL && tier === SubscriptionTier.PLUS) {
      maxReferralBonusGB = STORAGE_ALLOCATIONS.individual.plus.maxReferralBonusGB;
    } else if (plan === SubscriptionPlan.FAMILY && tier) {
      // Map tier to correct family key
      switch (tier) {
      case SubscriptionTier.FAMILY_2_5TB:
      case SubscriptionTier.LITE:
        maxReferralBonusGB = STORAGE_ALLOCATIONS.family.family_2_5tb.maxReferralBonusGB;
        break;
      case SubscriptionTier.FAMILY_7_5TB:
        maxReferralBonusGB = STORAGE_ALLOCATIONS.family.family_7_5tb.maxReferralBonusGB;
        break;
      case SubscriptionTier.FAMILY_12TB:
      case SubscriptionTier.PRO:
        maxReferralBonusGB = STORAGE_ALLOCATIONS.family.family_12tb.maxReferralBonusGB;
        break;
      }
    }

    // Calculate bonus (1GB per referral, up to max)
    const calculatedBonus = Math.min(
      referralInfo.activeReferrals * REFERRAL_CONFIG.storagePerReferralGB,
      REFERRAL_CONFIG.maxReferrals * REFERRAL_CONFIG.storagePerReferralGB
    );

    return Math.min(calculatedBonus, maxReferralBonusGB);
  }

  /**
   * Calculate family plan storage breakdown
   */
  async calculateFamilyStorage(
    familyOwnerId: string,
    subscription: Subscription
  ): Promise<FamilyStorageBreakdown> {
    if (subscription.plan !== SubscriptionPlan.FAMILY) {
      throw createError(ErrorCode.INVALID_ARGUMENT, "Not a family plan subscription");
    }

    // Calculate total family storage
    const baseStorageGB = getStorageAllocation(subscription.plan, subscription.tier);
    const referralBonusGB = this.calculateReferralBonus(
      subscription.referralInfo,
      SubscriptionPlan.FAMILY,
      subscription.tier
    );
    const totalFamilyStorageGB = baseStorageGB + referralBonusGB;
    const totalFamilyStorageBytes = totalFamilyStorageGB * 1024 * 1024 * 1024;

    // Get all family members' usage
    const memberBreakdown: FamilyStorageBreakdown["memberBreakdown"] = [];
    let sharedUsageBytes = 0;

    // Add owner's usage
    const ownerUsage = await this.getUserStorageUsage(familyOwnerId);
    sharedUsageBytes += ownerUsage;

    const ownerDoc = await this.db.collection("users").doc(familyOwnerId).get();
    const ownerData = ownerDoc.data();
    memberBreakdown.push({
      userId: familyOwnerId,
      email: ownerData?.email || "",
      displayName: ownerData?.displayName || "Family Owner",
      usageBytes: ownerUsage,
      usagePercentage: (ownerUsage / totalFamilyStorageBytes) * 100,
    });

    // Add members' usage
    if (subscription.familyMembers) {
      for (const member of subscription.familyMembers) {
        if (member.status === "active") {
          const memberUsage = await this.getUserStorageUsage(member.userId);
          sharedUsageBytes += memberUsage;

          memberBreakdown.push({
            userId: member.userId,
            email: member.email,
            displayName: member.displayName,
            usageBytes: memberUsage,
            usagePercentage: (memberUsage / totalFamilyStorageBytes) * 100,
          });
        }
      }
    }

    const availableBytes = Math.max(0, totalFamilyStorageBytes - sharedUsageBytes);

    return {
      totalFamilyStorageGB,
      sharedUsageBytes,
      memberBreakdown,
      availableBytes,
    };
  }

  /**
   * Validate storage limit before upload
   */
  async validateStorageLimit(
    userId: string,
    uploadSizeBytes: number,
    subscription?: Subscription
  ): Promise<{
    allowed: boolean;
    reason?: string;
    currentUsageBytes: number;
    limitBytes: number;
    availableBytes: number;
  }> {
    try {
      // Check if user is part of a family plan
      const userDoc = await this.db.collection("users").doc(userId).get();
      const userData = userDoc.data();

      if (userData?.familyPlanOwnerId) {
        // User is a family member, check family storage
        return this.validateFamilyStorageLimit(
          userData.familyPlanOwnerId,
          userId,
          uploadSizeBytes
        );
      }

      // Calculate individual storage
      const storage = await this.calculateUserStorage(userId, subscription);
      const newUsageBytes = storage.usedBytes + uploadSizeBytes;
      const limitBytes = storage.totalGB * 1024 * 1024 * 1024;

      if (newUsageBytes > limitBytes) {
        return {
          allowed: false,
          reason: "Storage limit would be exceeded. Please upgrade your plan or remove some files.",
          currentUsageBytes: storage.usedBytes,
          limitBytes,
          availableBytes: storage.availableBytes,
        };
      }

      return {
        allowed: true,
        currentUsageBytes: storage.usedBytes,
        limitBytes,
        availableBytes: storage.availableBytes,
      };
    } catch (error) {
      logger.error("Failed to validate storage limit", {userId, uploadSizeBytes, error});
      throw error;
    }
  }

  /**
   * Validate family storage limit
   */
  private async validateFamilyStorageLimit(
    familyOwnerId: string,
    memberId: string,
    uploadSizeBytes: number
  ): Promise<{
    allowed: boolean;
    reason?: string;
    currentUsageBytes: number;
    limitBytes: number;
    availableBytes: number;
  }> {
    const subscriptionDoc = await this.db.collection("subscriptions").doc(familyOwnerId).get();
    if (!subscriptionDoc.exists) {
      throw createError(ErrorCode.SUBSCRIPTION_NOT_FOUND, "Family subscription not found");
    }

    const subscription = subscriptionDoc.data() as Subscription;
    const familyStorage = await this.calculateFamilyStorage(familyOwnerId, subscription);

    const newUsageBytes = familyStorage.sharedUsageBytes + uploadSizeBytes;
    const limitBytes = familyStorage.totalFamilyStorageGB * 1024 * 1024 * 1024;

    if (newUsageBytes > limitBytes) {
      return {
        allowed: false,
        reason: "Family storage limit would be exceeded. Please ask the family owner to upgrade the plan.",
        currentUsageBytes: familyStorage.sharedUsageBytes,
        limitBytes,
        availableBytes: familyStorage.availableBytes,
      };
    }

    return {
      allowed: true,
      currentUsageBytes: familyStorage.sharedUsageBytes,
      limitBytes,
      availableBytes: familyStorage.availableBytes,
    };
  }

  /**
   * Get user's current storage usage
   */
  private async getUserStorageUsage(userId: string): Promise<number> {
    // Get from user document if cached
    const userDoc = await this.db.collection("users").doc(userId).get();
    const userData = userDoc.data();

    if (userData?.storageUsedBytes !== undefined) {
      return userData.storageUsedBytes;
    }

    // Calculate from vault items if not cached
    const vaultItems = await this.db.collection("vaultItems")
      .where("userId", "==", userId)
      .where("isDeleted", "==", false)
      .get();

    let totalBytes = 0;
    vaultItems.forEach((doc) => {
      const item = doc.data();
      if (item.type === "file" && item.size) {
        totalBytes += item.size;
      }
    });

    // Update cache
    await this.db.collection("users").doc(userId).update({
      storageUsedBytes: totalBytes,
      updatedAt: Timestamp.now(),
    });

    return totalBytes;
  }

  /**
   * Get user's referral info
   */
  private async getUserReferralInfo(userId: string): Promise<ReferralInfo | undefined> {
    const userDoc = await this.db.collection("users").doc(userId).get();
    const userData = userDoc.data();

    if (!userData?.referralCode) {
      return undefined;
    }

    // Count active referrals
    const referrals = await this.db.collection("referrals")
      .where("referrerUserId", "==", userId)
      .where("status", "==", "completed")
      .get();

    return {
      referralCode: userData.referralCode,
      referredBy: userData.referredBy,
      referredUsers: referrals.docs.map((doc) => doc.data().referredUserId),
      totalReferrals: referrals.size,
      activeReferrals: referrals.size,
      storageEarnedGB: Math.min(
        referrals.size * REFERRAL_CONFIG.storagePerReferralGB,
        REFERRAL_CONFIG.maxReferrals * REFERRAL_CONFIG.storagePerReferralGB
      ),
      lastReferralAt: referrals.size > 0 ?
        referrals.docs[0].data().completedAt :
        undefined,
    };
  }

  /**
   * Update storage allocation in subscription
   */
  private async updateStorageAllocation(
    userId: string,
    subscriptionId: string,
    calculation: StorageCalculationResult
  ): Promise<void> {
    const storageAllocation: StorageAllocation = {
      basePlanGB: calculation.basePlanGB,
      addonGB: calculation.addonGB,
      referralBonusGB: calculation.referralBonusGB,
      totalGB: calculation.totalGB,
      usedBytes: calculation.usedBytes,
      availableBytes: calculation.availableBytes,
      lastCalculated: Timestamp.now(),
    };

    await this.db.collection("subscriptions").doc(subscriptionId).update({
      storageAllocation,
      updatedAt: Timestamp.now(),
    });
  }

  /**
   * Update user storage usage
   */
  async updateUserStorageUsage(userId: string, deltaBytes: number): Promise<void> {
    try {
      const userRef = this.db.collection("users").doc(userId);

      await this.db.runTransaction(async (transaction) => {
        const userDoc = await transaction.get(userRef);
        const currentUsage = userDoc.data()?.storageUsedBytes || 0;
        const newUsage = Math.max(0, currentUsage + deltaBytes);

        transaction.update(userRef, {
          storageUsedBytes: newUsage,
          updatedAt: Timestamp.now(),
        });
      });

      logger.info("Updated user storage usage", {
        userId,
        deltaBytes,
      });

      // After updating storage, check if we need to send notifications
      try {
        await this.calculateUserStorage(userId);
        // This will internally check and send notifications if needed
      } catch (notificationError) {
        // Log but don't fail the storage update if notification check fails
        logger.warn("Failed to check storage after usage update", {userId, error: notificationError});
      }
    } catch (error) {
      logger.error("Failed to update user storage usage", {userId, deltaBytes, error});
      throw error;
    }
  }
}
