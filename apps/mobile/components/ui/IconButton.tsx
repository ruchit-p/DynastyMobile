import React from 'react';
import { TouchableOpacity, StyleSheet, ViewStyle, StyleProp, TextStyle } from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { Spacing } from '../../constants/Spacing';

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
  testID?: string; // Test ID for testing
}

/**
 * IconButton Component
 * 
 * A button that displays an icon and triggers an action when pressed.
 * Supports multiple icon libraries and customization options.
 */
const IconButton: React.FC<IconButtonProps> = ({
  iconName,
  iconSet = IconSet.Ionicons,
  size,
  color,
  onPress,
  style,
  iconStyle,
  accessibilityLabel,
  testID,
}) => {
  const renderIcon = () => {
    const commonProps = { name: iconName, size, color, style: iconStyle };
    switch (iconSet) {
      case IconSet.Ionicons:
        return <Ionicons {...commonProps} />;
      case IconSet.MaterialCommunityIcons:
        return <MaterialCommunityIcons {...commonProps} />;
      default:
        console.warn(`Unsupported icon set: ${iconSet}. Defaulting to Ionicons.`);
        return <Ionicons {...commonProps} />;
    }
  };

  return (
    <TouchableOpacity
      onPress={onPress}
      style={[styles.button, style]}
      accessibilityLabel={accessibilityLabel || `Icon button ${iconName}`}
      accessibilityRole="button"
      hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
      testID={testID}
    >
      {renderIcon()}
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  button: {
    padding: Spacing.xs,
    justifyContent: 'center',
    alignItems: 'center',
  },
});

export default IconButton;