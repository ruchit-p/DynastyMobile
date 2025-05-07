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

export {
  appInstance as app,
  authInstance as auth,
  dbInstance as db,
  functionsInstance as functions, // Retaining 'functions' alias for consistency
  storageInstance as storage
}; 