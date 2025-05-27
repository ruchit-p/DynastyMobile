import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { Alert } from 'react-native';
import VerifyOtpScreen from '../../../app/(auth)/verifyOtp';
import { useAuth } from '../../../src/contexts/AuthContext';
import { useLocalSearchParams, useRouter } from 'expo-router';

// Mock dependencies
jest.mock('../../../src/contexts/AuthContext');
jest.mock('expo-router');

// Get router mock from setup
const router = useRouter() as jest.MockedFunction<typeof useRouter>;

// Setup mocks
(useLocalSearchParams as jest.Mock).mockReturnValue({ phoneNumber: '+1234567890' });

const mockConfirmPhoneCode = jest.fn();
const mockSignInWithPhoneNumber = jest.fn();
const mockClearPhoneAuth = jest.fn();

const mockPhoneAuthConfirmation = {
  confirm: jest.fn(),
  verificationId: 'test-verification-id',
};

describe('VerifyOtpScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    
    (useAuth as jest.Mock).mockReturnValue({
      confirmPhoneCode: mockConfirmPhoneCode,
      signInWithPhoneNumber: mockSignInWithPhoneNumber,
      clearPhoneAuth: mockClearPhoneAuth,
      phoneAuthConfirmation: mockPhoneAuthConfirmation,
      phoneNumberInProgress: '+1234567890',
      isLoading: false,
    });
  });

  it('renders OTP input correctly', () => {
    const { getByText, getAllByTestId } = render(<VerifyOtpScreen />);
    
    expect(getByText('Verify Phone Number')).toBeTruthy();
    expect(getByText(/sent to \+1234567890/)).toBeTruthy();
    
    // Should have 6 OTP input boxes
    const otpInputs = getAllByTestId(/otp-input-\d/);
    expect(otpInputs).toHaveLength(6);
  });

  it('auto-focuses first input', () => {
    const { getByTestId } = render(<VerifyOtpScreen />);
    
    const firstInput = getByTestId('otp-input-0');
    expect(firstInput.props.autoFocus).toBe(true);
  });

  it('moves focus to next input on typing', () => {
    const { getByTestId } = render(<VerifyOtpScreen />);
    
    const firstInput = getByTestId('otp-input-0');
    const secondInput = getByTestId('otp-input-1');
    
    fireEvent.changeText(firstInput, '1');
    
    // Second input should now be focused
    expect(secondInput.props.focus).toBe(true);
  });

  it('moves focus to previous input on backspace', () => {
    const { getByTestId } = render(<VerifyOtpScreen />);
    
    const firstInput = getByTestId('otp-input-0');
    const secondInput = getByTestId('otp-input-1');
    
    // Type in first input
    fireEvent.changeText(firstInput, '1');
    
    // Press backspace in second input
    fireEvent(secondInput, 'onKeyPress', { nativeEvent: { key: 'Backspace' } });
    
    // First input should be focused again
    expect(firstInput.props.focus).toBe(true);
  });

  it('validates OTP length', async () => {
    const { getByTestId, getByText } = render(<VerifyOtpScreen />);
    
    const verifyButton = getByText('Verify');
    
    // Enter incomplete OTP
    fireEvent.changeText(getByTestId('otp-input-0'), '1');
    fireEvent.changeText(getByTestId('otp-input-1'), '2');
    fireEvent.changeText(getByTestId('otp-input-2'), '3');
    
    fireEvent.press(verifyButton);
    
    await waitFor(() => {
      expect(Alert.alert).toHaveBeenCalledWith(
        'Invalid Code',
        'Please enter the complete 6-digit code.'
      );
    });
  });

  it('verifies OTP successfully', async () => {
    mockConfirmPhoneCode.mockResolvedValue(undefined);
    
    const { getByTestId, getByText } = render(<VerifyOtpScreen />);
    
    // Enter complete OTP
    fireEvent.changeText(getByTestId('otp-input-0'), '1');
    fireEvent.changeText(getByTestId('otp-input-1'), '2');
    fireEvent.changeText(getByTestId('otp-input-2'), '3');
    fireEvent.changeText(getByTestId('otp-input-3'), '4');
    fireEvent.changeText(getByTestId('otp-input-4'), '5');
    fireEvent.changeText(getByTestId('otp-input-5'), '6');
    
    const verifyButton = getByText('Verify');
    fireEvent.press(verifyButton);
    
    await waitFor(() => {
      expect(mockConfirmPhoneCode).toHaveBeenCalledWith('+1234567890', '123456');
    });
  });

  it('auto-submits when all digits entered', async () => {
    mockConfirmPhoneCode.mockResolvedValue(undefined);
    
    const { getByTestId } = render(<VerifyOtpScreen />);
    
    // Enter complete OTP
    fireEvent.changeText(getByTestId('otp-input-0'), '1');
    fireEvent.changeText(getByTestId('otp-input-1'), '2');
    fireEvent.changeText(getByTestId('otp-input-2'), '3');
    fireEvent.changeText(getByTestId('otp-input-3'), '4');
    fireEvent.changeText(getByTestId('otp-input-4'), '5');
    fireEvent.changeText(getByTestId('otp-input-5'), '6');
    
    // Should auto-submit without pressing verify button
    await waitFor(() => {
      expect(mockConfirmPhoneCode).toHaveBeenCalledWith('+1234567890', '123456');
    });
  });

  it('shows loading state during verification', async () => {
    mockConfirmPhoneCode.mockImplementation(
      () => new Promise(resolve => setTimeout(resolve, 100))
    );
    
    const { getByTestId, getByText } = render(<VerifyOtpScreen />);
    
    // Enter OTP
    for (let i = 0; i < 6; i++) {
      fireEvent.changeText(getByTestId(`otp-input-${i}`), String(i + 1));
    }
    
    const verifyButton = getByText('Verify');
    fireEvent.press(verifyButton);
    
    expect(getByTestId('verify-loading')).toBeTruthy();
    
    await waitFor(() => {
      expect(mockConfirmPhoneCode).toHaveBeenCalled();
    });
  });

  it('handles verification errors', async () => {
    const error = new Error('auth/invalid-verification-code');
    mockConfirmPhoneCode.mockRejectedValue(error);
    
    const { getByTestId, getByText } = render(<VerifyOtpScreen />);
    
    // Enter OTP
    for (let i = 0; i < 6; i++) {
      fireEvent.changeText(getByTestId(`otp-input-${i}`), String(i + 1));
    }
    
    const verifyButton = getByText('Verify');
    fireEvent.press(verifyButton);
    
    await waitFor(() => {
      expect(Alert.alert).toHaveBeenCalledWith(
        'Verification Failed',
        expect.stringContaining('code')
      );
    });
  });

  it('resends OTP code', async () => {
    mockSignInWithPhoneNumber.mockResolvedValue(mockPhoneAuthConfirmation);
    
    const { getByText } = render(<VerifyOtpScreen />);
    
    const resendButton = getByText('Resend Code');
    fireEvent.press(resendButton);
    
    await waitFor(() => {
      expect(mockSignInWithPhoneNumber).toHaveBeenCalledWith('+1234567890');
      expect(Alert.alert).toHaveBeenCalledWith(
        'Code Sent',
        'A new verification code has been sent.'
      );
    });
  });

  it('shows resend timer', async () => {
    const { getByText, queryByText } = render(<VerifyOtpScreen />);
    
    // Initially shows timer
    expect(getByText(/Resend code in \d+ seconds/)).toBeTruthy();
    expect(queryByText('Resend Code')).toBeNull();
    
    // Wait for timer to expire (mock timer)
    jest.advanceTimersByTime(60000);
    
    await waitFor(() => {
      expect(queryByText(/Resend code in/)).toBeNull();
      expect(getByText('Resend Code')).toBeTruthy();
    });
  });

  it('handles paste functionality', async () => {
    const { getByTestId } = render(<VerifyOtpScreen />);
    
    const firstInput = getByTestId('otp-input-0');
    
    // Simulate pasting full OTP
    fireEvent.changeText(firstInput, '123456');
    
    // Should distribute digits across all inputs
    await waitFor(() => {
      for (let i = 0; i < 6; i++) {
        const input = getByTestId(`otp-input-${i}`);
        expect(input.props.value).toBe(String(i + 1));
      }
    });
  });

  it('only accepts numeric input', () => {
    const { getByTestId } = render(<VerifyOtpScreen />);
    
    const firstInput = getByTestId('otp-input-0');
    
    // Try to enter non-numeric characters
    fireEvent.changeText(firstInput, 'a');
    expect(firstInput.props.value).toBe('');
    
    // Enter numeric character
    fireEvent.changeText(firstInput, '1');
    expect(firstInput.props.value).toBe('1');
  });

  it('clears all inputs on error', async () => {
    const error = new Error('auth/invalid-verification-code');
    mockConfirmPhoneCode.mockRejectedValue(error);
    
    const { getByTestId } = render(<VerifyOtpScreen />);
    
    // Enter OTP
    for (let i = 0; i < 6; i++) {
      fireEvent.changeText(getByTestId(`otp-input-${i}`), String(i + 1));
    }
    
    // Submit
    await waitFor(() => {
      expect(mockConfirmPhoneCode).toHaveBeenCalled();
    });
    
    // All inputs should be cleared after error
    for (let i = 0; i < 6; i++) {
      const input = getByTestId(`otp-input-${i}`);
      expect(input.props.value).toBe('');
    }
  });

  it('navigates back and clears auth state', () => {
    const { getByTestId } = render(<VerifyOtpScreen />);
    
    const backButton = getByTestId('back-button');
    fireEvent.press(backButton);
    
    expect(mockClearPhoneAuth).toHaveBeenCalled();
    expect(router.back).toHaveBeenCalled();
  });

  it('shows different phone number link', () => {
    const { getByText } = render(<VerifyOtpScreen />);
    
    const changeNumberLink = getByText('Use a different number');
    fireEvent.press(changeNumberLink);
    
    expect(mockClearPhoneAuth).toHaveBeenCalled();
    expect(router.back).toHaveBeenCalled();
  });

  it('handles session timeout', async () => {
    const error = new Error('auth/session-expired');
    mockConfirmPhoneCode.mockRejectedValue(error);
    
    const { getByTestId } = render(<VerifyOtpScreen />);
    
    // Enter OTP
    for (let i = 0; i < 6; i++) {
      fireEvent.changeText(getByTestId(`otp-input-${i}`), String(i + 1));
    }
    
    await waitFor(() => {
      expect(Alert.alert).toHaveBeenCalledWith(
        'Session Expired',
        expect.stringContaining('expired'),
        expect.arrayContaining([
          expect.objectContaining({ text: 'Resend Code' })
        ])
      );
    });
  });
});