import VaultKeyManager from '../../src/services/encryption/VaultKeyManager';
import VaultCryptoService from '../../src/services/encryption/VaultCryptoService';
import * as SecureStore from 'expo-secure-store';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

// Mock dependencies
jest.mock('expo-secure-store');
jest.mock('@react-native-async-storage/async-storage');
jest.mock('../../src/services/encryption/VaultCryptoService');
jest.mock('../../src/services/LoggingService', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn()
  }
}));

const mockSecureStore = SecureStore as jest.Mocked<typeof SecureStore>;
const mockAsyncStorage = AsyncStorage as jest.Mocked<typeof AsyncStorage>;
const mockCryptoService = VaultCryptoService as jest.Mocked<typeof VaultCryptoService>;

describe('VaultKeyManager', () => {
  let keyManager: VaultKeyManager;
  const testUserId = 'test-user-123';
  const testMasterKey = new Uint8Array(32);
  
  beforeEach(() => {
    keyManager = VaultKeyManager.getInstance();
    jest.clearAllMocks();
    
    // Fill test key with pattern
    testMasterKey.fill(42);
    
    // Mock VaultCryptoService methods
    mockCryptoService.getInstance = jest.fn().mockReturnValue({
      generateSalt: jest.fn().mockReturnValue(new Uint8Array(32)),
      deriveVaultMasterKey: jest.fn().mockResolvedValue(testMasterKey),
      generateKeyPair: jest.fn().mockReturnValue({
        publicKey: new Uint8Array([1, 2, 3, 4]),
        privateKey: new Uint8Array([5, 6, 7, 8])
      }),
      generateSecureFileId: jest.fn().mockReturnValue('secure-file-id-123')
    });
  });

  describe('Master Key Storage', () => {
    it('should store vault master key with biometric protection', async () => {
      const keyBase64 = Buffer.from(testMasterKey).toString('base64');
      
      mockSecureStore.setItemAsync.mockResolvedValue();
      mockAsyncStorage.setItem.mockResolvedValue();
      
      const keyInfo = await keyManager.storeVaultMasterKey(testUserId, testMasterKey);
      
      expect(mockSecureStore.setItemAsync).toHaveBeenCalledWith(
        `vault_master_key_${testUserId}`,
        keyBase64,
        expect.objectContaining({
          keychainService: 'com.dynasty.vault.keys',
          requireAuthentication: true,
          authenticationPrompt: 'Authenticate to access your Dynasty vault'
        })
      );
      
      expect(keyInfo.isActive).toBe(true);
      expect(keyInfo.version).toBe('1.0');
      expect(keyInfo.keyId).toBeDefined();
    });

    it('should configure iOS-specific security options', async () => {
      Platform.OS = 'ios';
      
      mockSecureStore.setItemAsync.mockResolvedValue();
      mockAsyncStorage.setItem.mockResolvedValue();
      
      await keyManager.storeVaultMasterKey(testUserId, testMasterKey);
      
      expect(mockSecureStore.setItemAsync).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(String),
        expect.objectContaining({
          accessGroup: 'com.mydynastyapp.dynasty.vault',
          touchID: true
        })
      );
    });

    it('should configure Android-specific security options', async () => {
      Platform.OS = 'android';
      
      mockSecureStore.setItemAsync.mockResolvedValue();
      mockAsyncStorage.setItem.mockResolvedValue();
      
      await keyManager.storeVaultMasterKey(testUserId, testMasterKey);
      
      expect(mockSecureStore.setItemAsync).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(String),
        expect.objectContaining({
          encrypt: true
        })
      );
    });
  });

  describe('Master Key Retrieval', () => {
    it('should retrieve vault master key with authentication', async () => {
      const keyBase64 = Buffer.from(testMasterKey).toString('base64');
      
      mockSecureStore.getItemAsync.mockResolvedValue(keyBase64);
      
      const retrievedKey = await keyManager.retrieveVaultMasterKey(testUserId);
      
      expect(retrievedKey).toEqual(testMasterKey);
      expect(mockSecureStore.getItemAsync).toHaveBeenCalledWith(
        `vault_master_key_${testUserId}`,
        expect.objectContaining({
          keychainService: 'com.dynasty.vault.keys',
          requireAuthentication: true,
          authenticationPrompt: 'Authenticate to unlock your Dynasty vault'
        })
      );
    });

    it('should throw error when key not found', async () => {
      mockSecureStore.getItemAsync.mockResolvedValue(null);
      
      await expect(keyManager.retrieveVaultMasterKey(testUserId))
        .rejects.toThrow('Vault master key not found');
    });

    it('should handle authentication cancellation', async () => {
      const error = new Error('User cancelled authentication');
      error.code = 'UserCancel';
      mockSecureStore.getItemAsync.mockRejectedValue(error);
      
      await expect(keyManager.retrieveVaultMasterKey(testUserId))
        .rejects.toThrow('Authentication cancelled by user');
    });

    it('should use custom prompt message', async () => {
      const customPrompt = 'Custom authentication message';
      const keyBase64 = Buffer.from(testMasterKey).toString('base64');
      
      mockSecureStore.getItemAsync.mockResolvedValue(keyBase64);
      
      await keyManager.retrieveVaultMasterKey(testUserId, {
        promptMessage: customPrompt
      });
      
      expect(mockSecureStore.getItemAsync).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          authenticationPrompt: customPrompt
        })
      );
    });
  });

  describe('Salt Storage', () => {
    it('should store and retrieve vault salt', async () => {
      const testSalt = new Uint8Array(32);
      testSalt.fill(123);
      const saltBase64 = Buffer.from(testSalt).toString('base64');
      
      mockAsyncStorage.setItem.mockResolvedValue();
      mockAsyncStorage.getItem.mockResolvedValue(saltBase64);
      
      // Store salt
      await keyManager.storeVaultSalt(testUserId, testSalt);
      
      expect(mockAsyncStorage.setItem).toHaveBeenCalledWith(
        `vault_salt_${testUserId}`,
        saltBase64
      );
      
      // Retrieve salt
      const retrievedSalt = await keyManager.retrieveVaultSalt(testUserId);
      
      expect(retrievedSalt).toEqual(testSalt);
      expect(mockAsyncStorage.getItem).toHaveBeenCalledWith(`vault_salt_${testUserId}`);
    });

    it('should return null when salt not found', async () => {
      mockAsyncStorage.getItem.mockResolvedValue(null);
      
      const salt = await keyManager.retrieveVaultSalt(testUserId);
      
      expect(salt).toBeNull();
    });
  });

  describe('Family Key Pair Management', () => {
    it('should generate and store family keypair', async () => {
      const mockKeyPair = {
        publicKey: new Uint8Array([1, 2, 3, 4]),
        privateKey: new Uint8Array([5, 6, 7, 8])
      };
      
      mockCryptoService.getInstance().generateKeyPair.mockReturnValue(mockKeyPair);
      mockSecureStore.setItemAsync.mockResolvedValue();
      mockAsyncStorage.setItem.mockResolvedValue();
      
      const familyKeyPair = await keyManager.generateFamilyKeyPair(testUserId);
      
      expect(familyKeyPair.publicKey).toBe(Buffer.from(mockKeyPair.publicKey).toString('base64'));
      expect(familyKeyPair.privateKey).toBe(Buffer.from(mockKeyPair.privateKey).toString('base64'));
      expect(familyKeyPair.keyId).toBeDefined();
      expect(familyKeyPair.createdAt).toBeGreaterThan(0);
      
      // Check private key stored securely
      expect(mockSecureStore.setItemAsync).toHaveBeenCalledWith(
        `family_keypair_private_${testUserId}`,
        familyKeyPair.privateKey,
        expect.objectContaining({
          keychainService: 'com.dynasty.vault.family',
          requireAuthentication: true
        })
      );
      
      // Check public key stored in AsyncStorage
      expect(mockAsyncStorage.setItem).toHaveBeenCalledWith(
        `family_keypair_public_${testUserId}`,
        expect.stringContaining(familyKeyPair.publicKey)
      );
    });

    it('should retrieve family keypair', async () => {
      const mockPublicKeyData = {
        publicKey: 'public-key-base64',
        keyId: 'key-id-123',
        createdAt: Date.now()
      };
      const mockPrivateKey = 'private-key-base64';
      
      mockAsyncStorage.getItem.mockResolvedValue(JSON.stringify(mockPublicKeyData));
      mockSecureStore.getItemAsync.mockResolvedValue(mockPrivateKey);
      
      const familyKeyPair = await keyManager.retrieveFamilyKeyPair(testUserId);
      
      expect(familyKeyPair.publicKey).toBe(mockPublicKeyData.publicKey);
      expect(familyKeyPair.privateKey).toBe(mockPrivateKey);
      expect(familyKeyPair.keyId).toBe(mockPublicKeyData.keyId);
      expect(familyKeyPair.createdAt).toBe(mockPublicKeyData.createdAt);
    });

    it('should throw error when family keypair not found', async () => {
      mockAsyncStorage.getItem.mockResolvedValue(null);
      
      await expect(keyManager.retrieveFamilyKeyPair(testUserId))
        .rejects.toThrow('Family public key not found');
    });

    it('should throw error when private key not found', async () => {
      const mockPublicKeyData = {
        publicKey: 'public-key-base64',
        keyId: 'key-id-123',
        createdAt: Date.now()
      };
      
      mockAsyncStorage.getItem.mockResolvedValue(JSON.stringify(mockPublicKeyData));
      mockSecureStore.getItemAsync.mockResolvedValue(null);
      
      await expect(keyManager.retrieveFamilyKeyPair(testUserId))
        .rejects.toThrow('Family private key not found');
    });
  });

  describe('Vault Configuration', () => {
    it('should store and retrieve vault configuration', async () => {
      const testConfig = {
        vaultId: 'vault-123',
        ownerId: testUserId,
        encryptionVersion: '1.0',
        keyRotationEnabled: true,
        lastRotation: Date.now(),
        nextRotation: Date.now() + 90 * 24 * 60 * 60 * 1000,
        familyMode: false,
        memberCount: 1
      };
      
      mockAsyncStorage.setItem.mockResolvedValue();
      mockAsyncStorage.getItem.mockResolvedValue(JSON.stringify(testConfig));
      
      // Store configuration
      await keyManager.storeVaultConfiguration(testUserId, testConfig);
      
      expect(mockAsyncStorage.setItem).toHaveBeenCalledWith(
        `vault_config_${testUserId}`,
        JSON.stringify(testConfig)
      );
      
      // Retrieve configuration
      const retrievedConfig = await keyManager.retrieveVaultConfiguration(testUserId);
      
      expect(retrievedConfig).toEqual(testConfig);
    });

    it('should return null when configuration not found', async () => {
      mockAsyncStorage.getItem.mockResolvedValue(null);
      
      const config = await keyManager.retrieveVaultConfiguration(testUserId);
      
      expect(config).toBeNull();
    });
  });

  describe('Key Rotation', () => {
    it('should rotate vault master key', async () => {
      const newPassword = 'new-password-123';
      const currentKeyInfo = {
        keyId: 'old-key-id',
        createdAt: Date.now() - 1000,
        isActive: true,
        version: '1.0'
      };
      
      const newSalt = new Uint8Array(32);
      newSalt.fill(200);
      const newMasterKey = new Uint8Array(32);
      newMasterKey.fill(100);
      
      // Mock existing key metadata
      mockAsyncStorage.getItem
        .mockResolvedValueOnce(JSON.stringify(currentKeyInfo)) // getKeyMetadata
        .mockResolvedValue(undefined); // other calls
      
      mockAsyncStorage.setItem.mockResolvedValue();
      mockSecureStore.setItemAsync.mockResolvedValue();
      
      // Mock crypto service
      mockCryptoService.getInstance().generateSalt.mockReturnValue(newSalt);
      mockCryptoService.getInstance().deriveVaultMasterKey.mockResolvedValue(newMasterKey);
      
      const newKeyInfo = await keyManager.rotateVaultMasterKey(testUserId, newPassword, 'manual');
      
      expect(newKeyInfo.isActive).toBe(true);
      expect(newKeyInfo.rotatedAt).toBeDefined();
      
      // Check new key was stored
      expect(mockSecureStore.setItemAsync).toHaveBeenCalled();
      
      // Check salt was updated
      expect(mockAsyncStorage.setItem).toHaveBeenCalledWith(
        `vault_salt_${testUserId}`,
        Buffer.from(newSalt).toString('base64')
      );
    });
  });

  describe('Key Existence Check', () => {
    it('should check if vault keys exist', async () => {
      mockSecureStore.getItemAsync.mockResolvedValue('some-key-data');
      
      const hasKeys = await keyManager.hasVaultKeys(testUserId);
      
      expect(hasKeys).toBe(true);
      expect(mockSecureStore.getItemAsync).toHaveBeenCalledWith(
        `vault_master_key_${testUserId}`
      );
    });

    it('should return false when keys do not exist', async () => {
      mockSecureStore.getItemAsync.mockResolvedValue(null);
      
      const hasKeys = await keyManager.hasVaultKeys(testUserId);
      
      expect(hasKeys).toBe(false);
    });

    it('should handle errors gracefully in key existence check', async () => {
      mockSecureStore.getItemAsync.mockRejectedValue(new Error('Access denied'));
      
      const hasKeys = await keyManager.hasVaultKeys(testUserId);
      
      expect(hasKeys).toBe(false);
    });
  });

  describe('Key Deletion', () => {
    it('should delete all vault keys', async () => {
      mockSecureStore.deleteItemAsync.mockResolvedValue();
      mockAsyncStorage.removeItem.mockResolvedValue();
      
      await keyManager.deleteAllVaultKeys(testUserId);
      
      // Check master key deleted
      expect(mockSecureStore.deleteItemAsync).toHaveBeenCalledWith(
        `vault_master_key_${testUserId}`
      );
      
      // Check salt deleted
      expect(mockAsyncStorage.removeItem).toHaveBeenCalledWith(
        `vault_salt_${testUserId}`
      );
      
      // Check family keypair deleted
      expect(mockSecureStore.deleteItemAsync).toHaveBeenCalledWith(
        `family_keypair_private_${testUserId}`
      );
      expect(mockAsyncStorage.removeItem).toHaveBeenCalledWith(
        `family_keypair_public_${testUserId}`
      );
      
      // Check configuration deleted
      expect(mockAsyncStorage.removeItem).toHaveBeenCalledWith(
        `vault_config_${testUserId}`
      );
    });
  });

  describe('Error Handling', () => {
    it('should handle SecureStore errors gracefully', async () => {
      const error = new Error('SecureStore error');
      mockSecureStore.setItemAsync.mockRejectedValue(error);
      
      await expect(keyManager.storeVaultMasterKey(testUserId, testMasterKey))
        .rejects.toThrow('Failed to store vault master key in secure storage');
    });

    it('should handle AsyncStorage errors gracefully', async () => {
      const testSalt = new Uint8Array(32);
      const error = new Error('AsyncStorage error');
      mockAsyncStorage.setItem.mockRejectedValue(error);
      
      await expect(keyManager.storeVaultSalt(testUserId, testSalt))
        .rejects.toThrow('Failed to store vault salt');
    });

    it('should handle JSON parsing errors', async () => {
      mockAsyncStorage.getItem.mockResolvedValue('invalid-json');
      
      await expect(keyManager.retrieveVaultConfiguration(testUserId))
        .rejects.toThrow('Failed to retrieve vault configuration');
    });
  });

  describe('Key Archive Management', () => {
    it('should archive old keys during rotation', async () => {
      const currentKeyInfo = {
        keyId: 'old-key-id',
        createdAt: Date.now() - 1000,
        isActive: true,
        version: '1.0'
      };
      
      // Mock the private methods would be called
      mockAsyncStorage.getItem.mockResolvedValue(JSON.stringify(currentKeyInfo));
      mockAsyncStorage.setItem.mockResolvedValue();
      mockAsyncStorage.getAllKeys.mockResolvedValue([]);
      mockSecureStore.setItemAsync.mockResolvedValue();
      
      await keyManager.rotateVaultMasterKey(testUserId, 'new-password', 'manual');
      
      // Check that archive was created (private method call)
      expect(mockAsyncStorage.setItem).toHaveBeenCalledWith(
        expect.stringMatching(/^key_archive_/),
        expect.any(String)
      );
    });
  });

  describe('Singleton Pattern', () => {
    it('should return the same instance', () => {
      const instance1 = VaultKeyManager.getInstance();
      const instance2 = VaultKeyManager.getInstance();
      
      expect(instance1).toBe(instance2);
    });
  });
});