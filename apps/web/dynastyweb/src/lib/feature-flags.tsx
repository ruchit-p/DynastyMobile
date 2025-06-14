/**
 * Feature Flags for Dynasty Web Application
 * Enables gradual rollout of new features with fallback to stable implementations
 */

import { createContext, useContext, ReactNode } from 'react';

export interface FeatureFlags {
  // Vault SDK Migration
  useVaultSDK: boolean;
  
  // Other feature flags can be added here
  enableBetaFeatures: boolean;
  useNewStoriesService: boolean;
}

// Default feature flag configuration
const DEFAULT_FLAGS: FeatureFlags = {
  useVaultSDK: false, // Start with legacy service
  enableBetaFeatures: false,
  useNewStoriesService: false,
};

// Environment-based overrides
const getEnvironmentFlags = (): Partial<FeatureFlags> => {
  const env = process.env.NODE_ENV;
  const isStaging = process.env.VERCEL_ENV === 'preview' || (process.env.NODE_ENV as string) === 'staging';
  
  if (env === 'development') {
    return {
      useVaultSDK: process.env.NEXT_PUBLIC_USE_VAULT_SDK === 'true',
      enableBetaFeatures: true,
    };
  }
  
  if (isStaging) {
    return {
      useVaultSDK: process.env.NEXT_PUBLIC_USE_VAULT_SDK === 'true',
      enableBetaFeatures: true,
    };
  }
  
  // Production - conservative defaults
  return {
    useVaultSDK: process.env.NEXT_PUBLIC_USE_VAULT_SDK === 'true',
    enableBetaFeatures: false,
  };
};

// Get current feature flags
export const getFeatureFlags = (): FeatureFlags => {
  const envFlags = getEnvironmentFlags();
  
  return {
    ...DEFAULT_FLAGS,
    ...envFlags,
  };
};

// Specific flag getters for convenience
export const useVaultSDK = (): boolean => {
  return getFeatureFlags().useVaultSDK;
};

export const useBetaFeatures = (): boolean => {
  return getFeatureFlags().enableBetaFeatures;
};

export const useNewStoriesService = (): boolean => {
  return getFeatureFlags().useNewStoriesService;
};

// Feature flag context for React components
const FeatureFlagsContext = createContext<FeatureFlags>(DEFAULT_FLAGS);

export const useFeatureFlags = () => {
  return useContext(FeatureFlagsContext);
};

interface FeatureFlagsProviderProps {
  children: ReactNode;
  flags?: Partial<FeatureFlags>;
}

export const FeatureFlagsProvider = ({ children, flags = {} }: FeatureFlagsProviderProps) => {
  const currentFlags = getFeatureFlags();
  const mergedFlags = { ...currentFlags, ...flags };
  
  return (
    <FeatureFlagsContext.Provider value={mergedFlags}>
      {children}
    </FeatureFlagsContext.Provider>
  );
};

// Feature flag utilities
export const withFeatureFlag = <T,>(
  flagName: keyof FeatureFlags,
  enabledComponent: T,
  fallbackComponent: T
): T => {
  const flags = getFeatureFlags();
  return flags[flagName] ? enabledComponent : fallbackComponent;
};

// Debugging helper
export const logFeatureFlags = () => {
  if (process.env.NODE_ENV === 'development') {
    console.log('🚩 Feature Flags:', getFeatureFlags());
  }
};