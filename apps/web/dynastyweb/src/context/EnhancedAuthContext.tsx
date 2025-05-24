'use client';

import { createContext, useContext, useEffect, useState, useCallback } from 'react';
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
import { errorHandler, ErrorSeverity, useErrorHandler } from '@/services/ErrorHandlingService';
import { notificationService } from '@/services/NotificationService';
import { cacheService, cacheKeys } from '@/services/CacheService';
import { syncQueue } from '@/services/SyncQueueService';
import { networkMonitor } from '@/services/NetworkMonitor';

// MARK: - Interfaces and Types
interface FirebaseError extends Error {
  code?: string;
}

// Add FirebaseError to window interface
declare global {
  interface Window {
    recaptchaVerifier: RecaptchaVerifier;
    confirmationResult: ConfirmationResult;
  }
}

// MARK: - Types
export interface FirestoreUser {
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

export interface AuthContextType {
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
    // Try cache first
    const cacheKey = cacheKeys.user(userId);
    const cachedUser = cacheService.get<FirestoreUser>(cacheKey);
    if (cachedUser) {
      return cachedUser;
    }

    // Fetch from Firestore
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
    
    // Cache the user data
    await cacheService.set(cacheKey, userData, { ttl: 5 * 60 * 1000, persist: true });
    
    return userData;
  } catch (error: unknown) {
    // Check if this is an offline error
    const errorMessage = error instanceof Error ? error.message : String(error);
    const firebaseError = error as FirebaseError;
    const errorCode = firebaseError.code;
    
    const isOfflineError = errorMessage.includes('client is offline') || 
                          errorCode === 'unavailable' ||
                          errorMessage.includes('network error');
    
    if (isOfflineError) {
      // For offline errors, try to return cached data if available
      const cacheKey = cacheKeys.user(userId);
      const cachedUser = cacheService.get<FirestoreUser>(cacheKey);
      if (cachedUser) {
        console.log('[Auth] Using cached user data while offline');
        return cachedUser;
      }
      
      // Log offline error with reduced severity and skip console log to reduce noise
      errorHandler.handleError(error, ErrorSeverity.LOW, {
        action: 'fetch-firestore-user-offline',
        userId,
        context: { isOfflineError: true }
      }, true);
    } else {
      // For other errors, use normal error handling
      errorHandler.handleError(error, ErrorSeverity.MEDIUM, {
        action: 'fetch-firestore-user',
        userId
      });
    }
    
    return null;
  }
};

// MARK: - Provider Component
export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [firestoreUser, setFirestoreUser] = useState<FirestoreUser | null>(null);
  const [loading, setLoading] = useState(true);
  const { handleError, handleFirebaseError, setUserId } = useErrorHandler();

  const refreshFirestoreUser = useCallback(async () => {
    if (user?.uid) {
      const userData = await fetchFirestoreUser(user.uid);
      setFirestoreUser(userData);
    }
  }, [user?.uid]);

  // Initialize services when user logs in
  const initializeUserServices = useCallback(async (userId: string) => {
    try {
      // Set user ID for error tracking
      setUserId(userId);
      
      // Initialize notifications
      await notificationService.initialize(userId);
      
      // Start network monitoring
      networkMonitor.start();
      
      console.log('[Auth] User services initialized');
    } catch (error) {
      handleError(error, ErrorSeverity.LOW, {
        action: 'initialize-user-services',
        userId
      });
    }
  }, [setUserId, handleError]);

  // Cleanup services when user logs out
  const cleanupUserServices = useCallback(async () => {
    try {
      // Clear user ID
      setUserId(null);
      
      // Cleanup notifications
      await notificationService.cleanup();
      
      // Clear cache
      cacheService.clear();
      
      // Clear sync queue for user
      await syncQueue.clearQueue();
      
      console.log('[Auth] User services cleaned up');
    } catch (error) {
      console.error('[Auth] Error cleaning up services:', error);
    }
  }, [setUserId]);

  useEffect(() => {
    setPersistence(auth, browserLocalPersistence).catch((error) => {
      handleError(error, ErrorSeverity.LOW, {
        action: 'set-auth-persistence'
      });
    });

    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser);
      
      if (currentUser) {
        const userData = await fetchFirestoreUser(currentUser.uid);
        setFirestoreUser(userData);
        
        // Initialize services for logged-in user
        await initializeUserServices(currentUser.uid);
      } else {
        setFirestoreUser(null);
        
        // Cleanup services
        await cleanupUserServices();
      }
      
      setLoading(false);
    });

    return () => unsubscribe();
  }, [initializeUserServices, cleanupUserServices, handleError]);

  const signUp = async (email: string, password: string): Promise<void> => {
    try {
      const handleSignUp = httpsCallable<SignUpRequest, SignUpResult>(functions, 'handleSignUp');
      await handleSignUp({ email, password });

      // Sign in the user after successful signup
      await signInWithEmailAndPassword(auth, email, password);
    } catch (error) {
      const message = handleFirebaseError(error, 'sign-up');
      throw new Error(message);
    }
  };

  const signIn = async (email: string, password: string) => {
    try {
      await signInWithEmailAndPassword(auth, email, password);
    } catch (error) {
      const message = handleFirebaseError(error, 'sign-in');
      throw new Error(message);
    }
  };

  const signInWithGoogle = async (): Promise<boolean> => {
    try {
      const provider = new GoogleAuthProvider();
      provider.addScope('profile');
      provider.addScope('email');
      provider.setCustomParameters({
        prompt: 'select_account'
      });
      
      const result = await signInWithPopup(auth, provider);
      let isNewUser = false;
      
      if (result.user) {
        console.log("Google sign-in successful for user:", result.user.uid);
        const userDoc = await getDoc(doc(db, "users", result.user.uid));
        
        if (!userDoc.exists()) {
          console.log("This is a new Google user, creating Firestore document");
          isNewUser = true;
          
          const createGoogleUser = httpsCallable(functions, 'createGoogleUser');
          await createGoogleUser({
            uid: result.user.uid,
            email: result.user.email,
            displayName: result.user.displayName || '',
            photoURL: result.user.photoURL || null
          });
        }
      }
      
      return isNewUser;
    } catch (error) {
      const message = handleFirebaseError(error, 'google-sign-in');
      throw new Error(message);
    }
  };

  const signInWithPhone = async (phoneNumber: string): Promise<{ verificationId: string }> => {
    try {
      if (!window.recaptchaVerifier) {
        window.recaptchaVerifier = new RecaptchaVerifier(auth, 'recaptcha-container', {
          size: 'invisible'
        });
      }

      const confirmationResult = await signInWithPhoneNumber(auth, phoneNumber, window.recaptchaVerifier);
      window.confirmationResult = confirmationResult;
      
      return { verificationId: confirmationResult.verificationId };
    } catch (error) {
      const message = handleFirebaseError(error, 'phone-sign-in');
      throw new Error(message);
    }
  };

  const confirmPhoneSignIn = async (verificationId: string, code: string): Promise<boolean> => {
    try {
      if (!window.confirmationResult) {
        throw new Error('No confirmation result found');
      }

      const result = await window.confirmationResult.confirm(code);
      const userDoc = await getDoc(doc(db, "users", result.user.uid));
      
      return !userDoc.exists(); // Return true if new user
    } catch (error) {
      const message = handleFirebaseError(error, 'confirm-phone-sign-in');
      throw new Error(message);
    }
  };

  const signOut = async () => {
    try {
      await cleanupUserServices();
      await firebaseSignOut(auth);
    } catch (error) {
      const message = handleFirebaseError(error, 'sign-out');
      throw new Error(message);
    }
  };

  const resetPassword = async (email: string) => {
    try {
      const sendPasswordResetEmail = httpsCallable(functions, 'sendPasswordResetEmail');
      await sendPasswordResetEmail({ email });
    } catch (error) {
      const message = handleFirebaseError(error, 'reset-password');
      throw new Error(message);
    }
  };

  const updateEmail = async (email: string) => {
    if (!user) throw new Error('No user logged in');
    
    try {
      await firebaseUpdateEmail(user, email);
      
      // Invalidate user cache
      cacheService.invalidate(cacheKeys.user(user.uid));
      await refreshFirestoreUser();
    } catch (error) {
      const message = handleFirebaseError(error, 'update-email');
      throw new Error(message);
    }
  };

  const updatePassword = async (password: string) => {
    if (!user) throw new Error('No user logged in');
    
    try {
      await firebaseUpdatePassword(user, password);
    } catch (error) {
      const message = handleFirebaseError(error, 'update-password');
      throw new Error(message);
    }
  };

  const updateUserProfile = async (displayName: string) => {
    if (!user) throw new Error('No user logged in');
    
    try {
      await updateProfile(user, { displayName });
      
      // Invalidate user cache
      cacheService.invalidate(cacheKeys.user(user.uid));
      await refreshFirestoreUser();
    } catch (error) {
      const message = handleFirebaseError(error, 'update-profile');
      throw new Error(message);
    }
  };

  const sendVerificationEmail = async () => {
    try {
      const sendEmail = httpsCallable(functions, 'sendVerificationEmail');
      await sendEmail();
    } catch (error) {
      const message = handleFirebaseError(error, 'send-verification-email');
      throw new Error(message);
    }
  };

  const signUpWithInvitation = async (data: InvitedSignupFormData) => {
    try {
      const signUp = httpsCallable(functions, 'signUpWithInvitation');
      const result = await signUp(data);
      const response = result.data as { success: boolean; userId: string; familyTreeId: string };
      
      return {
        success: response.success,
        userId: response.userId,
        familyTreeId: response.familyTreeId
      };
    } catch (error) {
      const message = handleFirebaseError(error, 'sign-up-with-invitation');
      throw new Error(message);
    }
  };

  const verifyInvitation = async (token: string, invitationId: string) => {
    try {
      const verify = httpsCallable(functions, 'verifyInvitation');
      const result = await verify({ token, invitationId });
      return result.data as {
        prefillData: {
          firstName: string;
          lastName: string;
          dateOfBirth?: Date;
          gender?: string;
          phoneNumber?: string;
          relationship?: string;
        };
        inviteeEmail: string;
      };
    } catch (error) {
      const message = handleFirebaseError(error, 'verify-invitation');
      throw new Error(message);
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
    signOut,
    resetPassword,
    updateEmail,
    updatePassword,
    updateUserProfile,
    sendVerificationEmail,
    signUpWithInvitation,
    verifyInvitation,
    refreshFirestoreUser
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};