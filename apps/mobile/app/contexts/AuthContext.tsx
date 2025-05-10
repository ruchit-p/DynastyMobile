import React, { createContext, useContext, useEffect, useState, ReactNode, useRef } from 'react';
import { auth, functions, db } from '../../src/lib/firebase'; // Added db for Firestore
import { doc } from '@react-native-firebase/firestore'; // Added doc import
import RNAuth, { FirebaseAuthTypes } from '@react-native-firebase/auth'; // Import default for auth providers
import { useRouter, useSegments } from 'expo-router';
import { GoogleSignin, statusCodes, User as GoogleSignInUser, ConfigureParams, HasPlayServicesParams, SignInResponse } from '@react-native-google-signin/google-signin';

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

interface AuthContextType {
  user: FirebaseUser | null;
  isLoading: boolean;
  firestoreUser: { onboardingCompleted?: boolean, firstName?: string, lastName?: string, phoneNumber?: string, bio?: string, connectionsCount?: number, storiesCount?: number, profilePictureUrl?: string, createdAt?: any, [key: string]: any } | null;
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

export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [firestoreUser, setFirestoreUser] = useState<{ onboardingCompleted?: boolean, firstName?: string, lastName?: string, phoneNumber?: string, bio?: string, connectionsCount?: number, storiesCount?: number, profilePictureUrl?: string, createdAt?: any, [key: string]: any } | null>(null);
  const [isFetchingFirestoreUser, setIsFetchingFirestoreUser] = useState(false);
  const router = useRouter();
  const segments = useSegments();
  const [phoneAuthConfirmation, setPhoneAuthConfirmation] = useState<FirebaseAuthTypes.ConfirmationResult | null>(null);

  const fetchFirestoreUserData = async (uid: string) => {
    if (!uid) return null;
    setIsFetchingFirestoreUser(true);
    try {
      const userDocRef = doc(db, 'users', uid);
      const docSnap = await userDocRef.get();
      if (docSnap.exists()) {
        console.log("AuthContext: Fetched Firestore user data:", docSnap.data());
        setFirestoreUser(docSnap.data() as { onboardingCompleted?: boolean });
        return docSnap.data() as { onboardingCompleted?: boolean };
      } else {
        console.log("AuthContext: No Firestore user document found for UID:", uid);
        setFirestoreUser(null); // Or a default state like { onboardingCompleted: false }
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
    const unsubscribe = auth.onAuthStateChanged(async (firebaseUser: FirebaseUser | null) => {
      console.log('Auth state changed. User UID:', firebaseUser?.uid, 'Email Verified:', firebaseUser?.emailVerified);
      if (firebaseUser) {
        await firebaseUser.reload();
        const freshUser = auth.currentUser;
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
  }, []);

  useEffect(() => {
    // If a phone auth confirmation is active, HMGLogNav('Phone auth active, returning early from nav logic') and do not redirect, allow OTP entry
    if (phoneAuthConfirmation) {
      console.log('Auth Nav Logic: Phone auth confirmation is active. INTENTIONALLY SKIPPING further nav logic to allow OTP flow.');
      return;
    }

    if (isLoading || isFetchingFirestoreUser) return; // Wait for both auth and Firestore data

    const currentRoute = segments.join('/') || 'index'; // Treat empty segments as index
    const inAuthGroup = segments[0] === '(auth)';
    const isVerifyEmailScreen = currentRoute === '(auth)/verifyEmail';
    const isConfirmEmailScreen = currentRoute === '(auth)/confirmEmailVerification';
    const inOnboardingGroup = segments[0] === '(onboarding)';
    
    let isLandingPageEquivalent = false;
    if (segments.length <= 0) isLandingPageEquivalent = true; // Absolute root
    if (segments.length === 1 && segments[0] && ['', 'index'].includes(segments[0])) isLandingPageEquivalent = true; // e.g. app/index.tsx
    
    const landingPageRoutes = ['', 'index', '(auth)/signIn', '(auth)/signUp', '(auth)/phoneSignIn'];
    if (landingPageRoutes.includes(currentRoute)) {
        // These are considered okay for an unauthenticated user to be on, so effectively landing pages for unauth user.
        // This doesn't directly set isLandingPageEquivalent = true for all, but influences the condition below.
    }

    console.log(
      'Auth Nav Logic - User:', user?.uid,
      'Email Verified:', user?.emailVerified,
      'OnboardingComplete:', firestoreUser?.onboardingCompleted,
      'Segments:', segments.join('/'),
      'CurrentRoute:', currentRoute,
      'inAuthGroup:', inAuthGroup,
      'isLandingPageEquivalent:', isLandingPageEquivalent,
      'phoneAuthConfirmation:', !!phoneAuthConfirmation
    );

    if (!user) {
      // If nobody is signed-in AND phone auth is NOT active AND we are NOT in (auth) group 
      // AND it's not a page an unauthenticated user should be on (like index or signIn) -> go home
      const canBeOnPageWithoutAuth = inAuthGroup || isLandingPageEquivalent || isConfirmEmailScreen || currentRoute === '(auth)/signIn' || currentRoute === '(auth)/signUp' || currentRoute === '(auth)/phoneSignIn';
      if (!phoneAuthConfirmation && !canBeOnPageWithoutAuth) {
        console.log(`Redirecting to / (landing page) - No user, not in auth flow, not on a public auth page. Current route: ${currentRoute}`);
        router.replace('/');
      }
    } else { // User exists
      if (user.email && !user.emailVerified) { 
        if (!isVerifyEmailScreen && !isConfirmEmailScreen && !inAuthGroup && !inOnboardingGroup) {
          console.log('Redirecting to verifyEmail. User email:', user.email);
          router.replace({ pathname: '/(auth)/verifyEmail', params: { email: user.email } });
        }
      } else { // Email is verified (or no email to verify, e.g. phone-only user)
        if (!firestoreUser?.onboardingCompleted) {
          if (!inOnboardingGroup && !inAuthGroup) { // Don't redirect if already in onboarding or auth
            console.log('Redirecting to onboarding/profileSetup');
            router.replace('/(onboarding)/profileSetup');
          }
        } else { // Onboarding is completed
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
      const userCredential = await auth.signInWithEmailAndPassword(email, pass);
      if (userCredential.user) {
        const handleLoginFn = functions.httpsCallable('handleLogin');
        await handleLoginFn({ email, password: pass });
        console.log('handleLogin cloud function called after email/pass sign-in.');
      }
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
    try {
      const sendEmailFn = functions.httpsCallable('sendVerificationEmail');
      await sendEmailFn({ userId, email, displayName: displayName || email.split('@')[0] });
      console.log('Verification email triggered for:', email);
    } catch (error: any) {
      console.error('Error triggering verification email:', error);
    }
  };

  const signUp = async (newEmail: string, newPass: string) => {
    setIsLoading(true);
    try {
      const handleSignUpFn = functions.httpsCallable('handleSignUp');
      const result: any = await handleSignUpFn({ email: newEmail, password: newPass });
      console.log('handleSignUp cloud function result:', result.data);
      if (!result.data.success) {
        throw new Error(result.data.message || 'Sign up failed via cloud function logic.');
      }
      console.log('User auth created by handleSignUp. onAuthStateChanged will handle next steps.');
    } catch (error: any) {
      console.error("AuthContext signUp error:", error);
      if (error.code && error.message) { throw new Error(error.message); }
      else if (error.message) { throw new Error(error.message); }
      else { throw new Error('An unknown error occurred during sign up.'); }
    } finally {
      setIsLoading(false);
    }
  };

  const resendVerificationEmail = async () => {
    if (!user) throw new Error('No user is signed in to resend verification email.');
    setIsLoading(true);
    try {
      await triggerSendVerificationEmail(user.uid, user.email || '', user.displayName || user.email?.split('@')[0]);
    } catch (error: any) {
      console.error("Resend verification email error:", error);
      if (error.code && error.message) { throw new Error(error.message); }
      throw new Error(error.message || 'Failed to resend verification email.');
    } finally {
      setIsLoading(false);
    }
  };

  const confirmEmailVerificationLink = async (uid: string, token: string) => {
    setIsLoading(true);
    try {
      const verifyEmailFn = functions.httpsCallable('verifyEmail');
      const result: any = await verifyEmailFn({ userId: uid, token });
      if (!result.data.success) {
        throw new Error(result.data.message || 'Email verification failed.');
      }
      if (auth.currentUser && auth.currentUser.uid === uid) {
        await auth.currentUser.reload();
        const freshUser = auth.currentUser;
        setUser(freshUser);
        if (freshUser) {
          await fetchFirestoreUserData(freshUser.uid);
        }
      }
      console.log('Email verified successfully via cloud function.');
    } catch (error: any) {
      console.error("Confirm email verification error:", error);
      if (error.code && error.message) { throw new Error(error.message); }
      throw new Error(error.message || 'Failed to confirm email verification.');
    } finally {
      setIsLoading(false);
    }
  };

  const signOut = async () => {
    setIsLoading(true);
    try {
      // Using type casting to work around the typing issue
      try {
        // Cast to any to bypass TypeScript error
        const isSignedIn = await (GoogleSignin as any).isSignedIn();
        if (isSignedIn) { 
          await GoogleSignin.signOut();
          console.log('Google user signed out');
        }
      } catch (googleError) {
        console.error("Google sign out error:", googleError);
      }
      await auth.signOut();
    } catch (error: any) {
      console.error("Sign out error", error);
      await auth.signOut().catch(e => console.error("Firebase signOut attempt during error handling failed:", e));
    } finally {
      setPhoneAuthConfirmation(null);
      setIsLoading(false);
    }
  };

  const signInWithGoogle = async () => {
    setIsLoading(true);
    try {
      await (GoogleSignin.hasPlayServices as (options?: HasPlayServicesParams) => Promise<boolean>)({ showPlayServicesUpdateDialog: true });
      const googleSignInResult: SignInResponse | {type: string, error?: any} = await GoogleSignin.signIn();
      console.log('AuthContext: Full googleSignInResult from GoogleSignin.signIn():', JSON.stringify(googleSignInResult, null, 2));
      let idToken: string | null = null;
      let googleUserDetails: any = null;

      if ('data' in googleSignInResult && googleSignInResult.data && googleSignInResult.type === 'success') {
        idToken = googleSignInResult.data.idToken;
        googleUserDetails = googleSignInResult.data.user;
      } else if ('error' in googleSignInResult && googleSignInResult.error) {
        const gError = googleSignInResult.error as { message?: string, code?: string };
        throw new Error(gError.message || `Google Sign-In failed with code: ${gError.code}`);
      } else if (googleSignInResult.type === 'cancelled') {
        console.log('AuthContext: Google Sign-In was cancelled by the user.');
        setIsLoading(false);
        return;
      }
      
      console.log('AuthContext: Extracted idToken from googleSignInResult data:', idToken);
      console.log('AuthContext: Extracted googleUserDetails from googleSignInResult data:', JSON.stringify(googleUserDetails, null, 2));

      if (!idToken) {
        console.error('AuthContext: Google Sign-In runtime: idToken is missing. Full googleSignInResult:', JSON.stringify(googleSignInResult, null, 2));
        throw new Error('Google Sign-In failed to get ID token.');
      }

      const googleCredential = RNAuth.GoogleAuthProvider.credential(idToken);
      const userCredential = await auth.signInWithCredential(googleCredential);

      if (userCredential.user) {
        const firebaseUser = userCredential.user;
        const handleGoogleSignInFn = functions.httpsCallable('handleGoogleSignIn');
        await handleGoogleSignInFn({
          userId: firebaseUser.uid,
          email: firebaseUser.email,
          displayName: firebaseUser.displayName || googleUserDetails?.name,
          photoURL: firebaseUser.photoURL || googleUserDetails?.photo,
        });
        console.log('handleGoogleSignIn cloud function called successfully.');
      }
    } catch (error: any) {
      console.error('Google sign-in error:', error);
      if ((error as any).code === statusCodes.SIGN_IN_CANCELLED) { /* User cancelled */ }
      else if ((error as any).code === statusCodes.IN_PROGRESS) { /* Already in progress */ }
      else if ((error as any).code === statusCodes.PLAY_SERVICES_NOT_AVAILABLE) {
        throw new Error('Google Play Services not available. Please update or install them.');
      } else {
        throw error;
      }
    } finally {
      setIsLoading(false);
    }
  };

  const signInWithPhoneNumber = async (phoneNumber: string): Promise<FirebaseAuthTypes.ConfirmationResult | null> => {
    setIsLoading(true);
    console.log(`AuthContext: Initiating phone sign-in for ${phoneNumber}`);
    try {
      const confirmation = await RNAuth().signInWithPhoneNumber(phoneNumber);
      setPhoneAuthConfirmation(confirmation);
      console.log(`AuthContext: OTP Sent to ${phoneNumber}. Confirmation pending.`);
      setIsLoading(false);
      return confirmation;
    } catch (error: any) {
      console.error("AuthContext: Error during signInWithPhoneNumber", error);
      setPhoneAuthConfirmation(null);
      setIsLoading(false);
      throw error;
    }
  };

  const confirmPhoneCode = async (phoneNumber: string, code: string) => {
    setIsLoading(true);
    console.log(`AuthContext: Confirming OTP ${code} for ${phoneNumber}`);
    if (!phoneAuthConfirmation) {
      setIsLoading(false);
      console.error("AuthContext: phoneAuthConfirmation is null. Cannot confirm code.");
      throw new Error("Verification session expired or not found. Please request a new OTP.");
    }

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
      setPhoneAuthConfirmation(null);
    } catch (error: any) {
      console.error("AuthContext: Error during confirmPhoneCode", error);
      setIsLoading(false);
      throw error;
    }
  };

  return (
    <AuthContext.Provider value={{
      user,
      isLoading,
      firestoreUser,
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
      refreshUser
    }}>
      {children}
    </AuthContext.Provider>
  );
}; 