import React, { createContext, useContext, useEffect, useState, ReactNode, useMemo } from 'react';
import { 
  getFirebaseAuth, 
  getFirebaseFunctions, 
  getFirebaseDb,
  connectToEmulators // Import the function to connect to emulators
} from '../lib/firebase'; 
import { doc, FirebaseFirestoreTypes } from '@react-native-firebase/firestore'; // Added doc import and FirebaseFirestoreTypes
import RNAuth, { FirebaseAuthTypes } from '@react-native-firebase/auth'; // Import default for auth providers
import { useRouter, useSegments } from 'expo-router';
import { GoogleSignin, statusCodes, User as GoogleSignInUser, ConfigureParams, HasPlayServicesParams, SignInResponse } from '@react-native-google-signin/google-signin';
import { FirebaseFunctionsTypes } from '@react-native-firebase/functions'; // Added FirebaseFunctionsTypes

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

interface AuthContextType {
  user: FirebaseUser | null;
  isLoading: boolean;
  firestoreUser: FirestoreUserType | null;
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

// Get Firebase services
const auth = useMemo(() => getFirebaseAuth(), []);
const functions = useMemo(() => getFirebaseFunctions(), []);
const db = useMemo(() => getFirebaseDb(), []);

export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
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

  const triggerSendVerificationEmail = async (userId: string, email: string, displayName?: string) => {
    const sendEmailFunction = functions.httpsCallable('sendVerificationEmail'); // functions from useMemo
    try {
      await sendEmailFunction({ userId, email, displayName });
      console.log('Verification email triggered for:', email);
    } catch (error: any) {
      console.error('Error triggering verification email:', error);
    }
  };

  const signUp = async (newEmail: string, newPass: string) => {
    setIsLoading(true);
    let firebaseUser: FirebaseUser | null = null;
    try {
      const userCredential = await auth.createUserWithEmailAndPassword(newEmail, newPass); // auth from useMemo
      firebaseUser = userCredential.user;
      console.log("AuthContext: User signed up with email/pass, UID:", firebaseUser?.uid);
      setUser(firebaseUser); // Set user immediately for faster UI update
      // Trigger verification email via cloud function
      if (firebaseUser) {
        await triggerSendVerificationEmail(firebaseUser.uid, newEmail, firebaseUser.displayName || newEmail.split('@')[0]);
        // Call handleNewUser cloud function
        const handleNewUserFn = functions.httpsCallable('handleNewUser');
        await handleNewUserFn({ 
          uid: firebaseUser.uid, 
          email: newEmail, 
          displayName: firebaseUser.displayName || newEmail.split('@')[0] 
        });
        console.log('handleNewUser cloud function called after sign-up.');
      }
      // No explicit setIsLoading(false) here, onAuthStateChanged will handle it
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
      const isSignedInWithGoogle = await GoogleSignin.isSignedIn();
      if (isSignedInWithGoogle) {
        await GoogleSignin.revokeAccess(); // Recommended for complete sign out
        await GoogleSignin.signOut();
        console.log("AuthContext: Google user signed out");
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
      await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true } as HasPlayServicesParams); // Added type assertion
      const { idToken, user: googleUser } = await GoogleSignin.signIn() as SignInResponse & { user: GoogleSignInUser }; // Ensure 'user' is part of type
      
      if (!idToken) {
        throw new Error('Google Sign-In failed: No ID token received.');
      }
 
      const googleCredential = RNAuth.GoogleAuthProvider.credential(idToken);
      // 'auth' and 'functions' from useMemo
      const userCredential = await auth.signInWithCredential(googleCredential);
      
      const handleGoogleSignInFn = functions.httpsCallable('handleGoogleSignIn');
      await handleGoogleSignInFn({
        uid: userCredential.user.uid,
        email: userCredential.user.email,
        displayName: userCredential.user.displayName,
        photoURL: userCredential.user.photoURL,
        googleFirstName: googleUser.givenName,
        googleLastName: googleUser.familyName,
      });
      console.log('handleGoogleSignIn cloud function called.');
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
      throw new Error("No phone authentication confirmation result found. Please request OTP first.");
    }
    setIsLoading(true);
    try {
      // 'phoneAuthConfirmation' from useState
      // 'functions' from useMemo
      const userCredential = await phoneAuthConfirmation.confirm(code);
      setPhoneAuthConfirmation(null); 
      
      if (userCredential.user) {
        const handlePhoneSignInFn = functions.httpsCallable('handlePhoneSignIn');
        await handlePhoneSignInFn({
            uid: userCredential.user.uid,
            phoneNumber: userCredential.user.phoneNumber,
        });
        console.log('handlePhoneSignIn cloud function called.');
      }
    } catch (error: any) {
      console.error(`Error confirming phone code: ${error.message}`);
      throw new Error(error.message || 'Failed to confirm phone code.');
    } finally {
      setIsLoading(false);
    }
  };
}

// ... rest of the existing code ...