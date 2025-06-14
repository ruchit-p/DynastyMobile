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
  OAuthProvider,
  signInWithPopup,
  RecaptchaVerifier,
  signInWithPhoneNumber,
  ConfirmationResult,
  UserCredential,
} from 'firebase/auth';
import { auth, functions, db } from '@/lib/firebase';
import { httpsCallable } from 'firebase/functions';
import { doc, getDoc } from 'firebase/firestore';
import type { InvitedSignupFormData } from "@/lib/validation";
import { useSessionValidation } from '@/hooks/useSessionValidation';
import { checkAccountLockout, recordAuthenticationFailure, extractFirebaseErrorCode } from '@/utils/authUtils';

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
  signInWithApple: () => Promise<boolean>;
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
  getUserProviders: () => string[];
  validateSession: () => Promise<boolean>;
}

const AuthContext = createContext<AuthContextType>({
  currentUser: null,
  firestoreUser: null,
  loading: false,
  signUp: async () => {},
  signIn: async () => {},
  signInWithGoogle: async () => false,
  signInWithApple: async () => false,
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
  getUserProviders: () => [],
  validateSession: async () => false,
});

// MARK: - Helper Functions
const fetchFirestoreUser = async (userId: string): Promise<FirestoreUser | null> => {
  try {
    const userDoc = await getDoc(doc(db, "users", userId));
    if (!userDoc.exists()) {
      // User document not found - this is expected for new users
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
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  } catch (_error) {
    // Error fetching user data - fail silently to avoid exposing sensitive info
    return null;
  }
};



// MARK: - Provider Component
export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [firestoreUser, setFirestoreUser] = useState<FirestoreUser | null>(null);
  const [loading, setLoading] = useState(true);

  // Session validation with caching
  const { validateSession } = useSessionValidation(user, {
    interval: 5 * 60 * 1000, // Validate every 5 minutes
    onInvalidSession: async () => {
      // Force sign out if session is invalid
      await firebaseSignOut(auth);
    },
  });

  const refreshFirestoreUser = async () => {
    if (user?.uid) {
      const userData = await fetchFirestoreUser(user.uid);
      setFirestoreUser(userData);
    }
  };

  useEffect(() => {
    setPersistence(auth, browserLocalPersistence).catch(
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      (_error) => {
        // Error setting persistence - fail silently
      }
    );
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
      // Call signup function directly
      const handleSignUp = httpsCallable<SignUpRequest, SignUpResult>(functions, 'handleSignUp');
      await handleSignUp({
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
      // SECURITY: Check account lockout before attempting sign-in
      const lockoutStatus = await checkAccountLockout(email);
      
      if (lockoutStatus.isLocked) {
        const error = new Error(`Account locked: ${lockoutStatus.message}`);
        error.name = 'AccountLocked';
        throw error;
      }
      
      // Proceed with normal authentication
      await signInWithEmailAndPassword(auth, email, password);
    } catch (error) {
      // Record failed authentication attempt for security monitoring
      if (error instanceof Error) {
        const errorCode = extractFirebaseErrorCode(error);
        
        // Only record certain types of authentication failures
        const recordableErrors = [
          'auth/wrong-password',
          'auth/user-not-found',
          'auth/invalid-credential',
          'auth/invalid-email',
          'auth/user-disabled',
          'auth/too-many-requests'
        ];
        
        if (recordableErrors.includes(errorCode)) {
          // Record the failure asynchronously (don't wait for it)
          recordAuthenticationFailure(email, errorCode).catch(recordError => {
            console.warn('Failed to record authentication failure:', recordError);
          });
        }
      }
      
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
        console.log("🔵 Google sign-in successful for user:", result.user.uid);
        // Google sign-in successful
        const userDoc = await getDoc(doc(db, "users", result.user.uid));
        console.log("🔍 Checking if user document exists:", userDoc.exists());
        
        if (!userDoc.exists()) {
          console.log("🆕 New Google user - creating Firestore document");
          // New Google user - creating Firestore document
          // Handle Google sign-in
          const handleGoogleSignIn = httpsCallable(functions, 'handleGoogleSignIn');
          try {
            console.log("📞 Calling handleGoogleSignIn with data:", {
              userId: result.user.uid,
              email: result.user.email,
              displayName: result.user.displayName || '',
              photoURL: result.user.photoURL || '',
            });
            const response = await handleGoogleSignIn({
              userId: result.user.uid,
              email: result.user.email,
              displayName: result.user.displayName || '',
              photoURL: result.user.photoURL || '',
            });
            console.log("✅ handleGoogleSignIn response:", response);
            isNewUser = true;
            // New Google user document created
          } catch (error) {
            console.error("❌ handleGoogleSignIn failed:", error);
            throw error;
          }
        } else {
          console.log("👤 Existing user document found");
          // Check if this is an existing user who hasn't completed onboarding
          const userData = userDoc.data();
          console.log("📋 User data:", userData);
          if (userData && userData.onboardingCompleted === false) {
            console.log("🔄 Existing Google user but onboarding not completed");
            // Existing Google user but onboarding not completed
            isNewUser = true;
          } else {
            console.log("✨ Existing Google user with completed onboarding");
            // Existing Google user with completed onboarding
          }
        }
      }
      
      return isNewUser;
    } catch (error) {
      // Google sign-in error - re-throw without logging sensitive details
      throw error;
    }
  };

  const signInWithApple = async (): Promise<boolean> => {
    try {
      const provider = new OAuthProvider('apple.com');
      // Add scopes if needed
      provider.addScope('email');
      provider.addScope('name');
      // Set custom parameters
      provider.setCustomParameters({
        locale: 'en'
      });
      
      const result = await signInWithPopup(auth, provider);
      let isNewUser = false;
      
      // If this is the first time the user is signing in with Apple,
      // we need to create a Firestore user document
      if (result.user) {
        console.log("🍎 Apple sign-in successful for user:", result.user.uid);
        // Apple sign-in successful
        const userDoc = await getDoc(doc(db, "users", result.user.uid));
        console.log("🔍 Checking if user document exists:", userDoc.exists());
        
        if (!userDoc.exists()) {
          console.log("🆕 New Apple user - creating Firestore document");
          // New Apple user - creating Firestore document
          // Handle Apple sign-in
          const handleAppleSignIn = httpsCallable(functions, 'handleAppleSignIn');
          try {
            // Extract name information from Apple if available
            // Apple provides this on first sign-in only
            let fullName = null;
            try {
              // Check if we have additional user info from the auth result
              const additionalUserInfo = (result as UserCredential & { additionalUserInfo?: { profile?: { name?: { firstName?: string; lastName?: string } } } }).additionalUserInfo;
              if (additionalUserInfo?.profile?.name) {
                fullName = {
                  givenName: additionalUserInfo.profile.name.firstName || '',
                  familyName: additionalUserInfo.profile.name.lastName || ''
                };
              } else if (result.user.displayName) {
                // Fallback: parse display name if available
                const nameParts = result.user.displayName.split(' ');
                fullName = {
                  givenName: nameParts[0] || '',
                  familyName: nameParts.slice(1).join(' ') || ''
                };
              }
            } catch (error) {
              console.log("Could not extract name from Apple sign-in:", error);
            }
            
            // Only send fields that are expected by the validation schema
            const appleData = {
              userId: result.user.uid,
              email: result.user.email,
              fullName: fullName
            };
            
            console.log("📞 Calling handleAppleSignIn with data:", appleData);
            const response = await handleAppleSignIn(appleData);
            console.log("✅ handleAppleSignIn response:", response);
            isNewUser = true;
            // New Apple user document created
          } catch (error) {
            console.error("❌ handleAppleSignIn failed:", error);
            throw error;
          }
        } else {
          console.log("👤 Existing user document found");
          // Check if this is an existing user who hasn't completed onboarding
          const userData = userDoc.data();
          console.log("📋 User data:", userData);
          if (userData && userData.onboardingCompleted === false) {
            console.log("🔄 Existing Apple user but onboarding not completed");
            // Existing Apple user but onboarding not completed
            isNewUser = true;
          } else {
            console.log("✨ Existing Apple user with completed onboarding");
            // Existing Apple user with completed onboarding
          }
        }
      }
      
      return isNewUser;
    } catch (error) {
      // Apple sign-in error - re-throw without logging sensitive details
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
    // Handle invited signup
    const handleInvitedSignUp = httpsCallable<InvitedSignupFormData, { success: boolean; userId: string; familyTreeId: string }>(
      functions,
      "handleInvitedSignUp"
    );
    const result = await handleInvitedSignUp(data);
    
    // Sign in the user after successful signup and wait for auth state to update
    await signInWithEmailAndPassword(auth, data.email, data.password);
    
    // Return the result so the UI can handle the response
    return result.data;
  };

  const verifyInvitation = async (token: string, invitationId: string) => {
    // Verify invitation (public endpoint)
    const verifyInvitationToken = httpsCallable<
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
    >(functions, "verifyInvitationToken");
    const result = await verifyInvitationToken({ token, invitationId });
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
      // Starting phone sign-in process
      // Auth object initialized
      // Auth app config verified
      
      // Create invisible reCAPTCHA verifier
      if (!window.recaptchaVerifier) {
        // Creating new RecaptchaVerifier
        window.recaptchaVerifier = new RecaptchaVerifier(auth, 'recaptcha-container', {
          'size': 'invisible',
        });
        // RecaptchaVerifier created
      } else {
        // Using existing RecaptchaVerifier
      }

      const appVerifier = window.recaptchaVerifier;
      // Attempting signInWithPhoneNumber
      
      const confirmationResult = await signInWithPhoneNumber(auth, phoneNumber, appVerifier);
      // signInWithPhoneNumber successful
      
      // Store the confirmation result for later use
      window.confirmationResult = confirmationResult;
      
      // Return the verification ID
      return { verificationId: confirmationResult.verificationId };
    } catch (error) {
      // Error sending verification code
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const firebaseError = error as { code?: string; message?: string; customData?: unknown };
      // Phone auth error - re-throw without logging sensitive details
      throw error;
    }
  };

  const getUserProviders = (): string[] => {
    if (!user) return [];
    return user.providerData.map(provider => provider.providerId);
  };

  const confirmPhoneSignIn = async (_verificationId: string, code: string): Promise<boolean> => {
    try {
      console.log("📱 Starting phone sign-in confirmation process");
      
      // Sign in with the verification code
      const result = await window.confirmationResult.confirm(code);
      const user = result.user;
      
      console.log("📱 Phone sign-in successful, calling handlePhoneSignIn function", {
        uid: user.uid,
        phoneNumber: user.phoneNumber
      });
      
      // Initialize phone sign-in
      const handlePhoneSignInFn = httpsCallable(functions, 'handlePhoneSignIn');
      const response = await handlePhoneSignInFn({
        phoneNumber: user.phoneNumber,
        uid: user.uid,
      });
      
      console.log("📱 handlePhoneSignIn response:", response.data);
      
      // Extract data with proper typing
      const responseData = response.data as { 
        success: boolean; 
        message: string; 
        userId: string; 
        isNewUser: boolean 
      };
      
      console.log("📱 Extracted response data:", {
        success: responseData.success,
        isNewUser: responseData.isNewUser,
        userId: responseData.userId
      });
      
      // Add a longer delay to ensure the user document is properly saved to Firestore
      console.log("📱 Waiting for Firestore document to be ready...");
      await new Promise(resolve => setTimeout(resolve, 1500));
      
      console.log("📱 Refreshing Firestore user data...");
      // Refresh the Firestore user data to get the updated phoneNumberVerified status
      await refreshFirestoreUser();
      
      console.log("📱 Firestore user data refreshed, current firestoreUser:", firestoreUser);
      
      // If firestoreUser is still null, try again with a longer delay
      if (!firestoreUser) {
        console.log("📱 firestoreUser is null, retrying after longer delay...");
        await new Promise(resolve => setTimeout(resolve, 2000));
        await refreshFirestoreUser();
        console.log("📱 Second attempt - firestoreUser:", firestoreUser);
      }
      
      // Return whether this is a new user
      console.log("📱 Phone sign-in complete, isNewUser:", responseData.isNewUser);
      
      return responseData.isNewUser || false; // Default to false if undefined
    } catch (error) {
      console.error("📱 Error confirming phone sign-in:", error);
      // Error confirming phone sign-in
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
    signInWithApple,
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
    getUserProviders,
    validateSession,
   };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);