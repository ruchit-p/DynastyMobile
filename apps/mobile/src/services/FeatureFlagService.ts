/**
 * Feature Flag Service
 * 
 * Manages feature flags using Firebase Remote Config with local caching,
 * error handling, and offline support.
 * 
 * Features:
 * - Firebase Remote Config integration
 * - Local caching with AsyncStorage
 * - Offline fallback to defaults
 * - Type-safe flag retrieval
 * - A/B testing support
 * - Background sync
 * - Error handling and logging
 */

import remoteConfig from '@react-native-firebase/remote-config';
import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo from '@react-native-community/netinfo';
import { 
  FEATURE_FLAGS,
  FEATURE_FLAG_DEFAULTS,
  FeatureFlagKey,
  FeatureFlagType,
  FeatureFlagConfig,
  REMOTE_CONFIG_SETTINGS,
  REMOTE_CONFIG_KEYS,
  DEV_ONLY_FLAGS,
  RESTART_REQUIRED_FLAGS,
  FeatureFlagCategory,
} from '../../constants/FeatureFlags';
import { logger } from './LoggingService';
import { errorHandler, ErrorSeverity } from '../lib/ErrorHandlingService';
import { getFirebaseAuth } from '../lib/firebase';

// MARK: - Types and Interfaces

/**
 * Feature flag values with metadata
 */
export interface FeatureFlagValue {
  value: any;
  source: 'remote' | 'cache' | 'default';
  lastUpdated: number;
  version?: string;
}

/**
 * A/B test assignment
 */
export interface ABTestAssignment {
  testName: string;
  variant: string;
  assignedAt: number;
  userId: string;
}

/**
 * Feature flag change event
 */
export interface FeatureFlagChangeEvent {
  flagKey: string;
  oldValue: any;
  newValue: any;
  source: 'remote' | 'cache' | 'default';
  requiresRestart: boolean;
}

/**
 * Feature flag listener
 */
export type FeatureFlagChangeListener = (event: FeatureFlagChangeEvent) => void;

// MARK: - Storage Keys

const STORAGE_KEYS = {
  FEATURE_FLAGS: '@dynasty_feature_flags',
  AB_TESTS: '@dynasty_ab_tests',
  LAST_FETCH: '@dynasty_ff_last_fetch',
  USER_OVERRIDES: '@dynasty_ff_user_overrides',
  CONFIG_VERSION: '@dynasty_ff_config_version',
} as const;

// MARK: - Feature Flag Service

export class FeatureFlagService {
  private static instance: FeatureFlagService;
  private initialized = false;
  private cachedFlags: Map<string, FeatureFlagValue> = new Map();
  private changeListeners: Set<FeatureFlagChangeListener> = new Set();
  private abTestAssignments: Map<string, ABTestAssignment> = new Map();
  private userOverrides: Map<string, any> = new Map();
  private isOnline = true;
  private backgroundSyncInterval: number | null = null;

  private constructor() {}

  /**
   * Get singleton instance
   */
  static getInstance(): FeatureFlagService {
    if (!FeatureFlagService.instance) {
      FeatureFlagService.instance = new FeatureFlagService();
    }
    return FeatureFlagService.instance;
  }

  // MARK: - Initialization

  /**
   * Initialize the feature flag service
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      logger.debug('[FeatureFlagService] Already initialized');
      return;
    }

    try {
      logger.info('[FeatureFlagService] Initializing...');

      // Set up network monitoring
      this.setupNetworkMonitoring();

      // Load cached data first
      await this.loadCachedData();

      // Configure Remote Config
      await this.configureRemoteConfig();

      // Initial fetch
      await this.fetchAndActivate();

      // Set up background sync
      this.setupBackgroundSync();

      this.initialized = true;
      logger.info('[FeatureFlagService] Initialization completed');

    } catch (error) {
      logger.error('[FeatureFlagService] Initialization failed:', error);
      errorHandler.handleError(error, {
        severity: ErrorSeverity.ERROR,
        title: 'Feature Flag Service Initialization Failed',
        metadata: { context: 'FeatureFlagService.initialize' }
      });
      
      // Continue with defaults even if initialization fails
      this.initialized = true;
    }
  }

  /**
   * Configure Firebase Remote Config
   */
  private async configureRemoteConfig(): Promise<void> {
    try {
      await remoteConfig().setConfigSettings({
        minimumFetchIntervalMillis: REMOTE_CONFIG_SETTINGS.minimumFetchIntervalMillis,
        fetchTimeMillis: REMOTE_CONFIG_SETTINGS.fetchTimeoutMillis,
      });

      // Set default values
      await remoteConfig().setDefaults({
        [REMOTE_CONFIG_KEYS.FEATURE_FLAGS]: JSON.stringify(FEATURE_FLAG_DEFAULTS),
        [REMOTE_CONFIG_KEYS.VERSION_CONFIG]: JSON.stringify({ version: '1.0.0' }),
        [REMOTE_CONFIG_KEYS.MAINTENANCE_MODE]: false,
        [REMOTE_CONFIG_KEYS.FORCE_UPDATE]: JSON.stringify({ required: false, minVersion: '1.0.0' }),
      });

      logger.debug('[FeatureFlagService] Remote Config configured');
    } catch (error) {
      logger.error('[FeatureFlagService] Failed to configure Remote Config:', error);
      throw error;
    }
  }

  /**
   * Set up network monitoring
   */
  private setupNetworkMonitoring(): void {
    NetInfo.addEventListener(state => {
      const wasOnline = this.isOnline;
      this.isOnline = state.isConnected ?? false;
      
      if (!wasOnline && this.isOnline) {
        // Back online, trigger fetch
        logger.debug('[FeatureFlagService] Back online, fetching flags');
        this.fetchAndActivate().catch(error => {
          logger.warn('[FeatureFlagService] Failed to fetch flags after reconnection:', error);
        });
      }
    });
  }

  /**
   * Set up background sync
   */
  private setupBackgroundSync(): void {
    // Sync every 15 minutes when online
    this.backgroundSyncInterval = setInterval(() => {
      if (this.isOnline) {
        this.fetchAndActivate().catch(error => {
          logger.warn('[FeatureFlagService] Background sync failed:', error);
        });
      }
    }, 15 * 60 * 1000) as any; // 15 minutes
  }

  // MARK: - Remote Config Management

  /**
   * Fetch and activate remote config
   */
  async fetchAndActivate(): Promise<boolean> {
    if (!this.isOnline) {
      logger.debug('[FeatureFlagService] Offline, skipping fetch');
      return false;
    }

    try {
      logger.debug('[FeatureFlagService] Fetching remote config...');
      
      const fetchedRemotely = await remoteConfig().fetchAndActivate();
      
      if (fetchedRemotely) {
        logger.info('[FeatureFlagService] New config fetched and activated');
        await this.processRemoteConfig();
        await this.saveCachedData();
        return true;
      } else {
        logger.debug('[FeatureFlagService] Using cached config');
        return false;
      }
    } catch (error) {
      logger.error('[FeatureFlagService] Failed to fetch remote config:', error);
      errorHandler.handleError(error, {
        severity: ErrorSeverity.WARNING,
        title: 'Failed to Fetch Feature Flags',
        metadata: { context: 'FeatureFlagService.fetchAndActivate' }
      });
      return false;
    }
  }

  /**
   * Process remote config and update cached flags
   */
  private async processRemoteConfig(): Promise<void> {
    try {
      const remoteFlags = remoteConfig().getValue(REMOTE_CONFIG_KEYS.FEATURE_FLAGS);
      const remoteFlagsJson = remoteFlags.asString();
      
      if (!remoteFlagsJson) {
        logger.warn('[FeatureFlagService] No remote flags found');
        return;
      }

      const parsedFlags = JSON.parse(remoteFlagsJson);
      const currentTime = Date.now();
      const oldFlags = new Map(this.cachedFlags);

      // Update cached flags with remote values
      for (const [key, value] of Object.entries(parsedFlags)) {
        const oldValue = this.cachedFlags.get(key);
        const newValue: FeatureFlagValue = {
          value,
          source: 'remote',
          lastUpdated: currentTime,
          version: remoteConfig().getValue(REMOTE_CONFIG_KEYS.VERSION_CONFIG).asString(),
        };

        this.cachedFlags.set(key, newValue);

        // Notify listeners of changes
        if (oldValue && oldValue.value !== value) {
          const flagConfig = Object.values(FEATURE_FLAGS).find(f => f.key === key);
          this.notifyChange({
            flagKey: key,
            oldValue: oldValue.value,
            newValue: value,
            source: 'remote',
            requiresRestart: Boolean((flagConfig as any)?.requiresRestart),
          });
        }
      }

      logger.debug('[FeatureFlagService] Processed remote config successfully');
    } catch (error) {
      logger.error('[FeatureFlagService] Failed to process remote config:', error);
      throw error;
    }
  }

  // MARK: - Flag Retrieval

  /**
   * Get a feature flag value with type safety
   */
  getFlag<T = any>(key: FeatureFlagKey): T {
    const flagConfig = FEATURE_FLAGS[key];
    if (!flagConfig) {
      logger.warn(`[FeatureFlagService] Unknown flag: ${key}`);
      return undefined as T;
    }

    // Check user overrides first (for testing/debugging)
    if (this.userOverrides.has(flagConfig.key)) {
      const overrideValue = this.userOverrides.get(flagConfig.key);
      logger.debug(`[FeatureFlagService] Using override for ${key}: ${overrideValue}`);
      return this.castValue(overrideValue, flagConfig.type) as T;
    }

    // Check cached flags
    const cachedFlag = this.cachedFlags.get(flagConfig.key);
    if (cachedFlag) {
      return this.castValue(cachedFlag.value, flagConfig.type) as T;
    }

    // Fallback to default
    logger.debug(`[FeatureFlagService] Using default for ${key}: ${flagConfig.defaultValue}`);
    return this.castValue(flagConfig.defaultValue, flagConfig.type) as T;
  }

  /**
   * Get multiple flags at once
   */
  getFlags<T extends Record<FeatureFlagKey, any>>(keys: (keyof T)[]): Partial<T> {
    const result: Partial<T> = {};
    for (const key of keys) {
      result[key] = this.getFlag(key as FeatureFlagKey);
    }
    return result;
  }

  /**
   * Get all flags for a category
   */
  getFlagsByCategory(category: FeatureFlagCategory): Record<string, any> {
    const categoryFlags = Object.values(FEATURE_FLAGS).filter(f => f.category === category);
    const result: Record<string, any> = {};
    
    for (const flag of categoryFlags) {
      result[flag.key] = this.getFlag(flag.key as FeatureFlagKey);
    }
    
    return result;
  }

  /**
   * Check if a flag is enabled (boolean flags only)
   */
  isEnabled(key: FeatureFlagKey): boolean {
    const value = this.getFlag(key);
    return Boolean(value);
  }

  /**
   * Get flag metadata
   */
  getFlagMetadata(key: FeatureFlagKey): FeatureFlagValue | null {
    const flagConfig = FEATURE_FLAGS[key];
    if (!flagConfig) {
      return null;
    }

    const cachedFlag = this.cachedFlags.get(flagConfig.key);
    return cachedFlag || {
      value: flagConfig.defaultValue,
      source: 'default',
      lastUpdated: 0,
    };
  }

  // MARK: - Value Casting

  /**
   * Cast value to appropriate type
   */
  private castValue(value: any, type: FeatureFlagType): any {
    try {
      switch (type) {
        case FeatureFlagType.BOOLEAN:
          if (typeof value === 'string') {
            return value.toLowerCase() === 'true';
          }
          return Boolean(value);
          
        case FeatureFlagType.NUMBER:
          return Number(value);
          
        case FeatureFlagType.STRING:
          return String(value);
          
        case FeatureFlagType.JSON:
          if (typeof value === 'string') {
            return JSON.parse(value);
          }
          return value;
          
        default:
          return value;
      }
    } catch (error) {
      logger.warn(`[FeatureFlagService] Failed to cast value ${value} to ${type}:`, error);
      return value;
    }
  }

  // MARK: - Caching

  /**
   * Load cached data from AsyncStorage
   */
  private async loadCachedData(): Promise<void> {
    try {
      const [flagsData, abTestsData, userOverridesData] = await Promise.all([
        AsyncStorage.getItem(STORAGE_KEYS.FEATURE_FLAGS),
        AsyncStorage.getItem(STORAGE_KEYS.AB_TESTS),
        AsyncStorage.getItem(STORAGE_KEYS.USER_OVERRIDES),
      ]);

      if (flagsData) {
        const parsed = JSON.parse(flagsData);
        this.cachedFlags = new Map(Object.entries(parsed));
      }

      if (abTestsData) {
        const parsed = JSON.parse(abTestsData);
        this.abTestAssignments = new Map(Object.entries(parsed));
      }

      if (userOverridesData) {
        const parsed = JSON.parse(userOverridesData);
        this.userOverrides = new Map(Object.entries(parsed));
      }

      logger.debug('[FeatureFlagService] Cached data loaded');
    } catch (error) {
      logger.warn('[FeatureFlagService] Failed to load cached data:', error);
    }
  }

  /**
   * Save data to AsyncStorage
   */
  private async saveCachedData(): Promise<void> {
    try {
      await Promise.all([
        AsyncStorage.setItem(
          STORAGE_KEYS.FEATURE_FLAGS,
          JSON.stringify(Object.fromEntries(this.cachedFlags))
        ),
        AsyncStorage.setItem(
          STORAGE_KEYS.AB_TESTS,
          JSON.stringify(Object.fromEntries(this.abTestAssignments))
        ),
        AsyncStorage.setItem(
          STORAGE_KEYS.USER_OVERRIDES,
          JSON.stringify(Object.fromEntries(this.userOverrides))
        ),
        AsyncStorage.setItem(STORAGE_KEYS.LAST_FETCH, Date.now().toString()),
      ]);

      logger.debug('[FeatureFlagService] Data cached successfully');
    } catch (error) {
      logger.warn('[FeatureFlagService] Failed to cache data:', error);
    }
  }

  // MARK: - User Overrides (for testing/debugging)

  /**
   * Set a user override for a flag (development only)
   */
  setUserOverride(key: FeatureFlagKey, value: any): void {
    if (!__DEV__) {
      logger.warn('[FeatureFlagService] User overrides only available in development');
      return;
    }

    const flagConfig = FEATURE_FLAGS[key];
    if (!flagConfig) {
      logger.warn(`[FeatureFlagService] Unknown flag: ${key}`);
      return;
    }

    this.userOverrides.set(flagConfig.key, value);
    this.saveCachedData().catch(error => {
      logger.warn('[FeatureFlagService] Failed to save user override:', error);
    });

    logger.debug(`[FeatureFlagService] User override set: ${key} = ${value}`);
  }

  /**
   * Remove user override
   */
  removeUserOverride(key: FeatureFlagKey): void {
    const flagConfig = FEATURE_FLAGS[key];
    if (flagConfig) {
      this.userOverrides.delete(flagConfig.key);
      this.saveCachedData().catch(error => {
        logger.warn('[FeatureFlagService] Failed to save after removing override:', error);
      });
    }
  }

  /**
   * Clear all user overrides
   */
  clearUserOverrides(): void {
    this.userOverrides.clear();
    this.saveCachedData().catch(error => {
      logger.warn('[FeatureFlagService] Failed to save after clearing overrides:', error);
    });
  }

  // MARK: - Change Listeners

  /**
   * Add change listener
   */
  addChangeListener(listener: FeatureFlagChangeListener): () => void {
    this.changeListeners.add(listener);
    
    // Return unsubscribe function
    return () => {
      this.changeListeners.delete(listener);
    };
  }

  /**
   * Notify listeners of flag changes
   */
  private notifyChange(event: FeatureFlagChangeEvent): void {
    this.changeListeners.forEach(listener => {
      try {
        listener(event);
      } catch (error) {
        logger.error('[FeatureFlagService] Error in change listener:', error);
      }
    });
  }

  // MARK: - Utility Methods

  /**
   * Force refresh all flags
   */
  async refresh(): Promise<boolean> {
    logger.info('[FeatureFlagService] Force refreshing flags...');
    return await this.fetchAndActivate();
  }

  /**
   * Get service status
   */
  getStatus(): {
    initialized: boolean;
    online: boolean;
    flagCount: number;
    lastFetch: string | null;
    cacheSize: number;
  } {
    return {
      initialized: this.initialized,
      online: this.isOnline,
      flagCount: this.cachedFlags.size,
      lastFetch: this.cachedFlags.size > 0 ? 'Available' : 'Never',
      cacheSize: this.cachedFlags.size,
    };
  }

  /**
   * Get development information
   */
  getDebugInfo(): {
    flags: Record<string, FeatureFlagValue>;
    overrides: Record<string, any>;
    abTests: Record<string, ABTestAssignment>;
    status: ReturnType<FeatureFlagService['getStatus']>;
  } {
    return {
      flags: Object.fromEntries(this.cachedFlags),
      overrides: Object.fromEntries(this.userOverrides),
      abTests: Object.fromEntries(this.abTestAssignments),
      status: this.getStatus(),
    };
  }

  // MARK: - Cleanup

  /**
   * Cleanup service (call on app termination)
   */
  cleanup(): void {
    if (this.backgroundSyncInterval) {
      clearInterval(this.backgroundSyncInterval);
      this.backgroundSyncInterval = null;
    }

    this.changeListeners.clear();
    logger.debug('[FeatureFlagService] Cleanup completed');
  }
}

// MARK: - Singleton Export

export const featureFlagService = FeatureFlagService.getInstance();