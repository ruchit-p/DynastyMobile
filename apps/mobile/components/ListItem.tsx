import React from 'react';
import { TouchableOpacity, Text, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

// Define the structure for list items
export interface ListItemProps {
  icon: keyof typeof Ionicons.glyphMap; // Use Ionicons names
  text: string;
  onPress: () => void;
}

const ListItem: React.FC<ListItemProps> = ({ icon, text, onPress }) => {
  return (
    <TouchableOpacity style={styles.listItem} onPress={onPress}>
      <Ionicons name={icon} size={22} color="#555" style={styles.listItemIcon} />
      <Text style={styles.listItemText}>{text}</Text>
      <Ionicons name="chevron-forward" size={20} color="#C7C7CC" />
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
      backgroundColor: '#FFFFFF',
    },
    listItemIcon: {
      marginRight: 15,
      width: 24,
      textAlign: 'center',
      color: '#555',
    },
    listItemText: {
      flex: 1,
      fontSize: 16,
      color: '#333',
    },
    // Add separator style if needed within this component or handle outside
    separator: {
      height: StyleSheet.hairlineWidth,
      backgroundColor: '#E0E0E0',
      marginLeft: 15 + 24 + 15, // Align with text (assuming icon width 24, marginRight 15)
    },
});

export default ListItem; 