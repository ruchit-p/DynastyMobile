import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo from '@react-native-community/netinfo';
import { getFirebaseDb } from '../../lib/firebase';
import { logger } from '../LoggingService';

interface QueuedMessage {
  id: string;
  chatId: string;
  type: 'text' | 'media' | 'voice';
  content?: string;
  mediaUri?: string;
  timestamp: number;
  retryCount: number;
  maxRetries: number;
  encryptedPayloads?: { [recipientId: string]: any };
}

interface QueuedFileOperation {
  id: string;
  type: 'upload' | 'download';
  fileUri?: string;
  fileId?: string;
  folderId?: string;
  timestamp: number;
  retryCount: number;
  maxRetries: number;
  metadata?: any;
}

export class OfflineQueueService {
  private static instance: OfflineQueueService;
  private messageQueue: Map<string, QueuedMessage> = new Map();
  private fileQueue: Map<string, QueuedFileOperation> = new Map();
  private isOnline: boolean = true;
  private processingQueue: boolean = false;
  private db = getFirebaseDb();
  private chatEncryptionService: any = null; // Will be injected to avoid circular dependency

  private readonly MESSAGE_QUEUE_KEY = '@dynasty_message_queue';
  private readonly FILE_QUEUE_KEY = '@dynasty_file_queue';
  private readonly MAX_RETRIES = 3;
  private readonly RETRY_DELAY = 5000; // 5 seconds

  private constructor() {
    this.initializeNetworkListener();
    this.loadQueuesFromStorage();
  }

  static getInstance(): OfflineQueueService {
    if (!OfflineQueueService.instance) {
      OfflineQueueService.instance = new OfflineQueueService();
    }
    return OfflineQueueService.instance;
  }

  /**
   * Inject ChatEncryptionService to avoid circular dependency
   */
  setChatEncryptionService(chatService: any): void {
    this.chatEncryptionService = chatService;
  }

  private initializeNetworkListener() {
    NetInfo.addEventListener(state => {
      const wasOffline = !this.isOnline;
      this.isOnline = state.isConnected ?? false;

      logger.debug('Network state changed:', { isOnline: this.isOnline, wasOffline });

      // Process queue when coming back online
      if (wasOffline && this.isOnline) {
        this.processAllQueues();
      }
    });
  }

  private async loadQueuesFromStorage() {
    try {
      // Load message queue
      const messageQueueData = await AsyncStorage.getItem(this.MESSAGE_QUEUE_KEY);
      if (messageQueueData) {
        const messages: QueuedMessage[] = JSON.parse(messageQueueData);
        messages.forEach(msg => this.messageQueue.set(msg.id, msg));
      }

      // Load file queue
      const fileQueueData = await AsyncStorage.getItem(this.FILE_QUEUE_KEY);
      if (fileQueueData) {
        const files: QueuedFileOperation[] = JSON.parse(fileQueueData);
        files.forEach(file => this.fileQueue.set(file.id, file));
      }

      // Process queues if online
      if (this.isOnline) {
        this.processAllQueues();
      }
    } catch (error) {
      logger.error('Failed to load queues from storage:', error);
    }
  }

  private async saveQueuestoStorage() {
    try {
      // Save message queue
      const messages = Array.from(this.messageQueue.values());
      await AsyncStorage.setItem(this.MESSAGE_QUEUE_KEY, JSON.stringify(messages));

      // Save file queue
      const files = Array.from(this.fileQueue.values());
      await AsyncStorage.setItem(this.FILE_QUEUE_KEY, JSON.stringify(files));
    } catch (error) {
      logger.error('Failed to save queues to storage:', error);
    }
  }

  /**
   * Queue a message for sending
   */
  async queueMessage(
    chatId: string,
    type: 'text' | 'media' | 'voice',
    content?: string,
    mediaUri?: string
  ): Promise<string> {
    const messageId = `queued_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    const queuedMessage: QueuedMessage = {
      id: messageId,
      chatId,
      type,
      content,
      mediaUri,
      timestamp: Date.now(),
      retryCount: 0,
      maxRetries: this.MAX_RETRIES
    };

    this.messageQueue.set(messageId, queuedMessage);
    await this.saveQueuestoStorage();

    // Try to send immediately if online
    if (this.isOnline) {
      this.processMessageQueue();
    }

    return messageId;
  }

  /**
   * Queue a file operation
   */
  async queueFileOperation(
    type: 'upload' | 'download',
    fileUri?: string,
    fileId?: string,
    folderId?: string,
    metadata?: any
  ): Promise<string> {
    const operationId = `file_op_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    const queuedOperation: QueuedFileOperation = {
      id: operationId,
      type,
      fileUri,
      fileId,
      folderId,
      timestamp: Date.now(),
      retryCount: 0,
      maxRetries: this.MAX_RETRIES,
      metadata
    };

    this.fileQueue.set(operationId, queuedOperation);
    await this.saveQueuestoStorage();

    // Try to process immediately if online
    if (this.isOnline) {
      this.processFileQueue();
    }

    return operationId;
  }

  /**
   * Process all queues
   */
  private async processAllQueues() {
    if (this.processingQueue || !this.isOnline) return;

    this.processingQueue = true;
    
    try {
      await Promise.all([
        this.processMessageQueue(),
        this.processFileQueue()
      ]);
    } finally {
      this.processingQueue = false;
    }
  }

  /**
   * Process message queue
   */
  private async processMessageQueue() {
    const messages = Array.from(this.messageQueue.values())
      .sort((a, b) => a.timestamp - b.timestamp);

    for (const message of messages) {
      try {
        await this.sendQueuedMessage(message);
        
        // Remove from queue on success
        this.messageQueue.delete(message.id);
        await this.saveQueuestoStorage();
        
      } catch (error) {
        logger.error(`Failed to send queued message ${message.id}:`, error);
        
        // Increment retry count
        message.retryCount++;
        
        if (message.retryCount >= message.maxRetries) {
          // Move to failed queue or notify user
          logger.error(`Message ${message.id} failed after ${message.maxRetries} retries`);
          this.messageQueue.delete(message.id);
        } else {
          // Update queue with retry count
          this.messageQueue.set(message.id, message);
        }
        
        await this.saveQueuestoStorage();
        
        // Wait before retrying next message
        await new Promise(resolve => setTimeout(resolve, this.RETRY_DELAY));
      }
    }
  }

  /**
   * Send a queued message
   */
  private async sendQueuedMessage(message: QueuedMessage) {
    if (!this.chatEncryptionService) {
      logger.error('[OfflineQueueService] ChatEncryptionService not injected');
      throw new Error('ChatEncryptionService not available');
    }

    switch (message.type) {
      case 'text':
        if (message.content) {
          await this.chatEncryptionService.sendTextMessage(message.chatId, message.content);
        }
        break;
        
      case 'media':
        if (message.mediaUri) {
          await this.chatEncryptionService.sendMediaMessage(
            message.chatId, 
            message.mediaUri, 
            message.type
          );
        }
        break;
        
      case 'voice':
        if (message.mediaUri) {
          await this.chatEncryptionService.sendMediaMessage(
            message.chatId,
            message.mediaUri,
            'audio'
          );
        }
        break;
    }
  }

  /**
   * Process file queue
   */
  private async processFileQueue() {
    const operations = Array.from(this.fileQueue.values())
      .sort((a, b) => a.timestamp - b.timestamp);

    for (const operation of operations) {
      try {
        await this.processFileOperation(operation);
        
        // Remove from queue on success
        this.fileQueue.delete(operation.id);
        await this.saveQueuestoStorage();
        
      } catch (error) {
        logger.error(`Failed to process file operation ${operation.id}:`, error);
        
        // Increment retry count
        operation.retryCount++;
        
        if (operation.retryCount >= operation.maxRetries) {
          logger.error(`File operation ${operation.id} failed after ${operation.maxRetries} retries`);
          this.fileQueue.delete(operation.id);
        } else {
          this.fileQueue.set(operation.id, operation);
        }
        
        await this.saveQueuestoStorage();
        
        // Wait before retrying
        await new Promise(resolve => setTimeout(resolve, this.RETRY_DELAY));
      }
    }
  }

  /**
   * Process a file operation
   */
  private async processFileOperation(operation: QueuedFileOperation) {
    // This would integrate with your vault service
    // For now, just log the operation
    logger.debug('Processing file operation:', operation);
    
    if (operation.type === 'upload' && operation.fileUri) {
      // Upload file to encrypted vault
      // const vaultService = VaultService.getInstance();
      // await vaultService.uploadFile(operation.fileUri, operation.folderId);
    } else if (operation.type === 'download' && operation.fileId) {
      // Download file from vault
      // const vaultService = VaultService.getInstance();
      // await vaultService.downloadFile(operation.fileId);
    }
  }

  /**
   * Get queue status
   */
  getQueueStatus() {
    return {
      messageCount: this.messageQueue.size,
      fileCount: this.fileQueue.size,
      isOnline: this.isOnline,
      isProcessing: this.processingQueue
    };
  }

  /**
   * Clear all queues (use with caution)
   */
  async clearAllQueues() {
    this.messageQueue.clear();
    this.fileQueue.clear();
    await AsyncStorage.multiRemove([this.MESSAGE_QUEUE_KEY, this.FILE_QUEUE_KEY]);
  }

  /**
   * Retry failed items
   */
  async retryFailedItems() {
    // Reset retry counts for items that have failed
    this.messageQueue.forEach(msg => {
      if (msg.retryCount >= msg.maxRetries) {
        msg.retryCount = 0;
      }
    });

    this.fileQueue.forEach(op => {
      if (op.retryCount >= op.maxRetries) {
        op.retryCount = 0;
      }
    });

    await this.saveQueuestoStorage();
    this.processAllQueues();
  }
}

export default OfflineQueueService.getInstance();