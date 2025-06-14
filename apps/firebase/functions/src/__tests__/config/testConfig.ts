/**
 * Centralized test configuration for Firebase Functions tests
 * Provides consistent settings and utilities across all test suites
 */

export const TEST_CONFIG = {
  // Firebase configuration
  firebase: {
    projectId: 'dynasty-test-project',
    region: 'us-central1',
    storageBucket: 'dynasty-test-project.appspot.com',
  },

  // Emulator hosts
  emulators: {
    firestore: 'localhost:8080',
    auth: 'localhost:9099',
    storage: 'localhost:9199',
    functions: 'localhost:5001',
  },

  // Test timeouts
  timeouts: {
    unit: 10000, // 10 seconds
    integration: 30000, // 30 seconds
    performance: 120000, // 2 minutes
    longRunning: 300000, // 5 minutes
  },

  // Rate limits for testing
  rateLimits: {
    sms: {
      otp: { hourly: 3, daily: 10, monthly: 50 },
      notification: { hourly: 10, daily: 50, monthly: 500 },
      marketing: { hourly: 5, daily: 20, monthly: 100 },
      invitation: { hourly: 5, daily: 20, monthly: 100 },
    },
  },

  // AWS configuration for testing
  aws: {
    region: 'us-east-1',
    smsPhonePoolId: 'test-pool-id',
    smsConfigurationSetName: 'test-config-set',
    snsTopicArn: 'arn:aws:sns:us-east-1:123456789012:dynasty-sms-events',
  },

  // Stripe test configuration
  stripe: {
    secretKey: 'sk_test_dynasty_test_key',
    webhookSecret: 'whsec_test_dynasty_webhook_secret',
    prices: {
      individual: 'price_test_individual',
      family: 'price_test_family',
    },
  },

  // Test data limits
  limits: {
    maxFamilyMembers: 10,
    maxBatchSize: 10,
    maxFileSize: 1024 * 1024 * 1024, // 1GB
    maxConcurrentOperations: 100,
  },

  // Mock delays for realistic testing
  mockDelays: {
    database: 50, // 50ms
    stripeApi: 100, // 100ms
    awsApi: 75, // 75ms
    webhook: 25, // 25ms
    email: 150, // 150ms
  },

  // Feature flags for testing
  features: {
    vaultSdkEnabled: true,
    r2MigrationEnabled: false,
    enhancedSecurityEnabled: true,
  },
};

/**
 * Test environment setup helper
 */
export function setupTestEnvironment(): void {
  // Set all required environment variables
  process.env.NODE_ENV = 'test';
  process.env.FIREBASE_PROJECT_ID = TEST_CONFIG.firebase.projectId;
  process.env.GCLOUD_PROJECT = TEST_CONFIG.firebase.projectId;
  process.env.FUNCTIONS_EMULATOR = 'true';
  process.env.FIRESTORE_EMULATOR_HOST = TEST_CONFIG.emulators.firestore;
  process.env.FIREBASE_AUTH_EMULATOR_HOST = TEST_CONFIG.emulators.auth;
  process.env.FIREBASE_STORAGE_EMULATOR_HOST = TEST_CONFIG.emulators.storage;
  
  // AWS configuration
  process.env.AWS_REGION = TEST_CONFIG.aws.region;
  process.env.AWS_SMS_PHONE_POOL_ID = TEST_CONFIG.aws.smsPhonePoolId;
  process.env.AWS_SMS_CONFIGURATION_SET_NAME = TEST_CONFIG.aws.smsConfigurationSetName;
  process.env.AWS_SMS_SNS_TOPIC_ARN = TEST_CONFIG.aws.snsTopicArn;
  
  // Stripe configuration
  process.env.STRIPE_SECRET_KEY = TEST_CONFIG.stripe.secretKey;
  process.env.STRIPE_WEBHOOK_SECRET = TEST_CONFIG.stripe.webhookSecret;
  
  // Feature flags
  process.env.ENABLE_VAULT_SDK = String(TEST_CONFIG.features.vaultSdkEnabled);
  process.env.ENABLE_R2_MIGRATION = String(TEST_CONFIG.features.r2MigrationEnabled);
}

/**
 * Validate that all required test environment variables are set
 */
export function validateTestEnvironment(): boolean {
  const requiredVars = [
    'NODE_ENV',
    'FIREBASE_PROJECT_ID',
    'FUNCTIONS_EMULATOR',
    'FIRESTORE_EMULATOR_HOST',
  ];

  const missing = requiredVars.filter(varName => !process.env[varName]);
  
  if (missing.length > 0) {
    console.error(`Missing required environment variables: ${missing.join(', ')}`);
    return false;
  }

  return true;
}

/**
 * Reset test environment to clean state
 */
export function resetTestEnvironment(): void {
  // Clear all jest mocks
  jest.clearAllMocks();
  
  // Reset module cache for clean imports
  jest.resetModules();
  
  // Force garbage collection if available
  if (global.gc) {
    global.gc();
  }
}