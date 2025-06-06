// Vault Service for Dynasty Web App
// Manages secure file storage with encryption support

import { ref, uploadBytesResumable, getDownloadURL } from 'firebase/storage';
import { storage, functions } from '@/lib/firebase';
import { errorHandler, ErrorSeverity } from './ErrorHandlingService';
import { cacheService, cacheKeys } from './CacheService';
import { FirebaseFunctionsClient, createFirebaseClient } from '@/lib/functions-client';
import { Timestamp } from 'firebase/firestore';

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

// Type for vault item data from API
interface VaultItemData {
  id: string;
  name: string;
  type: 'file' | 'folder';
  mimeType?: string;
  size?: number;
  parentId: string | null;
  path: string;
  url?: string;
  thumbnailUrl?: string;
  isEncrypted?: boolean;
  isShared?: boolean;
  sharedWith?: string[];
  createdAt: Timestamp | string | Date; // Can be Timestamp or string
  updatedAt: Timestamp | string | Date; // Can be Timestamp or string
  lastAccessedAt?: Timestamp | string | Date;
  metadata?: {
    width?: number;
    height?: number;
    duration?: number;
    pages?: number;
  };
  tags?: string[];
  description?: string;
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
  private functionsClient: FirebaseFunctionsClient;

  private constructor() {
    // Initialize Firebase Functions client
    if (functions) {
      this.functionsClient = createFirebaseClient(functions);
    } else {
      throw new Error('Firebase Functions not initialized');
    }
  }

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
      const { data } = await this.functionsClient.callFunction('getVaultUploadSignedUrl', {
        fileName: file.name,
        mimeType: file.type,
        fileSize: file.size,
        parentId
      });

      const { storagePath, itemId } = data as { signedUrl: string; storagePath: string; itemId: string };

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

              // Update vault item in backend
              await this.functionsClient.callFunction('addVaultFile', {
                itemId,
                name: file.name,
                storagePath,
                fileType: this.getFileType(file.type),
                size: file.size,
                mimeType: file.type,
                parentId
              });

              const vaultItem: VaultItem = {
                id: itemId,
                name: file.name,
                type: 'file',
                mimeType: file.type,
                size: file.size,
                parentId,
                path: `/${file.name}`,
                url: downloadUrl,
                isEncrypted: false,
                isShared: false,
                createdAt: new Date(),
                updatedAt: new Date()
              };
              
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
      // If no URL is available, fetch it first
      let downloadUrl = item.url;
      if (!downloadUrl) {
        downloadUrl = await this.getDownloadUrl(item);
      }

      const response = await fetch(downloadUrl);
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

  /**
   * Validates if a URL is from allowed Firebase Storage domains
   */
  private isValidStorageUrl(url: string): boolean {
    try {
      const parsedUrl = new URL(url);
      const allowedHosts = [
        'firebasestorage.googleapis.com',
        'storage.googleapis.com',
        'dynasty-eba63.firebasestorage.app'
      ];
      
      return allowedHosts.some(host => parsedUrl.hostname.includes(host)) &&
             parsedUrl.protocol === 'https:';
    } catch {
      return false;
    }
  }

  async getDownloadUrl(item: VaultItem): Promise<string> {
    try {
      const result = await this.functionsClient.callFunction('getVaultDownloadUrl', {
        itemId: item.id
      });
      
      const data = result.data as { downloadUrl: string };
      
      if (!data.downloadUrl) {
        throw new Error('No download URL returned');
      }
      
      // Validate the URL before using it
      if (!this.isValidStorageUrl(data.downloadUrl)) {
        throw new Error('Invalid download URL received');
      }
      
      // Update the item's URL for future use
      item.url = data.downloadUrl;
      
      return data.downloadUrl;
    } catch (error) {
      errorHandler.handleError(error, ErrorSeverity.MEDIUM, {
        action: 'vault-get-download-url',
        fileId: item.id
      });
      throw new Error('Failed to get download URL');
    }
  }

  async deleteFile(itemId: string, permanent = false): Promise<void> {
    try {
      await this.functionsClient.callFunction('deleteVaultItem', { itemId, permanent });
      
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
      await this.functionsClient.callFunction('restoreVaultItem', { itemId });
      
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
      const result = await this.functionsClient.callFunction('createVaultFolder', { name, parentFolderId: parentId });
      
      this.invalidateCache();
      const data = result.data as { id: string };
      return {
        id: data.id,
        name,
        parentId,
        path: parentId ? `parent/${name}` : `/${name}`,
        itemCount: 0,
        totalSize: 0,
        createdAt: new Date(),
        updatedAt: new Date()
      };
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
      await this.functionsClient.callFunction('moveVaultItem', { itemId, newParentId });
      
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
      await this.functionsClient.callFunction('renameVaultItem', { itemId, newName });
      
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
      const result = await cacheService.getOrSet(
        cacheKey,
        async () => {
          const result = await this.functionsClient.callFunction('getVaultItems', { parentId, includeDeleted });
          const data = result.data as { items: VaultItemData[] };
          
          // Separate files and folders
          const items: VaultItem[] = [];
          const folders: VaultFolder[] = [];
          
          data.items.forEach((item: VaultItemData) => {
            if (item.type === 'folder') {
              folders.push({
                id: item.id,
                name: item.name,
                parentId: item.parentId,
                path: item.path,
                itemCount: 0,
                totalSize: 0,
                createdAt: this.convertTimestampToDate(item.createdAt),
                updatedAt: this.convertTimestampToDate(item.updatedAt)
              });
            } else {
              items.push({
                ...item,
                isEncrypted: item.isEncrypted ?? false,
                isShared: item.isShared ?? false,
                createdAt: this.convertTimestampToDate(item.createdAt),
                updatedAt: this.convertTimestampToDate(item.updatedAt),
                lastAccessedAt: item.lastAccessedAt ? this.convertTimestampToDate(item.lastAccessedAt) : undefined,
                // Note: downloadURL is not provided by getVaultItems, need to fetch separately
                url: item.url || undefined
              });
            }
          });
          
          return { items, folders };
        },
        { ttl: 5 * 60 * 1000, persist: true }
      );

      // Pre-fetch URLs for image files (but don't wait for them)
      this.prefetchImageUrls(result.items);
      
      return result;
    } catch (error) {
      errorHandler.handleError(error, ErrorSeverity.MEDIUM, {
        action: 'vault-get-items',
        parentId
      });
      throw error;
    }
  }

  // Pre-fetch URLs for image files to improve performance
  private async prefetchImageUrls(items: VaultItem[]): Promise<void> {
    const imageItems = items.filter(item => 
      item.mimeType?.startsWith('image/') && !item.url
    );

    // Fetch URLs in parallel but don't wait
    Promise.all(
      imageItems.map(async item => {
        try {
          await this.getDownloadUrl(item);
        } catch {
          console.warn('Failed to prefetch URL for item:', item.id);
        }
      })
    ).catch(() => {
      // Ignore errors - this is just optimization
    });
  }

  async searchItems(query: string, filters?: {
    type?: 'file' | 'folder';
    mimeType?: string;
    minSize?: number;
    maxSize?: number;
    tags?: string[];
  }): Promise<VaultItem[]> {
    try {
      const result = await this.functionsClient.callFunction('searchVaultItems', { query, filters });
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
      const result = await this.functionsClient.callFunction('getDeletedVaultItems', {});
      const data = result.data as { items?: VaultItem[] };
      
      // Convert timestamps for deleted items
      const items = (data.items || []).map(item => ({
        ...item,
        createdAt: this.convertTimestampToDate(item.createdAt),
        updatedAt: this.convertTimestampToDate(item.updatedAt),
        lastAccessedAt: item.lastAccessedAt ? this.convertTimestampToDate(item.lastAccessedAt) : undefined,
      }));
      
      return items;
    } catch (error) {
      errorHandler.handleError(error, ErrorSeverity.LOW, {
        action: 'vault-get-deleted'
      });
      throw error;
    }
  }

  async cleanupDeletedItems(olderThanDays: number = 30, force: boolean = false): Promise<{ deletedCount: number }> {
    try {
      const result = await this.functionsClient.callFunction('cleanupDeletedVaultItems', {
        olderThanDays,
        force
      });
      
      const data = result.data as { deletedCount: number };
      this.invalidateCache();
      return data;
    } catch (error) {
      errorHandler.handleError(error, ErrorSeverity.MEDIUM, {
        action: 'vault-cleanup',
        olderThanDays,
        force
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
      const result = await this.functionsClient.callFunction('shareVaultItem', {
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
      await this.functionsClient.callFunction('revokeVaultShare', { shareId });
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
      const result = await this.functionsClient.callFunction('getVaultStorageInfo', {});
      return result.data as VaultStorageInfo;
    } catch (error) {
      errorHandler.handleError(error, ErrorSeverity.LOW, {
        action: 'vault-storage-info'
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

  private getFileType(mimeType: string): 'image' | 'video' | 'audio' | 'document' | 'other' {
    if (mimeType.startsWith('image/')) return 'image';
    if (mimeType.startsWith('video/')) return 'video';
    if (mimeType.startsWith('audio/')) return 'audio';
    if (mimeType.includes('pdf') || mimeType.includes('document') || mimeType.includes('word') || 
        mimeType.includes('sheet') || mimeType.includes('excel') || mimeType.includes('presentation') || 
        mimeType.includes('powerpoint')) {
      return 'document';
    }
    return 'other';
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

  // Helper method to convert Firestore timestamps to Date objects
  private convertTimestampToDate(timestamp: unknown): Date {
    if (!timestamp) {
      return new Date();
    }

    // Handle Firestore Timestamp objects
    if (timestamp && typeof timestamp === 'object') {
      // Check for Firestore Timestamp format
      const timestampObj = timestamp as { seconds?: number; nanoseconds?: number; _seconds?: number; _nanoseconds?: number; toDate?: () => Date };
      if (timestampObj.seconds !== undefined && timestampObj.nanoseconds !== undefined) {
        return new Date(timestampObj.seconds * 1000);
      }
      // Check for _seconds format (sometimes returned by Firebase Functions)
      if (timestampObj._seconds !== undefined && timestampObj._nanoseconds !== undefined) {
        return new Date(timestampObj._seconds * 1000);
      }
      // Check for toDate method (Firestore Timestamp class)
      if (timestampObj.toDate && typeof timestampObj.toDate === 'function') {
        return timestampObj.toDate();
      }
    }

    // Handle string dates
    if (typeof timestamp === 'string') {
      const date = new Date(timestamp);
      return isNaN(date.getTime()) ? new Date() : date;
    }

    // Handle number (milliseconds)
    if (typeof timestamp === 'number') {
      return new Date(timestamp);
    }

    // Default to current date if we can't parse
    console.warn('Unable to parse timestamp:', timestamp);
    return new Date();
  }
}

// Export singleton instance
export const vaultService = VaultService.getInstance();

// Export static utilities
export const getFileIcon = VaultService.getFileIcon;
export const formatFileSize = VaultService.formatFileSize;