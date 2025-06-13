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

// Interface for Card subcomponents
interface CardSectionProps {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

// Define the types for the static properties
interface CardComponent extends React.FC<CardProps> {
  Header: React.FC<CardSectionProps>;
  Content: React.FC<CardSectionProps>;
  Footer: React.FC<CardSectionProps>;
}

/**
 * Card Component
 * 
 * A container component with different variants for grouping related content.
 */
// Cast the Card component to the CardComponent interface
const Card: CardComponent = ({
  children,
  variant = 'elevated',
  noPadding = false,
  shadow = 'sm',
  style,
  testID,
}) => {
  const colorScheme = useColorScheme();
  // const theme = colorScheme || 'light'; // theme variable not used
  
  // Get theme colors - Hooks called at the top level
  const primaryBackgroundColor = useBackgroundColor('primary');
  const secondaryBackgroundColor = useBackgroundColor('secondary'); // Moved hook call here
  const primaryBorderColor = useBorderColor('primary');
  
  // Create style based on variant
  let variantStyle: StyleProp<ViewStyle> = {};
  
  switch (variant) {
    case 'elevated':
      variantStyle = {
        backgroundColor: primaryBackgroundColor,
        ...Shadows[shadow],
      };
      break;
    case 'outlined':
      variantStyle = {
        backgroundColor: primaryBackgroundColor,
        borderWidth: 1,
        borderColor: primaryBorderColor,
      };
      break;
    case 'filled':
      variantStyle = {
        backgroundColor: secondaryBackgroundColor, // Use variable here
      };
      break;
    case 'flat':
      variantStyle = {
        backgroundColor: primaryBackgroundColor,
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
  const primaryBorderColorFooter = useBorderColor('primary'); // Renamed to avoid conflict if Card is ever a class component with state
  
  return (
    <View 
      style={[
        styles.cardFooter,
        { borderTopColor: primaryBorderColorFooter },
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
    // flex: 1, // Temporarily removed to debug layout issues
  },
  cardFooter: {
    marginTop: Spacing.sm,
    paddingTop: Spacing.sm,
    borderTopWidth: 1,
  },
});

export default Card;