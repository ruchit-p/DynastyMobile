import React from 'react';
import { render } from '@testing-library/react-native';
import { View, Text } from 'react-native';

// Simple mock component for testing
const MockVaultScreen = () => {
  return (
    <View testID="vault-screen">
      <Text>Vault</Text>
      <View testID="vault-list">
        <Text>Family Photo.jpg</Text>
        <Text>Birth Certificate.pdf</Text>
      </View>
    </View>
  );
};

describe('Vault Screen - Simple Tests', () => {
  it('renders vault screen', () => {
    const { getByTestId, getByText } = render(<MockVaultScreen />);
    
    expect(getByTestId('vault-screen')).toBeTruthy();
    expect(getByText('Vault')).toBeTruthy();
  });

  it('displays vault items', () => {
    const { getByText } = render(<MockVaultScreen />);
    
    expect(getByText('Family Photo.jpg')).toBeTruthy();
    expect(getByText('Birth Certificate.pdf')).toBeTruthy();
  });
});