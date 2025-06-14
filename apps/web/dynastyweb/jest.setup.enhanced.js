/**
 * Enhanced Jest Setup for Dynasty Web App
 *
 * This file provides comprehensive global mocks and utilities to streamline testing:
 * - Complete Firebase mocking
 * - Web API mocks (Notification, Geolocation, etc.)
 * - Next.js component mocks
 * - Third-party library mocks
 * - Enhanced error handling and cleanup
 */

// Learn more: https://github.com/testing-library/jest-dom
import '@testing-library/jest-dom';
import React from 'react';
import 'jest-extended';

// Setup fake IndexedDB for testing
import 'fake-indexeddb/auto';

// =============================================================================
// ENVIRONMENT SETUP
// =============================================================================

// Mock environment variables
const mockEnvVars = {
  NEXT_PUBLIC_FIREBASE_API_KEY: 'test-api-key',
  NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN: 'test-auth-domain',
  NEXT_PUBLIC_FIREBASE_PROJECT_ID: 'test-project-id',
  NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET: 'test-storage-bucket',
  NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID: 'test-sender-id',
  NEXT_PUBLIC_FIREBASE_APP_ID: 'test-app-id',
  NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID: 'test-measurement-id',
  NODE_ENV: 'test',
};

Object.entries(mockEnvVars).forEach(([key, value]) => {
  process.env[key] = value;
});

// =============================================================================
// FIREBASE MOCKS (Enhanced)
// =============================================================================

// Mock Firebase App
jest.mock('firebase/app', () => ({
  initializeApp: jest.fn(() => ({ name: 'test-app' })),
  getApps: jest.fn(() => [{ name: 'test-app' }]),
  getApp: jest.fn(() => ({ name: 'test-app' })),
}));

// Mock Firebase Auth (Complete)
jest.mock('firebase/auth', () => ({
  getAuth: jest.fn(() => ({ currentUser: null })),
  onAuthStateChanged: jest.fn((auth, callback) => {
    callback(null); // No user by default
    return jest.fn(); // Unsubscribe function
  }),
  signInWithEmailAndPassword: jest.fn(() =>
    Promise.resolve({
      user: { uid: 'test-uid', email: 'test@example.com' },
    })
  ),
  createUserWithEmailAndPassword: jest.fn(() =>
    Promise.resolve({
      user: { uid: 'test-uid', email: 'test@example.com' },
    })
  ),
  signOut: jest.fn(() => Promise.resolve()),
  sendEmailVerification: jest.fn(() => Promise.resolve()),
  sendPasswordResetEmail: jest.fn(() => Promise.resolve()),
  updateProfile: jest.fn(() => Promise.resolve()),
  updateEmail: jest.fn(() => Promise.resolve()),
  updatePassword: jest.fn(() => Promise.resolve()),
  deleteUser: jest.fn(() => Promise.resolve()),
  reauthenticateWithCredential: jest.fn(() => Promise.resolve()),
  EmailAuthProvider: {
    credential: jest.fn(() => ({ providerId: 'password' })),
  },
  GoogleAuthProvider: jest.fn(() => ({ providerId: 'google.com' })),
  signInWithPopup: jest.fn(() =>
    Promise.resolve({
      user: { uid: 'test-uid', email: 'test@example.com' },
    })
  ),
  RecaptchaVerifier: jest.fn(() => ({
    verify: jest.fn(() => Promise.resolve('test-token')),
    clear: jest.fn(),
  })),
  signInWithPhoneNumber: jest.fn(() =>
    Promise.resolve({
      verificationId: 'test-verification-id',
      confirm: jest.fn(() => Promise.resolve({ user: { uid: 'test-uid' } })),
    })
  ),
  PhoneAuthProvider: {
    credential: jest.fn(() => ({ providerId: 'phone' })),
  },
  connectAuthEmulator: jest.fn(),
  setPersistence: jest.fn(() => Promise.resolve()),
  browserLocalPersistence: { type: 'LOCAL' },
  browserSessionPersistence: { type: 'SESSION' },
}));

// Mock Firebase Firestore (Complete)
jest.mock('firebase/firestore', () => ({
  getFirestore: jest.fn(() => ({ app: { name: 'test-app' } })),
  collection: jest.fn(() => ({ id: 'test-collection' })),
  doc: jest.fn(() => ({ id: 'test-doc', path: 'test-collection/test-doc' })),
  getDoc: jest.fn(() =>
    Promise.resolve({
      exists: () => true,
      data: () => ({ id: 'test-doc' }),
      id: 'test-doc',
    })
  ),
  getDocs: jest.fn(() =>
    Promise.resolve({
      docs: [],
      size: 0,
      empty: true,
      forEach: jest.fn(),
    })
  ),
  setDoc: jest.fn(() => Promise.resolve()),
  updateDoc: jest.fn(() => Promise.resolve()),
  deleteDoc: jest.fn(() => Promise.resolve()),
  addDoc: jest.fn(() => Promise.resolve({ id: 'test-doc-id' })),
  query: jest.fn(() => ({ type: 'query' })),
  where: jest.fn(() => ({ type: 'where' })),
  orderBy: jest.fn(() => ({ type: 'orderBy' })),
  limit: jest.fn(() => ({ type: 'limit' })),
  startAfter: jest.fn(() => ({ type: 'startAfter' })),
  startAt: jest.fn(() => ({ type: 'startAt' })),
  endAt: jest.fn(() => ({ type: 'endAt' })),
  endBefore: jest.fn(() => ({ type: 'endBefore' })),
  serverTimestamp: jest.fn(() => ({
    _seconds: Math.floor(Date.now() / 1000),
    _nanoseconds: 0,
  })),
  arrayUnion: jest.fn(items => ({ _methodName: 'arrayUnion', _elements: items })),
  arrayRemove: jest.fn(items => ({ _methodName: 'arrayRemove', _elements: items })),
  increment: jest.fn(n => ({ _methodName: 'increment', _operand: n })),
  Timestamp: {
    now: jest.fn(() => ({
      seconds: Math.floor(Date.now() / 1000),
      nanoseconds: 0,
      toDate: () => new Date(),
    })),
    fromDate: jest.fn(date => ({
      seconds: Math.floor(date.getTime() / 1000),
      nanoseconds: 0,
      toDate: () => date,
    })),
  },
  connectFirestoreEmulator: jest.fn(),
  enableNetwork: jest.fn(() => Promise.resolve()),
  disableNetwork: jest.fn(() => Promise.resolve()),
  waitForPendingWrites: jest.fn(() => Promise.resolve()),
  onSnapshot: jest.fn(() => jest.fn()), // Returns unsubscribe function
}));

// Mock Firebase Storage (Complete)
jest.mock('firebase/storage', () => ({
  getStorage: jest.fn(() => ({ app: { name: 'test-app' } })),
  ref: jest.fn(() => ({
    bucket: 'test-bucket',
    fullPath: 'test/path',
    name: 'test-file',
  })),
  uploadBytes: jest.fn(() =>
    Promise.resolve({
      ref: { fullPath: 'test/path' },
      metadata: { size: 1024, contentType: 'image/jpeg' },
    })
  ),
  uploadBytesResumable: jest.fn(() => ({
    on: jest.fn(),
    snapshot: {
      bytesTransferred: 1024,
      totalBytes: 1024,
      state: 'success',
      ref: { fullPath: 'test/path' },
    },
  })),
  getDownloadURL: jest.fn(() => Promise.resolve('https://example.com/test-file.jpg')),
  deleteObject: jest.fn(() => Promise.resolve()),
  getMetadata: jest.fn(() =>
    Promise.resolve({
      size: 1024,
      contentType: 'image/jpeg',
      timeCreated: new Date().toISOString(),
    })
  ),
  updateMetadata: jest.fn(() => Promise.resolve()),
  list: jest.fn(() =>
    Promise.resolve({
      items: [],
      prefixes: [],
      nextPageToken: null,
    })
  ),
  connectStorageEmulator: jest.fn(),
}));

// Mock Firebase Functions (Complete)
jest.mock('firebase/functions', () => ({
  getFunctions: jest.fn(() => ({ app: { name: 'test-app' } })),
  httpsCallable: jest.fn(() => jest.fn(() => Promise.resolve({ data: { success: true } }))),
  connectFunctionsEmulator: jest.fn(),
}));

// Mock Firebase Messaging
jest.mock('firebase/messaging', () => ({
  getMessaging: jest.fn(() => null),
  getToken: jest.fn(() => Promise.resolve('test-fcm-token')),
  onMessage: jest.fn(() => jest.fn()),
  isSupported: jest.fn(() => Promise.resolve(false)),
}));

// Mock Firebase Analytics
jest.mock('firebase/analytics', () => ({
  getAnalytics: jest.fn(() => ({ app: { name: 'test-app' } })),
  logEvent: jest.fn(),
  setUserProperties: jest.fn(),
  setUserId: jest.fn(),
  isSupported: jest.fn(() => Promise.resolve(false)),
}));

// =============================================================================
// NEXT.JS MOCKS (Enhanced)
// =============================================================================

// Mock Next.js Navigation
jest.mock('next/navigation', () => ({
  useRouter() {
    return {
      push: jest.fn(),
      replace: jest.fn(),
      prefetch: jest.fn(),
      back: jest.fn(),
      forward: jest.fn(),
      refresh: jest.fn(),
      pathname: '/',
      query: {},
      asPath: '/',
      route: '/',
    };
  },
  useSearchParams() {
    return new URLSearchParams();
  },
  usePathname() {
    return '/';
  },
  useParams() {
    return {};
  },
  redirect: jest.fn(),
  permanentRedirect: jest.fn(),
  notFound: jest.fn(),
}));

// Mock Next.js Image
jest.mock('next/image', () => ({
  __esModule: true,
  default: props => {
    return React.createElement('img', props);
  },
}));

// Mock Next.js Link
jest.mock('next/link', () => ({
  __esModule: true,
  default: ({ children, ...props }) => {
    return React.createElement('a', props, children);
  },
}));

// Mock Next.js Head
jest.mock('next/head', () => ({
  __esModule: true,
  default: ({ children }) => children,
}));

// Mock Next.js Dynamic
jest.mock('next/dynamic', () => () => {
  const DynamicComponent = () => null;
  DynamicComponent.displayName = 'LoadableComponent';
  DynamicComponent.preload = jest.fn();
  return DynamicComponent;
});

// =============================================================================
// WEB API MOCKS (Enhanced)
// =============================================================================

// Enhanced File and Blob APIs
global.File = class MockFile {
  constructor(chunks, filename, options = {}) {
    this.name = filename;
    this.size = chunks.reduce((acc, chunk) => acc + chunk.length, 0);
    this.type = options.type || '';
    this.lastModified = options.lastModified || Date.now();
    this.arrayBuffer = () => Promise.resolve(new ArrayBuffer(this.size));
    this.text = () => Promise.resolve(chunks.join(''));
    this.stream = () => new ReadableStream();
    this.slice = jest.fn(() => new MockFile(chunks, filename, options));
  }
};

global.Blob = class MockBlob {
  constructor(chunks = [], options = {}) {
    this.size = chunks.reduce((acc, chunk) => acc + chunk.length, 0);
    this.type = options.type || '';
    this.arrayBuffer = () => Promise.resolve(new ArrayBuffer(this.size));
    this.text = () => Promise.resolve(chunks.join(''));
    this.stream = () => new ReadableStream();
    this.slice = jest.fn(() => new MockBlob(chunks, options));
  }
};

// Mock Notification API
global.Notification = {
  permission: 'default',
  requestPermission: jest.fn(() => Promise.resolve('granted')),
};

// Mock Geolocation API
global.navigator.geolocation = {
  getCurrentPosition: jest.fn(success => {
    success({
      coords: {
        latitude: 40.7128,
        longitude: -74.006,
        accuracy: 10,
        altitude: null,
        altitudeAccuracy: null,
        heading: null,
        speed: null,
      },
      timestamp: Date.now(),
    });
  }),
  watchPosition: jest.fn(() => 1),
  clearWatch: jest.fn(),
};

// Mock MediaDevices API
global.navigator.mediaDevices = {
  getUserMedia: jest.fn(() =>
    Promise.resolve({
      getTracks: () => [{ stop: jest.fn(), kind: 'video' }],
      getVideoTracks: () => [{ stop: jest.fn() }],
      getAudioTracks: () => [{ stop: jest.fn() }],
    })
  ),
  enumerateDevices: jest.fn(() => Promise.resolve([])),
};

// Mock Clipboard API
global.navigator.clipboard = {
  writeText: jest.fn(() => Promise.resolve()),
  readText: jest.fn(() => Promise.resolve('mocked text')),
  write: jest.fn(() => Promise.resolve()),
  read: jest.fn(() => Promise.resolve()),
};

// Mock Web Share API
global.navigator.share = jest.fn(() => Promise.resolve());

// =============================================================================
// THIRD-PARTY LIBRARY MOCKS
// =============================================================================

// Mock libsodium-wrappers-sumo (Comprehensive)
jest.mock('libsodium-wrappers-sumo', () => require('libsodium-wrappers'));

// Mock DOMPurify (Enhanced)
jest.mock('isomorphic-dompurify', () => ({
  __esModule: true,
  default: {
    sanitize: jest.fn((input, config) => {
      if (!input) return '';

      let result = String(input);

      // Enhanced mock behavior for different configurations
      if (config?.ALLOWED_TAGS && config.ALLOWED_TAGS.length === 0) {
        result = result.replace(/<script[^>]*>.*?<\/script>/gi, '');
        result = result.replace(/<[^>]*>/g, '');
      } else if (config?.FORBID_TAGS) {
        config.FORBID_TAGS.forEach(tag => {
          const regex = new RegExp(`<${tag}[^>]*>.*?</${tag}>|<${tag}[^>]*/>`, 'gi');
          result = result.replace(regex, '');
        });
      }

      if (config?.FORBID_ATTR) {
        config.FORBID_ATTR.forEach(attr => {
          const regex = new RegExp(`\\s${attr}\\s*=\\s*["'][^"']*["']`, 'gi');
          result = result.replace(regex, '');
        });
      }

      result = result.replace(/javascript:/gi, '');
      result = result.replace(/vbscript:/gi, '');

      return result;
    }),
    setConfig: jest.fn(),
    addHook: jest.fn(),
    removeHook: jest.fn(),
    removeAllHooks: jest.fn(),
  },
}));

// Mock CryptoJS (Enhanced)
jest.mock('crypto-js', () => ({
  AES: {
    encrypt: jest.fn((data, key) => ({
      toString: () => `encrypted_${data}_with_${key}`,
    })),
    decrypt: jest.fn((data, key) => ({
      toString: () => data.replace(`encrypted_`, '').replace(`_with_${key}`, ''),
    })),
  },
  SHA256: jest.fn(data => ({
    toString: () => `sha256_${data}`,
  })),
  SHA1: jest.fn(data => ({
    toString: () => `sha1_${data}`,
  })),
  MD5: jest.fn(data => ({
    toString: () => `md5_${data}`,
  })),
  enc: {
    Utf8: {
      parse: jest.fn(str => str),
      stringify: jest.fn(obj => obj),
    },
    Base64: {
      parse: jest.fn(str => str),
      stringify: jest.fn(obj => obj),
    },
    Hex: {
      parse: jest.fn(str => str),
      stringify: jest.fn(obj => obj),
    },
  },
  lib: {
    WordArray: {
      random: jest.fn(bytes => `random_${bytes}_bytes`),
    },
  },
}));

// Mock IndexedDB (Enhanced)
const createMockIDBRequest = (successCallback, errorCallback) => {
  const request = {
    onsuccess: null,
    onerror: null,
    onupgradeneeded: null,
    result: null,
    error: null,
    readyState: 'pending',
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
  };

  // Simulate async behavior
  setTimeout(() => {
    if (successCallback) {
      try {
        const result = successCallback();
        request.result = result;
        request.readyState = 'done';
        if (request.onsuccess) {
          request.onsuccess({ target: request });
        }
      } catch (error) {
        request.error = error;
        request.readyState = 'done';
        if (request.onerror) {
          request.onerror({ target: request });
        }
      }
    } else if (errorCallback) {
      request.error = errorCallback();
      request.readyState = 'done';
      if (request.onerror) {
        request.onerror({ target: request });
      }
    }
  }, 0);

  return request;
};

const mockIDBObjectStore = {
  name: 'testStore',
  keyPath: 'id',
  add: jest.fn(() => createMockIDBRequest(() => 'test-key')),
  put: jest.fn(() => createMockIDBRequest(() => 'test-key')),
  get: jest.fn(() => createMockIDBRequest(() => ({ id: 'test', data: 'test-data' }))),
  getAll: jest.fn(() => createMockIDBRequest(() => [])),
  delete: jest.fn(() => createMockIDBRequest(() => undefined)),
  clear: jest.fn(() => createMockIDBRequest(() => undefined)),
  createIndex: jest.fn(() => mockIDBIndex),
  index: jest.fn(() => mockIDBIndex),
};

const mockIDBIndex = {
  name: 'testIndex',
  get: jest.fn(() => createMockIDBRequest(() => null)),
  getAll: jest.fn(() => createMockIDBRequest(() => [])),
  getAllKeys: jest.fn(() => createMockIDBRequest(() => [])),
};

const mockIDBTransaction = {
  mode: 'readwrite',
  objectStore: jest.fn(() => mockIDBObjectStore),
  addEventListener: jest.fn(),
  removeEventListener: jest.fn(),
  abort: jest.fn(),
  oncomplete: null,
  onerror: null,
  onabort: null,
};

const mockIDBDatabase = {
  name: 'DynastyVaultKeys',
  version: 1,
  objectStoreNames: {
    contains: jest.fn(() => false), // Start with no stores to trigger onupgradeneeded
    length: 0,
    [Symbol.iterator]: function* () {},
  },
  createObjectStore: jest.fn((name, options) => {
    // Simulate creating object store during upgrade
    const createdStores = new Set();
    createdStores.add(name);

    mockIDBDatabase.objectStoreNames = {
      contains: jest.fn(storeName => createdStores.has(storeName)),
      length: createdStores.size,
      [Symbol.iterator]: function* () {
        for (const store of createdStores) {
          yield store;
        }
      },
    };

    return {
      ...mockIDBObjectStore,
      name: name,
      createIndex: jest.fn(() => mockIDBIndex),
    };
  }),
  transaction: jest.fn(() => mockIDBTransaction),
  close: jest.fn(),
  addEventListener: jest.fn(),
  removeEventListener: jest.fn(),
};

global.indexedDB = {
  open: jest.fn((name, version) => {
    const request = {
      onsuccess: null,
      onerror: null,
      onupgradeneeded: null,
      result: null,
      error: null,
      addEventListener: jest.fn(),
      removeEventListener: jest.fn(),
    };

    // Simulate async database opening
    setTimeout(() => {
      // First trigger upgrade if needed
      if (request.onupgradeneeded) {
        request.result = mockIDBDatabase; // Set result before calling upgrade
        request.onupgradeneeded({ target: request });
      }

      // Then trigger success
      request.result = mockIDBDatabase;
      if (request.onsuccess) {
        request.onsuccess({ target: request });
      }
    }, 10); // Small delay to simulate real IndexedDB

    return request;
  }),
  deleteDatabase: jest.fn(() => createMockIDBRequest(() => undefined)),
  databases: jest.fn(() => Promise.resolve([])),
};

// Mock IDB library
jest.mock('idb', () => ({
  openDB: jest.fn(() =>
    Promise.resolve({
      get: jest.fn(() => Promise.resolve(null)),
      put: jest.fn(() => Promise.resolve()),
      delete: jest.fn(() => Promise.resolve()),
      getAll: jest.fn(() => Promise.resolve([])),
      clear: jest.fn(() => Promise.resolve()),
      getAllFromIndex: jest.fn(() => Promise.resolve([])),
      transaction: jest.fn(() => ({
        objectStore: jest.fn(() => ({
          get: jest.fn(() => Promise.resolve(null)),
          put: jest.fn(() => Promise.resolve()),
          delete: jest.fn(() => Promise.resolve()),
          getAll: jest.fn(() => Promise.resolve([])),
          clear: jest.fn(() => Promise.resolve()),
        })),
        done: Promise.resolve(),
      })),
      createObjectStore: jest.fn(),
    })
  ),
  deleteDB: jest.fn(() => Promise.resolve()),
}));

// =============================================================================
// GLOBAL UTILITIES AND CLEANUP
// =============================================================================

// Enhanced window.matchMedia
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: jest.fn().mockImplementation(query => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: jest.fn(), // deprecated
    removeListener: jest.fn(), // deprecated
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
    dispatchEvent: jest.fn(),
  })),
});

// Mock IntersectionObserver
global.IntersectionObserver = class IntersectionObserver {
  constructor() {}
  disconnect() {}
  observe() {}
  unobserve() {}
};

// Mock ResizeObserver
global.ResizeObserver = class ResizeObserver {
  constructor() {}
  disconnect() {}
  observe() {}
  unobserve() {}
};

// Mock Canvas API
global.HTMLCanvasElement.prototype.getContext = jest.fn(() => ({
  fillRect: jest.fn(),
  clearRect: jest.fn(),
  getImageData: jest.fn(() => ({ data: new Array(4) })),
  putImageData: jest.fn(),
  createImageData: jest.fn(() => ({ data: new Array(4) })),
  setTransform: jest.fn(),
  drawImage: jest.fn(),
  save: jest.fn(),
  fillText: jest.fn(),
  restore: jest.fn(),
  beginPath: jest.fn(),
  moveTo: jest.fn(),
  lineTo: jest.fn(),
  closePath: jest.fn(),
  stroke: jest.fn(),
  translate: jest.fn(),
  scale: jest.fn(),
  rotate: jest.fn(),
  arc: jest.fn(),
  fill: jest.fn(),
  measureText: jest.fn(() => ({ width: 0 })),
  transform: jest.fn(),
  rect: jest.fn(),
  clip: jest.fn(),
}));

// Mock MediaRecorder
global.MediaRecorder = class MediaRecorder {
  constructor() {
    this.state = 'inactive';
    this.stream = null;
  }
  start() {
    this.state = 'recording';
  }
  stop() {
    this.state = 'inactive';
  }
  addEventListener() {}
  removeEventListener() {}
};

// Global error handling for unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  console.warn('Unhandled promise rejection:', reason);
});

// Enhanced cleanup after each test
afterEach(() => {
  // Clear all mocks
  jest.clearAllMocks();

  // Clear storage
  localStorage.clear();
  sessionStorage.clear();

  // Clear timers
  jest.clearAllTimers();

  // Reset modules if needed
  jest.resetModules();
});

// Global test utilities
global.testUtils = {
  // Add any global test utilities here
  waitFor: ms => new Promise(resolve => setTimeout(resolve, ms)),
  flushPromises: () => new Promise(resolve => setTimeout(resolve, 0)),
};

// =============================================================================
// INTEGRATION TEST ENVIRONMENT SETUP
// =============================================================================

// Check if we're running integration tests
const isIntegrationTest =
  process.env.TEST_TYPE === 'integration' || process.argv.some(arg => arg.includes('integration'));

if (isIntegrationTest) {
  // Setup integration test environment
  const { setupTestFile } = require('./src/__tests__/integration/setup');
  setupTestFile();

  console.log('🔧 Integration test environment configured');
} else {
  console.log('🧪 Enhanced Jest setup complete - all mocks and utilities loaded!');
}

// =============================================================================
// ADDITIONAL THIRD-PARTY LIBRARY MOCKS
// =============================================================================

// Mock libsodium to resolve immediately in tests
jest.mock('libsodium-wrappers', () => {
  return {
    // Signal readiness immediately
    ready: Promise.resolve(),
    // Mock only the functions used by our crypto services
    randombytes_buf: (len = 32) => new Uint8Array(len),
    crypto_secretbox_easy: jest.fn(() => new Uint8Array()),
    crypto_secretbox_open_easy: jest.fn(() => new Uint8Array()),
    crypto_generichash: jest.fn(() => new Uint8Array(32)),
    to_hex: jest.fn(() => ''),
    from_string: jest.fn(() => new Uint8Array()),
  };
});

// Polyfill TextEncoder/TextDecoder in Node test env
if (typeof global.TextEncoder === 'undefined') {
  global.TextEncoder = require('util').TextEncoder;
}
if (typeof global.TextDecoder === 'undefined') {
  global.TextDecoder = require('util').TextDecoder;
}

// Ensure libsodium ready always resolves
import * as _sodium from 'libsodium-wrappers';
// eslint-disable-next-line no-underscore-dangle
(_sodium).ready = Promise.resolve();
