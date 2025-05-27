import { ChatEncryptionService } from '../ChatEncryptionService';
import { LibsignalService } from '../libsignal/LibsignalService';
import { MediaEncryptionService } from '../MediaEncryptionService';
import { getFirebaseDb, getFirebaseAuth } from '../../../lib/firebase';
import { callFirebaseFunction } from '../../../lib/errorUtils';
import { FirebaseFirestoreTypes } from '@react-native-firebase/firestore';
import NetInfo from '@react-native-community/netinfo';
import { OfflineQueueService } from '../OfflineQueueService';
import { EncryptedSearchService } from '../EncryptedSearchService';

// Mock dependencies
jest.mock('../libsignal/LibsignalService');
jest.mock('../MediaEncryptionService');
jest.mock('../../../lib/firebase');
jest.mock('../../../lib/errorUtils');
jest.mock('../OfflineQueueService');
jest.mock('../MetadataEncryptionService');
jest.mock('../EncryptedSearchService');
jest.mock('../AuditLogService');
jest.mock('@react-native-community/netinfo', () => ({
  default: {
    fetch: jest.fn(() => Promise.resolve({ isConnected: true }))
  }
}));

describe('ChatEncryptionService', () => {
  const mockUserId = 'test-user-id';
  const mockChatId = 'test-chat-id';
  const mockRecipientId = 'recipient-id';
  
  const mockTimestamp = {
    toDate: () => new Date('2024-01-01'),
    toMillis: () => 1704067200000,
  };

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Mock Firebase Auth
    (getFirebaseAuth as jest.Mock).mockReturnValue({
      currentUser: { uid: mockUserId },
      onAuthStateChanged: jest.fn((callback) => {
        callback({ uid: mockUserId });
        return jest.fn();
      }),
    });

    // Mock Firebase Firestore
    const mockDoc = {
      exists: true,
      data: () => ({
        participants: [mockUserId, mockRecipientId],
        type: 'direct',
        encryptionEnabled: true,
      }),
    };

    const mockCollection = {
      doc: jest.fn(() => ({
        get: jest.fn(() => Promise.resolve(mockDoc)),
        set: jest.fn(() => Promise.resolve()),
        update: jest.fn(() => Promise.resolve()),
        collection: jest.fn(() => mockCollection),
      })),
      add: jest.fn(() => Promise.resolve({ id: 'new-message-id' })),
      where: jest.fn(() => ({
        get: jest.fn(() => Promise.resolve({ docs: [] })),
      })),
      orderBy: jest.fn(() => ({
        onSnapshot: jest.fn((callback) => {
          callback({
            docChanges: () => [{
              type: 'added',
              doc: {
                data: () => ({
                  id: 'msg-1',
                  chatId: mockChatId,
                  senderId: mockRecipientId,
                  timestamp: mockTimestamp,
                  type: 'text',
                  encryptedPayloads: {
                    [mockUserId]: {
                      encryptedContent: 'encrypted',
                      ephemeralPublicKey: 'pubkey',
                      nonce: 'nonce',
                      mac: 'mac',
                    },
                  },
                  delivered: [],
                  read: [],
                }),
                ref: { update: jest.fn() },
              },
            }],
          });
          return jest.fn();
        }),
      })),
    };

    (getFirebaseDb as jest.Mock).mockReturnValue({
      collection: jest.fn(() => mockCollection),
      FieldValue: FirebaseFirestoreTypes.FieldValue,
    });

    // Mock E2EE Service
    (LibsignalService.initialize as jest.Mock).mockResolvedValue(undefined);
    (LibsignalService.getInstance as jest.Mock).mockReturnValue({
      getPublicKeyBundle: jest.fn(() => Promise.resolve({
        identityKey: 'test-identity-key',
      })),
    });
    (LibsignalService.encryptMessage as jest.Mock).mockResolvedValue({
      content: 'encrypted-content',
      ephemeralPublicKey: 'ephemeral-key',
      nonce: 'nonce',
      mac: 'mac',
    });
    (LibsignalService.decryptMessage as jest.Mock).mockResolvedValue('Decrypted message');
    (LibsignalService.getIdentityKeyPair as jest.Mock).mockResolvedValue({
      publicKey: 'public-key',
      privateKey: 'private-key',
    });
  });

  describe('initializeEncryption', () => {
    it('should initialize all encryption services', async () => {
      await ChatEncryptionService.initializeEncryption();

      expect(LibsignalService.initialize).toHaveBeenCalledWith(mockUserId);
      expect(getFirebaseDb().collection).toHaveBeenCalledWith('users');
    });

    it('should handle initialization errors', async () => {
      (LibsignalService.initialize as jest.Mock).mockRejectedValue(new Error('Init failed'));

      await expect(ChatEncryptionService.initializeEncryption()).rejects.toThrow('Init failed');
    });
  });

  describe('createOrGetChat', () => {
    it('should create a new direct chat', async () => {
      const mockDb = getFirebaseDb();
      const mockDoc = {
        exists: false,
      };
      
      mockDb.collection().doc().get = jest.fn(() => Promise.resolve(mockDoc));

      const chat = await ChatEncryptionService.createOrGetChat([mockRecipientId]);

      expect(chat).toMatchObject({
        type: 'direct',
        participants: expect.arrayContaining([mockUserId, mockRecipientId]),
        encryptionEnabled: true,
      });
      expect(mockDb.collection().doc().set).toHaveBeenCalled();
    });

    it('should return existing chat if found', async () => {
      const existingChat = {
        id: mockChatId,
        type: 'direct',
        participants: [mockUserId, mockRecipientId],
      };

      const mockDb = getFirebaseDb();
      mockDb.collection().doc().get = jest.fn(() => Promise.resolve({
        exists: true,
        data: () => existingChat,
      }));

      const chat = await ChatEncryptionService.createOrGetChat([mockRecipientId]);

      expect(chat).toMatchObject(existingChat);
      expect(mockDb.collection().doc().set).not.toHaveBeenCalled();
    });

    it('should create group chat for multiple participants', async () => {
      const participants = ['user-2', 'user-3'];
      
      const mockDb = getFirebaseDb();
      mockDb.collection().doc().get = jest.fn(() => Promise.resolve({ exists: false }));

      const chat = await ChatEncryptionService.createOrGetChat(participants);

      expect(chat).toMatchObject({
        type: 'group',
        participants: expect.arrayContaining([mockUserId, ...participants]),
      });
    });
  });

  describe('sendTextMessage', () => {
    it('should encrypt and send text message', async () => {
      await ChatEncryptionService.sendTextMessage(mockChatId, 'Hello World');

      expect(LibsignalService.encryptMessage).toHaveBeenCalledWith(
        'Hello World',
        expect.any(String)
      );
      expect(getFirebaseDb().collection().doc().collection().add).toHaveBeenCalledWith(
        expect.objectContaining({
          chatId: mockChatId,
          senderId: mockUserId,
          type: 'text',
          encryptedPayloads: expect.any(Object),
        })
      );
    });

    it('should handle offline scenario', async () => {
      (NetInfo.fetch as jest.Mock).mockResolvedValueOnce({ isConnected: false });
      (OfflineQueueService.queueMessage as jest.Mock).mockResolvedValueOnce(undefined);

      await ChatEncryptionService.sendTextMessage(mockChatId, 'Offline message');

      expect(OfflineQueueService.queueMessage).toHaveBeenCalledWith(
        mockChatId,
        'text',
        'Offline message'
      );
    });

    it('should send notifications after message', async () => {
      await ChatEncryptionService.sendTextMessage(mockChatId, 'Test');

      expect(callFirebaseFunction).toHaveBeenCalledWith('sendMessageNotification', {
        chatId: mockChatId,
        messageId: expect.any(String),
      });
    });
  });

  describe('sendMediaMessage', () => {
    it('should encrypt and upload media', async () => {
      const mockFile = {
        encryptedUrl: 'https://encrypted.url',
        encryptedKey: 'encrypted-key',
        metadata: {
          fileName: 'test.jpg',
          fileSize: 1000,
          mimeType: 'image/jpeg',
          iv: 'iv',
          tag: 'tag',
        },
      };

      (MediaEncryptionService.validateFile as jest.Mock).mockResolvedValue({
        isValid: true,
      });
      (MediaEncryptionService.uploadEncryptedFile as jest.Mock).mockResolvedValue(mockFile);

      await ChatEncryptionService.sendMediaMessage(
        mockChatId,
        'file://test.jpg',
        'test.jpg',
        'image/jpeg'
      );

      expect(MediaEncryptionService.uploadEncryptedFile).toHaveBeenCalledWith(
        'file://test.jpg',
        'test.jpg',
        'image/jpeg',
        mockChatId
      );
      expect(getFirebaseDb().collection().doc().collection().add).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'media',
          media: expect.objectContaining({
            encryptedUrl: mockFile.encryptedUrl,
          }),
        })
      );
    });

    it('should handle voice messages with duration', async () => {
      const mockFile = {
        encryptedUrl: 'https://encrypted.url',
        encryptedKey: 'encrypted-key',
        metadata: {
          fileName: 'voice.m4a',
          fileSize: 1000,
          mimeType: 'audio/m4a',
          iv: 'iv',
          tag: 'tag',
        },
      };

      (MediaEncryptionService.validateFile as jest.Mock).mockResolvedValue({
        isValid: true,
      });
      (MediaEncryptionService.uploadEncryptedFile as jest.Mock).mockResolvedValue(mockFile);

      await ChatEncryptionService.sendMediaMessage(
        mockChatId,
        'file://voice.m4a',
        'voice.m4a',
        'audio/m4a',
        5.5
      );

      expect(getFirebaseDb().collection().doc().collection().add).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'voice',
          duration: 5.5,
        })
      );
    });

    it('should validate file before upload', async () => {
      (MediaEncryptionService.validateFile as jest.Mock).mockResolvedValue({
        isValid: false,
        error: 'File too large',
      });

      await expect(
        ChatEncryptionService.sendMediaMessage(
          mockChatId,
          'file://large.jpg',
          'large.jpg',
          'image/jpeg'
        )
      ).rejects.toThrow('File too large');
    });
  });

  describe('decryptMessage', () => {
    it('should decrypt text message', async () => {
      const encryptedMessage = {
        id: 'msg-1',
        chatId: mockChatId,
        senderId: mockRecipientId,
        timestamp: mockTimestamp,
        type: 'text',
        encryptedPayloads: {
          [mockUserId]: {
            encryptedContent: 'encrypted',
            ephemeralPublicKey: 'key',
            nonce: 'nonce',
            mac: 'mac',
          },
        },
        delivered: ['user-1'],
        read: [],
      };

      const decrypted = await ChatEncryptionService.decryptMessage(encryptedMessage as any);

      expect(decrypted).toMatchObject({
        id: 'msg-1',
        chatId: mockChatId,
        senderId: mockRecipientId,
        text: 'Decrypted message',
        encrypted: true,
      });
      expect(LibsignalService.decryptMessage).toHaveBeenCalled();
    });

    it('should handle media messages', async () => {
      const encryptedMessage = {
        id: 'msg-1',
        chatId: mockChatId,
        senderId: mockRecipientId,
        timestamp: mockTimestamp,
        type: 'media',
        media: {
          encryptedUrl: 'https://encrypted.url',
          encryptedKeys: {
            [mockUserId]: JSON.stringify({
              content: 'encrypted-key',
              ephemeralPublicKey: 'key',
              nonce: 'nonce',
              mac: 'mac',
            }),
          },
          metadata: {
            fileName: 'test.jpg',
            fileSize: 1000,
            mimeType: 'image/jpeg',
            iv: 'iv',
            tag: 'tag',
          },
        },
        delivered: [],
        read: [],
      };

      (LibsignalService.decryptMessage as jest.Mock).mockResolvedValue('decrypted-key');

      const decrypted = await ChatEncryptionService.decryptMessage(encryptedMessage as any);

      expect(decrypted).toMatchObject({
        type: 'media',
        media: expect.objectContaining({
          encryptedUrl: 'https://encrypted.url',
          encryptedKey: 'decrypted-key',
        }),
      });
    });

    it('should calculate message status correctly', async () => {
      const encryptedMessage = {
        id: 'msg-1',
        chatId: mockChatId,
        senderId: mockUserId, // Own message
        timestamp: mockTimestamp,
        type: 'text',
        encryptedPayloads: Record<string, never>,
        delivered: ['user-2', 'user-3'],
        read: ['user-2'],
      };

      // Mock chat with 3 participants total
      const mockDb = getFirebaseDb();
      mockDb.collection().doc().get = jest.fn(() => Promise.resolve({
        exists: true,
        data: () => ({
          participants: [mockUserId, 'user-2', 'user-3'],
        }),
      }));

      const decrypted = await ChatEncryptionService.decryptMessage(encryptedMessage as any);

      expect(decrypted.status).toBe('delivered');
    });
  });

  describe('toggleReaction', () => {
    it('should add reaction to message', async () => {
      const mockMessage = {
        id: 'msg-1',
        reactions: [],
      };

      const mockDb = getFirebaseDb();
      const updateFn = jest.fn();
      mockDb.collection().doc().collection().doc = jest.fn(() => ({
        get: jest.fn(() => Promise.resolve({
          exists: true,
          data: () => mockMessage,
        })),
        update: updateFn,
      }));

      await ChatEncryptionService.toggleReaction(mockChatId, 'msg-1', '❤️');

      expect(updateFn).toHaveBeenCalledWith({
        reactions: [{
          emoji: '❤️',
          userIds: [mockUserId],
        }],
        lastReactionAt: expect.any(Object),
      });
    });

    it('should remove reaction if already exists', async () => {
      const mockMessage = {
        id: 'msg-1',
        reactions: [{
          emoji: '❤️',
          userIds: [mockUserId, 'user-2'],
        }],
      };

      const mockDb = getFirebaseDb();
      const updateFn = jest.fn();
      mockDb.collection().doc().collection().doc = jest.fn(() => ({
        get: jest.fn(() => Promise.resolve({
          exists: true,
          data: () => mockMessage,
        })),
        update: updateFn,
      }));

      await ChatEncryptionService.toggleReaction(mockChatId, 'msg-1', '❤️');

      expect(updateFn).toHaveBeenCalledWith({
        reactions: [{
          emoji: '❤️',
          userIds: ['user-2'],
        }],
        lastReactionAt: expect.any(Object),
      });
    });
  });

  describe('searchMessages', () => {
    it('should search encrypted messages', async () => {
      (EncryptedSearchService.searchMessages as jest.Mock).mockResolvedValueOnce([
        { messageId: 'msg-1', chatId: mockChatId, score: 0.9 },
      ]);

      const mockMessage = {
        id: 'msg-1',
        chatId: mockChatId,
        text: 'Test message',
      };

      const mockDb = getFirebaseDb();
      mockDb.collection().doc().collection().doc().get = jest.fn(() => Promise.resolve({
        exists: true,
        data: () => mockMessage,
      }));

      jest.spyOn(ChatEncryptionService, 'decryptMessage').mockResolvedValue(mockMessage as any);

      const results = await ChatEncryptionService.searchMessages('test');

      expect(results).toHaveLength(1);
      expect(results[0]).toMatchObject(mockMessage);
      expect(EncryptedSearchService.searchMessages).toHaveBeenCalledWith('test', undefined);
    });

    it('should filter by chatId if provided', async () => {
      (EncryptedSearchService.searchMessages as jest.Mock).mockResolvedValueOnce([]);
      
      await ChatEncryptionService.searchMessages('test', mockChatId);

      expect(EncryptedSearchService.searchMessages).toHaveBeenCalledWith('test', mockChatId);
    });

    it('should return empty array for short queries', async () => {
      const results = await ChatEncryptionService.searchMessages('ab');

      expect(results).toEqual([]);
    });
  });

  describe('subscribeToMessages', () => {
    it('should subscribe to real-time message updates', async () => {
      const onMessage = jest.fn();
      const onError = jest.fn();

      const unsubscribe = ChatEncryptionService.subscribeToMessages(
        mockChatId,
        onMessage,
        onError
      );

      // Wait for async operations
      await new Promise(resolve => setTimeout(resolve, 100));

      expect(onMessage).toHaveBeenCalled();
      expect(typeof unsubscribe).toBe('function');
    });

    it('should mark messages as delivered automatically', async () => {
      const mockRef = { update: jest.fn() };
      const mockDb = getFirebaseDb();
      
      mockDb.collection().doc().collection().orderBy = jest.fn(() => ({
        onSnapshot: jest.fn((callback) => {
          callback({
            docChanges: () => [{
              type: 'added',
              doc: {
                data: () => ({
                  id: 'msg-1',
                  senderId: 'other-user',
                  delivered: [],
                }),
                ref: mockRef,
              },
            }],
          });
          return jest.fn();
        }),
      }));

      ChatEncryptionService.subscribeToMessages(mockChatId, jest.fn());

      await new Promise(resolve => setTimeout(resolve, 100));

      expect(mockRef.update).toHaveBeenCalledWith({
        delivered: expect.any(Object),
      });
    });
  });

  describe('markMessageAsRead', () => {
    it('should update message read status', async () => {
      const mockRef = { update: jest.fn() };
      const mockDb = getFirebaseDb();
      
      mockDb.collection().doc().collection().doc = jest.fn(() => mockRef);

      await ChatEncryptionService.markMessageAsRead(mockChatId, 'msg-1');

      expect(mockRef.update).toHaveBeenCalledWith({
        read: expect.any(Object),
      });
    });
  });

  describe('isEncryptionReady', () => {
    it('should return true if encryption is initialized', async () => {
      (LibsignalService.getIdentityKeyPair as jest.Mock).mockResolvedValue({
        publicKey: 'key',
        privateKey: 'key',
      });

      const ready = await ChatEncryptionService.isEncryptionReady();

      expect(ready).toBe(true);
    });

    it('should return false if encryption not initialized', async () => {
      (LibsignalService.getIdentityKeyPair as jest.Mock).mockResolvedValue(null);

      const ready = await ChatEncryptionService.isEncryptionReady();

      expect(ready).toBe(false);
    });
  });
});