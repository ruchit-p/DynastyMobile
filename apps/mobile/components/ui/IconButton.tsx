import React from 'react';
import { TouchableOpacity, StyleSheet, ViewStyle, StyleProp, TextStyle } from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';

// Define an enum for supported icon sets
export enum IconSet {
  Ionicons = 'Ionicons',
  MaterialCommunityIcons = 'MaterialCommunityIcons',
}

// Define the props for the IconButton component
interface IconButtonProps {
  iconName: string; // Name of the icon
  iconSet?: IconSet; // The icon library to use (defaults to Ionicons)
  size: number; // Size of the icon
  color: string; // Color of the icon
  onPress: () => void; // Function to call when pressed
  style?: StyleProp<ViewStyle>; // Optional custom styles for the TouchableOpacity
  iconStyle?: StyleProp<TextStyle>; // Optional custom styles for the Icon itself
  accessibilityLabel?: string; // Accessibility label for the button
}

const IconButton: React.FC<IconButtonProps> = ({
  iconName,
  iconSet = IconSet.Ionicons, // Default to Ionicons
  size,
  color,
  onPress,
  style,
  iconStyle,
  accessibilityLabel,
}) => {
  const renderIcon = () => {
    const commonProps = { name: iconName, size, color, style: iconStyle };
    switch (iconSet) {
      case IconSet.Ionicons:
        return <Ionicons {...commonProps} />;
      case IconSet.MaterialCommunityIcons:
        return <MaterialCommunityIcons {...commonProps} />;
      default:
        // Fallback or error for unsupported icon set
        console.warn(`Unsupported icon set: ${iconSet}. Defaulting to Ionicons.`);
        return <Ionicons {...commonProps} />;
    }
  };

  return (
    <TouchableOpacity
      onPress={onPress}
      style={[styles.button, style]}
      accessibilityLabel={accessibilityLabel || `Icon button ${iconName}`}
      hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} // Improves touchability
    >
      {renderIcon()}
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  button: {
    padding: 5, // Default padding, can be overridden by `style` prop
    justifyContent: 'center',
    alignItems: 'center',
  },
});

export default IconButton; 