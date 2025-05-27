import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TextInputProps,
  StyleSheet,
  Pressable,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../../constants/Colors';
import { Typography } from '../../constants/Typography';
import { Spacing, BorderRadius } from '../../constants/Spacing';

interface ValidatedInputProps extends TextInputProps {
  label?: string;
  error?: string;
  isPassword?: boolean;
  containerStyle?: any;
  inputStyle?: any;
  required?: boolean;
}

export const ValidatedInput: React.FC<ValidatedInputProps> = ({
  label,
  error,
  isPassword = false,
  containerStyle,
  inputStyle,
  required = false,
  ...props
}) => {
  const [showPassword, setShowPassword] = useState(false);
  const [isFocused, setIsFocused] = useState(false);

  const borderColor = error
    ? Colors.light.status.error
    : isFocused
    ? Colors.light.button.primary.background
    : Colors.light.border.primary;

  return (
    <View style={[styles.container, containerStyle]}>
      {label && (
        <Text style={styles.label}>
          {label}
          {required && <Text style={styles.required}> *</Text>}
        </Text>
      )}
      <View style={[styles.inputContainer, { borderColor }]}>
        <TextInput
          {...props}
          style={[styles.input, inputStyle]}
          placeholderTextColor={Colors.light.text.tertiary}
          secureTextEntry={isPassword && !showPassword}
          onFocus={(e) => {
            setIsFocused(true);
            props.onFocus?.(e);
          }}
          onBlur={(e) => {
            setIsFocused(false);
            props.onBlur?.(e);
          }}
        />
        {isPassword && (
          <Pressable
            onPress={() => setShowPassword(!showPassword)}
            style={styles.eyeIcon}
          >
            <Ionicons
              name={showPassword ? 'eye-off' : 'eye'}
              size={20}
              color={Colors.light.text.secondary}
            />
          </Pressable>
        )}
      </View>
      {error && <Text style={styles.error}>{error}</Text>}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginBottom: Spacing.md,
  },
  label: {
    ...Typography.styles.bodyMedium,
    color: Colors.light.text.primary,
    marginBottom: Spacing.xs,
    fontWeight: '600',
  },
  required: {
    color: Colors.light.status.error,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: BorderRadius.md,
    backgroundColor: Colors.light.background.secondary,
  },
  input: {
    flex: 1,
    padding: Spacing.md,
    ...Typography.styles.bodyMedium,
    color: Colors.light.text.primary,
  },
  eyeIcon: {
    padding: Spacing.md,
  },
  error: {
    ...Typography.styles.bodySmall,
    color: Colors.light.status.error,
    marginTop: Spacing.xs,
  },
});