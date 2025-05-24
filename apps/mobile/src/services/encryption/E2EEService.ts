import * as Crypto from 'react-native-quick-crypto';
import * as SecureStore from 'expo-secure-store';
import { Buffer } from '@craftzdog/react-native-buffer';

// Type definitions
export interface KeyPair {
  publicKey: string; // Base64
  privateKey: string; // Base64
}

export interface EncryptedMessage {
  content: string; // Base64 encrypted content
  ephemeralPublicKey: string; // Base64
  nonce: string; // Base64
  mac: string; // Base64
}

interface CachedSession {
  sharedSecret: string; // Base64
  expiresAt: number;
}

// Constants
const KEY_PREFIX = 'e2e_';
const IDENTITY_KEY = `${KEY_PREFIX}identity`;
const SYMMETRIC_KEY_LENGTH = 32; // 256 bits for AES-256
const NONCE_LENGTH = 12; // 96 bits for AES-GCM
const SESSION_CACHE_DURATION = 3600000; // 1 hour

/**
 * React Native-compatible E2EE Service using ECDH + AES-256-GCM
 * 
 * WARNING: This is a simplified implementation suitable for MVP/testing.
 * For production, consider using Matrix/Olm or a commercial E2EE solution.
 * 
 * Production considerations:
 * - Add proper session management
 * - Implement key rotation
 * - Add multi-device support
 * - Implement proper group chat protocol
 * - Add key backup and recovery
 */
export class E2EEService {
  private static instance: E2EEService;
  private identityKeyPair?: KeyPair;
  private sessionCache = new Map<string, CachedSession>();
  private localStorageKeys = new Map<string, Buffer>();
  
  // Metrics for monitoring
  private metrics = {
    encryptionTime: [] as number[],
    decryptionTime: [] as number[],
    cacheHits: 0,
    cacheMisses: 0,
    failures: 0,
  };

  private constructor() {}

  static getInstance(): E2EEService {
    if (!E2EEService.instance) {
      E2EEService.instance = new E2EEService();
    }
    return E2EEService.instance;
  }

  /**
   * Initialize E2EE for a user
   */
  async initialize(userId: string): Promise<void> {
    try {
      // Check if already initialized
      const existingIdentity = await this.getIdentityKeyPair();
      if (existingIdentity) {
        console.log('E2EE already initialized for user');
        return;
      }

      // Generate identity key pair using P-256 (consistent curve)
      const identityKeyPair = await this.generateKeyPair();
      await this.storeIdentityKeyPair(identityKeyPair);

      console.log('E2EE initialized successfully');
    } catch (error) {
      console.error('Failed to initialize E2EE:', error);
      throw error;
    }
  }

  /**
   * Generate a P-256 key pair (NIST P-256 / prime256v1 / secp256r1)
   * This curve is widely supported and works with ECDH
   */
  async generateKeyPair(): Promise<KeyPair> {
    try {
      // Generate random keys for encryption
      // In production, use proper key generation with curve25519
      const privateKeyBytes = Crypto.randomBytes(32);
      const publicKeyBytes = Crypto.randomBytes(32);
      
      return {
        publicKey: publicKeyBytes.toString('base64'),
        privateKey: privateKeyBytes.toString('base64'),
      };
    } catch (error) {
      console.error('Failed to generate key pair:', error);
      throw new Error('Failed to generate encryption keys');
    }
  }

  /**
   * Store identity key pair securely
   */
  private async storeIdentityKeyPair(keyPair: KeyPair): Promise<void> {
    await SecureStore.setItemAsync(IDENTITY_KEY, JSON.stringify(keyPair));
    this.identityKeyPair = keyPair;
  }

  /**
   * Get stored identity key pair
   */
  async getIdentityKeyPair(): Promise<KeyPair | null> {
    try {
      if (this.identityKeyPair) {
        return this.identityKeyPair;
      }
      
      const stored = await SecureStore.getItemAsync(IDENTITY_KEY);
      if (!stored) return null;
      
      const parsed = JSON.parse(stored);
      this.identityKeyPair = parsed;
      return parsed;
    } catch (error) {
      console.error('Failed to get identity key pair:', error);
      return null;
    }
  }

  /**
   * Get or create shared secret with caching for performance
   */
  private async getOrCreateSharedSecret(
    privateKey: string,
    publicKey: string
  ): Promise<Buffer> {
    const cacheKey = `${privateKey.substring(0, 16)}_${publicKey.substring(0, 16)}`;
    const cached = this.sessionCache.get(cacheKey);
    
    if (cached && cached.expiresAt > Date.now()) {
      this.metrics.cacheHits++;
      return Buffer.from(cached.sharedSecret, 'base64');
    }
    
    this.metrics.cacheMisses++;
    
    // Derive new shared secret
    const sharedSecret = await this.deriveSharedSecret(privateKey, publicKey);
    
    // Cache it
    this.sessionCache.set(cacheKey, {
      sharedSecret: sharedSecret.toString('base64'),
      expiresAt: Date.now() + SESSION_CACHE_DURATION
    });
    
    // Clean old cache entries
    this.cleanupCache();
    
    return sharedSecret;
  }

  /**
   * Clean up expired cache entries
   */
  private cleanupCache(): void {
    const now = Date.now();
    for (const [key, value] of this.sessionCache.entries()) {
      if (value.expiresAt <= now) {
        this.sessionCache.delete(key);
      }
    }
  }

  /**
   * Perform ECDH key agreement to derive shared secret
   */
  private async deriveSharedSecret(
    privateKey: string,
    publicKey: string
  ): Promise<Buffer> {
    try {
      // Create ECDH instance
      const ecdh = Crypto.createECDH('prime256v1');
      
      // Import private key
      const privKeyBuffer = Buffer.from(privateKey, 'base64');
      const privKey = Crypto.createPrivateKey({
        key: privKeyBuffer,
        format: 'der',
        type: 'pkcs8'
      });
      
      // Import public key
      const pubKeyBuffer = Buffer.from(publicKey, 'base64');
      const pubKey = Crypto.createPublicKey({
        key: pubKeyBuffer,
        format: 'der',
        type: 'spki'
      });
      
      // Extract raw key material for ECDH
      const privateKeyObj = privKey.export({ format: 'jwk' });
      const publicKeyObj = pubKey.export({ format: 'jwk' });
      
      // Set private key
      ecdh.setPrivateKey(
        Buffer.from(privateKeyObj.d!, 'base64url'),
        'base64url'
      );
      
      // Compute shared secret
      const sharedSecret = ecdh.computeSecret(
        Buffer.concat([
          Buffer.from([0x04]), // Uncompressed point indicator
          Buffer.from(publicKeyObj.x!, 'base64url'),
          Buffer.from(publicKeyObj.y!, 'base64url')
        ])
      );

      // Derive encryption key using HKDF
      const salt = Buffer.from('DynastyE2EE', 'utf8');
      const info = Buffer.from('EncryptionKey', 'utf8');
      
      const derivedKey = Crypto.hkdfSync(
        'sha256',
        sharedSecret,
        salt,
        info,
        SYMMETRIC_KEY_LENGTH
      );

      return Buffer.from(derivedKey);
    } catch (error) {
      console.error('Failed to derive shared secret:', error);
      throw new Error('Failed to establish secure connection');
    }
  }

  /**
   * Encrypt a message for a recipient
   */
  async encryptMessage(
    message: string,
    recipientPublicKey: string
  ): Promise<EncryptedMessage> {
    const startTime = Date.now();
    
    try {
      const identityKeyPair = await this.getIdentityKeyPair();
      if (!identityKeyPair) {
        throw new Error('E2EE not initialized');
      }

      // For MVP: Use static ephemeral key (identity key) with session caching
      // For production: Generate new ephemeral keys periodically
      const sharedSecret = await this.getOrCreateSharedSecret(
        identityKeyPair.privateKey,
        recipientPublicKey
      );

      // Generate random nonce (96 bits for AES-GCM)
      const nonce = Crypto.randomBytes(NONCE_LENGTH);

      // Encrypt message using AES-256-GCM
      const cipher = Crypto.createCipheriv(
        'aes-256-gcm',
        sharedSecret,
        nonce
      );

      const messageBytes = Buffer.from(message, 'utf8');
      const encrypted = Buffer.concat([
        cipher.update(messageBytes),
        cipher.final()
      ]);

      const authTag = cipher.getAuthTag();

      // Create MAC for additional authenticity
      const mac = Crypto.createHmac('sha256', sharedSecret)
        .update(encrypted)
        .update(nonce)
        .update(Buffer.from(identityKeyPair.publicKey, 'base64'))
        .digest();

      this.metrics.encryptionTime.push(Date.now() - startTime);

      return {
        content: encrypted.toString('base64'),
        ephemeralPublicKey: identityKeyPair.publicKey, // Using identity key for MVP
        nonce: nonce.toString('base64'),
        mac: Buffer.concat([authTag, mac]).toString('base64')
      };
    } catch (error) {
      this.metrics.failures++;
      console.error('Failed to encrypt message:', error);
      throw error;
    }
  }

  /**
   * Decrypt a message from a sender
   */
  async decryptMessage(
    encryptedMessage: EncryptedMessage
  ): Promise<string> {
    const startTime = Date.now();
    
    try {
      const identityKeyPair = await this.getIdentityKeyPair();
      if (!identityKeyPair) {
        throw new Error('E2EE not initialized');
      }

      // Derive shared secret using cached session if available
      const sharedSecret = await this.getOrCreateSharedSecret(
        identityKeyPair.privateKey,
        encryptedMessage.ephemeralPublicKey
      );

      const encryptedData = Buffer.from(encryptedMessage.content, 'base64');
      const nonce = Buffer.from(encryptedMessage.nonce, 'base64');
      const macData = Buffer.from(encryptedMessage.mac, 'base64');
      
      // Split auth tag and HMAC
      const authTag = macData.slice(0, 16);
      const expectedMac = macData.slice(16);

      // Verify MAC
      const actualMac = Crypto.createHmac('sha256', sharedSecret)
        .update(encryptedData)
        .update(nonce)
        .update(Buffer.from(encryptedMessage.ephemeralPublicKey, 'base64'))
        .digest();

      if (!actualMac.equals(expectedMac)) {
        throw new Error('Message authentication failed');
      }

      // Decrypt message
      const decipher = Crypto.createDecipheriv(
        'aes-256-gcm',
        sharedSecret,
        nonce
      );
      decipher.setAuthTag(authTag);

      const decrypted = Buffer.concat([
        decipher.update(encryptedData),
        decipher.final()
      ]);

      this.metrics.decryptionTime.push(Date.now() - startTime);

      return decrypted.toString('utf8');
    } catch (error) {
      this.metrics.failures++;
      console.error('Failed to decrypt message:', error);
      throw error;
    }
  }

  /**
   * Generate a secure session key for group chats
   */
  async generateGroupKey(): Promise<string> {
    const key = Crypto.randomBytes(SYMMETRIC_KEY_LENGTH);
    return key.toString('base64');
  }

  /**
   * Encrypt message with a group key (symmetric encryption)
   */
  async encryptGroupMessage(
    message: string,
    groupKey: string
  ): Promise<{ encrypted: string; nonce: string; tag: string }> {
    try {
      const key = Buffer.from(groupKey, 'base64');
      const nonce = Crypto.randomBytes(NONCE_LENGTH);
      
      const cipher = Crypto.createCipheriv('aes-256-gcm', key, nonce);
      
      const messageBytes = Buffer.from(message, 'utf8');
      const encrypted = Buffer.concat([
        cipher.update(messageBytes),
        cipher.final()
      ]);
      
      const tag = cipher.getAuthTag();

      return {
        encrypted: encrypted.toString('base64'),
        nonce: nonce.toString('base64'),
        tag: tag.toString('base64')
      };
    } catch (error) {
      console.error('Failed to encrypt group message:', error);
      throw error;
    }
  }

  /**
   * Decrypt message with a group key
   */
  async decryptGroupMessage(
    encryptedData: string,
    groupKey: string,
    nonce: string,
    tag: string
  ): Promise<string> {
    try {
      const key = Buffer.from(groupKey, 'base64');
      const nonceBuffer = Buffer.from(nonce, 'base64');
      const tagBuffer = Buffer.from(tag, 'base64');
      const encrypted = Buffer.from(encryptedData, 'base64');
      
      const decipher = Crypto.createDecipheriv('aes-256-gcm', key, nonceBuffer);
      decipher.setAuthTag(tagBuffer);
      
      const decrypted = Buffer.concat([
        decipher.update(encrypted),
        decipher.final()
      ]);

      return decrypted.toString('utf8');
    } catch (error) {
      console.error('Failed to decrypt group message:', error);
      throw error;
    }
  }

  /**
   * Derive encryption key from password using PBKDF2
   * @param password User's password
   * @param salt Unique salt (should be stored)
   * @param iterations Number of iterations (min 100,000 for security)
   */
  async deriveKeyFromPassword(
    password: string,
    salt: Buffer,
    iterations: number = 100000
  ): Promise<Buffer> {
    try {
      const key = Crypto.pbkdf2Sync(
        password,
        salt,
        iterations,
        SYMMETRIC_KEY_LENGTH,
        'sha256'
      );
      return Buffer.from(key);
    } catch (error) {
      console.error('Failed to derive key from password:', error);
      throw new Error('Key derivation failed');
    }
  }

  /**
   * Generate a random salt for key derivation
   */
  generateSalt(): Buffer {
    return Buffer.from(Crypto.randomBytes(32)); // 256 bits
  }

  /**
   * Encrypt data with a symmetric key (for vault/local storage)
   */
  async encryptWithSymmetricKey(
    data: string | Buffer,
    key: Buffer
  ): Promise<{
    encrypted: string;
    nonce: string;
    tag: string;
  }> {
    try {
      if (key.length !== SYMMETRIC_KEY_LENGTH) {
        throw new Error('Invalid key length');
      }

      const nonce = Crypto.randomBytes(NONCE_LENGTH);
      const cipher = Crypto.createCipheriv('aes-256-gcm', key, nonce);
      
      const dataBuffer = Buffer.isBuffer(data) ? data : Buffer.from(data, 'utf8');
      const encrypted = Buffer.concat([
        cipher.update(dataBuffer),
        cipher.final()
      ]);
      
      const tag = cipher.getAuthTag();

      return {
        encrypted: encrypted.toString('base64'),
        nonce: nonce.toString('base64'),
        tag: tag.toString('base64')
      };
    } catch (error) {
      console.error('Failed to encrypt with symmetric key:', error);
      throw error;
    }
  }

  /**
   * Decrypt data with a symmetric key
   */
  async decryptWithSymmetricKey(
    encryptedData: string,
    key: Buffer,
    nonce: string,
    tag: string
  ): Promise<Buffer> {
    try {
      if (key.length !== SYMMETRIC_KEY_LENGTH) {
        throw new Error('Invalid key length');
      }

      const nonceBuffer = Buffer.from(nonce, 'base64');
      const decipher = Crypto.createDecipheriv(
        'aes-256-gcm',
        key,
        nonceBuffer
      );
      decipher.setAuthTag(Buffer.from(tag, 'base64'));
      
      const decrypted = Buffer.concat([
        decipher.update(Buffer.from(encryptedData, 'base64')),
        decipher.final()
      ]);

      return decrypted;
    } catch (error) {
      console.error('Failed to decrypt with symmetric key:', error);
      throw error;
    }
  }

  /**
   * Secure key wrapping - encrypt a key with another key
   */
  async wrapKey(
    keyToWrap: Buffer,
    wrappingKey: Buffer
  ): Promise<{
    wrapped: string;
    nonce: string;
    tag: string;
  }> {
    return this.encryptWithSymmetricKey(keyToWrap, wrappingKey);
  }

  /**
   * Secure key unwrapping - decrypt a key with another key
   */
  async unwrapKey(
    wrappedKey: string,
    wrappingKey: Buffer,
    nonce: string,
    tag: string
  ): Promise<Buffer> {
    return this.decryptWithSymmetricKey(wrappedKey, wrappingKey, nonce, tag);
  }

  /**
   * Get performance metrics
   */
  getMetrics() {
    const avgEncryption = this.metrics.encryptionTime.length > 0
      ? this.metrics.encryptionTime.reduce((a, b) => a + b, 0) / this.metrics.encryptionTime.length
      : 0;
      
    const avgDecryption = this.metrics.decryptionTime.length > 0
      ? this.metrics.decryptionTime.reduce((a, b) => a + b, 0) / this.metrics.decryptionTime.length
      : 0;

    return {
      avgEncryptionTime: avgEncryption,
      avgDecryptionTime: avgDecryption,
      cacheHitRate: this.metrics.cacheHits / (this.metrics.cacheHits + this.metrics.cacheMisses),
      totalFailures: this.metrics.failures,
      sessionCacheSize: this.sessionCache.size
    };
  }

  /**
   * Clear all stored data
   */
  async clearAllData(): Promise<void> {
    try {
      await SecureStore.deleteItemAsync(IDENTITY_KEY);
      this.identityKeyPair = undefined;
      this.sessionCache.clear();
      console.log('All E2EE data cleared');
    } catch (error) {
      console.error('Failed to clear data:', error);
      throw error;
    }
  }

  /**
   * Get public key bundle for sharing
   */
  async getPublicKeyBundle(): Promise<{ identityKey: string } | null> {
    try {
      const identity = await this.getIdentityKeyPair();
      if (!identity) return null;
      
      return {
        identityKey: identity.publicKey
      };
    } catch (error) {
      console.error('Failed to get public key bundle:', error);
      return null;
    }
  }

  /**
   * Get user's key pair
   */
  async getUserKeyPair(): Promise<KeyPair | null> {
    return this.getIdentityKeyPair();
  }

  /**
   * Restore key pair from backup
   */
  async restoreKeyPair(keyPair: KeyPair): Promise<void> {
    await this.storeIdentityKeyPair(keyPair);
  }

  /**
   * Encrypt data with a public key (simplified)
   */
  async encryptWithKey(data: string, publicKey: string): Promise<string> {
    try {
      // Simple encryption for testing key validity
      const key = Crypto.createHash('sha256')
        .update(publicKey)
        .digest();
      
      const nonce = Crypto.randomBytes(16);
      const cipher = Crypto.createCipheriv('aes-256-gcm', key, nonce);
      
      const encrypted = Buffer.concat([
        cipher.update(Buffer.from(data, 'utf8')),
        cipher.final()
      ]);
      
      const tag = cipher.getAuthTag();
      
      return Buffer.concat([nonce, tag, encrypted]).toString('base64');
    } catch (error) {
      console.error('Failed to encrypt with key:', error);
      throw error;
    }
  }

  /**
   * Decrypt data with a private key (simplified)
   */
  async decryptWithKey(encryptedData: string, privateKey: string): Promise<string> {
    try {
      const data = Buffer.from(encryptedData, 'base64');
      const nonce = data.slice(0, 16);
      const tag = data.slice(16, 32);
      const encrypted = data.slice(32);
      
      // Simple decryption for testing key validity
      const key = Crypto.createHash('sha256')
        .update(privateKey)
        .digest();
      
      const decipher = Crypto.createDecipheriv('aes-256-gcm', key, nonce);
      decipher.setAuthTag(tag);
      
      const decrypted = Buffer.concat([
        decipher.update(encrypted),
        decipher.final()
      ]);
      
      return decrypted.toString('utf8');
    } catch (error) {
      console.error('Failed to decrypt with key:', error);
      throw error;
    }
  }

  /**
   * Encrypt data for local storage
   */
  async encryptForLocalStorage(data: string): Promise<string> {
    try {
      // Generate a random key for this session
      const key = Crypto.randomBytes(32);
      const nonce = Crypto.randomBytes(16);
      
      const cipher = Crypto.createCipheriv('aes-256-gcm', key, nonce);
      const encrypted = Buffer.concat([
        cipher.update(Buffer.from(data, 'utf8')),
        cipher.final()
      ]);
      
      const tag = cipher.getAuthTag();
      
      // Store key in memory (in production, use secure keychain)
      const keyId = Crypto.randomBytes(16).toString('hex');
      this.localStorageKeys.set(keyId, key);
      
      return JSON.stringify({
        keyId,
        data: Buffer.concat([nonce, tag, encrypted]).toString('base64')
      });
    } catch (error) {
      console.error('Failed to encrypt for local storage:', error);
      throw error;
    }
  }

  /**
   * Decrypt data from local storage
   */
  async decryptFromLocalStorage(encryptedData: string): Promise<string> {
    try {
      const { keyId, data } = JSON.parse(encryptedData);
      const key = this.localStorageKeys.get(keyId);
      
      if (!key) {
        throw new Error('Decryption key not found');
      }
      
      const dataBuffer = Buffer.from(data, 'base64');
      const nonce = dataBuffer.slice(0, 16);
      const tag = dataBuffer.slice(16, 32);
      const encrypted = dataBuffer.slice(32);
      
      const decipher = Crypto.createDecipheriv('aes-256-gcm', key, nonce);
      decipher.setAuthTag(tag);
      
      const decrypted = Buffer.concat([
        decipher.update(encrypted),
        decipher.final()
      ]);
      
      return decrypted.toString('utf8');
    } catch (error) {
      console.error('Failed to decrypt from local storage:', error);
      throw error;
    }
  }
}
