/**
 * Comprehensive unit tests for StripeService
 * Tests all core Stripe integration functionality
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { StripeService } from '../stripeService';
import { SubscriptionPlan, SubscriptionTier } from '../../types/subscription';
import { ErrorCode } from '../../utils/errors';
import {
  StripeTestEnvironment,
  testAssertions,
  testDataGenerators,
} from '../../__tests__/utils/testHelpers';
import {
  createMockStripeCustomer,
  createMockStripeSubscription,
  createMockCheckoutSession,
  StripeErrorSimulator,
} from '../../__tests__/mocks/stripeMocks';

// Create test environment
const testEnv = new StripeTestEnvironment();

// Mock all Stripe-related modules
jest.mock('../../config/stripeConfig');
jest.mock('../../config/stripeSecrets');
jest.mock('../../config/stripeProducts');
jest.mock('firebase-admin/firestore');
jest.mock('firebase-functions/v2');

describe('StripeService', () => {
  let stripeService: StripeService;

  beforeEach(() => {
    testEnv.setup();
    testEnv.mockRateLimitPassing();
    stripeService = new StripeService();

    // Inject mock Stripe client
    stripeService.stripe = testEnv.mockStripeClient;
  });

  afterEach(() => {
    testEnv.teardown();
  });

  describe('createOrGetCustomer', () => {
    const testUser = testDataGenerators.createTestUser();

    it('should create new customer when user has no existing customer ID', async () => {
      // Setup mocks
      const mockCustomer = createMockStripeCustomer({
        email: testUser.email,
        metadata: { userId: testUser.id },
      });

      testEnv.mockFirestore
        .collection()
        .doc()
        .data.mockReturnValue({
          ...testUser,
          stripeCustomerId: undefined, // No existing customer ID
        });

      testEnv.mockStripeClient.customers.create.mockResolvedValue(mockCustomer);

      // Execute
      const result = await stripeService.createOrGetCustomer(
        testUser.id,
        testUser.email,
        testUser.name
      );

      // Verify
      expect(result).toEqual(mockCustomer);
      testAssertions.expectStripeMethodCalled(testEnv.mockStripeClient.customers.create, {
        email: testUser.email,
        name: testUser.name,
        metadata: {
          userId: testUser.id,
          firebaseUid: testUser.id,
        },
      });

      // Verify Firestore update
      testAssertions.expectFirestoreUpdate(testEnv.mockFirestore.collection().doc(), {
        stripeCustomerId: mockCustomer.id,
      });
    });

    it('should retrieve existing customer when user has customer ID', async () => {
      // Setup mocks
      const mockCustomer = createMockStripeCustomer({ id: testUser.stripeCustomerId });

      testEnv.mockFirestore.collection().doc().data.mockReturnValue(testUser);
      testEnv.mockStripeClient.customers.retrieve.mockResolvedValue(mockCustomer);

      // Execute
      const result = await stripeService.createOrGetCustomer(testUser.id, testUser.email);

      // Verify
      expect(result).toEqual(mockCustomer);
      expect(testEnv.mockStripeClient.customers.retrieve).toHaveBeenCalledWith(
        testUser.stripeCustomerId
      );
      expect(testEnv.mockStripeClient.customers.create).not.toHaveBeenCalled();
    });

    it('should create new customer when existing customer is deleted', async () => {
      // Setup mocks
      const deletedCustomer = createMockStripeCustomer({ deleted: true });
      const newCustomer = createMockStripeCustomer();

      testEnv.mockFirestore.collection().doc().data.mockReturnValue(testUser);
      testEnv.mockStripeClient.customers.retrieve.mockResolvedValue(deletedCustomer);
      testEnv.mockStripeClient.customers.create.mockResolvedValue(newCustomer);

      // Execute
      const result = await stripeService.createOrGetCustomer(testUser.id, testUser.email);

      // Verify
      expect(result).toEqual(newCustomer);
      expect(testEnv.mockStripeClient.customers.create).toHaveBeenCalled();
    });

    it('should handle Stripe API errors gracefully', async () => {
      // Setup mocks
      testEnv.mockFirestore
        .collection()
        .doc()
        .data.mockReturnValue({ ...testUser, stripeCustomerId: undefined });
      testEnv.mockStripeClient.customers.create.mockRejectedValue(StripeErrorSimulator.apiError());

      // Execute & Verify
      await expect(stripeService.createOrGetCustomer(testUser.id, testUser.email)).rejects.toThrow(
        'Failed to create customer'
      );
    });
  });

  describe('createCheckoutSession', () => {
    const checkoutParams = {
      userId: 'test-user-id',
      userEmail: 'test@example.com',
      plan: SubscriptionPlan.INDIVIDUAL,
      tier: SubscriptionTier.PLUS,
      interval: 'month' as const,
    };

    beforeEach(async () => {
      // Mock required dependencies
      const stripeProducts = await import('../../config/stripeProducts');
      const getStripePriceId = stripeProducts.getStripePriceId as jest.Mock;
      const isAddonEligible = stripeProducts.isAddonEligible as jest.Mock;
      getStripePriceId.mockReturnValue('price_test_123');
      isAddonEligible.mockReturnValue(true);

      const stripeConfig = await import('../../config/stripeConfig');
      const createCheckoutSessionConfig = stripeConfig.createCheckoutSessionConfig as jest.Mock;
      createCheckoutSessionConfig.mockReturnValue({
        mode: 'subscription',
        success_url: 'https://example.com/success',
        cancel_url: 'https://example.com/cancel',
      });
    });

    it('should create checkout session successfully', async () => {
      // Setup mocks
      const mockCustomer = createMockStripeCustomer();
      const mockSession = createMockCheckoutSession();

      testEnv.mockStripeClient.customers.create.mockResolvedValue(mockCustomer);
      testEnv.mockStripeClient.checkout.sessions.create.mockResolvedValue(mockSession);

      // Execute
      const result = await stripeService.createCheckoutSession(checkoutParams);

      // Verify
      expect(result).toEqual(mockSession);
      expect(testEnv.mockStripeClient.checkout.sessions.create).toHaveBeenCalledWith(
        expect.objectContaining({
          mode: 'subscription',
          customer: mockCustomer.id,
        }),
        expect.objectContaining({ idempotencyKey: expect.any(String) })
      );
    });

    it('should throw error when tier is missing for Individual plan', async () => {
      // Execute & Verify
      await expect(
        stripeService.createCheckoutSession({
          ...checkoutParams,
          tier: undefined,
        })
      ).rejects.toMatchObject({
        code: ErrorCode.INVALID_ARGUMENT,
        message: 'Tier is required for Individual plan',
      });
    });

    it('should handle addons for Individual plan', async () => {
      // Setup mocks
      const stripeProducts = await import('../../config/stripeProducts');
      const getAddonPriceId = stripeProducts.getAddonPriceId as jest.Mock;
      getAddonPriceId.mockReturnValue('price_addon_test_123');

      const mockCustomer = createMockStripeCustomer();
      const mockSession = createMockCheckoutSession();

      testEnv.mockStripeClient.customers.create.mockResolvedValue(mockCustomer);
      testEnv.mockStripeClient.checkout.sessions.create.mockResolvedValue(mockSession);

      // Execute
      const result = await stripeService.createCheckoutSession({
        ...checkoutParams,
        addons: ['1tb_storage'],
      });

      // Verify
      expect(result).toEqual(mockSession);
      expect(getAddonPriceId).toHaveBeenCalledWith('1tb_storage');
    });

    it('should throw error when addons are not eligible', async () => {
      // Setup mocks
      const stripeProducts = await import('../../config/stripeProducts');
      const isAddonEligible = stripeProducts.isAddonEligible as jest.Mock;
      isAddonEligible.mockReturnValue(false);

      // Execute & Verify
      await expect(
        stripeService.createCheckoutSession({
          ...checkoutParams,
          addons: ['1tb_storage'],
        })
      ).rejects.toMatchObject({
        code: ErrorCode.ADDON_INVALID,
        message: 'Addons are not available for this plan',
      });
    });

    it('should handle family plan with member IDs', async () => {
      // Setup mocks
      const mockCustomer = createMockStripeCustomer();
      const mockSession = createMockCheckoutSession();

      testEnv.mockStripeClient.customers.create.mockResolvedValue(mockCustomer);
      testEnv.mockStripeClient.checkout.sessions.create.mockResolvedValue(mockSession);

      // Execute
      const result = await stripeService.createCheckoutSession({
        ...checkoutParams,
        plan: SubscriptionPlan.FAMILY,
        tier: SubscriptionTier.FAMILY_2_5TB,
        familyMemberIds: ['member1', 'member2'],
      });

      // Verify
      expect(result).toEqual(mockSession);
      expect(testEnv.mockStripeClient.checkout.sessions.create).toHaveBeenCalledWith(
        expect.objectContaining({
          metadata: expect.objectContaining({
            familyMemberIds: JSON.stringify(['member1', 'member2']),
          }),
        }),
        expect.any(Object)
      );
    });

    it('should handle Stripe checkout session creation errors', async () => {
      // Setup mocks
      const mockCustomer = createMockStripeCustomer();
      testEnv.mockStripeClient.customers.create.mockResolvedValue(mockCustomer);
      testEnv.mockStripeClient.checkout.sessions.create.mockRejectedValue(
        StripeErrorSimulator.cardDeclined()
      );

      // Execute & Verify
      await expect(stripeService.createCheckoutSession(checkoutParams)).rejects.toThrow(
        'Failed to create checkout session'
      );
    });
  });

  describe('updateSubscription', () => {
    const updateParams = {
      subscriptionId: 'sub_test_123',
      plan: SubscriptionPlan.INDIVIDUAL,
      tier: SubscriptionTier.FAMILY_2_5TB,
    };

    beforeEach(async () => {
      // Mock required dependencies
      const stripeProducts = await import('../../config/stripeProducts');
      const getStripePriceId = stripeProducts.getStripePriceId as jest.Mock;
      const isAddonEligible = stripeProducts.isAddonEligible as jest.Mock;
      getStripePriceId.mockReturnValue('price_test_new_123');
      isAddonEligible.mockReturnValue(true);

      const stripeConfig = await import('../../config/stripeConfig');
      const createSubscriptionUpdateParams =
        stripeConfig.createSubscriptionUpdateParams as jest.Mock;
      createSubscriptionUpdateParams.mockReturnValue({});
    });

    it('should update subscription plan successfully', async () => {
      // Setup mocks
      const mockSubscription = createMockStripeSubscription({
        items: {
          data: [
            {
              id: 'si_test_123',
              price: {
                id: 'price_old_123',
                metadata: {}, // Not an addon
              },
            },
          ],
        },
      });

      const updatedSubscription = createMockStripeSubscription({
        metadata: {
          plan: updateParams.plan,
          tier: updateParams.tier,
        },
      });

      testEnv.mockStripeClient.subscriptions.retrieve.mockResolvedValue(mockSubscription);
      testEnv.mockStripeClient.subscriptions.update.mockResolvedValue(updatedSubscription);

      // Execute
      const result = await stripeService.updateSubscription(updateParams);

      // Verify
      expect(result).toEqual(updatedSubscription);
      expect(testEnv.mockStripeClient.subscriptions.update).toHaveBeenCalledWith(
        updateParams.subscriptionId,
        expect.objectContaining({
          items: [
            {
              id: 'si_test_123',
              price: 'price_test_new_123',
            },
          ],
          metadata: expect.objectContaining({
            plan: updateParams.plan,
            tier: updateParams.tier,
          }),
        }),
        expect.objectContaining({ idempotencyKey: expect.any(String) })
      );
    });

    it('should handle addon updates for Individual plan', async () => {
      // Setup mocks
      const stripeProducts = await import('../../config/stripeProducts');
      const getAddonPriceId = stripeProducts.getAddonPriceId as jest.Mock;
      getAddonPriceId.mockReturnValue('price_addon_new_123');

      const mockSubscription = createMockStripeSubscription({
        metadata: {
          plan: SubscriptionPlan.INDIVIDUAL,
          tier: SubscriptionTier.PLUS,
        },
        items: {
          data: [
            {
              id: 'si_main_123',
              price: {
                id: 'price_main_123',
                metadata: {}, // Main subscription item
              },
            },
            {
              id: 'si_addon_123',
              price: {
                id: 'price_addon_old_123',
                metadata: { addonType: '1tb_storage' }, // Existing addon
              },
            },
          ],
        },
      });

      const updatedSubscription = createMockStripeSubscription();

      testEnv.mockStripeClient.subscriptions.retrieve.mockResolvedValue(mockSubscription);
      testEnv.mockStripeClient.subscriptions.update.mockResolvedValue(updatedSubscription);

      // Execute
      const result = await stripeService.updateSubscription({
        ...updateParams,
        addons: ['2tb_storage'],
      });

      // Verify
      expect(result).toEqual(updatedSubscription);
      expect(testEnv.mockStripeClient.subscriptions.update).toHaveBeenCalledWith(
        updateParams.subscriptionId,
        expect.objectContaining({
          items: expect.arrayContaining([
            { id: 'si_addon_123', deleted: true }, // Remove old addon
            { price: 'price_addon_new_123', quantity: 1 }, // Add new addon
          ]),
        }),
        expect.any(Object)
      );
    });

    it('should throw error when subscription not found', async () => {
      // Setup mocks
      testEnv.mockStripeClient.subscriptions.retrieve.mockResolvedValue(null);

      // Execute & Verify
      await expect(stripeService.updateSubscription(updateParams)).rejects.toMatchObject({
        code: ErrorCode.SUBSCRIPTION_NOT_FOUND,
        message: 'Subscription not found',
      });
    });

    it('should throw error when addons are not eligible for plan', async () => {
      // Setup mocks
      const stripeProducts = await import('../../config/stripeProducts');
      const isAddonEligible = stripeProducts.isAddonEligible as jest.Mock;
      isAddonEligible.mockReturnValue(false);

      const mockSubscription = createMockStripeSubscription({
        metadata: {
          plan: SubscriptionPlan.FAMILY,
          tier: SubscriptionTier.FAMILY_2_5TB,
        },
      });

      testEnv.mockStripeClient.subscriptions.retrieve.mockResolvedValue(mockSubscription);

      // Execute & Verify
      await expect(
        stripeService.updateSubscription({
          ...updateParams,
          addons: ['1tb_storage'],
        })
      ).rejects.toMatchObject({
        code: ErrorCode.ADDON_INVALID,
        message: 'Addons are not available for this plan',
      });
    });

    it('should handle Stripe API errors during update', async () => {
      // Setup mocks
      const mockSubscription = createMockStripeSubscription();
      testEnv.mockStripeClient.subscriptions.retrieve.mockResolvedValue(mockSubscription);
      testEnv.mockStripeClient.subscriptions.update.mockRejectedValue(
        StripeErrorSimulator.apiError()
      );

      // Execute & Verify
      await expect(stripeService.updateSubscription(updateParams)).rejects.toThrow(
        'Failed to update subscription'
      );
    });
  });

  describe('cancelSubscription', () => {
    const cancelParams = {
      subscriptionId: 'sub_test_123',
      reason: 'No longer needed',
      feedback: 'too_complex',
    };

    it('should cancel subscription at period end by default', async () => {
      // Setup mocks
      const canceledSubscription = createMockStripeSubscription({
        cancel_at_period_end: true,
      });

      testEnv.mockStripeClient.subscriptions.update.mockResolvedValue(canceledSubscription);

      // Execute
      const result = await stripeService.cancelSubscription(cancelParams);

      // Verify
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
        expect.objectContaining({ idempotencyKey: expect.any(String) })
      );
    });

    it('should cancel subscription immediately when requested', async () => {
      // Setup mocks
      const canceledSubscription = createMockStripeSubscription({
        status: 'canceled',
      });

      testEnv.mockStripeClient.subscriptions.cancel.mockResolvedValue(canceledSubscription);

      // Execute
      const result = await stripeService.cancelSubscription({
        ...cancelParams,
        cancelImmediately: true,
      });

      // Verify
      expect(result).toEqual(canceledSubscription);
      expect(testEnv.mockStripeClient.subscriptions.cancel).toHaveBeenCalledWith(
        cancelParams.subscriptionId,
        expect.objectContaining({
          cancellation_details: {
            comment: cancelParams.reason,
            feedback: cancelParams.feedback,
          },
        })
      );
    });

    it('should handle Stripe API errors during cancellation', async () => {
      // Setup mocks
      testEnv.mockStripeClient.subscriptions.update.mockRejectedValue(
        StripeErrorSimulator.rateLimited()
      );

      // Execute & Verify
      await expect(stripeService.cancelSubscription(cancelParams)).rejects.toThrow(
        'Failed to cancel subscription'
      );
    });
  });

  describe('Error Handling', () => {
    it('should handle rate limit errors with proper error mapping', async () => {
      // Setup mocks
      testEnv.mockStripeClient.customers.create.mockRejectedValue(
        StripeErrorSimulator.rateLimited()
      );
      testEnv.mockFirestore
        .collection()
        .doc()
        .data.mockReturnValue({ stripeCustomerId: undefined });

      // Execute & Verify
      await expect(
        stripeService.createOrGetCustomer('test-user', 'test@example.com')
      ).rejects.toThrow('Failed to create customer');
    });

    it('should handle card declined errors gracefully', async () => {
      // Setup mocks
      testEnv.mockStripeClient.customers.create.mockResolvedValue(createMockStripeCustomer());
      testEnv.mockStripeClient.checkout.sessions.create.mockRejectedValue(
        StripeErrorSimulator.cardDeclined()
      );

      // Execute & Verify
      await expect(
        stripeService.createCheckoutSession({
          userId: 'test-user',
          userEmail: 'test@example.com',
          plan: SubscriptionPlan.INDIVIDUAL,
          tier: SubscriptionTier.PLUS,
        })
      ).rejects.toThrow('Failed to create checkout session');
    });

    it('should handle invalid request errors properly', async () => {
      // Setup mocks
      testEnv.mockStripeClient.subscriptions.retrieve.mockRejectedValue(
        StripeErrorSimulator.invalidRequest('Invalid subscription ID')
      );

      // Execute & Verify
      await expect(
        stripeService.updateSubscription({
          subscriptionId: 'invalid_sub_id',
        })
      ).rejects.toThrow('Failed to update subscription');
    });
  });

  describe('Payment Retry Logic', () => {
    it('should retry failed payment operations', async () => {
      // Setup mocks - fail first time, succeed second time
      const mockCustomer = createMockStripeCustomer();
      testEnv.mockStripeClient.customers.create
        .mockRejectedValueOnce(StripeErrorSimulator.rateLimited())
        .mockResolvedValueOnce(mockCustomer);

      testEnv.mockFirestore
        .collection()
        .doc()
        .data.mockReturnValue({ stripeCustomerId: undefined });

      // Execute
      const result = await stripeService.createOrGetCustomer('test-user', 'test@example.com');

      // Verify retry happened
      expect(testEnv.mockStripeClient.customers.create).toHaveBeenCalledTimes(2);
      expect(result).toEqual(mockCustomer);
    });
  });
});
