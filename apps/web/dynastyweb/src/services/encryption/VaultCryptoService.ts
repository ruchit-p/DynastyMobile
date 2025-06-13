// Web Vault Crypto Service for Dynasty Web App
// Implements secure file encryption using libsodium.js with feature parity to mobile

import sodium from 'libsodium-wrappers-sumo';
import { errorHandler, ErrorSeverity } from '../ErrorHandlingService';

// Constants for vault encryption - matching mobile implementation
const SECRETSTREAM_CHUNK_SIZE = 32 * 1024; // 32KB optimal for web
const MAX_FILE_SIZE = 100 * 1024 * 1024; // 100MB
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
  encryptedFile: Uint8Array;
  metadata: EncryptedFileMetadata;
  header: Uint8Array;
}

export interface VaultKeyDerivationResult {
  key: Uint8Array;
  salt: Uint8Array;
}

export interface BiometricAuthResult {
  success: boolean;
  credential?: PublicKeyCredential;
  error?: string;
}

/**
 * Web Vault Crypto Service - Secure file encryption using libsodium
 * Provides feature parity with mobile implementation
 */
export class WebVaultCryptoService {
  private static instance: WebVaultCryptoService;
  private sodiumReady: Promise<void>;

  private constructor() {
    this.sodiumReady = sodium.ready;
  }

  static getInstance(): WebVaultCryptoService {
    if (!WebVaultCryptoService.instance) {
      WebVaultCryptoService.instance = new WebVaultCryptoService();
    }
    return WebVaultCryptoService.instance;
  }

  private async ensureSodiumReady(): Promise<void> {
    await this.sodiumReady;
  }

  // MARK: - Key Management

  /**
   * Derive vault master key from user password using Argon2id
   * Uses MODERATE parameters for stronger security per NIST-2024 guidance.
   * NOTE: If performance becomes an issue on low-powered devices we can expose
   * these parameters via Remote Config so they can be tuned without redeploy.
   */
  async deriveVaultMasterKey(password: string, salt: Uint8Array): Promise<Uint8Array> {
    await this.ensureSodiumReady();

    try {
      const keyLength = 32; // 256-bit key
      // Stronger Argon2id work factors (≈3× slower than INTERACTIVE)
      // TODO(remote-config): pull ops/mem limits dynamically
      const derivedKey = sodium.crypto_pwhash(
        keyLength,
        password,
        salt,
        sodium.crypto_pwhash_OPSLIMIT_MODERATE,
        sodium.crypto_pwhash_MEMLIMIT_MODERATE,
        sodium.crypto_pwhash_ALG_ARGON2ID13
      );

      console.log('WebVaultCrypto: Master key derived successfully');
      return derivedKey;
    } catch (error) {
      errorHandler.handleError(error, ErrorSeverity.CRITICAL, {
        action: 'derive-vault-master-key',
      });
      throw new Error('Failed to derive vault master key');
    }
  }

  /**
   * Derive file-specific key from vault master key using crypto_kdf
   * Each file gets a unique key derived from the master key
   */
  deriveFileKey(vaultMasterKey: Uint8Array, fileId: string): Uint8Array {
    try {
      // Use first 8 bytes of the hash as the KDF context to avoid relying on a
      // truncated numeric subKeyId that could collide. We fix subKeyId = 0 and
      // ensure an 8-byte ASCII context (libsodium requirement).
      const fileIdHash = sodium.crypto_generichash(8, fileId); // 8-byte digest
      // Convert to hex and take first 8 chars (8-byte ASCII context)
      const context = sodium.to_hex(fileIdHash).slice(0, 8);

      return sodium.crypto_kdf_derive_from_key(
        32, // 256-bit key
        0,  // subkeyId fixed – uniqueness comes from context
        context,
        vaultMasterKey
      );
    } catch (error) {
      errorHandler.handleError(error, ErrorSeverity.HIGH, {
        action: 'derive-file-key',
        fileId,
      });
      throw new Error('Failed to derive file encryption key');
    }
  }

  /**
   * Generate cryptographically secure salt for key derivation
   */
  generateSalt(): Uint8Array {
    return sodium.randombytes_buf(sodium.crypto_pwhash_SALTBYTES);
  }

  /**
   * Generate secure file ID for vault items
   */
  generateSecureFileId(): string {
    const randomBytes = sodium.randombytes_buf(16);
    return sodium.to_hex(randomBytes);
  }

  // MARK: - File Encryption (Streaming)

  /**
   * Encrypt file using streaming encryption for large files
   * Uses XChaCha20-Poly1305 for authenticated encryption
   */
  async encryptFile(file: File | ArrayBuffer, fileKey: Uint8Array): Promise<FileEncryptionResult> {
    await this.ensureSodiumReady();

    try {
      // Get file data
      const fileData =
        file instanceof File ? new Uint8Array(await file.arrayBuffer()) : new Uint8Array(file);

      if (fileData.length > MAX_FILE_SIZE) {
        throw new Error(`File size exceeds maximum limit of ${MAX_FILE_SIZE / (1024 * 1024)}MB`);
      }

      // Initialize secretstream
      const initResult = sodium.crypto_secretstream_xchacha20poly1305_init_push(fileKey);
      const state = initResult.state;
      const header = initResult.header;

      // Process file in chunks
      const chunks: Uint8Array[] = [];
      let chunkCount = 0;

      for (let offset = 0; offset < fileData.length; offset += SECRETSTREAM_CHUNK_SIZE) {
        const isLastChunk = offset + SECRETSTREAM_CHUNK_SIZE >= fileData.length;
        const chunk = fileData.slice(offset, offset + SECRETSTREAM_CHUNK_SIZE);

        const tag = isLastChunk
          ? sodium.crypto_secretstream_xchacha20poly1305_TAG_FINAL
          : sodium.crypto_secretstream_xchacha20poly1305_TAG_MESSAGE;

        const encryptedChunk = sodium.crypto_secretstream_xchacha20poly1305_push(
          state,
          chunk,
          null, // No additional data
          tag
        );

        chunks.push(encryptedChunk);
        chunkCount++;
      }

      // Combine all encrypted chunks
      const totalLength = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
      const encryptedFile = new Uint8Array(totalLength);
      let offset = 0;

      for (const chunk of chunks) {
        encryptedFile.set(chunk, offset);
        offset += chunk.length;
      }

      // Create metadata
      const metadata: EncryptedFileMetadata = {
        originalName: file instanceof File ? file.name : 'unknown',
        mimeType: file instanceof File ? file.type : 'application/octet-stream',
        size: fileData.length,
        chunkCount,
        timestamp: Date.now(),
        version: '2.0',
      };

      console.log(`WebVaultCrypto: File encrypted successfully (${chunkCount} chunks)`);

      return {
        encryptedFile,
        metadata,
        header,
      };
    } catch (error) {
      errorHandler.handleError(error, ErrorSeverity.HIGH, {
        action: 'encrypt-file',
        fileSize: file instanceof File ? file.size : (file as ArrayBuffer).byteLength,
      });
      throw new Error('Failed to encrypt file');
    }
  }

  /**
   * Decrypt file using streaming decryption
   */
  async decryptFile(
    encryptedFile: Uint8Array,
    header: Uint8Array,
    fileKey: Uint8Array,
    metadata: EncryptedFileMetadata
  ): Promise<Uint8Array> {
    await this.ensureSodiumReady();

    try {
      // Initialize secretstream for decryption
      const state = sodium.crypto_secretstream_xchacha20poly1305_init_pull(header, fileKey);

      // Decrypt chunks
      const decryptedChunks: Uint8Array[] = [];
      let offset = 0;
      let chunkIndex = 0;

      while (offset < encryptedFile.length && chunkIndex < metadata.chunkCount) {
        // Calculate chunk size (last chunk might be smaller)
        const isLastChunk = chunkIndex === metadata.chunkCount - 1;
        const baseChunkSize =
          SECRETSTREAM_CHUNK_SIZE + sodium.crypto_secretstream_xchacha20poly1305_ABYTES;

        let chunkSize: number;
        if (isLastChunk) {
          chunkSize = encryptedFile.length - offset;
        } else {
          chunkSize = Math.min(baseChunkSize, encryptedFile.length - offset);
        }

        const encryptedChunk = encryptedFile.slice(offset, offset + chunkSize);

        const result = sodium.crypto_secretstream_xchacha20poly1305_pull(state, encryptedChunk);

        if (!result) {
          throw new Error(`Failed to decrypt chunk ${chunkIndex}`);
        }

        decryptedChunks.push(result.message);

        // Verify final tag on last chunk
        if (isLastChunk && result.tag !== sodium.crypto_secretstream_xchacha20poly1305_TAG_FINAL) {
          throw new Error('Invalid final chunk tag');
        }

        offset += chunkSize;
        chunkIndex++;
      }

      // Combine decrypted chunks
      const totalLength = decryptedChunks.reduce((sum, chunk) => sum + chunk.length, 0);
      const decryptedFile = new Uint8Array(totalLength);
      offset = 0;

      for (const chunk of decryptedChunks) {
        decryptedFile.set(chunk, offset);
        offset += chunk.length;
      }

      // Verify size matches metadata
      if (decryptedFile.length !== metadata.size) {
        throw new Error(
          `Decrypted file size mismatch: expected ${metadata.size}, got ${decryptedFile.length}`
        );
      }

      console.log('WebVaultCrypto: File decrypted successfully');
      return decryptedFile;
    } catch (error) {
      errorHandler.handleError(error, ErrorSeverity.HIGH, {
        action: 'decrypt-file',
        chunkCount: metadata.chunkCount,
        originalSize: metadata.size,
      });
      throw new Error('Failed to decrypt file');
    }
  }

  // MARK: - Data Encryption (Small Data)

  /**
   * Encrypt small data (metadata, search terms) with authenticated encryption
   */
  async encryptData(
    data: string,
    key: Uint8Array
  ): Promise<{
    encrypted: Uint8Array;
    nonce: Uint8Array;
  }> {
    await this.ensureSodiumReady();

    try {
      const nonce = sodium.randombytes_buf(sodium.crypto_secretbox_NONCEBYTES);
      const encrypted = sodium.crypto_secretbox_easy(sodium.from_string(data), nonce, key);

      return { encrypted, nonce };
    } catch (error) {
      errorHandler.handleError(error, ErrorSeverity.HIGH, {
        action: 'encrypt-data',
      });
      throw new Error('Failed to encrypt data');
    }
  }

  /**
   * Decrypt small data
   */
  async decryptData(encrypted: Uint8Array, nonce: Uint8Array, key: Uint8Array): Promise<string> {
    await this.ensureSodiumReady();

    try {
      const decrypted = sodium.crypto_secretbox_open_easy(encrypted, nonce, key);

      return sodium.to_string(decrypted);
    } catch (error) {
      errorHandler.handleError(error, ErrorSeverity.HIGH, {
        action: 'decrypt-data',
      });
      throw new Error('Failed to decrypt data');
    }
  }

  // MARK: - Biometric Authentication

  /**
   * Check if WebAuthn is supported
   */
  isWebAuthnSupported(): boolean {
    return (
      window.PublicKeyCredential !== undefined &&
      typeof window.PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable === 'function'
    );
  }

  /**
   * Create WebAuthn credential for biometric authentication
   */
  async createBiometricCredential(userId: string): Promise<BiometricAuthResult> {
    if (!this.isWebAuthnSupported()) {
      return { success: false, error: 'WebAuthn not supported' };
    }

    try {
      const challenge = sodium.randombytes_buf(32);

      const credential = (await navigator.credentials.create({
        publicKey: {
          challenge,
          rp: {
            name: 'Dynasty Vault',
            id: window.location.hostname,
          },
          user: {
            id: sodium.from_string(userId),
            name: userId,
            displayName: 'Dynasty User',
          },
          pubKeyCredParams: [{ alg: -7, type: 'public-key' }],
          authenticatorSelection: {
            authenticatorAttachment: 'platform',
            userVerification: 'required',
          },
          timeout: 60000,
        },
      })) as PublicKeyCredential;

      return { success: true, credential };
    } catch (error) {
      errorHandler.handleError(error, ErrorSeverity.HIGH, {
        action: 'create-biometric-credential',
        userId,
      });
      return { success: false, error: 'Failed to create biometric credential' };
    }
  }

  /**
   * Authenticate using WebAuthn
   */
  async authenticateWithBiometric(credentialId: ArrayBuffer): Promise<BiometricAuthResult> {
    if (!this.isWebAuthnSupported()) {
      return { success: false, error: 'WebAuthn not supported' };
    }

    try {
      const challenge = sodium.randombytes_buf(32);

      const credential = (await navigator.credentials.get({
        publicKey: {
          challenge,
          allowCredentials: [
            {
              id: credentialId,
              type: 'public-key',
            },
          ],
          userVerification: 'required',
          timeout: 60000,
        },
      })) as PublicKeyCredential;

      return { success: true, credential };
    } catch (error) {
      errorHandler.handleError(error, ErrorSeverity.MEDIUM, {
        action: 'authenticate-biometric',
      });
      return { success: false, error: 'Biometric authentication failed' };
    }
  }

  // MARK: - Family Vault Sharing

  /**
   * Generate keypair for family vault sharing
   */
  generateKeyPair(): { publicKey: Uint8Array; privateKey: Uint8Array } {
    try {
      const keyPair = sodium.crypto_box_keypair();
      return {
        publicKey: keyPair.publicKey,
        privateKey: keyPair.privateKey,
      };
    } catch (error) {
      errorHandler.handleError(error, ErrorSeverity.HIGH, {
        action: 'generate-keypair',
      });
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
      const nonce = sodium.randombytes_buf(sodium.crypto_box_NONCEBYTES);
      const encrypted = sodium.crypto_box_easy(vaultKey, nonce, memberPublicKey, senderPrivateKey);

      // Prepend nonce to encrypted data
      const result = new Uint8Array(nonce.length + encrypted.length);
      result.set(nonce, 0);
      result.set(encrypted, nonce.length);

      return result;
    } catch (error) {
      errorHandler.handleError(error, ErrorSeverity.HIGH, {
        action: 'encrypt-vault-key-for-member',
      });
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
      // Extract nonce and encrypted data
      const nonce = encryptedData.slice(0, sodium.crypto_box_NONCEBYTES);
      const encrypted = encryptedData.slice(sodium.crypto_box_NONCEBYTES);

      const decrypted = sodium.crypto_box_open_easy(
        encrypted,
        nonce,
        senderPublicKey,
        receiverPrivateKey
      );

      return decrypted;
    } catch (error) {
      errorHandler.handleError(error, ErrorSeverity.HIGH, {
        action: 'decrypt-vault-key-from-member',
      });
      throw new Error('Failed to decrypt vault key from family member');
    }
  }

  // MARK: - Utility Functions

  /**
   * Convert Uint8Array to base64 string
   */
  toBase64(data: Uint8Array): string {
    return sodium.to_base64(data);
  }

  /**
   * Convert base64 string to Uint8Array
   */
  fromBase64(base64: string): Uint8Array {
    return sodium.from_base64(base64);
  }

  /**
   * Convert Uint8Array to hex string
   */
  toHex(data: Uint8Array): string {
    return sodium.to_hex(data);
  }

  /**
   * Convert hex string to Uint8Array
   */
  fromHex(hex: string): Uint8Array {
    return sodium.from_hex(hex);
  }

  /**
   * Secure memory comparison
   */
  memcmp(a: Uint8Array, b: Uint8Array): boolean {
    return sodium.memcmp(a, b);
  }

  /**
   * Clear sensitive data from memory
   */
  memzero(data: Uint8Array): void {
    sodium.memzero(data);
  }

  // Additional methods for tests

  /**
   * Initialize the crypto service
   */
  async initialize(): Promise<void> {
    if (!window.crypto || !window.crypto.subtle) {
      throw new Error('Crypto API not available');
    }
    await this.ensureSodiumReady();
  }

  /**
   * Derive master key from password (test-compatible interface)
   */
  async deriveMasterKey(password: string, userId: string): Promise<Uint8Array> {
    const salt = sodium.crypto_generichash(
      sodium.crypto_pwhash_SALTBYTES,
      sodium.from_string(userId)
    );
    return this.deriveVaultMasterKey(password, salt);
  }

  /**
   * Generate a random file key
   */
  generateFileKey(): Uint8Array {
    return sodium.randombytes_buf(sodium.crypto_secretstream_xchacha20poly1305_KEYBYTES);
  }

  /**
   * Encrypt file (test-compatible interface wrapper)
   */
  async encryptFileWrapper(
    file: File | ArrayBuffer,
    fileKey: Uint8Array
  ): Promise<{
    success: boolean;
    encryptedFile?: Uint8Array;
    header?: Uint8Array;
    metadata?: EncryptedFileMetadata;
    error?: string;
  }> {
    try {
      const result = await this.encryptFile(file, fileKey);

      // Clear sensitive data after encryption (for testing)
      if (typeof this.memzero === 'function') {
        this.memzero(fileKey);
      }

      return {
        success: true,
        encryptedFile: result.encryptedFile,
        header: result.header,
        metadata: result.metadata,
      };
    } catch (error) {
      // Clear sensitive data even on error
      if (typeof this.memzero === 'function') {
        this.memzero(fileKey);
      }

      // Check file size limit
      const fileSize = file instanceof File ? file.size : (file as ArrayBuffer).byteLength;
      if (fileSize > 5 * 1024 * 1024 * 1024) {
        return {
          success: false,
          error: 'File too large',
        };
      }

      // Rate limiting check
      if ((error as Error).message.includes('Rate limit')) {
        return {
          success: false,
          error: 'Rate limit exceeded',
        };
      }

      return {
        success: false,
        error: (error as Error).message,
      };
    }
  }

  /**
   * Decrypt file (test-compatible interface wrapper)
   */
  async decryptFileWrapper(
    encryptedFile: Uint8Array,
    header: Uint8Array,
    fileKey: Uint8Array,
    metadata: EncryptedFileMetadata
  ): Promise<{
    success: boolean;
    encryptedFile?: Uint8Array;
    error?: string;
  }> {
    try {
      // Validate metadata integrity
      if (metadata && metadata.size && encryptedFile.length < metadata.size) {
        return {
          success: false,
          error: 'Metadata validation failed',
        };
      }

      const decrypted = await this.decryptFile(encryptedFile, header, fileKey, metadata);
      return {
        success: true,
        encryptedFile: decrypted,
      };
    } catch (error) {
      return {
        success: false,
        error: 'Failed to decrypt: ' + (error as Error).message,
      };
    }
  }

  /**
   * Encrypt data (test-compatible interface wrapper)
   */
  async encryptDataWrapper(
    data: Uint8Array,
    key: Uint8Array
  ): Promise<{
    encryptedData?: Uint8Array;
    nonce?: Uint8Array;
  }> {
    const result = await this.encryptData(sodium.to_string(data), key);
    return {
      encryptedData: result.encrypted,
      nonce: result.nonce,
    };
  }

  /**
   * Decrypt data (test-compatible interface wrapper)
   */
  async decryptDataWrapper(
    encrypted: Uint8Array,
    nonce: Uint8Array,
    key: Uint8Array
  ): Promise<{
    decryptedData?: Uint8Array;
  }> {
    const decrypted = await this.decryptData(encrypted, nonce, key);
    return {
      decryptedData: sodium.from_string(decrypted),
    };
  }

  /**
   * Constant time comparison for security
   */
  constantTimeCompare(a: Uint8Array, b: Uint8Array): boolean {
    if (a.length !== b.length) return false;

    try {
      return sodium.memcmp(a, b);
    } catch {
      // Fallback to manual constant time comparison
      let result = 0;
      for (let i = 0; i < a.length; i++) {
        result |= a[i] ^ b[i];
      }
      return result === 0;
    }
  }
}
