import { FirebaseFirestoreTypes } from '@react-native-firebase/firestore';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FileSystem from 'expo-file-system';
import { 
  callFirebaseFunction, 
  getFirebaseDb, 
  normalizeError,
  AppError,
  ErrorCode 
} from '../lib/firebaseUtils';
import { CacheManager } from '../database/CacheManager';
import { SyncDatabase } from '../database/SyncDatabase';
import NetInfo from '@react-native-community/netinfo';

// Constants
const VAULT_CACHE_PREFIX = 'vault_cache_';
const VAULT_CACHE_TTL = 30 * 60 * 1000; // 30 minutes
const MAX_FILE_SIZE = 100 * 1024 * 1024; // 100MB
const CHUNK_SIZE = 5 * 1024 * 1024; // 5MB chunks for large files
const MAX_RETRY_ATTEMPTS = 3;
const RETRY_DELAY = 1000; // 1 second

// Types
export interface VaultItem {
  id: string;
  userId: string;
  name: string;
  type: 'file' | 'folder';
  parentId: string | null;
  path: string;
  size?: number;
  fileType?: 'image' | 'video' | 'audio' | 'document' | 'other';
  mimeType?: string;
  storagePath?: string;
  downloadURL?: string;
  isEncrypted?: boolean;
  encryptionKeyId?: string;
  thumbnailUrl?: string;
  metadata?: Record<string, any>;
  createdAt: FirebaseFirestoreTypes.Timestamp;
  updatedAt: FirebaseFirestoreTypes.Timestamp;
  isDeleted?: boolean;
  deletedAt?: FirebaseFirestoreTypes.Timestamp;
  sharedWith?: string[];
  permissions?: {
    canRead?: string[];
    canWrite?: string[];
  };
}

export interface VaultUploadOptions {
  onProgress?: (progress: number) => void;
  encrypt?: boolean;
  generateThumbnail?: boolean;
  chunkUpload?: boolean;
}

export interface VaultDownloadOptions {
  onProgress?: (progress: number) => void;
  saveToDevice?: boolean;
  cacheResult?: boolean;
}

export interface VaultSearchOptions {
  query?: string;
  fileTypes?: string[];
  parentId?: string | null;
  includeDeleted?: boolean;
  sortBy?: 'name' | 'date' | 'size' | 'type';
  sortOrder?: 'asc' | 'desc';
  limit?: number;
}

export interface VaultStorageInfo {
  totalUsed: number;
  fileCount: number;
  folderCount: number;
  byFileType: Record<string, { count: number; size: number }>;
  quota?: number;
}

// Main Service Class
export class VaultService {
  private static instance: VaultService;
  private db: FirebaseFirestoreTypes.Module;
  private cacheManager: CacheManager;
  private syncDb: SyncDatabase | null = null;
  private uploadQueue: Map<string, any> = new Map();
  private downloadCache: Map<string, any> = new Map();
  private isInitialized = false;

  private constructor() {
    this.db = getFirebaseDb();
    this.cacheManager = CacheManager.getInstance();
  }

  static getInstance(): VaultService {
    if (!VaultService.instance) {
      VaultService.instance = new VaultService();
    }
    return VaultService.instance;
  }

  async initialize(): Promise<void> {
    if (this.isInitialized) return;

    try {
      console.log('[VaultService] Initializing...');
      
      // Initialize SQLite database for offline support
      this.syncDb = await SyncDatabase.getInstance();
      
      // Setup network monitoring
      NetInfo.addEventListener(state => {
        if (state.isConnected) {
          this.processOfflineQueue();
        }
      });

      // Clean up old cache entries
      await this.cleanupCache();
      
      this.isInitialized = true;
      console.log('[VaultService] Initialized successfully');
    } catch (error) {
      console.error('[VaultService] Initialization error:', error);
      throw normalizeError(error);
    }
  }

  // Fetch vault items with caching
  async getItems(parentId: string | null = null, forceRefresh = false): Promise<VaultItem[]> {
    const cacheKey = `${VAULT_CACHE_PREFIX}items_${parentId || 'root'}`;

    // Check cache first if not forcing refresh
    if (!forceRefresh) {
      const cached = await this.cacheManager.get<VaultItem[]>(cacheKey);
      if (cached) {
        console.log('[VaultService] Returning cached items');
        return cached;
      }
    }

    try {
      const result = await callFirebaseFunction('getVaultItems', { parentId });
      const items = result.data.items as VaultItem[];

      // Cache the results
      await this.cacheManager.set(cacheKey, items, VAULT_CACHE_TTL);

      return items;
    } catch (error) {
      console.error('[VaultService] Error fetching items:', error);
      
      // If offline, try to get from SQLite
      if (this.syncDb) {
        const offlineItems = await this.getOfflineItems(parentId);
        if (offlineItems.length > 0) {
          console.log('[VaultService] Returning offline items');
          return offlineItems;
        }
      }
      
      throw error;
    }
  }

  // Create folder
  async createFolder(name: string, parentId: string | null = null): Promise<string> {
    try {
      const result = await callFirebaseFunction('createVaultFolder', { name, parentId });
      
      // Invalidate parent folder cache
      const cacheKey = `${VAULT_CACHE_PREFIX}items_${parentId || 'root'}`;
      await this.cacheManager.delete(cacheKey);
      
      return result.data.folderId;
    } catch (error) {
      console.error('[VaultService] Error creating folder:', error);
      throw error;
    }
  }

  // Upload file with progress tracking and chunking for large files
  async uploadFile(
    uri: string,
    fileName: string,
    mimeType: string,
    parentId: string | null = null,
    options: VaultUploadOptions = {}
  ): Promise<VaultItem> {
    try {
      // Get file info
      const fileInfo = await this.getFileInfo(uri);
      
      // Validate file size
      if (fileInfo.size > MAX_FILE_SIZE) {
        throw new AppError(
          ErrorCode.INVALID_REQUEST,
          `File size exceeds maximum allowed size of ${MAX_FILE_SIZE / (1024 * 1024)}MB`
        );
      }

      // Generate unique upload ID
      const uploadId = `upload_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      
      // Add to upload queue
      this.uploadQueue.set(uploadId, {
        uri,
        fileName,
        mimeType,
        parentId,
        options,
        status: 'pending',
        progress: 0,
        startTime: Date.now()
      });

      try {
        // Get upload URL from backend
        const { signedUrl, storagePath } = await callFirebaseFunction('getUploadSignedUrl', {
          fileName,
          mimeType,
          parentId,
          fileSize: fileInfo.size,
          encrypt: options.encrypt || false
        });

        // Upload file
        if (fileInfo.size > CHUNK_SIZE && options.chunkUpload) {
          await this.uploadFileInChunks(uri, signedUrl, fileInfo.size, uploadId, options.onProgress);
        } else {
          await this.uploadFileSimple(uri, signedUrl, mimeType, uploadId, options.onProgress);
        }

        // Create file record in Firestore
        const fileType = this.getFileType(mimeType, fileName);
        const result = await callFirebaseFunction('addVaultFile', {
          name: fileName,
          parentId,
          storagePath,
          fileType,
          size: fileInfo.size,
          mimeType,
          isEncrypted: options.encrypt || false,
          metadata: {
            uploadedAt: new Date().toISOString(),
            uploadId
          }
        });

        // Update upload queue
        this.uploadQueue.set(uploadId, {
          ...this.uploadQueue.get(uploadId),
          status: 'completed',
          progress: 100,
          completedAt: Date.now()
        });

        // Invalidate cache
        const cacheKey = `${VAULT_CACHE_PREFIX}items_${parentId || 'root'}`;
        await this.cacheManager.delete(cacheKey);

        return result.data as VaultItem;
      } catch (error) {
        // Update upload queue with error
        this.uploadQueue.set(uploadId, {
          ...this.uploadQueue.get(uploadId),
          status: 'failed',
          error: normalizeError(error)
        });
        throw error;
      }
    } catch (error) {
      console.error('[VaultService] Upload error:', error);
      throw normalizeError(error);
    }
  }

  // Download file with progress tracking
  async downloadFile(
    item: VaultItem,
    options: VaultDownloadOptions = {}
  ): Promise<string> {
    try {
      if (!item.downloadURL && !item.storagePath) {
        throw new AppError(ErrorCode.INVALID_REQUEST, 'No download URL available');
      }

      // Check download cache
      const cacheKey = `download_${item.id}`;
      if (!options.saveToDevice && this.downloadCache.has(cacheKey)) {
        return this.downloadCache.get(cacheKey);
      }

      // Determine download path
      const downloadDir = FileSystem.documentDirectory || FileSystem.cacheDirectory!;
      const localPath = `${downloadDir}${item.name}`;

      // Download file
      const downloadUrl = item.downloadURL || await this.getDownloadUrl(item.storagePath!);
      
      // Create download resumable
      const downloadResumable = FileSystem.createDownloadResumable(
        downloadUrl,
        localPath,
        {},
        (downloadProgress) => {
          if (options.onProgress) {
            const progress = Math.round((downloadProgress.totalBytesWritten / downloadProgress.totalBytesExpectedToWrite) * 100);
            options.onProgress(progress);
          }
        }
      );

      const downloadResult = await downloadResumable.downloadAsync();

      // Cache result if requested
      if (options.cacheResult && !options.saveToDevice) {
        this.downloadCache.set(cacheKey, localPath);
      }

      return localPath;
    } catch (error) {
      console.error('[VaultService] Download error:', error);
      throw normalizeError(error);
    }
  }

  // Delete item (soft delete)
  async deleteItem(itemId: string): Promise<void> {
    try {
      await callFirebaseFunction('deleteVaultItem', { itemId });
      
      // Clear all caches as we don't know which folder was affected
      await this.clearAllCaches();
    } catch (error) {
      console.error('[VaultService] Delete error:', error);
      throw error;
    }
  }

  // Restore deleted item
  async restoreItem(itemId: string): Promise<void> {
    try {
      await callFirebaseFunction('restoreVaultItem', { itemId });
      
      // Clear all caches
      await this.clearAllCaches();
    } catch (error) {
      console.error('[VaultService] Restore error:', error);
      throw error;
    }
  }

  // Get deleted items (trash)
  async getDeletedItems(): Promise<VaultItem[]> {
    try {
      const result = await callFirebaseFunction('getDeletedVaultItems', {});
      return result.data.items as VaultItem[];
    } catch (error) {
      console.error('[VaultService] Error fetching deleted items:', error);
      throw error;
    }
  }

  // Search vault items
  async searchItems(options: VaultSearchOptions = {}): Promise<VaultItem[]> {
    try {
      const result = await callFirebaseFunction('searchVaultItems', options);
      return result.data.items as VaultItem[];
    } catch (error) {
      console.error('[VaultService] Search error:', error);
      throw error;
    }
  }

  // Get storage info
  async getStorageInfo(): Promise<VaultStorageInfo> {
    try {
      const result = await callFirebaseFunction('getVaultStorageInfo', {});
      return result.data as VaultStorageInfo;
    } catch (error) {
      console.error('[VaultService] Error getting storage info:', error);
      throw error;
    }
  }

  // Rename item
  async renameItem(itemId: string, newName: string): Promise<void> {
    try {
      await callFirebaseFunction('renameVaultItem', { itemId, newName });
      
      // Clear all caches
      await this.clearAllCaches();
    } catch (error) {
      console.error('[VaultService] Rename error:', error);
      throw error;
    }
  }

  // Move item to different folder
  async moveItem(itemId: string, newParentId: string | null): Promise<void> {
    try {
      await callFirebaseFunction('moveVaultItem', { itemId, newParentId });
      
      // Clear all caches
      await this.clearAllCaches();
    } catch (error) {
      console.error('[VaultService] Move error:', error);
      throw error;
    }
  }

  // Share item with other users
  async shareItem(itemId: string, userIds: string[], permissions: 'read' | 'write' = 'read'): Promise<void> {
    try {
      await callFirebaseFunction('shareVaultItem', { itemId, userIds, permissions });
    } catch (error) {
      console.error('[VaultService] Share error:', error);
      throw error;
    }
  }

  // Private helper methods

  private async getFileInfo(uri: string): Promise<{ size: number }> {
    const info = await FileSystem.getInfoAsync(uri);
    if (info.exists && 'size' in info) {
      return { size: info.size || 0 };
    }
    return { size: 0 };
  }

  private getFileType(mimeType: string, fileName: string): string {
    const type = mimeType.toLowerCase();
    const name = fileName.toLowerCase();

    if (type.startsWith('image/')) return 'image';
    if (type.startsWith('video/')) return 'video';
    if (type.startsWith('audio/')) return 'audio';
    if (type.includes('pdf') || name.endsWith('.pdf')) return 'document';
    if (type.includes('document') || type.includes('text')) return 'document';
    
    // Check file extensions
    const documentExts = ['.doc', '.docx', '.txt', '.ppt', '.pptx', '.xls', '.xlsx'];
    if (documentExts.some(ext => name.endsWith(ext))) return 'document';
    
    return 'other';
  }

  private async uploadFileSimple(
    uri: string,
    signedUrl: string,
    mimeType: string,
    uploadId: string,
    onProgress?: (progress: number) => void
  ): Promise<void> {
    const response = await fetch(uri);
    const blob = await response.blob();

    const xhr = new XMLHttpRequest();

    xhr.upload.addEventListener('progress', (event) => {
      if (event.lengthComputable && onProgress) {
        const progress = Math.round((event.loaded / event.total) * 100);
        onProgress(progress);
        
        // Update upload queue
        const upload = this.uploadQueue.get(uploadId);
        if (upload) {
          this.uploadQueue.set(uploadId, { ...upload, progress });
        }
      }
    });

    return new Promise((resolve, reject) => {
      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          resolve();
        } else {
          reject(new Error(`Upload failed with status: ${xhr.status}`));
        }
      };

      xhr.onerror = () => reject(new Error('Network request failed'));

      xhr.open('PUT', signedUrl);
      xhr.setRequestHeader('Content-Type', mimeType);
      xhr.send(blob);
    });
  }

  private async uploadFileInChunks(
    uri: string,
    signedUrl: string,
    _fileSize: number,
    uploadId: string,
    onProgress?: (progress: number) => void
  ): Promise<void> {
    // TODO: Implement chunked upload for large files
    // For now, fallback to simple upload
    console.log('[VaultService] Chunked upload not implemented yet, using simple upload');
    return this.uploadFileSimple(uri, signedUrl, 'application/octet-stream', uploadId, onProgress);
  }

  private async getDownloadUrl(storagePath: string): Promise<string> {
    const result = await callFirebaseFunction('getVaultDownloadUrl', { storagePath });
    return result.data.downloadUrl;
  }

  private async getOfflineItems(parentId: string | null): Promise<VaultItem[]> {
    if (!this.syncDb) return [];
    
    try {
      // Query offline vault items from SQLite
      let query = 'SELECT * FROM vault_items WHERE parent_id = ? ORDER BY type, name';
      const params = [parentId || 'NULL'];
      
      const results = await this.syncDb.executeSql(query, params);
      const items: VaultItem[] = [];
      
      if (results[0].rows.length > 0) {
        for (let i = 0; i < results[0].rows.length; i++) {
          const row = results[0].rows.item(i);
          items.push({
            id: row.id,
            userId: row.user_id,
            name: row.name,
            type: row.type,
            parentId: row.parent_id,
            path: row.path,
            size: row.size,
            fileType: row.file_type,
            mimeType: row.mime_type,
            storagePath: row.storage_path,
            downloadURL: row.download_url,
            isEncrypted: row.is_encrypted === 1,
            encryptionKeyId: row.encryption_key_id,
            createdAt: FirebaseFirestoreTypes.Timestamp.fromDate(new Date(row.created_at)),
            updatedAt: FirebaseFirestoreTypes.Timestamp.fromDate(new Date(row.updated_at)),
          });
        }
      }
      
      console.log(`[VaultService] Retrieved ${items.length} offline items`);
      return items;
    } catch (error) {
      console.error('[VaultService] Error getting offline items:', error);
      return [];
    }
  }

  private async processOfflineQueue(): Promise<void> {
    if (!this.syncDb) return;
    
    console.log('[VaultService] Processing offline queue...');
    
    try {
      // Get pending operations from queue
      const results = await this.syncDb.executeSql(
        'SELECT * FROM sync_queue WHERE status = ? AND entity_type = ? ORDER BY created_at ASC LIMIT 10',
        ['pending', 'vault']
      );
      
      if (results[0].rows.length === 0) {
        console.log('[VaultService] No pending operations in offline queue');
        return;
      }
      
      for (let i = 0; i < results[0].rows.length; i++) {
        const operation = results[0].rows.item(i);
        
        try {
          // Process operation based on type
          switch (operation.operation_type) {
            case 'create':
              await this.processPendingUpload(operation);
              break;
            case 'update':
              await this.processPendingUpdate(operation);
              break;
            case 'delete':
              await this.processPendingDelete(operation);
              break;
          }
          
          // Mark as completed
          await db.executeSql(
            'UPDATE sync_queue SET status = ?, synced_at = ? WHERE id = ?',
            ['completed', new Date().toISOString(), operation.id]
          );
          
        } catch (error) {
          console.error(`[VaultService] Failed to process operation ${operation.id}:`, error);
          
          // Update retry count
          const retryCount = (operation.retry_count || 0) + 1;
          if (retryCount >= MAX_RETRY_ATTEMPTS) {
            await db.executeSql(
              'UPDATE sync_queue SET status = ?, error_message = ? WHERE id = ?',
              ['failed', normalizeError(error).message, operation.id]
            );
          } else {
            await db.executeSql(
              'UPDATE sync_queue SET retry_count = ? WHERE id = ?',
              [retryCount, operation.id]
            );
          }
        }
      }
    } catch (error) {
      console.error('[VaultService] Error processing offline queue:', error);
    }
  }
  
  private async processPendingUpload(operation: any): Promise<void> {
    const data = JSON.parse(operation.data);
    await this.uploadFile(
      data.uri,
      data.fileName,
      data.mimeType,
      data.parentId,
      data.options
    );
  }
  
  private async processPendingUpdate(operation: any): Promise<void> {
    const data = JSON.parse(operation.data);
    if (data.type === 'rename') {
      await this.renameItem(data.itemId, data.newName);
    } else if (data.type === 'move') {
      await this.moveItem(data.itemId, data.newParentId);
    }
  }
  
  private async processPendingDelete(operation: any): Promise<void> {
    const data = JSON.parse(operation.data);
    await this.deleteItem(data.itemId);
  }

  private async cleanupCache(): Promise<void> {
    try {
      const keys = await AsyncStorage.getAllKeys();
      const vaultKeys = keys.filter(key => key.startsWith(VAULT_CACHE_PREFIX));
      
      for (const key of vaultKeys) {
        const cached = await AsyncStorage.getItem(key);
        if (cached) {
          const data = JSON.parse(cached);
          if (Date.now() - data.timestamp > VAULT_CACHE_TTL) {
            await AsyncStorage.removeItem(key);
          }
        }
      }
    } catch (error) {
      console.error('[VaultService] Cache cleanup error:', error);
    }
  }

  private async clearAllCaches(): Promise<void> {
    try {
      const keys = await AsyncStorage.getAllKeys();
      const vaultKeys = keys.filter(key => key.startsWith(VAULT_CACHE_PREFIX));
      await AsyncStorage.multiRemove(vaultKeys);
      
      // Clear download cache
      this.downloadCache.clear();
    } catch (error) {
      console.error('[VaultService] Error clearing caches:', error);
    }
  }

  // Get upload queue status
  getUploadStatus(uploadId: string): any {
    return this.uploadQueue.get(uploadId);
  }

  // Get all upload statuses
  getAllUploadStatuses(): Map<string, any> {
    return new Map(this.uploadQueue);
  }

  // Clear completed uploads from queue
  clearCompletedUploads(): void {
    for (const [id, upload] of this.uploadQueue.entries()) {
      if (upload.status === 'completed' && Date.now() - upload.completedAt > 60000) {
        this.uploadQueue.delete(id);
      }
    }
  }

  // Retry failed upload
  async retryUpload(uploadId: string): Promise<void> {
    const upload = this.uploadQueue.get(uploadId);
    if (!upload || upload.status !== 'failed') {
      throw new AppError(ErrorCode.INVALID_REQUEST, 'Upload not found or not in failed state');
    }

    // Reset status and retry
    this.uploadQueue.set(uploadId, { ...upload, status: 'pending', progress: 0 });
    
    await this.uploadFile(
      upload.uri,
      upload.fileName,
      upload.mimeType,
      upload.parentId,
      upload.options
    );
  }

  // Bulk operations
  async bulkDelete(itemIds: string[]): Promise<{ success: number; failed: number }> {
    let success = 0;
    let failed = 0;

    for (const itemId of itemIds) {
      try {
        await this.deleteItem(itemId);
        success++;
      } catch (error) {
        console.error(`[VaultService] Failed to delete item ${itemId}:`, error);
        failed++;
      }
    }

    // Clear all caches after bulk operation
    await this.clearAllCaches();

    return { success, failed };
  }

  async bulkMove(itemIds: string[], newParentId: string | null): Promise<{ success: number; failed: number }> {
    let success = 0;
    let failed = 0;

    for (const itemId of itemIds) {
      try {
        await this.moveItem(itemId, newParentId);
        success++;
      } catch (error) {
        console.error(`[VaultService] Failed to move item ${itemId}:`, error);
        failed++;
      }
    }

    // Clear all caches after bulk operation
    await this.clearAllCaches();

    return { success, failed };
  }

  async bulkShare(itemIds: string[], userIds: string[], permissions: 'read' | 'write' = 'read'): Promise<{ success: number; failed: number }> {
    let success = 0;
    let failed = 0;

    for (const itemId of itemIds) {
      try {
        await this.shareItem(itemId, userIds, permissions);
        success++;
      } catch (error) {
        console.error(`[VaultService] Failed to share item ${itemId}:`, error);
        failed++;
      }
    }

    return { success, failed };
  }

  async bulkDownload(items: VaultItem[], options: VaultDownloadOptions = {}): Promise<{ 
    success: number; 
    failed: number; 
    paths: string[] 
  }> {
    let success = 0;
    let failed = 0;
    const paths: string[] = [];

    for (const item of items) {
      if (item.type === 'file') {
        try {
          const path = await this.downloadFile(item, options);
          paths.push(path);
          success++;
        } catch (error) {
          console.error(`[VaultService] Failed to download item ${item.id}:`, error);
          failed++;
        }
      }
    }

    return { success, failed, paths };
  }

  // Cleanup method
  async cleanup(): Promise<void> {
    this.uploadQueue.clear();
    this.downloadCache.clear();
    await this.clearAllCaches();
  }
}

// Export helper function
export const getVaultService = () => VaultService.getInstance();