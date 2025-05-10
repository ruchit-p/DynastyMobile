import { Colors } from "./Colors";

export const commonHeaderOptions = {
  headerStyle: { backgroundColor: Colors.light.background.secondary },
  headerTintColor: Colors.light.icon.primary,
  headerTitleStyle: { fontWeight: '600' as '600' }, // Explicitly type fontWeight
  headerBackTitleVisible: true,
  headerBackTitle: 'Back',
}; 