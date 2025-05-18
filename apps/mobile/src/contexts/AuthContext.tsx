import React, { createContext, useContext, useEffect, useState, ReactNode, useMemo, useCallback } from 'react';
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
    if (__DEV__) { // Ensure emulators are only connected in development
      connectToEmulators();
    }
  }, []); // Empty dependency array ensures this runs once on mount

  const fetchFirestoreUserData = useCallback(async (uid: string) => {
    if (!uid) return null;
    setIsFetchingFirestoreUser(true);
    try {
      // 'db' instance is now from useMemo
      const userDocRef = doc(db, 'users', uid); 
      const docSnap = await getDoc(userDocRef); // Updated to use getDoc()
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
  }, [db]); // Added db as dependency
  
  const refreshUser = useCallback(async () => {
    // 'auth' instance is now from useMemo
    if (auth.currentUser) { 
      setIsLoading(true);
      try { // Added try/catch for reload
        await auth.currentUser.reload();
        const freshUser = auth.currentUser;
        setUser(freshUser);
        if (freshUser) {
          await fetchFirestoreUserData(freshUser.uid);
        }
      } catch (error) {
        console.error("AuthContext: Error reloading user:", error);
        // Decide how to handle reload error, maybe sign out user or show message
      } finally {
        setIsLoading(false);
      }
    }
  }, [auth, fetchFirestoreUserData]); // Added dependencies

  useEffect(() => {
    // 'auth' instance is now from useMemo
    const unsubscribe = auth.onAuthStateChanged(async (firebaseUser: FirebaseUser | null) => { 
      console.log('Auth state changed. User UID:', firebaseUser?.uid, 'Email Verified:', firebaseUser?.emailVerified);
      if (firebaseUser) {
        // It's often better to trust the firebaseUser object from the callback first
        // and then reload if necessary, or let refreshUser handle explicit reloads.
        // For now, keeping reload but it's a point of attention.
        try {
            await firebaseUser.reload();
        } catch (reloadError) {
            console.error("Error reloading user during onAuthStateChanged:", reloadError);
            // If reload fails, it might be critical (e.g. user disabled)
            // Consider signing out or handling this state. For now, proceed with potentially stale data or let it fail.
        }
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
  }, [auth, db, fetchFirestoreUserData]); // Added fetchFirestoreUserData

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
    if (segments.length < 1) isLandingPageEquivalent = true;
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
        const targetPath = '/';
        if (currentRoute !== targetPath) {
            console.log(`[AuthNavEffect !user] Redirecting to ${targetPath} (landing page). Current route: ${currentRoute}`);
            router.replace(targetPath);
        }
      }
    } else { // User exists

      // 1. PRIORITIZE EMAIL VERIFICATION
      if (user.email && !user.emailVerified) {
        const targetPath = '/(auth)/verifyEmail';
        // If email is not verified, user MUST go to verification screen
        // unless they are already there or in a related flow (like confirmEmail).
        if (currentRoute !== targetPath && !isConfirmEmailScreen && currentRoute !== '(auth)/signIn' /* Allow signIn if they want to re-auth */) { // Adjusted condition
          console.log(`[AuthNavEffect] User email ${user.email} NOT VERIFIED. Redirecting to ${targetPath}. Current route: ${currentRoute}`);
          router.replace({ pathname: targetPath, params: { email: user.email } });
          return; // Exit after redirect
        } else if (currentRoute === targetPath || isConfirmEmailScreen) {
          console.log(`[AuthNavEffect] User email ${user.email} NOT VERIFIED, but staying on current auth-related page or verification flow: ${currentRoute}`);
          return; 
        }
      } else { 
        // EMAIL IS VERIFIED (or no email to verify, e.g., phone auth only) - Proceed to Onboarding/Feed Logic
        const onboardingTargetPath = '/(onboarding)/profileSetup';
        const feedTargetPath = '/(tabs)/feed';

        // 2. Handle Onboarding (only if email is verified or not applicable)
        if (firestoreUser && firestoreUser.onboardingCompleted === false) { 
          if (currentRoute !== onboardingTargetPath && !inOnboardingGroup && currentRoute !== '(auth)/signIn') { // if not already on an onboarding path and not trying to sign-in (which might reset state)
            console.log('[AuthNavEffect] User email VERIFIED, Onboarding INCOMPLETE. Redirecting to onboarding. Current route:', currentRoute);
            router.replace(onboardingTargetPath);
            return; // Exit after redirect
          }
        } else if (firestoreUser && firestoreUser.onboardingCompleted === true) {
          // 3. Handle Post-Onboarding (User is onboarded AND email verified/not applicable)
          // If they are on auth, onboarding, or landing pages, redirect to feed.
          if (currentRoute !== feedTargetPath && (inAuthGroup || inOnboardingGroup || isLandingPageEquivalent) ) {
            console.log('[AuthNavEffect] User email VERIFIED, ONBOARDED. Redirecting to feed. Current route:', currentRoute);
            router.replace(feedTargetPath);
            return; // Exit after redirect
          }
        } else if (!firestoreUser && !isFetchingFirestoreUser) {
          console.log("[AuthNavEffect] User email VERIFIED (or N/A), but firestoreUser data is null and not fetching...");
          // This case means email is verified (or no email like phone auth), but firestoreUser is null (and not loading).
          // This can happen briefly after signup before firestore doc is created/read, or if user doc is missing.
          // If they are on auth pages (and not trying to sign-in) or landing page, they should be moved towards onboarding as a default next step.
          if ((inAuthGroup || isLandingPageEquivalent) && currentRoute !== '(auth)/signIn') {
             if (currentRoute !== onboardingTargetPath) {
                console.log('[AuthNavEffect] Email verified, firestoreUser null (and not fetching), on auth/landing. Redirecting to onboarding as a likely next step.');
                router.replace(onboardingTargetPath); 
                return;
             }
          }
        }
      }
    }
  }, [user, firestoreUser, isLoading, isFetchingFirestoreUser, segments, router, phoneAuthConfirmation, db]); // Added db as it's used by fetchFirestoreUserData which affects firestoreUser

  const signIn = useCallback(async (email: string, pass: string) => {
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
  }, [auth]);

  const triggerSendVerificationEmail = useCallback(async (userId: string, email: string, displayName: string) => {
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
    }
  }, [functions]);

  const signUp = useCallback(async (newEmail: string, newPass: string) => {
    setIsLoading(true);
    try {
      console.log("AuthContext: Attempting sign-up via 'handleSignUp' cloud function for:", newEmail);
      const handleSignUpFunction = functions.httpsCallable('handleSignUp');
      const result = await handleSignUpFunction({ email: newEmail, password: newPass }) as { data: HandleSignUpResultData };

      if (result.data.success && result.data.userId) {
        console.log('AuthContext: Cloud function handleSignUp successful, User UID:', result.data.userId);
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
  }, [functions]);

  const resendVerificationEmail = useCallback(async () => {
    if (!auth.currentUser) { 
      console.error("Resend Verification: No user found");
      // Using Alert.alert for user feedback
      Alert.alert("Error", "No user found. Please sign in again.");
    } else {
      const userForEmail = auth.currentUser; 
      if (userForEmail && userForEmail.email) {
        await triggerSendVerificationEmail(userForEmail.uid, userForEmail.email, userForEmail.displayName || 'User');
        Alert.alert("Verification Email Sent", "A new verification email has been sent to your address."); // User feedback
      }
    }
  }, [auth, triggerSendVerificationEmail]);

  const confirmEmailVerificationLink = useCallback(async (uid: string, token: string) => {
    setIsLoading(true);
    try {
      // Assuming a cloud function 'confirmEmailVerification' exists
      const confirmFunction = functions.httpsCallable('confirmEmailVerification');
      const result = await confirmFunction({ uid, token });
      console.log("Email verification confirmation result:", result.data);
      await refreshUser(); // Refresh user data to reflect verified status
      Alert.alert("Success", "Email successfully verified!");
    } catch (error: any) {
      console.error("Error confirming email verification link:", error);
      Alert.alert("Error", error.message || "Could not verify email. The link may be invalid or expired.");
    } finally {
      setIsLoading(false);
    }
  }, [functions, refreshUser]); // Added refreshUser

  const signOut = useCallback(async () => {
    console.log("AuthContext: Signing out user...");
    setIsLoading(true);
    try {
      // Optional: Call a backend function if you need to clear tokens or do server-side cleanup
      // const customSignOutFunction = functions.httpsCallable('customSignOut');
      // await customSignOutFunction();

      await auth.signOut();
      // Clear local state immediately after sign out, onAuthStateChanged will also trigger
      setUser(null);
      setFirestoreUser(null);
      setPhoneAuthConfirmation(null); // Clear phone auth confirmation state
      
      // Navigate to a public route, e.g., login or landing page
      // This should ideally be handled by the navigation useEffect, but an explicit redirect here can be a fallback.
      // However, it's better to let the main navigation effect handle this to avoid conflicting navigations.
      // router.replace('/(auth)/signIn'); // Example - but better to let the effect do its job.
      console.log("AuthContext: User signed out successfully.");
    } catch (error: any) {
      console.error("AuthContext: Error signing out:", error);
      Alert.alert("Sign Out Error", error.message || "Could not sign out at this time.");
    } finally {
      setIsLoading(false);
    }
  }, [auth, functions]); // Added functions if customSignOut is used

  const signInWithGoogle = useCallback(async () => {
    setIsLoading(true);
    console.log("AuthContext: Attempting Google Sign-In...");
    try {
      // Check for Play Services
      await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true } as HasPlayServicesParams);
      console.log("AuthContext: Google Play Services available.");

      const signInResult = await GoogleSignin.signIn();
      
      // Using 'as any' temporarily due to persistent linter issues with SignInSuccessResponse type definition.
      // This assumes signInResult on success contains idToken and user.
      const idToken = (signInResult as any).idToken;
      const googleUser = (signInResult as any).user;

      console.log("AuthContext: Google Sign-In successful, received ID token and user info.", { idTokenNotNull: !!idToken, googleUser });

      if (!idToken) {
        throw new Error("Google Sign-In failed: No ID token received.");
      }

      // Create a Google credential with the token
      const googleCredential = RNAuth.GoogleAuthProvider.credential(idToken);
      console.log("AuthContext: Created Google credential for Firebase.");

      // Sign-in the user with the credential
      const firebaseUserCredential = await auth.signInWithCredential(googleCredential);
      console.log("AuthContext: Firebase sign-in with Google credential successful. User UID:", firebaseUserCredential.user?.uid);
      
      // User state will be updated by onAuthStateChanged, which also calls fetchFirestoreUserData
      // If you need to do something specific immediately after Google Sign-In (like checking if new user for custom welcome)
      // you can do it here, but onAuthStateChanged should handle the main user/firestoreUser state updates.

      // Example: Check if this is a new user from Google Sign-In perspective
      const isNewUser = firebaseUserCredential.additionalUserInfo?.isNewUser;
      if (isNewUser) {
        console.log("AuthContext: New user signed up with Google. Firestore document might need to be created or checked by fetchFirestoreUserData.");
        // Additional logic for new Google users if needed, e.g. calling a specific cloud function.
        // The handleSignUp logic usually covers new user document creation for email/pass.
        // For Google/Apple, ensure your backend or onAuthStateChanged + fetchFirestoreUserData correctly provisions new users.
        // This might involve ensuring a 'users/{uid}' document is created with 'onboardingCompleted: false'.
      }

    } catch (error: any) {
      console.error("AuthContext: Google Sign-In Error", error);
      let errorMessage = "Google Sign-In failed.";
      if (error.code === statusCodes.SIGN_IN_CANCELLED) {
        errorMessage = "Google Sign-In was cancelled.";
        // console.log(errorMessage); // Don't throw, user cancelled
      } else if (error.code === statusCodes.IN_PROGRESS) {
        errorMessage = "Google Sign-In is already in progress.";
        Alert.alert("Sign-In In Progress", errorMessage);
      } else if (error.code === statusCodes.PLAY_SERVICES_NOT_AVAILABLE) {
        errorMessage = "Google Play Services not available or outdated.";
        Alert.alert("Play Services Error", errorMessage);
      } else {
        // some other error happened
        if (error.message) {
          errorMessage = error.message;
        }
        Alert.alert("Google Sign-In Error", errorMessage);
      }
      // Don't set isLoading(false) here as onAuthStateChanged will handle it, or if error is final.
      // If the error is not a cancellation, then set loading to false.
      if (error.code !== statusCodes.SIGN_IN_CANCELLED) {
         setIsLoading(false); // Set loading false only if it's a real error not a user cancel
      }
    } 
    // setIsLoading(false) is generally handled by onAuthStateChanged or final error block.
    // If sign-in is successful, onAuthStateChanged will set isLoading false.
    // If it fails before Firebase auth (e.g., Google pop-up error), need to ensure isLoading is reset.
  }, [auth]);

  const signInWithPhoneNumber = useCallback(async (phoneNumber: string): Promise<FirebaseAuthTypes.ConfirmationResult | null> => {
    setIsLoading(true);
    try {
      console.log(`AuthContext: Attempting to sign in with phone number: ${phoneNumber}`);
      const confirmation = await auth.signInWithPhoneNumber(phoneNumber);
      setPhoneAuthConfirmation(confirmation); // Store confirmation for OTP step
      console.log("AuthContext: Phone number verification code sent. Confirmation object stored.");
      Alert.alert("OTP Sent", `An OTP has been sent to ${phoneNumber}.`);
      return confirmation;
    } catch (error: any) {
      console.error("AuthContext: Sign in with phone number error:", error);
      let message = "Could not initiate phone sign-in. Please check the number and try again.";
      if (error.code === 'auth/invalid-phone-number') {
        message = 'Invalid phone number. Please enter a valid number.';
      } else if (error.code === 'auth/too-many-requests') {
        message = 'Too many requests. Please try again later.';
      }
      Alert.alert("Phone Sign-In Error", message);
      setPhoneAuthConfirmation(null);
      setIsLoading(false); // Ensure loading is false on error here
      return null;
    } finally {
      // setIsLoading(false); // isLoading should be managed by OTP confirmation or error.
      // If successful, user is not yet signed in, so isLoading might still be true or handled by subsequent steps.
    }
  }, [auth]);

  const confirmPhoneCode = useCallback(async (phoneNumber: string, code: string) => {
    if (!phoneAuthConfirmation) {
      Alert.alert("Error", "No phone verification in progress or confirmation result is missing.");
      throw new Error("Phone confirmation result is missing.");
    }
    setIsLoading(true);
    try {
      console.log(`AuthContext: Attempting to confirm phone code: ${code} for number: ${phoneNumber}`);
      await phoneAuthConfirmation.confirm(code);
      console.log("AuthContext: Phone number verified and user signed in successfully.");
      // User is now signed in. onAuthStateChanged will handle user state, firestore data, and isLoading.
      setPhoneAuthConfirmation(null); // Clear confirmation state
      // Let onAuthStateChanged handle setIsLoading(false) and navigation
    } catch (error: any) {
      console.error("AuthContext: Confirm phone code error:", error);
      let message = "Could not verify OTP. Please check the code and try again.";
      if (error.code === 'auth/invalid-verification-code') {
        message = 'Invalid OTP. Please enter the correct code.';
      } else if (error.code === 'auth/code-expired') {
        message = 'The OTP has expired. Please request a new one.';
      }
      Alert.alert("OTP Verification Error", message);
      setIsLoading(false); // Set loading false on error here
      throw new Error(message); // Re-throw to indicate failure
    }
  }, [auth, phoneAuthConfirmation]);

  const signInWithApple = useCallback(async () => {
    setIsLoading(true);
    console.log("AuthContext: Attempting Apple Sign-In...");
    try {
      // Apple Sign-In logic here using @react-native-firebase/auth appleprovider
      // This is a placeholder, actual implementation is needed
      // Example structure:
      // const appleAuthRequestResponse = await appleAuth.performRequest(...);
      // const { identityToken } = appleAuthRequestResponse;
      // if (identityToken) {
      //   const appleCredential = auth.AppleAuthProvider.credential(identityToken, rawNonce);
      //   await auth.signInWithCredential(appleCredential);
      // } else {
      //   throw new Error("Apple Sign-In failed: No identity token.");
      // }
      console.warn("AuthContext: signInWithApple is not fully implemented.");
      throw new Error("Apple Sign-In is not implemented yet.");
      // onAuthStateChanged will handle user state updates
    } catch (error: any) {
      console.error("AuthContext: Apple Sign-In Error", error);
      Alert.alert("Apple Sign-In Error", error.message || "Could not sign in with Apple at this time.");
      setIsLoading(false); // Ensure loading is false on error
    }
  }, [auth]);

  const sendPasswordReset = useCallback(async (email: string) => {
    setIsLoading(true);
    try {
      await auth.sendPasswordResetEmail(email);
      Alert.alert("Password Reset", "If your email is registered, you will receive a password reset link shortly.");
    } catch (error: any) {
      console.error("Send password reset error", error);
      Alert.alert("Error", error.message || "Could not send password reset email.");
    } finally {
      setIsLoading(false);
    }
  }, [auth]);

  const value = useMemo(() => ({
    user,
    isLoading,
    firestoreUser,
    app, auth, functions, db,
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
    triggerSendVerificationEmail,
  }), [
    user, isLoading, firestoreUser, app, auth, functions, db,
    signIn, signUp, signOut, signInWithGoogle, signInWithPhoneNumber, confirmPhoneCode,
    phoneAuthConfirmation, resendVerificationEmail, confirmEmailVerificationLink,
    refreshUser, signInWithApple, sendPasswordReset, triggerSendVerificationEmail
  ]);


  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};