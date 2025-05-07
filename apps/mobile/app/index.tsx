import { Redirect } from 'expo-router';

export default function AppIndex() {
  // Redirect to the feed screen within the (tabs) layout
  return <Redirect href="/(tabs)/feed" />;
} 