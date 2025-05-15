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
import { GoogleSignin, statusCodes, User as GoogleSignInUser, ConfigureParams, HasPlayServicesParams, SignInResponse } from '@react-native-google-signin/google-signin';
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
interface GoogleUserDetails {
  id: string;
  name: string | null;
  email: string | null;
  photo: string | null;
  familyName: string | null;
  givenName: string | null;
}

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
export type GoogleSignInUser = GoogleSignInUser;

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
      phoneAuthConfirmationExists: !!phoneAuthConfirmation,
    };
    console.log('[AuthNavEffect START]', JSON.stringify(routeInfo));

    if (phoneAuthConfirmation) {
      console.log('[AuthNavEffect] phoneAuthConfirmation is ACTIVE. INTENTIONALLY SKIPPING further nav logic.');
      return;
    }

    if (isLoading || isFetchingFirestoreUser) {
      console.log('[AuthNavEffect] isLoading or isFetchingFirestoreUser is TRUE. Returning early.');
      return;
    }

    const currentRoute = segments.join('/') || 'index'; 
    const inAuthGroup = segments[0] === '(auth)';
    const isVerifyEmailScreen = currentRoute === '(auth)/verifyEmail';
    const isConfirmEmailScreen = currentRoute === '(auth)/confirmEmailVerification';
    const inOnboardingGroup = segments[0] === '(onboarding)';
    
    let isLandingPageEquivalent = false;
    if (segments.length <= 0) isLandingPageEquivalent = true; 
    if (segments.length === 1 && segments[0] && ['', 'index'].includes(segments[0])) isLandingPageEquivalent = true; 
    
    const landingPageRoutes = ['', 'index', '(auth)/signIn', '(auth)/signUp', '(auth)/phoneSignIn'];
    if (landingPageRoutes.includes(currentRoute)) {
        // Landing pages
    }

    console.log(
      '[AuthNavEffect Decision Logic] User:', user?.uid,
      'Email Verified:', user?.emailVerified,
      'OnboardingComplete:', firestoreUser?.onboardingCompleted,
      'CurrentRoute:', currentRoute,
      'inAuthGroup:', inAuthGroup,
      'isLandingPageEquivalent:', isLandingPageEquivalent,
      'phoneAuthConfirmation (should be false here):', !!phoneAuthConfirmation
    );

    if (!user) {
      const canBeOnPageWithoutAuth = inAuthGroup || isLandingPageEquivalent || isConfirmEmailScreen || currentRoute === '(auth)/signIn' || currentRoute === '(auth)/signUp' || currentRoute === '(auth)/phoneSignIn' || currentRoute === '(auth)/verifyOtp';
      console.log('[AuthNavEffect !user] canBeOnPageWithoutAuth:', canBeOnPageWithoutAuth, 'CurrentRoute:', currentRoute);
      if (!phoneAuthConfirmation && !canBeOnPageWithoutAuth) {
        console.log(`[AuthNavEffect !user] Redirecting to / (landing page). Current route: ${currentRoute}`);
        router.replace('/');
      }
    } else { 
      if (user.email && !user.emailVerified) { 
        if (!isVerifyEmailScreen && !isConfirmEmailScreen && !inAuthGroup && !inOnboardingGroup) {
          console.log('Redirecting to verifyEmail. User email:', user.email);
          router.replace({ pathname: '/(auth)/verifyEmail', params: { email: user.email } });
        }
      } else { 
        if (!firestoreUser?.onboardingCompleted) {
          if (!inOnboardingGroup && !inAuthGroup) { 
            console.log('Redirecting to onboarding/profileSetup');
            router.replace('/(onboarding)/profileSetup');
          }
        } else { 
          if (inAuthGroup || isLandingPageEquivalent || isVerifyEmailScreen || isConfirmEmailScreen || inOnboardingGroup) {
            console.log('Redirecting to /(tabs)/feed - User verified, onboarded, but on restricted page');
            router.replace('/(tabs)/feed');
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
      console.log(`AuthContext: Calling 'sendVerificationEmail' cloud function for user ${userId}, email ${email}`);
      const sendEmailFunction = functions.httpsCallable('sendVerificationEmail');
      const result = await sendEmailFunction({ userId, email, displayName });
      console.log("AuthContext: 'sendVerificationEmail' cloud function result:", result.data);
    } catch (error) {
      console.error("AuthContext: Error calling 'sendVerificationEmail' cloud function:", error);
      // Don't throw an error that stops the signup flow, but log it.
      // Alert.alert("Verification Email", "Could not send verification email. Please try resending from the verify email page.");
    }
  };

  const signUp = async (newEmail: string, newPass: string) => {
    setIsLoading(true);
    let firebaseUser: FirebaseUser | null = null;
    try {
      console.log("AuthContext: Attempting email/password sign-up for:", newEmail);
      const userCredential = await auth.createUserWithEmailAndPassword(newEmail, newPass); 
      firebaseUser = userCredential.user;
      console.log("AuthContext: User signed up with email/pass, UID:", firebaseUser?.uid);
      setUser(firebaseUser); // Set user immediately for faster UI update
      
      // Trigger verification email via cloud function
      if (firebaseUser) {
        try {
          let nameForEmail = firebaseUser.displayName;
          if (!nameForEmail || nameForEmail.trim() === '') {
            const emailPrefix = newEmail.split('@')[0];
            nameForEmail = emailPrefix || 'User'; // Default to 'User' if prefix is empty
          }
          console.log(`AuthContext: Triggering verification email for ${newEmail} with displayName: ${nameForEmail}`);
          await triggerSendVerificationEmail(firebaseUser.uid, newEmail, nameForEmail);
        } catch (emailError) {
          console.error("AuthContext: Failed to trigger verification email during sign up:", emailError);
        }
      }
      
    } catch (error: any) {
      console.error("Sign up error", error);
      setIsLoading(false); // Set loading to false in case of error
      if (error.code === 'auth/email-already-in-use') {
        throw new Error('This email address is already in use.');
      } else if (error.code && error.message) { 
        throw new Error(error.message); 
      } else if (error.message) { 
        throw new Error(error.message); 
      } else { 
        throw new Error('An unknown error occurred during sign up.'); 
      }
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
        await triggerSendVerificationEmail(userForEmail.uid, userForEmail.email, userForEmail.displayName || undefined);
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
      console.log("AuthContext: Attempting Google Sign-In");
      await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
      console.log("AuthContext: Play Services checked/available.");

      // GoogleSignin.signIn() returns a response object containing the user.
      const signInResponse = await GoogleSignin.signIn();
      console.log("AuthContext: Google Sign-In successful, response received.");

      if (!signInResponse || !signInResponse.idToken) {
        throw new Error("Google Sign-In response missing idToken.");
      }
      if (!signInResponse.user) {
        throw new Error("Google Sign-In response missing user object.");
      }

      const googleAuthUser: GoogleSignInUser = signInResponse.user; // Access the user object
      const idToken = signInResponse.idToken; // idToken is directly on the response

      console.log("AuthContext: Google User ID Token acquired.");

      // Create a Google credential with the token
      const googleCredential = auth.GoogleAuthProvider.credential(idToken);
      console.log("AuthContext: Google credential created.");

      // Sign-in the user with the credential
      const userCredential = await auth.signInWithCredential(googleCredential); // auth from useMemo
      const firebaseUser = userCredential.user;
      console.log("AuthContext: Firebase sign-in with Google credential successful, UID:", firebaseUser?.uid);
      setUser(firebaseUser);

      // Call the backend to handle new user document creation or update if necessary
      if (firebaseUser && functions) { // functions from useMemo
        const handleGoogleSignIn = functions.httpsCallable('handleGoogleSignIn');
        await handleGoogleSignIn({ 
          userId: firebaseUser.uid, 
          email: googleAuthUser.email, 
          displayName: googleAuthUser.name, // Use 'name' for full name
          photoURL: googleAuthUser.photo 
        });
        console.log("AuthContext: handleGoogleSignIn cloud function called.");
      }
      router.replace('/(tabs)/feed');
    } catch (error: any) {
      setIsLoading(false); // Set loading to false in case of error
      console.error("Google sign in error", error);
      if (error.message) { throw new Error(error.message); }
      else { throw new Error('An unknown error occurred during Google sign in.'); }
    }
  };

  const signInWithPhoneNumber = async (phoneNumber: string): Promise<FirebaseAuthTypes.ConfirmationResult | null> => {
    setIsLoading(true);
    try {
      const confirmation = await auth.signInWithPhoneNumber(phoneNumber); // auth from useMemo
      setPhoneAuthConfirmation(confirmation);
      console.log("AuthContext: Phone number verification code sent.");
      return confirmation;
    } catch (error: any) {
      console.error(`Phone sign in error: ${error.message}`);
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