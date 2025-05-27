import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import KeyChangeNotification from '../KeyChangeNotification';

// Mock Ionicons to make it easier to test
jest.mock('@expo/vector-icons', () => ({
  Ionicons: ({ name, size, color, ...props }) => {
    const React = require('react');
    return React.createElement('Ionicons', { name, size, color, testID: 'icon', ...props });
  },
}));

describe('KeyChangeNotification', () => {
  const mockProps = {
    userName: 'Test User',
    userId: 'test-user-id',
    timestamp: new Date('2025-01-27T10:00:00'),
    onVerify: jest.fn(),
    onDismiss: jest.fn(),
    onLearnMore: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders correctly', () => {
    const { getByText } = render(<KeyChangeNotification {...mockProps} />);
    
    expect(getByText('Safety Number Changed')).toBeTruthy();
    expect(getByText("Test User's safety number has changed. This could mean:")).toBeTruthy();
    expect(getByText('• They reinstalled Dynasty')).toBeTruthy();
    expect(getByText('• They got a new device')).toBeTruthy();
    expect(getByText('• Someone could be intercepting messages')).toBeTruthy();
  });

  it('displays timestamp when provided', () => {
    const { getByText } = render(<KeyChangeNotification {...mockProps} />);
    
    // Check if timestamp is displayed - it should show "Changed X ago"
    expect(getByText(/Changed .* ago/)).toBeTruthy();
  });

  it('handles verify button press', () => {
    const { getByText } = render(<KeyChangeNotification {...mockProps} />);
    
    fireEvent.press(getByText('Verify'));
    
    expect(mockProps.onVerify).toHaveBeenCalledTimes(1);
  });

  it('handles dismiss button press', () => {
    const { getByText } = render(<KeyChangeNotification {...mockProps} />);
    
    fireEvent.press(getByText('Dismiss'));
    
    expect(mockProps.onDismiss).toHaveBeenCalledTimes(1);
  });

  it('handles learn more link press', () => {
    const { getByText } = render(<KeyChangeNotification {...mockProps} />);
    
    fireEvent.press(getByText('Learn More'));
    
    expect(mockProps.onLearnMore).toHaveBeenCalledTimes(1);
  });

  it('renders without optional props', () => {
    const minimalProps = {
      userName: 'Test User',
      userId: 'test-user-id',
    };
    
    const { getByText, queryByText } = render(<KeyChangeNotification {...minimalProps} />);
    
    expect(getByText('Safety Number Changed')).toBeTruthy();
    expect(queryByText('Verify')).toBeFalsy();
    expect(queryByText('Dismiss')).toBeFalsy();
  });

  it('applies warning styles correctly', () => {
    const { getByTestId } = render(
      <KeyChangeNotification {...mockProps} testID="key-change-notification" />
    );
    
    const container = getByTestId('key-change-notification');
    const styles = container.props.style;
    
    // Check if it has warning background color
    expect(styles).toBeTruthy();
  });

  it('shows correct icon', () => {
    const { getAllByTestId } = render(<KeyChangeNotification {...mockProps} />);
    
    const icons = getAllByTestId('icon');
    // First icon should be the warning icon
    const warningIcon = icons[0];
    expect(warningIcon).toBeTruthy();
    expect(warningIcon.props.name).toBe('warning');
    expect(warningIcon.props.size).toBe(24);
  });
});