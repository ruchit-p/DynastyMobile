'use client';

import { createContext, useContext, useEffect, useState } from 'react';
import {
  User,
  signInWithEmailAndPassword,
  signOut as firebaseSignOut,
  onAuthStateChanged,
  updateProfile,
  setPersistence,
  browserLocalPersistence,
  updateEmail as firebaseUpdateEmail,
  updatePassword as firebaseUpdatePassword,
  GoogleAuthProvider,
  signInWithPopup,
  RecaptchaVerifier,
  signInWithPhoneNumber,
  ConfirmationResult,
} from 'firebase/auth';
import { auth, functions, db } from '@/lib/firebase';
import { httpsCallable } from 'firebase/functions';
import { doc, getDoc } from 'firebase/firestore';
import type { InvitedSignupFormData } from "@/lib/validation";
import { useCSRF } from '@/hooks/useCSRF';
import { createCSRFClient } from '@/lib/csrf-client';

// Add global type declarations for window properties
declare global {
  interface Window {
    recaptchaVerifier: RecaptchaVerifier;
    confirmationResult: ConfirmationResult;
  }
}

// MARK: - Types
interface FirestoreUser {
  id: string;
  displayName: string;
  email: string;
  dateOfBirth: Date;
  firstName: string;
  lastName: string;
  phoneNumber: string | null;
  phoneNumberVerified?: boolean;
  parentIds: string[];
  childrenIds: string[];
  spouseIds: string[];
  isAdmin: boolean;
  canAddMembers: boolean;
  canEdit: boolean;
  isPendingSignUp: boolean;
  createdAt: Date;
  updatedAt: Date;
  gender: string;
  familyTreeId?: string;
  historyBookId?: string;
  emailVerified?: boolean;
  dataRetentionPeriod: "forever" | "year" | "month" | "week";
  profilePicture?: string;
}

interface SignUpRequest {
  email: string;
  password: string
}

interface SignUpResult {
  success: boolean;
  userId: string;
  familyTreeId: string;
  historyBookId: string;
}

interface AuthContextType {
  currentUser: User | null;
  firestoreUser: FirestoreUser | null;
  loading: boolean;
  signUp: (email: string, password: string) => Promise<void>;
  signIn: (email: string, password: string) => Promise<void>;
  signInWithGoogle: () => Promise<boolean>;
  signInWithPhone: (phoneNumber: string) => Promise<{ verificationId: string }>;
  confirmPhoneSignIn: (verificationId: string, code: string) => Promise<boolean>;
  signOut: () => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
  updateEmail: (email: string) => Promise<void>;
  updatePassword: (password: string) => Promise<void>;
  sendVerificationEmail: () => Promise<void>;
  signUpWithInvitation: (data: InvitedSignupFormData) => Promise<{ success: boolean; userId: string; familyTreeId: string }>;
  verifyInvitation: (token: string, invitationId: string) => Promise<{
    prefillData: {
      firstName: string;
      lastName: string;
      dateOfBirth?: Date;
      gender?: string;
      phoneNumber?: string;
      relationship?: string;
    };
    inviteeEmail: string;
  }>;
  refreshFirestoreUser: () => Promise<void>;
  updateUserProfile: (displayName: string) => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  currentUser: null,
  firestoreUser: null,
  loading: false,
  signUp: async () => {},
  signIn: async () => {},
  signInWithGoogle: async () => false,
  signInWithPhone: async () => ({ verificationId: '' }),
  confirmPhoneSignIn: async () => false,
  signOut: async () => {},
  resetPassword: async () => {},
  updateEmail: async () => {},
  updatePassword: async () => {},
  updateUserProfile: async () => {},
  sendVerificationEmail: async () => {},
  signUpWithInvitation: async () => ({ success: false, userId: '', familyTreeId: '' }),
  verifyInvitation: async () => ({
    prefillData: {
      firstName: '',
      lastName: '',
    },
    inviteeEmail: '',
  }),
  refreshFirestoreUser: async () => {},
});

// MARK: - Helper Functions
const fetchFirestoreUser = async (userId: string): Promise<FirestoreUser | null> => {
  try {
    const userDoc = await getDoc(doc(db, "users", userId));
    if (!userDoc.exists()) {
      console.warn(`[Auth] No Firestore document found for user ${userId}`);
      return null;
    }
    
    const userData = userDoc.data() as FirestoreUser;
    
    // Ensure profile picture URL has the alt=media parameter if it's a Firebase Storage URL
    if (userData.profilePicture) {
      // Add cache-busting parameter for Firebase Storage URLs
      let pictureUrl = userData.profilePicture;
      if (
        (pictureUrl.includes('firebasestorage.googleapis.com') || 
         pictureUrl.includes('dynasty-eba63.firebasestorage.app'))
      ) {
        // Add alt=media parameter if it doesn't exist
        if (!pictureUrl.includes('alt=media')) {
          pictureUrl = pictureUrl.includes('?') 
            ? `${pictureUrl}&alt=media` 
            : `${pictureUrl}?alt=media`;
        }
        
        // Add cache-busting parameter
        const cacheBuster = `&_cb=${Date.now()}`;
        userData.profilePicture = pictureUrl.includes('?') 
          ? `${pictureUrl}${cacheBuster}` 
          : `${pictureUrl}?${cacheBuster.substring(1)}`;
      }
    }
    
    return userData;
  } catch (error) {
    console.error("[Auth] Error fetching Firestore user:", error);
    return null;
  }
};



// MARK: - Provider Component
export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [firestoreUser, setFirestoreUser] = useState<FirestoreUser | null>(null);
  const [loading, setLoading] = useState(true);
  
  // Initialize CSRF protection
  const { csrfToken, isReady: csrfReady } = useCSRF(functions);
  const csrfClient = createCSRFClient(functions, () => csrfToken);

  const refreshFirestoreUser = async () => {
    if (user?.uid) {
      const userData = await fetchFirestoreUser(user.uid);
      setFirestoreUser(userData);
    }
  };

  useEffect(() => {
    setPersistence(auth, browserLocalPersistence).catch((error) => {
      console.error("[Auth] Error setting persistence:", error);
    });
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser);
      if (currentUser) {
        const userData = await fetchFirestoreUser(currentUser.uid);
        setFirestoreUser(userData);
      } else {
        setFirestoreUser(null);
      }
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  const signUp = async (
    email: string,
    password: string,
  ): Promise<void> => {
    try {
      // Wait for CSRF token to be ready
      if (!csrfReady) {
        throw new Error('Authentication system is initializing. Please try again in a moment.');
      }
      
      // Use CSRF-protected client for signup
      await csrfClient.callFunction<SignUpRequest, SignUpResult>('handleSignUp', {
        email,
        password,
      });

      // Sign in the user after successful signup
      await signInWithEmailAndPassword(auth, email, password);
    } catch (error) {
      throw error;
    }
  };

  const signIn = async (email: string, password: string) => {
    try {
      await signInWithEmailAndPassword(auth, email, password);
    } catch (error) {
      throw error;
    }
  };

  const signInWithGoogle = async (): Promise<boolean> => {
    try {
      const provider = new GoogleAuthProvider();
      // Add scopes if needed
      provider.addScope('profile');
      provider.addScope('email');
      // Set custom parameters
      provider.setCustomParameters({
        prompt: 'select_account'
      });
      
      const result = await signInWithPopup(auth, provider);
      let isNewUser = false;
      
      // If this is the first time the user is signing in with Google,
      // we need to create a Firestore user document
      if (result.user) {
        console.log("Google sign-in successful for user:", result.user.uid);
        const userDoc = await getDoc(doc(db, "users", result.user.uid));
        
        if (!userDoc.exists()) {
          console.log("This is a new Google user, creating Firestore document");
          // Wait for CSRF token to be ready
          if (!csrfReady) {
            throw new Error('Authentication system is initializing. Please try again in a moment.');
          }
          // Create a new user document in Firestore using CSRF-protected client
          await csrfClient.callFunction('handleGoogleSignIn', {
            userId: result.user.uid,
            email: result.user.email,
            displayName: result.user.displayName || '',
            photoURL: result.user.photoURL || '',
          });
          isNewUser = true;
          console.log("New Google user document created, isNewUser =", isNewUser);
        } else {
          // Check if this is an existing user who hasn't completed onboarding
          const userData = userDoc.data();
          if (userData && userData.onboardingCompleted === false) {
            console.log("Existing Google user but onboarding not completed");
            isNewUser = true;
          } else {
            console.log("Existing Google user with completed onboarding");
          }
        }
      }
      
      return isNewUser;
    } catch (error) {
      console.error("Error in Google sign-in:", error);
      throw error;
    }
  };

  const logout = async () => {
    try {
      await firebaseSignOut(auth);
    } catch (error) {
      throw error;
    }
  };

  const resetPassword = async (email: string) => {
    try {
      const initiatePasswordReset = httpsCallable(functions, 'initiatePasswordReset');
      await initiatePasswordReset({ email });
    } catch (error) {
      throw error;
    }
  };

  const updateUserProfile = async (displayName: string) => {
    try {
      if (auth.currentUser) {
        await updateProfile(auth.currentUser, { displayName });
      }
    } catch (error) {
      throw error;
    }
  };

  const sendVerificationEmail = async () => {
    try {
      if (auth.currentUser) {
        const handleVerificationEmail = httpsCallable(functions, 'sendVerificationEmail');
        await handleVerificationEmail({
          userId: auth.currentUser.uid,
          email: auth.currentUser.email!,
          displayName: auth.currentUser.displayName || 'User'
        });
      } else {
        throw new Error('No user is currently signed in');
      }
    } catch (error) {
      throw error;
    }
  };

  const signUpWithInvitation = async (data: InvitedSignupFormData) => {
    // Wait for CSRF token to be ready
    if (!csrfReady) {
      throw new Error('Authentication system is initializing. Please try again in a moment.');
    }
    // Use CSRF-protected client for invited signup
    const result = await csrfClient.callFunction<InvitedSignupFormData, { success: boolean; userId: string; familyTreeId: string }>(
      "handleInvitedSignUp",
      data
    );
    
    // Sign in the user after successful signup and wait for auth state to update
    await signInWithEmailAndPassword(auth, data.email, data.password);
    
    // Return the result so the UI can handle the response
    return result.data;
  };

  const verifyInvitation = async (token: string, invitationId: string) => {
    // Use CSRF-protected client for invitation verification
    const result = await csrfClient.callFunction<
      { token: string; invitationId: string },
      {
        prefillData: {
          firstName: string;
          lastName: string;
          dateOfBirth?: Date;
          gender?: string;
          phoneNumber?: string;
          relationship?: string;
        };
        inviteeEmail: string;
      }
    >("verifyInvitationToken", { token, invitationId });
    return result.data;
  };

  const updateEmail = async (email: string) => {
    try {
      if (auth.currentUser) {
        await firebaseUpdateEmail(auth.currentUser, email);
      }
    } catch (error) {
      throw error;
    }
  };

  const updatePassword = async (password: string) => {
    try {
      if (auth.currentUser) { 
        await firebaseUpdatePassword(auth.currentUser, password);
      }
    } catch (error) {
      throw error;
    }
  };

  // Phone authentication functions
  const signInWithPhone = async (phoneNumber: string): Promise<{ verificationId: string }> => {
    try {
      // Create invisible reCAPTCHA verifier
      if (!window.recaptchaVerifier) {
        window.recaptchaVerifier = new RecaptchaVerifier(auth, 'recaptcha-container', {
          'size': 'invisible',
        });
      }

      const appVerifier = window.recaptchaVerifier;
      const confirmationResult = await signInWithPhoneNumber(auth, phoneNumber, appVerifier);
      
      // Store the confirmation result for later use
      window.confirmationResult = confirmationResult;
      
      // Return the verification ID
      return { verificationId: confirmationResult.verificationId };
    } catch (error) {
      console.error("Error sending verification code:", error);
      throw error;
    }
  };

  const confirmPhoneSignIn = async (verificationId: string, code: string): Promise<boolean> => {
    try {
      // Sign in with the verification code
      const result = await window.confirmationResult.confirm(code);
      const user = result.user;
      
      // Wait for CSRF token to be ready
      if (!csrfReady) {
        throw new Error('Authentication system is initializing. Please try again in a moment.');
      }
      // Call the Firebase function to handle phone sign-in with CSRF protection
      const response = await csrfClient.callFunction('handlePhoneSignIn', {
        phoneNumber: user.phoneNumber,
        uid: user.uid,
      });
      
      // Refresh the Firestore user data
      await refreshFirestoreUser();
      
      // Return whether this is a new user
      const responseData = response.data as { isNewUser: boolean };
      return responseData.isNewUser;
    } catch (error) {
      console.error("Error confirming phone sign-in:", error);
      throw error;
    }
  };

  const value: AuthContextType = {
    currentUser: user,
    firestoreUser,
    loading,
    signUp,
    signIn,
    signInWithGoogle,
    signInWithPhone,
    confirmPhoneSignIn,
    signOut: logout,
    resetPassword,
    updateEmail,
    updatePassword,
    updateUserProfile,
    sendVerificationEmail,
    signUpWithInvitation,
    verifyInvitation,
    refreshFirestoreUser,
   };

  return (
    <AuthContext.Provider value={value}>
      {!loading && children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);