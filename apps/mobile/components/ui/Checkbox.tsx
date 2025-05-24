import React from 'react';
import { StyleSheet, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../../constants/Colors';
import { Spacing, BorderRadius } from '../../constants/Spacing';

interface CheckboxProps {
  value: boolean;
  onValueChange: (value: boolean) => void;
  style?: any;
  disabled?: boolean;
  size?: number;
  color?: string;
}

const Checkbox: React.FC<CheckboxProps> = ({
  value,
  onValueChange,
  style,
  disabled = false,
  size = 24,
  color = Colors.dynastyGreen,
}) => {
  return (
    <TouchableOpacity
      style={[styles.container, { width: size, height: size }, style]}
      onPress={() => !disabled && onValueChange(!value)}
      disabled={disabled}
      accessibilityRole="checkbox"
      accessibilityState={{ checked: value, disabled }}
    >
      <View
        style={[
          styles.checkbox,
          {
            width: size,
            height: size,
            borderColor: disabled ? Colors.light.text.disabled : color,
            backgroundColor: value ? color : 'transparent',
          },
        ]}
      >
        {value && (
          <Ionicons
            name="checkmark"
            size={size * 0.7}
            color={Colors.light.background.primary}
          />
        )}
      </View>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  container: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  checkbox: {
    borderWidth: 2,
    borderRadius: BorderRadius.sm,
    justifyContent: 'center',
    alignItems: 'center',
  },
});

export default Checkbox;