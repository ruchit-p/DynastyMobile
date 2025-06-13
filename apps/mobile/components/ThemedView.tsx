import React from 'react';
import { View, ViewProps, StyleSheet, StyleProp, ViewStyle } from 'react-native';
import { useBackgroundColor } from '../hooks/useThemeColor';
import { Shadows, BorderRadius } from '../constants/Spacing';

export type ViewVariant = 
  | 'primary'    // Default background
  | 'secondary'  // Slightly different background
  | 'tertiary'   // Accent background
  | 'card'       // Card with shadow
  | 'surface'    // Flat surface with border
  | 'none';      // No styling

export interface ThemedViewProps extends ViewProps {
  // Light/dark custom colors (for backward compatibility)
  lightColor?: string;
  darkColor?: string;
  
  // View variant for predefined styling combinations
  variant?: ViewVariant;
  
  // Shadow level (if applicable)
  shadow?: keyof typeof Shadows;
  
  // Border radius (if applicable)
  radius?: keyof typeof BorderRadius;
  
  // Allow style overrides
  style?: StyleProp<ViewStyle>;
  
  // Pass through children
  children?: React.ReactNode;
}

/**
 * ThemedView Component
 * 
 * A component for creating views with consistent styling based on the design system.
 */
export function ThemedView({
  style,
  lightColor,
  darkColor,
  variant = 'primary',
  shadow,
  radius,
  ...rest
}: ThemedViewProps) {
  // Get background color based on variant and theme
  const backgroundColor = useBackgroundColor(
    variant === 'none' ? undefined : variant as any, 
    { light: lightColor, dark: darkColor }
  );

  // Define base styles for each variant
  let variantStyle: StyleProp<ViewStyle> = {};
  
  switch (variant) {
    case 'card':
      variantStyle = {
        backgroundColor,
        borderRadius: BorderRadius.md,
        ...Shadows.sm,
        padding: 16,
        margin: 8,
      };
      break;
    case 'surface':
      variantStyle = {
        backgroundColor,
        borderRadius: BorderRadius.sm,
        borderWidth: 1,
        borderColor: '#E0E0E0',
        padding: 12,
      };
      break;
    case 'secondary':
    case 'tertiary':
      variantStyle = {
        backgroundColor,
      };
      break;
    case 'none':
      // No styling applied
      break;
    case 'primary':
    default:
      variantStyle = {
        backgroundColor,
      };
      break;
  }

  // Apply shadow if specified
  if (shadow && Shadows[shadow]) {
    variantStyle = {
      ...variantStyle,
      ...Shadows[shadow],
    };
  }

  // Apply border radius if specified
  if (radius && BorderRadius[radius] !== undefined) {
    variantStyle = {
      ...variantStyle,
      borderRadius: BorderRadius[radius],
    };
  }

  return (
    <View
      style={[
        // Apply the variant style first
        variantStyle,
        // Apply any custom styles passed in
        style,
      ]}
      {...rest}
    />
  );
}

export default ThemedView;