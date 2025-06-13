import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import VerificationIndicator from '../VerificationIndicator';
import { Ionicons } from '@expo/vector-icons';

// Mock Ionicons to make it easier to test
jest.mock('@expo/vector-icons', () => ({
  Ionicons: ({ name, size, color, ...props }) => {
    const React = require('react');
    return React.createElement('Ionicons', { name, size, color, testID: 'icon', ...props });
  },
}));

describe('VerificationIndicator', () => {
  const mockOnPress = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders verified state correctly', () => {
    const { getByTestId } = render(
      <VerificationIndicator 
        level="verified" 
        size="small"
        testID="verification-indicator"
      />
    );
    
    const icon = getByTestId('icon');
    expect(icon.props.name).toBe('shield-checkmark');
  });

  it('renders unverified state correctly', () => {
    const { getByTestId } = render(
      <VerificationIndicator 
        level="unverified" 
        size="small"
      />
    );
    
    const icon = getByTestId('icon');
    expect(icon.props.name).toBe('shield-outline');
  });

  it('renders changed state correctly', () => {
    const { getByTestId } = render(
      <VerificationIndicator 
        level="changed" 
        size="small"
      />
    );
    
    const icon = getByTestId('icon');
    expect(icon.props.name).toBe('warning');
  });

  it('handles onPress when provided', () => {
    const { getByTestId } = render(
      <VerificationIndicator 
        level="verified" 
        size="small"
        onPress={mockOnPress}
        testID="verification-indicator"
      />
    );
    
    fireEvent.press(getByTestId('verification-indicator'));
    expect(mockOnPress).toHaveBeenCalledTimes(1);
  });

  it('is not pressable when onPress is not provided', () => {
    const { getByTestId } = render(
      <VerificationIndicator 
        level="verified" 
        size="small"
        testID="verification-indicator"
      />
    );
    
    const indicator = getByTestId('verification-indicator');
    // Should render as View, not TouchableOpacity
    expect(indicator.type).not.toBe('TouchableOpacity');
  });

  it('renders correct sizes', () => {
    const sizes = ['small', 'medium', 'large'] as const;
    const expectedSizes = { small: 12, medium: 16, large: 20 };
    
    sizes.forEach(size => {
      const { getByTestId } = render(
        <VerificationIndicator level="verified" size={size} />
      );
      
      const icon = getByTestId('icon');
      expect(icon.props.size).toBe(expectedSizes[size]);
    });
  });

  it('shows label when showLabel is true', () => {
    const { getByText } = render(
      <VerificationIndicator 
        level="verified" 
        size="small"
        showLabel={true}
      />
    );
    
    expect(getByText('Verified')).toBeTruthy();
  });

  it('shows correct label text for each level', () => {
    const levels = [
      { level: 'verified' as const, text: 'Verified' },
      { level: 'unverified' as const, text: 'Not Verified' },
      { level: 'changed' as const, text: 'Key Changed' },
    ];
    
    levels.forEach(({ level, text }) => {
      const { getByText } = render(
        <VerificationIndicator 
          level={level} 
          size="small"
          showLabel={true}
        />
      );
      
      expect(getByText(text)).toBeTruthy();
    });
  });

  it('applies custom styles', () => {
    const customStyle = { marginLeft: 10 };
    
    const { getByTestId } = render(
      <VerificationIndicator 
        level="verified" 
        size="small"
        style={customStyle}
        testID="verification-indicator"
      />
    );
    
    const container = getByTestId('verification-indicator');
    expect(container.props.style).toEqual(
      expect.arrayContaining([
        expect.objectContaining(customStyle)
      ])
    );
  });
});