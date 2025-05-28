import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { useRouter } from 'next/navigation';
import SignUpPage from '@/app/signup/page';
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

describe('SignUpPage', () => {
  const mockRouter = {
    push: jest.fn(),
    replace: jest.fn(),
  };
  
  const mockToast = jest.fn();
  const mockSignUp = jest.fn();
  const mockSignInWithGoogle = jest.fn();
  
  beforeEach(() => {
    jest.clearAllMocks();
    
    (useRouter as jest.Mock).mockReturnValue(mockRouter);
    (useToast as jest.Mock).mockReturnValue({ toast: mockToast });
    (useAuth as jest.Mock).mockReturnValue({
      signUp: mockSignUp,
      signInWithGoogle: mockSignInWithGoogle,
      currentUser: null,
    });
  });

  describe('Form Rendering', () => {
    it('renders signup form with all required fields', () => {
      render(<SignUpPage />);
      
      expect(screen.getByLabelText(/first name/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/last name/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/email/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/^password$/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/confirm password/i)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /sign up/i })).toBeInTheDocument();
    });
  });

  describe('Form Validation', () => {
    it('validates required fields', async () => {
      render(<SignUpPage />);
      
      const submitButton = screen.getByRole('button', { name: /sign up/i });
      fireEvent.click(submitButton);
      
      await waitFor(() => {
        expect(screen.getByText(/first name is required/i)).toBeInTheDocument();
        expect(screen.getByText(/last name is required/i)).toBeInTheDocument();
        expect(screen.getByText(/email is required/i)).toBeInTheDocument();
        expect(screen.getByText(/password is required/i)).toBeInTheDocument();
      });
      
      expect(mockSignUp).not.toHaveBeenCalled();
    });

    it('validates email format', async () => {
      render(<SignUpPage />);
      
      const emailInput = screen.getByLabelText(/email/i);
      fireEvent.change(emailInput, { target: { value: 'invalid-email' } });
      
      const submitButton = screen.getByRole('button', { name: /sign up/i });
      fireEvent.click(submitButton);
      
      await waitFor(() => {
        expect(screen.getByText(/invalid email address/i)).toBeInTheDocument();
      });
      
      expect(mockSignUp).not.toHaveBeenCalled();
    });

    it('validates password strength', async () => {
      render(<SignUpPage />);
      
      const passwordInput = screen.getByLabelText(/^password$/i);
      fireEvent.change(passwordInput, { target: { value: 'weak' } });
      
      const submitButton = screen.getByRole('button', { name: /sign up/i });
      fireEvent.click(submitButton);
      
      await waitFor(() => {
        expect(screen.getByText(/password must be at least 8 characters/i)).toBeInTheDocument();
      });
      
      expect(mockSignUp).not.toHaveBeenCalled();
    });

    it('validates password confirmation match', async () => {
      render(<SignUpPage />);
      
      const passwordInput = screen.getByLabelText(/^password$/i);
      const confirmPasswordInput = screen.getByLabelText(/confirm password/i);
      
      fireEvent.change(passwordInput, { target: { value: 'ValidPassword123!' } });
      fireEvent.change(confirmPasswordInput, { target: { value: 'DifferentPassword123!' } });
      
      const submitButton = screen.getByRole('button', { name: /sign up/i });
      fireEvent.click(submitButton);
      
      await waitFor(() => {
        expect(screen.getByText(/passwords do not match/i)).toBeInTheDocument();
      });
      
      expect(mockSignUp).not.toHaveBeenCalled();
    });
  });

  describe('Successful Sign Up', () => {
    it('handles successful registration', async () => {
      mockSignUp.mockResolvedValue({ user: { uid: '123', emailVerified: false } });
      
      render(<SignUpPage />);
      
      // Fill in the form
      fireEvent.change(screen.getByLabelText(/first name/i), { target: { value: 'John' } });
      fireEvent.change(screen.getByLabelText(/last name/i), { target: { value: 'Doe' } });
      fireEvent.change(screen.getByLabelText(/email/i), { target: { value: 'john@example.com' } });
      fireEvent.change(screen.getByLabelText(/^password$/i), { target: { value: 'ValidPassword123!' } });
      fireEvent.change(screen.getByLabelText(/confirm password/i), { target: { value: 'ValidPassword123!' } });
      
      const submitButton = screen.getByRole('button', { name: /sign up/i });
      fireEvent.click(submitButton);
      
      await waitFor(() => {
        expect(mockSignUp).toHaveBeenCalledWith({
          email: 'john@example.com',
          password: 'ValidPassword123!',
          firstName: 'John',
          lastName: 'Doe',
        });
        expect(mockToast).toHaveBeenCalledWith(expect.objectContaining({
          title: 'Account created successfully',
          description: 'Please check your email to verify your account.',
        }));
        expect(mockRouter.push).toHaveBeenCalledWith('/verify-email');
      });
    });

    it('shows loading state during sign up', async () => {
      mockSignUp.mockImplementation(() => new Promise(resolve => setTimeout(resolve, 100)));
      
      render(<SignUpPage />);
      
      // Fill in the form
      fireEvent.change(screen.getByLabelText(/first name/i), { target: { value: 'John' } });
      fireEvent.change(screen.getByLabelText(/last name/i), { target: { value: 'Doe' } });
      fireEvent.change(screen.getByLabelText(/email/i), { target: { value: 'john@example.com' } });
      fireEvent.change(screen.getByLabelText(/^password$/i), { target: { value: 'ValidPassword123!' } });
      fireEvent.change(screen.getByLabelText(/confirm password/i), { target: { value: 'ValidPassword123!' } });
      
      const submitButton = screen.getByRole('button', { name: /sign up/i });
      fireEvent.click(submitButton);
      
      expect(screen.getByTestId('loading-spinner')).toBeInTheDocument();
      expect(submitButton).toBeDisabled();
    });
  });

  describe('Error Handling', () => {
    it('handles email already in use error', async () => {
      const error = new Error('auth/email-already-in-use');
      mockSignUp.mockRejectedValue(error);
      
      render(<SignUpPage />);
      
      // Fill in the form
      fireEvent.change(screen.getByLabelText(/first name/i), { target: { value: 'John' } });
      fireEvent.change(screen.getByLabelText(/last name/i), { target: { value: 'Doe' } });
      fireEvent.change(screen.getByLabelText(/email/i), { target: { value: 'john@example.com' } });
      fireEvent.change(screen.getByLabelText(/^password$/i), { target: { value: 'ValidPassword123!' } });
      fireEvent.change(screen.getByLabelText(/confirm password/i), { target: { value: 'ValidPassword123!' } });
      
      const submitButton = screen.getByRole('button', { name: /sign up/i });
      fireEvent.click(submitButton);
      
      await waitFor(() => {
        expect(mockToast).toHaveBeenCalledWith(expect.objectContaining({
          title: 'Sign-up failed',
          description: expect.stringContaining('already in use'),
          variant: 'destructive',
        }));
      });
    });

    it('handles generic sign up errors', async () => {
      const errorMessage = 'Network error';
      mockSignUp.mockRejectedValue(new Error(errorMessage));
      
      render(<SignUpPage />);
      
      // Fill in the form
      fireEvent.change(screen.getByLabelText(/first name/i), { target: { value: 'John' } });
      fireEvent.change(screen.getByLabelText(/last name/i), { target: { value: 'Doe' } });
      fireEvent.change(screen.getByLabelText(/email/i), { target: { value: 'john@example.com' } });
      fireEvent.change(screen.getByLabelText(/^password$/i), { target: { value: 'ValidPassword123!' } });
      fireEvent.change(screen.getByLabelText(/confirm password/i), { target: { value: 'ValidPassword123!' } });
      
      const submitButton = screen.getByRole('button', { name: /sign up/i });
      fireEvent.click(submitButton);
      
      await waitFor(() => {
        expect(mockToast).toHaveBeenCalledWith(expect.objectContaining({
          title: 'Sign-up failed',
          description: errorMessage,
          variant: 'destructive',
        }));
      });
    });
  });

  describe('Google Sign Up', () => {
    it('handles Google sign up', async () => {
      mockSignInWithGoogle.mockResolvedValue({ user: { uid: '123' } });
      
      render(<SignUpPage />);
      
      const googleButton = screen.getByRole('button', { name: /sign up with google/i });
      fireEvent.click(googleButton);
      
      await waitFor(() => {
        expect(mockSignInWithGoogle).toHaveBeenCalled();
      });
    });

    it('handles Google sign up errors', async () => {
      const errorMessage = 'Google sign up failed';
      mockSignInWithGoogle.mockRejectedValue(new Error(errorMessage));
      
      render(<SignUpPage />);
      
      const googleButton = screen.getByRole('button', { name: /sign up with google/i });
      fireEvent.click(googleButton);
      
      await waitFor(() => {
        expect(mockToast).toHaveBeenCalledWith(expect.objectContaining({
          title: 'Google sign-up failed',
          description: errorMessage,
          variant: 'destructive',
        }));
      });
    });
  });

  describe('Navigation', () => {
    it('has link to login page', () => {
      render(<SignUpPage />);
      
      const loginLink = screen.getByRole('link', { name: /log in/i });
      expect(loginLink).toHaveAttribute('href', '/login');
    });

    it('redirects authenticated users', async () => {
      (useAuth as jest.Mock).mockReturnValue({
        signUp: mockSignUp,
        signInWithGoogle: mockSignInWithGoogle,
        currentUser: { uid: '123', emailVerified: true },
      });
      
      render(<SignUpPage />);
      
      await waitFor(() => {
        expect(mockRouter.push).toHaveBeenCalledWith('/family-tree');
      });
    });
  });

  describe('Password Strength Indicator', () => {
    it('shows password strength feedback', () => {
      render(<SignUpPage />);
      
      const passwordInput = screen.getByLabelText(/^password$/i);
      
      // Weak password
      fireEvent.change(passwordInput, { target: { value: 'weak' } });
      expect(screen.getByText(/weak/i)).toBeInTheDocument();
      
      // Medium password
      fireEvent.change(passwordInput, { target: { value: 'Medium123' } });
      expect(screen.getByText(/medium/i)).toBeInTheDocument();
      
      // Strong password
      fireEvent.change(passwordInput, { target: { value: 'StrongPassword123!' } });
      expect(screen.getByText(/strong/i)).toBeInTheDocument();
    });
  });
});