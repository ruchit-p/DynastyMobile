import { Stack } from 'expo-router';

export default function AuthLayout() {
  return (
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
  );
} 