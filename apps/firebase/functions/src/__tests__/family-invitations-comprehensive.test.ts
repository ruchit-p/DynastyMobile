import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import * as admin from 'firebase-admin';
import { 
  sendFamilyTreeInvitation, 
  acceptFamilyInvitation,
  inviteUserToFamily
} from '../auth/modules/family-invitations';
import * as sendgridHelper from '../auth/utils/sendgridHelper';
import * as tokens from '../auth/utils/tokens';
import * as twilioService from '../services/twilioService';
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
        fromMillis: jest.fn((millis) => ({ ...mockTimestamp, toMillis: () => millis })),
      },
    })),
    auth: jest.fn(() => ({
      getUser: jest.fn(),
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
  generateSecureToken: jest.fn(() => 'mock-invitation-token'),
  hashToken: jest.fn((token: string) => `hashed-${token}`),
}));

// Mock Twilio service
jest.mock('../services/twilioService', () => ({
  getTwilioService: jest.fn(() => ({
    sendSms: jest.fn(() => Promise.resolve()),
  })),
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
  withErrorHandling: jest.fn((handler) => ({
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
const createRequest = (data: any, auth: any = { uid: 'inviter-id' }) => ({
  data,
  auth,
  rawRequest: { ip: '127.0.0.1' },
  acceptsStreaming: false,
});

describe('Family Invitations - Comprehensive Tests', () => {
  let mockAuth: any;
  let mockFirestore: any;
  let mockTwilioService: any;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.FUNCTIONS_EMULATOR = 'true';
    process.env.SENDGRID_API_KEY = 'test-api-key';
    process.env.FRONTEND_URL = 'https://test.example.com';
    
    mockAuth = admin.auth() as any;
    mockFirestore = admin.firestore() as any;
    mockTwilioService = {
      sendSms: jest.fn(() => Promise.resolve()),
    };
    (twilioService.getTwilioService as jest.Mock).mockReturnValue(mockTwilioService);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('sendFamilyTreeInvitation', () => {
    describe('Success Cases', () => {
      it('should send invitation email with prefilled data', async () => {
        // Mock inviter document
        const mockInviterDoc = {
          exists: true,
          data: () => ({
            displayName: 'John Inviter',
            firstName: 'John',
            lastName: 'Inviter',
          }),
        };
        const mockInviterRef = {
          get: jest.fn(() => Promise.resolve(mockInviterDoc)),
        };

        // Mock invitation document creation
        const mockInvitationRef = {
          id: 'invitation-123',
          set: jest.fn(() => Promise.resolve()),
        };

        mockFirestore.collection.mockImplementation((collection: string) => {
          if (collection === 'users') {
            return {
              doc: jest.fn(() => mockInviterRef),
            };
          }
          if (collection === 'familyInvitations') {
            return {
              doc: jest.fn(() => mockInvitationRef),
            };
          }
          return {
            doc: jest.fn(() => ({ set: jest.fn() })),
          };
        });

        const request = createRequest({
          inviteeId: 'invitee-123',
          inviteeEmail: 'invitee@example.com',
          inviteeName: 'Jane Doe',
          inviterId: 'inviter-id', // Will be overridden by auth.uid
          inviterName: 'John', // Will be fetched from DB
          familyTreeId: 'family-tree-123',
          familyTreeName: 'The Doe Family',
          firstName: 'Jane',
          lastName: 'Doe',
          dateOfBirth: '1990-01-01',
          gender: 'female',
          phoneNumber: '+1234567890',
          relationship: 'child',
        });

        const result = await sendFamilyTreeInvitation.run(request);

        expect(result).toEqual({
          success: true,
          invitationId: 'invitation-123',
        });

        // Verify invitation was stored with correct data
        expect(mockInvitationRef.set).toHaveBeenCalledWith(
          expect.objectContaining({
            id: 'invitation-123',
            inviteeId: 'invitee-123',
            inviteeEmail: 'invitee@example.com',
            inviterId: 'inviter-id', // From auth.uid
            familyTreeId: 'family-tree-123',
            token: 'hashed-mock-invitation-token',
            status: 'pending',
            prefillData: {
              firstName: 'Jane',
              lastName: 'Doe',
              dateOfBirth: '1990-01-01',
              gender: 'female',
              phoneNumber: '+1234567890',
              relationshipToInviter: 'child',
            },
          })
        );

        // Verify email was sent
        expect(sendgridHelper.sendEmail).toHaveBeenCalledWith({
          to: 'invitee@example.com',
          templateType: 'invite',
          dynamicTemplateData: expect.objectContaining({
            name: 'Jane Doe',
            inviterName: 'John Inviter',
            familyTreeName: 'The Doe Family',
            acceptLink: expect.stringContaining('mock-invitation-token'),
          }),
        });

        // Verify SMS was sent
        expect(mockTwilioService.sendSms).toHaveBeenCalledWith(
          expect.objectContaining({
            to: '+1234567890',
            body: expect.stringContaining('John Inviter invited you'),
          }),
          'inviter-id',
          'family_invite',
          expect.any(Object)
        );
      });

      it('should handle invitation without phone number', async () => {
        const mockInviterDoc = {
          exists: true,
          data: () => ({
            displayName: 'John Inviter',
          }),
        };
        const mockInviterRef = {
          get: jest.fn(() => Promise.resolve(mockInviterDoc)),
        };

        const mockInvitationRef = {
          id: 'invitation-123',
          set: jest.fn(() => Promise.resolve()),
        };

        mockFirestore.collection.mockImplementation((collection: string) => {
          if (collection === 'users') {
            return {
              doc: jest.fn(() => mockInviterRef),
            };
          }
          if (collection === 'familyInvitations') {
            return {
              doc: jest.fn(() => mockInvitationRef),
            };
          }
          return {
            doc: jest.fn(() => ({ set: jest.fn() })),
          };
        });

        const request = createRequest({
          inviteeId: 'invitee-123',
          inviteeEmail: 'invitee@example.com',
          inviteeName: 'Jane Doe',
          familyTreeId: 'family-tree-123',
          familyTreeName: 'The Doe Family',
          // No phone number
        });

        const result = await sendFamilyTreeInvitation.run(request);

        expect(result.success).toBe(true);
        
        // Should send email but not SMS
        expect(sendgridHelper.sendEmail).toHaveBeenCalled();
        expect(mockTwilioService.sendSms).not.toHaveBeenCalled();
      });

      it('should handle SMS failure gracefully', async () => {
        const mockInviterDoc = {
          exists: true,
          data: () => ({
            displayName: 'John Inviter',
          }),
        };
        const mockInviterRef = {
          get: jest.fn(() => Promise.resolve(mockInviterDoc)),
        };

        const mockInvitationRef = {
          id: 'invitation-123',
          set: jest.fn(() => Promise.resolve()),
        };

        mockFirestore.collection.mockImplementation((collection: string) => {
          if (collection === 'users') {
            return {
              doc: jest.fn(() => mockInviterRef),
            };
          }
          if (collection === 'familyInvitations') {
            return {
              doc: jest.fn(() => mockInvitationRef),
            };
          }
          return {
            doc: jest.fn(() => ({ set: jest.fn() })),
          };
        });

        // Mock SMS failure
        mockTwilioService.sendSms.mockRejectedValueOnce(new Error('SMS failed'));

        const request = createRequest({
          inviteeId: 'invitee-123',
          inviteeEmail: 'invitee@example.com',
          inviteeName: 'Jane Doe',
          familyTreeId: 'family-tree-123',
          familyTreeName: 'The Doe Family',
          phoneNumber: '+1234567890',
        });

        // Should not throw - SMS failure is not fatal
        const result = await sendFamilyTreeInvitation.run(request);
        expect(result.success).toBe(true);
      });

      it('should use fallback inviter name when not found', async () => {
        // Mock inviter document not found
        const mockInviterRef = {
          get: jest.fn(() => Promise.resolve({ exists: false })),
        };

        const mockInvitationRef = {
          id: 'invitation-123',
          set: jest.fn(() => Promise.resolve()),
        };

        mockFirestore.collection.mockImplementation((collection: string) => {
          if (collection === 'users') {
            return {
              doc: jest.fn(() => mockInviterRef),
            };
          }
          if (collection === 'familyInvitations') {
            return {
              doc: jest.fn(() => mockInvitationRef),
            };
          }
          return {
            doc: jest.fn(() => ({ set: jest.fn() })),
          };
        });

        const request = createRequest({
          inviteeId: 'invitee-123',
          inviteeEmail: 'invitee@example.com',
          inviteeName: 'Jane Doe',
          familyTreeId: 'family-tree-123',
          familyTreeName: 'The Doe Family',
        });

        const result = await sendFamilyTreeInvitation.run(request);

        expect(result.success).toBe(true);
        
        // Verify fallback inviter name was used
        expect(sendgridHelper.sendEmail).toHaveBeenCalledWith(
          expect.objectContaining({
            dynamicTemplateData: expect.objectContaining({
              inviterName: 'A family member', // Fallback
            }),
          })
        );
      });
    });

    describe('Error Cases', () => {
      it('should throw error if not authenticated', async () => {
        const request = createRequest({
          inviteeEmail: 'invitee@example.com',
        }, null); // No auth

        await expect(sendFamilyTreeInvitation.run(request)).rejects.toThrow('Authentication required');
      });

      it('should handle SendGrid failure', async () => {
        const mockInviterDoc = {
          exists: true,
          data: () => ({
            displayName: 'John Inviter',
          }),
        };
        const mockInviterRef = {
          get: jest.fn(() => Promise.resolve(mockInviterDoc)),
        };

        const mockInvitationRef = {
          id: 'invitation-123',
          set: jest.fn(() => Promise.resolve()),
        };

        mockFirestore.collection.mockImplementation((collection: string) => {
          if (collection === 'users') {
            return {
              doc: jest.fn(() => mockInviterRef),
            };
          }
          if (collection === 'familyInvitations') {
            return {
              doc: jest.fn(() => mockInvitationRef),
            };
          }
          return {
            doc: jest.fn(() => ({ set: jest.fn() })),
          };
        });

        // Mock SendGrid failure
        (sendgridHelper.sendEmail as jest.Mock).mockRejectedValueOnce(
          new Error('SendGrid error')
        );

        const request = createRequest({
          inviteeId: 'invitee-123',
          inviteeEmail: 'invitee@example.com',
          inviteeName: 'Jane Doe',
          familyTreeId: 'family-tree-123',
          familyTreeName: 'The Doe Family',
        });

        await expect(sendFamilyTreeInvitation.run(request)).rejects.toThrow('SendGrid error');
      });
    });
  });

  describe('acceptFamilyInvitation', () => {
    describe('Success Cases', () => {
      it('should accept valid invitation and update user', async () => {
        const invitationToken = 'valid-token';
        const hashedToken = 'hashed-valid-token';
        const userId = 'accepting-user-id';
        const familyTreeId = 'family-tree-123';

        // Mock invitation query
        const mockInvitation = {
          id: 'invitation-123',
          data: () => ({
            token: hashedToken,
            status: 'pending',
            inviteeEmail: 'user@example.com',
            familyTreeId,
            invitationExpires: { toMillis: () => Date.now() + 3600000 }, // 1 hour from now
            prefillData: {
              firstName: 'Jane',
              lastName: 'Doe',
              gender: 'female',
              dateOfBirth: '1990-01-01',
              phoneNumber: '+1234567890',
              relationshipToInviter: 'child',
            },
          }),
          ref: {
            update: jest.fn(() => Promise.resolve()),
          },
        };

        const mockSnapshot = {
          empty: false,
          docs: [mockInvitation],
        };

        // Mock user auth record
        mockAuth.getUser.mockResolvedValueOnce({
          uid: userId,
          email: 'user@example.com',
        });

        // Mock user document update
        const mockUserRef = {
          update: jest.fn(() => Promise.resolve()),
        };

        mockFirestore.collection.mockImplementation((collection: string) => {
          if (collection === 'familyInvitations') {
            return {
              where: jest.fn(() => ({
                limit: jest.fn(() => ({
                  get: jest.fn(() => Promise.resolve(mockSnapshot)),
                })),
              })),
            };
          }
          if (collection === 'users') {
            return {
              doc: jest.fn(() => mockUserRef),
            };
          }
          return {
            doc: jest.fn(() => ({ update: jest.fn() })),
          };
        });

        // Mock token hashing
        (tokens.hashToken as jest.Mock).mockReturnValueOnce(hashedToken);

        const request = createRequest({
          invitationToken,
        }, { uid: userId });

        const result = await acceptFamilyInvitation.run(request);

        expect(result).toEqual({
          success: true,
          message: 'Invitation accepted successfully!',
          familyTreeId,
        });

        // Verify user was updated with family tree and prefill data
        expect(mockUserRef.update).toHaveBeenCalledWith(
          expect.objectContaining({
            familyTreeId,
            firstName: 'Jane',
            lastName: 'Doe',
            gender: 'female',
            phoneNumber: '+1234567890',
          })
        );

        // Verify invitation was marked as accepted
        expect(mockInvitation.ref.update).toHaveBeenCalledWith(
          expect.objectContaining({
            status: 'accepted',
            acceptedByUserId: userId,
          })
        );
      });

      it('should handle invitation without prefill data', async () => {
        const invitationToken = 'valid-token';
        const hashedToken = 'hashed-valid-token';
        const userId = 'accepting-user-id';
        const familyTreeId = 'family-tree-123';

        const mockInvitation = {
          id: 'invitation-123',
          data: () => ({
            token: hashedToken,
            status: 'pending',
            inviteeEmail: 'user@example.com',
            familyTreeId,
            invitationExpires: { toMillis: () => Date.now() + 3600000 },
            // No prefillData
          }),
          ref: {
            update: jest.fn(() => Promise.resolve()),
          },
        };

        const mockSnapshot = {
          empty: false,
          docs: [mockInvitation],
        };

        mockAuth.getUser.mockResolvedValueOnce({
          uid: userId,
          email: 'user@example.com',
        });

        const mockUserRef = {
          update: jest.fn(() => Promise.resolve()),
        };

        mockFirestore.collection.mockImplementation((collection: string) => {
          if (collection === 'familyInvitations') {
            return {
              where: jest.fn(() => ({
                limit: jest.fn(() => ({
                  get: jest.fn(() => Promise.resolve(mockSnapshot)),
                })),
              })),
            };
          }
          if (collection === 'users') {
            return {
              doc: jest.fn(() => mockUserRef),
            };
          }
          return {
            doc: jest.fn(() => ({ update: jest.fn() })),
          };
        });

        (tokens.hashToken as jest.Mock).mockReturnValueOnce(hashedToken);

        const request = createRequest({
          invitationToken,
        }, { uid: userId });

        const result = await acceptFamilyInvitation.run(request);

        expect(result.success).toBe(true);

        // Should only update familyTreeId, not prefill fields
        const updateCall = mockUserRef.update.mock.calls[0][0];
        expect(updateCall.familyTreeId).toBe(familyTreeId);
        expect(updateCall.firstName).toBeUndefined();
        expect(updateCall.lastName).toBeUndefined();
      });
    });

    describe('Error Cases', () => {
      it('should reject if not authenticated', async () => {
        const request = createRequest({
          invitationToken: 'some-token',
        }, null); // No auth

        await expect(acceptFamilyInvitation.run(request)).rejects.toThrow('authenticated');
      });

      it('should reject invalid token', async () => {
        const invitationToken = 'invalid-token';
        const hashedToken = 'hashed-invalid-token';

        const mockSnapshot = {
          empty: true, // No matching invitation
          docs: [],
        };

        mockFirestore.collection.mockImplementation((collection: string) => {
          if (collection === 'familyInvitations') {
            return {
              where: jest.fn(() => ({
                limit: jest.fn(() => ({
                  get: jest.fn(() => Promise.resolve(mockSnapshot)),
                })),
              })),
            };
          }
          return {
            doc: jest.fn(() => ({ update: jest.fn() })),
          };
        });

        (tokens.hashToken as jest.Mock).mockReturnValueOnce(hashedToken);

        const request = createRequest({
          invitationToken,
        }, { uid: 'user-id' });

        await expect(acceptFamilyInvitation.run(request)).rejects.toThrow('Invalid or expired invitation');
      });

      it('should reject expired invitation', async () => {
        const invitationToken = 'expired-token';
        const hashedToken = 'hashed-expired-token';

        const mockInvitation = {
          id: 'invitation-123',
          data: () => ({
            token: hashedToken,
            status: 'pending',
            inviteeEmail: 'user@example.com',
            invitationExpires: { toMillis: () => Date.now() - 3600000 }, // 1 hour ago
          }),
          ref: {
            update: jest.fn(() => Promise.resolve()),
          },
        };

        const mockSnapshot = {
          empty: false,
          docs: [mockInvitation],
        };

        mockFirestore.collection.mockImplementation((collection: string) => {
          if (collection === 'familyInvitations') {
            return {
              where: jest.fn(() => ({
                limit: jest.fn(() => ({
                  get: jest.fn(() => Promise.resolve(mockSnapshot)),
                })),
              })),
            };
          }
          return {
            doc: jest.fn(() => ({ update: jest.fn() })),
          };
        });

        (tokens.hashToken as jest.Mock).mockReturnValueOnce(hashedToken);

        const request = createRequest({
          invitationToken,
        }, { uid: 'user-id' });

        await expect(acceptFamilyInvitation.run(request)).rejects.toThrow('expired');

        // Verify invitation was marked as expired
        expect(mockInvitation.ref.update).toHaveBeenCalledWith(
          expect.objectContaining({
            status: 'expired',
          })
        );
      });

      it('should reject if invitation already accepted', async () => {
        const invitationToken = 'already-accepted-token';
        const hashedToken = 'hashed-already-accepted-token';

        const mockInvitation = {
          id: 'invitation-123',
          data: () => ({
            token: hashedToken,
            status: 'accepted', // Already accepted
            inviteeEmail: 'user@example.com',
            invitationExpires: { toMillis: () => Date.now() + 3600000 },
          }),
        };

        const mockSnapshot = {
          empty: false,
          docs: [mockInvitation],
        };

        mockFirestore.collection.mockImplementation((collection: string) => {
          if (collection === 'familyInvitations') {
            return {
              where: jest.fn(() => ({
                limit: jest.fn(() => ({
                  get: jest.fn(() => Promise.resolve(mockSnapshot)),
                })),
              })),
            };
          }
          return {
            doc: jest.fn(() => ({ update: jest.fn() })),
          };
        });

        (tokens.hashToken as jest.Mock).mockReturnValueOnce(hashedToken);

        const request = createRequest({
          invitationToken,
        }, { uid: 'user-id' });

        await expect(acceptFamilyInvitation.run(request)).rejects.toThrow('already been accepted');
      });

      it('should reject if email does not match', async () => {
        const invitationToken = 'valid-token';
        const hashedToken = 'hashed-valid-token';
        const userId = 'wrong-user-id';

        const mockInvitation = {
          id: 'invitation-123',
          data: () => ({
            token: hashedToken,
            status: 'pending',
            inviteeEmail: 'intended@example.com',
            invitationExpires: { toMillis: () => Date.now() + 3600000 },
          }),
        };

        const mockSnapshot = {
          empty: false,
          docs: [mockInvitation],
        };

        // Mock user with different email
        mockAuth.getUser.mockResolvedValueOnce({
          uid: userId,
          email: 'wrong@example.com', // Different email
        });

        mockFirestore.collection.mockImplementation((collection: string) => {
          if (collection === 'familyInvitations') {
            return {
              where: jest.fn(() => ({
                limit: jest.fn(() => ({
                  get: jest.fn(() => Promise.resolve(mockSnapshot)),
                })),
              })),
            };
          }
          return {
            doc: jest.fn(() => ({ update: jest.fn() })),
          };
        });

        (tokens.hashToken as jest.Mock).mockReturnValueOnce(hashedToken);

        const request = createRequest({
          invitationToken,
        }, { uid: userId });

        await expect(acceptFamilyInvitation.run(request)).rejects.toThrow('different email address');
      });
    });
  });

  describe('inviteUserToFamily', () => {
    describe('Success Cases', () => {
      it('should invite user to family tree', async () => {
        const inviterId = 'inviter-id';
        const familyTreeId = 'family-tree-123';

        // Mock inviter document
        const mockInviterDoc = {
          exists: true,
          data: () => ({
            displayName: 'John Inviter',
            firstName: 'John',
            familyTreeId, // Inviter is part of the family tree
          }),
        };
        const mockInviterRef = {
          get: jest.fn(() => Promise.resolve(mockInviterDoc)),
        };

        // Mock invitation creation
        const mockInvitationRef = {
          id: 'invitation-456',
          set: jest.fn(() => Promise.resolve()),
        };

        mockFirestore.collection.mockImplementation((collection: string) => {
          if (collection === 'users') {
            return {
              doc: jest.fn(() => mockInviterRef),
            };
          }
          if (collection === 'familyInvitations') {
            return {
              doc: jest.fn(() => mockInvitationRef),
            };
          }
          return {
            doc: jest.fn(() => ({ set: jest.fn() })),
          };
        });

        const request = createRequest({
          inviteeEmail: 'newmember@example.com',
          inviteeName: 'New Member',
          familyTreeId,
          familyTreeName: 'The Smith Family',
          firstName: 'New',
          lastName: 'Member',
          gender: 'male',
          dateOfBirth: '1995-05-05',
          phoneNumber: '+9876543210',
          relationshipToInviter: 'sibling',
        }, { uid: inviterId });

        const result = await inviteUserToFamily.run(request);

        expect(result).toEqual({
          success: true,
          invitationId: 'invitation-456',
        });

        // Verify invitation was created
        expect(mockInvitationRef.set).toHaveBeenCalledWith(
          expect.objectContaining({
            inviteeEmail: 'newmember@example.com',
            inviteeName: 'New Member',
            inviterId,
            familyTreeId,
            status: 'pending',
            prefillData: {
              firstName: 'New',
              lastName: 'Member',
              gender: 'male',
              dateOfBirth: '1995-05-05',
              phoneNumber: '+9876543210',
              relationshipToInviter: 'sibling',
            },
          })
        );

        // Verify email was sent
        expect(sendgridHelper.sendEmail).toHaveBeenCalledWith({
          to: 'newmember@example.com',
          templateType: 'invite',
          dynamicTemplateData: expect.objectContaining({
            inviterName: 'John Inviter',
            inviteeName: 'New Member',
            familyName: 'The Smith Family',
          }),
        });
      });

      it('should handle minimal invitation data', async () => {
        const inviterId = 'inviter-id';
        const familyTreeId = 'family-tree-123';

        const mockInviterDoc = {
          exists: true,
          data: () => ({
            familyTreeId,
            // No display name or first name
          }),
        };
        const mockInviterRef = {
          get: jest.fn(() => Promise.resolve(mockInviterDoc)),
        };

        const mockInvitationRef = {
          id: 'invitation-456',
          set: jest.fn(() => Promise.resolve()),
        };

        mockFirestore.collection.mockImplementation((collection: string) => {
          if (collection === 'users') {
            return {
              doc: jest.fn(() => mockInviterRef),
            };
          }
          if (collection === 'familyInvitations') {
            return {
              doc: jest.fn(() => mockInvitationRef),
            };
          }
          return {
            doc: jest.fn(() => ({ set: jest.fn() })),
          };
        });

        const request = createRequest({
          inviteeEmail: 'minimal@example.com',
          familyTreeId,
          // Minimal data - no names, prefill data, etc.
        }, { uid: inviterId });

        const result = await inviteUserToFamily.run(request);

        expect(result.success).toBe(true);

        // Verify defaults were used
        expect(sendgridHelper.sendEmail).toHaveBeenCalledWith(
          expect.objectContaining({
            dynamicTemplateData: expect.objectContaining({
              inviterName: 'A family member', // Default
              inviteeName: 'Friend', // Default
              familyName: 'their family tree', // Default
            }),
          })
        );
      });
    });

    describe('Error Cases', () => {
      it('should reject if inviter not part of family tree', async () => {
        const inviterId = 'inviter-id';
        const familyTreeId = 'family-tree-123';

        const mockInviterDoc = {
          exists: true,
          data: () => ({
            displayName: 'John Inviter',
            familyTreeId: 'different-tree-456', // Different family tree
          }),
        };
        const mockInviterRef = {
          get: jest.fn(() => Promise.resolve(mockInviterDoc)),
        };

        mockFirestore.collection.mockImplementation((collection: string) => {
          if (collection === 'users') {
            return {
              doc: jest.fn(() => mockInviterRef),
            };
          }
          return {
            doc: jest.fn(() => ({ set: jest.fn() })),
          };
        });

        const request = createRequest({
          inviteeEmail: 'newmember@example.com',
          familyTreeId,
        }, { uid: inviterId });

        await expect(inviteUserToFamily.run(request)).rejects.toThrow('permission');
      });

      it('should reject if inviter profile not found', async () => {
        const mockInviterRef = {
          get: jest.fn(() => Promise.resolve({ exists: false })),
        };

        mockFirestore.collection.mockImplementation((collection: string) => {
          if (collection === 'users') {
            return {
              doc: jest.fn(() => mockInviterRef),
            };
          }
          return {
            doc: jest.fn(() => ({ set: jest.fn() })),
          };
        });

        const request = createRequest({
          inviteeEmail: 'newmember@example.com',
          familyTreeId: 'family-tree-123',
        });

        await expect(inviteUserToFamily.run(request)).rejects.toThrow('not found');
      });

      it('should handle missing FRONTEND_URL config', async () => {
        const inviterId = 'inviter-id';
        const familyTreeId = 'family-tree-123';

        // Mock empty frontend URL
        (FRONTEND_URL.value as jest.Mock).mockReturnValueOnce('');

        const mockInviterDoc = {
          exists: true,
          data: () => ({
            familyTreeId,
          }),
        };
        const mockInviterRef = {
          get: jest.fn(() => Promise.resolve(mockInviterDoc)),
        };

        const mockInvitationRef = {
          id: 'invitation-456',
          set: jest.fn(() => Promise.resolve()),
          update: jest.fn(() => Promise.resolve()),
        };

        mockFirestore.collection.mockImplementation((collection: string) => {
          if (collection === 'users') {
            return {
              doc: jest.fn(() => mockInviterRef),
            };
          }
          if (collection === 'familyInvitations') {
            return {
              doc: jest.fn(() => mockInvitationRef),
            };
          }
          return {
            doc: jest.fn(() => ({ set: jest.fn() })),
          };
        });

        const request = createRequest({
          inviteeEmail: 'newmember@example.com',
          familyTreeId,
        }, { uid: inviterId });

        await expect(inviteUserToFamily.run(request)).rejects.toThrow('configuration error');

        // Verify invitation was marked as failed
        expect(mockInvitationRef.update).toHaveBeenCalledWith({
          status: 'failed_config_error',
        });
      });
    });
  });
});