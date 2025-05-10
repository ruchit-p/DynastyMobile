import React from 'react';
import { View, StyleSheet, StyleProp, ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useColorScheme } from '../../hooks/useColorScheme';
import { useTextColor } from '../../hooks/useThemeColor';
import { Spacing } from '../../constants/Spacing';
import { Colors } from '../../constants/Colors';
import ThemedText from '../ThemedText';
import Button from './Button';

export interface EmptyStateProps {
  // Content
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  description?: string;
  
  // Action button
  actionLabel?: string;
  onAction?: () => void;
  
  // Appearance
  iconSize?: number;
  iconColor?: string;
  
  // Style overrides
  style?: StyleProp<ViewStyle>;
  
  // Optional
  testID?: string;
}

/**
 * EmptyState Component
 * 
 * A component for displaying empty state messages with an icon, text, and optional action.
 * Commonly used when lists have no items, search returns no results, or content is unavailable.
 */
const EmptyState: React.FC<EmptyStateProps> = ({
  icon,
  title,
  description,
  actionLabel,
  onAction,
  iconSize = 60,
  iconColor,
  style,
  testID,
}) => {
  const colorScheme = useColorScheme();
  const theme = colorScheme || 'light';
  
  // Default icon color if not provided
  const defaultIconColor = Colors.palette.neutral.light;
  const actualIconColor = iconColor || defaultIconColor;
  
  // Get semantic text colors
  const titleColor = useTextColor('secondary');
  const descriptionColor = useTextColor('tertiary');
  
  return (
    <View 
      style={[styles.container, style]} 
      testID={testID}
      accessible={true}
      accessibilityRole="text"
    >
      <Ionicons 
        name={icon} 
        size={iconSize} 
        color={actualIconColor} 
        style={styles.icon}
      />
      
      <ThemedText 
        variant="h5" 
        style={[styles.title, { color: titleColor }]}
        accessibilityRole="header"
      >
        {title}
      </ThemedText>
      
      {description && (
        <ThemedText 
          variant="bodyMedium" 
          style={[styles.description, { color: descriptionColor }]}
        >
          {description}
        </ThemedText>
      )}
      
      {actionLabel && onAction && (
        <Button
          title={actionLabel}
          onPress={onAction}
          variant="primary"
          size="medium"
          style={styles.actionButton}
        />
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.xl,
  },
  icon: {
    marginBottom: Spacing.md,
  },
  title: {
    textAlign: 'center',
    marginBottom: Spacing.sm,
  },
  description: {
    textAlign: 'center',
    marginBottom: Spacing.lg,
  },
  actionButton: {
    marginTop: Spacing.md,
  },
});

export default EmptyState;