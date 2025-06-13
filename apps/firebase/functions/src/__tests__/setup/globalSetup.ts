/**
 * Global test setup for Dynasty Subscription System
 * Runs once before all tests to initialize the test environment
 */

export default async function globalSetup(): Promise<void> {
  console.log('🚀 Starting Dynasty Subscription System test environment setup...');

  // Set global test environment variables
  process.env.NODE_ENV = 'test';
  process.env.FIREBASE_PROJECT_ID = 'dynasty-test-project';
  process.env.FUNCTIONS_EMULATOR = 'true';
  process.env.FIRESTORE_EMULATOR_HOST = 'localhost:8080';

  // Subscription system specific environment
  process.env.STRIPE_SECRET_KEY = 'sk_test_dynasty_subscription_system';
  process.env.EMAIL_PROVIDER = 'ses';
  process.env.FRONTEND_URL = 'http://localhost:3000';
  process.env.UNSUBSCRIBE_JWT_SECRET = 'test-jwt-secret-for-unsubscribe';

  // Performance testing configuration
  process.env.JEST_SILENT = 'true'; // Suppress logs during performance tests
  process.env.MAX_CONCURRENT_TESTS = '4'; // Limit concurrent test suites

  // Create test results directory
  const fs = await import('fs');
  const path = await import('path');

  const testResultsDir = path.join(__dirname, '../../../test-results');
  if (!fs.existsSync(testResultsDir)) {
    fs.mkdirSync(testResultsDir, { recursive: true });
  }

  const coverageDir = path.join(__dirname, '../../../coverage');
  if (!fs.existsSync(coverageDir)) {
    fs.mkdirSync(coverageDir, { recursive: true });
  }

  // Initialize test timing
  const startTime = Date.now();
  global.__DYNASTY_TEST_START_TIME__ = startTime;

  // Memory baseline
  const memoryBaseline = process.memoryUsage();
  global.__DYNASTY_MEMORY_BASELINE__ = memoryBaseline;

  console.log('✅ Test environment setup completed');
  console.log(`📊 Memory baseline: ${(memoryBaseline.heapUsed / 1024 / 1024).toFixed(2)}MB`);
  console.log(`⏱️  Setup time: ${Date.now() - startTime}ms`);
}
