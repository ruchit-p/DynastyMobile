import {getFirestore, Timestamp} from "firebase-admin/firestore";
import {logger} from "firebase-functions/v2";
import {
  Referral,
  ReferralInfo,
  SubscriptionPlan,
  SubscriptionTier,
} from "../types/subscription";
import {createError, ErrorCode} from "../utils/errors";
import {REFERRAL_CONFIG, STORAGE_ALLOCATIONS} from "../config/stripeProducts";
import {StorageCalculationService} from "./storageCalculationService";

export interface CreateReferralParams {
  referrerUserId: string;
  referredUserId: string;
  referralCode: string;
  metadata?: {
    campaign?: string;
    source?: string;
  };
}

export interface ReferralValidationResult {
  isValid: boolean;
  reason?: string;
  referral?: Referral;
}

export interface ReferralStatsResult {
  totalReferrals: number;
  completedReferrals: number;
  pendingReferrals: number;
  expiredReferrals: number;
  totalStorageEarned: number;
  remainingStorageEligible: number;
}

/**
 * Service for managing referral system with storage bonuses
 */
export class ReferralService {
  private db = getFirestore();
  private storageCalculationService = new StorageCalculationService();

  /**
   * Generate a unique referral code for a user
   */
  async generateReferralCode(userId: string): Promise<string> {
    try {
      let attempts = 0;
      const maxAttempts = 10;

      while (attempts < maxAttempts) {
        // Generate 8-character alphanumeric code
        const code = this.generateRandomCode(8);

        // Check if code is unique
        const existing = await this.db.collection("users")
          .where("referralCode", "==", code)
          .limit(1)
          .get();

        if (existing.empty) {
          // Update user with new referral code
          await this.db.collection("users").doc(userId).update({
            referralCode: code,
            updatedAt: Timestamp.now(),
          });

          logger.info("Generated referral code", {userId, code});
          return code;
        }

        attempts++;
      }

      throw createError(
        ErrorCode.INTERNAL,
        "Failed to generate unique referral code after multiple attempts"
      );
    } catch (error) {
      logger.error("Failed to generate referral code", {userId, error});
      throw error;
    }
  }

  /**
   * Validate a referral code and check eligibility
   */
  async validateReferralCode(
    referralCode: string,
    referredUserId: string
  ): Promise<ReferralValidationResult> {
    try {
      // Find the referrer user by referral code
      const referrerQuery = await this.db.collection("users")
        .where("referralCode", "==", referralCode)
        .limit(1)
        .get();

      if (referrerQuery.empty) {
        return {
          isValid: false,
          reason: "Invalid referral code",
        };
      }

      const referrerDoc = referrerQuery.docs[0];
      const referrerUserId = referrerDoc.id;

      // Check if user is trying to refer themselves
      if (referrerUserId === referredUserId) {
        return {
          isValid: false,
          reason: "Cannot use your own referral code",
        };
      }

      // Check if referred user already has a referrer
      const referredUserDoc = await this.db.collection("users").doc(referredUserId).get();
      const referredUserData = referredUserDoc.data();

      if (referredUserData?.referredBy) {
        return {
          isValid: false,
          reason: "You have already been referred by another user",
        };
      }

      // Check if there's already a pending or completed referral
      const existingReferral = await this.db.collection("referrals")
        .where("referrerUserId", "==", referrerUserId)
        .where("referredUserId", "==", referredUserId)
        .limit(1)
        .get();

      if (!existingReferral.empty) {
        const referralData = existingReferral.docs[0].data();
        return {
          isValid: false,
          reason: `Referral already exists with status: ${referralData.status}`,
        };
      }

      // Check referral limits
      const referrerReferrals = await this.db.collection("referrals")
        .where("referrerUserId", "==", referrerUserId)
        .where("status", "==", "completed")
        .get();

      if (referrerReferrals.size >= REFERRAL_CONFIG.maxReferrals) {
        return {
          isValid: false,
          reason: "Referrer has reached maximum referral limit",
        };
      }

      return {
        isValid: true,
        referral: {
          id: "", // Will be set when created
          referrerUserId,
          referredUserId,
          referralCode,
          status: "pending",
          createdAt: Timestamp.now(),
          expiresAt: Timestamp.fromDate(
            new Date(Date.now() + REFERRAL_CONFIG.referralExpirationDays * 24 * 60 * 60 * 1000)
          ),
          storageRewardGB: REFERRAL_CONFIG.storagePerReferralGB,
          rewardApplied: false,
        },
      };
    } catch (error) {
      logger.error("Failed to validate referral code", {referralCode, referredUserId, error});
      throw error;
    }
  }

  /**
   * Create a new referral when someone signs up with a referral code
   */
  async createReferral(params: CreateReferralParams): Promise<Referral> {
    try {
      // Validate the referral first
      const validation = await this.validateReferralCode(
        params.referralCode,
        params.referredUserId
      );

      if (!validation.isValid || !validation.referral) {
        throw createError(
          ErrorCode.REFERRAL_INVALID,
          validation.reason || "Invalid referral"
        );
      }

      const referralId = this.db.collection("referrals").doc().id;
      const referral: Referral = {
        ...validation.referral,
        id: referralId,
        metadata: params.metadata,
      };

      // Create the referral document
      await this.db.collection("referrals").doc(referralId).set(referral);

      // Update the referred user with referrer information
      await this.db.collection("users").doc(params.referredUserId).update({
        referredBy: params.referrerUserId,
        referralCode: params.referralCode,
        updatedAt: Timestamp.now(),
      });

      logger.info("Created referral", {
        referralId,
        referrerUserId: params.referrerUserId,
        referredUserId: params.referredUserId,
      });

      return referral;
    } catch (error) {
      logger.error("Failed to create referral", {params, error});
      throw error;
    }
  }

  /**
   * Complete a referral when the referred user becomes a paying customer
   */
  async completeReferral(referredUserId: string): Promise<void> {
    try {
      // Find the pending referral for this user
      const referralQuery = await this.db.collection("referrals")
        .where("referredUserId", "==", referredUserId)
        .where("status", "==", "pending")
        .limit(1)
        .get();

      if (referralQuery.empty) {
        logger.info("No pending referral found for user", {referredUserId});
        return;
      }

      const referralDoc = referralQuery.docs[0];
      const referral = referralDoc.data() as Referral;

      // Check if referral has expired
      if (referral.expiresAt.toDate() < new Date()) {
        await referralDoc.ref.update({
          status: "expired",
          updatedAt: Timestamp.now(),
        });
        logger.info("Referral expired, not completing", {
          referralId: referral.id,
          expiresAt: referral.expiresAt,
        });
        return;
      }

      // Complete the referral
      const completedAt = Timestamp.now();
      await referralDoc.ref.update({
        status: "completed",
        completedAt,
        updatedAt: completedAt,
      });

      // Apply storage reward to referrer
      await this.applyStorageReward(referral.referrerUserId, referral.id);

      logger.info("Completed referral", {
        referralId: referral.id,
        referrerUserId: referral.referrerUserId,
        referredUserId: referral.referredUserId,
      });
    } catch (error) {
      logger.error("Failed to complete referral", {referredUserId, error});
      throw error;
    }
  }

  /**
   * Apply storage reward to referrer after successful referral
   */
  private async applyStorageReward(referrerUserId: string, referralId: string): Promise<void> {
    try {
      // Mark reward as applied
      await this.db.collection("referrals").doc(referralId).update({
        rewardApplied: true,
        updatedAt: Timestamp.now(),
      });

      // Trigger storage recalculation for the referrer
      await this.storageCalculationService.calculateUserStorage(referrerUserId);

      logger.info("Applied storage reward", {referrerUserId, referralId});
    } catch (error) {
      logger.error("Failed to apply storage reward", {referrerUserId, referralId, error});
      throw error;
    }
  }

  /**
   * Get referral statistics for a user
   */
  async getReferralStats(userId: string): Promise<ReferralStatsResult> {
    try {
      const referralsQuery = await this.db.collection("referrals")
        .where("referrerUserId", "==", userId)
        .get();

      let completedReferrals = 0;
      let pendingReferrals = 0;
      let expiredReferrals = 0;

      referralsQuery.docs.forEach((doc: any) => {
        const referral = doc.data();
        switch (referral.status) {
        case "completed":
          completedReferrals++;
          break;
        case "pending":
          pendingReferrals++;
          break;
        case "expired":
          expiredReferrals++;
          break;
        }
      });

      const totalReferrals = referralsQuery.size;
      const totalStorageEarned = completedReferrals * REFERRAL_CONFIG.storagePerReferralGB;
      const remainingStorageEligible = Math.max(
        0,
        (REFERRAL_CONFIG.maxReferrals - completedReferrals) * REFERRAL_CONFIG.storagePerReferralGB
      );

      return {
        totalReferrals,
        completedReferrals,
        pendingReferrals,
        expiredReferrals,
        totalStorageEarned,
        remainingStorageEligible,
      };
    } catch (error) {
      logger.error("Failed to get referral stats", {userId, error});
      throw error;
    }
  }

  /**
   * Get referral information for a user
   */
  async getReferralInfo(userId: string): Promise<ReferralInfo | null> {
    try {
      const userDoc = await this.db.collection("users").doc(userId).get();
      const userData = userDoc.data();

      if (!userData?.referralCode) {
        return null;
      }

      // Get active referrals
      const referralsQuery = await this.db.collection("referrals")
        .where("referrerUserId", "==", userId)
        .where("status", "==", "completed")
        .get();

      const referredUsers = referralsQuery.docs.map((doc: any) => doc.data().referredUserId);
      const totalReferrals = referralsQuery.size;
      const activeReferrals = totalReferrals; // All completed referrals are active

      const storageEarnedGB = Math.min(
        totalReferrals * REFERRAL_CONFIG.storagePerReferralGB,
        REFERRAL_CONFIG.maxReferrals * REFERRAL_CONFIG.storagePerReferralGB
      );

      let lastReferralAt: Timestamp | undefined;
      if (referralsQuery.size > 0) {
        // Get the most recent referral
        const sortedReferrals = referralsQuery.docs.sort((a: any, b: any) => {
          const aTime = a.data().completedAt?.toDate() || new Date(0);
          const bTime = b.data().completedAt?.toDate() || new Date(0);
          return bTime.getTime() - aTime.getTime();
        });
        lastReferralAt = sortedReferrals[0].data().completedAt;
      }

      return {
        referralCode: userData.referralCode,
        referredBy: userData.referredBy,
        referredUsers,
        totalReferrals,
        activeReferrals,
        storageEarnedGB,
        lastReferralAt,
      };
    } catch (error) {
      logger.error("Failed to get referral info", {userId, error});
      throw error;
    }
  }

  /**
   * Get maximum referral bonus for a plan
   */
  getMaxReferralBonus(plan: SubscriptionPlan, tier?: SubscriptionTier): number {
    if (plan === SubscriptionPlan.FREE) {
      return STORAGE_ALLOCATIONS.free.maxReferralBonusGB;
    }

    if (plan === SubscriptionPlan.INDIVIDUAL && tier === SubscriptionTier.PLUS) {
      return STORAGE_ALLOCATIONS.individual.plus.maxReferralBonusGB;
    }

    if (plan === SubscriptionPlan.FAMILY && tier) {
      switch (tier) {
      case SubscriptionTier.FAMILY_2_5TB:
      case SubscriptionTier.LITE:
        return STORAGE_ALLOCATIONS.family.family_2_5tb.maxReferralBonusGB;
      case SubscriptionTier.FAMILY_7_5TB:
        return STORAGE_ALLOCATIONS.family.family_7_5tb.maxReferralBonusGB;
      case SubscriptionTier.FAMILY_12TB:
      case SubscriptionTier.PRO:
        return STORAGE_ALLOCATIONS.family.family_12tb.maxReferralBonusGB;
      }
    }

    return 0;
  }

  /**
   * Clean up expired referrals
   */
  async cleanupExpiredReferrals(): Promise<number> {
    try {
      const now = Timestamp.now();
      const expiredReferrals = await this.db.collection("referrals")
        .where("status", "==", "pending")
        .where("expiresAt", "<=", now)
        .get();

      const batch = this.db.batch();
      let count = 0;

      expiredReferrals.docs.forEach((doc: any) => {
        batch.update(doc.ref, {
          status: "expired",
          updatedAt: now,
        });
        count++;
      });

      if (count > 0) {
        await batch.commit();
        logger.info("Cleaned up expired referrals", {count});
      }

      return count;
    } catch (error) {
      logger.error("Failed to cleanup expired referrals", {error});
      throw error;
    }
  }

  /**
   * Validate if user can still earn referral bonuses
   */
  async canEarnReferralBonus(userId: string): Promise<boolean> {
    try {
      const stats = await this.getReferralStats(userId);
      return stats.completedReferrals < REFERRAL_CONFIG.maxReferrals;
    } catch (error) {
      logger.error("Failed to check referral bonus eligibility", {userId, error});
      return false;
    }
  }

  /**
   * Check for potential referral fraud
   */
  async detectReferralFraud(
    referrerUserId: string,
    referredUserId: string,
    referredUserEmail: string
  ): Promise<{
    isSuspicious: boolean;
    reasons: string[];
  }> {
    try {
      const reasons: string[] = [];

      // Check for email similarity
      const referrerDoc = await this.db.collection("users").doc(referrerUserId).get();
      const referrerData = referrerDoc.data();

      if (referrerData?.email) {
        const referrerEmail = referrerData.email.toLowerCase();
        const referredEmailLower = referredUserEmail.toLowerCase();

        // Check if emails are too similar (same domain, similar usernames)
        const referrerDomain = referrerEmail.split("@")[1];
        const referredDomain = referredEmailLower.split("@")[1];

        if (referrerDomain === referredDomain) {
          const referrerUsername = referrerEmail.split("@")[0];
          const referredUsername = referredEmailLower.split("@")[0];

          // Check for very similar usernames
          if (this.calculateSimilarity(referrerUsername, referredUsername) > 0.8) {
            reasons.push("Similar email addresses detected");
          }
        }
      }

      // Check for rapid referrals from same IP (would need IP tracking)
      // For now, check for rapid referrals in general
      const recentReferrals = await this.db.collection("referrals")
        .where("referrerUserId", "==", referrerUserId)
        .where("createdAt", ">=", Timestamp.fromDate(new Date(Date.now() - 24 * 60 * 60 * 1000)))
        .get();

      if (recentReferrals.size > 5) {
        reasons.push("Too many referrals in 24 hours");
      }

      return {
        isSuspicious: reasons.length > 0,
        reasons,
      };
    } catch (error) {
      logger.error("Failed to detect referral fraud", {
        referrerUserId,
        referredUserId,
        error,
      });
      return {
        isSuspicious: false,
        reasons: [],
      };
    }
  }

  /**
   * Generate random alphanumeric code
   */
  private generateRandomCode(length: number): string {
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
    let result = "";
    for (let i = 0; i < length; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
  }

  /**
   * Calculate string similarity (simple Levenshtein-based)
   */
  private calculateSimilarity(str1: string, str2: string): number {
    const matrix = Array.from({length: str1.length + 1}, () =>
      Array.from({length: str2.length + 1}, () => 0)
    );

    for (let i = 0; i <= str1.length; i++) matrix[i][0] = i;
    for (let j = 0; j <= str2.length; j++) matrix[0][j] = j;

    for (let i = 1; i <= str1.length; i++) {
      for (let j = 1; j <= str2.length; j++) {
        const cost = str1[i - 1] === str2[j - 1] ? 0 : 1;
        matrix[i][j] = Math.min(
          matrix[i - 1][j] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j - 1] + cost
        );
      }
    }

    const maxLength = Math.max(str1.length, str2.length);
    return maxLength === 0 ? 1 : 1 - matrix[str1.length][str2.length] / maxLength;
  }
}
