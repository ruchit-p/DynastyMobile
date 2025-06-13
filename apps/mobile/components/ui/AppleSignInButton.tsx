import React from 'react';
import { Platform } from 'react-native';
import * as AppleAuthentication from 'expo-apple-authentication';

interface AppleSignInButtonProps {
  onPress?: () => void;
  onSuccess?: () => void;
  onError?: (error: Error) => void;
  style?: any;
  disabled?: boolean;
}

export function AppleSignInButton({ onPress, onSuccess, onError, style, disabled }: AppleSignInButtonProps) {
  // If onPress is provided, use it directly. Otherwise fall back to legacy behavior
  const handlePress = onPress || (() => {
    console.warn('AppleSignInButton: Using legacy onSuccess/onError props. Please use onPress instead.');
    onSuccess?.();
  });

  // Only show on iOS devices that support Apple Sign In
  if (Platform.OS !== 'ios') {
    return null;
  }

  return (
    <AppleAuthentication.AppleAuthenticationButton
      buttonType={AppleAuthentication.AppleAuthenticationButtonType.SIGN_IN}
      buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.BLACK}
      cornerRadius={5}
      style={[{ width: '100%', height: 50, opacity: disabled ? 0.5 : 1 }, style]}
      onPress={disabled ? undefined : handlePress}
    />
  );
}

// Hook to check if Apple Sign In is available
export function useAppleSignInAvailable() {
  const [isAvailable, setIsAvailable] = React.useState(false);

  React.useEffect(() => {
    const checkAvailability = async () => {
      if (Platform.OS === 'ios') {
        const available = await AppleAuthentication.isAvailableAsync();
        setIsAvailable(available);
      }
    };

    checkAvailability();
  }, []);

  return isAvailable;
}