// Vault Service for Dynasty Web App
// Manages secure file storage with encryption support

import { httpsCallable } from 'firebase/functions';
import { ref, uploadBytesResumable, getDownloadURL } from 'firebase/storage';
import { functions, storage } from '@/lib/firebase';
import { errorHandler, ErrorSeverity } from './ErrorHandlingService';
import { cacheService, cacheKeys } from './CacheService';

export interface VaultItem {
  id: string;
  name: string;
  type: 'file' | 'folder';
  mimeType?: string;
  size?: number;
  parentId: string | null;
  path: string;
  url?: string;
  thumbnailUrl?: string;
  isEncrypted: boolean;
  isShared: boolean;
  sharedWith?: string[];
  createdAt: Date;
  updatedAt: Date;
  lastAccessedAt?: Date;
  metadata?: {
    width?: number;
    height?: number;
    duration?: number;
    pages?: number;
  };
  tags?: string[];
  description?: string;
}

export interface VaultFolder {
  id: string;
  name: string;
  parentId: string | null;
  path: string;
  itemCount: number;
  totalSize: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface UploadProgress {
  bytesTransferred: number;
  totalBytes: number;
  percentage: number;
  state: 'running' | 'paused' | 'success' | 'canceled' | 'error';
}

export interface VaultStorageInfo {
  usedBytes: number;
  totalBytes: number;
  fileCount: number;
  folderCount: number;
  largestFiles: VaultItem[];
  fileTypeBreakdown: Record<string, { count: number; size: number }>;
}

class VaultService {
  private static instance: VaultService;
  private uploadTasks = new Map<string, ReturnType<typeof uploadBytesResumable>>();
  private downloadCache = new Map<string, Blob>();
  private maxFileSize = 100 * 1024 * 1024; // 100MB

  private constructor() {}

  static getInstance(): VaultService {
    if (!VaultService.instance) {
      VaultService.instance = new VaultService();
    }
    return VaultService.instance;
  }

  // File Operations

  async uploadFile(
    file: File,
    parentId: string | null = null,
    onProgress?: (progress: UploadProgress) => void
  ): Promise<VaultItem> {
    // Validate file size
    if (file.size > this.maxFileSize) {
      throw new Error(`File size exceeds maximum limit of ${this.maxFileSize / 1024 / 1024}MB`);
    }

    const uploadId = `upload-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    try {
      // Get upload URL from backend
      const getUploadUrl = httpsCallable(functions, 'getVaultUploadUrl');
      const { data } = await getUploadUrl({
        fileName: file.name,
        fileType: file.type,
        fileSize: file.size,
        parentId
      });

      const { fileId, storagePath } = data as { uploadUrl: string; fileId: string; storagePath: string };

      // Upload to Firebase Storage
      const storageRef = ref(storage, storagePath);
      const uploadTask = uploadBytesResumable(storageRef, file, {
        contentType: file.type,
        customMetadata: {
          originalName: file.name,
          uploadedBy: 'web'
        }
      });

      this.uploadTasks.set(uploadId, uploadTask);

      // Monitor upload progress
      return new Promise((resolve, reject) => {
        uploadTask.on(
          'state_changed',
          (snapshot) => {
            const progress: UploadProgress = {
              bytesTransferred: snapshot.bytesTransferred,
              totalBytes: snapshot.totalBytes,
              percentage: (snapshot.bytesTransferred / snapshot.totalBytes) * 100,
              state: snapshot.state
            };
            onProgress?.(progress);
          },
          (error) => {
            this.uploadTasks.delete(uploadId);
            errorHandler.handleError(error, ErrorSeverity.HIGH, {
              action: 'vault-upload',
              fileName: file.name
            });
            reject(error);
          },
          async () => {
            try {
              // Get download URL
              const downloadUrl = await getDownloadURL(uploadTask.snapshot.ref);

              // Create vault item in backend
              const createVaultItem = httpsCallable(functions, 'createVaultItem');
              const result = await createVaultItem({
                fileId,
                name: file.name,
                mimeType: file.type,
                size: file.size,
                parentId,
                url: downloadUrl
              });

              const vaultItem = (result.data as { item: VaultItem }).item;
              
              // Invalidate cache
              this.invalidateCache();
              
              this.uploadTasks.delete(uploadId);
              resolve(vaultItem);
            } catch (error) {
              reject(error);
            }
          }
        );
      });
    } catch (error) {
      errorHandler.handleError(error, ErrorSeverity.HIGH, {
        action: 'vault-upload-init',
        fileName: file.name
      });
      throw error;
    }
  }

  async downloadFile(item: VaultItem): Promise<Blob> {
    // Check cache first
    const cached = this.downloadCache.get(item.id);
    if (cached) {
      return cached;
    }

    try {
      if (!item.url) {
        throw new Error('File URL not available');
      }

      const response = await fetch(item.url);
      if (!response.ok) {
        throw new Error('Failed to download file');
      }

      const blob = await response.blob();
      
      // Cache for 5 minutes
      this.downloadCache.set(item.id, blob);
      setTimeout(() => this.downloadCache.delete(item.id), 5 * 60 * 1000);

      return blob;
    } catch (error) {
      errorHandler.handleError(error, ErrorSeverity.MEDIUM, {
        action: 'vault-download',
        fileId: item.id
      });
      throw error;
    }
  }

  async deleteFile(itemId: string, permanent = false): Promise<void> {
    try {
      const deleteVaultItem = httpsCallable(functions, 'deleteVaultItem');
      await deleteVaultItem({ itemId, permanent });
      
      this.invalidateCache();
    } catch (error) {
      errorHandler.handleError(error, ErrorSeverity.MEDIUM, {
        action: 'vault-delete',
        itemId
      });
      throw error;
    }
  }

  async restoreFile(itemId: string): Promise<void> {
    try {
      const restoreVaultItem = httpsCallable(functions, 'restoreVaultItem');
      await restoreVaultItem({ itemId });
      
      this.invalidateCache();
    } catch (error) {
      errorHandler.handleError(error, ErrorSeverity.MEDIUM, {
        action: 'vault-restore',
        itemId
      });
      throw error;
    }
  }

  // Folder Operations

  async createFolder(name: string, parentId: string | null = null): Promise<VaultFolder> {
    try {
      const createFolder = httpsCallable(functions, 'createVaultFolder');
      const result = await createFolder({ name, parentId });
      
      this.invalidateCache();
      const data = result.data as { folder: VaultFolder };
      return data.folder;
    } catch (error) {
      errorHandler.handleError(error, ErrorSeverity.MEDIUM, {
        action: 'vault-create-folder',
        folderName: name
      });
      throw error;
    }
  }

  async moveItem(itemId: string, newParentId: string | null): Promise<void> {
    try {
      const moveVaultItem = httpsCallable(functions, 'moveVaultItem');
      await moveVaultItem({ itemId, newParentId });
      
      this.invalidateCache();
    } catch (error) {
      errorHandler.handleError(error, ErrorSeverity.MEDIUM, {
        action: 'vault-move',
        itemId
      });
      throw error;
    }
  }

  async renameItem(itemId: string, newName: string): Promise<void> {
    try {
      const renameVaultItem = httpsCallable(functions, 'renameVaultItem');
      await renameVaultItem({ itemId, newName });
      
      this.invalidateCache();
    } catch (error) {
      errorHandler.handleError(error, ErrorSeverity.MEDIUM, {
        action: 'vault-rename',
        itemId
      });
      throw error;
    }
  }

  // Search and List Operations

  async getItems(parentId: string | null = null, includeDeleted = false): Promise<{
    items: VaultItem[];
    folders: VaultFolder[];
  }> {
    const cacheKey = cacheKeys.vaultItems(
      'current-user',
      parentId || 'root'
    );

    try {
      return await cacheService.getOrSet(
        cacheKey,
        async () => {
          const getVaultItems = httpsCallable(functions, 'getVaultItems');
          const result = await getVaultItems({ parentId, includeDeleted });
          const data = result.data as { items: VaultItem[]; folders: VaultFolder[] };
          return data;
        },
        { ttl: 5 * 60 * 1000, persist: true }
      );
    } catch (error) {
      errorHandler.handleError(error, ErrorSeverity.MEDIUM, {
        action: 'vault-get-items',
        parentId
      });
      throw error;
    }
  }

  async searchItems(query: string, filters?: {
    type?: 'file' | 'folder';
    mimeType?: string;
    minSize?: number;
    maxSize?: number;
    tags?: string[];
  }): Promise<VaultItem[]> {
    try {
      const searchVaultItems = httpsCallable(functions, 'searchVaultItems');
      const result = await searchVaultItems({ query, filters });
      const data = result.data as { items?: VaultItem[] };
      return data.items || [];
    } catch (error) {
      errorHandler.handleError(error, ErrorSeverity.LOW, {
        action: 'vault-search',
        query
      });
      throw error;
    }
  }

  async getDeletedItems(): Promise<VaultItem[]> {
    try {
      const getDeletedVaultItems = httpsCallable(functions, 'getDeletedVaultItems');
      const result = await getDeletedVaultItems();
      const data = result.data as { items?: VaultItem[] };
      return data.items || [];
    } catch (error) {
      errorHandler.handleError(error, ErrorSeverity.LOW, {
        action: 'vault-get-deleted'
      });
      throw error;
    }
  }

  // Sharing Operations

  async shareItem(itemId: string, options: {
    userIds?: string[];
    expiresAt?: Date;
    allowDownload?: boolean;
    password?: string;
  }): Promise<{ shareLink: string; shareId: string }> {
    try {
      const shareVaultItem = httpsCallable(functions, 'shareVaultItem');
      const result = await shareVaultItem({
        itemId,
        ...options,
        expiresAt: options.expiresAt?.toISOString()
      });
      
      const data = result.data as { shareLink: string; shareId: string };
      return data;
    } catch (error) {
      errorHandler.handleError(error, ErrorSeverity.MEDIUM, {
        action: 'vault-share',
        itemId
      });
      throw error;
    }
  }

  async revokeShare(shareId: string): Promise<void> {
    try {
      const revokeVaultShare = httpsCallable(functions, 'revokeVaultShare');
      await revokeVaultShare({ shareId });
    } catch (error) {
      errorHandler.handleError(error, ErrorSeverity.LOW, {
        action: 'vault-revoke-share',
        shareId
      });
      throw error;
    }
  }

  // Storage Management

  async getStorageInfo(): Promise<VaultStorageInfo> {
    try {
      const getVaultStorageInfo = httpsCallable(functions, 'getVaultStorageInfo');
      const result = await getVaultStorageInfo();
      return result.data as VaultStorageInfo;
    } catch (error) {
      errorHandler.handleError(error, ErrorSeverity.LOW, {
        action: 'vault-storage-info'
      });
      throw error;
    }
  }

  async cleanupDeletedItems(olderThanDays = 30): Promise<{ deletedCount: number }> {
    try {
      const cleanupDeletedVaultItems = httpsCallable(functions, 'cleanupDeletedVaultItems');
      const result = await cleanupDeletedVaultItems({ olderThanDays });
      
      this.invalidateCache();
      const data = result.data as { deletedCount: number };
      return data;
    } catch (error) {
      errorHandler.handleError(error, ErrorSeverity.LOW, {
        action: 'vault-cleanup'
      });
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

  // File type utilities
  static getFileIcon(mimeType?: string): string {
    if (!mimeType) return '📄';
    
    if (mimeType.startsWith('image/')) return '🖼️';
    if (mimeType.startsWith('video/')) return '🎥';
    if (mimeType.startsWith('audio/')) return '🎵';
    if (mimeType.includes('pdf')) return '📑';
    if (mimeType.includes('word') || mimeType.includes('document')) return '📝';
    if (mimeType.includes('sheet') || mimeType.includes('excel')) return '📊';
    if (mimeType.includes('presentation') || mimeType.includes('powerpoint')) return '📈';
    if (mimeType.includes('zip') || mimeType.includes('archive')) return '🗜️';
    
    return '📄';
  }

  static formatFileSize(bytes: number): string {
    const units = ['B', 'KB', 'MB', 'GB'];
    let size = bytes;
    let unitIndex = 0;
    
    while (size >= 1024 && unitIndex < units.length - 1) {
      size /= 1024;
      unitIndex++;
    }
    
    return `${size.toFixed(unitIndex > 0 ? 1 : 0)} ${units[unitIndex]}`;
  }
}

// Export singleton instance
export const vaultService = VaultService.getInstance();

// Export static utilities
export const getFileIcon = VaultService.getFileIcon;
export const formatFileSize = VaultService.formatFileSize;