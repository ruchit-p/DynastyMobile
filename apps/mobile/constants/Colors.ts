/**
 * Dynasty Mobile Design System - Colors
 * A comprehensive color system with semantic naming and theme support
 */

// Base color palette - raw color values
const palette = {
  // Primary colors
  dynastyGreen: {
    dark: '#1A4B44',    // Primary green
    medium: '#2D7A6E',  // Medium shade
    light: '#A3C1AD',   // Light shade
    extraLight: '#E8F5E9', // Very subtle background
  },
  
  // Neutral colors for text, backgrounds, etc.
  neutral: {
    black: '#000000',
    darkest: '#11181C',  // Darkest text
    dark: '#333333',     // Dark text
    medium: '#687076',   // Medium text/icons
    light: '#9BA1A6',    // Light text/icons
    lighter: '#E0E0E0',  // Borders
    lightest: '#F4F4F4', // Background
    white: '#FFFFFF',
  },
  
  // Status/feedback colors
  status: {
    success: '#4CAF50',
    warning: '#FFC107',
    warningLight: '#FFF3CD',
    error: '#F44336',
    info: '#2196F3',
  },
};

// Semantic color system
export const Colors = {
  light: {
    text: {
      primary: palette.neutral.darkest,
      secondary: palette.neutral.dark,
      tertiary: palette.neutral.medium,
      inverse: palette.neutral.white,
      link: '#0a7ea4',      // Tint color
      success: palette.status.success,
      warning: palette.status.warning,
      error: palette.status.error,
    },
    background: {
      primary: palette.neutral.white,
      secondary: palette.neutral.lightest,
      tertiary: palette.dynastyGreen.extraLight,
    },
    border: {
      primary: palette.neutral.lighter,
      secondary: palette.neutral.light,
    },
    button: {
      primary: {
        background: palette.dynastyGreen.dark,
        text: palette.neutral.white,
      },
      secondary: {
        background: palette.neutral.lightest,
        text: palette.dynastyGreen.dark,
      },
    },
    icon: {
      primary: palette.dynastyGreen.dark,
      secondary: palette.neutral.medium,
    },
    tab: {
      active: palette.dynastyGreen.dark,
      inactive: palette.neutral.medium,
    },
    status: {
      success: palette.status.success,
      warning: palette.status.warning,
      warningLight: palette.status.warningLight,
      error: palette.status.error,
      info: palette.status.info,
    },
  },
  dark: {
    text: {
      primary: palette.neutral.lightest,
      secondary: palette.neutral.lighter,
      tertiary: palette.neutral.light,
      inverse: palette.neutral.darkest,
      link: palette.neutral.white,
      success: palette.status.success,
      warning: palette.status.warning,
      error: palette.status.error,
    },
    background: {
      primary: '#151718',    // Dark background
      secondary: '#212324',  // Slightly lighter
      tertiary: '#2A2D2E',   // Even lighter for cards
    },
    border: {
      primary: '#2A2D2E',
      secondary: '#3A3D3E',
    },
    button: {
      primary: {
        background: palette.dynastyGreen.dark,
        text: palette.neutral.white,
      },
      secondary: {
        background: '#212324',
        text: palette.neutral.white,
      },
    },
    icon: {
      primary: palette.dynastyGreen.light,
      secondary: palette.neutral.light,
    },
    tab: {
      active: palette.neutral.white,
      inactive: palette.neutral.light,
    },
    status: {
      success: palette.status.success,
      warning: palette.status.warning,
      warningLight: '#4A3B20', // Darker version for dark theme
      error: palette.status.error,
      info: palette.status.info,
    },
  },
  
  // Legacy support (for backward compatibility)
  light_legacy: {
    text: palette.neutral.darkest,
    background: palette.neutral.white,
    tint: '#0a7ea4',
    icon: palette.neutral.medium,
    tabIconDefault: palette.neutral.medium,
    tabIconSelected: palette.dynastyGreen.dark,
    primary: palette.dynastyGreen.dark,
    segmentActive: palette.dynastyGreen.dark,
    buttonBackground: palette.dynastyGreen.dark,
    buttonText: palette.neutral.white,
    backgroundColor: palette.neutral.lightest,
  },
  dark_legacy: {
    text: palette.neutral.lightest,
    background: '#151718',
    tint: palette.neutral.white,
    icon: palette.neutral.light,
    tabIconDefault: palette.neutral.light,
    tabIconSelected: palette.neutral.white,
    primary: palette.dynastyGreen.dark,
    segmentActive: palette.dynastyGreen.dark,
    buttonBackground: palette.dynastyGreen.dark,
    buttonText: palette.neutral.white,
  },
  
  // Common palette for reference
  palette,
  
  // Direct color access (for convenience)
  dynastyGreen: palette.dynastyGreen.dark, 
  dynastyGreenLight: palette.dynastyGreen.light,
};

export default Colors;