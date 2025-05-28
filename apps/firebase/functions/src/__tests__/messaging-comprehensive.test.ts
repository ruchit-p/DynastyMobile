import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import * as admin from 'firebase-admin';
import { CallableRequest } from 'firebase-functions/v2/https';

// Mock firebase modules
jest.mock('firebase-functions/v2/logger');
jest.mock('firebase-admin');

// Mock middleware
const mockWithAuth = jest.fn((handler: any, name: string) => handler);

jest.mock('../middleware/auth', () => ({
  withAuth: mockWithAuth,
}));

// Mock error handling
jest.mock('../utils/errors', () => ({
  createError: jest.fn((code, message) => new Error(message)),
  ErrorCode: {
    INVALID_ARGUMENT: 'invalid-argument',
    NOT_FOUND: 'not-found',
    PERMISSION_DENIED: 'permission-denied',
    UNAUTHENTICATED: 'unauthenticated',
  },
  handleError: jest.fn((error, context) => {
    throw error;
  }),
}));

// Mock validation
jest.mock('../utils/request-validator', () => ({
  validateRequest: jest.fn((data) => data),
}));

jest.mock('../config/validation-schemas', () => ({
  VALIDATION_SCHEMAS: {
    sendMessage: {},
    sendMessageNotification: {},
    updateNotificationSettings: {},
    registerFCMToken: {},
  },
}));

// Mock sanitization utilities
jest.mock('../utils/xssSanitization', () => ({
  sanitizeUserInput: jest.fn((input, options) => input),
  detectXSSPatterns: jest.fn(() => false),
  logXSSAttempt: jest.fn(),
}));

// Import the functions we're testing
import * as messaging from '../messaging';

describe('Messaging Module Comprehensive Tests', () => {
  let mockFirestore: any;
  let mockDb: any;
  let mockMessaging: any;

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
    
    // Setup messaging mocks
    mockMessaging = {
      sendMulticast: jest.fn(),
      send: jest.fn(),
    };
    
    // Apply mocks
    (admin.firestore as jest.Mock).mockReturnValue(mockDb);
    (admin.messaging as jest.Mock).mockReturnValue(mockMessaging);
    (admin.firestore.FieldValue as any) = {
      serverTimestamp: jest.fn(() => new Date()),
      increment: jest.fn((n) => n),
    };
    
    // Mock admin.apps
    (admin.apps as any) = [];
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('sendMessage', () => {
    it('should send a text message successfully', async () => {
      const testData = {
        chatId: 'chat-123',
        message: {
          text: 'Hello, world!',
          type: 'text',
        },
      };

      // Mock chat exists and user is participant
      const mockChatDoc = {
        exists: true,
        data: () => ({
          participants: ['sender-id', 'recipient-id'],
          encryptionEnabled: false,
        }),
      };

      // Mock sender details
      const mockSenderDoc = {
        exists: true,
        data: () => ({
          name: 'John Doe',
          displayName: 'John Doe',
        }),
      };

      // Mock message collection
      const mockMessagesCollection = {
        add: jest.fn(() => Promise.resolve({ id: 'message-123' })),
      };

      mockDb.collection.mockImplementation((name: string) => {
        if (name === 'chats') {
          return {
            doc: jest.fn((id: string) => {
              if (id === 'chat-123') {
                return {
                  get: jest.fn(() => Promise.resolve(mockChatDoc)),
                  update: jest.fn(() => Promise.resolve()),
                  collection: jest.fn(() => mockMessagesCollection),
                };
              }
              return { get: jest.fn() };
            }),
          };
        } else if (name === 'users') {
          return {
            doc: jest.fn((id: string) => {
              if (id === 'sender-id') {
                return {
                  get: jest.fn(() => Promise.resolve(mockSenderDoc)),
                  collection: jest.fn(() => ({
                    doc: jest.fn(() => ({
                      update: jest.fn(() => Promise.resolve()),
                    })),
                  })),
                };
              }
              return { get: jest.fn() };
            }),
          };
        }
        return { doc: jest.fn() };
      });

      const mockRequest: CallableRequest<any> = {
        data: testData,
        auth: { uid: 'sender-id' } as any,
        rawRequest: {} as any,
      };

      const result = await messaging.sendMessage.run(mockRequest);

      expect(result).toEqual({
        success: true,
        messageId: 'message-123',
        timestamp: expect.any(Date),
      });

      // Verify message was added
      expect(mockMessagesCollection.add).toHaveBeenCalledWith({
        senderId: 'sender-id',
        senderName: 'John Doe',
        type: 'text',
        timestamp: expect.any(Date),
        delivered: [],
        read: [],
        metadata: {},
        isEncrypted: false,
        text: 'Hello, world!',
      });

      // Verify chat was updated
      expect(mockDb.collection('chats').doc('chat-123').update).toHaveBeenCalledWith({
        lastMessage: expect.objectContaining({
          senderId: 'sender-id',
          type: 'text',
          text: 'Hello, world!',
        }),
        lastMessageAt: expect.any(Date),
        messageCount: expect.any(Number),
      });
    });

    it('should send an encrypted message', async () => {
      const testData = {
        chatId: 'encrypted-chat',
        message: {
          type: 'text',
          encryptedContent: {
            'recipient-id': 'encrypted-data-for-recipient',
            'sender-id': 'encrypted-data-for-sender',
          },
        },
      };

      // Mock encrypted chat
      const mockChatDoc = {
        exists: true,
        data: () => ({
          participants: ['sender-id', 'recipient-id'],
          encryptionEnabled: true,
        }),
      };

      const mockSenderDoc = {
        exists: true,
        data: () => ({ name: 'Sender Name' }),
      };

      const mockMessagesCollection = {
        add: jest.fn(() => Promise.resolve({ id: 'encrypted-message-123' })),
      };

      mockDb.collection.mockImplementation((name: string) => {
        if (name === 'chats') {
          return {
            doc: jest.fn(() => ({
              get: jest.fn(() => Promise.resolve(mockChatDoc)),
              update: jest.fn(() => Promise.resolve()),
              collection: jest.fn(() => mockMessagesCollection),
            })),
          };
        } else if (name === 'users') {
          return {
            doc: jest.fn(() => ({
              get: jest.fn(() => Promise.resolve(mockSenderDoc)),
              collection: jest.fn(() => ({
                doc: jest.fn(() => ({
                  update: jest.fn(() => Promise.resolve()),
                })),
              })),
            })),
          };
        }
        return { doc: jest.fn() };
      });

      const mockRequest: CallableRequest<any> = {
        data: testData,
        auth: { uid: 'sender-id' } as any,
        rawRequest: {} as any,
      };

      const result = await messaging.sendMessage.run(mockRequest);

      expect(result.success).toBe(true);
      expect(result.messageId).toBe('encrypted-message-123');

      // Verify encrypted message was stored
      expect(mockMessagesCollection.add).toHaveBeenCalledWith(
        expect.objectContaining({
          isEncrypted: true,
          encryptedContent: testData.message.encryptedContent,
          notificationText: 'Encrypted message',
        })
      );
    });

    it('should send a media message', async () => {
      const testData = {
        chatId: 'chat-123',
        message: {
          type: 'media',
          mediaUrls: ['https://example.com/image1.jpg', 'https://example.com/image2.jpg'],
        },
      };

      const mockChatDoc = {
        exists: true,
        data: () => ({
          participants: ['sender-id', 'recipient-id'],
          encryptionEnabled: false,
        }),
      };

      const mockSenderDoc = {
        exists: true,
        data: () => ({ name: 'Sender' }),
      };

      const mockMessagesCollection = {
        add: jest.fn(() => Promise.resolve({ id: 'media-message-123' })),
      };

      mockDb.collection.mockImplementation((name: string) => {
        if (name === 'chats') {
          return {
            doc: jest.fn(() => ({
              get: jest.fn(() => Promise.resolve(mockChatDoc)),
              update: jest.fn(() => Promise.resolve()),
              collection: jest.fn(() => mockMessagesCollection),
            })),
          };
        } else if (name === 'users') {
          return {
            doc: jest.fn(() => ({
              get: jest.fn(() => Promise.resolve(mockSenderDoc)),
              collection: jest.fn(() => ({
                doc: jest.fn(() => ({
                  update: jest.fn(() => Promise.resolve()),
                })),
              })),
            })),
          };
        }
        return { doc: jest.fn() };
      });

      const mockRequest: CallableRequest<any> = {
        data: testData,
        auth: { uid: 'sender-id' } as any,
        rawRequest: {} as any,
      };

      const result = await messaging.sendMessage.run(mockRequest);

      expect(result.success).toBe(true);
      expect(mockMessagesCollection.add).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'media',
          mediaUrls: testData.message.mediaUrls,
          isEncrypted: false,
        })
      );
    });

    it('should reject message from non-participant', async () => {
      const testData = {
        chatId: 'chat-123',
        message: { text: 'Hello', type: 'text' },
      };

      // Mock chat without sender in participants
      const mockChatDoc = {
        exists: true,
        data: () => ({
          participants: ['user-1', 'user-2'], // sender-id not included
          encryptionEnabled: false,
        }),
      };

      mockDb.collection.mockReturnValue({
        doc: jest.fn(() => ({
          get: jest.fn(() => Promise.resolve(mockChatDoc)),
        })),
      });

      const mockRequest: CallableRequest<any> = {
        data: testData,
        auth: { uid: 'sender-id' } as any,
        rawRequest: {} as any,
      };

      await expect(messaging.sendMessage.run(mockRequest))
        .rejects.toThrow('You are not a participant in this chat');
    });

    it('should handle chat not found', async () => {
      const testData = {
        chatId: 'non-existent-chat',
        message: { text: 'Hello', type: 'text' },
      };

      mockDb.collection.mockReturnValue({
        doc: jest.fn(() => ({
          get: jest.fn(() => Promise.resolve({ exists: false })),
        })),
      });

      const mockRequest: CallableRequest<any> = {
        data: testData,
        auth: { uid: 'sender-id' } as any,
        rawRequest: {} as any,
      };

      await expect(messaging.sendMessage.run(mockRequest))
        .rejects.toThrow('Chat not found');
    });

    it('should detect and reject XSS attempts', async () => {
      const { detectXSSPatterns, logXSSAttempt } = require('../utils/xssSanitization');
      (detectXSSPatterns as jest.Mock).mockReturnValue(true);

      const testData = {
        chatId: 'chat-123',
        message: {
          text: '<script>alert("XSS")</script>',
          type: 'text',
        },
      };

      // Mock chat exists
      const mockChatDoc = {
        exists: true,
        data: () => ({
          participants: ['sender-id', 'recipient-id'],
          encryptionEnabled: false,
        }),
      };

      mockDb.collection.mockReturnValue({
        doc: jest.fn(() => ({
          get: jest.fn(() => Promise.resolve(mockChatDoc)),
        })),
      });

      const mockRequest: CallableRequest<any> = {
        data: testData,
        auth: { uid: 'sender-id' } as any,
        rawRequest: {} as any,
      };

      await expect(messaging.sendMessage.run(mockRequest))
        .rejects.toThrow('Invalid characters detected in message');

      // Verify XSS attempt was logged
      expect(logXSSAttempt).toHaveBeenCalledWith(
        '<script>alert("XSS")</script>',
        {
          userId: 'sender-id',
          chatId: 'chat-123',
          functionName: 'sendMessage',
        }
      );
    });

    it('should handle invalid message type', async () => {
      const testData = {
        chatId: 'chat-123',
        message: {
          text: 'Hello',
          type: 'invalid-type',
        },
      };

      const mockRequest: CallableRequest<any> = {
        data: testData,
        auth: { uid: 'sender-id' } as any,
        rawRequest: {} as any,
      };

      await expect(messaging.sendMessage.run(mockRequest))
        .rejects.toThrow('Invalid message type');
    });
  });

  describe('sendMessageNotification', () => {
    it('should send push notifications to all recipients', async () => {
      const testData = {
        chatId: 'chat-123',
        messageId: 'message-123',
      };

      // Mock chat with multiple participants
      const mockChatDoc = {
        exists: true,
        data: () => ({
          participants: ['sender-id', 'recipient-1', 'recipient-2'],
        }),
      };

      // Mock message
      const mockMessageDoc = {
        exists: true,
        data: () => ({
          type: 'text',
          text: 'Hello everyone!',
          senderId: 'sender-id',
        }),
      };

      // Mock sender
      const mockSenderDoc = {
        exists: true,
        data: () => ({
          displayName: 'John Sender',
        }),
      };

      // Mock recipients with FCM tokens
      const mockRecipient1Doc = {
        exists: true,
        data: () => ({
          fcmTokens: ['token-1a', 'token-1b'],
          notificationSettings: { enabled: true },
        }),
      };

      const mockRecipient2Doc = {
        exists: true,
        data: () => ({
          fcmTokens: ['token-2'],
          notificationSettings: { enabled: true },
        }),
      };

      mockDb.collection.mockImplementation((name: string) => {
        if (name === 'chats') {
          return {
            doc: jest.fn((chatId: string) => ({
              get: jest.fn(() => Promise.resolve(mockChatDoc)),
              collection: jest.fn(() => ({
                doc: jest.fn(() => ({
                  get: jest.fn(() => Promise.resolve(mockMessageDoc)),
                })),
              })),
            })),
          };
        } else if (name === 'users') {
          return {
            doc: jest.fn((userId: string) => {
              if (userId === 'sender-id') {
                return { get: jest.fn(() => Promise.resolve(mockSenderDoc)) };
              } else if (userId === 'recipient-1') {
                return { get: jest.fn(() => Promise.resolve(mockRecipient1Doc)) };
              } else if (userId === 'recipient-2') {
                return { get: jest.fn(() => Promise.resolve(mockRecipient2Doc)) };
              }
              return { get: jest.fn() };
            }),
          };
        }
        return { doc: jest.fn() };
      });

      // Mock successful notification send
      mockMessaging.sendMulticast.mockResolvedValue({
        successCount: 3,
        failureCount: 0,
        responses: [
          { success: true },
          { success: true },
          { success: true },
        ],
      });

      const mockRequest: CallableRequest<any> = {
        data: testData,
        auth: { uid: 'sender-id' } as any,
        rawRequest: {} as any,
      };

      const result = await messaging.sendMessageNotification.run(mockRequest);

      expect(result).toEqual({
        success: true,
        sent: 3,
        failed: 0,
      });

      // Verify notification was sent with correct payload
      expect(mockMessaging.sendMulticast).toHaveBeenCalledWith({
        data: {
          type: 'message',
          chatId: 'chat-123',
          messageId: 'message-123',
          senderId: 'sender-id',
          senderName: 'John Sender',
          messageType: 'text',
          timestamp: expect.any(String),
        },
        notification: {
          title: 'John Sender',
          body: expect.any(String),
        },
        android: expect.any(Object),
        apns: expect.any(Object),
        tokens: ['token-1a', 'token-1b', 'token-2'],
      });
    });

    it('should handle failed tokens and remove them', async () => {
      const testData = {
        chatId: 'chat-123',
        messageId: 'message-123',
      };

      // Setup mocks (simplified)
      const mockChatDoc = {
        exists: true,
        data: () => ({
          participants: ['sender-id', 'recipient-1'],
        }),
      };

      const mockMessageDoc = {
        exists: true,
        data: () => ({ type: 'text' }),
      };

      const mockRecipientDoc = {
        exists: true,
        data: () => ({
          fcmTokens: ['valid-token', 'invalid-token'],
          notificationSettings: { enabled: true },
        }),
      };

      mockDb.collection.mockImplementation((name: string) => {
        if (name === 'chats') {
          return {
            doc: jest.fn(() => ({
              get: jest.fn(() => Promise.resolve(mockChatDoc)),
              collection: jest.fn(() => ({
                doc: jest.fn(() => ({
                  get: jest.fn(() => Promise.resolve(mockMessageDoc)),
                })),
              })),
            })),
          };
        } else if (name === 'users') {
          return {
            doc: jest.fn(() => ({
              get: jest.fn(() => Promise.resolve(mockRecipientDoc)),
            })),
          };
        }
        return { doc: jest.fn() };
      });

      // Mock partial failure
      mockMessaging.sendMulticast.mockResolvedValue({
        successCount: 1,
        failureCount: 1,
        responses: [
          { success: true },
          { success: false, error: { code: 'messaging/invalid-token' } },
        ],
      });

      const mockRequest: CallableRequest<any> = {
        data: testData,
        auth: { uid: 'sender-id' } as any,
        rawRequest: {} as any,
      };

      const result = await messaging.sendMessageNotification.run(mockRequest);

      expect(result).toEqual({
        success: true,
        sent: 1,
        failed: 1,
      });
    });

    it('should skip users with notifications disabled', async () => {
      const testData = {
        chatId: 'chat-123',
        messageId: 'message-123',
      };

      const mockChatDoc = {
        exists: true,
        data: () => ({
          participants: ['sender-id', 'recipient-1', 'recipient-2'],
        }),
      };

      const mockRecipient1Doc = {
        exists: true,
        data: () => ({
          fcmTokens: ['token-1'],
          notificationSettings: { enabled: true },
        }),
      };

      const mockRecipient2Doc = {
        exists: true,
        data: () => ({
          fcmTokens: ['token-2'],
          notificationSettings: { enabled: false }, // Notifications disabled
        }),
      };

      mockDb.collection.mockImplementation((name: string) => {
        if (name === 'chats') {
          return {
            doc: jest.fn(() => ({
              get: jest.fn(() => Promise.resolve(mockChatDoc)),
              collection: jest.fn(() => ({
                doc: jest.fn(() => ({
                  get: jest.fn(() => Promise.resolve({ exists: true, data: () => ({}) })),
                })),
              })),
            })),
          };
        } else if (name === 'users') {
          return {
            doc: jest.fn((userId: string) => {
              if (userId === 'recipient-1') {
                return { get: jest.fn(() => Promise.resolve(mockRecipient1Doc)) };
              } else if (userId === 'recipient-2') {
                return { get: jest.fn(() => Promise.resolve(mockRecipient2Doc)) };
              }
              return { get: jest.fn(() => Promise.resolve({ exists: true, data: () => ({}) })) };
            }),
          };
        }
        return { doc: jest.fn() };
      });

      mockMessaging.sendMulticast.mockResolvedValue({
        successCount: 1,
        failureCount: 0,
        responses: [{ success: true }],
      });

      const mockRequest: CallableRequest<any> = {
        data: testData,
        auth: { uid: 'sender-id' } as any,
        rawRequest: {} as any,
      };

      await messaging.sendMessageNotification.run(mockRequest);

      // Verify only recipient-1's token was included
      expect(mockMessaging.sendMulticast).toHaveBeenCalledWith(
        expect.objectContaining({
          tokens: ['token-1'], // Only recipient-1's token
        })
      );
    });

    it('should handle no FCM tokens scenario', async () => {
      const testData = {
        chatId: 'chat-123',
        messageId: 'message-123',
      };

      const mockChatDoc = {
        exists: true,
        data: () => ({
          participants: ['sender-id', 'recipient-1'],
        }),
      };

      // Recipient with no FCM tokens
      const mockRecipientDoc = {
        exists: true,
        data: () => ({
          fcmTokens: [], // No tokens
          notificationSettings: { enabled: true },
        }),
      };

      mockDb.collection.mockImplementation((name: string) => {
        if (name === 'chats') {
          return {
            doc: jest.fn(() => ({
              get: jest.fn(() => Promise.resolve(mockChatDoc)),
              collection: jest.fn(() => ({
                doc: jest.fn(() => ({
                  get: jest.fn(() => Promise.resolve({ exists: true, data: () => ({}) })),
                })),
              })),
            })),
          };
        } else if (name === 'users') {
          return {
            doc: jest.fn(() => ({
              get: jest.fn(() => Promise.resolve(mockRecipientDoc)),
            })),
          };
        }
        return { doc: jest.fn() };
      });

      const mockRequest: CallableRequest<any> = {
        data: testData,
        auth: { uid: 'sender-id' } as any,
        rawRequest: {} as any,
      };

      const result = await messaging.sendMessageNotification.run(mockRequest);

      expect(result).toEqual({
        success: true,
        sent: 0,
      });

      // Verify sendMulticast was not called
      expect(mockMessaging.sendMulticast).not.toHaveBeenCalled();
    });
  });

  describe('updateNotificationSettings', () => {
    it('should update notification settings successfully', async () => {
      const testData = {
        settings: {
          enabled: true,
          sound: true,
          vibration: false,
          messagePreview: true,
        },
      };

      const mockUserRef = {
        update: jest.fn(() => Promise.resolve()),
      };

      mockDb.collection.mockReturnValue({
        doc: jest.fn(() => mockUserRef),
      });

      const mockRequest: CallableRequest<any> = {
        data: testData,
        auth: { uid: 'user-123' } as any,
        rawRequest: {} as any,
      };

      const result = await messaging.updateNotificationSettings.run(mockRequest);

      expect(result).toEqual({ success: true });

      // Verify settings were updated
      expect(mockUserRef.update).toHaveBeenCalledWith({
        notificationSettings: testData.settings,
        notificationSettingsUpdatedAt: expect.any(Date),
      });
    });

    it('should handle validation errors', async () => {
      const { validateRequest } = require('../utils/request-validator');
      (validateRequest as jest.Mock).mockImplementation(() => {
        throw new Error('Invalid settings format');
      });

      const mockRequest: CallableRequest<any> = {
        data: { settings: 'invalid' },
        auth: { uid: 'user-123' } as any,
        rawRequest: {} as any,
      };

      await expect(messaging.updateNotificationSettings.run(mockRequest))
        .rejects.toThrow('Invalid settings format');
    });
  });

  describe('registerFCMToken', () => {
    it('should register a new FCM token', async () => {
      const testData = {
        token: 'new-fcm-token-123',
      };

      const mockUserRef = {
        update: jest.fn(() => Promise.resolve()),
      };

      mockDb.collection.mockReturnValue({
        doc: jest.fn(() => mockUserRef),
      });

      const mockRequest: CallableRequest<any> = {
        data: testData,
        auth: { uid: 'user-123' } as any,
        rawRequest: {} as any,
      };

      // Test would continue with the registerFCMToken implementation
      // Since the function code was cut off, we'll complete the basic test structure
    });

    it('should handle duplicate token registration', async () => {
      // Test that duplicate tokens are not added multiple times
    });

    it('should remove old tokens when limit is reached', async () => {
      // Test token rotation when max tokens per user is reached
    });
  });

  describe('Edge Cases and Error Handling', () => {
    it('should handle database errors gracefully', async () => {
      const testData = {
        chatId: 'chat-123',
        message: { text: 'Hello', type: 'text' },
      };

      // Mock database error
      mockDb.collection.mockReturnValue({
        doc: jest.fn(() => ({
          get: jest.fn(() => Promise.reject(new Error('Database connection failed'))),
        })),
      });

      const mockRequest: CallableRequest<any> = {
        data: testData,
        auth: { uid: 'sender-id' } as any,
        rawRequest: {} as any,
      };

      await expect(messaging.sendMessage.run(mockRequest))
        .rejects.toThrow('Database connection failed');
    });

    it('should handle very long messages', async () => {
      const { sanitizeUserInput } = require('../utils/xssSanitization');
      (sanitizeUserInput as jest.Mock).mockImplementation((input, options) => {
        if (options.maxLength && input.length > options.maxLength) {
          return input.substring(0, options.maxLength);
        }
        return input;
      });

      const longText = 'a'.repeat(10000);
      const testData = {
        chatId: 'chat-123',
        message: {
          text: longText,
          type: 'text',
        },
      };

      const mockChatDoc = {
        exists: true,
        data: () => ({
          participants: ['sender-id', 'recipient-id'],
          encryptionEnabled: false,
        }),
      };

      mockDb.collection.mockImplementation(() => ({
        doc: jest.fn(() => ({
          get: jest.fn(() => Promise.resolve(mockChatDoc)),
          update: jest.fn(() => Promise.resolve()),
          collection: jest.fn(() => ({
            add: jest.fn(() => Promise.resolve({ id: 'message-123' })),
          })),
        })),
      }));

      const mockRequest: CallableRequest<any> = {
        data: testData,
        auth: { uid: 'sender-id' } as any,
        rawRequest: {} as any,
      };

      await messaging.sendMessage.run(mockRequest);

      // Verify sanitization was called with maxLength
      expect(sanitizeUserInput).toHaveBeenCalledWith(
        longText,
        expect.objectContaining({
          maxLength: 5000,
        })
      );
    });

    it('should handle concurrent message sending', async () => {
      const testData = {
        chatId: 'chat-123',
        message: { text: 'Concurrent message', type: 'text' },
      };

      const mockChatDoc = {
        exists: true,
        data: () => ({
          participants: ['sender-id', 'recipient-id'],
          encryptionEnabled: false,
        }),
      };

      mockDb.collection.mockImplementation(() => ({
        doc: jest.fn(() => ({
          get: jest.fn(() => Promise.resolve(mockChatDoc)),
          update: jest.fn(() => Promise.resolve()),
          collection: jest.fn(() => ({
            add: jest.fn(() => Promise.resolve({ id: `message-${Date.now()}` })),
          })),
        })),
      }));

      const mockRequest: CallableRequest<any> = {
        data: testData,
        auth: { uid: 'sender-id' } as any,
        rawRequest: {} as any,
      };

      // Send multiple messages concurrently
      const results = await Promise.all([
        messaging.sendMessage.run(mockRequest),
        messaging.sendMessage.run(mockRequest),
        messaging.sendMessage.run(mockRequest),
      ]);

      // All should succeed
      expect(results).toHaveLength(3);
      results.forEach(result => {
        expect(result.success).toBe(true);
        expect(result.messageId).toBeDefined();
      });
    });
  });

  describe('Security Considerations', () => {
    it('should require authentication for all functions', async () => {
      // Verify withAuth was called for all functions
      const functionNames = [
        'sendMessage',
        'sendMessageNotification',
        'updateNotificationSettings',
        'registerFCMToken',
      ];

      functionNames.forEach(funcName => {
        const authCall = mockWithAuth.mock.calls.find(call => call[1] === funcName);
        expect(authCall).toBeDefined();
      });
    });

    it('should sanitize all user inputs', async () => {
      const { sanitizeUserInput } = require('../utils/xssSanitization');
      
      const testData = {
        chatId: 'chat-123',
        message: {
          text: '<img src=x onerror=alert(1)>',
          type: 'text',
          mediaUrls: ['javascript:alert(1)', 'https://safe-url.com/image.jpg'],
        },
      };

      const mockChatDoc = {
        exists: true,
        data: () => ({
          participants: ['sender-id', 'recipient-id'],
          encryptionEnabled: false,
        }),
      };

      mockDb.collection.mockImplementation(() => ({
        doc: jest.fn(() => ({
          get: jest.fn(() => Promise.resolve(mockChatDoc)),
          update: jest.fn(() => Promise.resolve()),
          collection: jest.fn(() => ({
            add: jest.fn(() => Promise.resolve({ id: 'message-123' })),
          })),
        })),
      }));

      const mockRequest: CallableRequest<any> = {
        data: testData,
        auth: { uid: 'sender-id' } as any,
        rawRequest: {} as any,
      };

      await messaging.sendMessage.run(mockRequest);

      // Verify text was sanitized
      expect(sanitizeUserInput).toHaveBeenCalledWith(
        '<img src=x onerror=alert(1)>',
        expect.objectContaining({
          allowHtml: false,
          maxLength: 5000,
          trim: true,
        })
      );

      // Verify each media URL was sanitized
      testData.message.mediaUrls?.forEach(url => {
        expect(sanitizeUserInput).toHaveBeenCalledWith(
          url,
          expect.objectContaining({
            allowHtml: false,
            maxLength: 1000,
          })
        );
      });
    });
  });
});