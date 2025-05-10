import React from 'react';
import { TouchableOpacity, StyleSheet, View, StyleProp, ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

// Import design system components and utilities
import ThemedText from './ThemedText';
import { Spacing } from '../constants/Spacing';
import { useIconColor, useTextColor } from '../hooks/useThemeColor';

// Define the structure for list items
export interface ListItemProps {
  // Content
  icon: keyof typeof Ionicons.glyphMap;
  text: string;
  description?: string;
  
  // Action
  onPress: () => void;
  
  // Optional
  rightIcon?: keyof typeof Ionicons.glyphMap;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

/**
 * ListItem Component
 * 
 * A standard list item with icon, text, and optional description.
 */
const ListItem: React.FC<ListItemProps> = ({ 
  icon, 
  text, 
  description, 
  onPress, 
  rightIcon = 'chevron-forward', 
  style,
  testID
}) => {
  // Get theme colors
  const iconColor = useIconColor('secondary');
  const textColor = useTextColor('primary');
  const secondaryTextColor = useTextColor('secondary');
  
  return (
    <TouchableOpacity 
      style={[styles.listItem, style]} 
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={text}
      testID={testID}
    >
      <Ionicons 
        name={icon} 
        size={22} 
        color={iconColor} 
        style={styles.listItemIcon} 
      />
      
      <View style={styles.textContainer}>
        <ThemedText variant="bodyMedium" style={styles.listItemText}>
          {text}
        </ThemedText>
        
        {description && (
          <ThemedText variant="caption" color="secondary" style={styles.listItemDescription}>
            {description}
          </ThemedText>
        )}
      </View>
      
      <Ionicons 
        name={rightIcon} 
        size={20} 
        color={iconColor}
      />
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  listItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.md,
  },
  listItemIcon: {
    marginRight: Spacing.md,
    width: 24,
    textAlign: 'center',
  },
  textContainer: {
    flex: 1,
  },
  listItemText: {
    fontSize: 16,
  },
  listItemDescription: {
    marginTop: 2,
  }
});

export default ListItem;