import React from 'react';
import { renderHook, act, waitFor } from '@testing-library/react-native';
import { Alert } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { AuthProvider, useAuth } from '../../src/contexts/AuthContext';

// Import mocked Firebase modules
const auth = jest.requireMock('@react-native-firebase/auth').default;
const firestore = jest.requireMock('@react-native-firebase/firestore').default;
const functions = jest.requireMock('@react-native-firebase/functions').default;

// Import mocked GoogleSignin
const { GoogleSignin } = jest.requireMock('@react-native-google-signin/google-signin');

// Mock expo-router
const mockPush = jest.fn();
const mockReplace = jest.fn();
const mockBack = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({
    push: mockPush,
    replace: mockReplace,
    back: mockBack,
  }),
  useSegments: () => [],
}));

// Mock firebase modules
jest.mock('../../src/lib/firebase', () => ({
  getFirebaseApp: jest.fn(() => ({})),
  getFirebaseAuth: jest.fn(() => jest.requireMock('@react-native-firebase/auth').default()),
  getFirebaseFunctions: jest.fn(() => jest.requireMock('@react-native-firebase/functions').default()),
  getFirebaseDb: jest.fn(() => jest.requireMock('@react-native-firebase/firestore').default()),
  connectToEmulators: jest.fn(),
}));

// Import errorHandler to manually mock it
const { errorHandler } = jest.requireMock('../../src/lib/ErrorHandlingService');

// Google Sign-In is already mocked in jest.setup.js

// Mock services
jest.mock('../../src/lib/syncService', () => ({
  syncService: {
    initialize: jest.fn(),
    syncUserData: jest.fn(),
    forceSync: jest.fn(),
    cleanup: jest.fn(),
  },
}));

jest.mock('../../src/services/NetworkService', () => ({
  networkService: {
    initialize: jest.fn(() => Promise.resolve()),
    isOnline: jest.fn(() => true),
    addEventListener: jest.fn(),
  },
}));

jest.mock('../../src/services/NotificationService', () => ({
  getNotificationService: jest.fn(() => ({
    initialize: jest.fn(() => Promise.resolve()),
    updateFCMToken: jest.fn(),
    cleanup: jest.fn(),
  })),
}));

// Mock ErrorHandlingService
jest.mock('../../src/lib/ErrorHandlingService', () => ({
  errorHandler: {
    handleError: jest.fn(),
  },
  ErrorSeverity: {
    INFO: 'info',
    WARNING: 'warning',
    ERROR: 'error',
    FATAL: 'fatal',
  },
}));

// Helper to create a mock Firebase user with all required methods
const createMockFirebaseUser = (overrides = {}) => ({
  uid: 'test-uid',
  email: 'test@example.com',
  emailVerified: true,
  displayName: 'Test User',
  phoneNumber: null,
  photoURL: null,
  reload: jest.fn(() => Promise.resolve()),
  sendEmailVerification: jest.fn(() => Promise.resolve()),
  ...overrides,
});

// Helper to render hook with provider
const renderAuthHook = () => {
  return renderHook(() => useAuth(), {
    wrapper: ({ children }) => <AuthProvider>{children}</AuthProvider>,
  });
};

describe('AuthContext', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Reset AsyncStorage
    (AsyncStorage.getItem as jest.Mock).mockResolvedValue(null);
    (AsyncStorage.setItem as jest.Mock).mockResolvedValue(undefined);
    (AsyncStorage.removeItem as jest.Mock).mockResolvedValue(undefined);
  });

  describe('Initialization', () => {
    it('initializes with null user and loading state', async () => {
      const { result } = renderAuthHook();

      expect(result.current.user).toBeNull();
      expect(result.current.isLoading).toBe(true);
      expect(result.current.firestoreUser).toBeNull();
    });

    it('sets up auth state listener on mount', async () => {
      const mockUnsubscribe = jest.fn();
      (auth().onAuthStateChanged as jest.Mock).mockReturnValue(mockUnsubscribe);

      renderAuthHook();

      await waitFor(() => {
        expect(auth().onAuthStateChanged).toHaveBeenCalled();
      });
    });

    it('initializes Firebase services', async () => {
      const { result } = renderAuthHook();

      await waitFor(() => {
        expect(result.current.auth).toBeDefined();
        expect(result.current.functions).toBeDefined();
        expect(result.current.db).toBeDefined();
      });
    });
  });

  describe('Email/Password Authentication', () => {
    it('signs in with email and password', async () => {
      const mockUser = createMockFirebaseUser();

      (auth().signInWithEmailAndPassword as jest.Mock).mockResolvedValue({
        user: mockUser,
      });

      const { result } = renderAuthHook();

      await act(async () => {
        await result.current.signIn('test@example.com', 'password123');
      });

      expect(auth().signInWithEmailAndPassword).toHaveBeenCalledWith(
        'test@example.com',
        'password123'
      );
    });

    it('signs up with email and password', async () => {
      const mockHandleSignUp = jest.fn().mockResolvedValue({
        data: { success: true, userId: 'new-user-uid' },
      });
      (functions().httpsCallable as jest.Mock).mockReturnValue(mockHandleSignUp);

      const { result } = renderAuthHook();

      await act(async () => {
        await result.current.signUp('newuser@example.com', 'password123');
      });

      expect(functions().httpsCallable).toHaveBeenCalledWith('handleSignUp');
      expect(mockHandleSignUp).toHaveBeenCalledWith({
        email: 'newuser@example.com',
        password: 'password123',
      });
    });

    it('handles sign in errors', async () => {
      const error = new Error('auth/wrong-password');
      (auth().signInWithEmailAndPassword as jest.Mock).mockRejectedValue(error);

      const { result } = renderAuthHook();

      await expect(
        result.current.signIn('test@example.com', 'wrongpassword')
      ).rejects.toThrow('auth/wrong-password');
    });

    it('handles sign up errors', async () => {
      const mockHandleSignUp = jest.fn().mockRejectedValue(
        new Error('auth/email-already-in-use')
      );
      (functions().httpsCallable as jest.Mock).mockReturnValue(mockHandleSignUp);

      const { result } = renderAuthHook();

      await expect(
        result.current.signUp('existing@example.com', 'password123')
      ).rejects.toThrow();
    });
  });

  describe('Google Sign-In', () => {
    it('signs in with Google successfully', async () => {
      const mockGoogleUser = {
        user: {
          id: 'google-123',
          email: 'googleuser@gmail.com',
          name: 'Google User',
          photo: 'https://example.com/photo.jpg',
        },
        idToken: 'google-id-token',
      };

      const mockFirebaseUser = createMockFirebaseUser({
        uid: 'firebase-uid',
        email: 'googleuser@gmail.com',
        displayName: 'Google User',
        photoURL: 'https://example.com/photo.jpg',
      });

      (GoogleSignin.signIn as jest.Mock).mockResolvedValue(mockGoogleUser);
      const { GoogleAuthProvider } = jest.requireMock('@react-native-firebase/auth');
      (GoogleAuthProvider.credential as jest.Mock).mockReturnValue({});
      (auth().signInWithCredential as jest.Mock).mockResolvedValue({
        user: mockFirebaseUser,
      });

      const { result } = renderAuthHook();

      await act(async () => {
        await result.current.signInWithGoogle();
      });

      expect(GoogleSignin.hasPlayServices).toHaveBeenCalled();
      expect(GoogleSignin.signIn).toHaveBeenCalled();
      expect(GoogleAuthProvider.credential).toHaveBeenCalledWith(
        'google-id-token'
      );
      expect(auth().signInWithCredential).toHaveBeenCalled();
    });

    it('handles Google sign-in cancellation', async () => {
      const error = new Error('SIGN_IN_CANCELLED');
      (error as any).code = 'SIGN_IN_CANCELLED';
      (GoogleSignin.signIn as jest.Mock).mockRejectedValue(error);

      const { result } = renderAuthHook();

      await act(async () => {
        await result.current.signInWithGoogle();
      });

      // Should not throw, just log
      expect(Alert.alert).not.toHaveBeenCalled();
    });

    it('handles Google Play Services not available', async () => {
      (GoogleSignin.hasPlayServices as jest.Mock).mockRejectedValue(
        new Error('Play services not available')
      );

      const { result } = renderAuthHook();

      await expect(result.current.signInWithGoogle()).rejects.toThrow();
    });
  });

  describe('Phone Authentication', () => {
    it('initiates phone sign-in', async () => {
      const mockConfirmation = {
        confirm: jest.fn(),
        verificationId: 'verification-123',
      };

      (auth().signInWithPhoneNumber as jest.Mock).mockResolvedValue(
        mockConfirmation
      );

      const { result } = renderAuthHook();

      await act(async () => {
        const confirmation = await result.current.signInWithPhoneNumber(
          '+1234567890'
        );
        expect(confirmation).toBe(mockConfirmation);
      });

      expect(auth().signInWithPhoneNumber).toHaveBeenCalledWith('+1234567890');
      expect(result.current.phoneAuthConfirmation).toBe(mockConfirmation);
      expect(result.current.phoneNumberInProgress).toBe('+1234567890');
    });

    it('confirms phone verification code', async () => {
      const mockUser = createMockFirebaseUser({
        uid: 'phone-user-uid',
        phoneNumber: '+1234567890',
      });

      const mockConfirmation = {
        confirm: jest.fn().mockResolvedValue({ user: mockUser }),
      };

      const { result } = renderAuthHook();

      // Set up phone auth state
      act(() => {
        result.current.setPhoneAuthConfirmation(mockConfirmation);
      });

      await act(async () => {
        await result.current.confirmPhoneCode('+1234567890', '123456');
      });

      expect(mockConfirmation.confirm).toHaveBeenCalledWith('123456');
    });

    it('clears phone auth state', () => {
      const { result } = renderAuthHook();

      act(() => {
        result.current.setPhoneAuthConfirmation({ confirm: jest.fn() } as any);
        result.current.clearPhoneAuth();
      });

      expect(result.current.phoneAuthConfirmation).toBeNull();
      expect(result.current.phoneNumberInProgress).toBeNull();
    });
  });

  describe('Email Verification', () => {
    it('sends verification email', async () => {
      const mockUser = createMockFirebaseUser({
        uid: 'user-123',
        email: 'test@example.com',
      });

      (auth().currentUser as any) = mockUser;

      const { result } = renderAuthHook();

      await act(async () => {
        await result.current.resendVerificationEmail();
      });

      expect(mockUser.sendEmailVerification).toHaveBeenCalled();
    });

    it('triggers custom verification email', async () => {
      const mockTriggerEmail = jest.fn().mockResolvedValue({ data: {} });
      (functions().httpsCallable as jest.Mock).mockReturnValue(mockTriggerEmail);

      const { result } = renderAuthHook();

      await act(async () => {
        await result.current.triggerSendVerificationEmail(
          'user-123',
          'test@example.com',
          'Test User'
        );
      });

      expect(mockTriggerEmail).toHaveBeenCalledWith({
        userId: 'user-123',
        email: 'test@example.com',
        displayName: 'Test User',
      });
    });
  });

  describe('Session Management', () => {
    it('signs out user', async () => {
      const mockUnsubscribe = jest.fn();
      (auth().signOut as jest.Mock).mockResolvedValue(undefined);
      (GoogleSignin.signOut as jest.Mock).mockResolvedValue(undefined);

      const { result } = renderAuthHook();

      await act(async () => {
        await result.current.signOut();
      });

      expect(auth().signOut).toHaveBeenCalled();
      expect(GoogleSignin.signOut).toHaveBeenCalled();
      expect(AsyncStorage.multiRemove).toHaveBeenCalled();
    });

    it('loads cached user data when offline', async () => {
      const cachedUserData = {
        onboardingCompleted: true,
        firstName: 'John',
        lastName: 'Doe',
      };

      (AsyncStorage.getItem as jest.Mock).mockResolvedValue(
        JSON.stringify(cachedUserData)
      );
      
      const { networkService } = require('../../src/services/NetworkService');
      networkService.isOnline.mockReturnValue(false);

      const mockUser = createMockFirebaseUser({
        uid: 'cached-user-uid',
        email: 'cached@example.com',
      });

      (auth().onAuthStateChanged as jest.Mock).mockImplementation((callback) => {
        callback(mockUser);
        return jest.fn();
      });

      const { result } = renderAuthHook();

      await waitFor(() => {
        expect(result.current.firestoreUser).toBeDefined();
        expect(result.current.firestoreUser?.onboardingCompleted).toBe(cachedUserData.onboardingCompleted);
      });
    });
  });

  describe('Navigation', () => {
    it('redirects to onboarding for new users', async () => {
      const mockUser = createMockFirebaseUser({
        uid: 'new-user-uid',
        email: 'newuser@example.com',
        emailVerified: true,
      });

      const firestoreData = {
        onboardingCompleted: false,
      };

      (firestore().collection as jest.Mock).mockReturnValue({
        doc: jest.fn().mockReturnValue({
          get: jest.fn().mockResolvedValue({
            exists: true,
            data: () => firestoreData,
          }),
        }),
      });

      (auth().onAuthStateChanged as jest.Mock).mockImplementation((callback) => {
        callback(mockUser);
        return jest.fn();
      });

      renderAuthHook();

      await waitFor(() => {
        expect(mockReplace).toHaveBeenCalledWith('/(onboarding)/profileSetup');
      });
    });

    it('redirects to feed for completed users', async () => {
      const mockUser = createMockFirebaseUser({
        uid: 'existing-user-uid',
        email: 'existing@example.com',
        emailVerified: true,
      });

      const firestoreData = {
        onboardingCompleted: true,
      };

      (firestore().collection as jest.Mock).mockReturnValue({
        doc: jest.fn().mockReturnValue({
          get: jest.fn().mockResolvedValue({
            exists: true,
            data: () => firestoreData,
          }),
        }),
      });

      (auth().onAuthStateChanged as jest.Mock).mockImplementation((callback) => {
        callback(mockUser);
        return jest.fn();
      });

      renderAuthHook();

      await waitFor(() => {
        expect(mockReplace).toHaveBeenCalled();
      });
      
      // Check the last call to mockReplace
      const calls = mockReplace.mock.calls;
      const lastCall = calls[calls.length - 1];
      expect(lastCall[0]).toBe('/(tabs)/feed');
    });
  });

  describe('Password Reset', () => {
    it('sends password reset email', async () => {
      (auth().sendPasswordResetEmail as jest.Mock).mockResolvedValue(undefined);

      const { result } = renderAuthHook();

      await act(async () => {
        await result.current.sendPasswordReset('forgot@example.com');
      });

      expect(auth().sendPasswordResetEmail).toHaveBeenCalledWith(
        'forgot@example.com'
      );
    });
  });

  describe('Error Handling', () => {
    it('handles auth state change errors', async () => {
      const error = new Error('Auth state error');
      
      (auth().onAuthStateChanged as jest.Mock).mockImplementation(() => {
        throw error;
      });

      renderAuthHook();

      await waitFor(() => {
        expect(console.error).toHaveBeenCalledWith(
          'AuthContext: Auth state change error:',
          error
        );
      });
    });

    it('throws error when useAuth is used outside provider', () => {
      // Temporarily mock console.error to suppress error output in test
      const originalError = console.error;
      console.error = jest.fn();

      expect(() => {
        renderHook(() => useAuth());
      }).toThrow('useAuth must be used within an AuthProvider');

      console.error = originalError;
    });
  });
});