import { getApps, getApp } from '@react-native-firebase/app';
import { logger } from '../services/LoggingService';

// Check if Firebase app is initialized
export const initializeFirebase = () => {
  try {
    // For React Native Firebase, the app is typically auto-initialized
    // through GoogleService-Info.plist and google-services.json
    const apps = getApps();
    
    if (apps.length === 0) {
      logger.debug('No Firebase apps initialized. This is unusual for React Native Firebase.');
      // React Native Firebase should auto-initialize from native config files
      // If we reach here, there might be a configuration issue
      throw new Error('Firebase not auto-initialized. Check native configuration files.');
    } else {
      logger.debug(`Firebase initialized with ${apps.length} app(s)`);
      return getApp(); // Get the default app
    }
  } catch (error) {
    logger.error('Firebase initialization check failed:', error);
    throw error;
  }
};

// Call this early to ensure Firebase is ready
export const ensureFirebaseInitialized = () => {
  try {
    return initializeFirebase();
  } catch (error) {
    logger.error('Failed to ensure Firebase initialization:', error);
    // For React Native Firebase, this usually means the native modules aren't properly linked
    throw new Error('Firebase native modules not properly linked. Run "cd ios && pod install" and rebuild.');
  }
};