import { Colors } from "./Colors";

export const commonHeaderOptions = {
  headerStyle: { backgroundColor: Colors.light.background },
  headerTintColor: Colors.light.primary,
  headerTitleStyle: { fontWeight: '600' as '600' }, // Explicitly type fontWeight
  headerBackTitleVisible: true,
  headerBackTitle: 'Back',
}; 