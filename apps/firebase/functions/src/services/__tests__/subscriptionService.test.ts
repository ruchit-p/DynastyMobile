/**
 * Comprehensive unit tests for SubscriptionService
 * Tests all subscription business logic and database operations
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { SubscriptionService } from '../subscriptionService';
import {
  SubscriptionPlan,
  SubscriptionTier,
  SubscriptionStatus,
  AuditAction,
} from '../../types/subscription';
import { ErrorCode } from '../../utils/errors';
import { StripeTestEnvironment, testDataGenerators } from '../../__tests__/utils/testHelpers';

// Create test environment
const testEnv = new StripeTestEnvironment();

// Mock all dependencies
jest.mock('../../services/stripeService');
jest.mock('../../services/storageCalculationService');
jest.mock('../../config/stripeProducts');
jest.mock('firebase-admin/firestore');
jest.mock('firebase-functions/v2');

describe('SubscriptionService', () => {
  let subscriptionService: SubscriptionService;
  let mockStorageService: any;
  let mockStripeService: any;

  beforeEach(async () => {
    testEnv.setup();
    testEnv.mockRateLimitPassing();

    // Mock storage calculation service
    mockStorageService = {
      calculateUserStorage: jest.fn().mockResolvedValue({
        basePlanGB: 10,
        addonGB: 0,
        referralBonusGB: 2,
        totalGB: 12,
        usedBytes: 1000000,
        availableBytes: 12884901888, // 12GB in bytes
      }),
    };

    // Mock Stripe service
    mockStripeService = {
      createOrGetCustomer: jest.fn(),
      createCheckoutSession: jest.fn(),
      updateSubscription: jest.fn(),
    };

    // Mock stripeProducts functions
    const stripeProducts = await import('../../config/stripeProducts');
    const isEligibleForPlan = stripeProducts.isEligibleForPlan as jest.Mock;
    const getPlanFeatures = stripeProducts.getPlanFeatures as jest.Mock;
    const getStorageAllocation = stripeProducts.getStorageAllocation as jest.Mock;
    const getMonthlyPrice = stripeProducts.getMonthlyPrice as jest.Mock;

    isEligibleForPlan.mockReturnValue(true);
    stripeProducts.PLAN_LIMITS = {
      family: { maxMembers: 5 },
      individual: { maxMembers: 1 },
    };
    getPlanFeatures.mockReturnValue({
      unlimitedFamilyTree: true,
      prioritySupport: true,
      advancedSecurity: true,
    });
    getStorageAllocation.mockReturnValue(10);
    getMonthlyPrice.mockReturnValue(9.99);

    subscriptionService = new SubscriptionService();

    // Inject mocks
    (subscriptionService as any).storageService = mockStorageService;
    (subscriptionService as any).stripeService = mockStripeService;
  });

  afterEach(() => {
    testEnv.teardown();
  });

  describe('createSubscription', () => {
    const createParams = {
      userId: 'test-user-id',
      userEmail: 'test@example.com',
      stripeSubscriptionId: 'sub_test_123',
      stripeCustomerId: 'cus_test_123',
      plan: SubscriptionPlan.INDIVIDUAL,
      tier: SubscriptionTier.PLUS,
      interval: 'month' as const,
      status: SubscriptionStatus.ACTIVE,
      currentPeriodStart: new Date(),
      currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    };

    it('should create individual subscription successfully', async () => {
      // Setup mocks
      (subscriptionService as any).processReferralCode = jest.fn().mockResolvedValue(null);
      (subscriptionService as any).updateUserSubscriptionStatus = jest.fn();
      (subscriptionService as any).addAuditLogEntry = jest.fn();
      (subscriptionService as any).getPlanFeatures = jest.fn().mockReturnValue({
        unlimitedFamilyTree: true,
      });
      (subscriptionService as any).getMonthlyPrice = jest.fn().mockReturnValue(9.99);
      (subscriptionService as any).getPlanDisplayName = jest
        .fn()
        .mockReturnValue('Individual Plus');

      // Execute
      const result = await subscriptionService.createSubscription(createParams);

      // Verify
      expect(result).toMatchObject({
        id: createParams.stripeSubscriptionId,
        userId: createParams.userId,
        plan: createParams.plan,
        tier: createParams.tier,
        status: createParams.status,
      });

      // Verify Firestore operations
      expect(testEnv.mockFirestore.collection).toHaveBeenCalledWith('subscriptions');
      expect(testEnv.mockFirestore.collection().doc().set).toHaveBeenCalledWith(
        expect.objectContaining({
          id: createParams.stripeSubscriptionId,
          userId: createParams.userId,
          plan: createParams.plan,
          tier: createParams.tier,
        })
      );

      // Verify audit log
      expect((subscriptionService as any).addAuditLogEntry).toHaveBeenCalledWith(
        createParams.stripeSubscriptionId,
        expect.objectContaining({
          action: AuditAction.SUBSCRIPTION_CREATED,
          performedBy: createParams.userId,
        })
      );
    });

    it('should create family subscription with members', async () => {
      // Setup mocks
      const familyParams = {
        ...createParams,
        plan: SubscriptionPlan.FAMILY,
        tier: SubscriptionTier.FAMILY_2_5TB,
        familyMemberIds: ['member1', 'member2'],
      };

      (subscriptionService as any).processReferralCode = jest.fn().mockResolvedValue(null);
      (subscriptionService as any).updateUserSubscriptionStatus = jest.fn();
      (subscriptionService as any).addAuditLogEntry = jest.fn();
      (subscriptionService as any).processFamilyMemberInvitations = jest.fn();
      (subscriptionService as any).getPlanFeatures = jest.fn().mockReturnValue({});
      (subscriptionService as any).getMonthlyPrice = jest.fn().mockReturnValue(19.99);
      (subscriptionService as any).getPlanDisplayName = jest.fn().mockReturnValue('Family 2.5TB');

      // Execute
      const result = await subscriptionService.createSubscription(familyParams);

      // Verify
      expect(result.plan).toBe(SubscriptionPlan.FAMILY);
      expect((subscriptionService as any).processFamilyMemberInvitations).toHaveBeenCalledWith(
        familyParams.stripeSubscriptionId,
        familyParams.userId,
        familyParams.familyMemberIds
      );
    });

    it('should handle addons for individual plan', async () => {
      // Setup mocks
      const addonParams = {
        ...createParams,
        addons: ['1tb_storage', 'priority_support'],
      };

      (subscriptionService as any).processReferralCode = jest.fn().mockResolvedValue(null);
      (subscriptionService as any).updateUserSubscriptionStatus = jest.fn();
      (subscriptionService as any).addAuditLogEntry = jest.fn();
      (subscriptionService as any).getPlanFeatures = jest.fn().mockReturnValue({});
      (subscriptionService as any).getMonthlyPrice = jest.fn().mockReturnValue(9.99);
      (subscriptionService as any).getPlanDisplayName = jest
        .fn()
        .mockReturnValue('Individual Plus');

      // Execute
      const result = await subscriptionService.createSubscription(addonParams);

      // Verify
      expect(result.addons).toHaveLength(2);
      expect(result.addons[0].type).toBe('1tb_storage');
      expect(result.addons[1].type).toBe('priority_support');
    });

    it('should throw error for invalid plan configuration', async () => {
      // Setup mocks
      const stripeProducts = await import('../../config/stripeProducts');
      const isEligibleForPlan = stripeProducts.isEligibleForPlan as jest.Mock;
      isEligibleForPlan.mockReturnValue(false);

      // Execute & Verify
      await expect(subscriptionService.createSubscription(createParams)).rejects.toMatchObject({
        code: ErrorCode.INVALID_ARGUMENT,
        message: 'Invalid plan configuration',
      });
    });

    it('should throw error when family member limit exceeded', async () => {
      // Setup mocks
      const familyParams = {
        ...createParams,
        plan: SubscriptionPlan.FAMILY,
        familyMemberIds: ['member1', 'member2', 'member3', 'member4', 'member5'], // 5 members + owner = 6 total
      };

      // Execute & Verify
      await expect(subscriptionService.createSubscription(familyParams)).rejects.toMatchObject({
        code: ErrorCode.FAMILY_MEMBER_LIMIT_EXCEEDED,
      });
    });

    it('should process referral code when provided', async () => {
      // Setup mocks
      const referralParams = {
        ...createParams,
        referralCode: 'FRIEND123',
      };

      const mockReferralInfo = {
        referralCode: 'FRIEND123',
        referredBy: 'referrer-user-id',
        bonusStorageGB: 5,
        appliedAt: new Date(),
      };

      (subscriptionService as any).processReferralCode = jest
        .fn()
        .mockResolvedValue(mockReferralInfo);
      (subscriptionService as any).updateUserSubscriptionStatus = jest.fn();
      (subscriptionService as any).addAuditLogEntry = jest.fn();
      (subscriptionService as any).getPlanFeatures = jest.fn().mockReturnValue({});
      (subscriptionService as any).getMonthlyPrice = jest.fn().mockReturnValue(9.99);
      (subscriptionService as any).getPlanDisplayName = jest
        .fn()
        .mockReturnValue('Individual Plus');

      // Execute
      const result = await subscriptionService.createSubscription(referralParams);

      // Verify
      expect(result.referralInfo).toEqual(mockReferralInfo);
      expect((subscriptionService as any).processReferralCode).toHaveBeenCalledWith(
        referralParams.userId,
        referralParams.referralCode
      );
    });

    it('should integrate with storage calculation service', async () => {
      // Setup mocks
      (subscriptionService as any).processReferralCode = jest.fn().mockResolvedValue(null);
      (subscriptionService as any).updateUserSubscriptionStatus = jest.fn();
      (subscriptionService as any).addAuditLogEntry = jest.fn();
      (subscriptionService as any).getPlanFeatures = jest.fn().mockReturnValue({});
      (subscriptionService as any).getMonthlyPrice = jest.fn().mockReturnValue(9.99);
      (subscriptionService as any).getPlanDisplayName = jest
        .fn()
        .mockReturnValue('Individual Plus');

      // Execute
      const result = await subscriptionService.createSubscription(createParams);

      // Verify storage calculation integration
      expect(mockStorageService.calculateUserStorage).toHaveBeenCalledWith(
        createParams.userId,
        expect.objectContaining({
          plan: createParams.plan,
          tier: createParams.tier,
        })
      );

      expect(result.storageAllocation).toMatchObject({
        basePlanGB: 10,
        addonGB: 0,
        referralBonusGB: 2,
        totalGB: 12,
      });
    });
  });

  describe('getUserSubscription', () => {
    it('should retrieve active user subscription', async () => {
      // Setup mocks
      const mockSubscription = testDataGenerators.createTestSubscription();

      testEnv.mockFirestore
        .collection()
        .where()
        .where()
        .orderBy()
        .limit()
        .get.mockResolvedValue({
          empty: false,
          docs: [
            {
              data: () => mockSubscription,
            },
          ],
        });

      // Execute
      const result = await subscriptionService.getUserSubscription('test-user-id');

      // Verify
      expect(result).toEqual(mockSubscription);
      expect(testEnv.mockFirestore.collection).toHaveBeenCalledWith('subscriptions');
    });

    it('should return null when no active subscription found', async () => {
      // Setup mocks
      testEnv.mockFirestore.collection().where().where().orderBy().limit().get.mockResolvedValue({
        empty: true,
        docs: [],
      });

      // Execute
      const result = await subscriptionService.getUserSubscription('test-user-id');

      // Verify
      expect(result).toBeNull();
    });

    it('should query only active subscription statuses', async () => {
      // Setup mocks
      testEnv.mockFirestore.collection().where().where().orderBy().limit().get.mockResolvedValue({
        empty: true,
        docs: [],
      });

      // Execute
      await subscriptionService.getUserSubscription('test-user-id');

      // Verify query parameters
      const mockWhere = testEnv.mockFirestore.collection().where;
      expect(mockWhere).toHaveBeenCalledWith('userId', '==', 'test-user-id');
      expect(mockWhere).toHaveBeenCalledWith('status', 'in', [
        SubscriptionStatus.ACTIVE,
        SubscriptionStatus.TRIALING,
        SubscriptionStatus.PAST_DUE,
      ]);
    });
  });

  describe('getSubscription', () => {
    it('should retrieve subscription by ID', async () => {
      // Setup mocks
      const mockSubscription = testDataGenerators.createTestSubscription();

      testEnv.mockFirestore
        .collection()
        .doc()
        .get.mockResolvedValue({
          exists: true,
          data: () => mockSubscription,
        });

      // Execute
      const result = await subscriptionService.getSubscription('sub_test_123');

      // Verify
      expect(result).toEqual(mockSubscription);
      expect(testEnv.mockFirestore.collection).toHaveBeenCalledWith('subscriptions');
      expect(testEnv.mockFirestore.collection().doc).toHaveBeenCalledWith('sub_test_123');
    });

    it('should return null when subscription not found', async () => {
      // Setup mocks
      testEnv.mockFirestore.collection().doc().get.mockResolvedValue({
        exists: false,
      });

      // Execute
      const result = await subscriptionService.getSubscription('non_existent_sub');

      // Verify
      expect(result).toBeNull();
    });
  });

  describe('updateSubscription', () => {
    const updateParams = {
      subscriptionId: 'sub_test_123',
      plan: SubscriptionPlan.INDIVIDUAL,
      tier: SubscriptionTier.FAMILY_2_5TB,
      status: SubscriptionStatus.ACTIVE,
    };

    beforeEach(() => {
      // Mock helper methods
      (subscriptionService as any).addAuditLogEntry = jest.fn();
      (subscriptionService as any).updateUserSubscriptionStatus = jest.fn();
      (subscriptionService as any).recalculateStorageAllocation = jest.fn();
    });

    it('should update subscription successfully', async () => {
      // Setup mocks
      const existingSubscription = testDataGenerators.createTestSubscription();

      testEnv.mockFirestore
        .collection()
        .doc()
        .get.mockResolvedValue({
          exists: true,
          data: () => existingSubscription,
        });

      // Execute
      const result = await subscriptionService.updateSubscription(updateParams);

      // Verify
      expect(result).toMatchObject({
        plan: updateParams.plan,
        tier: updateParams.tier,
        status: updateParams.status,
      });

      // Verify Firestore update
      expect(testEnv.mockFirestore.collection().doc().update).toHaveBeenCalledWith(
        expect.objectContaining({
          plan: updateParams.plan,
          tier: updateParams.tier,
          status: updateParams.status,
        })
      );
    });

    it('should throw error when subscription not found', async () => {
      // Setup mocks
      testEnv.mockFirestore.collection().doc().get.mockResolvedValue({
        exists: false,
      });

      // Execute & Verify
      await expect(subscriptionService.updateSubscription(updateParams)).rejects.toMatchObject({
        code: ErrorCode.SUBSCRIPTION_NOT_FOUND,
      });
    });

    it('should add audit log entry for updates', async () => {
      // Setup mocks
      const existingSubscription = testDataGenerators.createTestSubscription();

      testEnv.mockFirestore
        .collection()
        .doc()
        .get.mockResolvedValue({
          exists: true,
          data: () => existingSubscription,
        });

      // Execute
      await subscriptionService.updateSubscription({
        ...updateParams,
        cancelReason: 'User requested cancellation',
      });

      // Verify audit log
      expect((subscriptionService as any).addAuditLogEntry).toHaveBeenCalledWith(
        updateParams.subscriptionId,
        expect.objectContaining({
          action: AuditAction.SUBSCRIPTION_UPDATED,
          details: expect.objectContaining({
            changes: expect.any(Object),
          }),
        })
      );
    });
  });

  describe('Family Plan Management', () => {
    const subscriptionId = 'sub_test_123';
    const familySubscription = testDataGenerators.createTestFamilyPlan();

    describe('addFamilyMember', () => {
      const addMemberParams = {
        subscriptionId,
        memberId: 'new-member-id',
        memberEmail: 'member@example.com',
        memberName: 'New Member',
        invitedBy: 'owner-user-id',
      };

      beforeEach(() => {
        (subscriptionService as any).addAuditLogEntry = jest.fn();
        (subscriptionService as any).validateFamilyMemberEligibility = jest.fn();
        (subscriptionService as any).sendFamilyInvitation = jest.fn();
      });

      it('should add family member successfully', async () => {
        // Setup mocks
        testEnv.mockFirestore
          .collection()
          .doc()
          .get.mockResolvedValue({
            exists: true,
            data: () => ({
              ...familySubscription,
              familyMembers: [],
            }),
          });

        // Execute
        await (subscriptionService as any).addFamilyMember(addMemberParams);

        // Verify
        expect(testEnv.mockFirestore.collection().doc().update).toHaveBeenCalledWith(
          expect.objectContaining({
            familyMembers: expect.arrayContaining([
              expect.objectContaining({
                userId: addMemberParams.memberId,
                email: addMemberParams.memberEmail,
                name: addMemberParams.memberName,
                status: 'active',
              }),
            ]),
          })
        );
      });

      it('should throw error when family member limit exceeded', async () => {
        // Setup mocks - family already at max capacity
        const fullFamilySubscription = {
          ...familySubscription,
          familyMembers: Array.from({ length: 4 }, (_, i) => ({
            userId: `member-${i}`,
            email: `member${i}@example.com`,
            status: 'active',
          })),
        };

        testEnv.mockFirestore
          .collection()
          .doc()
          .get.mockResolvedValue({
            exists: true,
            data: () => fullFamilySubscription,
          });

        // Execute & Verify
        await expect(
          (subscriptionService as any).addFamilyMember(addMemberParams)
        ).rejects.toMatchObject({
          code: ErrorCode.FAMILY_MEMBER_LIMIT_EXCEEDED,
        });
      });
    });

    describe('removeFamilyMember', () => {
      const removeMemberParams = {
        subscriptionId,
        memberId: 'member-to-remove',
        removedBy: 'owner-user-id',
        reason: 'Member left family',
      };

      beforeEach(() => {
        (subscriptionService as any).addAuditLogEntry = jest.fn();
        (subscriptionService as any).updateMemberStorageAllocation = jest.fn();
      });

      it('should remove family member successfully', async () => {
        // Setup mocks
        const familyWithMembers = {
          ...familySubscription,
          familyMembers: [
            {
              userId: 'member-to-remove',
              email: 'remove@example.com',
              status: 'active',
            },
            {
              userId: 'other-member',
              email: 'other@example.com',
              status: 'active',
            },
          ],
        };

        testEnv.mockFirestore
          .collection()
          .doc()
          .get.mockResolvedValue({
            exists: true,
            data: () => familyWithMembers,
          });

        // Execute
        await (subscriptionService as any).removeFamilyMember(removeMemberParams);

        // Verify
        expect(testEnv.mockFirestore.collection().doc().update).toHaveBeenCalledWith(
          expect.objectContaining({
            familyMembers: expect.arrayContaining([
              expect.objectContaining({
                userId: 'other-member', // Only the other member remains
              }),
            ]),
          })
        );

        // Verify audit log
        expect((subscriptionService as any).addAuditLogEntry).toHaveBeenCalledWith(
          subscriptionId,
          expect.objectContaining({
            action: AuditAction.FAMILY_MEMBER_REMOVED,
            details: expect.objectContaining({
              memberId: removeMemberParams.memberId,
              reason: removeMemberParams.reason,
            }),
          })
        );
      });

      it('should throw error when member not found', async () => {
        // Setup mocks
        testEnv.mockFirestore
          .collection()
          .doc()
          .get.mockResolvedValue({
            exists: true,
            data: () => ({
              ...familySubscription,
              familyMembers: [],
            }),
          });

        // Execute & Verify
        await expect(
          (subscriptionService as any).removeFamilyMember(removeMemberParams)
        ).rejects.toMatchObject({
          code: ErrorCode.FAMILY_MEMBER_NOT_FOUND,
        });
      });
    });
  });

  describe('Business Logic Validation', () => {
    it('should validate plan eligibility correctly', async () => {
      // Setup mocks
      const stripeProducts = await import('../../config/stripeProducts');
      const isEligibleForPlan = stripeProducts.isEligibleForPlan as jest.Mock;
      isEligibleForPlan.mockReturnValue(false);

      const invalidParams = {
        userId: 'test-user',
        userEmail: 'test@example.com',
        stripeSubscriptionId: 'sub_test_123',
        stripeCustomerId: 'cus_test_123',
        plan: SubscriptionPlan.FAMILY,
        tier: SubscriptionTier.PLUS, // Invalid combination
        interval: 'month' as const,
        status: SubscriptionStatus.ACTIVE,
        currentPeriodStart: new Date(),
        currentPeriodEnd: new Date(),
      };

      // Execute & Verify
      await expect(subscriptionService.createSubscription(invalidParams)).rejects.toMatchObject({
        code: ErrorCode.INVALID_ARGUMENT,
      });
    });

    it('should enforce storage limits', async () => {
      // Setup mocks - mock storage service to return over-limit usage
      mockStorageService.calculateUserStorage.mockResolvedValue({
        basePlanGB: 10,
        totalGB: 10,
        usedBytes: 15 * 1024 * 1024 * 1024, // 15GB used, 10GB limit
        availableBytes: -5 * 1024 * 1024 * 1024, // Over limit
      });

      const createParams = {
        userId: 'test-user',
        userEmail: 'test@example.com',
        stripeSubscriptionId: 'sub_test_123',
        stripeCustomerId: 'cus_test_123',
        plan: SubscriptionPlan.INDIVIDUAL,
        tier: SubscriptionTier.PLUS,
        interval: 'month' as const,
        status: SubscriptionStatus.ACTIVE,
        currentPeriodStart: new Date(),
        currentPeriodEnd: new Date(),
      };

      // Mock helper methods
      (subscriptionService as any).processReferralCode = jest.fn().mockResolvedValue(null);
      (subscriptionService as any).updateUserSubscriptionStatus = jest.fn();
      (subscriptionService as any).addAuditLogEntry = jest.fn();
      (subscriptionService as any).getPlanFeatures = jest.fn().mockReturnValue({});
      (subscriptionService as any).getMonthlyPrice = jest.fn().mockReturnValue(9.99);
      (subscriptionService as any).getPlanDisplayName = jest
        .fn()
        .mockReturnValue('Individual Plus');

      // Execute
      const result = await subscriptionService.createSubscription(createParams);

      // Verify that negative available bytes are handled
      expect(result.storageAllocation.availableBytes).toBe(-5 * 1024 * 1024 * 1024);
    });
  });
});
