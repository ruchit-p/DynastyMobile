import React from 'react';
import { View, Text, StyleSheet, Platform, type ViewStyle, type TextStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors } from '../../constants/Colors'; // Assuming Colors.ts is two levels up in constants
import { useColorScheme } from '../../hooks/useColorScheme'; // Corrected import

// MARK: - Types
interface AppHeaderProps {
  title: string;
  rightActions?: React.ReactNode;
  style?: ViewStyle;
  titleStyle?: TextStyle;
}

// MARK: - AppHeader Component
const AppHeader: React.FC<AppHeaderProps> = ({ title, rightActions, style, titleStyle }) => {
  const insets = useSafeAreaInsets();
  const scheme = useColorScheme(); // Get the scheme which can be 'light', 'dark', or null
  const colorScheme: 'light' | 'dark' = scheme === 'dark' ? 'dark' : 'light'; // Ensure it's strictly 'light' or 'dark'

  const currentColors = Colors[colorScheme]; // Now indexing with a guaranteed 'light' or 'dark'

  // Specific styling from (tabs)/_layout.tsx
  const headerBaseStyle: ViewStyle = {
    paddingTop: insets.top, // Apply top inset for status bar
    backgroundColor: currentColors.headerBackground,
    flexDirection: 'row',
    alignItems: 'flex-end', // Align items to the bottom for the large title effect
    justifyContent: 'space-between',
    paddingHorizontal: 15, // General horizontal padding
    paddingBottom: 10, // Padding at the very bottom of the header
    minHeight: (Platform.OS === 'ios' ? 96 : 56) + insets.top, // Approximate base height + inset
    // Shadow/Elevation
    ...(Platform.OS === 'android'
      ? { elevation: 4 }
      : {
          shadowColor: Colors.light.border, // Using a generic shadow color
          shadowOpacity: 0.1,
          shadowOffset: { width: 0, height: 1 },
          shadowRadius: 2,
        }),
    // Border
    borderBottomWidth: Platform.OS === 'ios' ? 0.5 : 0, // Thinner border for iOS
    borderBottomColor: currentColors.border,
  };

  // The title itself should be positioned lower in this container
  // The large paddingBottom on headerTitleStyle in _layout.tsx might have been for the container
  // holding the title, to push the title text down.
  // Let's try to achieve the "large title pushed down" effect.
  // The height of the header is influenced by minHeight, paddingTop (insets.top), and paddingBottom.
  // The title's vertical position within this space is key.
  const titleBaseStyle: TextStyle = {
    fontWeight: 'bold',
    fontSize: Platform.OS === 'ios' ? 34 : 28, // Adjusted Android for better balance
    color: currentColors.headerText,
    textAlign: 'left',
    // The title needs to appear lower. Flexbox on the parent helps.
    // No specific paddingBottom here, alignment handles it.
  };
  
  // The actual height of the header from screenshots looks to be around 90-100pt on iOS.
  // The title "Events" in the screenshot appears quite large and occupies a significant portion of this.
  // Let's adjust minHeight to be more explicit if needed, or control through paddings.
  // The original _layout.tsx had `headerTitleStyle: { paddingBottom: Platform.OS === 'ios' ? 60 : 5 }`
  // This paddingBottom was on the *title text component style itself* which is unusual.
  // It's more common to have a taller header container and align the title within it.
  // My current `headerBaseStyle` uses `alignItems: 'flex-end'` and `paddingBottom: 10`.
  // The title text also has its font size.

  return (
    <View style={[styles.headerContainer, headerBaseStyle, style]}>
      <View style={styles.titleContainer}>
        <Text style={[styles.title, titleBaseStyle, titleStyle]} numberOfLines={1} ellipsizeMode="tail">
          {title}
        </Text>
      </View>
      {rightActions && <View style={styles.actionsContainer}>{rightActions}</View>}
    </View>
  );
};

// MARK: - Styles
const styles = StyleSheet.create({
  headerContainer: {
    // Base styles are applied dynamically
  },
  titleContainer: {
    flex: 1, // Allow title to take available space
    justifyContent: 'flex-end', // Push title to the bottom of its container
     // marginRight to prevent overlap if rightActions are present
    marginRight: 10,
  },
  title: {
    // Dynamic styles are applied
    // Ensure the title is not pushed out of view by large font size or paddings.
    // The height of the header and the alignment will dictate its final position.
  },
  actionsContainer: {
    justifyContent: 'flex-end', // Align actions with the bottom of the header
    paddingBottom: Platform.OS === 'ios' ? 2 : 0, // Minor adjustment for iOS icon alignment
    // paddingRight is handled by headerBaseStyle's paddingHorizontal
    // marginLeft: 10, // Ensure some space from title
  },
});

export default AppHeader; 