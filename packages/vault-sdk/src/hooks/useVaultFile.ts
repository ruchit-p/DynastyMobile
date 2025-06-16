import { useState, useCallback, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import axios, { type AxiosProgressEvent, type CancelTokenSource } from 'axios';

import { VaultApiClient } from '../api/VaultApiClient';
import {
  type GetVaultUploadSignedUrlRequest,
  type GetVaultDownloadUrlRequest,
  type VaultItem,
  VaultError,
  VaultErrorCode,
} from '../types/Vault';
import { createVaultError, isVaultError } from '../utils/errors';
import { vaultQueryKeys } from './useVault';

/**
 * Upload progress information
 */
export interface UploadProgress {
  loaded: number;
  total: number;
  percentage: number;
  speed?: number; // bytes per second
  timeRemaining?: number; // seconds
}

/**
 * Download progress information
 */
export interface DownloadProgress {
  loaded: number;
  total: number;
  percentage: number;
  speed?: number; // bytes per second
  timeRemaining?: number; // seconds
}

/**
 * File upload options
 */
export interface FileUploadOptions {
  onProgress?: (progress: UploadProgress) => void;
  chunkSize?: number;
  maxRetries?: number;
  timeout?: number;
}

/**
 * File download options  
 */
export interface FileDownloadOptions {
  onProgress?: (progress: DownloadProgress) => void;
  timeout?: number;
  responseType?: 'blob' | 'arraybuffer';
}

/**
 * Upload state
 */
export interface UploadState {
  isUploading: boolean;
  progress: UploadProgress | null;
  error: VaultError | null;
  result: VaultItem | null;
  cancel: () => void;
}

/**
 * Download state
 */
export interface DownloadState {
  isDownloading: boolean;
  progress: DownloadProgress | null;
  error: VaultError | null;
  result: Blob | ArrayBuffer | null;
  cancel: () => void;
}

/**
 * Progress calculation helper
 */
function calculateProgress(event: AxiosProgressEvent, startTime: number) {
  const loaded = event.loaded || 0;
  const total = event.total || 0;
  const percentage = total > 0 ? Math.round((loaded / total) * 100) : 0;
  
  const elapsed = (Date.now() - startTime) / 1000; // seconds
  const speed = elapsed > 0 ? loaded / elapsed : 0;
  const remaining = speed > 0 && total > loaded ? (total - loaded) / speed : undefined;

  const progress: UploadProgress = {
    loaded,
    total,
    percentage,
    speed,
  };

  if (remaining !== undefined) {
    progress.timeRemaining = remaining;
  }

  return progress;
}

/**
 * Hook for file upload operations with progress tracking
 */
export function useVaultFileUpload(apiClient: VaultApiClient) {
  const queryClient = useQueryClient();
  const [uploadState, setUploadState] = useState<UploadState>({
    isUploading: false,
    progress: null,
    error: null,
    result: null,
    cancel: () => {},
  });
  
  const cancelTokenRef = useRef<CancelTokenSource | null>(null);
  const startTimeRef = useRef<number>(0);

  const cancelUpload = useCallback(() => {
    if (cancelTokenRef.current) {
      cancelTokenRef.current.cancel('Upload cancelled by user');
      cancelTokenRef.current = null;
    }
  }, []);

  const uploadFile = useCallback(
    async (
      file: File | Blob,
      fileName: string,
      mimeType: string,
      parentId?: string,
      options: FileUploadOptions = {}
    ): Promise<VaultItem> => {
      try {
        // Reset state
        setUploadState({
          isUploading: true,
          progress: { loaded: 0, total: file.size, percentage: 0 },
          error: null,
          result: null,
          cancel: cancelUpload,
        });

        startTimeRef.current = Date.now();
        
        // Create cancel token
        cancelTokenRef.current = axios.CancelToken.source();

        // Step 1: Get signed upload URL
        const uploadRequest: GetVaultUploadSignedUrlRequest = {
          fileName,
          mimeType,
          fileSize: file.size,
          parentId,
          isEncrypted: false, // TODO: Add encryption support
        };

        const uploadInfo = await apiClient.getUploadSignedUrl(uploadRequest);

        // Step 2: Upload file to signed URL
        const formData = new FormData();
        
        // Add file to form data
        if (file instanceof File) {
          formData.append('file', file);
        } else {
          formData.append('file', file, fileName);
        }

        const uploadResponse = await axios.post(uploadInfo.uploadUrl, formData, {
          cancelToken: cancelTokenRef.current.token,
          timeout: options.timeout || 300000, // 5 minutes default
          onUploadProgress: (event) => {
            const progress = calculateProgress(event, startTimeRef.current);
            setUploadState(prev => ({ ...prev, progress }));
            options.onProgress?.(progress);
          },
          headers: {
            'Content-Type': 'multipart/form-data',
          },
        });

        if (uploadResponse.status !== 200 && uploadResponse.status !== 201) {
          throw createVaultError(
            VaultErrorCode.UNKNOWN_ERROR,
            `Upload failed with status ${uploadResponse.status}`,
            uploadResponse.status
          );
        }

        // Step 3: Register the file in the vault
        const addFileRequest = {
          itemId: uploadInfo.itemId,
          name: fileName,
          storagePath: uploadInfo.storagePath,
          fileType: mimeType.startsWith('image/') ? 'image' as const :
                   mimeType.startsWith('video/') ? 'video' as const :
                   mimeType.startsWith('audio/') ? 'audio' as const :
                   mimeType.includes('pdf') || mimeType.includes('document') ? 'document' as const :
                   'other' as const,
          size: file.size,
          mimeType,
          isEncrypted: false,
        };

        const vaultItem = await apiClient.addFile(addFileRequest);

        // Update state with success
        setUploadState({
          isUploading: false,
          progress: { loaded: file.size, total: file.size, percentage: 100 },
          error: null,
          result: vaultItem,
          cancel: () => {},
        });

        // Invalidate queries
        queryClient.invalidateQueries({ queryKey: vaultQueryKeys.items(parentId) });
        queryClient.invalidateQueries({ queryKey: vaultQueryKeys.storageInfo() });

        return vaultItem;

      } catch (error) {
        const vaultError = isVaultError(error)
          ? error
          : createVaultError(
              VaultErrorCode.UNKNOWN_ERROR,
              error instanceof Error ? error.message : 'Upload failed'
            );

        setUploadState({
          isUploading: false,
          progress: null,
          error: vaultError,
          result: null,
          cancel: () => {},
        });

        throw vaultError;
      } finally {
        cancelTokenRef.current = null;
      }
    },
    [apiClient, queryClient, cancelUpload]
  );

  return {
    uploadFile,
    uploadState,
    cancelUpload,
  };
}

/**
 * Hook for file download operations with progress tracking
 */
export function useVaultFileDownload(apiClient: VaultApiClient) {
  const [downloadState, setDownloadState] = useState<DownloadState>({
    isDownloading: false,
    progress: null,
    error: null,
    result: null,
    cancel: () => {},
  });
  
  const cancelTokenRef = useRef<CancelTokenSource | null>(null);
  const startTimeRef = useRef<number>(0);

  const cancelDownload = useCallback(() => {
    if (cancelTokenRef.current) {
      cancelTokenRef.current.cancel('Download cancelled by user');
      cancelTokenRef.current = null;
    }
  }, []);

  const downloadFile = useCallback(
    async (
      itemId: string,
      options: FileDownloadOptions = {}
    ): Promise<Blob | ArrayBuffer> => {
      try {
        // Reset state
        setDownloadState({
          isDownloading: true,
          progress: { loaded: 0, total: 0, percentage: 0 },
          error: null,
          result: null,
          cancel: cancelDownload,
        });

        startTimeRef.current = Date.now();
        
        // Create cancel token
        cancelTokenRef.current = axios.CancelToken.source();

        // Step 1: Get download URL
        const downloadRequest: GetVaultDownloadUrlRequest = { itemId };
        const downloadInfo = await apiClient.getDownloadUrl(downloadRequest);

        // Step 2: Download file
        const response = await axios.get(downloadInfo.downloadUrl, {
          cancelToken: cancelTokenRef.current.token,
          timeout: options.timeout || 300000, // 5 minutes default
          responseType: options.responseType || 'blob',
          onDownloadProgress: (event) => {
            const progress = calculateProgress(event, startTimeRef.current);
            setDownloadState(prev => ({ ...prev, progress }));
            options.onProgress?.(progress);
          },
        });

        const result = response.data;

        // Update state with success
        setDownloadState({
          isDownloading: false,
          progress: { loaded: response.data.size || 0, total: response.data.size || 0, percentage: 100 },
          error: null,
          result,
          cancel: () => {},
        });

        return result;

      } catch (error) {
        const vaultError = isVaultError(error)
          ? error
          : createVaultError(
              VaultErrorCode.UNKNOWN_ERROR,
              error instanceof Error ? error.message : 'Download failed'
            );

        setDownloadState({
          isDownloading: false,
          progress: null,
          error: vaultError,
          result: null,
          cancel: () => {},
        });

        throw vaultError;
      } finally {
        cancelTokenRef.current = null;
      }
    },
    [apiClient, cancelDownload]
  );

  return {
    downloadFile,
    downloadState,
    cancelDownload,
  };
}

/**
 * Combined hook for both upload and download operations
 */
export function useVaultFile(apiClient: VaultApiClient) {
  const upload = useVaultFileUpload(apiClient);
  const download = useVaultFileDownload(apiClient);

  return {
    ...upload,
    ...download,
    // Rename to avoid conflicts
    upload: upload.uploadFile,
    download: download.downloadFile,
  };
}