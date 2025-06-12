/**
 * Real-world load testing scenarios for subscription system
 * Tests production-like traffic patterns and edge cases
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { StripeService } from '../../services/stripeService';
import { SubscriptionService } from '../../services/subscriptionService';
import { StripeWebhookHandler } from '../../webhooks/stripeWebhookHandler';
import { SubscriptionPlan, SubscriptionTier, SubscriptionStatus } from '../../types/subscription';
import { StripeTestEnvironment, testDataGenerators } from '../utils/testHelpers';
import { webhookEvents, createWebhookRequest } from '../mocks/stripeWebhookFixtures';
import { createMockStripeCustomer, createMockCheckoutSession } from '../mocks/stripeMocks';
import {
  LoadTestExecutor,
  MemoryMonitor,
  ColdStartMonitor,
  PerformanceAssertions,
  LoadTestUtils,
} from '../utils/loadTestUtils';

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

// Extended timeout for load tests
const LOAD_TEST_TIMEOUT = 120000; // 2 minutes

describe('Real-World Load Testing', () => {
  let stripeService: StripeService;
  let subscriptionService: SubscriptionService;
  let webhookHandler: StripeWebhookHandler;
  let loadTester: LoadTestExecutor;
  let memoryMonitor: MemoryMonitor;
  let coldStartMonitor: ColdStartMonitor;

  beforeEach(() => {
    testEnv.setup();
    testEnv.mockRateLimitPassing();

    stripeService = new StripeService();
    subscriptionService = new SubscriptionService();
    webhookHandler = new StripeWebhookHandler();
    loadTester = new LoadTestExecutor();
    memoryMonitor = new MemoryMonitor();
    coldStartMonitor = ColdStartMonitor.getInstance();

    // Inject mock Stripe client
    stripeService.stripe = testEnv.mockStripeClient;

    // Setup standard mocks
    setupStandardMocks();
  });

  afterEach(() => {
    testEnv.teardown();
    coldStartMonitor.reset();
  });

  function setupStandardMocks(): void {
    // Mock Stripe operations
    testEnv.mockStripeClient.customers.create.mockResolvedValue(createMockStripeCustomer());
    testEnv.mockStripeClient.checkout.sessions.create.mockResolvedValue(
      createMockCheckoutSession()
    );

    // Mock configurations
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const stripeProducts = require('../../config/stripeProducts');
    stripeProducts.getStripePriceId = jest.fn().mockReturnValue('price_test_123');
    stripeProducts.isEligibleForPlan = jest.fn().mockReturnValue(true);
    stripeProducts.getStorageAllocation = jest.fn().mockReturnValue(10);

    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { createCheckoutSessionConfig } = require('../../config/stripeConfig');
    createCheckoutSessionConfig.mockReturnValue({
      mode: 'subscription',
      success_url: 'https://example.com/success',
      cancel_url: 'https://example.com/cancel',
    });

    // Mock subscription service dependencies
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

    // Mock Firestore operations
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
  }

  describe('Production Traffic Simulation', () => {
    it(
      'should handle typical production load pattern',
      async () => {
        console.log('🚀 Starting production traffic simulation...');

        // Start memory monitoring
        memoryMonitor.startMonitoring(500);

        // Simulate typical production traffic: mostly individual plans with some family plans
        const operationFactory = () => {
          const isFamily = Math.random() < 0.2; // 20% family plans
          const hasErrors = Math.random() < 0.05; // 5% error rate

          if (hasErrors) {
            // Simulate occasional Stripe API errors
            testEnv.mockStripeClient.customers.create.mockRejectedValueOnce(
              new Error('Stripe API temporarily unavailable')
            );
          }

          const users = LoadTestUtils.generateTestUsers(1);
          const user = users[0];

          return stripeService.createCheckoutSession({
            userId: user.userId,
            userEmail: user.email,
            plan: isFamily ? SubscriptionPlan.FAMILY : SubscriptionPlan.INDIVIDUAL,
            tier: isFamily ? SubscriptionTier.FAMILY_2_5TB : SubscriptionTier.PLUS,
            interval: 'month' as const,
            familyMemberIds: isFamily
              ? [`${user.userId}-member1`, `${user.userId}-member2`]
              : undefined,
          });
        };

        // Execute sustained load test (30 operations per second for 10 seconds)
        const result = await loadTester.executeSustainedLoad(
          operationFactory,
          10000, // 10 seconds
          30 // 30 ops/second
        );

        // Stop memory monitoring
        const memoryReport = memoryMonitor.stopMonitoring();

        // Print results
        console.log(LoadTestUtils.formatResults(result));
        console.log(LoadTestUtils.formatMemoryReport(memoryReport));

        // Performance assertions
        PerformanceAssertions.assertOperationsPerSecond(result, 25); // At least 25 ops/second
        PerformanceAssertions.assertErrorRate(result, 10); // Max 10% error rate
        PerformanceAssertions.assertPercentileResponseTime(result, 95, 1000); // 95th percentile under 1s
        PerformanceAssertions.assertMemoryUsage(memoryReport, 512); // Max 512MB memory

        expect(result.totalOperations).toBeGreaterThan(250); // Should process ~300 operations
        expect(result.successfulOperations).toBeGreaterThan(200);
      },
      LOAD_TEST_TIMEOUT
    );

    it(
      'should handle Black Friday traffic surge',
      async () => {
        console.log('🛍️ Simulating Black Friday traffic surge...');

        // Start memory monitoring
        memoryMonitor.startMonitoring(250);

        // Simulate high-intensity checkout traffic with promotional discounts
        const operationFactory = () => {
          const users = LoadTestUtils.generateTestUsers(1);
          const user = users[0];

          return stripeService.createCheckoutSession({
            userId: user.userId,
            userEmail: user.email,
            plan: SubscriptionPlan.INDIVIDUAL,
            tier: SubscriptionTier.PLUS,
            interval: 'annual' as const, // More annual plans during sales
            referralCode: Math.random() < 0.3 ? 'BLACKFRIDAY2024' : undefined, // 30% use promo codes
          });
        };

        // Execute burst load test (simulate traffic spikes)
        const result = await loadTester.executeBurstLoad(
          operationFactory,
          50, // 50 operations per burst
          6, // 6 bursts
          2000 // 2 second delay between bursts
        );

        const memoryReport = memoryMonitor.stopMonitoring();

        console.log('🏆 Black Friday Load Test Results:');
        console.log(LoadTestUtils.formatResults(result));
        console.log(LoadTestUtils.formatMemoryReport(memoryReport));

        // Stricter performance requirements for peak traffic
        PerformanceAssertions.assertOperationsPerSecond(result, 40); // Higher throughput needed
        PerformanceAssertions.assertErrorRate(result, 5); // Lower error tolerance
        PerformanceAssertions.assertPercentileResponseTime(result, 99, 2000); // 99th percentile under 2s

        expect(result.totalOperations).toBe(300); // 6 bursts × 50 operations
      },
      LOAD_TEST_TIMEOUT
    );

    it(
      'should handle mixed operation workload',
      async () => {
        console.log('🔄 Testing mixed operation workload...');

        memoryMonitor.startMonitoring(500);

        // Simulate realistic mix of operations
        const operationFactories = [
          // 50% - New checkouts
          () => {
            const users = LoadTestUtils.generateTestUsers(1);
            return stripeService.createCheckoutSession({
              userId: users[0].userId,
              userEmail: users[0].email,
              plan: SubscriptionPlan.INDIVIDUAL,
              tier: SubscriptionTier.PLUS,
              interval: 'month' as const,
            });
          },
          // 25% - Subscription queries
          () => {
            const users = LoadTestUtils.generateTestUsers(1);
            return subscriptionService.getUserSubscription(users[0].userId);
          },
          // 15% - Webhook processing
          () => {
            const event = webhookEvents.subscription.created();
            event.id = `evt_load_test_${Date.now()}_${Math.random()}`;
            const request = createWebhookRequest(event);
            return webhookHandler.handleWebhook(request as any);
          },
          // 10% - Subscription updates
          () => {
            const subscriptionId = `sub_test_${Date.now()}`;
            return subscriptionService.updateSubscription({
              subscriptionId,
              status: SubscriptionStatus.ACTIVE,
            });
          },
        ];

        const mixedOperationFactory = () => {
          const weights = [50, 25, 15, 10]; // Percentage weights
          const random = Math.random() * 100;
          let cumulative = 0;

          for (let i = 0; i < weights.length; i++) {
            cumulative += weights[i];
            if (random <= cumulative) {
              return operationFactories[i]();
            }
          }

          return operationFactories[0](); // Fallback
        };

        // Execute mixed workload
        const result = await loadTester.executeLoadTest(mixedOperationFactory, {
          concurrency: 25,
          totalOperations: 500,
          warmupOperations: 20,
          rampUpTimeMs: 5000,
        });

        const memoryReport = memoryMonitor.stopMonitoring();

        console.log('🎯 Mixed Workload Results:');
        console.log(LoadTestUtils.formatResults(result));
        console.log(LoadTestUtils.formatMemoryReport(memoryReport));

        // Mixed workload assertions
        PerformanceAssertions.assertOperationsPerSecond(result, 20);
        PerformanceAssertions.assertErrorRate(result, 8);
        PerformanceAssertions.assertPercentileResponseTime(result, 95, 1500);

        expect(result.totalOperations).toBe(500);
      },
      LOAD_TEST_TIMEOUT
    );
  });

  describe('Stress Testing', () => {
    it(
      'should handle extreme concurrent load',
      async () => {
        console.log('💪 Stress testing with extreme load...');

        // Record cold start for this test
        coldStartMonitor.recordColdStart(coldStartMonitor.measureInitializationTime());

        memoryMonitor.startMonitoring(200);

        const operationFactory = () => {
          const users = LoadTestUtils.generateTestUsers(1);
          return stripeService.createCheckoutSession({
            userId: users[0].userId,
            userEmail: users[0].email,
            plan: SubscriptionPlan.INDIVIDUAL,
            tier: SubscriptionTier.PLUS,
            interval: 'month' as const,
          });
        };

        // Extreme concurrency test
        const result = await loadTester.executeLoadTest(operationFactory, {
          concurrency: 100, // Very high concurrency
          totalOperations: 1000,
          timeoutMs: 30000,
          warmupOperations: 50,
        });

        const memoryReport = memoryMonitor.stopMonitoring();
        const coldStartStats = coldStartMonitor.getColdStartStats();

        console.log('🔥 Stress Test Results:');
        console.log(LoadTestUtils.formatResults(result));
        console.log(LoadTestUtils.formatMemoryReport(memoryReport));
        console.log(`Cold Start Stats: ${JSON.stringify(coldStartStats, null, 2)}`);

        // Stress test should handle degraded performance gracefully
        expect(result.totalOperations).toBe(1000);
        expect(result.successfulOperations / result.totalOperations).toBeGreaterThan(0.7); // At least 70% success

        // Memory should not grow excessively under stress
        expect(memoryReport.memoryGrowth).toBeLessThan(200 * 1024 * 1024); // Less than 200MB growth
      },
      LOAD_TEST_TIMEOUT
    );

    it(
      'should recover from temporary failures',
      async () => {
        console.log('🔄 Testing recovery from failures...');

        let failureWindow = false;
        let operationCount = 0;

        const operationFactory = () => {
          operationCount++;

          // Simulate 10-second failure window (operations 50-150)
          if (operationCount >= 50 && operationCount <= 150) {
            if (!failureWindow) {
              console.log('💥 Entering failure window...');
              failureWindow = true;
            }

            // Simulate Stripe API failures
            testEnv.mockStripeClient.customers.create.mockRejectedValueOnce(
              new Error('Service temporarily unavailable')
            );
          } else if (failureWindow && operationCount > 150) {
            console.log('✅ Exiting failure window...');
            failureWindow = false;

            // Restore normal operation
            testEnv.mockStripeClient.customers.create.mockResolvedValue(createMockStripeCustomer());
          }

          const users = LoadTestUtils.generateTestUsers(1);
          return stripeService.createCheckoutSession({
            userId: users[0].userId,
            userEmail: users[0].email,
            plan: SubscriptionPlan.INDIVIDUAL,
            tier: SubscriptionTier.PLUS,
            interval: 'month' as const,
          });
        };

        const result = await loadTester.executeLoadTest(operationFactory, {
          concurrency: 20,
          totalOperations: 300,
          timeoutMs: 15000,
        });

        console.log('🚀 Failure Recovery Results:');
        console.log(LoadTestUtils.formatResults(result));

        // Should show recovery pattern
        expect(result.totalOperations).toBe(300);
        expect(result.failedOperations).toBeGreaterThan(80); // Failures during window
        expect(result.failedOperations).toBeLessThan(120); // But not all operations fail
        expect(result.successfulOperations).toBeGreaterThan(180); // Good recovery
      },
      LOAD_TEST_TIMEOUT
    );
  });

  describe('Edge Case Performance', () => {
    it(
      'should handle large family plans efficiently',
      async () => {
        console.log('👨‍👩‍👧‍👦 Testing large family plan performance...');

        const operationFactory = () => {
          const users = LoadTestUtils.generateTestUsers(1);
          const user = users[0];

          // Create large family (near maximum)
          const familySize = Math.floor(Math.random() * 8) + 2; // 2-10 members
          const familyMemberIds = Array.from(
            { length: familySize },
            (_, i) => `${user.userId}-family-member-${i}`
          );

          return stripeService.createCheckoutSession({
            userId: user.userId,
            userEmail: user.email,
            plan: SubscriptionPlan.FAMILY,
            tier: SubscriptionTier.FAMILY_2_5TB,
            interval: 'month' as const,
            familyMemberIds,
          });
        };

        const result = await loadTester.executeLoadTest(operationFactory, {
          concurrency: 15,
          totalOperations: 100,
          timeoutMs: 20000,
        });

        console.log('🏠 Large Family Plan Results:');
        console.log(LoadTestUtils.formatResults(result));

        // Family plans should still perform well
        PerformanceAssertions.assertOperationsPerSecond(result, 8); // Lower due to complexity
        PerformanceAssertions.assertErrorRate(result, 5);
        PerformanceAssertions.assertPercentileResponseTime(result, 95, 2500);

        expect(result.totalOperations).toBe(100);
      },
      LOAD_TEST_TIMEOUT
    );

    it(
      'should handle webhook event bursts',
      async () => {
        console.log('📡 Testing webhook event burst handling...');

        // Simulate realistic webhook scenarios
        const webhookTypes = [
          () => webhookEvents.subscription.created(),
          () => webhookEvents.subscription.updated(),
          () => webhookEvents.invoice.paymentSucceeded(),
          () => webhookEvents.invoice.paymentFailed(),
          () => webhookEvents.subscription.deleted(),
        ];

        const operationFactory = () => {
          const eventFactory = webhookTypes[Math.floor(Math.random() * webhookTypes.length)];
          const event = eventFactory();
          event.id = `evt_burst_${Date.now()}_${Math.random()}`;

          const request = createWebhookRequest(event);
          return webhookHandler.handleWebhook(request as any);
        };

        // Simulate webhook bursts (common with Stripe)
        const result = await loadTester.executeBurstLoad(
          operationFactory,
          80, // 80 webhooks per burst
          5, // 5 bursts
          1000 // 1 second between bursts
        );

        console.log('⚡ Webhook Burst Results:');
        console.log(LoadTestUtils.formatResults(result));

        // Webhooks should process quickly and reliably
        PerformanceAssertions.assertOperationsPerSecond(result, 50); // High throughput for webhooks
        PerformanceAssertions.assertErrorRate(result, 2); // Very low error rate
        PerformanceAssertions.assertPercentileResponseTime(result, 99, 500); // Fast processing

        expect(result.totalOperations).toBe(400); // 5 bursts × 80 operations
      },
      LOAD_TEST_TIMEOUT
    );
  });

  describe('Performance Regression Detection', () => {
    it(
      'should detect performance baseline',
      async () => {
        console.log('📊 Establishing performance baseline...');

        const operationFactory = () => {
          const users = LoadTestUtils.generateTestUsers(1);
          return stripeService.createCheckoutSession({
            userId: users[0].userId,
            userEmail: users[0].email,
            plan: SubscriptionPlan.INDIVIDUAL,
            tier: SubscriptionTier.PLUS,
            interval: 'month' as const,
          });
        };

        // Run baseline test multiple times for consistency
        const runs = 3;
        const baselineResults = [];

        for (let run = 0; run < runs; run++) {
          console.log(`🏃 Baseline run ${run + 1}/${runs}...`);

          const result = await loadTester.executeLoadTest(operationFactory, {
            concurrency: 10,
            totalOperations: 100,
            warmupOperations: 10,
          });

          baselineResults.push(result);

          // Small delay between runs
          await LoadTestUtils.randomDelay(500, 1000);
        }

        // Calculate baseline metrics
        const avgOpsPerSecond =
          baselineResults.reduce((sum, result) => sum + result.operationsPerSecond, 0) / runs;

        const avgResponseTime =
          baselineResults.reduce((sum, result) => sum + result.averageTimeMs, 0) / runs;

        console.log('📈 Performance Baseline Established:');
        console.log(`   Operations/Second: ${avgOpsPerSecond.toFixed(2)}`);
        console.log(`   Average Response Time: ${avgResponseTime.toFixed(2)}ms`);

        // Store baseline for future regression tests
        const baseline = {
          operationsPerSecond: avgOpsPerSecond,
          averageResponseTimeMs: avgResponseTime,
          testDate: new Date().toISOString(),
        };

        // Basic performance requirements
        expect(avgOpsPerSecond).toBeGreaterThan(15); // Minimum acceptable throughput
        expect(avgResponseTime).toBeLessThan(500); // Maximum acceptable response time

        // This baseline could be stored and used for regression testing
        console.log(`💾 Baseline data: ${JSON.stringify(baseline, null, 2)}`);
      },
      LOAD_TEST_TIMEOUT
    );
  });
});
