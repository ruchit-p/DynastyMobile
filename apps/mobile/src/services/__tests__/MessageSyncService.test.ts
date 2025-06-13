import { MessageSyncService } from '../MessageSyncService';
import { SyncDatabase } from '../../database/SyncDatabase';
import { getFirebaseDb, getFirebaseAuth } from '../../lib/firebase';
import { ChatEncryptionService } from '../encryption/ChatEncryptionService';
import NetInfo from '@react-native-community/netinfo';
import { FirebaseFirestoreTypes } from '@react-native-firebase/firestore';

// Mock dependencies
jest.mock('../../database/SyncDatabase');
jest.mock('../../lib/firebase');
jest.mock('../encryption/ChatEncryptionService');
jest.mock('@react-native-community/netinfo');

describe('MessageSyncService', () => {
  const mockUserId = 'test-user-id';
  const mockChatId = 'test-chat-id';
  const mockMessage = {
    id: 'msg-1',
    chatId: mockChatId,
    senderId: mockUserId,
    type: 'text' as const,
    text: 'Test message',
    timestamp: new Date(),
    encrypted: true,
    delivered: [],
    read: [],
    status: 'sent' as const,
  };

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Mock Firebase Auth
    (getFirebaseAuth as jest.Mock).mockReturnValue({
      currentUser: { uid: mockUserId },
    });

    // Mock NetInfo
    (NetInfo.fetch as jest.Mock).mockResolvedValue({ isConnected: true });
    (NetInfo.addEventListener as jest.Mock).mockReturnValue(jest.fn());
  });

  describe('syncMessages', () => {
    it('should sync messages from Firebase when online', async () => {
      const mockFirebaseMessages = [
        {
          id: 'msg-1',
          data: () => ({
            ...mockMessage,
            timestamp: { toDate: () => new Date() },
          }),
        },
      ];

      const mockDb = {
        collection: jest.fn(() => ({
          doc: jest.fn(() => ({
            collection: jest.fn(() => ({
              where: jest.fn(() => ({
                orderBy: jest.fn(() => ({
                  limit: jest.fn(() => ({
                    get: jest.fn(() => Promise.resolve({
                      docs: mockFirebaseMessages,
                    })),
                  })),
                })),
              })),
            })),
          })),
        })),
      };

      (getFirebaseDb as jest.Mock).mockReturnValue(mockDb);
      (ChatEncryptionService.decryptMessage as jest.Mock).mockResolvedValue(mockMessage);
      (SyncDatabase.query as jest.Mock).mockResolvedValue([]);
      (SyncDatabase.upsert as jest.Mock).mockResolvedValue(undefined);

      await MessageSyncService.syncMessages(mockChatId);

      expect(mockDb.collection).toHaveBeenCalledWith('chats');
      expect(ChatEncryptionService.decryptMessage).toHaveBeenCalled();
      expect(SyncDatabase.upsert).toHaveBeenCalledWith(
        'messages',
        expect.objectContaining({
          id: mockMessage.id,
          chatId: mockMessage.chatId,
        })
      );
    });

    it('should handle offline scenario gracefully', async () => {
      (NetInfo.fetch as jest.Mock).mockResolvedValue({ isConnected: false });
      (SyncDatabase.query as jest.Mock).mockResolvedValue([mockMessage]);

      const messages = await MessageSyncService.getMessagesForChat(mockChatId);

      expect(messages).toEqual([mockMessage]);
      expect(SyncDatabase.query).toHaveBeenCalledWith(
        'messages',
        `chatId = ? ORDER BY timestamp DESC LIMIT ?`,
        [mockChatId, 50]
      );
    });

    it('should handle sync errors', async () => {
      const mockError = new Error('Sync failed');
      const mockDb = {
        collection: jest.fn(() => {
          throw mockError;
        }),
      };

      (getFirebaseDb as jest.Mock).mockReturnValue(mockDb);

      await expect(MessageSyncService.syncMessages(mockChatId)).rejects.toThrow('Sync failed');
    });
  });

  describe('queueMessage', () => {
    it('should queue message for offline sending', async () => {
      const queuedMessage = {
        ...mockMessage,
        status: 'sending' as const,
      };

      (SyncDatabase.insert as jest.Mock).mockResolvedValue(undefined);

      await MessageSyncService.queueMessage(queuedMessage);

      expect(SyncDatabase.insert).toHaveBeenCalledWith('messages', queuedMessage);
      expect(SyncDatabase.insert).toHaveBeenCalledWith(
        'sync_queue',
        expect.objectContaining({
          type: 'message',
          data: JSON.stringify(queuedMessage),
          status: 'pending',
        })
      );
    });
  });

  describe('processMessageQueue', () => {
    it('should process pending messages when online', async () => {
      const pendingMessage = {
        id: 'queue-1',
        type: 'message',
        data: JSON.stringify(mockMessage),
        status: 'pending',
        retryCount: 0,
      };

      (NetInfo.fetch as jest.Mock).mockResolvedValue({ isConnected: true });
      (SyncDatabase.query as jest.Mock).mockResolvedValue([pendingMessage]);
      (ChatEncryptionService.sendTextMessage as jest.Mock).mockResolvedValue(undefined);
      (SyncDatabase.update as jest.Mock).mockResolvedValue(undefined);

      await MessageSyncService.processMessageQueue();

      expect(ChatEncryptionService.sendTextMessage).toHaveBeenCalledWith(
        mockMessage.chatId,
        mockMessage.text
      );
      expect(SyncDatabase.update).toHaveBeenCalledWith(
        'sync_queue',
        { id: pendingMessage.id, status: 'completed' }
      );
    });

    it('should handle failed message with retry', async () => {
      const pendingMessage = {
        id: 'queue-1',
        type: 'message',
        data: JSON.stringify(mockMessage),
        status: 'pending',
        retryCount: 1,
      };

      (NetInfo.fetch as jest.Mock).mockResolvedValue({ isConnected: true });
      (SyncDatabase.query as jest.Mock).mockResolvedValue([pendingMessage]);
      (ChatEncryptionService.sendTextMessage as jest.Mock).mockRejectedValue(new Error('Send failed'));
      (SyncDatabase.update as jest.Mock).mockResolvedValue(undefined);

      await MessageSyncService.processMessageQueue();

      expect(SyncDatabase.update).toHaveBeenCalledWith(
        'sync_queue',
        expect.objectContaining({
          id: pendingMessage.id,
          status: 'pending',
          retryCount: 2,
          lastError: 'Send failed',
        })
      );
    });

    it('should mark message as failed after max retries', async () => {
      const pendingMessage = {
        id: 'queue-1',
        type: 'message',
        data: JSON.stringify(mockMessage),
        status: 'pending',
        retryCount: 3, // Max retries reached
      };

      (NetInfo.fetch as jest.Mock).mockResolvedValue({ isConnected: true });
      (SyncDatabase.query as jest.Mock).mockResolvedValue([pendingMessage]);
      (ChatEncryptionService.sendTextMessage as jest.Mock).mockRejectedValue(new Error('Send failed'));
      (SyncDatabase.update as jest.Mock).mockResolvedValue(undefined);

      await MessageSyncService.processMessageQueue();

      expect(SyncDatabase.update).toHaveBeenCalledWith(
        'sync_queue',
        expect.objectContaining({
          id: pendingMessage.id,
          status: 'failed',
        })
      );
      expect(SyncDatabase.update).toHaveBeenCalledWith(
        'messages',
        expect.objectContaining({
          id: mockMessage.id,
          status: 'failed',
        })
      );
    });
  });

  describe('resolveConflict', () => {
    it('should resolve conflicts based on timestamp', async () => {
      const localMessage = {
        ...mockMessage,
        timestamp: new Date('2024-01-01'),
        version: 1,
      };

      const remoteMessage = {
        ...mockMessage,
        timestamp: new Date('2024-01-02'),
        version: 2,
      };

      const resolved = await MessageSyncService.resolveConflict(localMessage as any, remoteMessage as any);

      expect(resolved).toEqual(remoteMessage);
    });

    it('should merge delivery/read receipts', async () => {
      const localMessage = {
        ...mockMessage,
        delivered: ['user-1'],
        read: ['user-1'],
        version: 1,
      };

      const remoteMessage = {
        ...mockMessage,
        delivered: ['user-2'],
        read: [],
        version: 1,
      };

      const resolved = await MessageSyncService.resolveConflict(localMessage as any, remoteMessage as any);

      expect(resolved.delivered).toEqual(['user-1', 'user-2']);
      expect(resolved.read).toEqual(['user-1']);
    });
  });

  describe('getMessagesForChat', () => {
    it('should retrieve messages from local database', async () => {
      const messages = [mockMessage];
      (SyncDatabase.query as jest.Mock).mockResolvedValue(messages);

      const result = await MessageSyncService.getMessagesForChat(mockChatId, 20);

      expect(result).toEqual(messages);
      expect(SyncDatabase.query).toHaveBeenCalledWith(
        'messages',
        `chatId = ? ORDER BY timestamp DESC LIMIT ?`,
        [mockChatId, 20]
      );
    });

    it('should support pagination with lastTimestamp', async () => {
      const lastTimestamp = new Date('2024-01-01');
      const messages = [mockMessage];
      (SyncDatabase.query as jest.Mock).mockResolvedValue(messages);

      const result = await MessageSyncService.getMessagesForChat(mockChatId, 20, lastTimestamp);

      expect(result).toEqual(messages);
      expect(SyncDatabase.query).toHaveBeenCalledWith(
        'messages',
        `chatId = ? AND timestamp < ? ORDER BY timestamp DESC LIMIT ?`,
        [mockChatId, lastTimestamp.toISOString(), 20]
      );
    });
  });

  describe('markMessageAsDelivered', () => {
    it('should update message delivery status', async () => {
      (SyncDatabase.query as jest.Mock).mockResolvedValue([mockMessage]);
      (SyncDatabase.update as jest.Mock).mockResolvedValue(undefined);

      await MessageSyncService.markMessageAsDelivered('msg-1', 'user-2');

      expect(SyncDatabase.update).toHaveBeenCalledWith(
        'messages',
        expect.objectContaining({
          id: 'msg-1',
          delivered: ['user-2'],
        })
      );
    });
  });

  describe('markMessageAsRead', () => {
    it('should update message read status', async () => {
      (SyncDatabase.query as jest.Mock).mockResolvedValue([mockMessage]);
      (SyncDatabase.update as jest.Mock).mockResolvedValue(undefined);

      await MessageSyncService.markMessageAsRead('msg-1', 'user-2');

      expect(SyncDatabase.update).toHaveBeenCalledWith(
        'messages',
        expect.objectContaining({
          id: 'msg-1',
          read: ['user-2'],
        })
      );
    });
  });

  describe('cleanup', () => {
    it('should remove old messages and queue items', async () => {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - 30);

      (SyncDatabase.executeSql as jest.Mock).mockResolvedValue({ rowsAffected: 10 });

      await MessageSyncService.cleanup();

      expect(SyncDatabase.executeSql).toHaveBeenCalledWith(
        expect.stringContaining('DELETE FROM messages WHERE timestamp < ?'),
        expect.any(Array)
      );
      expect(SyncDatabase.executeSql).toHaveBeenCalledWith(
        expect.stringContaining('DELETE FROM sync_queue WHERE'),
        expect.any(Array)
      );
    });
  });
});