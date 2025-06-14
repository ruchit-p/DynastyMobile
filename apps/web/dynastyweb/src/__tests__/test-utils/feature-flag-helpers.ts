/**
 * Feature Flag Test Helpers
 * Utilities for testing feature flag behavior in integration tests
 */

/**
 * Temporarily sets a feature flag for the duration of a test function
 * @param flagName - The feature flag name (without NEXT_PUBLIC_ prefix)
 * @param value - The value to set for the flag
 * @param fn - The test function to execute with the flag set
 */
export const withFeatureFlag = async (
  flagName: string, 
  value: boolean, 
  fn: () => Promise<void>
): Promise<void> => {
  const envVarName = `NEXT_PUBLIC_${flagName.toUpperCase()}`;
  const originalEnv = process.env[envVarName];
  
  // Set the environment variable
  process.env[envVarName] = value.toString();
  
  try {
    await fn();
  } finally {
    // Restore original value or delete if it didn't exist
    if (originalEnv !== undefined) {
      process.env[envVarName] = originalEnv;
    } else {
      delete process.env[envVarName];
    }
  }
};

/**
 * Sets multiple feature flags for the duration of a test function
 * @param flags - Object mapping flag names to their values
 * @param fn - The test function to execute with the flags set
 */
export const withFeatureFlags = async (
  flags: Record<string, boolean>,
  fn: () => Promise<void>
): Promise<void> => {
  const originalEnvVars: Record<string, string | undefined> = {};
  
  // Set all flags and store original values
  Object.entries(flags).forEach(([flagName, value]) => {
    const envVarName = `NEXT_PUBLIC_${flagName.toUpperCase()}`;
    originalEnvVars[envVarName] = process.env[envVarName];
    process.env[envVarName] = value.toString();
  });
  
  try {
    await fn();
  } finally {
    // Restore all original values
    Object.entries(originalEnvVars).forEach(([envVarName, originalValue]) => {
      if (originalValue !== undefined) {
        process.env[envVarName] = originalValue;
      } else {
        delete process.env[envVarName];
      }
    });
  }
};

/**
 * Creates a mock feature flags context provider for testing
 * @param flags - The flags to provide in the context
 * @returns Mock context provider component
 */
export const createMockFeatureFlagsProvider = (flags: Record<string, boolean>) => {
  return ({ children }: { children: React.ReactNode }) => {
    const mockContext = {
      useVaultSDK: flags.USE_VAULT_SDK || false,
      enableBetaFeatures: flags.ENABLE_BETA_FEATURES || false,
      useNewStoriesService: flags.USE_NEW_STORIES_SERVICE || false,
    };
    
    // This would normally use the actual FeatureFlagsContext
    // For testing, we can mock the context provider
    return children;
  };
};

/**
 * Test helper to verify feature flag environment setup
 * @param expectedFlags - Object mapping flag names to expected values
 */
export const verifyFeatureFlagEnvironment = (expectedFlags: Record<string, boolean>): void => {
  Object.entries(expectedFlags).forEach(([flagName, expectedValue]) => {
    const envVarName = `NEXT_PUBLIC_${flagName.toUpperCase()}`;
    const actualValue = process.env[envVarName] === 'true';
    
    if (actualValue !== expectedValue) {
      throw new Error(
        `Feature flag mismatch: ${flagName} expected ${expectedValue}, got ${actualValue}`
      );
    }
  });
};

/**
 * Resets all feature flags to their default values
 * Useful for test cleanup
 */
export const resetFeatureFlags = (): void => {
  const flagPrefixes = ['NEXT_PUBLIC_USE_VAULT_SDK', 'NEXT_PUBLIC_ENABLE_BETA_FEATURES', 'NEXT_PUBLIC_USE_NEW_STORIES_SERVICE'];
  
  flagPrefixes.forEach(prefix => {
    delete process.env[prefix];
  });
};

/**
 * Gets the current state of all feature flags for debugging
 * @returns Object with current flag states
 */
export const getCurrentFeatureFlags = (): Record<string, boolean> => {
  return {
    USE_VAULT_SDK: process.env.NEXT_PUBLIC_USE_VAULT_SDK === 'true',
    ENABLE_BETA_FEATURES: process.env.NEXT_PUBLIC_ENABLE_BETA_FEATURES === 'true',
    USE_NEW_STORIES_SERVICE: process.env.NEXT_PUBLIC_USE_NEW_STORIES_SERVICE === 'true',
  };
};