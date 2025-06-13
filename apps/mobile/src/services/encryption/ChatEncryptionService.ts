import { MediaEncryptionService, EncryptedFile } from './MediaEncryptionService';
import { OfflineQueueService } from './OfflineQueueService';
import { MetadataEncryptionService } from './MetadataEncryptionService';
import { EncryptedSearchService } from './EncryptedSearchService';
import { AuditLogService } from './AuditLogService';
import { FirebaseFirestoreTypes } from '@react-native-firebase/firestore';
import { getFirebaseDb, getFirebaseAuth } from '../../lib/firebase';
import { callFirebaseFunction } from '../../lib/errorUtils';
import { Buffer } from '@craftzdog/react-native-buffer';
import NetInfo from '@react-native-community/netinfo';
import { logger } from '../LoggingService';
import { sanitizeUserInput, sanitizeFilename } from '../../lib/xssSanitization';

// Signal Protocol imports
import { LibsignalService } from './libsignal/LibsignalService';
import { KeyDistributionService } from './libsignal/services/KeyDistributionService';
import { SignalProtocolStore } from './libsignal/stores/SignalProtocolStore';
import { KeyGenerationService } from './libsignal/services/KeyGenerationService';

// Types
type Timestamp = FirebaseFirestoreTypes.Timestamp;

export interface UserKeys {
  userId: string;
  identityPublicKey: string;
  lastUpdated: Timestamp;
}

export interface Chat {
  id: string;
  type: 'direct' | 'group';
  participants: string[];
  createdAt: Timestamp;
  lastMessageAt: Timestamp;
  encryptionEnabled: boolean;
}

export interface MessageReaction {
  emoji: string;
  userIds: string[];
}

export interface Message {
  id: string;
  chatId: string;
  senderId: string;
  timestamp: Timestamp;
  type: 'text' | 'media' | 'file' | 'voice';
  // For text messages
  text?: string;
  // For media/file messages
  media?: EncryptedFile;
  // For voice messages
  duration?: number; // in seconds
  // Encryption status
  encrypted: boolean;
  // Delivery/read receipts
  delivered: string[];
  read: string[];
  // Message status
  status?: 'sending' | 'sent' | 'delivered' | 'read' | 'failed';
  // Reactions
  reactions?: MessageReaction[];
}

export interface EncryptedMessageData {
  id: string;
  chatId: string;
  senderId: string;
  timestamp: Timestamp;
  type: 'text' | 'media' | 'file' | 'voice';
  
  // Signal Protocol metadata
  signalMetadata: {
    senderDeviceId: number;
    recipients: {
      [userId: string]: {
        [deviceId: string]: {
          encryptedPayload: string;
          messageType: number;
        }
      }
    };
  };
  
  // Encrypted metadata
  encryptedMetadata?: {
    encryptedData: string;
    nonce: string;
    mac: string;
  };
  
  // For media messages
  media?: {
    encryptedUrl: string;
    encryptedKeys: {
      [recipientId: string]: string; // Base64 encrypted key for each recipient
    };
    metadata: {
      fileName: string;
      fileSize: number;
      mimeType: string;
      iv: string;
      tag: string;
    };
  };
  
  // For voice messages
  duration?: number; // in seconds
  delivered: string[];
  read: string[];
}

export interface DecryptedMessage extends Message {
  decryptionTime?: number;
  decryptionErrors?: string[];
}

// interface SyncOperation {
//   type: 'message' | 'delivery' | 'read' | 'reaction';
//   messageId: string;
//   data: any;
//   timestamp: number;
// }

/**
 * Main service for handling encrypted chat messages
 * Uses Signal Protocol for end-to-end encryption
 */
export class ChatEncryptionService {
  private static instance: ChatEncryptionService;
  private db: FirebaseFirestoreTypes.Module;
  private currentUserId: string | null = null;
  
  // Signal Protocol services
  private libsignalService: LibsignalService;
  private keyDistributionService: KeyDistributionService;
  private signalStore: SignalProtocolStore;
  
  // Performance tracking
  private metrics = {
    messagesEncrypted: 0,
    messagesDecrypted: 0,
    totalEncryptionTime: 0,
    totalDecryptionTime: 0,
    errors: 0
  };

  private constructor() {
    this.db = getFirebaseDb();
    
    const auth = getFirebaseAuth();
    this.currentUserId = auth.currentUser?.uid || null;
    
    // Initialize Signal Protocol services
    this.libsignalService = LibsignalService.getInstance();
    this.signalStore = new SignalProtocolStore();
    const keyGenService = new KeyGenerationService(this.signalStore);
    this.keyDistributionService = new KeyDistributionService(keyGenService, this.signalStore);
    
    // Initialize services
    this.initialize();
  }

  static getInstance(): ChatEncryptionService {
    if (!ChatEncryptionService.instance) {
      ChatEncryptionService.instance = new ChatEncryptionService();
    }
    return ChatEncryptionService.instance;
  }

  /**
   * Initialize the service and Signal Protocol
   */
  private async initialize(): Promise<void> {
    try {
      if (!this.currentUserId) {
        logger.warn('No authenticated user, skipping initialization');
        return;
      }
      
      logger.info('Initializing Signal Protocol');
      
      // Initialize Signal Protocol
      await this.libsignalService.initialize();
      
      // Generate keys if not already present
      const hasKeys = await this.libsignalService.hasIdentityKey();
      if (!hasKeys) {
        logger.info('No Signal Protocol keys found, generating new ones');
        await this.ensureEncryptionKeys();
      }
      
      // Setup audit logging
      AuditLogService.getInstance();
      
      logger.info('ChatEncryptionService initialized with Signal Protocol');
    } catch (error) {
      logger.error('Failed to initialize ChatEncryptionService:', error);
      throw error;
    }
  }

  /**
   * Get user's Signal Protocol bundle from Firebase
   */
  async getUserSignalBundle(userId: string): Promise<any> {
    try {
      // Try to get the bundle from the key distribution service
      const bundle = await this.keyDistributionService.fetchUserBundle(userId);
      if (bundle) {
        return bundle;
      }
      
      // Fallback to direct Firebase query
      const doc = await this.db.collection('users').doc(userId).get();
      if (!doc.exists) {
        throw new Error(`User ${userId} not found`);
      }
      
      const data = doc.data();
      if (!data?.signalBundle) {
        throw new Error(`No Signal bundle found for user ${userId}`);
      }
      
      return data.signalBundle;
    } catch (error) {
      logger.error('Failed to get user Signal bundle:', error);
      throw error;
    }
  }

  /**
   * Ensure user has Signal Protocol keys set up
   */
  async ensureEncryptionKeys(): Promise<void> {
    if (!this.currentUserId) {
      throw new Error('User not authenticated');
    }

    // Generate and publish Signal Protocol bundle
    await this.keyDistributionService.generateAndPublishBundle(this.currentUserId);
    logger.info('Signal Protocol bundle published:', { userId: this.currentUserId });
  }


  /**
   * Send an encrypted text message
   */
  async sendTextMessage(chatId: string, text: string): Promise<void> {
    try {
      if (!this.currentUserId) {
        throw new Error('User not authenticated');
      }

      // Sanitize the message text before processing
      const sanitizedText = sanitizeUserInput(text, { maxLength: 5000, trim: true });
      if (!sanitizedText) {
        logger.warn('Message was empty after sanitization');
        return;
      }

      // Check network status
      const netInfo = await NetInfo.fetch();
      if (!netInfo.isConnected) {
        // Queue message for offline sending
        const offlineQueueService = OfflineQueueService.getInstance();
        await offlineQueueService.queueMessage(chatId, 'text', sanitizedText);
        logger.debug('Message queued for offline sending');
        return;
      }

      // Get chat info
      const chatDoc = await this.db.collection('chats').doc(chatId).get();
      if (!chatDoc.exists) {
        throw new Error('Chat not found');
      }

      const chat = chatDoc.data() as Chat;
      const recipients = chat.participants.filter(id => id !== this.currentUserId);

      // Send using Signal Protocol
      await this.sendWithSignalProtocol(chatId, sanitizedText, recipients);
    } catch (error) {
      logger.error('Failed to send text message:', error);
      throw error;
    }
  }

  /**
   * Send message using Signal Protocol
   */
  private async sendWithSignalProtocol(
    chatId: string,
    text: string,
    recipients: string[]
  ): Promise<void> {
    if (!this.currentUserId) {
      throw new Error('User not authenticated');
    }

    const startTime = Date.now();
    const messageRef = this.db.collection('messages').doc();
    const metadata = {
      chatId,
      senderId: this.currentUserId,
      timestamp: Date.now()
    };

    // Encrypt message for all recipients
    const signalMetadata: any = {
      senderDeviceId: 1, // Default device ID
      recipients: {}
    };

    for (const recipientId of recipients) {
      try {
        // Get recipient's Signal bundle
        const _bundle = await this.getUserSignalBundle(recipientId); // eslint-disable-line @typescript-eslint/no-unused-vars
        
        // Encrypt message for this recipient
        const encrypted = await this.libsignalService.encryptMessage(
          recipientId,
          Buffer.from(JSON.stringify({ text, metadata }))
        );
        
        // Store encrypted payload
        if (!signalMetadata.recipients[recipientId]) {
          signalMetadata.recipients[recipientId] = {};
        }
        
        signalMetadata.recipients[recipientId]['1'] = {
          encryptedPayload: encrypted.toString('base64'),
          messageType: 3 // Whisper message type
        };
      } catch (error) {
        logger.error(`Failed to encrypt for ${recipientId}:`, error);
        // Continue with other recipients
      }
    }

    if (Object.keys(signalMetadata.recipients).length === 0) {
      throw new Error('Failed to encrypt message for any recipient');
    }

    // Encrypt metadata
    const encryptedMetadata = await MetadataEncryptionService.getInstance().encryptMetadata(metadata);

    // Create message document
    const messageData: EncryptedMessageData = {
      id: messageRef.id,
      chatId,
      senderId: this.currentUserId,
      timestamp: FirebaseFirestoreTypes.FieldValue.serverTimestamp() as any,
      type: 'text',
      signalMetadata,
      encryptedMetadata,
      delivered: [],
      read: []
    };

    await messageRef.set(messageData);

    // Update chat last message
    await this.db.collection('chats').doc(chatId).update({
      lastMessageAt: FirebaseFirestoreTypes.FieldValue.serverTimestamp()
    });

    // Index message for search (fire and forget)
    EncryptedSearchService.getInstance().indexMessage(
      messageRef.id,
      chatId,
      text,
      metadata
    ).catch(error => logger.error('Failed to index message:', error));

    logger.debug('Message sent with Signal Protocol');
    
    // Track metrics
    const encryptionTime = Date.now() - startTime;
    this.updateMetrics('encryption', encryptionTime, true);
  }


  /**
   * Send an encrypted media message (photo, video, file, voice)
   */
  async sendMediaMessage(
    chatId: string,
    fileUri: string,
    fileName: string,
    mimeType: string,
    duration?: number // in seconds, for voice messages
  ): Promise<void> {
    try {
      if (!this.currentUserId) {
        throw new Error('User not authenticated');
      }

      // Sanitize the filename
      const sanitizedFileName = sanitizeFilename(fileName);

      // Check network status
      const netInfo = await NetInfo.fetch();
      if (!netInfo.isConnected) {
        // Queue media message for offline sending
        const offlineQueueService = OfflineQueueService.getInstance();
        await offlineQueueService.queueOfflineMessage(chatId, 'media', undefined, fileUri);
        logger.debug('Media message queued for offline sending');
        return;
      }

      // Get chat info
      const chatDoc = await this.db.collection('chats').doc(chatId).get();
      if (!chatDoc.exists) {
        throw new Error('Chat not found');
      }

      const chat = chatDoc.data() as Chat;
      const recipients = chat.participants.filter(id => id !== this.currentUserId);

      // Upload and encrypt file
      const encryptedFile = await MediaEncryptionService.getInstance().uploadEncryptedFile(
        fileUri,
        sanitizedFileName,
        mimeType,
        chatId
      );

      // Encrypt the file key for each recipient using Signal Protocol
      const encryptedKeys: { [recipientId: string]: string } = {};
      
      for (const recipientId of recipients) {
        try {
          // Get recipient's Signal bundle
          await this.getUserSignalBundle(recipientId);
          
          // Encrypt the file key for this recipient
          const encrypted = await this.libsignalService.encryptMessage(
            recipientId,
            Buffer.from(encryptedFile.encryptionKey)
          );
          
          encryptedKeys[recipientId] = encrypted.toString('base64');
        } catch (error) {
          logger.error(`Failed to encrypt file key for ${recipientId}:`, error);
          // Continue with other recipients
        }
      }

      if (Object.keys(encryptedKeys).length === 0) {
        throw new Error('Failed to encrypt file key for any recipient');
      }

      // Determine message type based on mimeType
      let messageType: 'media' | 'file' | 'voice' = 'file';
      if (mimeType.startsWith('image/') || mimeType.startsWith('video/')) {
        messageType = 'media';
      } else if (mimeType.startsWith('audio/') && duration !== undefined) {
        messageType = 'voice';
      }

      // Create encrypted message document with Signal Protocol metadata
      const messageData: EncryptedMessageData = {
        id: `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        chatId,
        senderId: this.currentUserId,
        timestamp: FirebaseFirestoreTypes.FieldValue.serverTimestamp() as any,
        type: messageType,
        signalMetadata: {
          senderDeviceId: 1,
          recipients: {} // Empty for media messages, keys are in media.encryptedKeys
        },
        media: {
          encryptedUrl: encryptedFile.encryptedUrl,
          encryptedKeys,
          metadata: encryptedFile.metadata
        },
        delivered: [],
        read: []
      };

      if (duration !== undefined) {
        messageData.duration = duration;
      }

      // Save to Firestore
      await this.db.collection('messages').doc(messageData.id).set(messageData);

      // Update chat last message
      await this.db.collection('chats').doc(chatId).update({
        lastMessageAt: FirebaseFirestoreTypes.FieldValue.serverTimestamp()
      });

      logger.debug(`Encrypted ${messageType} message sent`);
      
      // Send push notifications (fire and forget)
      callFirebaseFunction('sendMessageNotification', {
        chatId,
        senderId: this.currentUserId,
        recipientIds: recipients,
        messageType,
        fileName: sanitizedFileName
      }).catch(error => logger.error('Failed to send notification:', error));
      
    } catch (error) {
      logger.error('Failed to send media message:', error);
      throw error;
    }
  }

  /**
   * Decrypt a message
   */
  async decryptMessage(encryptedMessage: EncryptedMessageData): Promise<DecryptedMessage> {
    const startTime = Date.now();
    
    try {
      if (!this.currentUserId) {
        throw new Error('User not authenticated');
      }

      // Decrypt using Signal Protocol
      return await this.decryptWithSignalProtocol(encryptedMessage);
    } catch (error) {
      logger.error('Failed to decrypt message:', error);
      throw error;
    } finally {
      const decryptionTime = Date.now() - startTime;
      this.updateMetrics('decryption', decryptionTime, true);
    }
  }

  /**
   * Decrypt using Signal Protocol
   */
  private async decryptWithSignalProtocol(
    encryptedMessage: EncryptedMessageData
  ): Promise<DecryptedMessage> {
    if (!this.currentUserId) {
      throw new Error('User not authenticated');
    }

    const decryptedContent: DecryptedMessage = {
      id: encryptedMessage.id,
      chatId: encryptedMessage.chatId,
      senderId: encryptedMessage.senderId,
      timestamp: encryptedMessage.timestamp,
      type: encryptedMessage.type,
      encrypted: true,
      delivered: encryptedMessage.delivered || [],
      read: encryptedMessage.read || [],
      decryptionTime: Date.now()
    };

    // Decrypt text content if this is a text message
    if (encryptedMessage.type === 'text' && encryptedMessage.signalMetadata) {
      try {
        // Find encrypted payload for current user and device
        const userPayloads = encryptedMessage.signalMetadata.recipients[this.currentUserId];
        if (!userPayloads) {
          throw new Error('No encrypted payload found for current user');
        }
        
        // Get payload for default device (device ID 1)
        const devicePayload = userPayloads['1'];
        if (!devicePayload) {
          throw new Error('No encrypted payload found for current device');
        }
        
        // Decrypt the message
        const decryptedBuffer = await this.libsignalService.decryptMessage(
          encryptedMessage.senderId,
          Buffer.from(devicePayload.encryptedPayload, 'base64')
        );
        
        const decryptedData = JSON.parse(decryptedBuffer.toString());
        decryptedContent.text = decryptedData.text;
      } catch (error) {
        logger.error('Failed to decrypt text content:', error);
        decryptedContent.decryptionErrors = ['Failed to decrypt message content'];
      }
    }

    // Handle media messages
    if (encryptedMessage.media && encryptedMessage.type !== 'text') {
      await this.decryptMediaMessage(encryptedMessage, decryptedContent);
    }

    // Decrypt metadata if available
    if (encryptedMessage.encryptedMetadata) {
      try {
        const metadata = await MetadataEncryptionService.getInstance().decryptMetadata(
          encryptedMessage.encryptedMetadata
        );
        // Apply decrypted metadata to message
        Object.assign(decryptedContent, metadata);
      } catch (error) {
        logger.error('Failed to decrypt metadata:', error);
      }
    }

    // Handle voice message duration
    if (encryptedMessage.duration !== undefined) {
      decryptedContent.duration = encryptedMessage.duration;
    }

    return decryptedContent;
  }


  /**
   * Decrypt media message content
   */
  private async decryptMediaMessage(
    encryptedMessage: EncryptedMessageData,
    decryptedContent: DecryptedMessage
  ): Promise<void> {
    if (!encryptedMessage.media || !this.currentUserId) {
      return;
    }

    try {
      // Get the encrypted file key for current user
      const encryptedKeyData = encryptedMessage.media.encryptedKeys[this.currentUserId];
      if (!encryptedKeyData) {
        throw new Error('No encrypted key found for current user');
      }

      // Decrypt the file key using Signal Protocol
      const fileKey = await this.libsignalService.decryptMessage(
        encryptedMessage.senderId,
        Buffer.from(encryptedKeyData, 'base64')
      ).then(buffer => buffer.toString());

      // Prepare decrypted media info
      decryptedContent.media = {
        encryptedUrl: encryptedMessage.media.encryptedUrl,
        encryptionKey: fileKey,
        metadata: encryptedMessage.media.metadata
      } as any;
    } catch (error) {
      logger.error('Failed to decrypt media content:', error);
      decryptedContent.decryptionErrors = decryptedContent.decryptionErrors || [];
      decryptedContent.decryptionErrors.push('Failed to decrypt media');
    }
  }

  /**
   * Mark message as delivered
   */
  async markAsDelivered(messageId: string): Promise<void> {
    try {
      if (!this.currentUserId) {
        throw new Error('User not authenticated');
      }

      await this.db.collection('messages').doc(messageId).update({
        delivered: FirebaseFirestoreTypes.FieldValue.arrayUnion(this.currentUserId)
      });

      logger.debug(`Message ${messageId} marked as delivered`);
    } catch (error) {
      logger.error('Failed to mark message as delivered:', error);
    }
  }

  /**
   * Mark message as read
   */
  async markAsRead(messageId: string): Promise<void> {
    try {
      if (!this.currentUserId) {
        throw new Error('User not authenticated');
      }

      await this.db.collection('messages').doc(messageId).update({
        read: FirebaseFirestoreTypes.FieldValue.arrayUnion(this.currentUserId)
      });

      logger.debug(`Message ${messageId} marked as read`);
    } catch (error) {
      logger.error('Failed to mark message as read:', error);
    }
  }

  /**
   * Add reaction to message
   */
  async addReaction(messageId: string, emoji: string): Promise<void> {
    try {
      if (!this.currentUserId) {
        throw new Error('User not authenticated');
      }

      const messageRef = this.db.collection('messages').doc(messageId);
      
      await this.db.runTransaction(async (transaction) => {
        const messageDoc = await transaction.get(messageRef);
        if (!messageDoc.exists) {
          throw new Error('Message not found');
        }

        const reactions = messageDoc.data()?.reactions || [];
        const existingReaction = reactions.find((r: MessageReaction) => r.emoji === emoji);

        if (existingReaction) {
          // Add user to existing reaction
          if (!existingReaction.userIds.includes(this.currentUserId!)) {
            existingReaction.userIds.push(this.currentUserId!);
          }
        } else {
          // Create new reaction
          reactions.push({
            emoji,
            userIds: [this.currentUserId!]
          });
        }

        transaction.update(messageRef, { reactions });
      });

      logger.debug(`Added reaction ${emoji} to message ${messageId}`);
    } catch (error) {
      logger.error('Failed to add reaction:', error);
      throw error;
    }
  }

  /**
   * Remove reaction from message
   */
  async removeReaction(messageId: string, emoji: string): Promise<void> {
    try {
      if (!this.currentUserId) {
        throw new Error('User not authenticated');
      }

      const messageRef = this.db.collection('messages').doc(messageId);
      
      await this.db.runTransaction(async (transaction) => {
        const messageDoc = await transaction.get(messageRef);
        if (!messageDoc.exists) {
          throw new Error('Message not found');
        }

        let reactions = messageDoc.data()?.reactions || [];
        const reactionIndex = reactions.findIndex((r: MessageReaction) => r.emoji === emoji);

        if (reactionIndex !== -1) {
          const reaction = reactions[reactionIndex];
          const userIndex = reaction.userIds.indexOf(this.currentUserId!);
          
          if (userIndex !== -1) {
            reaction.userIds.splice(userIndex, 1);
            
            // Remove reaction if no users left
            if (reaction.userIds.length === 0) {
              reactions.splice(reactionIndex, 1);
            }
          }
        }

        transaction.update(messageRef, { reactions });
      });

      logger.debug(`Removed reaction ${emoji} from message ${messageId}`);
    } catch (error) {
      logger.error('Failed to remove reaction:', error);
      throw error;
    }
  }

  /**
   * Delete message (soft delete)
   */
  async deleteMessage(messageId: string): Promise<void> {
    try {
      if (!this.currentUserId) {
        throw new Error('User not authenticated');
      }

      // For now, just mark as deleted for the current user
      // In a real implementation, you might want to handle this differently
      await this.db.collection('messages').doc(messageId).update({
        [`deletedBy.${this.currentUserId}`]: FirebaseFirestoreTypes.FieldValue.serverTimestamp()
      });

      logger.debug(`Message ${messageId} marked as deleted`);
    } catch (error) {
      logger.error('Failed to delete message:', error);
      throw error;
    }
  }

  /**
   * Search encrypted messages
   */
  async searchMessages(chatId: string, query: string): Promise<Message[]> {
    try {
      const results = await EncryptedSearchService.getInstance().searchMessages(chatId, query);
      
      // Decrypt the search results
      const decryptedMessages: Message[] = [];
      
      for (const result of results) {
        try {
          // Fetch the full encrypted message
          const messageDoc = await this.db.collection('messages').doc(result.messageId).get();
          if (messageDoc.exists) {
            const encryptedMessage = messageDoc.data() as EncryptedMessageData;
            const decrypted = await this.decryptMessage(encryptedMessage);
            decryptedMessages.push(decrypted);
          }
        } catch (error) {
          logger.error(`Failed to decrypt search result ${result.messageId}:`, error);
        }
      }
      
      return decryptedMessages;
    } catch (error) {
      logger.error('Failed to search messages:', error);
      return [];
    }
  }

  /**
   * Handle offline queue when coming back online
   */
  async processOfflineQueue(): Promise<void> {
    try {
      const offlineQueueService = OfflineQueueService.getInstance();
      await offlineQueueService.processOfflineQueue();
    } catch (error) {
      logger.error('Failed to process offline queue:', error);
    }
  }

  /**
   * Update performance metrics
   */
  private updateMetrics(operation: 'encryption' | 'decryption', time: number, success: boolean): void {
    if (operation === 'encryption') {
      this.metrics.messagesEncrypted++;
      this.metrics.totalEncryptionTime += time;
    } else {
      this.metrics.messagesDecrypted++;
      this.metrics.totalDecryptionTime += time;
    }
    
    if (!success) {
      this.metrics.errors++;
    }
  }

  /**
   * Get performance metrics
   */
  getMetrics(): {
    messagesEncrypted: number;
    messagesDecrypted: number;
    averageEncryptionTime: number;
    averageDecryptionTime: number;
    errorRate: number;
  } {
    const totalOperations = this.metrics.messagesEncrypted + this.metrics.messagesDecrypted;
    
    return {
      messagesEncrypted: this.metrics.messagesEncrypted,
      messagesDecrypted: this.metrics.messagesDecrypted,
      averageEncryptionTime: this.metrics.messagesEncrypted > 0 
        ? this.metrics.totalEncryptionTime / this.metrics.messagesEncrypted 
        : 0,
      averageDecryptionTime: this.metrics.messagesDecrypted > 0 
        ? this.metrics.totalDecryptionTime / this.metrics.messagesDecrypted 
        : 0,
      errorRate: totalOperations > 0 ? this.metrics.errors / totalOperations : 0
    };
  }
  
  /**
   * Cleanup and reset service
   */
  async cleanup(): Promise<void> {
    try {
      await this.libsignalService.clearAllData();
      this.currentUserId = null;
      this.metrics = {
        messagesEncrypted: 0,
        messagesDecrypted: 0,
        totalEncryptionTime: 0,
        totalDecryptionTime: 0,
        errors: 0
      };
      
      logger.info('ChatEncryptionService cleaned up');
    } catch (error) {
      logger.error('Failed to cleanup ChatEncryptionService:', error);
    }
  }
}

export default ChatEncryptionService;