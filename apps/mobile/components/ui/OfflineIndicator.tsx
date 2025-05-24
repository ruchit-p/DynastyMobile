import React, { useEffect, useRef } from 'react';
import { View, Text, Animated, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useThemeColor } from '@/hooks/useThemeColor';
import { Colors } from '@/constants/Colors';
import { Spacing, BorderRadius } from '@/constants/Spacing';
import Typography from '@/constants/Typography';

interface OfflineIndicatorProps {
  isOnline: boolean;
  position?: 'top' | 'bottom';
}

/**
 * OfflineIndicator - Shows network connectivity status
 * Displays a small, unobtrusive indicator that animates between online/offline states
 */
export const OfflineIndicator = React.memo<OfflineIndicatorProps>(({ 
  isOnline, 
  position = 'top' 
}) => {
  const backgroundColor = useThemeColor(
    { 
      light: isOnline ? Colors.light.status.success : Colors.light.status.error,
      dark: isOnline ? Colors.dark.status.success : Colors.dark.status.error
    },
    'background'
  );
  
  const textColor = useThemeColor(
    { light: Colors.light.text.inverse, dark: Colors.dark.text.inverse },
    'text'
  );
  
  const iconColor = useThemeColor(
    { light: Colors.light.text.inverse, dark: Colors.dark.text.inverse },
    'text'
  );

  // Animation values
  const translateY = useRef(new Animated.Value(isOnline ? -50 : 0)).current;
  const opacity = useRef(new Animated.Value(isOnline ? 0 : 1)).current;

  useEffect(() => {
    // Animate indicator based on connection status
    if (isOnline) {
      // Online: hide indicator after a delay
      Animated.sequence([
        Animated.delay(2000),
        Animated.parallel([
          Animated.timing(translateY, {
            toValue: -50,
            duration: 300,
            useNativeDriver: true,
          }),
          Animated.timing(opacity, {
            toValue: 0,
            duration: 300,
            useNativeDriver: true,
          }),
        ]),
      ]).start();
    } else {
      // Offline: show indicator immediately
      Animated.parallel([
        Animated.timing(translateY, {
          toValue: 0,
          duration: 300,
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 1,
          duration: 300,
          useNativeDriver: true,
        }),
      ]).start();
    }
  }, [isOnline, translateY, opacity]);

  return (
    <Animated.View
      style={[
        styles.container,
        position === 'bottom' ? styles.bottom : styles.top,
        {
          backgroundColor,
          transform: [{ translateY }],
          opacity,
        },
      ]}
    >
      <View style={styles.content}>
        <Ionicons 
          name={isOnline ? 'wifi' : 'wifi-outline'} 
          size={16} 
          color={iconColor}
          style={styles.icon}
        />
        <Text style={[styles.text, { color: textColor }]}>
          {isOnline ? 'Back Online' : 'No Connection'}
        </Text>
      </View>
    </Animated.View>
  );
});

OfflineIndicator.displayName = 'OfflineIndicator';

export default OfflineIndicator;

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    left: Spacing.lg,
    right: Spacing.lg,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    borderRadius: BorderRadius.full,
    zIndex: 1000,
    elevation: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  top: {
    top: Spacing.xl + 10, // Account for status bar
  },
  bottom: {
    bottom: Spacing.xl + 80, // Account for tab bar
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  icon: {
    marginRight: Spacing.xs,
  },
  text: {
    ...Typography.styles.bodySmall,
    fontWeight: Typography.weight.medium,
  },
});