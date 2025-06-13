import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ViewStyle, TextStyle } from 'react-native';

interface SelectorButtonProps {
  onPress: () => void;
  label: string;
  placeholder?: string;
  value?: string | null;
  required?: boolean;
  style?: ViewStyle;
  textStyle?: TextStyle;
  placeholderTextStyle?: TextStyle;
}

const SelectorButton: React.FC<SelectorButtonProps> = ({
  onPress,
  label,
  placeholder = 'Select...',
  value,
  required = false,
  style,
  textStyle,
  placeholderTextStyle,
}) => {
  return (
    <View style={styles.container}>
      <Text style={styles.label}>
        {label}{required && <Text style={styles.requiredAsterisk}>*</Text>}
      </Text>
      <TouchableOpacity
        onPress={onPress}
        style={[styles.selectorButton, style]}
      >
        <Text style={[
          styles.selectorButtonText,
          !value && styles.placeholderText,
          !value && placeholderTextStyle,
          value && textStyle
        ]}>
          {value ? value : placeholder}
        </Text>
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginBottom: 16,
  },
  label: {
    fontSize: 15,
    color: '#4A4A4A',
    marginBottom: 8,
    fontWeight: '500',
  },
  requiredAsterisk: {
    color: '#E53935',
    fontWeight: '400',
  },
  selectorButton: {
    height: 50,
    backgroundColor: '#FFFFFF',
    borderColor: '#D0D0D0',
    borderWidth: 1,
    justifyContent: 'center',
    paddingHorizontal: 15,
    borderRadius: 8,
  },
  selectorButtonText: {
    fontSize: 16,
    color: '#333333',
  },
  placeholderText: {
    color: '#A0A0A0',
  },
});

export default SelectorButton;