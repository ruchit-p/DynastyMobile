/**
 * VaultServiceV2 - Migration wrapper that maintains VaultService interface
 * while using vault-sdk underneath. This allows gradual migration of UI components.
 */

import { FirebaseFirestoreTypes } from '@react-native-firebase/firestore';
import { 
  VaultItem,
  VaultUploadOptions,
  VaultDownloadOptions,
  VaultSearchOptions,
  VaultStorageInfo,
  VaultInitializationStatus,
  EncryptedVaultUploadResult
} from './VaultService';
import { useVaultClient } from './VaultClient';
import { logger } from './LoggingService';
import { BiometricVaultAccess } from './encryption/BiometricVaultAccess';
import { VaultKeyManager } from './encryption/VaultKeyManager';
import { getFirebaseDb } from '../lib/firebase';
import { callFirebaseFunction } from '../lib/errorUtils';

/**
 * VaultServiceV2 - Drop-in replacement for VaultService using SDK
 * 
 * This service maintains the same interface as VaultService but uses
 * the vault-sdk underneath. This allows us to migrate UI components
 * one at a time without breaking changes.
 */
export class VaultServiceV2 {
  private static instance: VaultServiceV2;
  private db: FirebaseFirestoreTypes.Module;
  private biometricAccess: BiometricVaultAccess;
  private keyManager: VaultKeyManager;
  private currentUserId: string | null = null;
  private vaultClient: ReturnType<typeof useVaultClient> | null = null;

  private constructor() {
    this.db = getFirebaseDb();
    this.biometricAccess = new BiometricVaultAccess();
    this.keyManager = new VaultKeyManager();
  }

  static getInstance(): VaultServiceV2 {
    if (!VaultServiceV2.instance) {
      VaultServiceV2.instance = new VaultServiceV2();
    }
    return VaultServiceV2.instance;
  }

  /**
   * Initialize vault with user credentials
   * Sets up encryption keys and biometric access
   */
  async initialize(
    userId: string,
    password?: string,
    useBiometric = true
  ): Promise<VaultInitializationStatus> {
    try {
      this.currentUserId = userId;

      // Initialize biometric access
      const biometricStatus = await this.biometricAccess.initialize(userId);
      
      // Set up vault keys
      if (password) {
        await this.keyManager.setupVaultKey(userId, password);
      }

      const hasVaultKeys = await this.keyManager.hasVaultKey(userId);

      return {
        isInitialized: true,
        hasVaultKeys,
        biometricEnabled: biometricStatus.isEnabled,
        requiresSetup: !hasVaultKeys,
        securityStatus: biometricStatus,
      };
    } catch (error) {
      logger.error('[VaultServiceV2] Initialize error:', error);
      throw error;
    }
  }

  /**
   * Set the vault client hook instance
   * This is called from a React component to provide the hook instance
   */
  setVaultClient(client: ReturnType<typeof useVaultClient>) {
    this.vaultClient = client;
  }

  /**
   * Get vault client - throws if not set
   */
  private getVaultClient() {
    if (!this.vaultClient) {
      throw new Error('VaultClient not initialized. Call setVaultClient from a React component.');
    }
    return this.vaultClient;
  }

  /**
   * Get items in a folder
   */
  async getItems(parentId: string | null = null): Promise<VaultItem[]> {
    const client = this.getVaultClient();
    
    // Filter items by parentId
    const items = client.items.filter(item => {
      // Convert SDK format to VaultService format
      const vaultItem = this.convertFromSDKFormat(item);
      return vaultItem.parentId === parentId && !vaultItem.isDeleted;
    });

    return items.map(item => this.convertFromSDKFormat(item));
  }

  /**
   * Search vault items
   */
  async searchItems(options: VaultSearchOptions): Promise<VaultItem[]> {
    const client = this.getVaultClient();
    
    let items = client.items.map(item => this.convertFromSDKFormat(item));

    // Apply filters
    if (options.query) {
      const query = options.query.toLowerCase();
      items = items.filter(item => 
        item.name.toLowerCase().includes(query) ||
        item.metadata?.description?.toLowerCase().includes(query)
      );
    }

    if (options.fileTypes && options.fileTypes.length > 0) {
      items = items.filter(item => 
        item.fileType && options.fileTypes!.includes(item.fileType)
      );
    }

    if (options.parentId !== undefined) {
      items = items.filter(item => item.parentId === options.parentId);
    }

    if (!options.includeDeleted) {
      items = items.filter(item => !item.isDeleted);
    }

    // Sort
    if (options.sortBy) {
      items.sort((a, b) => {
        let comparison = 0;
        switch (options.sortBy) {
          case 'name':
            comparison = a.name.localeCompare(b.name);
            break;
          case 'date':
            comparison = b.updatedAt.toMillis() - a.updatedAt.toMillis();
            break;
          case 'size':
            comparison = (b.size || 0) - (a.size || 0);
            break;
          case 'type':
            comparison = (a.fileType || '').localeCompare(b.fileType || '');
            break;
        }
        return options.sortOrder === 'desc' ? -comparison : comparison;
      });
    }

    // Limit
    if (options.limit) {
      items = items.slice(0, options.limit);
    }

    return items;
  }

  /**
   * Upload a file to vault
   */
  async uploadFile(
    uri: string,
    parentId: string | null,
    options?: VaultUploadOptions
  ): Promise<VaultItem> {
    const client = this.getVaultClient();
    
    const uploadResult = await client.uploadFile(uri, {
      parentId,
      onProgress: options?.onProgress,
      encrypt: options?.encrypt,
      generateThumbnail: options?.generateThumbnail,
    });

    return this.convertFromSDKFormat(uploadResult);
  }

  /**
   * Download a file from vault
   */
  async downloadFile(
    itemId: string,
    options?: VaultDownloadOptions
  ): Promise<string> {
    const client = this.getVaultClient();
    
    const result = await client.downloadFile(itemId, {
      onProgress: options?.onProgress,
      saveToDevice: options?.saveToDevice,
    });

    return result.uri;
  }

  /**
   * Delete items (soft delete)
   */
  async bulkDelete(itemIds: string[]): Promise<void> {
    const client = this.getVaultClient();
    
    // SDK handles one at a time, so we'll batch them
    await Promise.all(itemIds.map(id => client.deleteItem(id)));
  }

  /**
   * Get deleted items (trash)
   */
  async getDeletedItems(): Promise<VaultItem[]> {
    // This requires a direct Firebase query since SDK doesn't expose deleted items
    const snapshot = await this.db
      .collection('vaultItems')
      .where('userId', '==', this.currentUserId)
      .where('isDeleted', '==', true)
      .get();

    return snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
    } as VaultItem));
  }

  /**
   * Restore item from trash
   */
  async restoreItem(itemId: string): Promise<void> {
    await callFirebaseFunction('restoreVaultItem', { itemId });
  }

  /**
   * Permanently delete item
   */
  async permanentlyDeleteItem(itemId: string): Promise<void> {
    await callFirebaseFunction('permanentlyDeleteVaultItem', { itemId });
  }

  /**
   * Empty trash
   */
  async emptyTrash(): Promise<void> {
    const deletedItems = await this.getDeletedItems();
    const itemIds = deletedItems.map(item => item.id);
    
    if (itemIds.length > 0) {
      await callFirebaseFunction('permanentlyDeleteVaultItems', { itemIds });
    }
  }

  /**
   * Get storage info
   */
  async getStorageInfo(): Promise<VaultStorageInfo> {
    const result = await callFirebaseFunction('getVaultStorageInfo', {});
    return result as VaultStorageInfo;
  }

  /**
   * Get all upload statuses (for progress tracking)
   */
  getAllUploadStatuses(): Map<string, any> {
    const client = this.getVaultClient();
    
    // Convert SDK upload progress to expected format
    const statuses = new Map();
    Object.entries(client.uploadProgress).forEach(([id, progress]) => {
      statuses.set(id, {
        progress,
        status: progress < 100 ? 'uploading' : 'completed',
      });
    });
    
    return statuses;
  }

  /**
   * Convert SDK format to VaultService format
   */
  private convertFromSDKFormat(sdkItem: any): VaultItem {
    return {
      id: sdkItem.id,
      userId: sdkItem.familyId, // SDK uses familyId
      name: sdkItem.name,
      type: 'file', // SDK only handles files
      parentId: sdkItem.metadata?.parentId || null,
      path: sdkItem.metadata?.path || `/${sdkItem.name}`,
      size: sdkItem.fileSize,
      fileType: this.mapSDKTypeToFileType(sdkItem.type),
      mimeType: sdkItem.mimeType,
      storagePath: sdkItem.metadata?.storagePath,
      downloadURL: sdkItem.fileUrl,
      isEncrypted: !!sdkItem.encryptionKey,
      encryptionKeyId: sdkItem.metadata?.encryptionKeyId,
      encryptionMetadata: sdkItem.metadata?.encryptionMetadata,
      thumbnailUrl: sdkItem.metadata?.thumbnailUrl,
      metadata: sdkItem.metadata,
      createdAt: this.parseTimestamp(sdkItem.createdAt),
      updatedAt: this.parseTimestamp(sdkItem.updatedAt),
      isDeleted: false, // SDK doesn't expose deleted items
      sharedWith: sdkItem.sharedWith,
      permissions: sdkItem.metadata?.permissions,
    };
  }

  /**
   * Map SDK type to VaultService fileType
   */
  private mapSDKTypeToFileType(type: string): VaultItem['fileType'] {
    const mapping: Record<string, VaultItem['fileType']> = {
      photo: 'image',
      video: 'video',
      audio: 'audio',
      document: 'document',
    };
    return mapping[type] || 'other';
  }

  /**
   * Parse timestamp string to Firestore Timestamp
   */
  private parseTimestamp(timestamp: string): FirebaseFirestoreTypes.Timestamp {
    const date = new Date(timestamp);
    return {
      toDate: () => date,
      toMillis: () => date.getTime(),
      seconds: Math.floor(date.getTime() / 1000),
      nanoseconds: 0,
      isEqual: (other: any) => other.toMillis() === date.getTime(),
    } as FirebaseFirestoreTypes.Timestamp;
  }
}

// Export singleton getter for backward compatibility
export function getVaultService(): VaultServiceV2 {
  return VaultServiceV2.getInstance();
}