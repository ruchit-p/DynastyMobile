/**
 * Test setup configuration for subscription system tests
 * Configures global test environment and common mocks
 */

import { jest } from '@jest/globals';

// Configure test timeouts
jest.setTimeout(30000); // 30 seconds default timeout

// Global test configuration
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace jest {
    interface Matchers<R> {
      toBeWithinRange(min: number, max: number): R;
      toHaveValidSubscriptionStructure(): R;
      toMatchStripeEventSchema(): R;
    }
  }
}

// Extend Jest matchers for subscription-specific assertions
expect.extend({
  toBeWithinRange(received: number, min: number, max: number) {
    const pass = received >= min && received <= max;
    return {
      message: () =>
        pass
          ? `Expected ${received} not to be within range ${min} - ${max}`
          : `Expected ${received} to be within range ${min} - ${max}`,
      pass,
    };
  },

  toHaveValidSubscriptionStructure(received: any) {
    const requiredFields = [
      'id',
      'userId',
      'plan',
      'tier',
      'status',
      'stripeSubscriptionId',
      'stripeCustomerId',
      'currentPeriodStart',
      'currentPeriodEnd',
      'createdAt',
      'updatedAt',
    ];

    const missingFields = requiredFields.filter(field => !(field in received));
    const pass = missingFields.length === 0;

    return {
      message: () =>
        pass
          ? 'Expected subscription object not to have valid structure'
          : `Expected subscription object to have valid structure. Missing fields: ${missingFields.join(
              ', '
            )}`,
      pass,
    };
  },

  toMatchStripeEventSchema(received: any) {
    const requiredFields = ['id', 'object', 'type', 'data', 'created'];
    const missingFields = requiredFields.filter(field => !(field in received));
    const pass = missingFields.length === 0 && received.object === 'event';

    return {
      message: () =>
        pass
          ? 'Expected event not to match Stripe event schema'
          : `Expected event to match Stripe event schema. Missing fields: ${missingFields.join(
              ', '
            )}`,
      pass,
    };
  },
});

// Global test environment setup
beforeAll(async () => {
  // Set environment variables for testing
  process.env.NODE_ENV = 'test';
  process.env.FIREBASE_PROJECT_ID = 'dynasty-test-project';
  process.env.FUNCTIONS_EMULATOR = 'true';
  process.env.FIRESTORE_EMULATOR_HOST = 'localhost:8080';

  // Mock Firebase Admin initialization to prevent real connections
  jest.doMock('firebase-admin', () => ({
    initializeApp: jest.fn(),
    credential: {
      applicationDefault: jest.fn(),
    },
    firestore: jest.fn(() => ({
      collection: jest.fn(() => ({
        doc: jest.fn(() => ({
          get: jest.fn(),
          set: jest.fn(),
          update: jest.fn(),
          delete: jest.fn(),
        })),
        where: jest.fn(() => ({
          where: jest.fn(() => ({
            orderBy: jest.fn(() => ({
              limit: jest.fn(() => ({
                get: jest.fn(),
              })),
            })),
          })),
        })),
        add: jest.fn(),
        get: jest.fn(),
      })),
      batch: jest.fn(() => ({
        set: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
        commit: jest.fn(),
      })),
    })),
  }));

  // Mock Firebase Functions to prevent real deployments
  jest.doMock('firebase-functions/v2', () => ({
    logger: {
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn(),
    },
    https: {
      onRequest: jest.fn(handler => handler),
      onCall: jest.fn(handler => handler),
    },
  }));

  // Global console setup for cleaner test output
  if (process.env.JEST_SILENT !== 'false') {
    // Suppress console.log in tests unless explicitly enabled
    global.console = {
      ...console,
      log: jest.fn(),
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    };
  }

  console.log('🧪 Test environment initialized for Dynasty Subscription System');
});

// Global cleanup after all tests
afterAll(async () => {
  // Clean up any global resources
  console.log('🧹 Test environment cleanup completed');
});

// Setup before each test
beforeEach(() => {
  // Clear all mocks before each test to ensure isolation
  jest.clearAllMocks();

  // Reset any global state
  if (typeof global.gc === 'function') {
    global.gc(); // Force garbage collection if available
  }
});

// Cleanup after each test
afterEach(() => {
  // Additional cleanup if needed
  jest.restoreAllMocks();
});

// Error handling for unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  // Don't exit the process in tests, just log
});

// Error handling for uncaught exceptions
process.on('uncaughtException', error => {
  console.error('Uncaught Exception:', error);
  // Don't exit the process in tests, just log
});

// Export test utilities for use in test files
export const TestConfig = {
  // Default timeouts
  TIMEOUT: {
    UNIT: 10000, // 10 seconds
    INTEGRATION: 30000, // 30 seconds
    PERFORMANCE: 120000, // 2 minutes
  },

  // Test data limits
  LIMITS: {
    MAX_CONCURRENT_OPERATIONS: 100,
    MAX_FAMILY_MEMBERS: 10,
    MAX_TEST_ITERATIONS: 1000,
  },

  // Mock configurations
  MOCK_DELAYS: {
    STRIPE_API: 100, // 100ms
    DATABASE: 50, // 50ms
    WEBHOOK: 25, // 25ms
  },
};

// Test helper functions
export const TestHelpers = {
  /**
   * Wait for a specific amount of time
   */
  async delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  },

  /**
   * Generate a unique test ID
   */
  generateTestId(prefix: string = 'test'): string {
    return `${prefix}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  },

  /**
   * Create a test-safe date (consistent across test runs)
   */
  createTestDate(offset: number = 0): Date {
    const baseDate = new Date('2024-01-15T10:00:00.000Z');
    return new Date(baseDate.getTime() + offset);
  },

  /**
   * Simulate async operation with controlled timing
   */
  async simulateAsyncOperation<T>(
    result: T,
    delay: number = TestConfig.MOCK_DELAYS.DATABASE
  ): Promise<T> {
    await this.delay(delay);
    return result;
  },

  /**
   * Generate test email addresses
   */
  generateTestEmail(prefix: string = 'test'): string {
    return `${prefix}_${Date.now()}@example.com`;
  },

  /**
   * Validate test environment setup
   */
  validateTestEnvironment(): boolean {
    const requiredEnvVars = ['NODE_ENV', 'FIREBASE_PROJECT_ID', 'FUNCTIONS_EMULATOR'];

    const missing = requiredEnvVars.filter(envVar => !process.env[envVar]);

    if (missing.length > 0) {
      console.error(`Missing required environment variables: ${missing.join(', ')}`);
      return false;
    }

    return true;
  },

  /**
   * Memory usage tracker for performance tests
   */
  getMemoryUsage(): NodeJS.MemoryUsage {
    return process.memoryUsage();
  },

  /**
   * Performance timing helper
   */
  createTimer() {
    const start = process.hrtime.bigint();
    return {
      end(): number {
        const end = process.hrtime.bigint();
        return Number(end - start) / 1_000_000; // Convert to milliseconds
      },
    };
  },
};

// Validate test environment on setup
if (!TestHelpers.validateTestEnvironment()) {
  throw new Error('Test environment validation failed');
}
