import React from 'react';
import { View, StyleSheet, StyleProp, ViewStyle } from 'react-native';
import { useBorderColor } from '../../hooks/useThemeColor';
import { Spacing } from '../../constants/Spacing';

export interface DividerProps {
  // Appearance
  orientation?: 'horizontal' | 'vertical';
  thickness?: number;
  spacing?: number;
  inset?: number;
  
  // Style override
  style?: StyleProp<ViewStyle>;
  
  // Optional props
  testID?: string;
}

/**
 * Divider Component
 * 
 * A simple component for visually separating content.
 */
const Divider: React.FC<DividerProps> = ({
  orientation = 'horizontal',
  thickness = 1,
  spacing = Spacing.md,
  inset = 0,
  style,
  testID,
}) => {
  // Get theme color for border
  const borderColor = useBorderColor('primary');
  
  // Create style based on orientation
  const dividerStyle = orientation === 'horizontal'
    ? {
        height: thickness,
        marginVertical: spacing,
        marginLeft: inset,
        backgroundColor: borderColor,
      }
    : {
        width: thickness,
        marginHorizontal: spacing,
        marginTop: inset,
        backgroundColor: borderColor,
      };
  
  return (
    <View 
      style={[dividerStyle, style]} 
      testID={testID}
      accessibilityRole="separator"
    />
  );
};

export default Divider;