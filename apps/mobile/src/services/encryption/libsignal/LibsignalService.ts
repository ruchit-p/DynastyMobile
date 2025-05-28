import { SignalProtocolStore } from './stores/SignalProtocolStore';
import { KeyGenerationService } from './services/KeyGenerationService';
import { KeyDistributionService, PreKeyBundle } from './services/KeyDistributionService';
import { SessionService, EncryptedMessage } from './services/SessionService';
import { getFirebaseAuth } from '../../../lib/firebase';
import { logger } from '../../LoggingService';
import * as QuickCrypto from 'react-native-quick-crypto';

// Feature flag service (to be implemented)
// import { FeatureFlagService } from '../../FeatureFlagService';

export interface MessagePayload {
  text?: string;
  metadata?: any;
  type?: 'text' | 'media' | 'system';
}

export interface DeviceMessage {
  deviceId: number;
  encrypted: EncryptedMessage;
}

/**
 * Main service orchestrating Signal Protocol operations
 * Singleton pattern following Dynasty's architecture
 */
export class LibsignalService {
  private static instance: LibsignalService;
  
  private store: SignalProtocolStore;
  private keyGeneration: KeyGenerationService;
  private keyDistribution: KeyDistributionService;
  private sessionService: SessionService;
  
  private initialized = false;
  private userId?: string;
  private deviceId?: number;
  
  private constructor() {
    this.store = new SignalProtocolStore();
    this.keyGeneration = new KeyGenerationService(this.store);
    this.keyDistribution = new KeyDistributionService(this.keyGeneration, this.store);
    this.sessionService = new SessionService(this.store);
  }
  
  static getInstance(): LibsignalService {
    if (!LibsignalService.instance) {
      LibsignalService.instance = new LibsignalService();
    }
    return LibsignalService.instance;
  }
  
  /**
   * Initialize Signal Protocol for the current user
   * Should be called after authentication
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      logger.debug('LibsignalService already initialized');
      return;
    }
    
    try {
      const auth = getFirebaseAuth();
      const user = auth.currentUser;
      
      if (!user) {
        throw new Error('User not authenticated');
      }
      
      this.userId = user.uid;
      
      logger.info('Initializing Signal Protocol');
      
      // Check if we have an existing identity
      const hasIdentity = await this.store.hasIdentity();
      
      if (!hasIdentity) {
        logger.info('No identity found, generating new one');
        
        // Generate complete key bundle
        const bundle = await this.keyGeneration.generateInitialKeyBundle();
        this.deviceId = bundle.registrationId;
        
        // Publish to Firebase
        await this.keyDistribution.publishKeys();
        
        logger.info('Signal Protocol identity created and published');
      } else {
        // Load existing identity
        this.deviceId = await this.store.getLocalRegistrationId();
        logger.info(`Signal Protocol initialized with existing identity, device ID: ${this.deviceId}`);
        
        // Check if we need to replenish keys or rotate signed prekey
        await this.performKeyMaintenance();
      }
      
      this.initialized = true;
      
      // Start periodic key maintenance
      this.startKeyMaintenanceTimer();
      
    } catch (error) {
      logger.error('Failed to initialize Signal Protocol:', error);
      throw error;
    }
  }
  
  /**
   * Send an encrypted message to a recipient
   */
  async sendMessage(
    recipientId: string,
    message: MessagePayload
  ): Promise<DeviceMessage[]> {
    await this.ensureInitialized();
    
    try {
      logger.debug(`Sending message to ${recipientId}`);
      
      // Get recipient's devices
      const devices = await this.keyDistribution.getRecipientDevices(recipientId);
      
      if (devices.length === 0) {
        throw new Error(`No Signal-enabled devices found for ${recipientId}`);
      }
      
      // Encrypt for each device
      const encryptedMessages: DeviceMessage[] = [];
      
      for (const device of devices) {
        try {
          // Ensure session exists
          await this.sessionService.ensureSession(
            recipientId,
            device.id,
            () => this.keyDistribution.fetchPreKeyBundle(recipientId, device.id)
          );
          
          // Encrypt message
          const messageStr = JSON.stringify(message);
          const encrypted = await this.sessionService.encryptMessage(
            recipientId,
            device.id,
            messageStr
          );
          
          encryptedMessages.push({
            deviceId: device.id,
            encrypted
          });
        } catch (error) {
          logger.error(`Failed to encrypt for device ${device.id}:`, error);
          // Continue with other devices
        }
      }
      
      if (encryptedMessages.length === 0) {
        throw new Error('Failed to encrypt message for any device');
      }
      
      logger.debug(`Message encrypted for ${encryptedMessages.length} devices`);
      
      return encryptedMessages;
    } catch (error) {
      logger.error('Failed to send message:', error);
      throw error;
    }
  }
  
  /**
   * Receive and decrypt a message
   */
  async receiveMessage(
    senderId: string,
    deviceId: number,
    encryptedMessage: EncryptedMessage
  ): Promise<MessagePayload> {
    await this.ensureInitialized();
    
    try {
      logger.debug(`Receiving message from ${senderId}:${deviceId}`);
      
      const decrypted = await this.sessionService.decryptMessage(
        senderId,
        deviceId,
        encryptedMessage
      );
      
      return JSON.parse(decrypted) as MessagePayload;
    } catch (error) {
      logger.error(`Failed to decrypt message from ${senderId}:${deviceId}:`, error);
      
      // Handle specific errors
      if (error.message?.includes('No session')) {
        // Try to establish session and retry
        logger.info('No session found, attempting to establish');
        
        const bundle = await this.keyDistribution.fetchPreKeyBundle(senderId, deviceId);
        await this.sessionService.createSession(senderId, deviceId, bundle);
        
        // Retry decryption
        const decrypted = await this.sessionService.decryptMessage(
          senderId,
          deviceId,
          encryptedMessage
        );
        
        return JSON.parse(decrypted) as MessagePayload;
      }
      
      throw error;
    }
  }
  
  /**
   * Get statistics about keys and sessions
   */
  async getKeyStatistics(): Promise<{
    preKeysRemaining: number;
    signedPreKeyAge: number;
    sessionsActive: number;
  }> {
    await this.ensureInitialized();
    
    try {
      const keyStats = await this.keyGeneration.getKeyStatistics();
      const sessions = await this.sessionService.getActiveSessions();
      
      return {
        preKeysRemaining: keyStats.preKeysRemaining,
        signedPreKeyAge: keyStats.signedPreKeyAge,
        sessionsActive: sessions.length
      };
    } catch (error) {
      logger.error('Failed to get key statistics:', error);
      return {
        preKeysRemaining: 0,
        signedPreKeyAge: 0,
        sessionsActive: 0
      };
    }
  }
  
  /**
   * Generate safety number for identity verification
   */
  async generateSafetyNumber(recipientId: string): Promise<string> {
    await this.ensureInitialized();
    
    try {
      // Get our identity
      const ourIdentity = await this.store.getIdentityKeyPair();
      
      // Get recipient's identity
      const recipientInfo = await this.keyDistribution.getRecipientInfo(recipientId);
      if (!recipientInfo.deviceId) {
        throw new Error('Recipient has no Signal-enabled device');
      }
      
      const recipientBundle = await this.keyDistribution.fetchPreKeyBundle(
        recipientId,
        recipientInfo.deviceId
      );
      
      // Generate safety number (simplified version)
      // In production, use Signal's fingerprint generation
      const combined = Buffer.concat([
        ourIdentity.publicKey.serialize(),
        Buffer.from(recipientBundle.identityKey, 'base64')
      ]);
      
      const hash = QuickCrypto.createHash('sha256');
      hash.update(combined);
      const digest = hash.digest();
      
      // Convert to numeric safety number
      const safetyNumber = digest.toString('hex').substring(0, 60);
      
      return safetyNumber;
    } catch (error) {
      logger.error('Failed to generate safety number:', error);
      throw error;
    }
  }
  
  /**
   * Mark an identity as verified
   */
  async markIdentityVerified(recipientId: string): Promise<void> {
    await this.ensureInitialized();
    
    try {
      const recipientInfo = await this.keyDistribution.getRecipientInfo(recipientId);
      
      if (!recipientInfo.deviceId) {
        throw new Error('Recipient has no Signal-enabled device');
      }
      
      await this.sessionService.markIdentityVerified(recipientId, recipientInfo.deviceId);
      
      logger.info(`Identity verified for ${recipientId}`);
    } catch (error) {
      logger.error('Failed to mark identity as verified:', error);
      throw error;
    }
  }
  
  /**
   * Rotate signed prekey (called periodically)
   */
  async rotateSignedPreKey(): Promise<void> {
    await this.ensureInitialized();
    
    try {
      logger.info('Rotating signed prekey');
      
      await this.keyGeneration.rotateSignedPreKey();
      await this.keyDistribution.publishKeys();
      
      logger.info('Signed prekey rotated successfully');
    } catch (error) {
      logger.error('Failed to rotate signed prekey:', error);
      throw error;
    }
  }
  
  /**
   * Replenish one-time prekeys
   */
  async replenishPreKeys(): Promise<void> {
    await this.ensureInitialized();
    
    try {
      logger.info('Replenishing prekeys');
      
      const newKeys = await this.keyGeneration.replenishPreKeys();
      
      if (newKeys.length > 0) {
        await this.keyDistribution.publishKeys();
        logger.info(`Replenished ${newKeys.length} prekeys`);
      }
    } catch (error) {
      logger.error('Failed to replenish prekeys:', error);
      throw error;
    }
  }
  
  /**
   * Clear all Signal Protocol data (for logout or reset)
   */
  async clearAllData(): Promise<void> {
    try {
      logger.warn('Clearing all Signal Protocol data');
      
      // Stop maintenance timer
      this.stopKeyMaintenanceTimer();
      
      // Clear all stored data
      await this.store.clearAllSessions();
      await this.store.clearAllPreKeys();
      await this.store.clearIdentity();
      
      // Delete device from Firebase
      if (this.deviceId) {
        await this.keyDistribution.deleteDevice(this.deviceId);
      }
      
      // Reset state
      this.initialized = false;
      this.userId = undefined;
      this.deviceId = undefined;
      
      logger.info('Signal Protocol data cleared');
    } catch (error) {
      logger.error('Failed to clear Signal Protocol data:', error);
      throw error;
    }
  }
  
  /**
   * Get recipient devices (for UI)
   */
  async getRecipientDevices(recipientId: string): Promise<{
    id: number;
    name?: string;
    type: string;
    lastSeen: Date;
    supportsSignalProtocol: boolean;
  }[]> {
    await this.ensureInitialized();
    
    return this.keyDistribution.getRecipientDevices(recipientId);
  }
  
  // Private helper methods
  
  private async ensureInitialized(): Promise<void> {
    if (!this.initialized) {
      throw new Error('LibsignalService not initialized');
    }
  }
  
  private async performKeyMaintenance(): Promise<void> {
    try {
      // Check if we need to rotate signed prekey
      const shouldRotate = await this.keyGeneration.shouldRotateSignedPreKey();
      if (shouldRotate) {
        await this.rotateSignedPreKey();
      }
      
      // Check if we need to replenish prekeys
      const keyStatus = await this.keyDistribution.checkPreKeyStatus();
      if (keyStatus.needsReplenishment) {
        await this.replenishPreKeys();
      }
      
      // Update last seen
      await this.keyDistribution.updateLastSeen();
    } catch (error) {
      logger.error('Key maintenance failed:', error);
    }
  }
  
  private maintenanceTimer?: NodeJS.Timeout;
  
  private startKeyMaintenanceTimer(): void {
    // Run maintenance every hour
    this.maintenanceTimer = setInterval(() => {
      this.performKeyMaintenance().catch(error => {
        logger.error('Periodic key maintenance failed:', error);
      });
    }, 60 * 60 * 1000); // 1 hour
    
    logger.debug('Key maintenance timer started');
  }
  
  private stopKeyMaintenanceTimer(): void {
    if (this.maintenanceTimer) {
      clearInterval(this.maintenanceTimer);
      this.maintenanceTimer = undefined;
      logger.debug('Key maintenance timer stopped');
    }
  }

  /**
   * Generate a key pair (for compatibility with E2EEService)
   */
  async generateKeyPair(): Promise<{ publicKey: string; privateKey: string }> {
    try {
      const { PrivateKey } = await import('@signalapp/libsignal-client');
      const privateKey = PrivateKey.generate();
      const publicKey = privateKey.getPublicKey();
      
      return {
        publicKey: Buffer.from(publicKey.serialize()).toString('base64'),
        privateKey: Buffer.from(privateKey.serialize()).toString('base64')
      };
    } catch (error) {
      logger.error('Failed to generate key pair:', error);
      throw error;
    }
  }

  /**
   * Get the current identity key pair
   */
  async getIdentityKeyPair(): Promise<{ publicKey: string; privateKey: string } | null> {
    try {
      const hasIdentity = await this.store.hasIdentity();
      if (!hasIdentity) return null;
      
      const identityKeyPair = await this.store.getIdentityKeyPair();
      
      return {
        publicKey: Buffer.from(identityKeyPair.publicKey.serialize()).toString('base64'),
        privateKey: Buffer.from(identityKeyPair.privateKey.serialize()).toString('base64')
      };
    } catch (error) {
      logger.error('Failed to get identity key pair:', error);
      return null;
    }
  }

  /**
   * Restore a key pair (for compatibility)
   */
  async restoreKeyPair(keyPair: { publicKey: string; privateKey: string }): Promise<void> {
    // This is a no-op for Signal Protocol as we manage keys differently
    logger.warn('restoreKeyPair called but not implemented for Signal Protocol');
  }

  /**
   * Decrypt a message (for compatibility with E2EEService)
   * Note: Signal Protocol handles decryption differently through sessions
   */
  async decryptMessage(encryptedData: any): Promise<string> {
    logger.warn('decryptMessage called but not directly compatible with Signal Protocol');
    // For now, return a placeholder
    throw new Error('Use receiveMessage for Signal Protocol decryption');
  }

  /**
   * Static helper methods for E2EEService compatibility
   */
  static async encryptMessage(message: string, recipientPublicKey: string): Promise<any> {
    // This would need proper implementation based on Signal Protocol
    logger.warn('Static encryptMessage not implemented for Signal Protocol');
    throw new Error('Use instance method sendMessage instead');
  }

  /**
   * Clear all Signal Protocol data (for reset/logout)
   * This is a static method to match E2EEService API
   */
  static async clearAllSignalData(): Promise<void> {
    const instance = LibsignalService.instance;
    if (instance) {
      await instance.clearAllData();
    }
  }

  
  /**
   * Encrypt data with a public key (simplified test method for key validation)
   */
  async encryptWithKey(data: string, publicKey: string): Promise<string> {
    try {
      // Simple encryption for testing key validity
      const key = QuickCrypto.createHash('sha256')
        .update(publicKey)
        .digest();
      
      const nonce = QuickCrypto.randomBytes(16);
      const cipher = QuickCrypto.createCipheriv('aes-256-gcm', key, nonce);
      
      const encrypted = Buffer.concat([
        cipher.update(Buffer.from(data, 'utf8')),
        cipher.final()
      ]);
      
      const tag = cipher.getAuthTag();
      
      return Buffer.concat([nonce, tag, encrypted]).toString('base64');
    } catch (error) {
      logger.error('Failed to encrypt with key:', error);
      throw error;
    }
  }

  /**
   * Decrypt data with a private key (simplified test method for key validation)
   */
  async decryptWithKey(encryptedData: string, privateKey: string): Promise<string> {
    try {
      const data = Buffer.from(encryptedData, 'base64');
      const nonce = data.slice(0, 16);
      const tag = data.slice(16, 32);
      const encrypted = data.slice(32);
      
      // Simple decryption for testing key validity
      const key = QuickCrypto.createHash('sha256')
        .update(privateKey)
        .digest();
      
      const decipher = QuickCrypto.createDecipheriv('aes-256-gcm', key, nonce);
      decipher.setAuthTag(tag);
      
      const decrypted = Buffer.concat([
        decipher.update(encrypted),
        decipher.final()
      ]);
      
      return decrypted.toString('utf8');
    } catch (error) {
      logger.error('Failed to decrypt with key:', error);
      throw error;
    }
  }
}