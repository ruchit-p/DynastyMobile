import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { Alert } from 'react-native';
import SignInScreen from '../../../app/(auth)/signIn';
import { useAuth } from '../../../src/contexts/AuthContext';

// Mock dependencies
jest.mock('../../../src/contexts/AuthContext');

// Get router mock from setup
const router = require('expo-router').useRouter();

const mockSignIn = jest.fn();
const mockSignInWithGoogle = jest.fn();
const mockSignInWithApple = jest.fn();

describe('SignInScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    
    (useAuth as jest.Mock).mockReturnValue({
      signIn: mockSignIn,
      signInWithGoogle: mockSignInWithGoogle,
      signInWithApple: mockSignInWithApple,
      isLoading: false,
    });
  });

  it('renders sign in form correctly', () => {
    const { getByPlaceholderText, getByText } = render(<SignInScreen />);
    
    expect(getByText('Welcome back')).toBeTruthy();
    expect(getByText('Sign in to continue to Dynasty')).toBeTruthy();
    expect(getByPlaceholderText('Email')).toBeTruthy();
    expect(getByPlaceholderText('Password')).toBeTruthy();
    expect(getByText('Sign In')).toBeTruthy();
  });

  it('shows social sign-in buttons', () => {
    const { getByTestId } = render(<SignInScreen />);
    
    expect(getByTestId('google-sign-in-button')).toBeTruthy();
    expect(getByTestId('apple-sign-in-button')).toBeTruthy();
  });

  it('validates email format', async () => {
    const { getByPlaceholderText, getByText } = render(<SignInScreen />);
    
    const emailInput = getByPlaceholderText('Email');
    const passwordInput = getByPlaceholderText('Password');
    const signInButton = getByText('Sign In');
    
    fireEvent.changeText(emailInput, 'invalid-email');
    fireEvent.changeText(passwordInput, 'password123');
    fireEvent.press(signInButton);
    
    await waitFor(() => {
      expect(Alert.alert).toHaveBeenCalledWith(
        'Invalid Email',
        'Please enter a valid email address.'
      );
    });
  });

  it('validates required fields', async () => {
    const { getByText } = render(<SignInScreen />);
    
    const signInButton = getByText('Sign In');
    fireEvent.press(signInButton);
    
    await waitFor(() => {
      expect(Alert.alert).toHaveBeenCalledWith(
        'Required Fields',
        'Please enter your email and password.'
      );
    });
  });

  it('signs in successfully with email and password', async () => {
    mockSignIn.mockResolvedValue({ user: { uid: 'user-123' } });
    
    const { getByPlaceholderText, getByText } = render(<SignInScreen />);
    
    const emailInput = getByPlaceholderText('Email');
    const passwordInput = getByPlaceholderText('Password');
    const signInButton = getByText('Sign In');
    
    fireEvent.changeText(emailInput, 'test@example.com');
    fireEvent.changeText(passwordInput, 'password123');
    fireEvent.press(signInButton);
    
    await waitFor(() => {
      expect(mockSignIn).toHaveBeenCalledWith('test@example.com', 'password123');
    });
  });

  it('shows loading state during sign in', async () => {
    mockSignIn.mockImplementation(
      () => new Promise(resolve => setTimeout(resolve, 100))
    );
    
    const { getByPlaceholderText, getByText, getByTestId } = render(<SignInScreen />);
    
    const emailInput = getByPlaceholderText('Email');
    const passwordInput = getByPlaceholderText('Password');
    const signInButton = getByText('Sign In');
    
    fireEvent.changeText(emailInput, 'test@example.com');
    fireEvent.changeText(passwordInput, 'password123');
    fireEvent.press(signInButton);
    
    expect(getByTestId('sign-in-loading')).toBeTruthy();
    
    await waitFor(() => {
      expect(mockSignIn).toHaveBeenCalled();
    });
  });

  it('handles sign in errors', async () => {
    const error = new Error('auth/user-not-found');
    mockSignIn.mockRejectedValue(error);
    
    const { getByPlaceholderText, getByText } = render(<SignInScreen />);
    
    const emailInput = getByPlaceholderText('Email');
    const passwordInput = getByPlaceholderText('Password');
    const signInButton = getByText('Sign In');
    
    fireEvent.changeText(emailInput, 'test@example.com');
    fireEvent.changeText(passwordInput, 'password123');
    fireEvent.press(signInButton);
    
    await waitFor(() => {
      expect(Alert.alert).toHaveBeenCalledWith(
        'Sign In Failed',
        expect.stringContaining('user')
      );
    });
  });

  it('signs in with Google', async () => {
    mockSignInWithGoogle.mockResolvedValue({ user: { uid: 'user-123' } });
    
    const { getByTestId } = render(<SignInScreen />);
    
    const googleButton = getByTestId('google-sign-in-button');
    fireEvent.press(googleButton);
    
    await waitFor(() => {
      expect(mockSignInWithGoogle).toHaveBeenCalled();
    });
  });

  it('signs in with Apple', async () => {
    mockSignInWithApple.mockResolvedValue({ user: { uid: 'user-123' } });
    
    const { getByTestId } = render(<SignInScreen />);
    
    const appleButton = getByTestId('apple-sign-in-button');
    fireEvent.press(appleButton);
    
    await waitFor(() => {
      expect(mockSignInWithApple).toHaveBeenCalled();
    });
  });

  it('toggles password visibility', () => {
    const { getByPlaceholderText, getByTestId } = render(<SignInScreen />);
    
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

  it('navigates to forgot password', () => {
    const { getByText } = render(<SignInScreen />);
    
    const forgotPasswordLink = getByText('Forgot Password?');
    fireEvent.press(forgotPasswordLink);
    
    expect(router.push).toHaveBeenCalledWith('/forgotPassword');
  });

  it('navigates to sign up', () => {
    const { getByText } = render(<SignInScreen />);
    
    const signUpLink = getByText('Sign Up');
    fireEvent.press(signUpLink);
    
    expect(router.push).toHaveBeenCalledWith('/signUp');
  });

  it('navigates to phone sign in', () => {
    const { getByText } = render(<SignInScreen />);
    
    const phoneSignInLink = getByText('Sign in with Phone');
    fireEvent.press(phoneSignInLink);
    
    expect(router.push).toHaveBeenCalledWith('/phoneSignIn');
  });

  it('disables inputs while loading', () => {
    (useAuth as jest.Mock).mockReturnValue({
      signIn: mockSignIn,
      signInWithGoogle: mockSignInWithGoogle,
      signInWithApple: mockSignInWithApple,
      isLoading: true,
    });
    
    const { getByPlaceholderText, getByText } = render(<SignInScreen />);
    
    const emailInput = getByPlaceholderText('Email');
    const passwordInput = getByPlaceholderText('Password');
    const signInButton = getByText('Sign In');
    
    expect(emailInput.props.editable).toBe(false);
    expect(passwordInput.props.editable).toBe(false);
    expect(signInButton.props.disabled).toBe(true);
  });

  it('handles network errors', async () => {
    const error = new Error('Network error');
    mockSignIn.mockRejectedValue(error);
    
    const { getByPlaceholderText, getByText } = render(<SignInScreen />);
    
    const emailInput = getByPlaceholderText('Email');
    const passwordInput = getByPlaceholderText('Password');
    const signInButton = getByText('Sign In');
    
    fireEvent.changeText(emailInput, 'test@example.com');
    fireEvent.changeText(passwordInput, 'password123');
    fireEvent.press(signInButton);
    
    await waitFor(() => {
      expect(Alert.alert).toHaveBeenCalledWith(
        'Network Error',
        'Please check your internet connection and try again.'
      );
    });
  });
});