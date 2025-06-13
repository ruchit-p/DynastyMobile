import {
  PrivateKey,
  IdentityKeyPair,
  PreKeyRecord,
  SignedPreKeyRecord,
} from '@signalapp/libsignal-client';
import { SignalProtocolStore } from '../stores/SignalProtocolStore';
import { logger } from '../../../LoggingService';

/**
 * Service responsible for generating and managing Signal Protocol keys
 * Follows Dynasty's security patterns
 */
export class KeyGenerationService {
  constructor(private store: SignalProtocolStore) {}
  
  /**
   * Initialize a new identity for this device
   * This should only be called once per device installation
   */
  async initializeIdentity(): Promise<{
    identityKeyPair: IdentityKeyPair;
    registrationId: number;
  }> {
    try {
      logger.info('Initializing Signal Protocol identity');
      
      // Generate new identity key pair
      const identityKeyPair = IdentityKeyPair.generate();
      
      // Generate unique registration ID for this device
      const registrationId = this.generateRegistrationId();
      
      // Store securely
      await this.store.storeIdentityKeyPair(identityKeyPair);
      await this.store.storeLocalRegistrationId(registrationId);
      
      logger.info(`Identity initialized with registration ID: ${registrationId}`);
      
      return { identityKeyPair, registrationId };
    } catch (error) {
      logger.error('Failed to initialize identity:', error);
      throw error;
    }
  }
  
  /**
   * Generate a batch of one-time prekeys
   * @param start Starting key ID
   * @param count Number of keys to generate (max 100)
   */
  async generatePreKeys(start: number, count: number): Promise<PreKeyRecord[]> {
    try {
      if (count > 100) {
        throw new Error('Cannot generate more than 100 prekeys at once');
      }
      
      logger.debug(`Generating ${count} prekeys starting from ${start}`);
      
      const preKeys: PreKeyRecord[] = [];
      
      for (let i = 0; i < count; i++) {
        const id = (start + i) % 0xFFFFFF; // Ensure ID fits in 24 bits
        const keyPair = PrivateKey.generate();
        const preKey = PreKeyRecord.new(id, keyPair.getPublicKey(), keyPair);
        
        await this.store.storePreKey(id, preKey);
        preKeys.push(preKey);
      }
      
      logger.info(`Generated and stored ${count} prekeys`);
      
      return preKeys;
    } catch (error) {
      logger.error('Failed to generate prekeys:', error);
      throw error;
    }
  }
  
  /**
   * Generate a signed prekey (rotated periodically)
   * @param identityKey Private identity key for signing
   */
  async generateSignedPreKey(
    identityKey: PrivateKey
  ): Promise<SignedPreKeyRecord> {
    try {
      // Use timestamp-based ID to ensure uniqueness
      const keyId = (Date.now() / 1000) % 0xFFFFFF; // Seconds since epoch, mod 24 bits
      const keyPair = PrivateKey.generate();
      
      // Sign the public key with our identity key
      const signature = identityKey.sign(
        keyPair.getPublicKey().serialize()
      );
      
      const signedPreKey = SignedPreKeyRecord.new(
        Math.floor(keyId),
        Date.now(),
        keyPair.getPublicKey(),
        keyPair,
        signature
      );
      
      await this.store.storeSignedPreKey(Math.floor(keyId), signedPreKey);
      
      logger.info(`Generated signed prekey with ID: ${Math.floor(keyId)}`);
      
      return signedPreKey;
    } catch (error) {
      logger.error('Failed to generate signed prekey:', error);
      throw error;
    }
  }
  
  /**
   * Generate and store initial key bundle for a new device
   * This includes identity key, signed prekey, and batch of one-time prekeys
   */
  async generateInitialKeyBundle(): Promise<{
    identityKeyPair: IdentityKeyPair;
    registrationId: number;
    signedPreKey: SignedPreKeyRecord;
    preKeys: PreKeyRecord[];
  }> {
    try {
      logger.info('Generating initial key bundle');
      
      // Initialize identity if not already done
      let identityKeyPair: IdentityKeyPair;
      let registrationId: number;
      
      const hasIdentity = await this.store.hasIdentity();
      
      if (hasIdentity) {
        identityKeyPair = await this.store.getIdentityKeyPair();
        registrationId = await this.store.getLocalRegistrationId();
        logger.debug('Using existing identity');
      } else {
        const identity = await this.initializeIdentity();
        identityKeyPair = identity.identityKeyPair;
        registrationId = identity.registrationId;
      }
      
      // Generate signed prekey
      const signedPreKey = await this.generateSignedPreKey(
        identityKeyPair.privateKey
      );
      
      // Generate initial batch of one-time prekeys
      const preKeys = await this.generatePreKeys(1, 100);
      
      logger.info('Initial key bundle generated successfully');
      
      return {
        identityKeyPair,
        registrationId,
        signedPreKey,
        preKeys
      };
    } catch (error) {
      logger.error('Failed to generate initial key bundle:', error);
      throw error;
    }
  }
  
  /**
   * Rotate signed prekey (should be done every 48 hours)
   */
  async rotateSignedPreKey(): Promise<SignedPreKeyRecord> {
    try {
      logger.info('Rotating signed prekey');
      
      const identityKeyPair = await this.store.getIdentityKeyPair();
      const newSignedPreKey = await this.generateSignedPreKey(
        identityKeyPair.privateKey
      );
      
      // TODO: Keep old signed prekey for a grace period
      // to handle messages encrypted with the old key
      
      logger.info('Signed prekey rotated successfully');
      
      return newSignedPreKey;
    } catch (error) {
      logger.error('Failed to rotate signed prekey:', error);
      throw error;
    }
  }
  
  /**
   * Replenish one-time prekeys when running low
   * @param threshold Minimum number of keys before replenishing (default: 10)
   */
  async replenishPreKeys(threshold: number = 10): Promise<PreKeyRecord[]> {
    try {
      const currentCount = await this.store.getPreKeyCount();
      
      if (currentCount >= threshold) {
        logger.debug(`Prekey count (${currentCount}) above threshold (${threshold})`);
        return [];
      }
      
      logger.info(`Replenishing prekeys (current: ${currentCount}, threshold: ${threshold})`);
      
      // Generate new batch starting after existing keys
      const startId = currentCount + 1;
      const countToGenerate = 100 - currentCount;
      
      const newPreKeys = await this.generatePreKeys(startId, countToGenerate);
      
      logger.info(`Replenished ${countToGenerate} prekeys`);
      
      return newPreKeys;
    } catch (error) {
      logger.error('Failed to replenish prekeys:', error);
      throw error;
    }
  }
  
  /**
   * Check if signed prekey needs rotation
   * @param maxAgeHours Maximum age in hours (default: 48)
   */
  async shouldRotateSignedPreKey(maxAgeHours: number = 48): Promise<boolean> {
    try {
      const age = await this.store.getSignedPreKeyAge();
      const maxAgeMs = maxAgeHours * 60 * 60 * 1000;
      
      return age > maxAgeMs;
    } catch (error) {
      logger.error('Failed to check signed prekey age:', error);
      return false;
    }
  }
  
  /**
   * Get statistics about current key state
   */
  async getKeyStatistics(): Promise<{
    preKeysRemaining: number;
    signedPreKeyAge: number;
    needsPreKeyReplenishment: boolean;
    needsSignedPreKeyRotation: boolean;
  }> {
    try {
      const preKeysRemaining = await this.store.getPreKeyCount();
      const signedPreKeyAge = await this.store.getSignedPreKeyAge();
      
      return {
        preKeysRemaining,
        signedPreKeyAge,
        needsPreKeyReplenishment: preKeysRemaining < 10,
        needsSignedPreKeyRotation: await this.shouldRotateSignedPreKey()
      };
    } catch (error) {
      logger.error('Failed to get key statistics:', error);
      return {
        preKeysRemaining: 0,
        signedPreKeyAge: 0,
        needsPreKeyReplenishment: true,
        needsSignedPreKeyRotation: true
      };
    }
  }
  
  /**
   * Generate a unique registration ID for this device
   * Must be unique per device installation
   */
  private generateRegistrationId(): number {
    // Generate a random 24-bit integer (libsignal requirement)
    // Using crypto random for security
    const bytes = new Uint8Array(3);
    crypto.getRandomValues(bytes);
    
    // Convert to number and ensure positive
    const id = (bytes[0] << 16) | (bytes[1] << 8) | bytes[2];
    
    // Ensure it's positive and fits in 24 bits
    return id & 0xFFFFFF;
  }
}