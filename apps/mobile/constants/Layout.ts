import { Dimensions } from 'react-native';

const { width, height } = Dimensions.get('window');

const spacing = {
  tiny: 4,
  small: 8,
  medium: 16,
  large: 24,
  xlarge: 32,
  xxlarge: 48,
};

const borderRadius = {
  small: 4,
  medium: 8,
  large: 16,
  xlarge: 24,
  round: 999, // For circular elements
};

const hitSlop = {
  small: { top: 5, bottom: 5, left: 5, right: 5 },
  medium: { top: 10, bottom: 10, left: 10, right: 10 },
  large: { top: 15, bottom: 15, left: 15, right: 15 },
};

export default {
  window: {
    width,
    height,
  },
  spacing,
  borderRadius,
  isSmallDevice: width < 375, // Example breakpoint
  hitSlop,
}; 