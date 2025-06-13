import {
  ProtocolAddress,
  PreKeyBundle as SignalPreKeyBundle,
  processPreKeyBundle,
  SessionCipher,
  CiphertextMessage,
  MessageType,
  PublicKey,
} from '@signalapp/libsignal-client';
import { SignalProtocolStore } from '../stores/SignalProtocolStore';
import { PreKeyBundle } from './KeyDistributionService';
import { logger } from '../../../LoggingService';
import { Buffer } from '@craftzdog/react-native-buffer';

export interface EncryptedMessage {
  type: MessageType;
  body: string;
  timestamp: number;
  deviceId: number;
}

/**
 * Service responsible for managing Signal Protocol sessions
 * Handles session creation, encryption, and decryption
 */
export class SessionService {
  constructor(private store: SignalProtocolStore) {}
  
  /**
   * Create a new session with a recipient using their prekey bundle
   */
  async createSession(
    recipientId: string,
    deviceId: number,
    bundle: PreKeyBundle
  ): Promise<void> {
    try {
      logger.info(`Creating session with ${recipientId}:${deviceId}`);
      
      const address = new ProtocolAddress(recipientId, deviceId);
      
      // Convert our PreKeyBundle to Signal's format
      const signalBundle = this.convertToSignalBundle(bundle);
      
      // Process the prekey bundle to establish session
      await processPreKeyBundle(
        signalBundle,
        address,
        this.store
      );
      
      // Mark session as established
      await this.store.markSessionEstablished(recipientId, deviceId);
      
      logger.info(`Session established with ${recipientId}:${deviceId}`);
    } catch (error) {
      logger.error(`Failed to create session with ${recipientId}:${deviceId}:`, error);
      throw error;
    }
  }
  
  /**
   * Encrypt a message for a recipient
   */
  async encryptMessage(
    recipientId: string,
    deviceId: number,
    message: string
  ): Promise<EncryptedMessage> {
    try {
      const address = new ProtocolAddress(recipientId, deviceId);
      const cipher = new SessionCipher(address, this.store);
      
      const plaintext = Buffer.from(message, 'utf8');
      const ciphertext = await cipher.encrypt(plaintext);
      
      const encrypted: EncryptedMessage = {
        type: ciphertext.type(),
        body: ciphertext.serialize().toString('base64'),
        timestamp: Date.now(),
        deviceId
      };
      
      logger.debug(`Encrypted message for ${recipientId}:${deviceId}, type: ${ciphertext.type()}`);
      
      return encrypted;
    } catch (error) {
      logger.error(`Failed to encrypt message for ${recipientId}:${deviceId}:`, error);
      throw error;
    }
  }
  
  /**
   * Decrypt a message from a sender
   */
  async decryptMessage(
    senderId: string,
    deviceId: number,
    ciphertext: EncryptedMessage
  ): Promise<string> {
    try {
      const address = new ProtocolAddress(senderId, deviceId);
      const cipher = new SessionCipher(address, this.store);
      
      // Reconstruct CiphertextMessage from type and body
      const message = CiphertextMessage.from(
        Buffer.from(ciphertext.body, 'base64')
      );
      
      const plaintext = await cipher.decrypt(message);
      const decrypted = plaintext.toString('utf8');
      
      logger.debug(`Decrypted message from ${senderId}:${deviceId}`);
      
      return decrypted;
    } catch (error) {
      logger.error(`Failed to decrypt message from ${senderId}:${deviceId}:`, error);
      
      // Check if this is a duplicate message error
      if (error.message?.includes('duplicate message')) {
        throw new Error('Duplicate message detected');
      }
      
      throw error;
    }
  }
  
  /**
   * Check if we have an established session with a recipient
   */
  async hasSession(recipientId: string, deviceId: number): Promise<boolean> {
    try {
      const address = new ProtocolAddress(recipientId, deviceId);
      const session = await this.store.loadSession(address);
      return session !== undefined;
    } catch (error) {
      logger.error(`Failed to check session for ${recipientId}:${deviceId}:`, error);
      return false;
    }
  }
  
  /**
   * Ensure a session exists, creating it if necessary
   */
  async ensureSession(
    recipientId: string,
    deviceId: number,
    fetchBundle: () => Promise<PreKeyBundle>
  ): Promise<void> {
    try {
      const hasSession = await this.hasSession(recipientId, deviceId);
      
      if (!hasSession) {
        logger.info(`No session with ${recipientId}:${deviceId}, establishing new session`);
        const bundle = await fetchBundle();
        await this.createSession(recipientId, deviceId, bundle);
      }
    } catch (error) {
      logger.error(`Failed to ensure session with ${recipientId}:${deviceId}:`, error);
      throw error;
    }
  }
  
  /**
   * Delete a session with a specific device
   */
  async deleteSession(recipientId: string, deviceId: number): Promise<void> {
    try {
      const address = new ProtocolAddress(recipientId, deviceId);
      const key = `signal_protocol_session_${address.toString()}`;
      
      // Remove from AsyncStorage
      const AsyncStorage = (await import('@react-native-async-storage/async-storage')).default;
      await AsyncStorage.removeItem(key);
      
      logger.info(`Deleted session with ${recipientId}:${deviceId}`);
    } catch (error) {
      logger.error(`Failed to delete session with ${recipientId}:${deviceId}:`, error);
      throw error;
    }
  }
  
  /**
   * Get all active sessions
   */
  async getActiveSessions(): Promise<{
    userId: string;
    deviceId: number;
    address: string;
  }[]> {
    try {
      const sessions = await this.store.getAllSessions();
      const activeSessions: {
        userId: string;
        deviceId: number;
        address: string;
      }[] = [];
      
      for (const [addressStr, _session] of sessions) {
        // Parse address string (format: "userId.deviceId")
        const parts = addressStr.split('.');
        if (parts.length === 2) {
          activeSessions.push({
            userId: parts[0],
            deviceId: parseInt(parts[1]),
            address: addressStr
          });
        }
      }
      
      return activeSessions;
    } catch (error) {
      logger.error('Failed to get active sessions:', error);
      return [];
    }
  }
  
  /**
   * Get session info for debugging/UI
   */
  async getSessionInfo(recipientId: string, deviceId: number): Promise<{
    exists: boolean;
    established?: Date;
    messageCount?: number;
  }> {
    try {
      const hasSession = await this.hasSession(recipientId, deviceId);
      
      if (!hasSession) {
        return { exists: false };
      }
      
      // Get session establishment time
      const AsyncStorage = (await import('@react-native-async-storage/async-storage')).default;
      const establishedKey = `signal_protocol_session_established_${recipientId}_${deviceId}`;
      const establishedTime = await AsyncStorage.getItem(establishedKey);
      
      return {
        exists: true,
        established: establishedTime ? new Date(parseInt(establishedTime)) : undefined,
        messageCount: 0 // TODO: Track message count
      };
    } catch (error) {
      logger.error(`Failed to get session info for ${recipientId}:${deviceId}:`, error);
      return { exists: false };
    }
  }
  
  /**
   * Verify identity key for a recipient
   */
  async verifyIdentity(
    recipientId: string,
    deviceId: number,
    identityKey: string
  ): Promise<boolean> {
    try {
      const address = new ProtocolAddress(recipientId, deviceId);
      const publicKey = PublicKey.deserialize(Buffer.from(identityKey, 'base64'));
      
      const isTrusted = await this.store.isTrustedIdentity(
        address,
        publicKey,
        0 // Direction.Sending
      );
      
      return isTrusted;
    } catch (error) {
      logger.error(`Failed to verify identity for ${recipientId}:${deviceId}:`, error);
      return false;
    }
  }
  
  /**
   * Mark an identity as verified (for safety number verification)
   */
  async markIdentityVerified(
    recipientId: string,
    deviceId: number
  ): Promise<void> {
    try {
      const AsyncStorage = (await import('@react-native-async-storage/async-storage')).default;
      const key = `signal_protocol_identity_verified_${recipientId}_${deviceId}`;
      await AsyncStorage.setItem(key, Date.now().toString());
      
      logger.info(`Marked identity as verified for ${recipientId}:${deviceId}`);
    } catch (error) {
      logger.error(`Failed to mark identity as verified for ${recipientId}:${deviceId}:`, error);
      throw error;
    }
  }
  
  /**
   * Convert our PreKeyBundle format to Signal's format
   */
  private convertToSignalBundle(bundle: PreKeyBundle): SignalPreKeyBundle {
    const identityKey = PublicKey.deserialize(Buffer.from(bundle.identityKey, 'base64'));
    const signedPreKey = PublicKey.deserialize(Buffer.from(bundle.signedPreKey, 'base64'));
    
    let preKey: PublicKey | undefined;
    if (bundle.preKey) {
      preKey = PublicKey.deserialize(Buffer.from(bundle.preKey, 'base64'));
    }
    
    return SignalPreKeyBundle.new(
      bundle.registrationId,
      bundle.deviceId,
      bundle.preKeyId ?? null,
      preKey ?? null,
      bundle.signedPreKeyId,
      signedPreKey,
      Buffer.from(bundle.signedPreKeySignature, 'base64'),
      identityKey
    );
  }
  
  /**
   * Clean up old sessions (for maintenance)
   */
  async cleanupOldSessions(maxAgeMs: number = 30 * 24 * 60 * 60 * 1000): Promise<number> {
    try {
      const cutoff = Date.now() - maxAgeMs;
      await this.store.clearSessionsOlderThan(cutoff);
      
      logger.info('Cleaned up old sessions');
      return 0; // TODO: Return actual count
    } catch (error) {
      logger.error('Failed to cleanup old sessions:', error);
      return 0;
    }
  }
}