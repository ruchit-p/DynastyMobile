/**
 * Comprehensive tests for Family Tree Service
 * Tests family relationships, member management, permissions, and performance optimizations
 */

import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { getFirestore, FieldValue, Timestamp } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions/v2';
import * as familyTreeModule from '../../familyTree';
import { createError, ErrorCode } from '../../utils/errors';
import { withAuth, withResourceAccess, PermissionLevel, RateLimitType } from '../../middleware';
import { FRONTEND_URL } from '../../auth/config/secrets';
import { sendEmailUniversal } from '../../auth/config/emailConfig';
import { validateRequest } from '../../utils/request-validator';
import { VALIDATION_SCHEMAS } from '../../config/validation-schemas';

// Mock dependencies
jest.mock('firebase-admin/firestore');
jest.mock('../../middleware');
jest.mock('../../auth/config/secrets');
jest.mock('../../auth/config/emailConfig');
jest.mock('../../utils/request-validator');
jest.mock('firebase-functions/v2', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
  },
}));

// Mock crypto for token generation
jest.mock('crypto', () => ({
  randomBytes: jest.fn(() => ({
    toString: jest.fn(() => 'mock-secure-token-123'),
  })),
  createHash: jest.fn(() => ({
    update: jest.fn(() => ({
      digest: jest.fn(() => 'mock-hashed-token-123'),
    })),
  })),
}));

// Mock HttpsError
jest.mock('firebase-functions/v2/https', () => ({
  HttpsError: class HttpsError extends Error {
    constructor(public code: string, message: string, public details?: any) {
      super(message);
      this.name = 'HttpsError';
    }
  },
  onCall: jest.fn((options: any, handler: any) => {
    // Return the handler function directly for testing
    return typeof options === 'function' ? options : handler;
  }),
}));

// Mock Firestore
const mockFirestore = {
  collection: jest.fn(),
  batch: jest.fn(),
};

const mockCollection = {
  doc: jest.fn(),
  where: jest.fn(),
  select: jest.fn(),
  orderBy: jest.fn(),
  get: jest.fn(),
};

const mockDoc = {
  id: 'test-doc-id',
  get: jest.fn(),
  set: jest.fn(),
  update: jest.fn(),
  delete: jest.fn(),
  ref: {},
};

const mockQuery = {
  get: jest.fn(),
  empty: false,
  docs: [],
};

const mockBatch = {
  set: jest.fn(),
  update: jest.fn(),
  delete: jest.fn(),
  commit: jest.fn(),
};

// Setup mocks
(getFirestore as jest.Mock).mockReturnValue(mockFirestore);
(FieldValue as any) = {
  arrayUnion: jest.fn((...values) => ({ arrayUnion: values })),
  arrayRemove: jest.fn((...values) => ({ arrayRemove: values })),
  serverTimestamp: jest.fn(() => ({ serverTimestamp: true })),
};
(Timestamp as any) = {
  now: jest.fn(() => ({ _seconds: Date.now() / 1000, toDate: () => new Date() })),
  fromDate: jest.fn((date) => ({ _seconds: date.getTime() / 1000, toDate: () => date })),
};

mockFirestore.collection.mockReturnValue(mockCollection);
mockFirestore.batch.mockReturnValue(mockBatch);
mockCollection.doc.mockReturnValue(mockDoc);
mockCollection.where.mockReturnValue(mockCollection);
mockCollection.select.mockReturnValue(mockCollection);
mockCollection.orderBy.mockReturnValue(mockCollection);
mockCollection.get.mockResolvedValue(mockQuery);
mockDoc.ref = mockDoc;

describe('Family Tree Service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    
    // Setup default mocks
    mockDoc.get.mockResolvedValue({
      exists: true,
      data: () => ({}),
    });
    
    mockDoc.set.mockResolvedValue(undefined);
    mockDoc.update.mockResolvedValue(undefined);
    mockDoc.delete.mockResolvedValue(undefined);
    mockBatch.commit.mockResolvedValue(undefined);
    
    // Mock validation
    (validateRequest as jest.Mock).mockImplementation((data) => data);
    
    // Mock auth wrapper
    (withAuth as jest.Mock).mockImplementation((handler) => handler);
    (withResourceAccess as jest.Mock).mockImplementation((handler) => handler);
    
    // Mock FRONTEND_URL
    (FRONTEND_URL.value as jest.Mock).mockReturnValue('https://app.dynasty.com');
  });

  // Helper functions
  const createMockUser = (id: string, overrides?: any) => ({
    id,
    exists: true,
    data: () => ({
      id,
      displayName: `User ${id}`,
      firstName: `First${id}`,
      lastName: `Last${id}`,
      email: `user${id}@example.com`,
      parentIds: [],
      childrenIds: [],
      spouseIds: [],
      familyTreeId: 'tree_123',
      gender: 'other',
      ...overrides,
    }),
  });

  const createMockFamilyTree = (overrides?: any) => ({
    id: 'tree_123',
    ownerUserId: 'owner_123',
    memberUserIds: ['owner_123', 'member_1', 'member_2'],
    adminUserIds: ['owner_123', 'admin_1'],
    treeName: 'Test Family Tree',
    memberCount: 3,
    createdAt: Timestamp.now(),
    updatedAt: Timestamp.now(),
    isPrivate: true,
    ...overrides,
  });

  describe('getFamilyTreeData', () => {
    it('should fetch and transform family tree data with relationships', async () => {
      const userId = 'user_123';
      const familyTreeId = 'tree_123';

      // Mock user with family tree
      mockDoc.get.mockResolvedValueOnce({
        exists: true,
        data: () => ({ familyTreeId }),
      });

      // Mock family tree document
      mockDoc.get.mockResolvedValueOnce({
        exists: true,
        data: () => createMockFamilyTree(),
      });

      // Mock family members with relationships
      const familyMembers = [
        createMockUser('user_123', { 
          parentIds: ['parent_1'], 
          childrenIds: ['child_1'],
          spouseIds: ['spouse_1'],
        }),
        createMockUser('parent_1', { 
          childrenIds: ['user_123', 'sibling_1'],
        }),
        createMockUser('child_1', { 
          parentIds: ['user_123', 'spouse_1'],
        }),
        createMockUser('spouse_1', { 
          spouseIds: ['user_123'],
          childrenIds: ['child_1'],
        }),
        createMockUser('sibling_1', { 
          parentIds: ['parent_1'],
        }),
      ];

      mockQuery.docs = familyMembers;

      const request = {
        auth: { uid: userId },
        data: { userId },
      };

      const result = await familyTreeModule.getFamilyTreeData(request as any);

      expect(result.treeNodes).toHaveLength(5);
      
      // Verify user node
      const userNode = result.treeNodes.find((n: any) => n.id === 'user_123');
      expect(userNode).toMatchObject({
        id: 'user_123',
        gender: 'other',
        parents: [{ id: 'parent_1', type: 'blood' }],
        children: [{ id: 'child_1', type: 'blood' }],
        siblings: [{ id: 'sibling_1', type: 'blood' }],
        spouses: [{ id: 'spouse_1', type: 'married' }],
        attributes: expect.objectContaining({
          displayName: 'User user_123',
          isBloodRelated: true,
        }),
      });

      // Verify sibling detection
      const siblingNode = result.treeNodes.find((n: any) => n.id === 'sibling_1');
      expect(siblingNode.siblings).toContainEqual({ id: 'user_123', type: 'blood' });
    });

    it('should compute blood relations correctly using BFS', async () => {
      const userId = 'user_123';
      
      // Create a more complex family tree for testing blood relations
      const familyMembers = [
        createMockUser('user_123', { parentIds: ['parent_1'] }),
        createMockUser('parent_1', { 
          parentIds: ['grandparent_1'], 
          childrenIds: ['user_123'] 
        }),
        createMockUser('grandparent_1', { 
          childrenIds: ['parent_1', 'uncle_1'] 
        }),
        createMockUser('uncle_1', { 
          parentIds: ['grandparent_1'],
          childrenIds: ['cousin_1'] 
        }),
        createMockUser('cousin_1', { parentIds: ['uncle_1'] }),
        createMockUser('spouse_1', { 
          spouseIds: ['user_123'] // Not blood related
        }),
      ];

      mockDoc.get.mockResolvedValueOnce({
        exists: true,
        data: () => ({ familyTreeId: 'tree_123' }),
      });

      mockDoc.get.mockResolvedValueOnce({
        exists: true,
        data: () => createMockFamilyTree(),
      });

      mockQuery.docs = familyMembers;

      const request = {
        auth: { uid: userId },
        data: { userId },
      };

      const result = await familyTreeModule.getFamilyTreeData(request as any);

      // Check blood relations
      const bloodRelatedIds = ['user_123', 'parent_1', 'grandparent_1', 'uncle_1', 'cousin_1'];
      const nonBloodRelatedIds = ['spouse_1'];

      bloodRelatedIds.forEach(id => {
        const node = result.treeNodes.find((n: any) => n.id === id);
        expect(node.attributes.isBloodRelated).toBe(true);
      });

      nonBloodRelatedIds.forEach(id => {
        const node = result.treeNodes.find((n: any) => n.id === id);
        expect(node.attributes.isBloodRelated).toBe(false);
      });
    });

    it('should handle missing family tree gracefully', async () => {
      mockDoc.get.mockResolvedValueOnce({
        exists: true,
        data: () => ({ familyTreeId: null }),
      });

      const request = {
        auth: { uid: 'user_123' },
        data: { userId: 'user_123' },
      };

      await expect(familyTreeModule.getFamilyTreeData(request as any))
        .rejects.toMatchObject({
          code: ErrorCode.NOT_FOUND,
          message: 'No family tree found for this user',
        });
    });

    it('should enforce maximum traversal depth for blood relations', async () => {
      // Create a deep family tree that would exceed max depth
      const deepFamily = [];
      for (let i = 0; i < 15; i++) {
        deepFamily.push(createMockUser(`user_${i}`, {
          parentIds: i > 0 ? [`user_${i - 1}`] : [],
          childrenIds: i < 14 ? [`user_${i + 1}`] : [],
        }));
      }

      mockDoc.get.mockResolvedValueOnce({
        exists: true,
        data: () => ({ familyTreeId: 'tree_123' }),
      });

      mockDoc.get.mockResolvedValueOnce({
        exists: true,
        data: () => createMockFamilyTree(),
      });

      mockQuery.docs = deepFamily;

      const request = {
        auth: { uid: 'user_7' }, // Start from middle
        data: { userId: 'user_7' },
      };

      const result = await familyTreeModule.getFamilyTreeData(request as any);

      // Should still complete without errors
      expect(result.treeNodes).toBeDefined();
      expect(logger.warn).toHaveBeenCalledWith(
        expect.stringContaining('Max blood relation depth')
      );
    });
  });

  describe('updateFamilyRelationships', () => {
    it('should update parent relationships', async () => {
      const userId = 'user_123';
      const updates = {
        addParents: ['parent_1', 'parent_2'],
        removeParents: ['old_parent'],
      };

      const request = {
        auth: { uid: 'admin_123' },
        data: { userId, updates },
      };

      const resource = {
        parentIds: ['old_parent', 'existing_parent'],
        childrenIds: [],
        spouseIds: [],
      };

      await familyTreeModule.updateFamilyRelationships(request as any, resource);

      expect(mockBatch.update).toHaveBeenCalledWith(
        expect.any(Object),
        {
          parentIds: expect.arrayContaining(['existing_parent', 'parent_1', 'parent_2']),
        }
      );
      expect(mockBatch.commit).toHaveBeenCalled();
    });

    it('should update multiple relationship types atomically', async () => {
      const updates = {
        addParents: ['parent_1'],
        addChildren: ['child_1', 'child_2'],
        removeSpouses: ['ex_spouse'],
      };

      const request = {
        auth: { uid: 'admin_123' },
        data: { userId: 'user_123', updates },
      };

      const resource = {
        parentIds: [],
        childrenIds: ['existing_child'],
        spouseIds: ['ex_spouse', 'current_spouse'],
      };

      await familyTreeModule.updateFamilyRelationships(request as any, resource);

      expect(mockBatch.update).toHaveBeenCalledWith(
        expect.any(Object),
        expect.objectContaining({
          parentIds: ['parent_1'],
          childrenIds: ['existing_child', 'child_1', 'child_2'],
          spouseIds: ['current_spouse'],
        })
      );
    });
  });

  describe('createFamilyMember', () => {
    it('should create a child with proper relationships', async () => {
      const selectedNodeId = 'parent_123';
      const userData = {
        firstName: 'New',
        lastName: 'Child',
        email: 'newchild@example.com',
        familyTreeId: 'tree_123',
        gender: 'female',
      };

      const request = {
        auth: { uid: 'admin_123' },
        data: {
          userData,
          relationType: 'child',
          selectedNodeId,
          options: { connectToSpouse: true },
        },
      };

      const selectedNode = {
        spouseIds: ['spouse_123'],
        childrenIds: ['existing_child'],
      };

      // Mock tree document
      mockDoc.get.mockResolvedValueOnce({
        exists: true,
        data: () => createMockFamilyTree(),
      });

      // Mock current user
      mockDoc.get.mockResolvedValueOnce({
        exists: true,
        data: () => ({ displayName: 'Admin User' }),
      });

      (sendEmailUniversal as jest.Mock).mockResolvedValue(undefined);

      await familyTreeModule.createFamilyMember(request as any, selectedNode);

      // Verify new member document
      expect(mockBatch.set).toHaveBeenCalledWith(
        expect.any(Object),
        expect.objectContaining({
          firstName: 'New',
          lastName: 'Child',
          parentIds: ['parent_123', 'spouse_123'], // Connected to both parents
          childrenIds: [],
          spouseIds: [],
          isPendingSignUp: true, // Has email
        })
      );

      // Verify parent relationships updated
      expect(mockBatch.update).toHaveBeenCalledWith(
        expect.any(Object),
        expect.objectContaining({
          childrenIds: { arrayUnion: [expect.any(String)] },
        })
      );

      // Verify invitation email sent
      expect(sendEmailUniversal).toHaveBeenCalledWith(
        expect.objectContaining({
          to: 'newchild@example.com',
          templateType: 'invite',
          dynamicTemplateData: expect.objectContaining({
            inviterName: 'Admin User',
            familyTreeName: 'Test Family Tree',
          }),
        })
      );
    });

    it('should create a parent with spouse connection', async () => {
      const selectedNodeId = 'child_123';
      const userData = {
        firstName: 'New',
        lastName: 'Parent',
        familyTreeId: 'tree_123',
      };

      const request = {
        auth: { uid: 'admin_123' },
        data: {
          userData,
          relationType: 'parent',
          selectedNodeId,
          options: { connectToExistingParent: true },
        },
      };

      const selectedNode = {
        parentIds: ['existing_parent_123'],
        childrenIds: [],
      };

      // Mock tree and user documents
      mockDoc.get.mockResolvedValueOnce({
        exists: true,
        data: () => createMockFamilyTree(),
      });
      mockDoc.get.mockResolvedValueOnce({
        exists: true,
        data: () => ({ displayName: 'Admin' }),
      });

      await familyTreeModule.createFamilyMember(request as any, selectedNode);

      // Verify new parent is connected as spouse to existing parent
      expect(mockBatch.set).toHaveBeenCalledWith(
        expect.any(Object),
        expect.objectContaining({
          childrenIds: ['child_123'],
          spouseIds: ['existing_parent_123'],
          isPendingSignUp: false, // No email
        })
      );

      // Verify existing parent gets new spouse
      expect(mockBatch.update).toHaveBeenCalledWith(
        expect.any(Object),
        expect.objectContaining({
          spouseIds: { arrayUnion: [expect.any(String)] },
        })
      );
    });

    it('should create a spouse with children connections', async () => {
      const selectedNodeId = 'spouse_target';
      const request = {
        auth: { uid: 'admin_123' },
        data: {
          userData: {
            firstName: 'New',
            lastName: 'Spouse',
            familyTreeId: 'tree_123',
          },
          relationType: 'spouse',
          selectedNodeId,
          options: { connectToChildren: true },
        },
      };

      const selectedNode = {
        spouseIds: [],
        childrenIds: ['child_1', 'child_2'],
      };

      mockDoc.get.mockResolvedValueOnce({
        exists: true,
        data: () => createMockFamilyTree(),
      });
      mockDoc.get.mockResolvedValueOnce({
        exists: true,
        data: () => ({ displayName: 'Admin' }),
      });

      await familyTreeModule.createFamilyMember(request as any, selectedNode);

      // Verify spouse is connected to children
      expect(mockBatch.set).toHaveBeenCalledWith(
        expect.any(Object),
        expect.objectContaining({
          spouseIds: ['spouse_target'],
          childrenIds: ['child_1', 'child_2'],
        })
      );

      // Verify children get new parent
      expect(mockBatch.update).toHaveBeenCalledTimes(4); // selectedNode + tree + 2 children
    });

    it('should handle email invitation errors gracefully', async () => {
      const request = {
        auth: { uid: 'admin_123' },
        data: {
          userData: {
            firstName: 'Test',
            lastName: 'User',
            email: 'test@example.com',
            familyTreeId: 'tree_123',
          },
          relationType: 'child',
          selectedNodeId: 'parent_123',
          options: {},
        },
      };

      mockDoc.get.mockResolvedValueOnce({
        exists: true,
        data: () => createMockFamilyTree(),
      });
      mockDoc.get.mockResolvedValueOnce({
        exists: true,
        data: () => ({ displayName: 'Admin' }),
      });

      (sendEmailUniversal as jest.Mock).mockRejectedValue(new Error('Email service error'));

      // Should not throw even if email fails
      await expect(familyTreeModule.createFamilyMember(request as any, {}))
        .resolves.toMatchObject({ success: true });

      expect(logger.error).toHaveBeenCalledWith(
        'Error sending invitation email:',
        expect.any(Error)
      );
    });
  });

  describe('deleteFamilyMember', () => {
    it('should delete a leaf member with no children', async () => {
      const memberId = 'leaf_member';
      const familyTreeId = 'tree_123';

      const request = {
        auth: { uid: 'owner_123' },
        data: { memberId, familyTreeId },
      };

      const member = {
        parentIds: ['parent_1'],
        childrenIds: [],
        spouseIds: ['spouse_1'],
      };

      const treeDoc = {
        exists: true,
        data: () => createMockFamilyTree(),
      };

      mockDoc.get.mockResolvedValueOnce(treeDoc); // Tree document
      mockQuery.docs = [createMockUser('owner_123')]; // Updated tree members

      await familyTreeModule.deleteFamilyMember(request as any, member);

      // Verify relationships were cleaned up
      expect(mockBatch.update).toHaveBeenCalledWith(
        expect.any(Object),
        expect.objectContaining({
          childrenIds: { arrayRemove: ['leaf_member'] },
        })
      );

      expect(mockBatch.update).toHaveBeenCalledWith(
        expect.any(Object),
        expect.objectContaining({
          spouseIds: { arrayRemove: ['leaf_member'] },
        })
      );

      // Verify member was deleted
      expect(mockBatch.delete).toHaveBeenCalled();

      // Verify tree was updated
      expect(mockBatch.update).toHaveBeenCalledWith(
        expect.any(Object),
        expect.objectContaining({
          memberUserIds: { arrayRemove: ['leaf_member'] },
          adminUserIds: { arrayRemove: ['leaf_member'] },
        })
      );
    });

    it('should allow deleting member with shared children only', async () => {
      const memberId = 'parent_with_shared_children';
      const spouseId = 'spouse_123';

      const request = {
        auth: { uid: 'owner_123' },
        data: { memberId, familyTreeId: 'tree_123' },
      };

      const member = {
        parentIds: [],
        childrenIds: ['child_1', 'child_2'],
        spouseIds: [spouseId],
      };

      // Mock spouse with same children
      mockDoc.get.mockResolvedValueOnce({
        exists: true,
        data: () => createMockFamilyTree(),
      });

      mockDoc.get.mockResolvedValueOnce({
        exists: true,
        data: () => ({
          childrenIds: ['child_1', 'child_2'], // Same children
          spouseIds: [memberId],
        }),
      });

      mockQuery.docs = [createMockUser('owner_123')];

      await familyTreeModule.deleteFamilyMember(request as any, member);

      expect(mockBatch.delete).toHaveBeenCalled();
    });

    it('should reject deleting member with individual children', async () => {
      const memberId = 'parent_with_children';

      const request = {
        auth: { uid: 'owner_123' },
        data: { memberId, familyTreeId: 'tree_123' },
      };

      const member = {
        parentIds: [],
        childrenIds: ['child_1', 'child_2'],
        spouseIds: ['spouse_123'],
      };

      mockDoc.get.mockResolvedValueOnce({
        exists: true,
        data: () => createMockFamilyTree(),
      });

      // Mock spouse with different children
      mockDoc.get.mockResolvedValueOnce({
        exists: true,
        data: () => ({
          childrenIds: ['child_3'], // Different children
          spouseIds: [memberId],
        }),
      });

      await expect(familyTreeModule.deleteFamilyMember(request as any, member))
        .rejects.toMatchObject({
          code: ErrorCode.ABORTED,
          message: expect.stringContaining('individual children'),
        });
    });

    it('should reject deleting active members without tree owner permission', async () => {
      const memberId = 'active_member';

      const request = {
        auth: { uid: 'admin_1' }, // Admin, not owner
        data: { memberId, familyTreeId: 'tree_123' },
      };

      const member = {
        status: 'active',
        treeOwnerId: 'owner_123',
        childrenIds: [],
      };

      mockDoc.get.mockResolvedValueOnce({
        exists: true,
        data: () => createMockFamilyTree(),
      });

      await expect(familyTreeModule.deleteFamilyMember(request as any, member))
        .rejects.toMatchObject({
          code: ErrorCode.PERMISSION_DENIED,
          message: expect.stringContaining('Only the tree owner can remove members with active accounts'),
        });
    });

    it('should return updated tree nodes after deletion', async () => {
      const memberId = 'member_to_delete';
      const request = {
        auth: { uid: 'owner_123' },
        data: { memberId, familyTreeId: 'tree_123' },
      };

      const member = { childrenIds: [], parentIds: [], spouseIds: [] };

      mockDoc.get.mockResolvedValueOnce({
        exists: true,
        data: () => createMockFamilyTree(),
      });

      // Return remaining members after deletion
      mockQuery.docs = [
        createMockUser('owner_123'),
        createMockUser('member_1'),
      ];

      const result = await familyTreeModule.deleteFamilyMember(request as any, member);

      expect(result.success).toBe(true);
      expect(result.treeNodes).toHaveLength(2);
      expect(result.rootNode).toBe('owner_123');
    });
  });

  describe('updateFamilyMember', () => {
    it('should update member information', async () => {
      const memberId = 'member_123';
      const updatedData = {
        firstName: 'Updated',
        lastName: 'Name',
        gender: 'male',
        familyTreeId: 'tree_123',
      };

      const request = {
        auth: { uid: 'admin_123' },
        data: { memberId, updatedData },
      };

      const member = {
        firstName: 'Old',
        lastName: 'Name',
        email: 'existing@example.com',
      };

      mockDoc.get.mockResolvedValueOnce({
        exists: true,
        data: () => createMockFamilyTree(),
      });

      await familyTreeModule.updateFamilyMember(request as any, member);

      expect(mockBatch.update).toHaveBeenCalledWith(
        expect.any(Object),
        expect.objectContaining({
          firstName: 'Updated',
          lastName: 'Name',
          displayName: 'Updated Name',
          gender: 'male',
          lastUpdatedBy: 'admin_123',
        })
      );
    });

    it('should send invitation when email is added', async () => {
      const memberId = 'member_without_email';
      const updatedData = {
        email: 'newemail@example.com',
        familyTreeId: 'tree_123',
      };

      const request = {
        auth: { uid: 'admin_123' },
        data: { memberId, updatedData },
      };

      const member = {
        firstName: 'Test',
        lastName: 'User',
        email: null, // No email previously
      };

      mockDoc.get.mockResolvedValueOnce({
        exists: true,
        data: () => createMockFamilyTree(),
      });

      mockDoc.get.mockResolvedValueOnce({
        exists: true,
        data: () => ({ displayName: 'Admin User' }),
      });

      (sendEmailUniversal as jest.Mock).mockResolvedValue(undefined);

      await familyTreeModule.updateFamilyMember(request as any, member);

      expect(mockBatch.update).toHaveBeenCalledWith(
        expect.any(Object),
        expect.objectContaining({
          email: 'newemail@example.com',
          isPendingSignUp: true,
        })
      );

      expect(sendEmailUniversal).toHaveBeenCalledWith(
        expect.objectContaining({
          to: 'newemail@example.com',
          templateType: 'invite',
        })
      );
    });

    it('should not send invitation when email is unchanged', async () => {
      const request = {
        auth: { uid: 'admin_123' },
        data: {
          memberId: 'member_123',
          updatedData: {
            email: 'existing@example.com',
            firstName: 'Updated',
            familyTreeId: 'tree_123',
          },
        },
      };

      const member = {
        email: 'existing@example.com', // Same email
      };

      mockDoc.get.mockResolvedValueOnce({
        exists: true,
        data: () => createMockFamilyTree(),
      });

      await familyTreeModule.updateFamilyMember(request as any, member);

      expect(sendEmailUniversal).not.toHaveBeenCalled();
    });

    it('should enforce admin permissions', async () => {
      const request = {
        auth: { uid: 'regular_member' }, // Not an admin
        data: {
          memberId: 'member_123',
          updatedData: { familyTreeId: 'tree_123' },
        },
      };

      mockDoc.get.mockResolvedValueOnce({
        exists: true,
        data: () => createMockFamilyTree({
          adminUserIds: ['owner_123', 'admin_1'], // regular_member not included
          ownerUserId: 'owner_123',
        }),
      });

      await expect(familyTreeModule.updateFamilyMember(request as any, {}))
        .rejects.toMatchObject({
          code: ErrorCode.PERMISSION_DENIED,
          message: expect.stringContaining("don't have permission"),
        });
    });
  });

  describe('Admin Management', () => {
    describe('promoteToAdmin', () => {
      it('should promote member to admin', async () => {
        const request = {
          auth: { uid: 'owner_123' },
          data: {
            memberId: 'member_123',
            familyTreeId: 'tree_123',
          },
        };

        const familyTree = createMockFamilyTree({
          adminUserIds: ['owner_123'],
        });

        mockDoc.get.mockResolvedValueOnce({
          exists: true,
          data: () => ({ familyTreeId: 'tree_123' }),
        });

        await familyTreeModule.promoteToAdmin(request as any, familyTree);

        expect(mockDoc.update).toHaveBeenCalledWith({
          adminUserIds: { arrayUnion: ['member_123'] },
          updatedAt: expect.any(Object),
        });
      });

      it('should handle already admin member', async () => {
        const request = {
          auth: { uid: 'owner_123' },
          data: {
            memberId: 'admin_1',
            familyTreeId: 'tree_123',
          },
        };

        const familyTree = createMockFamilyTree({
          adminUserIds: ['owner_123', 'admin_1'], // Already admin
        });

        const result = await familyTreeModule.promoteToAdmin(request as any, familyTree);

        expect(result).toMatchObject({
          success: true,
          message: 'This member is already an admin.',
        });
        expect(mockDoc.update).not.toHaveBeenCalled();
      });

      it('should verify member belongs to tree', async () => {
        const request = {
          auth: { uid: 'owner_123' },
          data: {
            memberId: 'outsider_123',
            familyTreeId: 'tree_123',
          },
        };

        mockDoc.get.mockResolvedValueOnce({
          exists: true,
          data: () => ({ familyTreeId: 'different_tree' }), // Different tree
        });

        await expect(familyTreeModule.promoteToAdmin(request as any, createMockFamilyTree()))
          .rejects.toMatchObject({
            code: ErrorCode.INVALID_ARGUMENT,
            message: 'This member is not part of this family tree.',
          });
      });
    });

    describe('demoteToMember', () => {
      it('should demote admin to regular member', async () => {
        const request = {
          auth: { uid: 'owner_123' },
          data: {
            memberId: 'admin_1',
            familyTreeId: 'tree_123',
          },
        };

        const familyTree = createMockFamilyTree();

        await familyTreeModule.demoteToMember(request as any, familyTree);

        expect(mockDoc.update).toHaveBeenCalledWith({
          adminUserIds: { arrayRemove: ['admin_1'] },
          updatedAt: expect.any(Object),
        });
      });

      it('should prevent demoting tree owner', async () => {
        const request = {
          auth: { uid: 'owner_123' },
          data: {
            memberId: 'owner_123',
            familyTreeId: 'tree_123',
          },
        };

        const familyTree = createMockFamilyTree();

        await expect(familyTreeModule.demoteToMember(request as any, familyTree))
          .rejects.toMatchObject({
            code: ErrorCode.PERMISSION_DENIED,
            message: 'The tree owner cannot be demoted from admin status.',
          });
      });
    });
  });

  describe('Member and Invitation Queries', () => {
    describe('getFamilyTreeMembers', () => {
      it('should return all members with their roles and status', async () => {
        const familyTreeId = 'tree_123';
        const request = {
          auth: { uid: 'user_123' },
          data: { familyTreeId },
        };

        const treeData = createMockFamilyTree();

        mockDoc.get.mockResolvedValueOnce({
          exists: true,
          data: () => treeData,
        });

        mockQuery.docs = [
          createMockUser('owner_123', { isPendingSignUp: false }),
          createMockUser('admin_1', { isPendingSignUp: false }),
          createMockUser('member_1', { isPendingSignUp: true, email: 'invited@example.com' }),
        ];

        const result = await familyTreeModule.getFamilyTreeMembers(request as any);

        expect(result.members).toHaveLength(3);
        expect(result.members[0]).toMatchObject({
          id: 'owner_123',
          role: 'owner',
          status: 'active',
          canAddMembers: true,
        });
        expect(result.members[1]).toMatchObject({
          id: 'admin_1',
          role: 'admin',
          status: 'active',
          canAddMembers: true,
        });
        expect(result.members[2]).toMatchObject({
          id: 'member_1',
          role: 'member',
          status: 'invited',
          canAddMembers: false,
          isPendingSignUp: true,
        });
      });
    });

    describe('getPendingInvitations', () => {
      it('should return pending invitations for family tree', async () => {
        const request = {
          auth: { uid: 'admin_123' },
          data: { familyTreeId: 'tree_123' },
        };

        const invitations = [
          {
            id: 'invite_1',
            data: () => ({
              inviteeEmail: 'pending1@example.com',
              inviterName: 'Admin User',
              status: 'pending',
              createdAt: Timestamp.now(),
              expires: Timestamp.fromDate(new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)),
              prefillData: {
                firstName: 'Pending',
                lastName: 'User',
              },
            }),
          },
          {
            id: 'invite_2',
            data: () => ({
              inviteeEmail: 'pending2@example.com',
              inviterName: 'Owner User',
              status: 'pending',
              createdAt: Timestamp.now(),
            }),
          },
        ];

        mockQuery.docs = invitations;

        const result = await familyTreeModule.getPendingInvitations(request as any);

        expect(result.invitations).toHaveLength(2);
        expect(result.invitations[0]).toMatchObject({
          id: 'invite_1',
          email: 'pending1@example.com',
          firstName: 'Pending',
          lastName: 'User',
          status: 'pending',
        });
      });
    });

    describe('getFamilyManagementData', () => {
      it('should return comprehensive family management data', async () => {
        const userId = 'owner_123';
        const request = {
          auth: { uid: userId },
        };

        // Mock user document
        mockDoc.get.mockResolvedValueOnce({
          exists: true,
          data: () => ({ familyTreeId: 'tree_123' }),
        });

        // Mock tree document
        const treeData = createMockFamilyTree();
        mockDoc.get.mockResolvedValueOnce({
          exists: true,
          data: () => treeData,
        });

        // Mock family members
        mockQuery.docs = [
          createMockUser('owner_123'),
          createMockUser('admin_1'),
          createMockUser('member_1'),
        ];

        const result = await familyTreeModule.getFamilyManagementData(request as any);

        expect(result.tree).toMatchObject({
          id: 'tree_123',
          ownerUserId: 'owner_123',
          treeName: 'Test Family Tree',
          memberUserIds: expect.arrayContaining(['owner_123', 'member_1', 'member_2']),
          adminUserIds: expect.arrayContaining(['owner_123', 'admin_1']),
        });

        expect(result.members).toHaveLength(3);
        expect(result.members.find((m: any) => m.id === 'owner_123')).toMatchObject({
          isOwner: true,
          isAdmin: true,
        });
        expect(result.members.find((m: any) => m.id === 'admin_1')).toMatchObject({
          isOwner: false,
          isAdmin: true,
        });
      });
    });
  });

  describe('Performance Optimizations', () => {
    it('should use projection to minimize data transfer', async () => {
      const request = {
        auth: { uid: 'user_123' },
        data: { userId: 'user_123' },
      };

      mockDoc.get.mockResolvedValueOnce({
        exists: true,
        data: () => ({ familyTreeId: 'tree_123' }),
      });
      mockDoc.get.mockResolvedValueOnce({
        exists: true,
        data: () => createMockFamilyTree(),
      });
      mockQuery.docs = [];

      await familyTreeModule.getFamilyTreeData(request as any);

      expect(mockCollection.select).toHaveBeenCalledWith(
        'parentIds',
        'childrenIds',
        'spouseIds',
        'displayName',
        'firstName',
        'lastName',
        'profilePicture',
        'gender',
        'familyTreeId',
        'email',
        'phoneNumber'
      );
    });

    it('should batch update relationships efficiently', async () => {
      // Create a scenario with multiple relationship updates
      const memberId = 'central_member';
      const request = {
        auth: { uid: 'owner_123' },
        data: { memberId, familyTreeId: 'tree_123' },
      };

      const member = {
        parentIds: ['p1', 'p2'],
        childrenIds: ['c1', 'c2', 'c3'],
        spouseIds: ['s1'],
      };

      mockDoc.get.mockResolvedValueOnce({
        exists: true,
        data: () => createMockFamilyTree(),
      });
      mockQuery.docs = [];

      await familyTreeModule.deleteFamilyMember(request as any, member);

      // All updates should be batched
      expect(mockBatch.update).toHaveBeenCalledTimes(7); // 2 parents + 3 children + 1 spouse + 1 tree
      expect(mockBatch.commit).toHaveBeenCalledTimes(1); // Single commit
    });
  });

  describe('Error Handling and Validation', () => {
    it('should validate required family tree ID', async () => {
      const request = {
        auth: { uid: 'admin_123' },
        data: {
          userData: {
            firstName: 'Test',
            lastName: 'User',
            // Missing familyTreeId
          },
          relationType: 'child',
          selectedNodeId: 'parent_123',
        },
      };

      await expect(familyTreeModule.createFamilyMember(request as any, {}))
        .rejects.toMatchObject({
          code: ErrorCode.MISSING_PARAMETERS,
          message: 'Family Tree ID is missing in userData.',
        });
    });

    it('should handle missing FRONTEND_URL in development', async () => {
      (FRONTEND_URL.value as jest.Mock).mockImplementation(() => {
        throw new Error('Secret not set');
      });
      process.env.FUNCTIONS_EMULATOR = 'true';
      process.env.FRONTEND_URL = 'http://localhost:3000';

      const request = {
        auth: { uid: 'admin_123' },
        data: {
          userData: {
            firstName: 'Test',
            email: 'test@example.com',
            familyTreeId: 'tree_123',
          },
          relationType: 'child',
          selectedNodeId: 'parent_123',
        },
      };

      mockDoc.get.mockResolvedValueOnce({
        exists: true,
        data: () => createMockFamilyTree(),
      });
      mockDoc.get.mockResolvedValueOnce({
        exists: true,
        data: () => ({ displayName: 'Admin' }),
      });

      await familyTreeModule.createFamilyMember(request as any, {});

      expect(logger.warn).toHaveBeenCalledWith(
        expect.stringContaining('FRONTEND_URL secret not set'),
        expect.objectContaining({ fallbackUrl: 'http://localhost:3000' })
      );
    });

    it('should validate permissions through middleware', async () => {
      // Verify that functions are wrapped with appropriate middleware
      expect(withAuth).toHaveBeenCalled();
      expect(withResourceAccess).toHaveBeenCalled();
    });
  });
});