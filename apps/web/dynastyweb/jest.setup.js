// Learn more: https://github.com/testing-library/jest-dom
import '@testing-library/jest-dom'

// =============================================================================
// ENVIRONMENT SETUP
// =============================================================================

// Mock environment variables
process.env.NEXT_PUBLIC_FIREBASE_API_KEY = 'test-api-key'
process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN = 'test-auth-domain'
process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID = 'test-project-id'
process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET = 'test-storage-bucket'
process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID = 'test-sender-id'
process.env.NEXT_PUBLIC_FIREBASE_APP_ID = 'test-app-id'
process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID = 'test-measurement-id'
process.env.NEXT_PUBLIC_EMULATOR_MODE = 'true'
process.env.NEXT_PUBLIC_APP_ENV = 'test'

// Mock Next.js router
jest.mock('next/navigation', () => ({
  useRouter() {
    return {
      push: jest.fn(),
      replace: jest.fn(),
      prefetch: jest.fn(),
      back: jest.fn(),
      forward: jest.fn(),
      refresh: jest.fn(),
    }
  },
  useSearchParams() {
    return new URLSearchParams()
  },
  usePathname() {
    return '/'
  },
}))

// Mock Firebase
jest.mock('firebase/app', () => ({
  initializeApp: jest.fn(() => ({})),
  getApps: jest.fn(() => [{}]),
  getApp: jest.fn(() => ({})),
}))

jest.mock('firebase/auth', () => ({
  getAuth: jest.fn(() => ({
    _canInitEmulator: false,
  })),
  onAuthStateChanged: jest.fn((auth, callback) => {
    callback(null); // No user by default
    return jest.fn(); // Unsubscribe function
  }),
  signInWithEmailAndPassword: jest.fn(() => Promise.resolve({ user: { uid: 'test-uid' } })),
  createUserWithEmailAndPassword: jest.fn(() => Promise.resolve({ user: { uid: 'test-uid' } })),
  signOut: jest.fn(() => Promise.resolve()),
  sendEmailVerification: jest.fn(() => Promise.resolve()),
  sendPasswordResetEmail: jest.fn(() => Promise.resolve()),
  updateProfile: jest.fn(() => Promise.resolve()),
  updateEmail: jest.fn(() => Promise.resolve()),
  updatePassword: jest.fn(() => Promise.resolve()),
  EmailAuthProvider: {
    credential: jest.fn(),
  },
  reauthenticateWithCredential: jest.fn(() => Promise.resolve()),
  setPersistence: jest.fn(() => Promise.resolve()),
  browserLocalPersistence: {},
  GoogleAuthProvider: jest.fn(() => ({})),
  signInWithPopup: jest.fn(() => Promise.resolve({ user: { uid: 'test-uid' } })),
  RecaptchaVerifier: jest.fn(() => ({ verify: jest.fn() })),
  connectAuthEmulator: jest.fn(),
}))

jest.mock('firebase/firestore', () => ({
  getFirestore: jest.fn(() => ({
    _settings: {},
  })),
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
  connectFirestoreEmulator: jest.fn(),
}))

jest.mock('firebase/storage', () => ({
  getStorage: jest.fn(() => ({
    _protocol: 'http',
  })),
  ref: jest.fn(() => ({})),
  uploadBytes: jest.fn(() => Promise.resolve({ ref: {} })),
  getDownloadURL: jest.fn(() => Promise.resolve('https://example.com/file.jpg')),
  deleteObject: jest.fn(() => Promise.resolve()),
  connectStorageEmulator: jest.fn(),
}))

jest.mock('firebase/functions', () => ({
  getFunctions: jest.fn(() => ({})),
  httpsCallable: jest.fn(() => jest.fn(() => Promise.resolve({ data: {} }))),
  connectFunctionsEmulator: jest.fn(),
}))

jest.mock('firebase/messaging', () => ({
  getMessaging: jest.fn(() => null),
  getToken: jest.fn(),
  onMessage: jest.fn(),
  isSupported: jest.fn(() => Promise.resolve(false)),
}))

jest.mock('firebase/analytics', () => ({
  getAnalytics: jest.fn(() => null),
  isSupported: jest.fn(() => Promise.resolve(false)),
  logEvent: jest.fn(),
}))

// Mock DOMPurify
jest.mock('isomorphic-dompurify', () => ({
  __esModule: true,
  default: {
    sanitize: jest.fn((input, config) => {
      if (!input) return '';
      
      // Simple mock implementation
      let result = String(input);
      
      // If ALLOWED_TAGS is empty, strip all tags
      if (config?.ALLOWED_TAGS && config.ALLOWED_TAGS.length === 0) {
        // Remove script tags and their content first
        result = result.replace(/<script[^>]*>.*?<\/script>/gi, '');
        // Then remove all other tags
        result = result.replace(/<[^>]*>/g, '');
      } else if (config?.FORBID_TAGS) {
        // Remove forbidden tags
        config.FORBID_TAGS.forEach(tag => {
          const regex = new RegExp(`<${tag}[^>]*>.*?</${tag}>|<${tag}[^>]*/>`, 'gi');
          result = result.replace(regex, '');
        });
      } else if (config?.ALLOWED_TAGS && config.ALLOWED_TAGS.length > 0) {
        // When specific tags are allowed, remove all others
        const allowedTagsPattern = config.ALLOWED_TAGS.join('|');
        const regex = new RegExp(`<(?!\/?(?:${allowedTagsPattern})(?:[\s>]|$))[^>]*>`, 'gi');
        result = result.replace(regex, '');
        
        // Also remove content of forbidden tags like script
        const forbiddenTags = ['script', 'style', 'iframe', 'object', 'embed'];
        forbiddenTags.forEach(tag => {
          if (!config.ALLOWED_TAGS.includes(tag)) {
            const regex = new RegExp(`<${tag}[^>]*>.*?</${tag}>`, 'gi');
            result = result.replace(regex, '');
          }
        });
      }
      
      // Remove event handlers
      if (config?.FORBID_ATTR) {
        config.FORBID_ATTR.forEach(attr => {
          const regex = new RegExp(`\\s${attr}\\s*=\\s*["'][^"']*["']`, 'gi');
          result = result.replace(regex, '');
        });
      }
      
      // Remove dangerous protocols
      result = result.replace(/javascript:/gi, '');
      result = result.replace(/vbscript:/gi, '');
      
      return result;
    }),
    setConfig: jest.fn(),
  },
}))

// Mock CryptoJS
jest.mock('crypto-js', () => ({
  AES: {
    encrypt: jest.fn((data) => ({ toString: () => `encrypted_${data}` })),
    decrypt: jest.fn((data) => ({ toString: () => data.replace('encrypted_', '') })),
  },
  SHA256: jest.fn((data) => ({ toString: () => `sha256_${data}` })),
  enc: {
    Utf8: {},
  },
}))

// Mock idb
jest.mock('idb', () => ({
  openDB: jest.fn(() => Promise.resolve({
    put: jest.fn(),
    get: jest.fn(),
    delete: jest.fn(),
    getAll: jest.fn(() => []),
    clear: jest.fn(),
    createObjectStore: jest.fn(),
    transaction: jest.fn(() => ({
      objectStore: jest.fn(() => ({
        put: jest.fn(),
        get: jest.fn(),
        delete: jest.fn(),
        getAll: jest.fn(() => []),
      })),
    })),
  })),
}))

// Mock workbox-window
jest.mock('workbox-window', () => ({
  Workbox: jest.fn().mockImplementation(() => ({
    register: jest.fn(),
    addEventListener: jest.fn(),
    messageSW: jest.fn(),
  })),
}))

// Mock window.matchMedia
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
})

// Mock IntersectionObserver
global.IntersectionObserver = class IntersectionObserver {
  constructor() {}
  disconnect() {}
  observe() {}
  unobserve() {}
}

// Mock indexedDB
global.indexedDB = {
  open: jest.fn(() => ({
    onsuccess: jest.fn(),
    onerror: jest.fn(),
    onupgradeneeded: jest.fn(),
    result: {
      createObjectStore: jest.fn(),
      transaction: jest.fn(() => ({
        objectStore: jest.fn(() => ({
          add: jest.fn(),
          get: jest.fn(),
          put: jest.fn(),
          delete: jest.fn(),
          getAll: jest.fn(() => ({ onsuccess: jest.fn() })),
          clear: jest.fn(),
        })),
      })),
      close: jest.fn(),
    },
  })),
  deleteDatabase: jest.fn(),
}

// =============================================================================
// ENHANCED GLOBAL SETUP
// =============================================================================

// Enhanced File and Blob APIs
global.File = jest.fn().mockImplementation((bits, name, options = {}) => ({
  name,
  size: bits.reduce((acc, bit) => acc + (bit.length || bit.size || 0), 0),
  type: options.type || '',
  lastModified: options.lastModified || Date.now(),
  webkitRelativePath: '',
  stream: jest.fn(),
  arrayBuffer: jest.fn().mockResolvedValue(new ArrayBuffer(8)),
  text: jest.fn().mockResolvedValue('mock file content'),
  slice: jest.fn().mockReturnThis(),
}));

global.Blob = jest.fn().mockImplementation((content, options = {}) => ({
  size: content ? content.reduce((acc, item) => acc + (item.length || 0), 0) : 0,
  type: options.type || '',
  stream: jest.fn(),
  arrayBuffer: jest.fn().mockResolvedValue(new ArrayBuffer(8)),
  text: jest.fn().mockResolvedValue('mock blob content'),
  slice: jest.fn().mockReturnThis(),
}));

// Enhanced URL methods
URL.createObjectURL = jest.fn().mockReturnValue('blob:mock-url-123');
URL.revokeObjectURL = jest.fn();

// Enhanced Canvas API
HTMLCanvasElement.prototype.getContext = jest.fn().mockReturnValue({
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
  measureText: jest.fn(() => ({ width: 10 })),
  transform: jest.fn(),
  rect: jest.fn(),
  clip: jest.fn(),
});

HTMLCanvasElement.prototype.toDataURL = jest.fn(() => 'data:image/png;base64,mock');
HTMLCanvasElement.prototype.toBlob = jest.fn((callback) => 
  callback(new Blob(['mock'], { type: 'image/png' }))
);

// Enhanced Audio/Video APIs
global.HTMLMediaElement.prototype.load = jest.fn();
global.HTMLMediaElement.prototype.play = jest.fn().mockResolvedValue(undefined);
global.HTMLMediaElement.prototype.pause = jest.fn();
global.HTMLMediaElement.prototype.addTextTrack = jest.fn();

// Mock MediaRecorder for audio recording tests
global.MediaRecorder = jest.fn().mockImplementation(() => ({
  start: jest.fn(),
  stop: jest.fn(),
  pause: jest.fn(),
  resume: jest.fn(),
  addEventListener: jest.fn(),
  removeEventListener: jest.fn(),
  dispatchEvent: jest.fn(),
  state: 'inactive',
  mimeType: 'audio/webm',
  stream: {},
  ondataavailable: null,
  onerror: null,
  onpause: null,
  onresume: null,
  onstart: null,
  onstop: null,
}));

// Mock speech APIs
global.SpeechSynthesis = jest.fn().mockImplementation(() => ({
  speak: jest.fn(),
  cancel: jest.fn(),
  pause: jest.fn(),
  resume: jest.fn(),
  getVoices: jest.fn(() => []),
  speaking: false,
  pending: false,
  paused: false,
}));

global.SpeechSynthesisUtterance = jest.fn();

// =============================================================================
// ERROR HANDLING SETUP
// =============================================================================

// Suppress console errors in tests unless explicitly needed
const originalError = console.error;
const originalWarn = console.warn;

beforeEach(() => {
  console.error = jest.fn();
  console.warn = jest.fn();
});

afterEach(() => {
  console.error = originalError;
  console.warn = originalWarn;
});

// Global error handlers for unhandled promises
const originalProcessListeners = process.listeners('unhandledRejection');
process.removeAllListeners('unhandledRejection');
process.on('unhandledRejection', (reason, promise) => {
  // Only log if not a test expectation
  if (!reason?.message?.includes('expect')) {
    console.error('Unhandled promise rejection:', reason);
  }
});

// =============================================================================
// UTILITY EXPORTS FOR TESTS
// =============================================================================

// Make utilities available globally for tests
global.testUtils = {
  // Mock data generators
  generateMockUser: (overrides = {}) => ({
    uid: 'test-user-123',
    email: 'test@example.com',
    displayName: 'Test User',
    emailVerified: true,
    ...overrides,
  }),
  
  generateMockEvent: (overrides = {}) => ({
    id: 'test-event-123',
    title: 'Test Event',
    date: new Date().toISOString(),
    location: 'Test Location',
    ...overrides,
  }),
  
  // Test utilities
  sleep: (ms) => new Promise(resolve => setTimeout(resolve, ms)),
  
  waitForNextTick: () => new Promise(resolve => process.nextTick(resolve)),
  
  flushPromises: () => new Promise(resolve => setImmediate(resolve)),
};

// =============================================================================
// CLEANUP SETUP
// =============================================================================

// Cleanup after each test
afterEach(() => {
  // Clear all mocks
  jest.clearAllMocks();
  
  // Clear localStorage and sessionStorage
  if (typeof window !== 'undefined') {
    window.localStorage.clear();
    window.sessionStorage.clear();
  }
  
  // Clear any timers
  jest.clearAllTimers();
  
  // Reset any DOM changes
  document.body.innerHTML = '';
  document.head.innerHTML = '';
});

// Cleanup after all tests
afterAll(() => {
  // Restore original process listeners
  process.removeAllListeners('unhandledRejection');
  originalProcessListeners.forEach(listener => {
    process.on('unhandledRejection', listener);
  });
});