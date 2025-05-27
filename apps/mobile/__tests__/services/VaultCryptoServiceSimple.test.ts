import { Buffer } from '@craftzdog/react-native-buffer';

// Mock all dependencies to focus on crypto logic
jest.mock('expo-file-system');
jest.mock('../../src/services/LoggingService', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn()
  }
}));

// Mock react-native-libsodium with a complete implementation
const mockSodium = {
  ready: Promise.resolve(),
  crypto_pwhash: jest.fn(),
  crypto_pwhash_SALTBYTES: 32,
  crypto_pwhash_OPSLIMIT_INTERACTIVE: 2,
  crypto_pwhash_MEMLIMIT_INTERACTIVE: 67108864,
  crypto_pwhash_ALG_ARGON2ID13: 2,
  crypto_kdf_derive_from_key: jest.fn(),
  crypto_secretstream_xchacha20poly1305_init_push: jest.fn(),
  crypto_secretstream_xchacha20poly1305_push: jest.fn(),
  crypto_secretstream_xchacha20poly1305_init_pull: jest.fn(),
  crypto_secretstream_xchacha20poly1305_pull: jest.fn(),
  crypto_secretstream_xchacha20poly1305_TAG_MESSAGE: 0,
  crypto_secretstream_xchacha20poly1305_TAG_FINAL: 3,
  crypto_box_easy: jest.fn(),
  crypto_box_open_easy: jest.fn(),
  crypto_box_NONCEBYTES: 24,
  crypto_shorthash: jest.fn(),
  crypto_shorthash_KEYBYTES: 16,
  crypto_generichash: jest.fn(),
  crypto_box_keypair: jest.fn(),
  randombytes_buf: jest.fn(),
  memcmp: jest.fn(),
  from_string: jest.fn((str: string) => new TextEncoder().encode(str)),
  to_string: jest.fn((bytes: Uint8Array) => new TextDecoder().decode(bytes)),
  to_hex: jest.fn((bytes: Uint8Array) => Buffer.from(bytes).toString('hex')),
  sodium_version_string: '1.0.18'
};

jest.mock('react-native-libsodium', () => ({
  __esModule: true,
  default: mockSodium,
  loadSumoVersion: jest.fn()
}));

describe('VaultCryptoService - Core Functionality', () => {
  let VaultCryptoService: any;
  let cryptoService: any;
  
  beforeAll(async () => {
    // Dynamically import after mocks are set up
    const module = await import('../../src/services/encryption/VaultCryptoService');
    VaultCryptoService = module.default;
    cryptoService = VaultCryptoService.getInstance();
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Singleton Pattern', () => {
    it('should return the same instance', () => {
      const instance1 = VaultCryptoService.getInstance();
      const instance2 = VaultCryptoService.getInstance();
      
      expect(instance1).toBe(instance2);
    });
  });

  describe('Salt Generation', () => {
    it('should generate salt using libsodium', () => {
      const mockSalt = new Uint8Array(32);
      mockSalt.fill(123);
      
      mockSodium.randombytes_buf.mockReturnValue(mockSalt);
      
      const salt = cryptoService.generateSalt();
      
      expect(salt).toEqual(mockSalt);
      expect(mockSodium.randombytes_buf).toHaveBeenCalledWith(mockSalt);
    });
  });

  describe('Key Derivation', () => {
    it('should derive vault master key using Argon2id', async () => {
      const password = 'test-password-123';
      const salt = new Uint8Array(32);
      const expectedKey = new Uint8Array(32);
      expectedKey.fill(42);
      
      mockSodium.crypto_pwhash.mockImplementation((derivedKey) => {
        derivedKey.set(expectedKey);
        return 0; // Success
      });
      
      const derivedKey = await cryptoService.deriveVaultMasterKey(password, salt);
      
      expect(derivedKey).toEqual(expectedKey);
      expect(mockSodium.crypto_pwhash).toHaveBeenCalledWith(
        expect.any(Uint8Array),
        32,
        password,
        salt,
        mockSodium.crypto_pwhash_OPSLIMIT_INTERACTIVE,
        mockSodium.crypto_pwhash_MEMLIMIT_INTERACTIVE,
        mockSodium.crypto_pwhash_ALG_ARGON2ID13
      );
    });

    it('should throw error on key derivation failure', async () => {
      const password = 'test-password';
      const salt = new Uint8Array(32);
      
      mockSodium.crypto_pwhash.mockReturnValue(-1); // Failure
      
      await expect(cryptoService.deriveVaultMasterKey(password, salt))
        .rejects.toThrow('Failed to derive vault master key');
    });

    it('should derive different file keys for different files', () => {
      const masterKey = new Uint8Array(32);
      masterKey.fill(123);
      
      const mockFileKey1 = new Uint8Array(32);
      mockFileKey1.fill(1);
      const mockFileKey2 = new Uint8Array(32);
      mockFileKey2.fill(2);
      
      // Mock hash generation for file IDs
      mockSodium.crypto_generichash
        .mockReturnValueOnce(new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]))
        .mockReturnValueOnce(new Uint8Array([8, 7, 6, 5, 4, 3, 2, 1]));
      
      // Mock key derivation
      mockSodium.crypto_kdf_derive_from_key
        .mockReturnValueOnce(mockFileKey1)
        .mockReturnValueOnce(mockFileKey2);
      
      const fileKey1 = cryptoService.deriveFileKey(masterKey, 'file1');
      const fileKey2 = cryptoService.deriveFileKey(masterKey, 'file2');
      
      expect(fileKey1).not.toEqual(fileKey2);
      expect(mockSodium.crypto_kdf_derive_from_key).toHaveBeenCalledTimes(2);
    });
  });

  describe('Data Encryption/Decryption', () => {
    it('should encrypt and decrypt small data correctly', async () => {
      const testData = 'Hello, World!';
      const key = new Uint8Array(32);
      const mockNonce = new Uint8Array(24);
      const mockEncrypted = new Uint8Array([1, 2, 3, 4]);
      
      mockSodium.randombytes_buf.mockReturnValue(mockNonce);
      mockSodium.crypto_box_easy.mockReturnValue(mockEncrypted);
      mockSodium.crypto_box_open_easy.mockReturnValue(new TextEncoder().encode(testData));
      
      // Encrypt
      const encrypted = await cryptoService.encryptData(testData, key);
      
      expect(encrypted.encrypted).toEqual(mockEncrypted);
      expect(encrypted.nonce).toEqual(mockNonce);
      expect(mockSodium.crypto_box_easy).toHaveBeenCalledWith(
        mockSodium.from_string(testData),
        mockNonce,
        key,
        key
      );
      
      // Decrypt
      const decrypted = await cryptoService.decryptData(encrypted.encrypted, encrypted.nonce, key);
      
      expect(decrypted).toBe(testData);
      expect(mockSodium.crypto_box_open_easy).toHaveBeenCalledWith(
        mockEncrypted,
        mockNonce,
        key,
        key
      );
    });
  });

  describe('Search Hash Generation', () => {
    it('should generate consistent hashes for search terms', () => {
      const searchKey = new Uint8Array(32);
      const term = 'Test Search Term';
      const mockHash = new Uint8Array([1, 2, 3, 4]);
      
      mockSodium.crypto_shorthash.mockReturnValue(mockHash);
      mockSodium.to_hex.mockReturnValue('01020304');
      
      const hash1 = cryptoService.generateSearchHash(term, searchKey);
      const hash2 = cryptoService.generateSearchHash(term, searchKey);
      
      expect(hash1).toBe(hash2);
      expect(hash1).toBe('01020304');
      expect(mockSodium.crypto_shorthash).toHaveBeenCalledWith(
        mockSodium.from_string(term.toLowerCase().trim()),
        searchKey.slice(0, mockSodium.crypto_shorthash_KEYBYTES)
      );
    });

    it('should be case insensitive', () => {
      const searchKey = new Uint8Array(32);
      const mockHash = new Uint8Array([1, 2, 3, 4]);
      
      mockSodium.crypto_shorthash.mockReturnValue(mockHash);
      mockSodium.to_hex.mockReturnValue('01020304');
      
      const hash1 = cryptoService.generateSearchHash('Test', searchKey);
      const hash2 = cryptoService.generateSearchHash('TEST', searchKey);
      const hash3 = cryptoService.generateSearchHash('test', searchKey);
      
      expect(hash1).toBe(hash2);
      expect(hash2).toBe(hash3);
    });
  });

  describe('Key Pair Generation', () => {
    it('should generate a keypair for family sharing', () => {
      const mockPublicKey = new Uint8Array([1, 2, 3, 4]);
      const mockPrivateKey = new Uint8Array([5, 6, 7, 8]);
      
      mockSodium.crypto_box_keypair.mockReturnValue({
        publicKey: mockPublicKey,
        secretKey: mockPrivateKey
      });
      
      const keyPair = cryptoService.generateKeyPair();
      
      expect(keyPair.publicKey).toEqual(mockPublicKey);
      expect(keyPair.privateKey).toEqual(mockPrivateKey);
      expect(mockSodium.crypto_box_keypair).toHaveBeenCalled();
    });
  });

  describe('Family Vault Key Sharing', () => {
    it('should encrypt vault key for family member', async () => {
      const vaultKey = new Uint8Array(32);
      const memberPublicKey = new Uint8Array(32);
      const senderPrivateKey = new Uint8Array(32);
      const mockNonce = new Uint8Array(24);
      const mockEncrypted = new Uint8Array([1, 2, 3, 4]);
      
      mockSodium.randombytes_buf.mockReturnValue(mockNonce);
      mockSodium.crypto_box_easy.mockReturnValue(mockEncrypted);
      
      const result = await cryptoService.encryptVaultKeyForMember(
        vaultKey,
        memberPublicKey,
        senderPrivateKey
      );
      
      // Result should contain nonce + encrypted data
      expect(result).toHaveLength(mockNonce.length + mockEncrypted.length);
      expect(Array.from(result.slice(0, mockNonce.length))).toEqual(Array.from(mockNonce));
      expect(Array.from(result.slice(mockNonce.length))).toEqual(Array.from(mockEncrypted));
      
      expect(mockSodium.crypto_box_easy).toHaveBeenCalledWith(
        vaultKey,
        mockNonce,
        memberPublicKey,
        senderPrivateKey
      );
    });

    it('should decrypt vault key from family member', async () => {
      const mockVaultKey = new Uint8Array(32);
      const senderPublicKey = new Uint8Array(32);
      const receiverPrivateKey = new Uint8Array(32);
      
      const mockNonce = new Uint8Array(24);
      const mockEncrypted = new Uint8Array([1, 2, 3, 4]);
      const encryptedData = new Uint8Array(mockNonce.length + mockEncrypted.length);
      encryptedData.set(mockNonce, 0);
      encryptedData.set(mockEncrypted, mockNonce.length);
      
      mockSodium.crypto_box_open_easy.mockReturnValue(mockVaultKey);
      
      const result = await cryptoService.decryptVaultKeyFromMember(
        encryptedData,
        senderPublicKey,
        receiverPrivateKey
      );
      
      expect(result).toEqual(mockVaultKey);
      expect(mockSodium.crypto_box_open_easy).toHaveBeenCalledWith(
        mockEncrypted,
        mockNonce,
        senderPublicKey,
        receiverPrivateKey
      );
    });
  });

  describe('Utility Functions', () => {
    it('should generate secure file IDs', () => {
      const mockRandomBytes = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16]);
      mockSodium.randombytes_buf.mockReturnValue(mockRandomBytes);
      mockSodium.to_hex.mockReturnValue('0102030405060708090a0b0c0d0e0f10');
      
      const fileId = cryptoService.generateSecureFileId();
      
      expect(fileId).toBe('0102030405060708090a0b0c0d0e0f10');
      expect(mockSodium.randombytes_buf).toHaveBeenCalledWith(16);
    });

    it('should perform secure comparison', () => {
      const arr1 = new Uint8Array([1, 2, 3, 4]);
      const arr2 = new Uint8Array([1, 2, 3, 4]);
      const arr3 = new Uint8Array([1, 2, 3, 5]);
      
      mockSodium.memcmp.mockReturnValueOnce(true).mockReturnValueOnce(false);
      
      expect(cryptoService.secureCompare(arr1, arr2)).toBe(true);
      expect(cryptoService.secureCompare(arr1, arr3)).toBe(false);
    });

    it('should return false for arrays of different lengths', () => {
      const arr1 = new Uint8Array([1, 2, 3]);
      const arr2 = new Uint8Array([1, 2, 3, 4]);
      
      expect(cryptoService.secureCompare(arr1, arr2)).toBe(false);
    });

    it('should get version info', () => {
      const versionInfo = cryptoService.getVersionInfo();
      expect(versionInfo).toBe('libsodium version: 1.0.18');
    });
  });

  describe('Error Handling', () => {
    it('should handle encryption errors gracefully', async () => {
      const testData = 'test data';
      const key = new Uint8Array(32);
      
      mockSodium.randombytes_buf.mockImplementation(() => {
        throw new Error('Random generation failed');
      });
      
      await expect(cryptoService.encryptData(testData, key))
        .rejects.toThrow('Failed to encrypt data');
    });

    it('should handle decryption errors gracefully', async () => {
      const encrypted = new Uint8Array([1, 2, 3, 4]);
      const nonce = new Uint8Array(24);
      const key = new Uint8Array(32);
      
      mockSodium.crypto_box_open_easy.mockImplementation(() => {
        throw new Error('Decryption failed');
      });
      
      await expect(cryptoService.decryptData(encrypted, nonce, key))
        .rejects.toThrow('Failed to decrypt data');
    });
  });
});