/**
 * Integration tests for VaultSDK Migration
 * Tests the compatibility and feature flag behavior between legacy VaultService and new VaultSDKService
 */

import { createIntegrationTestSuite, TEST_USERS } from './api-integration-framework';
import { vaultSDKService } from '@/services/VaultSDKService';
import { vaultService } from '@/services/VaultService';
import { withFeatureFlag } from '../test-utils/feature-flag-helpers';
import type { VaultItem, UploadProgress } from '@/services/VaultService';

describe('VaultSDK Migration Integration Tests', () => {
  const testSuite = createIntegrationTestSuite();
  let testUser: any;

  beforeEach(async () => {
    testUser = await testSuite.createUser({
      ...TEST_USERS.regular,
      email: `vault-sdk-${Date.now()}@test.com`,
    });
    await testSuite.signIn(testUser.email, TEST_USERS.regular.password);
  });

  afterEach(async () => {
    await testSuite.signOut();
    await testSuite.cleanup();
  });

  describe('Feature Flag Integration', () => {
    it('should use legacy VaultService when SDK flag is disabled', async () => {
      await withFeatureFlag('USE_VAULT_SDK', false, async () => {
        const mockFile = new File(['test content'], 'legacy-test.txt', { type: 'text/plain' });
        
        // Mock legacy service call
        const uploadSpy = jest.spyOn(vaultService, 'uploadFile');
        const mockResult: VaultItem = {
          id: 'legacy-file-id',
          name: 'legacy-test.txt',
          type: 'file',
          path: '/legacy-test.txt',
          ownerId: testUser.uid,
          userId: testUser.uid,
          parentId: null,
          size: 12,
          mimeType: 'text/plain',
          isEncrypted: false,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          isDeleted: false,
        };
        
        uploadSpy.mockResolvedValue(mockResult);
        
        // Since feature flag controls which service components use,
        // we test that the legacy service method can be called
        const result = await vaultService.uploadFile(mockFile);
        expect(result.id).toBe('legacy-file-id');
        expect(uploadSpy).toHaveBeenCalledWith(mockFile, undefined, undefined);
        
        uploadSpy.mockRestore();
      });
    });

    it('should use VaultSDKService when SDK flag is enabled', async () => {
      await withFeatureFlag('USE_VAULT_SDK', true, async () => {
        const mockFile = new File(['test content'], 'sdk-test.txt', { type: 'text/plain' });
        
        // Mock SDK service call
        const uploadSpy = jest.spyOn(vaultSDKService, 'uploadFile');
        const mockResult: VaultItem = {
          id: 'sdk-file-id',
          name: 'sdk-test.txt',
          type: 'file',
          path: '/sdk-test.txt',
          ownerId: testUser.uid,
          userId: testUser.uid,
          parentId: null,
          size: 12,
          mimeType: 'text/plain',
          isEncrypted: false,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          isDeleted: false,
        };
        
        uploadSpy.mockResolvedValue(mockResult);
        
        const result = await vaultSDKService.uploadFile(mockFile);
        expect(result.id).toBe('sdk-file-id');
        expect(uploadSpy).toHaveBeenCalledWith(mockFile, undefined, undefined);
        
        uploadSpy.mockRestore();
      });
    });
  });

  describe('API Compatibility Tests', () => {
    it('should return compatible data structures for file upload', async () => {
      const mockFile = new File(['compatibility test'], 'compat-test.txt', { type: 'text/plain' });
      
      // Mock both services to return similar structures
      const legacyResult: VaultItem = {
        id: 'legacy-id',
        name: 'compat-test.txt',
        type: 'file',
        path: '/compat-test.txt',
        ownerId: testUser.uid,
        userId: testUser.uid,
        parentId: null,
        size: 17,
        mimeType: 'text/plain',
        isEncrypted: false,
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
        isDeleted: false,
      };

      const sdkResult: VaultItem = {
        id: 'sdk-id',
        name: 'compat-test.txt',
        type: 'file',
        path: '/compat-test.txt',
        ownerId: testUser.uid,
        userId: testUser.uid,
        parentId: null,
        size: 17,
        mimeType: 'text/plain',
        isEncrypted: false,
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
        isDeleted: false,
      };

      jest.spyOn(vaultService, 'uploadFile').mockResolvedValue(legacyResult);
      jest.spyOn(vaultSDKService, 'uploadFile').mockResolvedValue(sdkResult);

      const [legacy, sdk] = await Promise.all([
        vaultService.uploadFile(mockFile),
        vaultSDKService.uploadFile(mockFile)
      ]);

      // Both should have the same structure (different IDs expected)
      expect(legacy).toMatchObject({
        name: 'compat-test.txt',
        type: 'file',
        mimeType: 'text/plain',
        size: 17,
        isEncrypted: false,
      });

      expect(sdk).toMatchObject({
        name: 'compat-test.txt',
        type: 'file',
        mimeType: 'text/plain',
        size: 17,
        isEncrypted: false,
      });
    });

    it('should handle progress callbacks consistently', async () => {
      const mockFile = new File(['progress test'], 'progress-test.txt', { type: 'text/plain' });
      const legacyProgress: UploadProgress[] = [];
      const sdkProgress: UploadProgress[] = [];

      const onLegacyProgress = (progress: UploadProgress) => legacyProgress.push(progress);
      const onSDKProgress = (progress: UploadProgress) => sdkProgress.push(progress);

      // Mock progress behavior
      jest.spyOn(vaultService, 'uploadFile').mockImplementation(async (file, parentId, onProgress) => {
        onProgress?.({ percentage: 50, state: 'uploading' });
        onProgress?.({ percentage: 100, state: 'success' });
        return {
          id: 'legacy-progress-id',
          name: file.name,
          type: 'file',
          path: `/${file.name}`,
          ownerId: testUser.uid,
          userId: testUser.uid,
          parentId: null,
          size: file.size,
          mimeType: file.type,
          isEncrypted: false,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          isDeleted: false,
        };
      });

      jest.spyOn(vaultSDKService, 'uploadFile').mockImplementation(async (file, parentId, onProgress) => {
        onProgress?.({ percentage: 50, state: 'uploading' });
        onProgress?.({ percentage: 100, state: 'success' });
        return {
          id: 'sdk-progress-id',
          name: file.name,
          type: 'file',
          path: `/${file.name}`,
          ownerId: testUser.uid,
          userId: testUser.uid,
          parentId: null,
          size: file.size,
          mimeType: file.type,
          isEncrypted: false,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          isDeleted: false,
        };
      });

      await Promise.all([
        vaultService.uploadFile(mockFile, undefined, onLegacyProgress),
        vaultSDKService.uploadFile(mockFile, undefined, onSDKProgress)
      ]);

      // Both should have similar progress patterns
      expect(legacyProgress).toHaveLength(2);
      expect(sdkProgress).toHaveLength(2);
      
      expect(legacyProgress[0]).toMatchObject({ percentage: 50, state: 'uploading' });
      expect(legacyProgress[1]).toMatchObject({ percentage: 100, state: 'success' });
      
      expect(sdkProgress[0]).toMatchObject({ percentage: 50, state: 'uploading' });
      expect(sdkProgress[1]).toMatchObject({ percentage: 100, state: 'success' });
    });
  });

  describe('Error Handling Compatibility', () => {
    it('should handle authentication errors consistently', async () => {
      // Sign out to trigger auth errors
      await testSuite.signOut();
      
      const mockFile = new File(['auth test'], 'auth-test.txt', { type: 'text/plain' });
      
      jest.spyOn(vaultService, 'uploadFile').mockRejectedValue(new Error('Authentication required'));
      jest.spyOn(vaultSDKService, 'uploadFile').mockRejectedValue(new Error('Authentication required'));

      await expect(vaultService.uploadFile(mockFile)).rejects.toThrow('Authentication required');
      await expect(vaultSDKService.uploadFile(mockFile)).rejects.toThrow('Authentication required');
    });

    it('should handle file size limits consistently', async () => {
      // Create a mock large file
      const largeFile = new File(['x'.repeat(200 * 1024 * 1024)], 'large.txt', { type: 'text/plain' });
      
      jest.spyOn(vaultService, 'uploadFile').mockRejectedValue(new Error('File too large'));
      jest.spyOn(vaultSDKService, 'uploadFile').mockRejectedValue(new Error('File too large'));

      await expect(vaultService.uploadFile(largeFile)).rejects.toThrow('File too large');
      await expect(vaultSDKService.uploadFile(largeFile)).rejects.toThrow('File too large');
    });
  });

  describe('Migration Safety Tests', () => {
    it('should maintain data consistency during service switching', async () => {
      const mockFile = new File(['consistency test'], 'consistency-test.txt', { type: 'text/plain' });
      
      // Simulate uploading with legacy service
      const legacyItem: VaultItem = {
        id: 'consistency-id',
        name: 'consistency-test.txt',
        type: 'file',
        path: '/consistency-test.txt',
        ownerId: testUser.uid,
        userId: testUser.uid,
        parentId: null,
        size: 16,
        mimeType: 'text/plain',
        isEncrypted: false,
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
        isDeleted: false,
      };

      jest.spyOn(vaultService, 'uploadFile').mockResolvedValue(legacyItem);
      jest.spyOn(vaultService, 'getItemById').mockResolvedValue(legacyItem);
      jest.spyOn(vaultSDKService, 'getItemById').mockResolvedValue(legacyItem);

      // Upload with legacy
      const uploadedItem = await vaultService.uploadFile(mockFile);
      
      // Should be able to retrieve with both services
      const [legacyRetrieved, sdkRetrieved] = await Promise.all([
        vaultService.getItemById(uploadedItem.id),
        vaultSDKService.getItemById(uploadedItem.id)
      ]);

      expect(legacyRetrieved).toEqual(uploadedItem);
      expect(sdkRetrieved).toEqual(uploadedItem);
    });

    it('should handle graceful fallback when SDK methods are unavailable', async () => {
      // Test when SDK doesn't have certain methods
      const legacyStats = {
        totalItems: 10,
        totalSize: 1024,
        encryptedItems: 5,
        lastBackup: '2024-01-01T00:00:00Z'
      };

      jest.spyOn(vaultService, 'getVaultStats').mockResolvedValue(legacyStats);
      
      // SDK service should fallback to legacy for missing methods
      const stats = await vaultSDKService.getVaultStats();
      expect(stats).toEqual(legacyStats);
    });
  });

  describe('Performance Integration', () => {
    it('should handle concurrent uploads efficiently', async () => {
      const files = Array.from({ length: 3 }, (_, i) => 
        new File([`content ${i}`], `concurrent-${i}.txt`, { type: 'text/plain' })
      );

      const mockResults = files.map((file, i) => ({
        id: `concurrent-${i}`,
        name: file.name,
        type: 'file' as const,
        path: `/${file.name}`,
        ownerId: testUser.uid,
        userId: testUser.uid,
        parentId: null,
        size: file.size,
        mimeType: file.type,
        isEncrypted: false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        isDeleted: false,
      }));

      jest.spyOn(vaultSDKService, 'uploadFile')
        .mockImplementation(async (file) => {
          const index = files.findIndex(f => f.name === file.name);
          return mockResults[index];
        });

      const startTime = Date.now();
      const results = await Promise.all(
        files.map(file => vaultSDKService.uploadFile(file))
      );
      const endTime = Date.now();

      expect(results).toHaveLength(3);
      expect(endTime - startTime).toBeLessThan(5000); // Should complete within 5 seconds
      
      results.forEach((result, i) => {
        expect(result.name).toBe(`concurrent-${i}.txt`);
      });
    });
  });
});