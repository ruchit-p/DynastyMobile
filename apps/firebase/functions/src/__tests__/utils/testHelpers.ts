/**
 * Test helper utilities for Stripe integration testing
 * Provides common testing patterns and setup utilities
 */

import { jest } from '@jest/globals';
import {
  createMockStripeClient,
  resetStripeMocks,
  configureMockForScenario,
} from '../mocks/stripeMocks';
import { webhookSignatureUtils } from '../mocks/stripeWebhookFixtures';

// Mock Firestore utilities for subscription testing
export function createMockFirestoreForSubscriptions() {
  const mockUserDoc = {
    exists: true,
    data: jest.fn(() => ({
      id: 'test-user-id',
      email: 'test@example.com',
      stripeCustomerId: 'cus_test_123',
      subscriptionId: 'sub_test_123',
      subscriptionPlan: 'individual',
      subscriptionStatus: 'active',
    })),
    get: jest.fn(),
    set: jest.fn(),
    update: jest.fn(),
    ref: {
      id: 'test-user-id',
      set: jest.fn(),
      update: jest.fn(),
    },
  };

  const mockSubscriptionDoc = {
    exists: true,
    data: jest.fn(() => ({
      id: 'sub_test_123',
      userId: 'test-user-id',
      stripeSubscriptionId: 'sub_test_123',
      plan: 'individual',
      tier: 'plus',
      status: 'active',
      createdAt: new Date(),
      updatedAt: new Date(),
    })),
    get: jest.fn(),
    set: jest.fn(),
    update: jest.fn(),
    ref: {
      id: 'sub_test_123',
      set: jest.fn(),
      update: jest.fn(),
    },
  };

  const mockCollection = {
    doc: jest.fn((id?: string) => {
      if (id && id.startsWith('test-user')) return mockUserDoc;
      if (id && id.startsWith('sub_test')) return mockSubscriptionDoc;
      return mockUserDoc; // Default fallback
    }),
    where: jest.fn(() => ({
      where: jest.fn(() => ({
        orderBy: jest.fn(() => ({
          limit: jest.fn(() => ({
            get: jest.fn(() => ({
              empty: false,
              docs: [mockSubscriptionDoc],
            })),
          })),
        })),
      })),
      get: jest.fn(() => ({
        empty: false,
        docs: [mockSubscriptionDoc],
      })),
    })),
    add: jest.fn(() => Promise.resolve(mockSubscriptionDoc.ref)),
    get: jest.fn(() => ({
      empty: false,
      docs: [mockSubscriptionDoc],
    })),
  };

  const mockBatch = {
    set: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    commit: jest.fn(() => Promise.resolve()),
  };

  const mockFirestore = {
    collection: jest.fn(() => mockCollection),
    doc: jest.fn(() => mockUserDoc),
    batch: jest.fn(() => mockBatch),
  };

  return {
    mockFirestore,
    mockUserDoc,
    mockSubscriptionDoc,
    mockCollection,
    mockBatch,
  };
}

// Test environment setup for Stripe services
export class StripeTestEnvironment {
  public mockStripeClient: any;
  public mockFirestore: any;
  private originalConsoleError: any;

  constructor() {
    this.mockStripeClient = createMockStripeClient();
    const firestoreMocks = createMockFirestoreForSubscriptions();
    this.mockFirestore = firestoreMocks.mockFirestore;
  }

  // Setup before each test
  setup() {
    // Suppress console errors during tests
    this.originalConsoleError = console.error;
    console.error = jest.fn();

    // Reset all mocks
    this.resetMocks();

    // Mock Stripe configuration
    this.mockStripeConfig();

    // Mock Firebase services
    this.mockFirebaseServices();
  }

  // Cleanup after each test
  teardown() {
    // Restore console.error
    if (this.originalConsoleError) {
      console.error = this.originalConsoleError;
    }

    // Clear all mocks
    jest.clearAllMocks();
  }

  // Reset all mocks to default state
  resetMocks() {
    resetStripeMocks(this.mockStripeClient);
    jest.clearAllMocks();
  }

  // Configure for specific test scenarios
  configureScenario(scenario: string) {
    configureMockForScenario(this.mockStripeClient, scenario);
  }

  // Mock Stripe configuration and secrets
  private mockStripeConfig() {
    jest.doMock('../../config/stripeConfig', () => ({
      getStripeClient: jest.fn(() => this.mockStripeClient),
      createCheckoutSessionConfig: jest.fn(() => ({
        mode: 'subscription',
        success_url: 'https://example.com/success',
        cancel_url: 'https://example.com/cancel',
      })),
      createSubscriptionUpdateParams: jest.fn(() => ({})),
      STRIPE_CONFIG: {
        apiVersion: '2023-10-16',
        maxNetworkRetries: 3,
        timeout: 10000,
      },
    }));

    jest.doMock('../../config/stripeSecrets', () => ({
      STRIPE_SECRET_KEY: { value: () => 'sk_test_123' },
      STRIPE_WEBHOOK_SECRET: { value: () => webhookSignatureUtils.mockSecret },
      STRIPE_PUBLISHABLE_KEY: { value: () => 'pk_test_123' },
    }));

    jest.doMock('../../config/stripeProducts', () => ({
      getStripePriceId: jest.fn(() => 'price_test_123'),
      getAddonPriceId: jest.fn(() => 'price_addon_test_123'),
      isAddonEligible: jest.fn(() => true),
    }));
  }

  // Mock Firebase services
  private mockFirebaseServices() {
    jest.doMock('firebase-admin/firestore', () => ({
      getFirestore: jest.fn(() => this.mockFirestore),
      Timestamp: {
        now: jest.fn(() => ({ toDate: () => new Date() })),
        fromDate: jest.fn((date: any) => ({ toDate: () => date })),
      },
    }));
  }

  // Helper to create mock callable request
  createMockRequest(data: any = {}, auth: any = { uid: 'test-user-id' }) {
    return {
      data,
      auth,
      rawRequest: {
        headers: {},
        ip: '127.0.0.1',
      },
    };
  }

  // Helper to create mock webhook request
  createMockWebhookRequest(payload: string) {
    return {
      body: payload,
      headers: webhookSignatureUtils.createWebhookHeaders(payload),
      rawRequest: {
        body: payload,
        headers: webhookSignatureUtils.createWebhookHeaders(payload),
      },
    };
  }

  // Helper to expect error with specific code
  expectErrorWithCode(promise: Promise<any>, expectedCode: string) {
    return expect(promise).rejects.toMatchObject({
      code: expectedCode,
    });
  }

  // Helper to expect successful operation
  expectSuccess(promise: Promise<any>) {
    return expect(promise).resolves.toBeDefined();
  }

  // Mock rate limiting to always pass
  mockRateLimitPassing() {
    jest.doMock('../../middleware/auth', () => ({
      withAuth: jest.fn((handler: any) => handler),
      checkRateLimit: jest.fn(() => Promise.resolve('test-user-id')),
      RateLimitType: {
        STRIPE_CHECKOUT: 'stripe_checkout',
        STRIPE_SUBSCRIPTION_UPDATE: 'stripe_subscription_update',
        WEBHOOK: 'webhook',
      },
    }));
  }

  // Mock rate limiting to fail
  mockRateLimitFailing() {
    const rateLimitError = new Error('Rate limit exceeded');
    (rateLimitError as any).code = 'RATE_LIMIT_EXCEEDED';

    jest.doMock('../../middleware/auth', () => ({
      withAuth: jest.fn(() => {
        throw rateLimitError;
      }),
      checkRateLimit: jest.fn(() => Promise.reject(rateLimitError)),
    }));
  }
}

// Utility functions for common test assertions
export const testAssertions = {
  // Assert that Stripe method was called with correct parameters
  expectStripeMethodCalled: (mockMethod: any, expectedParams: any) => {
    expect(mockMethod).toHaveBeenCalledWith(expect.objectContaining(expectedParams));
  },

  // Assert that Firestore was updated correctly
  expectFirestoreUpdate: (mockDoc: any, expectedData: any) => {
    expect(mockDoc.update).toHaveBeenCalledWith(expect.objectContaining(expectedData));
  },

  // Assert that subscription status was updated
  expectSubscriptionStatusUpdate: (mockDoc: any, expectedStatus: string) => {
    expect(mockDoc.update).toHaveBeenCalledWith(
      expect.objectContaining({
        status: expectedStatus,
        updatedAt: expect.any(Date),
      })
    );
  },

  // Assert that audit log was created
  expectAuditLogCreated: (mockCollection: any, expectedAction: string) => {
    expect(mockCollection.add).toHaveBeenCalledWith(
      expect.objectContaining({
        action: expectedAction,
        timestamp: expect.any(Date),
      })
    );
  },
};

// Data generators for test scenarios
export const testDataGenerators = {
  // Generate test user data
  createTestUser: (overrides: any = {}) => ({
    id: 'test-user-id',
    email: 'test@example.com',
    name: 'Test User',
    stripeCustomerId: 'cus_test_123',
    subscriptionId: 'sub_test_123',
    subscriptionPlan: 'individual',
    subscriptionStatus: 'active',
    ...overrides,
  }),

  // Generate test subscription data
  createTestSubscription: (overrides: any = {}) => ({
    id: 'sub_test_123',
    userId: 'test-user-id',
    stripeSubscriptionId: 'sub_test_123',
    plan: 'individual',
    tier: 'plus',
    status: 'active',
    currentPeriodStart: new Date(),
    currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  }),

  // Generate family plan test data
  createTestFamilyPlan: (memberCount: number = 2) => ({
    plan: 'family',
    tier: 'family_2_5tb',
    familyMembers: Array.from({ length: memberCount }, (_, i) => ({
      userId: `member-${i + 1}`,
      addedAt: new Date(),
      status: 'active',
    })),
  }),
};

// Export default test environment instance
export const testEnv = new StripeTestEnvironment();
