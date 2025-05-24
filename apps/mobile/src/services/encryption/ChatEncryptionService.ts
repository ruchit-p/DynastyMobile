import E2EEService, { EncryptedMessage as E2EEMessage } from './E2EEService';
import MediaEncryptionService, { EncryptedFile } from './MediaEncryptionService';
import { OfflineQueueService } from './OfflineQueueService';
import MetadataEncryptionService from './MetadataEncryptionService';
import KeyRotationService from './KeyRotationService';
import EncryptedSearchService from './EncryptedSearchService';
import AuditLogService from './AuditLogService';
import { FirebaseFirestoreTypes } from '@react-native-firebase/firestore';
import { getFirebaseDb, getFirebaseAuth } from '../../lib/firebase';
import { callFirebaseFunction } from '../../lib/errorUtils';
import { Buffer } from '@craftzdog/react-native-buffer';
import NetInfo from '@react-native-community/netinfo';

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
  // Encrypted payloads for each recipient
  encryptedPayloads: {
    [recipientId: string]: {
      encryptedContent: string; // Base64
      ephemeralPublicKey: string; // Base64
      nonce: string; // Base64
      mac: string; // Base64
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
  // Reactions
  reactions?: MessageReaction[];
}

export class ChatEncryptionService {
  private static instance: ChatEncryptionService;
  private db = getFirebaseDb();
  private currentUserId?: string;

  private constructor() {
    // Listen for auth changes
    getFirebaseAuth().onAuthStateChanged((user) => {
      this.currentUserId = user?.uid;
    });
  }

  static getInstance(): ChatEncryptionService {
    if (!ChatEncryptionService.instance) {
      ChatEncryptionService.instance = new ChatEncryptionService();
    }
    return ChatEncryptionService.instance;
  }

  /**
   * Initialize encryption for the current user
   */
  async initializeEncryption(): Promise<void> {
    try {
      const auth = getFirebaseAuth();
      if (!auth.currentUser) {
        throw new Error('User not authenticated');
      }

      const userId = auth.currentUser.uid;
      
      // Initialize E2EE
      await E2EEService.initialize(userId);
      
      // Initialize metadata encryption
      await MetadataEncryptionService.initialize(userId);
      
      // Initialize key rotation
      await KeyRotationService.initialize();
      
      // Subscribe to rotation events
      KeyRotationService.onRotationEvent((event) => {
        console.log('Key rotation event:', event);
        if (event.type === 'rotation_completed') {
          // Re-upload public keys after rotation
          this.uploadPublicKeys(userId);
        }
      });
      
      // Initialize encrypted search
      await EncryptedSearchService.initialize(userId);
      
      // Upload public keys to Firestore
      await this.uploadPublicKeys(userId);
      
      // Set up dependency injection to avoid circular dependency
      const offlineQueueService = OfflineQueueService.getInstance();
      offlineQueueService.setChatEncryptionService(this);
      
      // Log successful initialization
      await AuditLogService.getInstance().logEvent(
        'encryption_initialized',
        'Chat encryption initialized successfully',
        {
          userId,
          metadata: { keysGenerated: true }
        }
      );
      
      console.log('Chat encryption initialized');
    } catch (error) {
      console.error('Failed to initialize chat encryption:', error);
      
      // Log initialization failure
      await AuditLogService.getInstance().logEvent(
        'encryption_initialization_failed',
        'Failed to initialize chat encryption',
        {
          userId: getFirebaseAuth().currentUser?.uid,
          metadata: { error: error.message }
        }
      );
      
      throw error;
    }
  }

  /**
   * Upload user's public keys to Firestore
   */
  private async uploadPublicKeys(userId: string): Promise<void> {
    try {
      const keysBundle = await E2EEService.getInstance().getPublicKeyBundle();
      if (!keysBundle) {
        throw new Error('Failed to get public keys bundle');
      }

      const userKeysData: UserKeys = {
        userId,
        identityPublicKey: keysBundle.identityKey,
        lastUpdated: FirebaseFirestoreTypes.FieldValue.serverTimestamp() as any
      };

      // Store in Firestore
      await this.db.collection('users').doc(userId).collection('keys').doc('public').set(userKeysData);
    } catch (error) {
      console.error('Failed to upload public keys:', error);
      throw error;
    }
  }

  /**
   * Get user's public keys from Firestore
   */
  async getUserPublicKeys(userId: string): Promise<UserKeys | null> {
    try {
      const keysDoc = await this.db.collection('users').doc(userId).collection('keys').doc('public').get();
      
      if (!keysDoc.exists) {
        return null;
      }

      return keysDoc.data() as UserKeys;
    } catch (error) {
      console.error('Failed to get user public keys:', error);
      return null;
    }
  }

  /**
   * Create or get an encrypted chat
   */
  async createOrGetChat(participantIds: string[]): Promise<Chat> {
    try {
      if (!this.currentUserId) {
        throw new Error('User not authenticated');
      }

      // Sort participant IDs for consistent chat ID
      const sortedParticipants = [...participantIds, this.currentUserId].sort();
      const chatType = sortedParticipants.length === 2 ? 'direct' : 'group';
      
      // For direct chats, use deterministic ID
      let chatId: string;
      if (chatType === 'direct') {
        chatId = `chat_${sortedParticipants.join('_')}`;
      } else {
        // For group chats, generate new ID
        chatId = `group_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      }

      // Check if chat exists
      const chatDoc = await this.db.collection('chats').doc(chatId).get();
      
      if (chatDoc.exists) {
        return { id: chatId, ...chatDoc.data() } as Chat;
      }

      // Create new chat
      const newChat: Chat = {
        id: chatId,
        type: chatType,
        participants: sortedParticipants,
        createdAt: FirebaseFirestoreTypes.FieldValue.serverTimestamp() as any,
        lastMessageAt: FirebaseFirestoreTypes.FieldValue.serverTimestamp() as any,
        encryptionEnabled: true
      };

      await this.db.collection('chats').doc(chatId).set(newChat);

      // Initialize sessions with all participants
      for (const participantId of participantIds) {
        if (participantId !== this.currentUserId) {
          await this.initializeSession(participantId);
        }
      }

      return newChat;
    } catch (error) {
      console.error('Failed to create or get chat:', error);
      throw error;
    }
  }

  /**
   * Initialize encryption session with another user
   */
  private async initializeSession(remoteUserId: string): Promise<void> {
    try {
      // Get remote user's public keys
      const remoteKeys = await this.getUserPublicKeys(remoteUserId);
      if (!remoteKeys) {
        throw new Error(`No public keys found for user: ${remoteUserId}`);
      }

      // With our E2EE implementation, we don't need to pre-establish sessions
      // Sessions are created on-demand using ephemeral keys
      console.log(`Ready to encrypt messages for user: ${remoteUserId}`);
    } catch (error) {
      console.error(`Failed to initialize session with ${remoteUserId}:`, error);
      throw error;
    }
  }

  /**
   * Send an encrypted text message
   */
  async sendTextMessage(chatId: string, text: string): Promise<void> {
    try {
      if (!this.currentUserId) {
        throw new Error('User not authenticated');
      }

      // Check network status
      const netInfo = await NetInfo.fetch();
      if (!netInfo.isConnected) {
        // Queue message for offline sending
        const offlineQueueService = OfflineQueueService.getInstance();
        await offlineQueueService.queueMessage(chatId, 'text', text);
        console.log('Message queued for offline sending');
        return;
      }

      // Get chat info
      const chatDoc = await this.db.collection('chats').doc(chatId).get();
      if (!chatDoc.exists) {
        throw new Error('Chat not found');
      }

      const chat = chatDoc.data() as Chat;
      const recipients = chat.participants.filter(id => id !== this.currentUserId);

      // Encrypt message for each recipient
      const encryptedPayloads: { [recipientId: string]: any } = {};
      
      for (const recipientId of recipients) {
        try {
          // Get recipient's public key
          const recipientKeys = await this.getUserPublicKeys(recipientId);
          if (!recipientKeys) {
            throw new Error(`No public keys found for recipient: ${recipientId}`);
          }

          const encrypted = await E2EEService.encryptMessage(text, recipientKeys.identityPublicKey);
          encryptedPayloads[recipientId] = {
            encryptedContent: encrypted.content,
            ephemeralPublicKey: encrypted.ephemeralPublicKey,
            nonce: encrypted.nonce,
            mac: encrypted.mac
          };
        } catch (error) {
          console.error(`Failed to encrypt for ${recipientId}:`, error);
          throw error;
        }
      }

      // Encrypt metadata
      const metadata = {
        timestamp: Date.now(),
        senderId: this.currentUserId,
        messageType: 'text',
      };
      
      const encryptedMetadata = await MetadataEncryptionService.encryptMessageMetadata(metadata);

      // Create encrypted message document
      const messageData: EncryptedMessageData = {
        id: `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        chatId,
        senderId: this.currentUserId,
        timestamp: FirebaseFirestoreTypes.FieldValue.serverTimestamp() as any,
        type: 'text',
        encryptedPayloads,
        encryptedMetadata,
        delivered: [],
        read: []
      };

      // Add to Firestore
      const messageRef = await this.db.collection('chats').doc(chatId).collection('messages').add(messageData);

      // Update chat's last message timestamp
      await this.db.collection('chats').doc(chatId).update({
        lastMessageAt: FirebaseFirestoreTypes.FieldValue.serverTimestamp()
      });

      // Index message for search (fire and forget)
      EncryptedSearchService.indexMessage(
        messageRef.id,
        chatId,
        text,
        metadata
      ).catch(error => console.error('Failed to index message:', error));

      console.log('Encrypted message sent');
      
      // Send push notifications (fire and forget)
      callFirebaseFunction('sendMessageNotification', {
        chatId,
        messageId: messageRef.id,
      }).catch(error => console.error('Failed to send notification:', error));
      
      // Log successful message send
      await AuditLogService.getInstance().logEvent(
        'message_sent',
        'Encrypted text message sent',
        {
          userId: this.currentUserId,
          resourceId: messageRef.id,
          metadata: {
            chatId,
            recipientCount: recipients.length,
            messageType: 'text'
          }
        }
      );
    } catch (error) {
      console.error('Failed to send encrypted message:', error);
      
      // Log message send failure
      await AuditLogService.getInstance().logEvent(
        'message_send_failed',
        'Failed to send encrypted message',
        {
          userId: this.currentUserId,
          metadata: {
            chatId,
            error: error.message,
            messageType: 'text'
          }
        }
      );
      
      throw error;
    }
  }

  /**
   * Send an encrypted media message
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

      // Check network status
      const netInfo = await NetInfo.fetch();
      if (!netInfo.isConnected) {
        // Queue media message for offline sending
        const offlineQueueService = OfflineQueueService.getInstance();
        await offlineQueueService.queueMessage(chatId, 'media', undefined, fileUri);
        console.log('Media message queued for offline sending');
        return;
      }

      // Validate file
      const validation = await MediaEncryptionService.validateFile(fileUri);
      if (!validation.isValid) {
        throw new Error(validation.error || 'Invalid file');
      }

      // Get chat info
      const chatDoc = await this.db.collection('chats').doc(chatId).get();
      if (!chatDoc.exists) {
        throw new Error('Chat not found');
      }

      const chat = chatDoc.data() as Chat;
      const recipients = chat.participants.filter(id => id !== this.currentUserId);

      // Upload and encrypt file
      const encryptedFile = await MediaEncryptionService.uploadEncryptedFile(
        fileUri,
        fileName,
        mimeType,
        chatId
      );

      // Encrypt the file key for each recipient
      const encryptedKeys: { [recipientId: string]: string } = {};
      
      for (const recipientId of recipients) {
        try {
          // Get recipient's public key
          const recipientKeys = await this.getUserPublicKeys(recipientId);
          if (!recipientKeys) {
            throw new Error(`No public keys found for recipient: ${recipientId}`);
          }

          const encrypted = await E2EEService.encryptMessage(
            encryptedFile.encryptedKey,
            recipientKeys.identityPublicKey
          );
          // Store the entire encrypted object as JSON for the key
          encryptedKeys[recipientId] = JSON.stringify({
            content: encrypted.content,
            ephemeralPublicKey: encrypted.ephemeralPublicKey,
            nonce: encrypted.nonce,
            mac: encrypted.mac
          });
        } catch (error) {
          console.error(`Failed to encrypt key for ${recipientId}:`, error);
          throw error;
        }
      }

      // Determine message type based on mimeType
      let messageType: 'media' | 'file' | 'voice' = 'file';
      if (mimeType.startsWith('image/') || mimeType.startsWith('video/')) {
        messageType = 'media';
      } else if (mimeType.startsWith('audio/')) {
        messageType = 'voice';
      }

      // Create encrypted message document
      const messageData: EncryptedMessageData = {
        id: `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        chatId,
        senderId: this.currentUserId,
        timestamp: FirebaseFirestoreTypes.FieldValue.serverTimestamp() as any,
        type: messageType,
        encryptedPayloads: {}, // No text content
        media: {
          encryptedUrl: encryptedFile.encryptedUrl,
          encryptedKeys,
          metadata: encryptedFile.metadata
        },
        delivered: [],
        read: []
      };

      // Add duration for voice messages
      if (messageType === 'voice' && duration !== undefined) {
        messageData.duration = duration;
      }

      // Add to Firestore
      const messageRef = await this.db.collection('chats').doc(chatId).collection('messages').add(messageData);

      // Update chat's last message timestamp
      await this.db.collection('chats').doc(chatId).update({
        lastMessageAt: FirebaseFirestoreTypes.FieldValue.serverTimestamp()
      });

      // Send push notifications (fire and forget)
      callFirebaseFunction('sendMessageNotification', {
        chatId,
        messageId: messageRef.id,
      }).catch(error => console.error('Failed to send notification:', error));

      console.log('Encrypted media message sent');
    } catch (error) {
      console.error('Failed to send encrypted media message:', error);
      throw error;
    }
  }

  /**
   * Decrypt a received message
   */
  async decryptMessage(encryptedMessage: EncryptedMessageData): Promise<Message> {
    try {
      if (!this.currentUserId) {
        throw new Error('User not authenticated');
      }

      // Decrypt metadata if present
      let decryptedTimestamp = encryptedMessage.timestamp;
      let decryptedSenderId = encryptedMessage.senderId;
      
      if (encryptedMessage.encryptedMetadata) {
        try {
          const decryptedMetadata = await MetadataEncryptionService.decryptMessageMetadata(
            encryptedMessage.encryptedMetadata
          );
          // Use decrypted metadata values
          decryptedTimestamp = new FirebaseFirestoreTypes.Timestamp(
            Math.floor(decryptedMetadata.timestamp / 1000),
            (decryptedMetadata.timestamp % 1000) * 1000000
          ) as any;
          decryptedSenderId = decryptedMetadata.senderId;
        } catch (error) {
          console.error('Failed to decrypt metadata:', error);
        }
      }

      // Calculate status based on delivered/read arrays
      let status: Message['status'] = 'sent';
      if (decryptedSenderId === this.currentUserId) {
        // For own messages, calculate status
        const chatDoc = await this.db.collection('chats').doc(encryptedMessage.chatId).get();
        if (chatDoc.exists) {
          const participants = chatDoc.data()?.participants || [];
          const otherParticipants = participants.filter((p: string) => p !== this.currentUserId).length;
          
          if (encryptedMessage.read.length >= otherParticipants) {
            status = 'read';
          } else if (encryptedMessage.delivered.length >= otherParticipants) {
            status = 'delivered';
          }
        }
      }

      const decryptedMessage: Message = {
        id: encryptedMessage.id,
        chatId: encryptedMessage.chatId,
        senderId: decryptedSenderId,
        timestamp: decryptedTimestamp,
        type: encryptedMessage.type,
        encrypted: true,
        delivered: encryptedMessage.delivered,
        read: encryptedMessage.read,
        status
      };

      // Add duration for voice messages
      if (encryptedMessage.type === 'voice' && encryptedMessage.duration !== undefined) {
        decryptedMessage.duration = encryptedMessage.duration;
      }

      // Add reactions
      if (encryptedMessage.reactions) {
        decryptedMessage.reactions = encryptedMessage.reactions;
      }

      // Decrypt text content if present
      if (encryptedMessage.encryptedPayloads[this.currentUserId]) {
        const payload = encryptedMessage.encryptedPayloads[this.currentUserId];
        const encryptedMsg: E2EEMessage = {
          content: payload.encryptedContent,
          ephemeralPublicKey: payload.ephemeralPublicKey,
          nonce: payload.nonce,
          mac: payload.mac
        };

        try {
          const decryptedText = await E2EEService.decryptMessage(encryptedMsg);
          decryptedMessage.text = decryptedText;
        } catch (error) {
          console.error('Failed to decrypt message:', error);
          decryptedMessage.text = '[Failed to decrypt message]';
        }
      }

      // Handle media if present
      if (encryptedMessage.media && encryptedMessage.media.encryptedKeys[this.currentUserId]) {
        try {
          // Decrypt the file encryption key
          const encryptedKeyData = JSON.parse(encryptedMessage.media.encryptedKeys[this.currentUserId]);
          const encryptedKeyMsg: E2EEMessage = {
            content: encryptedKeyData.content,
            ephemeralPublicKey: encryptedKeyData.ephemeralPublicKey,
            nonce: encryptedKeyData.nonce,
            mac: encryptedKeyData.mac
          };
          
          const decryptedKey = await E2EEService.decryptMessage(encryptedKeyMsg);

          decryptedMessage.media = {
            encryptedUrl: encryptedMessage.media.encryptedUrl,
            encryptedKey: decryptedKey,
            metadata: encryptedMessage.media.metadata
          };
        } catch (error) {
          console.error('Failed to decrypt media key:', error);
        }
      }

      return decryptedMessage;
    } catch (error) {
      console.error('Failed to decrypt message:', error);
      throw error;
    }
  }

  /**
   * Subscribe to encrypted messages in a chat
   */
  subscribeToMessages(
    chatId: string,
    onMessage: (message: Message) => void,
    onError?: (error: Error) => void
  ): () => void {
    try {
      const messagesQuery = this.db
        .collection('chats')
        .doc(chatId)
        .collection('messages')
        .orderBy('timestamp', 'asc');

      const unsubscribe = messagesQuery.onSnapshot(
        async (snapshot) => {
          for (const change of snapshot.docChanges()) {
            if (change.type === 'added') {
              try {
                const encryptedMessage = change.doc.data() as EncryptedMessageData;
                const decryptedMessage = await this.decryptMessage(encryptedMessage);
                onMessage(decryptedMessage);

                // Mark as delivered if not sender
                if (encryptedMessage.senderId !== this.currentUserId && 
                    !encryptedMessage.delivered.includes(this.currentUserId!)) {
                  await change.doc.ref.update({
                    delivered: FirebaseFirestoreTypes.FieldValue.arrayUnion(this.currentUserId)
                  });
                }
              } catch (error) {
                console.error('Error processing message:', error);
                onError?.(error as Error);
              }
            }
          }
        },
        (error) => {
          console.error('Error subscribing to messages:', error);
          onError?.(error);
        }
      );

      return unsubscribe;
    } catch (error) {
      console.error('Failed to subscribe to messages:', error);
      throw error;
    }
  }

  /**
   * Mark message as read
   */
  async markMessageAsRead(chatId: string, messageId: string): Promise<void> {
    try {
      if (!this.currentUserId) return;

      const messageRef = this.db.collection('chats').doc(chatId).collection('messages').doc(messageId);
      await messageRef.update({
        read: FirebaseFirestoreTypes.FieldValue.arrayUnion(this.currentUserId)
      });
    } catch (error) {
      console.error('Failed to mark message as read:', error);
    }
  }

  /**
   * Download and decrypt a media file
   */
  async downloadMediaFile(media: EncryptedFile): Promise<string> {
    try {
      const decryptedUri = await MediaEncryptionService.downloadAndDecryptFile(
        media.encryptedUrl,
        media.encryptedKey,
        media.metadata.iv,
        media.metadata.tag
      );

      return decryptedUri;
    } catch (error) {
      console.error('Failed to download media file:', error);
      throw error;
    }
  }

  /**
   * Check if encryption is properly set up
   */
  async isEncryptionReady(): Promise<boolean> {
    try {
      const identity = await E2EEService.getInstance().getIdentityKeyPair();
      return identity !== null;
    } catch (error) {
      console.error('Failed to check encryption status:', error);
      return false;
    }
  }

  /**
   * Get encryption status for a chat
   */
  async getChatEncryptionStatus(chatId: string): Promise<{
    enabled: boolean;
    verifiedParticipants: string[];
  }> {
    try {
      const chatDoc = await this.db.collection('chats').doc(chatId).get();
      if (!chatDoc.exists) {
        return { enabled: false, verifiedParticipants: [] };
      }

      const chat = chatDoc.data() as Chat;
      
      // Check key verification status for all participants
      const verifiedParticipants: string[] = [];
      for (const participantId of chat.participants) {
        if (participantId === this.currentUserId) continue;
        
        const verified = await callFirebaseFunction('getKeyVerificationStatus', {
          targetUserId: participantId
        });
        
        if (verified.result?.verified) {
          verifiedParticipants.push(participantId);
        }
      }
      
      return {
        enabled: chat.encryptionEnabled,
        verifiedParticipants
      };
    } catch (error) {
      console.error('Failed to get chat encryption status:', error);
      return { enabled: false, verifiedParticipants: [] };
    }
  }

  /**
   * Search encrypted messages
   */
  async searchMessages(query: string, chatId?: string): Promise<Message[]> {
    try {
      if (!query || query.trim().length < 3) {
        return [];
      }

      // Search using encrypted search service
      const searchResults = await EncryptedSearchService.searchMessages(query, chatId);

      // Fetch and decrypt the actual messages
      const messages: Message[] = [];
      
      for (const result of searchResults) {
        try {
          // Get message from Firestore
          const messageDoc = await this.db
            .collection('chats')
            .doc(result.chatId)
            .collection('messages')
            .doc(result.messageId)
            .get();

          if (messageDoc.exists) {
            const encryptedData = messageDoc.data() as EncryptedMessageData;
            const decryptedMessage = await this.decryptMessage(encryptedData);
            messages.push(decryptedMessage);
          }
        } catch (error) {
          console.error(`Failed to fetch message ${result.messageId}:`, error);
        }
      }

      return messages;
    } catch (error) {
      console.error('Search failed:', error);
      return [];
    }
  }

  /**
   * Toggle reaction on a message
   */
  async toggleReaction(chatId: string, messageId: string, emoji: string): Promise<void> {
    try {
      if (!this.currentUserId) {
        throw new Error('User not authenticated');
      }

      const messageRef = this.db
        .collection('chats')
        .doc(chatId)
        .collection('messages')
        .doc(messageId);

      // Get current message data
      const messageDoc = await messageRef.get();
      if (!messageDoc.exists) {
        throw new Error('Message not found');
      }

      const messageData = messageDoc.data() as EncryptedMessageData;
      const reactions = messageData.reactions || [];

      // Find existing reaction with this emoji
      const existingReactionIndex = reactions.findIndex(r => r.emoji === emoji);
      
      if (existingReactionIndex !== -1) {
        // Reaction exists, toggle user
        const reaction = reactions[existingReactionIndex];
        const userIndex = reaction.userIds.indexOf(this.currentUserId);
        
        if (userIndex !== -1) {
          // Remove user from reaction
          reaction.userIds.splice(userIndex, 1);
          
          // Remove reaction if no users left
          if (reaction.userIds.length === 0) {
            reactions.splice(existingReactionIndex, 1);
          }
        } else {
          // Add user to reaction
          reaction.userIds.push(this.currentUserId);
        }
      } else {
        // Add new reaction
        reactions.push({
          emoji,
          userIds: [this.currentUserId],
        });
      }

      // Update message with new reactions
      await messageRef.update({
        reactions,
        lastReactionAt: FirebaseFirestoreTypes.FieldValue.serverTimestamp(),
      });

      // Log reaction event
      await AuditLogService.getInstance().logEvent(
        'message_reaction_toggled',
        'User toggled reaction on message',
        {
          userId: this.currentUserId,
          resourceId: messageId,
          metadata: {
            chatId,
            emoji,
            action: existingReactionIndex !== -1 ? 'toggled' : 'added',
          }
        }
      );
    } catch (error) {
      console.error('Failed to toggle reaction:', error);
      throw error;
    }
  }

  /**
   * Get reactions for a message
   */
  async getMessageReactions(chatId: string, messageId: string): Promise<MessageReaction[]> {
    try {
      const messageDoc = await this.db
        .collection('chats')
        .doc(chatId)
        .collection('messages')
        .doc(messageId)
        .get();

      if (!messageDoc.exists) {
        return [];
      }

      const messageData = messageDoc.data() as EncryptedMessageData;
      return messageData.reactions || [];
    } catch (error) {
      console.error('Failed to get message reactions:', error);
      return [];
    }
  }
}

export default ChatEncryptionService.getInstance();
