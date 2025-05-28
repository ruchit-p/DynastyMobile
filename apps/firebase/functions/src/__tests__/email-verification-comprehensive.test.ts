import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import * as admin from 'firebase-admin';
import { CallableRequest } from 'firebase-functions/v2/https';
import * as sgMail from '@sendgrid/mail';

// Mock firebase modules
jest.mock('firebase-functions/v2/logger');
jest.mock('firebase-admin');
jest.mock('@sendgrid/mail');

// Mock middleware
const mockWithAuth = jest.fn((handler: any, name: string, options?: any) => handler);

jest.mock('../middleware', () => ({
  withAuth: mockWithAuth,
  RateLimitType: {
    AUTH: 'auth',
  },
}));

// Mock configuration
jest.mock('../auth/config/secrets', () => ({
  SENDGRID_CONFIG: { value: () => 'test-api-key' },
  FRONTEND_URL: { value: () => 'https://test.example.com' },
}));

jest.mock('../auth/config/sendgrid', () => ({
  initSendGrid: jest.fn(),
}));

jest.mock('../auth/config/sendgridConfig', () => ({
  getSendGridConfig: jest.fn(() => ({
    fromEmail: 'noreply@example.com',
    templates: {
      verification: 'verification-template-id',
    },
  })),
}));

jest.mock('../auth/config/constants', () => ({
  ERROR_MESSAGES: {
    EMAIL_SEND_FAILED: 'Failed to send email',
    INVALID_TOKEN: 'Invalid verification token',
    EXPIRED_TOKEN: 'Verification token has expired',
  },
  TOKEN_EXPIRY: {
    EMAIL_VERIFICATION: 3600000, // 1 hour in milliseconds
  },
}));

// Mock validation
jest.mock('../utils/request-validator', () => ({
  validateRequest: jest.fn((data) => data),
}));

jest.mock('../config/validation-schemas', () => ({
  VALIDATION_SCHEMAS: {
    sendVerificationEmail: {},
    verifyEmail: {},
  },
}));

// Mock token utilities
jest.mock('../auth/utils/tokens', () => ({
  generateSecureToken: jest.fn(() => 'test-verification-token-123'),
  hashToken: jest.fn((token) => `hashed-${token}`),
}));

// Import the functions we're testing
import * as emailVerification from '../auth/modules/email-verification';

describe('Email Verification Module Comprehensive Tests', () => {
  let mockAuth: any;
  let mockFirestore: any;
  let mockDb: any;

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Setup Firebase Auth mocks
    mockAuth = {
      updateUser: jest.fn(),
    };
    
    // Setup Firestore mocks
    const mockDoc = jest.fn((id?: string) => ({
      id: id || 'generated-id',
      get: jest.fn(),
      set: jest.fn(() => Promise.resolve()),
      update: jest.fn(() => Promise.resolve()),
      delete: jest.fn(() => Promise.resolve()),
      ref: {
        update: jest.fn(() => Promise.resolve()),
      },
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
    (admin.auth as jest.Mock).mockReturnValue(mockAuth);
    (admin.firestore as jest.Mock).mockReturnValue(mockDb);
    (admin.firestore.Timestamp as any) = {
      fromMillis: jest.fn((millis) => ({ toMillis: () => millis })),
    };
    (admin.firestore.FieldValue as any) = {
      serverTimestamp: jest.fn(() => new Date()),
    };
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('sendVerificationEmail', () => {
    it('should successfully send verification email to unverified user', async () => {
      const testData = {
        userId: 'test-user-id',
        email: 'user@example.com',
        displayName: 'Test User',
      };

      // Mock user document (unverified)
      const mockUserDoc = {
        exists: true,
        data: () => ({
          id: testData.userId,
          email: testData.email,
          emailVerified: false,
          firstName: 'Test',
        }),
      };

      const mockUserRef = {
        get: jest.fn(() => Promise.resolve(mockUserDoc)),
        update: jest.fn(() => Promise.resolve()),
      };

      mockDb.collection.mockReturnValue({
        doc: jest.fn(() => mockUserRef),
      });

      // Mock SendGrid
      (sgMail.send as jest.Mock).mockResolvedValue([{ statusCode: 202 }]);

      const mockRequest: CallableRequest<any> = {
        data: testData,
        auth: { uid: testData.userId } as any,
        rawRequest: {} as any,
      };

      const result = await emailVerification.sendVerificationEmail.run(mockRequest);

      expect(result).toEqual({
        success: true,
        message: 'Verification email sent successfully.',
      });

      // Verify user document was updated with token
      expect(mockUserRef.update).toHaveBeenCalledWith({
        emailVerificationToken: 'hashed-test-verification-token-123',
        emailVerificationExpires: expect.any(Object),
        email: testData.email,
      });

      // Verify email was sent
      expect(sgMail.send).toHaveBeenCalledWith({
        to: testData.email,
        from: {
          email: 'noreply@example.com',
          name: 'Dynasty App',
        },
        templateId: 'verification-template-id',
        dynamicTemplateData: {
          userName: 'Test User',
          verificationLink: 'https://test.example.com/verify-email?token=test-verification-token-123',
        },
      });
    });

    it('should skip sending email if user is already verified', async () => {
      const testData = {
        userId: 'verified-user-id',
        email: 'verified@example.com',
        displayName: 'Verified User',
      };

      // Mock user document (already verified)
      const mockUserDoc = {
        exists: true,
        data: () => ({
          id: testData.userId,
          email: testData.email,
          emailVerified: true,
        }),
      };

      const mockUserRef = {
        get: jest.fn(() => Promise.resolve(mockUserDoc)),
        update: jest.fn(),
      };

      mockDb.collection.mockReturnValue({
        doc: jest.fn(() => mockUserRef),
      });

      const mockRequest: CallableRequest<any> = {
        data: testData,
        auth: { uid: testData.userId } as any,
        rawRequest: {} as any,
      };

      const result = await emailVerification.sendVerificationEmail.run(mockRequest);

      expect(result).toEqual({
        success: true,
        message: 'Email is already verified.',
      });

      // Verify no update was made
      expect(mockUserRef.update).not.toHaveBeenCalled();

      // Verify no email was sent
      expect(sgMail.send).not.toHaveBeenCalled();
    });

    it('should handle user not found error', async () => {
      const testData = {
        userId: 'non-existent-user',
        email: 'nonexistent@example.com',
        displayName: 'Non Existent',
      };

      // Mock non-existent user
      const mockUserDoc = {
        exists: false,
      };

      const mockUserRef = {
        get: jest.fn(() => Promise.resolve(mockUserDoc)),
      };

      mockDb.collection.mockReturnValue({
        doc: jest.fn(() => mockUserRef),
      });

      const mockRequest: CallableRequest<any> = {
        data: testData,
        auth: { uid: testData.userId } as any,
        rawRequest: {} as any,
      };

      await expect(emailVerification.sendVerificationEmail.run(mockRequest))
        .rejects.toThrow('User record not found.');
    });

    it('should handle SendGrid configuration error', async () => {
      const testData = {
        userId: 'test-user-id',
        email: 'user@example.com',
        displayName: 'Test User',
      };

      // Mock user document
      const mockUserDoc = {
        exists: true,
        data: () => ({
          id: testData.userId,
          email: testData.email,
          emailVerified: false,
        }),
      };

      const mockUserRef = {
        get: jest.fn(() => Promise.resolve(mockUserDoc)),
        update: jest.fn(() => Promise.resolve()),
      };

      mockDb.collection.mockReturnValue({
        doc: jest.fn(() => mockUserRef),
      });

      // Mock missing SendGrid config
      const { getSendGridConfig } = require('../auth/config/sendgridConfig');
      (getSendGridConfig as jest.Mock).mockReturnValue({
        fromEmail: null, // Missing from email
        templates: {},
      });

      const mockRequest: CallableRequest<any> = {
        data: testData,
        auth: { uid: testData.userId } as any,
        rawRequest: {} as any,
      };

      await expect(emailVerification.sendVerificationEmail.run(mockRequest))
        .rejects.toThrow('Email service configuration error.');
    });

    it('should handle SendGrid send failure', async () => {
      const testData = {
        userId: 'test-user-id',
        email: 'user@example.com',
        displayName: 'Test User',
      };

      // Mock user document
      const mockUserDoc = {
        exists: true,
        data: () => ({
          id: testData.userId,
          email: testData.email,
          emailVerified: false,
        }),
      };

      const mockUserRef = {
        get: jest.fn(() => Promise.resolve(mockUserDoc)),
        update: jest.fn(() => Promise.resolve()),
      };

      mockDb.collection.mockReturnValue({
        doc: jest.fn(() => mockUserRef),
      });

      // Mock SendGrid failure
      (sgMail.send as jest.Mock).mockRejectedValue(new Error('SendGrid API error'));

      const mockRequest: CallableRequest<any> = {
        data: testData,
        auth: { uid: testData.userId } as any,
        rawRequest: {} as any,
      };

      await expect(emailVerification.sendVerificationEmail.run(mockRequest))
        .rejects.toThrow('Failed to send email');
    });

    it('should use fallback name when displayName is not provided', async () => {
      const testData = {
        userId: 'test-user-id',
        email: 'user@example.com',
        displayName: null,
      };

      // Mock user document
      const mockUserDoc = {
        exists: true,
        data: () => ({
          id: testData.userId,
          email: testData.email,
          emailVerified: false,
          firstName: 'John',
        }),
      };

      const mockUserRef = {
        get: jest.fn(() => Promise.resolve(mockUserDoc)),
        update: jest.fn(() => Promise.resolve()),
      };

      mockDb.collection.mockReturnValue({
        doc: jest.fn(() => mockUserRef),
      });

      // Mock SendGrid
      (sgMail.send as jest.Mock).mockResolvedValue([{ statusCode: 202 }]);

      const mockRequest: CallableRequest<any> = {
        data: testData,
        auth: { uid: testData.userId } as any,
        rawRequest: {} as any,
      };

      await emailVerification.sendVerificationEmail.run(mockRequest);

      // Verify email was sent with firstName as fallback
      expect(sgMail.send).toHaveBeenCalledWith(
        expect.objectContaining({
          dynamicTemplateData: expect.objectContaining({
            userName: 'John',
          }),
        })
      );
    });
  });

  describe('verifyEmail', () => {
    it('should successfully verify email with valid token', async () => {
      const testToken = 'valid-token-123';
      const hashedToken = 'hashed-valid-token-123';
      const userId = 'test-user-id';

      // Mock user document with valid token
      const mockUserDoc = {
        id: userId,
        data: () => ({
          id: userId,
          email: 'user@example.com',
          emailVerified: false,
          emailVerificationToken: hashedToken,
          emailVerificationExpires: {
            toMillis: () => Date.now() + 3600000, // 1 hour from now
          },
        }),
        ref: {
          update: jest.fn(() => Promise.resolve()),
        },
      };

      const mockSnapshot = {
        empty: false,
        docs: [mockUserDoc],
      };

      mockDb.collection.mockReturnValue({
        where: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        get: jest.fn(() => Promise.resolve(mockSnapshot)),
      });

      // Mock auth update
      mockAuth.updateUser.mockResolvedValue(undefined);

      const mockRequest: CallableRequest<any> = {
        data: { token: testToken },
        auth: null,
        rawRequest: {} as any,
      };

      const result = await emailVerification.verifyEmail.run(mockRequest);

      expect(result).toEqual({
        success: true,
        message: 'Email verified successfully.',
      });

      // Verify user document was updated
      expect(mockUserDoc.ref.update).toHaveBeenCalledWith({
        emailVerified: true,
        emailVerificationToken: null,
        emailVerificationExpires: null,
        updatedAt: expect.any(Date),
      });

      // Verify auth was updated
      expect(mockAuth.updateUser).toHaveBeenCalledWith(userId, {
        emailVerified: true,
      });
    });

    it('should handle invalid token error', async () => {
      const testToken = 'invalid-token';

      // Mock empty query result (token not found)
      const mockSnapshot = {
        empty: true,
        docs: [],
      };

      mockDb.collection.mockReturnValue({
        where: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        get: jest.fn(() => Promise.resolve(mockSnapshot)),
      });

      const mockRequest: CallableRequest<any> = {
        data: { token: testToken },
        auth: null,
        rawRequest: {} as any,
      };

      await expect(emailVerification.verifyEmail.run(mockRequest))
        .rejects.toThrow('Invalid verification token');
    });

    it('should handle expired token error', async () => {
      const testToken = 'expired-token';
      const hashedToken = 'hashed-expired-token';
      const userId = 'test-user-id';

      // Mock user document with expired token
      const mockUserDoc = {
        id: userId,
        data: () => ({
          id: userId,
          email: 'user@example.com',
          emailVerified: false,
          emailVerificationToken: hashedToken,
          emailVerificationExpires: {
            toMillis: () => Date.now() - 3600000, // 1 hour ago
          },
        }),
        ref: {
          update: jest.fn(() => Promise.resolve()),
        },
      };

      const mockSnapshot = {
        empty: false,
        docs: [mockUserDoc],
      };

      mockDb.collection.mockReturnValue({
        where: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        get: jest.fn(() => Promise.resolve(mockSnapshot)),
      });

      const mockRequest: CallableRequest<any> = {
        data: { token: testToken },
        auth: null,
        rawRequest: {} as any,
      };

      await expect(emailVerification.verifyEmail.run(mockRequest))
        .rejects.toThrow('Verification token has expired');

      // Verify expired token was cleared
      expect(mockUserDoc.ref.update).toHaveBeenCalledWith({
        emailVerificationToken: null,
        emailVerificationExpires: null,
      });
    });

    it('should handle Firebase Auth update failure gracefully', async () => {
      const testToken = 'valid-token-123';
      const hashedToken = 'hashed-valid-token-123';
      const userId = 'test-user-id';

      // Mock user document
      const mockUserDoc = {
        id: userId,
        data: () => ({
          id: userId,
          email: 'user@example.com',
          emailVerified: false,
          emailVerificationToken: hashedToken,
          emailVerificationExpires: {
            toMillis: () => Date.now() + 3600000,
          },
        }),
        ref: {
          update: jest.fn(() => Promise.resolve()),
        },
      };

      const mockSnapshot = {
        empty: false,
        docs: [mockUserDoc],
      };

      mockDb.collection.mockReturnValue({
        where: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        get: jest.fn(() => Promise.resolve(mockSnapshot)),
      });

      // Mock auth update failure
      mockAuth.updateUser.mockRejectedValue(new Error('Auth update failed'));

      const mockRequest: CallableRequest<any> = {
        data: { token: testToken },
        auth: null,
        rawRequest: {} as any,
      };

      // Should not throw, just log the error
      const result = await emailVerification.verifyEmail.run(mockRequest);

      expect(result).toEqual({
        success: true,
        message: 'Email verified successfully.',
      });

      // Verify Firestore was still updated
      expect(mockUserDoc.ref.update).toHaveBeenCalledWith({
        emailVerified: true,
        emailVerificationToken: null,
        emailVerificationExpires: null,
        updatedAt: expect.any(Date),
      });
    });

    it('should handle missing expiration timestamp', async () => {
      const testToken = 'valid-token-123';
      const hashedToken = 'hashed-valid-token-123';
      const userId = 'test-user-id';

      // Mock user document without expiration
      const mockUserDoc = {
        id: userId,
        data: () => ({
          id: userId,
          email: 'user@example.com',
          emailVerified: false,
          emailVerificationToken: hashedToken,
          emailVerificationExpires: null, // No expiration set
        }),
        ref: {
          update: jest.fn(() => Promise.resolve()),
        },
      };

      const mockSnapshot = {
        empty: false,
        docs: [mockUserDoc],
      };

      mockDb.collection.mockReturnValue({
        where: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        get: jest.fn(() => Promise.resolve(mockSnapshot)),
      });

      mockAuth.updateUser.mockResolvedValue(undefined);

      const mockRequest: CallableRequest<any> = {
        data: { token: testToken },
        auth: null,
        rawRequest: {} as any,
      };

      const result = await emailVerification.verifyEmail.run(mockRequest);

      expect(result).toEqual({
        success: true,
        message: 'Email verified successfully.',
      });

      // Should proceed with verification even without expiration
      expect(mockUserDoc.ref.update).toHaveBeenCalledWith({
        emailVerified: true,
        emailVerificationToken: null,
        emailVerificationExpires: null,
        updatedAt: expect.any(Date),
      });
    });
  });

  describe('Email Verification Flow Integration', () => {
    it('should handle complete email verification flow', async () => {
      const userId = 'flow-test-user';
      const email = 'flowtest@example.com';

      // Step 1: Send verification email
      const mockUserDoc = {
        exists: true,
        data: () => ({
          id: userId,
          email: email,
          emailVerified: false,
          firstName: 'Flow',
        }),
      };

      const mockUserRef = {
        get: jest.fn(() => Promise.resolve(mockUserDoc)),
        update: jest.fn(() => Promise.resolve()),
      };

      mockDb.collection.mockReturnValue({
        doc: jest.fn(() => mockUserRef),
      });

      (sgMail.send as jest.Mock).mockResolvedValue([{ statusCode: 202 }]);

      const sendRequest: CallableRequest<any> = {
        data: {
          userId: userId,
          email: email,
          displayName: 'Flow Test',
        },
        auth: { uid: userId } as any,
        rawRequest: {} as any,
      };

      const sendResult = await emailVerification.sendVerificationEmail.run(sendRequest);
      expect(sendResult.success).toBe(true);

      // Extract the token that was saved
      const updateCall = mockUserRef.update.mock.calls[0][0];
      const savedHashedToken = updateCall.emailVerificationToken;

      // Step 2: Verify the email using the token
      const mockVerifyDoc = {
        id: userId,
        data: () => ({
          id: userId,
          email: email,
          emailVerified: false,
          emailVerificationToken: savedHashedToken,
          emailVerificationExpires: {
            toMillis: () => Date.now() + 3600000,
          },
        }),
        ref: {
          update: jest.fn(() => Promise.resolve()),
        },
      };

      const mockSnapshot = {
        empty: false,
        docs: [mockVerifyDoc],
      };

      mockDb.collection.mockReturnValue({
        where: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        get: jest.fn(() => Promise.resolve(mockSnapshot)),
      });

      mockAuth.updateUser.mockResolvedValue(undefined);

      const verifyRequest: CallableRequest<any> = {
        data: { token: 'test-verification-token-123' },
        auth: null,
        rawRequest: {} as any,
      };

      const verifyResult = await emailVerification.verifyEmail.run(verifyRequest);
      expect(verifyResult.success).toBe(true);

      // Verify complete flow
      expect(mockVerifyDoc.ref.update).toHaveBeenCalledWith({
        emailVerified: true,
        emailVerificationToken: null,
        emailVerificationExpires: null,
        updatedAt: expect.any(Date),
      });
    });
  });

  describe('Edge Cases and Rate Limiting', () => {
    it('should handle validation errors', async () => {
      const { validateRequest } = require('../utils/request-validator');
      (validateRequest as jest.Mock).mockImplementation(() => {
        throw new Error('Validation failed: Invalid email format');
      });

      const mockRequest: CallableRequest<any> = {
        data: {
          userId: 'test-user',
          email: 'invalid-email',
        },
        auth: { uid: 'test-user' } as any,
        rawRequest: {} as any,
      };

      await expect(emailVerification.sendVerificationEmail.run(mockRequest))
        .rejects.toThrow('Validation failed: Invalid email format');
    });

    it('should handle concurrent verification attempts', async () => {
      const testToken = 'concurrent-token';
      const hashedToken = 'hashed-concurrent-token';
      const userId = 'concurrent-user';

      // Mock user document
      const mockUserDoc = {
        id: userId,
        data: () => ({
          id: userId,
          email: 'concurrent@example.com',
          emailVerified: false,
          emailVerificationToken: hashedToken,
          emailVerificationExpires: {
            toMillis: () => Date.now() + 3600000,
          },
        }),
        ref: {
          update: jest.fn(() => Promise.resolve()),
        },
      };

      const mockSnapshot = {
        empty: false,
        docs: [mockUserDoc],
      };

      mockDb.collection.mockReturnValue({
        where: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        get: jest.fn(() => Promise.resolve(mockSnapshot)),
      });

      mockAuth.updateUser.mockResolvedValue(undefined);

      // Simulate concurrent verification attempts
      const request1: CallableRequest<any> = {
        data: { token: testToken },
        auth: null,
        rawRequest: {} as any,
      };

      const request2: CallableRequest<any> = {
        data: { token: testToken },
        auth: null,
        rawRequest: {} as any,
      };

      // Run both requests concurrently
      const [result1, result2] = await Promise.all([
        emailVerification.verifyEmail.run(request1),
        emailVerification.verifyEmail.run(request2),
      ]);

      // Both should succeed (idempotent operation)
      expect(result1.success).toBe(true);
      expect(result2.success).toBe(true);
    });
  });
});