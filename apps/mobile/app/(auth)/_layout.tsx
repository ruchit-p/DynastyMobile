import { Stack } from 'expo-router';
import React from 'react';
import { ErrorBoundary } from '../../components/ui/ErrorBoundary';
import { logger } from '../../src/services/LoggingService';

export default function AuthLayout() {
  logger.debug('[[AuthLayout]] Mounting or Re-rendering');
  return (
    <ErrorBoundary screenName="AuthLayout">
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="signIn" />
        <Stack.Screen name="signUp" />
        <Stack.Screen name="phoneSignIn" />
        <Stack.Screen name="verifyOtp" />
        <Stack.Screen name="verifyEmail" />
        <Stack.Screen name="confirmEmailVerification" />
        <Stack.Screen name="forgotPassword" />
        {/* Add other screens in the (auth) group here if needed */}
      </Stack>
    </ErrorBoundary>
  );
} 