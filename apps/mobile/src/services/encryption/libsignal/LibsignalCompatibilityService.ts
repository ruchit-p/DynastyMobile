import { LibsignalService, MessagePayload } from './LibsignalService';
import { E2EEService, EncryptedMessage as LegacyEncryptedMessage } from '../E2EEService';
import { KeyDistributionService } from './services/KeyDistributionService';
import { getFirebaseAuth } from '../../../lib/firebase';
import { logger } from '../../LoggingService';

export interface CompatibleEncryptedMessage {
  protocolVersion: 'signal_v1' | 'legacy';
  
  // For Signal Protocol
  signalMetadata?: {
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
  
  // For legacy encryption
  encryptedPayloads?: {
    [recipientId: string]: LegacyEncryptedMessage;
  };
}

/**
 * Compatibility layer between Signal Protocol and legacy E2EE
 * Handles graceful migration and dual-protocol support
 */
export class LibsignalCompatibilityService {
  private currentUserId?: string;
  
  constructor(
    private libsignalService: LibsignalService,
    private keyDistService: KeyDistributionService,
    private legacyE2EE: E2EEService
  ) {
    const auth = getFirebaseAuth();
    this.currentUserId = auth.currentUser?.uid;
  }
  
  /**
   * Encrypt a message using the appropriate protocol for each recipient
   */
  async encryptMessage(
    conversationId: string,
    message: MessagePayload,
    recipientIds: string[]
  ): Promise<CompatibleEncryptedMessage> {
    try {
      logger.debug(`Encrypting message for ${recipientIds.length} recipients`);
      
      // Check capabilities for all recipients
      const recipientCapabilities = await this.getRecipientsCapabilities(recipientIds);
      
      // Separate recipients by protocol
      const signalRecipients = recipientCapabilities.filter(r => r.supportsSignalProtocol);
      const legacyRecipients = recipientCapabilities.filter(r => !r.supportsSignalProtocol);
      
      const result: CompatibleEncryptedMessage = {
        protocolVersion: signalRecipients.length > 0 ? 'signal_v1' : 'legacy'
      };
      
      // Encrypt for Signal Protocol recipients
      if (signalRecipients.length > 0) {
        logger.debug(`Encrypting for ${signalRecipients.length} Signal Protocol recipients`);
        
        result.signalMetadata = {
          senderDeviceId: await this.getCurrentDeviceId(),
          recipients: {}
        };
        
        for (const recipient of signalRecipients) {
          try {
            const deviceMessages = await this.libsignalService.sendMessage(
              recipient.userId,
              message
            );
            
            result.signalMetadata.recipients[recipient.userId] = {};
            
            for (const deviceMsg of deviceMessages) {
              result.signalMetadata.recipients[recipient.userId][deviceMsg.deviceId.toString()] = {
                encryptedPayload: deviceMsg.encrypted.body,
                messageType: deviceMsg.encrypted.type
              };
            }
          } catch (error) {
            logger.error(`Failed to encrypt for Signal recipient ${recipient.userId}:`, error);
            // Fall back to legacy for this recipient
            legacyRecipients.push(recipient);
          }
        }
      }
      
      // Encrypt for legacy recipients
      if (legacyRecipients.length > 0) {
        logger.debug(`Encrypting for ${legacyRecipients.length} legacy recipients`);
        
        result.encryptedPayloads = {};
        
        for (const recipient of legacyRecipients) {
          try {
            const encrypted = await this.legacyE2EE.encryptMessage(
              JSON.stringify(message),
              recipient.userId
            );
            
            result.encryptedPayloads[recipient.userId] = encrypted;
          } catch (error) {
            logger.error(`Failed to encrypt for legacy recipient ${recipient.userId}:`, error);
          }
        }
      }
      
      return result;
    } catch (error) {
      logger.error('Failed to encrypt message:', error);
      throw error;
    }
  }
  
  /**
   * Decrypt a message from either protocol
   */
  async decryptMessage(
    message: CompatibleEncryptedMessage,
    senderId: string
  ): Promise<MessagePayload> {
    try {
      if (message.protocolVersion === 'signal_v1' && message.signalMetadata) {
        return await this.decryptSignalMessage(message, senderId);
      } else if (message.encryptedPayloads) {
        return await this.decryptLegacyMessage(message, senderId);
      } else {
        throw new Error('Invalid message format');
      }
    } catch (error) {
      logger.error('Failed to decrypt message:', error);
      throw error;
    }
  }
  
  /**
   * Check if a user supports Signal Protocol
   */
  async isSignalProtocolEnabled(userId: string): Promise<boolean> {
    try {
      return await this.keyDistService.isSignalProtocolEnabled(userId);
    } catch (error) {
      logger.error(`Failed to check Signal Protocol status for ${userId}:`, error);
      return false;
    }
  }
  
  /**
   * Migrate a conversation to Signal Protocol
   */
  async migrateConversation(
    conversationId: string,
    participantIds: string[]
  ): Promise<{
    success: boolean;
    migratedCount: number;
    failedCount: number;
  }> {
    try {
      logger.info(`Migrating conversation ${conversationId} to Signal Protocol`);
      
      let migratedCount = 0;
      let failedCount = 0;
      
      for (const participantId of participantIds) {
        if (participantId === this.currentUserId) continue;
        
        try {
          // Check if participant supports Signal Protocol
          const supportsSignal = await this.isSignalProtocolEnabled(participantId);
          
          if (supportsSignal) {
            // Establish session if needed
            const devices = await this.libsignalService.getRecipientDevices(participantId);
            
            for (const device of devices) {
              const hasSession = await this.hasSession(participantId, device.id);
              if (!hasSession) {
                await this.establishSession(participantId, device.id);
              }
            }
            
            migratedCount++;
          } else {
            logger.debug(`Participant ${participantId} doesn't support Signal Protocol`);
            failedCount++;
          }
        } catch (error) {
          logger.error(`Failed to migrate session with ${participantId}:`, error);
          failedCount++;
        }
      }
      
      logger.info(`Conversation migration complete: ${migratedCount} migrated, ${failedCount} failed`);
      
      return {
        success: failedCount === 0,
        migratedCount,
        failedCount
      };
    } catch (error) {
      logger.error('Failed to migrate conversation:', error);
      throw error;
    }
  }
  
  /**
   * Get protocol statistics for monitoring
   */
  async getProtocolStatistics(): Promise<{
    signalEnabled: boolean;
    totalContacts: number;
    signalContacts: number;
    legacyContacts: number;
    migrationProgress: number;
  }> {
    try {
      // This would query your contacts/conversations
      // For now, return default values
      const stats = {
        signalEnabled: true,
        totalContacts: 0,
        signalContacts: 0,
        legacyContacts: 0,
        migrationProgress: 0
      };
      
      // Future implementation would include actual statistics gathering
      
      return stats;
    } catch (error) {
      logger.error('Failed to get protocol statistics:', error);
      return {
        signalEnabled: false,
        totalContacts: 0,
        signalContacts: 0,
        legacyContacts: 0,
        migrationProgress: 0
      };
    }
  }
  
  // Private helper methods
  
  private async getRecipientsCapabilities(recipientIds: string[]): Promise<{
    userId: string;
    supportsSignalProtocol: boolean;
    deviceId?: number;
  }[]> {
    const capabilities = await Promise.all(
      recipientIds.map(async (userId) => {
        const info = await this.keyDistService.getRecipientInfo(userId);
        return {
          userId,
          supportsSignalProtocol: info.supportsSignalProtocol,
          deviceId: info.deviceId
        };
      })
    );
    
    return capabilities;
  }
  
  private async getCurrentDeviceId(): Promise<number> {
    const store = this.libsignalService['store'];
    return await store.getLocalRegistrationId();
  }
  
  private async decryptSignalMessage(
    message: CompatibleEncryptedMessage,
    senderId: string
  ): Promise<MessagePayload> {
    if (!message.signalMetadata || !this.currentUserId) {
      throw new Error('Invalid Signal message format');
    }
    
    const recipientData = message.signalMetadata.recipients[this.currentUserId];
    if (!recipientData) {
      throw new Error('No encrypted payload for current user');
    }
    
    // Find our device's encrypted payload
    const currentDeviceId = await this.getCurrentDeviceId();
    const deviceData = recipientData[currentDeviceId.toString()];
    
    if (!deviceData) {
      // Try other devices (multi-device support)
      const deviceIds = Object.keys(recipientData);
      if (deviceIds.length > 0) {
        const firstDeviceId = deviceIds[0];
        const firstDeviceData = recipientData[firstDeviceId];
        
        return await this.libsignalService.receiveMessage(
          senderId,
          message.signalMetadata.senderDeviceId,
          {
            type: firstDeviceData.messageType as any,
            body: firstDeviceData.encryptedPayload,
            timestamp: Date.now(),
            deviceId: parseInt(firstDeviceId)
          }
        );
      }
      
      throw new Error('No encrypted payload for any of our devices');
    }
    
    return await this.libsignalService.receiveMessage(
      senderId,
      message.signalMetadata.senderDeviceId,
      {
        type: deviceData.messageType as any,
        body: deviceData.encryptedPayload,
        timestamp: Date.now(),
        deviceId: currentDeviceId
      }
    );
  }
  
  private async decryptLegacyMessage(
    message: CompatibleEncryptedMessage,
    senderId: string
  ): Promise<MessagePayload> {
    if (!message.encryptedPayloads || !this.currentUserId) {
      throw new Error('Invalid legacy message format');
    }
    
    const encrypted = message.encryptedPayloads[this.currentUserId];
    if (!encrypted) {
      throw new Error('No encrypted payload for current user');
    }
    
    const decrypted = await this.legacyE2EE.decryptMessage(encrypted, senderId);
    
    try {
      return JSON.parse(decrypted) as MessagePayload;
    } catch {
      // Handle plain text messages from legacy system
      return { text: decrypted };
    }
  }
  
  private async hasSession(recipientId: string, deviceId: number): Promise<boolean> {
    const sessionService = this.libsignalService['sessionService'];
    return await sessionService.hasSession(recipientId, deviceId);
  }
  
  private async establishSession(recipientId: string, deviceId: number): Promise<void> {
    const sessionService = this.libsignalService['sessionService'];
    const bundle = await this.keyDistService.fetchPreKeyBundle(recipientId, deviceId);
    await sessionService.createSession(recipientId, deviceId, bundle);
  }
}