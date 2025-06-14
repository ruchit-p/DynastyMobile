const nextJest = require('next/jest')

const createJestConfig = nextJest({
  // Provide the path to your Next.js app to load next.config.js and .env files in your test environment
  dir: './',
})

// Add any custom config to be passed to Jest
const customJestConfig = {
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
    // ESM packages fallbacks
    '^lucide-react$': 'lucide-react/dist/cjs',
    '^lucide-react/(.*)$': 'lucide-react',
    '^lucide-react/dist/esm/(.*)$': 'lucide-react',
    '^swiper/css$': 'identity-obj-proxy',
    '^swiper/css.*$': 'identity-obj-proxy',
    '^lucide-react/dist/esm/icons/(.*)$': 'lucide-react',
    '^swiper/(.*)$': 'identity-obj-proxy',
    // Remove problematic vault-sdk mappings to rely on Babel transform
    // '^@dynasty/vault-sdk$': '<rootDir>/node_modules/@dynasty/vault-sdk/dist/index.js',
    // '^@dynasty/vault-sdk/dist/(.*)$': '<rootDir>/node_modules/@dynasty/vault-sdk/dist/$1',
    '\\.(css|less|scss|sass)$': 'identity-obj-proxy',
  },
  testMatch: [
    '**/__tests__/**/*.test.[jt]s?(x)',
    '**/?(*.)+(spec|test).[jt]s?(x)',
  ],
  // Separate integration tests
  testPathIgnorePatterns: (() => {
    const patterns = [
      '<rootDir>/node_modules/',
      '<rootDir>/.next/',
      '<rootDir>/e2e/',
    ];
    if (process.env.TEST_TYPE === 'unit') {
      patterns.push('<rootDir>/src/__tests__/integration/');
    }
    return patterns;
  })(),
  collectCoverageFrom: [
    'src/**/*.{js,jsx,ts,tsx}',
    '!src/**/*.d.ts',
    '!src/**/*.stories.{js,jsx,ts,tsx}',
    '!src/**/__tests__/**',
  ],
  transform: {
    // Use babel-jest to transpile JavaScript/TypeScript, including ESM in node_modules that we opt-in via transformIgnorePatterns
    '^.+\\.(js|jsx|mjs|cjs|ts|tsx)$': ['babel-jest', { presets: ['next/babel'] }],
  },
  // Override transform ignore pattern to allow specific ESM packages to be transformed
  transformIgnorePatterns: [
    'node_modules/(?!(lucide-react|@radix-ui|@dynasty|nanoid|ics|uuid|firebase|fake-indexeddb|swiper)/).*$',
  ],
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx'],
}

// createJestConfig is exported this way to ensure that next/jest can load the Next.js config which is async
module.exports = createJestConfig(customJestConfig)