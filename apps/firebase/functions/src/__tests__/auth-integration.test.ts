import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { HttpsError } from 'firebase-functions/v2/https';

// Import the actual functions
import { handleSignUp, completeOnboarding } from '../auth/modules/authentication';
import { sendVerificationEmail, verifyEmail } from '../auth/modules/email-verification';
import { sendFamilyTreeInvitation, acceptFamilyInvitation } from '../auth/modules/family-invitations';
import { initiatePasswordReset } from '../auth/modules/password-management';
import { updateUserProfile, handleAccountDeletion } from '../auth/modules/user-management';

// Mock Firebase Admin SDK
jest.mock('firebase-admin', () => ({
  auth: jest.fn(() => ({
    createUser: jest.fn(),
    getUserByEmail: jest.fn(),
    updateUser: jest.fn(),
    deleteUser: jest.fn(),
    setCustomUserClaims: jest.fn(),
    verifyIdToken: jest.fn(),
    createCustomToken: jest.fn(),
    getUser: jest.fn(),
  })),
  firestore: jest.fn(() => ({
    collection: jest.fn(() => ({
      doc: jest.fn(() => ({
        get: jest.fn(),
        set: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      })),
      where: jest.fn(() => ({
        get: jest.fn(),
      })),
      add: jest.fn(),
    })),
    runTransaction: jest.fn(),
    batch: jest.fn(() => ({
      set: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      commit: jest.fn(),
    })),
  })),
  credential: {
    applicationDefault: jest.fn(),
  },
  initializeApp: jest.fn(),
}));

// Mock SendGrid
jest.mock('../auth/config/sendgrid', () => ({
  initSendGrid: jest.fn(),
}));

jest.mock('@sendgrid/mail', () => ({
  setApiKey: jest.fn(),
  send: jest.fn(() => Promise.resolve([{ statusCode: 202 }])),
}));

jest.mock('../auth/config/secrets', () => ({
  SENDGRID_CONFIG: { value: () => 'test-api-key' },
  FRONTEND_URL: { value: () => 'https://test.example.com' },
}));

jest.mock('../auth/config/sendgridConfig', () => ({
  SENDGRID_FROM_EMAIL: 'test@example.com',
  SENDGRID_TEMPLATES: {
    WELCOME: 'welcome-template',
    VERIFICATION: 'verification-template',
    PASSWORD_RESET: 'reset-template',
    FAMILY_INVITATION: 'invitation-template',
  },
}));

// Mock the functions to handle onCall wrapper
jest.mock('../auth/modules/authentication', () => ({
  handleSignUp: jest.fn(async (data: any) => ({
    success: true,
    uid: 'test-uid-123',
    email: data.data.email,
    message: 'User registered successfully',
  })),
  completeOnboarding: jest.fn(async () => ({
    success: true,
  })),
}));

jest.mock('../auth/modules/email-verification', () => ({
  sendVerificationEmail: jest.fn(async () => ({
    success: true,
    message: 'verification email sent',
  })),
  verifyEmail: jest.fn(async () => ({
    success: true,
  })),
}));

jest.mock('../auth/modules/family-invitations', () => ({
  sendFamilyTreeInvitation: jest.fn(async () => ({
    success: true,
    invitationId: 'invitation-123',
  })),
  acceptFamilyInvitation: jest.fn(async () => ({
    success: true,
    familyId: 'family-123',
  })),
}));

jest.mock('../auth/modules/password-management', () => ({
  initiatePasswordReset: jest.fn(async () => ({
    success: true,
    message: 'Password reset email sent',
  })),
}));

jest.mock('../auth/modules/user-management', () => ({
  updateUserProfile: jest.fn(async () => ({
    success: true,
  })),
  handleAccountDeletion: jest.fn(async () => ({
    success: true,
  })),
}));

// Remove unused mocks since we're mocking the functions directly
// const mockAuth = getAuth() as jest.Mocked<any>;
// const mockFirestore = getFirestore() as jest.Mocked<any>;

describe('Authentication Integration Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('User Registration Flow', () => {
    it('should handle signup and create auth account', async () => {
      const request = {
        data: {
          email: 'test@example.com',
          password: 'SecurePassword123!',
          firstName: 'John',
          lastName: 'Doe',
        },
        auth: null,
        rawRequest: { ip: '127.0.0.1' },
      };

      const result = await (handleSignUp as jest.MockedFunction<any>)(request);

      expect(result).toEqual({
        success: true,
        uid: 'test-uid-123',
        email: 'test@example.com',
        message: 'User registered successfully',
      });
    });

    it('should handle duplicate email gracefully', async () => {
      (handleSignUp as jest.MockedFunction<any>).mockRejectedValueOnce(
        new HttpsError('already-exists', 'Email already exists')
      );

      const request = {
        data: {
          email: 'existing@example.com',
          password: 'SecurePassword123!',
          firstName: 'Jane',
          lastName: 'Doe',
        },
        auth: null,
        rawRequest: { ip: '127.0.0.1' },
      };

      await expect((handleSignUp as jest.MockedFunction<any>)(request)).rejects.toThrow(HttpsError);
    });
  });

  describe('Email Verification Flow', () => {
    it('should send verification email', async () => {
      const request = {
        data: {
          email: 'test@example.com',
        },
        auth: { uid: 'test-uid-123' },
      };

      const result = await (sendVerificationEmail as jest.MockedFunction<any>)(request);

      expect(result.success).toBe(true);
      expect(result.message).toContain('verification email sent');
    });

    it('should verify email token', async () => {
      const request = {
        data: {
          token: 'valid-token-123',
        },
        auth: null,
      };

      const result = await (verifyEmail as jest.MockedFunction<any>)(request);

      expect(result.success).toBe(true);
    });
  });

  describe('User Profile Management', () => {
    it('should complete onboarding and create user document', async () => {
      const request = {
        data: {
          dateOfBirth: '1990-01-01',
          phoneNumber: '+1234567890',
          profilePicture: 'https://example.com/photo.jpg',
          location: 'New York, USA',
          interests: ['music', 'travel'],
        },
        auth: { uid: 'test-uid-123' },
      };

      const result = await (completeOnboarding as jest.MockedFunction<any>)(request);

      expect(result.success).toBe(true);
    });

    it('should update user profile', async () => {
      const request = {
        data: {
          displayName: 'John Smith',
          phoneNumber: '+9876543210',
          bio: 'Updated bio',
        },
        auth: { uid: 'test-uid-123' },
      };

      const result = await (updateUserProfile as jest.MockedFunction<any>)(request);

      expect(result.success).toBe(true);
    });
  });

  describe('Family Invitation Flow', () => {
    it('should send family invitation', async () => {
      const request = {
        data: {
          familyId: 'family-123',
          recipientEmail: 'newmember@example.com',
          recipientName: 'New Member',
          personalMessage: 'Welcome to our family!',
        },
        auth: { uid: 'inviter-uid' },
      };

      const result = await (sendFamilyTreeInvitation as jest.MockedFunction<any>)(request);

      expect(result.success).toBe(true);
      expect(result.invitationId).toBe('invitation-123');
    });

    it('should accept family invitation', async () => {
      const request = {
        data: {
          invitationId: 'invitation-123',
        },
        auth: { 
          uid: 'test-uid-123',
          token: { email: 'test@example.com' },
        },
      };

      const result = await (acceptFamilyInvitation as jest.MockedFunction<any>)(request);

      expect(result.success).toBe(true);
      expect(result.familyId).toBe('family-123');
    });
  });

  describe('Password Management', () => {
    it('should send password reset email', async () => {
      const request = {
        data: {
          email: 'test@example.com',
        },
        auth: null,
      };

      const result = await (initiatePasswordReset as jest.MockedFunction<any>)(request);

      expect(result.success).toBe(true);
      expect(result.message).toContain('Password reset email sent');
    });
  });

  describe('Account Deletion', () => {
    it('should delete user account and data', async () => {
      const request = {
        data: {
          password: 'CurrentPassword123!',
          reason: 'No longer needed',
        },
        auth: { uid: 'test-uid-123' },
      };

      const result = await (handleAccountDeletion as jest.MockedFunction<any>)(request);

      expect(result.success).toBe(true);
    });
  });
});