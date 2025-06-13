import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth, connectAuthEmulator } from 'firebase/auth';
import { getFirestore, connectFirestoreEmulator } from 'firebase/firestore';
import { getStorage, connectStorageEmulator } from 'firebase/storage';
import { getFunctions, connectFunctionsEmulator } from 'firebase/functions';
import { getAnalytics, isSupported, Analytics } from 'firebase/analytics';
import { getMessaging, Messaging } from 'firebase/messaging';

// Track if emulators have been connected
let emulatorsConnected = false;

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID,
};

// Validate Firebase config
function validateFirebaseConfig() {
  const requiredFields = ['apiKey', 'authDomain', 'projectId'];
  for (const field of requiredFields) {
    if (!firebaseConfig[field as keyof typeof firebaseConfig]) {
      console.error(`Missing required Firebase config field: ${field}`);
      return false;
    }
  }
  return true;
}

// Initialize Firebase only if config is valid
let app: ReturnType<typeof initializeApp> | null = null;
let auth: ReturnType<typeof getAuth> | null = null;
let db: ReturnType<typeof getFirestore> | null = null;
let storage: ReturnType<typeof getStorage> | null = null;
let functions: ReturnType<typeof getFunctions> | null = null;
let messaging: Messaging | null = null;
let analytics: Analytics | null = null;

if (validateFirebaseConfig()) {
  // Initialize Firebase
  app = !getApps().length ? initializeApp(firebaseConfig) : getApp();
  
  // Initialize Firebase services
  auth = getAuth(app);
  db = getFirestore(app);
  storage = getStorage(app);
  functions = getFunctions(app, 'us-central1');
  
  // Initialize messaging - but only on the client side
  if (typeof window !== 'undefined') {
    try {
      messaging = getMessaging(app);
    } catch (error) {
      console.error('Error initializing Firebase Messaging:', error);
    }
  }
  
  // Connect to emulators in development - only on client side
  if (typeof window !== 'undefined' && 
      process.env.NEXT_PUBLIC_USE_FIREBASE_EMULATOR === 'true' && 
      !emulatorsConnected) {
    
    emulatorsConnected = true;
    
    console.log('🔧 FIREBASE DEBUG: Starting emulator connections...');
    
    try {
      if (auth && 'useEmulator' in auth) {
        connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
        console.log('✅ FIREBASE DEBUG: Auth Emulator connected');
      }
    } catch (error) {
      console.log('⚠️ FIREBASE DEBUG: Auth Emulator already connected or failed:', error);
    }
    
    try {
      if (db && !(db as unknown as { _settings?: { host?: string } })._settings?.host?.includes('localhost')) {
        connectFirestoreEmulator(db, '127.0.0.1', 8080);
        console.log('✅ FIREBASE DEBUG: Firestore Emulator connected');
      }
    } catch (error) {
      console.log('⚠️ FIREBASE DEBUG: Firestore Emulator already connected or failed:', error);
    }
    
    try {
      if (storage && !(storage as unknown as { _protocol?: string })._protocol?.includes('127.0.0.1')) {
        connectStorageEmulator(storage, '127.0.0.1', 9199);
        console.log('✅ FIREBASE DEBUG: Storage Emulator connected');
      }
    } catch (error) {
      console.log('⚠️ FIREBASE DEBUG: Storage Emulator already connected or failed:', error);
    }
    
    try {
      if (functions && !(functions as unknown as { _delegate?: { _url?: string } })._delegate?._url?.includes('127.0.0.1')) {
        connectFunctionsEmulator(functions, '127.0.0.1', 5001);
        console.log('✅ FIREBASE DEBUG: Functions Emulator connected');
      }
    } catch (error) {
      console.log('⚠️ FIREBASE DEBUG: Functions Emulator already connected or failed:', error);
    }
  }
  
  // Initialize Analytics
  if (typeof window !== 'undefined') {
    isSupported().then(supported => {
      if (supported && app) {
        analytics = getAnalytics(app);
      }
    });
  }
} else {
  console.error('Firebase configuration is invalid. Please check your environment variables.');
}

export { app, auth, db, storage, functions, analytics, messaging };