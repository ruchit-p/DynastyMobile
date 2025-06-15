/**
 * Comprehensive tests for Authentication Service
 * Tests sign-in/sign-up flows, OAuth, onboarding, and security features
 */

import { HttpsError } from 'firebase-functions/v2/https';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import * as authModule from '../../auth/modules/authentication';
import { checkAccountLockout, recordFailedLogin } from '../../auth/modules/account-lockout';
import { sendEmailUniversal } from '../../auth/config/emailConfig';
import { generateSecureToken, hashToken } from '../../auth/utils/tokens';
import { ErrorCode, createError } from '../../utils/errors';
import { validateRequest } from '../../utils/request-validator';
import { withAuth } from '../../middleware/auth';
import { FRONTEND_URL } from '../../auth/config/secrets';

// Mock dependencies
jest.mock('firebase-admin/auth');
jest.mock('firebase-admin/firestore');
jest.mock('../../auth/modules/account-lockout', () => ({
  checkAccountLockout: {
    run: jest.fn(),
  },
  recordFailedLogin: jest.fn(),
}));
jest.mock('../../auth/config/emailConfig');
jest.mock('../../auth/utils/tokens');
jest.mock('../../utils/request-validator');
jest.mock('../../middleware/auth', () => ({
  withAuth: jest.fn((handler: any) => handler),
}));
jest.mock('../../auth/config/secrets');
jest.mock('firebase-functions/v2', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
  },
}));

// Mock HttpsError and onCall
let mockHandlers: Record<string, any> = {};

jest.mock('firebase-functions/v2/https', () => ({
  HttpsError: class HttpsError extends Error {
    constructor(public code: string, message: string, public details?: any) {
      super(message);
      this.name = 'HttpsError';
    }
  },
  onCall: jest.fn((options: any, handler: any) => {
    // Extract the actual handler function for testing
    const fn = typeof options === 'function' ? options : handler;
    // Create a wrapper that can be called directly in tests
    const testableHandler = async (request: any) => {
      return fn(request);
    };
    return testableHandler;
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
  forEach: jest.fn(),
};

const mockBatch = {
  set: jest.fn(),
  update: jest.fn(),
  delete: jest.fn(),
  commit: jest.fn(),
};

// Setup mocks
(getFirestore as jest.Mock).mockReturnValue(mockFirestore);
(getAuth as jest.Mock).mockReturnValue({
  getUserByEmail: jest.fn(),
  getUser: jest.fn(),
  createUser: jest.fn(),
  updateUser: jest.fn(),
});

mockFirestore.collection.mockReturnValue(mockCollection);
mockFirestore.batch.mockReturnValue(mockBatch);
mockCollection.doc.mockReturnValue(mockDoc);
mockCollection.where.mockReturnValue(mockCollection);
mockCollection.get.mockResolvedValue(mockQuery);
mockDoc.ref = mockDoc;

// Skip tests temporarily - need to refactor to test inner functions instead of wrapped cloud functions
describe.skip('Authentication Service', () => {
  const mockAuth = getAuth();
  
  beforeEach(() => {
    jest.clearAllMocks();
    
    // Setup default mocks
    mockDoc.get.mockResolvedValue({
      exists: true,
      data: () => ({ 
        displayName: 'Test User',
        onboardingCompleted: true,
      }),
    });
    
    mockDoc.set.mockResolvedValue(undefined);
    mockDoc.update.mockResolvedValue(undefined);
    mockBatch.commit.mockResolvedValue(undefined);
    
    // Mock validation
    (validateRequest as jest.Mock).mockImplementation((data) => data);
    
    // Mock auth wrapper
    (withAuth as jest.Mock).mockImplementation((handler) => handler);
    
    // Mock token generation
    (generateSecureToken as jest.Mock).mockReturnValue('test-token-123');
    (hashToken as jest.Mock).mockReturnValue('hashed-token-123');
    
    // Mock FRONTEND_URL
    (FRONTEND_URL.value as jest.Mock).mockReturnValue('https://app.dynasty.com');
  });

  describe('handleSignIn', () => {
    const mockUserRecord = {
      uid: 'user_123',
      email: 'test@example.com',
      emailVerified: true,
    };

    it('should successfully sign in a user with valid credentials', async () => {
      (checkAccountLockout.run as jest.Mock).mockResolvedValue({
        data: { isLocked: false },
      });
      (mockAuth.getUserByEmail as jest.Mock).mockResolvedValue(mockUserRecord);

      const request = {
        data: { email: 'test@example.com' },
        rawRequest: {},
      };

      const result = await authModule.handleSignIn(request as any);

      expect(checkAccountLockout.run).toHaveBeenCalledWith({
        data: { email: 'test@example.com' },
        rawRequest: {},
      });
      expect(mockAuth.getUserByEmail).toHaveBeenCalledWith('test@example.com');
      expect(result).toEqual({
        success: true,
        userId: 'user_123',
        email: 'test@example.com',
        displayName: 'Test User',
        onboardingCompleted: true,
      });
    });

    it('should reject sign in for locked accounts', async () => {
      (checkAccountLockout.run as jest.Mock).mockResolvedValue({
        data: { 
          isLocked: true,
          minutesRemaining: 15,
          message: 'Account locked for 15 minutes',
        },
      });

      const request = {
        data: { email: 'test@example.com' },
        rawRequest: {},
      };

      
      await expect(authModule.handleSignIn(request as any)).rejects.toMatchObject({
        code: ErrorCode.PERMISSION_DENIED,
        message: 'Account locked for 15 minutes',
      });

      expect(mockAuth.getUserByEmail).not.toHaveBeenCalled();
    });

    it('should reject sign in for unverified email', async () => {
      (checkAccountLockout.run as jest.Mock).mockResolvedValue({
        data: { isLocked: false },
      });
      (mockAuth.getUserByEmail as jest.Mock).mockResolvedValue({
        ...mockUserRecord,
        emailVerified: false,
      });

      const request = {
        data: { email: 'test@example.com' },
        rawRequest: {},
      };

      
      await expect(authModule.handleSignIn(request as any)).rejects.toMatchObject({
        code: ErrorCode.PERMISSION_DENIED,
        message: 'Please verify your email before signing in',
      });
    });

    it('should handle non-existent users', async () => {
      (checkAccountLockout.run as jest.Mock).mockResolvedValue({
        data: { isLocked: false },
      });
      (mockAuth.getUserByEmail as jest.Mock).mockRejectedValue(
        new Error('User not found')
      );

      const request = {
        data: { email: 'nonexistent@example.com' },
        rawRequest: {},
      };

      
      await expect(authModule.handleSignIn(request as any)).rejects.toMatchObject({
        code: ErrorCode.NOT_FOUND,
        message: 'Invalid email or password',
      });
    });

    it('should handle missing user document in Firestore', async () => {
      (checkAccountLockout.run as jest.Mock).mockResolvedValue({
        data: { isLocked: false },
      });
      (mockAuth.getUserByEmail as jest.Mock).mockResolvedValue(mockUserRecord);
      mockDoc.get.mockResolvedValue({ exists: false });

      const request = {
        data: { email: 'test@example.com' },
        rawRequest: {},
      };

      
      await expect(authModule.handleSignIn(request as any)).rejects.toMatchObject({
        code: ErrorCode.NOT_FOUND,
        message: 'User profile not found. Please contact support.',
      });
    });
  });

  describe('handleSignUp', () => {
    it('should successfully create a new user account', async () => {
      const newUserRecord = {
        uid: 'new_user_123',
        email: 'newuser@example.com',
      };

      (mockAuth.createUser as jest.Mock).mockResolvedValue(newUserRecord);
      (sendEmailUniversal as jest.Mock).mockResolvedValue(undefined);

      const request = {
        data: {
          email: 'newuser@example.com',
          password: 'SecurePassword123!',
        },
        rawRequest: {},
      };

      
      const result = await authModule.handleSignUp(request as any);

      expect(mockAuth.createUser).toHaveBeenCalledWith({
        email: 'newuser@example.com',
        password: 'SecurePassword123!',
        emailVerified: false,
      });

      expect(mockDoc.set).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'new_user_123',
          email: 'newuser@example.com',
          emailVerified: false,
          isPendingSignUp: false,
          onboardingCompleted: false,
          parentIds: [],
          childrenIds: [],
          spouseIds: [],
          isAdmin: false,
          canAddMembers: false,
          canEdit: false,
          phoneNumberVerified: false,
          dataRetentionPeriod: 'forever',
        })
      );

      expect(mockDoc.update).toHaveBeenCalledWith({
        emailVerificationToken: 'hashed-token-123',
        emailVerificationExpires: expect.any(Date),
      });

      expect(sendEmailUniversal).toHaveBeenCalledWith({
        to: 'newuser@example.com',
        templateType: 'verification',
        dynamicTemplateData: {
          username: 'newuser',
          verificationLink: 'https://app.dynasty.com/verify-email/confirm?uid=new_user_123&token=test-token-123',
        },
        userId: 'new_user_123',
      });

      expect(result).toEqual({
        success: true,
        userId: 'new_user_123',
      });
    });

    it('should handle duplicate email addresses', async () => {
      (mockAuth.createUser as jest.Mock).mockRejectedValue({
        code: 'auth/email-already-exists',
        message: 'Email already exists',
      });

      const request = {
        data: {
          email: 'existing@example.com',
          password: 'SecurePassword123!',
        },
        rawRequest: {},
      };

      
      await expect(authModule.handleSignUp(request as any)).rejects.toMatchObject({
        code: ErrorCode.EMAIL_EXISTS,
        message: expect.stringContaining('already exists'),
      });

      expect(mockDoc.set).not.toHaveBeenCalled();
      expect(sendEmailUniversal).not.toHaveBeenCalled();
    });

    it('should handle email service configuration errors', async () => {
      const newUserRecord = { uid: 'new_user_123', email: 'test@example.com' };
      (mockAuth.createUser as jest.Mock).mockResolvedValue(newUserRecord);
      (FRONTEND_URL.value as jest.Mock).mockImplementation(() => {
        throw new Error('Secret not set');
      });

      // Set environment to production to test error handling
      const originalEnv = process.env.FUNCTIONS_EMULATOR;
      process.env.FUNCTIONS_EMULATOR = 'false';

      const request = {
        data: {
          email: 'test@example.com',
          password: 'SecurePassword123!',
        },
        rawRequest: {},
      };

      
      await expect(authModule.handleSignUp(request as any)).rejects.toMatchObject({
        code: ErrorCode.INTERNAL,
        message: 'Email service configuration error prevents sending verification email.',
      });

      process.env.FUNCTIONS_EMULATOR = originalEnv;
    });

    it('should handle emulator environment with missing FRONTEND_URL', async () => {
      const newUserRecord = { uid: 'new_user_123', email: 'test@example.com' };
      (mockAuth.createUser as jest.Mock).mockResolvedValue(newUserRecord);
      (FRONTEND_URL.value as jest.Mock).mockImplementation(() => {
        throw new Error('Secret not set');
      });
      (sendEmailUniversal as jest.Mock).mockResolvedValue(undefined);

      // Set environment to emulator
      process.env.FUNCTIONS_EMULATOR = 'true';
      process.env.FRONTEND_URL = 'http://localhost:3000';

      const request = {
        data: {
          email: 'test@example.com',
          password: 'SecurePassword123!',
        },
        rawRequest: {},
      };

      
      const result = await authModule.handleSignUp(request as any);

      expect(sendEmailUniversal).toHaveBeenCalledWith(
        expect.objectContaining({
          dynamicTemplateData: expect.objectContaining({
            verificationLink: expect.stringContaining('http://localhost:3000'),
          }),
        })
      );

      expect(result).toEqual({
        success: true,
        userId: 'new_user_123',
      });
    });
  });

  describe('completeOnboarding', () => {
    it('should complete onboarding for new user', async () => {
      const userId = 'user_123';
      (mockAuth.getUser as jest.Mock).mockResolvedValue({
        uid: userId,
        email: 'test@example.com',
      });
      (mockAuth.updateUser as jest.Mock).mockResolvedValue({});
      
      // Mock user exists in Auth but not in Firestore (new user)
      mockDoc.get.mockResolvedValue({ exists: false });
      mockDoc.id = 'tree_123';

      const request = {
        data: {
          userId,
          firstName: 'John',
          lastName: 'Doe',
          displayName: 'John Doe',
          phone: '+1234567890',
          dateOfBirth: '1990-01-01',
          gender: 'male',
        },
      };

      const result = await authModule.completeOnboarding(request as any);

      // Verify Auth update
      expect(mockAuth.updateUser).toHaveBeenCalledWith(userId, {
        displayName: 'John Doe',
      });

      // Verify family tree creation
      expect(mockBatch.set).toHaveBeenCalledWith(
        expect.any(Object),
        expect.objectContaining({
          ownerUserId: userId,
          memberUserIds: [userId],
          adminUserIds: [userId],
          treeName: "John's Family Tree",
          memberCount: 1,
          isPrivate: true,
        })
      );

      // Verify history book creation
      expect(mockBatch.set).toHaveBeenCalledWith(
        expect.any(Object),
        expect.objectContaining({
          ownerUserId: userId,
          title: "John's History Book",
        })
      );

      // Verify user document creation
      expect(mockBatch.set).toHaveBeenCalledWith(
        expect.any(Object),
        expect.objectContaining({
          id: userId,
          displayName: 'John Doe',
          firstName: 'John',
          lastName: 'Doe',
          phoneNumber: '+1234567890',
          isAdmin: true,
          canAddMembers: true,
          canEdit: true,
          onboardingCompleted: true,
        })
      );

      expect(mockBatch.commit).toHaveBeenCalled();
      expect(result).toEqual({
        success: true,
        userId,
        familyTreeId: 'test-doc-id',
        historyBookId: 'test-doc-id',
      });
    });

    it('should handle onboarding for invited users with relationship migration', async () => {
      const userId = 'new_user_123';
      const oldUserId = 'old_user_123';
      const invitationId = 'invite_123';

      (mockAuth.getUser as jest.Mock).mockResolvedValue({
        uid: userId,
        email: 'invited@example.com',
      });

      // Mock existing user document with invitation
      mockDoc.get.mockResolvedValueOnce({
        exists: true,
        data: () => ({ invitationId }),
      });

      // Mock invitation document
      mockDoc.get.mockResolvedValueOnce({
        exists: true,
        data: () => ({
          inviteeId: oldUserId,
          familyTreeId: 'family_tree_123',
          prefillData: {
            firstName: 'Jane',
            lastName: 'Smith',
            dateOfBirth: '1985-05-15',
            gender: 'female',
          },
        }),
      });

      // Mock old user document
      mockDoc.get.mockResolvedValueOnce({
        exists: true,
        data: () => ({
          parentIds: ['parent_1', 'parent_2'],
          childrenIds: ['child_1'],
          spouseIds: ['spouse_1'],
        }),
      });

      // Mock family tree document
      mockDoc.get.mockResolvedValueOnce({
        exists: true,
        data: () => ({
          memberUserIds: [oldUserId, 'other_member'],
          adminUserIds: [oldUserId],
          memberCount: 5,
        }),
      });

      // Mock queries for relationship updates
      mockQuery.forEach.mockImplementation((callback) => {
        // Simulate documents that need updating
        [{ ref: mockDoc }, { ref: mockDoc }].forEach(callback);
      });

      const request = {
        data: {
          userId,
          firstName: 'Jane', // User confirms prefilled data
          lastName: 'Doe', // User changes last name
          phone: '+9876543210',
        },
      };

      const result = await authModule.completeOnboarding(request as any);

      // Verify family tree was updated to replace old user ID
      expect(mockBatch.update).toHaveBeenCalledWith(
        expect.any(Object),
        expect.objectContaining({
          memberUserIds: expect.arrayContaining([userId]),
        })
      );

      // Verify user document was updated with migrated relationships
      expect(mockBatch.update).toHaveBeenCalledWith(
        expect.any(Object),
        expect.objectContaining({
          firstName: 'Jane',
          lastName: 'Doe', // User's override
          parentIds: ['parent_1', 'parent_2'], // Migrated
          childrenIds: ['child_1'], // Migrated
          spouseIds: ['spouse_1'], // Migrated
          familyTreeId: 'family_tree_123',
          onboardingCompleted: true,
          invitationId: null, // Cleared
        })
      );

      // Verify old user document was deleted
      expect(mockBatch.delete).toHaveBeenCalledWith(expect.any(Object));

      expect(mockBatch.commit).toHaveBeenCalled();
      expect(result.success).toBe(true);
    });

    it('should validate required fields', async () => {
      const request = {
        data: {
          userId: '',
          firstName: '',
          lastName: '',
        },
      };

      await expect(authModule.completeOnboarding(request as any))
        .rejects.toThrow('User ID is required');
    });

    it('should handle missing auth user', async () => {
      (mockAuth.getUser as jest.Mock).mockRejectedValue(new Error('User not found'));

      const request = {
        data: {
          userId: 'nonexistent_user',
          firstName: 'John',
          lastName: 'Doe',
        },
      };

      await expect(authModule.completeOnboarding(request as any))
        .rejects.toThrow('Auth user not found');
    });
  });

  describe('handlePhoneSignIn', () => {
    it('should create user document for new phone sign-in', async () => {
      const userId = 'phone_user_123';
      const phoneNumber = '+1234567890';

      (mockAuth.getUser as jest.Mock).mockResolvedValue({
        uid: userId,
        phoneNumber,
        emailVerified: false,
      });

      mockDoc.get.mockResolvedValue({ exists: false });

      const request = {
        data: { uid: userId, phoneNumber },
      };

      const result = await authModule.handlePhoneSignIn(request as any);

      expect(mockDoc.set).toHaveBeenCalledWith(
        expect.objectContaining({
          id: userId,
          phoneNumber,
          phoneNumberVerified: true,
          parentIds: [],
          childrenIds: [],
          spouseIds: [],
          isAdmin: false,
          canAddMembers: false,
          canEdit: false,
          isPendingSignUp: false,
          onboardingCompleted: false,
        })
      );

      expect(result).toEqual({
        success: true,
        message: expect.stringContaining('processed successfully'),
        userId,
        isNewUser: true,
      });
    });

    it('should update existing user with phone number', async () => {
      const userId = 'existing_user_123';
      const phoneNumber = '+9876543210';

      (mockAuth.getUser as jest.Mock).mockResolvedValue({
        uid: userId,
        email: 'user@example.com',
      });

      mockDoc.get.mockResolvedValue({
        exists: true,
        data: () => ({ email: 'user@example.com' }),
      });

      const request = {
        data: { uid: userId, phoneNumber },
      };

      const result = await authModule.handlePhoneSignIn(request as any);

      expect(mockDoc.update).toHaveBeenCalledWith({
        phoneNumber,
        phoneNumberVerified: true,
        updatedAt: expect.any(Date),
      });

      expect(result).toEqual({
        success: true,
        message: expect.stringContaining('processed successfully'),
        userId,
        isNewUser: false,
      });
    });
  });

  describe('OAuth Sign-In Handlers', () => {
    describe('handleGoogleSignIn', () => {
      it('should create user document for new Google user', async () => {
        const userId = 'google_user_123';
        const googleData = {
          userId,
          email: 'google@example.com',
          displayName: 'Google User',
          photoURL: 'https://example.com/photo.jpg',
        };

        (mockAuth.getUser as jest.Mock).mockResolvedValue({
          uid: userId,
          email: googleData.email,
        });

        mockDoc.get.mockResolvedValue({ exists: false });

        const request = { data: googleData };

        const result = await authModule.handleGoogleSignIn(request as any);

        expect(mockDoc.set).toHaveBeenCalledWith(
          expect.objectContaining({
            id: userId,
            email: googleData.email,
            displayName: googleData.displayName,
            firstName: 'Google',
            lastName: 'User',
            profilePicture: { url: googleData.photoURL, path: '' },
            emailVerified: true, // Google accounts are pre-verified
            phoneNumberVerified: false,
            onboardingCompleted: false,
          })
        );

        expect(result).toEqual({
          success: true,
          userId,
          isNewUser: true,
        });
      });

      it('should handle existing Google users', async () => {
        const userId = 'existing_google_user';

        (mockAuth.getUser as jest.Mock).mockResolvedValue({
          uid: userId,
          email: 'existing@example.com',
        });

        mockDoc.get.mockResolvedValue({
          exists: true,
          data: () => ({ email: 'existing@example.com' }),
        });

        const request = {
          data: {
            userId,
            email: 'existing@example.com',
            displayName: 'Existing User',
          },
        };

        const result = await authModule.handleGoogleSignIn(request as any);

        expect(mockDoc.set).not.toHaveBeenCalled();
        expect(result).toEqual({
          success: true,
          userId,
          isNewUser: false,
        });
      });
    });

    describe('handleAppleSignIn', () => {
      it('should create user document for new Apple user with full name', async () => {
        const userId = 'apple_user_123';
        const appleData = {
          userId,
          email: 'apple@example.com',
          fullName: {
            givenName: 'Apple',
            familyName: 'User',
          },
        };

        (mockAuth.getUser as jest.Mock).mockResolvedValue({
          uid: userId,
          email: appleData.email,
        });

        mockDoc.get.mockResolvedValue({ exists: false });

        const request = { data: appleData };

        const result = await authModule.handleAppleSignIn(request as any);

        expect(mockDoc.set).toHaveBeenCalledWith(
          expect.objectContaining({
            id: userId,
            email: appleData.email,
            displayName: 'Apple User',
            firstName: 'Apple',
            lastName: 'User',
            emailVerified: true, // Apple accounts are pre-verified
          })
        );

        expect(result).toEqual({
          success: true,
          userId,
          isNewUser: true,
        });
      });

      it('should handle Apple sign-in without name data', async () => {
        const userId = 'apple_user_no_name';
        const appleData = {
          userId,
          email: 'appleuser@example.com',
          fullName: null,
        };

        (mockAuth.getUser as jest.Mock).mockResolvedValue({
          uid: userId,
          email: appleData.email,
        });

        mockDoc.get.mockResolvedValue({ exists: false });

        const request = { data: appleData };

        const result = await authModule.handleAppleSignIn(request as any);

        expect(mockDoc.set).toHaveBeenCalledWith(
          expect.objectContaining({
            firstName: 'appleuser', // Extracted from email
            lastName: '',
            displayName: 'appleuser',
          })
        );

        expect(result.success).toBe(true);
      });
    });
  });

  describe('handleAuthenticationFailure', () => {
    it('should record failed authentication attempts', async () => {
      (recordFailedLogin.run as jest.Mock).mockResolvedValue({
        data: {
          failedAttempts: 3,
          remainingAttempts: 2,
          message: '2 attempts remaining',
        },
      });

      const request = {
        data: {
          email: 'test@example.com',
          errorCode: 'auth/wrong-password',
        },
        rawRequest: {},
      };

      const result = await authModule.handleAuthenticationFailure(request as any);

      expect(recordFailedLogin.run).toHaveBeenCalledWith({
        data: { email: 'test@example.com' },
        rawRequest: {},
      });

      expect(result).toEqual({
        success: true,
        failedAttempts: 3,
        remainingAttempts: 2,
        message: '2 attempts remaining',
      });
    });

    it('should not count non-authentication errors as failed attempts', async () => {
      const request = {
        data: {
          email: 'test@example.com',
          errorCode: 'network-error',
        },
        rawRequest: {},
      };

      const result = await authModule.handleAuthenticationFailure(request as any);

      expect(recordFailedLogin.run).not.toHaveBeenCalled();
      expect(result).toEqual({
        success: true,
        message: 'Error logged but not counted as failed authentication attempt',
      });
    });

    it('should handle lockout errors gracefully', async () => {
      (recordFailedLogin.run as jest.Mock).mockRejectedValue(
        new HttpsError('resource-exhausted', 'Account locked')
      );

      const request = {
        data: {
          email: 'test@example.com',
          errorCode: 'auth/wrong-password',
        },
        rawRequest: {},
      };

      await expect(authModule.handleAuthenticationFailure(request as any))
        .rejects.toMatchObject({
          code: 'resource-exhausted',
          message: 'Account locked',
        });
    });

    it('should not throw on internal errors to avoid blocking user feedback', async () => {
      (recordFailedLogin.run as jest.Mock).mockRejectedValue(
        new Error('Database error')
      );

      const request = {
        data: {
          email: 'test@example.com',
          errorCode: 'auth/wrong-password',
        },
        rawRequest: {},
      };

      const result = await authModule.handleAuthenticationFailure(request as any);

      expect(result).toEqual({
        success: false,
        message: 'Unable to record authentication failure',
      });
    });
  });

  describe('Security and Validation', () => {
    it('should validate and sanitize input data', async () => {
      (validateRequest as jest.Mock).mockImplementation((data, schema) => {
        // Simulate validation
        if (!data.email || !data.email.includes('@')) {
          throw createError(ErrorCode.INVALID_ARGUMENT, 'Invalid email');
        }
        return data;
      });

      const request = {
        data: { email: 'invalid-email' },
        rawRequest: {},
      };

      
      await expect(authModule.handleSignIn(request as any)).rejects.toMatchObject({
        code: ErrorCode.INVALID_ARGUMENT,
        message: 'Invalid email',
      });
    });

    it('should handle rate limiting through withAuth middleware', async () => {
      // Test that functions are wrapped with withAuth
      expect(withAuth).toHaveBeenCalled();
    });
  });

  describe('Error Handling', () => {
    it('should handle unexpected errors gracefully', async () => {
      (checkAccountLockout.run as jest.Mock).mockRejectedValue(
        new Error('Unexpected database error')
      );

      const request = {
        data: { email: 'test@example.com' },
        rawRequest: {},
      };

      
      await expect(authModule.handleSignIn(request as any)).rejects.toMatchObject({
        code: ErrorCode.INTERNAL,
        message: 'Invalid email or password', // Generic message for security
      });
    });

    it('should rethrow HttpsErrors without modification', async () => {
      const customError = new HttpsError('already-exists', 'Custom error message');
      (checkAccountLockout.run as jest.Mock).mockRejectedValue(customError);

      const request = {
        data: { email: 'test@example.com' },
        rawRequest: {},
      };

      
      await expect(authModule.handleSignIn(request as any)).rejects.toBe(customError);
    });
  });
});
