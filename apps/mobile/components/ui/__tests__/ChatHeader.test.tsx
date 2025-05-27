import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import ChatHeader from '../ChatHeader';

// Mock Ionicons to make it easier to test
jest.mock('@expo/vector-icons', () => ({
  Ionicons: ({ name, size, color, onPress, ...props }) => {
    const React = require('react');
    const { TouchableOpacity, Text } = require('react-native');
    if (onPress) {
      return React.createElement(TouchableOpacity, { onPress, testID: `button-${name}` }, 
        React.createElement(Text, {}, name)
      );
    }
    return React.createElement('Ionicons', { name, size, color, testID: `icon-${name}`, ...props });
  },
}));

describe('ChatHeader', () => {
  const mockProps = {
    title: 'Test User',
    subtitle: 'Online',
    isOnline: true,
    verificationStatus: 'verified' as const,
    onBackPress: jest.fn(),
    onVerificationPress: jest.fn(),
    onSearchPress: jest.fn(),
    onMediaPress: jest.fn(),
    onInfoPress: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders correctly', () => {
    const { getByText } = render(<ChatHeader {...mockProps} />);
    
    expect(getByText('Test User')).toBeTruthy();
    expect(getByText('Online')).toBeTruthy();
  });

  it('handles back button press', () => {
    const { getByTestId } = render(
      <ChatHeader {...mockProps} />
    );
    
    const backButton = getByTestId('chat-header-back');
    fireEvent.press(backButton);
    
    expect(mockProps.onBackPress).toHaveBeenCalledTimes(1);
  });

  it('shows verification indicator', () => {
    const { getByTestId } = render(
      <ChatHeader {...mockProps} />
    );
    
    const verificationIndicator = getByTestId('chat-header-verification');
    expect(verificationIndicator).toBeTruthy();
  });

  it('handles verification indicator press', () => {
    const { getByTestId } = render(
      <ChatHeader {...mockProps} />
    );
    
    const verificationIndicator = getByTestId('chat-header-verification');
    fireEvent.press(verificationIndicator);
    
    expect(mockProps.onVerificationPress).toHaveBeenCalledTimes(1);
  });

  it('shows online indicator when online', () => {
    const { getByTestId } = render(
      <ChatHeader {...mockProps} isOnline={true} />
    );
    
    const onlineIndicator = getByTestId('online-indicator');
    expect(onlineIndicator).toBeTruthy();
  });

  it('does not show online indicator when offline', () => {
    const { queryByTestId } = render(
      <ChatHeader {...mockProps} isOnline={false} />
    );
    
    const onlineIndicator = queryByTestId('online-indicator');
    expect(onlineIndicator).toBeFalsy();
  });

  it('handles search button press', () => {
    const { getByTestId } = render(
      <ChatHeader {...mockProps} />
    );
    
    fireEvent.press(getByTestId('chat-header-search'));
    expect(mockProps.onSearchPress).toHaveBeenCalledTimes(1);
  });

  it('handles media button press', () => {
    const { getByTestId } = render(
      <ChatHeader {...mockProps} />
    );
    
    fireEvent.press(getByTestId('chat-header-media'));
    expect(mockProps.onMediaPress).toHaveBeenCalledTimes(1);
  });

  it('handles info button press', () => {
    const { getByTestId } = render(
      <ChatHeader {...mockProps} />
    );
    
    fireEvent.press(getByTestId('chat-header-info'));
    expect(mockProps.onInfoPress).toHaveBeenCalledTimes(1);
  });

  it('renders without subtitle', () => {
    const { queryByText } = render(
      <ChatHeader {...mockProps} subtitle={undefined} />
    );
    
    expect(queryByText('Online')).toBeFalsy();
  });

  it('shows different verification states', () => {
    const states = ['verified', 'unverified', 'changed'] as const;
    
    states.forEach(state => {
      const { getByTestId } = render(
        <ChatHeader {...mockProps} verificationStatus={state} />
      );
      
      const verificationIndicator = getByTestId('chat-header-verification');
      expect(verificationIndicator).toBeTruthy();
    });
  });

  it('applies custom styles', () => {
    const customStyle = { backgroundColor: 'blue' };
    
    const { getByTestId } = render(
      <ChatHeader 
        {...mockProps} 
        style={customStyle}
        testID="chat-header"
      />
    );
    
    const header = getByTestId('chat-header');
    expect(header.props.style).toEqual(
      expect.arrayContaining([
        expect.objectContaining(customStyle)
      ])
    );
  });
});