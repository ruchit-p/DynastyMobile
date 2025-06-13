import React from 'react';
import { Stack } from 'expo-router';
import { ErrorBoundary } from '../../components/ui/ErrorBoundary';

export default function OnboardingLayout() {
  return (
    <ErrorBoundary screenName="OnboardingLayout">
      <Stack>
        <Stack.Screen name="profileSetup" options={{ headerShown: false }} />
        <Stack.Screen name="encryptionSetup" options={{ headerShown: false }} />
        {/* Add other onboarding steps here if needed */}
      </Stack>
    </ErrorBoundary>
  );
} 