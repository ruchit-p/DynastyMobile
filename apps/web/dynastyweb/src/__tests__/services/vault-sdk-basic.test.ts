/**
 * Basic Vault SDK Service Test
 * Tests the core functionality without complex UI dependencies
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';

// Mock the vault SDK before importing the service
jest.mock('@dynasty/vault-sdk', () => ({
  VaultApiClient: jest.fn().mockImplementation(() => ({
    getStorageInfo: jest.fn().mockResolvedValue({
      totalFiles: 0,
      totalSize: 0,
      encryptedFiles: 0,
      encryptedSize: 0,
      usedQuota: 0,
      totalQuota: 5 * 1024 * 1024 * 1024, // 5GB
    }),
    getItems: jest.fn().mockResolvedValue({
      items: [],
      totalCount: 0,
      hasMore: false,
    }),
    getEncryptionStatus: jest.fn().mockResolvedValue({
      isEnabled: false,
      keyRotationDate: null,
      totalEncryptedItems: 0,
      encryptionProgress: 0,
    }),
  })),
  VaultApiClientConfig: {},
}));

// Mock the firebase app
jest.mock('@/lib/firebase', () => ({
  app: {
    name: 'test-app',
    options: {},
  },
}));

// Mock the performance monitor
jest.mock('@/services/VaultSDKPerformanceMonitor', () => ({
  vaultSDKPerformanceMonitor: {
    startOperation: jest.fn(),
    endOperation: jest.fn(),
    recordCacheEvent: jest.fn(),
  },
}));

// Mock other services
jest.mock('@/services/ErrorHandlingService', () => ({
  errorHandler: {
    handleError: jest.fn(),
  },
  ErrorSeverity: {
    LOW: 'LOW',
    MEDIUM: 'MEDIUM',
    HIGH: 'HIGH',
  },
}));

jest.mock('@/services/CacheService', () => ({
  cacheService: {
    set: jest.fn(),
    get: jest.fn(),
  },
  cacheKeys: {
    vaultItems: 'vault-items',
  },
}));

jest.mock('@/components/ui/use-toast', () => ({
  toast: jest.fn(),
}));

jest.mock('@/utils/toastRateLimiter', () => ({
  showRateLimitedToast: jest.fn(),
}));

describe('Vault SDK Service - Basic Tests', () => {
  let vaultSDKService: any;

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Dynamic import to ensure mocks are set up first
    return import('@/services/VaultSDKService').then((module) => {
      vaultSDKService = module.vaultSDKService;
    });
  });

  it('should create a vault SDK service instance', () => {
    expect(vaultSDKService).toBeDefined();
  });

  it('should have all required methods', () => {
    // Check for essential methods
    expect(typeof vaultSDKService.getStorageInfo).toBe('function');
    expect(typeof vaultSDKService.getItems).toBe('function');
    expect(typeof vaultSDKService.isEncryptionEnabled).toBe('function');
  });

  it('should handle storage info retrieval', async () => {
    const storageInfo = await vaultSDKService.getStorageInfo();
    
    expect(storageInfo).toBeDefined();
    expect(storageInfo).toHaveProperty('totalQuota');
    expect(storageInfo).toHaveProperty('usedQuota');
  });

  it('should handle encryption status check', async () => {
    const isEnabled = await vaultSDKService.isEncryptionEnabled();
    
    expect(typeof isEnabled).toBe('boolean');
  });
});