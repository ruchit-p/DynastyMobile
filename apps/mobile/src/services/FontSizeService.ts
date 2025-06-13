import AsyncStorage from '@react-native-async-storage/async-storage';
import { AccessibilityInfo, PixelRatio, Text } from 'react-native';
import { callFirebaseFunction } from '../lib/errorUtils';
import { LoggingService } from './LoggingService';

const logger = LoggingService.getInstance();

export enum FontSizePreset {
  EXTRA_SMALL = 0.85,
  SMALL = 0.9,
  MEDIUM = 1.0,
  LARGE = 1.1,
  EXTRA_LARGE = 1.25,
  HUGE = 1.5,
}

interface FontSizeSettings {
  fontScale: number;
  useDeviceSettings: boolean;
  lastUpdated: number;
}

class FontSizeService {
  private static instance: FontSizeService;
  private currentScale: number = 1.0;
  private useDeviceSettings: boolean = true;
  private listeners: Set<(scale: number) => void> = new Set();
  private userId: string | null = null;

  private constructor() {
    this.initializeAccessibility();
  }

  static getInstance(): FontSizeService {
    if (!FontSizeService.instance) {
      FontSizeService.instance = new FontSizeService();
    }
    return FontSizeService.instance;
  }

  private async initializeAccessibility() {
    try {
      // Check if user prefers reduced motion or larger text
      const isScreenReaderEnabled = await AccessibilityInfo.isScreenReaderEnabled();
      if (isScreenReaderEnabled) {
        // Automatically use larger font sizes when screen reader is enabled
        this.currentScale = FontSizePreset.LARGE;
      }

      // Get device font scale
      const deviceScale = PixelRatio.getFontScale();
      if (this.useDeviceSettings && deviceScale !== 1.0) {
        this.currentScale = deviceScale;
      }

      // Listen for accessibility changes
      AccessibilityInfo.addEventListener('screenReaderChanged', this.handleScreenReaderChange);
    } catch (error) {
      logger.error('Failed to initialize accessibility settings', { error });
    }
  }

  private handleScreenReaderChange = (isEnabled: boolean) => {
    if (isEnabled && this.currentScale < FontSizePreset.LARGE) {
      this.setFontScale(FontSizePreset.LARGE);
    }
  };

  async setUserId(userId: string) {
    this.userId = userId;
    await this.loadUserSettings();
  }

  async loadUserSettings() {
    try {
      if (!this.userId) return;

      // First check local cache
      const cacheKey = `font_settings_${this.userId}`;
      const cachedSettings = await AsyncStorage.getItem(cacheKey);
      
      if (cachedSettings) {
        const settings: FontSizeSettings = JSON.parse(cachedSettings);
        // Use cached settings if less than 24 hours old
        if (Date.now() - settings.lastUpdated < 24 * 60 * 60 * 1000) {
          this.currentScale = settings.fontScale;
          this.useDeviceSettings = settings.useDeviceSettings;
          this.notifyListeners();
          return;
        }
      }

      // Fetch from server
      const response = await callFirebaseFunction('getUserSettings', { userId: this.userId });
      if (response.data?.fontSettings) {
        const { fontScale, useDeviceSettings } = response.data.fontSettings;
        this.currentScale = fontScale || 1.0;
        this.useDeviceSettings = useDeviceSettings ?? true;
        
        // Update cache
        await AsyncStorage.setItem(cacheKey, JSON.stringify({
          fontScale: this.currentScale,
          useDeviceSettings: this.useDeviceSettings,
          lastUpdated: Date.now(),
        }));
        
        this.notifyListeners();
      }
    } catch (error) {
      logger.error('Failed to load font settings', { error, userId: this.userId });
    }
  }

  async setFontScale(scale: number) {
    this.currentScale = Math.max(0.5, Math.min(2.0, scale)); // Clamp between 0.5 and 2.0
    this.notifyListeners();

    // Save to local cache immediately
    if (this.userId) {
      const cacheKey = `font_settings_${this.userId}`;
      await AsyncStorage.setItem(cacheKey, JSON.stringify({
        fontScale: this.currentScale,
        useDeviceSettings: this.useDeviceSettings,
        lastUpdated: Date.now(),
      }));

      // Save to server
      try {
        await callFirebaseFunction('updateUserSettings', {
          fontSettings: {
            fontScale: this.currentScale,
            useDeviceSettings: this.useDeviceSettings,
          },
        });
      } catch (error) {
        logger.error('Failed to save font settings to server', { error });
      }
    }
  }

  async setUseDeviceSettings(use: boolean) {
    this.useDeviceSettings = use;
    if (use) {
      this.currentScale = PixelRatio.getFontScale();
      this.notifyListeners();
    }
    await this.setFontScale(this.currentScale); // This will save the settings
  }

  getFontScale(): number {
    return this.currentScale;
  }

  getScaledFontSize(baseSize: number): number {
    return Math.round(baseSize * this.currentScale);
  }

  // Scale line height proportionally
  getScaledLineHeight(baseLineHeight: number): number {
    return Math.round(baseLineHeight * this.currentScale);
  }

  // Scale spacing to maintain visual hierarchy
  getScaledSpacing(baseSpacing: number): number {
    // Scale spacing less aggressively than font size
    const spacingScale = 1 + (this.currentScale - 1) * 0.5;
    return Math.round(baseSpacing * spacingScale);
  }

  addListener(listener: (scale: number) => void) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notifyListeners() {
    this.listeners.forEach(listener => listener(this.currentScale));
  }

  // Override React Native Text default props
  configureTextDefaults() {
    const oldRender = Text.render;
    Text.render = function render(props: any, ref: any) {
      const newProps = { ...props };
      if (newProps.style) {
        const style = Array.isArray(newProps.style) ? newProps.style : [newProps.style];
        const scaledStyle = style.map((s: any) => {
          if (!s || typeof s !== 'object') return s;
          
          const scaled: any = { ...s };
          if (s.fontSize) {
            scaled.fontSize = FontSizeService.getInstance().getScaledFontSize(s.fontSize);
          }
          if (s.lineHeight) {
            scaled.lineHeight = FontSizeService.getInstance().getScaledLineHeight(s.lineHeight);
          }
          return scaled;
        });
        newProps.style = scaledStyle;
      }
      return oldRender.call(this, newProps, ref);
    };
  }

  cleanup() {
    AccessibilityInfo.removeEventListener('screenReaderChanged', this.handleScreenReaderChange);
  }
}

export default FontSizeService;