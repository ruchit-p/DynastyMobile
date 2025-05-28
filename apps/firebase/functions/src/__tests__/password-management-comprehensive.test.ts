import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import * as admin from 'firebase-admin';
import { CallableRequest } from 'firebase-functions/v2/https';

// Mock firebase modules
jest.mock('firebase-functions/v2/logger');
jest.mock('firebase-admin');

// Mock middleware
const mockWithAuth = jest.fn((handler: any, name: string, options?: any) => handler);

jest.mock('../middleware', () => ({
  withAuth: mockWithAuth,
}));

// Mock configuration
jest.mock('../auth/config/secrets', () => ({
  SENDGRID_CONFIG: { value: () => 'test-api-key' },
}));

jest.mock('../auth/config/sendgrid', () => ({
  initSendGrid: jest.fn(),
}));

jest.mock('../config/security-config', () => ({
  SECURITY_CONFIG: {
    rateLimits: {
      passwordReset: {
        maxRequests: 5,
        windowSeconds: 900, // 15 minutes
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
    updateUserPassword: {},
    initiatePasswordReset: {},
  },
}));

// Mock sanitization utilities
jest.mock('../utils/sanitization', () => ({
  sanitizeUserId: jest.fn((id) => id),
  sanitizeEmail: jest.fn((email) => email),
  createLogContext: jest.fn((data) => data),
}));

// Mock sendgrid helper
jest.mock('../auth/utils/sendgridHelper', () => ({
  sendEmail: jest.fn(() => Promise.resolve()),
}));

// Import the functions we're testing
import * as passwordManagement from '../auth/modules/password-management';

describe('Password Management Module Comprehensive Tests', () => {
  let mockAuth: any;

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Setup Firebase Auth mocks
    mockAuth = {
      getUser: jest.fn(),
      getUserByEmail: jest.fn(),
      generatePasswordResetLink: jest.fn(),
      updateUser: jest.fn(),
    };
    
    // Apply mocks
    (admin.auth as jest.Mock).mockReturnValue(mockAuth);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('updateUserPassword', () => {
    it('should successfully verify user exists for password update', async () => {
      const testData = {
        userId: 'test-user-id',
        // Note: actual password update happens client-side
      };

      // Mock user exists
      mockAuth.getUser.mockResolvedValue({
        uid: testData.userId,
        email: 'user@example.com',
        displayName: 'Test User',
      });

      const mockRequest: CallableRequest<any> = {
        data: testData,
        auth: { uid: testData.userId ,
    acceptsStreaming: false} as any,
        rawRequest: {} as any,
        acceptsStreaming: false,
      };

      const result = await passwordManagement.updateUserPassword.run(mockRequest);

      expect(result).toEqual({
        success: true,
      });

      // Verify user was checked
      expect(mockAuth.getUser).toHaveBeenCalledWith(testData.userId);
    });

    it('should handle user not found error', async () => {
      const testData = {
        userId: 'non-existent-user',
      };

      // Mock user not found
      mockAuth.getUser.mockResolvedValue(null);

      const mockRequest: CallableRequest<any> = {
        data: testData,
        auth: { uid: 'some-other-user' ,
    acceptsStreaming: false} as any,
        rawRequest: {} as any,
        acceptsStreaming: false,
      };

      await expect(passwordManagement.updateUserPassword.run(mockRequest))
        .rejects.toThrow('User not found');
    });

    it('should handle Firebase Auth errors', async () => {
      const testData = {
        userId: 'test-user-id',
      };

      // Mock Firebase Auth error
      mockAuth.getUser.mockRejectedValue(new Error('Firebase Auth error'));

      const mockRequest: CallableRequest<any> = {
        data: testData,
        auth: { uid: testData.userId ,
    acceptsStreaming: false} as any,
        rawRequest: {} as any,
        acceptsStreaming: false,
      };

      await expect(passwordManagement.updateUserPassword.run(mockRequest))
        .rejects.toThrow('Failed to verify user');
    });

    it('should handle validation errors', async () => {
      const { validateRequest } = require('../utils/request-validator');
      (validateRequest as jest.Mock).mockImplementation(() => {
        throw new Error('Validation failed: Invalid user ID format');
      });

      const mockRequest: CallableRequest<any> = {
        data: { userId: 'invalid-format' ,
    acceptsStreaming: false},
        auth: { uid: 'test-user' } as any,
        rawRequest: {} as any,
        acceptsStreaming: false,
      };

      await expect(passwordManagement.updateUserPassword.run(mockRequest))
        .rejects.toThrow('Validation failed: Invalid user ID format');
    });

    it('should require authentication', async () => {
      // Verify that withAuth was called with proper authLevel
      expect(mockWithAuth).toHaveBeenCalledWith(
        expect.any(Function),
        'updateUserPassword',
        expect.objectContaining({
          authLevel: 'auth',
          enableCSRF: true,
        })
      );
    });
  });

  describe('initiatePasswordReset', () => {
    it('should successfully send password reset email', async () => {
      const testData = {
        email: 'user@example.com',
      };

      // Mock user exists
      mockAuth.getUserByEmail.mockResolvedValue({
        uid: 'test-user-id',
        email: testData.email,
        displayName: 'Test User',
      });

      // Mock reset link generation
      mockAuth.generatePasswordResetLink.mockResolvedValue(
        'https://example.com/reset-password?token=reset-token-123'
      );

      // Mock email sending
      const { sendEmail } = require('../auth/utils/sendgridHelper');
      (sendEmail as jest.Mock).mockResolvedValue(undefined);

      const mockRequest: CallableRequest<any> = {
        data: testData,
        auth: null, // No auth required for password reset
        rawRequest: {,
    acceptsStreaming: false} as any,
        acceptsStreaming: false,
      };

      const result = await passwordManagement.initiatePasswordReset.run(mockRequest);

      expect(result).toEqual({
        success: true,
      });

      // Verify reset link was generated
      expect(mockAuth.generatePasswordResetLink).toHaveBeenCalledWith(testData.email);

      // Verify email was sent
      expect(sendEmail).toHaveBeenCalledWith({
        to: testData.email,
        templateType: 'passwordReset',
        dynamicTemplateData: {
          username: 'Test User',
          resetLink: 'https://example.com/reset-password?token=reset-token-123',
        },
      });
    });

    it('should use fallback name when displayName is not set', async () => {
      const testData = {
        email: 'user@example.com',
      };

      // Mock user without displayName
      mockAuth.getUserByEmail.mockResolvedValue({
        uid: 'test-user-id',
        email: testData.email,
        displayName: null,
      });

      mockAuth.generatePasswordResetLink.mockResolvedValue(
        'https://example.com/reset-password?token=reset-token-123'
      );

      const { sendEmail } = require('../auth/utils/sendgridHelper');
      (sendEmail as jest.Mock).mockResolvedValue(undefined);

      const mockRequest: CallableRequest<any> = {
        data: testData,
        auth: null,
        rawRequest: {,
    acceptsStreaming: false} as any,
        acceptsStreaming: false,
      };

      await passwordManagement.initiatePasswordReset.run(mockRequest);

      // Verify email was sent with fallback username
      expect(sendEmail).toHaveBeenCalledWith({
        to: testData.email,
        templateType: 'passwordReset',
        dynamicTemplateData: {
          username: 'User', // Fallback name
          resetLink: 'https://example.com/reset-password?token=reset-token-123',
        },
      });
    });

    it('should handle user not found error', async () => {
      const testData = {
        email: 'nonexistent@example.com',
      };

      // Mock user not found
      mockAuth.generatePasswordResetLink.mockRejectedValue(
        new Error('There is no user record corresponding to this identifier')
      );

      const mockRequest: CallableRequest<any> = {
        data: testData,
        auth: null,
        rawRequest: {,
    acceptsStreaming: false} as any,
        acceptsStreaming: false,
      };

      await expect(passwordManagement.initiatePasswordReset.run(mockRequest))
        .rejects.toThrow('There is no user record corresponding to this identifier');
    });

    it('should handle email sending failure', async () => {
      const testData = {
        email: 'user@example.com',
      };

      mockAuth.getUserByEmail.mockResolvedValue({
        uid: 'test-user-id',
        email: testData.email,
        displayName: 'Test User',
      });

      mockAuth.generatePasswordResetLink.mockResolvedValue(
        'https://example.com/reset-password?token=reset-token-123'
      );

      // Mock email sending failure
      const { sendEmail } = require('../auth/utils/sendgridHelper');
      (sendEmail as jest.Mock).mockRejectedValue(new Error('SendGrid API error'));

      const mockRequest: CallableRequest<any> = {
        data: testData,
        auth: null,
        rawRequest: {,
    acceptsStreaming: false} as any,
        acceptsStreaming: false,
      };

      await expect(passwordManagement.initiatePasswordReset.run(mockRequest))
        .rejects.toThrow('SendGrid API error');
    });

    it('should handle Firebase Auth errors gracefully', async () => {
      const testData = {
        email: 'user@example.com',
      };

      // Mock Firebase Auth error
      mockAuth.generatePasswordResetLink.mockRejectedValue(
        new Error('Firebase Auth service unavailable')
      );

      const mockRequest: CallableRequest<any> = {
        data: testData,
        auth: null,
        rawRequest: {,
    acceptsStreaming: false} as any,
        acceptsStreaming: false,
      };

      await expect(passwordManagement.initiatePasswordReset.run(mockRequest))
        .rejects.toThrow('Firebase Auth service unavailable');
    });

    it('should not require authentication', async () => {
      // Verify that withAuth was called with authLevel: 'none'
      expect(mockWithAuth).toHaveBeenCalledWith(
        expect.any(Function),
        'initiatePasswordReset',
        expect.objectContaining({
          authLevel: 'none',
          enableCSRF: true,
        })
      );
    });

    it('should handle invalid email format', async () => {
      const { validateRequest } = require('../utils/request-validator');
      (validateRequest as jest.Mock).mockImplementation(() => {
        throw new Error('Invalid email format');
      });

      const mockRequest: CallableRequest<any> = {
        data: { email: 'invalid-email' ,
    acceptsStreaming: false},
        auth: null,
        rawRequest: {} as any,
        acceptsStreaming: false,
      };

      await expect(passwordManagement.initiatePasswordReset.run(mockRequest))
        .rejects.toThrow('Invalid email format');
    });
  });

  describe('Rate Limiting Configuration', () => {
    it('should apply rate limiting to updateUserPassword', async () => {
      expect(mockWithAuth).toHaveBeenCalledWith(
        expect.any(Function),
        'updateUserPassword',
        expect.objectContaining({
          rateLimitConfig: {
            maxRequests: 5,
            windowSeconds: 900,
          },
        })
      );
    });

    it('should apply rate limiting to initiatePasswordReset', async () => {
      expect(mockWithAuth).toHaveBeenCalledWith(
        expect.any(Function),
        'initiatePasswordReset',
        expect.objectContaining({
          rateLimitConfig: {
            maxRequests: 5,
            windowSeconds: 900,
          },
        })
      );
    });
  });

  describe('Error Handling and Edge Cases', () => {
    it('should handle missing email in getUserByEmail response', async () => {
      const testData = {
        email: 'user@example.com',
      };

      // Mock user found but incomplete data
      mockAuth.getUserByEmail.mockResolvedValue({
        uid: 'test-user-id',
        // email missing
      });

      mockAuth.generatePasswordResetLink.mockResolvedValue(
        'https://example.com/reset-password?token=reset-token-123'
      );

      const { sendEmail } = require('../auth/utils/sendgridHelper');
      (sendEmail as jest.Mock).mockResolvedValue(undefined);

      const mockRequest: CallableRequest<any> = {
        data: testData,
        auth: null,
        rawRequest: {,
    acceptsStreaming: false} as any,
        acceptsStreaming: false,
      };

      const result = await passwordManagement.initiatePasswordReset.run(mockRequest);

      expect(result).toEqual({
        success: true,
      });

      // Should still send email with fallback username
      expect(sendEmail).toHaveBeenCalledWith({
        to: testData.email,
        templateType: 'passwordReset',
        dynamicTemplateData: {
          username: 'User',
          resetLink: 'https://example.com/reset-password?token=reset-token-123',
        },
      });
    });

    it('should handle concurrent password reset requests', async () => {
      const testData = {
        email: 'user@example.com',
      };

      mockAuth.getUserByEmail.mockResolvedValue({
        uid: 'test-user-id',
        email: testData.email,
        displayName: 'Test User',
      });

      mockAuth.generatePasswordResetLink.mockResolvedValue(
        'https://example.com/reset-password?token=reset-token-123'
      );

      const { sendEmail } = require('../auth/utils/sendgridHelper');
      (sendEmail as jest.Mock).mockResolvedValue(undefined);

      const mockRequest: CallableRequest<any> = {
        data: testData,
        auth: null,
        rawRequest: {,
    acceptsStreaming: false} as any,
        acceptsStreaming: false,
      };

      // Simulate concurrent requests
      const results = await Promise.all([
        passwordManagement.initiatePasswordReset.run(mockRequest),
        passwordManagement.initiatePasswordReset.run(mockRequest),
      ]);

      // Both should succeed
      expect(results).toEqual([
        { success: true },
        { success: true },
      ]);

      // Email should be sent twice (rate limiting would handle this in production)
      expect(sendEmail).toHaveBeenCalledTimes(2);
    });

    it('should handle special characters in email', async () => {
      const testData = {
        email: 'user+test@example.com',
      };

      mockAuth.getUserByEmail.mockResolvedValue({
        uid: 'test-user-id',
        email: testData.email,
        displayName: 'Test User',
      });

      mockAuth.generatePasswordResetLink.mockResolvedValue(
        'https://example.com/reset-password?token=reset-token-123'
      );

      const { sendEmail } = require('../auth/utils/sendgridHelper');
      (sendEmail as jest.Mock).mockResolvedValue(undefined);

      const mockRequest: CallableRequest<any> = {
        data: testData,
        auth: null,
        rawRequest: {,
    acceptsStreaming: false} as any,
        acceptsStreaming: false,
      };

      const result = await passwordManagement.initiatePasswordReset.run(mockRequest);

      expect(result).toEqual({
        success: true,
      });

      expect(mockAuth.generatePasswordResetLink).toHaveBeenCalledWith(testData.email);
    });

    it('should handle very long email addresses', async () => {
      const longEmail = 'a'.repeat(100) + '@example.com';
      const testData = {
        email: longEmail,
      };

      mockAuth.getUserByEmail.mockResolvedValue({
        uid: 'test-user-id',
        email: longEmail,
        displayName: 'Test User',
      });

      mockAuth.generatePasswordResetLink.mockResolvedValue(
        'https://example.com/reset-password?token=reset-token-123'
      );

      const { sendEmail } = require('../auth/utils/sendgridHelper');
      (sendEmail as jest.Mock).mockResolvedValue(undefined);

      const mockRequest: CallableRequest<any> = {
        data: testData,
        auth: null,
        rawRequest: {,
    acceptsStreaming: false} as any,
        acceptsStreaming: false,
      };

      const result = await passwordManagement.initiatePasswordReset.run(mockRequest);

      expect(result).toEqual({
        success: true,
      });
    });
  });

  describe('Integration with SendGrid', () => {
    it('should initialize SendGrid before sending email', async () => {
      const { initSendGrid } = require('../auth/config/sendgrid');
      const testData = {
        email: 'user@example.com',
      };

      mockAuth.getUserByEmail.mockResolvedValue({
        uid: 'test-user-id',
        email: testData.email,
        displayName: 'Test User',
      });

      mockAuth.generatePasswordResetLink.mockResolvedValue(
        'https://example.com/reset-password?token=reset-token-123'
      );

      const { sendEmail } = require('../auth/utils/sendgridHelper');
      (sendEmail as jest.Mock).mockResolvedValue(undefined);

      const mockRequest: CallableRequest<any> = {
        data: testData,
        auth: null,
        rawRequest: {,
    acceptsStreaming: false} as any,
        acceptsStreaming: false,
      };

      await passwordManagement.initiatePasswordReset.run(mockRequest);

      // Verify SendGrid was initialized
      expect(initSendGrid).toHaveBeenCalled();
    });
  });

  describe('Security Considerations', () => {
    it('should sanitize user input in logs', async () => {
      const { sanitizeEmail, sanitizeUserId } = require('../utils/sanitization');
      const testData = {
        email: 'user@example.com',
      };

      // Make the function fail to trigger error logging
      mockAuth.generatePasswordResetLink.mockRejectedValue(
        new Error('Test error')
      );

      const mockRequest: CallableRequest<any> = {
        data: testData,
        auth: null,
        rawRequest: {,
    acceptsStreaming: false} as any,
        acceptsStreaming: false,
      };

      try {
        await passwordManagement.initiatePasswordReset.run(mockRequest);
      } catch (error) {
        // Expected to throw
      }

      // Verify email was sanitized in error logs
      expect(sanitizeEmail).toHaveBeenCalledWith(testData.email);
    });

    it('should enable CSRF protection', async () => {
      // Verify both functions have CSRF enabled
      const updatePasswordCall = mockWithAuth.mock.calls.find(
        call => call[1] === 'updateUserPassword'
      );
      const resetPasswordCall = mockWithAuth.mock.calls.find(
        call => call[1] === 'initiatePasswordReset'
      );

      expect(updatePasswordCall[2].enableCSRF).toBe(true);
      expect(resetPasswordCall[2].enableCSRF).toBe(true);
    });
  });
});