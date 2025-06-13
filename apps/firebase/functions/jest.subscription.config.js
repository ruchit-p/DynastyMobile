// Jest configuration specifically for subscription system testing
// Optimized for comprehensive testing of Stripe integration and subscription flows

module.exports = {
  // Extend base Jest configuration
  preset: 'ts-jest',
  testEnvironment: 'node',

  // Root directory for tests
  rootDir: './src',

  // Test file patterns - focus on subscription-related tests
  testMatch: [
    '**/__tests__/**/*subscription*.test.ts',
    '**/__tests__/**/*stripe*.test.ts',
    '**/__tests__/**/*webhook*.test.ts',
    '**/__tests__/services/**/*.test.ts',
    '**/__tests__/integration/**/*.test.ts',
    '**/__tests__/security/**/*.test.ts',
    '**/__tests__/performance/**/*.test.ts',
  ],

  // Files to ignore
  testPathIgnorePatterns: [
    '/node_modules/',
    '/lib/',
    '/coverage/',
    '/__tests__/mocks/',
    '/__tests__/utils/',
  ],

  // Module name mapping for easier imports
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/$1',
    '^@tests/(.*)$': '<rootDir>/__tests__/$1',
    '^@mocks/(.*)$': '<rootDir>/__tests__/mocks/$1',
    '^@utils/(.*)$': '<rootDir>/__tests__/utils/$1',
  },

  // Setup files to run before tests
  setupFilesAfterEnv: ['<rootDir>/__tests__/setup/testSetup.ts'],

  // Coverage configuration
  collectCoverage: true,
  coverageDirectory: '../coverage',
  coverageReporters: ['text', 'lcov', 'html', 'json', 'clover'],

  // Files to include in coverage
  collectCoverageFrom: [
    'services/stripeService.ts',
    'services/subscriptionService.ts',
    'services/storageCalculationService.ts',
    'webhooks/**/*.ts',
    'config/stripe*.ts',
    'types/subscription.ts',
    'utils/errors.ts',
    'middleware/auth.ts',
    '!**/*.d.ts',
    '!**/__tests__/**',
    '!**/node_modules/**',
  ],

  // Coverage thresholds
  coverageThreshold: {
    global: {
      branches: 80,
      functions: 85,
      lines: 85,
      statements: 85,
    },
    // Specific thresholds for critical files
    './services/stripeService.ts': {
      branches: 90,
      functions: 95,
      lines: 95,
      statements: 95,
    },
    './services/subscriptionService.ts': {
      branches: 90,
      functions: 95,
      lines: 95,
      statements: 95,
    },
    './webhooks/stripeWebhookHandler.ts': {
      branches: 85,
      functions: 90,
      lines: 90,
      statements: 90,
    },
  },

  // Test timeout configuration
  testTimeout: 30000, // 30 seconds for regular tests

  // Performance test timeout (overridden in specific files)
  globals: {
    'ts-jest': {
      tsconfig: './tsconfig.test.json',
      isolatedModules: true,
      diagnostics: {
        ignoreCodes: [1343, 2345, 18046, 2339, 2540, 2322, 7006],
      },
    },
  },

  // Transform configuration
  transform: {
    '^.+\\.ts$': 'ts-jest',
  },

  // TypeScript configuration for tests
  transformIgnorePatterns: ['node_modules/(?!(some-es6-module)/)'],

  // Module file extensions
  moduleFileExtensions: ['ts', 'js', 'json'],

  // Clear mocks between tests
  clearMocks: true,
  restoreMocks: true,
  resetMocks: true,

  // Verbose output for detailed test results
  verbose: true,

  // Show test results for individual test files
  notify: false,
  notifyMode: 'failure-change',

  // Fail fast on first test failure (useful for CI)
  bail: false,

  // Force exit after tests complete
  forceExit: true,

  // Detect open handles that prevent Jest from exiting
  detectOpenHandles: true,

  // Test result processor for CI integration (optional)
  // testResultsProcessor: 'jest-junit',

  // Additional Jest options for subscription testing
  maxWorkers: '50%', // Use half of available CPU cores
  maxConcurrency: 5, // Limit concurrent test suites

  // Silent console logs during tests (can be overridden with --verbose)
  silent: false,

  // Error reporting
  errorOnDeprecated: true,

  // Custom test environment setup
  globalSetup: '<rootDir>/__tests__/setup/globalSetup.ts',
  globalTeardown: '<rootDir>/__tests__/setup/globalTeardown.ts',

  // Test categories for selective running (set via CLI or env)
  // testNamePattern: process.env.TEST_NAME_PATTERN,
  // testPathPattern: process.env.TEST_PATH_PATTERN,

  // Watch mode configuration
  watchPathIgnorePatterns: ['/node_modules/', '/lib/', '/coverage/', '/.git/'],

  // Cache configuration
  cache: true,
  cacheDirectory: '../.jest-cache',

  // Custom reporters for better output
  reporters: [
    'default',
    // Note: Additional reporters require npm packages to be installed
    // ['jest-junit', { ... }],
    // ['jest-html-reporters', { ... }],
  ],
};
