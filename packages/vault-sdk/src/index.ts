// =====================================
// Dynasty Vault SDK - Main Entry Point
// =====================================

// Export all types and schemas
export * from './types';

// Export API client
export * from './api';

// Export utility functions
export * from './utils';

// Version information
export const VAULT_SDK_VERSION = '0.1.0';

// Default export for the main API client factory
export { createVaultApiClient as default } from './api/VaultApiClient';