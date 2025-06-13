// Mock Firebase services for testing
const auth = {
  currentUser: null,
  _canInitEmulator: false,
  onAuthStateChanged: jest.fn((callback) => {
    callback(null);
    return jest.fn(); // unsubscribe function
  }),
  signInWithEmailAndPassword: jest.fn(() => Promise.resolve({ user: { uid: 'test-uid' } })),
  createUserWithEmailAndPassword: jest.fn(() => Promise.resolve({ user: { uid: 'test-uid' } })),
  signOut: jest.fn(() => Promise.resolve()),
  sendPasswordResetEmail: jest.fn(() => Promise.resolve()),
  updateProfile: jest.fn(() => Promise.resolve()),
  sendEmailVerification: jest.fn(() => Promise.resolve()),
};

const db = {
  _settings: {},
  collection: jest.fn(() => ({
    doc: jest.fn(() => ({
      get: jest.fn(() => Promise.resolve({ exists: () => false, data: () => null })),
      set: jest.fn(() => Promise.resolve()),
      update: jest.fn(() => Promise.resolve()),
      delete: jest.fn(() => Promise.resolve()),
      onSnapshot: jest.fn((callback) => {
        callback({ exists: () => false, data: () => null });
        return jest.fn(); // unsubscribe
      }),
    })),
    where: jest.fn(() => ({
      get: jest.fn(() => Promise.resolve({ empty: true, docs: [] })),
      onSnapshot: jest.fn((callback) => {
        callback({ empty: true, docs: [] });
        return jest.fn(); // unsubscribe
      }),
    })),
    add: jest.fn(() => Promise.resolve({ id: 'mock-id' })),
    onSnapshot: jest.fn((callback) => {
      callback({ empty: true, docs: [] });
      return jest.fn(); // unsubscribe
    }),
  })),
};

const storage = {
  _protocol: 'http',
  ref: jest.fn(() => ({
    child: jest.fn(() => ({
      put: jest.fn(() => Promise.resolve({
        ref: {
          getDownloadURL: jest.fn(() => Promise.resolve('https://mock-url.com/file')),
        },
      })),
      putString: jest.fn(() => Promise.resolve({
        ref: {
          getDownloadURL: jest.fn(() => Promise.resolve('https://mock-url.com/file')),
        },
      })),
      getDownloadURL: jest.fn(() => Promise.resolve('https://mock-url.com/file')),
      delete: jest.fn(() => Promise.resolve()),
      getMetadata: jest.fn(() => Promise.resolve({
        size: 1024,
        contentType: 'image/png',
        timeCreated: new Date().toISOString(),
      })),
    })),
  })),
};

const functions = {
  httpsCallable: jest.fn((name) => jest.fn(() => Promise.resolve({ data: {} }))),
};

const messaging = null;

const analytics = null;

// Export app for compatibility
const app = {
  name: 'test-app',
  options: {},
};

module.exports = {
  auth,
  db,
  storage,
  functions,
  messaging,
  analytics,
  app,
};