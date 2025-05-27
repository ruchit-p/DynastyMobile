// End-to-End Encryption Service for Dynasty Web App
// Implements WebCrypto API for secure communication

import { errorHandler, ErrorSeverity } from '../ErrorHandlingService';
import { getKeyCacheService } from './KeyCacheService';

export interface KeyPair {
  publicKey: CryptoKey;
  privateKey: CryptoKey;
}

export interface ExportedKeyPair {
  publicKey: string;
  privateKey: string;
}

export interface EncryptedData {
  ciphertext: string;
  iv: string;
  salt?: string;
  ephemeralPublicKey?: string;
}

class E2EEService {
  private static instance: E2EEService;
  private keyPair?: KeyPair;
  private peerPublicKeys = new Map<string, CryptoKey>();

  private constructor() {}

  static getInstance(): E2EEService {
    if (!E2EEService.instance) {
      E2EEService.instance = new E2EEService();
    }
    return E2EEService.instance;
  }

  // Key Generation

  async generateKeyPair(): Promise<KeyPair> {
    try {
      const keyPair = await crypto.subtle.generateKey(
        {
          name: 'ECDH',
          namedCurve: 'P-256',
        },
        true,
        ['deriveKey']
      );

      this.keyPair = keyPair as KeyPair;
      return this.keyPair;
    } catch (error) {
      errorHandler.handleError(error, ErrorSeverity.CRITICAL, {
        action: 'generate-key-pair'
      });
      throw error;
    }
  }

  async exportKeyPair(keyPair: KeyPair): Promise<ExportedKeyPair> {
    try {
      const publicKeyData = await crypto.subtle.exportKey('spki', keyPair.publicKey);
      const privateKeyData = await crypto.subtle.exportKey('pkcs8', keyPair.privateKey);

      return {
        publicKey: this.arrayBufferToBase64(publicKeyData),
        privateKey: this.arrayBufferToBase64(privateKeyData),
      };
    } catch (error) {
      errorHandler.handleError(error, ErrorSeverity.HIGH, {
        action: 'export-key-pair'
      });
      throw error;
    }
  }

  async importKeyPair(exportedKeyPair: ExportedKeyPair): Promise<KeyPair> {
    try {
      const publicKeyData = this.base64ToArrayBuffer(exportedKeyPair.publicKey);
      const privateKeyData = this.base64ToArrayBuffer(exportedKeyPair.privateKey);

      const publicKey = await crypto.subtle.importKey(
        'spki',
        publicKeyData,
        {
          name: 'ECDH',
          namedCurve: 'P-256',
        },
        true,
        []
      );

      const privateKey = await crypto.subtle.importKey(
        'pkcs8',
        privateKeyData,
        {
          name: 'ECDH',
          namedCurve: 'P-256',
        },
        true,
        ['deriveKey']
      );

      const keyPair = { publicKey, privateKey };
      this.keyPair = keyPair;
      return keyPair;
    } catch (error) {
      errorHandler.handleError(error, ErrorSeverity.HIGH, {
        action: 'import-key-pair'
      });
      throw error;
    }
  }

  async importPublicKey(publicKeyBase64: string, peerId: string): Promise<CryptoKey> {
    try {
      const publicKeyData = this.base64ToArrayBuffer(publicKeyBase64);
      
      const publicKey = await crypto.subtle.importKey(
        'spki',
        publicKeyData,
        {
          name: 'ECDH',
          namedCurve: 'P-256',
        },
        true,
        []
      );

      this.peerPublicKeys.set(peerId, publicKey);
      return publicKey;
    } catch (error) {
      errorHandler.handleError(error, ErrorSeverity.HIGH, {
        action: 'import-public-key',
        peerId
      });
      throw error;
    }
  }

  // Encryption/Decryption

  async encryptMessage(
    message: string,
    recipientPublicKey: CryptoKey
  ): Promise<EncryptedData> {
    if (!this.keyPair) {
      throw new Error('Key pair not initialized');
    }

    try {
      // Derive shared secret
      const sharedSecret = await crypto.subtle.deriveKey(
        {
          name: 'ECDH',
          public: recipientPublicKey,
        },
        this.keyPair.privateKey,
        {
          name: 'AES-GCM',
          length: 256,
        },
        false,
        ['encrypt', 'decrypt']
      );

      // Generate IV
      const iv = crypto.getRandomValues(new Uint8Array(12));

      // Encrypt message
      const encoder = new TextEncoder();
      const ciphertext = await crypto.subtle.encrypt(
        {
          name: 'AES-GCM',
          iv,
        },
        sharedSecret,
        encoder.encode(message)
      );

      return {
        ciphertext: this.arrayBufferToBase64(ciphertext),
        iv: this.arrayBufferToBase64(iv.buffer.slice(iv.byteOffset, iv.byteOffset + iv.byteLength)),
      };
    } catch (error) {
      errorHandler.handleError(error, ErrorSeverity.HIGH, {
        action: 'encrypt-message'
      });
      throw error;
    }
  }

  async decryptMessage(
    encryptedData: EncryptedData,
    senderPublicKey: CryptoKey
  ): Promise<string> {
    if (!this.keyPair) {
      throw new Error('Key pair not initialized');
    }

    try {
      // Derive shared secret
      const sharedSecret = await crypto.subtle.deriveKey(
        {
          name: 'ECDH',
          public: senderPublicKey,
        },
        this.keyPair.privateKey,
        {
          name: 'AES-GCM',
          length: 256,
        },
        false,
        ['encrypt', 'decrypt']
      );

      // Decrypt message
      const ciphertext = this.base64ToArrayBuffer(encryptedData.ciphertext);
      const iv = this.base64ToArrayBuffer(encryptedData.iv);

      const decrypted = await crypto.subtle.decrypt(
        {
          name: 'AES-GCM',
          iv,
        },
        sharedSecret,
        ciphertext
      );

      const decoder = new TextDecoder();
      return decoder.decode(decrypted);
    } catch (error) {
      errorHandler.handleError(error, ErrorSeverity.HIGH, {
        action: 'decrypt-message'
      });
      throw error;
    }
  }

  // File Encryption

  async encryptFile(file: ArrayBuffer, recipientPublicKey: CryptoKey): Promise<{
    encryptedFile: ArrayBuffer;
    metadata: EncryptedData;
  }> {
    if (!this.keyPair) {
      throw new Error('Key pair not initialized');
    }

    try {
      // Generate file encryption key
      const fileKey = await crypto.subtle.generateKey(
        {
          name: 'AES-GCM',
          length: 256,
        },
        true,
        ['encrypt', 'decrypt']
      );

      // Generate IV for file encryption
      const fileIv = crypto.getRandomValues(new Uint8Array(12));

      // Encrypt file
      const encryptedFile = await crypto.subtle.encrypt(
        {
          name: 'AES-GCM',
          iv: fileIv,
        },
        fileKey,
        file
      );

      // Export file key
      const exportedFileKey = await crypto.subtle.exportKey('raw', fileKey);
      const fileKeyBase64 = this.arrayBufferToBase64(exportedFileKey);

      // Encrypt file key with recipient's public key
      const encryptedFileKey = await this.encryptMessage(fileKeyBase64, recipientPublicKey);

      return {
        encryptedFile,
        metadata: {
          ...encryptedFileKey,
          iv: this.arrayBufferToBase64(fileIv.buffer.slice(fileIv.byteOffset, fileIv.byteOffset + fileIv.byteLength)),
        },
      };
    } catch (error) {
      errorHandler.handleError(error, ErrorSeverity.HIGH, {
        action: 'encrypt-file'
      });
      throw error;
    }
  }

  async decryptFile(
    encryptedFile: ArrayBuffer,
    metadata: EncryptedData,
    senderPublicKey: CryptoKey
  ): Promise<ArrayBuffer> {
    try {
      // Decrypt file key
      const fileKeyBase64 = await this.decryptMessage(
        {
          ciphertext: metadata.ciphertext,
          iv: metadata.iv,
        },
        senderPublicKey
      );

      // Import file key
      const fileKeyData = this.base64ToArrayBuffer(fileKeyBase64);
      const fileKey = await crypto.subtle.importKey(
        'raw',
        fileKeyData,
        {
          name: 'AES-GCM',
          length: 256,
        },
        false,
        ['decrypt']
      );

      // Decrypt file
      const fileIv = this.base64ToArrayBuffer(metadata.iv);
      const decryptedFile = await crypto.subtle.decrypt(
        {
          name: 'AES-GCM',
          iv: fileIv,
        },
        fileKey,
        encryptedFile
      );

      return decryptedFile;
    } catch (error) {
      errorHandler.handleError(error, ErrorSeverity.HIGH, {
        action: 'decrypt-file'
      });
      throw error;
    }
  }

  // Key Management

  async generateFingerprint(publicKey: CryptoKey): Promise<string> {
    try {
      const publicKeyData = await crypto.subtle.exportKey('spki', publicKey);
      const hash = await crypto.subtle.digest('SHA-256', publicKeyData);
      const fingerprint = this.arrayBufferToHex(hash);
      
      // Format as readable fingerprint
      return fingerprint.match(/.{1,4}/g)?.join(' ') || fingerprint;
    } catch (error) {
      errorHandler.handleError(error, ErrorSeverity.MEDIUM, {
        action: 'generate-fingerprint'
      });
      throw error;
    }
  }

  async deriveKeyFromPassword(password: string, salt?: Uint8Array): Promise<{
    key: CryptoKey;
    salt: Uint8Array;
  }> {
    try {
      // Generate salt if not provided
      if (!salt) {
        salt = crypto.getRandomValues(new Uint8Array(16));
      }

      // Use cache service for performance
      const keyCache = getKeyCacheService();
      const derivedKey = await keyCache.getOrDeriveKey(
        password,
        salt,
        async () => {
          const encoder = new TextEncoder();
          const passwordData = encoder.encode(password);

          // Import password as key
          const passwordKey = await crypto.subtle.importKey(
            'raw',
            passwordData,
            'PBKDF2',
            false,
            ['deriveKey']
          );

          // Derive key
          return await crypto.subtle.deriveKey(
            {
              name: 'PBKDF2',
              salt,
              iterations: 210000, // Updated to OWASP 2024 recommendation
              hash: 'SHA-256',
            },
            passwordKey,
            {
              name: 'AES-GCM',
              length: 256,
            },
            true,
            ['encrypt', 'decrypt']
          );
        }
      );

      return { key: derivedKey, salt };
    } catch (error) {
      errorHandler.handleError(error, ErrorSeverity.HIGH, {
        action: 'derive-key-from-password'
      });
      throw error;
    }
  }

  // Utility Functions

  private arrayBufferToBase64(buffer: ArrayBuffer): string {
    const bytes = new Uint8Array(buffer);
    let binary = '';
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  }

  private base64ToArrayBuffer(base64: string): ArrayBuffer {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes.buffer;
  }

  private arrayBufferToHex(buffer: ArrayBuffer): string {
    const bytes = new Uint8Array(buffer);
    return Array.from(bytes)
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');
  }

  // Session Management

  clearKeys() {
    this.keyPair = undefined;
    this.peerPublicKeys.clear();
  }

  getCurrentKeyPair(): KeyPair | undefined {
    return this.keyPair;
  }

  getPeerPublicKey(peerId: string): CryptoKey | undefined {
    return this.peerPublicKeys.get(peerId);
  }
}

// Export singleton instance
export const e2eeService = E2EEService.getInstance();