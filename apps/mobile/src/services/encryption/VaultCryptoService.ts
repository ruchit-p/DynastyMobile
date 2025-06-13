import _sodium, { loadSumoVersion } from 'react-native-libsodium';
import * as FileSystem from 'expo-file-system';
import { Buffer } from '@craftzdog/react-native-buffer';
import { logger } from '../LoggingService';

// Load SUMO version for crypto_pwhash functions
loadSumoVersion();

// Constants for vault encryption
const SECRETSTREAM_CHUNK_SIZE = 32 * 1024; // 32KB optimal for mobile
const MAX_FILE_SIZE = 100 * 1024 * 1024; // 100MB
const KEY_DERIVATION_CONTEXT = 'VaultKey'; // 8 bytes max for libsodium
const FILE_DERIVATION_CONTEXT = 'FileKey '; // 8 bytes with space padding

// Types
export interface EncryptedFileMetadata {
  originalName: string;
  mimeType: string;
  size: number;
  chunkCount: number;
  timestamp: number;
  version: string;
}

export interface FileEncryptionResult {
  header: Uint8Array;
  encryptedChunks: Uint8Array[];
  metadata: EncryptedFileMetadata;
  totalSize: number;
}

export interface VaultKeyDerivationResult {
  key: Uint8Array;
  salt: Uint8Array;
}

export interface FileStreamChunk {
  data: Uint8Array;
  isLast: boolean;
  chunkIndex: number;
}

export class VaultCryptoService {
  private static instance: VaultCryptoService;
  private sodiumReady: Promise<void>;
  private sodium: any;

  private constructor() {
    this.sodiumReady = this.initializeSodium();
  }

  static getInstance(): VaultCryptoService {
    if (!VaultCryptoService.instance) {
      VaultCryptoService.instance = new VaultCryptoService();
    }
    return VaultCryptoService.instance;
  }

  private async initializeSodium(): Promise<void> {
    await _sodium.ready;
    this.sodium = _sodium;
    logger.info('VaultCryptoService: libsodium initialized');
  }

  /**
   * Ensure sodium is ready before any crypto operations
   */
  private async ensureSodiumReady(): Promise<void> {
    await this.sodiumReady;
  }

  /**
   * Generate a secure random salt for key derivation
   */
  generateSalt(): Uint8Array {
    const salt = new Uint8Array(this.sodium.crypto_pwhash_SALTBYTES);
    this.sodium.randombytes_buf(salt);
    return salt;
  }

  /**
   * Derive vault master key from user password using Argon2id
   * Uses INTERACTIVE parameters for mobile performance
   */
  async deriveVaultMasterKey(
    password: string, 
    salt: Uint8Array
  ): Promise<Uint8Array> {
    await this.ensureSodiumReady();
    
    try {
      const keyLength = 32; // 256-bit key
      const derivedKey = new Uint8Array(keyLength);
      
      const result = this.sodium.crypto_pwhash(
        derivedKey,
        keyLength,
        password,
        salt,
        this.sodium.crypto_pwhash_OPSLIMIT_INTERACTIVE, // 2 iterations
        this.sodium.crypto_pwhash_MEMLIMIT_INTERACTIVE, // 64MB memory
        this.sodium.crypto_pwhash_ALG_ARGON2ID13
      );

      if (result !== 0) {
        throw new Error('Out of memory during key derivation');
      }

      logger.info('VaultCryptoService: Master key derived successfully');
      return derivedKey;
    } catch (error) {
      logger.error('VaultCryptoService: Failed to derive master key:', error);
      throw new Error('Failed to derive vault master key');
    }
  }

  /**
   * Derive file-specific key from vault master key using crypto_kdf
   * Each file gets a unique key derived from the master key
   */
  deriveFileKey(vaultMasterKey: Uint8Array, fileId: string): Uint8Array {
    try {
      // Create deterministic subkey ID from file ID
      const fileIdHash = this.sodium.crypto_generichash(8, fileId);
      const subkeyId = new Uint8Array(fileIdHash.slice(0, 8));
      
      return this.sodium.crypto_kdf_derive_from_key(
        32, // 256-bit key
        subkeyId,
        FILE_DERIVATION_CONTEXT,
        vaultMasterKey
      );
    } catch (error) {
      logger.error('VaultCryptoService: Failed to derive file key:', error);
      throw new Error('Failed to derive file encryption key');
    }
  }

  /**
   * Create a stream for reading file in chunks
   */
  private async *createFileStream(fileUri: string): AsyncGenerator<FileStreamChunk> {
    const fileInfo = await FileSystem.getInfoAsync(fileUri);
    if (!fileInfo.exists) {
      throw new Error('File does not exist');
    }

    const fileSize = fileInfo.size || 0;
    if (fileSize > MAX_FILE_SIZE) {
      throw new Error(`File too large. Maximum size is ${MAX_FILE_SIZE / (1024 * 1024)}MB`);
    }

    let processedBytes = 0;
    let chunkIndex = 0;

    while (processedBytes < fileSize) {
      const chunkSize = Math.min(SECRETSTREAM_CHUNK_SIZE, fileSize - processedBytes);
      
      try {
        // Read chunk as base64 and convert to Uint8Array
        const chunkBase64 = await FileSystem.readAsStringAsync(fileUri, {
          encoding: FileSystem.EncodingType.Base64,
          position: processedBytes,
          length: chunkSize
        });
        
        const chunkData = new Uint8Array(Buffer.from(chunkBase64, 'base64'));
        const isLast = (processedBytes + chunkSize) >= fileSize;
        
        yield {
          data: chunkData,
          isLast,
          chunkIndex
        };
        
        processedBytes += chunkSize;
        chunkIndex++;
      } catch (error) {
        logger.error(`VaultCryptoService: Failed to read chunk at position ${processedBytes}:`, error);
        throw new Error(`Failed to read file chunk at position ${processedBytes}`);
      }
    }
  }

  /**
   * Encrypt a large file using libsodium's secretstream for streaming encryption
   * Provides forward secrecy and authentication for each chunk
   */
  async encryptLargeFile(
    fileUri: string, 
    fileKey: Uint8Array,
    originalName: string,
    mimeType: string
  ): Promise<FileEncryptionResult> {
    await this.ensureSodiumReady();
    
    try {
      logger.info(`VaultCryptoService: Starting encryption of file: ${originalName}`);
      
      // Get file info for metadata
      const fileInfo = await FileSystem.getInfoAsync(fileUri);
      if (!fileInfo.exists) {
        throw new Error('File does not exist');
      }

      // Initialize secretstream for streaming encryption
      const initResult = this.sodium.crypto_secretstream_xchacha20poly1305_init_push(fileKey);
      const state = initResult.state;
      const header = initResult.header;
      
      const encryptedChunks: Uint8Array[] = [];
      let chunkCount = 0;
      
      // Create file stream and encrypt chunks
      for await (const chunk of this.createFileStream(fileUri)) {
        const tag = chunk.isLast ? 
          this.sodium.crypto_secretstream_xchacha20poly1305_TAG_FINAL : 
          this.sodium.crypto_secretstream_xchacha20poly1305_TAG_MESSAGE;
        
        const encryptedChunk = this.sodium.crypto_secretstream_xchacha20poly1305_push(
          state, 
          chunk.data, 
          null, 
          tag
        );
        
        encryptedChunks.push(encryptedChunk);
        chunkCount++;
        
        // Progress logging for large files
        if (chunkCount % 10 === 0) {
          logger.debug(`VaultCryptoService: Encrypted ${chunkCount} chunks`);
        }
      }

      // Calculate total encrypted size
      const totalSize = encryptedChunks.reduce((sum, chunk) => sum + chunk.length, 0) + header.length;

      const metadata: EncryptedFileMetadata = {
        originalName,
        mimeType,
        size: fileInfo.size || 0,
        chunkCount,
        timestamp: Date.now(),
        version: '1.0'
      };

      logger.info(`VaultCryptoService: File encrypted successfully. Chunks: ${chunkCount}, Total size: ${totalSize} bytes`);
      
      return {
        header,
        encryptedChunks,
        metadata,
        totalSize
      };
    } catch (error) {
      logger.error('VaultCryptoService: Failed to encrypt large file:', error);
      throw new Error(`Failed to encrypt file: ${error.message}`);
    }
  }

  /**
   * Decrypt a large file from encrypted chunks using secretstream
   */
  async decryptLargeFile(
    header: Uint8Array,
    encryptedChunks: Uint8Array[],
    fileKey: Uint8Array,
    outputUri?: string
  ): Promise<string> {
    await this.ensureSodiumReady();
    
    try {
      logger.info(`VaultCryptoService: Starting decryption of file with ${encryptedChunks.length} chunks`);
      
      // Initialize secretstream for decryption
      const state = this.sodium.crypto_secretstream_xchacha20poly1305_init_pull(header, fileKey);
      
      const decryptedChunks: Uint8Array[] = [];
      
      // Decrypt each chunk
      for (let i = 0; i < encryptedChunks.length; i++) {
        const pullResult = this.sodium.crypto_secretstream_xchacha20poly1305_pull(
          state, 
          encryptedChunks[i]
        );
        
        if (!pullResult) {
          throw new Error(`Failed to decrypt chunk ${i}`);
        }
        
        decryptedChunks.push(pullResult.message);
        
        // Verify tag for last chunk
        if (i === encryptedChunks.length - 1) {
          if (pullResult.tag !== this.sodium.crypto_secretstream_xchacha20poly1305_TAG_FINAL) {
            logger.warn('VaultCryptoService: Final chunk does not have FINAL tag');
          }
        }
      }

      // Combine decrypted chunks
      const totalLength = decryptedChunks.reduce((sum, chunk) => sum + chunk.length, 0);
      const decryptedData = new Uint8Array(totalLength);
      let offset = 0;
      
      for (const chunk of decryptedChunks) {
        decryptedData.set(chunk, offset);
        offset += chunk.length;
      }

      // Generate output path if not provided
      const finalOutputUri = outputUri || 
        `${FileSystem.cacheDirectory}decrypted_${Date.now()}_file`;

      // Write decrypted file
      await FileSystem.writeAsStringAsync(
        finalOutputUri,
        Buffer.from(decryptedData).toString('base64'),
        { encoding: FileSystem.EncodingType.Base64 }
      );

      logger.info(`VaultCryptoService: File decrypted successfully to: ${finalOutputUri}`);
      return finalOutputUri;
    } catch (error) {
      logger.error('VaultCryptoService: Failed to decrypt large file:', error);
      throw new Error(`Failed to decrypt file: ${error.message}`);
    }
  }

  /**
   * Encrypt small data (metadata, search terms) with authenticated encryption
   */
  async encryptData(data: string, key: Uint8Array): Promise<{
    encrypted: Uint8Array;
    nonce: Uint8Array;
  }> {
    await this.ensureSodiumReady();
    
    try {
      const nonce = this.sodium.randombytes_buf(this.sodium.crypto_box_NONCEBYTES);
      const encrypted = this.sodium.crypto_box_easy(
        this.sodium.from_string(data),
        nonce,
        key,
        key // Using same key for public/private (symmetric operation)
      );
      
      return { encrypted, nonce };
    } catch (error) {
      logger.error('VaultCryptoService: Failed to encrypt data:', error);
      throw new Error('Failed to encrypt data');
    }
  }

  /**
   * Decrypt small data (metadata, search terms)
   */
  async decryptData(
    encrypted: Uint8Array, 
    nonce: Uint8Array, 
    key: Uint8Array
  ): Promise<string> {
    await this.ensureSodiumReady();
    
    try {
      const decrypted = this.sodium.crypto_box_open_easy(
        encrypted,
        nonce,
        key,
        key // Using same key for public/private (symmetric operation)
      );
      
      return this.sodium.to_string(decrypted);
    } catch (error) {
      logger.error('VaultCryptoService: Failed to decrypt data:', error);
      throw new Error('Failed to decrypt data');
    }
  }

  /**
   * Generate deterministic hash for searchable encryption
   */
  generateSearchHash(term: string, searchKey: Uint8Array): string {
    try {
      const termBytes = this.sodium.from_string(term.toLowerCase().trim());
      const hash = this.sodium.crypto_shorthash(
        termBytes,
        searchKey.slice(0, this.sodium.crypto_shorthash_KEYBYTES)
      );
      return this.sodium.to_hex(hash);
    } catch (error) {
      logger.error('VaultCryptoService: Failed to generate search hash:', error);
      throw new Error('Failed to generate search hash');
    }
  }

  /**
   * Generate a secure file ID
   */
  generateSecureFileId(): string {
    const randomBytes = this.sodium.randombytes_buf(16);
    return this.sodium.to_hex(randomBytes);
  }

  /**
   * Securely compare two byte arrays (constant time)
   */
  secureCompare(a: Uint8Array, b: Uint8Array): boolean {
    if (a.length !== b.length) {
      return false;
    }
    
    try {
      return this.sodium.memcmp(a, b);
    } catch (error) {
      logger.error('VaultCryptoService: Failed to compare arrays:', error);
      return false;
    }
  }

  /**
   * Generate keypair for family vault sharing
   */
  generateKeyPair(): { publicKey: Uint8Array; privateKey: Uint8Array } {
    try {
      const keyPair = this.sodium.crypto_box_keypair();
      return {
        publicKey: keyPair.publicKey,
        privateKey: keyPair.secretKey
      };
    } catch (error) {
      logger.error('VaultCryptoService: Failed to generate keypair:', error);
      throw new Error('Failed to generate keypair');
    }
  }

  /**
   * Encrypt vault key for family member sharing
   */
  async encryptVaultKeyForMember(
    vaultKey: Uint8Array,
    memberPublicKey: Uint8Array,
    senderPrivateKey: Uint8Array
  ): Promise<Uint8Array> {
    await this.ensureSodiumReady();
    
    try {
      const nonce = this.sodium.randombytes_buf(this.sodium.crypto_box_NONCEBYTES);
      const encrypted = this.sodium.crypto_box_easy(
        vaultKey,
        nonce,
        memberPublicKey,
        senderPrivateKey
      );
      
      // Prepend nonce to encrypted data
      const result = new Uint8Array(nonce.length + encrypted.length);
      result.set(nonce, 0);
      result.set(encrypted, nonce.length);
      
      return result;
    } catch (error) {
      logger.error('VaultCryptoService: Failed to encrypt vault key for member:', error);
      throw new Error('Failed to encrypt vault key for family member');
    }
  }

  /**
   * Decrypt vault key from family member
   */
  async decryptVaultKeyFromMember(
    encryptedData: Uint8Array,
    senderPublicKey: Uint8Array,
    receiverPrivateKey: Uint8Array
  ): Promise<Uint8Array> {
    await this.ensureSodiumReady();
    
    try {
      const nonceLength = this.sodium.crypto_box_NONCEBYTES;
      const nonce = encryptedData.slice(0, nonceLength);
      const encrypted = encryptedData.slice(nonceLength);
      
      const decrypted = this.sodium.crypto_box_open_easy(
        encrypted,
        nonce,
        senderPublicKey,
        receiverPrivateKey
      );
      
      return decrypted;
    } catch (error) {
      logger.error('VaultCryptoService: Failed to decrypt vault key from member:', error);
      throw new Error('Failed to decrypt vault key from family member');
    }
  }

  /**
   * Get crypto library version info for debugging
   */
  getVersionInfo(): string {
    return `libsodium version: ${this.sodium.sodium_version_string}`;
  }
}

export default VaultCryptoService.getInstance();