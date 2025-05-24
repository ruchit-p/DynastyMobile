import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { Alert } from 'react-native';
import SignUpScreen from '../../../app/(auth)/signUp';
import { useAuth } from '../../../src/contexts/AuthContext';

// Mock dependencies
jest.mock('../../../src/contexts/AuthContext');

// Get router mock from setup
const router = require('expo-router').useRouter();

const mockSignUp = jest.fn();
const mockSignInWithGoogle = jest.fn();
const mockSignInWithApple = jest.fn();

describe('SignUpScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    
    (useAuth as jest.Mock).mockReturnValue({
      signUp: mockSignUp,
      signInWithGoogle: mockSignInWithGoogle,
      signInWithApple: mockSignInWithApple,
      isLoading: false,
    });
  });

  it('renders sign up form correctly', () => {
    const { getByPlaceholderText, getByText } = render(<SignUpScreen />);
    
    expect(getByText('Create Account')).toBeTruthy();
    expect(getByText('Join Dynasty to connect with your family')).toBeTruthy();
    expect(getByPlaceholderText('Email')).toBeTruthy();
    expect(getByPlaceholderText('Password')).toBeTruthy();
    expect(getByPlaceholderText('Confirm Password')).toBeTruthy();
    expect(getByText('Sign Up')).toBeTruthy();
  });

  it('shows social sign-up buttons', () => {
    const { getByTestId } = render(<SignUpScreen />);
    
    expect(getByTestId('google-sign-up-button')).toBeTruthy();
    expect(getByTestId('apple-sign-up-button')).toBeTruthy();
  });

  it('validates email format', async () => {
    const { getByPlaceholderText, getByText } = render(<SignUpScreen />);
    
    const emailInput = getByPlaceholderText('Email');
    const passwordInput = getByPlaceholderText('Password');
    const confirmPasswordInput = getByPlaceholderText('Confirm Password');
    const signUpButton = getByText('Sign Up');
    
    fireEvent.changeText(emailInput, 'invalid-email');
    fireEvent.changeText(passwordInput, 'password123');
    fireEvent.changeText(confirmPasswordInput, 'password123');
    fireEvent.press(signUpButton);
    
    await waitFor(() => {
      expect(Alert.alert).toHaveBeenCalledWith(
        'Invalid Email',
        'Please enter a valid email address.'
      );
    });
  });

  it('validates required fields', async () => {
    const { getByText } = render(<SignUpScreen />);
    
    const signUpButton = getByText('Sign Up');
    fireEvent.press(signUpButton);
    
    await waitFor(() => {
      expect(Alert.alert).toHaveBeenCalledWith(
        'Required Fields',
        'Please fill in all fields.'
      );
    });
  });

  it('validates password match', async () => {
    const { getByPlaceholderText, getByText } = render(<SignUpScreen />);
    
    const emailInput = getByPlaceholderText('Email');
    const passwordInput = getByPlaceholderText('Password');
    const confirmPasswordInput = getByPlaceholderText('Confirm Password');
    const signUpButton = getByText('Sign Up');
    
    fireEvent.changeText(emailInput, 'test@example.com');
    fireEvent.changeText(passwordInput, 'password123');
    fireEvent.changeText(confirmPasswordInput, 'password456');
    fireEvent.press(signUpButton);
    
    await waitFor(() => {
      expect(Alert.alert).toHaveBeenCalledWith(
        'Password Mismatch',
        'Passwords do not match.'
      );
    });
  });

  it('validates password strength', async () => {
    const { getByPlaceholderText, getByText } = render(<SignUpScreen />);
    
    const emailInput = getByPlaceholderText('Email');
    const passwordInput = getByPlaceholderText('Password');
    const confirmPasswordInput = getByPlaceholderText('Confirm Password');
    const signUpButton = getByText('Sign Up');
    
    fireEvent.changeText(emailInput, 'test@example.com');
    fireEvent.changeText(passwordInput, '123');
    fireEvent.changeText(confirmPasswordInput, '123');
    fireEvent.press(signUpButton);
    
    await waitFor(() => {
      expect(Alert.alert).toHaveBeenCalledWith(
        'Weak Password',
        'Password must be at least 6 characters long.'
      );
    });
  });

  it('creates account successfully', async () => {
    mockSignUp.mockResolvedValue({ user: { uid: 'user-123' } });
    
    const { getByPlaceholderText, getByText } = render(<SignUpScreen />);
    
    const emailInput = getByPlaceholderText('Email');
    const passwordInput = getByPlaceholderText('Password');
    const confirmPasswordInput = getByPlaceholderText('Confirm Password');
    const signUpButton = getByText('Sign Up');
    
    fireEvent.changeText(emailInput, 'test@example.com');
    fireEvent.changeText(passwordInput, 'password123');
    fireEvent.changeText(confirmPasswordInput, 'password123');
    fireEvent.press(signUpButton);
    
    await waitFor(() => {
      expect(mockSignUp).toHaveBeenCalledWith('test@example.com', 'password123');
      expect(router.replace).toHaveBeenCalledWith('/verifyEmail');
    });
  });

  it('shows loading state during sign up', async () => {
    mockSignUp.mockImplementation(
      () => new Promise(resolve => setTimeout(resolve, 100))
    );
    
    const { getByPlaceholderText, getByText, getByTestId } = render(<SignUpScreen />);
    
    const emailInput = getByPlaceholderText('Email');
    const passwordInput = getByPlaceholderText('Password');
    const confirmPasswordInput = getByPlaceholderText('Confirm Password');
    const signUpButton = getByText('Sign Up');
    
    fireEvent.changeText(emailInput, 'test@example.com');
    fireEvent.changeText(passwordInput, 'password123');
    fireEvent.changeText(confirmPasswordInput, 'password123');
    fireEvent.press(signUpButton);
    
    expect(getByTestId('sign-up-loading')).toBeTruthy();
    
    await waitFor(() => {
      expect(mockSignUp).toHaveBeenCalled();
    });
  });

  it('handles sign up errors', async () => {
    const error = new Error('auth/email-already-in-use');
    mockSignUp.mockRejectedValue(error);
    
    const { getByPlaceholderText, getByText } = render(<SignUpScreen />);
    
    const emailInput = getByPlaceholderText('Email');
    const passwordInput = getByPlaceholderText('Password');
    const confirmPasswordInput = getByPlaceholderText('Confirm Password');
    const signUpButton = getByText('Sign Up');
    
    fireEvent.changeText(emailInput, 'test@example.com');
    fireEvent.changeText(passwordInput, 'password123');
    fireEvent.changeText(confirmPasswordInput, 'password123');
    fireEvent.press(signUpButton);
    
    await waitFor(() => {
      expect(Alert.alert).toHaveBeenCalledWith(
        'Sign Up Failed',
        expect.stringContaining('already in use')
      );
    });
  });

  it('signs up with Google', async () => {
    mockSignInWithGoogle.mockResolvedValue({ user: { uid: 'user-123' } });
    
    const { getByTestId } = render(<SignUpScreen />);
    
    const googleButton = getByTestId('google-sign-up-button');
    fireEvent.press(googleButton);
    
    await waitFor(() => {
      expect(mockSignInWithGoogle).toHaveBeenCalled();
    });
  });

  it('signs up with Apple', async () => {
    mockSignInWithApple.mockResolvedValue({ user: { uid: 'user-123' } });
    
    const { getByTestId } = render(<SignUpScreen />);
    
    const appleButton = getByTestId('apple-sign-up-button');
    fireEvent.press(appleButton);
    
    await waitFor(() => {
      expect(mockSignInWithApple).toHaveBeenCalled();
    });
  });

  it('shows password strength indicator', () => {
    const { getByPlaceholderText, getByTestId } = render(<SignUpScreen />);
    
    const passwordInput = getByPlaceholderText('Password');
    
    // Weak password
    fireEvent.changeText(passwordInput, '123');
    expect(getByTestId('password-strength-weak')).toBeTruthy();
    
    // Medium password
    fireEvent.changeText(passwordInput, 'password123');
    expect(getByTestId('password-strength-medium')).toBeTruthy();
    
    // Strong password
    fireEvent.changeText(passwordInput, 'P@ssw0rd123!');
    expect(getByTestId('password-strength-strong')).toBeTruthy();
  });

  it('toggles password visibility', () => {
    const { getByPlaceholderText, getByTestId } = render(<SignUpScreen />);
    
    const passwordInput = getByPlaceholderText('Password');
    const toggleButton = getByTestId('toggle-password-visibility');
    
    // Initially password is hidden
    expect(passwordInput.props.secureTextEntry).toBe(true);
    
    // Toggle to show password
    fireEvent.press(toggleButton);
    expect(passwordInput.props.secureTextEntry).toBe(false);
    
    // Toggle to hide password again
    fireEvent.press(toggleButton);
    expect(passwordInput.props.secureTextEntry).toBe(true);
  });

  it('navigates to sign in', () => {
    const { getByText } = render(<SignUpScreen />);
    
    const signInLink = getByText('Sign In');
    fireEvent.press(signInLink);
    
    expect(router.push).toHaveBeenCalledWith('/signIn');
  });

  it('shows terms and privacy policy', () => {
    const { getByText } = render(<SignUpScreen />);
    
    expect(getByText(/By signing up, you agree to our/)).toBeTruthy();
    expect(getByText('Terms of Service')).toBeTruthy();
    expect(getByText('Privacy Policy')).toBeTruthy();
  });

  it('disables inputs while loading', () => {
    (useAuth as jest.Mock).mockReturnValue({
      signUp: mockSignUp,
      signInWithGoogle: mockSignInWithGoogle,
      signInWithApple: mockSignInWithApple,
      isLoading: true,
    });
    
    const { getByPlaceholderText, getByText } = render(<SignUpScreen />);
    
    const emailInput = getByPlaceholderText('Email');
    const passwordInput = getByPlaceholderText('Password');
    const confirmPasswordInput = getByPlaceholderText('Confirm Password');
    const signUpButton = getByText('Sign Up');
    
    expect(emailInput.props.editable).toBe(false);
    expect(passwordInput.props.editable).toBe(false);
    expect(confirmPasswordInput.props.editable).toBe(false);
    expect(signUpButton.props.disabled).toBe(true);
  });

  it('shows invitation code field when available', () => {
    const { getByPlaceholderText } = render(<SignUpScreen />);
    
    expect(getByPlaceholderText('Invitation Code (optional)')).toBeTruthy();
  });

  it('validates invitation code', async () => {
    mockSignUp.mockResolvedValue({ user: { uid: 'user-123' } });
    
    const { getByPlaceholderText, getByText } = render(<SignUpScreen />);
    
    const emailInput = getByPlaceholderText('Email');
    const passwordInput = getByPlaceholderText('Password');
    const confirmPasswordInput = getByPlaceholderText('Confirm Password');
    const invitationCodeInput = getByPlaceholderText('Invitation Code (optional)');
    const signUpButton = getByText('Sign Up');
    
    fireEvent.changeText(emailInput, 'test@example.com');
    fireEvent.changeText(passwordInput, 'password123');
    fireEvent.changeText(confirmPasswordInput, 'password123');
    fireEvent.changeText(invitationCodeInput, 'FAMILY123');
    fireEvent.press(signUpButton);
    
    await waitFor(() => {
      expect(mockSignUp).toHaveBeenCalledWith(
        'test@example.com', 
        'password123',
        { invitationCode: 'FAMILY123' }
      );
    });
  });
});