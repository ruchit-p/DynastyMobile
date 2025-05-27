import { describe, test, expect, beforeEach, jest } from '@jest/globals';
import { validateRequest } from '../utils/request-validator';
import { VALIDATION_SCHEMAS } from '../config/validation-schemas';

// Mock Firebase Admin
jest.mock('firebase-admin', () => ({
  apps: [],
  initializeApp: jest.fn(),
  firestore: jest.fn(() => ({
    collection: jest.fn(() => ({
      doc: jest.fn(() => ({
        get: jest.fn(),
        set: jest.fn(),
        update: jest.fn(),
        delete: jest.fn()
      })),
      where: jest.fn(() => ({
        get: jest.fn(),
        limit: jest.fn(() => ({
          get: jest.fn()
        }))
      }))
    }))
  })),
  auth: jest.fn(() => ({
    createUser: jest.fn(),
    getUser: jest.fn(),
    updateUser: jest.fn()
  }))
}));

// Mock SendGrid
jest.mock('@sendgrid/mail', () => ({
  setApiKey: jest.fn(),
  send: jest.fn()
}));

describe('Functions Integration with Validation', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Authentication Functions Validation', () => {
    test('handleSignUp should validate email and password', () => {
      // Test invalid inputs
      const invalidInputs = [
        { email: 'invalid', password: '123' },
        { email: 'test@example.com' }, // missing password
        { password: 'password123' }, // missing email
        { email: '', password: '' }, // empty strings
      ];

      invalidInputs.forEach(input => {
        expect(() => validateRequest(input, VALIDATION_SCHEMAS.signup)).toThrow();
      });

      // Test valid input
      const validInput = { email: 'test@example.com', password: 'securePassword123' };
      const result = validateRequest(validInput, VALIDATION_SCHEMAS.signup);
      expect(result).toEqual(validInput);
    });

    test('completeOnboarding should validate all profile fields', () => {
      const validInput = {
        firstName: 'John',
        lastName: 'Doe',
        displayName: 'John Doe',
        gender: 'male',
        dateOfBirth: '1990-01-01',
        phone: '+1234567890'
      };

      const result = validateRequest(validInput, VALIDATION_SCHEMAS.completeOnboarding);
      expect(result.firstName).toBe('John');
      expect(result.gender).toBe('male');
    });

    test('sendFamilyTreeInvitation should validate all invitation fields', () => {
      const validInput = {
        inviteeId: 'user123',
        inviteeEmail: 'invitee@example.com',
        inviterId: 'inviter123',
        familyTreeId: 'family123',
        inviterName: 'John Doe',
        inviteeName: 'Jane Smith',
        familyTreeName: 'Doe Family',
        firstName: 'Jane',
        lastName: 'Smith',
        dateOfBirth: '1995-05-15',
        gender: 'female',
        phoneNumber: '+1234567890',
        relationship: 'cousin'
      };

      const result = validateRequest(validInput, VALIDATION_SCHEMAS.sendFamilyTreeInvitation);
      expect(result.inviteeEmail).toBe('invitee@example.com');
      expect(result.gender).toBe('female');
    });
  });

  describe('Event Functions Validation', () => {
    test('createEvent should validate all event fields', () => {
      const validInput = {
        title: 'Family Reunion 2024',
        description: 'Annual family gathering',
        eventDate: '2024-07-04',
        endDate: '2024-07-05',
        startTime: '10:00',
        endTime: '18:00',
        timezone: 'America/New_York',
        location: {
          lat: 40.7128,
          lng: -74.0060,
          address: 'New York, NY'
        },
        isVirtual: false,
        privacy: 'family_tree',
        allowGuestPlusOne: true,
        showGuestList: true,
        requireRsvp: true,
        rsvpDeadline: '2024-06-30',
        capacity: 100,
        invitedMemberIds: ['member1', 'member2', 'member3']
      };

      const result = validateRequest(validInput, VALIDATION_SCHEMAS.createEvent);
      expect(result.title).toBe('Family Reunion 2024');
      expect(result.privacy).toBe('family_tree');
      expect(result.invitedMemberIds).toHaveLength(3);
    });

    test('updateEvent should allow partial updates', () => {
      const partialUpdate = {
        eventId: 'event123',
        title: 'Updated Title',
        capacity: 150
      };

      const result = validateRequest(partialUpdate, VALIDATION_SCHEMAS.updateEvent);
      expect(result.eventId).toBe('event123');
      expect(result.title).toBe('Updated Title');
      expect(result.capacity).toBe(150);
    });
  });

  describe('Chat Functions Validation', () => {
    test('createChat should validate chat creation', () => {
      const validInput = {
        name: 'Family Chat',
        participants: ['user1', 'user2', 'user3'],
        participantIds: ['user1', 'user2', 'user3'],
        type: 'group',
        metadata: {
          description: 'Family discussion group'
        }
      };

      const result = validateRequest(validInput, VALIDATION_SCHEMAS.createChat);
      expect(result.name).toBe('Family Chat');
      expect(result.participants).toHaveLength(3);
    });

    test('sendMessage should validate message structure', () => {
      const validInputs = [
        {
          chatId: 'chat123',
          text: 'Hello everyone!',
          type: 'text'
        },
        {
          chatId: 'chat123',
          text: 'Check out this photo',
          type: 'text',
          attachments: [{
            type: 'image',
            url: 'https://example.com/photo.jpg',
            name: 'family-photo.jpg',
            size: 2048000
          }]
        },
        {
          chatId: 'chat123',
          text: '',
          type: 'voice',
          attachments: [{
            type: 'audio',
            url: 'https://example.com/voice.mp3',
            name: 'voice-message.mp3',
            size: 512000,
            duration: 30
          }]
        }
      ];

      validInputs.forEach(input => {
        const result = validateRequest(input, VALIDATION_SCHEMAS.sendMessage);
        expect(result.chatId).toBe('chat123');
        expect(result.type).toBeDefined();
      });
    });
  });

  describe('Vault Functions Validation', () => {
    test('uploadFile should validate file metadata', () => {
      const validInput = {
        fileName: 'family-document.pdf',
        fileSize: 5242880, // 5MB
        mimeType: 'application/pdf',
        folderId: 'folder123',
        metadata: {
          description: 'Important family document'
        }
      };

      const result = validateRequest(validInput, VALIDATION_SCHEMAS.uploadFile);
      expect(result.fileName).toBe('family-document.pdf');
      expect(result.fileSize).toBe(5242880);
    });

    test('shareVaultItem should validate sharing permissions', () => {
      const validInput = {
        itemId: 'item123',
        userIds: ['user1', 'user2', 'user3'],
        permissions: 'read'
      };

      const result = validateRequest(validInput, VALIDATION_SCHEMAS.shareVaultItem);
      expect(result.permissions).toBe('read');
      expect(result.userIds).toHaveLength(3);

      // Test invalid permission
      expect(() => validateRequest({
        ...validInput,
        permissions: 'execute'
      }, VALIDATION_SCHEMAS.shareVaultItem)).toThrow('Invalid permissions');
    });
  });

  describe('Device Fingerprint Validation', () => {
    test('verifyDeviceFingerprint should validate fingerprint data', () => {
      const validInput = {
        requestId: 'req_123456',
        visitorId: 'visitor_abc123',
        deviceInfo: {
          platform: 'iOS',
          version: '15.0',
          model: 'iPhone 13',
          appVersion: '1.2.3'
        }
      };

      const result = validateRequest(validInput, VALIDATION_SCHEMAS.verifyDeviceFingerprint);
      expect(result.requestId).toBe('req_123456');
      expect(result.deviceInfo.platform).toBe('iOS');
    });
  });

  describe('Sync Functions Validation', () => {
    test('enqueueSyncOperation should validate sync operations', () => {
      const validInput = {
        operationType: 'update',
        collection: 'stories',
        documentId: 'story123',
        operationData: {
          title: 'Updated Story Title',
          lastModified: new Date().toISOString()
        },
        conflictResolution: 'client_wins',
        clientVersion: 5,
        serverVersion: 4
      };

      const result = validateRequest(validInput, VALIDATION_SCHEMAS.enqueueSyncOperation);
      expect(result.operationType).toBe('update');
      expect(result.clientVersion).toBe(5);
    });

    test('batchSyncOperations should validate batch size', () => {
      const operations = Array(50).fill(null).map((_, i) => ({
        operationType: 'create',
        collection: 'events',
        documentId: `event${i}`,
        data: { title: `Event ${i}` }
      }));

      const validInput = {
        operations,
        deviceId: 'device123'
      };

      const result = validateRequest(validInput, VALIDATION_SCHEMAS.batchSyncOperations);
      expect(result.operations).toHaveLength(50);

      // Test exceeding max size
      const tooManyOperations = {
        operations: Array(51).fill(operations[0]),
        deviceId: 'device123'
      };

      expect(() => validateRequest(tooManyOperations, VALIDATION_SCHEMAS.batchSyncOperations))
        .toThrow('exceeds maximum size');
    });
  });

  describe('XSS Protection Integration', () => {
    test('should sanitize user input across all functions', () => {
      const xssAttempts = [
        '<script>alert("XSS")</script>',
        '<img src=x onerror=alert("XSS")>',
        'javascript:alert("XSS")',
        '<iframe src="javascript:alert(\'XSS\')"></iframe>'
      ];

      // Test createEvent
      xssAttempts.forEach(xss => {
        expect(() => validateRequest({
          title: xss,
          eventDate: '2024-01-01',
          isVirtual: false,
          privacy: 'public'
        }, VALIDATION_SCHEMAS.createEvent, 'user123')).toThrow('XSS attempt detected');
      });

      // Test sendMessage
      xssAttempts.forEach(xss => {
        expect(() => validateRequest({
          chatId: 'chat123',
          text: xss,
          type: 'text'
        }, VALIDATION_SCHEMAS.sendMessage, 'user123')).toThrow('XSS attempt detected');
      });

      // Test updateUserProfile
      xssAttempts.forEach(xss => {
        expect(() => validateRequest({
          uid: 'user123',
          displayName: xss
        }, VALIDATION_SCHEMAS.updateUserProfile, 'user123')).toThrow('XSS attempt detected');
      });
    });
  });

  describe('Data Sanitization', () => {
    test('should trim whitespace from string fields', () => {
      const input = {
        title: '  Event Title  ',
        description: '  Description with spaces  ',
        eventDate: '2024-01-01',
        isVirtual: false,
        privacy: 'public'
      };

      const result = validateRequest(input, VALIDATION_SCHEMAS.createEvent);
      expect(result.title).toBe('Event Title');
      expect(result.description).toBe('Description with spaces');
    });

    test('should handle special characters correctly', () => {
      const input = {
        title: 'Q&A Session: "Best Practices"',
        description: 'Join us for <important> discussions & more',
        eventDate: '2024-01-01',
        isVirtual: false,
        privacy: 'public'
      };

      const result = validateRequest(input, VALIDATION_SCHEMAS.createEvent);
      expect(result.title).toContain('Q&amp;A Session');
      expect(result.description).toContain('&lt;important&gt;');
    });
  });
});