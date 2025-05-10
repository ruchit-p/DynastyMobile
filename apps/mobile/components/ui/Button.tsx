import React from 'react';
import { 
  TouchableOpacity, 
  ActivityIndicator, 
  View, 
  StyleSheet, 
  StyleProp, 
  ViewStyle, 
  TextStyle,
  GestureResponderEvent
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

// Import from our design system
import { Colors } from '../../constants/Colors';
import Typography from '../../constants/Typography';
import { Spacing, BorderRadius, Shadows } from '../../constants/Spacing';
import { useColorScheme } from '../../hooks/useColorScheme';
import { useButtonBackgroundColor, useButtonTextColor } from '../../hooks/useThemeColor';
import ThemedText from '../ThemedText';

export type ButtonVariant = 'primary' | 'secondary' | 'text' | 'outline';
export type ButtonSize = 'small' | 'medium' | 'large';

export interface ButtonProps {
  // Button text
  title: string;
  
  // Action to perform when pressed
  onPress: (event: GestureResponderEvent) => void;
  
  // Visual variants
  variant?: ButtonVariant;
  size?: ButtonSize;
  fullWidth?: boolean;
  
  // Icons
  leftIcon?: keyof typeof Ionicons.glyphMap;
  rightIcon?: keyof typeof Ionicons.glyphMap;
  iconOnly?: keyof typeof Ionicons.glyphMap;
  
  // States
  isLoading?: boolean;
  isDisabled?: boolean;
  
  // Style overrides
  style?: StyleProp<ViewStyle>;
  textStyle?: StyleProp<TextStyle>;
  
  // Accessibility
  accessibilityLabel?: string;
  
  // Other props
  testID?: string;
}

/**
 * Button Component
 * 
 * A customizable button component with multiple variants, sizes, and states.
 */
const Button: React.FC<ButtonProps> = ({
  title,
  onPress,
  variant = 'primary',
  size = 'medium',
  fullWidth = false,
  leftIcon,
  rightIcon,
  iconOnly,
  isLoading = false,
  isDisabled = false,
  style,
  textStyle,
  accessibilityLabel,
  testID,
}) => {
  const colorScheme = useColorScheme();
  const theme = colorScheme || 'light';
  
  // Get theme-specific colors for button
  const backgroundColorKey = variant === 'primary' ? 'primary' : 'secondary';
  const backgroundColor = useButtonBackgroundColor(backgroundColorKey);
  const textColor = useButtonTextColor(backgroundColorKey);
  
  // Handle special variants
  let specialBackgroundColor = backgroundColor;
  let specialTextColor = textColor;
  let borderConfig = {};
  
  if (variant === 'text') {
    specialBackgroundColor = 'transparent';
    specialTextColor = Colors[theme].text.link;
  } else if (variant === 'outline') {
    specialBackgroundColor = 'transparent';
    specialTextColor = Colors[theme].button.primary.background;
    borderConfig = {
      borderWidth: 1,
      borderColor: Colors[theme].button.primary.background,
    };
  }
  
  // Size configurations
  const sizeStyles = {
    small: {
      paddingVertical: Spacing.xs,
      paddingHorizontal: Spacing.md,
      fontSize: Typography.size.sm,
      height: 32,
      iconSize: 16,
    },
    medium: {
      paddingVertical: Spacing.sm,
      paddingHorizontal: Spacing.lg,
      fontSize: Typography.size.md,
      height: 40,
      iconSize: 18,
    },
    large: {
      paddingVertical: Spacing.md,
      paddingHorizontal: Spacing.xl,
      fontSize: Typography.size.lg,
      height: 48,
      iconSize: 20,
    },
  };
  
  const { paddingVertical, paddingHorizontal, height, iconSize } = sizeStyles[size];
  
  // Combine styles
  const buttonStyles = [
    styles.button,
    {
      backgroundColor: specialBackgroundColor,
      paddingVertical,
      paddingHorizontal: iconOnly ? 0 : paddingHorizontal,
      height,
      width: iconOnly ? height : undefined,
    },
    variant !== 'text' && styles.buttonShadow,
    borderConfig,
    fullWidth && styles.fullWidth,
    (isDisabled || isLoading) && styles.buttonDisabled,
    iconOnly && styles.iconOnlyButton,
    style,
  ];
  
  // Determine what content to render
  const renderContent = () => {
    if (isLoading) {
      return (
        <ActivityIndicator 
          size="small" 
          color={specialTextColor} 
        />
      );
    }
    
    if (iconOnly) {
      return (
        <Ionicons 
          name={iconOnly} 
          size={iconSize} 
          color={specialTextColor} 
        />
      );
    }
    
    return (
      <View style={styles.contentContainer}>
        {leftIcon && (
          <Ionicons 
            name={leftIcon} 
            size={iconSize} 
            color={specialTextColor} 
            style={styles.leftIcon} 
          />
        )}
        
        <ThemedText
          variant="button"
          style={[
            { color: specialTextColor, fontSize: sizeStyles[size].fontSize },
            textStyle,
          ]}
        >
          {title}
        </ThemedText>
        
        {rightIcon && (
          <Ionicons 
            name={rightIcon} 
            size={iconSize} 
            color={specialTextColor} 
            style={styles.rightIcon} 
          />
        )}
      </View>
    );
  };
  
  return (
    <TouchableOpacity
      style={buttonStyles}
      onPress={onPress}
      disabled={isDisabled || isLoading}
      accessibilityLabel={accessibilityLabel || title}
      accessibilityRole="button"
      accessibilityState={{ 
        disabled: isDisabled || isLoading,
        busy: isLoading,
      }}
      testID={testID}
    >
      {renderContent()}
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  button: {
    borderRadius: BorderRadius.md,
    justifyContent: 'center',
    alignItems: 'center',
    flexDirection: 'row',
  },
  buttonShadow: {
    ...Shadows.xs,
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  contentContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  leftIcon: {
    marginRight: Spacing.xs,
  },
  rightIcon: {
    marginLeft: Spacing.xs,
  },
  fullWidth: {
    width: '100%',
  },
  iconOnlyButton: {
    borderRadius: BorderRadius.full,
    padding: 0,
  },
});

export default Button;