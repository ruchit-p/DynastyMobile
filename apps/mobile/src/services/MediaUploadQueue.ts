import { FirebaseStorageTypes } from '@react-native-firebase/storage';
import { getErrorMessage } from '../lib/errorUtils';
import { getFirebaseStorage } from '../lib/firebase';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { logger } from './LoggingService';

// Types
export interface UploadItem {
  id: string;
  localUri: string;
  remoteUrl?: string;
  destinationPath: string;
  mimeType: string;
  size: number;
  metadata?: Record<string, string>;
  status: 'pending' | 'uploading' | 'paused' | 'completed' | 'failed';
  progress: number;
  error?: string;
  retryCount: number;
  maxRetries: number;
  priority: 'low' | 'normal' | 'high';
  createdAt: Date;
  updatedAt: Date;
  uploadStartedAt?: Date;
  uploadCompletedAt?: Date;
}

export interface QueueStats {
  totalItems: number;
  pendingItems: number;
  uploadingItems: number;
  completedItems: number;
  failedItems: number;
  totalBytes: number;
  uploadedBytes: number;
}

export interface UploadConfig {
  maxConcurrentUploads: number;
  maxRetries: number;
  retryDelay: number;
  chunkSize: number;
  enableBackgroundUpload: boolean;
}

// Interface
export interface IMediaUploadQueue {
  enqueueUpload(item: Omit<UploadItem, 'id' | 'status' | 'progress' | 'retryCount' | 'createdAt' | 'updatedAt'>): Promise<string>;
  processQueue(): Promise<void>;
  retryFailed(): Promise<void>;
  getQueueStatus(): Promise<QueueStats>;
  pauseUpload(uploadId: string): Promise<void>;
  resumeUpload(uploadId: string): Promise<void>;
  cancelUpload(uploadId: string): Promise<void>;
  clearCompleted(): Promise<void>;
  getUploadProgress(uploadId: string): Promise<number>;
  setUploadPriority(uploadId: string, priority: UploadItem['priority']): Promise<void>;
}

// Implementation
export class MediaUploadQueue implements IMediaUploadQueue {
  private static instance: MediaUploadQueue;
  private queue: Map<string, UploadItem> = new Map();
  private activeUploads: Map<string, FirebaseStorageTypes.Task> = new Map();
  private isProcessing = false;
  private config: UploadConfig = {
    maxConcurrentUploads: 3,
    maxRetries: 3,
    retryDelay: 1000,
    chunkSize: 1024 * 1024, // 1MB chunks
    enableBackgroundUpload: true
  };

  private readonly STORAGE_KEY = '@dynasty_media_upload_queue';

  private constructor() {
    logger.debug('[MediaUploadQueue] Initialized');
    this.loadQueueFromStorage();
  }

  static getInstance(): MediaUploadQueue {
    if (!MediaUploadQueue.instance) {
      MediaUploadQueue.instance = new MediaUploadQueue();
    }
    return MediaUploadQueue.instance;
  }

  async enqueueUpload(
    item: Omit<UploadItem, 'id' | 'status' | 'progress' | 'retryCount' | 'createdAt' | 'updatedAt'>
  ): Promise<string> {
    const uploadId = `upload_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    logger.debug(`[MediaUploadQueue] Enqueuing upload: ${uploadId}`);
    
    try {
      const uploadItem: UploadItem = {
        ...item,
        id: uploadId,
        status: 'pending',
        progress: 0,
        retryCount: 0,
        maxRetries: item.maxRetries || this.config.maxRetries,
        priority: item.priority || 'normal',
        createdAt: new Date(),
        updatedAt: new Date()
      };
      
      this.queue.set(uploadId, uploadItem);
      await this.saveQueueToStorage();
      
      // Auto-start processing if not already running
      if (!this.isProcessing) {
        this.processQueue();
      }
      
      return uploadId;
    } catch (error) {
      logger.error('[MediaUploadQueue] Error enqueuing upload:', getErrorMessage(error));
      throw error;
    }
  }

  async processQueue(): Promise<void> {
    if (this.isProcessing) {
      logger.debug('[MediaUploadQueue] Queue processing already in progress');
      return;
    }
    
    this.isProcessing = true;
    logger.debug('[MediaUploadQueue] Starting queue processing');
    
    try {
      while (true) {
        // Get pending uploads sorted by priority and creation time
        const pendingUploads = this.getPendingUploads();
        
        if (pendingUploads.length === 0) {
          logger.debug('[MediaUploadQueue] No pending uploads');
          break;
        }
        
        // Check current active uploads
        const activeCount = this.activeUploads.size;
        if (activeCount >= this.config.maxConcurrentUploads) {
          logger.debug(`[MediaUploadQueue] Max concurrent uploads reached (${activeCount}/${this.config.maxConcurrentUploads})`);
          await new Promise(resolve => setTimeout(resolve, 1000));
          continue;
        }
        
        // Start next upload
        const nextUpload = pendingUploads[0];
        await this.startUpload(nextUpload);
      }
    } finally {
      this.isProcessing = false;
      logger.debug('[MediaUploadQueue] Queue processing completed');
    }
  }

  async retryFailed(): Promise<void> {
    logger.debug('[MediaUploadQueue] Retrying failed uploads');
    
    try {
      const failedUploads = Array.from(this.queue.values())
        .filter(item => item.status === 'failed' && item.retryCount < item.maxRetries);
      
      logger.debug(`[MediaUploadQueue] Found ${failedUploads.length} failed uploads to retry`);
      
      for (const upload of failedUploads) {
        upload.status = 'pending';
        upload.retryCount++;
        upload.updatedAt = new Date();
        delete upload.error;
        
        logger.debug(`[MediaUploadQueue] Retrying upload ${upload.id} (attempt ${upload.retryCount}/${upload.maxRetries})`);
      }
      
      await this.saveQueueToStorage();
      
      if (failedUploads.length > 0 && !this.isProcessing) {
        this.processQueue();
      }
    } catch (error) {
      logger.error('[MediaUploadQueue] Error retrying failed uploads:', getErrorMessage(error));
      throw error;
    }
  }

  async getQueueStatus(): Promise<QueueStats> {
    const items = Array.from(this.queue.values());
    
    const stats: QueueStats = {
      totalItems: items.length,
      pendingItems: items.filter(i => i.status === 'pending').length,
      uploadingItems: items.filter(i => i.status === 'uploading').length,
      completedItems: items.filter(i => i.status === 'completed').length,
      failedItems: items.filter(i => i.status === 'failed').length,
      totalBytes: items.reduce((sum, item) => sum + item.size, 0),
      uploadedBytes: items.reduce((sum, item) => {
        if (item.status === 'completed') return sum + item.size;
        if (item.status === 'uploading') return sum + (item.size * item.progress / 100);
        return sum;
      }, 0)
    };
    
    return stats;
  }

  async pauseUpload(uploadId: string): Promise<void> {
    logger.debug(`[MediaUploadQueue] Pausing upload: ${uploadId}`);
    
    try {
      const uploadTask = this.activeUploads.get(uploadId);
      if (uploadTask) {
        await uploadTask.pause();
        
        const upload = this.queue.get(uploadId);
        if (upload) {
          upload.status = 'paused';
          upload.updatedAt = new Date();
          await this.saveQueueToStorage();
        }
      }
    } catch (error) {
      logger.error('[MediaUploadQueue] Error pausing upload:', getErrorMessage(error));
      throw error;
    }
  }

  async resumeUpload(uploadId: string): Promise<void> {
    logger.debug(`[MediaUploadQueue] Resuming upload: ${uploadId}`);
    
    try {
      const uploadTask = this.activeUploads.get(uploadId);
      if (uploadTask) {
        await uploadTask.resume();
        
        const upload = this.queue.get(uploadId);
        if (upload) {
          upload.status = 'uploading';
          upload.updatedAt = new Date();
          await this.saveQueueToStorage();
        }
      } else {
        // Re-queue if no active task
        const upload = this.queue.get(uploadId);
        if (upload && upload.status === 'paused') {
          upload.status = 'pending';
          upload.updatedAt = new Date();
          await this.saveQueueToStorage();
          
          if (!this.isProcessing) {
            this.processQueue();
          }
        }
      }
    } catch (error) {
      logger.error('[MediaUploadQueue] Error resuming upload:', getErrorMessage(error));
      throw error;
    }
  }

  async cancelUpload(uploadId: string): Promise<void> {
    logger.debug(`[MediaUploadQueue] Canceling upload: ${uploadId}`);
    
    try {
      const uploadTask = this.activeUploads.get(uploadId);
      if (uploadTask) {
        await uploadTask.cancel();
        this.activeUploads.delete(uploadId);
      }
      
      this.queue.delete(uploadId);
      await this.saveQueueToStorage();
    } catch (error) {
      logger.error('[MediaUploadQueue] Error canceling upload:', getErrorMessage(error));
      throw error;
    }
  }

  async clearCompleted(): Promise<void> {
    logger.debug('[MediaUploadQueue] Clearing completed uploads');
    
    try {
      const completedIds = Array.from(this.queue.entries())
        .filter(([_, item]) => item.status === 'completed')
        .map(([id, _]) => id);
      
      completedIds.forEach(id => this.queue.delete(id));
      
      logger.debug(`[MediaUploadQueue] Cleared ${completedIds.length} completed uploads`);
      await this.saveQueueToStorage();
    } catch (error) {
      logger.error('[MediaUploadQueue] Error clearing completed uploads:', getErrorMessage(error));
      throw error;
    }
  }

  async getUploadProgress(uploadId: string): Promise<number> {
    const upload = this.queue.get(uploadId);
    return upload?.progress || 0;
  }

  async setUploadPriority(uploadId: string, priority: UploadItem['priority']): Promise<void> {
    logger.debug(`[MediaUploadQueue] Setting upload ${uploadId} priority to ${priority}`);
    
    try {
      const upload = this.queue.get(uploadId);
      if (upload && upload.status === 'pending') {
        upload.priority = priority;
        upload.updatedAt = new Date();
        await this.saveQueueToStorage();
      }
    } catch (error) {
      logger.error('[MediaUploadQueue] Error setting upload priority:', getErrorMessage(error));
      throw error;
    }
  }

  private async startUpload(upload: UploadItem): Promise<void> {
    logger.debug(`[MediaUploadQueue] Starting upload: ${upload.id}`);
    
    try {
      upload.status = 'uploading';
      upload.uploadStartedAt = new Date();
      upload.updatedAt = new Date();
      
      const storage = getFirebaseStorage();
      const reference = storage.ref(upload.destinationPath);
      
      // TODO: Implement actual file upload
      // For now, simulate upload with metadata
      const uploadTask = reference.putFile(upload.localUri, {
        contentType: upload.mimeType,
        customMetadata: upload.metadata
      });
      
      this.activeUploads.set(upload.id, uploadTask);
      
      // Monitor upload progress
      uploadTask.on('state_changed',
        (snapshot) => {
          const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
          upload.progress = Math.round(progress);
          upload.updatedAt = new Date();
          
          logger.debug(`[MediaUploadQueue] Upload ${upload.id} progress: ${progress}%`);
          
          // TODO: Emit progress event
        },
        (error) => {
          logger.error(`[MediaUploadQueue] Upload ${upload.id} failed:`, error);
          upload.status = 'failed';
          upload.error = getErrorMessage(error);
          upload.updatedAt = new Date();
          
          this.activeUploads.delete(upload.id);
          this.saveQueueToStorage();
          
          // Continue processing queue
          if (!this.isProcessing) {
            this.processQueue();
          }
        },
        async () => {
          // Upload completed
          const downloadUrl = await uploadTask.snapshot?.ref.getDownloadURL();
          
          upload.status = 'completed';
          upload.progress = 100;
          upload.remoteUrl = downloadUrl;
          upload.uploadCompletedAt = new Date();
          upload.updatedAt = new Date();
          
          logger.debug(`[MediaUploadQueue] Upload ${upload.id} completed: ${downloadUrl}`);
          
          this.activeUploads.delete(upload.id);
          await this.saveQueueToStorage();
          
          // TODO: Emit completion event
          
          // Continue processing queue
          if (!this.isProcessing) {
            this.processQueue();
          }
        }
      );
    } catch (error) {
      logger.error('[MediaUploadQueue] Error starting upload:', getErrorMessage(error));
      upload.status = 'failed';
      upload.error = getErrorMessage(error);
      upload.updatedAt = new Date();
      
      this.activeUploads.delete(upload.id);
      await this.saveQueueToStorage();
    }
  }

  private getPendingUploads(): UploadItem[] {
    return Array.from(this.queue.values())
      .filter(item => item.status === 'pending')
      .sort((a, b) => {
        // Sort by priority first
        const priorityOrder = { high: 0, normal: 1, low: 2 };
        const priorityDiff = priorityOrder[a.priority] - priorityOrder[b.priority];
        if (priorityDiff !== 0) return priorityDiff;
        
        // Then by creation time
        return a.createdAt.getTime() - b.createdAt.getTime();
      });
  }

  private async loadQueueFromStorage(): Promise<void> {
    try {
      const stored = await AsyncStorage.getItem(this.STORAGE_KEY);
      if (stored) {
        const items: UploadItem[] = JSON.parse(stored);
        items.forEach(item => {
          // Convert date strings back to Date objects
          item.createdAt = new Date(item.createdAt);
          item.updatedAt = new Date(item.updatedAt);
          if (item.uploadStartedAt) item.uploadStartedAt = new Date(item.uploadStartedAt);
          if (item.uploadCompletedAt) item.uploadCompletedAt = new Date(item.uploadCompletedAt);
          
          // Reset uploading items to pending
          if (item.status === 'uploading') {
            item.status = 'pending';
          }
          
          this.queue.set(item.id, item);
        });
        
        logger.debug(`[MediaUploadQueue] Loaded ${items.length} items from storage`);
      }
    } catch (error) {
      logger.error('[MediaUploadQueue] Error loading queue from storage:', getErrorMessage(error));
    }
  }

  private async saveQueueToStorage(): Promise<void> {
    try {
      const items = Array.from(this.queue.values());
      await AsyncStorage.setItem(this.STORAGE_KEY, JSON.stringify(items));
    } catch (error) {
      logger.error('[MediaUploadQueue] Error saving queue to storage:', getErrorMessage(error));
    }
  }
}

// Export singleton instance getter
export const getMediaUploadQueue = () => MediaUploadQueue.getInstance();