/**
 * Performance and load testing for subscription system
 * Tests system behavior under high load and concurrent operations
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { StripeService } from '../../services/stripeService';
import { SubscriptionService } from '../../services/subscriptionService';
import { StripeWebhookHandler } from '../../webhooks/stripeWebhookHandler';
import { SubscriptionPlan, SubscriptionTier, SubscriptionStatus } from '../../types/subscription';
import { StripeTestEnvironment, testDataGenerators } from '../utils/testHelpers';
import { webhookEvents, createWebhookRequest } from '../mocks/stripeWebhookFixtures';
import { createMockStripeCustomer, createMockCheckoutSession } from '../mocks/stripeMocks';

// Create test environment
const testEnv = new StripeTestEnvironment();

// Mock all dependencies
jest.mock('../../config/stripeConfig');
jest.mock('../../config/stripeSecrets');
jest.mock('../../config/stripeProducts');
jest.mock('../../middleware/auth');
jest.mock('../../services/rateLimitService');
jest.mock('firebase-admin/firestore');
jest.mock('firebase-functions/v2');

// Performance test timeouts
const PERFORMANCE_TIMEOUT = 30000; // 30 seconds
// const LOAD_TEST_TIMEOUT = 60000; // 60 seconds

describe('Subscription Performance Testing', () => {
  let stripeService: StripeService;
  let subscriptionService: SubscriptionService;
  let webhookHandler: StripeWebhookHandler;

  beforeEach(() => {
    testEnv.setup();
    testEnv.mockRateLimitPassing();

    stripeService = new StripeService();
    subscriptionService = new SubscriptionService();
    webhookHandler = new StripeWebhookHandler();

    // Inject mock Stripe client
    stripeService.stripe = testEnv.mockStripeClient;

    // Mock configurations
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const stripeProducts = require('../../config/stripeProducts');
    stripeProducts.getStripePriceId = jest.fn().mockReturnValue('price_test_123');
    stripeProducts.isAddonEligible = jest.fn().mockReturnValue(true);
    stripeProducts.isEligibleForPlan = jest.fn().mockReturnValue(true);
    stripeProducts.getStorageAllocation = jest.fn().mockReturnValue(10);

    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { createCheckoutSessionConfig } = require('../../config/stripeConfig');
    createCheckoutSessionConfig.mockReturnValue({
      mode: 'subscription',
      success_url: 'https://example.com/success',
      cancel_url: 'https://example.com/cancel',
    });

    // Mock subscription service helper methods
    (subscriptionService as any).processReferralCode = jest.fn().mockResolvedValue(null);
    (subscriptionService as any).updateUserSubscriptionStatus = jest.fn();
    (subscriptionService as any).addAuditLogEntry = jest.fn();
    (subscriptionService as any).getPlanFeatures = jest.fn().mockReturnValue({});
    (subscriptionService as any).getMonthlyPrice = jest.fn().mockReturnValue(9.99);
    (subscriptionService as any).getPlanDisplayName = jest.fn().mockReturnValue('Individual Plus');
    (subscriptionService as any).storageService = {
      calculateUserStorage: jest.fn().mockResolvedValue({
        basePlanGB: 10,
        totalGB: 10,
        usedBytes: 1000000,
        availableBytes: 10737418240,
      }),
    };

    // Setup webhook processor mocks
    const mockProcessor = {
      processEvent: jest.fn().mockResolvedValue({ success: true, message: 'Processed' }),
      processCheckoutEvent: jest.fn().mockResolvedValue({ success: true, message: 'Processed' }),
    };

    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const {
      SubscriptionWebhookProcessor,
    } = require('../../webhooks/processors/subscriptionProcessor');
    SubscriptionWebhookProcessor.mockImplementation(() => mockProcessor);

    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { getStripeClient } = require('../../config/stripeConfig');
    getStripeClient.mockReturnValue(testEnv.mockStripeClient);

    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { getStripeConfig } = require('../../config/stripeSecrets');
    getStripeConfig.mockReturnValue({ webhookSecret: 'test-secret' });

    testEnv.mockStripeClient.webhooks.constructEvent.mockImplementation(rawBody => {
      return JSON.parse(rawBody.toString());
    });
  });

  afterEach(() => {
    testEnv.teardown();
  });

  describe('Concurrent Checkout Performance', () => {
    it(
      'should handle 50 concurrent checkout sessions',
      async () => {
        const startTime = Date.now();
        const concurrentCheckouts = 50;

        // Setup Stripe mocks for successful operations
        testEnv.mockStripeClient.customers.create.mockResolvedValue(createMockStripeCustomer());
        testEnv.mockStripeClient.checkout.sessions.create.mockResolvedValue(
          createMockCheckoutSession()
        );

        // Create concurrent checkout requests
        const checkoutPromises = Array.from({ length: concurrentCheckouts }, (_, i) => {
          const checkoutParams = {
            userId: `test-user-${i}`,
            userEmail: `test${i}@example.com`,
            plan: SubscriptionPlan.INDIVIDUAL,
            tier: SubscriptionTier.PLUS,
            interval: 'month' as const,
          };

          return stripeService.createCheckoutSession(checkoutParams);
        });

        // Execute all checkouts concurrently
        const results = await Promise.all(checkoutPromises);
        const endTime = Date.now();
        const totalTime = endTime - startTime;

        // Verify all checkouts succeeded
        expect(results).toHaveLength(concurrentCheckouts);
        results.forEach((result, index) => {
          expect(result).toHaveProperty('id');
          expect(result.metadata?.userId).toBe(`test-user-${index}`);
        });

        // Performance assertions
        expect(totalTime).toBeLessThan(10000); // Should complete within 10 seconds
        expect(testEnv.mockStripeClient.checkout.sessions.create).toHaveBeenCalledTimes(
          concurrentCheckouts
        );

        console.log(
          `Concurrent checkout performance: ${concurrentCheckouts} checkouts in ${totalTime}ms`
        );
        console.log(`Average time per checkout: ${totalTime / concurrentCheckouts}ms`);
      },
      PERFORMANCE_TIMEOUT
    );

    it(
      'should handle mixed plan types concurrently',
      async () => {
        const startTime = Date.now();
        const totalRequests = 30;

        // Setup Stripe mocks
        testEnv.mockStripeClient.customers.create.mockResolvedValue(createMockStripeCustomer());
        testEnv.mockStripeClient.checkout.sessions.create.mockResolvedValue(
          createMockCheckoutSession()
        );

        // Create mixed plan checkout requests
        const checkoutPromises = Array.from({ length: totalRequests }, (_, i) => {
          const isFamily = i % 3 === 0; // Every 3rd request is a family plan
          const hasAddons = i % 5 === 0; // Every 5th request has addons

          const checkoutParams = {
            userId: `test-user-${i}`,
            userEmail: `test${i}@example.com`,
            plan: isFamily ? SubscriptionPlan.FAMILY : SubscriptionPlan.INDIVIDUAL,
            tier: isFamily ? SubscriptionTier.FAMILY_2_5TB : SubscriptionTier.PLUS,
            interval: 'month' as const,
            familyMemberIds: isFamily ? [`member-${i}-1`, `member-${i}-2`] : undefined,
            addons: hasAddons ? ['1tb_storage'] : undefined,
          };

          return stripeService.createCheckoutSession(checkoutParams);
        });

        // Execute all checkouts concurrently
        const results = await Promise.all(checkoutPromises);
        const endTime = Date.now();
        const totalTime = endTime - startTime;

        // Verify results
        expect(results).toHaveLength(totalRequests);
        expect(totalTime).toBeLessThan(15000); // Should complete within 15 seconds

        console.log(
          `Mixed plan checkout performance: ${totalRequests} mixed checkouts in ${totalTime}ms`
        );
      },
      PERFORMANCE_TIMEOUT
    );

    it(
      'should maintain performance with error scenarios',
      async () => {
        const startTime = Date.now();
        const totalRequests = 20;
        const errorRate = 0.2; // 20% error rate

        // Setup mixed success/failure responses
        testEnv.mockStripeClient.customers.create.mockImplementation(() => {
          if (Math.random() < errorRate) {
            throw new Error('Simulated Stripe API error');
          }
          return Promise.resolve(createMockStripeCustomer());
        });

        testEnv.mockStripeClient.checkout.sessions.create.mockResolvedValue(
          createMockCheckoutSession()
        );

        // Create checkout requests
        const checkoutPromises = Array.from({ length: totalRequests }, (_, i) => {
          const checkoutParams = {
            userId: `test-user-${i}`,
            userEmail: `test${i}@example.com`,
            plan: SubscriptionPlan.INDIVIDUAL,
            tier: SubscriptionTier.PLUS,
            interval: 'month' as const,
          };

          return stripeService
            .createCheckoutSession(checkoutParams)
            .catch(error => ({ error: error.message }));
        });

        // Execute all checkouts
        const results = await Promise.all(checkoutPromises);
        const endTime = Date.now();
        const totalTime = endTime - startTime;

        // Analyze results
        const successes = results.filter(
          result => !Object.prototype.hasOwnProperty.call(result, 'error')
        );
        const errors = results.filter(result =>
          Object.prototype.hasOwnProperty.call(result, 'error')
        );

        expect(results).toHaveLength(totalRequests);
        expect(successes.length).toBeGreaterThan(0);
        expect(errors.length).toBeGreaterThan(0);
        expect(totalTime).toBeLessThan(10000);

        console.log(
          `Error scenario performance: ${successes.length} successes, ${errors.length} errors in ${totalTime}ms`
        );
      },
      PERFORMANCE_TIMEOUT
    );
  });

  describe('Webhook Performance', () => {
    it(
      'should handle 100 concurrent webhook events',
      async () => {
        const startTime = Date.now();
        const concurrentWebhooks = 100;

        // Create diverse webhook events
        const webhookPromises = Array.from({ length: concurrentWebhooks }, (_, i) => {
          const eventTypes = [
            'subscription.created',
            'subscription.updated',
            'invoice.payment_succeeded',
            'customer.subscription.deleted',
          ];
          const eventType = eventTypes[i % eventTypes.length];

          let event;
          switch (eventType) {
            case 'subscription.created':
              event = webhookEvents.subscription.created();
              break;
            case 'subscription.updated':
              event = webhookEvents.subscription.updated();
              break;
            case 'invoice.payment_succeeded':
              event = webhookEvents.invoice.paymentSucceeded();
              break;
            default:
              event = webhookEvents.subscription.deleted();
          }

          // Unique event IDs to avoid duplicate processing
          event.id = `evt_test_${i}_${Date.now()}`;
          const request = createWebhookRequest(event);

          return webhookHandler.handleWebhook(request as any);
        });

        // Process all webhooks concurrently
        const results = await Promise.all(webhookPromises);
        const endTime = Date.now();
        const totalTime = endTime - startTime;

        // Verify all webhooks processed successfully
        expect(results).toHaveLength(concurrentWebhooks);
        results.forEach(result => {
          expect(result.success).toBe(true);
        });

        // Performance assertions
        expect(totalTime).toBeLessThan(20000); // Should complete within 20 seconds

        console.log(`Webhook performance: ${concurrentWebhooks} webhooks in ${totalTime}ms`);
        console.log(`Average webhook processing time: ${totalTime / concurrentWebhooks}ms`);
      },
      PERFORMANCE_TIMEOUT
    );

    it(
      'should handle webhook bursts with duplicate events',
      async () => {
        const startTime = Date.now();
        const burstSize = 50;
        const duplicates = 3; // Each event sent 3 times

        // Create burst of duplicate webhook events (simulating retries)
        const baseEvent = webhookEvents.subscription.created();
        const webhookPromises: Promise<any>[] = [];

        for (let i = 0; i < burstSize; i++) {
          const event = { ...baseEvent, id: `evt_test_${i}` };

          // Send the same event multiple times (simulating retries)
          for (let j = 0; j < duplicates; j++) {
            const request = createWebhookRequest(event);
            webhookPromises.push(webhookHandler.handleWebhook(request as any));
          }
        }

        // Process all webhooks concurrently
        const results = await Promise.all(webhookPromises);
        const endTime = Date.now();
        const totalTime = endTime - startTime;

        // Verify all webhooks processed (idempotency handled at processor level)
        expect(results).toHaveLength(burstSize * duplicates);
        results.forEach(result => {
          expect(result.success).toBe(true);
        });

        expect(totalTime).toBeLessThan(15000);

        console.log(
          `Webhook burst performance: ${
            burstSize * duplicates
          } webhooks (${duplicates}x duplicates) in ${totalTime}ms`
        );
      },
      PERFORMANCE_TIMEOUT
    );
  });

  describe('Storage Calculation Performance', () => {
    it(
      'should handle large-scale storage calculations',
      async () => {
        const startTime = Date.now();
        const userCount = 200;

        // Mock storage service with realistic calculation times
        const mockCalculateStorage = jest.fn().mockImplementation(async () => {
          // Simulate some calculation time
          await new Promise(resolve => setTimeout(resolve, Math.random() * 10));

          return {
            basePlanGB: 10,
            addonGB: Math.floor(Math.random() * 5), // 0-5 GB addons
            referralBonusGB: Math.floor(Math.random() * 3), // 0-3 GB bonus
            totalGB: 10 + Math.floor(Math.random() * 5) + Math.floor(Math.random() * 3),
            usedBytes: Math.floor(Math.random() * 5 * 1024 * 1024 * 1024), // 0-5 GB used
            availableBytes: Math.floor(Math.random() * 10 * 1024 * 1024 * 1024), // Available space
          };
        });

        (subscriptionService as any).storageService.calculateUserStorage = mockCalculateStorage;

        // Create subscription creation requests that trigger storage calculations
        const subscriptionPromises = Array.from({ length: userCount }, (_, i) => {
          const createParams = {
            userId: `test-user-${i}`,
            userEmail: `test${i}@example.com`,
            stripeSubscriptionId: `sub_test_${i}`,
            stripeCustomerId: `cus_test_${i}`,
            plan: SubscriptionPlan.INDIVIDUAL,
            tier: SubscriptionTier.PLUS,
            interval: 'month' as const,
            status: SubscriptionStatus.ACTIVE,
            currentPeriodStart: new Date(),
            currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
          };

          return subscriptionService.createSubscription(createParams);
        });

        // Execute all subscription creations concurrently
        const results = await Promise.all(subscriptionPromises);
        const endTime = Date.now();
        const totalTime = endTime - startTime;

        // Verify all subscriptions created successfully
        expect(results).toHaveLength(userCount);
        results.forEach((result, index) => {
          expect(result.userId).toBe(`test-user-${index}`);
          expect(result.storageAllocation).toBeDefined();
          expect(result.storageAllocation.totalGB).toBeGreaterThan(0);
        });

        // Performance assertions
        expect(totalTime).toBeLessThan(25000); // Should complete within 25 seconds
        expect(mockCalculateStorage).toHaveBeenCalledTimes(userCount);

        console.log(`Storage calculation performance: ${userCount} calculations in ${totalTime}ms`);
        console.log(`Average calculation time: ${totalTime / userCount}ms`);
      },
      PERFORMANCE_TIMEOUT
    );

    it(
      'should handle family plan storage calculations at scale',
      async () => {
        const startTime = Date.now();
        const familyCount = 50;
        const membersPerFamily = 4;

        // Mock family storage calculations (more complex)
        const mockCalculateStorage = jest.fn().mockImplementation(async (_userId, subscription) => {
          // Simulate family storage calculation complexity
          if (subscription.plan === SubscriptionPlan.FAMILY) {
            await new Promise(resolve => setTimeout(resolve, Math.random() * 20)); // More time for family plans
          } else {
            await new Promise(resolve => setTimeout(resolve, Math.random() * 10));
          }

          return {
            basePlanGB: subscription.plan === SubscriptionPlan.FAMILY ? 50 : 10,
            totalGB: subscription.plan === SubscriptionPlan.FAMILY ? 50 : 10,
            usedBytes: Math.floor(Math.random() * 10 * 1024 * 1024 * 1024),
            availableBytes: Math.floor(Math.random() * 40 * 1024 * 1024 * 1024),
          };
        });

        (subscriptionService as any).storageService.calculateUserStorage = mockCalculateStorage;
        (subscriptionService as any).processFamilyMemberInvitations = jest.fn();

        // Create family subscription creation requests
        const familyPromises = Array.from({ length: familyCount }, (_, i) => {
          const createParams = {
            userId: `family-owner-${i}`,
            userEmail: `family${i}@example.com`,
            stripeSubscriptionId: `sub_family_${i}`,
            stripeCustomerId: `cus_family_${i}`,
            plan: SubscriptionPlan.FAMILY,
            tier: SubscriptionTier.FAMILY_2_5TB,
            interval: 'month' as const,
            status: SubscriptionStatus.ACTIVE,
            currentPeriodStart: new Date(),
            currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
            familyMemberIds: Array.from({ length: membersPerFamily }, (_, j) => `member-${i}-${j}`),
          };

          return subscriptionService.createSubscription(createParams);
        });

        // Execute all family subscription creations concurrently
        const results = await Promise.all(familyPromises);
        const endTime = Date.now();
        const totalTime = endTime - startTime;

        // Verify all family subscriptions created successfully
        expect(results).toHaveLength(familyCount);
        results.forEach(result => {
          expect(result.plan).toBe(SubscriptionPlan.FAMILY);
          expect(result.storageAllocation.basePlanGB).toBe(50);
        });

        expect(totalTime).toBeLessThan(30000); // Should complete within 30 seconds

        console.log(
          `Family storage performance: ${familyCount} family plans (${
            familyCount * membersPerFamily
          } total members) in ${totalTime}ms`
        );
      },
      PERFORMANCE_TIMEOUT
    );
  });

  describe('Database Performance', () => {
    it(
      'should handle high-frequency subscription updates',
      async () => {
        const startTime = Date.now();
        const updateCount = 100;
        const subscriptionId = 'sub_test_performance';

        // Mock existing subscription
        const existingSubscription = testDataGenerators.createTestSubscription({
          id: subscriptionId,
        });

        testEnv.mockFirestore
          .collection()
          .doc()
          .get.mockResolvedValue({
            exists: true,
            data: () => existingSubscription,
          });

        // Mock helper methods
        (subscriptionService as any).addAuditLogEntry = jest.fn();
        (subscriptionService as any).updateUserSubscriptionStatus = jest.fn();
        (subscriptionService as any).recalculateStorageAllocation = jest.fn();

        // Create rapid succession of updates
        const updatePromises = Array.from({ length: updateCount }, (_, i) => {
          const updateParams = {
            subscriptionId,
            status: i % 2 === 0 ? SubscriptionStatus.ACTIVE : SubscriptionStatus.PAST_DUE,
            lastUpdated: new Date(),
          };

          return subscriptionService.updateSubscription(updateParams);
        });

        // Execute all updates concurrently
        const results = await Promise.all(updatePromises);
        const endTime = Date.now();
        const totalTime = endTime - startTime;

        // Verify all updates processed
        expect(results).toHaveLength(updateCount);
        expect(totalTime).toBeLessThan(20000); // Should complete within 20 seconds

        // Verify database operations
        expect(testEnv.mockFirestore.collection().doc().update).toHaveBeenCalledTimes(updateCount);

        console.log(`Database update performance: ${updateCount} updates in ${totalTime}ms`);
      },
      PERFORMANCE_TIMEOUT
    );

    it(
      'should handle concurrent subscription queries',
      async () => {
        const startTime = Date.now();
        const queryCount = 150;

        // Mock subscription data
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

        // Create concurrent queries
        const queryPromises = Array.from({ length: queryCount }, (_, i) => {
          return subscriptionService.getUserSubscription(`user-${i}`);
        });

        // Execute all queries concurrently
        const results = await Promise.all(queryPromises);
        const endTime = Date.now();
        const totalTime = endTime - startTime;

        // Verify all queries completed
        expect(results).toHaveLength(queryCount);
        results.forEach(result => {
          expect(result).toEqual(mockSubscription);
        });

        expect(totalTime).toBeLessThan(15000); // Should complete within 15 seconds

        console.log(`Database query performance: ${queryCount} queries in ${totalTime}ms`);
      },
      PERFORMANCE_TIMEOUT
    );
  });

  describe('Memory and Resource Usage', () => {
    it(
      'should handle large payload processing efficiently',
      async () => {
        const startTime = Date.now();

        // Create a large family subscription with maximum members
        const maxMembers = 50; // Test with larger family
        const createParams = {
          userId: 'test-large-family-owner',
          userEmail: 'largefamily@example.com',
          stripeSubscriptionId: 'sub_large_family',
          stripeCustomerId: 'cus_large_family',
          plan: SubscriptionPlan.FAMILY,
          tier: SubscriptionTier.FAMILY_2_5TB,
          interval: 'month' as const,
          status: SubscriptionStatus.ACTIVE,
          currentPeriodStart: new Date(),
          currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
          familyMemberIds: Array.from({ length: maxMembers }, (_, i) => `large-family-member-${i}`),
          addons: ['1tb_storage', 'priority_support', 'advanced_analytics'], // Multiple addons
        };

        // Mock processors for large data
        (subscriptionService as any).processReferralCode = jest.fn().mockResolvedValue(null);
        (subscriptionService as any).updateUserSubscriptionStatus = jest.fn();
        (subscriptionService as any).addAuditLogEntry = jest.fn();
        (subscriptionService as any).processFamilyMemberInvitations = jest.fn();
        (subscriptionService as any).getPlanFeatures = jest.fn().mockReturnValue({});
        (subscriptionService as any).getMonthlyPrice = jest.fn().mockReturnValue(49.99);
        (subscriptionService as any).getPlanDisplayName = jest.fn().mockReturnValue('Family 2.5TB');

        // Process the large subscription
        const result = await subscriptionService.createSubscription(createParams);
        const endTime = Date.now();
        const totalTime = endTime - startTime;

        // Verify large subscription processed correctly
        expect(result.plan).toBe(SubscriptionPlan.FAMILY);
        expect(result.addons).toHaveLength(3);
        expect(totalTime).toBeLessThan(5000); // Should complete within 5 seconds even with large payload

        console.log(
          `Large payload performance: Family with ${maxMembers} members processed in ${totalTime}ms`
        );
      },
      PERFORMANCE_TIMEOUT
    );

    it(
      'should maintain performance across multiple service interactions',
      async () => {
        const startTime = Date.now();
        const operationCount = 30;

        // Mix of different operations
        const operations = [
          () =>
            subscriptionService.createSubscription({
              userId: `user-${Math.random()}`,
              userEmail: `test${Math.random()}@example.com`,
              stripeSubscriptionId: `sub_${Math.random()}`,
              stripeCustomerId: `cus_${Math.random()}`,
              plan: SubscriptionPlan.INDIVIDUAL,
              tier: SubscriptionTier.PLUS,
              interval: 'month' as const,
              status: SubscriptionStatus.ACTIVE,
              currentPeriodStart: new Date(),
              currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
            }),
          () => subscriptionService.getUserSubscription(`user-${Math.random()}`),
          () => {
            const event = webhookEvents.subscription.created();
            event.id = `evt_${Math.random()}`;
            const request = createWebhookRequest(event);
            return webhookHandler.handleWebhook(request as any);
          },
        ];

        // Setup mocks for all operations
        testEnv.mockFirestore
          .collection()
          .doc()
          .get.mockResolvedValue({
            exists: true,
            data: () => testDataGenerators.createTestSubscription(),
          });

        testEnv.mockFirestore
          .collection()
          .where()
          .where()
          .orderBy()
          .limit()
          .get.mockResolvedValue({
            empty: false,
            docs: [{ data: () => testDataGenerators.createTestSubscription() }],
          });

        (subscriptionService as any).processReferralCode = jest.fn().mockResolvedValue(null);
        (subscriptionService as any).updateUserSubscriptionStatus = jest.fn();
        (subscriptionService as any).addAuditLogEntry = jest.fn();
        (subscriptionService as any).getPlanFeatures = jest.fn().mockReturnValue({});
        (subscriptionService as any).getMonthlyPrice = jest.fn().mockReturnValue(9.99);
        (subscriptionService as any).getPlanDisplayName = jest
          .fn()
          .mockReturnValue('Individual Plus');

        // Execute mixed operations concurrently
        const mixedPromises = Array.from({ length: operationCount }, () => {
          const operation = operations[Math.floor(Math.random() * operations.length)];
          return operation().catch(error => ({ error: error.message }));
        });

        const results = await Promise.all(mixedPromises);
        const endTime = Date.now();
        const totalTime = endTime - startTime;

        // Verify mixed operations completed
        expect(results).toHaveLength(operationCount);
        expect(totalTime).toBeLessThan(20000); // Should complete within 20 seconds

        console.log(
          `Mixed operations performance: ${operationCount} mixed operations in ${totalTime}ms`
        );
      },
      PERFORMANCE_TIMEOUT
    );
  });
});
