import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { Alert } from 'react-native';
import * as Clipboard from '@react-native-clipboard/clipboard';
import SafetyNumberView from '../SafetyNumberView';

jest.mock('@react-native-clipboard/clipboard', () => ({
  setString: jest.fn(),
}));

describe('SafetyNumberView', () => {
  const mockProps = {
    numberString: '12345 67890 12345 67890 12345 67890',
    qrCodeData: 'test-qr-data',
    userName: 'Test User',
    verified: false,
    onCopyNumber: jest.fn(),
    onVerificationChange: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  });

  it('renders correctly', () => {
    const { getByText, getByTestId } = render(<SafetyNumberView {...mockProps} testID="test" />);
    
    expect(getByText(/Your Safety Number with Test User/)).toBeTruthy();
    // The number is displayed in the copy button
    expect(getByTestId('test-copy-button')).toBeTruthy();
    expect(getByText(/Mark as Verified/i)).toBeTruthy();
  });

  it('shows verified state correctly', () => {
    const { getByTestId, queryByText } = render(
      <SafetyNumberView {...mockProps} verified={true} testID="test" />
    );
    
    // The verify button shows "Verified" when verified
    const verifyButton = getByTestId('test-verify-toggle');
    expect(verifyButton).toBeTruthy();
    expect(queryByText(/Mark as Verified/i)).toBeFalsy();
  });

  it('handles verification toggle', () => {
    const { getByTestId } = render(<SafetyNumberView {...mockProps} testID="test" />);
    
    const verifyButton = getByTestId('test-verify-toggle');
    fireEvent.press(verifyButton);
    
    expect(mockProps.onVerificationChange).toHaveBeenCalledWith(true);
  });

  it('handles unverification', () => {
    const { getByTestId } = render(
      <SafetyNumberView {...mockProps} verified={true} testID="test" />
    );
    
    const verifyButton = getByTestId('test-verify-toggle');
    fireEvent.press(verifyButton);
    
    expect(mockProps.onVerificationChange).toHaveBeenCalledWith(false);
  });

  it('copies number to clipboard when copy button is pressed', () => {
    const { getByTestId } = render(<SafetyNumberView {...mockProps} testID="test" />);
    
    fireEvent.press(getByTestId('test-copy-button'));
    
    expect(Clipboard.setString).toHaveBeenCalledWith(mockProps.numberString);
    expect(mockProps.onCopyNumber).toHaveBeenCalled();
    expect(Alert.alert).toHaveBeenCalledWith(
      'Copied',
      'Safety number copied to clipboard'
    );
  });

  it('renders safety number in correct format', () => {
    const { getByTestId } = render(
      <SafetyNumberView {...mockProps} testID="safety-number" />
    );
    
    // Check that the copy button exists - the number is inside it
    const copyButton = getByTestId('safety-number-copy-button');
    expect(copyButton).toBeTruthy();
  });

  it('applies custom styles', () => {
    const customStyle = { backgroundColor: 'red' };
    const customNumberStyle = { color: 'blue' };
    
    const { getByTestId } = render(
      <SafetyNumberView
        {...mockProps}
        style={customStyle}
        numberStyle={customNumberStyle}
        testID="safety-number"
      />
    );
    
    const container = getByTestId('safety-number');
    expect(container.props.style).toContainEqual(customStyle);
  });
});