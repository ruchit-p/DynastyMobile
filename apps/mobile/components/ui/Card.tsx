import React, { ReactNode } from 'react';
import { View, StyleSheet, StyleProp, ViewStyle } from 'react-native';
import { Colors } from '../../constants/Colors';
import { Spacing, BorderRadius, Shadows } from '../../constants/Spacing';
import { useColorScheme } from '../../hooks/useColorScheme';
import { useBackgroundColor, useBorderColor } from '../../hooks/useThemeColor';

export type CardVariant = 'elevated' | 'outlined' | 'filled' | 'flat';

export interface CardProps {
  // Main content
  children: ReactNode;
  
  // Styling options
  variant?: CardVariant;
  noPadding?: boolean;
  shadow?: keyof typeof Shadows;
  
  // Style overrides
  style?: StyleProp<ViewStyle>;
  
  // Optional test ID
  testID?: string;
}

/**
 * Card Component
 * 
 * A container component with different variants for grouping related content.
 */
const Card: React.FC<CardProps> = ({
  children,
  variant = 'elevated',
  noPadding = false,
  shadow = 'sm',
  style,
  testID,
}) => {
  const colorScheme = useColorScheme();
  const theme = colorScheme || 'light';
  
  // Get theme colors
  const backgroundColor = useBackgroundColor('primary');
  const borderColor = useBorderColor('primary');
  
  // Create style based on variant
  let variantStyle: StyleProp<ViewStyle> = {};
  
  switch (variant) {
    case 'elevated':
      variantStyle = {
        backgroundColor,
        ...Shadows[shadow],
      };
      break;
    case 'outlined':
      variantStyle = {
        backgroundColor,
        borderWidth: 1,
        borderColor,
      };
      break;
    case 'filled':
      variantStyle = {
        backgroundColor: useBackgroundColor('secondary'),
      };
      break;
    case 'flat':
      variantStyle = {
        backgroundColor,
      };
      break;
  }
  
  return (
    <View
      style={[
        styles.card,
        variantStyle,
        !noPadding && styles.cardPadding,
        style,
      ]}
      testID={testID}
    >
      {children}
    </View>
  );
};

// Subcomponents for Card composition
interface CardSectionProps {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

// Card.Header component
const CardHeader: React.FC<CardSectionProps> = ({ children, style, testID }) => (
  <View style={[styles.cardHeader, style]} testID={testID}>
    {children}
  </View>
);

// Card.Content component
const CardContent: React.FC<CardSectionProps> = ({ children, style, testID }) => (
  <View style={[styles.cardContent, style]} testID={testID}>
    {children}
  </View>
);

// Card.Footer component
const CardFooter: React.FC<CardSectionProps> = ({ children, style, testID }) => {
  const borderColor = useBorderColor('primary');
  
  return (
    <View 
      style={[
        styles.cardFooter,
        { borderTopColor: borderColor },
        style
      ]} 
      testID={testID}
    >
      {children}
    </View>
  );
};

// Assign subcomponents
Card.Header = CardHeader;
Card.Content = CardContent;
Card.Footer = CardFooter;

const styles = StyleSheet.create({
  card: {
    borderRadius: BorderRadius.md,
    overflow: 'hidden',
    marginVertical: Spacing.sm,
  },
  cardPadding: {
    padding: Spacing.md,
  },
  cardHeader: {
    marginBottom: Spacing.sm,
  },
  cardContent: {
    flex: 1,
  },
  cardFooter: {
    marginTop: Spacing.sm,
    paddingTop: Spacing.sm,
    borderTopWidth: 1,
  },
});

export default Card;