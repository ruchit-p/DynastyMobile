/**
 * Below are the colors that are used in the app. The colors are defined in the light and dark mode.
 * There are many other ways to style your app. For example, [Nativewind](https://www.nativewind.dev/), [Tamagui](https://tamagui.dev/), [unistyles](https://reactnativeunistyles.vercel.app), etc.
 */

const tintColorLight = '#0a7ea4';
const tintColorDark = '#fff';

// MARK: - Dynasty Color Palette
const dynastyGreen = '#1A4B44'; // Primary Green for light mode, also used as base
const dynastyGreenDark = '#0A5C36'; // Darker shade for dark mode primary or accents
const dynastyGreenLight = '#E8F5E9'; // Light shade for backgrounds or highlights
const white = '#FFFFFF';
const black = '#000000';
const gray = '#808080'; // General purpose gray
const lightGray = '#D3D3D3'; // Lighter gray for borders, placeholders
const darkGray = '#A9A9A9'; // Darker gray
const errorRed = '#D32F2F';

export const Colors = {
  dynastyGreen,
  dynastyGreenDark,
  dynastyGreenLight,
  white,
  black,
  gray,
  lightGray,
  darkGray,
  light: {
    text: black, // Main text color
    textSecondary: gray, // Lighter text for subtitles or less important info
    background: white,
    surface: dynastyGreenLight, // For surfaces like cards, headers if not primary
    card: white, // Added card color
    imagePlaceholder: lightGray, // Added image placeholder color
    border: lightGray,
    headerBackground: dynastyGreen,
    headerText: white,
    icon: black,
    tabIconDefault: gray,
    tabIconSelected: dynastyGreen,
    tint: dynastyGreen, // General tint color for controls
    primary: dynastyGreen,
    secondary: dynastyGreenDark, // Or another accent color if defined
    error: errorRed,
    success: '#28A745',
    warning: '#FFC107',
    dynastyGreen: dynastyGreen,
    dynastyGreenDark: dynastyGreenDark,
    dynastyGreenLight: dynastyGreenLight,
  },
  dark: {
    text: white, // Main text color
    textSecondary: '#CCCCCC', // For less prominent text in dark mode
    textMuted: '#777777', // For placeholder text or disabled elements in dark mode
    background: black, // Consider a very dark grey like #121212 for less starkness
    surface: '#121212', // Common dark mode surface color
    card: '#1E1E1E', // Added card color for dark mode
    imagePlaceholder: '#333333', // Added image placeholder color for dark mode
    border: '#272727', // Darker border color
    headerBackground: dynastyGreenDark,
    headerText: white,
    icon: white,
    tabIconDefault: gray,
    tabIconSelected: dynastyGreenLight, // Lighter green for selected tab in dark mode
    tint: dynastyGreenLight, // General tint color for controls in dark mode
    primary: dynastyGreenDark,
    secondary: dynastyGreen, // Regular green as secondary
    error: '#CF6679', // Material Design recommended dark mode error color
    success: '#28A745', // Success often keeps its color
    warning: '#FFC107', // Warning often keeps its color
    dynastyGreen: dynastyGreen, // Keep base definition accessible
    dynastyGreenDark: dynastyGreenDark,
    dynastyGreenLight: dynastyGreenLight,
  },
};

// Example of specific semantic colors (can be expanded)
export const SemanticColors = {
  buttonPrimaryBackground: Colors.light.primary,
  buttonPrimaryText: Colors.light.background,
  // ... add more for dark mode and other components
};
