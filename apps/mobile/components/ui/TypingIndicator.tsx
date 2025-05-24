import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Animated } from 'react-native';
import { Colors } from '../../constants/Colors';
import { useThemeColor } from '../../hooks/useThemeColor';

interface TypingIndicatorProps {
  userNames: string[];
  isVisible: boolean;
}

export default function TypingIndicator({ userNames, isVisible }: TypingIndicatorProps) {
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const dot1Anim = useRef(new Animated.Value(0)).current;
  const dot2Anim = useRef(new Animated.Value(0)).current;
  const dot3Anim = useRef(new Animated.Value(0)).current;
  
  const textColor = useThemeColor({}, 'text');
  const borderColor = useThemeColor({}, 'border');

  useEffect(() => {
    if (isVisible) {
      // Fade in
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 200,
        useNativeDriver: true,
      }).start();

      // Start dot animations
      const dotAnimation = (dotAnim: Animated.Value, delay: number) => {
        return Animated.loop(
          Animated.sequence([
            Animated.delay(delay),
            Animated.timing(dotAnim, {
              toValue: 1,
              duration: 300,
              useNativeDriver: true,
            }),
            Animated.timing(dotAnim, {
              toValue: 0,
              duration: 300,
              useNativeDriver: true,
            }),
          ])
        );
      };

      const animations = [
        dotAnimation(dot1Anim, 0),
        dotAnimation(dot2Anim, 150),
        dotAnimation(dot3Anim, 300),
      ];

      animations.forEach(anim => anim.start());

      return () => {
        animations.forEach(anim => anim.stop());
      };
    } else {
      // Fade out
      Animated.timing(fadeAnim, {
        toValue: 0,
        duration: 200,
        useNativeDriver: true,
      }).start();
    }
  }, [isVisible, fadeAnim, dot1Anim, dot2Anim, dot3Anim]);

  if (!isVisible || userNames.length === 0) {
    return null;
  }

  const getTypingText = () => {
    if (userNames.length === 1) {
      return `${userNames[0]} is typing`;
    } else if (userNames.length === 2) {
      return `${userNames[0]} and ${userNames[1]} are typing`;
    } else {
      return `${userNames[0]} and ${userNames.length - 1} others are typing`;
    }
  };

  return (
    <Animated.View style={[styles.container, { opacity: fadeAnim }]}>
      <View style={[styles.bubble, { backgroundColor: borderColor }]}>
        <View style={styles.dotsContainer}>
          <Animated.View
            style={[
              styles.dot,
              {
                opacity: dot1Anim,
                transform: [{
                  translateY: dot1Anim.interpolate({
                    inputRange: [0, 1],
                    outputRange: [0, -3],
                  }),
                }],
              },
            ]}
          />
          <Animated.View
            style={[
              styles.dot,
              {
                opacity: dot2Anim,
                transform: [{
                  translateY: dot2Anim.interpolate({
                    inputRange: [0, 1],
                    outputRange: [0, -3],
                  }),
                }],
              },
            ]}
          />
          <Animated.View
            style={[
              styles.dot,
              {
                opacity: dot3Anim,
                transform: [{
                  translateY: dot3Anim.interpolate({
                    inputRange: [0, 1],
                    outputRange: [0, -3],
                  }),
                }],
              },
            ]}
          />
        </View>
      </View>
      <Text style={[styles.text, { color: textColor }]}>{getTypingText()}</Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  bubble: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 18,
  },
  dotsContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: Colors.light.primary,
  },
  text: {
    fontSize: 12,
    marginLeft: 8,
    fontStyle: 'italic',
  },
});