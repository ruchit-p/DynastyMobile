const nextJest = require('next/jest');

const createJestConfig = nextJest({
  // Provide the path to your Next.js app to load next.config.js and .env files in your test environment
  dir: './',
});

// Integration test specific configuration
const integrationJestConfig = {
  displayName: 'Integration Tests',
  // Add more setup options before each test is run
  setupFilesAfterEnv: ['<rootDir>/jest.setup.enhanced.js'],
  testEnvironment: 'jest-environment-jsdom',
  moduleDirectories: ['node_modules', 'src'],
  automock: false,
  moduleNameMapper: {
    // Handle module aliases (this will be automatically configured for you soon)
    '^@/(.*)$': '<rootDir>/src/$1',
    '^@/components/(.*)$': '<rootDir>/src/components/$1',
    '^@/lib/(.*)$': '<rootDir>/src/lib/$1',
    '^@/services/(.*)$': '<rootDir>/src/services/$1',
    '^@/context/(.*)$': '<rootDir>/src/context/$1',
    '^@/hooks/(.*)$': '<rootDir>/src/hooks/$1',
    '^@/types/(.*)$': '<rootDir>/src/types/$1',
    '^@/utils/(.*)$': '<rootDir>/src/utils/$1',
    // Mock CSS modules
    '\\.(css|less|scss|sass)$': 'identity-obj-proxy',
  },
  // Only run integration tests
  testMatch: ['**/__tests__/integration/**/*.test.[jt]s?(x)'],
  testPathIgnorePatterns: [
    '/node_modules/',
    '/.next/',
    '**/__tests__/(?!integration)/**', // Ignore non-integration tests
  ],
  collectCoverageFrom: [
    'src/**/*.{js,jsx,ts,tsx}',
    '!src/**/*.d.ts',
    '!src/**/*.stories.{js,jsx,ts,tsx}',
    '!src/**/__tests__/**',
  ],
  transformIgnorePatterns: [
    'node_modules/(?!(lucide-react|nanoid|ics|uuid|firebase|fake-indexeddb)/)',
  ],
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx'],
  // Longer timeout for integration tests
  testTimeout: 30000,
  // Global setup and teardown for Firebase emulators
  globalSetup: '<rootDir>/src/__tests__/integration/globalSetup.js',
  globalTeardown: '<rootDir>/src/__tests__/integration/globalTeardown.js',
  // Sequential execution to avoid Firebase emulator conflicts
  maxWorkers: 1,
  // Environment variables for integration tests
  setupFiles: ['<rootDir>/src/__tests__/integration/env.js'],
};

// createJestConfig is exported this way to ensure that next/jest can load the Next.js config which is async
module.exports = createJestConfig(integrationJestConfig);
