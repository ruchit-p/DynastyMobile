import React, { useState, useRef } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Animated, Dimensions, Platform } from 'react-native';
import { Colors } from '../../constants/Colors';
import { Spacing, BorderRadius } from '../../constants/Spacing';
import { BlurView } from 'expo-blur';

type PrivacyOption = 'family' | 'personal' | 'custom';

interface PrivacySegmentedControlProps {
  options: { label: string; value: PrivacyOption }[];
  selectedValue: PrivacyOption;
  onValueChange: (value: PrivacyOption) => void;
}

const { width } = Dimensions.get('window');
const CONTROL_WIDTH_PERCENTAGE = 0.9; // Use 90% of screen width for the control

const PrivacySegmentedControl: React.FC<PrivacySegmentedControlProps> = ({
  options,
  selectedValue,
  onValueChange,
}) => {
  const [controlWidth, setControlWidth] = useState(0);
  const numOptions = options.length;
  const segmentWidth = controlWidth / numOptions;
  const slideAnim = useRef(new Animated.Value(0)).current;

  const handlePress = (value: PrivacyOption, index: number) => {
    onValueChange(value);
    Animated.spring(slideAnim, {
      toValue: index * segmentWidth,
      useNativeDriver: false, // We need to animate non-transform properties
      tension: 50,            // Lower tension for smoother animation
      friction: 9,            // Adjust friction for desired bounce effect
    }).start();
  };
  
  // Initial position based on selectedValue
  React.useEffect(() => {
    const initialIndex = options.findIndex(opt => opt.value === selectedValue);
    if (initialIndex !== -1 && segmentWidth > 0) {
      slideAnim.setValue(initialIndex * segmentWidth);
    }
  }, [selectedValue, options, segmentWidth, slideAnim]);

  // Determine if we should use BlurView based on platform
  const usesBlur = Platform.OS === 'ios';

  return (
    <View 
      style={styles.container} 
      onLayout={(event) => {
        const { width: layoutWidth } = event.nativeEvent.layout;
        setControlWidth(layoutWidth);
      }}
    >
      {usesBlur ? (
        // iOS: Use BlurView for frosted glass effect
        <BlurView 
          intensity={25} 
          tint="light" 
          style={StyleSheet.absoluteFillObject}
        />
      ) : (
        // Android: Use semi-transparent background
        <View style={[StyleSheet.absoluteFillObject, styles.androidBackdrop]} />
      )}
      
      <Animated.View
        style={[
          styles.slider,
          { 
            width: segmentWidth > 0 ? segmentWidth : '33.33%', 
            transform: [{ translateX: slideAnim }],
          },
        ]}
      />
      
      {options.map((option, index) => (
        <TouchableOpacity
          key={option.value}
          style={[
            styles.segmentButton,
            { width: segmentWidth > 0 ? segmentWidth : '33.33%' }
          ]}
          onPress={() => handlePress(option.value, index)}
          activeOpacity={0.7}
        >
          <Text
            style={[
              styles.segmentText,
              selectedValue === option.value && styles.segmentTextSelected,
            ]}
          >
            {option.label}
          </Text>
        </TouchableOpacity>
      ))}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    height: 44,
    borderRadius: BorderRadius.md,
    marginHorizontal: (width * (1 - CONTROL_WIDTH_PERCENTAGE)) / 2, // Center the control
    overflow: 'hidden',
    position: 'relative',
    borderWidth: 1,
    borderColor: 'rgba(200, 200, 200, 0.3)', // Lighter, semi-transparent border
  },
  androidBackdrop: {
    backgroundColor: 'rgba(240, 240, 240, 0.85)', // Semi-transparent background for Android
  },
  slider: {
    position: 'absolute',
    height: '100%',
    backgroundColor: Platform.OS === 'ios' 
      ? 'rgba(26, 75, 68, 0.85)'  // Semi-transparent Dynasty Green for iOS
      : Colors.palette.dynastyGreen.dark,  // Solid color for Android
    borderRadius: BorderRadius.md - 1, // slightly smaller to fit inside border
    top: 0,
    left: 0,
    // Add shadow for depth (iOS only)
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.2,
        shadowRadius: 2,
      },
      android: {
        elevation: 2,
      },
    }),
  },
  segmentButton: {
    flex: 1, // Distribute space equally
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: Spacing.sm,
    zIndex: 1, // Ensure buttons are above the slider
  },
  segmentText: {
    fontSize: 15,
    fontWeight: '600',
    color: Colors.palette.neutral.dark, // Darker gray for unselected text
    textAlign: 'center',
  },
  segmentTextSelected: {
    color: Platform.OS === 'ios' 
      ? '#FFFFFF'  // White text for iOS
      : Colors.palette.neutral.white, // White text for Android
  },
});

export default PrivacySegmentedControl; 