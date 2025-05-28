import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { useRouter } from 'next/navigation';
import LoginPage from '@/app/login/page';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/components/ui/use-toast';

// Mock dependencies
jest.mock('next/navigation');
jest.mock('@/context/AuthContext');
jest.mock('@/components/ui/use-toast');
jest.mock('next/image', () => ({
  __esModule: true,
  default: (props: any) => <img {...props} />,
}));

describe('LoginPage', () => {
  const mockRouter = {
    push: jest.fn(),
    replace: jest.fn(),
  };
  
  const mockToast = jest.fn();
  const mockSignIn = jest.fn();
  const mockSignInWithGoogle = jest.fn();
  const mockSignInWithPhone = jest.fn();
  const mockConfirmPhoneSignIn = jest.fn();
  
  beforeEach(() => {
    jest.clearAllMocks();
    
    (useRouter as jest.Mock).mockReturnValue(mockRouter);
    (useToast as jest.Mock).mockReturnValue({ toast: mockToast });
    (useAuth as jest.Mock).mockReturnValue({
      signIn: mockSignIn,
      signInWithGoogle: mockSignInWithGoogle,
      signInWithPhone: mockSignInWithPhone,
      confirmPhoneSignIn: mockConfirmPhoneSignIn,
      currentUser: null,
      firestoreUser: null,
    });
  });

  describe('Email/Password Login', () => {
    it('renders login form with email and password fields', () => {
      render(<LoginPage />);
      
      expect(screen.getByLabelText(/email/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/password/i)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /sign in/i })).toBeInTheDocument();
    });

    it('validates email format', async () => {
      render(<LoginPage />);
      
      const emailInput = screen.getByLabelText(/email/i);
      const form = screen.getByTestId('login-form');
      
      fireEvent.change(emailInput, { target: { value: 'invalid-email' } });
      fireEvent.submit(form);
      
      await waitFor(() => {
        expect(screen.getByText(/invalid email address/i)).toBeInTheDocument();
      });
      
      expect(mockSignIn).not.toHaveBeenCalled();
    });

    it('validates password requirements', async () => {
      render(<LoginPage />);
      
      const passwordInput = screen.getByLabelText(/password/i);
      const form = screen.getByTestId('login-form');
      
      fireEvent.change(passwordInput, { target: { value: '123' } });
      fireEvent.submit(form);
      
      await waitFor(() => {
        expect(screen.getByText(/password must be at least/i)).toBeInTheDocument();
      });
      
      expect(mockSignIn).not.toHaveBeenCalled();
    });

    it('handles successful login', async () => {
      mockSignIn.mockResolvedValue({ user: { uid: '123', emailVerified: true } });
      
      (useAuth as jest.Mock).mockReturnValue({
        signIn: mockSignIn,
        signInWithGoogle: mockSignInWithGoogle,
        signInWithPhone: mockSignInWithPhone,
        confirmPhoneSignIn: mockConfirmPhoneSignIn,
        currentUser: { uid: '123', emailVerified: true },
        firestoreUser: null,
      });
      
      render(<LoginPage />);
      
      const emailInput = screen.getByLabelText(/email/i);
      const passwordInput = screen.getByLabelText(/password/i);
      const submitButton = screen.getByRole('button', { name: /sign in/i });
      
      fireEvent.change(emailInput, { target: { value: 'test@example.com' } });
      fireEvent.change(passwordInput, { target: { value: 'ValidPassword123!' } });
      fireEvent.click(submitButton);
      
      await waitFor(() => {
        expect(mockSignIn).toHaveBeenCalledWith('test@example.com', 'ValidPassword123!');
        expect(mockRouter.push).toHaveBeenCalledWith('/family-tree');
      });
    });

    it('handles login errors', async () => {
      const errorMessage = 'Invalid credentials';
      mockSignIn.mockRejectedValue(new Error(errorMessage));
      
      render(<LoginPage />);
      
      const emailInput = screen.getByLabelText(/email/i);
      const passwordInput = screen.getByLabelText(/password/i);
      const submitButton = screen.getByRole('button', { name: /sign in/i });
      
      fireEvent.change(emailInput, { target: { value: 'test@example.com' } });
      fireEvent.change(passwordInput, { target: { value: 'ValidPassword123!' } });
      fireEvent.click(submitButton);
      
      await waitFor(() => {
        expect(mockToast).toHaveBeenCalledWith(expect.objectContaining({
          title: 'Login failed',
          description: errorMessage,
          variant: 'destructive',
        }));
      });
    });

    it('shows loading state during login', async () => {
      mockSignIn.mockImplementation(() => new Promise(resolve => setTimeout(resolve, 100)));
      
      render(<LoginPage />);
      
      const emailInput = screen.getByLabelText(/email/i);
      const passwordInput = screen.getByLabelText(/password/i);
      const submitButton = screen.getByRole('button', { name: /sign in/i });
      
      fireEvent.change(emailInput, { target: { value: 'test@example.com' } });
      fireEvent.change(passwordInput, { target: { value: 'ValidPassword123!' } });
      fireEvent.click(submitButton);
      
      expect(screen.getByTestId('loading-spinner')).toBeInTheDocument();
      expect(submitButton).toBeDisabled();
    });
  });

  describe('Google Sign In', () => {
    it('handles Google sign in', async () => {
      mockSignInWithGoogle.mockResolvedValue({ user: { uid: '123' } });
      
      render(<LoginPage />);
      
      const googleButton = screen.getByRole('button', { name: /continue with google/i });
      fireEvent.click(googleButton);
      
      await waitFor(() => {
        expect(mockSignInWithGoogle).toHaveBeenCalled();
      });
    });

    it('handles Google sign in errors', async () => {
      const errorMessage = 'Google sign in failed';
      mockSignInWithGoogle.mockRejectedValue(new Error(errorMessage));
      
      render(<LoginPage />);
      
      const googleButton = screen.getByRole('button', { name: /continue with google/i });
      fireEvent.click(googleButton);
      
      await waitFor(() => {
        expect(mockToast).toHaveBeenCalledWith(expect.objectContaining({
          title: 'Google sign-in failed',
          description: errorMessage,
          variant: 'destructive',
        }));
      });
    });
  });

  describe('Phone Authentication', () => {
    it('renders phone authentication tab', () => {
      render(<LoginPage />);
      
      const phoneTab = screen.getByRole('tab', { name: /phone/i });
      fireEvent.click(phoneTab);
      
      expect(screen.getByLabelText(/phone number/i)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /send code/i })).toBeInTheDocument();
    });

    it('validates phone number format', async () => {
      render(<LoginPage />);
      
      const phoneTab = screen.getByRole('tab', { name: /phone/i });
      fireEvent.click(phoneTab);
      
      const phoneInput = screen.getByLabelText(/phone number/i);
      const sendButton = screen.getByRole('button', { name: /send code/i });
      
      fireEvent.change(phoneInput, { target: { value: '123' } });
      fireEvent.click(sendButton);
      
      await waitFor(() => {
        expect(screen.getByText(/invalid phone number/i)).toBeInTheDocument();
      });
    });

    it('handles successful phone verification code send', async () => {
      mockSignInWithPhone.mockResolvedValue({ verificationId: 'test-id' });
      
      render(<LoginPage />);
      
      const phoneTab = screen.getByRole('tab', { name: /phone/i });
      fireEvent.click(phoneTab);
      
      const phoneInput = screen.getByLabelText(/phone number/i);
      const sendButton = screen.getByRole('button', { name: /send code/i });
      
      fireEvent.change(phoneInput, { target: { value: '+1234567890' } });
      fireEvent.click(sendButton);
      
      await waitFor(() => {
        expect(mockSignInWithPhone).toHaveBeenCalledWith('+1234567890');
        expect(screen.getByLabelText(/verification code/i)).toBeInTheDocument();
        expect(mockToast).toHaveBeenCalledWith(expect.objectContaining({
          title: 'Verification code sent',
        }));
      });
    });

    it('handles verification code confirmation', async () => {
      mockSignInWithPhone.mockResolvedValue({ verificationId: 'test-id' });
      mockConfirmPhoneSignIn.mockResolvedValue({ user: { uid: '123' } });
      
      render(<LoginPage />);
      
      // First send the code
      const phoneTab = screen.getByRole('tab', { name: /phone/i });
      fireEvent.click(phoneTab);
      
      const phoneInput = screen.getByLabelText(/phone number/i);
      const sendButton = screen.getByRole('button', { name: /send code/i });
      
      fireEvent.change(phoneInput, { target: { value: '+1234567890' } });
      fireEvent.click(sendButton);
      
      await waitFor(() => {
        expect(screen.getByLabelText(/verification code/i)).toBeInTheDocument();
      });
      
      // Then verify the code
      const codeInput = screen.getByLabelText(/verification code/i);
      const verifyButton = screen.getByRole('button', { name: /verify.*sign in/i });
      
      fireEvent.change(codeInput, { target: { value: '123456' } });
      fireEvent.click(verifyButton);
      
      await waitFor(() => {
        expect(mockConfirmPhoneSignIn).toHaveBeenCalledWith('test-id', '123456');
      });
    });
  });

  describe('Navigation', () => {
    it('redirects to family tree on successful login with verified email', async () => {
      const mockUser = { uid: '123', emailVerified: true };
      
      (useAuth as jest.Mock).mockReturnValue({
        signIn: mockSignIn,
        signInWithGoogle: mockSignInWithGoogle,
        signInWithPhone: mockSignInWithPhone,
        confirmPhoneSignIn: mockConfirmPhoneSignIn,
        currentUser: mockUser,
        firestoreUser: null,
      });
      
      render(<LoginPage />);
      
      await waitFor(() => {
        expect(mockRouter.push).toHaveBeenCalledWith('/family-tree');
      });
    });

    it('redirects to email verification for unverified users', async () => {
      const mockUser = { uid: '123', emailVerified: false };
      
      (useAuth as jest.Mock).mockReturnValue({
        signIn: mockSignIn,
        signInWithGoogle: mockSignInWithGoogle,
        signInWithPhone: mockSignInWithPhone,
        confirmPhoneSignIn: mockConfirmPhoneSignIn,
        currentUser: mockUser,
        firestoreUser: { phoneNumberVerified: false },
      });
      
      render(<LoginPage />);
      
      await waitFor(() => {
        expect(mockToast).toHaveBeenCalledWith(expect.objectContaining({
          title: 'Email verification required',
        }));
        expect(mockRouter.push).toHaveBeenCalledWith('/verify-email');
      });
    });

    it('has link to sign up page', () => {
      render(<LoginPage />);
      
      const signUpLink = screen.getByRole('link', { name: /sign up/i });
      expect(signUpLink).toHaveAttribute('href', '/signup');
    });

    it('has link to forgot password page', () => {
      render(<LoginPage />);
      
      const forgotPasswordLink = screen.getByRole('link', { name: /forgot password/i });
      expect(forgotPasswordLink).toHaveAttribute('href', '/forgot-password');
    });
  });
});