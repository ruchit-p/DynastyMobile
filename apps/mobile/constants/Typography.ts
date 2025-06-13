/**
 * Dynasty Mobile Design System - Typography
 * A comprehensive typography system for consistent text styling
 */

// Font family definitions
export const FontFamily = {
  regular: 'Helvetica Neue',
  medium: 'HelveticaNeue-Medium', // Add if available in your app
  semiBold: 'HelveticaNeue-SemiBold', // Add if available
  bold: 'HelveticaNeue-Bold',
  // Add your custom fonts here as needed
};

// Font size scale (in pixels)
export const FontSize = {
  xs: 10,
  sm: 12,
  md: 14,
  lg: 16,
  xl: 18,
  '2xl': 20,
  '3xl': 24,
  '4xl': 28,
  '5xl': 32,
  '6xl': 38,
};

// Font weight definitions
export const FontWeight = {
  light: '300' as '300',
  regular: 'normal' as 'normal',
  medium: '500' as '500',
  semiBold: '600' as '600',
  bold: 'bold' as 'bold',
};

// Line height scale
export const LineHeight = {
  xs: 14,
  sm: 18,
  md: 22,
  lg: 24,
  xl: 28,
  '2xl': 32,
  '3xl': 36,
  '4xl': 40,
};

// Text style definitions (pre-defined combinations of the above)
export const TextStyles = {
  // Headings
  heading1: {
    fontFamily: FontFamily.bold,
    fontSize: FontSize['6xl'],
    lineHeight: LineHeight['4xl'],
    fontWeight: FontWeight.bold,
  },
  heading2: {
    fontFamily: FontFamily.bold,
    fontSize: FontSize['5xl'],
    lineHeight: LineHeight['3xl'],
    fontWeight: FontWeight.bold,
  },
  heading3: {
    fontFamily: FontFamily.bold,
    fontSize: FontSize['4xl'],
    lineHeight: LineHeight['2xl'],
    fontWeight: FontWeight.bold,
  },
  heading4: {
    fontFamily: FontFamily.bold,
    fontSize: FontSize['3xl'],
    lineHeight: LineHeight.xl,
    fontWeight: FontWeight.bold,
  },
  heading5: {
    fontFamily: FontFamily.bold,
    fontSize: FontSize['2xl'],
    lineHeight: LineHeight.lg,
    fontWeight: FontWeight.bold,
  },
  
  // Body text
  bodyLarge: {
    fontFamily: FontFamily.regular,
    fontSize: FontSize.xl,
    lineHeight: LineHeight.lg,
    fontWeight: FontWeight.regular,
  },
  bodyMedium: {
    fontFamily: FontFamily.regular,
    fontSize: FontSize.lg,
    lineHeight: LineHeight.md,
    fontWeight: FontWeight.regular,
  },
  bodySmall: {
    fontFamily: FontFamily.regular,
    fontSize: FontSize.md,
    lineHeight: LineHeight.sm,
    fontWeight: FontWeight.regular,
  },
  
  // Special text styles
  caption: {
    fontFamily: FontFamily.regular,
    fontSize: FontSize.sm,
    lineHeight: LineHeight.xs,
    fontWeight: FontWeight.regular,
  },
  button: {
    fontFamily: FontFamily.medium || FontFamily.regular,
    fontSize: FontSize.lg,
    lineHeight: LineHeight.md,
    fontWeight: FontWeight.medium,
  },
  link: {
    fontFamily: FontFamily.regular,
    fontSize: FontSize.lg,
    lineHeight: LineHeight.md,
    fontWeight: FontWeight.regular,
    textDecorationLine: 'underline',
  },
};

// Legacy support for the old system
const legacyType = {
  base: FontFamily.regular,
  bold: FontFamily.bold,
};

const legacySize = {
  h1: FontSize['6xl'],
  h2: FontSize['5xl'],
  h3: FontSize['4xl'],
  h4: FontSize['3xl'],
  h5: FontSize['2xl'],
  large: FontSize.xl,
  medium: FontSize.lg,
  regular: FontSize.md,
  small: FontSize.sm,
  tiny: FontSize.xs,
};

const legacyWeight = FontWeight;
const legacyStyle = {
  normal: 'normal' as 'normal',
  italic: 'italic' as 'italic',
};

// Export a combined object for import convenience
export const Typography = {
  // Modern system
  family: FontFamily,
  size: FontSize, 
  weight: FontWeight,
  lineHeight: LineHeight,
  styles: TextStyles,
  
  // Legacy system
  type: legacyType,
  legacySize,
  legacyWeight,
  legacyStyle,
};

export default Typography;