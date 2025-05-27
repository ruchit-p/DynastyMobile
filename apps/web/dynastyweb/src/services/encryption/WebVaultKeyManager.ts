// Web Vault Key Manager for Dynasty Web App
// Manages secure key storage using IndexedDB, Web Crypto API, and WebAuthn

import { WebVaultCryptoService } from './VaultCryptoService';
import { errorHandler, ErrorSeverity } from '../ErrorHandlingService';

// Constants
const DB_NAME = 'DynastyVaultKeys';
const DB_VERSION = 1;
const VAULT_KEYS_STORE = 'vaultKeys';
const FAMILY_KEYS_STORE = 'familyKeys';
const VAULT_CONFIG_STORE = 'vaultConfig';
const BIOMETRIC_CREDS_STORE = 'biometricCredentials';

// Session storage for active keys (cleared on browser close)
const SESSION_STORAGE_PREFIX = 'dynasty_vault_';

// Types
export interface VaultKeyInfo {
  keyId: string;
  userId: string;
  createdAt: number;
  rotatedAt?: number;
  isActive: boolean;
  version: string;
  encryptedKey: string; // Encrypted with user password
  salt: string; // For password derivation
  biometricCredentialId?: string; // Optional WebAuthn credential
}

export interface FamilyKeyPair {
  publicKey: string; // Base64 encoded
  privateKey: string; // Base64 encoded, encrypted
  keyId: string;
  userId: string;
  createdAt: number;
}

export interface VaultConfiguration {
  encryptionVersion: string;
  compressionEnabled: boolean;
  biometricEnabled: boolean;
  keyRotationEnabled: boolean;
  keyRotationIntervalDays: number;
  autoLockTimeoutMinutes: number;
}

export interface BiometricCredential {
  id: string;
  userId: string;
  credentialId: ArrayBuffer;
  publicKey: ArrayBuffer;
  createdAt: number;
  lastUsed: number;
}

/**
 * Web Vault Key Manager - Secure key storage for web platform
 * Uses IndexedDB for persistent storage and WebAuthn for biometric auth
 */
export class WebVaultKeyManager {
  private static instance: WebVaultKeyManager;
  private cryptoService: WebVaultCryptoService;
  private db: IDBDatabase | null = null;

  private constructor() {
    this.cryptoService = WebVaultCryptoService.getInstance();
  }

  static getInstance(): WebVaultKeyManager {
    if (!WebVaultKeyManager.instance) {
      WebVaultKeyManager.instance = new WebVaultKeyManager();
    }
    return WebVaultKeyManager.instance;
  }

  /**
   * Initialize the key manager and open IndexedDB
   */
  async initialize(): Promise<void> {
    if (this.db) return;

    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onerror = () => {
        errorHandler.handleError(request.error, ErrorSeverity.CRITICAL, {
          action: 'initialize-vault-key-manager'
        });
        reject(new Error('Failed to open vault keys database'));
      };

      request.onsuccess = () => {
        this.db = request.result;
        resolve();
      };

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;

        // Vault keys store
        if (!db.objectStoreNames.contains(VAULT_KEYS_STORE)) {
          const vaultStore = db.createObjectStore(VAULT_KEYS_STORE, {
            keyPath: 'keyId'
          });
          vaultStore.createIndex('userId', 'userId', { unique: false });
          vaultStore.createIndex('isActive', 'isActive', { unique: false });
        }

        // Family keys store
        if (!db.objectStoreNames.contains(FAMILY_KEYS_STORE)) {
          const familyStore = db.createObjectStore(FAMILY_KEYS_STORE, {
            keyPath: 'keyId'
          });
          familyStore.createIndex('userId', 'userId', { unique: false });
        }

        // Vault configuration store
        if (!db.objectStoreNames.contains(VAULT_CONFIG_STORE)) {
          db.createObjectStore(VAULT_CONFIG_STORE, {
            keyPath: 'userId'
          });
        }

        // Biometric credentials store
        if (!db.objectStoreNames.contains(BIOMETRIC_CREDS_STORE)) {
          const biometricStore = db.createObjectStore(BIOMETRIC_CREDS_STORE, {
            keyPath: 'id'
          });
          biometricStore.createIndex('userId', 'userId', { unique: false });
        }
      };
    });
  }

  // MARK: - Vault Master Key Management

  /**
   * Store vault master key encrypted with user password
   */
  async storeVaultMasterKey(
    userId: string,
    masterKey: Uint8Array,
    password: string,
    options: {
      enableBiometric?: boolean;
      keyRotation?: boolean;
    } = {}
  ): Promise<VaultKeyInfo> {
    await this.initialize();
    
    try {
      const { enableBiometric = false, keyRotation = false } = options;
      const keyId = this.cryptoService.generateSecureFileId();

      // Generate salt for password derivation
      const salt = this.cryptoService.generateSalt();

      // Derive encryption key from password
      const passwordKey = await this.cryptoService.deriveVaultMasterKey(password, salt);

      // Encrypt master key with password-derived key
      const { encrypted, nonce } = await this.cryptoService.encryptData(
        this.cryptoService.toBase64(masterKey),
        passwordKey
      );

      // Combine nonce and encrypted data
      const encryptedKeyData = new Uint8Array(nonce.length + encrypted.length);
      encryptedKeyData.set(nonce, 0);
      encryptedKeyData.set(encrypted, nonce.length);

      let biometricCredentialId: string | undefined;

      // Setup biometric authentication if requested
      if (enableBiometric && this.cryptoService.isWebAuthnSupported()) {
        const biometricResult = await this.cryptoService.createBiometricCredential(userId);
        if (biometricResult.success && biometricResult.credential) {
          biometricCredentialId = await this.storeBiometricCredential(
            userId,
            biometricResult.credential
          );
        }
      }

      // Create key info
      const keyInfo: VaultKeyInfo = {
        keyId,
        userId,
        createdAt: Date.now(),
        isActive: true,
        version: '2.0',
        encryptedKey: this.cryptoService.toBase64(encryptedKeyData),
        salt: this.cryptoService.toBase64(salt),
        biometricCredentialId
      };

      if (keyRotation) {
        keyInfo.rotatedAt = Date.now();
      }

      // Store in IndexedDB
      await this.storeKeyInfo(keyInfo);

      // Also store in session for immediate use
      this.storeKeyInSession(userId, masterKey);

      console.log(`WebVaultKeyManager: Master key stored for user ${userId}`);
      return keyInfo;
    } catch (error) {
      errorHandler.handleError(error, ErrorSeverity.CRITICAL, {
        action: 'store-vault-master-key',
        userId
      });
      throw new Error('Failed to store vault master key');
    }
  }

  /**
   * Retrieve vault master key (tries session first, then password/biometric)
   */
  async retrieveVaultMasterKey(
    userId: string,
    password?: string,
    useBiometric: boolean = false
  ): Promise<Uint8Array | null> {
    try {
      // Try session storage first
      const sessionKey = this.getKeyFromSession(userId);
      if (sessionKey) {
        return sessionKey;
      }

      // Get key info from IndexedDB
      const keyInfo = await this.getActiveKeyInfo(userId);
      if (!keyInfo) {
        return null;
      }

      let decryptedKey: Uint8Array;

      if (useBiometric && keyInfo.biometricCredentialId) {
        // Use biometric authentication
        decryptedKey = await this.retrieveKeyWithBiometric(userId, keyInfo);
      } else if (password) {
        // Use password authentication
        decryptedKey = await this.retrieveKeyWithPassword(password, keyInfo);
      } else {
        throw new Error('No authentication method provided');
      }

      // Store in session for future use
      this.storeKeyInSession(userId, decryptedKey);

      return decryptedKey;
    } catch (error) {
      errorHandler.handleError(error, ErrorSeverity.HIGH, {
        action: 'retrieve-vault-master-key',
        userId,
        useBiometric
      });
      throw new Error('Failed to retrieve vault master key');
    }
  }

  /**
   * Retrieve key using password authentication
   */
  private async retrieveKeyWithPassword(
    password: string,
    keyInfo: VaultKeyInfo
  ): Promise<Uint8Array> {
    try {
      // Derive decryption key from password
      const salt = this.cryptoService.fromBase64(keyInfo.salt);
      const passwordKey = await this.cryptoService.deriveVaultMasterKey(password, salt);

      // Decrypt master key
      const encryptedKeyData = this.cryptoService.fromBase64(keyInfo.encryptedKey);
      const nonce = encryptedKeyData.slice(0, 24); // sodium.crypto_secretbox_NONCEBYTES
      const encrypted = encryptedKeyData.slice(24);

      const decryptedBase64 = await this.cryptoService.decryptData(
        encrypted,
        nonce,
        passwordKey
      );

      return this.cryptoService.fromBase64(decryptedBase64);
    } catch (error) {
      throw new Error('Invalid password or corrupted key data');
    }
  }

  /**
   * Retrieve key using biometric authentication
   */
  private async retrieveKeyWithBiometric(
    userId: string,
    keyInfo: VaultKeyInfo
  ): Promise<Uint8Array> {
    if (!keyInfo.biometricCredentialId) {
      throw new Error('No biometric credential available');
    }

    try {
      // Get biometric credential
      const credential = await this.getBiometricCredential(keyInfo.biometricCredentialId);
      if (!credential) {
        throw new Error('Biometric credential not found');
      }

      // Authenticate with WebAuthn
      const authResult = await this.cryptoService.authenticateWithBiometric(
        credential.credentialId
      );

      if (!authResult.success) {
        throw new Error(authResult.error || 'Biometric authentication failed');
      }

      // Derive decryption key from biometric credential
      const biometricKey = await this.deriveBiometricKey(
        credential.publicKey,
        authResult.credential!
      );

      // Try to decrypt the master key with biometric-derived key
      const encryptedKeyData = this.cryptoService.fromBase64(keyInfo.encryptedKey);
      const nonce = encryptedKeyData.slice(0, 24); // First 24 bytes are nonce
      const encrypted = encryptedKeyData.slice(24); // Rest is encrypted data

      const decrypted = await this.cryptoService.decryptData(
        { encrypted, nonce },
        biometricKey
      );

      return this.cryptoService.fromBase64(decrypted);
    } catch (error) {
      errorHandler.handleError(error, ErrorSeverity.HIGH, {
        action: 'retrieve-key-with-biometric',
        userId
      });
      throw error;
    }
  }

  /**
   * Derive encryption key from biometric credential
   */
  private async deriveBiometricKey(
    storedPublicKey: ArrayBuffer,
    authCredential: PublicKeyCredential
  ): Promise<Uint8Array> {
    try {
      // Create a deterministic key from the biometric credential
      const response = authCredential.response as AuthenticatorAssertionResponse;
      const authData = new Uint8Array(response.authenticatorData);
      const signature = new Uint8Array(response.signature);
      
      // Combine authenticator data and signature for key derivation
      const combinedData = new Uint8Array(authData.length + signature.length);
      combinedData.set(authData, 0);
      combinedData.set(signature, authData.length);
      
      // Use Web Crypto API to derive a consistent key
      const keyMaterial = await crypto.subtle.importKey(
        'raw',
        combinedData,
        { name: 'PBKDF2' },
        false,
        ['deriveKey']
      );
      
      const derivedKey = await crypto.subtle.deriveKey(
        {
          name: 'PBKDF2',
          salt: storedPublicKey,
          iterations: 100000,
          hash: 'SHA-256'
        },
        keyMaterial,
        { name: 'AES-GCM', length: 256 },
        true,
        ['encrypt', 'decrypt']
      );
      
      const exportedKey = await crypto.subtle.exportKey('raw', derivedKey);
      return new Uint8Array(exportedKey);
    } catch (error) {
      errorHandler.handleError(error, ErrorSeverity.HIGH, {
        action: 'derive-biometric-key'
      });
      throw new Error('Failed to derive biometric key');
    }
  }

  // MARK: - Family Key Management

  /**
   * Generate and store family keypair for vault sharing
   */
  async generateFamilyKeyPair(userId: string, password: string): Promise<FamilyKeyPair> {
    await this.initialize();
    
    try {
      const keyPair = this.cryptoService.generateKeyPair();
      const keyId = this.cryptoService.generateSecureFileId();

      // Encrypt private key with user's password
      const salt = this.cryptoService.generateSalt();
      const passwordKey = await this.cryptoService.deriveVaultMasterKey(password, salt);
      
      const { encrypted, nonce } = await this.cryptoService.encryptData(
        this.cryptoService.toBase64(keyPair.privateKey),
        passwordKey
      );

      const encryptedPrivateKeyData = new Uint8Array(nonce.length + encrypted.length);
      encryptedPrivateKeyData.set(nonce, 0);
      encryptedPrivateKeyData.set(encrypted, nonce.length);

      const familyKeyPair: FamilyKeyPair = {
        publicKey: this.cryptoService.toBase64(keyPair.publicKey),
        privateKey: this.cryptoService.toBase64(encryptedPrivateKeyData),
        keyId,
        userId,
        createdAt: Date.now()
      };

      // Store in IndexedDB
      await this.storeFamilyKeyPair(familyKeyPair);

      console.log(`WebVaultKeyManager: Family keypair generated for user ${userId}`);
      return familyKeyPair;
    } catch (error) {
      errorHandler.handleError(error, ErrorSeverity.HIGH, {
        action: 'generate-family-keypair',
        userId
      });
      throw new Error('Failed to generate family keypair');
    }
  }

  // MARK: - Session Management

  /**
   * Store key in session storage (cleared when browser closes)
   */
  private storeKeyInSession(userId: string, key: Uint8Array): void {
    try {
      const keyBase64 = this.cryptoService.toBase64(key);
      sessionStorage.setItem(`${SESSION_STORAGE_PREFIX}${userId}`, keyBase64);
    } catch (error) {
      // Session storage might be full or disabled, that's ok
      console.warn('Failed to store key in session storage:', error);
    }
  }

  /**
   * Get key from session storage
   */
  private getKeyFromSession(userId: string): Uint8Array | null {
    try {
      const keyBase64 = sessionStorage.getItem(`${SESSION_STORAGE_PREFIX}${userId}`);
      if (!keyBase64) return null;
      
      return this.cryptoService.fromBase64(keyBase64);
    } catch (error) {
      return null;
    }
  }

  /**
   * Clear key from session storage
   */
  clearSessionKey(userId: string): void {
    try {
      sessionStorage.removeItem(`${SESSION_STORAGE_PREFIX}${userId}`);
    } catch (error) {
      // Ignore errors
    }
  }

  /**
   * Clear all session keys
   */
  clearAllSessionKeys(): void {
    try {
      Object.keys(sessionStorage).forEach(key => {
        if (key.startsWith(SESSION_STORAGE_PREFIX)) {
          sessionStorage.removeItem(key);
        }
      });
    } catch (error) {
      // Ignore errors
    }
  }

  // MARK: - Vault Configuration

  /**
   * Store vault configuration
   */
  async storeVaultConfiguration(
    userId: string,
    config: VaultConfiguration
  ): Promise<void> {
    await this.initialize();
    
    try {
      const transaction = this.db!.transaction([VAULT_CONFIG_STORE], 'readwrite');
      const store = transaction.objectStore(VAULT_CONFIG_STORE);
      
      await new Promise<void>((resolve, reject) => {
        const request = store.put({ userId, ...config });
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
      });

      console.log(`WebVaultKeyManager: Configuration stored for user ${userId}`);
    } catch (error) {
      errorHandler.handleError(error, ErrorSeverity.MEDIUM, {
        action: 'store-vault-configuration',
        userId
      });
      throw new Error('Failed to store vault configuration');
    }
  }

  /**
   * Retrieve vault configuration
   */
  async retrieveVaultConfiguration(userId: string): Promise<VaultConfiguration | null> {
    await this.initialize();
    
    try {
      const transaction = this.db!.transaction([VAULT_CONFIG_STORE], 'readonly');
      const store = transaction.objectStore(VAULT_CONFIG_STORE);
      
      return new Promise<VaultConfiguration | null>((resolve, reject) => {
        const request = store.get(userId);
        request.onsuccess = () => {
          const result = request.result;
          if (result) {
            const { userId: _, ...config } = result;
            resolve(config as VaultConfiguration);
          } else {
            resolve(null);
          }
        };
        request.onerror = () => reject(request.error);
      });
    } catch (error) {
      errorHandler.handleError(error, ErrorSeverity.MEDIUM, {
        action: 'retrieve-vault-configuration',
        userId
      });
      return null;
    }
  }

  // MARK: - Utility Methods

  /**
   * Check if vault keys exist for user
   */
  async hasVaultKeys(userId: string): Promise<boolean> {
    try {
      const keyInfo = await this.getActiveKeyInfo(userId);
      return keyInfo !== null;
    } catch (error) {
      return false;
    }
  }

  /**
   * Delete all vault keys for user
   */
  async deleteVaultKeys(userId: string): Promise<void> {
    await this.initialize();
    
    try {
      const transaction = this.db!.transaction([
        VAULT_KEYS_STORE,
        FAMILY_KEYS_STORE,
        VAULT_CONFIG_STORE,
        BIOMETRIC_CREDS_STORE
      ], 'readwrite');

      // Delete from all stores
      const promises = [
        this.deleteFromStore(transaction, VAULT_KEYS_STORE, 'userId', userId),
        this.deleteFromStore(transaction, FAMILY_KEYS_STORE, 'userId', userId),
        this.deleteFromStore(transaction, VAULT_CONFIG_STORE, null, userId),
        this.deleteFromStore(transaction, BIOMETRIC_CREDS_STORE, 'userId', userId)
      ];

      await Promise.all(promises);

      // Clear session storage
      this.clearSessionKey(userId);

      console.log(`WebVaultKeyManager: All vault keys deleted for user ${userId}`);
    } catch (error) {
      errorHandler.handleError(error, ErrorSeverity.HIGH, {
        action: 'delete-vault-keys',
        userId
      });
      throw new Error('Failed to delete vault keys');
    }
  }

  // MARK: - Private Helper Methods

  private async storeKeyInfo(keyInfo: VaultKeyInfo): Promise<void> {
    const transaction = this.db!.transaction([VAULT_KEYS_STORE], 'readwrite');
    const store = transaction.objectStore(VAULT_KEYS_STORE);
    
    return new Promise<void>((resolve, reject) => {
      const request = store.put(keyInfo);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  private async getActiveKeyInfo(userId: string): Promise<VaultKeyInfo | null> {
    const transaction = this.db!.transaction([VAULT_KEYS_STORE], 'readonly');
    const store = transaction.objectStore(VAULT_KEYS_STORE);
    const index = store.index('userId');
    
    return new Promise<VaultKeyInfo | null>((resolve, reject) => {
      const request = index.getAll(userId);
      request.onsuccess = () => {
        const results = request.result as VaultKeyInfo[];
        const activeKey = results.find(key => key.isActive);
        resolve(activeKey || null);
      };
      request.onerror = () => reject(request.error);
    });
  }

  private async storeFamilyKeyPair(keyPair: FamilyKeyPair): Promise<void> {
    const transaction = this.db!.transaction([FAMILY_KEYS_STORE], 'readwrite');
    const store = transaction.objectStore(FAMILY_KEYS_STORE);
    
    return new Promise<void>((resolve, reject) => {
      const request = store.put(keyPair);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  private async storeBiometricCredential(
    userId: string,
    credential: PublicKeyCredential
  ): Promise<string> {
    const credentialId = this.cryptoService.generateSecureFileId();
    const response = credential.response as AuthenticatorAttestationResponse;
    
    const biometricCred: BiometricCredential = {
      id: credentialId,
      userId,
      credentialId: credential.rawId,
      publicKey: response.getPublicKey()!,
      createdAt: Date.now(),
      lastUsed: Date.now()
    };

    const transaction = this.db!.transaction([BIOMETRIC_CREDS_STORE], 'readwrite');
    const store = transaction.objectStore(BIOMETRIC_CREDS_STORE);
    
    await new Promise<void>((resolve, reject) => {
      const request = store.put(biometricCred);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });

    return credentialId;
  }

  private async getBiometricCredential(id: string): Promise<BiometricCredential | null> {
    const transaction = this.db!.transaction([BIOMETRIC_CREDS_STORE], 'readonly');
    const store = transaction.objectStore(BIOMETRIC_CREDS_STORE);
    
    return new Promise<BiometricCredential | null>((resolve, reject) => {
      const request = store.get(id);
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error);
    });
  }

  private async deleteFromStore(
    transaction: IDBTransaction,
    storeName: string,
    indexName: string | null,
    value: string
  ): Promise<void> {
    const store = transaction.objectStore(storeName);
    
    if (indexName) {
      const index = store.index(indexName);
      const request = index.getAll(value);
      
      return new Promise<void>((resolve, reject) => {
        request.onsuccess = () => {
          const deletePromises = request.result.map((item: any) =>
            new Promise<void>((res, rej) => {
              const deleteRequest = store.delete(item[store.keyPath as string]);
              deleteRequest.onsuccess = () => res();
              deleteRequest.onerror = () => rej(deleteRequest.error);
            })
          );
          
          Promise.all(deletePromises).then(() => resolve()).catch(reject);
        };
        request.onerror = () => reject(request.error);
      });
    } else {
      return new Promise<void>((resolve, reject) => {
        const request = store.delete(value);
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
      });
    }
  }
} 