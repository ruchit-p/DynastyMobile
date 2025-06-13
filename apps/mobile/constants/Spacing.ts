/**
 * Dynasty Mobile Design System - Spacing
 * A consistent spacing system for margins, padding, and layout
 */

// Base spacing scale (in pixels)
export const Spacing = {
  xxs: 2,
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  '2xl': 40,
  '3xl': 48,
  '4xl': 64,
  '5xl': 80,
};

// Common border radius values
export const BorderRadius = {
  none: 0,
  xs: 2,
  sm: 4,
  md: 8,
  lg: 12,
  xl: 16,
  '2xl': 24,
  full: 9999,
};

// Shadow definitions for depth
export const Shadows = {
  none: {
    shadowColor: 'transparent',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0,
    shadowRadius: 0,
    elevation: 0,
  },
  xs: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 1,
    elevation: 1,
  },
  sm: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.15,
    shadowRadius: 2,
    elevation: 2,
  },
  md: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 3,
    elevation: 3,
  },
  lg: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.25,
    shadowRadius: 5,
    elevation: 5,
  },
  xl: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
};

// Common layout constants
export const Layout = {
  // Standard screen padding
  screenPadding: Spacing.md,
  screenHorizontalPadding: Spacing.md,
  screenVerticalPadding: Spacing.md,
  
  // Card properties
  cardPadding: Spacing.md,
  cardBorderRadius: BorderRadius.md,
  cardShadow: Shadows.sm,
  
  // List item properties
  listItemPadding: Spacing.md,
  listItemVerticalPadding: Spacing.md,
  listItemHorizontalPadding: Spacing.md,
  
  // Standard border properties
  borderWidth: 1,
  borderRadius: BorderRadius,
  
  // Element spacing
  elementSpacing: Spacing.md,
  
  // Section spacing
  sectionSpacing: Spacing.xl,
  
  // Shadows for various elements
  shadows: Shadows,
};

export default {
  Spacing,
  BorderRadius,
  Shadows,
  Layout,
};