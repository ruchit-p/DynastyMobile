// Mock environment variables
process.env.GCLOUD_PROJECT = 'test-project';
process.env.FIREBASE_CONFIG = JSON.stringify({
  projectId: 'test-project',
  databaseURL: 'https://test-project.firebaseio.com',
  storageBucket: 'test-project.appspot.com',
});

// Mock Firebase Functions logger
jest.mock('firebase-functions/v2', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

// Mock crypto for consistent test results
jest.mock('crypto', () => ({
  ...jest.requireActual('crypto'),
  randomBytes: jest.fn(() => ({
    toString: jest.fn(() => 'mocked-random-token'),
  })),
  randomUUID: jest.fn(() => 'mocked-uuid'),
}));

// Suppress console errors during tests
const originalError = console.error;
beforeAll(() => {
  console.error = jest.fn();
});

afterAll(() => {
  console.error = originalError;
});