import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Example component for demonstration
const ExampleComponent = ({ onPress, loading = false }) => {
  const [count, setCount] = React.useState(0);
  const [saved, setSaved] = React.useState(false);

  const handlePress = async () => {
    setCount(count + 1);
    onPress?.(count + 1);
    
    // Save to AsyncStorage
    await AsyncStorage.setItem('count', String(count + 1));
    setSaved(true);
  };

  return (
    <View testID="example-component">
      <Text testID="count-text">Count: {count}</Text>
      <TouchableOpacity 
        testID="increment-button" 
        onPress={handlePress}
        disabled={loading}
      >
        <Text>{loading ? 'Loading...' : 'Increment'}</Text>
      </TouchableOpacity>
      {saved && <Text testID="saved-indicator">Saved!</Text>}
    </View>
  );
};

describe('Test Harness Demo', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Component Testing', () => {
    it('renders component correctly', () => {
      const { getByTestId, getByText } = render(<ExampleComponent />);
      
      expect(getByTestId('example-component')).toBeTruthy();
      expect(getByText('Count: 0')).toBeTruthy();
      expect(getByText('Increment')).toBeTruthy();
    });

    it('handles user interactions', () => {
      const onPress = jest.fn();
      const { getByTestId, getByText } = render(
        <ExampleComponent onPress={onPress} />
      );
      
      const button = getByTestId('increment-button');
      fireEvent.press(button);
      
      expect(getByText('Count: 1')).toBeTruthy();
      expect(onPress).toHaveBeenCalledWith(1);
    });

    it('handles loading state', () => {
      const onPress = jest.fn();
      const { getByText, getByTestId } = render(
        <ExampleComponent onPress={onPress} loading />
      );
      
      expect(getByText('Loading...')).toBeTruthy();
      
      const button = getByTestId('increment-button');
      fireEvent.press(button);
      
      expect(onPress).not.toHaveBeenCalled();
    });
  });

  describe('Async Operations', () => {
    it('saves to AsyncStorage', async () => {
      const { getByTestId, getByText } = render(<ExampleComponent />);
      
      const button = getByTestId('increment-button');
      fireEvent.press(button);
      
      await waitFor(() => {
        expect(getByTestId('saved-indicator')).toBeTruthy();
      });
      
      expect(AsyncStorage.setItem).toHaveBeenCalledWith('count', '1');
    });
  });

  describe('Mock Verification', () => {
    it('AsyncStorage mock works correctly', async () => {
      // Set a value
      await AsyncStorage.setItem('test-key', 'test-value');
      expect(AsyncStorage.setItem).toHaveBeenCalledWith('test-key', 'test-value');
      
      // Get the value
      AsyncStorage.getItem.mockResolvedValueOnce('test-value');
      const value = await AsyncStorage.getItem('test-key');
      expect(value).toBe('test-value');
    });

    it('Firebase mocks work correctly', async () => {
      // Import mocked Firebase
      const auth = require('@react-native-firebase/auth').default();
      const firestore = require('@react-native-firebase/firestore').default();
      
      // Test auth mock
      auth.signInWithEmailAndPassword.mockResolvedValueOnce({ 
        user: { uid: 'test-uid' } 
      });
      
      const result = await auth.signInWithEmailAndPassword('test@example.com', 'password');
      expect(result.user.uid).toBe('test-uid');
      
      // Test firestore mock
      const docRef = firestore.collection('users').doc('test-id');
      expect(docRef.set).toBeDefined();
      expect(docRef.get).toBeDefined();
    });
  });

  describe('Testing Best Practices', () => {
    it('uses proper test IDs', () => {
      const { getByTestId } = render(<ExampleComponent />);
      
      // Good practice: Use descriptive test IDs
      expect(getByTestId('example-component')).toBeTruthy();
      expect(getByTestId('count-text')).toBeTruthy();
      expect(getByTestId('increment-button')).toBeTruthy();
    });

    it('tests accessibility', () => {
      const AccessibleComponent = () => (
        <TouchableOpacity
          accessible
          accessibilityLabel="Increment counter"
          accessibilityHint="Double tap to increment the counter"
          accessibilityRole="button"
        >
          <Text>Increment</Text>
        </TouchableOpacity>
      );
      
      const { getByLabelText } = render(<AccessibleComponent />);
      expect(getByLabelText('Increment counter')).toBeTruthy();
    });

    it('handles errors gracefully', async () => {
      const ErrorComponent = () => {
        const [error, setError] = React.useState(null);
        
        const handlePress = async () => {
          try {
            throw new Error('Test error');
          } catch (e) {
            setError(e.message);
          }
        };
        
        return (
          <View>
            <TouchableOpacity testID="error-button" onPress={handlePress}>
              <Text>Trigger Error</Text>
            </TouchableOpacity>
            {error && <Text testID="error-message">{error}</Text>}
          </View>
        );
      };
      
      const { getByTestId, queryByTestId } = render(<ErrorComponent />);
      
      expect(queryByTestId('error-message')).toBeNull();
      
      fireEvent.press(getByTestId('error-button'));
      
      await waitFor(() => {
        expect(getByTestId('error-message')).toBeTruthy();
        expect(getByTestId('error-message').props.children).toBe('Test error');
      });
    });
  });
});