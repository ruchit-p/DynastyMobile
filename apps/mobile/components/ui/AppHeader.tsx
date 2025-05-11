import React from 'react';
import { View, StyleSheet, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

// Import design system components and utilities
import ThemedText from '../ThemedText';
import { Spacing, Shadows } from '../../constants/Spacing';
import { useBackgroundColor, useTextColor, useBorderColor } from '../../hooks/useThemeColor';
import { Colors } from '../../constants/Colors';

interface AppHeaderProps {
  title: string;
  headerLeft?: () => React.ReactNode;
  headerRight?: () => React.ReactNode;
  testID?: string;
}

/**
 * AppHeader Component
 * 
 * A standardized header component for screens with consistent styling.
 */
const AppHeader: React.FC<AppHeaderProps> = ({ 
  title, 
  headerLeft, 
  headerRight,
  testID
}) => {
  const insets = useSafeAreaInsets();
  
  // Get theme colors
  const backgroundColor = useBackgroundColor('primary');
  const textColor = Colors.palette.dynastyGreen.dark; // Using direct palette color for title
  const borderColor = useBorderColor('primary');

  // Platform-specific shadow styles
  const shadowStyles = Platform.OS === 'ios'
    ? {
        shadowOpacity: 0.1,
        shadowOffset: { width: 0, height: 1 },
        shadowRadius: 2,
        borderBottomWidth: 0.5,
        borderBottomColor: borderColor,
      }
    : {
        elevation: 4,
      };

  return (
    <View 
      style={[
        styles.headerContainer, 
        { paddingTop: insets.top, backgroundColor },
        shadowStyles
      ]}
      accessibilityRole="header"
      testID={testID}
    >
      <View style={styles.headerContent}>
        {headerLeft && (
          <View style={styles.leftContainer}>{headerLeft()}</View>
        )}
        
        <View style={styles.titleContainer}>
          <ThemedText 
            variant={Platform.OS === 'ios' ? 'h3' : 'h4'} 
            style={[styles.headerTitle, { color: textColor }]}
          >
            {title}
          </ThemedText>
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
    // The background color and shadow/elevation styles are applied dynamically
    zIndex: 1, // Add zIndex to potentially help with shadow visibility
  },
  headerContent: {
    height: Platform.OS === 'ios' ? 50 : 56,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.md,
  },
  titleContainer: {
    flex: 1,
    alignItems: 'flex-start',
  },
  headerTitle: {
    // The variant and color are applied via ThemedText props
  },
  leftContainer: {
    marginRight: Spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
  },
  rightContainer: {
    marginLeft: Spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
  },
});

export default AppHeader;