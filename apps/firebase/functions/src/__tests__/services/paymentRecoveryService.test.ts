/**
 * Comprehensive tests for Payment Recovery Service
 * Tests payment failure handling, grace periods, retry logic, and subscription lifecycle
 */

// Create mock objects first
const mockDoc = {
  id: 'test-doc-id',
  get: jest.fn(),
  set: jest.fn(),
  update: jest.fn(),
  ref: { update: jest.fn() },
};

const mockQuery: any = {
  get: jest.fn(),
  empty: false,
  docs: [] as any[],
  forEach: jest.fn(),
};

const mockBatch = {
  update: jest.fn(),
  commit: jest.fn(),
};

const mockCollection: any = {
  doc: jest.fn(() => mockDoc),
  add: jest.fn(),
  where: jest.fn(),
  orderBy: jest.fn(),
  limit: jest.fn(),
  get: jest.fn(() => Promise.resolve(mockQuery)),
};

// Set up method chaining
mockCollection.where.mockReturnValue(mockCollection);
mockCollection.orderBy.mockReturnValue(mockCollection);
mockCollection.limit.mockReturnValue(mockCollection);

const mockFirestore = {
  collection: jest.fn(() => mockCollection),
  batch: jest.fn(() => mockBatch),
};

// Mock firebase-admin/firestore before any imports
jest.mock('firebase-admin/firestore', () => ({
  getFirestore: () => mockFirestore,
  FieldValue: {
    delete: jest.fn(() => 'DELETE_FIELD'),
    serverTimestamp: jest.fn(() => ({ _seconds: Date.now() / 1000 })),
  },
  Timestamp: {
    now: jest.fn(() => ({ _seconds: Date.now() / 1000, toDate: () => new Date() })),
    fromDate: jest.fn((date: Date) => ({ _seconds: date.getTime() / 1000, toDate: () => date })),
  },
}));

// Mock logger
jest.mock('firebase-functions/v2', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
  },
}));

import { PaymentRecoveryService, PaymentRetrySchedule } from '../../services/paymentRecoveryService';
import { SubscriptionService } from '../../services/subscriptionService';
import { StripeService } from '../../services/stripeService';
import { sendEmailUniversal } from '../../auth/config/emailConfig';
import {
  SubscriptionStatus,
  Subscription,
  PaymentFailureRecord,
  GracePeriodStatus,
  SubscriptionPlan,
} from '../../types/subscription';
import { ErrorCode } from '../../utils/errors';
import { GRACE_PERIOD_CONFIG, PaymentErrorHandler } from '../../utils/paymentErrors';
import { Timestamp } from 'firebase-admin/firestore';

// Mock dependencies
jest.mock('../../services/subscriptionService');
jest.mock('../../services/stripeService');
jest.mock('../../auth/config/emailConfig');
jest.mock('../../utils/paymentErrors', () => ({
  ...jest.requireActual('../../utils/paymentErrors'),
  PaymentErrorHandler: {
    logPaymentAttempt: jest.fn(),
    calculateRetryDelay: jest.fn((attempt) => attempt * 3600000), // 1 hour * attempt
  },
}));

describe('PaymentRecoveryService', () => {
  let paymentRecoveryService: PaymentRecoveryService;
  let mockSubscriptionService: jest.Mocked<SubscriptionService>;
  let mockStripeService: jest.Mocked<StripeService>;

  const createMockSubscription = (overrides?: Partial<Subscription>): Subscription => ({
    id: 'sub_123',
    userId: 'user_123',
    userEmail: 'user@example.com',
    plan: SubscriptionPlan.INDIVIDUAL,
    planDisplayName: 'Dynasty Individual',
    status: SubscriptionStatus.ACTIVE,
    stripeCustomerId: 'cus_123',
    stripeSubscriptionId: 'stripe_sub_123',
    stripeProductId: 'prod_123',
    stripePriceId: 'price_123',
    amount: 1999,
    priceMonthly: 1999,
    currency: 'usd',
    startDate: Timestamp.now(),
    currentPeriodStart: Timestamp.now(),
    currentPeriodEnd: Timestamp.now(),
    cancelAtPeriodEnd: false,
    lastPaymentStatus: 'succeeded',
    createdAt: Timestamp.now(),
    updatedAt: Timestamp.now(),
    lastModifiedBy: 'user_123',
    storageAllocation: {
      basePlanGB: 100,
      addonGB: 0,
      referralBonusGB: 0,
      totalGB: 100,
      usedBytes: 0,
      availableBytes: 100 * 1024 * 1024 * 1024,
      lastCalculated: Timestamp.now(),
    },
    addons: [],
    features: {
      unlimitedPhotos: true,
      videoUpload: true,
      audioRecording: true,
      documentScanning: true,
      aiFeatures: true,
      advancedSharing: true,
      prioritySupport: false,
    },
    ...overrides,
  });

  const createMockPaymentError = (type: string = 'card_declined') => ({
    type,
    code: type,
    message: 'Your card was declined',
    decline_code: type === 'card_declined' ? 'generic_decline' : undefined,
  });

  beforeEach(() => {
    jest.clearAllMocks();

    // Reset mock implementations
    mockDoc.get.mockResolvedValue({
      exists: true,
      data: () => ({ email: 'test@example.com', displayName: 'Test User' }),
    });
    mockDoc.set.mockResolvedValue(undefined);
    mockDoc.update.mockResolvedValue(undefined);
    mockCollection.add.mockResolvedValue({ id: 'new-doc-id' });
    mockBatch.commit.mockResolvedValue(undefined);

    // Create service instance with mocked dependencies
    paymentRecoveryService = new PaymentRecoveryService();
    
    // Create mock instances
    mockSubscriptionService = {
      getSubscription: jest.fn(),
      updateSubscription: jest.fn(),
      removeFamilyMember: jest.fn(),
    } as any;
    
    mockStripeService = {
      getStripe: jest.fn(),
      retrySubscriptionPayment: jest.fn(),
      cancelSubscription: jest.fn(),
      updateCustomerPaymentMethod: jest.fn(),
      createSubscription: jest.fn(),
    } as any;

    // Inject mocked services
    (paymentRecoveryService as any).subscriptionService = mockSubscriptionService;
    (paymentRecoveryService as any).stripeService = mockStripeService;
  });

  describe('Payment Failure Handling', () => {
    it('should handle payment failure and initiate grace period', async () => {
      const subscription = createMockSubscription();
      const error = createMockPaymentError();

      mockSubscriptionService.getSubscription.mockResolvedValue(subscription);

      await paymentRecoveryService.handlePaymentFailure(
        subscription.id,
        error,
        'pi_123'
      );

      // Verify subscription was retrieved
      expect(mockSubscriptionService.getSubscription).toHaveBeenCalledWith(subscription.id);

      // Verify payment failure record was created
      expect(mockDoc.set).toHaveBeenCalledWith(
        expect.objectContaining({
          subscriptionId: subscription.id,
          userId: subscription.userId,
          errorCode: error.code,
          errorMessage: error.message,
          paymentIntentId: 'pi_123',
          amount: subscription.amount,
          currency: subscription.currency,
          attemptCount: 1,
          resolved: false,
        })
      );

      // Verify grace period was set
      expect(mockDoc.update).toHaveBeenCalledWith(
        expect.objectContaining({
          gracePeriod: expect.objectContaining({
            status: GracePeriodStatus.ACTIVE,
            type: 'paymentFailed',
          }),
        })
      );

      // Verify subscription status was updated to PAST_DUE
      expect(mockSubscriptionService.updateSubscription).toHaveBeenCalledWith({
        subscriptionId: subscription.id,
        status: SubscriptionStatus.PAST_DUE,
      });

      // Verify payment retry was scheduled
      expect(mockCollection.add).toHaveBeenCalledWith(
        expect.objectContaining({
          subscriptionId: subscription.id,
          userId: subscription.userId,
          attemptNumber: 1,
          processed: false,
        })
      );

      // Verify dunning email was sent
      expect(sendEmailUniversal).toHaveBeenCalledWith(
        expect.objectContaining({
          to: 'test@example.com',
          templateType: 'paymentFailed',
          userId: subscription.userId,
        })
      );
    });

    it('should determine correct grace period type based on error', async () => {
      const subscription = createMockSubscription();
      const testCases = [
        { error: { code: 'expired_card' }, expectedType: 'paymentMethodExpired' },
        { error: { decline_code: 'expired_card' }, expectedType: 'paymentMethodExpired' },
        { error: { code: 'subscription_expired' }, expectedType: 'subscriptionExpired' },
        { error: { code: 'card_declined' }, expectedType: 'paymentFailed' },
      ];

      for (const { error } of testCases) {
        jest.clearAllMocks();
        mockSubscriptionService.getSubscription.mockResolvedValue(subscription);

        await paymentRecoveryService.handlePaymentFailure(subscription.id, error);

        // Find the call that updates the grace period
        const gracePeriodUpdateCall = mockDoc.update.mock.calls.find(call => 
          call[0].gracePeriod && typeof call[0].gracePeriod === 'object' && call[0].gracePeriod.type
        );
        
        expect(gracePeriodUpdateCall).toBeDefined();
        if (gracePeriodUpdateCall) {
          const actualType = gracePeriodUpdateCall[0].gracePeriod.type;
          
          // The service uses the determineGracePeriodType method which returns the correct type
          // based on error.code or error.decline_code
          if (error.code === 'expired_card' || error.decline_code === 'expired_card') {
            expect(actualType).toBe('paymentMethodExpired');
          } else if (error.code === 'subscription_expired') {
            expect(actualType).toBe('subscriptionExpired');
          } else {
            expect(actualType).toBe('paymentFailed');
          }
        }
      }
    });

    it('should handle missing subscription gracefully', async () => {
      mockSubscriptionService.getSubscription.mockResolvedValue(null);

      await expect(
        paymentRecoveryService.handlePaymentFailure('sub_invalid', createMockPaymentError())
      ).rejects.toThrow(
        expect.objectContaining({
          code: 'not-found',
        })
      );
    });
  });

  describe('Payment Retry Logic', () => {
    it('should successfully process payment retry', async () => {
      const subscription = createMockSubscription({
        gracePeriod: {
          status: GracePeriodStatus.ACTIVE,
          type: 'paymentFailed',
          startedAt: Timestamp.now(),
          endsAt: Timestamp.fromDate(new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)),
          reason: 'Card declined',
        },
      });

      const retrySchedule: PaymentRetrySchedule = {
        subscriptionId: subscription.id,
        userId: subscription.userId,
        nextRetryAt: new Date(),
        attemptNumber: 2,
        maxAttempts: 3,
        lastError: 'Card declined',
      };

      mockSubscriptionService.getSubscription.mockResolvedValue(subscription);
      mockStripeService.retrySubscriptionPayment.mockResolvedValue({ id: 'inv_123', status: 'paid' } as any);

      // Mock successful payment records query
      const mockFailureDoc = {
        id: 'failure_123',
        data: () => ({ resolved: false }),
        ref: { update: jest.fn() },
      };
      mockQuery.docs = [mockFailureDoc];
      mockQuery.forEach = jest.fn((callback) => {
        mockQuery.docs.forEach(callback);
      });

      await paymentRecoveryService.processPaymentRetry(retrySchedule);

      // Verify payment retry was attempted
      expect(mockStripeService.retrySubscriptionPayment).toHaveBeenCalledWith(
        subscription.stripeSubscriptionId
      );

      // Verify grace period was cleared
      expect(mockDoc.update).toHaveBeenCalledWith(
        expect.objectContaining({
          gracePeriod: 'DELETE_FIELD',
          status: SubscriptionStatus.ACTIVE,
          lastPaymentError: 'DELETE_FIELD',
        })
      );

      // Verify payment failure records were resolved
      expect(mockBatch.update).toHaveBeenCalled();
      expect(mockBatch.commit).toHaveBeenCalled();

      // Verify success email was sent
      expect(sendEmailUniversal).toHaveBeenCalled();
    });

    it('should handle failed retry and schedule next attempt', async () => {
      const subscription = createMockSubscription({
        gracePeriod: {
          status: GracePeriodStatus.ACTIVE,
          type: 'paymentFailed',
          startedAt: Timestamp.now(),
          endsAt: Timestamp.fromDate(new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)),
          reason: 'Card declined',
        },
      });

      const retrySchedule: PaymentRetrySchedule = {
        subscriptionId: subscription.id,
        userId: subscription.userId,
        nextRetryAt: new Date(),
        attemptNumber: 1,
        maxAttempts: 3,
        lastError: 'Card declined',
      };

      mockSubscriptionService.getSubscription.mockResolvedValue(subscription);
      mockStripeService.retrySubscriptionPayment
        .mockRejectedValue(createMockPaymentError());

      // Mock failure record query
      mockQuery.empty = false;
      mockQuery.docs = [{ id: 'failure_123', data: () => ({}), ref: { update: jest.fn() } }];

      await paymentRecoveryService.processPaymentRetry(retrySchedule);

      // Verify payment attempt was logged
      expect(PaymentErrorHandler.logPaymentAttempt).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: subscription.userId,
          subscriptionId: subscription.id,
          attemptNumber: retrySchedule.attemptNumber,
        }),
        'failed',
        expect.any(Object)
      );

      // Verify next retry was scheduled
      expect(mockCollection.add).toHaveBeenCalledWith(
        expect.objectContaining({
          subscriptionId: subscription.id,
          attemptNumber: 2,
          maxAttempts: 3,
          processed: false,
        })
      );

      // Verify subscription was NOT suspended (max retries not reached)
      expect(mockStripeService.cancelSubscription).not.toHaveBeenCalled();
    });

    it('should suspend subscription after max retries', async () => {
      const subscription = createMockSubscription({
        gracePeriod: {
          status: GracePeriodStatus.ACTIVE,
          type: 'paymentFailed',
          startedAt: Timestamp.now(),
          endsAt: Timestamp.fromDate(new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)),
          reason: 'Card declined',
        },
      });

      const retrySchedule: PaymentRetrySchedule = {
        subscriptionId: subscription.id,
        userId: subscription.userId,
        nextRetryAt: new Date(),
        attemptNumber: 3, // Max attempts
        maxAttempts: 3,
        lastError: 'Card declined',
      };

      mockSubscriptionService.getSubscription.mockResolvedValue(subscription);
      mockStripeService.retrySubscriptionPayment
        .mockRejectedValue(createMockPaymentError());
      mockStripeService.cancelSubscription.mockResolvedValue({ id: subscription.stripeSubscriptionId, status: 'canceled' } as any);

      // Mock failure record query
      mockQuery.empty = false;
      mockQuery.docs = [{ id: 'failure_123', data: () => ({}), ref: { update: jest.fn() } }];

      await paymentRecoveryService.processPaymentRetry(retrySchedule);

      // Verify subscription was suspended
      expect(mockStripeService.cancelSubscription).toHaveBeenCalledWith({
        subscriptionId: subscription.stripeSubscriptionId,
        cancelImmediately: true,
        reason: 'payment_failure',
        feedback: 'Grace period expired after multiple payment failures',
      });

      // Verify subscription status was updated
      expect(mockSubscriptionService.updateSubscription).toHaveBeenCalledWith({
        subscriptionId: subscription.id,
        status: SubscriptionStatus.SUSPENDED,
      });

      // Verify suspension email was sent
      expect(sendEmailUniversal).toHaveBeenCalledWith(
        expect.objectContaining({
          templateType: 'subscriptionSuspended',
        })
      );
    });

    it('should skip retry if subscription is no longer in grace period', async () => {
      const subscription = createMockSubscription({
        gracePeriod: undefined,
      });

      const retrySchedule: PaymentRetrySchedule = {
        subscriptionId: subscription.id,
        userId: subscription.userId,
        nextRetryAt: new Date(),
        attemptNumber: 2,
        maxAttempts: 3,
      };

      mockSubscriptionService.getSubscription.mockResolvedValue(subscription);

      await paymentRecoveryService.processPaymentRetry(retrySchedule);

      // Verify no payment retry was attempted
      expect(mockStripeService.retrySubscriptionPayment).not.toHaveBeenCalled();
    });
  });

  describe('Subscription Suspension', () => {
    it('should suspend subscription and remove family members', async () => {
      const familySubscription = createMockSubscription({
        plan: SubscriptionPlan.FAMILY,
        familyMembers: [
          { userId: 'member_1', email: 'member1@example.com', displayName: 'Member 1', status: 'active', joinedAt: Timestamp.now() },
          { userId: 'member_2', email: 'member2@example.com', displayName: 'Member 2', status: 'active', joinedAt: Timestamp.now() },
          { userId: 'member_3', email: 'member3@example.com', displayName: 'Member 3', status: 'invited', joinedAt: Timestamp.now() },
        ],
      });

      mockStripeService.cancelSubscription.mockResolvedValue({ id: familySubscription.stripeSubscriptionId, status: 'canceled' } as any);

      await paymentRecoveryService.suspendSubscription(familySubscription);

      // Verify Stripe subscription was cancelled
      expect(mockStripeService.cancelSubscription).toHaveBeenCalledWith({
        subscriptionId: familySubscription.stripeSubscriptionId,
        cancelImmediately: true,
        reason: 'payment_failure',
        feedback: 'Grace period expired after multiple payment failures',
      });

      // Verify subscription status was updated
      expect(mockSubscriptionService.updateSubscription).toHaveBeenCalledWith({
        subscriptionId: familySubscription.id,
        status: SubscriptionStatus.SUSPENDED,
      });

      // Verify suspension fields were added
      expect(mockDoc.update).toHaveBeenCalledWith(
        expect.objectContaining({
          suspendedAt: expect.any(Object),
          suspensionReason: 'payment_failure',
        })
      );

      // Verify active family members were removed (not pending ones)
      expect(mockSubscriptionService.removeFamilyMember).toHaveBeenCalledTimes(2);
      expect(mockSubscriptionService.removeFamilyMember).toHaveBeenCalledWith({
        subscriptionId: familySubscription.id,
        memberId: 'member_1',
        removedBy: 'system',
        reason: 'Subscription suspended due to payment failure',
      });
      expect(mockSubscriptionService.removeFamilyMember).toHaveBeenCalledWith({
        subscriptionId: familySubscription.id,
        memberId: 'member_2',
        removedBy: 'system',
        reason: 'Subscription suspended due to payment failure',
      });
    });

    it('should handle missing Stripe subscription ID gracefully', async () => {
      const subscription = createMockSubscription({
        stripeSubscriptionId: undefined,
      });

      await paymentRecoveryService.suspendSubscription(subscription);

      // Verify Stripe cancellation was not attempted
      expect(mockStripeService.cancelSubscription).not.toHaveBeenCalled();

      // Verify subscription was still suspended in database
      expect(mockSubscriptionService.updateSubscription).toHaveBeenCalledWith({
        subscriptionId: subscription.id,
        status: SubscriptionStatus.SUSPENDED,
      });
    });
  });

  describe('Subscription Reactivation', () => {
    it('should reactivate suspended subscription with new payment method', async () => {
      const suspendedSubscription = createMockSubscription({
        status: SubscriptionStatus.SUSPENDED,
        suspendedAt: Timestamp.now(),
        suspensionReason: 'payment_failure',
      });

      const newStripeSubscription = {
        id: 'new_stripe_sub_123',
        status: 'active',
      };

      mockSubscriptionService.getSubscription
        .mockResolvedValueOnce(suspendedSubscription)
        .mockResolvedValueOnce({ ...suspendedSubscription, status: SubscriptionStatus.ACTIVE });
      
      mockStripeService.updateCustomerPaymentMethod.mockResolvedValue({ id: suspendedSubscription.stripeCustomerId } as any);
      mockStripeService.createSubscription
        .mockResolvedValue(newStripeSubscription as any);

      const result = await paymentRecoveryService.reactivateSubscription(
        suspendedSubscription.id,
        'pm_new_123'
      );

      // Verify payment method was updated
      expect(mockStripeService.updateCustomerPaymentMethod).toHaveBeenCalledWith(
        suspendedSubscription.stripeCustomerId,
        'pm_new_123'
      );

      // Verify new Stripe subscription was created
      expect(mockStripeService.createSubscription).toHaveBeenCalledWith({
        customerId: suspendedSubscription.stripeCustomerId,
        priceId: suspendedSubscription.stripePriceId,
        paymentMethodId: 'pm_new_123',
        metadata: expect.objectContaining({
          userId: suspendedSubscription.userId,
          reactivated: 'true',
        }),
      });

      // Verify subscription status was updated
      expect(mockSubscriptionService.updateSubscription).toHaveBeenCalledWith({
        subscriptionId: suspendedSubscription.id,
        status: SubscriptionStatus.ACTIVE,
      });

      // Verify suspension fields were removed
      expect(mockDoc.update).toHaveBeenCalledWith(
        expect.objectContaining({
          stripeSubscriptionId: newStripeSubscription.id,
          suspendedAt: 'DELETE_FIELD',
          suspensionReason: 'DELETE_FIELD',
          reactivatedAt: expect.any(Object),
          gracePeriod: null,
        })
      );

      // Verify reactivation email was sent
      expect(sendEmailUniversal).toHaveBeenCalledWith(
        expect.objectContaining({
          templateType: 'mfa',
          dynamicTemplateData: expect.objectContaining({
            emailType: 'subscription_reactivated',
          }),
        })
      );

      expect(result.status).toBe(SubscriptionStatus.ACTIVE);
    });

    it('should reject reactivation of non-suspended subscription', async () => {
      const activeSubscription = createMockSubscription({
        status: SubscriptionStatus.ACTIVE,
      });

      mockSubscriptionService.getSubscription.mockResolvedValue(activeSubscription);

      await expect(
        paymentRecoveryService.reactivateSubscription(activeSubscription.id, 'pm_123')
      ).rejects.toMatchObject({
        code: ErrorCode.INVALID_ARGUMENT,
        message: 'Only suspended subscriptions can be reactivated',
      });
    });

    it('should handle missing Stripe data during reactivation', async () => {
      const suspendedSubscription = createMockSubscription({
        status: SubscriptionStatus.SUSPENDED,
        stripeCustomerId: undefined,
      });

      mockSubscriptionService.getSubscription.mockResolvedValue(suspendedSubscription);

      await expect(
        paymentRecoveryService.reactivateSubscription(suspendedSubscription.id, 'pm_123')
      ).rejects.toThrow(
        expect.objectContaining({
          code: 'failed-precondition',
        })
      );
    });
  });

  describe('Email Communications', () => {
    it('should send appropriate dunning emails at different intervals', async () => {
      const subscription = createMockSubscription();
      const failureRecord: PaymentFailureRecord = {
        id: 'failure_123',
        subscriptionId: subscription.id,
        userId: subscription.userId,
        stripeCustomerId: subscription.stripeCustomerId,
        errorCode: 'card_declined',
        errorMessage: 'Your card was declined',
        amount: subscription.amount,
        currency: subscription.currency,
        attemptCount: 1,
        resolved: false,
        createdAt: Timestamp.now(),
        lastAttemptAt: Timestamp.now(),
      };

      // Test initial failure email
      await (paymentRecoveryService as any).sendDunningEmail(
        subscription,
        failureRecord,
        GRACE_PERIOD_CONFIG.paymentFailed,
        0
      );

      expect(sendEmailUniversal).toHaveBeenCalledWith(
        expect.objectContaining({
          templateType: 'paymentFailed',
          dynamicTemplateData: expect.objectContaining({
            urgency: 'standard',
          }),
        })
      );

      // Test reminder email
      jest.clearAllMocks();
      await (paymentRecoveryService as any).sendDunningEmail(
        subscription,
        failureRecord,
        GRACE_PERIOD_CONFIG.paymentFailed,
        3
      );

      expect(sendEmailUniversal).toHaveBeenCalledWith(
        expect.objectContaining({
          dynamicTemplateData: expect.objectContaining({
            urgency: 'reminder',
          }),
        })
      );

      // Test final notice email
      jest.clearAllMocks();
      const lastInterval = GRACE_PERIOD_CONFIG.paymentFailed.notificationIntervals[
        GRACE_PERIOD_CONFIG.paymentFailed.notificationIntervals.length - 1
      ];
      
      await (paymentRecoveryService as any).sendDunningEmail(
        subscription,
        failureRecord,
        GRACE_PERIOD_CONFIG.paymentFailed,
        lastInterval
      );

      expect(sendEmailUniversal).toHaveBeenCalledWith(
        expect.objectContaining({
          dynamicTemplateData: expect.objectContaining({
            subject: 'Final Notice - Subscription Will Be Suspended',
            urgency: 'critical',
          }),
        })
      );
    });

    it('should handle email sending failures gracefully', async () => {
      const subscription = createMockSubscription();
      
      mockSubscriptionService.getSubscription.mockResolvedValue(subscription);
      (sendEmailUniversal as jest.Mock).mockRejectedValue(new Error('Email service error'));

      // Should not throw even if email fails
      await expect(
        paymentRecoveryService.handlePaymentFailure(subscription.id, createMockPaymentError())
      ).resolves.not.toThrow();

      // Verify other operations continued
      expect(mockSubscriptionService.updateSubscription).toHaveBeenCalled();
    });
  });

  describe('Grace Period Management', () => {
    it('should calculate correct grace period end dates', async () => {
      const subscription = createMockSubscription();
      const now = new Date();

      const testCases = [
        { type: 'paymentFailed', expectedDays: 7 },
        { type: 'paymentMethodExpired', expectedDays: 14 },
        { type: 'subscriptionExpired', expectedDays: 30 },
      ];

      for (const { type, expectedDays } of testCases) {
        jest.clearAllMocks();
        mockSubscriptionService.getSubscription.mockResolvedValue(subscription);

        const error = type === 'paymentMethodExpired' 
          ? { code: 'expired_card' }
          : type === 'subscriptionExpired'
          ? { code: 'subscription_expired' }
          : { code: 'card_declined' };

        await paymentRecoveryService.handlePaymentFailure(subscription.id, error);

        const updateCall = mockDoc.update.mock.calls.find(call => 
          call[0].gracePeriod && typeof call[0].gracePeriod === 'object'
        );

        expect(updateCall).toBeDefined();
        
        if (updateCall && updateCall[0].gracePeriod) {
          const gracePeriod = updateCall[0].gracePeriod;
          expect(gracePeriod.type).toBe(type === 'paymentMethodExpired' && error.code === 'expired_card' ? 'paymentMethodExpired' : 
                                       type === 'subscriptionExpired' && error.code === 'subscription_expired' ? 'subscriptionExpired' : 
                                       'paymentFailed');
          
          const gracePeriodEndDate = gracePeriod.endsAt.toDate();
          const expectedEndDate = new Date(now);
          expectedEndDate.setDate(expectedEndDate.getDate() + expectedDays);

          // Check dates are within 1 minute of each other (to account for test execution time)
          const timeDiff = Math.abs(gracePeriodEndDate.getTime() - expectedEndDate.getTime());
          expect(timeDiff).toBeLessThan(60000); // 1 minute
        }
      }
    });
  });

  describe('Retry Delay Calculation', () => {
    it('should calculate exponential backoff for retry delays', async () => {
      const subscription = createMockSubscription();

      mockSubscriptionService.getSubscription.mockResolvedValue(subscription);

      // Test that handlePaymentFailure schedules retry with attempt 1
      await paymentRecoveryService.handlePaymentFailure(
        subscription.id,
        createMockPaymentError(),
        'pi_123'
      );

      // For first failure, it should schedule with attempt 1
      expect(PaymentErrorHandler.calculateRetryDelay).toHaveBeenCalledWith(1);
      
      // Clear mocks
      jest.clearAllMocks();
      
      // Test processPaymentRetry with failed retry schedules next attempt
      const retrySchedule: PaymentRetrySchedule = {
        subscriptionId: subscription.id,
        userId: subscription.userId,
        nextRetryAt: new Date(),
        attemptNumber: 2,
        maxAttempts: 3,
      };
      
      mockStripeService.retrySubscriptionPayment.mockRejectedValue(createMockPaymentError());
      
      // Mock failure record for update
      mockQuery.empty = false;
      mockQuery.docs = [{ id: 'failure_123', data: () => ({}), ref: { update: jest.fn() } }];
      
      await paymentRecoveryService.processPaymentRetry(retrySchedule);
      
      // Should calculate delay for next attempt (3)
      expect(PaymentErrorHandler.calculateRetryDelay).toHaveBeenCalledWith(3);
    });
  });

  describe('Database Operations', () => {
    it('should handle concurrent payment failure records correctly', async () => {
      const subscription = createMockSubscription();
      const errors = [
        createMockPaymentError('card_declined'),
        createMockPaymentError('insufficient_funds'),
      ];

      mockSubscriptionService.getSubscription.mockResolvedValue(subscription);

      // Process multiple failures concurrently
      await Promise.all(
        errors.map(error => 
          paymentRecoveryService.handlePaymentFailure(subscription.id, error)
        )
      );

      // Verify multiple failure records were created
      expect(mockDoc.set).toHaveBeenCalledTimes(errors.length);
    });

    it('should batch update payment failure records on successful payment', async () => {
      const subscription = createMockSubscription({
        gracePeriod: {
          status: GracePeriodStatus.ACTIVE,
          type: 'paymentFailed',
          startedAt: Timestamp.now(),
          endsAt: Timestamp.fromDate(new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)),
          reason: 'Card declined',
        },
      });

      // Mock multiple unresolved failure records
      const mockFailureRecords = [
        { id: 'failure_1', ref: { update: jest.fn() }, data: () => ({ resolved: false }) },
        { id: 'failure_2', ref: { update: jest.fn() }, data: () => ({ resolved: false }) },
        { id: 'failure_3', ref: { update: jest.fn() }, data: () => ({ resolved: false }) },
      ];

      mockQuery.docs = mockFailureRecords;
      mockQuery.forEach = jest.fn((callback) => {
        mockFailureRecords.forEach(callback);
      });
      mockSubscriptionService.getSubscription.mockResolvedValue(subscription);
      mockStripeService.retrySubscriptionPayment.mockResolvedValue({ id: 'inv_123', status: 'paid' } as any);

      const retrySchedule: PaymentRetrySchedule = {
        subscriptionId: subscription.id,
        userId: subscription.userId,
        nextRetryAt: new Date(),
        attemptNumber: 1,
        maxAttempts: 3,
      };

      await paymentRecoveryService.processPaymentRetry(retrySchedule);

      // Verify batch update was used for all failure records
      expect(mockBatch.update).toHaveBeenCalledTimes(mockFailureRecords.length);
      expect(mockBatch.commit).toHaveBeenCalledTimes(1);
    });
  });

  describe('Error Handling', () => {
    it('should handle database errors gracefully', async () => {
      mockSubscriptionService.getSubscription.mockRejectedValue(
        new Error('Database connection error')
      );

      await expect(
        paymentRecoveryService.handlePaymentFailure('sub_123', createMockPaymentError())
      ).rejects.toThrow('Database connection error');
    });

    it('should handle Stripe API errors during retry', async () => {
      const subscription = createMockSubscription({
        gracePeriod: {
          status: GracePeriodStatus.ACTIVE,
          type: 'paymentFailed',
          startedAt: Timestamp.now(),
          endsAt: Timestamp.fromDate(new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)),
          reason: 'Card declined',
        },
      });

      mockSubscriptionService.getSubscription.mockResolvedValue(subscription);
      mockStripeService.retrySubscriptionPayment
        .mockRejectedValue(new Error('Stripe API error'));

      const retrySchedule: PaymentRetrySchedule = {
        subscriptionId: subscription.id,
        userId: subscription.userId,
        nextRetryAt: new Date(),
        attemptNumber: 1,
        maxAttempts: 3,
      };

      // Mock failure record for update
      mockQuery.empty = false;
      mockQuery.docs = [{ id: 'failure_123', data: () => ({}), ref: { update: jest.fn() } }];

      await paymentRecoveryService.processPaymentRetry(retrySchedule);

      // Verify error was logged and next retry was scheduled
      expect(PaymentErrorHandler.logPaymentAttempt).toHaveBeenCalledWith(
        expect.any(Object),
        'failed',
        expect.objectContaining({ message: 'Stripe API error' })
      );
    });
  });
});