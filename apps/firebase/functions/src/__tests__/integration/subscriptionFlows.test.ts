/**
 * Integration tests for complete subscription flows
 * Tests end-to-end scenarios across multiple services
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { StripeService } from '../../services/stripeService';
import { SubscriptionService } from '../../services/subscriptionService';
import { StripeWebhookHandler } from '../../webhooks/stripeWebhookHandler';
import { SubscriptionPlan, SubscriptionTier, SubscriptionStatus } from '../../types/subscription';
import { StripeTestEnvironment } from '../utils/testHelpers';
import { webhookEvents, createWebhookRequest } from '../mocks/stripeWebhookFixtures';
import {
  createMockStripeCustomer,
  createMockCheckoutSession,
  createMockStripeSubscription,
} from '../mocks/stripeMocks';

// Import mocked modules that will be jest.mocked
import {
  getStripeClient,
  createCheckoutSessionConfig,
  createSubscriptionUpdateParams,
} from '../../config/stripeConfig';
import { getStripeConfig } from '../../config/stripeSecrets';
import { SubscriptionWebhookProcessor } from '../../webhooks/processors/subscriptionProcessor';
import { PaymentWebhookProcessor } from '../../webhooks/processors/paymentProcessor';
import { CustomerWebhookProcessor } from '../../webhooks/processors/customerProcessor';
import * as stripeProducts from '../../config/stripeProducts';

// Create test environment
const testEnv = new StripeTestEnvironment();

// Mock all dependencies
jest.mock('../../config/stripeConfig');
jest.mock('../../config/stripeSecrets');
jest.mock('../../config/stripeProducts');
jest.mock('../../webhooks/processors/subscriptionProcessor');
jest.mock('../../webhooks/processors/paymentProcessor');
jest.mock('../../webhooks/processors/customerProcessor');
jest.mock('firebase-admin/firestore');
jest.mock('firebase-functions/v2');

describe('Subscription Flow Integration Tests', () => {
  let stripeService: StripeService;
  let subscriptionService: SubscriptionService;
  let webhookHandler: StripeWebhookHandler;

  // Mock processors
  let mockSubscriptionProcessor: any;
  let mockPaymentProcessor: any;
  let mockCustomerProcessor: any;

  beforeEach(() => {
    testEnv.setup();
    testEnv.mockRateLimitPassing();

    // Initialize services
    stripeService = new StripeService();
    subscriptionService = new SubscriptionService();
    webhookHandler = new StripeWebhookHandler();

    // Inject mock Stripe client
    stripeService.stripe = testEnv.mockStripeClient;

    // Mock processors
    mockSubscriptionProcessor = {
      processEvent: jest.fn().mockImplementation(async (event: any) => {
        // Simulate actual subscription processing
        if (event.type === 'customer.subscription.created') {
          const subscriptionData = event.data.object;
          await subscriptionService.createSubscription({
            userId: subscriptionData.metadata.userId,
            userEmail: subscriptionData.metadata.userEmail || 'test@example.com',
            stripeSubscriptionId: subscriptionData.id,
            stripeCustomerId: subscriptionData.customer,
            plan: subscriptionData.metadata.plan,
            tier: subscriptionData.metadata.tier,
            interval: 'month',
            status: SubscriptionStatus.ACTIVE,
            currentPeriodStart: new Date(subscriptionData.current_period_start * 1000),
            currentPeriodEnd: new Date(subscriptionData.current_period_end * 1000),
          });
        }
        return { success: true, message: 'Processed' };
      }),
      processCheckoutEvent: jest.fn(),
    };

    mockPaymentProcessor = {
      processEvent: jest.fn(),
    };

    mockCustomerProcessor = {
      processEvent: jest.fn(),
      processPaymentMethodEvent: jest.fn(),
    };

    // Set up return values separately to avoid type issues
    (mockSubscriptionProcessor.processCheckoutEvent as any).mockResolvedValue({
      success: true,
      message: 'Processed',
    });
    (mockPaymentProcessor.processEvent as any).mockResolvedValue({
      success: true,
      message: 'Processed',
    });
    (mockCustomerProcessor.processEvent as any).mockResolvedValue({
      success: true,
      message: 'Processed',
    });
    (mockCustomerProcessor.processPaymentMethodEvent as any).mockResolvedValue({
      success: true,
      message: 'Processed',
    });

    // Mock configurations
    jest.mocked(getStripeClient).mockReturnValue(testEnv.mockStripeClient);
    jest
      .mocked(getStripeConfig)
      .mockReturnValue({
        webhookSecret: 'test-secret',
        secretKey: 'test-key',
        publishableKey: 'test-pub-key',
      } as any);

    // Mock processor constructors
    jest.mocked(SubscriptionWebhookProcessor).mockImplementation(() => mockSubscriptionProcessor);
    jest.mocked(PaymentWebhookProcessor).mockImplementation(() => mockPaymentProcessor);
    jest.mocked(CustomerWebhookProcessor).mockImplementation(() => mockCustomerProcessor);

    // Mock stripe products
    jest.mocked(stripeProducts.getStripePriceId).mockReturnValue('price_test_123');
    jest.mocked(stripeProducts.isAddonEligible).mockReturnValue(true);
    jest.mocked(stripeProducts.isEligibleForPlan).mockReturnValue(true);
    jest.mocked(stripeProducts.getStorageAllocation).mockReturnValue(10);
    jest.mocked(stripeProducts.getMonthlyPrice).mockReturnValue(9.99);
    (stripeProducts as any).PLAN_LIMITS = {
      family: { maxMembers: 5 },
      individual: { maxMembers: 1 },
    };

    jest.mocked(createCheckoutSessionConfig).mockReturnValue({
      mode: 'subscription',
      success_url: 'https://example.com/success',
      cancel_url: 'https://example.com/cancel',
    });

    // Mock helper methods
    (subscriptionService as any).processReferralCode = jest.fn();
    ((subscriptionService as any).processReferralCode as any).mockResolvedValue(null);
    (subscriptionService as any).updateUserSubscriptionStatus = jest.fn();
    (subscriptionService as any).addAuditLogEntry = jest.fn();
    (subscriptionService as any).getPlanFeatures = jest.fn().mockReturnValue({});
    (subscriptionService as any).getMonthlyPrice = jest.fn().mockReturnValue(9.99);
    (subscriptionService as any).getPlanDisplayName = jest.fn().mockReturnValue('Individual Plus');

    // Mock storage service
    const mockCalculateUserStorage = jest.fn();
    (mockCalculateUserStorage as any).mockResolvedValue({
      basePlanGB: 10,
      addonGB: 0,
      referralBonusGB: 0,
      totalGB: 10,
      usedBytes: 1000000,
      availableBytes: 10737418240,
    });
    (subscriptionService as any).storageService = {
      calculateUserStorage: mockCalculateUserStorage,
    };

    // Mock Stripe webhook construction
    testEnv.mockStripeClient.webhooks.constructEvent.mockImplementation((rawBody: any) => {
      return JSON.parse(rawBody.toString());
    });
  });

  afterEach(() => {
    testEnv.teardown();
  });

  describe('Individual Subscription Creation Flow', () => {
    it('should handle complete individual subscription creation', async () => {
      // Step 1: User creates checkout session
      const checkoutParams = {
        userId: 'test-user-id',
        userEmail: 'test@example.com',
        plan: SubscriptionPlan.INDIVIDUAL,
        tier: SubscriptionTier.PLUS,
        interval: 'month' as const,
      };

      // Mock customer creation
      const mockCustomer = createMockStripeCustomer();
      const mockSession = createMockCheckoutSession({
        metadata: {
          userId: checkoutParams.userId,
          plan: checkoutParams.plan,
          tier: checkoutParams.tier,
        },
      });

      testEnv.mockStripeClient.customers.create.mockResolvedValue(mockCustomer);
      testEnv.mockStripeClient.checkout.sessions.create.mockResolvedValue(mockSession);

      // Execute checkout session creation
      const session = await stripeService.createCheckoutSession(checkoutParams);

      // Verify checkout session
      expect(session).toEqual(mockSession);
      expect(testEnv.mockStripeClient.checkout.sessions.create).toHaveBeenCalledWith(
        expect.objectContaining({
          customer: mockCustomer.id,
          metadata: expect.objectContaining({
            userId: checkoutParams.userId,
            plan: checkoutParams.plan,
            tier: checkoutParams.tier,
          }),
        }),
        expect.any(Object)
      );

      // Step 2: Simulate successful checkout completion webhook
      const checkoutCompletedEvent = webhookEvents.checkout.sessionCompleted({
        data: {
          object: {
            ...mockSession,
            status: 'complete',
            subscription: 'sub_test_123',
          },
        },
      });

      const checkoutRequest = createWebhookRequest(checkoutCompletedEvent);
      const checkoutResult = await webhookHandler.handleWebhook(checkoutRequest as any);

      expect(checkoutResult.success).toBe(true);
      expect(mockSubscriptionProcessor.processCheckoutEvent).toHaveBeenCalled();

      // Step 3: Simulate subscription created webhook
      const subscriptionCreatedEvent = webhookEvents.subscription.created({
        data: {
          object: createMockStripeSubscription({
            id: 'sub_test_123',
            customer: mockCustomer.id,
            metadata: {
              userId: checkoutParams.userId,
              plan: checkoutParams.plan,
              tier: checkoutParams.tier,
            },
          }),
        },
      });

      const subscriptionRequest = createWebhookRequest(subscriptionCreatedEvent);
      const subscriptionResult = await webhookHandler.handleWebhook(subscriptionRequest as any);

      expect(subscriptionResult.success).toBe(true);
      expect(mockSubscriptionProcessor.processEvent).toHaveBeenCalledWith(subscriptionCreatedEvent);

      // Verify subscription was created in database
      expect(testEnv.mockFirestore.collection).toHaveBeenCalledWith('subscriptions');
      expect(testEnv.mockFirestore.collection().doc().set).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: checkoutParams.userId,
          plan: checkoutParams.plan,
          tier: checkoutParams.tier,
          status: SubscriptionStatus.ACTIVE,
        })
      );
    });

    it('should handle individual subscription with addons', async () => {
      // Setup
      const checkoutParams = {
        userId: 'test-user-id',
        userEmail: 'test@example.com',
        plan: SubscriptionPlan.INDIVIDUAL,
        tier: SubscriptionTier.PLUS,
        interval: 'month' as const,
        addons: ['1tb_storage', 'priority_support'],
      };

      jest.mocked(stripeProducts.getAddonPriceId).mockReturnValue('price_addon_test_123');

      // Mock responses
      const mockCustomer = createMockStripeCustomer();
      const mockSession = createMockCheckoutSession();

      testEnv.mockStripeClient.customers.create.mockResolvedValue(mockCustomer);
      testEnv.mockStripeClient.checkout.sessions.create.mockResolvedValue(mockSession);

      // Execute
      const session = await stripeService.createCheckoutSession(checkoutParams);

      // Verify addons were included
      expect(session).toEqual(mockSession);
      expect(stripeProducts.getAddonPriceId).toHaveBeenCalledWith('1tb_storage');
      expect(stripeProducts.getAddonPriceId).toHaveBeenCalledWith('priority_support');
    });
  });

  describe('Family Subscription Creation Flow', () => {
    it('should handle complete family subscription creation', async () => {
      // Step 1: Create family subscription checkout
      const familyParams = {
        userId: 'owner-user-id',
        userEmail: 'owner@example.com',
        plan: SubscriptionPlan.FAMILY,
        tier: SubscriptionTier.FAMILY_2_5TB,
        interval: 'month' as const,
        familyMemberIds: ['member1', 'member2'],
      };

      // Mock responses
      const mockCustomer = createMockStripeCustomer();
      const mockSession = createMockCheckoutSession({
        metadata: {
          ...familyParams,
          familyMemberIds: JSON.stringify(familyParams.familyMemberIds),
        },
      });

      testEnv.mockStripeClient.customers.create.mockResolvedValue(mockCustomer);
      testEnv.mockStripeClient.checkout.sessions.create.mockResolvedValue(mockSession);

      // Execute checkout creation
      const session = await stripeService.createCheckoutSession(familyParams);

      // Verify family metadata
      expect(session).toEqual(mockSession);
      expect(testEnv.mockStripeClient.checkout.sessions.create).toHaveBeenCalledWith(
        expect.objectContaining({
          metadata: expect.objectContaining({
            familyMemberIds: JSON.stringify(familyParams.familyMemberIds),
          }),
        }),
        expect.any(Object)
      );

      // Step 2: Process family subscription creation via webhook
      const familySubscriptionEvent = webhookEvents.subscription.created({
        data: {
          object: createMockStripeSubscription({
            metadata: {
              userId: familyParams.userId,
              plan: familyParams.plan,
              tier: familyParams.tier,
              familyMemberIds: JSON.stringify(familyParams.familyMemberIds),
            },
          }),
        },
      });

      // Mock family member processing
      (subscriptionService as any).processFamilyMemberInvitations = jest.fn();

      const webhookRequest = createWebhookRequest(familySubscriptionEvent);
      const result = await webhookHandler.handleWebhook(webhookRequest as any);

      expect(result.success).toBe(true);

      // Verify family plan creation
      expect(testEnv.mockFirestore.collection().doc().set).toHaveBeenCalledWith(
        expect.objectContaining({
          plan: SubscriptionPlan.FAMILY,
          tier: SubscriptionTier.FAMILY_2_5TB,
        })
      );
    });
  });

  describe('Payment Failure and Recovery Flow', () => {
    it('should handle payment failure and recovery cycle', async () => {
      // Step 1: Process payment failure
      const paymentFailureEvent = webhookEvents.invoice.paymentFailed({
        data: {
          object: {
            subscription: 'sub_test_123',
            customer: 'cus_test_123',
            amount_due: 999,
            next_payment_attempt: Math.floor(Date.now() / 1000) + 86400,
          },
        },
      });

      const failureRequest = createWebhookRequest(paymentFailureEvent);
      const failureResult = await webhookHandler.handleWebhook(failureRequest as any);

      expect(failureResult.success).toBe(true);
      expect(mockPaymentProcessor.processEvent).toHaveBeenCalledWith(paymentFailureEvent);

      // Step 2: Process subscription update to past_due
      const subscriptionUpdateEvent = webhookEvents.subscription.updated({
        data: {
          object: createMockStripeSubscription({
            status: 'past_due',
          }),
        },
      });

      const updateRequest = createWebhookRequest(subscriptionUpdateEvent);
      const updateResult = await webhookHandler.handleWebhook(updateRequest as any);

      expect(updateResult.success).toBe(true);
      expect(mockSubscriptionProcessor.processEvent).toHaveBeenCalledWith(subscriptionUpdateEvent);

      // Step 3: Process successful payment recovery
      const paymentSuccessEvent = webhookEvents.invoice.paymentSucceeded({
        data: {
          object: {
            subscription: 'sub_test_123',
            customer: 'cus_test_123',
            amount_paid: 999,
            paid: true,
          },
        },
      });

      const successRequest = createWebhookRequest(paymentSuccessEvent);
      const successResult = await webhookHandler.handleWebhook(successRequest as any);

      expect(successResult.success).toBe(true);
      expect(mockPaymentProcessor.processEvent).toHaveBeenCalledWith(paymentSuccessEvent);

      // Step 4: Process subscription reactivation
      const reactivationEvent = webhookEvents.subscription.updated({
        data: {
          object: createMockStripeSubscription({
            status: 'active',
          }),
        },
      });

      const reactivationRequest = createWebhookRequest(reactivationEvent);
      const reactivationResult = await webhookHandler.handleWebhook(reactivationRequest as any);

      expect(reactivationResult.success).toBe(true);
      expect(mockSubscriptionProcessor.processEvent).toHaveBeenCalledWith(reactivationEvent);
    });
  });

  describe('Subscription Plan Upgrade Flow', () => {
    it('should handle plan upgrade from Individual to Family', async () => {
      // Step 1: Update subscription via Stripe service
      const upgradeParams = {
        subscriptionId: 'sub_test_123',
        plan: SubscriptionPlan.FAMILY,
        tier: SubscriptionTier.FAMILY_2_5TB,
      };

      // Mock current subscription
      const currentSubscription = createMockStripeSubscription({
        metadata: {
          plan: SubscriptionPlan.INDIVIDUAL,
          tier: SubscriptionTier.PLUS,
        },
        items: {
          data: [
            {
              id: 'si_test_123',
              price: { id: 'price_old_123', metadata: {} },
            },
          ],
        },
      });

      const upgradedSubscription = createMockStripeSubscription({
        metadata: {
          plan: upgradeParams.plan,
          tier: upgradeParams.tier,
        },
      });

      jest.mocked(createSubscriptionUpdateParams).mockReturnValue({});

      testEnv.mockStripeClient.subscriptions.retrieve.mockResolvedValue(currentSubscription);
      testEnv.mockStripeClient.subscriptions.update.mockResolvedValue(upgradedSubscription);

      // Execute upgrade
      const result = await stripeService.updateSubscription(upgradeParams);

      expect(result).toEqual(upgradedSubscription);

      // Step 2: Process webhook for subscription updated
      const upgradeEvent = webhookEvents.subscription.updated({
        data: {
          object: upgradedSubscription,
          previous_attributes: {
            metadata: {
              plan: SubscriptionPlan.INDIVIDUAL,
              tier: SubscriptionTier.PLUS,
            },
          },
        },
      });

      const webhookRequest = createWebhookRequest(upgradeEvent);
      const webhookResult = await webhookHandler.handleWebhook(webhookRequest as any);

      expect(webhookResult.success).toBe(true);
      expect(mockSubscriptionProcessor.processEvent).toHaveBeenCalledWith(upgradeEvent);
    });
  });

  describe('Subscription Cancellation Flow', () => {
    it('should handle subscription cancellation', async () => {
      // Step 1: Cancel subscription via Stripe service
      const cancelParams = {
        subscriptionId: 'sub_test_123',
        reason: 'No longer needed',
        feedback: 'too_expensive',
      };

      const canceledSubscription = createMockStripeSubscription({
        cancel_at_period_end: true,
        canceled_at: Math.floor(Date.now() / 1000),
      });

      testEnv.mockStripeClient.subscriptions.update.mockResolvedValue(canceledSubscription);

      // Execute cancellation
      const result = await stripeService.cancelSubscription(cancelParams);

      expect(result).toEqual(canceledSubscription);
      expect(testEnv.mockStripeClient.subscriptions.update).toHaveBeenCalledWith(
        cancelParams.subscriptionId,
        expect.objectContaining({
          cancel_at_period_end: true,
          cancellation_details: {
            comment: cancelParams.reason,
            feedback: cancelParams.feedback,
          },
        }),
        expect.any(Object)
      );

      // Step 2: Process webhook for cancellation
      const cancellationEvent = webhookEvents.subscription.updated({
        data: {
          object: canceledSubscription,
        },
      });

      const webhookRequest = createWebhookRequest(cancellationEvent);
      const webhookResult = await webhookHandler.handleWebhook(webhookRequest as any);

      expect(webhookResult.success).toBe(true);
      expect(mockSubscriptionProcessor.processEvent).toHaveBeenCalledWith(cancellationEvent);

      // Step 3: Process final deletion webhook
      const deletionEvent = webhookEvents.subscription.deleted({
        data: {
          object: createMockStripeSubscription({
            status: 'canceled',
          }),
        },
      });

      const deletionRequest = createWebhookRequest(deletionEvent);
      const deletionResult = await webhookHandler.handleWebhook(deletionRequest as any);

      expect(deletionResult.success).toBe(true);
      expect(mockSubscriptionProcessor.processEvent).toHaveBeenCalledWith(deletionEvent);
    });
  });

  describe('Error Scenarios', () => {
    it('should handle checkout session creation failure', async () => {
      // Setup
      const checkoutParams = {
        userId: 'test-user-id',
        userEmail: 'test@example.com',
        plan: SubscriptionPlan.INDIVIDUAL,
        tier: SubscriptionTier.PLUS,
        interval: 'month' as const,
      };

      // Mock customer creation success but session creation failure
      const mockCustomer = createMockStripeCustomer();
      testEnv.mockStripeClient.customers.create.mockResolvedValue(mockCustomer);
      testEnv.mockStripeClient.checkout.sessions.create.mockRejectedValue(
        new Error('Your card was declined.')
      );

      // Execute & Verify
      await expect(stripeService.createCheckoutSession(checkoutParams)).rejects.toThrow(
        'Failed to create checkout session'
      );
    });

    it('should handle webhook processing failure gracefully', async () => {
      // Setup
      const event = webhookEvents.subscription.created();
      const request = createWebhookRequest(event);

      // Mock processor failure
      mockSubscriptionProcessor.processEvent.mockResolvedValue({
        success: false,
        error: new Error('Database connection failed'),
        message: 'Failed to process event: Database connection failed',
      });

      // Execute
      const result = await webhookHandler.handleWebhook(request as any);

      // Verify graceful failure handling
      expect(result.success).toBe(false);
      expect(result.message).toBe('Failed to process event: Database connection failed');
    });

    it('should handle subscription update with invalid plan', async () => {
      // Setup
      jest.mocked(stripeProducts.isEligibleForPlan).mockReturnValue(false);

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
        code: 'functions/invalid-argument',
      });
    });
  });

  describe('Cross-Service Integration', () => {
    it('should properly integrate storage calculations with subscription creation', async () => {
      // Setup with storage service integration
      const mockStorageCalculation = {
        basePlanGB: 10,
        addonGB: 5, // 1TB addon
        referralBonusGB: 2,
        totalGB: 17,
        usedBytes: 1000000,
        availableBytes: 18253611008, // ~17GB
      };

      (subscriptionService as any).storageService.calculateUserStorage.mockResolvedValue(
        mockStorageCalculation
      );

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
        currentPeriodEnd: new Date(),
        addons: ['1tb_storage'],
      };

      // Execute
      const result = await subscriptionService.createSubscription(createParams);

      // Verify storage integration
      expect((subscriptionService as any).storageService.calculateUserStorage).toHaveBeenCalledWith(
        createParams.userId,
        expect.objectContaining({
          plan: createParams.plan,
          tier: createParams.tier,
        })
      );

      expect(result.storageAllocation).toMatchObject({
        basePlanGB: mockStorageCalculation.basePlanGB,
        addonGB: mockStorageCalculation.addonGB,
        referralBonusGB: mockStorageCalculation.referralBonusGB,
        totalGB: mockStorageCalculation.totalGB,
      });
    });
  });
});
