import { auth } from '@/lib/firebase';
import { httpsCallable } from 'firebase/functions';
import { functions } from '@/lib/firebase';

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
    this.loadFromLocalStorage();
  }

  static getInstance(): FontSizeService {
    if (!FontSizeService.instance) {
      FontSizeService.instance = new FontSizeService();
    }
    return FontSizeService.instance;
  }

  private loadFromLocalStorage() {
    try {
      if (typeof window === 'undefined') {
        return; // Skip localStorage on server
      }
      const stored = localStorage.getItem('fontSettings');
      if (stored) {
        const settings: FontSizeSettings = JSON.parse(stored);
        this.currentScale = settings.fontScale;
        this.useDeviceSettings = settings.useDeviceSettings;
      }
    } catch (error) {
      console.error('Failed to load font settings from localStorage', error);
    }
  }

  private saveToLocalStorage() {
    try {
      if (typeof window === 'undefined') {
        return; // Skip localStorage on server
      }
      const settings: FontSizeSettings = {
        fontScale: this.currentScale,
        useDeviceSettings: this.useDeviceSettings,
        lastUpdated: Date.now(),
      };
      localStorage.setItem('fontSettings', JSON.stringify(settings));
    } catch (error) {
      console.error('Failed to save font settings to localStorage', error);
    }
  }

  async setUserId(userId: string) {
    this.userId = userId;
    await this.loadUserSettings();
  }

  async loadUserSettings() {
    try {
      if (!this.userId) return;

      // First check local storage with user-specific key
      const userKey = `fontSettings_${this.userId}`;
      const cachedSettings = typeof window !== 'undefined' ? localStorage.getItem(userKey) : null;
      
      if (cachedSettings) {
        const settings: FontSizeSettings = JSON.parse(cachedSettings);
        // Use cached settings if less than 24 hours old
        if (Date.now() - settings.lastUpdated < 24 * 60 * 60 * 1000) {
          this.currentScale = settings.fontScale;
          this.useDeviceSettings = settings.useDeviceSettings;
          this.notifyListeners();
          this.applyScale();
          return;
        }
      }

      // Fetch from server
      const getUserSettings = httpsCallable(functions, 'getUserSettings');
      const response = await getUserSettings({ userId: this.userId });
      const data = response.data as any;
      
      if (data?.fontSettings) {
        const { fontScale, useDeviceSettings } = data.fontSettings;
        this.currentScale = fontScale || 1.0;
        this.useDeviceSettings = useDeviceSettings ?? true;
        
        // Update local storage
        if (typeof window !== 'undefined') {
          localStorage.setItem(userKey, JSON.stringify({
            fontScale: this.currentScale,
            useDeviceSettings: this.useDeviceSettings,
            lastUpdated: Date.now(),
          }));
        }
        
        this.notifyListeners();
        this.applyScale();
      }
    } catch (error) {
      console.error('Failed to load font settings from server', error);
    }
  }

  async setFontScale(scale: number) {
    this.currentScale = Math.max(0.5, Math.min(2.0, scale)); // Clamp between 0.5 and 2.0
    this.saveToLocalStorage();
    this.notifyListeners();
    this.applyScale();

    // Save to server if user is logged in
    if (this.userId && auth.currentUser) {
      try {
        const userKey = `fontSettings_${this.userId}`;
        if (typeof window !== 'undefined') {
          localStorage.setItem(userKey, JSON.stringify({
            fontScale: this.currentScale,
            useDeviceSettings: this.useDeviceSettings,
            lastUpdated: Date.now(),
          }));
        }

        const updateUserSettings = httpsCallable(functions, 'updateUserSettings');
        await updateUserSettings({
          fontSettings: {
            fontScale: this.currentScale,
            useDeviceSettings: this.useDeviceSettings,
          },
        });
      } catch (error) {
        console.error('Failed to save font settings to server', error);
      }
    }
  }

  async setUseDeviceSettings(use: boolean) {
    this.useDeviceSettings = use;
    if (use) {
      // In web, we can't directly access device font scale, so we reset to 1.0
      this.currentScale = 1.0;
    }
    await this.setFontScale(this.currentScale);
  }

  getFontScale(): number {
    return this.currentScale;
  }

  getScaledFontSize(baseSize: number): number {
    return Math.round(baseSize * this.currentScale);
  }

  getScaledLineHeight(baseLineHeight: number): number {
    return Math.round(baseLineHeight * this.currentScale);
  }

  getScaledSpacing(baseSpacing: number): number {
    // Scale spacing less aggressively than font size
    const spacingScale = 1 + (this.currentScale - 1) * 0.5;
    return Math.round(baseSpacing * spacingScale);
  }

  addListener(listener: (scale: number) => void) {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notifyListeners() {
    this.listeners.forEach(listener => listener(this.currentScale));
  }

  // Apply font scale to document root for CSS variable usage
  private applyScale() {
    if (typeof document !== 'undefined') {
      document.documentElement.style.setProperty('--font-scale', this.currentScale.toString());
      document.documentElement.style.fontSize = `${this.currentScale * 16}px`;
    }
  }

  // Initialize on page load
  initialize() {
    // Apply initial scale
    this.applyScale();

    // Listen for auth state changes
    if (auth) {
      auth.onAuthStateChanged((user) => {
        if (user) {
          this.setUserId(user.uid);
        } else {
          this.userId = null;
          this.loadFromLocalStorage();
        }
      });
    }
  }
}

export default FontSizeService;