import React, { useState, useRef } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Animated, Dimensions } from 'react-native';
import { Colors } from '../../constants/Colors';
import { Spacing, BorderRadius } from '../../constants/Spacing';

type PrivacyOption = 'family' | 'personal' | 'custom';

interface PrivacySegmentedControlProps {
  options: { label: string; value: PrivacyOption }[];
  selectedValue: PrivacyOption;
  onValueChange: (value: PrivacyOption) => void;
}

const { width } = Dimensions.get('window');
const CONTROL_WIDTH_PERCENTAGE = 0.9; // Use 90% of screen width for the control
const PADDING_HORIZONTAL = Spacing.screen_horizontal_padding || 20;


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
      useNativeDriver: false, // left style is not supported with native driver
    }).start();
  };
  
  // Initial position based on selectedValue
  React.useEffect(() => {
    const initialIndex = options.findIndex(opt => opt.value === selectedValue);
    if (initialIndex !== -1 && segmentWidth > 0) {
      slideAnim.setValue(initialIndex * segmentWidth);
    }
  }, [selectedValue, options, segmentWidth, slideAnim]);

  return (
    <View 
      style={styles.container} 
      onLayout={(event) => {
        const { width: layoutWidth } = event.nativeEvent.layout;
        setControlWidth(layoutWidth);
      }}
    >
      <Animated.View
        style={[
          styles.slider,
          { width: segmentWidth > 0 ? segmentWidth : '33.33%', transform: [{ translateX: slideAnim }] },
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
    backgroundColor: Colors.palette.neutral[200], // Light gray background
    borderRadius: BorderRadius.md,
    marginHorizontal: (width * (1 - CONTROL_WIDTH_PERCENTAGE)) / 2, // Center the control
    overflow: 'hidden',
    position: 'relative',
    borderWidth: 1,
    borderColor: Colors.palette.neutral[300],
  },
  slider: {
    position: 'absolute',
    height: '100%',
    backgroundColor: Colors.palette.dynastyGreen.medium, // Dynasty Green for selected
    borderRadius: BorderRadius.md -1, // slightly smaller to fit inside border
    top: 0,
    left: 0,
  },
  segmentButton: {
    flex: 1, // Distribute space equally
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: Spacing.sm,
  },
  segmentText: {
    fontSize: 15,
    fontWeight: '500',
    color: Colors.palette.neutral.dark, // Darker gray for unselected text
    textAlign: 'center',
  },
  segmentTextSelected: {
    color: Colors.palette.neutral.white, // White text for selected
  },
});

export default PrivacySegmentedControl; 