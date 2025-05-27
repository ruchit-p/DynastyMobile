/**
 * Basic VaultCryptoService Test
 * Tests the core functionality without dynamic imports
 */

// Mock react-native-libsodium before import
jest.mock('react-native-libsodium', () => ({
  ready: jest.fn().mockResolvedValue(true),
  crypto_secretbox_KEYBYTES: 32,
  crypto_secretbox_NONCEBYTES: 24,
  crypto_pwhash_SALTBYTES: 32,
  crypto_pwhash_OPSLIMIT_INTERACTIVE: 2,
  crypto_pwhash_MEMLIMIT_INTERACTIVE: 67108864,
  crypto_pwhash_ALG_ARGON2ID13: 2,
  crypto_box_PUBLICKEYBYTES: 32,
  crypto_box_SECRETKEYBYTES: 32,
  crypto_box_SEALBYTES: 48,
  crypto_generichash_BYTES: 32,
  crypto_secretbox: jest.fn().mockReturnValue(new Uint8Array(24 + 12)),
  crypto_secretbox_open: jest.fn().mockReturnValue(new Uint8Array(12)),
  crypto_pwhash: jest.fn().mockReturnValue(0),
  crypto_box_keypair: jest.fn().mockReturnValue({
    publicKey: new Uint8Array(32).fill(1),
    privateKey: new Uint8Array(32).fill(2)
  }),
  crypto_box_seal: jest.fn().mockReturnValue(new Uint8Array(48)),
  crypto_box_seal_open: jest.fn().mockReturnValue(new Uint8Array(32)),
  crypto_generichash: jest.fn().mockReturnValue(new Uint8Array(32)),
  randombytes_buf: jest.fn().mockReturnValue(new Uint8Array(32).fill(42)),
  from_string: jest.fn().mockReturnValue(new Uint8Array([116, 101, 115, 116])),
  to_string: jest.fn().mockReturnValue('test'),
  to_base64: jest.fn().mockReturnValue('dGVzdA=='),
  from_base64: jest.fn().mockReturnValue(new Uint8Array([116, 101, 115, 116])),
  sodium_version_string: jest.fn().mockReturnValue('1.0.19')
}));

// Mock Expo SecureStore
jest.mock('expo-secure-store', () => ({
  setItemAsync: jest.fn().mockResolvedValue(undefined),
  getItemAsync: jest.fn().mockResolvedValue('mock-key'),
  deleteItemAsync: jest.fn().mockResolvedValue(undefined),
  isAvailableAsync: jest.fn().mockResolvedValue(true)
}));

// Mock Expo Crypto
jest.mock('expo-crypto', () => ({
  getRandomBytes: jest.fn().mockReturnValue(new Uint8Array(32).fill(42)),
  getRandomBytesAsync: jest.fn().mockResolvedValue(new Uint8Array(32).fill(42))
}));

// Mock React Native Firebase
jest.mock('@react-native-firebase/storage', () => ({
  default: jest.fn(() => ({
    ref: jest.fn(() => ({
      putFile: jest.fn().mockResolvedValue({ task: { snapshot: { ref: { fullPath: 'test/path' } } } }),
      getDownloadURL: jest.fn().mockResolvedValue('https://example.com/file.jpg'),
      delete: jest.fn().mockResolvedValue(undefined)
    }))
  }))
}));

jest.mock('@react-native-firebase/firestore', () => ({
  default: jest.fn(() => ({
    collection: jest.fn(() => ({
      doc: jest.fn(() => ({
        set: jest.fn().mockResolvedValue(undefined),
        get: jest.fn().mockResolvedValue({ exists: true, data: () => ({}) }),
        update: jest.fn().mockResolvedValue(undefined),
        delete: jest.fn().mockResolvedValue(undefined)
      }))
    }))
  }))
}));

import VaultCryptoService from '../../src/services/encryption/VaultCryptoService';

describe('VaultCryptoService - Basic Tests', () => {
  let cryptoService: VaultCryptoService;

  beforeAll(async () => {
    cryptoService = VaultCryptoService.getInstance();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should create a singleton instance', () => {
    const instance1 = VaultCryptoService.getInstance();
    const instance2 = VaultCryptoService.getInstance();
    expect(instance1).toBe(instance2);
  });

  it('should generate salt', () => {
    const salt = cryptoService.generateSalt();
    expect(salt).toBeInstanceOf(Uint8Array);
    expect(salt.length).toBe(32);
  });

  it('should derive master key', async () => {
    const password = 'test-password';
    const salt = new Uint8Array(32).fill(1);
    
    const masterKey = await cryptoService.deriveVaultMasterKey(password, salt);
    expect(masterKey).toBeInstanceOf(Uint8Array);
    expect(masterKey.length).toBe(32);
  });

  it('should derive file key', () => {
    const masterKey = new Uint8Array(32).fill(1);
    const fileId = 'test-file-123';
    
    const fileKey = cryptoService.deriveFileKey(masterKey, fileId);
    expect(fileKey).toBeInstanceOf(Uint8Array);
    expect(fileKey.length).toBe(32);
  });

  it('should encrypt and decrypt data', () => {
    const data = new Uint8Array([1, 2, 3, 4]);
    const key = new Uint8Array(32).fill(1);
    
    const encrypted = cryptoService.encryptData(data, key);
    expect(encrypted).toBeInstanceOf(Uint8Array);
    
    const decrypted = cryptoService.decryptData(encrypted, key);
    expect(decrypted).toBeInstanceOf(Uint8Array);
  });

  it('should generate search hash', () => {
    const searchTerm = 'family photo';
    const searchKey = new Uint8Array(32).fill(1);
    
    const hash = cryptoService.generateSearchHash(searchTerm, searchKey);
    expect(hash).toBeInstanceOf(Uint8Array);
    expect(hash.length).toBe(32);
  });

  it('should generate keypair', () => {
    const keypair = cryptoService.generateKeyPair();
    expect(keypair).toHaveProperty('publicKey');
    expect(keypair).toHaveProperty('privateKey');
    expect(keypair.publicKey).toBeInstanceOf(Uint8Array);
    expect(keypair.privateKey).toBeInstanceOf(Uint8Array);
  });

  it('should encrypt for family member', () => {
    const vaultKey = new Uint8Array(32).fill(1);
    const memberPublicKey = new Uint8Array(32).fill(2);
    
    const encrypted = cryptoService.encryptVaultKeyForFamilyMember(vaultKey, memberPublicKey);
    expect(encrypted).toBeInstanceOf(Uint8Array);
  });

  it('should decrypt from family member', () => {
    const encryptedKey = new Uint8Array(48).fill(1);
    const memberPrivateKey = new Uint8Array(32).fill(2);
    
    const decrypted = cryptoService.decryptVaultKeyFromFamilyMember(encryptedKey, memberPrivateKey);
    expect(decrypted).toBeInstanceOf(Uint8Array);
  });

  it('should generate secure file ID', () => {
    const fileId = cryptoService.generateSecureFileId();
    expect(typeof fileId).toBe('string');
    expect(fileId.length).toBeGreaterThan(0);
  });

  it('should perform secure comparison', () => {
    const a = new Uint8Array([1, 2, 3]);
    const b = new Uint8Array([1, 2, 3]);
    const c = new Uint8Array([1, 2, 4]);
    
    expect(cryptoService.secureCompare(a, b)).toBe(true);
    expect(cryptoService.secureCompare(a, c)).toBe(false);
  });

  it('should get version info', () => {
    const version = cryptoService.getVersionInfo();
    expect(version).toHaveProperty('libsodium');
    expect(version).toHaveProperty('service');
    expect(typeof version.libsodium).toBe('string');
    expect(typeof version.service).toBe('string');
  });
});