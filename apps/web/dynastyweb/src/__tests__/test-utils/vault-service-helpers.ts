/**
 * Vault Service Test Helpers
 * Utilities for testing both legacy VaultService and new VaultSDKService
 */

import { vaultService } from '@/services/VaultService';
import { vaultSDKService } from '@/services/VaultSDKService';
import { withFeatureFlag } from './feature-flag-helpers';
import type { VaultService } from '@/services/VaultService';

export interface VaultServiceTestConfig {
  serviceName: 'legacy' | 'sdk';
  service: VaultService;
  useFeatureFlag: boolean;
}

/**
 * Creates test configurations for both vault services
 * @returns Array of test configurations for parameterized tests
 */
export const createVaultServiceConfigs = (): VaultServiceTestConfig[] => [
  {
    serviceName: 'legacy',
    service: vaultService,
    useFeatureFlag: false,
  },
  {
    serviceName: 'sdk',
    service: vaultSDKService,
    useFeatureFlag: true,
  },
];

/**
 * Runs a test function against both vault services
 * @param testName - Name of the test
 * @param testFn - Test function that receives service config
 */
export const testBothVaultServices = (
  testName: string,
  testFn: (config: VaultServiceTestConfig) => Promise<void>
) => {
  const configs = createVaultServiceConfigs();
  
  configs.forEach((config) => {
    it(`${testName} (${config.serviceName})`, async () => {
      if (config.useFeatureFlag) {
        await withFeatureFlag('USE_VAULT_SDK', true, async () => {
          await testFn(config);
        });
      } else {
        await withFeatureFlag('USE_VAULT_SDK', false, async () => {
          await testFn(config);
        });
      }
    });
  });
};

/**
 * Runs a describe block testing both vault services
 * @param suiteName - Name of the test suite
 * @param suiteFn - Function that sets up tests for the service
 */
export const describeBothVaultServices = (
  suiteName: string,
  suiteFn: (config: VaultServiceTestConfig) => void
) => {
  const configs = createVaultServiceConfigs();
  
  configs.forEach((config) => {
    describe(`${suiteName} (${config.serviceName})`, () => {
      beforeEach(() => {
        if (config.useFeatureFlag) {
          process.env.NEXT_PUBLIC_USE_VAULT_SDK = 'true';
        } else {
          process.env.NEXT_PUBLIC_USE_VAULT_SDK = 'false';
        }
      });
      
      afterEach(() => {
        delete process.env.NEXT_PUBLIC_USE_VAULT_SDK;
      });
      
      suiteFn(config);
    });
  });
};

/**
 * Gets the appropriate vault service based on feature flag state
 * @param useSDK - Whether to use SDK service
 * @returns The appropriate vault service
 */
export const getVaultService = (useSDK: boolean = false): VaultService => {
  return useSDK ? vaultSDKService : vaultService;
};

/**
 * Creates mock implementations for both vault services
 * @param mockOverrides - Partial mock implementations
 * @returns Object with mocks for both services
 */
export const createVaultServiceMocks = (mockOverrides: Partial<VaultService> = {}) => {
  const defaultMocks = {
    uploadFile: jest.fn(),
    downloadFile: jest.fn(),
    getItemById: jest.fn(),
    deleteItem: jest.fn(),
    updateItem: jest.fn(),
    getVaultItems: jest.fn(),
    createShareLink: jest.fn(),
    getVaultStats: jest.fn(),
    ...mockOverrides,
  };

  return {
    legacyMocks: jest.mocked(vaultService),
    sdkMocks: jest.mocked(vaultSDKService),
    applyMocks: () => {
      Object.entries(defaultMocks).forEach(([method, mockFn]) => {
        if (typeof (vaultService as any)[method] === 'function') {
          jest.spyOn(vaultService, method as keyof VaultService).mockImplementation(mockFn);
        }
        if (typeof (vaultSDKService as any)[method] === 'function') {
          jest.spyOn(vaultSDKService, method as keyof VaultService).mockImplementation(mockFn);
        }
      });
    },
    clearMocks: () => {
      jest.clearAllMocks();
    },
  };
};

/**
 * Creates test data that is compatible with both services
 * @param overrides - Custom properties to override
 * @returns Test vault item
 */
export const createTestVaultItem = (overrides: Partial<any> = {}) => {
  return {
    id: 'test-file-id',
    name: 'test-file.txt',
    type: 'file',
    path: '/test-file.txt',
    ownerId: 'test-user-id',
    userId: 'test-user-id',
    parentId: null,
    size: 1024,
    mimeType: 'text/plain',
    isEncrypted: false,
    isShared: false,
    createdAt: new Date('2024-01-01T00:00:00Z'),
    updatedAt: new Date('2024-01-01T00:00:00Z'),
    isDeleted: false,
    ...overrides,
  };
};

/**
 * Creates test file for upload testing
 * @param overrides - Custom file properties
 * @returns Test file object
 */
export const createTestFile = (overrides: Partial<any> = {}) => {
  const defaults = {
    name: 'test-file.txt',
    type: 'text/plain',
    size: 1024,
  };
  
  const fileProps = { ...defaults, ...overrides };
  return new File(['test content'], fileProps.name, { type: fileProps.type });
};

/**
 * Creates test upload progress callback
 * @returns Object with progress callback and captured progress events
 */
export const createTestProgressCallback = () => {
  const progressEvents: any[] = [];
  const onProgress = jest.fn((progress) => {
    progressEvents.push(progress);
  });
  
  return {
    onProgress,
    progressEvents,
    getLastProgress: () => progressEvents[progressEvents.length - 1],
    getProgressCount: () => progressEvents.length,
  };
};

/**
 * Verifies that both services return compatible data structures
 * @param legacyResult - Result from legacy service
 * @param sdkResult - Result from SDK service
 * @param fieldsToCompare - Specific fields to compare (optional)
 */
export const verifyServiceCompatibility = (
  legacyResult: any,
  sdkResult: any,
  fieldsToCompare: string[] = ['name', 'type', 'mimeType', 'size', 'isEncrypted']
) => {
  fieldsToCompare.forEach(field => {
    expect(legacyResult[field]).toEqual(sdkResult[field]);
  });
};

/**
 * Creates a test environment with proper cleanup for vault service testing
 * @param config - Vault service configuration
 * @returns Cleanup function
 */
export const setupVaultServiceTest = (config: VaultServiceTestConfig) => {
  beforeEach(() => {
    if (config.useFeatureFlag) {
      process.env.NEXT_PUBLIC_USE_VAULT_SDK = 'true';
    } else {
      process.env.NEXT_PUBLIC_USE_VAULT_SDK = 'false';
    }
  });

  afterEach(() => {
    delete process.env.NEXT_PUBLIC_USE_VAULT_SDK;
    jest.clearAllMocks();
  });

  return () => {
    delete process.env.NEXT_PUBLIC_USE_VAULT_SDK;
    jest.clearAllMocks();
  };
};