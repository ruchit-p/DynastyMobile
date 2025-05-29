// This file runs before any modules are imported
// Mock Firebase modules immediately

console.log('Setting up Firebase mocks...');

// Mock Firebase App
jest.mock('firebase/app', () => ({
  initializeApp: jest.fn(() => ({ name: 'test-app' })),
  getApps: jest.fn(() => []),
  getApp: jest.fn(() => ({ name: 'test-app' })),
}));

// Mock Firebase Auth
jest.mock('firebase/auth', () => ({
  getAuth: jest.fn(() => ({ 
    currentUser: null,
    _canInitEmulator: false 
  })),
  connectAuthEmulator: jest.fn(),
  onAuthStateChanged: jest.fn((auth, callback) => {
    callback(null);
    return jest.fn();
  }),
  signInWithEmailAndPassword: jest.fn(() => Promise.resolve({ user: { uid: 'test-uid' } })),
  createUserWithEmailAndPassword: jest.fn(() => Promise.resolve({ user: { uid: 'test-uid' } })),
  signOut: jest.fn(() => Promise.resolve()),
  sendPasswordResetEmail: jest.fn(() => Promise.resolve()),
  updateProfile: jest.fn(() => Promise.resolve()),
  sendEmailVerification: jest.fn(() => Promise.resolve()),
}));

// Mock Firebase Firestore
jest.mock('firebase/firestore', () => ({
  getFirestore: jest.fn(() => ({ 
    _settings: {},
    app: { name: 'test-app' } 
  })),
  connectFirestoreEmulator: jest.fn(),
  collection: jest.fn(() => ({})),
  doc: jest.fn(() => ({})),
  getDoc: jest.fn(() => Promise.resolve({ exists: () => true, data: () => ({}) })),
  getDocs: jest.fn(() => Promise.resolve({ docs: [] })),
  setDoc: jest.fn(() => Promise.resolve()),
  updateDoc: jest.fn(() => Promise.resolve()),
  deleteDoc: jest.fn(() => Promise.resolve()),
  query: jest.fn(() => ({})),
  where: jest.fn(() => ({})),
  orderBy: jest.fn(() => ({})),
  limit: jest.fn(() => ({})),
  serverTimestamp: jest.fn(() => ({ _seconds: Date.now() / 1000, _nanoseconds: 0 })),
  addDoc: jest.fn(() => Promise.resolve({ id: 'test-doc-id' })),
  Timestamp: {
    now: jest.fn(() => ({ seconds: Date.now() / 1000, nanoseconds: 0 })),
    fromDate: jest.fn((date) => ({ seconds: date.getTime() / 1000, nanoseconds: 0 })),
  },
}));

// Mock Firebase Storage
jest.mock('firebase/storage', () => ({
  getStorage: jest.fn(() => ({ 
    _protocol: 'http',
    app: { name: 'test-app' } 
  })),
  connectStorageEmulator: jest.fn(),
  ref: jest.fn(() => ({})),
  uploadBytes: jest.fn(() => Promise.resolve({ ref: {} })),
  getDownloadURL: jest.fn(() => Promise.resolve('https://example.com/file.jpg')),
  deleteObject: jest.fn(() => Promise.resolve()),
}));

// Mock Firebase Functions
jest.mock('firebase/functions', () => ({
  getFunctions: jest.fn(() => ({ 
    app: { name: 'test-app' } 
  })),
  connectFunctionsEmulator: jest.fn(),
  httpsCallable: jest.fn(() => jest.fn(() => Promise.resolve({ data: {} }))),
}));

// Mock Firebase Messaging
jest.mock('firebase/messaging', () => ({
  getMessaging: jest.fn(() => null),
  getToken: jest.fn(),
  onMessage: jest.fn(),
  isSupported: jest.fn(() => Promise.resolve(false)),
}));

// Mock Firebase Analytics
jest.mock('firebase/analytics', () => ({
  getAnalytics: jest.fn(() => null),
  isSupported: jest.fn(() => Promise.resolve(false)),
  logEvent: jest.fn(),
}));