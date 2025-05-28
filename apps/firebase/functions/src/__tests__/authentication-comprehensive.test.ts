import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import * as admin from 'firebase-admin';
import { HttpsError, CallableRequest } from 'firebase-functions/v2/https';

// Mock firebase modules
jest.mock('firebase-functions/v2/logger');
jest.mock('firebase-admin');

// Mock the modules we're testing
const mockWithAuth = jest.fn((handler: any, name: string, options?: any) => handler);

// Mock middleware
jest.mock('../middleware/auth', () => ({
  requireAuth: jest.fn((request: any) => {
    if (!request.auth?.uid) throw new Error('Unauthenticated');
    return request.auth.uid;
  }),
  withAuth: mockWithAuth,
  checkRateLimitByIP: jest.fn(() => Promise.resolve()),
  RateLimitType: {
    AUTH: 'auth',
  },
}));

// Mock configuration
jest.mock('../auth/config/secrets', () => ({
  SENDGRID_CONFIG: { value: () => 'test-api-key' },
  FRONTEND_URL: { value: () => 'https://test.example.com' },
  JWT_SECRET: { value: () => 'test-jwt-secret' },
}));

jest.mock('../auth/config/sendgrid', () => ({
  initSendGrid: jest.fn(),
}));

jest.mock('../config/security-config', () => ({
  SECURITY_CONFIG: {
    rateLimits: {
      auth: {
        maxRequests: 10,
        windowSeconds: 60,
      },
    },
  },
}));

// Mock validation
jest.mock('../utils/request-validator', () => ({
  validateRequest: jest.fn((data) => data),
}));

jest.mock('../config/validation-schemas', () => ({
  VALIDATION_SCHEMAS: {
    signup: {},
    completeOnboarding: {},
    handlePhoneSignIn: {},
  },
}));

// Mock sendgrid helper
jest.mock('../auth/utils/sendgridHelper', () => ({
  sendEmail: jest.fn(() => Promise.resolve()),
}));

// Mock token utilities
jest.mock('../auth/utils/tokens', () => ({
  generateSecureToken: jest.fn(() => 'test-token-123'),
  hashToken: jest.fn((token) => `hashed-${token}`),
}));

// Import the functions we're testing
import * as authentication from '../auth/modules/authentication';

describe('Authentication Module Comprehensive Tests', () => {
  let mockAuth: any;
  let mockFirestore: any;
  let mockDb: any;
  let mockBatch: any;

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Setup Firebase Auth mocks
    mockAuth = {
      createUser: jest.fn(),
      getUserByEmail: jest.fn(),
      getUser: jest.fn(),
      updateUser: jest.fn(),
      deleteUser: jest.fn(),
      getUserByPhoneNumber: jest.fn(),
    };
    
    // Setup Firestore mocks
    mockBatch = {
      set: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      commit: jest.fn(() => Promise.resolve()),
    };
    
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
      batch: jest.fn(() => mockBatch),
      runTransaction: jest.fn((callback) => callback({})),
    };
    
    mockFirestore = jest.fn(() => mockDb);
    
    // Apply mocks
    (admin.auth as jest.Mock).mockReturnValue(mockAuth);
    (admin.firestore as jest.Mock).mockReturnValue(mockDb);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('handleSignUp', () => {
    it('should successfully create a new user account', async () => {
      const testData = {
        email: 'newuser@example.com',
        password: 'SecurePassword123!',
      };

      // Mock that user doesn't exist
      mockAuth.getUserByEmail.mockRejectedValue({ 
        code: 'auth/user-not-found',
        message: 'User not found' 
      });

      // Mock successful user creation
      mockAuth.createUser.mockResolvedValue({
        uid: 'new-user-uid',
        email: testData.email,
      });

      // Mock document operations
      const mockUserDoc = {
        set: jest.fn(() => Promise.resolve()),
        update: jest.fn(() => Promise.resolve()),
      };
      
      mockDb.collection.mockReturnValue({
        doc: jest.fn(() => mockUserDoc),
      });

      // Create a mock request
      const mockRequest: CallableRequest<any> = {
        data: testData,
        auth: null,
        rawRequest: {,
    acceptsStreaming: false} as any,
        acceptsStreaming: false,
      };

      // Execute the handler directly since we mocked withAuth
      const handler = (authentication.handleSignUp as any).runWith().handler;
      const result = await handler(mockRequest);

      // Verify the results
      expect(result).toEqual({
        success: true,
        userId: 'new-user-uid',
      });

      // Verify Firebase Auth was called correctly
      expect(mockAuth.getUserByEmail).toHaveBeenCalledWith(testData.email);
      expect(mockAuth.createUser).toHaveBeenCalledWith({
        email: testData.email,
        password: testData.password,
        emailVerified: false,
      });

      // Verify user document was created
      expect(mockUserDoc.set).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'new-user-uid',
          email: testData.email,
          emailVerified: false,
          onboardingCompleted: false,
        })
      );

      // Verify verification token was set
      expect(mockUserDoc.update).toHaveBeenCalledWith(
        expect.objectContaining({
          emailVerificationToken: 'hashed-test-token-123',
          emailVerificationExpires: expect.any(Date),
        })
      );
    });

    it('should handle duplicate email error', async () => {
      const testData = {
        email: 'existing@example.com',
        password: 'SecurePassword123!',
      };

      // Mock that user already exists
      mockAuth.getUserByEmail.mockResolvedValue({
        uid: 'existing-user-uid',
        email: testData.email,
      });

      const mockRequest: CallableRequest<any> = {
        data: testData,
        auth: null,
        rawRequest: {,
    acceptsStreaming: false} as any,
        acceptsStreaming: false,
      };

      // Execute and expect error
      const handler = (authentication.handleSignUp as any).runWith().handler;
      await expect(handler(mockRequest)).rejects.toThrow(HttpsError);
      await expect(handler(mockRequest)).rejects.toThrow('An account with this email already exists');
    });

    it('should handle Firebase Auth errors gracefully', async () => {
      const testData = {
        email: 'test@example.com',
        password: 'SecurePassword123!',
      };

      // Mock getUserByEmail to pass
      mockAuth.getUserByEmail.mockRejectedValue({ 
        code: 'auth/user-not-found',
        message: 'User not found' 
      });

      // Mock createUser to fail
      mockAuth.createUser.mockRejectedValue(new Error('Firebase Auth error'));

      const mockRequest: CallableRequest<any> = {
        data: testData,
        auth: null,
        rawRequest: {,
    acceptsStreaming: false} as any,
        acceptsStreaming: false,
      };

      const handler = (authentication.handleSignUp as any).runWith().handler;
      await expect(handler(mockRequest)).rejects.toThrow('Firebase Auth error');
    });

    it('should handle email sending failure gracefully', async () => {
      const testData = {
        email: 'test@example.com',
        password: 'SecurePassword123!',
      };

      // Setup successful user creation
      mockAuth.getUserByEmail.mockRejectedValue({ 
        code: 'auth/user-not-found',
        message: 'User not found' 
      });
      
      mockAuth.createUser.mockResolvedValue({
        uid: 'new-user-uid',
        email: testData.email,
      });

      const mockUserDoc = {
        set: jest.fn(() => Promise.resolve()),
        update: jest.fn(() => Promise.resolve()),
      };
      
      mockDb.collection.mockReturnValue({
        doc: jest.fn(() => mockUserDoc),
      });

      // Mock email sending failure
      const { sendEmail } = require('../auth/utils/sendgridHelper');
      (sendEmail as jest.Mock).mockRejectedValue(new Error('Email service error'));

      const mockRequest: CallableRequest<any> = {
        data: testData,
        auth: null,
        rawRequest: {,
    acceptsStreaming: false} as any,
        acceptsStreaming: false,
      };

      const handler = (authentication.handleSignUp as any).runWith().handler;
      await expect(handler(mockRequest)).rejects.toThrow('Email service error');
    });
  });

  describe('completeOnboarding', () => {
    it('should complete onboarding for a new user', async () => {
      const testData = {
        userId: 'test-user-id',
        firstName: 'John',
        lastName: 'Doe',
        phone: '+1234567890',
        dateOfBirth: '1990-01-01',
        gender: 'male',
        displayName: 'John Doe',
      };

      // Mock auth user exists
      mockAuth.getUser.mockResolvedValue({
        uid: testData.userId,
        email: 'john@example.com',
      });

      // Mock user document exists
      const mockUserDoc = {
        exists: true,
        data: () => ({
          id: testData.userId,
          email: 'john@example.com',
          onboardingCompleted: false,
        }),
      };

      const mockUserRef = {
        get: jest.fn(() => Promise.resolve(mockUserDoc)),
        update: jest.fn(),
      };

      const mockFamilyTreeRef = {
        id: 'family-tree-id',
      };

      const mockHistoryBookRef = {
        id: 'history-book-id',
      };

      mockDb.collection.mockImplementation((name: string) => {
        if (name === 'users') {
          return { doc: jest.fn(() => mockUserRef) };
        } else if (name === 'familyTrees') {
          return { doc: jest.fn(() => mockFamilyTreeRef) };
        } else if (name === 'historyBooks') {
          return { doc: jest.fn(() => mockHistoryBookRef) };
        }
        return { doc: jest.fn() };
      });

      const mockRequest: CallableRequest<any> = {
        data: testData,
        auth: { uid: testData.userId ,
    acceptsStreaming: false} as any,
        rawRequest: {} as any,
        acceptsStreaming: false,
      };

      const result = await authentication.completeOnboarding.run(mockRequest);

      expect(result).toEqual({
        success: true,
        userId: testData.userId,
        familyTreeId: 'family-tree-id',
        historyBookId: 'history-book-id',
      });

      // Verify batch operations
      expect(mockBatch.set).toHaveBeenCalledWith(
        mockFamilyTreeRef,
        expect.objectContaining({
          id: 'family-tree-id',
          ownerUserId: testData.userId,
          memberUserIds: [testData.userId],
          treeName: "John's Family Tree",
        })
      );

      expect(mockBatch.set).toHaveBeenCalledWith(
        mockHistoryBookRef,
        expect.objectContaining({
          id: 'history-book-id',
          ownerUserId: testData.userId,
          title: "John's History Book",
        })
      );

      expect(mockBatch.update).toHaveBeenCalledWith(
        mockUserRef,
        expect.objectContaining({
          displayName: 'John Doe',
          firstName: 'John',
          lastName: 'Doe',
          phoneNumber: '+1234567890',
          onboardingCompleted: true,
        })
      );

      expect(mockBatch.commit).toHaveBeenCalled();
    });

    it('should handle onboarding for invited user with migration', async () => {
      const testData = {
        userId: 'new-user-id',
        firstName: 'Jane',
        lastName: 'Smith',
      };

      const oldUserId = 'old-user-id';
      const invitationId = 'invitation-id';
      const familyTreeId = 'existing-family-tree';

      // Mock auth user
      mockAuth.getUser.mockResolvedValue({
        uid: testData.userId,
        email: 'jane@example.com',
      });

      // Mock user document with invitation
      const mockUserDoc = {
        exists: true,
        data: () => ({
          id: testData.userId,
          email: 'jane@example.com',
          invitationId: invitationId,
          onboardingCompleted: false,
        }),
      };

      // Mock invitation document
      const mockInvitationDoc = {
        exists: true,
        data: () => ({
          inviteeId: oldUserId,
          familyTreeId: familyTreeId,
          prefillData: {
            firstName: 'Jane',
            lastName: 'Smith',
            dateOfBirth: '1992-05-15',
          },
        }),
      };

      // Mock old user document
      const mockOldUserDoc = {
        exists: true,
        data: () => ({
          parentIds: ['parent-1', 'parent-2'],
          childrenIds: ['child-1'],
          spouseIds: ['spouse-1'],
        }),
      };

      // Mock family tree document
      const mockFamilyTreeDoc = {
        exists: true,
        data: () => ({
          memberUserIds: ['user-1', 'user-2', oldUserId],
          memberCount: 3,
        }),
      };

      const mockUserRef = {
        get: jest.fn(() => Promise.resolve(mockUserDoc)),
        update: jest.fn(),
      };

      const mockFamilyTreeRef = {
        get: jest.fn(() => Promise.resolve(mockFamilyTreeDoc)),
        update: jest.fn(),
      };

      mockDb.collection.mockImplementation((name: string) => {
        if (name === 'users') {
          return { 
            doc: jest.fn((id: string) => {
              if (id === oldUserId) {
                return { get: jest.fn(() => Promise.resolve(mockOldUserDoc)) };
              }
              return mockUserRef;
            }),
            where: jest.fn().mockReturnThis(),
            get: jest.fn(() => Promise.resolve({ empty: true, docs: [] })),
          };
        } else if (name === 'invitations') {
          return { 
            doc: jest.fn(() => ({ 
              get: jest.fn(() => Promise.resolve(mockInvitationDoc)) 
            }))
          };
        } else if (name === 'familyTrees') {
          return { 
            doc: jest.fn(() => mockFamilyTreeRef),
            where: jest.fn().mockReturnThis(),
            get: jest.fn(() => Promise.resolve({ empty: true, docs: [] })),
          };
        } else if (name === 'historyBooks') {
          return { 
            doc: jest.fn(() => ({ id: 'history-book-id' })),
            where: jest.fn().mockReturnThis(),
            get: jest.fn(() => Promise.resolve({ empty: true, docs: [] })),
          };
        }
        return { 
          doc: jest.fn(),
          where: jest.fn().mockReturnThis(),
          get: jest.fn(() => Promise.resolve({ empty: true, docs: [] })),
        };
      });

      const mockRequest: CallableRequest<any> = {
        data: testData,
        auth: { uid: testData.userId ,
    acceptsStreaming: false} as any,
        rawRequest: {} as any,
        acceptsStreaming: false,
      };

      const result = await authentication.completeOnboarding.run(mockRequest);

      expect(result).toEqual({
        success: true,
        userId: testData.userId,
        familyTreeId: familyTreeId,
        historyBookId: 'history-book-id',
      });

      // Verify user update includes migrated relationships
      expect(mockBatch.update).toHaveBeenCalledWith(
        mockUserRef,
        expect.objectContaining({
          parentIds: ['parent-1', 'parent-2'],
          childrenIds: ['child-1'],
          spouseIds: ['spouse-1'],
          familyTreeId: familyTreeId,
          invitationId: null,
        })
      );
    });

    it('should handle missing userId error', async () => {
      const mockRequest: CallableRequest<any> = {
        data: { firstName: 'John', lastName: 'Doe' ,
    acceptsStreaming: false},
        auth: null,
        rawRequest: {} as any,
        acceptsStreaming: false,
      };

      await expect(authentication.completeOnboarding.run(mockRequest))
        .rejects.toThrow('User ID is required');
    });

    it('should handle auth user not found error', async () => {
      const testData = {
        userId: 'non-existent-user',
        firstName: 'John',
        lastName: 'Doe',
      };

      mockAuth.getUser.mockRejectedValue(new Error('User not found'));

      const mockRequest: CallableRequest<any> = {
        data: testData,
        auth: { uid: testData.userId ,
    acceptsStreaming: false} as any,
        rawRequest: {} as any,
        acceptsStreaming: false,
      };

      await expect(authentication.completeOnboarding.run(mockRequest))
        .rejects.toThrow('Auth user not found');
    });

    it('should create Firestore document for Auth-only user', async () => {
      const testData = {
        userId: 'auth-only-user',
        firstName: 'Auth',
        lastName: 'Only',
        displayName: 'Auth Only User',
      };

      // Mock auth user exists
      mockAuth.getUser.mockResolvedValue({
        uid: testData.userId,
        email: 'authonly@example.com',
        phoneNumber: '+1234567890',
      });

      // Mock user document doesn't exist
      const mockUserDoc = {
        exists: false,
      };

      const mockUserRef = {
        get: jest.fn(() => Promise.resolve(mockUserDoc)),
        set: jest.fn(),
      };

      const mockFamilyTreeRef = {
        id: 'new-family-tree-id',
      };

      const mockHistoryBookRef = {
        id: 'new-history-book-id',
      };

      mockDb.collection.mockImplementation((name: string) => {
        if (name === 'users') {
          return { doc: jest.fn(() => mockUserRef) };
        } else if (name === 'familyTrees') {
          return { doc: jest.fn(() => mockFamilyTreeRef) };
        } else if (name === 'historyBooks') {
          return { doc: jest.fn(() => mockHistoryBookRef) };
        }
        return { doc: jest.fn() };
      });

      const mockRequest: CallableRequest<any> = {
        data: testData,
        auth: { uid: testData.userId ,
    acceptsStreaming: false} as any,
        rawRequest: {} as any,
        acceptsStreaming: false,
      };

      const result = await authentication.completeOnboarding.run(mockRequest);

      expect(result).toEqual({
        success: true,
        userId: testData.userId,
        familyTreeId: 'new-family-tree-id',
        historyBookId: 'new-history-book-id',
      });

      // Verify new user document was created
      expect(mockBatch.set).toHaveBeenCalledWith(
        mockUserRef,
        expect.objectContaining({
          id: testData.userId,
          displayName: 'Auth Only User',
          firstName: 'Auth',
          lastName: 'Only',
          email: 'authonly@example.com',
          phoneNumber: '+1234567890',
          familyTreeId: 'new-family-tree-id',
          historyBookId: 'new-history-book-id',
          onboardingCompleted: true,
        })
      );
    });
  });

  describe('handlePhoneSignIn', () => {
    it('should handle phone sign-in for existing user', async () => {
      const testData = {
        uid: 'existing-user-id',
        phoneNumber: '+1234567890',
      };

      // Mock auth user
      mockAuth.getUser.mockResolvedValue({
        uid: testData.uid,
        email: 'user@example.com',
        phoneNumber: testData.phoneNumber,
      });

      // Mock existing user document
      const mockUserDoc = {
        exists: true,
      };

      const mockUserRef = {
        get: jest.fn(() => Promise.resolve(mockUserDoc)),
        update: jest.fn(() => Promise.resolve()),
      };

      mockDb.collection.mockReturnValue({
        doc: jest.fn(() => mockUserRef),
      });

      const mockRequest: CallableRequest<any> = {
        data: testData,
        auth: { uid: testData.uid ,
    acceptsStreaming: false} as any,
        rawRequest: {} as any,
        acceptsStreaming: false,
      };

      const result = await authentication.handlePhoneSignIn.run(mockRequest);

      expect(result).toEqual({
        success: true,
        message: `User ${testData.uid} processed successfully with phone number ${testData.phoneNumber}.`,
        userId: testData.uid,
      });

      // Verify phone number was updated
      expect(mockUserRef.update).toHaveBeenCalledWith({
        phoneNumber: testData.phoneNumber,
        phoneNumberVerified: true,
        updatedAt: expect.any(Date),
      });
    });

    it('should create user document for new phone sign-in', async () => {
      const testData = {
        uid: 'new-phone-user',
        phoneNumber: '+1987654321',
      };

      // Mock auth user
      mockAuth.getUser.mockResolvedValue({
        uid: testData.uid,
        phoneNumber: testData.phoneNumber,
        displayName: 'Phone User',
        photoURL: 'https://example.com/photo.jpg',
      });

      // Mock non-existing user document
      const mockUserDoc = {
        exists: false,
      };

      const mockUserRef = {
        get: jest.fn(() => Promise.resolve(mockUserDoc)),
        set: jest.fn(() => Promise.resolve()),
      };

      mockDb.collection.mockReturnValue({
        doc: jest.fn(() => mockUserRef),
      });

      const mockRequest: CallableRequest<any> = {
        data: testData,
        auth: { uid: testData.uid ,
    acceptsStreaming: false} as any,
        rawRequest: {} as any,
        acceptsStreaming: false,
      };

      const result = await authentication.handlePhoneSignIn.run(mockRequest);

      expect(result).toEqual({
        success: true,
        message: `User ${testData.uid} processed successfully with phone number ${testData.phoneNumber}.`,
        userId: testData.uid,
      });

      // Verify new user document was created
      expect(mockUserRef.set).toHaveBeenCalledWith(
        expect.objectContaining({
          id: testData.uid,
          phoneNumber: testData.phoneNumber,
          phoneNumberVerified: true,
          displayName: 'Phone User',
          profilePicture: { url: 'https://example.com/photo.jpg', path: '' },
        })
      );
    });

    it('should handle auth user not found error', async () => {
      const testData = {
        uid: 'non-existent-user',
        phoneNumber: '+1234567890',
      };

      mockAuth.getUser.mockRejectedValue(new Error('User not found'));

      const mockRequest: CallableRequest<any> = {
        data: testData,
        auth: { uid: testData.uid ,
    acceptsStreaming: false} as any,
        rawRequest: {} as any,
        acceptsStreaming: false,
      };

      await expect(authentication.handlePhoneSignIn.run(mockRequest))
        .rejects.toThrow('An internal error occurred while processing the phone sign-in');
    });
  });

  describe('Phone Auth Placeholder Functions', () => {
    it('signInWithPhoneNumber should throw unimplemented error', async () => {
      const mockRequest: CallableRequest<any> = {
        data: { phoneNumber: '+1234567890' ,
    acceptsStreaming: false},
        auth: null,
        rawRequest: {} as any,
        acceptsStreaming: false,
      };

      const handler = (authentication.signInWithPhoneNumber as any).runWith().handler;
      await expect(handler(mockRequest))
        .rejects.toThrow('Phone number sign-in is not available at this moment');
    });

    it('verifyPhoneNumber should throw unimplemented error', async () => {
      const mockRequest: CallableRequest<any> = {
        data: { verificationId: '123', verificationCode: '456789' ,
    acceptsStreaming: false},
        auth: null,
        rawRequest: {} as any,
        acceptsStreaming: false,
      };

      const handler = (authentication.verifyPhoneNumber as any).runWith().handler;
      await expect(handler(mockRequest))
        .rejects.toThrow('Phone number verification is not available at this moment');
    });

    it('resendPhoneNumberVerification should throw unimplemented error', async () => {
      const mockRequest: CallableRequest<any> = {
        data: { phoneNumber: '+1234567890' ,
    acceptsStreaming: false},
        auth: null,
        rawRequest: {} as any,
        acceptsStreaming: false,
      };

      const handler = (authentication.resendPhoneNumberVerification as any).runWith().handler;
      await expect(handler(mockRequest))
        .rejects.toThrow('Resending phone number verification is not available at this moment');
    });
  });

  describe('Edge Cases and Error Handling', () => {
    it('should handle malformed email in signup', async () => {
      const { validateRequest } = require('../utils/request-validator');
      (validateRequest as jest.Mock).mockImplementation(() => {
        throw new Error('Invalid email format');
      });

      const testData = {
        email: 'invalid-email',
        password: 'password123',
      };

      const mockRequest: CallableRequest<any> = {
        data: testData,
        auth: null,
        rawRequest: {,
    acceptsStreaming: false} as any,
        acceptsStreaming: false,
      };

      const handler = (authentication.handleSignUp as any).runWith().handler;
      await expect(handler(mockRequest)).rejects.toThrow('Invalid email format');
    });

    it('should handle Firestore transaction failures', async () => {
      const testData = {
        userId: 'test-user',
        firstName: 'Test',
        lastName: 'User',
      };

      mockAuth.getUser.mockResolvedValue({
        uid: testData.userId,
        email: 'test@example.com',
      });

      const mockUserDoc = {
        exists: true,
        data: () => ({ id: testData.userId }),
      };

      mockDb.collection.mockReturnValue({
        doc: jest.fn(() => ({
          get: jest.fn(() => Promise.resolve(mockUserDoc)),
        })),
      });

      // Mock batch commit failure
      mockBatch.commit.mockRejectedValue(new Error('Transaction failed'));

      const mockRequest: CallableRequest<any> = {
        data: testData,
        auth: { uid: testData.userId ,
    acceptsStreaming: false} as any,
        rawRequest: {} as any,
        acceptsStreaming: false,
      };

      await expect(authentication.completeOnboarding.run(mockRequest))
        .rejects.toThrow('Transaction failed');
    });

    it('should handle concurrent signup attempts gracefully', async () => {
      const testData = {
        email: 'concurrent@example.com',
        password: 'SecurePassword123!',
      };

      // First call returns not found, second call returns existing user
      mockAuth.getUserByEmail
        .mockRejectedValueOnce({ 
          code: 'auth/user-not-found',
          message: 'User not found' 
        })
        .mockResolvedValueOnce({
          uid: 'existing-user',
          email: testData.email,
        });

      // Mock createUser to fail with already-exists
      mockAuth.createUser.mockRejectedValue({
        code: 'auth/email-already-exists',
        message: 'Email already exists',
      });

      const mockRequest: CallableRequest<any> = {
        data: testData,
        auth: null,
        rawRequest: {,
    acceptsStreaming: false} as any,
        acceptsStreaming: false,
      };

      const handler = (authentication.handleSignUp as any).runWith().handler;
      await expect(handler(mockRequest)).rejects.toThrow(HttpsError);
    });
  });

  describe('Authentication Flow Integration', () => {
    it('should handle complete signup and onboarding flow', async () => {
      // Step 1: Signup
      const signupData = {
        email: 'newuser@example.com',
        password: 'SecurePassword123!',
      };

      mockAuth.getUserByEmail.mockRejectedValue({ 
        code: 'auth/user-not-found',
        message: 'User not found' 
      });

      mockAuth.createUser.mockResolvedValue({
        uid: 'new-user-uid',
        email: signupData.email,
      });

      const mockUserDoc = {
        exists: false,
        set: jest.fn(() => Promise.resolve()),
        update: jest.fn(() => Promise.resolve()),
      };

      mockDb.collection.mockReturnValue({
        doc: jest.fn(() => mockUserDoc),
      });

      const signupRequest: CallableRequest<any> = {
        data: signupData,
        auth: null,
        rawRequest: {,
    acceptsStreaming: false} as any,
        acceptsStreaming: false,
      };

      const signupHandler = (authentication.handleSignUp as any).runWith().handler;
      const signupResult = await signupHandler(signupRequest);

      expect(signupResult.success).toBe(true);
      expect(signupResult.userId).toBe('new-user-uid');

      // Step 2: Complete onboarding
      const onboardingData = {
        userId: 'new-user-uid',
        firstName: 'New',
        lastName: 'User',
        phone: '+1234567890',
        dateOfBirth: '1990-01-01',
        gender: 'male',
      };

      // Reset mocks for onboarding
      mockAuth.getUser.mockResolvedValue({
        uid: onboardingData.userId,
        email: signupData.email,
      });

      mockUserDoc.exists = true;
      mockUserDoc.data = () => ({
        id: onboardingData.userId,
        email: signupData.email,
        onboardingCompleted: false,
      });

      const mockUserRef = {
        get: jest.fn(() => Promise.resolve(mockUserDoc)),
        update: jest.fn(),
      };

      mockDb.collection.mockImplementation((name: string) => {
        if (name === 'users') {
          return { doc: jest.fn(() => mockUserRef) };
        }
        return { doc: jest.fn(() => ({ id: `${name}-id` })) };
      });

      const onboardingRequest: CallableRequest<any> = {
        data: onboardingData,
        auth: { uid: onboardingData.userId ,
    acceptsStreaming: false} as any,
        rawRequest: {} as any,
        acceptsStreaming: false,
      };

      const onboardingResult = await authentication.completeOnboarding.run(onboardingRequest);

      expect(onboardingResult.success).toBe(true);
      expect(onboardingResult.userId).toBe('new-user-uid');
      expect(onboardingResult.familyTreeId).toBeDefined();
      expect(onboardingResult.historyBookId).toBeDefined();
    });
  });
});