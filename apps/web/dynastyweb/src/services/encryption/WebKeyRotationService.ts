// Web Key Rotation Service for Dynasty Web App
// Provides automatic key rotation, warning system, and lifecycle management

import { WebVaultCryptoService } from './VaultCryptoService';
import { WebVaultKeyManager } from './WebVaultKeyManager';
import { errorHandler, ErrorSeverity } from '../ErrorHandlingService';

// Types
export interface RotatingKeyPair {
  id: string;
  keyPair: {
    publicKey: ArrayBuffer;
    privateKey: ArrayBuffer;
  };
  createdAt: number;
  expiresAt: number;
  isActive: boolean;
  version: number;
}

export interface KeyRotationConfig {
  rotationIntervalMs: number;
  maxActiveKeys: number;
  preRotationWarningMs: number;
  autoRotationEnabled: boolean;
}

export interface KeyRotationEvent {
  type: 'rotation_started' | 'rotation_completed' | 'rotation_failed' | 'rotation_warning';
  timestamp: number;
  oldKeyId?: string;
  newKeyId?: string;
  error?: Error;
  daysUntilRotation?: number;
}

export interface KeyRotationStatus {
  activeKeyId: string | null;
  activeKeyVersion: number;
  expiresAt: number | null;
  timeUntilRotation: number | null;
  totalKeys: number;
  lastRotated: number | null;
  rotationEnabled: boolean;
  nextWarning: number | null;
}

// Constants
const DEFAULT_CONFIG: KeyRotationConfig = {
  rotationIntervalMs: 30 * 24 * 60 * 60 * 1000, // 30 days
  maxActiveKeys: 3,
  preRotationWarningMs: 7 * 24 * 60 * 60 * 1000, // 7 days
  autoRotationEnabled: true
};

const STORAGE_KEYS = {
  CONFIG: 'dynasty_key_rotation_config',
  ACTIVE_KEY_ID: 'dynasty_active_key_id',
  KEY_LIST: 'dynasty_key_list',
  ROTATION_SCHEDULE: 'dynasty_rotation_schedule'
};

export class WebKeyRotationService {
  private static instance: WebKeyRotationService;
  private config: KeyRotationConfig;
  private cryptoService: WebVaultCryptoService;
  private keyManager: WebVaultKeyManager;
  private rotationTimer?: number;
  private checkInterval?: number;
  private rotationCallbacks: Set<(event: KeyRotationEvent) => void> = new Set();
  private isInitialized = false;

  private constructor(config: Partial<KeyRotationConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.cryptoService = WebVaultCryptoService.getInstance();
    this.keyManager = WebVaultKeyManager.getInstance();
  }

  static getInstance(config?: Partial<KeyRotationConfig>): WebKeyRotationService {
    if (!WebKeyRotationService.instance) {
      WebKeyRotationService.instance = new WebKeyRotationService(config);
    }
    return WebKeyRotationService.instance;
  }

  // MARK: - Initialization

  /**
   * Initialize key rotation service
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) return;

    try {
      // Load configuration from storage
      await this.loadConfiguration();

      // Check if we need to rotate keys
      const activeKey = await this.getActiveKey();
      
      if (!activeKey) {
        // No keys exist, create initial key
        await this.createInitialKey();
      } else {
        // Check if rotation is needed
        await this.checkAndRotateIfNeeded();
      }

      // Start automatic rotation monitoring if enabled
      if (this.config.autoRotationEnabled) {
        this.startAutomaticRotation();
      }

      this.isInitialized = true;
      console.log('[WebKeyRotation] Service initialized successfully');
    } catch (error) {
      errorHandler.handleError(error, ErrorSeverity.HIGH, {
        action: 'initialize-key-rotation'
      });
      throw new Error('Failed to initialize key rotation service');
    }
  }

  /**
   * Load configuration from storage
   */
  private async loadConfiguration(): Promise<void> {
    try {
      const storedConfig = localStorage.getItem(STORAGE_KEYS.CONFIG);
      if (storedConfig) {
        const parsedConfig = JSON.parse(storedConfig);
        this.config = { ...this.config, ...parsedConfig };
      }
    } catch (error) {
      console.warn('[WebKeyRotation] Failed to load configuration, using defaults');
    }
  }

  /**
   * Save configuration to storage
   */
  private async saveConfiguration(): Promise<void> {
    try {
      localStorage.setItem(STORAGE_KEYS.CONFIG, JSON.stringify(this.config));
    } catch (error) {
      console.warn('[WebKeyRotation] Failed to save configuration');
    }
  }

  // MARK: - Event Management

  /**
   * Subscribe to rotation events
   */
  onRotationEvent(callback: (event: KeyRotationEvent) => void): () => void {
    this.rotationCallbacks.add(callback);
    
    // Return unsubscribe function
    return () => {
      this.rotationCallbacks.delete(callback);
    };
  }

  /**
   * Emit rotation event
   */
  private emitRotationEvent(event: KeyRotationEvent): void {
    this.rotationCallbacks.forEach(callback => {
      try {
        callback(event);
      } catch (error) {
        console.error('[WebKeyRotation] Error in rotation callback:', error);
      }
    });
  }

  // MARK: - Automatic Rotation

  /**
   * Start automatic key rotation monitoring
   */
  private startAutomaticRotation(): void {
    // Clear existing intervals
    this.stopAutomaticRotation();

    // Check every hour for rotation needs
    this.checkInterval = window.setInterval(() => {
      this.checkAndRotateIfNeeded().catch(error => {
        console.error('[WebKeyRotation] Auto-check failed:', error);
      });
    }, 60 * 60 * 1000); // 1 hour

    // Also check for rotation warnings daily
    this.rotationTimer = window.setInterval(() => {
      this.checkRotationWarning().catch(error => {
        console.error('[WebKeyRotation] Warning check failed:', error);
      });
    }, 24 * 60 * 60 * 1000); // Daily
  }

  /**
   * Stop automatic rotation monitoring
   */
  private stopAutomaticRotation(): void {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = undefined;
    }
    if (this.rotationTimer) {
      clearInterval(this.rotationTimer);
      this.rotationTimer = undefined;
    }
  }

  /**
   * Check if key rotation warning should be shown
   */
  private async checkRotationWarning(): Promise<void> {
    try {
      const activeKey = await this.getActiveKey();
      if (!activeKey) return;

      const timeUntilExpiry = activeKey.expiresAt - Date.now();
      
      if (timeUntilExpiry < this.config.preRotationWarningMs && timeUntilExpiry > 0) {
        const daysUntilRotation = Math.ceil(timeUntilExpiry / (24 * 60 * 60 * 1000));
        
        this.emitRotationEvent({
          type: 'rotation_warning',
          timestamp: Date.now(),
          daysUntilRotation
        });
      }
    } catch (error) {
      console.error('[WebKeyRotation] Failed to check rotation warning:', error);
    }
  }

  /**
   * Check and rotate keys if needed
   */
  private async checkAndRotateIfNeeded(): Promise<void> {
    try {
      const activeKey = await this.getActiveKey();
      if (!activeKey) return;

      const now = Date.now();
      if (now >= activeKey.expiresAt) {
        await this.rotateKeys();
      }
    } catch (error) {
      console.error('[WebKeyRotation] Failed to check rotation:', error);
    }
  }

  // MARK: - Key Management

  /**
   * Create initial identity key
   */
  private async createInitialKey(): Promise<void> {
    try {
      const keyPair = await this.generateKeyPair();
      const rotatingKey: RotatingKeyPair = {
        id: `key_${Date.now()}`,
        keyPair,
        createdAt: Date.now(),
        expiresAt: Date.now() + this.config.rotationIntervalMs,
        isActive: true,
        version: 1,
      };

      await this.storeRotatingKey(rotatingKey);
      await this.setActiveKeyId(rotatingKey.id);
      await this.uploadPublicKey(rotatingKey);

      console.log('[WebKeyRotation] Initial key created successfully');
    } catch (error) {
      errorHandler.handleError(error, ErrorSeverity.HIGH, {
        action: 'create-initial-key'
      });
      throw error;
    }
  }

  /**
   * Rotate identity keys
   */
  async rotateKeys(reason: 'scheduled' | 'manual' | 'compromise' = 'scheduled'): Promise<void> {
    try {
      console.log('[WebKeyRotation] Starting key rotation...');
      
      // Get old key before rotation
      const oldActiveKey = await this.getActiveKey();
      
      // Emit rotation started event
      this.emitRotationEvent({
        type: 'rotation_started',
        timestamp: Date.now(),
        oldKeyId: oldActiveKey?.id
      });

      // Generate new key pair
      const keyPair = await this.generateKeyPair();
      const currentVersion = await this.getCurrentKeyVersion();
      
      const newKey: RotatingKeyPair = {
        id: `key_${Date.now()}`,
        keyPair,
        createdAt: Date.now(),
        expiresAt: Date.now() + this.config.rotationIntervalMs,
        isActive: true,
        version: currentVersion + 1,
      };

      // Mark old key as inactive
      if (oldActiveKey) {
        oldActiveKey.isActive = false;
        await this.storeRotatingKey(oldActiveKey);
      }

      // Store new key
      await this.storeRotatingKey(newKey);
      await this.setActiveKeyId(newKey.id);

      // Upload new public key to backend
      await this.uploadPublicKey(newKey, reason);

      // Clean up old keys
      await this.cleanupOldKeys();

      // Emit rotation completed event
      this.emitRotationEvent({
        type: 'rotation_completed',
        timestamp: Date.now(),
        oldKeyId: oldActiveKey?.id,
        newKeyId: newKey.id
      });

      console.log('[WebKeyRotation] Key rotation completed successfully');
    } catch (error) {
      console.error('[WebKeyRotation] Failed to rotate keys:', error);
      
      // Emit rotation failed event
      this.emitRotationEvent({
        type: 'rotation_failed',
        timestamp: Date.now(),
        error: error as Error
      });
      
      errorHandler.handleError(error, ErrorSeverity.HIGH, {
        action: 'rotate-keys',
        reason
      });
      
      throw error;
    }
  }

  /**
   * Get active key for encryption
   */
  async getActiveKey(): Promise<RotatingKeyPair | null> {
    try {
      const activeKeyId = localStorage.getItem(STORAGE_KEYS.ACTIVE_KEY_ID);
      if (!activeKeyId) return null;

      const keyData = localStorage.getItem(`dynasty_key_${activeKeyId}`);
      if (!keyData) return null;

      const parsed = JSON.parse(keyData);
      return {
        ...parsed,
        keyPair: {
          publicKey: new Uint8Array(parsed.keyPair.publicKey),
          privateKey: new Uint8Array(parsed.keyPair.privateKey)
        }
      };
    } catch (error) {
      console.error('[WebKeyRotation] Failed to get active key:', error);
      return null;
    }
  }

  /**
   * Get all keys (for decryption of old messages)
   */
  async getAllKeys(): Promise<RotatingKeyPair[]> {
    try {
      const keyListData = localStorage.getItem(STORAGE_KEYS.KEY_LIST);
      if (!keyListData) return [];

      const keyIds: string[] = JSON.parse(keyListData);
      const keys: RotatingKeyPair[] = [];

      for (const keyId of keyIds) {
        const keyData = localStorage.getItem(`dynasty_key_${keyId}`);
        if (keyData) {
          const parsed = JSON.parse(keyData);
          keys.push({
            ...parsed,
            keyPair: {
              publicKey: new Uint8Array(parsed.keyPair.publicKey),
              privateKey: new Uint8Array(parsed.keyPair.privateKey)
            }
          });
        }
      }

      return keys.sort((a, b) => b.createdAt - a.createdAt);
    } catch (error) {
      console.error('[WebKeyRotation] Failed to get all keys:', error);
      return [];
    }
  }

  /**
   * Try to decrypt with any available key
   */
  async decryptWithAnyKey(encryptedData: ArrayBuffer): Promise<ArrayBuffer | null> {
    const keys = await this.getAllKeys();

    for (const key of keys) {
      try {
        // Use Web Crypto API to decrypt
        const decrypted = await crypto.subtle.decrypt(
          { name: 'AES-GCM' },
          key.keyPair.privateKey,
          encryptedData
        );
        return decrypted;
      } catch (error) {
        // Try next key
        continue;
      }
    }

    return null;
  }

  // MARK: - Storage Management

  /**
   * Store rotating key
   */
  private async storeRotatingKey(key: RotatingKeyPair): Promise<void> {
    try {
      // Convert ArrayBuffers to arrays for JSON serialization
      const serializable = {
        ...key,
        keyPair: {
          publicKey: Array.from(new Uint8Array(key.keyPair.publicKey)),
          privateKey: Array.from(new Uint8Array(key.keyPair.privateKey))
        }
      };

      localStorage.setItem(`dynasty_key_${key.id}`, JSON.stringify(serializable));

      // Update key list
      const keys = await this.getAllKeys();
      const keyIds = keys.map(k => k.id);
      if (!keyIds.includes(key.id)) {
        keyIds.push(key.id);
      }
      localStorage.setItem(STORAGE_KEYS.KEY_LIST, JSON.stringify(keyIds));
    } catch (error) {
      errorHandler.handleError(error, ErrorSeverity.HIGH, {
        action: 'store-rotating-key',
        keyId: key.id
      });
      throw error;
    }
  }

  /**
   * Set active key ID
   */
  private async setActiveKeyId(keyId: string): Promise<void> {
    localStorage.setItem(STORAGE_KEYS.ACTIVE_KEY_ID, keyId);
  }

  /**
   * Get current key version
   */
  private async getCurrentKeyVersion(): Promise<number> {
    const activeKey = await this.getActiveKey();
    return activeKey ? activeKey.version : 0;
  }

  /**
   * Clean up old keys (keep only MAX_ACTIVE_KEYS)
   */
  private async cleanupOldKeys(): Promise<void> {
    try {
      const keys = await this.getAllKeys();
      
      if (keys.length <= this.config.maxActiveKeys) {
        return; // No cleanup needed
      }

      // Sort by creation date (newest first) and keep only the newest ones
      const sortedKeys = keys.sort((a, b) => b.createdAt - a.createdAt);
      const keysToDelete = sortedKeys.slice(this.config.maxActiveKeys);

      for (const key of keysToDelete) {
        // Only delete keys that are expired
        if (Date.now() > key.expiresAt) {
          localStorage.removeItem(`dynasty_key_${key.id}`);
        }
      }

      // Update key list
      const remainingKeys = keys.filter(k => !keysToDelete.some(d => d.id === k.id));
      const keyIds = remainingKeys.map(k => k.id);
      localStorage.setItem(STORAGE_KEYS.KEY_LIST, JSON.stringify(keyIds));

      console.log(`[WebKeyRotation] Cleaned up ${keysToDelete.length} old keys`);
    } catch (error) {
      console.error('[WebKeyRotation] Failed to cleanup old keys:', error);
    }
  }

  // MARK: - Crypto Operations

  /**
   * Generate a new key pair
   */
  private async generateKeyPair(): Promise<{ publicKey: ArrayBuffer; privateKey: ArrayBuffer }> {
    try {
      const keyPair = await crypto.subtle.generateKey(
        {
          name: 'RSA-OAEP',
          modulusLength: 2048,
          publicExponent: new Uint8Array([0x01, 0x00, 0x01]),
          hash: 'SHA-256'
        },
        true,
        ['encrypt', 'decrypt']
      );

      const publicKey = await crypto.subtle.exportKey('spki', keyPair.publicKey);
      const privateKey = await crypto.subtle.exportKey('pkcs8', keyPair.privateKey);

      return { publicKey, privateKey };
    } catch (error) {
      errorHandler.handleError(error, ErrorSeverity.HIGH, {
        action: 'generate-key-pair'
      });
      throw error;
    }
  }

  /**
   * Upload public key to backend
   */
  private async uploadPublicKey(
    key: RotatingKeyPair, 
    reason: 'scheduled' | 'manual' | 'compromise' = 'scheduled'
  ): Promise<void> {
    try {
      // Convert public key to base64
      const publicKeyBase64 = btoa(
        String.fromCharCode(...new Uint8Array(key.keyPair.publicKey))
      );

      // Call backend function
      const response = await fetch('/api/uploadRotatedEncryptionKey', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          keyId: key.id,
          publicKey: publicKeyBase64,
          keyType: 'identity',
          version: key.version,
          expiresAt: key.expiresAt,
          rotationReason: reason
        })
      });

      if (!response.ok) {
        throw new Error(`Failed to upload public key: ${response.statusText}`);
      }

      console.log('[WebKeyRotation] Public key uploaded successfully');
    } catch (error) {
      errorHandler.handleError(error, ErrorSeverity.HIGH, {
        action: 'upload-public-key',
        keyId: key.id
      });
      throw error;
    }
  }

  // MARK: - Configuration

  /**
   * Update rotation configuration
   */
  async updateConfig(newConfig: Partial<KeyRotationConfig>): Promise<void> {
    this.config = { ...this.config, ...newConfig };
    await this.saveConfiguration();

    // Restart automatic rotation if settings changed
    if (this.config.autoRotationEnabled) {
      this.startAutomaticRotation();
    } else {
      this.stopAutomaticRotation();
    }

    console.log('[WebKeyRotation] Configuration updated');
  }

  /**
   * Get current configuration
   */
  getConfig(): KeyRotationConfig {
    return { ...this.config };
  }

  // MARK: - Status and Control

  /**
   * Get key rotation status
   */
  async getRotationStatus(): Promise<KeyRotationStatus> {
    const activeKey = await this.getActiveKey();
    const allKeys = await this.getAllKeys();

    return {
      activeKeyId: activeKey?.id || null,
      activeKeyVersion: activeKey?.version || 0,
      expiresAt: activeKey?.expiresAt || null,
      timeUntilRotation: activeKey ? activeKey.expiresAt - Date.now() : null,
      totalKeys: allKeys.length,
      lastRotated: activeKey?.createdAt || null,
      rotationEnabled: this.config.autoRotationEnabled,
      nextWarning: activeKey ? 
        activeKey.expiresAt - this.config.preRotationWarningMs : null
    };
  }

  /**
   * Check if rotation is needed
   */
  async checkIfRotationNeeded(): Promise<boolean> {
    const activeKey = await this.getActiveKey();
    if (!activeKey) return true;
    
    const timeUntilExpiry = activeKey.expiresAt - Date.now();
    return timeUntilExpiry <= this.config.preRotationWarningMs;
  }

  /**
   * Force immediate key rotation
   */
  async forceRotation(reason: 'manual' | 'compromise' = 'manual'): Promise<void> {
    await this.rotateKeys(reason);
  }

  /**
   * Enable or disable automatic rotation
   */
  async setAutoRotationEnabled(enabled: boolean): Promise<void> {
    await this.updateConfig({ autoRotationEnabled: enabled });
  }

  // MARK: - Cleanup

  /**
   * Cleanup on logout or app termination
   */
  cleanup(): void {
    this.stopAutomaticRotation();
    this.rotationCallbacks.clear();
    console.log('[WebKeyRotation] Service cleaned up');
  }

  /**
   * Destroy service instance
   */
  destroy(): void {
    this.cleanup();
    WebKeyRotationService.instance = null as any;
  }
}

// Export singleton instance
export default WebKeyRotationService.getInstance(); 