import * as SecureStore from 'expo-secure-store';
import { callFirebaseFunction } from '../../lib/errorUtils';
import { LibsignalService } from './libsignal/LibsignalService';
import { KeyPair } from './index';
import { AuditLogService } from './AuditLogService';
import { logger } from '../LoggingService';

interface RotatingKeyPair {
  id: string;
  keyPair: KeyPair;
  createdAt: number;
  expiresAt: number;
  isActive: boolean;
  version: number;
}

interface KeyRotationConfig {
  rotationIntervalMs: number;
  maxActiveKeys: number;
  preRotationWarningMs: number;
}

export interface KeyRotationEvent {
  type: 'rotation_started' | 'rotation_completed' | 'rotation_failed' | 'rotation_warning';
  timestamp: number;
  oldKeyId?: string;
  newKeyId?: string;
  error?: Error;
  daysUntilRotation?: number;
}

const DEFAULT_CONFIG: KeyRotationConfig = {
  rotationIntervalMs: 30 * 24 * 60 * 60 * 1000, // 30 days
  maxActiveKeys: 3,
  preRotationWarningMs: 7 * 24 * 60 * 60 * 1000, // 7 days
};

const KEY_ROTATION_PREFIX = 'e2e_rotation_';
const ACTIVE_KEY_ID = `${KEY_ROTATION_PREFIX}active_id`;
const KEY_LIST = `${KEY_ROTATION_PREFIX}list`;

export class KeyRotationService {
  private static instance: KeyRotationService;
  private config: KeyRotationConfig;
  private rotationTimer?: NodeJS.Timeout;
  private checkInterval?: NodeJS.Timeout;
  private rotationCallbacks: Set<(event: KeyRotationEvent) => void> = new Set();

  private constructor(config: Partial<KeyRotationConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  static getInstance(config?: Partial<KeyRotationConfig>): KeyRotationService {
    if (!KeyRotationService.instance) {
      KeyRotationService.instance = new KeyRotationService(config);
    }
    return KeyRotationService.instance;
  }

  /**
   * Initialize key rotation service
   */
  async initialize(): Promise<void> {
    try {
      // Check if we need to rotate keys
      const activeKey = await this.getActiveKey();
      
      if (!activeKey) {
        // No keys exist, create initial key
        await this.createInitialKey();
      } else {
        // Check if rotation is needed
        await this.checkAndRotateIfNeeded();
      }

      // Start automatic rotation monitoring
      this.startAutomaticRotation();
    } catch (error) {
      logger.error('Failed to initialize key rotation:', error);
      throw error;
    }
  }

  /**
   * Subscribe to key rotation events
   */
  onRotationEvent(callback: (event: KeyRotationEvent) => void): () => void {
    this.rotationCallbacks.add(callback);
    return () => this.rotationCallbacks.delete(callback);
  }

  /**
   * Emit rotation event
   */
  private emitRotationEvent(event: KeyRotationEvent) {
    this.rotationCallbacks.forEach(callback => {
      try {
        callback(event);
      } catch (error) {
        logger.error('Error in rotation callback:', error);
      }
    });
  }

  /**
   * Start automatic key rotation monitoring
   */
  private startAutomaticRotation() {
    // Clear existing intervals
    this.stopAutomaticRotation();

    // Check every hour for rotation needs
    this.checkInterval = setInterval(() => {
      this.checkAndRotateIfNeeded();
    }, 60 * 60 * 1000); // 1 hour

    // Also check for rotation warnings
    this.rotationTimer = setInterval(() => {
      this.checkRotationWarning();
    }, 24 * 60 * 60 * 1000); // Daily
  }

  /**
   * Stop automatic rotation
   */
  private stopAutomaticRotation() {
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
  private async checkRotationWarning() {
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
      logger.error('Failed to check rotation warning:', error);
    }
  }

  /**
   * Check and rotate keys if needed
   */
  private async checkAndRotateIfNeeded() {
    try {
      const activeKey = await this.getActiveKey();
      if (!activeKey) return;

      const now = Date.now();
      if (now >= activeKey.expiresAt) {
        await this.rotateKeys();
      }
    } catch (error) {
      logger.error('Failed to check rotation:', error);
    }
  }

  /**
   * Create initial identity key
   */
  private async createInitialKey(): Promise<void> {
    const keyPair = await LibsignalService.getInstance().generateKeyPair();
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
  }

  /**
   * Rotate identity keys
   */
  async rotateKeys(): Promise<void> {
    try {
      logger.debug('Starting key rotation...');
      
      // Get old key before rotation
      const oldActiveKey = await this.getActiveKey();
      
      // Emit rotation started event
      this.emitRotationEvent({
        type: 'rotation_started',
        timestamp: Date.now(),
        oldKeyId: oldActiveKey?.id
      });

      // Generate new key pair
      const keyPair = await LibsignalService.getInstance().generateKeyPair();
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

      // Upload new public key
      await this.uploadPublicKey(newKey);

      // Clean up old keys
      await this.cleanupOldKeys();

      // Emit rotation completed event
      this.emitRotationEvent({
        type: 'rotation_completed',
        timestamp: Date.now(),
        oldKeyId: oldActiveKey?.id,
        newKeyId: newKey.id
      });

      logger.debug('Key rotation completed successfully');
      
      // Log successful key rotation
      await AuditLogService.getInstance().logEvent(
        'key_rotation_completed',
        'Encryption keys rotated successfully',
        {
          metadata: {
            oldKeyId: oldActiveKey?.id,
            newKeyId: newKey.id,
            keyVersion: newKey.version
          }
        }
      );
    } catch (error) {
      logger.error('Failed to rotate keys:', error);
      
      // Emit rotation failed event
      this.emitRotationEvent({
        type: 'rotation_failed',
        timestamp: Date.now(),
        error: error as Error
      });
      
      // Log key rotation failure
      await AuditLogService.getInstance().logEvent(
        'key_rotation_failed',
        'Failed to rotate encryption keys',
        {
          metadata: {
            error: error.message,
            timestamp: Date.now()
          }
        }
      );
      
      throw error;
    }
  }

  /**
   * Get active key for encryption
   */
  async getActiveKey(): Promise<RotatingKeyPair | null> {
    try {
      const activeKeyId = await SecureStore.getItemAsync(ACTIVE_KEY_ID);
      if (!activeKeyId) return null;

      const keyData = await SecureStore.getItemAsync(`${KEY_ROTATION_PREFIX}${activeKeyId}`);
      if (!keyData) return null;

      return JSON.parse(keyData);
    } catch (error) {
      logger.error('Failed to get active key:', error);
      return null;
    }
  }

  /**
   * Get all keys (for decryption of old messages)
   */
  async getAllKeys(): Promise<RotatingKeyPair[]> {
    try {
      const keyListData = await SecureStore.getItemAsync(KEY_LIST);
      if (!keyListData) return [];

      const keyIds: string[] = JSON.parse(keyListData);
      const keys: RotatingKeyPair[] = [];

      for (const keyId of keyIds) {
        const keyData = await SecureStore.getItemAsync(`${KEY_ROTATION_PREFIX}${keyId}`);
        if (keyData) {
          keys.push(JSON.parse(keyData));
        }
      }

      return keys.sort((a, b) => b.createdAt - a.createdAt);
    } catch (error) {
      logger.error('Failed to get all keys:', error);
      return [];
    }
  }

  /**
   * Try to decrypt with any available key
   */
  async decryptWithAnyKey(encryptedData: any): Promise<string | null> {
    const keys = await this.getAllKeys();

    for (const key of keys) {
      try {
        // Get current identity key
        const originalIdentity = await LibsignalService.getInstance().getIdentityKeyPair();
        await LibsignalService.getInstance().restoreKeyPair(key.keyPair);

        const decrypted = await LibsignalService.getInstance().decryptMessage(encryptedData);
        
        // Restore original key
        if (originalIdentity) {
          await LibsignalService.getInstance().restoreKeyPair(originalIdentity);
        }

        return decrypted;
      } catch (error) {
        // Try next key
        continue;
      }
    }

    return null;
  }


  /**
   * Store rotating key
   */
  private async storeRotatingKey(key: RotatingKeyPair): Promise<void> {
    await SecureStore.setItemAsync(
      `${KEY_ROTATION_PREFIX}${key.id}`,
      JSON.stringify(key)
    );

    // Update key list
    const keys = await this.getAllKeys();
    const keyIds = keys.map(k => k.id);
    if (!keyIds.includes(key.id)) {
      keyIds.push(key.id);
    }
    await SecureStore.setItemAsync(KEY_LIST, JSON.stringify(keyIds));
  }

  /**
   * Set active key ID
   */
  private async setActiveKeyId(keyId: string): Promise<void> {
    await SecureStore.setItemAsync(ACTIVE_KEY_ID, keyId);
  }

  /**
   * Clean up old expired keys
   */
  private async cleanupOldKeys(): Promise<void> {
    const keys = await this.getAllKeys();
    const now = Date.now();
    const keysToKeep: RotatingKeyPair[] = [];
    const keysToDelete: string[] = [];

    // Keep active key and recent keys
    for (const key of keys) {
      if (
        key.isActive || 
        keysToKeep.length < this.config.maxActiveKeys ||
        now - key.createdAt < this.config.rotationIntervalMs * 2
      ) {
        keysToKeep.push(key);
      } else {
        keysToDelete.push(key.id);
      }
    }

    // Delete old keys
    for (const keyId of keysToDelete) {
      await SecureStore.deleteItemAsync(`${KEY_ROTATION_PREFIX}${keyId}`);
    }

    // Update key list
    await SecureStore.setItemAsync(
      KEY_LIST,
      JSON.stringify(keysToKeep.map(k => k.id))
    );
  }

  /**
   * Upload public key to Firebase
   */
  private async uploadPublicKey(key: RotatingKeyPair): Promise<void> {
    try {
      await callFirebaseFunction('uploadRotatedEncryptionKey', {
        keyId: key.id,
        publicKey: key.keyPair.publicKey,
        version: key.version,
        expiresAt: key.expiresAt,
      });
    } catch (error) {
      logger.error('Failed to upload rotated public key:', error);
      throw error;
    }
  }

  /**
   * Get current key version
   */
  private async getCurrentKeyVersion(): Promise<number> {
    const keys = await this.getAllKeys();
    if (keys.length === 0) return 0;
    return Math.max(...keys.map(k => k.version));
  }


  /**
   * Cleanup on logout
   */
  cleanup() {
    this.stopAutomaticRotation();
    this.rotationCallbacks.clear();
  }

  /**
   * Get key rotation status
   */
  async getRotationStatus(): Promise<{
    activeKeyId: string | null;
    activeKeyVersion: number;
    expiresAt: number | null;
    timeUntilRotation: number | null;
    totalKeys: number;
    lastRotated: number | null;
  }> {
    const activeKey = await this.getActiveKey();
    const allKeys = await this.getAllKeys();

    return {
      activeKeyId: activeKey?.id || null,
      activeKeyVersion: activeKey?.version || 0,
      expiresAt: activeKey?.expiresAt || null,
      timeUntilRotation: activeKey ? activeKey.expiresAt - Date.now() : null,
      totalKeys: allKeys.length,
      lastRotated: activeKey?.createdAt || null,
    };
  }
  
  /**
   * Get last rotation date
   */
  async getLastRotationDate(): Promise<Date | null> {
    const activeKey = await this.getActiveKey();
    return activeKey ? new Date(activeKey.createdAt) : null;
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
}

export default KeyRotationService.getInstance();