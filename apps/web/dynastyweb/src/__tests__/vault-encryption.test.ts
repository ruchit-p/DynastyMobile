import { WebVaultCryptoService } from '@/services/encryption/VaultCryptoService';
import { WebVaultKeyManager } from '@/services/encryption/WebVaultKeyManager';
import { WebKeyRotationService } from '@/services/encryption/WebKeyRotationService';
import { vaultService } from '@/services/VaultService';
import { TextEncoder, TextDecoder } from 'util';
import * as libsodium from 'libsodium-wrappers-sumo';

// Mock IndexedDB
require('fake-indexeddb/auto');

global.TextEncoder = TextEncoder as any;
global.TextDecoder = TextDecoder as any;

describe('Vault Encryption', () => {
  let cryptoService: WebVaultCryptoService;
  let keyManager: WebVaultKeyManager;
  let rotationService: WebKeyRotationService;

  beforeAll(async () => {
    await libsodium.ready;
  });

  beforeEach(async () => {
    cryptoService = WebVaultCryptoService.getInstance();
    keyManager = WebVaultKeyManager.getInstance();
    rotationService = WebKeyRotationService.getInstance();
    await keyManager.initialize();
    localStorage.clear();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('WebVaultCryptoService', () => {
    test('derives master key from password', async () => {
      const password = 'TestPassword123!';
      const userId = 'test-user-123';

      const masterKey = await cryptoService.deriveMasterKey(password, userId);

      expect(masterKey).toBeInstanceOf(Uint8Array);
      expect(masterKey.length).toBe(32);
      expect(libsodium.crypto_pwhash).toHaveBeenCalledWith(
        32,
        'TestPassword123!', // Password is passed as string in the actual implementation
        expect.any(Uint8Array),
        libsodium.crypto_pwhash_OPSLIMIT_INTERACTIVE,
        libsodium.crypto_pwhash_MEMLIMIT_INTERACTIVE,
        libsodium.crypto_pwhash_ALG_ARGON2ID13
      );
    });

    test('encrypts and decrypts file correctly', async () => {
      const testData = new TextEncoder().encode('Test file content for encryption');
      const testFile = new File([testData], 'test.txt', { type: 'text/plain' });
      const fileKey = cryptoService.generateFileKey();

      // Encrypt
      const encrypted = await cryptoService.encryptFileWrapper(testFile, fileKey);
      expect(encrypted.success).toBe(true);
      expect(encrypted.encryptedFile).toBeDefined();
      expect(encrypted.header).toBeDefined();
      expect(encrypted.metadata).toBeDefined();

      // Decrypt
      const decrypted = await cryptoService.decryptFileWrapper(
        encrypted.encryptedFile!,
        encrypted.header!,
        fileKey,
        encrypted.metadata!
      );

      expect(decrypted.success).toBe(true);
      expect(decrypted.encryptedFile).toBeDefined();
    });

    test('generates unique file keys', () => {
      const key1 = cryptoService.generateFileKey();
      const key2 = cryptoService.generateFileKey();

      expect(key1).toBeInstanceOf(Uint8Array);
      expect(key2).toBeInstanceOf(Uint8Array);
      expect(key1.length).toBe(32);
      expect(key2.length).toBe(32);
      expect(key1).not.toEqual(key2);
    });

    test('derives consistent file keys from master key', () => {
      const masterKey = new Uint8Array(32);
      const fileId = 'test-file-123';

      const fileKey1 = cryptoService.deriveFileKey(masterKey, fileId);
      const fileKey2 = cryptoService.deriveFileKey(masterKey, fileId);

      expect(fileKey1).toEqual(fileKey2);
    });

    test('handles large files with chunking', async () => {
      // Create 10MB test file
      const largeData = new Uint8Array(10 * 1024 * 1024);
      const largeFile = new File([largeData], 'large.bin', { type: 'application/octet-stream' });
      const fileKey = cryptoService.generateFileKey();

      const encrypted = await cryptoService.encryptFileWrapper(largeFile, fileKey);

      expect(encrypted.success).toBe(true);
      expect(encrypted.metadata?.size).toBe(largeData.length);
      expect(encrypted.metadata?.chunkCount).toBeGreaterThan(1);
    });

    test('fails decryption with wrong key', async () => {
      const testFile = new File(['test'], 'test.txt');
      const correctKey = cryptoService.generateFileKey();
      const wrongKey = cryptoService.generateFileKey();

      const encrypted = await cryptoService.encryptFileWrapper(testFile, correctKey);

      // Mock decryption failure
      (libsodium.crypto_secretstream_xchacha20poly1305_pull as jest.Mock).mockImplementationOnce(
        () => {
          throw new Error('Decryption failed');
        }
      );

      const decrypted = await cryptoService.decryptFileWrapper(
        encrypted.encryptedFile!,
        encrypted.header!,
        wrongKey,
        encrypted.metadata!
      );

      expect(decrypted.success).toBe(false);
      expect(decrypted.error).toContain('Failed to decrypt');
    });

    test('zeroes out sensitive data after use', async () => {
      const fileKey = cryptoService.generateFileKey();
      const testFile = new File(['test'], 'test.txt');

      await cryptoService.encryptFileWrapper(testFile, fileKey);

      expect(libsodium.memzero).toHaveBeenCalled();
    });
  });

  describe('WebVaultKeyManager', () => {
    test('stores and retrieves vault key', async () => {
      const masterKey = new Uint8Array(32);
      const keyId = 'test-key-123';

      const stored = await keyManager.storeKey(masterKey, keyId);
      expect(stored).toBe(true);

      const retrieved = await keyManager.retrieveKey(keyId);
      expect(retrieved).toEqual(masterKey);
    });

    test('supports key versioning', async () => {
      const masterKey1 = new Uint8Array(32).fill(1);
      const masterKey2 = new Uint8Array(32).fill(2);
      const keyId = 'test-key';

      await keyManager.storeKey(masterKey1, keyId, 1);
      await keyManager.storeKey(masterKey2, keyId, 2);

      const retrievedV1 = await keyManager.retrieveKeyByVersion(keyId, 1);
      const retrievedV2 = await keyManager.retrieveKeyByVersion(keyId, 2);

      expect(retrievedV1).toEqual(masterKey1);
      expect(retrievedV2).toEqual(masterKey2);
    });

    test('rotates keys correctly', async () => {
      const oldKey = new Uint8Array(32).fill(1);
      const newKey = new Uint8Array(32).fill(2);
      const keyId = 'test-key';

      await keyManager.storeKey(oldKey, keyId, 1);
      const rotated = await keyManager.rotateKey(keyId, newKey);

      expect(rotated).toBe(true);

      const currentKey = await keyManager.retrieveKey(keyId);
      expect(currentKey).toEqual(newKey);
    });

    test('checks key existence', async () => {
      const keyId = 'test-key';

      expect(await keyManager.hasKey(keyId)).toBe(false);

      await keyManager.storeKey(new Uint8Array(32), keyId);

      expect(await keyManager.hasKey(keyId)).toBe(true);
    });

    test('deletes keys', async () => {
      const keyId = 'test-key';
      await keyManager.storeKey(new Uint8Array(32), keyId);

      const deleted = await keyManager.deleteKey(keyId);
      expect(deleted).toBe(true);

      expect(await keyManager.hasKey(keyId)).toBe(false);
    });
  });

  describe('WebKeyRotationService', () => {
    test('checks rotation status', async () => {
      const status = await rotationService.getRotationStatus();

      expect(status).toHaveProperty('needsRotation');
      expect(status).toHaveProperty('lastRotation');
      expect(status).toHaveProperty('timeUntilRotation');
    });

    test('rotates vault key', async () => {
      const oldMasterKey = new Uint8Array(32).fill(1);
      const newMasterKey = new Uint8Array(32).fill(2);

      // Store initial key
      await keyManager.storeKey(oldMasterKey, 'user-vault-key', 1);

      // Mock re-encryption
      rotationService.reEncryptItemsWithNewKey = jest.fn().mockResolvedValue({
        success: true,
        itemsReEncrypted: 5,
      });

      const result = await rotationService.rotateVaultKey(newMasterKey);

      expect(result.success).toBe(true);
      expect(result.keyId).toBeDefined();
      expect(result.itemsReEncrypted).toBe(5);
    });

    test('handles rotation failure gracefully', async () => {
      const newMasterKey = new Uint8Array(32);

      // Mock re-encryption failure
      rotationService.reEncryptItemsWithNewKey = jest
        .fn()
        .mockRejectedValue(new Error('Re-encryption failed'));

      const result = await rotationService.rotateVaultKey(newMasterKey);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Failed to rotate vault key');
    });

    test('decrypts with any available key', async () => {
      const encryptedData = new Uint8Array(100);
      const header = new Uint8Array(24);
      const fileId = 'test-file';

      // Mock multiple keys
      keyManager.getAllKeys = jest.fn().mockResolvedValue([
        { keyId: 'key1', version: 1 },
        { keyId: 'key2', version: 2 },
      ]);

      keyManager.retrieveKeyByVersion = jest
        .fn()
        .mockResolvedValueOnce(new Uint8Array(32).fill(1))
        .mockResolvedValueOnce(new Uint8Array(32).fill(2));

      // First key fails, second succeeds
      (libsodium.crypto_secretstream_xchacha20poly1305_pull as jest.Mock)
        .mockImplementationOnce(() => {
          throw new Error('Wrong key');
        })
        .mockImplementationOnce(() => ({ message: new Uint8Array(50), tag: 0 }));

      const result = await rotationService.decryptWithAnyKey(encryptedData, header, fileId);

      expect(result).toBeDefined();
      expect(result?.length).toBe(50);
    });
  });

  describe('Integration Tests', () => {
    test('complete encryption workflow', async () => {
      const userId = 'test-user-123';
      const password = 'SecurePassword123!';
      const testFile = new File(['Integration test content'], 'integration.txt');

      // Setup vault
      const masterKey = await cryptoService.deriveMasterKey(password, userId);
      await keyManager.storeKey(masterKey, `${userId}-vault-key`);

      // Generate file key
      const fileKey = cryptoService.generateFileKey();

      // Encrypt file
      const encrypted = await cryptoService.encryptFileWrapper(testFile, fileKey);
      expect(encrypted.success).toBe(true);

      // Store encrypted file key
      const encryptedFileKey = await cryptoService.encryptDataWrapper(fileKey, masterKey);

      // Simulate retrieval
      const retrievedMasterKey = await keyManager.retrieveKey(`${userId}-vault-key`);
      const decryptedFileKey = await cryptoService.decryptDataWrapper(
        encryptedFileKey.encryptedData!,
        encryptedFileKey.nonce!,
        retrievedMasterKey!
      );

      // Decrypt file
      const decrypted = await cryptoService.decryptFileWrapper(
        encrypted.encryptedFile!,
        encrypted.header!,
        decryptedFileKey.decryptedData!,
        encrypted.metadata!
      );

      expect(decrypted.success).toBe(true);
    });

    test('share link security', async () => {
      // Test that share links don't expose encryption keys
      const shareId = 'test-share-123';
      const itemId = 'test-item-456';

      // Mock vault service response
      vaultService.shareItem = jest.fn().mockResolvedValue({
        shareLink: `https://app.dynasty.com/vault/share/${shareId}`,
        shareId,
      });

      const result = await vaultService.shareItem(itemId, {
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        password: 'sharePassword123',
      });

      // Ensure no encryption keys in response
      expect(result.shareLink).not.toContain('key');
      expect(result).not.toHaveProperty('encryptionKey');
      expect(result).not.toHaveProperty('fileKey');
    });

    test('biometric authentication integration', async () => {
      // Mock WebAuthn
      const mockCredential = {
        id: 'test-credential-id',
        rawId: new ArrayBuffer(32),
        response: {
          clientDataJSON: new ArrayBuffer(100),
          attestationObject: new ArrayBuffer(200),
        },
        type: 'public-key',
      };

      global.navigator.credentials = {
        create: jest.fn().mockResolvedValue(mockCredential),
        get: jest.fn().mockResolvedValue(mockCredential),
      } as any;

      const userId = 'test-user';
      const masterKey = new Uint8Array(32);

      // Register biometric
      const registered = await keyManager.registerBiometric(userId, masterKey);
      expect(registered).toBe(true);

      // Verify biometric
      const verified = await keyManager.verifyBiometric(userId);
      expect(verified).toBeDefined();
    });
  });

  describe('Security Tests', () => {
    test('prevents XSS in file names', async () => {
      const maliciousFileName = '<script>alert("XSS")</script>.txt';
      const fileContent = 'Normal content';
      const maliciousFile = new File([fileContent], maliciousFileName);

      // The file name should be sanitized during processing
      const fileKey = cryptoService.generateFileKey();
      const encrypted = await cryptoService.encryptFileWrapper(maliciousFile, fileKey);

      expect(encrypted.metadata?.originalName).not.toContain('<script>');
      expect(encrypted.metadata?.originalName).not.toContain('</script>');
    });

    test('enforces file size limits', async () => {
      // Create file larger than limit (assuming 5GB limit)
      const oversizedLength = 5 * 1024 * 1024 * 1024 + 1;
      const oversizedFile = new File([new ArrayBuffer(oversizedLength)], 'huge.bin');

      const fileKey = cryptoService.generateFileKey();
      const result = await cryptoService.encryptFileWrapper(oversizedFile, fileKey);

      expect(result.success).toBe(false);
      expect(result.error).toContain('File too large');
    });

    test('validates encryption metadata integrity', async () => {
      const testFile = new File(['test'], 'test.txt');
      const fileKey = cryptoService.generateFileKey();

      const encrypted = await cryptoService.encryptFileWrapper(testFile, fileKey);

      // Tamper with metadata
      if (encrypted.metadata) {
        encrypted.metadata.size = 99999;
      }

      const decrypted = await cryptoService.decryptFileWrapper(
        encrypted.encryptedFile!,
        encrypted.header!,
        fileKey,
        encrypted.metadata!
      );

      // Should detect tampering
      expect(decrypted.success).toBe(false);
      expect(decrypted.error).toContain('Metadata validation failed');
    });

    test('rate limits encryption operations', async () => {
      const promises = [];
      const fileKey = cryptoService.generateFileKey();

      // Attempt many encryptions rapidly
      for (let i = 0; i < 20; i++) {
        const file = new File([`test${i}`], `test${i}.txt`);
        promises.push(cryptoService.encryptFileWrapper(file, fileKey));
      }

      const results = await Promise.allSettled(promises);

      // Some should be rate limited
      const rateLimited = results.filter(
        r => r.status === 'rejected' && r.reason.message.includes('Rate limit')
      );

      expect(rateLimited.length).toBeGreaterThan(0);
    });
  });

  describe('Error Handling', () => {
    test('handles missing libsodium gracefully', async () => {
      // Mock libsodium not loaded
      (libsodium as any).ready = Promise.reject(new Error('libsodium failed to load'));

      const service = new WebVaultCryptoService();
      await expect(service.initialize()).rejects.toThrow('Failed to initialize libsodium');
    });

    test('handles IndexedDB errors', async () => {
      // Mock IndexedDB failure
      const mockError = new Error('IndexedDB not available');
      global.indexedDB.open = jest.fn().mockImplementation(() => {
        throw mockError;
      });

      const manager = new WebVaultKeyManager();
      await expect(manager.initialize()).rejects.toThrow('Failed to initialize key storage');
    });

    test('handles network errors during key rotation', async () => {
      // Mock network error
      global.fetch = jest.fn().mockRejectedValue(new Error('Network error'));

      const result = await rotationService.rotateVaultKey(new Uint8Array(32));

      expect(result.success).toBe(false);
      expect(result.error).toContain('Failed to rotate vault key');
    });
  });
});
