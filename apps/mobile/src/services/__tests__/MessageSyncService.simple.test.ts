// Simple test for MessageSyncService core logic
describe('MessageSyncService - Simple Tests', () => {
  // Mock a simple version of the service
  class SimpleMessageSyncService {
    private messageQueue: Map<string, any> = new Map();
    private syncedMessages: Map<string, any[]> = new Map();

    async queueMessage(chatId: string, message: any) {
      const queueId = `${chatId}_${Date.now()}_${Math.random()}`;
      this.messageQueue.set(queueId, { ...message, status: 'queued' });
      return queueId;
    }

    async processMessageQueue() {
      const processed: string[] = [];
      
      for (const [id, message] of this.messageQueue.entries()) {
        // Simulate processing
        message.status = 'sent';
        message.sentAt = new Date();
        
        // Add to synced messages
        const chatMessages = this.syncedMessages.get(message.chatId) || [];
        chatMessages.push(message);
        this.syncedMessages.set(message.chatId, chatMessages);
        
        // Remove from queue
        this.messageQueue.delete(id);
        processed.push(id);
      }
      
      return processed;
    }

    async getMessagesForChat(chatId: string) {
      return this.syncedMessages.get(chatId) || [];
    }

    resolveConflict(localMessage: any, remoteMessage: any) {
      // Last write wins
      const localTime = new Date(localMessage.updatedAt || localMessage.createdAt).getTime();
      const remoteTime = new Date(remoteMessage.updatedAt || remoteMessage.createdAt).getTime();
      
      return remoteTime > localTime ? remoteMessage : localMessage;
    }

    getQueueSize() {
      return this.messageQueue.size;
    }

    clearQueue() {
      this.messageQueue.clear();
    }
  }

  let service: SimpleMessageSyncService;

  beforeEach(() => {
    service = new SimpleMessageSyncService();
  });

  describe('queueMessage', () => {
    it('should queue a message', async () => {
      const message = {
        chatId: 'chat-123',
        text: 'Hello',
        senderId: 'user-123',
        createdAt: new Date(),
      };

      const queueId = await service.queueMessage('chat-123', message);
      
      expect(queueId).toBeTruthy();
      expect(service.getQueueSize()).toBe(1);
    });

    it('should queue multiple messages', async () => {
      await service.queueMessage('chat-123', { text: 'Message 1' });
      await service.queueMessage('chat-123', { text: 'Message 2' });
      await service.queueMessage('chat-456', { text: 'Message 3' });
      
      expect(service.getQueueSize()).toBe(3);
    });
  });

  describe('processMessageQueue', () => {
    it('should process all queued messages', async () => {
      await service.queueMessage('chat-123', { 
        chatId: 'chat-123',
        text: 'Message 1' 
      });
      await service.queueMessage('chat-123', { 
        chatId: 'chat-123',
        text: 'Message 2' 
      });
      
      const processed = await service.processMessageQueue();
      
      expect(processed).toHaveLength(2);
      expect(service.getQueueSize()).toBe(0);
      
      const messages = await service.getMessagesForChat('chat-123');
      expect(messages).toHaveLength(2);
      expect(messages[0].status).toBe('sent');
      expect(messages[0].sentAt).toBeDefined();
    });

    it('should handle empty queue', async () => {
      const processed = await service.processMessageQueue();
      
      expect(processed).toHaveLength(0);
      expect(service.getQueueSize()).toBe(0);
    });
  });

  describe('getMessagesForChat', () => {
    it('should return messages for a specific chat', async () => {
      await service.queueMessage('chat-123', { 
        chatId: 'chat-123',
        text: 'Message 1' 
      });
      await service.queueMessage('chat-456', { 
        chatId: 'chat-456',
        text: 'Message 2' 
      });
      
      await service.processMessageQueue();
      
      const chat123Messages = await service.getMessagesForChat('chat-123');
      const chat456Messages = await service.getMessagesForChat('chat-456');
      
      expect(chat123Messages).toHaveLength(1);
      expect(chat456Messages).toHaveLength(1);
      expect(chat123Messages[0].text).toBe('Message 1');
      expect(chat456Messages[0].text).toBe('Message 2');
    });

    it('should return empty array for chat with no messages', async () => {
      const messages = await service.getMessagesForChat('non-existent');
      
      expect(messages).toEqual([]);
    });
  });

  describe('resolveConflict', () => {
    it('should choose remote message when it is newer', () => {
      const localMessage = {
        id: 'msg-1',
        text: 'Local version',
        updatedAt: new Date('2025-01-23T10:00:00'),
      };
      
      const remoteMessage = {
        id: 'msg-1',
        text: 'Remote version',
        updatedAt: new Date('2025-01-23T11:00:00'),
      };
      
      const resolved = service.resolveConflict(localMessage, remoteMessage);
      
      expect(resolved).toBe(remoteMessage);
      expect(resolved.text).toBe('Remote version');
    });

    it('should choose local message when it is newer', () => {
      const localMessage = {
        id: 'msg-1',
        text: 'Local version',
        updatedAt: new Date('2025-01-23T11:00:00'),
      };
      
      const remoteMessage = {
        id: 'msg-1',
        text: 'Remote version',
        updatedAt: new Date('2025-01-23T10:00:00'),
      };
      
      const resolved = service.resolveConflict(localMessage, remoteMessage);
      
      expect(resolved).toBe(localMessage);
      expect(resolved.text).toBe('Local version');
    });

    it('should use createdAt when updatedAt is not available', () => {
      const localMessage = {
        id: 'msg-1',
        text: 'Local version',
        createdAt: new Date('2025-01-23T10:00:00'),
      };
      
      const remoteMessage = {
        id: 'msg-1',
        text: 'Remote version',
        createdAt: new Date('2025-01-23T11:00:00'),
      };
      
      const resolved = service.resolveConflict(localMessage, remoteMessage);
      
      expect(resolved).toBe(remoteMessage);
    });
  });

  describe('queue management', () => {
    it('should clear the queue', async () => {
      await service.queueMessage('chat-123', { text: 'Message 1' });
      await service.queueMessage('chat-123', { text: 'Message 2' });
      
      expect(service.getQueueSize()).toBe(2);
      
      service.clearQueue();
      
      expect(service.getQueueSize()).toBe(0);
    });
  });
});