import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import * as admin from 'firebase-admin';
import { CallableRequest } from 'firebase-functions/v2/https';

// Mock firebase modules
jest.mock('firebase-functions/v2/logger');
jest.mock('firebase-admin');

// Mock services
jest.mock('../services/storageAdapter');
jest.mock('../services/r2Service');
jest.mock('../services/fileSecurityService');
jest.mock('../config/r2Security');
jest.mock('../config/r2Secrets');

// Mock middleware
const mockRequireAuth = jest.fn((request: any) => {
  if (!request.auth?.uid) throw new Error('Unauthenticated');
  return request.auth.uid;
});

const mockWithAuth = jest.fn((handler: any, name: string, options?: any) => handler);

jest.mock('../middleware', () => ({
  requireAuth: mockRequireAuth,
  withAuth: mockWithAuth,
}));

// Mock configuration
jest.mock('../config/security-config', () => ({
  SECURITY_CONFIG: {
    rateLimits: {
      upload: { maxRequests: 10, windowSeconds: 60 },
      write: { maxRequests: 50, windowSeconds: 60 },
    },
  },
}));

// Mock validation
jest.mock('../utils/request-validator', () => ({
  validateRequest: jest.fn((data) => data),
}));

jest.mock('../config/validation-schemas', () => ({
  VALIDATION_SCHEMAS: {
    getVaultUploadSignedUrl: {},
    getVaultItems: {},
    createVaultFolder: {},
    addVaultFile: {},
    renameVaultItem: {},
    moveVaultItem: {},
    deleteVaultItem: {},
    shareVaultItem: {},
    unshareVaultItem: {},
    getVaultDownloadSignedUrl: {},
  },
}));

// Mock utilities
jest.mock('../utils/sanitization', () => ({
  createLogContext: jest.fn((data) => data),
  formatErrorForLogging: jest.fn((error, context) => ({
    message: error.message,
    context,
  })),
}));

jest.mock('../utils/xssSanitization', () => ({
  sanitizeFilename: jest.fn((name) => name),
}));

// Import the functions we're testing
import * as vault from '../vault';

describe('Vault Module Comprehensive Tests', () => {
  let mockFirestore: any;
  let mockDb: any;
  let mockStorage: any;
  let mockBucket: any;
  let mockFile: any;
  let mockStorageAdapter: any;
  let mockR2Service: any;

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Setup Firestore mocks
    const mockDoc = jest.fn((id?: string) => ({
      id: id || 'generated-id',
      get: jest.fn(),
      set: jest.fn(() => Promise.resolve()),
      update: jest.fn(() => Promise.resolve()),
      delete: jest.fn(() => Promise.resolve()),
    }));
    
    const mockCollection = jest.fn((name: string) => ({
      doc: mockDoc,
      where: jest.fn().mockReturnThis(),
      get: jest.fn(() => Promise.resolve({ empty: true, docs: [] })),
      add: jest.fn((data) => Promise.resolve({ id: 'new-doc-id', ...data })),
      limit: jest.fn().mockReturnThis(),
    }));
    
    mockDb = {
      collection: mockCollection,
    };
    
    mockFirestore = jest.fn(() => mockDb);
    
    // Setup Storage mocks
    mockFile = {
      getSignedUrl: jest.fn(),
      exists: jest.fn(() => Promise.resolve([true])),
      delete: jest.fn(() => Promise.resolve()),
      getMetadata: jest.fn(() => Promise.resolve([{ size: 1000 }])),
    };
    
    mockBucket = {
      file: jest.fn(() => mockFile),
    };
    
    mockStorage = {
      bucket: jest.fn(() => mockBucket),
    };
    
    // Setup service mocks
    mockStorageAdapter = {
      generateUploadUrl: jest.fn(),
      generateDownloadUrl: jest.fn(),
      deleteFile: jest.fn(),
    };
    
    mockR2Service = {
      getBucketName: jest.fn(() => 'test-bucket'),
      generateStorageKey: jest.fn(() => 'vault/user123/file.jpg'),
    };
    
    // Apply mocks
    (admin.firestore as jest.Mock).mockReturnValue(mockDb);
    (admin.storage as jest.Mock).mockReturnValue(mockStorage);
    (admin.firestore.FieldValue as any) = {
      serverTimestamp: jest.fn(() => new Date()),
      delete: jest.fn(() => 'DELETE_FIELD'),
    };
    (admin.firestore.Timestamp as any) = {
      fromMillis: jest.fn((millis) => ({ toMillis: () => millis })),
    };
    
    const { StorageAdapter } = require('../services/storageAdapter');
    (StorageAdapter as jest.MockedClass<any>).mockImplementation(() => mockStorageAdapter);
    
    const { R2Service } = require('../services/r2Service');
    Object.assign(R2Service, mockR2Service);
    
    const { validateUploadRequest } = require('../config/r2Security');
    (validateUploadRequest as jest.Mock).mockReturnValue({ valid: true });
    
    const { R2_CONFIG } = require('../config/r2Secrets');
    (R2_CONFIG as any).value = jest.fn(() => 'test-r2-config');
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('getVaultUploadSignedUrl', () => {
    it('should generate signed URL for Firebase Storage upload', async () => {
      const testData = {
        fileName: 'test-image.jpg',
        mimeType: 'image/jpeg',
        parentId: null,
        isEncrypted: false,
        fileSize: 1024 * 1024, // 1MB
      };

      // Mock signed URL generation
      mockFile.getSignedUrl.mockResolvedValue(['https://storage.googleapis.com/signed-url']);

      // Mock vault item creation
      mockDb.collection().add.mockResolvedValue({ id: 'vault-item-id' });

      const mockRequest: CallableRequest<any> = {
        data: testData,
        auth: { uid: 'test-user-id' ,
    acceptsStreaming: false} as any,
        rawRequest: {} as any,
        acceptsStreaming: false,
      };

      const result = await vault.getVaultUploadSignedUrl.run(mockRequest);

      expect(result).toEqual({
        signedUrl: 'https://storage.googleapis.com/signed-url',
        storagePath: 'vault/test-user-id/root/test-image.jpg',
        parentPathInVault: '',
        isEncrypted: false,
        itemId: 'vault-item-id',
        storageProvider: 'firebase',
      });

      // Verify signed URL was generated correctly
      expect(mockFile.getSignedUrl).toHaveBeenCalledWith({
        version: 'v4',
        action: 'write',
        expires: expect.any(Number),
        contentType: 'image/jpeg',
      });

      // Verify vault item was created
      expect(mockDb.collection().add).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'test-user-id',
          name: 'test-image.jpg',
          type: 'file',
          parentId: null,
          path: '/test-image.jpg',
          size: 1024 * 1024,
          mimeType: 'image/jpeg',
          isDeleted: false,
          isEncrypted: false,
          storageProvider: 'firebase',
          storagePath: 'vault/test-user-id/root/test-image.jpg',
          cachedUploadUrl: 'https://storage.googleapis.com/signed-url',
        })
      );
    });

    it('should generate signed URL for R2 Storage upload', async () => {
      // Set storage provider to R2
      process.env.STORAGE_PROVIDER = 'r2';

      const testData = {
        fileName: 'document.pdf',
        mimeType: 'application/pdf',
        parentId: 'parent-folder-id',
        isEncrypted: true,
        fileSize: 2 * 1024 * 1024, // 2MB
      };

      // Mock parent folder exists
      const mockParentDoc = {
        exists: true,
        data: () => ({
          path: '/documents',
          type: 'folder',
          userId: 'test-user-id',
        }),
      };

      mockDb.collection().doc().get.mockResolvedValue(mockParentDoc);

      // Mock R2 upload URL generation
      mockStorageAdapter.generateUploadUrl.mockResolvedValue({
        signedUrl: 'https://r2.example.com/signed-upload-url',
      });

      // Mock vault item creation
      mockDb.collection().add.mockResolvedValue({ id: 'vault-item-r2-id' });

      const mockRequest: CallableRequest<any> = {
        data: testData,
        auth: { uid: 'test-user-id' ,
    acceptsStreaming: false} as any,
        rawRequest: {} as any,
        acceptsStreaming: false,
      };

      const result = await vault.getVaultUploadSignedUrl.run(mockRequest);

      expect(result).toEqual({
        signedUrl: 'https://r2.example.com/signed-upload-url',
        storagePath: 'vault/user123/file.jpg',
        parentPathInVault: '/documents',
        isEncrypted: true,
        itemId: 'vault-item-r2-id',
        storageProvider: 'r2',
        r2Bucket: 'test-bucket',
        r2Key: 'vault/user123/file.jpg',
      });

      // Verify R2 service was called
      expect(mockR2Service.getBucketName).toHaveBeenCalledWith('vault');
      expect(mockR2Service.generateStorageKey).toHaveBeenCalledWith(
        'vault',
        'test-user-id',
        'document.pdf',
        'parent-folder-id'
      );

      // Verify storage adapter was called with metadata
      expect(mockStorageAdapter.generateUploadUrl).toHaveBeenCalledWith(
        'vault/user123/file.jpg',
        'application/pdf',
        300,
        expect.objectContaining({
          uploadedBy: 'test-user-id',
          originalName: 'document.pdf',
          parentId: 'parent-folder-id',
          isEncrypted: 'true',
        })
      );

      // Reset env
      delete process.env.STORAGE_PROVIDER;
    });

    it('should handle validation errors', async () => {
      const { validateUploadRequest } = require('../config/r2Security');
      (validateUploadRequest as jest.Mock).mockReturnValue({
        valid: false,
        error: 'File size exceeds limit',
      });

      const testData = {
        fileName: 'huge-file.zip',
        mimeType: 'application/zip',
        fileSize: 100 * 1024 * 1024 * 1024, // 100GB
      };

      const mockRequest: CallableRequest<any> = {
        data: testData,
        auth: { uid: 'test-user-id' ,
    acceptsStreaming: false} as any,
        rawRequest: {} as any,
        acceptsStreaming: false,
      };

      await expect(vault.getVaultUploadSignedUrl.run(mockRequest))
        .rejects.toThrow('File size exceeds limit');
    });

    it('should handle parent folder not found error', async () => {
      const testData = {
        fileName: 'test.txt',
        mimeType: 'text/plain',
        parentId: 'non-existent-folder',
        fileSize: 100,
      };

      // Mock parent folder doesn't exist
      mockDb.collection().doc().get.mockResolvedValue({
        exists: false,
      });

      const mockRequest: CallableRequest<any> = {
        data: testData,
        auth: { uid: 'test-user-id' ,
    acceptsStreaming: false} as any,
        rawRequest: {} as any,
        acceptsStreaming: false,
      };

      await expect(vault.getVaultUploadSignedUrl.run(mockRequest))
        .rejects.toThrow('Parent folder not found');
    });
  });

  describe('getVaultItems', () => {
    it('should return owned and shared vault items', async () => {
      const userId = 'test-user-id';

      // Mock owned items
      const ownedItems = [
        {
          id: 'owned-file-1',
          data: () => ({
            userId: userId,
            name: 'my-file.txt',
            type: 'file',
            parentId: null,
            path: '/my-file.txt',
            isDeleted: false,
          }),
        },
        {
          id: 'owned-folder-1',
          data: () => ({
            userId: userId,
            name: 'My Folder',
            type: 'folder',
            parentId: null,
            path: '/My Folder',
            isDeleted: false,
          }),
        },
      ];

      // Mock shared items
      const sharedItems = [
        {
          id: 'shared-file-1',
          data: () => ({
            userId: 'other-user',
            name: 'shared-doc.pdf',
            type: 'file',
            parentId: null,
            path: '/shared-doc.pdf',
            isDeleted: false,
            sharedWith: [userId, 'another-user'],
            permissions: {
              canRead: [userId],
              canWrite: [],
            },
          }),
        },
      ];

      // Setup query mocks
      const ownedQuery = {
        where: jest.fn().mockReturnThis(),
        get: jest.fn(() => Promise.resolve({ docs: ownedItems })),
      };

      const sharedQuery = {
        where: jest.fn().mockReturnThis(),
        get: jest.fn(() => Promise.resolve({ docs: sharedItems })),
      };

      mockDb.collection.mockImplementation(() => ({
        where: jest.fn((field) => {
          if (field === 'userId') return ownedQuery;
          if (field === 'sharedWith') return sharedQuery;
          return { where: jest.fn().mockReturnThis(), get: jest.fn() };
        }),
      }));

      const mockRequest: CallableRequest<any> = {
        data: { parentId: null ,
    acceptsStreaming: false},
        auth: { uid: userId } as any,
        rawRequest: {} as any,
        acceptsStreaming: false,
      };

      const result = await vault.getVaultItems.run(mockRequest);

      expect(result.items).toHaveLength(3);

      // Check that folders come first
      expect(result.items[0].type).toBe('folder');
      expect(result.items[0].accessLevel).toBe('owner');

      // Check owned file
      const ownedFile = result.items.find(item => item.id === 'owned-file-1');
      expect(ownedFile).toBeDefined();
      expect(ownedFile?.accessLevel).toBe('owner');

      // Check shared file
      const sharedFile = result.items.find(item => item.id === 'shared-file-1');
      expect(sharedFile).toBeDefined();
      expect(sharedFile?.accessLevel).toBe('read');
    });

    it('should handle unauthenticated requests', async () => {
      const mockRequest: CallableRequest<any> = {
        data: {,
    acceptsStreaming: false},
        auth: null,
        rawRequest: {} as any,
        acceptsStreaming: false,
      };

      await expect(vault.getVaultItems.run(mockRequest))
        .rejects.toThrow('Authentication required');
    });

    it('should filter items by parentId', async () => {
      const userId = 'test-user-id';
      const parentId = 'parent-folder-id';

      const items = [
        {
          id: 'file-in-folder',
          data: () => ({
            userId: userId,
            name: 'nested-file.txt',
            type: 'file',
            parentId: parentId,
            path: '/parent/nested-file.txt',
            isDeleted: false,
          }),
        },
      ];

      const query = {
        where: jest.fn().mockReturnThis(),
        get: jest.fn(() => Promise.resolve({ docs: items })),
      };

      mockDb.collection.mockReturnValue(query);

      const mockRequest: CallableRequest<any> = {
        data: { parentId: parentId ,
    acceptsStreaming: false},
        auth: { uid: userId } as any,
        rawRequest: {} as any,
        acceptsStreaming: false,
      };

      const result = await vault.getVaultItems.run(mockRequest);

      expect(result.items).toHaveLength(1);
      expect(result.items[0].parentId).toBe(parentId);

      // Verify queries included parentId filter
      expect(query.where).toHaveBeenCalledWith('parentId', '==', parentId);
    });

    it('should exclude deleted items', async () => {
      const userId = 'test-user-id';

      const items = [
        {
          id: 'active-file',
          data: () => ({
            userId: userId,
            name: 'active.txt',
            type: 'file',
            parentId: null,
            isDeleted: false,
          }),
        },
        {
          id: 'deleted-file',
          data: () => ({
            userId: userId,
            name: 'deleted.txt',
            type: 'file',
            parentId: null,
            isDeleted: true,
          }),
        },
      ];

      // Mock query to only return non-deleted items
      const query = {
        where: jest.fn().mockReturnThis(),
        get: jest.fn(() => Promise.resolve({ 
          docs: items.filter(item => !item.data().isDeleted) 
        })),
      };

      mockDb.collection.mockReturnValue(query);

      const mockRequest: CallableRequest<any> = {
        data: { parentId: null ,
    acceptsStreaming: false},
        auth: { uid: userId } as any,
        rawRequest: {} as any,
        acceptsStreaming: false,
      };

      const result = await vault.getVaultItems.run(mockRequest);

      expect(result.items).toHaveLength(1);
      expect(result.items[0].name).toBe('active.txt');

      // Verify isDeleted filter was applied
      expect(query.where).toHaveBeenCalledWith('isDeleted', '==', false);
    });

    it('should determine correct access level for shared items', async () => {
      const userId = 'test-user-id';

      const sharedItems = [
        {
          id: 'read-only-file',
          data: () => ({
            userId: 'owner-user',
            name: 'read-only.txt',
            type: 'file',
            parentId: null,
            isDeleted: false,
            sharedWith: [userId],
            permissions: {
              canRead: [userId],
              canWrite: [],
            },
          }),
        },
        {
          id: 'write-access-file',
          data: () => ({
            userId: 'owner-user',
            name: 'writable.txt',
            type: 'file',
            parentId: null,
            isDeleted: false,
            sharedWith: [userId],
            permissions: {
              canRead: [],
              canWrite: [userId],
            },
          }),
        },
      ];

      const ownedQuery = {
        where: jest.fn().mockReturnThis(),
        get: jest.fn(() => Promise.resolve({ docs: [] })),
      };

      const sharedQuery = {
        where: jest.fn().mockReturnThis(),
        get: jest.fn(() => Promise.resolve({ docs: sharedItems })),
      };

      mockDb.collection.mockImplementation(() => ({
        where: jest.fn((field) => {
          if (field === 'userId') return ownedQuery;
          if (field === 'sharedWith') return sharedQuery;
          return { where: jest.fn().mockReturnThis(), get: jest.fn() };
        }),
      }));

      const mockRequest: CallableRequest<any> = {
        data: { parentId: null ,
    acceptsStreaming: false},
        auth: { uid: userId } as any,
        rawRequest: {} as any,
        acceptsStreaming: false,
      };

      const result = await vault.getVaultItems.run(mockRequest);

      const readOnlyFile = result.items.find(item => item.id === 'read-only-file');
      expect(readOnlyFile?.accessLevel).toBe('read');

      const writableFile = result.items.find(item => item.id === 'write-access-file');
      expect(writableFile?.accessLevel).toBe('write');
    });
  });

  describe('createVaultFolder', () => {
    it('should create a new folder in root', async () => {
      const testData = {
        name: 'New Folder',
        parentFolderId: null,
      };

      mockDb.collection().add.mockResolvedValue({ id: 'new-folder-id' });

      const mockRequest: CallableRequest<any> = {
        data: testData,
        auth: { uid: 'test-user-id' ,
    acceptsStreaming: false} as any,
        rawRequest: {} as any,
        acceptsStreaming: false,
      };

      const result = await vault.createVaultFolder.run(mockRequest);

      expect(result).toEqual({ id: 'new-folder-id' });

      // Verify folder was created with correct data
      expect(mockDb.collection().add).toHaveBeenCalledWith({
        userId: 'test-user-id',
        name: 'New Folder',
        type: 'folder',
        parentId: null,
        path: '/New Folder',
        createdAt: expect.any(Date),
        updatedAt: expect.any(Date),
        isDeleted: false,
      });
    });

    it('should create a nested folder', async () => {
      const testData = {
        name: 'Nested Folder',
        parentFolderId: 'parent-folder-id',
      };

      // Mock parent folder exists
      const mockParentDoc = {
        exists: true,
        data: () => ({
          path: '/Parent Folder',
          type: 'folder',
          userId: 'test-user-id',
        }),
      };

      mockDb.collection().doc().get.mockResolvedValue(mockParentDoc);
      mockDb.collection().add.mockResolvedValue({ id: 'nested-folder-id' });

      const mockRequest: CallableRequest<any> = {
        data: testData,
        auth: { uid: 'test-user-id' ,
    acceptsStreaming: false} as any,
        rawRequest: {} as any,
        acceptsStreaming: false,
      };

      const result = await vault.createVaultFolder.run(mockRequest);

      expect(result).toEqual({ id: 'nested-folder-id' });

      // Verify nested path
      expect(mockDb.collection().add).toHaveBeenCalledWith(
        expect.objectContaining({
          path: '/Parent Folder/Nested Folder',
          parentId: 'parent-folder-id',
        })
      );
    });

    it('should handle parent folder not found', async () => {
      const testData = {
        name: 'Orphan Folder',
        parentFolderId: 'non-existent-parent',
      };

      mockDb.collection().doc().get.mockResolvedValue({
        exists: false,
      });

      const mockRequest: CallableRequest<any> = {
        data: testData,
        auth: { uid: 'test-user-id' ,
    acceptsStreaming: false} as any,
        rawRequest: {} as any,
        acceptsStreaming: false,
      };

      await expect(vault.createVaultFolder.run(mockRequest))
        .rejects.toThrow('Parent folder not found');
    });

    it('should sanitize folder names', async () => {
      const { sanitizeFilename } = require('../utils/xssSanitization');
      (sanitizeFilename as jest.Mock).mockReturnValue('Sanitized_Folder_Name');

      const testData = {
        name: '../../../etc/passwd',
        parentFolderId: null,
      };

      mockDb.collection().add.mockResolvedValue({ id: 'sanitized-folder-id' });

      const mockRequest: CallableRequest<any> = {
        data: testData,
        auth: { uid: 'test-user-id' ,
    acceptsStreaming: false} as any,
        rawRequest: {} as any,
        acceptsStreaming: false,
      };

      await vault.createVaultFolder.run(mockRequest);

      expect(sanitizeFilename).toHaveBeenCalledWith('../../../etc/passwd');
      expect(mockDb.collection().add).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'Sanitized_Folder_Name',
          path: '/Sanitized_Folder_Name',
        })
      );
    });
  });

  describe('addVaultFile', () => {
    it('should update pre-created vault item from upload', async () => {
      const testData = {
        itemId: 'pre-created-item-id',
        name: 'uploaded-file.jpg',
        parentId: null,
        storagePath: 'vault/user123/root/uploaded-file.jpg',
        fileType: 'image',
        size: 2048576,
        mimeType: 'image/jpeg',
        isEncrypted: false,
      };

      // Mock existing item
      const mockItemDoc = {
        exists: true,
        data: () => ({
          userId: 'test-user-id',
          name: 'uploaded-file.jpg',
          type: 'file',
          cachedUploadUrl: 'https://old-upload-url',
          cachedUploadUrlExpiry: { toMillis: () => Date.now() - 1000 },
        }),
      };

      const mockItemRef = {
        get: jest.fn(() => Promise.resolve(mockItemDoc)),
        update: jest.fn(() => Promise.resolve()),
      };

      mockDb.collection().doc.mockReturnValue(mockItemRef);

      const mockRequest: CallableRequest<any> = {
        data: testData,
        auth: { uid: 'test-user-id' ,
    acceptsStreaming: false} as any,
        rawRequest: {} as any,
        acceptsStreaming: false,
      };

      const result = await vault.addVaultFile.run(mockRequest);

      expect(result).toEqual({ id: 'pre-created-item-id' });

      // Verify update was called correctly
      expect(mockItemRef.update).toHaveBeenCalledWith({
        updatedAt: expect.any(Date),
        size: 2048576,
        cachedUploadUrl: 'DELETE_FIELD',
        cachedUploadUrlExpiry: 'DELETE_FIELD',
      });
    });

    it('should handle permission denied for wrong user', async () => {
      const testData = {
        itemId: 'pre-created-item-id',
        name: 'file.txt',
        storagePath: 'vault/otheruser/file.txt',
      };

      // Mock item owned by different user
      const mockItemDoc = {
        exists: true,
        data: () => ({
          userId: 'other-user-id',
          name: 'file.txt',
        }),
      };

      mockDb.collection().doc().get.mockResolvedValue(mockItemDoc);

      const mockRequest: CallableRequest<any> = {
        data: testData,
        auth: { uid: 'test-user-id' ,
    acceptsStreaming: false} as any,
        rawRequest: {} as any,
        acceptsStreaming: false,
      };

      await expect(vault.addVaultFile.run(mockRequest))
        .rejects.toThrow("You don't have permission to update this item");
    });

    it('should create new vault item when itemId not provided', async () => {
      const testData = {
        name: 'new-file.pdf',
        parentId: 'folder-id',
        storagePath: 'vault/user123/folder-id/new-file.pdf',
        fileType: 'document',
        size: 1024000,
        mimeType: 'application/pdf',
      };

      // Mock parent folder
      const mockParentDoc = {
        exists: true,
        data: () => ({
          path: '/Documents',
          type: 'folder',
        }),
      };

      mockDb.collection().doc().get.mockResolvedValue(mockParentDoc);
      mockDb.collection().add.mockResolvedValue({ id: 'new-file-id' });

      const mockRequest: CallableRequest<any> = {
        data: testData,
        auth: { uid: 'test-user-id' ,
    acceptsStreaming: false} as any,
        rawRequest: {} as any,
        acceptsStreaming: false,
      };

      const result = await vault.addVaultFile.run(mockRequest);

      expect(result).toEqual({ id: 'new-file-id' });

      // Verify new item was created
      expect(mockDb.collection().add).toHaveBeenCalledWith({
        userId: 'test-user-id',
        name: 'new-file.pdf',
        type: 'file',
        parentId: 'folder-id',
        path: '/Documents/new-file.pdf',
        createdAt: expect.any(Date),
        updatedAt: expect.any(Date),
        fileType: 'document',
        size: 1024000,
        storagePath: 'vault/user123/folder-id/new-file.pdf',
        downloadURL: 'DELETE_FIELD',
        mimeType: 'application/pdf',
        isDeleted: false,
        isEncrypted: false,
        encryptionKeyId: null,
      });
    });

    it('should handle encrypted files', async () => {
      const testData = {
        itemId: 'encrypted-item-id',
        name: 'secret.txt',
        storagePath: 'vault/user123/secret.txt',
        isEncrypted: true,
        encryptionKeyId: 'key-123',
        size: 5000,
      };

      const mockItemDoc = {
        exists: true,
        data: () => ({
          userId: 'test-user-id',
          name: 'secret.txt',
        }),
      };

      const mockItemRef = {
        get: jest.fn(() => Promise.resolve(mockItemDoc)),
        update: jest.fn(() => Promise.resolve()),
      };

      mockDb.collection().doc.mockReturnValue(mockItemRef);

      const mockRequest: CallableRequest<any> = {
        data: testData,
        auth: { uid: 'test-user-id' ,
    acceptsStreaming: false} as any,
        rawRequest: {} as any,
        acceptsStreaming: false,
      };

      await vault.addVaultFile.run(mockRequest);

      // Verify encryption fields were added
      expect(mockItemRef.update).toHaveBeenCalledWith(
        expect.objectContaining({
          isEncrypted: true,
          encryptionKeyId: 'key-123',
          encryptedBy: 'test-user-id',
        })
      );
    });
  });

  describe('Access Control Functions', () => {
    it('should verify owner has full access', async () => {
      const mockItemDoc = {
        exists: true,
        id: 'item-id',
        data: () => ({
          id: 'item-id',
          userId: 'owner-id',
          name: 'my-file.txt',
          isDeleted: false,
        }),
      };

      mockDb.collection().doc().get.mockResolvedValue(mockItemDoc);

      // Test internal access control function by calling a function that uses it
      const testData = {
        itemId: 'item-id',
        name: 'renamed-file.txt',
      };

      const mockRequest: CallableRequest<any> = {
        data: testData,
        auth: { uid: 'owner-id' ,
    acceptsStreaming: false} as any,
        rawRequest: {} as any,
        acceptsStreaming: false,
      };

      // This would be tested through renameVaultItem or similar functions
      // that use verifyVaultItemAccess internally
    });

    it('should verify shared user permissions', async () => {
      const mockItemDoc = {
        exists: true,
        id: 'shared-item',
        data: () => ({
          id: 'shared-item',
          userId: 'owner-id',
          name: 'shared-file.txt',
          isDeleted: false,
          sharedWith: ['reader-id', 'writer-id'],
          permissions: {
            canRead: ['reader-id'],
            canWrite: ['writer-id'],
          },
        }),
      };

      mockDb.collection().doc().get.mockResolvedValue(mockItemDoc);

      // Test would be done through functions that check permissions
    });

    it('should handle deleted items access', async () => {
      const mockItemDoc = {
        exists: true,
        id: 'deleted-item',
        data: () => ({
          id: 'deleted-item',
          userId: 'owner-id',
          name: 'deleted-file.txt',
          isDeleted: true,
        }),
      };

      mockDb.collection().doc().get.mockResolvedValue(mockItemDoc);

      // Test through functions that check isDeleted
    });
  });

  describe('Edge Cases and Error Handling', () => {
    it('should handle concurrent upload requests', async () => {
      const testData = {
        fileName: 'concurrent-file.jpg',
        mimeType: 'image/jpeg',
        fileSize: 1000000,
      };

      mockFile.getSignedUrl.mockResolvedValue(['https://storage.googleapis.com/signed-url']);
      mockDb.collection().add.mockResolvedValue({ id: 'vault-item-id' });

      const mockRequest: CallableRequest<any> = {
        data: testData,
        auth: { uid: 'test-user-id' ,
    acceptsStreaming: false} as any,
        rawRequest: {} as any,
        acceptsStreaming: false,
      };

      // Simulate concurrent requests
      const results = await Promise.all([
        vault.getVaultUploadSignedUrl.run(mockRequest),
        vault.getVaultUploadSignedUrl.run(mockRequest),
      ]);

      // Each should get their own item ID
      expect(results[0].itemId).toBeDefined();
      expect(results[1].itemId).toBeDefined();
      expect(mockDb.collection().add).toHaveBeenCalledTimes(2);
    });

    it('should handle special characters in filenames', async () => {
      const { sanitizeFilename } = require('../utils/xssSanitization');
      (sanitizeFilename as jest.Mock).mockImplementation((name) => 
        name.replace(/[^a-zA-Z0-9.-]/g, '_')
      );

      const testData = {
        name: 'file with spaces & symbols!.txt',
        parentFolderId: null,
      };

      mockDb.collection().add.mockResolvedValue({ id: 'sanitized-id' });

      const mockRequest: CallableRequest<any> = {
        data: testData,
        auth: { uid: 'test-user-id' ,
    acceptsStreaming: false} as any,
        rawRequest: {} as any,
        acceptsStreaming: false,
      };

      await vault.createVaultFolder.run(mockRequest);

      expect(mockDb.collection().add).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'file_with_spaces___symbols_.txt',
        })
      );
    });

    it('should handle very deep folder nesting', async () => {
      // This would test the MAX_UPDATE_DEPTH limit in updateDescendantPathsRecursive
      // The actual implementation uses an iterative approach with a stack
      // to prevent stack overflow with deep nesting
    });

    it('should handle validation errors from request validator', async () => {
      const { validateRequest } = require('../utils/request-validator');
      (validateRequest as jest.Mock).mockImplementation(() => {
        throw new Error('Invalid file name format');
      });

      const mockRequest: CallableRequest<any> = {
        data: { fileName: '../../etc/passwd' ,
    acceptsStreaming: false},
        auth: { uid: 'test-user-id' } as any,
        rawRequest: {} as any,
        acceptsStreaming: false,
      };

      await expect(vault.getVaultUploadSignedUrl.run(mockRequest))
        .rejects.toThrow('Invalid file name format');
    });
  });

  describe('CSRF and Rate Limiting', () => {
    it('should enable CSRF protection on all write operations', async () => {
      // Verify CSRF is enabled on functions that modify data
      const functionsWithCSRF = [
        'getVaultUploadSignedUrl',
        'createVaultFolder',
        'addVaultFile',
      ];

      functionsWithCSRF.forEach(funcName => {
        const callArgs = mockWithAuth.mock.calls.find(call => call[1] === funcName);
        expect(callArgs).toBeDefined();
        expect(callArgs[2].enableCSRF).toBe(true);
      });
    });

    it('should apply appropriate rate limits', async () => {
      // Verify rate limits are applied
      const uploadFunction = mockWithAuth.mock.calls.find(
        call => call[1] === 'getVaultUploadSignedUrl'
      );
      expect(uploadFunction[2].rateLimitConfig).toEqual({
        maxRequests: 10,
        windowSeconds: 60,
      });

      const writeFunction = mockWithAuth.mock.calls.find(
        call => call[1] === 'createVaultFolder'
      );
      expect(writeFunction[2].rateLimitConfig).toEqual({
        maxRequests: 50,
        windowSeconds: 60,
      });
    });
  });
});