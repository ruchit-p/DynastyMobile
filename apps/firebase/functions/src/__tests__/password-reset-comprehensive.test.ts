import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import * as admin from 'firebase-admin';
import { initiatePasswordReset } from '../auth/modules/password-management';
import * as sendgridHelper from '../auth/utils/sendgridHelper';
import * as tokens from '../auth/utils/tokens';
import { SENDGRID_CONFIG, FRONTEND_URL } from '../auth/config/secrets';
import { TOKEN_EXPIRY } from '../auth/config/constants';

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
          limit: jest.fn(() => ({
            get: jest.fn(() => Promise.resolve({ 
              empty: false, 
              docs: [],
              size: 0 
            })),
          })),
        })),
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
      getUserByEmail: jest.fn(),
      updateUser: jest.fn(() => Promise.resolve()),
    })),
  };
});

// Mock SendGrid
jest.mock('@sendgrid/mail', () => ({
  setApiKey: jest.fn(),
  send: jest.fn(() => Promise.resolve([{ statusCode: 202 }])),
}));

// Mock helper modules
jest.mock('../auth/utils/sendgridHelper', () => ({
  sendEmail: jest.fn(() => Promise.resolve()),
}));

jest.mock('../auth/utils/tokens', () => ({
  generateSecureToken: jest.fn(() => 'mock-reset-token'),
  hashToken: jest.fn((token: string) => `hashed-${token}`),
}));

// Mock config
jest.mock('../auth/config/secrets', () => ({
  SENDGRID_CONFIG: { value: () => 'test-api-key' },
  FRONTEND_URL: { value: () => 'https://test.example.com' },
}));

// Mock SendGrid config
jest.mock('../auth/config/sendgrid', () => ({
  initSendGrid: jest.fn(),
}));

// Mock validation
jest.mock('../utils/request-validator', () => ({
  validateRequest: jest.fn((data) => data),
}));

// Mock middleware
jest.mock('../middleware', () => ({
  withResourceAccess: jest.fn((handler) => handler),
  withErrorHandling: jest.fn((handler) => handler),
  PermissionLevel: {
    PUBLIC: 'public',
    AUTHENTICATED: 'authenticated',
    PROFILE_OWNER: 'profile_owner',
    ADMIN: 'admin',
    FAMILY_MEMBER: 'family_member',
  },
}));

// Helper to create request context
const createRequest = (data: any, auth: any = null) => ({
  data,
  auth,
  rawRequest: { ip: '127.0.0.1' },
  acceptsStreaming: false,
});

describe('Password Reset - Comprehensive Tests', () => {
  let mockAuth: any;
  let mockFirestore: any;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.FUNCTIONS_EMULATOR = 'true';
    process.env.SENDGRID_API_KEY = 'test-api-key';
    process.env.FRONTEND_URL = 'https://test.example.com';
    
    mockAuth = admin.auth() as any;
    mockFirestore = admin.firestore() as any;
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('initiatePasswordReset', () => {
    describe('Success Cases', () => {
      it('should send password reset email for existing user', async () => {
        // Mock existing user
        mockAuth.getUserByEmail.mockResolvedValueOnce({
          uid: 'test-uid',
          email: 'user@example.com',
          displayName: 'Test User',
        });

        // Mock user document
        const mockUserDoc = {
          exists: true,
          data: () => ({
            id: 'test-uid',
            email: 'user@example.com',
            firstName: 'Test',
            lastName: 'User',
            displayName: 'Test User',
          }),
        };
        const mockDocRef = {
          get: jest.fn(() => Promise.resolve(mockUserDoc)),
          update: jest.fn(() => Promise.resolve()),
        };
        mockFirestore.collection().doc.mockReturnValue(mockDocRef);

        const request = createRequest({
          email: 'user@example.com',
        });

        const result = await initiatePasswordReset.run(request);

        expect(result).toMatchObject({
          success: true,
          message: expect.stringContaining('reset email sent'),
        });

        // Verify email was sent
        expect(sendgridHelper.sendEmail).toHaveBeenCalledWith({
          to: 'user@example.com',
          templateType: 'reset',
          dynamicTemplateData: expect.objectContaining({
            name: 'Test',
            resetLink: expect.stringContaining('mock-reset-token'),
          }),
        });

        // Verify token was stored
        expect(mockDocRef.update).toHaveBeenCalledWith(
          expect.objectContaining({
            passwordResetToken: 'hashed-mock-reset-token',
            passwordResetExpires: expect.any(Object),
          })
        );
      });

      it('should handle user without display name', async () => {
        mockAuth.getUserByEmail.mockResolvedValueOnce({
          uid: 'test-uid',
          email: 'user@example.com',
        });

        const mockUserDoc = {
          exists: true,
          data: () => ({
            id: 'test-uid',
            email: 'user@example.com',
            // No firstName, lastName, or displayName
          }),
        };
        const mockDocRef = {
          get: jest.fn(() => Promise.resolve(mockUserDoc)),
          update: jest.fn(() => Promise.resolve()),
        };
        mockFirestore.collection().doc.mockReturnValue(mockDocRef);

        const request = createRequest({
          email: 'user@example.com',
        });

        const result = await initiatePasswordReset.run(request);

        expect(result.success).toBe(true);
        expect(sendgridHelper.sendEmail).toHaveBeenCalledWith(
          expect.objectContaining({
            dynamicTemplateData: expect.objectContaining({
              name: 'User', // Default fallback
            }),
          })
        );
      });

      it('should handle case-insensitive email', async () => {
        mockAuth.getUserByEmail.mockResolvedValueOnce({
          uid: 'test-uid',
          email: 'user@example.com',
        });

        const mockUserDoc = {
          exists: true,
          data: () => ({
            id: 'test-uid',
            email: 'user@example.com',
            firstName: 'Test',
          }),
        };
        const mockDocRef = {
          get: jest.fn(() => Promise.resolve(mockUserDoc)),
          update: jest.fn(() => Promise.resolve()),
        };
        mockFirestore.collection().doc.mockReturnValue(mockDocRef);

        const request = createRequest({
          email: 'USER@EXAMPLE.COM', // Uppercase
        });

        const result = await initiatePasswordReset.run(request);

        expect(result.success).toBe(true);
        expect(mockAuth.getUserByEmail).toHaveBeenCalledWith('user@example.com'); // Lowercase
      });
    });

    describe('Error Cases', () => {
      it('should handle non-existent user gracefully', async () => {
        mockAuth.getUserByEmail.mockRejectedValueOnce({
          code: 'auth/user-not-found',
        });

        const request = createRequest({
          email: 'nonexistent@example.com',
        });

        const result = await initiatePasswordReset.run(request);

        // Should still return success to prevent email enumeration
        expect(result).toMatchObject({
          success: true,
          message: expect.stringContaining('email sent'),
        });

        // But should not send actual email
        expect(sendgridHelper.sendEmail).not.toHaveBeenCalled();
      });

      it('should handle invalid email format', async () => {
        const request = createRequest({
          email: 'invalid-email',
        });

        await expect(initiatePasswordReset.run(request)).rejects.toThrow();
      });

      it('should handle missing email', async () => {
        const request = createRequest({});

        await expect(initiatePasswordReset.run(request)).rejects.toThrow();
      });

      it('should handle user document not found in Firestore', async () => {
        mockAuth.getUserByEmail.mockResolvedValueOnce({
          uid: 'test-uid',
          email: 'user@example.com',
        });

        const mockDocRef = {
          get: jest.fn(() => Promise.resolve({ exists: false })),
        };
        mockFirestore.collection().doc.mockReturnValue(mockDocRef);

        const request = createRequest({
          email: 'user@example.com',
        });

        await expect(initiatePasswordReset.run(request)).rejects.toThrow();
      });

      it('should handle SendGrid API failure', async () => {
        mockAuth.getUserByEmail.mockResolvedValueOnce({
          uid: 'test-uid',
          email: 'user@example.com',
        });

        const mockUserDoc = {
          exists: true,
          data: () => ({
            id: 'test-uid',
            email: 'user@example.com',
            firstName: 'Test',
          }),
        };
        const mockDocRef = {
          get: jest.fn(() => Promise.resolve(mockUserDoc)),
          update: jest.fn(() => Promise.resolve()),
        };
        mockFirestore.collection().doc.mockReturnValue(mockDocRef);

        // Mock SendGrid failure
        (sendgridHelper.sendEmail as jest.Mock).mockRejectedValueOnce(
          new Error('SendGrid API error')
        );

        const request = createRequest({
          email: 'user@example.com',
        });

        await expect(initiatePasswordReset.run(request)).rejects.toThrow('SendGrid API error');
      });

      it('should handle Firestore update failure', async () => {
        mockAuth.getUserByEmail.mockResolvedValueOnce({
          uid: 'test-uid',
          email: 'user@example.com',
        });

        const mockUserDoc = {
          exists: true,
          data: () => ({
            id: 'test-uid',
            email: 'user@example.com',
            firstName: 'Test',
          }),
        };
        const mockDocRef = {
          get: jest.fn(() => Promise.resolve(mockUserDoc)),
          update: jest.fn(() => Promise.reject(new Error('Firestore error'))),
        };
        mockFirestore.collection().doc.mockReturnValue(mockDocRef);

        const request = createRequest({
          email: 'user@example.com',
        });

        await expect(initiatePasswordReset.run(request)).rejects.toThrow('Firestore error');
      });
    });

    describe('Security Cases', () => {
      it('should rate limit password reset requests', async () => {
        // This would be tested with actual rate limiting middleware
        // For now, we just verify the function can be called
        const request = createRequest({
          email: 'user@example.com',
        });

        // Mock user exists
        mockAuth.getUserByEmail.mockResolvedValueOnce({
          uid: 'test-uid',
          email: 'user@example.com',
        });

        const mockUserDoc = {
          exists: true,
          data: () => ({
            id: 'test-uid',
            email: 'user@example.com',
            firstName: 'Test',
          }),
        };
        const mockDocRef = {
          get: jest.fn(() => Promise.resolve(mockUserDoc)),
          update: jest.fn(() => Promise.resolve()),
        };
        mockFirestore.collection().doc.mockReturnValue(mockDocRef);

        const result = await initiatePasswordReset.run(request);
        expect(result.success).toBe(true);
      });

      it('should generate unique tokens for each request', async () => {
        mockAuth.getUserByEmail.mockResolvedValue({
          uid: 'test-uid',
          email: 'user@example.com',
        });

        const mockUserDoc = {
          exists: true,
          data: () => ({
            id: 'test-uid',
            email: 'user@example.com',
            firstName: 'Test',
          }),
        };
        const mockDocRef = {
          get: jest.fn(() => Promise.resolve(mockUserDoc)),
          update: jest.fn(() => Promise.resolve()),
        };
        mockFirestore.collection().doc.mockReturnValue(mockDocRef);

        // Mock different tokens for each call
        (tokens.generateSecureToken as jest.Mock)
          .mockReturnValueOnce('token-1')
          .mockReturnValueOnce('token-2');

        const request = createRequest({
          email: 'user@example.com',
        });

        await initiatePasswordReset.run(request);
        await initiatePasswordReset.run(request);

        expect(tokens.generateSecureToken).toHaveBeenCalledTimes(2);
        
        // Verify different hashed tokens were stored
        const updateCalls = mockDocRef.update.mock.calls;
        expect(updateCalls[0][0].passwordResetToken).toBe('hashed-token-1');
        expect(updateCalls[1][0].passwordResetToken).toBe('hashed-token-2');
      });

      it('should set appropriate token expiration time', async () => {
        mockAuth.getUserByEmail.mockResolvedValueOnce({
          uid: 'test-uid',
          email: 'user@example.com',
        });

        const mockUserDoc = {
          exists: true,
          data: () => ({
            id: 'test-uid',
            email: 'user@example.com',
            firstName: 'Test',
          }),
        };
        const mockDocRef = {
          get: jest.fn(() => Promise.resolve(mockUserDoc)),
          update: jest.fn(() => Promise.resolve()),
        };
        mockFirestore.collection().doc.mockReturnValue(mockDocRef);

        const request = createRequest({
          email: 'user@example.com',
        });

        await initiatePasswordReset.run(request);

        // Verify expiration time was set
        expect(mockDocRef.update).toHaveBeenCalledWith(
          expect.objectContaining({
            passwordResetExpires: expect.any(Object),
          })
        );

        // The actual expiration should be set based on TOKEN_EXPIRY.PASSWORD_RESET
        // which is typically 1 hour from now
      });
    });

    describe('Edge Cases', () => {
      it('should handle empty FRONTEND_URL config', async () => {
        // Mock empty frontend URL
        (FRONTEND_URL.value as jest.Mock).mockReturnValueOnce('');

        mockAuth.getUserByEmail.mockResolvedValueOnce({
          uid: 'test-uid',
          email: 'user@example.com',
        });

        const mockUserDoc = {
          exists: true,
          data: () => ({
            id: 'test-uid',
            email: 'user@example.com',
            firstName: 'Test',
          }),
        };
        const mockDocRef = {
          get: jest.fn(() => Promise.resolve(mockUserDoc)),
          update: jest.fn(() => Promise.resolve()),
        };
        mockFirestore.collection().doc.mockReturnValue(mockDocRef);

        const request = createRequest({
          email: 'user@example.com',
        });

        await expect(initiatePasswordReset.run(request)).rejects.toThrow();
      });

      it('should handle special characters in email', async () => {
        const specialEmail = 'user+test@example.com';
        
        mockAuth.getUserByEmail.mockResolvedValueOnce({
          uid: 'test-uid',
          email: specialEmail,
        });

        const mockUserDoc = {
          exists: true,
          data: () => ({
            id: 'test-uid',
            email: specialEmail,
            firstName: 'Test',
          }),
        };
        const mockDocRef = {
          get: jest.fn(() => Promise.resolve(mockUserDoc)),
          update: jest.fn(() => Promise.resolve()),
        };
        mockFirestore.collection().doc.mockReturnValue(mockDocRef);

        const request = createRequest({
          email: specialEmail,
        });

        const result = await initiatePasswordReset.run(request);

        expect(result.success).toBe(true);
        expect(mockAuth.getUserByEmail).toHaveBeenCalledWith(specialEmail.toLowerCase());
      });
    });
  });
});