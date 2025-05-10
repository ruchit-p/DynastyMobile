/**
 * Below are the colors that are used in the app. The colors are defined in the light and dark mode.
 * There are many other ways to style your app. For example, [Nativewind](https://www.nativewind.dev/), [Tamagui](https://tamagui.dev/), [unistyles](https://reactnativeunistyles.vercel.app), etc.
 */

const tintColorLight = '#0a7ea4';
const tintColorDark = '#fff';

const dynastyGreen = '#1A4B44'; // Dynasty primary color
const dynastyGreenLight = '#A3C1AD'; // A lighter shade for highlighting
const backgroundColor = '#F4F4F4';

export const Colors = {
  light: {
    text: '#11181C',
    background: '#fff',
    tint: tintColorLight,
    icon: '#687076',
    tabIconDefault: '#687076',
    tabIconSelected: tintColorLight,
    primary: dynastyGreen, // Added Dynasty Green for light theme
    segmentActive: dynastyGreen, // For active segments
    buttonBackground: dynastyGreen,
    buttonText: '#FFFFFF',
    backgroundColor: backgroundColor,
  },
  dark: {
    text: '#ECEDEE',
    background: '#151718',
    tint: tintColorDark,
    icon: '#9BA1A6',
    tabIconDefault: '#9BA1A6',
    tabIconSelected: tintColorDark,
    primary: dynastyGreen, // Added Dynasty Green for dark theme (can adjust if a diff dark green is needed)
    segmentActive: dynastyGreen,
    buttonBackground: dynastyGreen,
    buttonText: '#FFFFFF',
  },
  // Add common colors if not theme-dependent
  dynastyGreen: dynastyGreen, // Exporting it directly as well for easy access
  dynastyGreenLight: dynastyGreenLight, // Exporting the light green
};
