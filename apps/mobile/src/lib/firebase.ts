import firebase from '@react-native-firebase/app';
// No specific top-level type for FirebaseApp instance, ReturnType<typeof firebase.app> will be used.
import rnAuth, { FirebaseAuthTypes } from '@react-native-firebase/auth';
import rnFirestore, { FirebaseFirestoreTypes } from '@react-native-firebase/firestore';
import rnFunctions, { FirebaseFunctionsTypes } from '@react-native-firebase/functions';
import rnStorage, { FirebaseStorageTypes } from '@react-native-firebase/storage';

// For React Native Firebase, the native configuration (GoogleService-Info.plist / google-services.json)
// is typically used for initialization, and explicit initializeApp(config) in JS is not needed
// for the default app. The @react-native-firebase/app plugin in app.json handles this.

let _app: ReturnType<typeof firebase.app> | undefined;
const getApp = (): ReturnType<typeof firebase.app> => {
  if (!_app) {
    console.log('Firebase JS: Attempting to initialize default app instance...');
    _app = firebase.app(); // This is where the error occurs if native isn't ready
    console.log('Firebase JS: Default app instance initialized.');
  }
  return _app;
};

let _auth: FirebaseAuthTypes.Module | undefined;
const getAuthInstance = (): FirebaseAuthTypes.Module => {
  if (!_auth) {
    getApp(); // Ensure app is initialized first
    console.log('Firebase JS: Attempting to initialize Auth instance...');
    _auth = rnAuth();
    console.log('Firebase JS: Auth instance initialized.');
  }
  return _auth;
};

let _db: FirebaseFirestoreTypes.Module | undefined;
const getDbInstance = (): FirebaseFirestoreTypes.Module => {
  if (!_db) {
    getApp(); // Ensure app is initialized first
    console.log('Firebase JS: Attempting to initialize Firestore instance...');
    _db = rnFirestore();
    console.log('Firebase JS: Firestore instance initialized.');
  }
  return _db;
};

let _functions: FirebaseFunctionsTypes.Module | undefined;
const getFunctionsInstance = (): FirebaseFunctionsTypes.Module => {
  if (!_functions) {
    getApp(); // Ensure app is initialized first
    console.log('Firebase JS: Attempting to initialize Functions instance...');
    _functions = rnFunctions(); // Or rnFunctions(getApp(), 'your-region');
    console.log('Firebase JS: Functions instance initialized.');
  }
  return _functions;
};

let _storage: FirebaseStorageTypes.Module | undefined;
const getStorageInstance = (): FirebaseStorageTypes.Module => {
  if (!_storage) {
    getApp(); // Ensure app is initialized first
    console.log('Firebase JS: Attempting to initialize Storage instance...');
    _storage = rnStorage();
    console.log('Firebase JS: Storage instance initialized.');
  }
  return _storage;
};

// Function to connect to emulators, should be called after services are confirmed to be working
export const connectToEmulators = () => {
  if (__DEV__) {
    const FBASE_EMULATOR_HOST = '127.0.0.1';
    console.log('Firebase JS: Attempting to connect to Firebase Emulators on host:', FBASE_EMULATOR_HOST);

    try {
      const auth = getAuthInstance();
      auth.useEmulator(`http://${FBASE_EMULATOR_HOST}:9099`);
      console.log('Firebase JS: Auth emulator connected');
    } catch (e) {
      console.warn('Firebase JS: Failed to connect to Auth emulator:', e);
    }

    try {
      const db = getDbInstance();
      db.useEmulator(FBASE_EMULATOR_HOST, 8080);
      console.log('Firebase JS: Firestore emulator connected');
    } catch (e) {
      console.warn('Firebase JS: Failed to connect to Firestore emulator:', e);
    }
    
    try {
      const functions = getFunctionsInstance();
      functions.useEmulator(FBASE_EMULATOR_HOST, 5001);
      console.log('Firebase JS: Functions emulator connected');
    } catch (e) {
      console.warn('Firebase JS: Failed to connect to Functions emulator:', e);
    }

    try {
      const storage = getStorageInstance();
      storage.useEmulator(FBASE_EMULATOR_HOST, 9199);
      console.log('Firebase JS: Storage emulator connected');
    } catch (e) {
      console.warn('Firebase JS: Failed to connect to Storage emulator:', e);
    }
  } else {
    console.log('Firebase JS: Not in DEV mode, skipping emulator connection.');
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
  const db = getDbInstance();
  return await db.collection(collectionPath).doc(docId).get();
};

const getDocuments = async (collectionPath: string, queries: any[] = []) => {
  const db = getDbInstance();
  let query: FirebaseFirestoreTypes.Query = db.collection(collectionPath);
  queries.forEach(q => {
    query = query.where(q.field, q.operator, q.value);
  });
  return await query.get();
};

const createDocument = async (collectionPath: string, data: any) => {
  const db = getDbInstance();
  return await db.collection(collectionPath).add(data);
};

const updateDocument = async (collectionPath: string, docId: string, data: any) => {
  const db = getDbInstance();
  return await db.collection(collectionPath).doc(docId).update(data);
};

const deleteDocument = async (collectionPath: string, docId: string) => {
  const db = getDbInstance();
  return await db.collection(collectionPath).doc(docId).delete();
};

// Export getter functions for services, and helper functions
export {
  getApp as getFirebaseApp, // Renamed for clarity
  getAuthInstance as getFirebaseAuth,
  getDbInstance as getFirebaseDb,
  getFunctionsInstance as getFirebaseFunctions,
  getStorageInstance as getFirebaseStorage,
  // Export the Firestore helper functions
  getDocument,
  getDocuments,
  createDocument,
  updateDocument,
  deleteDocument
};

// Old exports that caused eager initialization:
// export const app = getApp();
// export const auth = getAuth();
// export const db = getDb();
// export const functions = getFunctionsService();
// export const storage = getStorage();