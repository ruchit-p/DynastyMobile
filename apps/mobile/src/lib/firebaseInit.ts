import { getApps, getApp } from '@react-native-firebase/app';

// Check if Firebase app is initialized
export const initializeFirebase = () => {
  try {
    // For React Native Firebase, the app is typically auto-initialized
    // through GoogleService-Info.plist and google-services.json
    const apps = getApps();
    
    if (apps.length === 0) {
      console.log('No Firebase apps initialized. This is unusual for React Native Firebase.');
      // React Native Firebase should auto-initialize from native config files
      // If we reach here, there might be a configuration issue
      throw new Error('Firebase not auto-initialized. Check native configuration files.');
    } else {
      console.log(`Firebase initialized with ${apps.length} app(s)`);
      return getApp(); // Get the default app
    }
  } catch (error) {
    console.error('Firebase initialization check failed:', error);
    throw error;
  }
};

// Call this early to ensure Firebase is ready
export const ensureFirebaseInitialized = () => {
  try {
    return initializeFirebase();
  } catch (error) {
    console.error('Failed to ensure Firebase initialization:', error);
    // For React Native Firebase, this usually means the native modules aren't properly linked
    throw new Error('Firebase native modules not properly linked. Run "cd ios && pod install" and rebuild.');
  }
};