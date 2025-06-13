import {getFirestore, Timestamp, FieldValue} from "firebase-admin/firestore";
import {logger} from "firebase-functions/v2";
import Stripe from "stripe";
import {
  Subscription,
  SubscriptionPlan,
  SubscriptionTier,
  SubscriptionStatus,
  FamilyPlanMember,
  SubscriptionAddon,
  ReferralInfo,
  AuditLogEntry,
  AuditAction,
} from "../types/subscription";
import {createError, ErrorCode} from "../utils/errors";
import {StripeService} from "./stripeService";
import {StorageCalculationService} from "./storageCalculationService";
// Note: Analytics services can be imported when needed
import {
  isEligibleForPlan,
  PLAN_LIMITS,
  getPlanFeatures,
  getStorageAllocation,
  getMonthlyPrice,
} from "../config/stripeProducts";

export interface CreateSubscriptionParams {
  userId: string;
  userEmail: string;
  stripeSubscriptionId: string;
  stripeCustomerId: string;
  plan: SubscriptionPlan;
  tier?: SubscriptionTier;
  interval: "month" | "year";
  status: SubscriptionStatus;
  currentPeriodStart: Date;
  currentPeriodEnd: Date;
  trialEnd?: Date;
  addons?: string[];
  referralCode?: string;
  familyMemberIds?: string[];
}

export interface UpdateSubscriptionParams {
  subscriptionId: string;
  plan?: SubscriptionPlan;
  tier?: SubscriptionTier;
  status?: SubscriptionStatus;
  addons?: SubscriptionAddon[];
  currentPeriodEnd?: Date;
  canceledAt?: Date;
  cancelReason?: string;
}

export interface AddFamilyMemberParams {
  subscriptionId: string;
  memberId: string;
  memberEmail: string;
  memberName: string;
  invitedBy: string;
}

export interface RemoveFamilyMemberParams {
  subscriptionId: string;
  memberId: string;
  removedBy: string;
  reason?: string;
}

export class SubscriptionService {
  private db = getFirestore();
  private stripeService: StripeService;
  private storageService: StorageCalculationService;

  constructor() {
    this.stripeService = new StripeService();
    this.storageService = new StorageCalculationService();
  }

  /**
   * Create a new subscription
   */
  async createSubscription(params: CreateSubscriptionParams): Promise<Subscription> {
    try {
      // Validate plan eligibility
      if (!isEligibleForPlan(params.plan, params.tier)) {
        throw createError(ErrorCode.INVALID_ARGUMENT, "Invalid plan configuration");
      }

      // Validate family members for family plan
      if (params.plan === SubscriptionPlan.FAMILY && params.familyMemberIds) {
        if (params.familyMemberIds.length > PLAN_LIMITS.family.maxMembers - 1) {
          throw createError(
            ErrorCode.FAMILY_MEMBER_LIMIT_EXCEEDED,
            `Family plan supports up to ${PLAN_LIMITS.family.maxMembers} members including the owner`
          );
        }
      }

      // Create subscription document
      const subscriptionId = params.stripeSubscriptionId;

      // Get plan features
      const features = this.getPlanFeatures(params.plan, params.tier);

      const subscription: Subscription = {
        id: subscriptionId,
        userId: params.userId,
        userEmail: params.userEmail,
        stripeSubscriptionId: params.stripeSubscriptionId,
        stripeCustomerId: params.stripeCustomerId,
        plan: params.plan,
        tier: params.tier,
        status: params.status,
        interval: params.interval,
        startDate: Timestamp.fromDate(params.currentPeriodStart),
        currentPeriodStart: Timestamp.fromDate(params.currentPeriodStart),
        currentPeriodEnd: Timestamp.fromDate(params.currentPeriodEnd),
        trialEnd: params.trialEnd ? Timestamp.fromDate(params.trialEnd) : undefined,
        canceledAt: undefined,
        cancelAtPeriodEnd: false,
        cancelReason: undefined,
        priceMonthly: this.getMonthlyPrice(params.plan, params.tier, params.interval),
        amount: this.getMonthlyPrice(params.plan, params.tier, params.interval) * 100, // Convert to cents
        planDisplayName: this.getPlanDisplayName(params.plan, params.tier),
        currency: "usd",
        lastPaymentStatus: "succeeded",
        lastPaymentAt: Timestamp.now(),
        addons: params.addons ?
          params.addons.map((type) => ({
            type: type as any,
            status: "active",
            addedAt: Timestamp.now(),
          })) :
          [],
        familyMembers: [],
        // OPTIMIZATION: Initialize activeMemberCount for family plans
        ...(params.plan === SubscriptionPlan.FAMILY ? {activeMemberCount: 0} : {}),
        referralInfo: await this.processReferralCode(params.userId, params.referralCode),
        metadata: {
          source: "web",
          createdVia: "checkout",
        },
        auditLog: [],
        createdAt: Timestamp.now(),
        updatedAt: Timestamp.now(),
        lastModifiedBy: params.userId,
        features,
        storageAllocation: {
          basePlanGB: getStorageAllocation(params.plan, params.tier),
          addonGB: 0,
          referralBonusGB: 0,
          totalGB: getStorageAllocation(params.plan, params.tier),
          usedBytes: 0,
          availableBytes: getStorageAllocation(params.plan, params.tier) * 1024 * 1024 * 1024,
          lastCalculated: Timestamp.now(),
        },
      };

      // Calculate initial storage allocation
      const storageResult = await this.storageService.calculateUserStorage(
        params.userId,
        subscription
      );

      subscription.storageAllocation = {
        basePlanGB: storageResult.basePlanGB,
        addonGB: storageResult.addonGB,
        referralBonusGB: storageResult.referralBonusGB,
        totalGB: storageResult.totalGB,
        usedBytes: storageResult.usedBytes,
        availableBytes: storageResult.availableBytes,
        lastCalculated: Timestamp.now(),
      };

      // Save to Firestore
      await this.db.collection("subscriptions").doc(subscriptionId).set(subscription);

      // Update user document
      await this.updateUserSubscriptionStatus(params.userId, {
        hasActiveSubscription: true,
        subscriptionId,
        plan: params.plan,
        tier: params.tier,
      });

      // Add audit log entry
      await this.addAuditLogEntry(subscriptionId, {
        action: AuditAction.SUBSCRIPTION_CREATED,
        performedBy: params.userId,
        details: {
          plan: params.plan,
          tier: params.tier,
          interval: params.interval,
        },
      });

      // Process family member invitations if applicable
      if (params.plan === SubscriptionPlan.FAMILY && params.familyMemberIds) {
        await this.processFamilyMemberInvitations(
          subscriptionId,
          params.userId,
          params.familyMemberIds
        );
      }

      // Note: Analytics tracking can be implemented when analytics services are integrated

      logger.info("Created subscription", {
        subscriptionId,
        userId: params.userId,
        plan: params.plan,
        tier: params.tier,
      });

      return subscription;
    } catch (error) {
      logger.error("Failed to create subscription", {params, error});
      throw error;
    }
  }

  /**
   * Get subscription by ID
   */
  async getSubscription(subscriptionId: string): Promise<Subscription | null> {
    const doc = await this.db.collection("subscriptions").doc(subscriptionId).get();
    return doc.exists ? (doc.data() as Subscription) : null;
  }

  /**
   * Get user's active subscription
   */
  async getUserSubscription(userId: string): Promise<Subscription | null> {
    const snapshot = await this.db
      .collection("subscriptions")
      .where("userId", "==", userId)
      .where("status", "in", [
        SubscriptionStatus.ACTIVE,
        SubscriptionStatus.TRIALING,
        SubscriptionStatus.PAST_DUE,
      ])
      .orderBy("createdAt", "desc")
      .limit(1)
      .get();

    if (snapshot.empty) {
      return null;
    }

    return snapshot.docs[0].data() as Subscription;
  }

  /**
   * Update subscription
   */
  async updateSubscription(params: UpdateSubscriptionParams): Promise<Subscription> {
    try {
      const subscriptionRef = this.db.collection("subscriptions").doc(params.subscriptionId);
      const subscriptionDoc = await subscriptionRef.get();

      if (!subscriptionDoc.exists) {
        throw createError(ErrorCode.SUBSCRIPTION_NOT_FOUND, "Subscription not found");
      }

      const currentSubscription = subscriptionDoc.data() as Subscription;
      const updates: Partial<Subscription> = {
        updatedAt: Timestamp.now(),
      };

      // Track changes for audit log
      const changes: Record<string, any> = {};

      // Update plan/tier
      if (params.plan !== undefined && params.plan !== currentSubscription.plan) {
        updates.plan = params.plan;
        changes.plan = {from: currentSubscription.plan, to: params.plan};

        if (params.tier !== undefined) {
          updates.tier = params.tier;
          changes.tier = {from: currentSubscription.tier, to: params.tier};
        }

        // Validate new plan
        if (!isEligibleForPlan(params.plan, params.tier)) {
          throw createError(ErrorCode.INVALID_ARGUMENT, "Invalid plan configuration");
        }
      }

      // Update status
      if (params.status !== undefined && params.status !== currentSubscription.status) {
        updates.status = params.status;
        changes.status = {from: currentSubscription.status, to: params.status};

        // Handle status-specific updates
        if (params.status === SubscriptionStatus.CANCELED) {
          updates.canceledAt = params.canceledAt ?
            Timestamp.fromDate(params.canceledAt) :
            Timestamp.now();
          updates.cancelReason = params.cancelReason;
        }
      }

      // Update addons
      if (params.addons !== undefined) {
        updates.addons = params.addons;
        changes.addons = {
          from: currentSubscription.addons,
          to: params.addons,
        };
      }

      // Update period end
      if (params.currentPeriodEnd !== undefined) {
        updates.currentPeriodEnd = Timestamp.fromDate(params.currentPeriodEnd);
      }

      // Perform update
      await subscriptionRef.update(updates);

      // Recalculate storage if plan/tier/addons changed
      if (changes.plan || changes.tier || changes.addons) {
        const updatedSubscription = {
          ...currentSubscription,
          ...updates,
        } as Subscription;

        await this.storageService.calculateUserStorage(
          currentSubscription.userId,
          updatedSubscription
        );
      }

      // Update user document
      if (changes.status || changes.plan) {
        await this.updateUserSubscriptionStatus(currentSubscription.userId, {
          hasActiveSubscription: params.status !== SubscriptionStatus.CANCELED,
          plan: updates.plan || currentSubscription.plan,
          tier: updates.tier || currentSubscription.tier,
        });
      }

      // Add audit log entry
      if (Object.keys(changes).length > 0) {
        await this.addAuditLogEntry(params.subscriptionId, {
          action: AuditAction.SUBSCRIPTION_UPDATED,
          performedBy: currentSubscription.userId,
          details: changes,
        });
      }

      // Get updated subscription for return and analytics
      const updatedDoc = await subscriptionRef.get();
      const updatedSubscription = updatedDoc.data() as Subscription;

      // Trigger analytics tracking for significant changes (async, don't block subscription update)
      if (Object.keys(changes).length > 0) {
        this.trackSubscriptionUpdated(updatedSubscription, changes).catch(
          (analyticsError: Error) => {
            logger.warn("Failed to track subscription update analytics", {
              subscriptionId: params.subscriptionId,
              userId: currentSubscription.userId,
              changes,
              error: analyticsError.message,
            });
          }
        );
      }

      return updatedSubscription;
    } catch (error) {
      logger.error("Failed to update subscription", {params, error});
      throw error;
    }
  }

  /**
   * Cancel subscription
   */
  async cancelSubscription(
    subscriptionId: string,
    reason?: string,
    cancelImmediately: boolean = false
  ): Promise<Subscription> {
    try {
      const subscription = await this.getSubscription(subscriptionId);
      if (!subscription) {
        throw createError(ErrorCode.SUBSCRIPTION_NOT_FOUND, "Subscription not found");
      }

      // Cancel in Stripe
      await this.stripeService.cancelSubscription({
        subscriptionId: subscription.stripeSubscriptionId || "",
        cancelImmediately,
        reason,
      });

      // Update local subscription
      const updates: UpdateSubscriptionParams = {
        subscriptionId,
        status: cancelImmediately ? SubscriptionStatus.CANCELED : subscription.status,
        canceledAt: cancelImmediately ? new Date() : undefined,
        cancelReason: reason,
      };

      return await this.updateSubscription(updates);
    } catch (error) {
      logger.error("Failed to cancel subscription", {subscriptionId, error});
      throw error;
    }
  }

  /**
   * Add family member to subscription
   */
  async addFamilyMember(params: AddFamilyMemberParams): Promise<void> {
    try {
      const subscriptionRef = this.db.collection("subscriptions").doc(params.subscriptionId);
      const subscriptionDoc = await subscriptionRef.get();

      if (!subscriptionDoc.exists) {
        throw createError(ErrorCode.SUBSCRIPTION_NOT_FOUND, "Subscription not found");
      }

      const subscription = subscriptionDoc.data() as Subscription;

      // Validate family plan
      if (subscription.plan !== SubscriptionPlan.FAMILY) {
        throw createError(ErrorCode.INVALID_ARGUMENT, "Not a family plan subscription");
      }

      // OPTIMIZATION: Use O(1) counter instead of O(n) array filtering
      // Check member limit using activeMemberCount counter
      const currentActiveCount = subscription.activeMemberCount || 0;
      if (currentActiveCount >= PLAN_LIMITS.family.maxMembers - 1) {
        throw createError(
          ErrorCode.FAMILY_MEMBER_LIMIT_EXCEEDED,
          `Maximum ${PLAN_LIMITS.family.maxMembers} members allowed including owner`
        );
      }

      // Check if member already exists
      const existingMember = subscription.familyMembers?.find((m) => m.userId === params.memberId);
      if (existingMember && existingMember.status === "active") {
        throw createError(ErrorCode.ALREADY_EXISTS, "Member already in family plan");
      }

      // Add or update member
      const newMember: FamilyPlanMember = {
        userId: params.memberId,
        email: params.memberEmail,
        displayName: params.memberName,
        joinedAt: Timestamp.now(),
        status: "active",
        invitedBy: params.invitedBy,
        invitedAt: Timestamp.now(),
      };

      const updatedMembers = subscription.familyMembers || [];
      const memberIndex = updatedMembers.findIndex((m) => m.userId === params.memberId);

      let isNewActiveMember = false;
      if (memberIndex >= 0) {
        // Update existing member
        const previousStatus = updatedMembers[memberIndex].status;
        updatedMembers[memberIndex] = newMember;
        isNewActiveMember = previousStatus !== "active"; // Only increment if changing to active
      } else {
        // Add new member
        updatedMembers.push(newMember);
        isNewActiveMember = true;
      }

      // OPTIMIZATION: Atomically update both familyMembers array and activeMemberCount
      const updates: any = {
        familyMembers: updatedMembers,
        updatedAt: Timestamp.now(),
      };

      // Only increment counter if adding a new active member
      if (isNewActiveMember) {
        updates.activeMemberCount = FieldValue.increment(1);
      }

      // Atomic update of subscription
      await subscriptionRef.update(updates);

      // Update member's user document
      await this.db.collection("users").doc(params.memberId).update({
        familyPlanOwnerId: subscription.userId,
        familyPlanJoinedAt: Timestamp.now(),
        updatedAt: Timestamp.now(),
      });

      // Add audit log
      await this.addAuditLogEntry(params.subscriptionId, {
        action: AuditAction.FAMILY_MEMBER_ADDED,
        performedBy: params.invitedBy,
        details: {
          memberId: params.memberId,
          memberEmail: params.memberEmail,
          isNewActiveMember,
        },
      });

      logger.info("Added family member", {
        subscriptionId: params.subscriptionId,
        memberId: params.memberId,
        isNewActiveMember,
        newActiveCount: currentActiveCount + (isNewActiveMember ? 1 : 0),
      });
    } catch (error) {
      logger.error("Failed to add family member", {params, error});
      throw error;
    }
  }

  /**
   * Remove family member from subscription
   */
  async removeFamilyMember(params: RemoveFamilyMemberParams): Promise<void> {
    try {
      const subscriptionRef = this.db.collection("subscriptions").doc(params.subscriptionId);
      const subscriptionDoc = await subscriptionRef.get();

      if (!subscriptionDoc.exists) {
        throw createError(ErrorCode.SUBSCRIPTION_NOT_FOUND, "Subscription not found");
      }

      const subscription = subscriptionDoc.data() as Subscription;

      // Find member
      const memberIndex =
        subscription.familyMembers?.findIndex(
          (m) => m.userId === params.memberId && m.status === "active"
        ) ?? -1;

      if (memberIndex === -1) {
        throw createError(ErrorCode.NOT_FOUND, "Family member not found");
      }

      const memberToRemove = subscription.familyMembers![memberIndex];
      const wasActive = memberToRemove.status === "active";

      // Update member status
      const updatedMembers = [...(subscription.familyMembers || [])];
      updatedMembers[memberIndex] = {
        ...updatedMembers[memberIndex],
        status: "removed",
        removedAt: Timestamp.now(),
        removedBy: params.removedBy,
        removalReason: params.reason,
      };

      // OPTIMIZATION: Atomically update both familyMembers array and activeMemberCount
      const updates: any = {
        familyMembers: updatedMembers,
        updatedAt: Timestamp.now(),
      };

      // Only decrement counter if removing an active member
      if (wasActive) {
        updates.activeMemberCount = FieldValue.increment(-1);
      }

      // Atomic update of subscription
      await subscriptionRef.update(updates);

      // Update member's user document
      await this.db.collection("users").doc(params.memberId).update({
        familyPlanOwnerId: FieldValue.delete(),
        familyPlanJoinedAt: FieldValue.delete(),
        familyPlanRemovedAt: Timestamp.now(),
        updatedAt: Timestamp.now(),
      });

      // Add audit log
      await this.addAuditLogEntry(params.subscriptionId, {
        action: AuditAction.FAMILY_MEMBER_REMOVED,
        performedBy: params.removedBy,
        details: {
          memberId: params.memberId,
          reason: params.reason,
          wasActive,
        },
      });

      logger.info("Removed family member", {
        subscriptionId: params.subscriptionId,
        memberId: params.memberId,
        wasActive,
        newActiveCount: (subscription.activeMemberCount || 0) - (wasActive ? 1 : 0),
      });
    } catch (error) {
      logger.error("Failed to remove family member", {params, error});
      throw error;
    }
  }

  /**
   * Sync subscription from Stripe
   */
  async syncFromStripe(stripeSubscriptionId: string): Promise<Subscription> {
    try {
      // Get subscription from Stripe
      const stripeSubscription = await this.stripeService.getSubscription(stripeSubscriptionId);

      // Find local subscription
      const snapshot = await this.db
        .collection("subscriptions")
        .where("stripeSubscriptionId", "==", stripeSubscriptionId)
        .limit(1)
        .get();

      if (snapshot.empty) {
        // Create new subscription if doesn't exist
        const userId = stripeSubscription.metadata.userId;
        if (!userId) {
          throw createError(ErrorCode.INVALID_ARGUMENT, "Missing userId in Stripe metadata");
        }

        const plan = stripeSubscription.metadata.plan as SubscriptionPlan;
        const tier = stripeSubscription.metadata.tier as SubscriptionTier;

        return await this.createSubscription({
          userId,
          userEmail: (stripeSubscription.customer as Stripe.Customer).email!,
          stripeSubscriptionId,
          stripeCustomerId: stripeSubscription.customer as string,
          plan,
          tier,
          interval: stripeSubscription.items.data[0].price.recurring?.interval as "month" | "year",
          status: this.stripeService.mapSubscriptionStatus(stripeSubscription.status),
          currentPeriodStart: new Date((stripeSubscription as any).current_period_start * 1000),
          currentPeriodEnd: new Date((stripeSubscription as any).current_period_end * 1000),
          trialEnd: stripeSubscription.trial_end ?
            new Date(stripeSubscription.trial_end * 1000) :
            undefined,
        });
      }

      // Update existing subscription
      const subscriptionId = snapshot.docs[0].id;
      const status = this.stripeService.mapSubscriptionStatus(stripeSubscription.status);

      return await this.updateSubscription({
        subscriptionId,
        status,
        currentPeriodEnd: new Date((stripeSubscription as any).current_period_end * 1000),
        canceledAt: stripeSubscription.canceled_at ?
          new Date(stripeSubscription.canceled_at * 1000) :
          undefined,
      });
    } catch (error) {
      logger.error("Failed to sync subscription from Stripe", {stripeSubscriptionId, error});
      throw error;
    }
  }

  /**
   * Process referral code
   */
  private async processReferralCode(
    userId: string,
    referralCode?: string
  ): Promise<ReferralInfo | undefined> {
    if (!referralCode) {
      return undefined;
    }

    try {
      // Find referrer by code
      const referrerSnapshot = await this.db
        .collection("users")
        .where("referralCode", "==", referralCode)
        .limit(1)
        .get();

      if (referrerSnapshot.empty) {
        logger.warn("Invalid referral code", {referralCode});
        return undefined;
      }

      const referrerId = referrerSnapshot.docs[0].id;

      // Create referral record
      await this.db.collection("referrals").add({
        referrerUserId: referrerId,
        referredUserId: userId,
        referralCode,
        status: "completed",
        createdAt: Timestamp.now(),
        completedAt: Timestamp.now(),
      });

      // Update referrer's referral count
      await this.db
        .collection("users")
        .doc(referrerId)
        .update({
          totalReferrals: FieldValue.increment(1),
          updatedAt: Timestamp.now(),
        });

      logger.info("Processed referral", {
        referrerId,
        referredUserId: userId,
        referralCode,
      });

      // Return referral info for the new user
      return {
        referralCode: referralCode,
        referredBy: referrerId,
        referredUsers: [],
        totalReferrals: 0,
        activeReferrals: 0,
        storageEarnedGB: 0,
      };
    } catch (error) {
      logger.error("Failed to process referral code", {referralCode, error});
      return undefined;
    }
  }

  /**
   * Process family member invitations
   */
  private async processFamilyMemberInvitations(
    subscriptionId: string,
    ownerId: string,
    memberIds: string[]
  ): Promise<void> {
    const ownerDoc = await this.db.collection("users").doc(ownerId).get();
    const ownerData = ownerDoc.data();

    for (const memberId of memberIds) {
      try {
        const memberDoc = await this.db.collection("users").doc(memberId).get();
        if (!memberDoc.exists) {
          logger.warn("Family member not found", {memberId});
          continue;
        }

        const memberData = memberDoc.data();

        // Send invitation (this would trigger an email notification)
        await this.db.collection("familyInvitations").add({
          subscriptionId,
          inviterId: ownerId,
          inviterEmail: ownerData?.email,
          inviterName: ownerData?.displayName,
          inviteeId: memberId,
          inviteeEmail: memberData?.email,
          status: "pending",
          createdAt: Timestamp.now(),
          expiresAt: Timestamp.fromDate(new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)), // 7 days
        });

        logger.info("Created family invitation", {
          subscriptionId,
          inviteeId: memberId,
        });
      } catch (error) {
        logger.error("Failed to create family invitation", {memberId, error});
      }
    }
  }

  /**
   * Update user subscription status
   */
  private async updateUserSubscriptionStatus(
    userId: string,
    updates: {
      hasActiveSubscription: boolean;
      subscriptionId?: string;
      plan?: SubscriptionPlan;
      tier?: SubscriptionTier;
    }
  ): Promise<void> {
    const userUpdates: any = {
      hasActiveSubscription: updates.hasActiveSubscription,
      updatedAt: Timestamp.now(),
    };

    if (updates.subscriptionId) {
      userUpdates.activeSubscriptionId = updates.subscriptionId;
    }

    if (updates.plan) {
      userUpdates.subscriptionPlan = updates.plan;
    }

    if (updates.tier) {
      userUpdates.subscriptionTier = updates.tier;
    }

    await this.db.collection("users").doc(userId).update(userUpdates);
  }

  /**
   * Add audit log entry
   */
  async addAuditLogEntry(
    subscriptionId: string,
    entry: Omit<AuditLogEntry, "timestamp">
  ): Promise<void> {
    const auditEntry: AuditLogEntry = {
      ...entry,
      timestamp: Timestamp.now(),
    };

    await this.db
      .collection("subscriptions")
      .doc(subscriptionId)
      .update({
        auditLog: FieldValue.arrayUnion(auditEntry),
      });
  }

  /**
   * Get user's subscription history
   */
  async getUserSubscriptionHistory(userId: string): Promise<Subscription[]> {
    const snapshot = await this.db
      .collection("subscriptions")
      .where("userId", "==", userId)
      .orderBy("createdAt", "desc")
      .get();

    return snapshot.docs.map((doc) => doc.data() as Subscription);
  }

  /**
   * Get plan features based on plan and tier
   */
  private getPlanFeatures(
    plan: SubscriptionPlan,
    tier?: SubscriptionTier
  ): Subscription["features"] {
    const features = getPlanFeatures(plan, tier);

    return {
      unlimitedPhotos: features.unlimitedPhotos,
      videoUpload: features.videoUpload,
      audioRecording: features.audioRecording,
      documentScanning: features.documentScanning,
      aiFeatures: features.aiFeatures,
      advancedSharing: features.advancedSharing,
      prioritySupport: features.prioritySupport,
    };
  }

  /**
   * Calculate monthly price for a plan
   */
  private getMonthlyPrice(
    plan: SubscriptionPlan,
    tier?: SubscriptionTier,
    interval?: "month" | "year"
  ): number {
    // Use pricing from configuration (pricing matrix)
    const monthlyPrice = getMonthlyPrice(plan, tier);

    // Apply yearly discount if applicable (10% discount for yearly)
    if (interval === "year") {
      return monthlyPrice * 0.9; // 10% yearly discount
    }

    return monthlyPrice;
  }

  /**
   * Get display name for a plan
   */
  private getPlanDisplayName(plan: SubscriptionPlan, tier?: SubscriptionTier): string {
    if (plan === SubscriptionPlan.FREE) {
      return "Dynasty Free";
    }

    if (plan === SubscriptionPlan.INDIVIDUAL) {
      return "Dynasty Individual Plus";
    }

    if (plan === SubscriptionPlan.FAMILY) {
      switch (tier) {
      case SubscriptionTier.FAMILY_2_5TB:
        return "Dynasty Family 2.5TB";
      case SubscriptionTier.FAMILY_7_5TB:
        return "Dynasty Family 7.5TB";
      case SubscriptionTier.FAMILY_12TB:
        return "Dynasty Family 12TB";
      default:
        return "Dynasty Family";
      }
    }

    return "Dynasty Plan";
  }

  /**
   * Get family members for a subscription
   */
  async getFamilyMembers(subscriptionId: string): Promise<FamilyPlanMember[]> {
    const subscription = await this.getSubscription(subscriptionId);
    if (!subscription || subscription.plan !== SubscriptionPlan.FAMILY) {
      return [];
    }

    return subscription.familyMembers?.filter((m) => m.status === "active") || [];
  }

  /**
   * Check if user can access premium features
   */
  async checkPremiumAccess(userId: string): Promise<{
    hasAccess: boolean;
    plan?: SubscriptionPlan;
    tier?: SubscriptionTier;
    isOwner: boolean;
    familyOwnerId?: string;
  }> {
    // Check if user has their own subscription
    const subscription = await this.getUserSubscription(userId);
    if (subscription && subscription.status === SubscriptionStatus.ACTIVE) {
      return {
        hasAccess: true,
        plan: subscription.plan,
        tier: subscription.tier,
        isOwner: true,
      };
    }

    // Check if user is part of a family plan
    const userDoc = await this.db.collection("users").doc(userId).get();
    const userData = userDoc.data();

    if (userData?.familyPlanOwnerId) {
      const familySubscription = await this.getUserSubscription(userData.familyPlanOwnerId);
      if (
        familySubscription &&
        familySubscription.status === SubscriptionStatus.ACTIVE &&
        familySubscription.plan === SubscriptionPlan.FAMILY
      ) {
        return {
          hasAccess: true,
          plan: SubscriptionPlan.FAMILY,
          isOwner: false,
          familyOwnerId: userData.familyPlanOwnerId,
        };
      }
    }

    return {
      hasAccess: false,
      isOwner: false,
    };
  }

  /**
   * Track subscription updates for analytics
   * Records subscription change events for real-time analytics and business intelligence
   * @param subscription - The updated subscription
   * @param changes - The changes made to the subscription
   */
  private async trackSubscriptionUpdated(
    subscription: Subscription,
    changes: Record<string, any>
  ): Promise<void> {
    const db = getFirestore();
    const timestamp = Timestamp.now();

    // Calculate revenue impact of changes
    let revenueImpact = 0;
    let previousMRR = 0;
    let currentMRR = 0;

    if (changes.plan || changes.tier || changes.status || changes.interval) {
      // Calculate previous MRR
      if (changes.status && changes.status.from === SubscriptionStatus.ACTIVE) {
        previousMRR = this.calculateMRR(
          changes.plan?.from || subscription.plan,
          changes.tier?.from || subscription.tier,
          changes.interval?.from || subscription.interval
        );
      }

      // Calculate current MRR
      if (subscription.status === SubscriptionStatus.ACTIVE) {
        currentMRR = this.calculateMRR(subscription.plan, subscription.tier, subscription.interval);
      }

      revenueImpact = currentMRR - previousMRR;
    }

    // Create subscription event record
    const eventData = {
      eventId: `evt_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`,
      subscriptionId: subscription.id,
      userId: subscription.userId,
      eventType: this.determineEventType(changes),
      timestamp,

      // Subscription state
      currentPlan: subscription.plan,
      currentTier: subscription.tier,
      currentStatus: subscription.status,
      currentInterval: subscription.interval,

      // Changes
      changes,
      changedFields: Object.keys(changes),

      // Revenue metrics
      previousMRR,
      currentMRR,
      revenueImpact,

      // Additional context
      stripeCustomerId: subscription.stripeCustomerId,
      stripeSubscriptionId: subscription.stripeSubscriptionId,
      isUpgrade: revenueImpact > 0,
      isDowngrade: revenueImpact < 0,

      // Metadata
      createdAt: timestamp,
      year: new Date().getFullYear(),
      month: new Date().getMonth() + 1,
      day: new Date().getDate(),
    };

    // Store event in subscription_events collection for analytics
    await db.collection("subscription_events").add(eventData);

    // Update real-time metrics cache
    await this.updateRealtimeMetrics(subscription, revenueImpact);

    logger.info("Subscription event tracked for analytics", {
      eventId: eventData.eventId,
      subscriptionId: subscription.id,
      eventType: eventData.eventType,
      revenueImpact,
    });
  }

  /**
   * Calculate Monthly Recurring Revenue for a subscription
   */
  private calculateMRR(
    plan: SubscriptionPlan,
    tier?: SubscriptionTier,
    interval?: "month" | "year"
  ): number {
    const monthlyPrice = this.getMonthlyPrice(plan, tier, interval);
    return monthlyPrice;
  }

  /**
   * Determine the type of subscription event based on changes
   */
  private determineEventType(changes: Record<string, any>): string {
    if (changes.status) {
      if (changes.status.to === SubscriptionStatus.CANCELED) return "subscription.canceled";
      if (
        changes.status.to === SubscriptionStatus.ACTIVE &&
        changes.status.from === SubscriptionStatus.TRIALING
      ) {
        return "subscription.trial_ended";
      }
      if (changes.status.to === SubscriptionStatus.ACTIVE) return "subscription.activated";
    }

    if (changes.plan || changes.tier) {
      const isPlanUpgrade = changes.plan && this.isPlanUpgrade(changes.plan.from, changes.plan.to);
      const isTierUpgrade = changes.tier && this.isTierUpgrade(changes.tier.from, changes.tier.to);

      if (isPlanUpgrade || isTierUpgrade) return "subscription.upgraded";
      return "subscription.downgraded";
    }

    if (changes.addons) return "subscription.addon_changed";
    if (changes.interval) return "subscription.interval_changed";

    return "subscription.updated";
  }

  /**
   * Check if plan change is an upgrade
   */
  private isPlanUpgrade(fromPlan: SubscriptionPlan, toPlan: SubscriptionPlan): boolean {
    const planHierarchy = {
      [SubscriptionPlan.FREE]: 0,
      [SubscriptionPlan.INDIVIDUAL]: 1,
      [SubscriptionPlan.FAMILY]: 2,
    };

    return planHierarchy[toPlan] > planHierarchy[fromPlan];
  }

  /**
   * Check if tier change is an upgrade
   */
  private isTierUpgrade(fromTier: SubscriptionTier, toTier: SubscriptionTier): boolean {
    const tierHierarchy: Record<SubscriptionTier, number> = {
      [SubscriptionTier.LITE]: 0, // Legacy
      [SubscriptionTier.PLUS]: 1, // Individual Plus
      [SubscriptionTier.PRO]: 1, // Legacy Pro (same level as Plus)
      [SubscriptionTier.FAMILY_2_5TB]: 2,
      [SubscriptionTier.FAMILY_7_5TB]: 3,
      [SubscriptionTier.FAMILY_12TB]: 4,
    };

    const fromValue = tierHierarchy[fromTier] ?? 0;
    const toValue = tierHierarchy[toTier] ?? 0;

    return toValue > fromValue;
  }

  /**
   * Update real-time metrics cache for dashboard
   */
  private async updateRealtimeMetrics(
    subscription: Subscription,
    revenueImpact: number
  ): Promise<void> {
    const db = getFirestore();
    const metricsRef = db.collection("realtime_metrics").doc("current");

    await db.runTransaction(async (transaction) => {
      const metricsDoc = await transaction.get(metricsRef);
      const currentMetrics = metricsDoc.exists ?
        metricsDoc.data() :
        {
          totalMRR: 0,
          activeSubscriptions: 0,
          lastUpdated: Timestamp.now(),
          subscriptions: {},
        };

      // Update metrics based on subscription status
      const updates: any = {
        lastUpdated: Timestamp.now(),
      };

      if (revenueImpact !== 0) {
        updates.totalMRR = FieldValue.increment(revenueImpact);
      }

      const hasExistingSubscription = currentMetrics?.subscriptions?.[subscription.id];

      if (subscription.status === SubscriptionStatus.ACTIVE && !hasExistingSubscription) {
        updates.activeSubscriptions = FieldValue.increment(1);
      } else if (subscription.status === SubscriptionStatus.CANCELED && hasExistingSubscription) {
        updates.activeSubscriptions = FieldValue.increment(-1);
      }

      // Track individual subscription state
      updates[`subscriptions.${subscription.id}`] = {
        plan: subscription.plan,
        status: subscription.status,
        mrr:
          subscription.status === SubscriptionStatus.ACTIVE ?
            this.calculateMRR(subscription.plan, subscription.tier, subscription.interval) :
            0,
      };

      if (metricsDoc.exists) {
        transaction.update(metricsRef, updates);
      } else {
        // Create the document if it doesn't exist
        transaction.set(metricsRef, {
          ...currentMetrics,
          ...updates,
        });
      }
    });
  }
}
