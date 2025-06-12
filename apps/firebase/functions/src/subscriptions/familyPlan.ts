import { getFirestore, Timestamp, FieldValue } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions/v2';
import {
  Subscription,
  SubscriptionPlan,
  FamilyPlanMember,
  AuditAction,
} from '../types/subscription';
import { createError, ErrorCode } from '../utils/errors';
import { SubscriptionService } from '../services/subscriptionService';
import { StorageCalculationService } from '../services/storageCalculationService';
import { PLAN_LIMITS } from '../config/stripeProducts';

export interface FamilyMemberInvitation {
  id: string;
  subscriptionId: string;
  familyOwnerId: string;
  familyOwnerEmail: string;
  familyOwnerName: string;
  memberId: string;
  memberEmail: string;
  memberName: string;
  invitedBy: string;
  invitedAt: Timestamp;
  expiresAt: Timestamp;
  status: 'pending' | 'accepted' | 'declined' | 'expired' | 'revoked';
  acceptedAt?: Timestamp;
  declinedAt?: Timestamp;
  revokedAt?: Timestamp;
  revokedBy?: string;
  metadata?: Record<string, any>;
}

export interface FamilyMemberValidationResult {
  isValid: boolean;
  reason?: string;
  member?: {
    userId: string;
    email: string;
    displayName: string;
  };
}

export interface FamilyStorageReport {
  totalFamilyStorageGB: number;
  usedStorageGB: number;
  availableStorageGB: number;
  usagePercentage: number;
  memberUsage: Array<{
    userId: string;
    email: string;
    displayName: string;
    usageGB: number;
    usagePercentage: number;
    lastActivity?: Timestamp;
  }>;
  storageWarnings: Array<{
    type: 'approaching_limit' | 'over_limit' | 'member_inactive';
    message: string;
    data?: any;
  }>;
}

export interface AddFamilyMemberParams {
  subscriptionId: string;
  familyOwnerId: string;
  memberId: string;
  memberEmail: string;
  memberName: string;
  invitedBy: string;
  skipFamilyTreeVerification?: boolean;
  sendInvitationEmail?: boolean;
}

export interface RemoveFamilyMemberParams {
  subscriptionId: string;
  familyOwnerId: string;
  memberId: string;
  removedBy: string;
  reason?: string;
  gracePeriodDays?: number;
  notifyMember?: boolean;
}

export class FamilyPlanService {
  private db = getFirestore();
  private subscriptionService: SubscriptionService;
  private storageService: StorageCalculationService;

  constructor() {
    this.subscriptionService = new SubscriptionService();
    this.storageService = new StorageCalculationService();
  }

  /**
   * Add family member with enhanced validation and invitation system
   */
  async addFamilyMember(params: AddFamilyMemberParams): Promise<FamilyMemberInvitation> {
    try {
      // Get subscription and validate
      const subscription = await this.subscriptionService.getSubscription(params.subscriptionId);
      if (!subscription) {
        throw createError(ErrorCode.SUBSCRIPTION_NOT_FOUND, 'Subscription not found');
      }

      if (subscription.plan !== SubscriptionPlan.FAMILY) {
        throw createError(ErrorCode.INVALID_ARGUMENT, 'Not a family plan subscription');
      }

      if (subscription.userId !== params.familyOwnerId) {
        throw createError(ErrorCode.PERMISSION_DENIED, 'Only family owner can add members');
      }

      // Validate family member
      const validation = await this.validateFamilyMember(params.memberId, params.subscriptionId);
      if (!validation.isValid) {
        throw createError(ErrorCode.INVALID_ARGUMENT, validation.reason || 'Invalid family member');
      }

      // OPTIMIZATION: Use O(1) counter instead of O(n) array filtering
      // Check family size limit using activeMemberCount counter
      const currentActiveCount = subscription.activeMemberCount || 0;
      if (currentActiveCount >= PLAN_LIMITS.family.maxMembers - 1) {
        // -1 for owner
        throw createError(
          ErrorCode.FAMILY_MEMBER_LIMIT_EXCEEDED,
          `Family plan supports up to ${PLAN_LIMITS.family.maxMembers} members including the owner`
        );
      }

      // Verify family tree relationship (unless skipped)
      if (!params.skipFamilyTreeVerification) {
        const isRelated = await this.verifyFamilyTreeRelationship(
          params.familyOwnerId,
          params.memberId
        );
        if (!isRelated) {
          throw createError(
            ErrorCode.FAMILY_RELATIONSHIP_NOT_VERIFIED,
            'Family relationship could not be verified in family tree'
          );
        }
      }

      // Create invitation
      const invitation = await this.createFamilyInvitation({
        subscriptionId: params.subscriptionId,
        familyOwnerId: params.familyOwnerId,
        memberId: params.memberId,
        memberEmail: params.memberEmail,
        memberName: params.memberName,
        invitedBy: params.invitedBy,
      });

      // Add pending member to subscription
      const memberToAdd: FamilyPlanMember = {
        userId: params.memberId,
        email: params.memberEmail,
        displayName: params.memberName,
        role: 'member',
        status: 'invited',
        invitedAt: Timestamp.now(),
        invitedBy: params.invitedBy,
        addedBy: params.invitedBy,
        storageUsedBytes: 0,
      };

      await this.db
        .collection('subscriptions')
        .doc(params.subscriptionId)
        .update({
          familyMembers: FieldValue.arrayUnion(memberToAdd),
          updatedAt: Timestamp.now(),
          lastModifiedBy: params.invitedBy,
        });

      // Add audit log entry
      await this.subscriptionService.addAuditLogEntry(params.subscriptionId, {
        action: AuditAction.FAMILY_MEMBER_ADDED,
        performedBy: params.invitedBy,
        details: {
          memberId: params.memberId,
          memberEmail: params.memberEmail,
          memberName: params.memberName,
          invitationId: invitation.id,
        },
      });

      // Send invitation email if requested
      if (params.sendInvitationEmail !== false) {
        await this.sendFamilyInvitationEmail(invitation);
      }

      logger.info('Family member added successfully', {
        subscriptionId: params.subscriptionId,
        memberId: params.memberId,
        invitationId: invitation.id,
        invitedBy: params.invitedBy,
      });

      return invitation;
    } catch (error) {
      logger.error('Failed to add family member', { params, error });
      throw error;
    }
  }

  /**
   * Remove family member with consent tracking and grace period
   */
  async removeFamilyMember(params: RemoveFamilyMemberParams): Promise<void> {
    try {
      // Get subscription and validate
      const subscription = await this.subscriptionService.getSubscription(params.subscriptionId);
      if (!subscription) {
        throw createError(ErrorCode.SUBSCRIPTION_NOT_FOUND, 'Subscription not found');
      }

      if (subscription.userId !== params.familyOwnerId) {
        throw createError(ErrorCode.PERMISSION_DENIED, 'Only family owner can remove members');
      }

      // Find the member
      const memberIndex = subscription.familyMembers?.findIndex(m => m.userId === params.memberId);
      if (memberIndex === undefined || memberIndex === -1) {
        throw createError(ErrorCode.NOT_FOUND, 'Family member not found');
      }

      const member = subscription.familyMembers![memberIndex];

      // Check if member has accepted the invitation
      const hasAcceptedInvitation = member.status === 'active' && member.acceptedAt;

      // Calculate grace period if applicable
      const gracePeriodDays = params.gracePeriodDays || (hasAcceptedInvitation ? 7 : 0);
      const gracePeriodEnd =
        gracePeriodDays > 0
          ? new Date(Date.now() + gracePeriodDays * 24 * 60 * 60 * 1000)
          : new Date();

      // Update member status
      const updatedMember: FamilyPlanMember = {
        ...member,
        status: 'removed',
        removedAt: Timestamp.now(),
        removedBy: params.removedBy,
        removalReason: params.reason,
      };

      // Update subscription
      const updatedMembers = [...(subscription.familyMembers || [])];
      updatedMembers[memberIndex] = updatedMember;

      await this.db.collection('subscriptions').doc(params.subscriptionId).update({
        familyMembers: updatedMembers,
        updatedAt: Timestamp.now(),
        lastModifiedBy: params.removedBy,
      });

      // Update member's user document to remove family plan access
      await this.db.collection('users').doc(params.memberId).update({
        familyPlanOwnerId: FieldValue.delete(),
        familyPlanStatus: 'removed',
        familyPlanRemovedAt: Timestamp.now(),
        updatedAt: Timestamp.now(),
      });

      // Add audit log entry
      await this.subscriptionService.addAuditLogEntry(params.subscriptionId, {
        action: AuditAction.FAMILY_MEMBER_REMOVED,
        performedBy: params.removedBy,
        details: {
          memberId: params.memberId,
          memberEmail: member.email,
          memberName: member.displayName,
          reason: params.reason,
          gracePeriodDays,
          gracePeriodEnd: gracePeriodEnd.toISOString(),
        },
      });

      // Send removal notification if requested
      if (params.notifyMember !== false) {
        await this.sendFamilyRemovalNotification(member, params.reason, gracePeriodDays);
      }

      // Recalculate family storage allocation
      await this.recalculateFamilyStorage(params.subscriptionId);

      logger.info('Family member removed successfully', {
        subscriptionId: params.subscriptionId,
        memberId: params.memberId,
        removedBy: params.removedBy,
        reason: params.reason,
        gracePeriodDays,
      });
    } catch (error) {
      logger.error('Failed to remove family member', { params, error });
      throw error;
    }
  }

  /**
   * Accept family plan invitation
   */
  async acceptFamilyInvitation(invitationId: string, memberId: string): Promise<void> {
    try {
      // Get invitation
      const invitationDoc = await this.db.collection('familyInvitations').doc(invitationId).get();
      if (!invitationDoc.exists) {
        throw createError(ErrorCode.NOT_FOUND, 'Invitation not found');
      }

      const invitation = invitationDoc.data() as FamilyMemberInvitation;

      // Validate invitation
      if (invitation.memberId !== memberId) {
        throw createError(ErrorCode.PERMISSION_DENIED, 'Not authorized to accept this invitation');
      }

      if (invitation.status !== 'pending') {
        throw createError(ErrorCode.INVALID_ARGUMENT, `Invitation is ${invitation.status}`);
      }

      if (invitation.expiresAt.toDate() < new Date()) {
        throw createError(ErrorCode.INVITATION_EXPIRED, 'Invitation has expired');
      }

      // Update invitation status
      await this.db.collection('familyInvitations').doc(invitationId).update({
        status: 'accepted',
        acceptedAt: Timestamp.now(),
        updatedAt: Timestamp.now(),
      });

      // Update subscription
      const subscriptionRef = this.db.collection('subscriptions').doc(invitation.subscriptionId);
      const subscriptionDoc = await subscriptionRef.get();

      if (!subscriptionDoc.exists) {
        throw createError(ErrorCode.SUBSCRIPTION_NOT_FOUND, 'Subscription not found');
      }

      const subscription = subscriptionDoc.data() as Subscription;
      const memberIndex = subscription.familyMembers?.findIndex(m => m.userId === memberId);

      if (memberIndex !== undefined && memberIndex !== -1) {
        const updatedMembers = [...(subscription.familyMembers || [])];
        updatedMembers[memberIndex] = {
          ...updatedMembers[memberIndex],
          status: 'active',
          acceptedAt: Timestamp.now(),
          joinedAt: Timestamp.now(),
        };

        await subscriptionRef.update({
          familyMembers: updatedMembers,
          updatedAt: Timestamp.now(),
        });
      }

      // Update member's user document
      await this.db.collection('users').doc(memberId).update({
        familyPlanOwnerId: invitation.familyOwnerId,
        familyPlanStatus: 'active',
        familyPlanJoinedAt: Timestamp.now(),
        updatedAt: Timestamp.now(),
      });

      // Send welcome notification
      await this.sendFamilyWelcomeNotification(invitation);

      logger.info('Family invitation accepted', {
        invitationId,
        subscriptionId: invitation.subscriptionId,
        memberId,
        familyOwnerId: invitation.familyOwnerId,
      });
    } catch (error) {
      logger.error('Failed to accept family invitation', { invitationId, memberId, error });
      throw error;
    }
  }

  /**
   * Generate family storage report
   */
  async generateFamilyStorageReport(subscriptionId: string): Promise<FamilyStorageReport> {
    try {
      // Get subscription
      const subscription = await this.subscriptionService.getSubscription(subscriptionId);
      if (!subscription) {
        throw createError(ErrorCode.SUBSCRIPTION_NOT_FOUND, 'Subscription not found');
      }

      if (subscription.plan !== SubscriptionPlan.FAMILY) {
        throw createError(ErrorCode.INVALID_ARGUMENT, 'Not a family plan subscription');
      }

      // Calculate family storage
      const familyStorage = await this.storageService.calculateFamilyStorage(
        subscription.userId,
        subscription
      );

      // Build member usage array
      const memberUsage = familyStorage.memberBreakdown.map(member => ({
        userId: member.userId,
        email: member.email,
        displayName: member.displayName,
        usageGB: Math.round((member.usageBytes / (1024 * 1024 * 1024)) * 100) / 100,
        usagePercentage: member.usagePercentage,
        lastActivity: undefined, // Could be enhanced to track last activity
      }));

      // Generate warnings
      const warnings: FamilyStorageReport['storageWarnings'] = [];
      const usagePercentage =
        (familyStorage.sharedUsageBytes /
          (familyStorage.totalFamilyStorageGB * 1024 * 1024 * 1024)) *
        100;

      if (usagePercentage > 90) {
        warnings.push({
          type: 'approaching_limit',
          message: 'Family storage is over 90% full. Consider upgrading or removing files.',
          data: { usagePercentage },
        });
      }

      if (familyStorage.availableBytes <= 0) {
        warnings.push({
          type: 'over_limit',
          message: 'Family storage limit exceeded. New uploads will be blocked.',
          data: { overageBytes: Math.abs(familyStorage.availableBytes) },
        });
      }

      return {
        totalFamilyStorageGB: familyStorage.totalFamilyStorageGB,
        usedStorageGB:
          Math.round((familyStorage.sharedUsageBytes / (1024 * 1024 * 1024)) * 100) / 100,
        availableStorageGB:
          Math.round((familyStorage.availableBytes / (1024 * 1024 * 1024)) * 100) / 100,
        usagePercentage,
        memberUsage,
        storageWarnings: warnings,
      };
    } catch (error) {
      logger.error('Failed to generate family storage report', { subscriptionId, error });
      throw error;
    }
  }

  /**
   * Validate family member eligibility
   */
  private async validateFamilyMember(
    memberId: string,
    subscriptionId: string
  ): Promise<FamilyMemberValidationResult> {
    try {
      // Check if member exists
      const memberDoc = await this.db.collection('users').doc(memberId).get();
      if (!memberDoc.exists) {
        return { isValid: false, reason: 'User not found' };
      }

      const memberData = memberDoc.data()!;

      // Check if member is already in this family plan
      const subscription = await this.subscriptionService.getSubscription(subscriptionId);
      const isAlreadyMember = subscription?.familyMembers?.some(
        m => m.userId === memberId && (m.status === 'active' || m.status === 'invited')
      );

      if (isAlreadyMember) {
        return { isValid: false, reason: 'User is already a member of this family plan' };
      }

      // Check if member is in another family plan
      if (memberData.familyPlanOwnerId) {
        return { isValid: false, reason: 'User is already in another family plan' };
      }

      // Check if member has their own subscription
      const memberSubscription = await this.subscriptionService.getUserSubscription(memberId);
      if (memberSubscription && memberSubscription.status === 'active') {
        return { isValid: false, reason: 'User has their own active subscription' };
      }

      return {
        isValid: true,
        member: {
          userId: memberId,
          email: memberData.email,
          displayName: memberData.displayName || memberData.email,
        },
      };
    } catch (error) {
      logger.error('Failed to validate family member', { memberId, subscriptionId, error });
      return { isValid: false, reason: 'Validation failed' };
    }
  }

  /**
   * Verify family tree relationship
   */
  private async verifyFamilyTreeRelationship(ownerId: string, memberId: string): Promise<boolean> {
    try {
      // This would integrate with your family tree service
      // For now, we'll implement a basic check

      // Get family tree connections for the owner
      const connectionsQuery = await this.db
        .collection('familyConnections')
        .where('fromUserId', '==', ownerId)
        .where('toUserId', '==', memberId)
        .where('verified', '==', true)
        .limit(1)
        .get();

      if (!connectionsQuery.empty) {
        return true;
      }

      // Check reverse connection
      const reverseConnectionsQuery = await this.db
        .collection('familyConnections')
        .where('fromUserId', '==', memberId)
        .where('toUserId', '==', ownerId)
        .where('verified', '==', true)
        .limit(1)
        .get();

      return !reverseConnectionsQuery.empty;
    } catch (error) {
      logger.error('Failed to verify family tree relationship', { ownerId, memberId, error });
      return false;
    }
  }

  /**
   * Create family invitation
   */
  private async createFamilyInvitation(params: {
    subscriptionId: string;
    familyOwnerId: string;
    memberId: string;
    memberEmail: string;
    memberName: string;
    invitedBy: string;
  }): Promise<FamilyMemberInvitation> {
    // Get family owner details
    const ownerDoc = await this.db.collection('users').doc(params.familyOwnerId).get();
    const ownerData = ownerDoc.data();

    const invitation: FamilyMemberInvitation = {
      id: '', // Will be set by Firestore
      subscriptionId: params.subscriptionId,
      familyOwnerId: params.familyOwnerId,
      familyOwnerEmail: ownerData?.email || '',
      familyOwnerName: ownerData?.displayName || ownerData?.email || '',
      memberId: params.memberId,
      memberEmail: params.memberEmail,
      memberName: params.memberName,
      invitedBy: params.invitedBy,
      invitedAt: Timestamp.now(),
      expiresAt: Timestamp.fromDate(new Date(Date.now() + 14 * 24 * 60 * 60 * 1000)), // 14 days
      status: 'pending',
    };

    const docRef = await this.db.collection('familyInvitations').add(invitation);
    invitation.id = docRef.id;

    return invitation;
  }

  /**
   * Recalculate family storage allocation
   */
  private async recalculateFamilyStorage(subscriptionId: string): Promise<void> {
    try {
      const subscription = await this.subscriptionService.getSubscription(subscriptionId);
      if (!subscription) return;

      const storageResult = await this.storageService.calculateFamilyStorage(
        subscription.userId,
        subscription
      );

      await this.db.collection('subscriptions').doc(subscriptionId).update({
        'storageAllocation.lastCalculated': Timestamp.now(),
        updatedAt: Timestamp.now(),
      });

      logger.info('Family storage recalculated', {
        subscriptionId,
        totalStorageGB: storageResult.totalFamilyStorageGB,
        usedBytes: storageResult.sharedUsageBytes,
      });
    } catch (error) {
      logger.error('Failed to recalculate family storage', { subscriptionId, error });
    }
  }

  /**
   * Send family invitation email
   */
  private async sendFamilyInvitationEmail(invitation: FamilyMemberInvitation): Promise<void> {
    try {
      // This would integrate with your email service
      logger.info('Would send family invitation email', {
        to: invitation.memberEmail,
        from: invitation.familyOwnerEmail,
        invitationId: invitation.id,
      });

      // TODO: Implement email sending logic
      // await emailService.sendFamilyInvitation(invitation);
    } catch (error) {
      logger.error('Failed to send family invitation email', { invitation, error });
    }
  }

  /**
   * Send family removal notification
   */
  private async sendFamilyRemovalNotification(
    member: FamilyPlanMember,
    reason?: string,
    gracePeriodDays?: number
  ): Promise<void> {
    try {
      logger.info('Would send family removal notification', {
        to: member.email,
        memberId: member.userId,
        reason,
        gracePeriodDays,
      });

      // TODO: Implement notification sending logic
    } catch (error) {
      logger.error('Failed to send family removal notification', { member, error });
    }
  }

  /**
   * Send family welcome notification
   */
  private async sendFamilyWelcomeNotification(invitation: FamilyMemberInvitation): Promise<void> {
    try {
      logger.info('Would send family welcome notification', {
        to: invitation.memberEmail,
        familyOwner: invitation.familyOwnerName,
      });

      // TODO: Implement welcome notification logic
    } catch (error) {
      logger.error('Failed to send family welcome notification', { invitation, error });
    }
  }
}
