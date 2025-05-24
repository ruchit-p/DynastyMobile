import React, { createContext, useContext, useEffect, useState, ReactNode, useMemo } from 'react';
import { 
  getFirebaseAuth, 
  getFirebaseFunctions, 
  getFirebaseDb,
  getFirebaseApp, // Added getFirebaseApp
  connectToEmulators // Import the function to connect to emulators
} from '../lib/firebase'; 
import { doc, getDoc, FirebaseFirestoreTypes } from '@react-native-firebase/firestore'; 
import RNAuth, { FirebaseAuthTypes } from '@react-native-firebase/auth'; // Import default for auth providers
import { useRouter, useSegments } from 'expo-router';
// Use an alias for GoogleSignInUser from the library to avoid conflict
import { GoogleSignin, statusCodes, User as LibGoogleSignInUser, ConfigureParams, HasPlayServicesParams, SignInResponse, SignInSuccessResponse } from '@react-native-google-signin/google-signin';
import { FirebaseFunctionsTypes } from '@react-native-firebase/functions'; // Added FirebaseFunctionsTypes
import firebase from '@react-native-firebase/app'; // Added firebase import for ReturnType
import { Alert } from 'react-native';
import { errorHandler, ErrorSeverity } from '../lib/ErrorHandlingService';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { syncService } from '../lib/syncService';
import { networkService } from '../services/NetworkService';
import { getNotificationService } from '../services/NotificationService';

// Cache keys for offline support
const CACHE_KEYS = {
  USER_DATA: '@dynasty_user_data_',
  AUTH_STATE: '@dynasty_auth_state',
  PHONE_AUTH_CONFIRMATION: '@dynasty_phone_auth_confirmation',
  PHONE_NUMBER_IN_PROGRESS: '@dynasty_phone_number_in_progress',
} as const;

// Configure Google Sign-In
// IMPORTANT: Replace with your WEB CLIENT ID from Google Cloud Console / Firebase Project settings
// This is typically the OAuth 2.0 client ID of type "Web application".
GoogleSignin.configure({
  webClientId: '613996380558-8u6sub7prcm6e0dh4q5hc2pkpk1vaefp.apps.googleusercontent.com', 
  offlineAccess: false, // set to true if you want to access Google API on behalf of user offline
} as ConfigureParams); // Added type assertion for configure

// Alias FirebaseUser type correctly
type FirebaseUser = FirebaseAuthTypes.User;

// Define a more specific type for the nested user object from Google Sign-In, if not readily available from the library
// Based on common structure, UserInfo often contains these:
// This is LibGoogleSignInUser from the import
// interface GoogleUserDetails {
//   id: string;
//   name: string | null;
//   email: string | null;
//   photo: string | null;
//   familyName: string | null;
//   givenName: string | null;
// }

// Define FirestoreUserType
export interface FirestoreUserType {
  onboardingCompleted?: boolean;
  firstName?: string;
  lastName?: string;
  bio?: string;
  phoneNumber?: string;
  profilePictureUrl?: string;
  connectionsCount?: number;
  storiesCount?: number;
  createdAt?: any; // Or a more specific Firebase Timestamp type if available
  [key: string]: any; // Keep this for flexibility if other fields exist
}

// Type for the user object returned by @react-native-google-signin/google-signin
// This matches the 'user' part of the object returned by GoogleSignin.signIn()
// Correctly use the imported and aliased LibGoogleSignInUser
export type GoogleSignInUser = LibGoogleSignInUser; 


// This matches the 'user' part of the object returned by GoogleSignin.signIn()
// RNGoogleSignInUser can be removed if GoogleSignInUser (aliased LibGoogleSignInUser) is used consistently.
// For now, let's assume RNGoogleSignInUser was meant to be the user object within SignInSuccessResponse
type RNGoogleSignInUser = LibGoogleSignInUser; // This type is for the 'user' field within SignInSuccessResponse

interface AuthContextType {
  user: FirebaseUser | null;
  isLoading: boolean;
  firestoreUser: FirestoreUserType | null;
  app: ReturnType<typeof firebase.app>; // Added app instance
  auth: FirebaseAuthTypes.Module; // Explicitly type auth
  functions: FirebaseFunctionsTypes.Module; // Explicitly type functions
  db: FirebaseFirestoreTypes.Module; // Explicitly type db
  signIn: (email: string, pass: string) => Promise<void>;
  signUp: (email: string, pass: string) => Promise<void>;
  signOut: () => Promise<void>;
  signInWithGoogle: () => Promise<void>;
  signInWithPhoneNumber: (phoneNumber: string) => Promise<FirebaseAuthTypes.ConfirmationResult | null>;
  confirmPhoneCode: (phoneNumber: string, code: string) => Promise<void>;
  phoneAuthConfirmation: FirebaseAuthTypes.ConfirmationResult | null;
  phoneNumberInProgress: string | null; // NEW: Store the phone number being verified
  setPhoneAuthConfirmation: React.Dispatch<React.SetStateAction<FirebaseAuthTypes.ConfirmationResult | null>>;
  clearPhoneAuth: () => void; // NEW: Clear phone auth state
  resendVerificationEmail: () => Promise<void>;
  confirmEmailVerificationLink: (uid: string, token: string) => Promise<void>;
  refreshUser: () => Promise<void>; // Added for manual refresh
  signInWithApple: () => Promise<void>; // Added for completeness
  sendPasswordReset: (email: string) => Promise<void>;
  triggerSendVerificationEmail: (userId: string, email: string, displayName: string) => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

interface AuthProviderProps {
  children: ReactNode;
}

// Define the expected structure of data from the handleSignUp Firebase function
interface HandleSignUpResultData {
  success: boolean;
  userId: string;
  message?: string;
}


export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
  // Lazy initialize Firebase services to avoid initialization errors
  const [firebaseServices, setFirebaseServices] = useState<{
    app: ReturnType<typeof getFirebaseApp> | null;
    auth: FirebaseAuthTypes.Module | null;
    functions: FirebaseFunctionsTypes.Module | null;
    db: FirebaseFirestoreTypes.Module | null;
  }>({ app: null, auth: null, functions: null, db: null });
  
  // Initialize Firebase services after component mounts
  useEffect(() => {
    const initFirebase = async () => {
      try {
        const app = getFirebaseApp();
        const auth = getFirebaseAuth();
        const functions = getFirebaseFunctions();
        const db = getFirebaseDb();
        setFirebaseServices({ app, auth, functions, db });
        setFirebaseInitialized(true);
      } catch (error) {
        console.error('Failed to initialize Firebase services:', error);
        errorHandler.handleError(error, {
          severity: ErrorSeverity.FATAL,
          title: 'Firebase Initialization Failed',
          metadata: { context: 'AuthProvider' }
        });
      }
    };
    initFirebase();
  }, []);
  
  const { app, auth, functions, db } = firebaseServices;
  
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [firebaseInitialized, setFirebaseInitialized] = useState(false);
  const [firestoreUser, setFirestoreUser] = useState<FirestoreUserType | null>(null);
  const [isFetchingFirestoreUser, setIsFetchingFirestoreUser] = useState(false);
  const router = useRouter();
  const segments = useSegments();
  const [phoneAuthConfirmation, setPhoneAuthConfirmation] = useState<FirebaseAuthTypes.ConfirmationResult | null>(null);
  const [phoneNumberInProgress, setPhoneNumberInProgress] = useState<string | null>(null);

  // Load persisted phone auth state on initialization
  useEffect(() => {
    const loadPersistedPhoneAuth = async () => {
      try {
        const [confirmationData, phoneNumber] = await Promise.all([
          AsyncStorage.getItem(CACHE_KEYS.PHONE_AUTH_CONFIRMATION),
          AsyncStorage.getItem(CACHE_KEYS.PHONE_NUMBER_IN_PROGRESS)
        ]);
        
        if (confirmationData) {
          // Note: We can't fully restore the ConfirmationResult object since it contains methods
          // But we can restore the phone number to allow resending OTP
          console.log('AuthContext: Found persisted phone auth data, restoring phone number');
        }
        
        if (phoneNumber) {
          setPhoneNumberInProgress(phoneNumber);
          console.log(`AuthContext: Restored phone number in progress: ${phoneNumber}`);
        }
      } catch (error) {
        console.error('AuthContext: Failed to load persisted phone auth state:', error);
      }
    };
    
    loadPersistedPhoneAuth();
  }, []);

  useEffect(() => {
    // Connect to emulators once Firebase services are initialized
    if (app && auth && functions && db) {
      connectToEmulators(); 
      
      // Initialize network service
      networkService.initialize().catch(error => {
        console.error('AuthContext: Failed to initialize network service:', error);
      });
    }
  }, [app, auth, functions, db]); // Run when Firebase services are ready

  const fetchFirestoreUserData = async (uid: string) => {
    if (!uid || !db) return null;
    setIsFetchingFirestoreUser(true);
    
    try {
      // Check if online
      const isOnline = networkService.isOnline();
      
      // Try to fetch from Firestore if online
      if (isOnline) {
        try {
          const userDocRef = doc(db, 'users', uid); 
          const docSnap = await getDoc(userDocRef);
          
          if (docSnap.exists()) {
            const userData = docSnap.data() as FirestoreUserType;
            console.log("AuthContext: Fetched Firestore user data:", userData);
            
            // Cache the user data for offline access
            await AsyncStorage.setItem(
              `${CACHE_KEYS.USER_DATA}${uid}`,
              JSON.stringify({
                data: userData,
                timestamp: Date.now()
              })
            );
            
            setFirestoreUser(userData);
            return userData;
          } else {
            console.log("AuthContext: No Firestore user document found for UID:", uid);
            setFirestoreUser(null);
            return null;
          }
        } catch (networkError) {
          console.log("AuthContext: Network error, falling back to cache:", networkError);
          // Fall through to cache logic
        }
      }
      
      // If offline or network error, try to load from cache
      console.log("AuthContext: Loading user data from cache...");
      const cachedData = await AsyncStorage.getItem(`${CACHE_KEYS.USER_DATA}${uid}`);
      
      if (cachedData) {
        const parsed = JSON.parse(cachedData);
        const userData = parsed.data as FirestoreUserType;
        console.log("AuthContext: Loaded user data from cache, age:", Date.now() - parsed.timestamp, "ms");
        setFirestoreUser(userData);
        return userData;
      } else {
        console.log("AuthContext: No cached user data found");
        setFirestoreUser(null);
        return null;
      }
    } catch (error) {
      console.error("AuthContext: Error fetching Firestore user data:", error);
      setFirestoreUser(null);
      return null;
    } finally {
      setIsFetchingFirestoreUser(false);
    }
  };
  
  const refreshUser = async () => {
    // 'auth' instance is now from firebaseServices
    if (auth && auth.currentUser) { 
      setIsLoading(true);
      try {
        await auth.currentUser.reload();
        const freshUser = auth.currentUser;
        setUser(freshUser);
        if (freshUser) {
          // Update user ID in error handler
          errorHandler.setUserId(freshUser.uid);
          await fetchFirestoreUserData(freshUser.uid);
        }
      } catch (error) {
        errorHandler.handleFirebaseError(error, {
          severity: ErrorSeverity.WARNING,
          title: 'Profile Refresh Error',
          metadata: { action: 'refreshUser' }
        });
      } finally {
        setIsLoading(false);
      }
    }
  };

  useEffect(() => {
    // Only set up auth listener when auth is initialized
    if (!auth) {
      console.log('Auth not initialized yet, skipping auth state listener');
      return;
    }
    
    const unsubscribe = auth.onAuthStateChanged(async (firebaseUser: FirebaseUser | null) => { 
      console.log('Auth state changed. User UID:', firebaseUser?.uid, 'Email Verified:', firebaseUser?.emailVerified);
      if (firebaseUser) {
        await firebaseUser.reload();
        const freshUser = auth.currentUser;
        setUser(freshUser);
        if (freshUser) {
          await fetchFirestoreUserData(freshUser.uid);
          
          // Initialize services for authenticated user
          try {
            // Initialize sync service
            await syncService.initialize(freshUser.uid);
            console.log('AuthContext: Sync service initialized for user:', freshUser.uid);
            
            // Initialize notification service
            const notificationService = getNotificationService();
            await notificationService.initialize(freshUser.uid);
            console.log('AuthContext: Notification service initialized for user:', freshUser.uid);
          } catch (error) {
            console.error('AuthContext: Failed to initialize services:', error);
          }
        } else {
          setFirestoreUser(null);
        }
      } else {
        setUser(null);
        setFirestoreUser(null);
        
        // Cleanup services when user signs out
        try {
          await syncService.cleanup();
          console.log('AuthContext: Sync service cleaned up');
          
          // Cleanup notification service
          const notificationService = getNotificationService();
          notificationService.cleanup();
          console.log('AuthContext: Notification service cleaned up');
        } catch (error) {
          console.error('AuthContext: Failed to cleanup services:', error);
        }
      }
      setIsLoading(false);
    });
    return () => unsubscribe();
  }, [auth, db]); // Added auth and db to dependency array

  // Main navigation effect that handles routing based on authentication state
  useEffect(() => {
    const routeInfo = {
      segments: segments.join('/'),
      currentRoute: segments.join('/') || 'index',
      isLoading,
      isFetchingFirestoreUser,
      userExists: !!user,
      userId: user?.uid,
      emailVerified: user?.emailVerified,
      onboardingCompleted: firestoreUser?.onboardingCompleted,
      phoneAuthConfirmationExists: !!phoneAuthConfirmation,
    };
    console.log('[AuthNavEffect START]', JSON.stringify(routeInfo, null, 2));

    // GUARD 1: Skip navigation logic while auth state is loading
    if (isLoading) {
      console.log('[AuthNavEffect] isLoading is TRUE. Returning early.');
      return;
    }

    const currentRoute = segments.join('/') || 'index';
    const isVerifyEmailScreen = currentRoute === '(auth)/verifyEmail';
    const isConfirmEmailScreen = currentRoute === '(auth)/confirmEmailVerification';
    const isPhoneSignInScreen = currentRoute === '(auth)/phoneSignIn';
    const isVerifyOtpScreen = currentRoute === '(auth)/verifyOtp';
    const inAuthGroup = segments.length > 0 && segments[0] === '(auth)';
    const inOnboardingGroup = segments.length > 0 && segments[0] === '(onboarding)';

    // GUARD 2: Special handling for active phone auth flow
    // When phoneAuthConfirmation exists and user is on phone auth screens,
    // allow them to stay there to complete the flow
    if (phoneAuthConfirmation && (isPhoneSignInScreen || isVerifyOtpScreen)) {
      console.log('[AuthNavEffect] Active phone auth flow detected. Staying on current phone auth screen.');
      return;
    }

    // GUARD 3: Skip if still fetching Firestore user data
    if (isFetchingFirestoreUser) {
      console.log('[AuthNavEffect] isFetchingFirestoreUser is TRUE. Returning early.');
      return;
    }

    let isLandingPageEquivalent = false;
    if (segments.length < 1) isLandingPageEquivalent = true;
    if (segments.length === 1 && segments[0] && ['', 'index'].includes(segments[0])) isLandingPageEquivalent = true;

    console.log(
      '[AuthNavEffect Decision Logic] User:', user?.uid,
      'Email:', user?.email, 'Verified:', user?.emailVerified,
      'OnboardingComplete:', firestoreUser?.onboardingCompleted,
      'CurrentRoute:', currentRoute, 'inAuthGroup:', inAuthGroup, 'inOnboardingGroup:', inOnboardingGroup,
      'isLandingPageEquivalent:', isLandingPageEquivalent
    );

    // ========== UNAUTHENTICATED USER LOGIC ==========
    if (!user) {
      // Special case: User is on verifyOtp screen without phoneAuthConfirmation
      // Allow them to stay if they have a phone number so they can resend OTP
      if (isVerifyOtpScreen && !phoneAuthConfirmation) {
        // Only redirect if they don't have a phone number at all
        if (!phoneNumberInProgress) {
          console.log('[AuthNavEffect] User on verifyOtp without confirmation or phone number. Redirecting to phoneSignIn.');
          router.replace('/(auth)/phoneSignIn');
          return;
        } else {
          console.log('[AuthNavEffect] User on verifyOtp without confirmation but has phone number. Allowing to stay for resend OTP.');
          return;
        }
      }

      // Allow access to auth screens and landing page without authentication
      const canBeOnPageWithoutAuth = inAuthGroup || isLandingPageEquivalent || isConfirmEmailScreen;
      if (!canBeOnPageWithoutAuth) {
        console.log(`[AuthNavEffect !user] Redirecting to / (landing page). Current route: ${currentRoute}`);
        router.replace('/');
      }
      return;
    }

    // ========== AUTHENTICATED USER LOGIC ==========
    
    // STEP 1: Email Verification Check (for email-based auth only)
    if (user.email && !user.emailVerified) {
      // User has email but it's not verified - must verify before proceeding
      if (!isVerifyEmailScreen && !isConfirmEmailScreen && currentRoute !== '(auth)/verifyEmail' && !inAuthGroup) {
        console.log(`[AuthNavEffect] User email ${user.email} NOT VERIFIED. Redirecting to /(auth)/verifyEmail. Current route: ${currentRoute}`);
        router.replace({ pathname: '/(auth)/verifyEmail', params: { email: user.email } });
        return;
      } else if (isVerifyEmailScreen || isConfirmEmailScreen || inAuthGroup) {
        console.log(`[AuthNavEffect] User email ${user.email} NOT VERIFIED, but staying on current auth-related page: ${currentRoute}`);
        return; 
      }
    }

    // STEP 2: Phone Auth or Email Verified - Check Onboarding Status
    // At this point: email is verified OR user authenticated via phone (no email to verify)
    
    if (firestoreUser && firestoreUser.onboardingCompleted === false) { 
      // User needs to complete onboarding
      if (!inOnboardingGroup && !inAuthGroup) { 
        console.log('[AuthNavEffect] User authenticated, Onboarding INCOMPLETE. Redirecting to /onboarding/profileSetup. Current route:', currentRoute);
        router.replace('/(onboarding)/profileSetup');
        return;
      }
    } else if (firestoreUser && firestoreUser.onboardingCompleted === true) {
      // User is fully onboarded - redirect to main app if on auth/onboarding/landing pages
      if (inAuthGroup || inOnboardingGroup || isLandingPageEquivalent) {
        // Special case: landing page with back history might be a transient state
        if (isLandingPageEquivalent && router.canGoBack()) {
          console.log('[AuthNavEffect] User ONBOARDED. On landing page with back history. Skipping redirect.');
        } else {
          console.log('[AuthNavEffect] User ONBOARDED. Redirecting to /(tabs)/feed. Current route:', currentRoute);
          router.replace('/(tabs)/feed');
          return;
        }
      }
    } else if (!firestoreUser && !isFetchingFirestoreUser) {
      // Edge case: Authenticated but no Firestore data (might be new user or data issue)
      console.log("[AuthNavEffect] User authenticated but firestoreUser is null. Possible new user or data sync issue.");
      if (inAuthGroup || isLandingPageEquivalent) {
        console.log('[AuthNavEffect] Redirecting to onboarding as a safe default for authenticated user without profile data.');
        router.replace('/(onboarding)/profileSetup');
        return;
      }
    }
  }, [user, firestoreUser, isLoading, isFetchingFirestoreUser, segments, router, phoneAuthConfirmation]);

  // Cleanup phone auth confirmation when navigating away from phone auth flow
  // Clear phone auth state function
  const clearPhoneAuth = () => {
    setPhoneAuthConfirmation(null);
    setPhoneNumberInProgress(null);
    
    // Clear persisted phone auth data
    AsyncStorage.multiRemove([
      CACHE_KEYS.PHONE_AUTH_CONFIRMATION,
      CACHE_KEYS.PHONE_NUMBER_IN_PROGRESS
    ]).catch(error => {
      console.error('AuthContext: Failed to clear persisted phone auth data:', error);
    });
    
    console.log('AuthContext: Phone auth state cleared');
  };

  useEffect(() => {
    const currentRoute = segments.join('/') || 'index';
    const isPhoneAuthRoute = currentRoute === '(auth)/phoneSignIn' || currentRoute === '(auth)/verifyOtp';
    
    // Only clear phone auth if:
    // 1. We have a phone auth confirmation
    // 2. The current route is not empty/index (which could be a transition state)
    // 3. We're definitely navigating away from phone auth screens (not just a transition)
    // 4. Add a small delay to handle navigation transitions
    
    if (!isPhoneAuthRoute && phoneAuthConfirmation && currentRoute !== 'index' && currentRoute !== '') {
      // Use a timeout to avoid clearing during navigation transitions
      const cleanup = setTimeout(() => {
        // Double-check that we're still not on a phone auth route after the delay
        const finalRoute = segments.join('/') || 'index';
        const isFinalPhoneAuthRoute = finalRoute === '(auth)/phoneSignIn' || finalRoute === '(auth)/verifyOtp';
        
        if (!isFinalPhoneAuthRoute && finalRoute !== 'index' && finalRoute !== '') {
          console.log('[PhoneAuthCleanup] User navigated away from phone auth flow. Clearing phone auth state.');
          clearPhoneAuth();
        }
      }, 100); // 100ms delay to handle navigation transitions
      
      return () => clearTimeout(cleanup);
    }
  }, [segments, phoneAuthConfirmation]);

  const signIn = async (email: string, pass: string) => {
    setIsLoading(true);
    try {
      await auth.signInWithEmailAndPassword(email, pass); // auth from useMemo
      // User state will be updated by onAuthStateChanged
    } catch (error: any) {
      // Use the error handler for Firebase auth errors
      errorHandler.handleFirebaseError(error, {
        severity: ErrorSeverity.ERROR,
        title: 'Sign In Error',
        metadata: { action: 'signIn', email },
        showAlert: false // Don't show alert here, we'll handle UI feedback in the component
      });
      
      // Still throw the error for the UI component to handle
      if (error.code && error.message) { throw new Error(error.message); }
      else if (error.message) { throw new Error(error.message); }
      else { throw new Error('An unknown error occurred during sign in.'); }
    } finally {
      setIsLoading(false);
    }
  };

  const triggerSendVerificationEmail = async (userId: string, email: string, displayName: string) => {
    if (!functions) {
      console.error("AuthContext: Firebase functions not initialized for triggerSendVerificationEmail.");
      throw new Error("Functions service not available.");
    }
    try {
      console.log(`AuthContext: Calling 'sendVerificationEmail' cloud function. UserID: '${userId}', Email: '${email}', DisplayName: '${displayName}'`);
      const sendEmailFunction = functions.httpsCallable('sendVerificationEmail');
      const result = await sendEmailFunction({ userId, email, displayName });
      console.log("AuthContext: 'sendVerificationEmail' cloud function result:", result.data);
    } catch (error: any) {
      console.error("AuthContext: Error calling 'sendVerificationEmail' cloud function:", error);
      // Don't throw an error that stops the signup flow, but log it.
      // Alert.alert("Verification Email", "Could not send verification email. Please try resending from the verify email page.");
    }
  };

  const signUp = async (newEmail: string, newPass: string) => {
    setIsLoading(true);
    try {
      console.log("AuthContext: Attempting sign-up via 'handleSignUp' cloud function for:", newEmail);
      const handleSignUpFunction = functions.httpsCallable('handleSignUp');
      // Cast the result to the expected type
      const result = await handleSignUpFunction({ email: newEmail, password: newPass }) as { data: HandleSignUpResultData };

      if (result.data.success && result.data.userId) {
        console.log('AuthContext: Cloud function handleSignUp successful, User UID:', result.data.userId);
        // ... other comments ...
        console.log("AuthContext: SignUp successful. User state will be updated by onAuthStateChanged.");
      } else {
        const errorMessage = result.data?.message || 'Signup failed due to an unknown server error.';
        console.error("AuthContext: handleSignUp cloud function returned an error or unsuccessful result:", result.data);
        
        errorHandler.handleError(
          new Error(errorMessage),
          { 
            severity: ErrorSeverity.ERROR,
            title: 'Sign Up Error',
            metadata: { 
              action: 'signUp', 
              email: newEmail,
              functionResult: result.data
            },
            showAlert: false
          }
        );
        
        throw new Error(errorMessage);
      }
    } catch (error: any) {
      errorHandler.handleFirebaseError(error, {
        severity: ErrorSeverity.ERROR,
        title: 'Sign Up Error',
        metadata: { action: 'signUp', email: newEmail },
        showAlert: false
      });
      
      let displayMessage = 'Could not complete sign up.';
      if (error.message) {
        displayMessage = error.message;
      }
      throw new Error(displayMessage); 
    } finally {
      setIsLoading(false);
    }
  };

  const resendVerificationEmail = async () => {
    if (!auth.currentUser) { // auth from useMemo
      console.error("Resend Verification: No user found");
      alert("No user found. Please sign in again.");
    } else {
      // Assuming user is available from state or auth.currentUser
      const userForEmail = auth?.currentUser; // auth from firebaseServices
      if (userForEmail && userForEmail.email) {
        // Ensure displayName is a string, provide a fallback.
        await triggerSendVerificationEmail(userForEmail.uid, userForEmail.email, userForEmail.displayName || 'User');
      }
    }
  };

  const confirmEmailVerificationLink = async (uid: string, token: string) => {
    // This function might be specific to a custom flow or a Firebase extension.
    // Standard email verification is usually handle by Firebase automatically when user clicks the link.
    // If this is for a custom verification backend function:
    if (!functions || !auth) {
      throw new Error('Firebase services not initialized');
    }
    setIsLoading(true);
    try {
      const confirmEmailFunction = functions.httpsCallable('confirmEmailVerification'); // functions from firebaseServices
      const result = await confirmEmailFunction({ uid, token });
      console.log("AuthContext: Custom email verification result:", result.data);
      
      // Reload the user to get the latest emailVerified status
      if (auth.currentUser) { // auth from firebaseServices
        await auth.currentUser.reload(); // auth from firebaseServices
        setUser(auth.currentUser); // auth from firebaseServices
      }
      alert("Email verified successfully! You can now sign in.");
    } catch (error: any) {
      console.error("Error confirming email verification:", error);
      throw new Error(error.data?.message || error.message || 'Failed to confirm email verification.');
    } finally {
      setIsLoading(false);
    }
  };

  const signOut = async () => {
    if (!auth) {
      throw new Error('Authentication service not initialized');
    }
    setIsLoading(true);
    try {
      // Clear phone auth state
      clearPhoneAuth();
      
      // Clear cached user data
      if (user?.uid) {
        await AsyncStorage.removeItem(`${CACHE_KEYS.USER_DATA}${user.uid}`);
        console.log("AuthContext: Cleared cached user data");
      }
      
      // Clear sync data
      try {
        await syncService.clearSyncData();
        await syncService.cleanup();
        console.log("AuthContext: Cleared sync data");
      } catch (error) {
        console.error("AuthContext: Error clearing sync data:", error);
      }
      
      // Check if Google Sign-In was used
      // Use getCurrentUser() which returns the user object or null
      if (GoogleSignin) { // Ensure GoogleSignin module is available
        const currentGoogleUser = await GoogleSignin.getCurrentUser();
        if (currentGoogleUser) {
          console.log("AuthContext: Google user is signed in, attempting full Google sign out.");
          if (typeof GoogleSignin.revokeAccess === 'function') {
            await GoogleSignin.revokeAccess();
            console.log("AuthContext: Google access revoked.");
          } else {
            console.warn("AuthContext: GoogleSignin.revokeAccess function is not available.");
          }
          if (typeof GoogleSignin.signOut === 'function') {
            await GoogleSignin.signOut();
            console.log("AuthContext: Google user signed out from Google.");
          } else {
            console.warn("AuthContext: GoogleSignin.signOut function is not available.");
          }
        } else {
          console.log("AuthContext: No current Google user found via getCurrentUser(). Skipping Google-specific sign out steps.");
        }
      } else {
        console.warn("AuthContext: GoogleSignin module is not available. Skipping Google sign out check.");
      }
      
      await auth.signOut(); // auth from firebaseServices
      setUser(null);
      setFirestoreUser(null);
      setPhoneAuthConfirmation(null); // Clear phone auth state on sign out
      console.log('AuthContext: User signed out, all auth state cleared');
      // Navigation will be handled by useEffect hook
    } catch (error: any) {
      console.error("Sign out error", error);
      throw new Error(error.message || 'Failed to sign out.');
    } finally {
      setIsLoading(false);
    }
  };

  const signInWithGoogle = async () => {
    if (!auth) {
      throw new Error('Authentication service not initialized');
    }
    setIsLoading(true);
    errorHandler.setCurrentAction('signInWithGoogle');

    // Type guard for SignInSuccessResponse
    function isSignInSuccessResponse(response: SignInResponse): response is SignInSuccessResponse {
      if (!response) return false;
      // A success response should have an idToken (string) and a user object.
      // An error response or cancellation often has a 'code' or specific 'type'.
      // If 'code' exists, it's likely not a direct success object from this perspective.
      if (typeof (response as any).code !== 'undefined') {
        return false;
      }
      // If 'type' is 'cancelled', it's not a success.
      if ((response as any).type === 'cancelled') {
        return false;
      }
      // Check for core success properties
      const successCandidate = response as any;
      return typeof successCandidate.idToken === 'string' && successCandidate.user != null;
    }

    try {
      await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
      const signInResponse = await GoogleSignin.signIn(); // This is of type SignInResponse

      // Scenario 1: User cancelled (detected from response object structure)
      // Based on logs, cancellation can result in: { "data": null, "type": "cancelled" }
      if (signInResponse && (signInResponse as any).type === 'cancelled') {
        console.log("AuthContext: Google Sign-In cancelled by user (detected from response.type).");
        Alert.alert("Google Sign-In", "Sign in was cancelled.");
        // No error needs to be thrown, allow to proceed to finally block.
        return; // Gracefully exit the function.
      }

      // Scenario 2: Successful sign-in
      if (isSignInSuccessResponse(signInResponse)) {
        const idToken: string = (signInResponse as any).idToken; 
        const userDetails: LibGoogleSignInUser = (signInResponse as any).user;

        console.log("AuthContext: Google User ID Token acquired.");
        console.log("AuthContext: Google User Details Email:", (userDetails as any).email);
        console.log("AuthContext: Google User Details Name:", (userDetails as any).name);
        console.log("AuthContext: Google User Details Photo:", (userDetails as any).photo);

        const googleCredential = RNAuth.GoogleAuthProvider.credential(idToken);
        const userCredential = await auth!.signInWithCredential(googleCredential);
        const firebaseUser = userCredential.user;
        setUser(firebaseUser);

        if (firebaseUser && functions) {
          const handleGoogleSignIn = functions.httpsCallable('handleGoogleSignIn');
          await handleGoogleSignIn({
            userId: firebaseUser.uid,
            email: (userDetails as any).email,
            displayName: (userDetails as any).name || '',
            photoURL: (userDetails as any).photo || null
          });
        }
        // Successful completion, allow to proceed to finally block.
      }
      // Scenario 3: Sign-in returned an object with an error code
      else if (signInResponse && (signInResponse as any).code !== undefined) {
        const errorCode = (signInResponse as any).code as string | number;
        let errorMessage = "Google Sign-In error";

        if (statusCodes[errorCode as keyof typeof statusCodes]) {
            errorMessage = `Google Sign-In failed: ${statusCodes[errorCode as keyof typeof statusCodes]}`;
        } else {
            errorMessage = `Google Sign-In failed with code: ${errorCode}`;
        }
        
        // Check if this returned code is specifically SIGN_IN_CANCELLED
        if (errorCode === statusCodes.SIGN_IN_CANCELLED || String(errorCode) === String(statusCodes.SIGN_IN_CANCELLED)) {
            console.log("AuthContext: Google Sign-In was cancelled by the user (detected from signInResponse.code).");
            Alert.alert("Google Sign-In", "Sign in was cancelled.");
            return; // Gracefully exit
        } else {
            console.error("AuthContext: " + errorMessage, signInResponse);
            Alert.alert("Google Sign-In Error", errorMessage);
            throw new Error(errorMessage); // This is an actual error from Google's side.
        }
      } 
      // Scenario 4: signInResponse is neither success, nor known cancellation, nor known error code structure
      else {
        console.error("AuthContext: Google Sign-In cancelled or failed with unexpected response structure.", signInResponse);
        Alert.alert("Google Sign-In Error", "Google Sign-In cancelled or failed with an unexpected response.");
        // Avoid throwing a new generic error if signInResponse is null or undefined after cancellation
        // as this might be the state after a cancellation that didn't fit other checks.
        // If signInResponse is truly unexpected and not a cancellation, this path is problematic.
        // For now, assume this can also be a form of cancellation/failure not throwing an error.
        return; 
      }
    } catch (error: any) {
      // This catch block handles errors THROWN by GoogleSignin.hasPlayServices(), GoogleSignin.signIn(),
      // or errors thrown by our logic above (e.g., from Scenario 3).
      errorHandler.handleError(error, {
        severity: ErrorSeverity.ERROR,
        title: 'Google Sign In Error',
        metadata: { action: 'signInWithGoogle' },
        showAlert: false
      });
      
      console.error("Google sign in error caught in outer catch block:", error); // Log the original error
      
      const errorCode = error.code; // error.code can be a number or string
      const errorCodeString = String(errorCode);

      if (errorCode === statusCodes.SIGN_IN_CANCELLED || errorCodeString === String(statusCodes.SIGN_IN_CANCELLED)) {
        console.log("AuthContext: Google Sign-In was cancelled by the user (detected from thrown error.code).");
        Alert.alert("Google Sign-In", "Sign in was cancelled.");
        // No re-throw for cancellation.
      } else if (errorCode === statusCodes.IN_PROGRESS || errorCodeString === String(statusCodes.IN_PROGRESS)) {
        console.log("AuthContext: Google Sign-In operation already in progress.");
        Alert.alert("Google Sign-In", "Sign in is already in progress.");
        // No re-throw.
      } else if (errorCode === statusCodes.PLAY_SERVICES_NOT_AVAILABLE || errorCodeString === String(statusCodes.PLAY_SERVICES_NOT_AVAILABLE)) {
        console.log("AuthContext: Google Play Services not available or outdated.");
        Alert.alert("Google Sign-In Error", "Play services not available or outdated. Please update Google Play Services.");
        // No re-throw, user is alerted.
      } else {
        // For other errors (network errors, unexpected issues from the library, or our own re-thrown errors)
        const displayMessage = error.message || 'An unknown error occurred during Google sign in.';
        console.error("AuthContext: Unhandled Google Sign-In error in catch block:", displayMessage, error);
        Alert.alert("Google Sign-In Error", displayMessage);
        // To prevent crashing the app, we will not re-throw here. The error is logged and user is alerted.
      }
    } finally {
        setIsLoading(false); // Ensure isLoading is always reset
    }
  };

  const signInWithPhoneNumber = async (phoneNumber: string): Promise<FirebaseAuthTypes.ConfirmationResult | null> => {
    if (!auth) {
      throw new Error('Authentication service not initialized');
    }
    setIsLoading(true);
    try {
      const confirmation = await auth.signInWithPhoneNumber(phoneNumber);
      setPhoneAuthConfirmation(confirmation);
      setPhoneNumberInProgress(phoneNumber); // Store the phone number
      
      // Persist phone number to survive app reloads
      await AsyncStorage.setItem(CACHE_KEYS.PHONE_NUMBER_IN_PROGRESS, phoneNumber);
      
      console.log("AuthContext: Phone number verification code sent, confirmation object set in context.");
      
      // Navigate to OTP verification screen
      router.replace({ 
        pathname: '/(auth)/verifyOtp',
        params: { phoneNumberSent: phoneNumber }
      });
      console.log(`AuthContext: Navigating to verifyOtp for ${phoneNumber}`);
      
      return confirmation;
    } catch (error: any) {
      console.error(`Phone sign in error: ${error.message}`);
      Alert.alert("OTP Send Error", error.message || 'Failed to send OTP. Please try again.');
      throw new Error(error.message || 'Failed to send OTP.');
    } finally {
      setIsLoading(false);
    }
  };

  const confirmPhoneCode = async (phoneNumber: string, code: string) => {
    if (!phoneAuthConfirmation) {
      console.error("AuthContext: phoneAuthConfirmation is null. Cannot confirm code.");
      throw new Error("Verification session expired or not found. Please request a new OTP.");
    }
    
    if (!functions) {
      throw new Error('Firebase functions not initialized');
    }
    
    setIsLoading(true);
    try {
      const userCredential = await phoneAuthConfirmation.confirm(code);
      console.log(`AuthContext: Phone OTP confirmed. Firebase User UID: ${userCredential?.user?.uid}`);
      
      if (userCredential && userCredential.user) {
        const firebaseUser = userCredential.user;
        console.log(`AuthContext: Calling handlePhoneSignIn cloud function for UID: ${firebaseUser.uid}`);
        
        const handlePhoneSignInFn = functions.httpsCallable('handlePhoneSignIn');
        const result = await handlePhoneSignInFn({ uid: firebaseUser.uid, phoneNumber: phoneNumber });
        
        console.log('AuthContext: handlePhoneSignIn cloud function result:', result.data);
        await fetchFirestoreUserData(firebaseUser.uid);
      } else {
        throw new Error("Failed to confirm OTP: No user credential received.");
      }
      
      // Clear phone auth state after successful verification
      setPhoneAuthConfirmation(null);
      setPhoneNumberInProgress(null);
      
      // Clear persisted phone auth data
      await AsyncStorage.multiRemove([
        CACHE_KEYS.PHONE_AUTH_CONFIRMATION,
        CACHE_KEYS.PHONE_NUMBER_IN_PROGRESS
      ]);
      
      console.log('AuthContext: Phone auth state cleared after successful verification');
    } catch (error: any) {
      console.error("AuthContext: Error during confirmPhoneCode", error);
      throw error;
    } finally {
      setIsLoading(false);
    }
  };

  const signInWithApple = async () => {
    setIsLoading(true);
    console.log("AuthContext: Apple Sign-In initiated (placeholder).");
    // Placeholder for Apple Sign-In logic
    // See https://rnfirebase.io/auth/social-auth#apple
    // const appleAuthRequestResponse = await appleAuth.performRequest({...});
    // const { identityToken } = appleAuthRequestResponse;
    // const appleCredential = auth.AppleAuthProvider.credential(identityToken);
    // await auth.signInWithCredential(appleCredential);
    Alert.alert("Apple Sign-In", "Apple Sign-In is not yet implemented.");
    setIsLoading(false);
  };

  const sendPasswordReset = async (email: string) => {
    if (!auth) {
      throw new Error('Authentication service not initialized');
    }
    setIsLoading(true);
    try {
      console.log("AuthContext: Attempting to send password reset email to:", email);
      await auth.sendPasswordResetEmail(email);
      console.log("AuthContext: Password reset email sent successfully to:", email);
      Alert.alert("Password Reset", "Password reset email sent. Please check your inbox.");
      router.back(); // Navigate back after sending email
    } catch (error: any) {
      console.error("AuthContext: Password reset error for:", email, error);
      Alert.alert("Password Reset Failed", error.message || "Could not send password reset email.");
    } finally {
      setIsLoading(false);
    }
  };

  // Don't render children until Firebase is initialized
  if (!firebaseInitialized) {
    return null; // Or a loading spinner
  }
  
  return (
    <AuthContext.Provider value={{
      user,
      isLoading,
      firestoreUser,
      app: app!, // We know these are initialized after firebaseInitialized check
      auth: auth!,
      functions: functions!,
      db: db!,
      signIn,
      signUp,
      signOut,
      signInWithGoogle,
      signInWithPhoneNumber,
      confirmPhoneCode,
      phoneAuthConfirmation,
      phoneNumberInProgress,
      setPhoneAuthConfirmation,
      clearPhoneAuth,
      resendVerificationEmail,
      confirmEmailVerificationLink,
      refreshUser,
      signInWithApple,
      sendPasswordReset,
      triggerSendVerificationEmail
    }}>
      {children}
    </AuthContext.Provider>
  );
};