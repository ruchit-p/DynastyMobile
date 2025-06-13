import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth, connectAuthEmulator } from 'firebase/auth';
import { getFirestore, connectFirestoreEmulator } from 'firebase/firestore';
import { getStorage, connectStorageEmulator } from 'firebase/storage';
import { getFunctions, connectFunctionsEmulator } from 'firebase/functions';
import { getAnalytics, isSupported } from 'firebase/analytics';
import { getMessaging, Messaging } from 'firebase/messaging';

// MARK: - Firebase Configuration
const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID,
};

// MARK: - Firebase App Initialization
const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();

// MARK: - Firebase Services Initialization
const auth = getAuth(app);
const db = getFirestore(app);
const storage = getStorage(app);
const functions = getFunctions(app, 'us-central1');

// MARK: - Firebase Messaging (Client-side only)
let messaging: Messaging | null = null;
if (typeof window !== 'undefined') {
  try {
    messaging = getMessaging(app);
  } catch (error) {
    console.error('Error initializing Firebase Messaging:', error);
  }
}

// MARK: - Emulator Configuration
const connectToEmulators = () => {
  if (typeof window === 'undefined') return; // Server-side rendering check
  
  const useEmulator = process.env.NEXT_PUBLIC_USE_FIREBASE_EMULATOR === 'true';
  console.log('🔧 FIREBASE DEBUG: Use emulator flag:', useEmulator);
  
  if (!useEmulator) return;
  
  console.log('🔧 FIREBASE DEBUG: Starting emulator connections...');
  
  // Check if already connected (prevents duplicate connections)
  // Using type assertion with proper interface for internal Firebase properties
  interface AuthWithEmulator {
    _delegate?: {
      _config?: {
        emulator?: unknown;
      };
    };
  }
  
  interface FirestoreWithHost {
    _delegate?: {
      _databaseId?: {
        host?: string;
      };
    };
  }
  
  const authSettings = (auth as AuthWithEmulator)._delegate?._config;
  const firestoreSettings = (db as FirestoreWithHost)._delegate?._databaseId;
  
  // Connect Auth Emulator
  try {
    if (!authSettings?.emulator) {
      console.log('🔧 FIREBASE DEBUG: Connecting to Auth Emulator at http://127.0.0.1:9099');
      connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
      console.log('✅ FIREBASE DEBUG: Auth Emulator connected successfully');
    } else {
      console.log('ℹ️ FIREBASE DEBUG: Auth Emulator already connected');
    }
  } catch (error) {
    console.error('❌ FIREBASE DEBUG: Auth Emulator connection failed:', error);
  }
  
  // Connect Firestore Emulator
  try {
    if (!firestoreSettings?.host?.includes('127.0.0.1')) {
      console.log('🔧 FIREBASE DEBUG: Connecting to Firestore Emulator at 127.0.0.1:8080');
      connectFirestoreEmulator(db, '127.0.0.1', 8080);
      console.log('✅ FIREBASE DEBUG: Firestore Emulator connected successfully');
    } else {
      console.log('ℹ️ FIREBASE DEBUG: Firestore Emulator already connected');
    }
  } catch (error) {
    console.error('❌ FIREBASE DEBUG: Firestore Emulator connection failed:', error);
  }
  
  // Connect Storage Emulator
  try {
    console.log('🔧 FIREBASE DEBUG: Connecting to Storage Emulator at 127.0.0.1:9199');
    connectStorageEmulator(storage, '127.0.0.1', 9199);
    console.log('✅ FIREBASE DEBUG: Storage Emulator connected successfully');
  } catch (error) {
    console.error('❌ FIREBASE DEBUG: Storage Emulator connection failed:', error);
  }
  
  // Connect Functions Emulator
  try {
    console.log('🔧 FIREBASE DEBUG: Connecting to Functions Emulator at 127.0.0.1:5001');
    connectFunctionsEmulator(functions, '127.0.0.1', 5001);
    console.log('✅ FIREBASE DEBUG: Functions Emulator connected successfully');
  } catch (error) {
    console.error('❌ FIREBASE DEBUG: Functions Emulator connection failed:', error);
  }
};

// Connect to emulators when running in development
connectToEmulators();

// MARK: - Analytics Initialization (Client-side only)
let analytics = null;
if (typeof window !== 'undefined') {
  isSupported().then(supported => {
    if (supported) {
      analytics = getAnalytics(app);
    }
  });
}

export { app, auth, db, storage, functions, analytics, messaging }; 