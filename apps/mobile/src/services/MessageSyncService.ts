import { FirebaseFirestoreTypes } from '@react-native-firebase/firestore';

const Timestamp = FirebaseFirestoreTypes.Timestamp;
import { getErrorMessage } from '../lib/errorUtils';
import { getFirebaseDb } from '../lib/firebase';
import { SyncDatabase } from '../database/SyncDatabase';
import { LocalMessage, SyncQueueItem } from '../database/schema';
import { ChatEncryptionService } from './encryption/ChatEncryptionService';
import { KeyRotationService } from './encryption/KeyRotationService';
import NetInfo from '@react-native-community/netinfo';
import DeviceInfo from 'react-native-device-info';
import { logger } from './LoggingService';
import { callFirebaseFunction } from '../lib/errorUtils';

// Types
export interface Message {
  id: string;
  conversationId: string;
  chatId: string; // Alias for conversationId used in some contexts
  senderId: string;
  recipientId?: string;
  content: string;
  encryptedContent?: string;
  type: 'text' | 'image' | 'video' | 'audio' | 'file';
  mediaUrl?: string;
  encryptedMediaUrl?: string;
  timestamp: FirebaseFirestoreTypes.Timestamp;
  deliveryStatus: 'sending' | 'sent' | 'delivered' | 'read' | 'failed';
  encryptionKeyId?: string;
  isEncrypted: boolean;
  readBy?: { userId: string; timestamp: FirebaseFirestoreTypes.Timestamp }[];
  conversationType?: 'direct' | 'group';
  updatedAt?: FirebaseFirestoreTypes.Timestamp;
  keyRotationVersion?: string;
}

export interface Conversation {
  id: string;
  participants: string[];
  type: 'direct' | 'group';
  lastMessage?: Message;
  lastActivity: FirebaseFirestoreTypes.Timestamp;
  encryptionEnabled: boolean;
  publicKeys?: { [userId: string]: string };
}

export interface EncryptionKey {
  id: string;
  userId: string;
  publicKey: string;
  privateKeyEncrypted: string;
  createdAt: FirebaseFirestoreTypes.Timestamp;
  deviceId: string;
  isActive: boolean;
}

export interface MessageQueueItem {
  id: string;
  message: Message;
  retryCount: number;
  maxRetries: number;
  nextRetryAt?: Date;
  error?: string;
}

export interface MessageConflict {
  messageId: string;
  conversationId: string;
  localMessage: Message;
  remoteMessage: Message;
  conflictType: 'content' | 'delivery' | 'encryption';
}

// Interface
export interface IMessageSyncService {
  syncMessages(conversationId: string, since?: Date): Promise<void>;
  queueMessage(message: Omit<Message, 'id' | 'timestamp' | 'deliveryStatus'>): Promise<string>;
  syncEncryptionKeys(userId: string): Promise<void>;
  updateDeliveryStatus(messageId: string, status: Message['deliveryStatus']): Promise<void>;
  resolveMessageConflicts(conflict: MessageConflict): Promise<Message>;
  retryFailedMessages(conversationId?: string): Promise<void>;
  syncConversations(userId: string): Promise<void>;
  rotateEncryptionKeys(userId: string): Promise<void>;
}

// Implementation
export class MessageSyncService implements IMessageSyncService {
  private static instance: MessageSyncService;
  private messageQueue: Map<string, MessageQueueItem> = new Map();
  private encryptionKeyCache: Map<string, EncryptionKey> = new Map();
  private conversationCache: Map<string, Conversation> = new Map();
  private syncInProgress: Set<string> = new Set();

  private constructor() {
    logger.debug('[MessageSyncService] Initialized');
  }

  static getInstance(): MessageSyncService {
    if (!MessageSyncService.instance) {
      MessageSyncService.instance = new MessageSyncService();
    }
    return MessageSyncService.instance;
  }

  async syncMessages(conversationId: string, since?: Date): Promise<void> {
    logger.debug(`[MessageSyncService] Syncing messages for conversation: ${conversationId}`);
    
    if (this.syncInProgress.has(conversationId)) {
      logger.debug(`[MessageSyncService] Sync already in progress for: ${conversationId}`);
      return;
    }
    
    this.syncInProgress.add(conversationId);
    
    try {
      const sqliteDb = SyncDatabase.getInstance();
      await sqliteDb.open();
      const deviceId = DeviceInfo.getUniqueId();
      
      // 1. Get local messages since timestamp
      const localMessages = await this.getLocalMessagesSince(conversationId, since);
      const localMessageMap = new Map(localMessages.map(m => [m.id, m]));
      
      // 2. Fetch remote messages from Firebase
      const db = getFirebaseDb();
      let query = db
        .collection('chats')
        .doc(conversationId)
        .collection('messages')
        .orderBy('timestamp', 'desc')
        .limit(100);
      
      if (since) {
        query = query.where('timestamp', '>', FirebaseFirestoreTypes.Timestamp.fromDate(since));
      }
      
      const snapshot = await query.get();
      const remoteMessages: Message[] = [];
      
      snapshot.forEach(doc => {
        remoteMessages.push({ id: doc.id, ...doc.data() } as Message);
      });
      
      logger.debug(`[MessageSyncService] Found ${remoteMessages.length} remote messages, ${localMessages.length} local messages`);
      
      // 3. Process and decrypt messages
      const messagesToStore: LocalMessage[] = [];
      const conflicts: MessageConflict[] = [];
      
      for (const remoteMsg of remoteMessages) {
        const localMsg = localMessageMap.get(remoteMsg.id);
        
        // Check for conflicts
        if (localMsg) {
          if (this.hasConflict(localMsg, remoteMsg)) {
            conflicts.push({
              messageId: remoteMsg.id,
              conversationId,
              localMessage: this.convertToMessage(localMsg),
              remoteMessage: remoteMsg,
              conflictType: this.detectConflictType(localMsg, remoteMsg)
            });
            continue;
          }
        }
        
        // Decrypt if needed
        let decryptedContent = remoteMsg.content;
        if (remoteMsg.isEncrypted && remoteMsg.encryptedContent) {
          try {
            // For now, store encrypted content as-is
            // The ChatEncryptionService will handle decryption on read
            decryptedContent = remoteMsg.encryptedContent;
          } catch (error) {
            logger.error(`[MessageSyncService] Failed to process encrypted message ${remoteMsg.id}:`, error);
            continue;
          }
        }
        
        // Convert to local message format
        const localMessage: LocalMessage = {
          id: remoteMsg.id,
          conversationId: remoteMsg.conversationId,
          senderId: remoteMsg.senderId,
          recipientId: remoteMsg.recipientId,
          recipientIds: remoteMsg.type === 'group' ? JSON.stringify(remoteMsg.recipientId) : undefined,
          encryptedContent: decryptedContent || remoteMsg.encryptedContent || '',
          messageType: remoteMsg.type,
          mediaUrl: remoteMsg.mediaUrl,
          deliveryStatus: remoteMsg.deliveryStatus,
          readBy: JSON.stringify(remoteMsg.readBy || {}),
          replyToId: undefined,
          metadata: JSON.stringify({}),
          createdAt: remoteMsg.timestamp.toDate().toISOString(),
          updatedAt: remoteMsg.timestamp.toDate().toISOString(),
          lastSyncedAt: new Date().toISOString(),
          syncVersion: 1,
          isDirty: false,
          isDeleted: false,
          deviceId
        };
        
        messagesToStore.push(localMessage);
      }
      
      // 4. Resolve conflicts
      for (const conflict of conflicts) {
        const resolved = await this.resolveMessageConflicts(conflict);
        const localResolved = this.convertToLocalMessage(resolved, deviceId);
        messagesToStore.push(localResolved);
      }
      
      // 5. Store messages in SQLite
      if (messagesToStore.length > 0) {
        await this.storeMessagesInSQLite(messagesToStore);
      }
      
      // 6. Update delivery statuses for sent messages
      await this.updateDeliveryStatuses(conversationId);
      
      // 7. Update conversation cache
      const conversation = this.conversationCache.get(conversationId);
      if (conversation && remoteMessages.length > 0) {
        conversation.lastMessage = remoteMessages[0];
        conversation.lastActivity = remoteMessages[0].timestamp;
      }
      
    } catch (error) {
      logger.error('[MessageSyncService] Error syncing messages:', getErrorMessage(error));
      throw error;
    } finally {
      this.syncInProgress.delete(conversationId);
    }
  }

  async queueMessage(message: Omit<Message, 'id' | 'timestamp' | 'deliveryStatus'>): Promise<string> {
    const messageId = `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    logger.debug(`[MessageSyncService] Queueing message: ${messageId}`);
    
    try {
      const deviceId = DeviceInfo.getUniqueId();
      const sqliteDb = SyncDatabase.getInstance();
      await sqliteDb.open();
      
      // 1. Create full message object
      const fullMessage: Message = {
        ...message,
        id: messageId,
        timestamp: FirebaseFirestoreTypes.Timestamp.now(),
        deliveryStatus: 'sending'
      };
      
      // 2. Check if encryption is enabled
      const conversation = this.conversationCache.get(message.conversationId);
      if (conversation?.encryptionEnabled) {
        logger.debug('[MessageSyncService] Message will be encrypted by ChatEncryptionService');
        fullMessage.isEncrypted = true;
      }
      
      // 3. Store message locally first (optimistic UI)
      const localMessage: LocalMessage = {
        id: messageId,
        localId: messageId,
        conversationId: fullMessage.conversationId,
        senderId: fullMessage.senderId,
        recipientId: fullMessage.recipientId,
        recipientIds: fullMessage.type === 'group' ? JSON.stringify(fullMessage.recipientId) : undefined,
        encryptedContent: fullMessage.content, // Will be encrypted by ChatEncryptionService
        messageType: fullMessage.type,
        mediaUrl: fullMessage.mediaUrl,
        deliveryStatus: 'pending',
        readBy: JSON.stringify({}),
        replyToId: undefined,
        metadata: JSON.stringify({}),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        lastSyncedAt: undefined,
        syncVersion: 0,
        isDirty: true,
        isDeleted: false,
        deviceId
      };
      
      await this.storeMessageInSQLite(localMessage);
      
      // 4. Add to sync queue
      const syncItem: SyncQueueItem = {
        id: `sync_${messageId}`,
        operationType: 'create',
        entityType: 'message',
        entityId: messageId,
        data: JSON.stringify(fullMessage),
        retryCount: 0,
        maxRetries: 3,
        priority: message.type === 'text' ? 5 : 3, // Text messages have higher priority
        createdAt: new Date().toISOString(),
        deviceId
      };
      
      await this.addToSyncQueue(syncItem);
      
      // 5. Add to in-memory queue for immediate processing
      const queueItem: MessageQueueItem = {
        id: messageId,
        message: fullMessage,
        retryCount: 0,
        maxRetries: 3
      };
      
      this.messageQueue.set(messageId, queueItem);
      
      // 6. Check network and process queue
      const netInfo = await NetInfo.fetch();
      if (netInfo.isConnected) {
        // Process immediately if online
        setImmediate(() => this.processMessageQueue());
      } else {
        logger.debug('[MessageSyncService] Offline - message queued for later');
      }
      
      return messageId;
    } catch (error) {
      logger.error('[MessageSyncService] Error queueing message:', getErrorMessage(error));
      throw error;
    }
  }

  async syncEncryptionKeys(userId: string): Promise<void> {
    logger.debug(`[MessageSyncService] Syncing encryption keys for user: ${userId}`);
    
    try {
      const encryptionService = ChatEncryptionService.getInstance();
      
      // 1. Ensure local device has keys
      const isReady = await encryptionService.isEncryptionReady();
      if (!isReady) {
        logger.debug('[MessageSyncService] Initializing encryption for local device');
        await encryptionService.initializeEncryption();
      }
      
      // 2. Get user's public keys from Firebase
      const userKeys = await encryptionService.getUserPublicKeys(userId);
      if (!userKeys) {
        logger.debug(`[MessageSyncService] No encryption keys found for user: ${userId}`);
        return;
      }
      
      // 3. Cache the keys
      const keyEntry: EncryptionKey = {
        id: `key_${userId}`,
        userId,
        publicKey: userKeys.identityPublicKey,
        privateKeyEncrypted: '', // Not stored for other users
        createdAt: userKeys.lastUpdated,
        deviceId: '',
        isActive: true
      };
      
      this.encryptionKeyCache.set(keyEntry.id, keyEntry);
      
      // 4. Check key age for rotation recommendation
      const keyAge = Date.now() - userKeys.lastUpdated.toMillis();
      const thirtyDays = 30 * 24 * 60 * 60 * 1000;
      
      if (keyAge > thirtyDays) {
        logger.debug('[MessageSyncService] Key rotation recommended for user:', userId);
        // Store rotation recommendation in metadata
        const sqliteDb = SyncDatabase.getInstance();
        await sqliteDb.upsert('cacheMetadata', {
          id: `keyrotation_${userId}`,
          entityType: 'encryption_key',
          entityId: userId,
          cacheKey: 'rotation_needed',
          size: 0,
          lastAccessedAt: new Date().toISOString(),
          expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(), // 7 days
          accessCount: 1,
          metadata: JSON.stringify({ keyAge, recommendedAt: new Date().toISOString() })
        }, ['id']);
      }
      
    } catch (error) {
      logger.error('[MessageSyncService] Error syncing encryption keys:', getErrorMessage(error));
      throw error;
    }
  }

  async updateDeliveryStatus(messageId: string, status: Message['deliveryStatus']): Promise<void> {
    logger.debug(`[MessageSyncService] Updating delivery status for ${messageId} to ${status}`);
    
    try {
      // 1. Update in-memory queue if present
      const queueItem = this.messageQueue.get(messageId);
      if (queueItem) {
        queueItem.message.deliveryStatus = status;
        
        if (status === 'failed') {
          queueItem.error = 'Delivery failed';
          // Schedule retry with exponential backoff
          const retryDelay = Math.pow(2, queueItem.retryCount) * 1000;
          queueItem.nextRetryAt = new Date(Date.now() + retryDelay);
        }
      }
      
      // 2. Update local SQLite database
      await this.updateLocalMessageStatus(messageId, status);
      
      // 3. Update Firestore if online and not a local-only message
      const netInfo = await NetInfo.fetch();
      if (netInfo.isConnected && !messageId.startsWith('msg_')) {
        const db = getFirebaseDb();
        
        // Find the conversation ID for this message
        const sqliteDb = SyncDatabase.getInstance();
        const messages = await sqliteDb.query<LocalMessage>('messages', {
          where: { id: messageId },
          limit: 1
        });
        
        if (messages.length > 0) {
          const message = messages[0];
          await db
            .collection('chats')
            .doc(message.conversationId)
            .collection('messages')
            .doc(messageId)
            .update({
              deliveryStatus: status,
              updatedAt: FirebaseFirestoreTypes.FieldValue.serverTimestamp()
            });
        }
      }
      
      // 4. Emit event for UI updates (could use an event emitter here)
      // For now, the UI will pick up changes through SQLite observers
      
    } catch (error) {
      logger.error('[MessageSyncService] Error updating delivery status:', getErrorMessage(error));
      throw error;
    }
  }

  async resolveMessageConflicts(conflict: MessageConflict): Promise<Message> {
    logger.debug('[MessageSyncService] Resolving message conflict:', conflict);
    
    try {
      // Implement conflict resolution
      // 1. For content conflicts: prefer encrypted version
      // 2. For delivery conflicts: prefer most advanced status
      // 3. For encryption conflicts: re-encrypt if needed
      
      const { localMessage, remoteMessage, conflictType } = conflict;
      
      switch (conflictType) {
        case 'content':
          // If one is encrypted and other isn't, prefer encrypted
          if (remoteMessage.isEncrypted && !localMessage.isEncrypted) {
            return remoteMessage;
          } else if (localMessage.isEncrypted && !remoteMessage.isEncrypted) {
            return localMessage;
          }
          // Otherwise, prefer most recent
          return localMessage.timestamp.toMillis() > remoteMessage.timestamp.toMillis() 
            ? localMessage : remoteMessage;
          
        case 'delivery':
          // Prefer most advanced delivery status
          const statusOrder = ['sending', 'sent', 'delivered', 'read', 'failed'];
          const localIndex = statusOrder.indexOf(localMessage.deliveryStatus);
          const remoteIndex = statusOrder.indexOf(remoteMessage.deliveryStatus);
          
          if (remoteIndex > localIndex) {
            return remoteMessage;
          }
          return localMessage;
          
        case 'encryption':
          // Re-encrypt if keys don't match
          logger.debug('[MessageSyncService] Re-encrypting message due to key mismatch');
          
          // Get current encryption service
          const encryptionService = ChatEncryptionService.getInstance();
          
          // Decrypt the message if it's encrypted
          let originalContent = localMessage.content;
          if (localMessage.isEncrypted && localMessage.encryptedContent) {
            try {
              const decrypted = await encryptionService.decryptMessage(
                localMessage.encryptedContent,
                localMessage.chatId,
                localMessage.senderId
              );
              originalContent = decrypted.text || originalContent;
            } catch (error) {
              logger.error('[MessageSyncService] Failed to decrypt for re-encryption:', error);
              // If we can't decrypt, prefer the remote version
              return remoteMessage;
            }
          }
          
          // Re-encrypt with current keys
          try {
            const reEncrypted = await encryptionService.encryptMessage(
              { text: originalContent },
              localMessage.chatId,
              localMessage.conversationType === 'direct' ? [localMessage.recipientId!] : []
            );
            
            // Update local message with new encryption
            const updatedMessage: Message = {
              ...localMessage,
              encryptedContent: reEncrypted,
              isEncrypted: true,
              updatedAt: Timestamp.now(),
            };
            
            // Save to local database
            await db.doc(`messages/${localMessage.id}`).set(updatedMessage);
            
            return updatedMessage;
          } catch (error) {
            logger.error('[MessageSyncService] Failed to re-encrypt message:', error);
            return remoteMessage;
          }
          
        default:
          return remoteMessage;
      }
    } catch (error) {
      logger.error('[MessageSyncService] Error resolving conflicts:', getErrorMessage(error));
      throw error;
    }
  }

  async retryFailedMessages(conversationId?: string): Promise<void> {
    logger.debug('[MessageSyncService] Retrying failed messages');
    
    try {
      // 1. Get failed messages from SQLite
      const sqliteDb = SyncDatabase.getInstance();
      await sqliteDb.open();
      
      let query = `
        SELECT * FROM messages 
        WHERE deliveryStatus = 'failed' 
        AND isDirty = 1 
      `;
      const params: any[] = [];
      
      if (conversationId) {
        query += ' AND conversationId = ?';
        params.push(conversationId);
      }
      
      query += ' ORDER BY createdAt ASC LIMIT 20';
      
      const result = await sqliteDb.executeSql(query, params);
      const failedMessages = this.parseResultSet(result);
      
      logger.debug(`[MessageSyncService] Found ${failedMessages.length} failed messages in database`);
      
      // 2. Also check in-memory queue
      const queuedFailedMessages = Array.from(this.messageQueue.values())
        .filter(item => {
          if (conversationId && item.message.conversationId !== conversationId) {
            return false;
          }
          return item.message.deliveryStatus === 'failed' && 
                 item.retryCount < item.maxRetries &&
                 (!item.nextRetryAt || item.nextRetryAt <= new Date());
        });
      
      logger.debug(`[MessageSyncService] Found ${queuedFailedMessages.length} failed messages in queue`);
      
      // 3. Retry messages from database
      for (const localMsg of failedMessages) {
        // Check if already in queue
        if (!this.messageQueue.has(localMsg.id)) {
          const message = this.convertToMessage(localMsg);
          const queueItem: MessageQueueItem = {
            id: localMsg.id,
            message,
            retryCount: 0,
            maxRetries: 3
          };
          this.messageQueue.set(localMsg.id, queueItem);
        }
      }
      
      // 4. Reset retry status for queued messages
      for (const item of queuedFailedMessages) {
        item.retryCount++;
        item.message.deliveryStatus = 'sending';
        delete item.error;
        delete item.nextRetryAt;
        
        logger.debug(`[MessageSyncService] Retrying message ${item.id} (attempt ${item.retryCount})`);
      }
      
      // 5. Process the queue
      await this.processMessageQueue();
      
    } catch (error) {
      logger.error('[MessageSyncService] Error retrying failed messages:', getErrorMessage(error));
      throw error;
    }
  }

  async syncConversations(userId: string): Promise<void> {
    logger.debug(`[MessageSyncService] Syncing conversations for user: ${userId}`);
    
    try {
      const db = getFirebaseDb();
      
      // 1. Get user's chat references first
      const userChatsSnapshot = await db
        .collection('users')
        .doc(userId)
        .collection('chats')
        .orderBy('lastRead', 'desc')
        .limit(50)
        .get();
      
      const chatIds: string[] = [];
      userChatsSnapshot.forEach(doc => {
        chatIds.push(doc.id);
      });
      
      logger.debug(`[MessageSyncService] User has ${chatIds.length} chats`);
      
      // 2. Fetch full chat data for each chat
      const conversations: Conversation[] = [];
      
      for (const chatId of chatIds) {
        const chatDoc = await db.collection('chats').doc(chatId).get();
        if (chatDoc.exists) {
          const chatData = chatDoc.data()!;
          
          const conversation: Conversation = {
            id: chatId,
            participants: chatData.participants || [],
            type: chatData.type || 'direct',
            lastMessage: chatData.lastMessage,
            lastActivity: chatData.lastMessageAt || chatData.createdAt,
            encryptionEnabled: chatData.encryptionEnabled || true,
            publicKeys: Record<string, never> };
          
          conversations.push(conversation);
          this.conversationCache.set(chatId, conversation);
        }
      }
      
      logger.debug(`[MessageSyncService] Loaded ${conversations.length} conversation details`);
      
      // 3. Sync messages for each conversation (limit to recent ones)
      const recentConversations = conversations.slice(0, 10); // Sync only 10 most recent
      
      for (const conversation of recentConversations) {
        try {
          // Sync messages from last 24 hours
          const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
          await this.syncMessages(conversation.id, since);
          
          // Sync encryption keys if E2EE enabled
          if (conversation.encryptionEnabled) {
            // Only sync keys for other participants (not self)
            const otherParticipants = conversation.participants.filter(p => p !== userId);
            for (const participantId of otherParticipants) {
              await this.syncEncryptionKeys(participantId);
            }
          }
        } catch (error) {
          logger.error(`[MessageSyncService] Failed to sync conversation ${conversation.id}:`, error);
          // Continue with other conversations
        }
      }
      
      // 4. Process any pending messages
      await this.retryFailedMessages();
      
    } catch (error) {
      logger.error('[MessageSyncService] Error syncing conversations:', getErrorMessage(error));
      throw error;
    }
  }

  async rotateEncryptionKeys(userId: string): Promise<void> {
    logger.debug(`[MessageSyncService] Rotating encryption keys for user: ${userId}`);
    
    try {
      // Implement key rotation
      // 1. Generate new key pair
      // 2. Mark old keys as inactive
      // 3. Upload new public key
      // 4. Re-encrypt recent messages with new key
      
      const keyRotationService = KeyRotationService.getInstance();
      const encryptionService = ChatEncryptionService.getInstance();
      const db = getFirebaseDb();
      
      logger.debug('[MessageSyncService] Generating new key pair...');
      
      // Rotate keys using the key rotation service
      const newKeyId = await keyRotationService.rotateKeys();
      
      logger.debug('[MessageSyncService] New key generated with ID:', newKeyId);
      
      // Get recent messages that need re-encryption (last 7 days)
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
      
      const recentMessagesSnapshot = await db
        .collection('messages')
        .where('senderId', '==', userId)
        .where('timestamp', '>=', Timestamp.fromDate(sevenDaysAgo))
        .where('isEncrypted', '==', true)
        .orderBy('timestamp', 'desc')
        .limit(100)
        .get();
      
      logger.debug(`[MessageSyncService] Re-encrypting ${recentMessagesSnapshot.size} recent messages...`);
      
      const batch = db.batch();
      let reEncryptedCount = 0;
      
      for (const doc of recentMessagesSnapshot.docs) {
        const message = doc.data() as Message;
        
        try {
          // Decrypt with old key
          const decrypted = await encryptionService.decryptMessage(
            message.encryptedContent!,
            message.chatId,
            message.senderId
          );
          
          // Re-encrypt with new key
          const reEncrypted = await encryptionService.encryptMessage(
            { text: decrypted.text },
            message.chatId,
            message.conversationType === 'direct' ? [message.recipientId!] : []
          );
          
          // Update message with new encryption
          batch.update(doc.ref, {
            encryptedContent: reEncrypted,
            keyRotationVersion: newKeyId,
            updatedAt: Timestamp.now(),
          });
          
          reEncryptedCount++;
        } catch (error) {
          logger.error(`[MessageSyncService] Failed to re-encrypt message ${doc.id}:`, error);
          // Continue with other messages
        }
      }
      
      // Commit all updates
      if (reEncryptedCount > 0) {
        await batch.commit();
        logger.debug(`[MessageSyncService] Successfully re-encrypted ${reEncryptedCount} messages`);
      }
      
      // Notify other devices about key rotation
      await callFirebaseFunction('notifyKeyRotation', {
        userId,
        newKeyId,
        rotatedAt: Timestamp.now(),
      });
      
      logger.debug('[MessageSyncService] Key rotation complete');
    } catch (error) {
      logger.error('[MessageSyncService] Error rotating encryption keys:', getErrorMessage(error));
      throw error;
    }
  }

  private async processMessageQueue(): Promise<void> {
    const netInfo = await NetInfo.fetch();
    if (!netInfo.isConnected) {
      logger.debug('[MessageSyncService] No network connection - skipping queue processing');
      return;
    }
    
    const pendingMessages = Array.from(this.messageQueue.values())
      .filter(item => item.message.deliveryStatus === 'sending' && 
              (!item.nextRetryAt || item.nextRetryAt <= new Date()));
    
    logger.debug(`[MessageSyncService] Processing ${pendingMessages.length} pending messages`);
    
    const encryptionService = ChatEncryptionService.getInstance();
    const db = getFirebaseDb();
    
    for (const item of pendingMessages) {
      try {
        const message = item.message;
        
        // Handle encryption if needed
        let messageData: any = {
          senderId: message.senderId,
          timestamp: message.timestamp,
          type: message.type,
          deliveryStatus: 'sent',
          delivered: [],
          read: []
        };
        
        if (message.isEncrypted) {
          // Use ChatEncryptionService to send encrypted message
          const conversation = this.conversationCache.get(message.conversationId);
          if (conversation) {
            await encryptionService.sendTextMessage(message.conversationId, message.content);
            // Message sent through encryption service, update local status
            await this.updateDeliveryStatus(item.id, 'sent');
            this.messageQueue.delete(item.id);
            continue;
          }
        } else {
          // Unencrypted message
          messageData.content = message.content;
        }
        
        // Handle media if present
        if (message.mediaUrl) {
          messageData.mediaUrl = message.mediaUrl;
          messageData.type = message.type;
        }
        
        // Send to Firebase
        await db
          .collection('chats')
          .doc(message.conversationId)
          .collection('messages')
          .doc(item.id)
          .set(messageData);
        
        // Update chat's last message
        await db
          .collection('chats')
          .doc(message.conversationId)
          .update({
            lastMessage: {
              content: message.isEncrypted ? 'Encrypted message' : message.content,
              senderId: message.senderId,
              timestamp: message.timestamp,
              type: message.type
            },
            lastMessageAt: message.timestamp
          });
        
        // Update local status
        await this.updateDeliveryStatus(item.id, 'sent');
        await this.updateLocalMessageStatus(item.id, 'sent');
        
        // Remove from queue
        this.messageQueue.delete(item.id);
        
      } catch (error) {
        logger.error(`[MessageSyncService] Failed to send message ${item.id}:`, error);
        item.retryCount++;
        
        if (item.retryCount >= item.maxRetries) {
          await this.updateDeliveryStatus(item.id, 'failed');
          await this.updateLocalMessageStatus(item.id, 'failed');
          this.messageQueue.delete(item.id);
        } else {
          // Schedule retry with exponential backoff
          const retryDelay = Math.pow(2, item.retryCount) * 1000;
          item.nextRetryAt = new Date(Date.now() + retryDelay);
          item.message.deliveryStatus = 'failed';
          item.error = getErrorMessage(error);
        }
      }
    }
  }
  
  // Helper methods for SQLite operations
  private async getLocalMessagesSince(conversationId: string, since?: Date): Promise<LocalMessage[]> {
    const sqliteDb = SyncDatabase.getInstance();
    const whereClause: any = { conversationId };
    
    if (since) {
      const query = `
        SELECT * FROM messages 
        WHERE conversationId = ? AND createdAt > ? 
        ORDER BY createdAt DESC 
        LIMIT 100
      `;
      const result = await sqliteDb.executeSql(query, [conversationId, since.toISOString()]);
      return this.parseResultSet(result);
    }
    
    const result = await sqliteDb.query<LocalMessage>('messages', {
      where: whereClause,
      orderBy: 'createdAt DESC',
      limit: 100
    });
    
    return result;
  }
  
  private async storeMessagesInSQLite(messages: LocalMessage[]): Promise<void> {
    const sqliteDb = SyncDatabase.getInstance();
    
    await sqliteDb.transaction(async (tx) => {
      for (const message of messages) {
        await sqliteDb.upsert('messages', message, ['id']);
      }
    });
  }
  
  private async storeMessageInSQLite(message: LocalMessage): Promise<void> {
    const sqliteDb = SyncDatabase.getInstance();
    await sqliteDb.upsert('messages', message, ['id']);
  }
  
  private async updateLocalMessageStatus(messageId: string, status: Message['deliveryStatus']): Promise<void> {
    const sqliteDb = SyncDatabase.getInstance();
    await sqliteDb.update('messages', 
      { deliveryStatus: status, updatedAt: new Date().toISOString() },
      { id: messageId }
    );
  }
  
  private async addToSyncQueue(item: SyncQueueItem): Promise<void> {
    const sqliteDb = SyncDatabase.getInstance();
    await sqliteDb.insert('syncQueue', item);
  }
  
  private hasConflict(local: LocalMessage, remote: Message): boolean {
    // Check if messages have conflicting content or status
    return local.encryptedContent !== remote.content ||
           local.deliveryStatus !== remote.deliveryStatus;
  }
  
  private detectConflictType(local: LocalMessage, remote: Message): MessageConflict['conflictType'] {
    if (local.encryptedContent !== remote.content) return 'content';
    if (local.deliveryStatus !== remote.deliveryStatus) return 'delivery';
    return 'encryption';
  }
  
  private convertToMessage(local: LocalMessage): Message {
    return {
      id: local.id,
      conversationId: local.conversationId,
      senderId: local.senderId,
      recipientId: local.recipientId || '',
      content: local.encryptedContent,
      encryptedContent: local.encryptedContent,
      type: local.messageType as any,
      mediaUrl: local.mediaUrl,
      timestamp: FirebaseFirestoreTypes.Timestamp.fromDate(new Date(local.createdAt)),
      deliveryStatus: local.deliveryStatus as any,
      isEncrypted: true,
      readBy: local.readBy ? JSON.parse(local.readBy) : []
    };
  }
  
  private convertToLocalMessage(message: Message, deviceId: string): LocalMessage {
    return {
      id: message.id,
      conversationId: message.conversationId,
      senderId: message.senderId,
      recipientId: message.recipientId,
      recipientIds: undefined,
      encryptedContent: message.encryptedContent || message.content,
      messageType: message.type,
      mediaUrl: message.mediaUrl,
      deliveryStatus: message.deliveryStatus,
      readBy: JSON.stringify(message.readBy || {}),
      replyToId: undefined,
      metadata: JSON.stringify({}),
      createdAt: message.timestamp.toDate().toISOString(),
      updatedAt: message.timestamp.toDate().toISOString(),
      lastSyncedAt: new Date().toISOString(),
      syncVersion: 1,
      isDirty: false,
      isDeleted: false,
      deviceId
    };
  }
  
  private parseResultSet(result: any): LocalMessage[] {
    const messages: LocalMessage[] = [];
    for (let i = 0; i < result.rows.length; i++) {
      messages.push(result.rows.item(i));
    }
    return messages;
  }

  private async updateDeliveryStatuses(conversationId: string): Promise<void> {
    try {
      const sqliteDb = SyncDatabase.getInstance();
      const deviceId = DeviceInfo.getUniqueId();
      
      // Get messages that need delivery status updates
      const query = `
        SELECT * FROM messages 
        WHERE conversationId = ? 
        AND senderId != ? 
        AND deliveryStatus IN ('sent', 'delivered')
        ORDER BY createdAt DESC 
        LIMIT 50
      `;
      
      const result = await sqliteDb.executeSql(query, [conversationId, deviceId]);
      const messages = this.parseResultSet(result);
      
      // Update to 'delivered' if not already
      for (const message of messages) {
        if (message.deliveryStatus === 'sent') {
          await this.updateLocalMessageStatus(message.id, 'delivered');
        }
      }
    } catch (error) {
      logger.error('[MessageSyncService] Error updating delivery statuses:', error);
    }
  }
}

// Export singleton instance getter
export const getMessageSyncService = () => MessageSyncService.getInstance();