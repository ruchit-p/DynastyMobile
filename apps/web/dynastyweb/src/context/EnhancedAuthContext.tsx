'use client';

import { createContext, useContext, useEffect, useState, useCallback, useMemo } from 'react';
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
  sendPasswordResetEmail,
  GoogleAuthProvider,
  signInWithPopup,
  RecaptchaVerifier,
  signInWithPhoneNumber,
  ConfirmationResult,
  multiFactor,
  PhoneAuthProvider,
  PhoneMultiFactorGenerator,
  TotpMultiFactorGenerator,
  TotpSecret,
  MultiFactorError,
  MultiFactorResolver,
  MultiFactorInfo,
  // MultiFactorSession and ApplicationVerifier removed as they're not used
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
import { useCSRF } from '@/hooks/useCSRF';
import { createCSRFClient } from '@/lib/csrf-client';
import { fingerprintService } from '@/services/FingerprintService';

// MARK: - Interfaces and Types
interface FirebaseError extends Error {
  code?: string;
}

// Add FirebaseError to window interface
declare global {
  interface Window {
    recaptchaVerifier: RecaptchaVerifier;
    confirmationResult: ConfirmationResult;
    mfaRecaptchaVerifier: RecaptchaVerifier;
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

// MARK: - MFA Types
export interface MfaEnrollmentInfo {
  factorId: string;
  displayName: string;
  enrollmentTime: string;
  phoneNumber?: string;
}

export interface TotpSetupInfo {
  secretKey: string;
  qrCodeUrl: string;
  displayName: string;
  totpSecret: TotpSecret;
}

export interface MfaChallenge {
  resolver: MultiFactorResolver;
  selectedFactorId: string;
}

export interface MfaSignInState {
  isRequired: boolean;
  availableFactors: MultiFactorInfo[];
  resolver: MultiFactorResolver | null;
  selectedFactor: MultiFactorInfo | null;
}

export interface AuthContextType {
  currentUser: User | null;
  firestoreUser: FirestoreUser | null;
  loading: boolean;
  csrfToken: string | null;
  isCSRFReady: boolean;
  mfaSignInState: MfaSignInState;
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
  // MFA Methods
  getMfaEnrollmentInfo: () => MfaEnrollmentInfo[];
  setupTotpMfa: (displayName: string) => Promise<TotpSetupInfo>;
  enrollTotpMfa: (totpSecret: TotpSecret, code: string) => Promise<void>;
  setupPhoneMfa: (phoneNumber: string) => Promise<string>;
  enrollPhoneMfa: (verificationId: string, code: string) => Promise<void>;
  unenrollMfa: (factorId: string) => Promise<void>;
  completeMfaSignIn: (factorId: string, code: string) => Promise<void>;
  selectMfaFactor: (factor: MultiFactorInfo) => void;
  resetMfaSignIn: () => void;
}

const AuthContext = createContext<AuthContextType>({
  currentUser: null,
  firestoreUser: null,
  loading: false,
  csrfToken: null,
  isCSRFReady: false,
  mfaSignInState: {
    isRequired: false,
    availableFactors: [],
    resolver: null,
    selectedFactor: null,
  },
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
  // MFA Methods
  getMfaEnrollmentInfo: () => [],
  setupTotpMfa: async () => ({ secretKey: '', qrCodeUrl: '', displayName: '', totpSecret: null as unknown as TotpSecret }),
  enrollTotpMfa: async () => {},
  setupPhoneMfa: async () => '',
  enrollPhoneMfa: async () => {},
  unenrollMfa: async () => {},
  completeMfaSignIn: async () => {},
  selectMfaFactor: () => {},
  resetMfaSignIn: () => {},
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
  
  // MARK: - MFA State Management
  const [mfaSignInState, setMfaSignInState] = useState<MfaSignInState>({
    isRequired: false,
    availableFactors: [],
    resolver: null,
    selectedFactor: null,
  });
  
  // CSRF Protection
  const { csrfToken, isReady: isCSRFReady } = useCSRF(functions);
  const csrfClient = useMemo(
    () => createCSRFClient(functions, () => csrfToken),
    [csrfToken]
  );

  // Initialize services when user logs in
  const initializeUserServices = useCallback(async (userId: string) => {
    try {
      // Set user ID for error tracking
      setUserId(userId);
      
      // Initialize notifications
      await notificationService.initialize(userId);
      
      // Start network monitoring
      networkMonitor.start();
      
      // Initialize fingerprint service and verify device
      await fingerprintService.initialize();
      const trustResult = await fingerprintService.verifyDevice(userId);
      
      console.log('[Auth] Device verification completed:', {
        trustScore: trustResult.device?.trustScore,
        isNewDevice: trustResult.device?.isNewDevice,
        requiresAdditionalAuth: trustResult.requiresAdditionalAuth
      });
      
      // Handle additional auth requirements if needed
      if (trustResult.requiresAdditionalAuth) {
        console.log('[Auth] Device requires additional authentication');
        // You can store this in state or handle additional auth here
      }
      
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
      
      // Clear fingerprint data
      fingerprintService.clearAllData();
      
      console.log('[Auth] User services cleaned up');
    } catch (error) {
      console.error('[Auth] Error cleaning up services:', error);
    }
  }, [setUserId]);

  const refreshFirestoreUser = useCallback(async () => {
    if (user?.uid) {
      const userData = await fetchFirestoreUser(user.uid);
      setFirestoreUser(userData);
    }
  }, [user?.uid]);

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
      // handleSignUp doesn't require CSRF (public endpoint)
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
      // Reset MFA state on successful sign-in
      setMfaSignInState({
        isRequired: false,
        availableFactors: [],
        resolver: null,
        selectedFactor: null,
      });
    } catch (error) {
      // Check if this is an MFA error
      if ((error as MultiFactorError).code === 'auth/multi-factor-auth-required') {
        const mfaError = error as MultiFactorError;
        const resolver = (mfaError as any).resolver;
        
        setMfaSignInState({
          isRequired: true,
          availableFactors: resolver?.hints || [],
          resolver,
          selectedFactor: null,
        });
        
        // Re-throw the error but with a specific MFA message
        throw new Error('Multi-factor authentication required');
      } else {
        const message = handleFirebaseError(error, 'sign-in');
        throw new Error(message);
      }
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
      // Use Firebase Auth's built-in password reset functionality
      await sendPasswordResetEmail(auth, email);
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
      // Use CSRF-protected client for state-changing operation
      await csrfClient.callFunction('sendVerificationEmail', {});
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

  // MARK: - MFA Methods
  
  /**
   * Get enrolled MFA factors for the current user
   */
  const getMfaEnrollmentInfo = useCallback((): MfaEnrollmentInfo[] => {
    if (!user) return [];
    
    return multiFactor(user).enrolledFactors.map(factor => ({
      factorId: factor.uid,
      displayName: factor.displayName || 'Unknown Factor',
      enrollmentTime: factor.enrollmentTime,
      phoneNumber: factor.factorId === 'phone' ? (factor as any).phoneNumber : undefined,
    }));
  }, [user]);

  /**
   * Setup TOTP MFA - generates secret and QR code
   */
  const setupTotpMfa = useCallback(async (displayName: string): Promise<TotpSetupInfo> => {
    if (!user) throw new Error('No user logged in');
    
    try {
      const session = await multiFactor(user).getSession();
      const totpSecret = await TotpMultiFactorGenerator.generateSecret(session);
      
      const qrCodeUrl = totpSecret.generateQrCodeUrl(
        user.email || 'Dynasty User',
        'Dynasty Family App'
      );
      
      return {
        secretKey: totpSecret.secretKey,
        qrCodeUrl,
        displayName,
        totpSecret,
      };
    } catch (error) {
      const message = handleFirebaseError(error, 'setup-totp-mfa');
      throw new Error(message);
    }
  }, [user, handleFirebaseError]);

  /**
   * Enroll TOTP MFA with verification code
   */
  const enrollTotpMfa = useCallback(async (totpSecret: TotpSecret, code: string): Promise<void> => {
    if (!user) throw new Error('No user logged in');
    
    try {
      const credential = TotpMultiFactorGenerator.assertionForEnrollment(totpSecret, code);
      await multiFactor(user).enroll(credential, 'Authenticator App');
    } catch (error) {
      const message = handleFirebaseError(error, 'enroll-totp-mfa');
      throw new Error(message);
    }
  }, [user, handleFirebaseError]);

  /**
   * Setup Phone MFA - sends SMS verification
   */
  const setupPhoneMfa = useCallback(async (phoneNumber: string): Promise<string> => {
    if (!user) throw new Error('No user logged in');
    
    try {
      const session = await multiFactor(user).getSession();
      
      // Create or reuse recaptcha verifier
      if (!window.mfaRecaptchaVerifier) {
        window.mfaRecaptchaVerifier = new RecaptchaVerifier(auth, 'mfa-recaptcha-container', {
          size: 'invisible'
        });
      }
      
      const phoneInfoOptions = {
        phoneNumber,
        session,
      };
      
      const provider = new PhoneAuthProvider(auth);
      const verificationId = await provider.verifyPhoneNumber(
        phoneNumber,
        window.mfaRecaptchaVerifier
      );
      
      return verificationId;
    } catch (error) {
      const message = handleFirebaseError(error, 'setup-phone-mfa');
      throw new Error(message);
    }
  }, [user, handleFirebaseError]);

  /**
   * Enroll Phone MFA with SMS verification code
   */
  const enrollPhoneMfa = useCallback(async (verificationId: string, code: string): Promise<void> => {
    if (!user) throw new Error('No user logged in');
    
    try {
      const phoneAuthCredential = PhoneAuthProvider.credential(verificationId, code);
      const credential = PhoneMultiFactorGenerator.assertion(phoneAuthCredential);
      
      await multiFactor(user).enroll(credential, 'Phone');
    } catch (error) {
      const message = handleFirebaseError(error, 'enroll-phone-mfa');
      throw new Error(message);
    }
  }, [user, handleFirebaseError]);

  /**
   * Unenroll an MFA factor
   */
  const unenrollMfa = useCallback(async (factorId: string): Promise<void> => {
    if (!user) throw new Error('No user logged in');
    
    try {
      const enrolledFactors = multiFactor(user).enrolledFactors;
      const factor = enrolledFactors.find(f => f.uid === factorId);
      
      if (!factor) {
        throw new Error('MFA factor not found');
      }
      
      await multiFactor(user).unenroll(factor);
    } catch (error) {
      const message = handleFirebaseError(error, 'unenroll-mfa');
      throw new Error(message);
    }
  }, [user, handleFirebaseError]);

  /**
   * Complete MFA sign-in with verification code
   */
  const completeMfaSignIn = useCallback(async (factorId: string, code: string): Promise<void> => {
    if (!mfaSignInState.resolver) {
      throw new Error('No MFA resolver available');
    }
    
    try {
      const selectedHint = mfaSignInState.availableFactors.find(factor => factor.uid === factorId);
      if (!selectedHint) {
        throw new Error('Selected MFA factor not found');
      }
      
      let credential;
      
      if (selectedHint.factorId === TotpMultiFactorGenerator.FACTOR_ID) {
        // TOTP credential
        credential = TotpMultiFactorGenerator.assertionForSignIn(selectedHint.uid, code);
      } else if (selectedHint.factorId === PhoneMultiFactorGenerator.FACTOR_ID) {
        // Phone credential - need to verify phone number first
        if (!window.mfaRecaptchaVerifier) {
          window.mfaRecaptchaVerifier = new RecaptchaVerifier(auth, 'mfa-recaptcha-container', {
            size: 'invisible'
          });
        }
        
        const phoneInfoOptions = {
          multiFactorHint: selectedHint,
          session: mfaSignInState.resolver.session,
        };
        
        const provider = new PhoneAuthProvider(auth);
        const verificationId = await provider.verifyPhoneNumber(
          phoneInfoOptions as any,
          window.mfaRecaptchaVerifier
        );
        
        const phoneAuthCredential = PhoneAuthProvider.credential(verificationId, code);
        credential = PhoneMultiFactorGenerator.assertion(phoneAuthCredential);
      } else {
        throw new Error('Unsupported MFA factor type');
      }
      
      await mfaSignInState.resolver.resolveSignIn(credential);
      
      // Reset MFA state on successful sign-in
      setMfaSignInState({
        isRequired: false,
        availableFactors: [],
        resolver: null,
        selectedFactor: null,
      });
    } catch (error) {
      const message = handleFirebaseError(error, 'complete-mfa-sign-in');
      throw new Error(message);
    }
  }, [mfaSignInState, handleFirebaseError]);

  /**
   * Select an MFA factor for sign-in
   */
  const selectMfaFactor = useCallback((factor: MultiFactorInfo): void => {
    setMfaSignInState(prev => ({
      ...prev,
      selectedFactor: factor,
    }));
  }, []);

  /**
   * Reset MFA sign-in state
   */
  const resetMfaSignIn = useCallback((): void => {
    setMfaSignInState({
      isRequired: false,
      availableFactors: [],
      resolver: null,
      selectedFactor: null,
    });
  }, []);

  const value: AuthContextType = {
    currentUser: user,
    firestoreUser,
    loading,
    csrfToken,
    isCSRFReady,
    mfaSignInState,
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
    refreshFirestoreUser,
    // MFA Methods
    getMfaEnrollmentInfo,
    setupTotpMfa,
    enrollTotpMfa,
    setupPhoneMfa,
    enrollPhoneMfa,
    unenrollMfa,
    completeMfaSignIn,
    selectMfaFactor,
    resetMfaSignIn,
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