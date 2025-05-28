/**
 * Feature Flags Hook
 * 
 * React hook for accessing feature flags in components with type safety,
 * real-time updates, and error handling.
 * 
 * Features:
 * - Type-safe flag access
 * - Real-time flag updates
 * - Loading states
 * - Error handling
 * - Debug utilities
 * - Batch flag retrieval
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { 
  featureFlagService, 
  FeatureFlagChangeEvent,
  FeatureFlagValue 
} from '../src/services/FeatureFlagService';
import { 
  FeatureFlagKey, 
  FeatureFlagCategory,
  FEATURE_FLAGS 
} from '../constants/FeatureFlags';
import { logger } from '../src/services/LoggingService';
import { useErrorHandler } from './useErrorHandler';
import { ErrorSeverity } from '../src/lib/ErrorHandlingService';

// MARK: - Types

/**
 * Hook options for useFeatureFlags
 */
export interface UseFeatureFlagsOptions {
  /** Watch for real-time updates */
  watchUpdates?: boolean;
  /** Automatically refresh flags on mount */
  autoRefresh?: boolean;
  /** Enable debug logging */
  debug?: boolean;
}

/**
 * Hook result for single flag
 */
export interface UseFeatureFlagResult<T> {
  value: T;
  isLoading: boolean;
  error: Error | null;
  source: 'remote' | 'cache' | 'default';
  lastUpdated: number;
  refresh: () => Promise<void>;
  metadata: FeatureFlagValue | null;
}

/**
 * Hook result for multiple flags
 */
export interface UseFeatureFlagsResult {
  flags: Record<string, any>;
  isLoading: boolean;
  error: Error | null;
  refresh: () => Promise<void>;
  getFlag: <T = any>(key: FeatureFlagKey) => T;
  isEnabled: (key: FeatureFlagKey) => boolean;
  status: ReturnType<typeof featureFlagService.getStatus>;
}

/**
 * Hook result for category flags
 */
export interface UseCategoryFlagsResult {
  flags: Record<string, any>;
  isLoading: boolean;
  error: Error | null;
  refresh: () => Promise<void>;
  category: FeatureFlagCategory;
}

// MARK: - Single Feature Flag Hook

/**
 * Hook for accessing a single feature flag
 * 
 * @param key - Feature flag key
 * @param options - Hook options
 * @returns Feature flag result with metadata
 * 
 * @example
 * ```typescript
 * const { value: isE2EEnabled, isLoading } = useFeatureFlag('ENABLE_E2E_ENCRYPTION');
 * 
 * if (isLoading) return <LoadingSpinner />;
 * 
 * return isE2EEnabled ? <EncryptedChat /> : <RegularChat />;
 * ```
 */
export function useFeatureFlag<T = any>(
  key: FeatureFlagKey,
  options: UseFeatureFlagsOptions = {}
): UseFeatureFlagResult<T> {
  const { watchUpdates = true, autoRefresh = false, debug = false } = options;
  
  const [value, setValue] = useState<T>(() => featureFlagService.getFlag<T>(key));
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [lastUpdated, setLastUpdated] = useState(Date.now());
  
  const { handleError } = useErrorHandler({
    severity: ErrorSeverity.WARNING,
    title: 'Feature Flag Error',
    trackCurrentScreen: false,
  });

  const mountedRef = useRef(true);

  // Get flag metadata
  const metadata = featureFlagService.getFlagMetadata(key);
  const source = metadata?.source || 'default';

  /**
   * Refresh the flag value
   */
  const refresh = useCallback(async () => {
    if (!mountedRef.current) return;
    
    try {
      setIsLoading(true);
      setError(null);
      
      if (debug) {
        logger.debug(`[useFeatureFlag] Refreshing flag: ${key}`);
      }
      
      await featureFlagService.refresh();
      const newValue = featureFlagService.getFlag<T>(key);
      
      if (mountedRef.current) {
        setValue(newValue);
        setLastUpdated(Date.now());
      }
      
      if (debug) {
        logger.debug(`[useFeatureFlag] Flag refreshed: ${key} = ${newValue}`);
      }
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      
      if (mountedRef.current) {
        setError(error);
        handleError(error, { message: `Failed to refresh feature flag: ${key}`, key });
      }
    } finally {
      if (mountedRef.current) {
        setIsLoading(false);
      }
    }
  }, [key, debug, handleError]);

  /**
   * Handle flag changes
   */
  const handleFlagChange = useCallback((event: FeatureFlagChangeEvent) => {
    if (!mountedRef.current || event.flagKey !== FEATURE_FLAGS[key]?.key) {
      return;
    }
    
    if (debug) {
      logger.debug(`[useFeatureFlag] Flag changed: ${key}`, event);
    }
    
    setValue(event.newValue);
    setLastUpdated(Date.now());
  }, [key, debug]);

  // Set up change listener
  useEffect(() => {
    if (!watchUpdates) return;
    
    const unsubscribe = featureFlagService.addChangeListener(handleFlagChange);
    
    return () => {
      unsubscribe();
    };
  }, [watchUpdates, handleFlagChange]);

  // Auto-refresh on mount
  useEffect(() => {
    if (autoRefresh) {
      refresh();
    }
  }, [autoRefresh, refresh]);

  // Cleanup
  useEffect(() => {
    return () => {
      mountedRef.current = false;
    };
  }, []);

  return {
    value,
    isLoading,
    error,
    source,
    lastUpdated,
    refresh,
    metadata,
  };
}

// MARK: - Multiple Feature Flags Hook

/**
 * Hook for accessing multiple feature flags
 * 
 * @param keys - Array of feature flag keys
 * @param options - Hook options
 * @returns Feature flags result with utilities
 * 
 * @example
 * ```typescript
 * const { flags, isLoading, getFlag } = useFeatureFlags([
 *   'ENABLE_E2E_ENCRYPTION',
 *   'ENABLE_VOICE_MESSAGES',
 *   'ENABLE_STORIES'
 * ]);
 * 
 * if (isLoading) return <LoadingSpinner />;
 * 
 * return (
 *   <MessagingFeatures
 *     encryption={getFlag('ENABLE_E2E_ENCRYPTION')}
 *     voiceMessages={getFlag('ENABLE_VOICE_MESSAGES')}
 *     stories={getFlag('ENABLE_STORIES')}
 *   />
 * );
 * ```
 */
export function useFeatureFlags(
  keys?: FeatureFlagKey[],
  options: UseFeatureFlagsOptions = {}
): UseFeatureFlagsResult {
  const { watchUpdates = true, autoRefresh = false, debug = false } = options;
  
  const [flags, setFlags] = useState<Record<string, any>>(() => {
    if (keys) {
      return featureFlagService.getFlags(keys);
    }
    // Return all flags if no keys specified
    const allFlags: Record<string, any> = {};
    Object.keys(FEATURE_FLAGS).forEach(key => {
      allFlags[key] = featureFlagService.getFlag(key as FeatureFlagKey);
    });
    return allFlags;
  });
  
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  
  const { handleError } = useErrorHandler({
    severity: ErrorSeverity.WARNING,
    title: 'Feature Flags Error',
    trackCurrentScreen: false,
  });

  const mountedRef = useRef(true);

  /**
   * Get individual flag value
   */
  const getFlag = useCallback(<T = any>(key: FeatureFlagKey): T => {
    return featureFlagService.getFlag<T>(key);
  }, []);

  /**
   * Check if flag is enabled (boolean flags)
   */
  const isEnabled = useCallback((key: FeatureFlagKey): boolean => {
    return featureFlagService.isEnabled(key);
  }, []);

  /**
   * Refresh all flags
   */
  const refresh = useCallback(async () => {
    if (!mountedRef.current) return;
    
    try {
      setIsLoading(true);
      setError(null);
      
      if (debug) {
        logger.debug('[useFeatureFlags] Refreshing flags:', keys || 'all');
      }
      
      await featureFlagService.refresh();
      
      const newFlags: Record<string, any> = {};
      if (keys) {
        keys.forEach(key => {
          newFlags[key] = featureFlagService.getFlag(key);
        });
      } else {
        Object.keys(FEATURE_FLAGS).forEach(key => {
          newFlags[key] = featureFlagService.getFlag(key as FeatureFlagKey);
        });
      }
      
      if (mountedRef.current) {
        setFlags(newFlags);
      }
      
      if (debug) {
        logger.debug('[useFeatureFlags] Flags refreshed:', newFlags);
      }
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      
      if (mountedRef.current) {
        setError(error);
        handleError(error, { message: 'Failed to refresh feature flags', keys });
      }
    } finally {
      if (mountedRef.current) {
        setIsLoading(false);
      }
    }
  }, [keys, debug, handleError]);

  /**
   * Handle flag changes
   */
  const handleFlagChange = useCallback((event: FeatureFlagChangeEvent) => {
    if (!mountedRef.current) return;
    
    // Check if this flag is one we're watching
    const watchingFlag = !keys || keys.some(key => FEATURE_FLAGS[key]?.key === event.flagKey);
    if (!watchingFlag) return;
    
    if (debug) {
      logger.debug('[useFeatureFlags] Flag changed:', event);
    }
    
    setFlags(prev => ({
      ...prev,
      [event.flagKey]: event.newValue,
    }));
  }, [keys, debug]);

  // Set up change listener
  useEffect(() => {
    if (!watchUpdates) return;
    
    const unsubscribe = featureFlagService.addChangeListener(handleFlagChange);
    
    return () => {
      unsubscribe();
    };
  }, [watchUpdates, handleFlagChange]);

  // Auto-refresh on mount
  useEffect(() => {
    if (autoRefresh) {
      refresh();
    }
  }, [autoRefresh, refresh]);

  // Cleanup
  useEffect(() => {
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // Get service status
  const status = featureFlagService.getStatus();

  return {
    flags,
    isLoading,
    error,
    refresh,
    getFlag,
    isEnabled,
    status,
  };
}

// MARK: - Category Feature Flags Hook

/**
 * Hook for accessing feature flags by category
 * 
 * @param category - Feature flag category
 * @param options - Hook options
 * @returns Category flags result
 * 
 * @example
 * ```typescript
 * const { flags: messagingFlags } = useCategoryFlags('MESSAGING');
 * 
 * return (
 *   <MessagingSettings
 *     e2eEncryption={messagingFlags.enable_e2e_encryption}
 *     voiceMessages={messagingFlags.enable_voice_messages}
 *     fileSharing={messagingFlags.enable_file_sharing}
 *   />
 * );
 * ```
 */
export function useCategoryFlags(
  category: FeatureFlagCategory,
  options: UseFeatureFlagsOptions = {}
): UseCategoryFlagsResult {
  const { watchUpdates = true, autoRefresh = false, debug = false } = options;
  
  const [flags, setFlags] = useState<Record<string, any>>(() => {
    return featureFlagService.getFlagsByCategory(category);
  });
  
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  
  const { handleError } = useErrorHandler({
    severity: ErrorSeverity.WARNING,
    title: 'Category Feature Flags Error',
    trackCurrentScreen: false,
  });

  const mountedRef = useRef(true);

  /**
   * Refresh category flags
   */
  const refresh = useCallback(async () => {
    if (!mountedRef.current) return;
    
    try {
      setIsLoading(true);
      setError(null);
      
      if (debug) {
        logger.debug(`[useCategoryFlags] Refreshing ${category} flags`);
      }
      
      await featureFlagService.refresh();
      const newFlags = featureFlagService.getFlagsByCategory(category);
      
      if (mountedRef.current) {
        setFlags(newFlags);
      }
      
      if (debug) {
        logger.debug(`[useCategoryFlags] ${category} flags refreshed:`, newFlags);
      }
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      
      if (mountedRef.current) {
        setError(error);
        handleError(error, { message: `Failed to refresh ${category} feature flags`, category });
      }
    } finally {
      if (mountedRef.current) {
        setIsLoading(false);
      }
    }
  }, [category, debug, handleError]);

  /**
   * Handle flag changes for this category
   */
  const handleFlagChange = useCallback((event: FeatureFlagChangeEvent) => {
    if (!mountedRef.current) return;
    
    // Check if this flag belongs to our category
    const flagConfig = Object.values(FEATURE_FLAGS).find(f => f.key === event.flagKey);
    if (!flagConfig || flagConfig.category !== category) return;
    
    if (debug) {
      logger.debug(`[useCategoryFlags] ${category} flag changed:`, event);
    }
    
    setFlags(prev => ({
      ...prev,
      [event.flagKey]: event.newValue,
    }));
  }, [category, debug]);

  // Set up change listener
  useEffect(() => {
    if (!watchUpdates) return;
    
    const unsubscribe = featureFlagService.addChangeListener(handleFlagChange);
    
    return () => {
      unsubscribe();
    };
  }, [watchUpdates, handleFlagChange]);

  // Auto-refresh on mount
  useEffect(() => {
    if (autoRefresh) {
      refresh();
    }
  }, [autoRefresh, refresh]);

  // Cleanup
  useEffect(() => {
    return () => {
      mountedRef.current = false;
    };
  }, []);

  return {
    flags,
    isLoading,
    error,
    refresh,
    category,
  };
}

// MARK: - Convenience Hooks

/**
 * Hook for checking if a feature is enabled (boolean flags only)
 * 
 * @param key - Feature flag key
 * @param options - Hook options
 * @returns Boolean indicating if feature is enabled
 * 
 * @example
 * ```typescript
 * const isE2EEnabled = useFeatureEnabled('ENABLE_E2E_ENCRYPTION');
 * 
 * return isE2EEnabled ? <EncryptedChat /> : <RegularChat />;
 * ```
 */
export function useFeatureEnabled(
  key: FeatureFlagKey,
  options: UseFeatureFlagsOptions = {}
): boolean {
  const { value } = useFeatureFlag<boolean>(key, options);
  return Boolean(value);
}

/**
 * Hook for development feature flag overrides
 * Only works in development mode
 * 
 * @example
 * ```typescript
 * const { setOverride, removeOverride, clearOverrides } = useFeatureFlagOverrides();
 * 
 * // For testing/debugging
 * setOverride('ENABLE_AI_FEATURES', true);
 * ```
 */
export function useFeatureFlagOverrides() {
  const setOverride = useCallback((key: FeatureFlagKey, value: any) => {
    if (__DEV__) {
      featureFlagService.setUserOverride(key, value);
    }
  }, []);

  const removeOverride = useCallback((key: FeatureFlagKey) => {
    if (__DEV__) {
      featureFlagService.removeUserOverride(key);
    }
  }, []);

  const clearOverrides = useCallback(() => {
    if (__DEV__) {
      featureFlagService.clearUserOverrides();
    }
  }, []);

  return {
    setOverride,
    removeOverride,
    clearOverrides,
  };
} 