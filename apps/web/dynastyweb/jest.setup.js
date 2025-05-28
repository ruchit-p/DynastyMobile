// Learn more: https://github.com/testing-library/jest-dom
import '@testing-library/jest-dom'

// Mock environment variables
process.env.NEXT_PUBLIC_FIREBASE_API_KEY = 'test-api-key'
process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN = 'test-auth-domain'
process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID = 'test-project-id'
process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET = 'test-storage-bucket'
process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID = 'test-sender-id'
process.env.NEXT_PUBLIC_FIREBASE_APP_ID = 'test-app-id'
process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID = 'test-measurement-id'

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
  getAuth: jest.fn(() => ({})),
  onAuthStateChanged: jest.fn(),
  signInWithEmailAndPassword: jest.fn(),
  createUserWithEmailAndPassword: jest.fn(),
  signOut: jest.fn(),
  sendEmailVerification: jest.fn(),
  sendPasswordResetEmail: jest.fn(),
  updateProfile: jest.fn(),
  updateEmail: jest.fn(),
  updatePassword: jest.fn(),
  EmailAuthProvider: {
    credential: jest.fn(),
  },
  reauthenticateWithCredential: jest.fn(),
  setPersistence: jest.fn(() => Promise.resolve()),
  browserLocalPersistence: {},
  GoogleAuthProvider: jest.fn(),
  signInWithPopup: jest.fn(),
  RecaptchaVerifier: jest.fn(),
}))

jest.mock('firebase/firestore', () => ({
  getFirestore: jest.fn(),
  collection: jest.fn(),
  doc: jest.fn(),
  getDoc: jest.fn(),
  getDocs: jest.fn(),
  setDoc: jest.fn(),
  updateDoc: jest.fn(),
  deleteDoc: jest.fn(),
  query: jest.fn(),
  where: jest.fn(),
  orderBy: jest.fn(),
  limit: jest.fn(),
  serverTimestamp: jest.fn(),
  Timestamp: {
    now: jest.fn(),
    fromDate: jest.fn(),
  },
}))

jest.mock('firebase/storage', () => ({
  getStorage: jest.fn(),
  ref: jest.fn(),
  uploadBytes: jest.fn(),
  getDownloadURL: jest.fn(),
  deleteObject: jest.fn(),
}))

jest.mock('firebase/functions', () => ({
  getFunctions: jest.fn(() => ({})),
  httpsCallable: jest.fn(),
  connectFunctionsEmulator: jest.fn(),
}))

jest.mock('firebase/messaging', () => ({
  getMessaging: jest.fn(() => null),
  getToken: jest.fn(),
  onMessage: jest.fn(),
  isSupported: jest.fn(() => Promise.resolve(false)),
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
      } else if (config?.ALLOWED_TAGS) {
        // When specific tags are allowed, remove all others
        const allowedTagsPattern = config.ALLOWED_TAGS.join('|');
        const regex = new RegExp(`<(?!\/?(?:${allowedTagsPattern})[\s>])[^>]+>`, 'gi');
        result = result.replace(regex, '');
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