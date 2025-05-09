import firebase from '@react-native-firebase/app';
import auth from '@react-native-firebase/auth';
import firestore from '@react-native-firebase/firestore';
import functions from '@react-native-firebase/functions';
import storage from '@react-native-firebase/storage';

// For React Native Firebase, the native configuration (GoogleService-Info.plist / google-services.json)
// is typically used for initialization, and explicit initializeApp(config) in JS is not needed
// for the default app. The @react-native-firebase/app plugin in app.json handles this.

// Get the default app instance
const appInstance = firebase.app();

// Get service instances
const authInstance = auth();
const dbInstance = firestore();
const functionsInstance = functions();
const storageInstance = storage();

// --- START Emulator Connection ---
// Check if running in development mode. __DEV__ is a global variable set by React Native.
if (__DEV__) {
  const FBASE_EMULATOR_HOST = '127.0.0.1'; // Changed from '10.0.2.2' for iOS simulator & direct localhost
  // For iOS Simulator, you can use 'localhost' or '127.0.0.1'
  // If testing on a physical device, replace with your machine's local IP address.
  // For Android Emulator, '10.0.2.2' is the alias for the host machine's localhost.

  console.log('Attempting to connect to Firebase Emulators on host:', FBASE_EMULATOR_HOST);

  // Auth Emulator
  try {
    authInstance.useEmulator(`http://${FBASE_EMULATOR_HOST}:9099`);
    console.log('Auth emulator connected');
  } catch (e) {
    console.warn('Failed to connect to Auth emulator:', e);
  }

  // Firestore Emulator
  try {
    dbInstance.useEmulator(FBASE_EMULATOR_HOST, 8080);
    console.log('Firestore emulator connected');
  } catch (e) {
    console.warn('Failed to connect to Firestore emulator:', e);
  }
  
  // Functions Emulator
  // For @react-native-firebase/functions, you might need to specify the region as well if it's not the default.
  try {
    functionsInstance.useEmulator(FBASE_EMULATOR_HOST, 5001);
    console.log('Functions emulator connected');
  } catch (e) {
    console.warn('Failed to connect to Functions emulator:', e);
  }

  // Storage Emulator
  // Note: @react-native-firebase/storage useEmulator might not be directly available or might work differently.
  // Often, for storage, if you point other services to the emulator, it might pick it up or you might
  // need to ensure your rules and app logic can handle emulator URLs. 
  // As of recent versions, it should be: 
  try {
    storageInstance.useEmulator(FBASE_EMULATOR_HOST, 9199);
    console.log('Storage emulator connected');
  } catch (e) {
    console.warn('Failed to connect to Storage emulator. This might require specific setup or might not be fully supported by the version.', e);
  }
}
// --- END Emulator Connection ---

export {
  appInstance as app,
  authInstance as auth,
  dbInstance as db,
  functionsInstance as functions, // Retaining 'functions' alias for consistency
  storageInstance as storage
}; 