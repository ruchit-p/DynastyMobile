import React from 'react';
import { Text, StyleSheet, TextProps, StyleProp, TextStyle } from 'react-native';
import { useTextColor } from '../hooks/useThemeColor';
import Typography from '../constants/Typography';

export type TextVariant = 
  | 'h1' | 'h2' | 'h3' | 'h4' | 'h5'
  | 'bodyLarge' | 'bodyMedium' | 'bodySmall'
  | 'caption' | 'button' | 'link';

export type TextColor = 'primary' | 'secondary' | 'tertiary' | 'inverse' | 'link' | 'success' | 'warning' | 'error';

export interface ThemedTextProps extends TextProps {
  // Light/dark custom colors (for backward compatibility)
  lightColor?: string;
  darkColor?: string;
  
  // Text variant (maps to Typography styles)
  variant?: TextVariant;
  
  // Text color (maps to semantic color system)
  color?: TextColor;
  
  // Legacy type prop (for backward compatibility)
  type?: 'default' | 'title' | 'defaultSemiBold' | 'subtitle' | 'link';
  
  // Allow style overrides
  style?: StyleProp<TextStyle>;
  
  // Children prop to render text content
  children?: React.ReactNode;
}

/**
 * ThemedText Component
 * 
 * A component for displaying text with consistent styling based on the design system.
 * Supports both the new variant system and the legacy type system for backward compatibility.
 */
export function ThemedText({
  style,
  lightColor,
  darkColor,
  variant = 'bodyMedium',
  color = 'primary',
  type,
  ...rest
}: ThemedTextProps) {
  // Get text color based on theme
  const themeColor = useTextColor(color, { light: lightColor, dark: darkColor });
  
  // Map legacy types to variants for backward compatibility
  let resolvedVariant = variant;
  if (type) {
    switch (type) {
      case 'title':
        resolvedVariant = 'h3';
        break;
      case 'subtitle':
        resolvedVariant = 'h5';
        break;
      case 'defaultSemiBold':
        resolvedVariant = 'bodyMedium';
        break;
      case 'link':
        resolvedVariant = 'link';
        break;
      case 'default':
      default:
        resolvedVariant = 'bodyMedium';
        break;
    }
  }

  // Map variant to Typography style
  let variantStyle: StyleProp<TextStyle>;
  switch (resolvedVariant) {
    case 'h1':
      variantStyle = Typography.styles.heading1;
      break;
    case 'h2':
      variantStyle = Typography.styles.heading2;
      break;
    case 'h3':
      variantStyle = Typography.styles.heading3;
      break; 
    case 'h4':
      variantStyle = Typography.styles.heading4;
      break;
    case 'h5':
      variantStyle = Typography.styles.heading5;
      break;
    case 'bodyLarge':
      variantStyle = Typography.styles.bodyLarge;
      break;
    case 'bodySmall':
      variantStyle = Typography.styles.bodySmall;
      break;
    case 'caption':
      variantStyle = Typography.styles.caption;
      break;
    case 'button':
      variantStyle = Typography.styles.button;
      break;
    case 'link':
      variantStyle = Typography.styles.link;
      break;
    case 'bodyMedium':
    default:
      variantStyle = Typography.styles.bodyMedium;
      break;
  }

  return (
    <Text
      style={[
        // Apply the variant style first (from Typography system)
        variantStyle,
        // Apply the theme color
        { color: themeColor },
        // Apply any custom styles passed in
        style,
      ]}
      {...rest}
    />
  );
}

export default ThemedText;