import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { CallableRequest } from 'firebase-functions/v2/https';
import * as admin from 'firebase-admin';

// Mock all external dependencies before imports
jest.mock('firebase-admin', () => ({
  initializeApp: jest.fn(),
  firestore: jest.fn(() => ({
    collection: jest.fn().mockReturnThis(),
    doc: jest.fn().mockReturnThis(),
    get: jest.fn(),
    set: jest.fn(),
    add: jest.fn(),
    batch: jest.fn(() => ({
      update: jest.fn(),
      commit: jest.fn(),
    })),
  })),
  auth: jest.fn(() => ({
    verifyIdToken: jest.fn(),
  })),
}));

jest.mock('../services/csrfService', () => ({
  csrfService: {
    validateToken: jest.fn(),
    generateToken: jest.fn(),
  },
}));

jest.mock('../services/rateLimiter', () => ({
  checkRateLimit: jest.fn(() => Promise.resolve()),
}));

jest.mock('firebase-functions/v2', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

// Import after mocks
import { createVaultFolder } from '../vault';
import { createEvent } from '../events-service';
import { csrfService } from '../services/csrfService';

describe('CSRF Integration Tests', () => {
  let mockRequest: CallableRequest;
  const mockCsrfService = csrfService as jest.Mocked<typeof csrfService>;
  
  beforeEach(() => {
    jest.clearAllMocks();
    
    mockRequest = {
      auth: {
        uid: 'test-user-id',
        token: {} as any,
      },
      data: {},
      rawRequest: {
        headers: {
          'x-csrf-token': 'test-csrf-token',
        },
      } as any,
    } as CallableRequest;

    // Setup default mocks
    const mockFirestore = admin.firestore() as any;
    mockFirestore.collection.mockImplementation((collection: string) => ({
      doc: jest.fn((id?: string) => ({
        get: jest.fn().mockResolvedValue({
          exists: true,
          data: () => ({
            emailVerified: true,
            hasCompletedOnboarding: true,
            familyTreeId: 'test-family-tree',
            path: '/parent',
          }),
        }),
        set: jest.fn().mockResolvedValue(undefined),
        update: jest.fn().mockResolvedValue(undefined),
        id: id || 'new-doc-id',
      })),
      add: jest.fn().mockResolvedValue({ 
        id: 'new-doc-id',
      }),
    }));
  });

  describe('Vault Functions CSRF', () => {
    it('should create vault folder with valid CSRF token', async () => {
      mockCsrfService.validateToken.mockResolvedValue(true);
      
      mockRequest.data = {
        name: 'Test Folder',
        parentId: null,
      };

      const result = await createVaultFolder(mockRequest);

      expect(mockCsrfService.validateToken).toHaveBeenCalledWith(
        'test-user-id',
        'test-csrf-token',
        'createVaultFolder'
      );
      expect(result).toEqual({ id: 'new-doc-id' });
    });

    it('should reject vault folder creation without CSRF token', async () => {
      mockRequest.rawRequest.headers['x-csrf-token'] = undefined;
      
      mockRequest.data = {
        name: 'Test Folder',
        parentId: null,
      };

      await expect(createVaultFolder(mockRequest)).rejects.toThrow('CSRF token is required');
      expect(mockCsrfService.validateToken).not.toHaveBeenCalled();
    });

    it('should reject vault folder creation with invalid CSRF token', async () => {
      mockCsrfService.validateToken.mockResolvedValue(false);
      
      mockRequest.data = {
        name: 'Test Folder',
        parentId: null,
      };

      await expect(createVaultFolder(mockRequest)).rejects.toThrow('Invalid CSRF token');
    });
  });

  describe('Event Functions CSRF', () => {
    it('should create event with valid CSRF token', async () => {
      mockCsrfService.validateToken.mockResolvedValue(true);
      
      mockRequest.data = {
        title: 'Test Event',
        eventDate: '2024-12-25',
        privacy: 'family_tree',
        isVirtual: false,
        requireRsvp: true,
      };

      // Mock Firestore for event creation
      const mockFirestore = admin.firestore() as any;
      const mockEventRef = {
        id: 'new-event-id',
        set: jest.fn().mockResolvedValue(undefined),
      };
      
      mockFirestore.collection.mockImplementation((collection: string) => {
        if (collection === 'events') {
          return {
            doc: jest.fn().mockReturnValue(mockEventRef),
          };
        }
        if (collection === 'users') {
          return {
            doc: jest.fn().mockReturnValue({
              get: jest.fn().mockResolvedValue({
                exists: true,
                data: () => ({
                  emailVerified: true,
                  hasCompletedOnboarding: true,
                }),
              }),
            }),
          };
        }
      });

      // Mock subcollection for RSVP
      mockEventRef.collection = jest.fn().mockReturnValue({
        doc: jest.fn().mockReturnValue({
          set: jest.fn().mockResolvedValue(undefined),
        }),
      });

      const result = await createEvent(mockRequest);

      expect(mockCsrfService.validateToken).toHaveBeenCalledWith(
        'test-user-id',
        'test-csrf-token',
        'createEvent'
      );
      expect(result).toHaveProperty('eventId', 'new-event-id');
    });

    it('should reject event creation without CSRF token', async () => {
      mockRequest.rawRequest.headers['x-csrf-token'] = undefined;
      
      mockRequest.data = {
        title: 'Test Event',
        eventDate: '2024-12-25',
        privacy: 'family_tree',
        isVirtual: false,
      };

      await expect(createEvent(mockRequest)).rejects.toThrow('CSRF token is required');
    });
  });

  describe('CSRF Token Validation Edge Cases', () => {
    it('should handle CSRF service errors gracefully', async () => {
      mockCsrfService.validateToken.mockRejectedValue(new Error('Database connection error'));
      
      mockRequest.data = {
        name: 'Test Folder',
        parentId: null,
      };

      await expect(createVaultFolder(mockRequest)).rejects.toThrow('CSRF validation failed');
    });

    it('should handle empty CSRF token', async () => {
      mockRequest.rawRequest.headers['x-csrf-token'] = '';
      
      mockRequest.data = {
        name: 'Test Folder',
        parentId: null,
      };

      await expect(createVaultFolder(mockRequest)).rejects.toThrow('CSRF token is required');
    });

    it('should handle CSRF token with whitespace', async () => {
      mockRequest.rawRequest.headers['x-csrf-token'] = '  ';
      
      mockRequest.data = {
        name: 'Test Folder',
        parentId: null,
      };

      await expect(createVaultFolder(mockRequest)).rejects.toThrow('CSRF token is required');
    });
  });
});