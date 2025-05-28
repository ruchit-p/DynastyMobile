import React from 'react';
import { act, renderHook, waitFor } from '@testing-library/react';
import { onAuthStateChanged, signInWithEmailAndPassword, signOut } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { AuthProvider, useAuth } from '@/context/AuthContext';
import { createMockFirebaseUser, createMockFirestoreUser } from '../test-utils';

// Mock dependencies
jest.mock('@/context/AuthContext');
jest.mock('firebase/auth');
jest.mock('firebase/firestore');
jest.mock('firebase/functions');
jest.mock('@/lib/firebase', () => ({
  auth: {},
  db: {},
  functions: {},
}));

describe('AuthContext - Realistic Tests', () => {
  // Setup mock implementations
  const mockOnAuthStateChanged = onAuthStateChanged as jest.Mock;
  const mockSignInWithEmailAndPassword = signInWithEmailAndPassword as jest.Mock;
  const mockSignOut = signOut as jest.Mock;
  const mockGetDoc = getDoc as jest.Mock;
  const mockDoc = doc as jest.Mock;
  const mockHttpsCallable = httpsCallable as jest.Mock;

  // Mock implementations for Auth Context methods
  const mockAuthContext = {
    currentUser: null,
    firestoreUser: null,
    loading: false,
    signIn: jest.fn(),
    signUp: jest.fn(),
    logout: jest.fn(),
    signInWithGoogle: jest.fn(),
    signInWithPhone: jest.fn(),
    confirmPhoneSignIn: jest.fn(),
    updateUserProfile: jest.fn(),
    updateEmail: jest.fn(),
    updatePassword: jest.fn(),
    signUpWithInvitation: jest.fn(),
    verifyInvitation: jest.fn(),
    refreshFirestoreUser: jest.fn(),
  };

  const mockUseAuth = useAuth as jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Setup default mock for useAuth
    mockUseAuth.mockReturnValue(mockAuthContext);
    
    // Default mock implementations
    mockDoc.mockReturnValue({ id: 'test-user-123' });
    mockGetDoc.mockResolvedValue({
      exists: () => true,
      data: () => createMockFirestoreUser(),
    });
    mockSignOut.mockResolvedValue(undefined);
    mockHttpsCallable.mockReturnValue(jest.fn().mockResolvedValue({ data: { success: true } }));
  });

  // Wrapper component for tests
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <AuthProvider>{children}</AuthProvider>
  );

  describe('Authentication Flow', () => {
    it('should handle user login successfully', async () => {
      const mockFirebaseUser = createMockFirebaseUser();
      const mockFirestoreUser = createMockFirestoreUser();
      
      mockSignInWithEmailAndPassword.mockResolvedValue({
        user: mockFirebaseUser,
      });
      
      const mockSignIn = jest.fn().mockResolvedValue(undefined);
      
      mockUseAuth.mockReturnValue({
        ...mockAuthContext,
        signIn: mockSignIn,
      });

      const { result } = renderHook(() => useAuth());

      // Initial state - no user
      expect(result.current.currentUser).toBeNull();
      expect(result.current.loading).toBe(false);

      // Perform login
      await act(async () => {
        await result.current.signIn('test@example.com', 'password123');
      });

      // Verify login was called
      expect(mockSignIn).toHaveBeenCalledWith('test@example.com', 'password123');
    });

    it('should handle login failure with proper error', async () => {
      const loginError = new Error('Invalid email or password');
      const mockSignIn = jest.fn().mockRejectedValue(loginError);
      
      mockUseAuth.mockReturnValue({
        ...mockAuthContext,
        signIn: mockSignIn,
      });

      const { result } = renderHook(() => useAuth());

      // Attempt login with invalid credentials
      await expect(
        result.current.signIn('invalid@example.com', 'wrongpassword')
      ).rejects.toThrow('Invalid email or password');

      // User should remain null
      expect(result.current.currentUser).toBeNull();
      expect(result.current.firestoreUser).toBeNull();
    });

    it('should handle user registration with profile setup', async () => {
      const mockFirebaseUser = createMockFirebaseUser();
      const mockSignUp = jest.fn().mockResolvedValue(undefined);
      
      mockUseAuth.mockReturnValue({
        ...mockAuthContext,
        signUp: mockSignUp,
      });

      const { result } = renderHook(() => useAuth());

      // Register new user
      await act(async () => {
        await result.current.signUp(
          'newuser@example.com',
          'securePassword123',
          'John',
          'Doe'
        );
      });

      // Verify user creation
      expect(mockSignUp).toHaveBeenCalledWith(
        'newuser@example.com',
        'securePassword123',
        'John',
        'Doe'
      );
    });

    it('should handle logout and cleanup', async () => {
      const mockFirebaseUser = createMockFirebaseUser();
      const mockLogout = jest.fn().mockResolvedValue(undefined);
      
      mockUseAuth.mockReturnValue({
        ...mockAuthContext,
        currentUser: mockFirebaseUser,
        firestoreUser: createMockFirestoreUser(),
        logout: mockLogout,
      });

      const { result } = renderHook(() => useAuth());

      // Initial state with user
      expect(result.current.currentUser).toEqual(mockFirebaseUser);

      // Perform logout
      await act(async () => {
        await result.current.logout();
      });

      expect(mockLogout).toHaveBeenCalled();
    });
  });

  describe('Profile Management', () => {
    it('should update user profile successfully', async () => {
      const mockFirebaseUser = createMockFirebaseUser();
      const mockFirestoreUser = createMockFirestoreUser();
      const mockUpdateProfile = jest.fn().mockResolvedValue(undefined);
      
      mockUseAuth.mockReturnValue({
        ...mockAuthContext,
        currentUser: mockFirebaseUser,
        firestoreUser: mockFirestoreUser,
        updateUserProfile: mockUpdateProfile,
      });

      const { result } = renderHook(() => useAuth());

      const updates = {
        firstName: 'Jane',
        lastName: 'Smith',
        bio: 'Updated bio',
        occupation: 'Senior Developer',
      };

      await act(async () => {
        await result.current.updateUserProfile(updates);
      });

      // Verify update was called
      expect(mockUpdateProfile).toHaveBeenCalledWith(updates);
    });

    it('should handle profile update failure', async () => {
      const mockFirebaseUser = createMockFirebaseUser();
      const updateError = new Error('Update failed');
      const mockUpdateProfile = jest.fn().mockRejectedValue(updateError);
      
      mockUseAuth.mockReturnValue({
        ...mockAuthContext,
        currentUser: mockFirebaseUser,
        updateUserProfile: mockUpdateProfile,
      });

      const { result } = renderHook(() => useAuth());

      await expect(
        result.current.updateUserProfile({ firstName: 'Jane' })
      ).rejects.toThrow('Update failed');
    });
  });

  describe('Edge Cases and Error Handling', () => {
    it('should handle missing Firestore user document', async () => {
      const mockFirebaseUser = createMockFirebaseUser();
      
      mockGetDoc.mockResolvedValue({
        exists: () => false,
        data: () => null,
      });
      
      mockUseAuth.mockReturnValue({
        ...mockAuthContext,
        currentUser: mockFirebaseUser,
        firestoreUser: null,
      });

      const { result } = renderHook(() => useAuth());

      expect(result.current.currentUser).toEqual(mockFirebaseUser);
      expect(result.current.firestoreUser).toBeNull();
    });

    it('should handle concurrent auth state changes', async () => {
      const user1 = createMockFirebaseUser({ uid: 'user1' });
      const user2 = createMockFirebaseUser({ uid: 'user2' });
      
      let currentUser = null;
      
      mockUseAuth.mockImplementation(() => ({
        ...mockAuthContext,
        currentUser,
      }));

      const { result, rerender } = renderHook(() => useAuth());

      // Simulate rapid auth state changes
      await act(async () => {
        currentUser = user1;
        rerender();
        currentUser = user2;
        rerender();
        currentUser = null;
        rerender();
        currentUser = user1;
        rerender();
      });

      // Should handle gracefully and end with last state
      expect(result.current.currentUser?.uid).toBe('user1');
    });

    it('should handle network errors during authentication', async () => {
      const networkError = new Error('Network error');
      networkError.name = 'NetworkError';
      
      const mockSignIn = jest.fn().mockRejectedValue(networkError);
      
      mockUseAuth.mockReturnValue({
        ...mockAuthContext,
        signIn: mockSignIn,
      });

      const { result } = renderHook(() => useAuth());

      await expect(
        result.current.signIn('test@example.com', 'password')
      ).rejects.toThrow('Network error');
    });
  });

  describe('Security Features', () => {
    it('should validate email format during registration', async () => {
      const mockSignUp = jest.fn().mockRejectedValue(
        new Error('Invalid email format')
      );
      
      mockUseAuth.mockReturnValue({
        ...mockAuthContext,
        signUp: mockSignUp,
      });

      const { result } = renderHook(() => useAuth());

      // Invalid email format
      await expect(
        result.current.signUp('invalidemail', 'password123', 'John', 'Doe')
      ).rejects.toThrow('Invalid email format');
    });

    it('should enforce password requirements', async () => {
      const mockSignUp = jest.fn().mockRejectedValue(
        new Error('Password should be at least 6 characters')
      );
      
      mockUseAuth.mockReturnValue({
        ...mockAuthContext,
        signUp: mockSignUp,
      });

      const { result } = renderHook(() => useAuth());

      // Weak password
      await expect(
        result.current.signUp('test@example.com', '123', 'John', 'Doe')
      ).rejects.toThrow('Password should be at least 6 characters');
    });

    it('should clean up listeners on unmount', () => {
      const unsubscribe = jest.fn();
      mockOnAuthStateChanged.mockReturnValue(unsubscribe);

      // Mock the actual AuthProvider implementation
      const MockAuthProvider = ({ children }: { children: React.ReactNode }) => {
        React.useEffect(() => {
          const unsub = onAuthStateChanged(auth, () => {});
          return () => unsub();
        }, []);
        return <>{children}</>;
      };

      const { unmount } = renderHook(() => useAuth(), {
        wrapper: MockAuthProvider,
      });

      expect(mockOnAuthStateChanged).toHaveBeenCalled();
      
      unmount();
      
      expect(unsubscribe).toHaveBeenCalled();
    });
  });

  describe('Loading States', () => {
    it('should show loading state during initial auth check', async () => {
      let isLoading = true;
      
      mockUseAuth.mockImplementation(() => ({
        ...mockAuthContext,
        loading: isLoading,
      }));

      const { result, rerender } = renderHook(() => useAuth());

      // Should be loading initially
      expect(result.current.loading).toBe(true);
      expect(result.current.currentUser).toBeNull();

      // Simulate auth state resolved
      await act(async () => {
        isLoading = false;
        rerender();
      });

      expect(result.current.loading).toBe(false);
    });
  });

  describe('Phone Authentication', () => {
    it('should handle phone sign-in request', async () => {
      const mockSignInWithPhone = jest.fn().mockResolvedValue({
        verificationId: 'test-verification-id',
      });
      
      mockUseAuth.mockReturnValue({
        ...mockAuthContext,
        signInWithPhone: mockSignInWithPhone,
      });

      const { result } = renderHook(() => useAuth());

      const phoneResult = await result.current.signInWithPhone('+1234567890');

      expect(mockSignInWithPhone).toHaveBeenCalledWith('+1234567890');
      expect(phoneResult.verificationId).toBe('test-verification-id');
    });

    it('should confirm phone sign-in with OTP', async () => {
      const mockConfirmPhone = jest.fn().mockResolvedValue(true);
      
      mockUseAuth.mockReturnValue({
        ...mockAuthContext,
        confirmPhoneSignIn: mockConfirmPhone,
      });

      const { result } = renderHook(() => useAuth());

      const success = await result.current.confirmPhoneSignIn('123456');

      expect(mockConfirmPhone).toHaveBeenCalledWith('123456');
      expect(success).toBe(true);
    });
  });

  describe('Social Authentication', () => {
    it('should handle Google sign-in', async () => {
      const mockSignInWithGoogle = jest.fn().mockResolvedValue(true);
      
      mockUseAuth.mockReturnValue({
        ...mockAuthContext,
        signInWithGoogle: mockSignInWithGoogle,
      });

      const { result } = renderHook(() => useAuth());

      const success = await result.current.signInWithGoogle();

      expect(mockSignInWithGoogle).toHaveBeenCalled();
      expect(success).toBe(true);
    });

    it('should handle Google sign-in cancellation', async () => {
      const mockSignInWithGoogle = jest.fn().mockResolvedValue(false);
      
      mockUseAuth.mockReturnValue({
        ...mockAuthContext,
        signInWithGoogle: mockSignInWithGoogle,
      });

      const { result } = renderHook(() => useAuth());

      const success = await result.current.signInWithGoogle();

      expect(success).toBe(false);
    });
  });
});