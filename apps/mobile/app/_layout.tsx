import { GestureHandlerRootView } from 'react-native-gesture-handler';
import React, { useEffect } from 'react';
import { LogBox, Linking } from 'react-native';
import { errorHandler, ErrorSeverity } from '../src/lib/ErrorHandlingService';
import { ErrorBoundary } from '../components/ui/ErrorBoundary';
import { useErrorHandler } from '../hooks/useErrorHandler';
import { SplashScreen, Stack } from 'expo-router';
import { useFonts } from 'expo-font';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { useColorScheme } from '@/hooks/useColorScheme';
import { AuthProvider, useAuth } from '../src/contexts/AuthContext';
import { ScreenResultProvider } from '../src/contexts/ScreenResultContext';
import { EncryptionProvider } from '../src/contexts/EncryptionContext';
import { OfflineProvider } from '../src/contexts/OfflineContext';
import 'react-native-get-random-values';
import { connectToEmulators } from '../src/lib/firebase';
import { ensureFirebaseInitialized } from '../src/lib/firebaseInit';
import { Buffer } from '@craftzdog/react-native-buffer';
import { KeyRotationPrompt } from '../components/encryption/KeyRotationPrompt';
import { backgroundSyncTask } from '../src/services/BackgroundSyncTask';
import * as ExpoLinking from 'expo-linking';
import * as Sentry from '@sentry/react-native';
import { sentryConfig } from '../sentry.config';
import { logger } from '../src/services/LoggingService';
import crashlytics from '@react-native-firebase/crashlytics';
// import { SessionExpiredModal } from '../components/ui/SessionExpiredModal'; // TODO: Create this component
import MfaSignInModal from '../components/ui/MfaSignInModal';
global.Buffer = Buffer as any;

// Initialize Firebase as early as possible
try {
  ensureFirebaseInitialized();
} catch (error) {
  logger.error('Early Firebase initialization failed:', error);
}

// Initialize Sentry
Sentry.init(sentryConfig);

// Initialize logging service
logger.initialize(sentryConfig.dsn).catch(error => {
  logger.error('Failed to initialize logging service:', error);
});

// Initialize Crashlytics
crashlytics().setCrashlyticsCollectionEnabled(!__DEV__).catch(error => {
  logger.error('Failed to initialize Crashlytics:', error);
});

// Prevent the splash screen from auto-hiding before asset loading is complete.
SplashScreen.preventAutoHideAsync();

// This component will render the actual UI once loading is complete
function AppContent() {
  const { isLoading: isAuthLoading } = useAuth(); // Get loading state from AuthContext
  const [fontsLoaded, fontError] = useFonts({
    SpaceMono: require('../assets/fonts/SpaceMono-Regular.ttf'),
    // Add other fonts here if needed
  });
  const colorScheme = useColorScheme();

  useEffect(() => {
    // Hide splash screen once fonts are loaded (or error) AND auth state is determined
    if ((fontsLoaded || fontError) && !isAuthLoading) {
      SplashScreen.hideAsync().catch((error) => {
        logger.error('Failed to hide splash screen:', error);
      });
    }
    
    // Handle font loading errors
    if (fontError) {
      logger.error('Font loading error:', fontError);
    }
  }, [fontsLoaded, fontError, isAuthLoading]);

  // If fonts are not loaded yet, or auth is still loading, return null (splash screen is visible).
  if ((!fontsLoaded && !fontError) || isAuthLoading) {
    return null; // Or a custom splash screen component
  }

  // Now that everything is loaded, render the main layout with the navigator
  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <Stack>
        <Stack.Screen name="index" options={{ headerShown: false }} />
        <Stack.Screen name="(auth)" options={{ headerShown: false }} />
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="(onboarding)" options={{ headerShown: false }} />
        <Stack.Screen name="+not-found" />
        <Stack.Screen name="modal" options={{ presentation: 'modal' }} />
        {/* Expo Router's Stack implicitly renders the correct screen (Slot) */}
      </Stack>
      <StatusBar style={colorScheme === 'dark' ? 'light' : 'dark'} />
      <KeyRotationPrompt />
      {/* <SessionExpiredModal /> */}
      <MfaSignInModal />
    </ThemeProvider>
  );
}

export default function RootLayout() {
  // Initialize error handling and connect to emulators
  useEffect(() => {
    const initializeApp = async () => {
      try {
        // Initialize global error handling
        errorHandler.initialize();
        
        // Initialize background sync
        try {
          await backgroundSyncTask.configure();
          logger.debug('[App] Background sync configured successfully');
        } catch (error) {
          logger.error('[App] Failed to configure background sync:', error);
        }
        
        // Suppress yellow box warnings in development
        if (__DEV__) {
          LogBox.ignoreLogs([
            'Non-serializable values were found in the navigation state',
            'Possible Unhandled Promise Rejection',
            // Add other warnings you want to suppress
          ]);
          
          // Connect to Firebase emulators in dev mode
          try {
            await connectToEmulators();
          } catch (error) {
            logger.error('Failed to connect to emulators:', error);
          }
        }
      } catch (error) {
        logger.error('App initialization failed:', error);
      }
    };

    initializeApp();
  }, []); // Empty dependency array since this should only run once

  // RootLayout with global error boundary
  return (
    <ErrorBoundary screenName="RootLayout">
      <GestureHandlerRootView style={{ flex: 1 }}>
        <SafeAreaProvider>
          <AuthProvider> 
            <OfflineProvider>
              <EncryptionProvider>
                <ScreenResultProvider>
                  {/* AuthProvider wraps AppContent so useAuth works inside it */}
                  <AppContent />
                </ScreenResultProvider>
              </EncryptionProvider>
            </OfflineProvider>
          </AuthProvider>
        </SafeAreaProvider>
      </GestureHandlerRootView>
    </ErrorBoundary>
  );
}
