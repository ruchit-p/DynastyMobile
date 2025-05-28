import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import LoginPage from '@/app/login/page';
import { createMockAuthContext, createMockCSRFContext, createMockFirebaseUser, createMockFirestoreUser } from '../test-utils';

// Mock dependencies
jest.mock('next/navigation');
jest.mock('@/context/AuthContext');
jest.mock('@/context/CSRFContext');
jest.mock('@/hooks/useCSRF', () => ({
  useCSRF: () => ({ csrfToken: 'test-csrf-token' }),
}));

// Mock Firebase
jest.mock('firebase/auth', () => ({
  signInWithEmailAndPassword: jest.fn(),
  signInWithPopup: jest.fn(),
  GoogleAuthProvider: jest.fn(),
  RecaptchaVerifier: jest.fn(),
}));

describe('Login Page - Real-world Scenarios', () => {
  const mockRouter = {
    push: jest.fn(),
    replace: jest.fn(),
    back: jest.fn(),
  };

  const mockUseAuth = useAuth as jest.Mock;
  const mockUseRouter = useRouter as jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    mockUseRouter.mockReturnValue(mockRouter);
    mockUseAuth.mockReturnValue(createMockAuthContext());
  });

  describe('Form Validation', () => {
    it('should validate email format', async () => {
      const user = userEvent.setup();
      render(<LoginPage />);

      const emailInput = screen.getByLabelText(/email/i);
      const submitButton = screen.getByRole('button', { name: /sign in/i });

      // Invalid email
      await user.type(emailInput, 'invalid-email');
      await user.click(submitButton);

      expect(await screen.findByText(/please enter a valid email/i)).toBeInTheDocument();
    });

    it('should require password', async () => {
      const user = userEvent.setup();
      render(<LoginPage />);

      const emailInput = screen.getByLabelText(/email/i);
      const submitButton = screen.getByRole('button', { name: /sign in/i });

      await user.type(emailInput, 'test@example.com');
      await user.click(submitButton);

      expect(await screen.findByText(/password is required/i)).toBeInTheDocument();
    });

    it('should show password strength feedback', async () => {
      const user = userEvent.setup();
      render(<LoginPage />);

      const passwordInput = screen.getByLabelText(/password/i);
      
      // Weak password
      await user.type(passwordInput, '123');
      expect(screen.queryByText(/password too short/i)).toBeInTheDocument();

      // Clear and type strong password
      await user.clear(passwordInput);
      await user.type(passwordInput, 'StrongP@ssw0rd123');
      expect(screen.queryByText(/password too short/i)).not.toBeInTheDocument();
    });
  });

  describe('Authentication Flow', () => {
    it('should handle successful login', async () => {
      const user = userEvent.setup();
      const mockSignIn = jest.fn().mockResolvedValue(undefined);
      
      mockUseAuth.mockReturnValue(
        createMockAuthContext({ 
          signIn: mockSignIn,
          currentUser: createMockFirebaseUser(),
          firestoreUser: createMockFirestoreUser(),
        })
      );

      render(<LoginPage />);

      const emailInput = screen.getByLabelText(/email/i);
      const passwordInput = screen.getByLabelText(/password/i);
      const submitButton = screen.getByRole('button', { name: /sign in/i });

      await user.type(emailInput, 'test@example.com');
      await user.type(passwordInput, 'password123');
      await user.click(submitButton);

      expect(mockSignIn).toHaveBeenCalledWith('test@example.com', 'password123');
      
      await waitFor(() => {
        expect(mockRouter.push).toHaveBeenCalledWith('/feed');
      });
    });

    it('should handle login with remember me', async () => {
      const user = userEvent.setup();
      const mockSignIn = jest.fn().mockResolvedValue(undefined);
      
      mockUseAuth.mockReturnValue(
        createMockAuthContext({ signIn: mockSignIn })
      );

      render(<LoginPage />);

      const rememberCheckbox = screen.getByLabelText(/remember me/i);
      await user.click(rememberCheckbox);

      const emailInput = screen.getByLabelText(/email/i);
      const passwordInput = screen.getByLabelText(/password/i);
      const submitButton = screen.getByRole('button', { name: /sign in/i });

      await user.type(emailInput, 'test@example.com');
      await user.type(passwordInput, 'password123');
      await user.click(submitButton);

      // Check that email is saved to localStorage when remember me is checked
      expect(localStorage.getItem('rememberedEmail')).toBe('test@example.com');
    });

    it('should handle invalid credentials', async () => {
      const user = userEvent.setup();
      const mockSignIn = jest.fn().mockRejectedValue(
        new Error('Invalid email or password')
      );
      
      mockUseAuth.mockReturnValue(
        createMockAuthContext({ signIn: mockSignIn })
      );

      render(<LoginPage />);

      const emailInput = screen.getByLabelText(/email/i);
      const passwordInput = screen.getByLabelText(/password/i);
      const submitButton = screen.getByRole('button', { name: /sign in/i });

      await user.type(emailInput, 'wrong@example.com');
      await user.type(passwordInput, 'wrongpassword');
      await user.click(submitButton);

      expect(await screen.findByText(/invalid email or password/i)).toBeInTheDocument();
      expect(mockRouter.push).not.toHaveBeenCalled();
    });

    it('should handle account lockout', async () => {
      const user = userEvent.setup();
      const mockSignIn = jest.fn()
        .mockRejectedValueOnce(new Error('Invalid credentials'))
        .mockRejectedValueOnce(new Error('Invalid credentials'))
        .mockRejectedValueOnce(new Error('Account locked due to too many failed attempts'));
      
      mockUseAuth.mockReturnValue(
        createMockAuthContext({ signIn: mockSignIn })
      );

      render(<LoginPage />);

      const emailInput = screen.getByLabelText(/email/i);
      const passwordInput = screen.getByLabelText(/password/i);
      const submitButton = screen.getByRole('button', { name: /sign in/i });

      // Multiple failed attempts
      for (let i = 0; i < 3; i++) {
        await user.clear(emailInput);
        await user.clear(passwordInput);
        await user.type(emailInput, 'test@example.com');
        await user.type(passwordInput, 'wrongpassword');
        await user.click(submitButton);
      }

      expect(await screen.findByText(/account locked/i)).toBeInTheDocument();
      expect(screen.getByText(/too many failed attempts/i)).toBeInTheDocument();
    });
  });

  describe('Social Authentication', () => {
    it('should handle Google sign-in', async () => {
      const user = userEvent.setup();
      const mockSignInWithGoogle = jest.fn().mockResolvedValue(true);
      
      mockUseAuth.mockReturnValue(
        createMockAuthContext({ 
          signInWithGoogle: mockSignInWithGoogle,
          currentUser: createMockFirebaseUser(),
        })
      );

      render(<LoginPage />);

      const googleButton = screen.getByRole('button', { name: /sign in with google/i });
      await user.click(googleButton);

      expect(mockSignInWithGoogle).toHaveBeenCalled();
      
      await waitFor(() => {
        expect(mockRouter.push).toHaveBeenCalledWith('/feed');
      });
    });

    it('should handle Google sign-in cancellation', async () => {
      const user = userEvent.setup();
      const mockSignInWithGoogle = jest.fn().mockResolvedValue(false);
      
      mockUseAuth.mockReturnValue(
        createMockAuthContext({ signInWithGoogle: mockSignInWithGoogle })
      );

      render(<LoginPage />);

      const googleButton = screen.getByRole('button', { name: /sign in with google/i });
      await user.click(googleButton);

      expect(mockSignInWithGoogle).toHaveBeenCalled();
      expect(mockRouter.push).not.toHaveBeenCalled();
    });

    it('should handle social auth errors', async () => {
      const user = userEvent.setup();
      const mockSignInWithGoogle = jest.fn().mockRejectedValue(
        new Error('Popup blocked by browser')
      );
      
      mockUseAuth.mockReturnValue(
        createMockAuthContext({ signInWithGoogle: mockSignInWithGoogle })
      );

      render(<LoginPage />);

      const googleButton = screen.getByRole('button', { name: /sign in with google/i });
      await user.click(googleButton);

      expect(await screen.findByText(/popup blocked/i)).toBeInTheDocument();
    });
  });

  describe('Loading States', () => {
    it('should show loading state during authentication', async () => {
      const user = userEvent.setup();
      let resolveSignIn: () => void;
      const signInPromise = new Promise<void>(resolve => {
        resolveSignIn = resolve;
      });
      const mockSignIn = jest.fn().mockReturnValue(signInPromise);
      
      mockUseAuth.mockReturnValue(
        createMockAuthContext({ signIn: mockSignIn })
      );

      render(<LoginPage />);

      const emailInput = screen.getByLabelText(/email/i);
      const passwordInput = screen.getByLabelText(/password/i);
      const submitButton = screen.getByRole('button', { name: /sign in/i });

      await user.type(emailInput, 'test@example.com');
      await user.type(passwordInput, 'password123');
      await user.click(submitButton);

      // Should show loading state
      expect(screen.getByText(/signing in/i)).toBeInTheDocument();
      expect(submitButton).toBeDisabled();
      expect(emailInput).toBeDisabled();
      expect(passwordInput).toBeDisabled();

      resolveSignIn!();

      await waitFor(() => {
        expect(screen.queryByText(/signing in/i)).not.toBeInTheDocument();
      });
    });

    it('should disable form during submission', async () => {
      const user = userEvent.setup();
      const mockSignIn = jest.fn().mockImplementation(
        () => new Promise(resolve => setTimeout(resolve, 100))
      );
      
      mockUseAuth.mockReturnValue(
        createMockAuthContext({ signIn: mockSignIn })
      );

      render(<LoginPage />);

      const emailInput = screen.getByLabelText(/email/i);
      const passwordInput = screen.getByLabelText(/password/i);
      const submitButton = screen.getByRole('button', { name: /sign in/i });

      await user.type(emailInput, 'test@example.com');
      await user.type(passwordInput, 'password123');
      await user.click(submitButton);

      // All form elements should be disabled
      expect(emailInput).toBeDisabled();
      expect(passwordInput).toBeDisabled();
      expect(submitButton).toBeDisabled();
      expect(screen.getByRole('button', { name: /sign in with google/i })).toBeDisabled();
    });
  });

  describe('Navigation', () => {
    it('should navigate to signup page', async () => {
      const user = userEvent.setup();
      render(<LoginPage />);

      const signupLink = screen.getByText(/don't have an account/i).closest('a');
      expect(signupLink).toHaveAttribute('href', '/signup');
    });

    it('should navigate to forgot password', async () => {
      const user = userEvent.setup();
      render(<LoginPage />);

      const forgotLink = screen.getByText(/forgot password/i);
      expect(forgotLink).toHaveAttribute('href', '/forgot-password');
    });

    it('should redirect authenticated users', () => {
      mockUseAuth.mockReturnValue(
        createMockAuthContext({
          currentUser: createMockFirebaseUser(),
          firestoreUser: createMockFirestoreUser(),
          loading: false,
        })
      );

      render(<LoginPage />);

      expect(mockRouter.replace).toHaveBeenCalledWith('/feed');
    });
  });

  describe('Security Features', () => {
    it('should include CSRF token in requests', async () => {
      const user = userEvent.setup();
      const mockSignIn = jest.fn().mockResolvedValue(undefined);
      
      mockUseAuth.mockReturnValue(
        createMockAuthContext({ signIn: mockSignIn })
      );

      render(<LoginPage />);

      const form = screen.getByRole('form');
      const csrfInput = form.querySelector('input[name="csrf_token"]');
      expect(csrfInput).toHaveValue('test-csrf-token');
    });

    it('should mask password input', () => {
      render(<LoginPage />);

      const passwordInput = screen.getByLabelText(/password/i);
      expect(passwordInput).toHaveAttribute('type', 'password');
    });

    it('should have toggle password visibility', async () => {
      const user = userEvent.setup();
      render(<LoginPage />);

      const passwordInput = screen.getByLabelText(/password/i);
      const toggleButton = screen.getByRole('button', { name: /show password/i });

      expect(passwordInput).toHaveAttribute('type', 'password');

      await user.click(toggleButton);
      expect(passwordInput).toHaveAttribute('type', 'text');

      await user.click(toggleButton);
      expect(passwordInput).toHaveAttribute('type', 'password');
    });
  });

  describe('Accessibility', () => {
    it('should have proper form labels', () => {
      render(<LoginPage />);

      expect(screen.getByLabelText(/email/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/password/i)).toBeInTheDocument();
    });

    it('should be keyboard navigable', async () => {
      const user = userEvent.setup();
      render(<LoginPage />);

      await user.tab();
      expect(screen.getByLabelText(/email/i)).toHaveFocus();

      await user.tab();
      expect(screen.getByLabelText(/password/i)).toHaveFocus();

      await user.tab();
      expect(screen.getByLabelText(/remember me/i)).toHaveFocus();

      await user.tab();
      expect(screen.getByRole('button', { name: /sign in/i })).toHaveFocus();
    });

    it('should announce errors to screen readers', async () => {
      const user = userEvent.setup();
      const mockSignIn = jest.fn().mockRejectedValue(
        new Error('Invalid credentials')
      );
      
      mockUseAuth.mockReturnValue(
        createMockAuthContext({ signIn: mockSignIn })
      );

      render(<LoginPage />);

      const submitButton = screen.getByRole('button', { name: /sign in/i });
      await user.click(submitButton);

      const errorAlert = await screen.findByRole('alert');
      expect(errorAlert).toHaveTextContent(/invalid credentials/i);
    });
  });

  describe('Error Recovery', () => {
    it('should clear errors on new submission', async () => {
      const user = userEvent.setup();
      const mockSignIn = jest.fn()
        .mockRejectedValueOnce(new Error('Invalid credentials'))
        .mockResolvedValueOnce(undefined);
      
      mockUseAuth.mockReturnValue(
        createMockAuthContext({ signIn: mockSignIn })
      );

      render(<LoginPage />);

      const emailInput = screen.getByLabelText(/email/i);
      const passwordInput = screen.getByLabelText(/password/i);
      const submitButton = screen.getByRole('button', { name: /sign in/i });

      // First attempt - fail
      await user.type(emailInput, 'test@example.com');
      await user.type(passwordInput, 'wrong');
      await user.click(submitButton);

      expect(await screen.findByText(/invalid credentials/i)).toBeInTheDocument();

      // Second attempt - should clear error
      await user.clear(passwordInput);
      await user.type(passwordInput, 'correct');
      await user.click(submitButton);

      await waitFor(() => {
        expect(screen.queryByText(/invalid credentials/i)).not.toBeInTheDocument();
      });
    });
  });
});