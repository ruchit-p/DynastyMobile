import { randomBytes, createCipheriv, createDecipheriv, createHash } from 'react-native-quick-crypto';
import { Buffer } from '@craftzdog/react-native-buffer';
import { LibsignalService } from './libsignal/LibsignalService';
import { logger } from '../LoggingService';

interface EncryptedMetadata {
  encryptedData: string; // Base64
  nonce: string; // Base64
  mac: string; // Base64
}

interface MessageMetadata {
  timestamp: number;
  senderId: string;
  senderName?: string;
  messageType: string;
  fileSize?: number;
  fileName?: string;
  mimeType?: string;
  duration?: number; // For audio/video
  thumbnailUrl?: string;
  replyTo?: string; // Message ID being replied to
  editedAt?: number;
  reactions?: { [userId: string]: string[] }; // User reactions
}

interface FileMetadata {
  fileName: string;
  fileSize: number;
  mimeType: string;
  createdAt: number;
  modifiedAt: number;
  uploadedBy: string;
  lastAccessedAt?: number;
  accessCount: number;
  tags?: string[];
  description?: string;
  sharedWith?: string[];
  expiresAt?: number;
}

export class MetadataEncryptionService {
  private static instance: MetadataEncryptionService;
  private readonly ALGORITHM = 'aes-256-gcm';
  private readonly KEY_LENGTH = 32;
  private readonly NONCE_LENGTH = 16;
  private readonly TAG_LENGTH = 16;

  // Metadata-specific encryption key (derived from user's master key)
  private metadataKey?: Buffer;

  private constructor() {}

  static getInstance(): MetadataEncryptionService {
    if (!MetadataEncryptionService.instance) {
      MetadataEncryptionService.instance = new MetadataEncryptionService();
    }
    return MetadataEncryptionService.instance;
  }

  /**
   * Initialize metadata encryption with a derived key
   */
  async initialize(userId: string) {
    try {
      // Derive a metadata-specific key from the user's master key
      const masterKey = await LibsignalService.getInstance().getIdentityKeyPair();
      if (!masterKey) {
        throw new Error('Master key not found');
      }

      // Use HKDF to derive metadata key
      const salt = Buffer.from('dynasty-metadata-v1', 'utf8');
      const info = Buffer.from(`metadata-${userId}`, 'utf8');
      
      const hash = createHash('sha256');
      hash.update(Buffer.from(masterKey.privateKey, 'base64'));
      hash.update(salt);
      hash.update(info);
      
      this.metadataKey = Buffer.from(hash.digest()).slice(0, this.KEY_LENGTH);
    } catch (error) {
      logger.error('Failed to initialize metadata encryption:', error);
      throw error;
    }
  }

  /**
   * Encrypt message metadata
   */
  async encryptMessageMetadata(metadata: MessageMetadata): Promise<EncryptedMetadata> {
    if (!this.metadataKey) {
      throw new Error('Metadata encryption not initialized');
    }

    try {
      // Serialize metadata
      const metadataJson = JSON.stringify(metadata);
      const metadataBuffer = Buffer.from(metadataJson, 'utf8');

      // Generate nonce
      const nonce = randomBytes(this.NONCE_LENGTH);

      // Encrypt
      const cipher = createCipheriv(this.ALGORITHM, this.metadataKey, nonce);
      const encrypted = Buffer.concat([
        cipher.update(metadataBuffer),
        cipher.final()
      ]);

      // Get auth tag
      const authTag = cipher.getAuthTag();

      // Combine encrypted data and auth tag
      const combined = Buffer.concat([encrypted, authTag]);

      return {
        encryptedData: combined.toString('base64'),
        nonce: nonce.toString('base64'),
        mac: authTag.toString('base64')
      };
    } catch (error) {
      logger.error('Failed to encrypt message metadata:', error);
      throw error;
    }
  }

  /**
   * Decrypt message metadata
   */
  async decryptMessageMetadata(encryptedMetadata: EncryptedMetadata): Promise<MessageMetadata> {
    if (!this.metadataKey) {
      throw new Error('Metadata encryption not initialized');
    }

    try {
      // Decode from base64
      const combined = Buffer.from(encryptedMetadata.encryptedData, 'base64');
      const nonce = Buffer.from(encryptedMetadata.nonce, 'base64');

      // Split encrypted data and auth tag
      const encrypted = combined.slice(0, -this.TAG_LENGTH);
      const authTag = combined.slice(-this.TAG_LENGTH);

      // Decrypt
      const decipher = createDecipheriv(this.ALGORITHM, this.metadataKey, nonce);
      decipher.setAuthTag(authTag);

      const decrypted = Buffer.concat([
        decipher.update(encrypted),
        decipher.final()
      ]);

      // Parse metadata
      const metadataJson = decrypted.toString('utf8');
      return JSON.parse(metadataJson) as MessageMetadata;
    } catch (error) {
      logger.error('Failed to decrypt message metadata:', error);
      throw error;
    }
  }

  /**
   * Encrypt file metadata
   */
  async encryptFileMetadata(metadata: FileMetadata): Promise<EncryptedMetadata> {
    if (!this.metadataKey) {
      throw new Error('Metadata encryption not initialized');
    }

    try {
      // Serialize metadata
      const metadataJson = JSON.stringify(metadata);
      const metadataBuffer = Buffer.from(metadataJson, 'utf8');

      // Generate nonce
      const nonce = randomBytes(this.NONCE_LENGTH);

      // Encrypt
      const cipher = createCipheriv(this.ALGORITHM, this.metadataKey, nonce);
      const encrypted = Buffer.concat([
        cipher.update(metadataBuffer),
        cipher.final()
      ]);

      // Get auth tag
      const authTag = cipher.getAuthTag();

      // Combine encrypted data and auth tag
      const combined = Buffer.concat([encrypted, authTag]);

      return {
        encryptedData: combined.toString('base64'),
        nonce: nonce.toString('base64'),
        mac: authTag.toString('base64')
      };
    } catch (error) {
      logger.error('Failed to encrypt file metadata:', error);
      throw error;
    }
  }

  /**
   * Decrypt file metadata
   */
  async decryptFileMetadata(encryptedMetadata: EncryptedMetadata): Promise<FileMetadata> {
    if (!this.metadataKey) {
      throw new Error('Metadata encryption not initialized');
    }

    try {
      // Decode from base64
      const combined = Buffer.from(encryptedMetadata.encryptedData, 'base64');
      const nonce = Buffer.from(encryptedMetadata.nonce, 'base64');

      // Split encrypted data and auth tag
      const encrypted = combined.slice(0, -this.TAG_LENGTH);
      const authTag = combined.slice(-this.TAG_LENGTH);

      // Decrypt
      const decipher = createDecipheriv(this.ALGORITHM, this.metadataKey, nonce);
      decipher.setAuthTag(authTag);

      const decrypted = Buffer.concat([
        decipher.update(encrypted),
        decipher.final()
      ]);

      // Parse metadata
      const metadataJson = decrypted.toString('utf8');
      return JSON.parse(metadataJson) as FileMetadata;
    } catch (error) {
      logger.error('Failed to decrypt file metadata:', error);
      throw error;
    }
  }

  /**
   * Create searchable encrypted index
   * Uses deterministic encryption for specific fields to enable search
   */
  async createSearchableIndex(
    text: string,
    searchableFields: string[]
  ): Promise<{ [field: string]: string }> {
    if (!this.metadataKey) {
      throw new Error('Metadata encryption not initialized');
    }

    const index: { [field: string]: string } = {};

    for (const field of searchableFields) {
      // Create deterministic hash for searchable fields
      const hash = createHash('sha256');
      hash.update(this.metadataKey);
      hash.update(Buffer.from(field, 'utf8'));
      hash.update(Buffer.from(text.toLowerCase(), 'utf8'));
      
      index[field] = hash.digest('hex');
    }

    return index;
  }

  /**
   * Search encrypted metadata
   */
  async searchEncryptedMetadata(
    searchTerm: string,
    field: string
  ): Promise<string> {
    if (!this.metadataKey) {
      throw new Error('Metadata encryption not initialized');
    }

    // Generate search hash
    const hash = createHash('sha256');
    hash.update(this.metadataKey);
    hash.update(Buffer.from(field, 'utf8'));
    hash.update(Buffer.from(searchTerm.toLowerCase(), 'utf8'));
    
    return hash.digest('hex');
  }

  /**
   * Encrypt timestamp with some obfuscation
   */
  encryptTimestamp(timestamp: number): string {
    if (!this.metadataKey) {
      throw new Error('Metadata encryption not initialized');
    }

    // Add random jitter (±5 minutes) to obfuscate exact timing
    const jitter = Math.floor(Math.random() * 600000) - 300000;
    const obfuscatedTime = timestamp + jitter;

    // Encrypt the timestamp
    const nonce = randomBytes(this.NONCE_LENGTH);
    const timestampBuffer = Buffer.allocUnsafe(8);
    timestampBuffer.writeBigInt64BE(BigInt(obfuscatedTime));

    const cipher = createCipheriv(this.ALGORITHM, this.metadataKey, nonce);
    const encrypted = Buffer.concat([
      cipher.update(timestampBuffer),
      cipher.final()
    ]);

    const authTag = cipher.getAuthTag();
    const combined = Buffer.concat([nonce, encrypted, authTag]);

    return combined.toString('base64');
  }

  /**
   * Decrypt timestamp
   */
  decryptTimestamp(encryptedTimestamp: string): number {
    if (!this.metadataKey) {
      throw new Error('Metadata encryption not initialized');
    }

    const combined = Buffer.from(encryptedTimestamp, 'base64');
    const nonce = combined.slice(0, this.NONCE_LENGTH);
    const encrypted = combined.slice(this.NONCE_LENGTH, -this.TAG_LENGTH);
    const authTag = combined.slice(-this.TAG_LENGTH);

    const decipher = createDecipheriv(this.ALGORITHM, this.metadataKey, nonce);
    decipher.setAuthTag(authTag);

    const decrypted = Buffer.concat([
      decipher.update(encrypted),
      decipher.final()
    ]);

    return Number(decrypted.readBigInt64BE());
  }

  /**
   * Clear metadata encryption key (on logout)
   */
  clearKeys() {
    if (this.metadataKey) {
      this.metadataKey.fill(0);
      this.metadataKey = undefined;
    }
  }
}

export default MetadataEncryptionService.getInstance();