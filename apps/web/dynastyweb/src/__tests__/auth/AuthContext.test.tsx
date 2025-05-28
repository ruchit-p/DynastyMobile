import React from 'react';
import { render, screen, waitFor, act } from '@testing-library/react';
import { AuthProvider, useAuth } from '@/context/AuthContext';
import { auth, db } from '@/lib/firebase';
import { signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut, onAuthStateChanged, sendEmailVerification } from 'firebase/auth';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';

// Mock Firebase modules
jest.mock('@/lib/firebase', () => ({
  auth: {},
  db: {},
}));

jest.mock('firebase/auth', () => ({
  signInWithEmailAndPassword: jest.fn(),
  createUserWithEmailAndPassword: jest.fn(),
  signOut: jest.fn(),
  onAuthStateChanged: jest.fn(),
  sendEmailVerification: jest.fn(),
  GoogleAuthProvider: jest.fn(),
  signInWithPopup: jest.fn(),
  RecaptchaVerifier: jest.fn(),
  signInWithPhoneNumber: jest.fn(),
  sendPasswordResetEmail: jest.fn(),
}));

jest.mock('firebase/firestore', () => ({
  doc: jest.fn(),
  getDoc: jest.fn(),
  setDoc: jest.fn(),
  serverTimestamp: jest.fn(),
  collection: jest.fn(),
  query: jest.fn(),
  where: jest.fn(),
  orderBy: jest.fn(),
  onSnapshot: jest.fn(),
}));

// Test component to access auth context
const TestComponent = () => {
  const auth = useAuth();
  return (
    <div>
      <div data-testid="user-status">
        {auth.currentUser ? `Logged in as ${auth.currentUser.email}` : 'Not logged in'}
      </div>
      <div data-testid="loading-status">{auth.loading ? 'Loading' : 'Not loading'}</div>
      <div data-testid="firestore-user">
        {auth.firestoreUser ? `User: ${auth.firestoreUser.firstName} ${auth.firestoreUser.lastName}` : 'No firestore user'}
      </div>
    </div>
  );
};

describe('AuthContext', () => {
  let mockUnsubscribe: jest.Mock;
  
  beforeEach(() => {
    jest.clearAllMocks();
    mockUnsubscribe = jest.fn();
    (onAuthStateChanged as jest.Mock).mockReturnValue(mockUnsubscribe);
    (serverTimestamp as jest.Mock).mockReturnValue({ seconds: Date.now() / 1000 });
  });

  describe('Provider Initialization', () => {
    it('provides auth context to children', () => {
      render(
        <AuthProvider>
          <TestComponent />
        </AuthProvider>
      );
      
      expect(screen.getByTestId('user-status')).toBeInTheDocument();
      expect(screen.getByTestId('loading-status')).toBeInTheDocument();
    });

    it('starts in loading state', () => {
      render(
        <AuthProvider>
          <TestComponent />
        </AuthProvider>
      );
      
      expect(screen.getByTestId('loading-status')).toHaveTextContent('Loading');
    });

    it('sets up auth state listener on mount', () => {
      render(
        <AuthProvider>
          <TestComponent />
        </AuthProvider>
      );
      
      expect(onAuthStateChanged).toHaveBeenCalledWith(auth, expect.any(Function));
    });

    it('cleans up auth listener on unmount', () => {
      const { unmount } = render(
        <AuthProvider>
          <TestComponent />
        </AuthProvider>
      );
      
      unmount();
      
      expect(mockUnsubscribe).toHaveBeenCalled();
    });
  });

  describe('Authentication State Changes', () => {
    it('updates when user logs in', async () => {
      const mockUser = {
        uid: '123',
        email: 'test@example.com',
        emailVerified: true,
      };
      
      const mockFirestoreUser = {
        uid: '123',
        email: 'test@example.com',
        firstName: 'John',
        lastName: 'Doe',
        phoneNumber: '+1234567890',
        phoneNumberVerified: true,
      };
      
      (getDoc as jest.Mock).mockResolvedValue({
        exists: () => true,
        data: () => mockFirestoreUser,
      });
      
      let authCallback: ((user: any) => void) | null = null;
      (onAuthStateChanged as jest.Mock).mockImplementation((auth, callback) => {
        authCallback = callback;
        return mockUnsubscribe;
      });
      
      render(
        <AuthProvider>
          <TestComponent />
        </AuthProvider>
      );
      
      // Simulate user login
      await act(async () => {
        if (authCallback) {
          authCallback(mockUser);
        }
      });
      
      await waitFor(() => {
        expect(screen.getByTestId('user-status')).toHaveTextContent('Logged in as test@example.com');
        expect(screen.getByTestId('loading-status')).toHaveTextContent('Not loading');
        expect(screen.getByTestId('firestore-user')).toHaveTextContent('User: John Doe');
      });
    });

    it('updates when user logs out', async () => {
      let authCallback: ((user: any) => void) | null = null;
      (onAuthStateChanged as jest.Mock).mockImplementation((auth, callback) => {
        authCallback = callback;
        return mockUnsubscribe;
      });
      
      render(
        <AuthProvider>
          <TestComponent />
        </AuthProvider>
      );
      
      // Simulate user logout
      await act(async () => {
        if (authCallback) {
          authCallback(null);
        }
      });
      
      await waitFor(() => {
        expect(screen.getByTestId('user-status')).toHaveTextContent('Not logged in');
        expect(screen.getByTestId('loading-status')).toHaveTextContent('Not loading');
        expect(screen.getByTestId('firestore-user')).toHaveTextContent('No firestore user');
      });
    });
  });

  describe('Authentication Methods', () => {
    it('handles email/password sign in', async () => {
      const mockUser = {
        uid: '123',
        email: 'test@example.com',
        emailVerified: true,
      };
      
      (signInWithEmailAndPassword as jest.Mock).mockResolvedValue({
        user: mockUser,
      });
      
      const TestSignInComponent = () => {
        const { signIn } = useAuth();
        return (
          <button onClick={() => signIn('test@example.com', 'password123')}>
            Sign In
          </button>
        );
      };
      
      render(
        <AuthProvider>
          <TestSignInComponent />
        </AuthProvider>
      );
      
      const signInButton = screen.getByText('Sign In');
      
      await act(async () => {
        signInButton.click();
      });
      
      expect(signInWithEmailAndPassword).toHaveBeenCalledWith(
        auth,
        'test@example.com',
        'password123'
      );
    });

    it('handles sign up with user profile creation', async () => {
      const mockUser = {
        uid: '123',
        email: 'test@example.com',
        emailVerified: false,
      };
      
      (createUserWithEmailAndPassword as jest.Mock).mockResolvedValue({
        user: mockUser,
      });
      
      (setDoc as jest.Mock).mockResolvedValue(undefined);
      (sendEmailVerification as jest.Mock).mockResolvedValue(undefined);
      
      const TestSignUpComponent = () => {
        const { signUp } = useAuth();
        return (
          <button 
            onClick={() => signUp({
              email: 'test@example.com',
              password: 'password123',
              firstName: 'John',
              lastName: 'Doe',
            })}
          >
            Sign Up
          </button>
        );
      };
      
      render(
        <AuthProvider>
          <TestSignUpComponent />
        </AuthProvider>
      );
      
      const signUpButton = screen.getByText('Sign Up');
      
      await act(async () => {
        signUpButton.click();
      });
      
      expect(createUserWithEmailAndPassword).toHaveBeenCalledWith(
        auth,
        'test@example.com',
        'password123'
      );
      
      expect(setDoc).toHaveBeenCalledWith(
        doc(db, 'users', '123'),
        expect.objectContaining({
          uid: '123',
          email: 'test@example.com',
          firstName: 'John',
          lastName: 'Doe',
          emailVerified: false,
        })
      );
      
      expect(sendEmailVerification).toHaveBeenCalledWith(mockUser);
    });

    it('handles sign out', async () => {
      (signOut as jest.Mock).mockResolvedValue(undefined);
      
      const TestSignOutComponent = () => {
        const { logout } = useAuth();
        return <button onClick={logout}>Sign Out</button>;
      };
      
      render(
        <AuthProvider>
          <TestSignOutComponent />
        </AuthProvider>
      );
      
      const signOutButton = screen.getByText('Sign Out');
      
      await act(async () => {
        signOutButton.click();
      });
      
      expect(signOut).toHaveBeenCalledWith(auth);
    });
  });

  describe('Error Handling', () => {
    it('handles sign in errors', async () => {
      const error = new Error('Invalid credentials');
      (signInWithEmailAndPassword as jest.Mock).mockRejectedValue(error);
      
      const TestErrorComponent = () => {
        const { signIn } = useAuth();
        const [error, setError] = React.useState<string | null>(null);
        
        const handleSignIn = async () => {
          try {
            await signIn('test@example.com', 'wrong-password');
          } catch (err) {
            setError((err as Error).message);
          }
        };
        
        return (
          <div>
            <button onClick={handleSignIn}>Sign In</button>
            {error && <div data-testid="error">{error}</div>}
          </div>
        );
      };
      
      render(
        <AuthProvider>
          <TestErrorComponent />
        </AuthProvider>
      );
      
      const signInButton = screen.getByText('Sign In');
      
      await act(async () => {
        signInButton.click();
      });
      
      await waitFor(() => {
        expect(screen.getByTestId('error')).toHaveTextContent('Invalid credentials');
      });
    });

    it('handles Firestore user fetch errors gracefully', async () => {
      const mockUser = {
        uid: '123',
        email: 'test@example.com',
        emailVerified: true,
      };
      
      (getDoc as jest.Mock).mockRejectedValue(new Error('Firestore error'));
      
      let authCallback: ((user: any) => void) | null = null;
      (onAuthStateChanged as jest.Mock).mockImplementation((auth, callback) => {
        authCallback = callback;
        return mockUnsubscribe;
      });
      
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
      
      render(
        <AuthProvider>
          <TestComponent />
        </AuthProvider>
      );
      
      await act(async () => {
        if (authCallback) {
          authCallback(mockUser);
        }
      });
      
      await waitFor(() => {
        expect(screen.getByTestId('user-status')).toHaveTextContent('Logged in as test@example.com');
        expect(screen.getByTestId('firestore-user')).toHaveTextContent('No firestore user');
      });
      
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        'Failed to fetch user data:',
        expect.any(Error)
      );
      
      consoleErrorSpy.mockRestore();
    });
  });

  describe('Protected Route Behavior', () => {
    it('prevents access when not authenticated', () => {
      const ProtectedComponent = () => {
        const { currentUser } = useAuth();
        
        if (!currentUser) {
          return <div>Access Denied</div>;
        }
        
        return <div>Protected Content</div>;
      };
      
      render(
        <AuthProvider>
          <ProtectedComponent />
        </AuthProvider>
      );
      
      expect(screen.getByText('Access Denied')).toBeInTheDocument();
    });

    it('allows access when authenticated', async () => {
      const mockUser = {
        uid: '123',
        email: 'test@example.com',
        emailVerified: true,
      };
      
      let authCallback: ((user: any) => void) | null = null;
      (onAuthStateChanged as jest.Mock).mockImplementation((auth, callback) => {
        authCallback = callback;
        return mockUnsubscribe;
      });
      
      const ProtectedComponent = () => {
        const { currentUser } = useAuth();
        
        if (!currentUser) {
          return <div>Access Denied</div>;
        }
        
        return <div>Protected Content</div>;
      };
      
      render(
        <AuthProvider>
          <ProtectedComponent />
        </AuthProvider>
      );
      
      await act(async () => {
        if (authCallback) {
          authCallback(mockUser);
        }
      });
      
      await waitFor(() => {
        expect(screen.getByText('Protected Content')).toBeInTheDocument();
      });
    });
  });
});