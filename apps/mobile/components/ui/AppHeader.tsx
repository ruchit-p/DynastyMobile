import React from 'react';
import { View, Text, StyleSheet, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
// Removed import { Colors } from '../../constants/Colors';

// Define specific colors used for the header, matching _layout.tsx
const AppHeaderColors = {
  primary: '#1A4B44', // Dynasty primary color from _layout.tsx
  white: '#FFFFFF',   // White from _layout.tsx
  lightGray: '#CCC', // Light gray for border from _layout.tsx
};

interface AppHeaderProps {
  title: string;
  headerLeft?: () => React.ReactNode; // New prop for left-side content
  headerRight?: () => React.ReactNode; // New prop for right-side content
}

const AppHeader: React.FC<AppHeaderProps> = ({ title, headerLeft, headerRight }) => {
  const insets = useSafeAreaInsets();

  return (
    // The paddingTop for status bar is handled by the SafeAreaProvider or Tab.Screen options
    // if we set translucent: true or similar on the status bar.
    // For a custom header component used in Tab.Screen's 'header' option,
    // it often replaces the entire header area, including status bar padding.
    // Thus, applying insets.top here is correct.
    <View style={[styles.headerContainer, { paddingTop: insets.top }]}>
      <View style={styles.headerContent}>
        {headerLeft && (
          <View style={styles.leftContainer}>{headerLeft()}</View>
        )}
        <View style={styles.titleContainer}>
          <Text style={styles.headerTitle}>{title}</Text>
        </View>
        {headerRight && (
          <View style={styles.rightContainer}>{headerRight()}</View>
        )}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  headerContainer: {
    backgroundColor: AppHeaderColors.white,
    // Shadow properties from _layout.tsx
    ...Platform.select({
      ios: {
        shadowOpacity: 0.1,
        shadowOffset: { width: 0, height: 1 },
        shadowRadius: 2,
        borderBottomWidth: 0.5,
        borderBottomColor: AppHeaderColors.lightGray,
      },
      android: {
        elevation: 4, // This was 4 in _layout.tsx
      },
    }),
    // No specific height here, it's determined by headerContent + paddingTop
  },
  headerContent: {
    // This height is for the content part of the header, excluding status bar area.
    // From screenshots, headers look fairly standard.
    // Events title: "Events" - large font. Profile title: "Profile" - also large.
    // Let's try to match the fontSize and overall feel from _layout.tsx more closely,
    // but within a container that makes sense for a custom component.
    // The paddingBottom: 60 for iOS in _layout was for headerTitleStyle, which might be an internal expo-router way to handle large titles.
    // For a custom component, we control height and padding directly.
    // Let's use a reasonable height and then ensure the title style matches.
    height: Platform.OS === 'ios' ? 50 : 56, // A more typical content height, adjust if needed.
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 15, // From headerRightContainerStyle/headerLeftContainerStyle in _layout (approx)
  },
  titleContainer: {
    flex: 1, // Allows title to take available space, pushing rightContainer
    alignItems: 'flex-start', // Keep title to the left
  },
  headerTitle: {
    // Matching headerTitleStyle from _layout.tsx
    fontWeight: 'bold',
    fontSize: Platform.OS === 'ios' ? 30 : 22, // Adjusted to better match screenshot appearance
                                                // while keeping it large, from original 34/24.
    color: AppHeaderColors.primary,
    // paddingBottom: Platform.OS === 'ios' ? 60 : 5, // This was in headerTitleStyle, not directly applicable here
    // Instead, we manage alignment and padding within headerContent.
    // marginLeft: 0, // Title is typically at the start of the content unless there's a back button.
                     // headerTitleAlign: 'left' was in _layout.
  },
  rightContainer: {
    // Sits to the right of the titleContainer
    // paddingHorizontal from headerContent will provide spacing from edge
    // If specific positioning is needed beyond flex, can adjust here.
    // For now, flexbox should handle it.
    marginLeft: 10, // Add some margin if both left and right are present
    flexDirection: 'row', // If headerRight returns multiple items in a View
    alignItems: 'center',
  },
  leftContainer: { // New style for the left container
    marginRight: 10, // Add some margin if both left and title are present
    flexDirection: 'row',
    alignItems: 'center',
  },
});

export default AppHeader; 