import React, { createContext, useContext, useEffect, useState, ReactNode, useMemo } from 'react';
import { 
  getFirebaseAuth, 
  getFirebaseFunctions, 
  getFirebaseDb,
  getFirebaseApp, // Added getFirebaseApp
  connectToEmulators // Import the function to connect to emulators
} from '../lib/firebase'; 
import { doc, FirebaseFirestoreTypes } from '@react-native-firebase/firestore'; // Added doc import and FirebaseFirestoreTypes
import RNAuth, { FirebaseAuthTypes } from '@react-native-firebase/auth'; // Import default for auth providers
import { useRouter, useSegments } from 'expo-router';
// Use an alias for GoogleSignInUser from the library to avoid conflict
import { GoogleSignin, statusCodes, User as LibGoogleSignInUser, ConfigureParams, HasPlayServicesParams, SignInResponse, SignInSuccessResponse } from '@react-native-google-signin/google-signin';
import { FirebaseFunctionsTypes } from '@react-native-firebase/functions'; // Added FirebaseFunctionsTypes
import firebase from '@react-native-firebase/app'; // Added firebase import for ReturnType
import { Alert } from 'react-native';

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
  setPhoneAuthConfirmation: React.Dispatch<React.SetStateAction<FirebaseAuthTypes.ConfirmationResult | null>>;
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
  // Move Firebase service initialization inside the component with useMemo
  const app = useMemo(() => getFirebaseApp(), []); // Added app initialization
  const auth: FirebaseAuthTypes.Module = useMemo(() => getFirebaseAuth(), []); // Explicit type
  const functions: FirebaseFunctionsTypes.Module = useMemo(() => getFirebaseFunctions(), []); // Explicit type
  const db: FirebaseFirestoreTypes.Module = useMemo(() => getFirebaseDb(), []); // Explicit type
  
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [firestoreUser, setFirestoreUser] = useState<FirestoreUserType | null>(null);
  const [isFetchingFirestoreUser, setIsFetchingFirestoreUser] = useState(false);
  const router = useRouter();
  const segments = useSegments();
  const [phoneAuthConfirmation, setPhoneAuthConfirmation] = useState<FirebaseAuthTypes.ConfirmationResult | null>(null);

  useEffect(() => {
    // Connect to emulators once when the app/provider mounts, if in DEV mode
    connectToEmulators(); 
  }, []); // Empty dependency array ensures this runs once on mount

  const fetchFirestoreUserData = async (uid: string) => {
    if (!uid) return null;
    setIsFetchingFirestoreUser(true);
    try {
      // 'db' instance is now from useMemo
      const userDocRef = doc(db, 'users', uid); 
      const docSnap = await userDocRef.get();
      if (docSnap.exists()) {
        console.log("AuthContext: Fetched Firestore user data:", docSnap.data());
        setFirestoreUser(docSnap.data() as FirestoreUserType);
        return docSnap.data() as FirestoreUserType;
      } else {
        console.log("AuthContext: No Firestore user document found for UID:", uid);
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
    // 'auth' instance is now from useMemo
    if (auth.currentUser) { 
      setIsLoading(true);
      await auth.currentUser.reload();
      const freshUser = auth.currentUser;
      setUser(freshUser);
      if (freshUser) {
        await fetchFirestoreUserData(freshUser.uid);
      }
      setIsLoading(false);
    }
  };

  useEffect(() => {
    // 'auth' instance is now from useMemo
    const unsubscribe = auth.onAuthStateChanged(async (firebaseUser: FirebaseUser | null) => { 
      console.log('Auth state changed. User UID:', firebaseUser?.uid, 'Email Verified:', firebaseUser?.emailVerified);
      if (firebaseUser) {
        await firebaseUser.reload();
        const freshUser = auth.currentUser; // Use the auth instance from useMemo
        setUser(freshUser);
        if (freshUser) {
          await fetchFirestoreUserData(freshUser.uid);
        } else {
          setFirestoreUser(null);
        }
      } else {
        setUser(null);
        setFirestoreUser(null);
      }
      setIsLoading(false);
    });
    return () => unsubscribe();
  }, [auth, db]); // Added auth and db to dependency array

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

    if (phoneAuthConfirmation) {
      console.log('[AuthNavEffect] phoneAuthConfirmation is ACTIVE. INTENTIONALLY SKIPPING further nav logic.');
      return;
    }

    if (isLoading) {
      console.log('[AuthNavEffect] isLoading is TRUE. Returning early.');
      return;
    }

    const currentRoute = segments.join('/') || 'index';
    const isVerifyEmailScreen = currentRoute === '(auth)/verifyEmail';
    const isConfirmEmailScreen = currentRoute === '(auth)/confirmEmailVerification';
    const inAuthGroup = segments.length > 0 && segments[0] === '(auth)';
    const inOnboardingGroup = segments.length > 0 && segments[0] === '(onboarding)';

    if (isFetchingFirestoreUser) {
      console.log('[AuthNavEffect] isFetchingFirestoreUser is TRUE. Returning early for subsequent logic.');
      return;
    }

    let isLandingPageEquivalent = false;
    if (segments.length === 0) isLandingPageEquivalent = true;
    if (segments.length === 1 && segments[0] && ['', 'index'].includes(segments[0])) isLandingPageEquivalent = true;

    console.log(
      '[AuthNavEffect Decision Logic] User:', user?.uid,
      'Email:', user?.email, 'Verified:', user?.emailVerified,
      'OnboardingComplete:', firestoreUser?.onboardingCompleted,
      'CurrentRoute:', currentRoute, 'inAuthGroup:', inAuthGroup, 'inOnboardingGroup:', inOnboardingGroup,
      'isLandingPageEquivalent:', isLandingPageEquivalent
    );

    if (!user) {
      const canBeOnPageWithoutAuth = inAuthGroup || isLandingPageEquivalent || isConfirmEmailScreen || currentRoute === '(auth)/signIn' || currentRoute === '(auth)/signUp' || currentRoute === '(auth)/phoneSignIn' || currentRoute === '(auth)/verifyOtp';
      if (!canBeOnPageWithoutAuth) {
        console.log(`[AuthNavEffect !user] Redirecting to / (landing page). Current route: ${currentRoute}`);
        router.replace('/');
      }
    } else { // User exists
      // 1. Handle Onboarding
      if (firestoreUser && firestoreUser.onboardingCompleted === false) { // Explicitly check for false
        if (!inOnboardingGroup && !inAuthGroup) { // Avoid loop if already in onboarding/auth sections
          console.log('[AuthNavEffect] User exists, Onboarding INCOMPLETE. Redirecting to /onboarding/profileSetup. Current route:', currentRoute);
          router.replace('/(onboarding)/profileSetup');
          return; // Exit after redirect
        }
      } else if (firestoreUser && firestoreUser.onboardingCompleted === true) {
        // 2. Handle Post-Onboarding (User is onboarded)
        // If they are on auth, onboarding, or landing pages, redirect to feed.
        if (inAuthGroup || inOnboardingGroup || isLandingPageEquivalent || isVerifyEmailScreen || isConfirmEmailScreen ) {
          console.log('[AuthNavEffect] User exists, ONBOARDED. Redirecting to /(tabs)/feed. Current route:', currentRoute);
          router.replace('/(tabs)/feed');
          return; // Exit after redirect
        }
      } else if (!firestoreUser && !isFetchingFirestoreUser) {
        // Firestore user data is not available yet, and not actively fetching. This might be an edge case or initial state.
        // Potentially redirect to a safe page or wait. For now, let it pass to email verification if applicable.
        console.log("[AuthNavEffect] User exists, but firestoreUser data is null and not fetching. This might be an intermediate state.");
      }

      // 3. Handle Email Verification (primarily for email-based users, or if email exists)
      // This logic runs if onboarding is complete OR if firestoreUser is null (allowing email verification to be primary for new email users)
      if (user.email && !user.emailVerified) {
        if (!isVerifyEmailScreen && !isConfirmEmailScreen && !inOnboardingGroup && 
            currentRoute !== '(auth)/verifyEmail' && !inAuthGroup // More refined check to avoid loops
           ) {
          console.log(`[AuthNavEffect] User email ${user.email} NOT VERIFIED. Redirecting to /(auth)/verifyEmail. Current route: ${segments.join('/')}`);
          router.replace({ pathname: '/(auth)/verifyEmail', params: { email: user.email } });
          return; // Exit after redirect
        } else if (isVerifyEmailScreen || isConfirmEmailScreen || (inAuthGroup && currentRoute !== '(auth)/verifyEmail')) {
          // If on verifyEmail screen, or confirm screen, or some other auth screen (but not verify itself if already handled)
          console.log(`[AuthNavEffect] User email ${user.email} NOT VERIFIED, but staying on current auth-related page or verification flow: ${currentRoute}`);
        }
      }
    }
  }, [user, firestoreUser, isLoading, isFetchingFirestoreUser, segments, router, phoneAuthConfirmation]);

  const signIn = async (email: string, pass: string) => {
    setIsLoading(true);
    try {
      await auth.signInWithEmailAndPassword(email, pass); // auth from useMemo
      // User state will be updated by onAuthStateChanged
    } catch (error: any) {
      console.error("Sign in error", error);
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
        throw new Error(errorMessage);
      }
    } catch (error: any) {
      console.error("AuthContext: Error during sign up calling handleSignUp cloud function:", error);
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
      const userForEmail = auth.currentUser; // auth from useMemo
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
    setIsLoading(true);
    try {
      const confirmEmailFunction = functions.httpsCallable('confirmEmailVerification'); // functions from useMemo
      const result = await confirmEmailFunction({ uid, token });
      console.log("AuthContext: Custom email verification result:", result.data);
      
      // Reload the user to get the latest emailVerified status
      if (auth.currentUser) { // auth from useMemo
        await auth.currentUser.reload(); // auth from useMemo
        setUser(auth.currentUser); // auth from useMemo
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
    setIsLoading(true);
    try {
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
      
      await auth.signOut(); // auth from useMemo
      setUser(null);
      setFirestoreUser(null);
      setPhoneAuthConfirmation(null);
      // Navigation will be handled by useEffect hook
    } catch (error: any) {
      console.error("Sign out error", error);
      throw new Error(error.message || 'Failed to sign out.');
    } finally {
      setIsLoading(false);
    }
  };

  const signInWithGoogle = async () => {
    setIsLoading(true);
    try {
      await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
      const signInResponse = await GoogleSignin.signIn(); // This is of type SignInResponse

      // Type guard for SignInSuccessResponse
      function isSignInSuccessResponse(response: SignInResponse): response is SignInSuccessResponse {
        // Check if it's the success structure and not the error structure.
        // A success response should have an idToken (string) and a user object.
        // An error response typically has a 'code' property.
        if (!response) return false;

        // Check if it might be an error response (SignInErrorResponse has 'code')
        if (typeof (response as any).code === 'number' || typeof (response as any).code === 'string') {
          // It has a 'code', so it's likely an error response or at least not a clean success response.
          // Ensure 'idToken' and 'user' are not primary indicators if 'code' for error exists.
          return false; 
        }
        
        // If no 'code' indicating an error, check for success properties.
        const successCandidate = response as SignInSuccessResponse;
        return typeof successCandidate.idToken === 'string' && 
               successCandidate.user != null &&
               // Optionally, add a check for a known property on the user object if User type is also problematic
               // typeof successCandidate.user.id === 'string' 
               true; // Assuming if idToken is string and user exists, it's a success.
      }

      if (isSignInSuccessResponse(signInResponse)) {
        // Now TypeScript knows signInResponse is SignInSuccessResponse
        const idToken: string = signInResponse.idToken; 
        const userDetails: LibGoogleSignInUser = signInResponse.user;

        console.log("AuthContext: Google User ID Token acquired.");
        // Accessing properties from LibGoogleSignInUser (User type from the library)
        // These properties (email, name, photo) are defined on the User type in @react-native-google-signin/google-signin
        console.log("AuthContext: Google User Details Email:", userDetails.email);
        console.log("AuthContext: Google User Details Name:", userDetails.name);
        console.log("AuthContext: Google User Details Photo:", userDetails.photo);

        const googleCredential = RNAuth.GoogleAuthProvider.credential(idToken);
        const userCredential = await auth.signInWithCredential(googleCredential);
        const firebaseUser = userCredential.user;
        setUser(firebaseUser);

        if (firebaseUser && functions) {
          const handleGoogleSignIn = functions.httpsCallable('handleGoogleSignIn');
          await handleGoogleSignIn({
            userId: firebaseUser.uid,
            email: userDetails.email,      // Should be valid: LibGoogleSignInUser.email
            displayName: userDetails.name || '', // Should be valid: LibGoogleSignInUser.name
            photoURL: userDetails.photo || null // Should be valid: LibGoogleSignInUser.photo
          });
        }
      } else if (signInResponse && typeof (signInResponse as any).code === 'string' || typeof (signInResponse as any).code === 'number') {
        // This is more likely an error response if 'code' is present
        const googleError = (signInResponse as any).error as { message?: string } | null; // error can be null or an object with message
        const errorCode = (signInResponse as any).code as string | number;

        let errorMessage = "Google Sign-In error";
        if (googleError?.message) {
            errorMessage = `Google Sign-In error: ${googleError.message}`;
        } else if (statusCodes[errorCode as keyof typeof statusCodes]) {
            errorMessage = `Google Sign-In failed: ${statusCodes[errorCode as keyof typeof statusCodes]}`;
        } else {
            errorMessage = `Google Sign-In failed with code: ${errorCode}`;
        }
        console.error("AuthContext: " + errorMessage, signInResponse);
        throw new Error(errorMessage);
      } else {
        console.error("AuthContext: Google Sign-In cancelled or failed with unexpected response structure.", signInResponse);
        throw new Error("Google Sign-In cancelled or failed.");
      }
    } catch (error: any) {
      if (isLoading) setIsLoading(false);
      console.error("Google sign in error caught in outer catch", error);
      let displayMessage = 'An unknown error occurred during Google sign in.';
      const errorCodeString = String(error.code);
      if (error.code === statusCodes.SIGN_IN_CANCELLED || errorCodeString === statusCodes.SIGN_IN_CANCELLED) {
        displayMessage = "Sign in was cancelled.";
      } else if (error.code === statusCodes.IN_PROGRESS || errorCodeString === statusCodes.IN_PROGRESS) {
        displayMessage = "Sign in is already in progress.";
      } else if (error.code === statusCodes.PLAY_SERVICES_NOT_AVAILABLE || errorCodeString === statusCodes.PLAY_SERVICES_NOT_AVAILABLE) {
        displayMessage = "Play services not available or outdated.";
      } else if (error.message) {
        displayMessage = error.message;
      }
      Alert.alert("Google Sign-In Error", displayMessage);
      if (error.code !== statusCodes.SIGN_IN_CANCELLED && errorCodeString !== statusCodes.SIGN_IN_CANCELLED) {
           throw new Error(displayMessage);
      }
    } finally {
        if(isLoading) setIsLoading(false);
    }
  };

  const signInWithPhoneNumber = async (phoneNumber: string): Promise<FirebaseAuthTypes.ConfirmationResult | null> => {
    setIsLoading(true);
    try {
      const confirmation = await auth.signInWithPhoneNumber(phoneNumber);
      setPhoneAuthConfirmation(confirmation);
      console.log("AuthContext: Phone number verification code sent, confirmation object set in context.");
      
      // Schedule navigation to allow state update to propagate
      setTimeout(() => {
        router.replace({ 
          pathname: '/(auth)/verifyOtp',
          params: { phoneNumberSent: phoneNumber }
        });
        console.log(`AuthContext: Navigating (replace) to verifyOtp for ${phoneNumber} (after timeout)`);
      }, 0);
      
      return confirmation;
    } catch (error: any) {
      console.error(`Phone sign in error: ${error.message}`);
      Alert.alert("OTP Send Error", error.message || 'Failed to send OTP. Please try again.');
      throw new Error(error.message || 'Failed to send OTP.');
    } finally {
      // Crucially, ensure isLoading is set to false *after* the timeout might have run
      // or structure so that isLoading doesn't prematurely affect AuthNavEffect before navigation occurs.
      // However, the navigation is now in a timeout, so setIsLoading(false) here is fine.
      setIsLoading(false);
    }
  };

  const confirmPhoneCode = async (phoneNumber: string, code: string) => {
    if (!phoneAuthConfirmation) {
      console.error("AuthContext: phoneAuthConfirmation is null. Cannot confirm code.");
      throw new Error("Verification session expired or not found. Please request a new OTP.");
    }
    
    setIsLoading(true);
    try {
      // 'phoneAuthConfirmation' from useState
      // 'functions' from useMemo
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
      
      setPhoneAuthConfirmation(null);
    } catch (error: any) {
      console.error("AuthContext: Error during confirmPhoneCode", error);
      setIsLoading(false);
      throw error;
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

  return (
    <AuthContext.Provider value={{
      user,
      isLoading,
      firestoreUser,
      app, // Provide the app instance
      auth, // Explicitly type auth
      functions, // Explicitly type functions
      db, // Explicitly type db
      signIn,
      signUp,
      signOut,
      signInWithGoogle,
      signInWithPhoneNumber,
      confirmPhoneCode,
      phoneAuthConfirmation,
      setPhoneAuthConfirmation,
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