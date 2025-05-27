import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ViewStyle,
  TextStyle,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { Colors } from '../../constants/Colors';
import { Spacing, BorderRadius } from '../../constants/Spacing';
import { Typography } from '../../constants/Typography';
import { useColorScheme } from '../../hooks/useColorScheme';

export type VerificationLevel = 'verified' | 'unverified' | 'changed';

export interface VerificationIndicatorProps {
  level: VerificationLevel;
  size?: 'small' | 'medium' | 'large';
  showLabel?: boolean;
  labelPosition?: 'right' | 'bottom';
  onPress?: () => void;
  style?: ViewStyle;
  labelStyle?: TextStyle;
  testID?: string;
}

/**
 * VerificationIndicator Component
 * 
 * Shows the verification status of a contact with an icon and optional label.
 * Can be used in chat headers, contact lists, and message bubbles.
 */
const VerificationIndicator: React.FC<VerificationIndicatorProps> = ({
  level,
  size = 'medium',
  showLabel = false,
  labelPosition = 'right',
  onPress,
  style,
  labelStyle,
  testID,
}) => {
  const colorScheme = useColorScheme();
  const theme = colorScheme || 'light';
  const colors = Colors[theme];

  // Size configurations
  const sizeConfig = {
    small: {
      iconSize: 12,
      containerSize: 20,
      fontSize: 11,
    },
    medium: {
      iconSize: 16,
      containerSize: 28,
      fontSize: 12,
    },
    large: {
      iconSize: 20,
      containerSize: 36,
      fontSize: 14,
    },
  };

  const config = sizeConfig[size];

  // Level configurations
  const levelConfig = {
    verified: {
      icon: 'shield-checkmark' as const,
      color: colors.success,
      label: 'Verified',
      backgroundColor: colors.success + '20',
    },
    unverified: {
      icon: 'shield-outline' as const,
      color: colors.text.tertiary,
      label: 'Not Verified',
      backgroundColor: colors.background.secondary,
    },
    changed: {
      icon: 'warning' as const,
      color: colors.warning,
      label: 'Key Changed',
      backgroundColor: colors.warning + '20',
    },
  };

  const { icon, color, label, backgroundColor } = levelConfig[level];

  const Container = onPress ? TouchableOpacity : View;
  const containerProps = onPress ? { 
    onPress, 
    activeOpacity: 0.7,
    accessibilityRole: 'button' as const,
    accessibilityLabel: `Verification status: ${label}`,
  } : {};

  return (
    <Container
      style={[
        styles.container,
        labelPosition === 'bottom' && styles.containerColumn,
        style,
      ]}
      testID={testID}
      {...containerProps}
    >
      <View 
        style={[
          styles.iconContainer,
          {
            width: config.containerSize,
            height: config.containerSize,
            backgroundColor,
          }
        ]}
      >
        <Ionicons 
          name={icon} 
          size={config.iconSize} 
          color={color} 
        />
      </View>

      {showLabel && (
        <Text 
          style={[
            styles.label,
            {
              color: level === 'unverified' ? colors.text.secondary : color,
              fontSize: config.fontSize,
              marginLeft: labelPosition === 'right' ? Spacing.xs : 0,
              marginTop: labelPosition === 'bottom' ? Spacing.xs / 2 : 0,
            },
            labelStyle,
          ]}
        >
          {label}
        </Text>
      )}
    </Container>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  containerColumn: {
    flexDirection: 'column',
  },
  iconContainer: {
    borderRadius: BorderRadius.full,
    justifyContent: 'center',
    alignItems: 'center',
  },
  label: {
    ...Typography.styles.caption,
    fontWeight: '500',
  },
});

export default VerificationIndicator;