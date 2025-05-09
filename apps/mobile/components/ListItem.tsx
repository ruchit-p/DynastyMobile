import React from 'react';
import { TouchableOpacity, Text, StyleSheet, View, ColorValue } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../constants/Colors';
import useColorScheme from '../hooks/useColorScheme';

// Define the structure for list items
export interface ListItemProps {
  icon: keyof typeof Ionicons.glyphMap; // Use Ionicons names
  text: string;
  onPress: () => void;
  iconColor?: ColorValue;
  textColor?: ColorValue;
  chevronColor?: ColorValue;
}

const ListItem: React.FC<ListItemProps> = ({ 
  icon, 
  text, 
  onPress, 
  iconColor, 
  textColor,
  chevronColor 
}) => {
  const colorScheme = useColorScheme() ?? 'light';
  const currentColors = Colors[colorScheme];

  // Determine colors: use prop if provided, otherwise fallback to theme
  const finalIconColor = iconColor || currentColors.icon;
  const finalTextColor = textColor || currentColors.text;
  const finalChevronColor = chevronColor || currentColors.textSecondary; // Or a specific chevron color from theme

  return (
    <TouchableOpacity style={[styles.listItem, { backgroundColor: currentColors.surface }]} onPress={onPress}>
      <Ionicons name={icon} size={22} color={finalIconColor} style={styles.listItemIcon} />
      <Text style={[styles.listItemText, { color: finalTextColor }]}>{text}</Text>
      <Ionicons name="chevron-forward" size={20} color={finalChevronColor} />
    </TouchableOpacity>
  );
};

// Copy styles from profile.tsx or accountSettings.tsx related to ListItem
const styles = StyleSheet.create({
    listItem: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 16,
      paddingHorizontal: 15,
    },
    listItemIcon: {
      marginRight: 15,
      width: 24,
      textAlign: 'center',
    },
    listItemText: {
      flex: 1,
      fontSize: 16,
    },
    // Add separator style if needed within this component or handle outside
    separator: {
      height: StyleSheet.hairlineWidth,
      marginLeft: 15 + 24 + 15, // Align with text (assuming icon width 24, marginRight 15)
    },
});

export default ListItem; 