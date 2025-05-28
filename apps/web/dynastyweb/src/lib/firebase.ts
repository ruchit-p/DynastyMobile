import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth, connectAuthEmulator } from 'firebase/auth';
import { getFirestore, connectFirestoreEmulator } from 'firebase/firestore';
import { getStorage, connectStorageEmulator } from 'firebase/storage';
import { getFunctions, connectFunctionsEmulator } from 'firebase/functions';
import { getAnalytics, isSupported } from 'firebase/analytics';
import { getMessaging, Messaging } from 'firebase/messaging';

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID,
};

// Initialize Firebase
const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();

// Initialize Firebase services
const auth = getAuth(app);
const db = getFirestore(app);
const storage = getStorage(app);
const functions = getFunctions(app, 'us-central1');

// Initialize messaging - but only on the client side
let messaging: Messaging | null = null;
if (typeof window !== 'undefined') {
  try {
    messaging = getMessaging(app);
  } catch (error) {
    console.error('Error initializing Firebase Messaging:', error);
  }
}

// Connect to emulators in development - only on client side
if (typeof window !== 'undefined' && process.env.NEXT_PUBLIC_USE_FIREBASE_EMULATOR === 'true') {
  console.log('🔧 FIREBASE DEBUG: Starting emulator connections...');
  console.log('🔧 FIREBASE DEBUG: Environment flag:', process.env.NEXT_PUBLIC_USE_FIREBASE_EMULATOR);
  
  let connectionsAttempted = false;
  
  // Check if already connected to prevent duplicate connections
  if (!(auth as unknown as { _canInitEmulator?: boolean })._canInitEmulator) {
    connectionsAttempted = true;
  }
  
  if (!connectionsAttempted) {
    try {
      console.log('🔧 FIREBASE DEBUG: Connecting to Auth Emulator at http://127.0.0.1:9099');
      connectAuthEmulator(auth, 'http://127.0.0.1:9099');
      console.log('✅ FIREBASE DEBUG: Auth Emulator connected successfully');
    } catch (error) {
      console.error('❌ FIREBASE DEBUG: Auth Emulator connection failed:', error);
    }
    
    try {
      console.log('🔧 FIREBASE DEBUG: Connecting to Firestore Emulator at 127.0.0.1:8080');
      connectFirestoreEmulator(db, '127.0.0.1', 8080);
      console.log('✅ FIREBASE DEBUG: Firestore Emulator connected successfully');
    } catch (error) {
      console.error('❌ FIREBASE DEBUG: Firestore Emulator connection failed:', error);
    }
    
    try {
      console.log('🔧 FIREBASE DEBUG: Connecting to Storage Emulator at 127.0.0.1:9199');
      connectStorageEmulator(storage, '127.0.0.1', 9199);
      console.log('✅ FIREBASE DEBUG: Storage Emulator connected successfully');
    } catch (error) {
      console.error('❌ FIREBASE DEBUG: Storage Emulator connection failed:', error);
    }
    
    try {
      console.log('🔧 FIREBASE DEBUG: Connecting to Functions Emulator at 127.0.0.1:8693');
      connectFunctionsEmulator(functions, '127.0.0.1', 8693);
      console.log('✅ FIREBASE DEBUG: Functions Emulator connected successfully');
    } catch (error) {
      console.error('❌ FIREBASE DEBUG: Functions Emulator connection failed:', error);
    }
  }
}

// Initialize Analytics and catch if not supported (e.g. in SSR)
let analytics = null;
if (typeof window !== 'undefined') {
  isSupported().then(supported => {
    if (supported) {
      analytics = getAnalytics(app);
    }
  });
}

export { app, auth, db, storage, functions, analytics, messaging }; 