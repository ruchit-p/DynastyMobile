import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import * as admin from 'firebase-admin';
import { 
  handleAccountDeletion, 
  updateUserProfile, 
  getFamilyMembers,
  updateDataRetention 
} from '../auth/modules/user-management';
// import { PermissionLevel } from '../middleware';

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
          orderBy: jest.fn(() => ({
            orderBy: jest.fn(() => ({
              get: jest.fn(() => Promise.resolve({ 
                empty: false, 
                docs: [],
                size: 0 
              })),
            })),
            get: jest.fn(() => Promise.resolve({ 
              empty: false, 
              docs: [],
              size: 0 
            })),
          })),
        })),
      })),
      batch: jest.fn(() => ({
        set: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
        commit: jest.fn(() => Promise.resolve()),
      })),
      FieldValue: {
        serverTimestamp: jest.fn(() => mockTimestamp),
      },
      Timestamp: {
        now: jest.fn(() => mockTimestamp),
        fromDate: jest.fn((date) => ({ ...mockTimestamp, toDate: () => date })),
      },
    })),
    auth: jest.fn(() => ({
      getUser: jest.fn(),
      updateUser: jest.fn(() => Promise.resolve()),
      deleteUser: jest.fn(() => Promise.resolve()),
    })),
    storage: jest.fn(() => ({
      bucket: jest.fn(() => ({
        file: jest.fn((path: string) => ({
          delete: jest.fn(() => Promise.resolve()),
        })),
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
    PUBLIC: 'public',
    AUTHENTICATED: 'authenticated',
    PROFILE_OWNER: 'profile_owner',
    ADMIN: 'admin',
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

describe('User Management - Comprehensive Tests', () => {
  let mockAuth: any;
  let mockFirestore: any;
  let mockStorage: any;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.FUNCTIONS_EMULATOR = 'true';
    
    mockAuth = admin.auth() as any;
    mockFirestore = admin.firestore() as any;
    mockStorage = admin.storage() as any;
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('handleAccountDeletion', () => {
    describe('Success Cases', () => {
      it('should delete user account and all associated data', async () => {
        const userId = 'user-to-delete';
        const familyTreeId = 'family-tree-123';

        // Mock user document
        const mockUserDoc = {
          exists: true,
          data: () => ({
            id: userId,
            familyTreeId,
            profilePicture: 'https://example.com/photo.jpg',
            isTreeOwner: false,
          }),
        };
        const mockUserRef = {
          get: jest.fn(() => Promise.resolve(mockUserDoc)),
          delete: jest.fn(),
        };
        
        // Mock batch operations
        const mockBatch = {
          update: jest.fn(),
          delete: jest.fn(),
          commit: jest.fn(() => Promise.resolve()),
          operationCount: 0,
        };

        // Mock family members query
        const mockFamilyMembers = {
          docs: [
            {
              id: userId,
              data: () => ({ status: 'active' }),
            },
            {
              id: 'other-member-id',
              data: () => ({
                parentIds: [userId],
                childrenIds: [],
                spouseIds: [],
              }),
              ref: { update: jest.fn() },
            },
          ],
        };

        // Mock user stories
        const mockUserStories = {
          docs: [
            { id: 'story-1', ref: { delete: jest.fn() } },
            { id: 'story-2', ref: { delete: jest.fn() } },
          ],
        };

        // Mock family tree document
        const mockTreeDoc = {
          exists: true,
          data: () => ({
            memberUserIds: [userId, 'other-member-id'],
            adminUserIds: [userId],
          }),
        };
        const mockTreeRef = {
          get: jest.fn(() => Promise.resolve(mockTreeDoc)),
          update: jest.fn(),
        };

        // Setup mocks
        mockFirestore.collection.mockImplementation((collection: string) => {
          if (collection === 'users') {
            return {
              doc: jest.fn((id: string) => {
                if (id === userId) return mockUserRef;
                return { get: jest.fn(), update: jest.fn() };
              }),
              where: jest.fn(() => ({
                get: jest.fn(() => Promise.resolve(mockFamilyMembers)),
              })),
            };
          }
          if (collection === 'familyTrees') {
            return {
              doc: jest.fn(() => mockTreeRef),
            };
          }
          if (collection === 'stories') {
            return {
              where: jest.fn(() => ({
                get: jest.fn(() => Promise.resolve(mockUserStories)),
              })),
            };
          }
          return {
            doc: jest.fn(() => ({ get: jest.fn(), update: jest.fn() })),
          };
        });

        mockFirestore.batch.mockReturnValue(mockBatch);

        const request = createRequest({
          userId,
        });

        const result = await handleAccountDeletion.run(request);

        expect(result).toEqual({ success: true });

        // Verify profile picture deletion attempted
        expect(mockStorage.bucket().file).toHaveBeenCalledWith(`profile-pictures/${userId}`);

        // Verify user was removed from family tree
        expect(mockTreeRef.update).toHaveBeenCalled();

        // Verify stories were deleted
        expect(mockBatch.delete).toHaveBeenCalledTimes(3); // 2 stories + user doc

        // Verify batch was committed
        expect(mockBatch.commit).toHaveBeenCalled();
      });

      it('should delete entire family tree if user is owner and all members are pending', async () => {
        const userId = 'tree-owner-id';
        const familyTreeId = 'family-tree-123';

        // Mock user as tree owner
        const mockUserDoc = {
          exists: true,
          data: () => ({
            id: userId,
            familyTreeId,
            isTreeOwner: true,
          }),
        };
        const mockUserRef = {
          get: jest.fn(() => Promise.resolve(mockUserDoc)),
          delete: jest.fn(),
        };

        // Mock family members - all pending except owner
        const mockFamilyMembers = {
          docs: [
            {
              id: userId,
              data: () => ({ status: 'active' }),
            },
            {
              id: 'pending-member-1',
              data: () => ({ status: 'pending' }),
              ref: { update: jest.fn() },
            },
            {
              id: 'pending-member-2',
              data: () => ({ status: 'pending' }),
              ref: { update: jest.fn() },
            },
          ],
        };

        // Mock stories associated with family tree
        const mockTreeStories = {
          docs: [
            { id: 'story-1', ref: { delete: jest.fn() } },
            { id: 'story-2', ref: { delete: jest.fn() } },
          ],
        };

        // Mock history book
        const mockHistoryBook = {
          exists: true,
          ref: { delete: jest.fn() },
        };
        const mockHistoryBookRef = {
          get: jest.fn(() => Promise.resolve(mockHistoryBook)),
          delete: jest.fn(),
        };

        // Mock family tree document
        const mockFamilyTree = {
          exists: true,
          ref: { delete: jest.fn() },
        };
        const mockFamilyTreeRef = {
          get: jest.fn(() => Promise.resolve(mockFamilyTree)),
          delete: jest.fn(),
        };

        const mockBatch = {
          update: jest.fn(),
          delete: jest.fn(),
          commit: jest.fn(() => Promise.resolve()),
        };

        mockFirestore.collection.mockImplementation((collection: string) => {
          if (collection === 'users') {
            return {
              doc: jest.fn((id: string) => {
                if (id === userId) return mockUserRef;
                return { get: jest.fn(), update: jest.fn() };
              }),
              where: jest.fn(() => ({
                get: jest.fn(() => Promise.resolve(mockFamilyMembers)),
              })),
            };
          }
          if (collection === 'stories') {
            return {
              where: jest.fn(() => ({
                get: jest.fn(() => Promise.resolve(mockTreeStories)),
              })),
            };
          }
          if (collection === 'historyBooks') {
            return {
              doc: jest.fn(() => mockHistoryBookRef),
            };
          }
          if (collection === 'familyTrees') {
            return {
              doc: jest.fn(() => mockFamilyTreeRef),
            };
          }
          return {
            doc: jest.fn(() => ({ get: jest.fn(), update: jest.fn() })),
          };
        });

        mockFirestore.batch.mockReturnValue(mockBatch);

        const request = createRequest({
          userId,
        });

        const result = await handleAccountDeletion.run(request);

        expect(result).toEqual({ success: true });

        // Verify entire tree and associated data was deleted
        expect(mockBatch.delete).toHaveBeenCalledWith(mockHistoryBook.ref);
        expect(mockBatch.delete).toHaveBeenCalledWith(mockFamilyTree.ref);

        // Verify pending members were updated
        expect(mockBatch.update).toHaveBeenCalledTimes(2); // 2 pending members
      });

      it('should handle user without family tree', async () => {
        const userId = 'solo-user-id';

        const mockUserDoc = {
          exists: true,
          data: () => ({
            id: userId,
            // No familyTreeId
          }),
        };
        const mockUserRef = {
          get: jest.fn(() => Promise.resolve(mockUserDoc)),
          delete: jest.fn(),
        };

        const mockBatch = {
          delete: jest.fn(),
          commit: jest.fn(() => Promise.resolve()),
        };

        mockFirestore.collection.mockImplementation((collection: string) => {
          if (collection === 'users') {
            return {
              doc: jest.fn(() => mockUserRef),
            };
          }
          if (collection === 'stories') {
            return {
              where: jest.fn(() => ({
                get: jest.fn(() => Promise.resolve({ docs: [] })),
              })),
            };
          }
          return {
            doc: jest.fn(() => ({ get: jest.fn() })),
          };
        });

        mockFirestore.batch.mockReturnValue(mockBatch);

        const request = createRequest({
          userId,
        });

        const result = await handleAccountDeletion.run(request);

        expect(result).toEqual({ success: true });
        expect(mockBatch.delete).toHaveBeenCalledWith(mockUserRef);
        expect(mockBatch.commit).toHaveBeenCalled();
      });
    });

    describe('Error Cases', () => {
      it('should throw error if user not found', async () => {
        const mockUserRef = {
          get: jest.fn(() => Promise.resolve({ exists: false })),
        };

        mockFirestore.collection().doc.mockReturnValue(mockUserRef);

        const request = createRequest({
          userId: 'non-existent-user',
        });

        await expect(handleAccountDeletion.run(request)).rejects.toThrow('not found');
      });

      it('should handle storage deletion failure gracefully', async () => {
        const userId = 'user-with-photo';

        const mockUserDoc = {
          exists: true,
          data: () => ({
            id: userId,
            profilePicture: 'https://example.com/photo.jpg',
          }),
        };
        const mockUserRef = {
          get: jest.fn(() => Promise.resolve(mockUserDoc)),
          delete: jest.fn(),
        };

        // Mock storage deletion failure
        mockStorage.bucket().file.mockReturnValue({
          delete: jest.fn(() => Promise.reject(new Error('Storage error'))),
        });

        const mockBatch = {
          delete: jest.fn(),
          commit: jest.fn(() => Promise.resolve()),
        };

        mockFirestore.collection.mockImplementation((collection: string) => {
          if (collection === 'users') {
            return {
              doc: jest.fn(() => mockUserRef),
            };
          }
          if (collection === 'stories') {
            return {
              where: jest.fn(() => ({
                get: jest.fn(() => Promise.resolve({ docs: [] })),
              })),
            };
          }
          return {
            doc: jest.fn(() => ({ get: jest.fn() })),
          };
        });

        mockFirestore.batch.mockReturnValue(mockBatch);

        const request = createRequest({
          userId,
        });

        // Should not throw - storage deletion failure is logged but not fatal
        const result = await handleAccountDeletion.run(request);
        expect(result).toEqual({ success: true });
      });
    });
  });

  describe('updateUserProfile', () => {
    describe('Success Cases', () => {
      it('should update user profile in both Auth and Firestore', async () => {
        const userId = 'test-user-id';
        const mockUserRef = {
          update: jest.fn(() => Promise.resolve()),
        };

        mockFirestore.collection().doc.mockReturnValue(mockUserRef);

        const request = createRequest({
          uid: userId,
          displayName: 'New Name',
          firstName: 'New',
          lastName: 'Name',
          phoneNumber: '+1234567890',
          dateOfBirth: '1990-01-01',
          gender: 'male',
          profilePicture: 'https://example.com/new-photo.jpg',
        });

        const result = await updateUserProfile.run(request);

        expect(result).toEqual({
          success: true,
          message: 'Profile updated successfully.',
        });

        // Verify Auth update
        expect(mockAuth.updateUser).toHaveBeenCalledWith(userId, {
          displayName: 'New Name',
          phoneNumber: '+1234567890',
          photoURL: undefined, // photoURL not provided
        });

        // Verify Firestore update
        expect(mockUserRef.update).toHaveBeenCalledWith(
          expect.objectContaining({
            displayName: 'New Name',
            firstName: 'New',
            lastName: 'Name',
            phoneNumber: '+1234567890',
            gender: 'male',
            profilePicture: { url: 'https://example.com/new-photo.jpg', path: '' },
            updatedAt: expect.any(Object),
          })
        );
      });

      it('should handle partial updates', async () => {
        const userId = 'test-user-id';
        const mockUserRef = {
          update: jest.fn(() => Promise.resolve()),
        };

        mockFirestore.collection().doc.mockReturnValue(mockUserRef);

        const request = createRequest({
          uid: userId,
          displayName: 'Updated Name Only',
          // Other fields not provided
        });

        const result = await updateUserProfile.run(request);

        expect(result.success).toBe(true);

        // Should only update provided fields
        expect(mockAuth.updateUser).toHaveBeenCalledWith(userId, {
          displayName: 'Updated Name Only',
        });

        expect(mockUserRef.update).toHaveBeenCalledWith(
          expect.objectContaining({
            displayName: 'Updated Name Only',
            updatedAt: expect.any(Object),
          })
        );

        // Should not include undefined fields
        const updateCall = mockUserRef.update.mock.calls[0][0];
        expect(updateCall).not.toHaveProperty('firstName');
        expect(updateCall).not.toHaveProperty('lastName');
      });

      it('should handle photoURL field and convert to profilePicture', async () => {
        const userId = 'test-user-id';
        const mockUserRef = {
          update: jest.fn(() => Promise.resolve()),
        };

        mockFirestore.collection().doc.mockReturnValue(mockUserRef);

        const request = createRequest({
          uid: userId,
          photoURL: 'https://example.com/photo.jpg',
        });

        const result = await updateUserProfile.run(request);

        expect(result.success).toBe(true);

        // Should update Auth with photoURL
        expect(mockAuth.updateUser).toHaveBeenCalledWith(userId, {
          photoURL: 'https://example.com/photo.jpg',
        });

        // Should convert photoURL to profilePicture object in Firestore
        expect(mockUserRef.update).toHaveBeenCalledWith(
          expect.objectContaining({
            profilePicture: { url: 'https://example.com/photo.jpg', path: '' },
          })
        );
      });

      it('should update data retention settings', async () => {
        const userId = 'test-user-id';
        const mockUserRef = {
          update: jest.fn(() => Promise.resolve()),
        };

        mockFirestore.collection().doc.mockReturnValue(mockUserRef);

        const request = createRequest({
          uid: userId,
          dataRetentionPeriod: 'forever',
        });

        const result = await updateUserProfile.run(request);

        expect(result.success).toBe(true);

        expect(mockUserRef.update).toHaveBeenCalledWith(
          expect.objectContaining({
            dataRetentionPeriod: 'forever',
            dataRetentionLastUpdated: expect.any(Object),
          })
        );
      });
    });

    describe('Error Cases', () => {
      it('should handle Auth update failure', async () => {
        const userId = 'test-user-id';
        
        mockAuth.updateUser.mockRejectedValueOnce(new Error('Auth error'));

        const request = createRequest({
          uid: userId,
          displayName: 'New Name',
        });

        await expect(updateUserProfile.run(request)).rejects.toThrow('Failed to update profile');
      });

      it('should handle Firestore update failure', async () => {
        const userId = 'test-user-id';
        const mockUserRef = {
          update: jest.fn(() => Promise.reject(new Error('Firestore error'))),
        };

        mockFirestore.collection().doc.mockReturnValue(mockUserRef);

        const request = createRequest({
          uid: userId,
          firstName: 'New',
        });

        await expect(updateUserProfile.run(request)).rejects.toThrow('Failed to update profile');
      });
    });
  });

  describe('getFamilyMembers', () => {
    describe('Success Cases', () => {
      it('should retrieve all family members', async () => {
        const familyTreeId = 'family-tree-123';
        
        const mockMembers = [
          {
            id: 'member-1',
            data: () => ({
              displayName: 'John Doe',
              firstName: 'John',
              lastName: 'Doe',
              email: 'john@example.com',
              profilePicture: { url: 'https://example.com/john.jpg' },
              gender: 'male',
            }),
          },
          {
            id: 'member-2',
            data: () => ({
              displayName: 'Jane Doe',
              firstName: 'Jane',
              lastName: 'Doe',
              email: 'jane@example.com',
              profilePicture: { url: 'https://example.com/jane.jpg' },
              gender: 'female',
            }),
          },
        ];

        const mockSnapshot = {
          empty: false,
          docs: mockMembers,
        };

        mockFirestore.collection().where().orderBy().orderBy().get.mockResolvedValueOnce(mockSnapshot);

        const request = createRequest({
          familyTreeId,
        });

        const result = await getFamilyMembers.run(request);

        expect(result).toEqual({
          familyMembers: [
            {
              id: 'member-1',
              displayName: 'John Doe',
              firstName: 'John',
              lastName: 'Doe',
              email: 'john@example.com',
              profilePictureUrl: 'https://example.com/john.jpg',
              gender: 'male',
            },
            {
              id: 'member-2',
              displayName: 'Jane Doe',
              firstName: 'Jane',
              lastName: 'Doe',
              email: 'jane@example.com',
              profilePictureUrl: 'https://example.com/jane.jpg',
              gender: 'female',
            },
          ],
        });
      });

      it('should handle empty family tree', async () => {
        const familyTreeId = 'empty-tree';
        
        mockFirestore.collection().where().orderBy().orderBy().get.mockResolvedValueOnce({
          empty: true,
          docs: [],
        });

        const request = createRequest({
          familyTreeId,
        });

        const result = await getFamilyMembers.run(request);

        expect(result).toEqual({
          familyMembers: [],
          message: 'No members found in this family tree.',
        });
      });

      it('should handle members without profile pictures', async () => {
        const familyTreeId = 'family-tree-123';
        
        const mockMembers = [
          {
            id: 'member-1',
            data: () => ({
              displayName: 'John Doe',
              firstName: 'John',
              lastName: 'Doe',
              email: 'john@example.com',
              // No profilePicture
              gender: 'male',
            }),
          },
        ];

        mockFirestore.collection().where().orderBy().orderBy().get.mockResolvedValueOnce({
          empty: false,
          docs: mockMembers,
        });

        const request = createRequest({
          familyTreeId,
        });

        const result = await getFamilyMembers.run(request);

        expect(result.familyMembers[0]).toEqual({
          id: 'member-1',
          displayName: 'John Doe',
          firstName: 'John',
          lastName: 'Doe',
          email: 'john@example.com',
          profilePictureUrl: undefined,
          gender: 'male',
        });
      });
    });
  });

  describe('updateDataRetention', () => {
    describe('Success Cases', () => {
      it('should update data retention settings', async () => {
        const userId = 'test-user-id';
        
        const mockUserDoc = {
          exists: true,
          data: () => ({
            id: userId,
            dataRetentionPeriod: '1year',
          }),
        };
        const mockUserRef = {
          get: jest.fn(() => Promise.resolve(mockUserDoc)),
          update: jest.fn(() => Promise.resolve()),
        };

        mockFirestore.collection().doc.mockReturnValue(mockUserRef);

        const request = createRequest({
          userId,
          retentionPeriod: 'forever',
        });

        const result = await updateDataRetention.run(request);

        expect(result).toEqual({ success: true });

        expect(mockUserRef.update).toHaveBeenCalledWith({
          dataRetentionPeriod: 'forever',
          dataRetentionLastUpdated: expect.any(Date),
          updatedAt: expect.any(Date),
        });
      });
    });

    describe('Error Cases', () => {
      it('should throw error if user not found', async () => {
        const mockUserRef = {
          get: jest.fn(() => Promise.resolve({ exists: false })),
        };

        mockFirestore.collection().doc.mockReturnValue(mockUserRef);

        const request = createRequest({
          userId: 'non-existent',
          retentionPeriod: 'forever',
        });

        await expect(updateDataRetention.run(request)).rejects.toThrow('User not found');
      });
    });
  });
});