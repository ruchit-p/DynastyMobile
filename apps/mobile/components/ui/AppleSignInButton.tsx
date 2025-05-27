import React from 'react';
import { Platform, Alert } from 'react-native';
import * as AppleAuthentication from 'expo-apple-authentication';
import { getAuth, OAuthProvider, signInWithCredential } from '@react-native-firebase/auth';
import { logger } from '../../src/services/LoggingService';

interface AppleSignInButtonProps {
  onSuccess?: () => void;
  onError?: (error: Error) => void;
  style?: any;
}

export function AppleSignInButton({ onSuccess, onError, style }: AppleSignInButtonProps) {
  const handleAppleSignIn = async () => {
    try {
      // Request Apple authentication
      const credential = await AppleAuthentication.signInAsync({
        requestedScopes: [
          AppleAuthentication.AppleAuthenticationScope.EMAIL,
          AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
        ],
      });

      // Create an OAuth credential from the Apple credential
      const { identityToken, authorizationCode } = credential;
      
      if (!identityToken) {
        throw new Error('No identity token received from Apple');
      }

      // Create a Firebase credential from the Apple credential
      const provider = new OAuthProvider('apple.com');
      const oAuthCredential = provider.credential({
        idToken: identityToken,
        rawNonce: credential.authorizationCode || undefined,
      });

      // Sign in with Firebase
      const auth = getAuth();
      const userCredential = await signInWithCredential(auth, oAuthCredential);

      logger.info('Apple sign in successful', { 
        userId: userCredential.user.uid,
        email: userCredential.user.email,
      });

      // If this is a new user and we have full name, update their profile
      if (userCredential.additionalUserInfo?.isNewUser && credential.fullName) {
        const displayName = [
          credential.fullName.givenName,
          credential.fullName.familyName,
        ].filter(Boolean).join(' ');

        if (displayName) {
          await userCredential.user.updateProfile({ displayName });
        }
      }

      onSuccess?.();
    } catch (error: any) {
      if (error.code === 'ERR_CANCELED') {
        // User cancelled the sign-in, don't show error
        logger.debug('Apple sign in cancelled by user');
        return;
      }

      logger.error('Apple sign in failed:', error);
      onError?.(error);
      
      Alert.alert(
        'Sign In Failed',
        error.message || 'Failed to sign in with Apple. Please try again.',
      );
    }
  };

  // Only show on iOS devices that support Apple Sign In
  if (Platform.OS !== 'ios') {
    return null;
  }

  return (
    <AppleAuthentication.AppleAuthenticationButton
      buttonType={AppleAuthentication.AppleAuthenticationButtonType.SIGN_IN}
      buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.BLACK}
      cornerRadius={5}
      style={[{ width: '100%', height: 50 }, style]}
      onPress={handleAppleSignIn}
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