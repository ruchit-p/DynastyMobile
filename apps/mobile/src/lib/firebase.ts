import firebase, { getApp as getFirebaseCoreApp } from '@react-native-firebase/app';
import type { ReactNativeFirebase } from '@react-native-firebase/app'; // For App type
import { getAuth, connectAuthEmulator, FirebaseAuthTypes } from '@react-native-firebase/auth';
import { getFirestore, connectFirestoreEmulator, FirebaseFirestoreTypes } from '@react-native-firebase/firestore';
import { getFunctions, connectFunctionsEmulator, FirebaseFunctionsTypes } from '@react-native-firebase/functions';
import { getStorage, connectStorageEmulator, FirebaseStorageTypes } from '@react-native-firebase/storage';
import { ensureFirebaseInitialized } from './firebaseInit';
import { logger } from '../services/LoggingService';

// For React Native Firebase, the native configuration (GoogleService-Info.plist / google-services.json)
// is typically used for initialization, and explicit initializeApp(config) in JS is not needed
// for the default app. The @react-native-firebase/app plugin in app.json handles this.

let _app: ReactNativeFirebase.FirebaseApp | undefined; // Use the type from RNF
const retrieveApp = (): ReactNativeFirebase.FirebaseApp => { // Renamed from getApp to avoid conflict
  try {
    if (!_app) {
      logger.debug('Firebase JS: Attempting to retrieve default app instance...');
      // Ensure Firebase is initialized first
      ensureFirebaseInitialized();
      _app = getFirebaseCoreApp(); // Use RNF's getApp() to get the default app
      logger.debug('Firebase JS: Default app instance retrieved.');
    }
    return _app;
  } catch (error) {
    logger.error('Firebase Initialization Error:', error);
    // Check if this is a common initialization issue
    if (error && error.message && error.message.includes('No Firebase App')) {
      logger.error('Firebase app not found. This usually means:');
      logger.error('1. Native Firebase modules are not properly linked');
      logger.error('2. The app needs to be rebuilt after adding Firebase');
      logger.error('3. For iOS: cd ios && pod install');
      logger.error('4. For Android: Ensure google-services.json is in android/app/');
    }
    throw error; // Re-throw since app is critical
  }
};

let _auth: FirebaseAuthTypes.Module | undefined;
const getAuthInstance = (): FirebaseAuthTypes.Module => {
  try {
    if (!_auth) {
      retrieveApp(); // Ensure app is initialized/retrieved first
      logger.debug('Firebase JS: Attempting to initialize Auth instance...');
      _auth = getAuth();
      logger.debug('Firebase JS: Auth instance initialized.');
    }
    return _auth;
  } catch (error) {
    logger.error('Firebase Auth Initialization Error:', error);
    throw error; // Re-throw since auth is critical
  }
};

let _db: FirebaseFirestoreTypes.Module | undefined;
let _offlinePersistenceEnabled = false;

const getDbInstance = (): FirebaseFirestoreTypes.Module => {
  try {
    if (!_db) {
      retrieveApp(); // Ensure app is initialized/retrieved first
      logger.debug('Firebase JS: Attempting to initialize Firestore instance...');
      _db = getFirestore();
      
      // Enable offline persistence
      if (!_offlinePersistenceEnabled) {
        logger.debug('Firebase JS: Enabling Firestore offline persistence...');
        _db.settings({
          persistence: true,
          cacheSizeBytes: 50 * 1024 * 1024, // 50MB cache size
          ignoreUndefinedProperties: true
        }).then(() => {
          _offlinePersistenceEnabled = true;
          logger.debug('Firebase JS: Firestore offline persistence enabled with 50MB cache.');
        }).catch((error) => {
          logger.warn('Firebase JS: Failed to enable offline persistence:', error);
          // Continue without offline persistence rather than failing
        });
      }
      
      logger.debug('Firebase JS: Firestore instance initialized.');
    }
    return _db;
  } catch (error) {
    logger.error('Firebase Firestore Initialization Error:', error);
    throw error; // Re-throw since firestore is critical
  }
};

let _functions: FirebaseFunctionsTypes.Module | undefined;
const getFunctionsInstance = (): FirebaseFunctionsTypes.Module => {
  try {
    if (!_functions) {
      retrieveApp(); // Ensure app is initialized/retrieved first
      logger.debug('Firebase JS: Attempting to initialize Functions instance...');
      // For specific app instance or region: getFunctions(retrieveApp(), 'your-region')
      _functions = getFunctions(retrieveApp()); // Pass the app instance
      logger.debug('Firebase JS: Functions instance initialized.');
    }
    return _functions;
  } catch (error) {
    logger.error('Firebase Functions Initialization Error:', error);
    throw error; // Re-throw since functions are critical
  }
};

let _storage: FirebaseStorageTypes.Module | undefined;
const getStorageInstance = (): FirebaseStorageTypes.Module => {
  try {
    if (!_storage) {
      retrieveApp(); // Ensure app is initialized/retrieved first
      logger.debug('Firebase JS: Attempting to initialize Storage instance...');
      // For specific app instance or bucket: getStorage(retrieveApp(), 'gs://your-bucket')
      _storage = getStorage(retrieveApp()); // Pass the app instance
      logger.debug('Firebase JS: Storage instance initialized.');
    }
    return _storage;
  } catch (error) {
    logger.error('Firebase Storage Initialization Error:', error);
    throw error; // Re-throw since storage is critical
  }
};

// Function to connect to emulators, should be called after services are confirmed to be working
export const connectToEmulators = () => {
  if (__DEV__) {
    const FBASE_EMULATOR_HOST = '127.0.0.1'; 
    logger.debug('Firebase JS: Attempting to connect to Firebase Emulators on host:', FBASE_EMULATOR_HOST);

    try {
      const auth = getAuthInstance();
      connectAuthEmulator(auth, `http://${FBASE_EMULATOR_HOST}:9099`);
      logger.debug('Firebase JS: Auth emulator connected');
    } catch (e) {
      logger.warn('Firebase Emulator Connection Error (auth):', e);
    }

    try {
      const db = getDbInstance();
      connectFirestoreEmulator(db, FBASE_EMULATOR_HOST, 8080);
      logger.debug('Firebase JS: Firestore emulator connected');
    } catch (e) {
      logger.warn('Firebase Emulator Connection Error (firestore):', e);
    }
    
    try {
      const functions = getFunctionsInstance();
      connectFunctionsEmulator(functions, FBASE_EMULATOR_HOST, 5001);
      logger.debug('Firebase JS: Functions emulator connected');
    } catch (e) {
      logger.warn('Firebase Emulator Connection Error (functions):', e);
    }

    try {
      const storage = getStorageInstance();
      connectStorageEmulator(storage, FBASE_EMULATOR_HOST, 9199);
      logger.debug('Firebase JS: Storage emulator connected');
    } catch (e) {
      logger.warn('Firebase Emulator Connection Error (storage):', e);
    }
  } else {
    logger.debug('Firebase JS: Not in DEV mode, skipping emulator connection.');
  }
};

// --- START Emulator Connection ---
// Check if running in development mode. __DEV__ is a global variable set by React Native.
// MOVED to connectToEmulators function
// if (__DEV__) {
// ... emulator connection logic was here ...
// }
// --- END Emulator Connection ---

// Helper functions for Firestore operations
const getDocument = async (collectionPath: string, docId: string) => {
  try {
    const db = getDbInstance();
    return await db.collection(collectionPath).doc(docId).get();
  } catch (error) {
    logger.error('Firebase Get Document Error:', error);
    throw error;
  }
};

const getDocuments = async (collectionPath: string, queries: any[] = []) => {
  try {
    const db = getDbInstance();
    let query: FirebaseFirestoreTypes.Query = db.collection(collectionPath);
    queries.forEach(q => {
      query = query.where(q.field, q.operator, q.value);
    });
    return await query.get();
  } catch (error) {
    logger.error('Firebase Get Documents Error:', error);
    throw error;
  }
};

const createDocument = async (collectionPath: string, data: any) => {
  try {
    const db = getDbInstance();
    return await db.collection(collectionPath).add(data);
  } catch (error) {
    logger.error('Firebase Create Document Error:', error);
    throw error;
  }
};

const updateDocument = async (collectionPath: string, docId: string, data: any) => {
  try {
    const db = getDbInstance();
    return await db.collection(collectionPath).doc(docId).update(data);
  } catch (error) {
    logger.error('Firebase Update Document Error:', error);
    throw error;
  }
};

const deleteDocument = async (collectionPath: string, docId: string) => {
  try {
    const db = getDbInstance();
    return await db.collection(collectionPath).doc(docId).delete();
  } catch (error) {
    logger.error('Firebase Delete Document Error:', error);
    throw error;
  }
};

// Offline utilities
const isOfflinePersistenceEnabled = (): boolean => {
  return _offlinePersistenceEnabled;
};

// Enable/disable network for testing offline scenarios
const setFirestoreNetwork = async (enabled: boolean): Promise<void> => {
  try {
    const db = getDbInstance();
    if (enabled) {
      await db.enableNetwork();
      logger.debug('Firebase JS: Firestore network enabled');
    } else {
      await db.disableNetwork();
      logger.debug('Firebase JS: Firestore network disabled (offline mode)');
    }
  } catch (error) {
    logger.error('Firebase JS: Error changing network state:', error);
    throw error;
  }
};

// Clear Firestore cache (useful for testing)
const clearFirestoreCache = async (): Promise<void> => {
  try {
    const db = getDbInstance();
    await db.clearPersistence();
    logger.debug('Firebase JS: Firestore cache cleared');
  } catch (error) {
    logger.error('Firebase JS: Error clearing cache:', error);
    throw error;
  }
};

// Export getter functions for services, and helper functions
export {
  retrieveApp as getFirebaseApp, // Renamed to maintain external API
  getAuthInstance as getFirebaseAuth,
  getDbInstance as getFirebaseDb,
  getFunctionsInstance as getFirebaseFunctions,
  getStorageInstance as getFirebaseStorage,
  // Export the Firestore helper functions
  getDocument,
  getDocuments,
  createDocument,
  updateDocument,
  deleteDocument,
  // Export offline utilities
  isOfflinePersistenceEnabled,
  setFirestoreNetwork,
  clearFirestoreCache
};

// Old exports that caused eager initialization:
// export const app = getApp();
// export const auth = getAuth();
// export const db = getDb();
// export const functions = getFunctionsService();
// export const storage = getStorage();