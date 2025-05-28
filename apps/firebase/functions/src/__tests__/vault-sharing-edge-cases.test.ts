import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import * as admin from 'firebase-admin';
import { shareVaultItem, updateVaultItemPermissions, revokeVaultAccess } from '../vault';

// Mock Firebase Admin SDK
jest.mock('firebase-admin', () => {
  const mockTimestamp = { 
    toMillis: () => Date.now(), 
    toDate: () => new Date(),
    _seconds: Math.floor(Date.now() / 1000),
    _nanoseconds: 0
  };
  
  return {
    initializeApp: jest.fn(),
    apps: [],
    firestore: jest.fn(() => ({
      collection: jest.fn((collectionName: string) => ({
        doc: jest.fn((docId?: string) => {
          const docRef: any = {
            id: docId || 'generated-id',
            get: jest.fn(),
            set: jest.fn(() => Promise.resolve()),
            update: jest.fn(() => Promise.resolve()),
            delete: jest.fn(() => Promise.resolve()),
          };
          return docRef;
        }),
        where: jest.fn(() => ({
          get: jest.fn(() => Promise.resolve({ 
            empty: false, 
            docs: [],
            size: 0 
          })),
        })),
        add: jest.fn(() => Promise.resolve({ id: 'new-doc-id' })),
      })),
      batch: jest.fn(() => ({
        set: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
        commit: jest.fn(() => Promise.resolve()),
      })),
      FieldValue: {
        serverTimestamp: jest.fn(() => mockTimestamp),
        arrayUnion: jest.fn((...elements) => ({ arrayUnion: elements })),
        arrayRemove: jest.fn((...elements) => ({ arrayRemove: elements })),
      },
      Timestamp: {
        now: jest.fn(() => mockTimestamp),
      },
    })),
    messaging: jest.fn(() => ({
      sendMulticast: jest.fn(() => Promise.resolve({ 
        successCount: 1, 
        failureCount: 0,
        responses: [{ success: true }] 
      })),
    })),
  };
});

// Mock validation
jest.mock('../utils/request-validator', () => ({
  validateRequest: jest.fn((data) => data),
}));

// Mock middleware
jest.mock('../middleware', () => ({
  withResourceAccess: jest.fn((handler, name, config) => ({
    run: async (request: any) => handler(request),
  })),
  PermissionLevel: {
    VAULT_OWNER: 'vault_owner',
    VAULT_WRITE: 'vault_write',
    VAULT_READ: 'vault_read',
    FAMILY_MEMBER: 'family_member',
  },
}));

// Helper to create request context
const createRequest = (data: any, auth: any = { uid: 'test-user-id' }) => ({
  data,
  auth,
  rawRequest: { ip: '127.0.0.1' },
  acceptsStreaming: false,
});

describe('Vault Sharing Permissions - Edge Cases', () => {
  let mockFirestore: any;
  let mockMessaging: any;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.FUNCTIONS_EMULATOR = 'true';
    
    mockFirestore = admin.firestore() as any;
    mockMessaging = admin.messaging() as any;
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('shareVaultItem - Edge Cases', () => {
    describe('Complex Permission Scenarios', () => {
      it('should handle sharing with mixed permission levels', async () => {
        const ownerId = 'owner-id';
        const itemId = 'vault-item-123';

        // Mock vault item
        const mockItemDoc = {
          exists: true,
          data: () => ({
            id: itemId,
            userId: ownerId,
            name: 'Shared Document.pdf',
            type: 'file',
            sharedWith: [],
            permissions: {
              canRead: [],
              canWrite: [],
            },
          }),
        };
        const mockItemRef = {
          get: jest.fn(() => Promise.resolve(mockItemDoc)),
          update: jest.fn(() => Promise.resolve()),
        };

        // Mock users to share with
        const mockUsersSnapshot = {
          size: 3,
          docs: [
            { id: 'user1', data: () => ({ email: 'user1@example.com', fcmTokens: ['token1'] }) },
            { id: 'user2', data: () => ({ email: 'user2@example.com', fcmTokens: ['token2'] }) },
            { id: 'user3', data: () => ({ email: 'user3@example.com', fcmTokens: ['token3'] }) },
          ],
        };

        const mockBatch = {
          set: jest.fn(),
          update: jest.fn(),
          commit: jest.fn(() => Promise.resolve()),
        };

        mockFirestore.collection.mockImplementation((collection: string) => {
          if (collection === 'vaultItems') {
            return {
              doc: jest.fn(() => mockItemRef),
            };
          }
          if (collection === 'users') {
            return {
              where: jest.fn(() => ({
                get: jest.fn(() => Promise.resolve(mockUsersSnapshot)),
              })),
            };
          }
          return {
            doc: jest.fn(() => ({ set: jest.fn() })),
          };
        });

        mockFirestore.batch.mockReturnValue(mockBatch);

        const request = createRequest({
          itemId,
          userIds: ['user1', 'user2', 'user3'],
          permissions: {
            user1: 'write',
            user2: 'read',
            user3: 'write',
          },
        }, { uid: ownerId });

        const result = await shareVaultItem.run(request);

        expect(result.success).toBe(true);

        // Verify permissions were set correctly
        expect(mockItemRef.update).toHaveBeenCalledWith(
          expect.objectContaining({
            sharedWith: ['user1', 'user2', 'user3'],
            permissions: {
              canRead: ['user2'], // Only read permission
              canWrite: ['user1', 'user3'], // Write permissions
            },
          })
        );

        // Verify notifications were created for all users
        expect(mockBatch.set).toHaveBeenCalledTimes(3);
      });

      it('should prevent sharing with oneself', async () => {
        const ownerId = 'owner-id';
        const itemId = 'vault-item-123';

        const mockItemDoc = {
          exists: true,
          data: () => ({
            id: itemId,
            userId: ownerId,
            name: 'My Document.pdf',
            type: 'file',
          }),
        };
        const mockItemRef = {
          get: jest.fn(() => Promise.resolve(mockItemDoc)),
        };

        mockFirestore.collection().doc.mockReturnValue(mockItemRef);

        const request = createRequest({
          itemId,
          userIds: [ownerId], // Trying to share with self
          permissions: 'read',
        }, { uid: ownerId });

        await expect(shareVaultItem.run(request)).rejects.toThrow('cannot share with yourself');
      });

      it('should handle sharing folder with recursive permissions', async () => {
        const ownerId = 'owner-id';
        const folderId = 'folder-123';

        // Mock folder
        const mockFolderDoc = {
          exists: true,
          data: () => ({
            id: folderId,
            userId: ownerId,
            name: 'Family Photos',
            type: 'folder',
            sharedWith: [],
            permissions: {
              canRead: [],
              canWrite: [],
            },
          }),
        };
        const mockFolderRef = {
          get: jest.fn(() => Promise.resolve(mockFolderDoc)),
          update: jest.fn(() => Promise.resolve()),
        };

        // Mock child items in folder
        const mockChildItems = {
          docs: [
            {
              id: 'child-file-1',
              data: () => ({ type: 'file', parentFolderId: folderId }),
              ref: { update: jest.fn() },
            },
            {
              id: 'child-file-2',
              data: () => ({ type: 'file', parentFolderId: folderId }),
              ref: { update: jest.fn() },
            },
            {
              id: 'child-folder-1',
              data: () => ({ type: 'folder', parentFolderId: folderId }),
              ref: { update: jest.fn() },
            },
          ],
        };

        // Mock users
        const mockUsersSnapshot = {
          size: 1,
          docs: [
            { id: 'user1', data: () => ({ email: 'user1@example.com' }) },
          ],
        };

        const mockBatch = {
          set: jest.fn(),
          update: jest.fn(),
          commit: jest.fn(() => Promise.resolve()),
        };

        mockFirestore.collection.mockImplementation((collection: string) => {
          if (collection === 'vaultItems') {
            return {
              doc: jest.fn((id: string) => {
                if (id === folderId) return mockFolderRef;
                return { get: jest.fn() };
              }),
              where: jest.fn(() => ({
                get: jest.fn(() => Promise.resolve(mockChildItems)),
              })),
            };
          }
          if (collection === 'users') {
            return {
              where: jest.fn(() => ({
                get: jest.fn(() => Promise.resolve(mockUsersSnapshot)),
              })),
            };
          }
          return {
            doc: jest.fn(() => ({ set: jest.fn() })),
          };
        });

        mockFirestore.batch.mockReturnValue(mockBatch);

        const request = createRequest({
          itemId: folderId,
          userIds: ['user1'],
          permissions: 'write',
          recursive: true, // Apply to all children
        }, { uid: ownerId });

        const result = await shareVaultItem.run(request);

        expect(result.success).toBe(true);

        // Verify folder permissions updated
        expect(mockFolderRef.update).toHaveBeenCalled();

        // Verify all child items were updated
        expect(mockBatch.update).toHaveBeenCalledTimes(3); // 3 child items
      });

      it('should handle permission downgrade', async () => {
        const ownerId = 'owner-id';
        const itemId = 'vault-item-123';

        // Mock item already shared with write permission
        const mockItemDoc = {
          exists: true,
          data: () => ({
            id: itemId,
            userId: ownerId,
            name: 'Shared Document.pdf',
            type: 'file',
            sharedWith: ['user1'],
            permissions: {
              canRead: [],
              canWrite: ['user1'], // Currently has write
            },
          }),
        };
        const mockItemRef = {
          get: jest.fn(() => Promise.resolve(mockItemDoc)),
          update: jest.fn(() => Promise.resolve()),
        };

        const mockUsersSnapshot = {
          size: 1,
          docs: [
            { id: 'user1', data: () => ({ email: 'user1@example.com' }) },
          ],
        };

        mockFirestore.collection.mockImplementation((collection: string) => {
          if (collection === 'vaultItems') {
            return {
              doc: jest.fn(() => mockItemRef),
            };
          }
          if (collection === 'users') {
            return {
              where: jest.fn(() => ({
                get: jest.fn(() => Promise.resolve(mockUsersSnapshot)),
              })),
            };
          }
          return {
            doc: jest.fn(() => ({ set: jest.fn() })),
          };
        });

        const request = createRequest({
          itemId,
          userIds: ['user1'],
          permissions: 'read', // Downgrade to read-only
        }, { uid: ownerId });

        const result = await shareVaultItem.run(request);

        expect(result.success).toBe(true);

        // Verify permission was downgraded
        expect(mockItemRef.update).toHaveBeenCalledWith(
          expect.objectContaining({
            permissions: {
              canRead: ['user1'], // Now in read
              canWrite: [], // Removed from write
            },
          })
        );
      });
    });

    describe('Family Tree Sharing', () => {
      it('should share with entire family tree', async () => {
        const ownerId = 'owner-id';
        const itemId = 'vault-item-123';
        const familyTreeId = 'family-tree-456';

        // Mock owner with family tree
        const mockOwnerDoc = {
          exists: true,
          data: () => ({
            id: ownerId,
            familyTreeId,
          }),
        };

        // Mock vault item
        const mockItemDoc = {
          exists: true,
          data: () => ({
            id: itemId,
            userId: ownerId,
            name: 'Family Heritage Doc.pdf',
            type: 'file',
            sharedWith: [],
            permissions: {
              canRead: [],
              canWrite: [],
            },
          }),
        };
        const mockItemRef = {
          get: jest.fn(() => Promise.resolve(mockItemDoc)),
          update: jest.fn(() => Promise.resolve()),
        };

        // Mock family members
        const mockFamilyMembers = {
          docs: [
            { id: 'member1', data: () => ({ email: 'member1@example.com' }) },
            { id: 'member2', data: () => ({ email: 'member2@example.com' }) },
            { id: ownerId, data: () => ({ email: 'owner@example.com' }) }, // Owner is also a member
          ],
        };

        const mockBatch = {
          set: jest.fn(),
          commit: jest.fn(() => Promise.resolve()),
        };

        mockFirestore.collection.mockImplementation((collection: string) => {
          if (collection === 'vaultItems') {
            return {
              doc: jest.fn(() => mockItemRef),
            };
          }
          if (collection === 'users') {
            return {
              doc: jest.fn((id: string) => {
                if (id === ownerId) {
                  return { get: jest.fn(() => Promise.resolve(mockOwnerDoc)) };
                }
                return { get: jest.fn() };
              }),
              where: jest.fn(() => ({
                get: jest.fn(() => Promise.resolve(mockFamilyMembers)),
              })),
            };
          }
          return {
            doc: jest.fn(() => ({ set: jest.fn() })),
          };
        });

        mockFirestore.batch.mockReturnValue(mockBatch);

        const request = createRequest({
          itemId,
          shareWithFamily: true, // Share with entire family
          permissions: 'read',
        }, { uid: ownerId });

        const result = await shareVaultItem.run(request);

        expect(result.success).toBe(true);

        // Verify shared with all family members except owner
        expect(mockItemRef.update).toHaveBeenCalledWith(
          expect.objectContaining({
            sharedWith: expect.arrayContaining(['member1', 'member2']),
            permissions: {
              canRead: expect.arrayContaining(['member1', 'member2']),
              canWrite: [],
            },
          })
        );

        // Should not include owner in shared list
        const updateCall = mockItemRef.update.mock.calls[0][0];
        expect(updateCall.sharedWith).not.toContain(ownerId);
      });

      it('should handle user without family tree', async () => {
        const ownerId = 'owner-id';
        const itemId = 'vault-item-123';

        // Mock owner without family tree
        const mockOwnerDoc = {
          exists: true,
          data: () => ({
            id: ownerId,
            // No familyTreeId
          }),
        };

        const mockItemDoc = {
          exists: true,
          data: () => ({
            id: itemId,
            userId: ownerId,
            name: 'Document.pdf',
            type: 'file',
          }),
        };
        const mockItemRef = {
          get: jest.fn(() => Promise.resolve(mockItemDoc)),
        };

        mockFirestore.collection.mockImplementation((collection: string) => {
          if (collection === 'vaultItems') {
            return {
              doc: jest.fn(() => mockItemRef),
            };
          }
          if (collection === 'users') {
            return {
              doc: jest.fn(() => ({
                get: jest.fn(() => Promise.resolve(mockOwnerDoc)),
              })),
            };
          }
          return {
            doc: jest.fn(() => ({ get: jest.fn() })),
          };
        });

        const request = createRequest({
          itemId,
          shareWithFamily: true,
          permissions: 'read',
        }, { uid: ownerId });

        await expect(shareVaultItem.run(request)).rejects.toThrow('not part of a family tree');
      });
    });

    describe('Error Recovery', () => {
      it('should rollback on batch commit failure', async () => {
        const ownerId = 'owner-id';
        const itemId = 'vault-item-123';

        const mockItemDoc = {
          exists: true,
          data: () => ({
            id: itemId,
            userId: ownerId,
            name: 'Document.pdf',
            type: 'file',
            sharedWith: [],
            permissions: {
              canRead: [],
              canWrite: [],
            },
          }),
        };
        const mockItemRef = {
          get: jest.fn(() => Promise.resolve(mockItemDoc)),
          update: jest.fn(() => Promise.resolve()),
        };

        const mockUsersSnapshot = {
          size: 1,
          docs: [
            { id: 'user1', data: () => ({ email: 'user1@example.com' }) },
          ],
        };

        const mockBatch = {
          set: jest.fn(),
          commit: jest.fn(() => Promise.reject(new Error('Batch commit failed'))),
          // Rollback operations
          delete: jest.fn(),
        };

        mockFirestore.collection.mockImplementation((collection: string) => {
          if (collection === 'vaultItems') {
            return {
              doc: jest.fn(() => mockItemRef),
            };
          }
          if (collection === 'users') {
            return {
              where: jest.fn(() => ({
                get: jest.fn(() => Promise.resolve(mockUsersSnapshot)),
              })),
            };
          }
          return {
            doc: jest.fn(() => ({ set: jest.fn() })),
          };
        });

        mockFirestore.batch.mockReturnValue(mockBatch);

        const request = createRequest({
          itemId,
          userIds: ['user1'],
          permissions: 'read',
        }, { uid: ownerId });

        await expect(shareVaultItem.run(request)).rejects.toThrow('Batch commit failed');

        // Item update should have been called before batch failure
        expect(mockItemRef.update).toHaveBeenCalled();
      });

      it('should handle notification send failure gracefully', async () => {
        const ownerId = 'owner-id';
        const itemId = 'vault-item-123';

        const mockItemDoc = {
          exists: true,
          data: () => ({
            id: itemId,
            userId: ownerId,
            name: 'Document.pdf',
            type: 'file',
            sharedWith: [],
            permissions: {
              canRead: [],
              canWrite: [],
            },
          }),
        };
        const mockItemRef = {
          get: jest.fn(() => Promise.resolve(mockItemDoc)),
          update: jest.fn(() => Promise.resolve()),
        };

        // Mock user with FCM token
        const mockUsersSnapshot = {
          size: 1,
          docs: [
            { id: 'user1', data: () => ({ 
              email: 'user1@example.com',
              fcmTokens: ['invalid-token'], // Will cause notification to fail
            }) },
          ],
        };

        const mockBatch = {
          set: jest.fn(),
          commit: jest.fn(() => Promise.resolve()),
        };

        // Mock messaging failure
        mockMessaging.sendMulticast.mockRejectedValueOnce(new Error('Invalid FCM token'));

        mockFirestore.collection.mockImplementation((collection: string) => {
          if (collection === 'vaultItems') {
            return {
              doc: jest.fn(() => mockItemRef),
            };
          }
          if (collection === 'users') {
            return {
              where: jest.fn(() => ({
                get: jest.fn(() => Promise.resolve(mockUsersSnapshot)),
              })),
            };
          }
          return {
            doc: jest.fn(() => ({ set: jest.fn() })),
          };
        });

        mockFirestore.batch.mockReturnValue(mockBatch);

        const request = createRequest({
          itemId,
          userIds: ['user1'],
          permissions: 'read',
        }, { uid: ownerId });

        // Should not throw - notification failure is not fatal
        const result = await shareVaultItem.run(request);
        expect(result.success).toBe(true);

        // Verify sharing still completed
        expect(mockItemRef.update).toHaveBeenCalled();
        expect(mockBatch.commit).toHaveBeenCalled();
      });
    });

    describe('Access Control Edge Cases', () => {
      it('should prevent non-owner from sharing item', async () => {
        const ownerId = 'owner-id';
        const sharerId = 'non-owner-id';
        const itemId = 'vault-item-123';

        const mockItemDoc = {
          exists: true,
          data: () => ({
            id: itemId,
            userId: ownerId, // Different from sharer
            name: 'Private Document.pdf',
            type: 'file',
          }),
        };
        const mockItemRef = {
          get: jest.fn(() => Promise.resolve(mockItemDoc)),
        };

        mockFirestore.collection().doc.mockReturnValue(mockItemRef);

        const request = createRequest({
          itemId,
          userIds: ['user1'],
          permissions: 'read',
        }, { uid: sharerId }); // Not the owner

        // This should be blocked by middleware, but test the function directly
        await expect(shareVaultItem.run(request)).rejects.toThrow();
      });

      it('should handle sharing already shared item', async () => {
        const ownerId = 'owner-id';
        const itemId = 'vault-item-123';

        // Mock item already shared with some users
        const mockItemDoc = {
          exists: true,
          data: () => ({
            id: itemId,
            userId: ownerId,
            name: 'Shared Document.pdf',
            type: 'file',
            sharedWith: ['existing-user-1', 'existing-user-2'],
            permissions: {
              canRead: ['existing-user-1'],
              canWrite: ['existing-user-2'],
            },
          }),
        };
        const mockItemRef = {
          get: jest.fn(() => Promise.resolve(mockItemDoc)),
          update: jest.fn(() => Promise.resolve()),
        };

        // Mock new users to share with
        const mockUsersSnapshot = {
          size: 2,
          docs: [
            { id: 'new-user-1', data: () => ({ email: 'new1@example.com' }) },
            { id: 'existing-user-1', data: () => ({ email: 'existing1@example.com' }) }, // Already shared
          ],
        };

        const mockBatch = {
          set: jest.fn(),
          commit: jest.fn(() => Promise.resolve()),
        };

        mockFirestore.collection.mockImplementation((collection: string) => {
          if (collection === 'vaultItems') {
            return {
              doc: jest.fn(() => mockItemRef),
            };
          }
          if (collection === 'users') {
            return {
              where: jest.fn(() => ({
                get: jest.fn(() => Promise.resolve(mockUsersSnapshot)),
              })),
            };
          }
          return {
            doc: jest.fn(() => ({ set: jest.fn() })),
          };
        });

        mockFirestore.batch.mockReturnValue(mockBatch);

        const request = createRequest({
          itemId,
          userIds: ['new-user-1', 'existing-user-1'],
          permissions: 'write',
        }, { uid: ownerId });

        const result = await shareVaultItem.run(request);

        expect(result.success).toBe(true);

        // Verify permissions were merged correctly
        expect(mockItemRef.update).toHaveBeenCalledWith(
          expect.objectContaining({
            sharedWith: expect.arrayContaining([
              'existing-user-1', 
              'existing-user-2', 
              'new-user-1'
            ]),
            permissions: {
              canRead: [], // existing-user-1 moved from read to write
              canWrite: expect.arrayContaining([
                'existing-user-2', 
                'new-user-1',
                'existing-user-1' // Upgraded to write
              ]),
            },
          })
        );
      });

      it('should validate user IDs exist before sharing', async () => {
        const ownerId = 'owner-id';
        const itemId = 'vault-item-123';

        const mockItemDoc = {
          exists: true,
          data: () => ({
            id: itemId,
            userId: ownerId,
            name: 'Document.pdf',
            type: 'file',
          }),
        };
        const mockItemRef = {
          get: jest.fn(() => Promise.resolve(mockItemDoc)),
        };

        // Mock only 1 user found out of 3 requested
        const mockUsersSnapshot = {
          size: 1, // Only 1 found
          docs: [
            { id: 'user1', data: () => ({ email: 'user1@example.com' }) },
          ],
        };

        mockFirestore.collection.mockImplementation((collection: string) => {
          if (collection === 'vaultItems') {
            return {
              doc: jest.fn(() => mockItemRef),
            };
          }
          if (collection === 'users') {
            return {
              where: jest.fn(() => ({
                get: jest.fn(() => Promise.resolve(mockUsersSnapshot)),
              })),
            };
          }
          return {
            doc: jest.fn(() => ({ set: jest.fn() })),
          };
        });

        const request = createRequest({
          itemId,
          userIds: ['user1', 'non-existent-1', 'non-existent-2'], // 2 don't exist
          permissions: 'read',
        }, { uid: ownerId });

        await expect(shareVaultItem.run(request)).rejects.toThrow('not all users found');
      });
    });
  });
});