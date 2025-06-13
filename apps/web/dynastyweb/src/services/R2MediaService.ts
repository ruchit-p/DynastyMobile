// R2 Media Service for Dynasty Web App
// Handles all media uploads to Cloudflare R2 with Firebase Storage fallback

import { FirebaseFunctionsClient, createFirebaseClient } from '@/lib/functions-client';
import { errorHandler, ErrorSeverity } from './ErrorHandlingService';
import { ref, uploadBytesResumable, getDownloadURL } from 'firebase/storage';
import { storage, functions } from '@/lib/firebase';

export interface UploadProgressCallback {
  onProgress?: (progress: number) => void;
  onError?: (error: Error) => void;
}

export interface MediaUploadOptions {
  compress?: boolean;
  maxWidth?: number;
  maxHeight?: number;
  quality?: number;
}

class R2MediaService {
  private static instance: R2MediaService;
  private functionsClient: FirebaseFunctionsClient;
  private uploadTasks = new Map<string, XMLHttpRequest | ReturnType<typeof uploadBytesResumable>>();

  private constructor() {
    this.functionsClient = createFirebaseClient(functions);
  }

  static getInstance(): R2MediaService {
    if (!R2MediaService.instance) {
      R2MediaService.instance = new R2MediaService();
    }
    return R2MediaService.instance;
  }

  /**
   * Compresses an image with specified options
   */
  async compressImage(file: File, options?: MediaUploadOptions): Promise<Blob> {
    const maxWidth = options?.maxWidth || 800;
    const maxHeight = options?.maxHeight || 800;
    const quality = options?.quality || 0.8;

    return new Promise((resolve, reject) => {
      const img = new Image();
      img.src = URL.createObjectURL(file);
      
      img.onload = () => {
        // Calculate new dimensions
        let width = img.width;
        let height = img.height;
        
        if (width > maxWidth || height > maxHeight) {
          const ratio = Math.min(maxWidth / width, maxHeight / height);
          width = width * ratio;
          height = height * ratio;
        }
        
        // Create canvas and resize
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        
        if (!ctx) {
          reject(new Error('Failed to get canvas context'));
          return;
        }
        
        ctx.drawImage(img, 0, 0, width, height);
        
        // Convert to blob
        canvas.toBlob(
          (blob) => {
            if (blob) {
              resolve(blob);
            } else {
              reject(new Error('Failed to compress image'));
            }
          },
          'image/jpeg',
          quality
        );
        
        // Clean up
        URL.revokeObjectURL(img.src);
      };
      
      img.onerror = () => {
        URL.revokeObjectURL(img.src);
        reject(new Error('Failed to load image'));
      };
    });
  }

  /**
   * Upload media to R2 or Firebase Storage based on backend configuration
   */
  private async uploadToStorage(
    data: Blob | File,
    path: string,
    contentType: string,
    metadata: Record<string, string>,
    callbacks?: UploadProgressCallback
  ): Promise<string> {
    const uploadId = `upload-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    try {
      // Get signed upload URL from backend
      const { data: uploadData } = await this.functionsClient.callFunction('getMediaUploadUrl', {
        path,
        contentType,
        fileSize: data.size,
        metadata
      });

      const { 
        signedUrl, 
        storagePath, 
        storageProvider
      } = uploadData as { 
        signedUrl: string; 
        storagePath: string;
        storageProvider: 'firebase' | 'r2' | 'b2';
        itemId?: string;
      };

      // Upload based on storage provider
      if (storageProvider === 'b2') {
        // Upload to B2
        return await this.uploadToB2(
          signedUrl,
          data,
          uploadId,
          callbacks
        );
      } else if (storageProvider === 'r2') {
        // Upload to R2
        return await this.uploadToR2(
          signedUrl,
          data,
          uploadId,
          callbacks
        );
      } else {
        // Fallback to Firebase Storage
        return await this.uploadToFirebase(
          storagePath,
          data,
          contentType,
          metadata,
          uploadId,
          callbacks
        );
      }
    } catch (error) {
      errorHandler.handleError(error, ErrorSeverity.HIGH, {
        action: 'media-upload-init',
        path
      });
      throw error;
    }
  }

  /**
   * Upload to B2 using signed URL
   */
  private async uploadToB2(
    signedUrl: string,
    data: Blob | File,
    uploadId: string,
    callbacks?: UploadProgressCallback
  ): Promise<string> {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      this.uploadTasks.set(uploadId, xhr);
      
      // Track upload progress
      xhr.upload.addEventListener('progress', (event) => {
        if (event.lengthComputable && callbacks?.onProgress) {
          const progress = (event.loaded / event.total) * 100;
          callbacks.onProgress(progress);
        }
      });

      // Handle completion
      xhr.addEventListener('load', async () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          this.uploadTasks.delete(uploadId);
          
          // For B2, return the base URL without query parameters
          // B2 provides public URLs for uploaded files
          const publicUrl = signedUrl.split('?')[0];
          resolve(publicUrl);
        } else {
          this.uploadTasks.delete(uploadId);
          const error = new Error(`B2 upload failed with status: ${xhr.status}`);
          callbacks?.onError?.(error);
          reject(error);
        }
      });

      // Handle errors
      xhr.addEventListener('error', () => {
        this.uploadTasks.delete(uploadId);
        const error = new Error('Network error during B2 upload');
        callbacks?.onError?.(error);
        reject(error);
      });

      // Handle abort
      xhr.addEventListener('abort', () => {
        this.uploadTasks.delete(uploadId);
        const error = new Error('B2 upload was cancelled');
        callbacks?.onError?.(error);
        reject(error);
      });

      // Set up the request
      xhr.open('PUT', signedUrl);
      const fileType = data instanceof File ? data.type : 'application/octet-stream';
      xhr.setRequestHeader('Content-Type', fileType);
      
      // B2-specific headers
      if (data.size > 0) {
        xhr.setRequestHeader('Content-Length', data.size.toString());
      }
      
      // Send the file
      xhr.send(data);
    });
  }

  /**
   * Upload to R2 using signed URL
   */
  private async uploadToR2(
    signedUrl: string,
    data: Blob | File,
    uploadId: string,
    callbacks?: UploadProgressCallback
  ): Promise<string> {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      this.uploadTasks.set(uploadId, xhr);
      
      // Track upload progress
      xhr.upload.addEventListener('progress', (event) => {
        if (event.lengthComputable && callbacks?.onProgress) {
          const progress = (event.loaded / event.total) * 100;
          callbacks.onProgress(progress);
        }
      });

      // Handle completion
      xhr.addEventListener('load', async () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          this.uploadTasks.delete(uploadId);
          
          // Extract the key from the signed URL
          // R2 signed URLs contain the full path in the URL
          // const url = new URL(signedUrl);
          // const pathParts = url.pathname.split('/');
          // const key = pathParts.slice(2).join('/'); // Remove bucket name
          
          // Generate public URL (assuming public bucket or signed URL will be generated on access)
          const publicUrl = signedUrl.split('?')[0]; // Remove query params
          resolve(publicUrl);
        } else {
          reject(new Error(`Upload failed with status: ${xhr.status}`));
        }
      });

      // Handle errors
      xhr.addEventListener('error', () => {
        this.uploadTasks.delete(uploadId);
        const error = new Error('Network error during upload');
        callbacks?.onError?.(error);
        reject(error);
      });

      // Set up the request
      xhr.open('PUT', signedUrl);
      const fileType = data instanceof File ? data.type : 'application/octet-stream';
      xhr.setRequestHeader('Content-Type', fileType);
      
      // Send the file
      xhr.send(data);
    });
  }

  /**
   * Upload to Firebase Storage (fallback)
   */
  private async uploadToFirebase(
    storagePath: string,
    data: Blob | File,
    contentType: string,
    metadata: Record<string, string>,
    uploadId: string,
    callbacks?: UploadProgressCallback
  ): Promise<string> {
    const storageRef = ref(storage, storagePath);
    const uploadTask = uploadBytesResumable(storageRef, data, {
      contentType,
      customMetadata: metadata
    });

    this.uploadTasks.set(uploadId, uploadTask);

    return new Promise((resolve, reject) => {
      uploadTask.on(
        'state_changed',
        (snapshot) => {
          const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
          callbacks?.onProgress?.(progress);
        },
        (error) => {
          this.uploadTasks.delete(uploadId);
          callbacks?.onError?.(error);
          reject(error);
        },
        async () => {
          try {
            const downloadUrl = await getDownloadURL(uploadTask.snapshot.ref);
            this.uploadTasks.delete(uploadId);
            resolve(downloadUrl);
          } catch (error) {
            reject(error);
          }
        }
      );
    });
  }

  /**
   * Upload profile picture
   */
  async uploadProfilePicture(
    imageBlob: Blob,
    userId: string,
    callbacks?: UploadProgressCallback
  ): Promise<string> {
    try {
      // Compress if needed
      const compressedBlob = await this.compressImage(imageBlob as File, {
        maxWidth: 400,
        maxHeight: 400,
        quality: 0.8
      }).catch(() => imageBlob); // Use original if compression fails

      const timestamp = Date.now();
      const randomString = Math.random().toString(36).substring(2);
      const filename = `profile_${timestamp}_${randomString}.jpg`;
      const path = `profilePictures/${userId}/${filename}`;

      return await this.uploadToStorage(
        compressedBlob,
        path,
        'image/jpeg',
        {
          uploadedBy: userId,
          uploadedAt: new Date().toISOString(),
          mediaType: 'profile'
        },
        callbacks
      );
    } catch (error) {
      const finalError = error as Error;
      callbacks?.onError?.(finalError);
      throw finalError;
    }
  }

  /**
   * Upload story media
   */
  async uploadStoryMedia(
    file: File,
    storyId: string,
    type: 'image' | 'video' | 'audio',
    callbacks?: UploadProgressCallback
  ): Promise<string> {
    try {
      let processedBlob: Blob = file;
      let contentType = file.type;
      
      // Compress images
      if (type === 'image') {
        processedBlob = await this.compressImage(file, {
          maxWidth: 1200,
          maxHeight: 1200,
          quality: 0.85
        }).catch(() => file);
        contentType = 'image/jpeg';
      }

      // Check file size limits
      const maxSizes = {
        image: 10 * 1024 * 1024, // 10MB
        video: 500 * 1024 * 1024, // 500MB
        audio: 100 * 1024 * 1024 // 100MB
      };

      if (processedBlob.size > maxSizes[type]) {
        throw new Error(`${type} file size must be less than ${maxSizes[type] / (1024 * 1024)}MB`);
      }

      const filename = `${type}_${Date.now()}_${Math.random().toString(36).substring(2)}.${file.name.split('.').pop()}`;
      const path = `stories/${storyId}/media/${filename}`;

      return await this.uploadToStorage(
        processedBlob,
        path,
        contentType,
        {
          uploadedBy: 'unknown', // Will be set by backend
          storyId,
          mediaType: type
        },
        callbacks
      );
    } catch (error) {
      const finalError = error as Error;
      callbacks?.onError?.(finalError);
      throw finalError;
    }
  }

  /**
   * Upload event cover photo
   */
  async uploadEventCoverPhoto(
    file: File,
    eventId: string,
    callbacks?: UploadProgressCallback
  ): Promise<string> {
    try {
      // Compress the image
      const compressedBlob = await this.compressImage(file, {
        maxWidth: 1200,
        maxHeight: 800,
        quality: 0.85
      }).catch(() => file);

      const sanitizedFileName = `${Date.now()}_${file.name.replace(/[^a-zA-Z0-9._-]/g, "")}`;
      const path = `events/${eventId}/covers/${sanitizedFileName}`;

      return await this.uploadToStorage(
        compressedBlob,
        path,
        'image/jpeg',
        {
          uploadedBy: 'unknown', // Will be set by backend
          eventId,
          mediaType: 'cover'
        },
        callbacks
      );
    } catch (error) {
      const finalError = error as Error;
      callbacks?.onError?.(finalError);
      throw finalError;
    }
  }

  /**
   * Cancel an upload
   */
  cancelUpload(uploadId: string) {
    const task = this.uploadTasks.get(uploadId);
    if (task) {
      if (task instanceof XMLHttpRequest) {
        task.abort();
      } else {
        task.cancel();
      }
      this.uploadTasks.delete(uploadId);
    }
  }
}

// Export singleton instance
export const r2MediaService = R2MediaService.getInstance();