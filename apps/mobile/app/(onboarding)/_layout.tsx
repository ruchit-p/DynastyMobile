import { Stack } from 'expo-router';

export default function OnboardingLayout() {
  return (
    <Stack>
      <Stack.Screen name="profileSetup" options={{ headerShown: false }} />
      {/* Add other onboarding steps here if needed */}
    </Stack>
  );
} 