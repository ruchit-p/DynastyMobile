import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Keychain from 'react-native-keychain';
import { Buffer } from '@craftzdog/react-native-buffer';
import {
  ProtocolStore,
  ProtocolAddress,
  PublicKey,
  IdentityKeyPair,
  PreKeyRecord,
  SignedPreKeyRecord,
  SessionRecord,
  SenderKeyRecord,
  Direction,
} from '@signalapp/libsignal-client';
import { logger } from '../../../LoggingService';

/**
 * Signal Protocol Store implementation for React Native
 * Uses Keychain for identity keys and AsyncStorage for other data
 * Follows Dynasty's security patterns
 */
export class SignalProtocolStore implements ProtocolStore {
  private readonly storagePrefix = 'signal_protocol_';
  private readonly keychainService = 'dynasty_signal_protocol';
  
  // Caches for frequently accessed data
  private identityKeyCache?: IdentityKeyPair;
  private registrationIdCache?: number;
  
  /**
   * Identity Key Management
   */
  async getIdentityKeyPair(): Promise<IdentityKeyPair> {
    try {
      // Check cache first
      if (this.identityKeyCache) {
        return this.identityKeyCache;
      }

      // Retrieve from secure storage
      const credentials = await Keychain.getInternetCredentials(
        `${this.keychainService}_identity`
      );
      
      if (!credentials) {
        logger.error('Identity key pair not found in keychain');
        throw new Error('Identity key pair not found');
      }
      
      const keyPair = IdentityKeyPair.deserialize(
        Buffer.from(credentials.password, 'base64')
      );
      
      // Cache for future use
      this.identityKeyCache = keyPair;
      
      return keyPair;
    } catch (error) {
      logger.error('Failed to get identity key pair:', error);
      throw error;
    }
  }
  
  async storeIdentityKeyPair(keyPair: IdentityKeyPair): Promise<void> {
    try {
      await Keychain.setInternetCredentials(
        `${this.keychainService}_identity`,
        'identity',
        keyPair.serialize().toString('base64')
      );
      
      // Update cache
      this.identityKeyCache = keyPair;
      
      logger.debug('Identity key pair stored successfully');
    } catch (error) {
      logger.error('Failed to store identity key pair:', error);
      throw error;
    }
  }
  
  async getLocalRegistrationId(): Promise<number> {
    try {
      // Check cache
      if (this.registrationIdCache !== undefined) {
        return this.registrationIdCache;
      }

      const id = await AsyncStorage.getItem(
        `${this.storagePrefix}registration_id`
      );
      
      if (!id) {
        logger.error('Registration ID not found');
        throw new Error('Registration ID not found');
      }
      
      const registrationId = parseInt(id, 10);
      this.registrationIdCache = registrationId;
      
      return registrationId;
    } catch (error) {
      logger.error('Failed to get registration ID:', error);
      throw error;
    }
  }
  
  async storeLocalRegistrationId(registrationId: number): Promise<void> {
    try {
      await AsyncStorage.setItem(
        `${this.storagePrefix}registration_id`,
        registrationId.toString()
      );
      
      this.registrationIdCache = registrationId;
      logger.debug('Registration ID stored:', registrationId);
    } catch (error) {
      logger.error('Failed to store registration ID:', error);
      throw error;
    }
  }
  
  /**
   * Identity Management for other users
   */
  async saveIdentity(
    address: ProtocolAddress,
    identity: PublicKey
  ): Promise<boolean> {
    try {
      const key = `${this.storagePrefix}identity_${address.toString()}`;
      const existing = await AsyncStorage.getItem(key);
      
      await AsyncStorage.setItem(
        key,
        identity.serialize().toString('base64')
      );
      
      // Return true if identity changed (important for security)
      const identityChanged = existing !== null && 
        existing !== identity.serialize().toString('base64');
      
      if (identityChanged) {
        logger.warn(`Identity changed for ${address.toString()}`);
      }
      
      return identityChanged;
    } catch (error) {
      logger.error('Failed to save identity:', error);
      throw error;
    }
  }
  
  async isTrustedIdentity(
    address: ProtocolAddress,
    identity: PublicKey,
    direction: Direction
  ): Promise<boolean> {
    try {
      const key = `${this.storagePrefix}identity_${address.toString()}`;
      const saved = await AsyncStorage.getItem(key);
      
      if (!saved) {
        // First time seeing this identity - trust it
        logger.debug(`First time seeing identity for ${address.toString()}`);
        return true;
      }
      
      // Check if identity matches
      const isTrusted = saved === identity.serialize().toString('base64');
      
      if (!isTrusted) {
        logger.warn(`Untrusted identity for ${address.toString()}`);
      }
      
      return isTrusted;
    } catch (error) {
      logger.error('Failed to check trusted identity:', error);
      throw error;
    }
  }
  
  async getIdentity(
    address: ProtocolAddress
  ): Promise<PublicKey | undefined> {
    try {
      const key = `${this.storagePrefix}identity_${address.toString()}`;
      const saved = await AsyncStorage.getItem(key);
      
      if (!saved) {
        return undefined;
      }
      
      return PublicKey.deserialize(Buffer.from(saved, 'base64'));
    } catch (error) {
      logger.error('Failed to get identity:', error);
      throw error;
    }
  }
  
  /**
   * PreKey Management
   */
  async loadPreKey(id: number): Promise<PreKeyRecord | undefined> {
    try {
      const key = `${this.storagePrefix}prekey_${id}`;
      const saved = await AsyncStorage.getItem(key);
      
      if (!saved) {
        return undefined;
      }
      
      return PreKeyRecord.deserialize(Buffer.from(saved, 'base64'));
    } catch (error) {
      logger.error(`Failed to load prekey ${id}:`, error);
      throw error;
    }
  }
  
  async storePreKey(id: number, record: PreKeyRecord): Promise<void> {
    try {
      const key = `${this.storagePrefix}prekey_${id}`;
      await AsyncStorage.setItem(
        key,
        record.serialize().toString('base64')
      );
    } catch (error) {
      logger.error(`Failed to store prekey ${id}:`, error);
      throw error;
    }
  }
  
  async removePreKey(id: number): Promise<void> {
    try {
      const key = `${this.storagePrefix}prekey_${id}`;
      await AsyncStorage.removeItem(key);
    } catch (error) {
      logger.error(`Failed to remove prekey ${id}:`, error);
      throw error;
    }
  }
  
  /**
   * Signed PreKey Management
   */
  async loadSignedPreKey(id: number): Promise<SignedPreKeyRecord | undefined> {
    try {
      const key = `${this.storagePrefix}signed_prekey_${id}`;
      const saved = await AsyncStorage.getItem(key);
      
      if (!saved) {
        return undefined;
      }
      
      return SignedPreKeyRecord.deserialize(Buffer.from(saved, 'base64'));
    } catch (error) {
      logger.error(`Failed to load signed prekey ${id}:`, error);
      throw error;
    }
  }
  
  async storeSignedPreKey(id: number, record: SignedPreKeyRecord): Promise<void> {
    try {
      const key = `${this.storagePrefix}signed_prekey_${id}`;
      await AsyncStorage.setItem(
        key,
        record.serialize().toString('base64')
      );
    } catch (error) {
      logger.error(`Failed to store signed prekey ${id}:`, error);
      throw error;
    }
  }
  
  /**
   * Session Management
   */
  async loadSession(
    address: ProtocolAddress
  ): Promise<SessionRecord | undefined> {
    try {
      const key = `${this.storagePrefix}session_${address.toString()}`;
      const saved = await AsyncStorage.getItem(key);
      
      if (!saved) {
        return undefined;
      }
      
      return SessionRecord.deserialize(Buffer.from(saved, 'base64'));
    } catch (error) {
      logger.error(`Failed to load session for ${address.toString()}:`, error);
      throw error;
    }
  }
  
  async storeSession(
    address: ProtocolAddress,
    record: SessionRecord
  ): Promise<void> {
    try {
      const key = `${this.storagePrefix}session_${address.toString()}`;
      await AsyncStorage.setItem(
        key,
        record.serialize().toString('base64')
      );
      
      // Track session for analytics
      await this.trackSessionMetrics(address);
    } catch (error) {
      logger.error(`Failed to store session for ${address.toString()}:`, error);
      throw error;
    }
  }
  
  /**
   * Sender Key Storage for Groups
   */
  async loadSenderKey(
    sender: ProtocolAddress,
    distributionId: Buffer
  ): Promise<SenderKeyRecord | undefined> {
    try {
      const key = `${this.storagePrefix}sender_key_${sender.toString()}_${distributionId.toString('hex')}`;
      const saved = await AsyncStorage.getItem(key);
      
      if (!saved) {
        return undefined;
      }
      
      return SenderKeyRecord.deserialize(Buffer.from(saved, 'base64'));
    } catch (error) {
      logger.error('Failed to load sender key:', error);
      throw error;
    }
  }
  
  async storeSenderKey(
    sender: ProtocolAddress,
    distributionId: Buffer,
    record: SenderKeyRecord
  ): Promise<void> {
    try {
      const key = `${this.storagePrefix}sender_key_${sender.toString()}_${distributionId.toString('hex')}`;
      await AsyncStorage.setItem(
        key,
        record.serialize().toString('base64')
      );
    } catch (error) {
      logger.error('Failed to store sender key:', error);
      throw error;
    }
  }
  
  /**
   * Utility Methods
   */
  async hasIdentity(): Promise<boolean> {
    try {
      await this.getIdentityKeyPair();
      await this.getLocalRegistrationId();
      return true;
    } catch {
      return false;
    }
  }
  
  async hasSession(userId: string, deviceId: number): Promise<boolean> {
    try {
      const address = new ProtocolAddress(userId, deviceId);
      const session = await this.loadSession(address);
      return session !== undefined;
    } catch {
      return false;
    }
  }
  
  async markSessionEstablished(userId: string, deviceId: number): Promise<void> {
    try {
      const key = `${this.storagePrefix}session_established_${userId}_${deviceId}`;
      await AsyncStorage.setItem(key, Date.now().toString());
    } catch (error) {
      logger.error('Failed to mark session established:', error);
    }
  }
  
  async getPreKeyCount(): Promise<number> {
    try {
      const keys = await AsyncStorage.getAllKeys();
      const preKeyKeys = keys.filter(k => k.startsWith(`${this.storagePrefix}prekey_`));
      return preKeyKeys.length;
    } catch (error) {
      logger.error('Failed to get prekey count:', error);
      return 0;
    }
  }
  
  async getSignedPreKeyAge(): Promise<number> {
    try {
      const keys = await AsyncStorage.getAllKeys();
      const signedPreKeyKeys = keys.filter(k => k.startsWith(`${this.storagePrefix}signed_prekey_`));
      
      if (signedPreKeyKeys.length === 0) {
        return 0;
      }
      
      // Get the most recent signed prekey
      const latestKey = signedPreKeyKeys.sort().pop();
      if (!latestKey) return 0;
      
      const record = await AsyncStorage.getItem(latestKey);
      if (!record) return 0;
      
      const signedPreKey = SignedPreKeyRecord.deserialize(Buffer.from(record, 'base64'));
      return Date.now() - signedPreKey.timestamp();
    } catch (error) {
      logger.error('Failed to get signed prekey age:', error);
      return 0;
    }
  }
  
  async getAllSessions(): Promise<Map<string, SessionRecord>> {
    try {
      const keys = await AsyncStorage.getAllKeys();
      const sessionKeys = keys.filter(k => k.startsWith(`${this.storagePrefix}session_`));
      
      const sessions = new Map<string, SessionRecord>();
      
      for (const key of sessionKeys) {
        const record = await AsyncStorage.getItem(key);
        if (record) {
          const addressStr = key.replace(`${this.storagePrefix}session_`, '');
          sessions.set(addressStr, SessionRecord.deserialize(Buffer.from(record, 'base64')));
        }
      }
      
      return sessions;
    } catch (error) {
      logger.error('Failed to get all sessions:', error);
      return new Map();
    }
  }
  
  async clearAllSessions(): Promise<void> {
    try {
      const keys = await AsyncStorage.getAllKeys();
      const sessionKeys = keys.filter(k => k.startsWith(`${this.storagePrefix}session_`));
      
      if (sessionKeys.length > 0) {
        await AsyncStorage.multiRemove(sessionKeys);
        logger.info(`Cleared ${sessionKeys.length} sessions`);
      }
    } catch (error) {
      logger.error('Failed to clear sessions:', error);
      throw error;
    }
  }
  
  async clearSessionsOlderThan(timestamp: number): Promise<void> {
    try {
      const sessions = await this.getAllSessions();
      const keysToRemove: string[] = [];
      
      for (const [addressStr] of sessions) {
        // Note: SessionRecord doesn't expose timestamp directly
        // In production, you'd track this separately
        const key = `${this.storagePrefix}session_established_${addressStr}`;
        const establishedTime = await AsyncStorage.getItem(key);
        
        if (establishedTime && parseInt(establishedTime) < timestamp) {
          keysToRemove.push(`${this.storagePrefix}session_${addressStr}`);
        }
      }
      
      if (keysToRemove.length > 0) {
        await AsyncStorage.multiRemove(keysToRemove);
        logger.info(`Cleared ${keysToRemove.length} old sessions`);
      }
    } catch (error) {
      logger.error('Failed to clear old sessions:', error);
    }
  }
  
  async clearIdentity(): Promise<void> {
    try {
      await Keychain.resetInternetCredentials(
        `${this.keychainService}_identity`
      );
      this.identityKeyCache = undefined;
      logger.info('Identity cleared');
    } catch (error) {
      logger.error('Failed to clear identity:', error);
      throw error;
    }
  }
  
  async clearAllPreKeys(): Promise<void> {
    try {
      const keys = await AsyncStorage.getAllKeys();
      const preKeyKeys = keys.filter(k => 
        k.startsWith(`${this.storagePrefix}prekey_`) || 
        k.startsWith(`${this.storagePrefix}signed_prekey_`)
      );
      
      if (preKeyKeys.length > 0) {
        await AsyncStorage.multiRemove(preKeyKeys);
        logger.info(`Cleared ${preKeyKeys.length} prekeys`);
      }
    } catch (error) {
      logger.error('Failed to clear prekeys:', error);
      throw error;
    }
  }
  
  private async trackSessionMetrics(address: ProtocolAddress): Promise<void> {
    try {
      // Track session establishment for monitoring
      const metricsKey = `${this.storagePrefix}metrics_sessions`;
      const existingMetrics = await AsyncStorage.getItem(metricsKey);
      const metrics = existingMetrics ? JSON.parse(existingMetrics) : { count: 0, lastUpdated: null };
      
      metrics.count++;
      metrics.lastUpdated = Date.now();
      
      await AsyncStorage.setItem(metricsKey, JSON.stringify(metrics));
    } catch (error) {
      // Don't throw - metrics are non-critical
      logger.debug('Failed to track session metrics:', error);
    }
  }
}