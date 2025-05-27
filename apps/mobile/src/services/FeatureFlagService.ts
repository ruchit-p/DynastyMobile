import AsyncStorage from '@react-native-async-storage/async-storage';
import { getFirebaseAuth } from '../lib/firebase';
import { logger } from './LoggingService';

interface FeatureFlags {
  libsignal_encryption: boolean;
  group_video_calls: boolean;
  voice_messages: boolean;
  message_reactions: boolean;
  offline_sync: boolean;
  encrypted_search: boolean;
  multi_device_sync: boolean;
}

const DEFAULT_FLAGS: FeatureFlags = {
  libsignal_encryption: false,
  group_video_calls: false,
  voice_messages: true,
  message_reactions: true,
  offline_sync: true,
  encrypted_search: true,
  multi_device_sync: false,
};

/**
 * Service for managing feature flags in Dynasty app
 * Allows gradual rollout of new features
 */
export class FeatureFlagService {
  private static instance: FeatureFlagService;
  private flags: FeatureFlags = DEFAULT_FLAGS;
  private storageKey = 'dynasty_feature_flags';
  private initialized = false;

  private constructor() {
    this.initialize();
  }

  static getInstance(): FeatureFlagService {
    if (!FeatureFlagService.instance) {
      FeatureFlagService.instance = new FeatureFlagService();
    }
    return FeatureFlagService.instance;
  }

  /**
   * Check if a feature is enabled
   */
  static async isEnabled(feature: keyof FeatureFlags): Promise<boolean> {
    const instance = FeatureFlagService.getInstance();
    await instance.ensureInitialized();
    return instance.flags[feature] || false;
  }

  /**
   * Enable a feature for the current user
   */
  static async enable(feature: keyof FeatureFlags): Promise<void> {
    const instance = FeatureFlagService.getInstance();
    await instance.ensureInitialized();
    
    instance.flags[feature] = true;
    await instance.saveFlags();
    
    logger.info(`Feature enabled: ${feature}`);
  }

  /**
   * Disable a feature for the current user
   */
  static async disable(feature: keyof FeatureFlags): Promise<void> {
    const instance = FeatureFlagService.getInstance();
    await instance.ensureInitialized();
    
    instance.flags[feature] = false;
    await instance.saveFlags();
    
    logger.info(`Feature disabled: ${feature}`);
  }

  /**
   * Get all feature flags
   */
  static async getAllFlags(): Promise<FeatureFlags> {
    const instance = FeatureFlagService.getInstance();
    await instance.ensureInitialized();
    return { ...instance.flags };
  }

  /**
   * Set multiple flags at once
   */
  static async setFlags(flags: Partial<FeatureFlags>): Promise<void> {
    const instance = FeatureFlagService.getInstance();
    await instance.ensureInitialized();
    
    instance.flags = { ...instance.flags, ...flags };
    await instance.saveFlags();
    
    logger.info('Feature flags updated:', flags);
  }

  /**
   * Check if user is in test group for a feature
   */
  static async isInTestGroup(feature: keyof FeatureFlags, percentage: number = 10): Promise<boolean> {
    const auth = getFirebaseAuth();
    const userId = auth.currentUser?.uid;
    
    if (!userId) {
      return false;
    }
    
    // Simple hash-based rollout
    const hash = userId.split('').reduce((acc, char) => {
      return acc + char.charCodeAt(0);
    }, 0);
    
    return (hash % 100) < percentage;
  }

  /**
   * Reset all flags to defaults
   */
  static async reset(): Promise<void> {
    const instance = FeatureFlagService.getInstance();
    instance.flags = { ...DEFAULT_FLAGS };
    await instance.saveFlags();
    
    logger.info('Feature flags reset to defaults');
  }

  // Private methods

  private async initialize(): Promise<void> {
    try {
      const stored = await AsyncStorage.getItem(this.storageKey);
      if (stored) {
        const parsedFlags = JSON.parse(stored);
        this.flags = { ...DEFAULT_FLAGS, ...parsedFlags };
      }
      
      this.initialized = true;
      logger.debug('Feature flags loaded:', this.flags);
    } catch (error) {
      logger.error('Failed to load feature flags:', error);
      this.flags = { ...DEFAULT_FLAGS };
      this.initialized = true;
    }
  }

  private async ensureInitialized(): Promise<void> {
    if (!this.initialized) {
      await this.initialize();
    }
  }

  private async saveFlags(): Promise<void> {
    try {
      await AsyncStorage.setItem(this.storageKey, JSON.stringify(this.flags));
    } catch (error) {
      logger.error('Failed to save feature flags:', error);
    }
  }

  /**
   * Get user-specific overrides from server (future implementation)
   */
  private async fetchServerFlags(): Promise<Partial<FeatureFlags> | null> {
    // TODO: Implement server-side feature flag management
    // This would fetch user-specific or cohort-specific flags from Firebase
    return null;
  }

  /**
   * Check if a feature should be enabled based on various criteria
   */
  private shouldEnableFeature(
    feature: keyof FeatureFlags,
    userId: string,
    userMetadata?: any
  ): boolean {
    // Add complex logic here for feature rollout
    // - User cohorts
    // - Geographic regions
    // - Account type (premium, free)
    // - Device capabilities
    // - A/B testing groups
    
    return this.flags[feature];
  }
}

// Export convenience functions
export const isFeatureEnabled = FeatureFlagService.isEnabled;
export const enableFeature = FeatureFlagService.enable;
export const disableFeature = FeatureFlagService.disable;
export const getAllFeatureFlags = FeatureFlagService.getAllFlags;