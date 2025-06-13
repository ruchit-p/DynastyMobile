/**
 * Dynasty Mobile Design System - Colors
 * A comprehensive color system with semantic naming and theme support
 */

// Base color palette - raw color values
const palette = {
  // Primary colors - Dynasty Greens
  dynastyGreen: {
    dark: '#163D21',       // British racing green
    primary: '#14562D',    // Cal Poly green
    light: '#6DBC74',      // Mantis
    extraLight: '#B0EDB1', // Celadon
  },
  
  // Gold colors
  dynastyGold: {
    light: '#FFB81F',      // Selective yellow
    dark: '#D4AF4A',       // Gold metallic
  },
  
  // Neutral colors for text, backgrounds, etc.
  neutral: {
    black: '#1E1D1E',      // Eerie black
    darkest: '#1E1D1E',    // Eerie black
    dark: '#595E65',       // Davy's gray
    medium: '#595E65',     // Davy's gray
    light: '#DFDFDF',      // Platinum
    lighter: '#DFDFDF',    // Platinum
    lightest: '#F8F8F8',   // Seasalt
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
      link: palette.dynastyGreen.primary,      // Tint color
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
        background: palette.dynastyGreen.primary,
        text: palette.neutral.white,
      },
      secondary: {
        background: palette.neutral.lightest,
        text: palette.dynastyGreen.primary,
      },
    },
    icon: {
      primary: palette.dynastyGreen.primary,
      secondary: palette.neutral.medium,
    },
    tab: {
      active: palette.dynastyGreen.primary,
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
        background: palette.dynastyGreen.primary,
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
    tint: palette.dynastyGreen.primary,
    icon: palette.neutral.medium,
    tabIconDefault: palette.neutral.medium,
    tabIconSelected: palette.dynastyGreen.primary,
    primary: palette.dynastyGreen.primary,
    segmentActive: palette.dynastyGreen.primary,
    buttonBackground: palette.dynastyGreen.primary,
    buttonText: palette.neutral.white,
    backgroundColor: palette.neutral.lightest,
  },
  dark_legacy: {
    text: palette.neutral.lightest,
    background: '#151718',
    tint: palette.dynastyGreen.light,
    icon: palette.neutral.light,
    tabIconDefault: palette.neutral.light,
    tabIconSelected: palette.dynastyGreen.light,
    primary: palette.dynastyGreen.primary,
    segmentActive: palette.dynastyGreen.primary,
    buttonBackground: palette.dynastyGreen.primary,
    buttonText: palette.neutral.white,
  },
  
  // Common palette for reference
  palette,
  
  // Direct color access (for convenience)
  dynastyGreen: palette.dynastyGreen.primary,
  dynastyGreenDark: palette.dynastyGreen.dark,
  dynastyGreenLight: palette.dynastyGreen.light,
  dynastyGreenExtraLight: palette.dynastyGreen.extraLight,
  dynastyGoldLight: palette.dynastyGold.light,
  dynastyGoldDark: palette.dynastyGold.dark,
};

export default Colors;