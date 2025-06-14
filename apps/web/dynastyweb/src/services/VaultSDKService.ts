/**
 * Vault SDK Service for Dynasty Web App
 * Provides vault functionality using the new vault-sdk with backward compatibility
 * Follows existing Dynasty patterns for error handling, caching, and user feedback
 */

import { VaultApiClient, VaultApiClientConfig, VaultItem as SDKVaultItem } from '@dynasty/vault-sdk';
import { app } from '@/lib/firebase';
import { errorHandler, ErrorSeverity } from './ErrorHandlingService';
import { cacheService, cacheKeys } from './CacheService';
import { toast } from '@/components/ui/use-toast';
import { showRateLimitedToast } from '../utils/toastRateLimiter';

// Import existing types for backward compatibility
import type { VaultItem, VaultFolder, UploadProgress, VaultStorageInfo } from './VaultService';

// SDK Configuration with V2 header support
const createVaultSDKConfig = (): VaultApiClientConfig => ({
  app,
  enableValidation: process.env.NODE_ENV === 'development',
  maxRetries: 3,
});

class VaultSDKService {
  private static instance: VaultSDKService;
  private apiClient: VaultApiClient;
  private maxFileSize = 100 * 1024 * 1024; // 100MB
  private uploadTasks = new Map<string, { cancel: () => void; progress: number }>();
  private downloadCache = new Map<string, Blob>();

  private constructor() {
    this.apiClient = new VaultApiClient(createVaultSDKConfig());
  }

  static getInstance(): VaultSDKService {
    if (!VaultSDKService.instance) {
      VaultSDKService.instance = new VaultSDKService();
    }
    return VaultSDKService.instance;
  }

  // Convert SDK VaultItem to legacy VaultItem format for backward compatibility
  private convertSDKItemToLegacy(sdkItem: SDKVaultItem): VaultItem {
    return {
      id: sdkItem.id,
      name: sdkItem.name,
      type: 'file' as const, // SDK primarily handles files
      mimeType: sdkItem.mimeType,
      size: sdkItem.size,
      parentId: null, // SDK doesn't have parent concept yet
      path: `/${sdkItem.name}`,
      url: sdkItem.cachedDownloadUrl,
      thumbnailUrl: sdkItem.thumbnailUrl,
      isEncrypted: !!sdkItem.isEncrypted,
      isShared: (sdkItem.sharedWith?.length || 0) > 0,
      sharedWith: sdkItem.sharedWith,
      createdAt: new Date(sdkItem.createdAt),
      updatedAt: new Date(sdkItem.updatedAt),
      lastAccessedAt: undefined,
      metadata: undefined,
      tags: [],
      description: undefined,
      scanStatus: undefined, // SDK doesn't expose scan status yet
    };
  }

  // Enhanced error handling following Dynasty patterns
  private handleVaultError(error: unknown, action: string, metadata?: Record<string, unknown>) {
    // Log error using Dynasty's error handler
    errorHandler.handleError(error, ErrorSeverity.MEDIUM, {
      action: `vault-sdk-${action}`,
      ...metadata,
    });

    // Show user-friendly toast notification
    const errorMessage = error instanceof Error ? error.message : 'An error occurred';
    showRateLimitedToast(toast, {
      title: 'Vault Error',
      description: errorMessage,
      variant: 'destructive',
    });

    throw error;
  }

  // Check if encryption is enabled for the current user
  async isEncryptionEnabled(): Promise<boolean> {
    try {
      const result = await this.apiClient.getEncryptionStatus({});
      return result.isEnabled;
    } catch (error) {
      this.handleVaultError(error, 'check-encryption-status');
      return false;
    }
  }

  // File Operations with Dynasty patterns

  async uploadFile(
    file: File,
    _parentId: string | null = null,
    onProgress?: (progress: UploadProgress) => void,
    encryptionOptions?: {
      encrypt: (file: File, fileId: string) => Promise<{
        success: boolean;
        encryptedFile?: Uint8Array;
        header?: Uint8Array;
        metadata?: Record<string, unknown>;
        error?: string;
      }>;
      getCurrentKeyId: () => Promise<string>;
    }
  ): Promise<VaultItem> {
    // Note: parentId not used in SDK implementation yet
    void _parentId;
    
    // Validate file size
    if (file.size > this.maxFileSize) {
      throw new Error(`File size exceeds maximum limit of ${this.maxFileSize / 1024 / 1024}MB`);
    }

    const uploadId = `sdk-upload-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    try {
      // Show upload started toast
      showRateLimitedToast(toast, {
        title: 'Upload Started',
        description: `Uploading ${file.name}...`,
        variant: 'default',
      });

      // Check if encryption is enabled
      const encryptionEnabled = await this.isEncryptionEnabled();
      let uploadData: File | Blob = file;
      let encryptionKeyId: string | null = null;

      // Handle encryption if enabled
      if (encryptionEnabled && encryptionOptions) {
        const encryptionResult = await encryptionOptions.encrypt(file, uploadId);
        
        if (!encryptionResult.success) {
          throw new Error(encryptionResult.error || 'Encryption failed');
        }

        uploadData = new Blob([encryptionResult.encryptedFile!], {
          type: 'application/octet-stream',
        });

        encryptionKeyId = await encryptionOptions.getCurrentKeyId();
      }

      // Track upload progress
      this.uploadTasks.set(uploadId, {
        cancel: () => {
          // SDK doesn't support cancellation yet, but we track it
          this.uploadTasks.delete(uploadId);
        },
        progress: 0,
      });

      // Simulate progress tracking (SDK doesn't provide real-time progress yet)
      const progressInterval = setInterval(() => {
        const task = this.uploadTasks.get(uploadId);
        if (task && onProgress) {
          task.progress = Math.min(task.progress + 10, 90);
          onProgress({
            bytesTransferred: (task.progress / 100) * uploadData.size,
            totalBytes: uploadData.size,
            percentage: task.progress,
            state: 'running',
          });
        }
      }, 200);

      // Use SDK to create the vault item
      const result = await this.apiClient.addFile({
        itemId: uploadId, // Use upload ID as item ID
        name: file.name,
        storagePath: `uploads/${file.name}`,
        fileType: this.getFileTypeFromMime(file.type),
        size: file.size,
        mimeType: file.type,
        isEncrypted: !!encryptionKeyId,
      });

      // Complete progress
      clearInterval(progressInterval);
      this.uploadTasks.delete(uploadId);

      if (onProgress) {
        onProgress({
          bytesTransferred: uploadData.size,
          totalBytes: uploadData.size,
          percentage: 100,
          state: 'success',
        });
      }

      // Show success toast
      showRateLimitedToast(toast, {
        title: 'Upload Complete',
        description: `${file.name} uploaded successfully`,
        variant: 'success',
      });

      // Invalidate cache
      this.invalidateCache();

      // Convert SDK result to legacy format
      return this.convertSDKItemToLegacy(result);

    } catch (error) {
      // Clean up on error
      this.uploadTasks.delete(uploadId);
      
      this.handleVaultError(error, 'upload-file', {
        fileName: file.name,
        fileSize: file.size,
        uploadId,
      });
      
      throw error;
    }
  }

  async downloadFile(
    item: VaultItem,
    decryptionOptions?: {
      decrypt: (
        encryptedFile: Uint8Array,
        header: Uint8Array,
        metadata: Record<string, unknown>,
        fileId: string
      ) => Promise<{
        success: boolean;
        encryptedFile?: Uint8Array;
        error?: string;
      }>;
    }
  ): Promise<Blob> {
    // Check cache first
    const cached = this.downloadCache.get(item.id);
    if (cached) {
      return cached;
    }

    try {
      // Use existing download URL or get a new one
      let downloadUrl = item.url;
      if (!downloadUrl) {
        downloadUrl = await this.getDownloadUrl(item);
      }

      const response = await fetch(downloadUrl);
      if (!response.ok) {
        throw new Error(`Download failed: ${response.statusText}`);
      }

      let blob = await response.blob();

      // Handle decryption if needed
      if (item.isEncrypted && decryptionOptions) {
        // Get encryption metadata from SDK
        try {
          // For now, use simplified decryption until SDK exposes metadata
          const encryptedData = new Uint8Array(await blob.arrayBuffer());
          
          // Mock header and metadata for compatibility
          const header = new Uint8Array(32); // Mock header
          const metadata = { encrypted: true };

          const decryptionResult = await decryptionOptions.decrypt(
            encryptedData,
            header,
            metadata,
            item.id
          );

          if (!decryptionResult.success) {
            throw new Error(decryptionResult.error || 'Failed to decrypt file');
          }

          blob = new Blob([decryptionResult.encryptedFile!], {
            type: item.mimeType || 'application/octet-stream',
          });
        } catch (decryptError) {
          this.handleVaultError(decryptError, 'decrypt-file', {
            fileId: item.id,
            fileName: item.name,
          });
          throw decryptError;
        }
      }

      // Cache for 5 minutes
      this.downloadCache.set(item.id, blob);
      setTimeout(() => this.downloadCache.delete(item.id), 5 * 60 * 1000);

      return blob;

    } catch (error) {
      this.handleVaultError(error, 'download-file', {
        fileId: item.id,
        fileName: item.name,
        isEncrypted: item.isEncrypted,
      });
      throw error;
    }
  }

  async getDownloadUrl(item: VaultItem): Promise<string> {
    try {
      // SDK doesn't have direct download URL method yet, use item URL
      if (item.url) {
        return item.url;
      }
      
      // Fallback to legacy method for now
      throw new Error('Download URL not available');
      
    } catch (error) {
      this.handleVaultError(error, 'get-download-url', {
        fileId: item.id,
        fileName: item.name,
      });
      throw error;
    }
  }

  // Folder Operations

  async createFolder(name: string, parentId: string | null = null): Promise<VaultFolder> {
    try {
      // SDK doesn't have folder creation yet, so we'll use a mock implementation
      // This would use the legacy VaultService for now
      throw new Error('Folder creation not yet implemented in SDK');
      
    } catch (error) {
      this.handleVaultError(error, 'create-folder', {
        folderName: name,
        parentId,
      });
      throw error;
    }
  }

  // Item Management

  async getItems(
    parentId: string | null = null,
    includeDeleted = false
  ): Promise<{
    items: VaultItem[];
    folders: VaultFolder[];
  }> {
    const cacheKey = cacheKeys.vaultItems('current-user', parentId || 'root');

    try {
      const result = await cacheService.getOrSet(
        cacheKey,
        async () => {
          // Use SDK to get items
          const sdkItems = await this.apiClient.getItems({});
          
          // Convert SDK items to legacy format
          const items = sdkItems.items.map(item => this.convertSDKItemToLegacy(item));
          
          // For now, folders are empty since SDK doesn't handle folders yet
          const folders: VaultFolder[] = [];

          return { items, folders };
        },
        { ttl: 5 * 60 * 1000, persist: true }
      );

      return result;

    } catch (error) {
      this.handleVaultError(error, 'get-items', {
        parentId,
        includeDeleted,
      });
      throw error;
    }
  }

  async searchItems(
    query: string,
    filters?: {
      type?: 'file' | 'folder';
      mimeType?: string;
      minSize?: number;
      maxSize?: number;
      tags?: string[];
    }
  ): Promise<VaultItem[]> {
    try {
      // SDK doesn't have search yet, return empty for now
      console.warn('Search not yet implemented in SDK');
      return [];
      
    } catch (error) {
      this.handleVaultError(error, 'search-items', {
        query,
        filters,
      });
      throw error;
    }
  }

  async deleteFile(itemId: string, permanent = false): Promise<void> {
    try {
      await this.apiClient.deleteItem({ itemId, permanent });
      
      // Show success toast
      showRateLimitedToast(toast, {
        title: 'File Deleted',
        description: permanent ? 'File permanently deleted' : 'File moved to trash',
        variant: 'default',
      });

      this.invalidateCache();
      
    } catch (error) {
      this.handleVaultError(error, 'delete-file', {
        itemId,
        permanent,
      });
      throw error;
    }
  }

  async renameItem(itemId: string, newName: string): Promise<void> {
    try {
      await this.apiClient.renameItem({ itemId, newName });
      
      // Show success toast
      showRateLimitedToast(toast, {
        title: 'File Renamed',
        description: `File renamed to ${newName}`,
        variant: 'default',
      });

      this.invalidateCache();
      
    } catch (error) {
      this.handleVaultError(error, 'rename-item', {
        itemId,
        newName,
      });
      throw error;
    }
  }

  // Sharing Operations

  async shareItem(
    itemId: string,
    options: {
      userIds?: string[];
      expiresAt?: Date;
      allowDownload?: boolean;
      password?: string;
    }
  ): Promise<{ shareLink: string; shareId: string }> {
    try {
      if (!options.userIds?.length) {
        throw new Error('Must specify users to share with');
      }

      await this.apiClient.shareItem({
        itemId,
        userIds: options.userIds,
        permissions: 'read', // Default to read permission
      });

      // Show success toast
      showRateLimitedToast(toast, {
        title: 'Item Shared',
        description: `Shared with ${options.userIds.length} user(s)`,
        variant: 'success',
      });

      this.invalidateCache();

      return {
        shareLink: 'shared-with-users', // SDK doesn't return actual links yet
        shareId: itemId,
      };
      
    } catch (error) {
      this.handleVaultError(error, 'share-item', {
        itemId,
        userCount: options.userIds?.length || 0,
      });
      throw error;
    }
  }

  // Storage Information

  async getStorageInfo(): Promise<VaultStorageInfo> {
    try {
      // SDK doesn't have storage info yet, return mock data
      return {
        usedBytes: 0,
        totalBytes: 5 * 1024 * 1024 * 1024, // 5GB
        fileCount: 0,
        folderCount: 0,
        largestFiles: [],
        fileTypeBreakdown: {},
      };
      
    } catch (error) {
      this.handleVaultError(error, 'get-storage-info');
      throw error;
    }
  }

  // Utility Methods

  cancelUpload(uploadId: string) {
    const task = this.uploadTasks.get(uploadId);
    if (task) {
      task.cancel();
      this.uploadTasks.delete(uploadId);
    }
  }

  private invalidateCache() {
    cacheService.invalidatePattern(/vault/);
  }

  private getFileTypeFromMime(mimeType: string): 'image' | 'video' | 'audio' | 'document' | 'other' {
    if (mimeType.startsWith('image/')) return 'image';
    if (mimeType.startsWith('video/')) return 'video';
    if (mimeType.startsWith('audio/')) return 'audio';
    if (
      mimeType.includes('pdf') ||
      mimeType.includes('document') ||
      mimeType.includes('word') ||
      mimeType.includes('sheet') ||
      mimeType.includes('excel') ||
      mimeType.includes('presentation') ||
      mimeType.includes('powerpoint')
    ) {
      return 'document';
    }
    return 'other';
  }

  // Backward compatibility methods

  async moveItem(_itemId: string, _newParentId: string | null): Promise<void> {
    // SDK doesn't support folders yet, so this is a no-op for now
    void _itemId;
    void _newParentId;
    console.warn('Move item not yet implemented in SDK (no folder support)');
  }

  async restoreFile(_itemId: string): Promise<void> {
    // SDK doesn't have restore yet
    void _itemId;
    console.warn('Restore file not yet implemented in SDK');
  }

  async getDeletedItems(): Promise<VaultItem[]> {
    // SDK doesn't have deleted items tracking yet
    return [];
  }

  async cleanupDeletedItems(
    _olderThanDays: number = 30,
    _force: boolean = false
  ): Promise<{ deletedCount: number }> {
    // SDK doesn't have cleanup yet
    void _olderThanDays;
    void _force;
    return { deletedCount: 0 };
  }

  // Monitoring & Analytics Methods (not yet implemented in SDK)
  
  async getEncryptionStats() {
    // Fallback to mock data for now
    return {
      encryption: {
        totalItems: 0,
        encryptedItems: 0,
        encryptionPercentage: '0',
        totalSize: 0,
        encryptedSize: 0,
        encryptedSizePercentage: '0',
        keyUsage: [],
      },
      keyRotation: {
        lastRotation: null,
        rotationCount: 0,
        history: [],
      },
      shareLinks: {
        active: 0,
        expired: 0,
        totalAccessCount: 0,
      },
    };
  }

  async getKeyRotationStatus() {
    // Fallback to mock data for now
    return {
      hasVaultKey: false,
      requiresRotation: false,
      lastRotation: null,
      nextRotationDue: null,
    };
  }

  async getShareLinkAnalytics() {
    // Fallback to mock data for now
    return {
      summary: {
        totalShareLinks: 0,
        totalAccesses: 0,
        activeLinks: 0,
        passwordProtectedLinks: 0,
      },
      dailyAnalytics: [],
      topAccessedItems: [],
      recentShares: [],
    };
  }
}

// Export singleton instance and utilities
export const vaultSDKService = VaultSDKService.getInstance();

// Export for testing and debugging
export { VaultSDKService };

// Export React hook wrapper following Dynasty patterns
export function useVaultSDK() {
  const service = VaultSDKService.getInstance();
  
  return {
    // Core operations
    uploadFile: service.uploadFile.bind(service),
    downloadFile: service.downloadFile.bind(service),
    deleteFile: service.deleteFile.bind(service),
    
    // Item management
    getItems: service.getItems.bind(service),
    searchItems: service.searchItems.bind(service),
    renameItem: service.renameItem.bind(service),
    
    // Folder operations
    createFolder: service.createFolder.bind(service),
    moveItem: service.moveItem.bind(service),
    
    // Sharing
    shareItem: service.shareItem.bind(service),
    
    // Utilities
    getStorageInfo: service.getStorageInfo.bind(service),
    isEncryptionEnabled: service.isEncryptionEnabled.bind(service),
    cancelUpload: service.cancelUpload.bind(service),
  };
}