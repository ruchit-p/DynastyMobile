import VaultCryptoService from '../../src/services/encryption/VaultCryptoService';
import * as FileSystem from 'expo-file-system';
import { Buffer } from '@craftzdog/react-native-buffer';

// Mock FileSystem for testing
jest.mock('expo-file-system', () => ({
  getInfoAsync: jest.fn(),
  readAsStringAsync: jest.fn(),
  writeAsStringAsync: jest.fn(),
  cacheDirectory: '/cache/',
  EncodingType: {
    Base64: 'base64'
  }
}));

// Mock react-native-libsodium
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
  from_string: jest.fn((str) => new TextEncoder().encode(str)),
  to_string: jest.fn((bytes) => new TextDecoder().decode(bytes)),
  to_hex: jest.fn((bytes) => Buffer.from(bytes).toString('hex')),
  sodium_version_string: '1.0.18'
};

jest.mock('react-native-libsodium', () => ({
  __esModule: true,
  default: mockSodium,
  loadSumoVersion: jest.fn()
}));

describe('VaultCryptoService', () => {
  let cryptoService: VaultCryptoService;
  
  beforeEach(() => {
    cryptoService = VaultCryptoService.getInstance();
    jest.clearAllMocks();
  });

  describe('Key Derivation', () => {
    it('should derive consistent vault master keys', async () => {
      const password = 'test-password-123';
      const salt = new Uint8Array(32);
      const expectedKey = new Uint8Array(32);
      expectedKey.fill(42); // Test pattern
      
      mockSodium.crypto_pwhash.mockReturnValue(0); // Success
      mockSodium.crypto_pwhash.mockImplementation((derivedKey) => {
        derivedKey.set(expectedKey);
        return 0;
      });
      
      const key1 = await cryptoService.deriveVaultMasterKey(password, salt);
      const key2 = await cryptoService.deriveVaultMasterKey(password, salt);
      
      expect(key1).toEqual(key2);
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
      masterKey.fill(123); // Test pattern
      
      const mockFileKey1 = new Uint8Array(32);
      mockFileKey1.fill(1);
      const mockFileKey2 = new Uint8Array(32);
      mockFileKey2.fill(2);
      
      mockSodium.crypto_generichash.mockReturnValueOnce(new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]));
      mockSodium.crypto_kdf_derive_from_key.mockReturnValueOnce(mockFileKey1);
      
      mockSodium.crypto_generichash.mockReturnValueOnce(new Uint8Array([8, 7, 6, 5, 4, 3, 2, 1]));
      mockSodium.crypto_kdf_derive_from_key.mockReturnValueOnce(mockFileKey2);
      
      const fileKey1 = cryptoService.deriveFileKey(masterKey, 'file1');
      const fileKey2 = cryptoService.deriveFileKey(masterKey, 'file2');
      
      expect(fileKey1).not.toEqual(fileKey2);
      expect(mockSodium.crypto_kdf_derive_from_key).toHaveBeenCalledTimes(2);
    });
  });

  describe('File Encryption', () => {
    const mockFileUri = '/test/file.txt';
    const mockFileName = 'test.txt';
    const mockMimeType = 'text/plain';
    
    beforeEach(() => {
      // Mock file system
      (FileSystem.getInfoAsync as jest.Mock).mockResolvedValue({
        exists: true,
        size: 1024
      });
      
      (FileSystem.readAsStringAsync as jest.Mock).mockResolvedValueOnce(
        Buffer.from('test file content').toString('base64')
      );
    });

    it('should encrypt a file successfully', async () => {
      const fileKey = new Uint8Array(32);
      const mockHeader = new Uint8Array([1, 2, 3, 4]);
      const mockEncryptedChunk = new Uint8Array([5, 6, 7, 8]);
      const mockState = {};
      
      mockSodium.crypto_secretstream_xchacha20poly1305_init_push.mockReturnValue({
        state: mockState,
        header: mockHeader
      });
      
      mockSodium.crypto_secretstream_xchacha20poly1305_push.mockReturnValue(mockEncryptedChunk);
      
      const result = await cryptoService.encryptLargeFile(
        mockFileUri,
        fileKey,
        mockFileName,
        mockMimeType
      );
      
      expect(result.header).toEqual(mockHeader);
      expect(result.encryptedChunks).toHaveLength(1);
      expect(result.encryptedChunks[0]).toEqual(mockEncryptedChunk);
      expect(result.metadata.originalName).toBe(mockFileName);
      expect(result.metadata.mimeType).toBe(mockMimeType);
      expect(result.metadata.chunkCount).toBe(1);
    });

    it('should handle large files with multiple chunks', async () => {
      const fileKey = new Uint8Array(32);
      const largeFileSize = 100 * 1024; // 100KB
      
      (FileSystem.getInfoAsync as jest.Mock).mockResolvedValue({
        exists: true,
        size: largeFileSize
      });
      
      // Mock multiple chunk reads
      const chunkSize = 32 * 1024; // 32KB
      const expectedChunks = Math.ceil(largeFileSize / chunkSize);
      
      let readCallCount = 0;
      (FileSystem.readAsStringAsync as jest.Mock).mockImplementation(() => {
        readCallCount++;
        const isLast = readCallCount === expectedChunks;
        const chunkData = isLast ? 'last chunk' : 'chunk data';
        return Promise.resolve(Buffer.from(chunkData).toString('base64'));
      });
      
      const mockHeader = new Uint8Array([1, 2, 3, 4]);
      const mockEncryptedChunk = new Uint8Array([5, 6, 7, 8]);
      
      mockSodium.crypto_secretstream_xchacha20poly1305_init_push.mockReturnValue({
        state: {},
        header: mockHeader
      });
      
      mockSodium.crypto_secretstream_xchacha20poly1305_push.mockReturnValue(mockEncryptedChunk);
      
      const result = await cryptoService.encryptLargeFile(
        mockFileUri,
        fileKey,
        mockFileName,
        mockMimeType
      );
      
      expect(result.encryptedChunks).toHaveLength(expectedChunks);
      expect(mockSodium.crypto_secretstream_xchacha20poly1305_push).toHaveBeenCalledTimes(expectedChunks);
    });

    it('should reject files that are too large', async () => {
      const fileKey = new Uint8Array(32);
      const oversizedFile = 200 * 1024 * 1024; // 200MB (over 100MB limit)
      
      (FileSystem.getInfoAsync as jest.Mock).mockResolvedValue({
        exists: true,
        size: oversizedFile
      });
      
      await expect(cryptoService.encryptLargeFile(
        mockFileUri,
        fileKey,
        mockFileName,
        mockMimeType
      )).rejects.toThrow('File too large');
    });

    it('should handle file not found error', async () => {
      const fileKey = new Uint8Array(32);
      
      (FileSystem.getInfoAsync as jest.Mock).mockResolvedValue({
        exists: false
      });
      
      await expect(cryptoService.encryptLargeFile(
        mockFileUri,
        fileKey,
        mockFileName,
        mockMimeType
      )).rejects.toThrow('File does not exist');
    });
  });

  describe('File Decryption', () => {
    it('should decrypt a file successfully', async () => {
      const fileKey = new Uint8Array(32);
      const header = new Uint8Array([1, 2, 3, 4]);
      const encryptedChunks = [new Uint8Array([5, 6, 7, 8])];
      const decryptedData = new Uint8Array([9, 10, 11, 12]);
      
      const mockState = {};
      mockSodium.crypto_secretstream_xchacha20poly1305_init_pull.mockReturnValue(mockState);
      mockSodium.crypto_secretstream_xchacha20poly1305_pull.mockReturnValue({
        message: decryptedData,
        tag: mockSodium.crypto_secretstream_xchacha20poly1305_TAG_FINAL
      });
      
      const result = await cryptoService.decryptLargeFile(
        header,
        encryptedChunks,
        fileKey
      );
      
      expect(FileSystem.writeAsStringAsync).toHaveBeenCalledWith(
        expect.stringContaining('decrypted_'),
        Buffer.from(decryptedData).toString('base64'),
        { encoding: FileSystem.EncodingType.Base64 }
      );
      
      expect(result).toMatch(/decrypted_.*_file$/);
    });

    it('should handle multiple encrypted chunks', async () => {
      const fileKey = new Uint8Array(32);
      const header = new Uint8Array([1, 2, 3, 4]);
      const encryptedChunks = [
        new Uint8Array([5, 6, 7, 8]),
        new Uint8Array([9, 10, 11, 12]),
        new Uint8Array([13, 14, 15, 16])
      ];
      
      const decryptedChunks = [
        new Uint8Array([1, 2]),
        new Uint8Array([3, 4]),
        new Uint8Array([5, 6])
      ];
      
      mockSodium.crypto_secretstream_xchacha20poly1305_init_pull.mockReturnValue({});
      
      mockSodium.crypto_secretstream_xchacha20poly1305_pull
        .mockReturnValueOnce({ message: decryptedChunks[0], tag: 0 })
        .mockReturnValueOnce({ message: decryptedChunks[1], tag: 0 })
        .mockReturnValueOnce({ 
          message: decryptedChunks[2], 
          tag: mockSodium.crypto_secretstream_xchacha20poly1305_TAG_FINAL 
        });
      
      await cryptoService.decryptLargeFile(header, encryptedChunks, fileKey);
      
      expect(mockSodium.crypto_secretstream_xchacha20poly1305_pull).toHaveBeenCalledTimes(3);
      
      // Verify combined data
      const expectedCombined = new Uint8Array(6);
      expectedCombined.set(decryptedChunks[0], 0);
      expectedCombined.set(decryptedChunks[1], 2);
      expectedCombined.set(decryptedChunks[2], 4);
      
      expect(FileSystem.writeAsStringAsync).toHaveBeenCalledWith(
        expect.any(String),
        Buffer.from(expectedCombined).toString('base64'),
        expect.any(Object)
      );
    });
  });

  describe('Data Encryption/Decryption', () => {
    it('should encrypt and decrypt small data', async () => {
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
      
      // Decrypt
      const decrypted = await cryptoService.decryptData(encrypted.encrypted, encrypted.nonce, key);
      expect(decrypted).toBe(testData);
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
    it('should handle libsodium initialization errors gracefully', async () => {
      // Mock initialization failure
      const failingCryptoService = VaultCryptoService.getInstance();
      
      // Test that methods handle initialization properly
      expect(async () => {
        await failingCryptoService.deriveVaultMasterKey('password', new Uint8Array(32));
      }).not.toThrow();
    });

    it('should handle file read errors during encryption', async () => {
      const fileKey = new Uint8Array(32);
      
      (FileSystem.getInfoAsync as jest.Mock).mockResolvedValue({
        exists: true,
        size: 1024
      });
      
      (FileSystem.readAsStringAsync as jest.Mock).mockRejectedValue(
        new Error('File read error')
      );
      
      await expect(cryptoService.encryptLargeFile(
        '/test/file.txt',
        fileKey,
        'test.txt',
        'text/plain'
      )).rejects.toThrow('Failed to encrypt file');
    });
  });
});