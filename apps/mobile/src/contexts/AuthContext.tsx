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
        console.log(`[AuthNavEffect !user] Redirecting to / (landing page). Current route: ${currentRoute}`);
        router.replace('/');
      }
    } else { // User exists

      // 1. PRIORITIZE EMAIL VERIFICATION
      if (user.email && !user.emailVerified) {
        // If email is not verified, user MUST go to verification screen
        // unless they are already there or in a related flow (like confirmEmail).
        // This also prevents redirection if they are in the onboarding group, as email verification should come first.
        if (!isVerifyEmailScreen && !isConfirmEmailScreen && currentRoute !== '(auth)/verifyEmail' && !inAuthGroup) {
          console.log(`[AuthNavEffect] User email ${user.email} NOT VERIFIED. Redirecting to /(auth)/verifyEmail. Current route: ${currentRoute}`);
          router.replace({ pathname: '/(auth)/verifyEmail', params: { email: user.email } });
          return; // Exit after redirect
        } else if (isVerifyEmailScreen || isConfirmEmailScreen || (inAuthGroup && currentRoute !== '(auth)/verifyEmail')) {
          console.log(`[AuthNavEffect] User email ${user.email} NOT VERIFIED, but staying on current auth-related page or verification flow: ${currentRoute}`);
          // Allow user to stay on verification-related pages or other auth pages if email not verified.
          // No further navigation logic should execute if email is not verified and they are on an appropriate page.
          return; 
        }
        // If in onboarding group but email not verified, they shouldn't be. The above should catch and redirect to verifyEmail.
        // If somehow they are in onboarding with unverified email, the !inAuthGroup above should redirect them.
      } else { 
        // EMAIL IS VERIFIED (or no email to verify, e.g., phone auth only) - Proceed to Onboarding/Feed Logic

        // 2. Handle Onboarding (only if email is verified or not applicable)
        if (firestoreUser && firestoreUser.onboardingCompleted === false) { 
          if (!inOnboardingGroup && !inAuthGroup) { 
            console.log('[AuthNavEffect] User email VERIFIED, Onboarding INCOMPLETE. Redirecting to /onboarding/profileSetup. Current route:', currentRoute);
            router.replace('/(onboarding)/profileSetup');
            return; // Exit after redirect
          }
        } else if (firestoreUser && firestoreUser.onboardingCompleted === true) {
          // 3. Handle Post-Onboarding (User is onboarded AND email verified/not applicable)
          // If they are on auth, onboarding, or landing pages, redirect to feed.
          if (inAuthGroup || inOnboardingGroup || isLandingPageEquivalent ) {
            console.log('[AuthNavEffect] User email VERIFIED, ONBOARDED. Redirecting to /(tabs)/feed. Current route:', currentRoute);
            router.replace('/(tabs)/feed');
            return; // Exit after redirect
          }
        } else if (!firestoreUser && !isFetchingFirestoreUser) {
          console.log("[AuthNavEffect] User email VERIFIED (or N/A), but firestoreUser data is null and not fetching. This might be an intermediate state before onboarding or if no Firestore document exists yet.");
          // If onboarding is truly required next and firestoreUser is null, this state might mean
          // we need to ensure the handleSignUp/handleGoogleSignIn correctly creates a base firestoreUser doc with onboardingCompleted: false
          // For now, if email is verified, allow progression, assuming an onboarding check or firestore sync will handle it.
          // If they are on auth pages at this point (and email is verified), they should be moved.
          if (inAuthGroup || isLandingPageEquivalent) {
            // This is a tricky spot. If email is verified, and firestore user is null (not loading),
            // and they are stuck on an auth page, where should they go?
            // Assuming that if onboarding is next, the firestoreUser.onboardingCompleted === false check should trigger once data loads.
            // If they're here, it means firestoreUser is null.
            // Let's assume they should proceed towards onboarding if applicable, or feed if somehow firestore user is delayed but onboarding is done.
            // This might require the onboarding/profileSetup page to be robust if firestoreUser is still loading.
            console.log('[AuthNavEffect] Email verified, firestoreUser null, on auth/landing. Potential redirect to onboarding if not yet completed, or feed. Holding for now, relying on subsequent firestoreUser updates.');
            // To prevent loops if firestoreUser never loads but onboarding is false:
            // This state needs careful consideration. If they are on (auth)/login, and email is verified, they should not stay.
            // They should at least go to onboarding or feed.
            // A simple redirect to a "default" screen if firestoreUser remains null and onboarding status is unknown might be needed.
            // For now, if they are on auth/landing and email is verified, let's push them towards where onboarding check would happen or feed.
            // This assumes firestoreUser will eventually load. If not, it's a data issue.
            // Let's cautiously redirect to a place where onboarding state would be re-evaluated or is the default start.
            // This could still cause a loop if firestoreUser doesn't load and onboarding is false.
            // A better way: If email verified and on auth/landing, and firestoreUser is null (not loading),
            // perhaps redirect to a loading/default page or trigger a refresh of firestore data.
            // For now, to avoid loops from login to login:
             if (inAuthGroup || isLandingPageEquivalent) {
                console.log('[AuthNavEffect] Email verified, firestoreUser null (and not fetching), on auth/landing. Redirecting to /onboarding/profileSetup as a likely next step or to break loop from auth pages.');
                router.replace('/(onboarding)/profileSetup'); // Or a dedicated loading/transition screen
                return;
             }
          }
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
        const userCredential = await auth.signInWithCredential(googleCredential);
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