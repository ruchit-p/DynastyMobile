import * as SecureStore from 'expo-secure-store';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import { VaultCryptoService } from './VaultCryptoService';
import { logger } from '../LoggingService';

// Constants
const VAULT_MASTER_KEY_PREFIX = 'vault_master_key_';
const VAULT_SALT_PREFIX = 'vault_salt_';
const FAMILY_KEYPAIR_PREFIX = 'family_keypair_';
const VAULT_CONFIG_PREFIX = 'vault_config_';
const KEY_ROTATION_PREFIX = 'key_rotation_';

// Key rotation settings
const KEY_ROTATION_INTERVAL_DAYS = 90; // 3 months
const KEY_HISTORY_RETENTION_COUNT = 3; // Keep 3 old keys for decryption

// Types
export interface VaultKeyInfo {
  keyId: string;
  createdAt: number;
  rotatedAt?: number;
  isActive: boolean;
  version: string;
}

export interface FamilyKeyPair {
  publicKey: string; // Base64 encoded
  privateKey: string; // Base64 encoded, hardware-protected
  keyId: string;
  createdAt: number;
}

export interface VaultConfiguration {
  vaultId: string;
  ownerId: string;
  encryptionVersion: string;
  keyRotationEnabled: boolean;
  lastRotation: number;
  nextRotation: number;
  familyMode: boolean;
  memberCount: number;
}

export interface KeyRotationHistory {
  keyId: string;
  createdAt: number;
  deprecatedAt: number;
  reason: 'rotation' | 'compromise' | 'manual';
}

export class VaultKeyManager {
  private static instance: VaultKeyManager;
  private cryptoService: VaultCryptoService;

  private constructor() {
    this.cryptoService = VaultCryptoService.getInstance();
  }

  static getInstance(): VaultKeyManager {
    if (!VaultKeyManager.instance) {
      VaultKeyManager.instance = new VaultKeyManager();
    }
    return VaultKeyManager.instance;
  }

  /**
   * Store vault master key in hardware-backed secure storage
   * Requires biometric authentication on access
   */
  async storeVaultMasterKey(
    userId: string, 
    masterKey: Uint8Array,
    options: {
      requireBiometric?: boolean;
      keyRotation?: boolean;
    } = {}
  ): Promise<VaultKeyInfo> {
    try {
      const { requireBiometric = true, keyRotation = false } = options;
      const keyId = this.generateKeyId();
      const keyAlias = `${VAULT_MASTER_KEY_PREFIX}${userId}`;
      const keyBase64 = Buffer.from(masterKey).toString('base64');

      // Configure security options
      const secureStoreOptions: SecureStore.SecureStoreOptions = {
        keychainService: 'com.dynasty.vault.keys',
        requireAuthentication: requireBiometric,
        authenticationPrompt: 'Authenticate to access your Dynasty vault',
      };

      // Add platform-specific security enhancements
      if (Platform.OS === 'ios') {
        secureStoreOptions.accessGroup = 'com.mydynastyapp.dynasty.vault';
      }

      await SecureStore.setItemAsync(keyAlias, keyBase64, secureStoreOptions);

      // Store key metadata
      const keyInfo: VaultKeyInfo = {
        keyId,
        createdAt: Date.now(),
        isActive: true,
        version: '1.0'
      };

      if (keyRotation) {
        keyInfo.rotatedAt = Date.now();
      }

      await this.storeKeyMetadata(userId, keyInfo);

      // Store key rotation schedule if enabled
      await this.scheduleKeyRotation(userId);

      logger.info(`VaultKeyManager: Master key stored for user ${userId} with keyId ${keyId}`);
      return keyInfo;
    } catch (error) {
      logger.error('VaultKeyManager: Failed to store vault master key:', error);
      throw new Error('Failed to store vault master key in secure storage');
    }
  }

  /**
   * Retrieve vault master key from hardware-backed secure storage
   * Triggers biometric authentication
   */
  async retrieveVaultMasterKey(
    userId: string,
    options: {
      promptMessage?: string;
      fallbackToPasscode?: boolean;
    } = {}
  ): Promise<Uint8Array> {
    try {
      const { 
        promptMessage = 'Authenticate to unlock your Dynasty vault',
        fallbackToPasscode = true 
      } = options;

      const keyAlias = `${VAULT_MASTER_KEY_PREFIX}${userId}`;
      
      const secureStoreOptions: SecureStore.SecureStoreOptions = {
        keychainService: 'com.dynasty.vault.keys',
        requireAuthentication: true,
        authenticationPrompt: promptMessage,
      };

      // Platform-specific options
      if (Platform.OS === 'ios') {
        secureStoreOptions.accessGroup = 'com.mydynastyapp.dynasty.vault';
      }

      const keyBase64 = await SecureStore.getItemAsync(keyAlias, secureStoreOptions);
      
      if (!keyBase64) {
        throw new Error('Vault master key not found');
      }

      // Check if key rotation is needed
      await this.checkAndPerformKeyRotation(userId);

      logger.info(`VaultKeyManager: Master key retrieved for user ${userId}`);
      return new Uint8Array(Buffer.from(keyBase64, 'base64'));
    } catch (error) {
      if (error.code === 'UserCancel' || error.message.includes('cancel')) {
        throw new Error('Authentication cancelled by user');
      }
      
      logger.error('VaultKeyManager: Failed to retrieve vault master key:', error);
      throw new Error('Failed to retrieve vault master key from secure storage');
    }
  }

  /**
   * Store vault salt (not sensitive, no biometric required)
   */
  async storeVaultSalt(userId: string, salt: Uint8Array): Promise<void> {
    try {
      const saltAlias = `${VAULT_SALT_PREFIX}${userId}`;
      const saltBase64 = Buffer.from(salt).toString('base64');
      
      await AsyncStorage.setItem(saltAlias, saltBase64);
      logger.info(`VaultKeyManager: Salt stored for user ${userId}`);
    } catch (error) {
      logger.error('VaultKeyManager: Failed to store vault salt:', error);
      throw new Error('Failed to store vault salt');
    }
  }

  /**
   * Retrieve vault salt
   */
  async retrieveVaultSalt(userId: string): Promise<Uint8Array | null> {
    try {
      const saltAlias = `${VAULT_SALT_PREFIX}${userId}`;
      const saltBase64 = await AsyncStorage.getItem(saltAlias);
      
      if (!saltBase64) {
        return null;
      }
      
      return new Uint8Array(Buffer.from(saltBase64, 'base64'));
    } catch (error) {
      logger.error('VaultKeyManager: Failed to retrieve vault salt:', error);
      throw new Error('Failed to retrieve vault salt');
    }
  }

  /**
   * Generate and store family keypair for vault sharing
   */
  async generateFamilyKeyPair(userId: string): Promise<FamilyKeyPair> {
    try {
      const keyPair = this.cryptoService.generateKeyPair();
      const keyId = this.generateKeyId();
      
      const familyKeyPair: FamilyKeyPair = {
        publicKey: Buffer.from(keyPair.publicKey).toString('base64'),
        privateKey: Buffer.from(keyPair.privateKey).toString('base64'),
        keyId,
        createdAt: Date.now()
      };

      // Store private key in secure storage with biometric protection
      const privateKeyAlias = `${FAMILY_KEYPAIR_PREFIX}private_${userId}`;
      await SecureStore.setItemAsync(
        privateKeyAlias,
        familyKeyPair.privateKey,
        {
          keychainService: 'com.dynasty.vault.family',
          requireAuthentication: true,
          authenticationPrompt: 'Authenticate to access family sharing keys'
        }
      );

      // Store public key and metadata in regular storage (not sensitive)
      const publicKeyData = {
        publicKey: familyKeyPair.publicKey,
        keyId,
        createdAt: familyKeyPair.createdAt
      };
      
      const publicKeyAlias = `${FAMILY_KEYPAIR_PREFIX}public_${userId}`;
      await AsyncStorage.setItem(publicKeyAlias, JSON.stringify(publicKeyData));

      logger.info(`VaultKeyManager: Family keypair generated for user ${userId}`);
      return familyKeyPair;
    } catch (error) {
      logger.error('VaultKeyManager: Failed to generate family keypair:', error);
      throw new Error('Failed to generate family keypair');
    }
  }

  /**
   * Retrieve family keypair
   */
  async retrieveFamilyKeyPair(userId: string): Promise<FamilyKeyPair> {
    try {
      // Get public key data
      const publicKeyAlias = `${FAMILY_KEYPAIR_PREFIX}public_${userId}`;
      const publicKeyDataStr = await AsyncStorage.getItem(publicKeyAlias);
      
      if (!publicKeyDataStr) {
        throw new Error('Family public key not found');
      }
      
      const publicKeyData = JSON.parse(publicKeyDataStr);

      // Get private key from secure storage
      const privateKeyAlias = `${FAMILY_KEYPAIR_PREFIX}private_${userId}`;
      const privateKey = await SecureStore.getItemAsync(
        privateKeyAlias,
        {
          keychainService: 'com.dynasty.vault.family',
          requireAuthentication: true,
          authenticationPrompt: 'Authenticate to access family sharing keys'
        }
      );

      if (!privateKey) {
        throw new Error('Family private key not found');
      }

      return {
        publicKey: publicKeyData.publicKey,
        privateKey,
        keyId: publicKeyData.keyId,
        createdAt: publicKeyData.createdAt
      };
    } catch (error) {
      logger.error('VaultKeyManager: Failed to retrieve family keypair:', error);
      throw new Error('Failed to retrieve family keypair');
    }
  }

  /**
   * Store vault configuration
   */
  async storeVaultConfiguration(
    userId: string, 
    config: VaultConfiguration
  ): Promise<void> {
    try {
      const configAlias = `${VAULT_CONFIG_PREFIX}${userId}`;
      await AsyncStorage.setItem(configAlias, JSON.stringify(config));
      
      logger.info(`VaultKeyManager: Vault configuration stored for user ${userId}`);
    } catch (error) {
      logger.error('VaultKeyManager: Failed to store vault configuration:', error);
      throw new Error('Failed to store vault configuration');
    }
  }

  /**
   * Retrieve vault configuration
   */
  async retrieveVaultConfiguration(userId: string): Promise<VaultConfiguration | null> {
    try {
      const configAlias = `${VAULT_CONFIG_PREFIX}${userId}`;
      const configStr = await AsyncStorage.getItem(configAlias);
      
      if (!configStr) {
        return null;
      }
      
      return JSON.parse(configStr);
    } catch (error) {
      logger.error('VaultKeyManager: Failed to retrieve vault configuration:', error);
      throw new Error('Failed to retrieve vault configuration');
    }
  }

  /**
   * Perform key rotation
   */
  async rotateVaultMasterKey(
    userId: string, 
    newPassword: string,
    reason: 'scheduled' | 'compromise' | 'manual' = 'scheduled'
  ): Promise<VaultKeyInfo> {
    try {
      logger.info(`VaultKeyManager: Starting key rotation for user ${userId}, reason: ${reason}`);
      
      // Get current key info
      const currentKeyInfo = await this.getKeyMetadata(userId);
      
      // Generate new salt and derive new key
      const newSalt = this.cryptoService.generateSalt();
      const newMasterKey = await this.cryptoService.deriveVaultMasterKey(newPassword, newSalt);
      
      // Store new key
      const newKeyInfo = await this.storeVaultMasterKey(userId, newMasterKey, {
        requireBiometric: true,
        keyRotation: true
      });
      
      // Store new salt
      await this.storeVaultSalt(userId, newSalt);
      
      // Archive old key info
      if (currentKeyInfo) {
        await this.archiveOldKey(userId, currentKeyInfo, reason);
      }
      
      // Update vault configuration
      const config = await this.retrieveVaultConfiguration(userId);
      if (config) {
        config.lastRotation = Date.now();
        config.nextRotation = Date.now() + (KEY_ROTATION_INTERVAL_DAYS * 24 * 60 * 60 * 1000);
        await this.storeVaultConfiguration(userId, config);
      }
      
      logger.info(`VaultKeyManager: Key rotation completed for user ${userId}`);
      return newKeyInfo;
    } catch (error) {
      logger.error('VaultKeyManager: Failed to rotate vault master key:', error);
      throw new Error('Failed to rotate vault master key');
    }
  }

  /**
   * Check if key rotation is needed and perform if necessary
   */
  private async checkAndPerformKeyRotation(userId: string): Promise<void> {
    try {
      const config = await this.retrieveVaultConfiguration(userId);
      
      if (!config || !config.keyRotationEnabled) {
        return;
      }
      
      const now = Date.now();
      if (now >= config.nextRotation) {
        logger.info(`VaultKeyManager: Scheduled key rotation needed for user ${userId}`);
        // Note: In practice, this would trigger a user prompt for password
        // For now, we just log and schedule the next check
        config.nextRotation = now + (24 * 60 * 60 * 1000); // Check again tomorrow
        await this.storeVaultConfiguration(userId, config);
      }
    } catch (error) {
      logger.error('VaultKeyManager: Failed to check key rotation:', error);
    }
  }

  /**
   * Delete all vault keys for a user (for account deletion)
   */
  async deleteAllVaultKeys(userId: string): Promise<void> {
    try {
      // Delete master key
      const keyAlias = `${VAULT_MASTER_KEY_PREFIX}${userId}`;
      await SecureStore.deleteItemAsync(keyAlias);
      
      // Delete salt
      const saltAlias = `${VAULT_SALT_PREFIX}${userId}`;
      await AsyncStorage.removeItem(saltAlias);
      
      // Delete family keypair
      const privateKeyAlias = `${FAMILY_KEYPAIR_PREFIX}private_${userId}`;
      const publicKeyAlias = `${FAMILY_KEYPAIR_PREFIX}public_${userId}`;
      await SecureStore.deleteItemAsync(privateKeyAlias);
      await AsyncStorage.removeItem(publicKeyAlias);
      
      // Delete configuration
      const configAlias = `${VAULT_CONFIG_PREFIX}${userId}`;
      await AsyncStorage.removeItem(configAlias);
      
      // Delete key metadata and rotation history
      await this.deleteKeyMetadata(userId);
      
      logger.info(`VaultKeyManager: All vault keys deleted for user ${userId}`);
    } catch (error) {
      logger.error('VaultKeyManager: Failed to delete vault keys:', error);
      throw new Error('Failed to delete vault keys');
    }
  }

  /**
   * Check if vault keys exist for user
   */
  async hasVaultKeys(userId: string): Promise<boolean> {
    try {
      const keyAlias = `${VAULT_MASTER_KEY_PREFIX}${userId}`;
      const key = await SecureStore.getItemAsync(keyAlias);
      return key !== null;
    } catch (error) {
      logger.error('VaultKeyManager: Failed to check vault keys existence:', error);
      return false;
    }
  }

  // Private helper methods

  private generateKeyId(): string {
    return this.cryptoService.generateSecureFileId();
  }

  private async storeKeyMetadata(userId: string, keyInfo: VaultKeyInfo): Promise<void> {
    const metadataKey = `key_metadata_${userId}`;
    await AsyncStorage.setItem(metadataKey, JSON.stringify(keyInfo));
  }

  private async getKeyMetadata(userId: string): Promise<VaultKeyInfo | null> {
    try {
      const metadataKey = `key_metadata_${userId}`;
      const metadataStr = await AsyncStorage.getItem(metadataKey);
      return metadataStr ? JSON.parse(metadataStr) : null;
    } catch (error) {
      logger.error('VaultKeyManager: Failed to get key metadata:', error);
      return null;
    }
  }

  private async deleteKeyMetadata(userId: string): Promise<void> {
    const metadataKey = `key_metadata_${userId}`;
    await AsyncStorage.removeItem(metadataKey);
    
    const rotationKey = `${KEY_ROTATION_PREFIX}${userId}`;
    await AsyncStorage.removeItem(rotationKey);
  }

  private async scheduleKeyRotation(userId: string): Promise<void> {
    const nextRotation = Date.now() + (KEY_ROTATION_INTERVAL_DAYS * 24 * 60 * 60 * 1000);
    const rotationData = {
      scheduled: true,
      nextRotation,
      intervalDays: KEY_ROTATION_INTERVAL_DAYS
    };
    
    const rotationKey = `${KEY_ROTATION_PREFIX}${userId}`;
    await AsyncStorage.setItem(rotationKey, JSON.stringify(rotationData));
  }

  private async archiveOldKey(
    userId: string, 
    keyInfo: VaultKeyInfo, 
    reason: string
  ): Promise<void> {
    const archiveKey = `key_archive_${userId}_${keyInfo.keyId}`;
    const archiveData: KeyRotationHistory = {
      keyId: keyInfo.keyId,
      createdAt: keyInfo.createdAt,
      deprecatedAt: Date.now(),
      reason: reason as any
    };
    
    await AsyncStorage.setItem(archiveKey, JSON.stringify(archiveData));
    
    // Clean up old archives (keep only recent ones)
    await this.cleanupKeyArchives(userId);
  }

  private async cleanupKeyArchives(userId: string): Promise<void> {
    try {
      const allKeys = await AsyncStorage.getAllKeys();
      const archiveKeys = allKeys
        .filter(key => key.startsWith(`key_archive_${userId}_`))
        .sort()
        .slice(KEY_HISTORY_RETENTION_COUNT); // Keep only the most recent

      for (const key of archiveKeys) {
        await AsyncStorage.removeItem(key);
      }
    } catch (error) {
      logger.error('VaultKeyManager: Failed to cleanup key archives:', error);
    }
  }
}

export default VaultKeyManager.getInstance();