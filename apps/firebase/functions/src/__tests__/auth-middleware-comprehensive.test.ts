import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import * as admin from 'firebase-admin';
import { CallableRequest } from 'firebase-functions/v2/https';

// Mock firebase modules
jest.mock('firebase-functions/v2/logger');
jest.mock('firebase-admin');

// Mock services
jest.mock('../services/rateLimitService', () => ({
  checkRateLimit: jest.fn(),
  RateLimitType: {
    general: 'general',
    auth: 'auth',
    media: 'media',
    api: 'api',
    write: 'write',
  },
}));

// Mock CSRF middleware
const mockRequireCSRFToken = jest.fn((handler) => handler);
jest.mock('../middleware/csrf', () => ({
  requireCSRFToken: mockRequireCSRFToken,
  CSRFValidatedRequest: {},
}));

// Mock error utilities
jest.mock('../utils/errors', () => ({
  createError: jest.fn((code, message, details) => {
    const error: any = new Error(message);
    error.code = code;
    error.details = details;
    return error;
  }),
  ErrorCode: {
    UNAUTHENTICATED: 'unauthenticated',
    NOT_FOUND: 'not-found',
    PERMISSION_DENIED: 'permission-denied',
    MISSING_PARAMETERS: 'missing-parameters',
    RESOURCE_EXHAUSTED: 'resource-exhausted',
  },
  withErrorHandling: jest.fn((handler, name) => handler),
}));

// Mock sanitization utilities
jest.mock('../utils/sanitization', () => ({
  createLogContext: jest.fn((data) => data),
  formatErrorForLogging: jest.fn((error, context) => ({
    message: error.message,
    context,
  })),
}));

// Import the auth middleware
import * as authMiddleware from '../middleware/auth';

describe('Auth Middleware Comprehensive Tests', () => {
  let mockFirestore: any;
  let mockDb: any;

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
    
    // Apply mocks
    (admin.firestore as jest.Mock).mockReturnValue(mockDb);
    (admin.firestore.Timestamp as any) = {
      fromDate: jest.fn((date) => ({ toMillis: () => date.getTime() })),
      now: jest.fn(() => ({ toMillis: () => Date.now() })),
    };
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('requireAuth', () => {
    it('should return uid for authenticated user', () => {
      const mockRequest: CallableRequest<any> = {
        data: {},
        auth: { uid: 'test-user-id' } as any,
        rawRequest: {} as any,
      };

      const uid = authMiddleware.requireAuth(mockRequest);
      expect(uid).toBe('test-user-id');
    });

    it('should throw error for unauthenticated user', () => {
      const mockRequest: CallableRequest<any> = {
        data: {},
        auth: null,
        rawRequest: {} as any,
      };

      expect(() => authMiddleware.requireAuth(mockRequest))
        .toThrow('Authentication required for this operation.');
    });

    it('should throw error for missing auth object', () => {
      const mockRequest: CallableRequest<any> = {
        data: {},
        auth: undefined as any,
        rawRequest: {} as any,
      };

      expect(() => authMiddleware.requireAuth(mockRequest))
        .toThrow('Authentication required for this operation.');
    });
  });

  describe('requireVerifiedUser', () => {
    it('should return uid for verified user', async () => {
      const mockUserDoc = {
        exists: true,
        data: () => ({
          emailVerified: true,
        }),
      };

      mockDb.collection().doc().get.mockResolvedValue(mockUserDoc);

      const mockRequest: CallableRequest<any> = {
        data: {},
        auth: { uid: 'verified-user-id' } as any,
        rawRequest: {} as any,
      };

      const uid = await authMiddleware.requireVerifiedUser(mockRequest);
      expect(uid).toBe('verified-user-id');
    });

    it('should throw error for unverified user', async () => {
      const mockUserDoc = {
        exists: true,
        data: () => ({
          emailVerified: false,
        }),
      };

      mockDb.collection().doc().get.mockResolvedValue(mockUserDoc);

      const mockRequest: CallableRequest<any> = {
        data: {},
        auth: { uid: 'unverified-user-id' } as any,
        rawRequest: {} as any,
      };

      await expect(authMiddleware.requireVerifiedUser(mockRequest))
        .rejects.toThrow('Email verification required');
    });

    it('should throw error if user document not found', async () => {
      mockDb.collection().doc().get.mockResolvedValue({
        exists: false,
      });

      const mockRequest: CallableRequest<any> = {
        data: {},
        auth: { uid: 'non-existent-user' } as any,
        rawRequest: {} as any,
      };

      await expect(authMiddleware.requireVerifiedUser(mockRequest))
        .rejects.toThrow('User profile not found.');
    });

    it('should throw error for unauthenticated user', async () => {
      const mockRequest: CallableRequest<any> = {
        data: {},
        auth: null,
        rawRequest: {} as any,
      };

      await expect(authMiddleware.requireVerifiedUser(mockRequest))
        .rejects.toThrow('Authentication required');
    });
  });

  describe('requireOnboardedUser', () => {
    it('should return uid for onboarded user', async () => {
      const mockUserDoc = {
        exists: true,
        data: () => ({
          emailVerified: true,
          onboardingCompleted: true,
        }),
      };

      mockDb.collection().doc().get.mockResolvedValue(mockUserDoc);

      const mockRequest: CallableRequest<any> = {
        data: {},
        auth: { uid: 'onboarded-user-id' } as any,
        rawRequest: {} as any,
      };

      const uid = await authMiddleware.requireOnboardedUser(mockRequest);
      expect(uid).toBe('onboarded-user-id');
    });

    it('should throw error for user who has not completed onboarding', async () => {
      const mockUserDoc = {
        exists: true,
        data: () => ({
          emailVerified: true,
          onboardingCompleted: false,
        }),
      };

      mockDb.collection().doc().get.mockResolvedValue(mockUserDoc);

      const mockRequest: CallableRequest<any> = {
        data: {},
        auth: { uid: 'not-onboarded-user' } as any,
        rawRequest: {} as any,
      };

      await expect(authMiddleware.requireOnboardedUser(mockRequest))
        .rejects.toThrow('Profile setup required');
    });

    it('should throw error for unverified user', async () => {
      const mockUserDoc = {
        exists: true,
        data: () => ({
          emailVerified: false,
          onboardingCompleted: true,
        }),
      };

      mockDb.collection().doc().get.mockResolvedValue(mockUserDoc);

      const mockRequest: CallableRequest<any> = {
        data: {},
        auth: { uid: 'unverified-user' } as any,
        rawRequest: {} as any,
      };

      await expect(authMiddleware.requireOnboardedUser(mockRequest))
        .rejects.toThrow('Email verification required');
    });
  });

  describe('checkResourceAccess', () => {
    it('should allow access for resource owner', async () => {
      const mockResourceDoc = {
        exists: true,
        data: () => ({
          id: 'event-123',
          hostId: 'test-user-id',
          title: 'Test Event',
        }),
      };

      mockDb.collection().doc().get.mockResolvedValue(mockResourceDoc);

      const mockRequest: CallableRequest<any> = {
        data: { eventId: 'event-123' },
        auth: { uid: 'test-user-id' } as any,
        rawRequest: {} as any,
      };

      const config: authMiddleware.ResourceAccessConfig = {
        resourceType: 'event',
        requiredLevel: authMiddleware.PermissionLevel.HOST,
      };

      const result = await authMiddleware.checkResourceAccess(mockRequest, config);

      expect(result.uid).toBe('test-user-id');
      expect(result.resource.hostId).toBe('test-user-id');
    });

    it('should allow access for family member', async () => {
      const mockResourceDoc = {
        exists: true,
        data: () => ({
          id: 'story-123',
          authorId: 'author-id',
          familyTreeId: 'family-123',
        }),
      };

      const mockUserDoc = {
        exists: true,
        data: () => ({
          familyTreeId: 'family-123',
        }),
      };

      mockDb.collection().doc().get
        .mockResolvedValueOnce(mockResourceDoc)
        .mockResolvedValueOnce(mockUserDoc);

      const mockRequest: CallableRequest<any> = {
        data: { storyId: 'story-123' },
        auth: { uid: 'family-member-id' } as any,
        rawRequest: {} as any,
      };

      const config: authMiddleware.ResourceAccessConfig = {
        resourceType: 'story',
        requiredLevel: authMiddleware.PermissionLevel.FAMILY_MEMBER,
      };

      const result = await authMiddleware.checkResourceAccess(mockRequest, config);

      expect(result.uid).toBe('family-member-id');
      expect(result.resource.familyTreeId).toBe('family-123');
    });

    it('should allow access for tree owner', async () => {
      const mockResourceDoc = {
        exists: true,
        data: () => ({
          id: 'resource-123',
          familyTreeId: 'family-123',
        }),
      };

      const mockTreeDoc = {
        exists: true,
        data: () => ({
          ownerUserId: 'tree-owner-id',
        }),
      };

      mockDb.collection().doc().get
        .mockResolvedValueOnce(mockResourceDoc)
        .mockResolvedValueOnce(mockTreeDoc);

      const mockRequest: CallableRequest<any> = {
        data: { family_treeId: 'resource-123' },
        auth: { uid: 'tree-owner-id' } as any,
        rawRequest: {} as any,
      };

      const config: authMiddleware.ResourceAccessConfig = {
        resourceType: 'family_tree',
        requiredLevel: authMiddleware.PermissionLevel.TREE_OWNER,
      };

      const result = await authMiddleware.checkResourceAccess(mockRequest, config);

      expect(result.uid).toBe('tree-owner-id');
    });

    it('should allow access for invited user', async () => {
      const mockResourceDoc = {
        exists: true,
        data: () => ({
          id: 'event-123',
          hostId: 'host-id',
          invitedMemberIds: ['user-1', 'invited-user', 'user-3'],
        }),
      };

      mockDb.collection().doc().get.mockResolvedValue(mockResourceDoc);

      const mockRequest: CallableRequest<any> = {
        data: { eventId: 'event-123' },
        auth: { uid: 'invited-user' } as any,
        rawRequest: {} as any,
      };

      const config: authMiddleware.ResourceAccessConfig = {
        resourceType: 'event',
        requiredLevel: authMiddleware.PermissionLevel.AUTHENTICATED,
        checkInvitation: true,
      };

      const result = await authMiddleware.checkResourceAccess(mockRequest, config);

      expect(result.uid).toBe('invited-user');
      expect(result.resource.invitedMemberIds).toContain('invited-user');
    });

    it('should allow access with custom permission check', async () => {
      const mockResourceDoc = {
        exists: true,
        data: () => ({
          id: 'resource-123',
          customField: 'special-access',
        }),
      };

      mockDb.collection().doc().get.mockResolvedValue(mockResourceDoc);

      const mockRequest: CallableRequest<any> = {
        data: { resourceId: 'resource-123' },
        auth: { uid: 'special-user' } as any,
        rawRequest: {} as any,
      };

      const config: authMiddleware.ResourceAccessConfig = {
        resourceType: 'resource',
        resourceIdField: 'resourceId',
        requiredLevel: authMiddleware.PermissionLevel.AUTHENTICATED,
        additionalPermissionCheck: async (resource, uid) => {
          return resource.customField === 'special-access' && uid === 'special-user';
        },
      };

      const result = await authMiddleware.checkResourceAccess(mockRequest, config);

      expect(result.uid).toBe('special-user');
    });

    it('should deny access for unauthorized user', async () => {
      const mockResourceDoc = {
        exists: true,
        data: () => ({
          id: 'event-123',
          hostId: 'host-id',
          invitedMemberIds: ['user-1', 'user-2'],
        }),
      };

      mockDb.collection().doc().get.mockResolvedValue(mockResourceDoc);

      const mockRequest: CallableRequest<any> = {
        data: { eventId: 'event-123' },
        auth: { uid: 'unauthorized-user' } as any,
        rawRequest: {} as any,
      };

      const config: authMiddleware.ResourceAccessConfig = {
        resourceType: 'event',
        requiredLevel: authMiddleware.PermissionLevel.HOST,
      };

      await expect(authMiddleware.checkResourceAccess(mockRequest, config))
        .rejects.toThrow("You don't have permission to access this event");
    });

    it('should throw error for missing resource ID', async () => {
      const mockRequest: CallableRequest<any> = {
        data: {}, // Missing eventId
        auth: { uid: 'test-user' } as any,
        rawRequest: {} as any,
      };

      const config: authMiddleware.ResourceAccessConfig = {
        resourceType: 'event',
        requiredLevel: authMiddleware.PermissionLevel.AUTHENTICATED,
      };

      await expect(authMiddleware.checkResourceAccess(mockRequest, config))
        .rejects.toThrow('The eventId parameter is required');
    });

    it('should throw error for non-existent resource', async () => {
      mockDb.collection().doc().get.mockResolvedValue({
        exists: false,
      });

      const mockRequest: CallableRequest<any> = {
        data: { eventId: 'non-existent' },
        auth: { uid: 'test-user' } as any,
        rawRequest: {} as any,
      };

      const config: authMiddleware.ResourceAccessConfig = {
        resourceType: 'event',
        requiredLevel: authMiddleware.PermissionLevel.AUTHENTICATED,
      };

      await expect(authMiddleware.checkResourceAccess(mockRequest, config))
        .rejects.toThrow('Event not found');
    });

    it('should handle PUBLIC permission level', async () => {
      const mockResourceDoc = {
        exists: true,
        data: () => ({
          id: 'public-resource',
          isPublic: true,
        }),
      };

      mockDb.collection().doc().get.mockResolvedValue(mockResourceDoc);

      const mockRequest: CallableRequest<any> = {
        data: { resourceId: 'public-resource' },
        auth: { uid: 'any-user' } as any,
        rawRequest: {} as any,
      };

      const config: authMiddleware.ResourceAccessConfig = {
        resourceType: 'resource',
        resourceIdField: 'resourceId',
        requiredLevel: authMiddleware.PermissionLevel.PUBLIC,
      };

      const result = await authMiddleware.checkResourceAccess(mockRequest, config);

      expect(result.uid).toBe('any-user');
      expect(result.resource.id).toBe('public-resource');
    });

    it('should handle multiple required permission levels', async () => {
      const mockResourceDoc = {
        exists: true,
        data: () => ({
          id: 'story-123',
          authorId: 'author-id',
          familyTreeId: 'family-123',
        }),
      };

      const mockUserDoc = {
        exists: true,
        data: () => ({
          familyTreeId: 'family-123',
        }),
      };

      mockDb.collection().doc().get
        .mockResolvedValueOnce(mockResourceDoc)
        .mockResolvedValueOnce(mockUserDoc);

      const mockRequest: CallableRequest<any> = {
        data: { storyId: 'story-123' },
        auth: { uid: 'family-member' } as any,
        rawRequest: {} as any,
      };

      const config: authMiddleware.ResourceAccessConfig = {
        resourceType: 'story',
        requiredLevel: [
          authMiddleware.PermissionLevel.ADMIN,
          authMiddleware.PermissionLevel.FAMILY_MEMBER,
        ],
      };

      const result = await authMiddleware.checkResourceAccess(mockRequest, config);

      expect(result.uid).toBe('family-member');
    });
  });

  describe('checkRateLimit', () => {
    it('should allow request within rate limit', async () => {
      const { checkRateLimit } = require('../services/rateLimitService');
      (checkRateLimit as jest.Mock).mockResolvedValue(undefined);

      const mockRequest: CallableRequest<any> = {
        data: {},
        auth: { uid: 'test-user' } as any,
        rawRequest: {} as any,
      };

      const uid = await authMiddleware.checkRateLimit(mockRequest);

      expect(uid).toBe('test-user');
      expect(checkRateLimit).toHaveBeenCalledWith({
        type: 'general',
        identifier: 'user:test-user',
        skipForAdmin: false,
      });
    });

    it('should bypass rate limit for admin users', async () => {
      const mockUserDoc = {
        exists: true,
        data: () => ({
          isAdmin: true,
        }),
      };

      mockDb.collection().doc().get.mockResolvedValue(mockUserDoc);

      const { checkRateLimit } = require('../services/rateLimitService');
      (checkRateLimit as jest.Mock).mockResolvedValue(undefined);

      const mockRequest: CallableRequest<any> = {
        data: {},
        auth: { uid: 'admin-user' } as any,
        rawRequest: {} as any,
      };

      const config: authMiddleware.RateLimitConfig = {
        type: authMiddleware.RateLimitType.API,
        ignoreAdmin: true,
      };

      await authMiddleware.checkRateLimit(mockRequest, config);

      expect(checkRateLimit).toHaveBeenCalledWith({
        type: 'api',
        identifier: 'user:admin-user',
        skipForAdmin: true,
      });
    });

    it('should throw error when rate limit exceeded', async () => {
      const { checkRateLimit } = require('../services/rateLimitService');
      const rateLimitError: any = new Error('Too many requests');
      rateLimitError.code = 'RATE_LIMIT_EXCEEDED';
      rateLimitError.details = { resetTime: Date.now() + 60000 };
      
      (checkRateLimit as jest.Mock).mockRejectedValue(rateLimitError);

      const mockRequest: CallableRequest<any> = {
        data: {},
        auth: { uid: 'rate-limited-user' } as any,
        rawRequest: {} as any,
      };

      await expect(authMiddleware.checkRateLimit(mockRequest))
        .rejects.toThrow('Too many requests');
    });

    it('should handle rate limit service errors gracefully', async () => {
      const { checkRateLimit } = require('../services/rateLimitService');
      (checkRateLimit as jest.Mock).mockRejectedValue(new Error('Service unavailable'));

      const mockRequest: CallableRequest<any> = {
        data: {},
        auth: { uid: 'test-user' } as any,
        rawRequest: {} as any,
      };

      // Should not throw, just log and continue
      const uid = await authMiddleware.checkRateLimit(mockRequest);
      expect(uid).toBe('test-user');
    });
  });

  describe('checkRateLimitByIP', () => {
    it('should check rate limit by IP address', async () => {
      const { checkRateLimit } = require('../services/rateLimitService');
      (checkRateLimit as jest.Mock).mockResolvedValue(undefined);

      const mockRequest: CallableRequest<any> = {
        data: {},
        auth: null,
        rawRequest: {
          ip: '192.168.1.1',
          headers: {},
        } as any,
      };

      await authMiddleware.checkRateLimitByIP(mockRequest);

      expect(checkRateLimit).toHaveBeenCalledWith({
        type: 'auth',
        identifier: 'ip:192.168.1.1',
        skipForAdmin: false,
      });
    });

    it('should extract IP from X-Forwarded-For header', async () => {
      const { checkRateLimit } = require('../services/rateLimitService');
      (checkRateLimit as jest.Mock).mockResolvedValue(undefined);

      const mockRequest: CallableRequest<any> = {
        data: {},
        auth: null,
        rawRequest: {
          headers: {
            'x-forwarded-for': '10.0.0.1, 192.168.1.1, 172.16.0.1',
          },
        } as any,
      };

      await authMiddleware.checkRateLimitByIP(mockRequest);

      expect(checkRateLimit).toHaveBeenCalledWith({
        type: 'auth',
        identifier: 'ip:10.0.0.1',
        skipForAdmin: false,
      });
    });

    it('should handle unknown IP gracefully', async () => {
      const { checkRateLimit } = require('../services/rateLimitService');

      const mockRequest: CallableRequest<any> = {
        data: {},
        auth: null,
        rawRequest: {} as any,
      };

      await authMiddleware.checkRateLimitByIP(mockRequest);

      // Should not call rate limit service for unknown IP
      expect(checkRateLimit).not.toHaveBeenCalled();
    });

    it('should throw error when IP rate limit exceeded', async () => {
      const { checkRateLimit } = require('../services/rateLimitService');
      const rateLimitError: any = new Error('IP rate limit exceeded');
      rateLimitError.code = 'RATE_LIMIT_EXCEEDED';
      
      (checkRateLimit as jest.Mock).mockRejectedValue(rateLimitError);

      const mockRequest: CallableRequest<any> = {
        data: {},
        auth: null,
        rawRequest: {
          ip: '192.168.1.1',
        } as any,
      };

      await expect(authMiddleware.checkRateLimitByIP(mockRequest))
        .rejects.toThrow('IP rate limit exceeded');
    });
  });

  describe('withAuth', () => {
    it('should wrap handler with auth checks', async () => {
      const mockHandler = jest.fn().mockResolvedValue({ success: true });

      const wrappedHandler = authMiddleware.withAuth(
        mockHandler,
        'testHandler',
        'auth'
      );

      const mockRequest: CallableRequest<any> = {
        data: {},
        auth: { uid: 'test-user' } as any,
        rawRequest: {} as any,
      };

      const result = await wrappedHandler(mockRequest);

      expect(result).toEqual({ success: true });
      expect(mockHandler).toHaveBeenCalledWith(mockRequest);
    });

    it('should skip auth for none level', async () => {
      const mockHandler = jest.fn().mockResolvedValue({ success: true });

      const wrappedHandler = authMiddleware.withAuth(
        mockHandler,
        'testHandler',
        'none'
      );

      const mockRequest: CallableRequest<any> = {
        data: {},
        auth: null,
        rawRequest: {} as any,
      };

      const result = await wrappedHandler(mockRequest);

      expect(result).toEqual({ success: true });
      expect(mockHandler).toHaveBeenCalledWith(mockRequest);
    });

    it('should check verified user for verified level', async () => {
      const mockHandler = jest.fn().mockResolvedValue({ success: true });
      
      const mockUserDoc = {
        exists: true,
        data: () => ({
          emailVerified: true,
        }),
      };

      mockDb.collection().doc().get.mockResolvedValue(mockUserDoc);

      const wrappedHandler = authMiddleware.withAuth(
        mockHandler,
        'testHandler',
        'verified'
      );

      const mockRequest: CallableRequest<any> = {
        data: {},
        auth: { uid: 'verified-user' } as any,
        rawRequest: {} as any,
      };

      await wrappedHandler(mockRequest);

      expect(mockHandler).toHaveBeenCalled();
    });

    it('should check onboarded user for onboarded level', async () => {
      const mockHandler = jest.fn().mockResolvedValue({ success: true });
      
      const mockUserDoc = {
        exists: true,
        data: () => ({
          emailVerified: true,
          onboardingCompleted: true,
        }),
      };

      mockDb.collection().doc().get.mockResolvedValue(mockUserDoc);

      const wrappedHandler = authMiddleware.withAuth(
        mockHandler,
        'testHandler',
        'onboarded'
      );

      const mockRequest: CallableRequest<any> = {
        data: {},
        auth: { uid: 'onboarded-user' } as any,
        rawRequest: {} as any,
      };

      await wrappedHandler(mockRequest);

      expect(mockHandler).toHaveBeenCalled();
    });

    it('should apply rate limiting when configured', async () => {
      const mockHandler = jest.fn().mockResolvedValue({ success: true });
      const { checkRateLimit } = require('../services/rateLimitService');
      (checkRateLimit as jest.Mock).mockResolvedValue(undefined);

      const wrappedHandler = authMiddleware.withAuth(
        mockHandler,
        'testHandler',
        'auth',
        {
          type: authMiddleware.RateLimitType.API,
          maxRequests: 10,
        }
      );

      const mockRequest: CallableRequest<any> = {
        data: {},
        auth: { uid: 'test-user' } as any,
        rawRequest: {} as any,
      };

      await wrappedHandler(mockRequest);

      expect(checkRateLimit).toHaveBeenCalledWith({
        type: 'api',
        identifier: 'user:test-user',
        skipForAdmin: false,
      });
    });

    it('should wrap with CSRF protection when enabled', async () => {
      const mockHandler = jest.fn().mockResolvedValue({ success: true });

      const wrappedHandler = authMiddleware.withAuth(
        mockHandler,
        'testHandler',
        {
          authLevel: 'auth',
          enableCSRF: true,
        }
      );

      const mockRequest: CallableRequest<any> = {
        data: {},
        auth: { uid: 'test-user' } as any,
        rawRequest: {} as any,
      };

      await wrappedHandler(mockRequest);

      expect(mockRequireCSRFToken).toHaveBeenCalled();
      expect(mockHandler).toHaveBeenCalled();
    });

    it('should handle new config API', async () => {
      const mockHandler = jest.fn().mockResolvedValue({ success: true });
      const { checkRateLimit } = require('../services/rateLimitService');
      (checkRateLimit as jest.Mock).mockResolvedValue(undefined);

      const wrappedHandler = authMiddleware.withAuth(
        mockHandler,
        'testHandler',
        {
          authLevel: 'auth',
          rateLimitConfig: {
            type: authMiddleware.RateLimitType.MEDIA,
            maxRequests: 5,
          },
          enableCSRF: true,
        }
      );

      const mockRequest: CallableRequest<any> = {
        data: {},
        auth: { uid: 'test-user' } as any,
        rawRequest: {} as any,
      };

      await wrappedHandler(mockRequest);

      expect(checkRateLimit).toHaveBeenCalledWith({
        type: 'media',
        identifier: 'user:test-user',
        skipForAdmin: false,
      });
      expect(mockRequireCSRFToken).toHaveBeenCalled();
    });
  });

  describe('withResourceAccess', () => {
    it('should wrap handler with resource access checks', async () => {
      const mockHandler = jest.fn().mockResolvedValue({ success: true });
      
      const mockResourceDoc = {
        exists: true,
        data: () => ({
          id: 'event-123',
          hostId: 'test-user',
        }),
      };

      mockDb.collection().doc().get.mockResolvedValue(mockResourceDoc);

      const wrappedHandler = authMiddleware.withResourceAccess(
        mockHandler,
        'testHandler',
        {
          resourceType: 'event',
          requiredLevel: authMiddleware.PermissionLevel.HOST,
        }
      );

      const mockRequest: CallableRequest<any> = {
        data: { eventId: 'event-123' },
        auth: { uid: 'test-user' } as any,
        rawRequest: {} as any,
      };

      const result = await wrappedHandler(mockRequest);

      expect(result).toEqual({ success: true });
      expect(mockHandler).toHaveBeenCalledWith(
        mockRequest,
        expect.objectContaining({ id: 'event-123', hostId: 'test-user' })
      );
    });

    it('should apply rate limiting with resource access', async () => {
      const mockHandler = jest.fn().mockResolvedValue({ success: true });
      const { checkRateLimit } = require('../services/rateLimitService');
      (checkRateLimit as jest.Mock).mockResolvedValue(undefined);
      
      const mockResourceDoc = {
        exists: true,
        data: () => ({
          id: 'story-123',
          authorId: 'test-user',
        }),
      };

      mockDb.collection().doc().get.mockResolvedValue(mockResourceDoc);

      const wrappedHandler = authMiddleware.withResourceAccess(
        mockHandler,
        'testHandler',
        {
          resourceType: 'story',
          requiredLevel: authMiddleware.PermissionLevel.ADMIN,
        },
        {
          type: authMiddleware.RateLimitType.WRITE,
        }
      );

      const mockRequest: CallableRequest<any> = {
        data: { storyId: 'story-123' },
        auth: { uid: 'test-user' } as any,
        rawRequest: {} as any,
      };

      await wrappedHandler(mockRequest);

      expect(checkRateLimit).toHaveBeenCalledWith({
        type: 'write',
        identifier: 'user:test-user',
        skipForAdmin: false,
      });
    });

    it('should wrap with CSRF protection when enabled', async () => {
      const mockHandler = jest.fn().mockResolvedValue({ success: true });
      
      const mockResourceDoc = {
        exists: true,
        data: () => ({
          id: 'resource-123',
          ownerId: 'test-user',
        }),
      };

      mockDb.collection().doc().get.mockResolvedValue(mockResourceDoc);

      const wrappedHandler = authMiddleware.withResourceAccess(
        mockHandler,
        'testHandler',
        {
          resourceConfig: {
            resourceType: 'resource',
            resourceIdField: 'resourceId',
            requiredLevel: authMiddleware.PermissionLevel.ADMIN,
          },
          enableCSRF: true,
        }
      );

      const mockRequest: CallableRequest<any> = {
        data: { resourceId: 'resource-123' },
        auth: { uid: 'test-user' } as any,
        rawRequest: {} as any,
      };

      await wrappedHandler(mockRequest);

      expect(mockRequireCSRFToken).toHaveBeenCalled();
      expect(mockHandler).toHaveBeenCalled();
    });
  });

  describe('createRateLimiter', () => {
    it('should create a rate limiting middleware function', async () => {
      const { checkRateLimit } = require('../services/rateLimitService');
      (checkRateLimit as jest.Mock).mockResolvedValue(undefined);

      const rateLimiter = authMiddleware.createRateLimiter(
        authMiddleware.RateLimitType.MEDIA,
        10,
        60
      );

      const mockRequest: CallableRequest<any> = {
        data: {},
        auth: { uid: 'test-user' } as any,
        rawRequest: {} as any,
      };

      const uid = await rateLimiter(mockRequest);

      expect(uid).toBe('test-user');
      expect(checkRateLimit).toHaveBeenCalledWith({
        type: 'media',
        identifier: 'user:test-user',
        skipForAdmin: false,
      });
    });
  });

  describe('Edge Cases and Error Handling', () => {
    it('should handle missing data in request', async () => {
      const mockRequest: CallableRequest<any> = {
        data: null,
        auth: { uid: 'test-user' } as any,
        rawRequest: {} as any,
      };

      const config: authMiddleware.ResourceAccessConfig = {
        resourceType: 'event',
        requiredLevel: authMiddleware.PermissionLevel.AUTHENTICATED,
      };

      await expect(authMiddleware.checkResourceAccess(mockRequest, config))
        .rejects.toThrow('The eventId parameter is required');
    });

    it('should handle custom resource ID field', async () => {
      const mockResourceDoc = {
        exists: true,
        data: () => ({
          id: 'custom-123',
          ownerId: 'test-user',
        }),
      };

      mockDb.collection().doc().get.mockResolvedValue(mockResourceDoc);

      const mockRequest: CallableRequest<any> = {
        data: { customResourceId: 'custom-123' },
        auth: { uid: 'test-user' } as any,
        rawRequest: {} as any,
      };

      const config: authMiddleware.ResourceAccessConfig = {
        resourceType: 'resource',
        resourceIdField: 'customResourceId',
        ownerIdField: 'ownerId',
        requiredLevel: authMiddleware.PermissionLevel.ADMIN,
      };

      const result = await authMiddleware.checkResourceAccess(mockRequest, config);

      expect(result.resource.id).toBe('custom-123');
    });

    it('should handle custom collection path', async () => {
      const mockResourceDoc = {
        exists: true,
        data: () => ({
          id: 'item-123',
          createdBy: 'test-user',
        }),
      };

      const mockDocFn = jest.fn(() => ({
        get: jest.fn(() => Promise.resolve(mockResourceDoc)),
      }));

      const mockCollectionFn = jest.fn(() => ({
        doc: mockDocFn,
      }));

      mockDb.collection = mockCollectionFn;

      const mockRequest: CallableRequest<any> = {
        data: { itemId: 'item-123' },
        auth: { uid: 'test-user' } as any,
        rawRequest: {} as any,
      };

      const config: authMiddleware.ResourceAccessConfig = {
        resourceType: 'item',
        resourceIdField: 'itemId',
        ownerIdField: 'createdBy',
        collectionPath: 'customItems',
        requiredLevel: authMiddleware.PermissionLevel.ADMIN,
      };

      await authMiddleware.checkResourceAccess(mockRequest, config);

      expect(mockCollectionFn).toHaveBeenCalledWith('customItems');
      expect(mockDocFn).toHaveBeenCalledWith('item-123');
    });
  });
});