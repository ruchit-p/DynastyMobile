import { callFirebaseFunction, getErrorMessage } from '../lib/errorUtils';
import { logger } from './LoggingService';

export interface R2UploadOptions {
  fileName: string;
  mimeType: string;
  fileSize?: number;
  parentId?: string | null;
  contentType: 'vault' | 'stories' | 'events' | 'profiles';
  metadata?: Record<string, string>;
  onProgress?: (progress: number) => void;
}

export interface R2UploadResult {
  success: boolean;
  url?: string;
  bucket?: string;
  key?: string;
  error?: string;
}

export class R2UploadService {
  private static instance: R2UploadService;

  private constructor() {
    logger.debug('[R2UploadService] Initialized');
  }

  static getInstance(): R2UploadService {
    if (!R2UploadService.instance) {
      R2UploadService.instance = new R2UploadService();
    }
    return R2UploadService.instance;
  }

  /**
   * Upload a file to R2 using signed URL
   */
  async uploadFile(localUri: string, options: R2UploadOptions): Promise<R2UploadResult> {
    logger.debug('[R2UploadService] Starting upload', { localUri, ...options });

    try {
      // Step 1: Get signed URL from backend
      const signedUrlResponse = await this.getSignedUploadUrl(options);
      
      if (!signedUrlResponse.signedUrl) {
        throw new Error('Failed to get signed URL');
      }

      const { signedUrl, bucket, key } = signedUrlResponse;

      // Step 2: Upload file to R2
      await this.performUpload(localUri, signedUrl, options.mimeType, options.onProgress);

      // Step 3: Register the upload in backend (if needed)
      if (options.contentType === 'vault') {
        await this.registerVaultUpload({
          fileName: options.fileName,
          storagePath: key,
          bucket,
          mimeType: options.mimeType,
          fileSize: options.fileSize,
          parentId: options.parentId
        });
      }

      logger.debug('[R2UploadService] Upload completed successfully', { bucket, key });

      return {
        success: true,
        url: signedUrl,
        bucket,
        key
      };
    } catch (error) {
      logger.error('[R2UploadService] Upload failed:', error);
      return {
        success: false,
        error: getErrorMessage(error)
      };
    }
  }

  /**
   * Get signed upload URL from backend
   */
  private async getSignedUploadUrl(options: R2UploadOptions): Promise<{
    signedUrl: string;
    bucket: string;
    key: string;
  }> {
    logger.debug('[R2UploadService] Getting signed URL for', options.contentType);

    const functionName = this.getUploadFunctionName(options.contentType);
    
    const response = await callFirebaseFunction(functionName, {
      fileName: options.fileName,
      mimeType: options.mimeType,
      fileSize: options.fileSize,
      parentId: options.parentId,
      metadata: options.metadata
    });

    return {
      signedUrl: response.signedUrl,
      bucket: response.bucket,
      key: response.storagePath || response.key
    };
  }

  /**
   * Perform the actual upload to R2
   */
  private async performUpload(
    localUri: string,
    signedUrl: string,
    mimeType: string,
    onProgress?: (progress: number) => void
  ): Promise<void> {
    // Convert local URI to blob
    const response = await fetch(localUri);
    const blob = await response.blob();

    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();

      // Set up progress tracking
      xhr.upload.addEventListener('progress', (event) => {
        if (event.lengthComputable && onProgress) {
          const progress = (event.loaded / event.total) * 100;
          onProgress(Math.round(progress));
        }
      });

      // Handle completion
      xhr.addEventListener('load', () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          logger.debug('[R2UploadService] Upload successful', xhr.status);
          resolve();
        } else {
          logger.error('[R2UploadService] Upload failed', xhr.status, xhr.statusText);
          reject(new Error(`Upload failed with status ${xhr.status}: ${xhr.statusText}`));
        }
      });

      // Handle errors
      xhr.addEventListener('error', () => {
        logger.error('[R2UploadService] Upload error');
        reject(new Error('Network error during upload'));
      });

      xhr.addEventListener('abort', () => {
        logger.debug('[R2UploadService] Upload aborted');
        reject(new Error('Upload aborted'));
      });

      // Open and send request
      xhr.open('PUT', signedUrl);
      xhr.setRequestHeader('Content-Type', mimeType);
      
      // Add CORS headers if needed
      xhr.setRequestHeader('x-amz-acl', 'private');
      
      logger.debug('[R2UploadService] Sending upload request');
      xhr.send(blob);
    });
  }

  /**
   * Register vault upload in backend
   */
  private async registerVaultUpload(data: {
    fileName: string;
    storagePath: string;
    bucket: string;
    mimeType: string;
    fileSize?: number;
    parentId?: string | null;
  }): Promise<void> {
    await callFirebaseFunction('addVaultFile', {
      name: data.fileName,
      storagePath: data.storagePath,
      mimeType: data.mimeType,
      size: data.fileSize,
      parentId: data.parentId,
      storageProvider: 'r2',
      r2Bucket: data.bucket
    });
  }

  /**
   * Get the appropriate function name for the content type
   */
  private getUploadFunctionName(contentType: 'vault' | 'stories' | 'events' | 'profiles'): string {
    const functionMap = {
      vault: 'getVaultUploadSignedUrlR2',
      stories: 'getStoryUploadSignedUrlR2',
      events: 'getEventCoverPhotoUploadUrlR2',
      profiles: 'getProfilePictureUploadUrlR2'
    };

    return functionMap[contentType] || 'getVaultUploadSignedUrlR2';
  }

  /**
   * Download a file from R2
   */
  async getDownloadUrl(options: {
    itemId?: string;
    storagePath?: string;
    bucket?: string;
    contentType: 'vault' | 'stories' | 'events' | 'profiles';
  }): Promise<string> {
    logger.debug('[R2UploadService] Getting download URL', options);

    const functionName = this.getDownloadFunctionName(options.contentType);
    
    const response = await callFirebaseFunction(functionName, {
      itemId: options.itemId,
      storagePath: options.storagePath,
      bucket: options.bucket
    });

    return response.downloadUrl;
  }

  /**
   * Get the appropriate download function name for the content type
   */
  private getDownloadFunctionName(contentType: 'vault' | 'stories' | 'events' | 'profiles'): string {
    const functionMap = {
      vault: 'getVaultDownloadUrlR2',
      stories: 'getStoryDownloadUrlR2',
      events: 'getEventDownloadUrlR2',
      profiles: 'getProfileDownloadUrlR2'
    };

    return functionMap[contentType] || 'getVaultDownloadUrlR2';
  }

  /**
   * Cancel an ongoing upload (if using XMLHttpRequest)
   */
  cancelUpload(): void {
    // Implementation would store xhr reference and call xhr.abort()
    logger.debug('[R2UploadService] Upload cancelled');
  }
}

// Export singleton getter
export const getR2UploadService = () => R2UploadService.getInstance();