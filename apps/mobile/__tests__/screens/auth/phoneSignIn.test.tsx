import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { Alert } from 'react-native';
import PhoneSignInScreen from '../../../app/(auth)/phoneSignIn';
import { useAuth } from '../../../src/contexts/AuthContext';

// Mock dependencies
jest.mock('../../../src/contexts/AuthContext');

// Get router mock from setup
const router = require('expo-router').useRouter();

const mockSignInWithPhoneNumber = jest.fn();

describe('PhoneSignInScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    
    (useAuth as jest.Mock).mockReturnValue({
      signInWithPhoneNumber: mockSignInWithPhoneNumber,
      isLoading: false,
    });
  });

  it('renders phone input form correctly', () => {
    const { getByText, getByTestId } = render(<PhoneSignInScreen />);
    
    expect(getByText('Sign in with Phone')).toBeTruthy();
    expect(getByText('Enter your phone number to receive a verification code')).toBeTruthy();
    expect(getByTestId('phone-input')).toBeTruthy();
    expect(getByText('Send Code')).toBeTruthy();
  });

  it('validates phone number format', async () => {
    const { getByTestId, getByText } = render(<PhoneSignInScreen />);
    
    const phoneInput = getByTestId('phone-input');
    const sendButton = getByText('Send Code');
    
    // Invalid phone number
    fireEvent.changeText(phoneInput, '123');
    fireEvent.press(sendButton);
    
    await waitFor(() => {
      expect(Alert.alert).toHaveBeenCalledWith(
        'Invalid Phone Number',
        'Please enter a valid phone number.'
      );
    });
  });

  it('validates required phone number', async () => {
    const { getByText } = render(<PhoneSignInScreen />);
    
    const sendButton = getByText('Send Code');
    fireEvent.press(sendButton);
    
    await waitFor(() => {
      expect(Alert.alert).toHaveBeenCalledWith(
        'Required',
        'Please enter your phone number.'
      );
    });
  });

  it('formats phone number as user types', () => {
    const { getByTestId } = render(<PhoneSignInScreen />);
    
    const phoneInput = getByTestId('phone-input');
    
    // Type unformatted number
    fireEvent.changeText(phoneInput, '1234567890');
    
    // Should be formatted
    expect(phoneInput.props.value).toBe('(123) 456-7890');
  });

  it('sends verification code successfully', async () => {
    const mockConfirmation = {
      verificationId: 'verification-123',
      confirm: jest.fn(),
    };
    
    mockSignInWithPhoneNumber.mockResolvedValue(mockConfirmation);
    
    const { getByTestId, getByText } = render(<PhoneSignInScreen />);
    
    const phoneInput = getByTestId('phone-input');
    const sendButton = getByText('Send Code');
    
    fireEvent.changeText(phoneInput, '+1234567890');
    fireEvent.press(sendButton);
    
    await waitFor(() => {
      expect(mockSignInWithPhoneNumber).toHaveBeenCalledWith('+1234567890');
      expect(router.push).toHaveBeenCalledWith({
        pathname: '/verifyOtp',
        params: { phoneNumber: '+1234567890' },
      });
    });
  });

  it('shows loading state while sending code', async () => {
    mockSignInWithPhoneNumber.mockImplementation(
      () => new Promise(resolve => setTimeout(resolve, 100))
    );
    
    const { getByTestId, getByText } = render(<PhoneSignInScreen />);
    
    const phoneInput = getByTestId('phone-input');
    const sendButton = getByText('Send Code');
    
    fireEvent.changeText(phoneInput, '+1234567890');
    fireEvent.press(sendButton);
    
    expect(getByTestId('sending-code-loading')).toBeTruthy();
    
    await waitFor(() => {
      expect(mockSignInWithPhoneNumber).toHaveBeenCalled();
    });
  });

  it('handles phone auth errors', async () => {
    const error = new Error('auth/invalid-phone-number');
    mockSignInWithPhoneNumber.mockRejectedValue(error);
    
    const { getByTestId, getByText } = render(<PhoneSignInScreen />);
    
    const phoneInput = getByTestId('phone-input');
    const sendButton = getByText('Send Code');
    
    fireEvent.changeText(phoneInput, '+1234567890');
    fireEvent.press(sendButton);
    
    await waitFor(() => {
      expect(Alert.alert).toHaveBeenCalledWith(
        'Phone Sign In Failed',
        expect.stringContaining('phone number')
      );
    });
  });

  it('shows country picker', () => {
    const { getByTestId } = render(<PhoneSignInScreen />);
    
    const countryPicker = getByTestId('country-picker');
    expect(countryPicker).toBeTruthy();
    
    // Default to US
    expect(countryPicker.props.value).toBe('US');
  });

  it('changes country code', () => {
    const { getByTestId } = render(<PhoneSignInScreen />);
    
    const countryPicker = getByTestId('country-picker');
    
    // Change to UK
    fireEvent(countryPicker, 'onSelectCountry', { callingCode: ['44'], cca2: 'GB' });
    
    expect(getByTestId('country-code-text').props.children).toBe('+44');
  });

  it('handles rate limiting', async () => {
    const error = new Error('auth/too-many-requests');
    mockSignInWithPhoneNumber.mockRejectedValue(error);
    
    const { getByTestId, getByText } = render(<PhoneSignInScreen />);
    
    const phoneInput = getByTestId('phone-input');
    const sendButton = getByText('Send Code');
    
    fireEvent.changeText(phoneInput, '+1234567890');
    fireEvent.press(sendButton);
    
    await waitFor(() => {
      expect(Alert.alert).toHaveBeenCalledWith(
        'Too Many Attempts',
        expect.stringContaining('try again later')
      );
    });
  });

  it('navigates back when pressing back button', () => {
    const { getByTestId } = render(<PhoneSignInScreen />);
    
    const backButton = getByTestId('back-button');
    fireEvent.press(backButton);
    
    expect(router.back).toHaveBeenCalled();
  });

  it('disables input while loading', () => {
    (useAuth as jest.Mock).mockReturnValue({
      signInWithPhoneNumber: mockSignInWithPhoneNumber,
      isLoading: true,
    });
    
    const { getByTestId, getByText } = render(<PhoneSignInScreen />);
    
    const phoneInput = getByTestId('phone-input');
    const sendButton = getByText('Send Code');
    
    expect(phoneInput.props.editable).toBe(false);
    expect(sendButton.props.disabled).toBe(true);
  });

  it('shows alternative sign in methods', () => {
    const { getByText } = render(<PhoneSignInScreen />);
    
    expect(getByText('Sign in with Email instead')).toBeTruthy();
    
    const emailLink = getByText('Sign in with Email instead');
    fireEvent.press(emailLink);
    
    expect(router.push).toHaveBeenCalledWith('/signIn');
  });

  it('shows terms and privacy links', () => {
    const { getByText } = render(<PhoneSignInScreen />);
    
    expect(getByText(/By continuing, you agree to our/)).toBeTruthy();
    expect(getByText('Terms')).toBeTruthy();
    expect(getByText('Privacy Policy')).toBeTruthy();
  });

  it('allows manual country code input', () => {
    const { getByTestId } = render(<PhoneSignInScreen />);
    
    const manualCodeSwitch = getByTestId('manual-code-switch');
    fireEvent(manualCodeSwitch, 'onValueChange', true);
    
    const codeInput = getByTestId('manual-code-input');
    expect(codeInput).toBeTruthy();
    
    fireEvent.changeText(codeInput, '+91');
    expect(codeInput.props.value).toBe('+91');
  });

  it('validates international phone numbers', async () => {
    const { getByTestId, getByText } = render(<PhoneSignInScreen />);
    
    const countryPicker = getByTestId('country-picker');
    const phoneInput = getByTestId('phone-input');
    const sendButton = getByText('Send Code');
    
    // Change to India
    fireEvent(countryPicker, 'onSelectCountry', { callingCode: ['91'], cca2: 'IN' });
    
    // Enter Indian phone number
    fireEvent.changeText(phoneInput, '9876543210'); // 10 digit Indian number
    fireEvent.press(sendButton);
    
    await waitFor(() => {
      expect(mockSignInWithPhoneNumber).toHaveBeenCalledWith('+919876543210');
    });
  });
});