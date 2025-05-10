/**
 * Enhanced Theme Hook for the Dynasty Mobile Design System
 * Supports both legacy and new design system color access patterns
 */

import { Colors } from '../constants/Colors';
import { useColorScheme } from './useColorScheme';

// Type for legacy theme access
type LegacyColorKey = keyof typeof Colors.light_legacy & keyof typeof Colors.dark_legacy;

// Types for nested theme access
type TextColorKey = keyof typeof Colors.light.text;
type BackgroundColorKey = keyof typeof Colors.light.background;
type BorderColorKey = keyof typeof Colors.light.border;
type ButtonColorKey = keyof typeof Colors.light.button;
type IconColorKey = keyof typeof Colors.light.icon;
type TabColorKey = keyof typeof Colors.light.tab;

// Type for new semantic color paths
type ColorPath = 
  | { category: 'text'; key: TextColorKey }
  | { category: 'background'; key: BackgroundColorKey }
  | { category: 'border'; key: BorderColorKey }
  | { category: 'button'; key: ButtonColorKey; subKey?: 'background' | 'text' }
  | { category: 'icon'; key: IconColorKey }
  | { category: 'tab'; key: TabColorKey };

/**
 * Legacy theme hook - supports old pattern with flat color structure
 * @param props Custom light/dark colors to override system colors
 * @param colorName The color key to retrieve
 * @returns The theme color value
 */
export function useThemeColor(
  props: { light?: string; dark?: string },
  colorName: LegacyColorKey
): string {
  const theme = useColorScheme() ?? 'light';
  const legacyThemeKey = theme === 'light' ? 'light_legacy' : 'dark_legacy';
  
  // Use custom color if provided
  if (props[theme]) {
    return props[theme]!;
  }
  
  // Otherwise use the system color
  return Colors[legacyThemeKey][colorName];
}

/**
 * New semantic color hook - for accessing the structured color system
 * @param path The nested path to the color
 * @param props Optional custom light/dark colors to override system colors
 * @returns The theme color value
 */
export function useSemanticColor(
  path: ColorPath,
  props?: { light?: string; dark?: string }
): string {
  const theme = useColorScheme() ?? 'light';
  
  // Use custom color if provided
  if (props && props[theme]) {
    return props[theme]!;
  }
  
  // For button, we need to access the subKey
  if (path.category === 'button' && path.subKey) {
    return Colors[theme][path.category][path.key][path.subKey];
  }
  
  // Otherwise get the color from the semantic color system
  return Colors[theme][path.category][path.key];
}

/**
 * Simplified helpers for common color needs
 */

export function useTextColor(key: TextColorKey = 'primary', props?: { light?: string; dark?: string }): string {
  return useSemanticColor({ category: 'text', key }, props);
}

export function useBackgroundColor(key: BackgroundColorKey = 'primary', props?: { light?: string; dark?: string }): string {
  return useSemanticColor({ category: 'background', key }, props);
}

export function useBorderColor(key: BorderColorKey = 'primary', props?: { light?: string; dark?: string }): string {
  return useSemanticColor({ category: 'border', key }, props);
}

export function useButtonBackgroundColor(key: ButtonColorKey = 'primary', props?: { light?: string; dark?: string }): string {
  return useSemanticColor({ category: 'button', key, subKey: 'background' }, props);
}

export function useButtonTextColor(key: ButtonColorKey = 'primary', props?: { light?: string; dark?: string }): string {
  return useSemanticColor({ category: 'button', key, subKey: 'text' }, props);
}

export function useIconColor(key: IconColorKey = 'primary', props?: { light?: string; dark?: string }): string {
  return useSemanticColor({ category: 'icon', key }, props);
}

export function useTabColor(key: TabColorKey = 'active', props?: { light?: string; dark?: string }): string {
  return useSemanticColor({ category: 'tab', key }, props);
}

export default {
  useThemeColor,
  useSemanticColor,
  useTextColor,
  useBackgroundColor,
  useBorderColor,
  useButtonBackgroundColor,
  useButtonTextColor,
  useIconColor,
  useTabColor,
};