import { useCallback, useRef } from 'react';
import { 
  useVault as useVaultSDK, 
  useVaultFile as useVaultFileSDK,
  VaultStorageAdapter,
  FileUploadOptions,
  FileDownloadOptions,
  VaultErrorHandler,
  vaultApi
} from '@dynasty/vault-sdk';
import * as FileSystem from 'expo-file-system';
import * as DocumentPicker from 'expo-document-picker';
import { getAuth } from '@react-native-firebase/auth';
import { 
  callFirebaseFunction, 
  normalizeError,
  ErrorCode 
} from '../lib/errorUtils';
import { logger } from './LoggingService';
import { VaultCryptoService } from './encryption/VaultCryptoService';
import { VaultStreamService } from './encryption/VaultStreamService';
import { R2UploadService } from './R2UploadService';

// Re-export types from existing VaultService for backward compatibility
export { 
  VaultItem,
  VaultUploadOptions,
  VaultDownloadOptions,
  VaultSearchOptions,
  VaultStorageInfo
} from './VaultService';

/**
 * React Native Storage Adapter for vault-sdk
 * Implements platform-specific file operations
 */
class ReactNativeVaultStorageAdapter implements VaultStorageAdapter {
  private cryptoService: VaultCryptoService;
  private streamService: VaultStreamService;
  private r2UploadService: R2UploadService;

  constructor() {
    this.cryptoService = VaultCryptoService.getInstance();
    this.streamService = new VaultStreamService();
    this.r2UploadService = R2UploadService.getInstance();
  }

  async uploadFile(options: FileUploadOptions): Promise<{ 
    fileUrl: string; 
    encryptionKey: string; 
    encryptionIV: string; 
  }> {
    const { file, onProgress, streamingMode } = options;
    
    // Handle React Native file object
    const fileUri = 'uri' in file ? file.uri : '';
    const fileName = 'name' in file ? file.name : 'Untitled';
    const fileType = 'type' in file ? file.type : 'application/octet-stream';
    
    try {
      // Get file info
      const fileInfo = await FileSystem.getInfoAsync(fileUri);
      if (!fileInfo.exists) {
        throw new Error('File not found');
      }

      const fileSize = fileInfo.size || 0;
      const useStreaming = streamingMode ?? fileSize > 10 * 1024 * 1024; // 10MB threshold

      if (useStreaming) {
        // Use streaming encryption for large files
        logger.info('[VaultClient] Using streaming encryption for large file');
        
        // Get upload URL from Firebase
        const uploadUrlResponse = await callFirebaseFunction('getVaultUploadSignedUrl', {
          fileName,
          fileType,
          size: fileSize,
        });

        // Stream encrypt and upload
        const { encryptedFileUrl, encryptionKey, encryptionIV } = 
          await this.streamService.encryptAndUploadStream(
            fileUri,
            uploadUrlResponse.signedUrl,
            {
              onProgress,
              contentType: fileType,
            }
          );

        return {
          fileUrl: encryptedFileUrl,
          encryptionKey: this.cryptoService.encodeBase64(encryptionKey),
          encryptionIV: this.cryptoService.encodeBase64(encryptionIV),
        };
      } else {
        // Use chunked encryption for smaller files
        logger.info('[VaultClient] Using chunked encryption');
        
        // Read file data
        const fileData = await FileSystem.readAsStringAsync(fileUri, {
          encoding: FileSystem.EncodingType.Base64,
        });
        const buffer = this.base64ToArrayBuffer(fileData);

        // Encrypt in chunks
        const fileId = this.cryptoService.generateSecureFileId();
        const masterKey = await this.cryptoService.getVaultMasterKey();
        const fileKey = await this.cryptoService.deriveFileKey(masterKey, fileId);
        
        const { encryptedChunks, header } = await this.cryptoService.encryptFile(
          buffer,
          fileKey
        );

        // Upload chunks
        const chunkUrls: string[] = [];
        for (let i = 0; i < encryptedChunks.length; i++) {
          const chunkUrl = await this.r2UploadService.uploadChunk(
            encryptedChunks[i],
            fileId,
            i,
            {
              onProgress: (chunkProgress) => {
                const totalProgress = ((i + chunkProgress) / encryptedChunks.length) * 100;
                onProgress?.(totalProgress);
              },
            }
          );
          chunkUrls.push(chunkUrl);
        }

        return {
          fileUrl: chunkUrls[0], // First chunk URL as reference
          encryptionKey: this.cryptoService.encodeBase64(fileKey),
          encryptionIV: this.cryptoService.encodeBase64(header),
        };
      }
    } catch (error) {
      logger.error('[VaultClient] Upload failed:', error);
      throw error;
    }
  }

  async downloadFile(options: FileDownloadOptions): Promise<{ 
    uri: string; 
    mimeType: string; 
  }> {
    const { vaultItem, onProgress } = options;
    
    try {
      // Handle streaming vs chunked decryption based on metadata
      const isStreaming = vaultItem.metadata?.streamingMode;
      
      if (isStreaming) {
        // Download and decrypt streaming file
        const downloadUrl = await callFirebaseFunction('getVaultDownloadUrl', {
          itemId: vaultItem.id,
        });

        const localUri = await this.streamService.downloadAndDecryptStream(
          downloadUrl.url,
          vaultItem.encryptionKey!,
          vaultItem.encryptionIV!,
          {
            onProgress,
          }
        );

        return {
          uri: localUri,
          mimeType: vaultItem.mimeType || 'application/octet-stream',
        };
      } else {
        // Download and decrypt chunked file
        const chunks = await this.downloadChunks(vaultItem, onProgress);
        const decryptedData = await this.cryptoService.decryptChunks(
          chunks,
          vaultItem.encryptionKey!,
          vaultItem.encryptionIV!
        );

        // Save to local file system
        const fileName = `vault_${vaultItem.id}_${vaultItem.name}`;
        const localUri = `${FileSystem.documentDirectory}${fileName}`;
        
        await FileSystem.writeAsStringAsync(
          localUri,
          this.arrayBufferToBase64(decryptedData),
          { encoding: FileSystem.EncodingType.Base64 }
        );

        return {
          uri: localUri,
          mimeType: vaultItem.mimeType || 'application/octet-stream',
        };
      }
    } catch (error) {
      logger.error('[VaultClient] Download failed:', error);
      throw error;
    }
  }

  async deleteFile(fileUrl: string): Promise<void> {
    // File deletion is handled by Firebase Functions
    // This is just a placeholder for the interface
    logger.info('[VaultClient] File deletion will be handled by backend');
  }

  async getFileInfo(uri: string): Promise<{ size: number; mimeType: string }> {
    const fileInfo = await FileSystem.getInfoAsync(uri);
    if (!fileInfo.exists) {
      throw new Error('File not found');
    }

    // Try to determine MIME type from extension
    const extension = uri.split('.').pop()?.toLowerCase();
    const mimeType = this.getMimeTypeFromExtension(extension);

    return {
      size: fileInfo.size || 0,
      mimeType,
    };
  }

  // Helper methods
  private base64ToArrayBuffer(base64: string): ArrayBuffer {
    const binaryString = atob(base64);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes.buffer;
  }

  private arrayBufferToBase64(buffer: ArrayBuffer): string {
    const bytes = new Uint8Array(buffer);
    let binary = '';
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  }

  private getMimeTypeFromExtension(extension?: string): string {
    const mimeTypes: Record<string, string> = {
      jpg: 'image/jpeg',
      jpeg: 'image/jpeg',
      png: 'image/png',
      gif: 'image/gif',
      pdf: 'application/pdf',
      doc: 'application/msword',
      docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      mp4: 'video/mp4',
      mp3: 'audio/mp3',
      // Add more as needed
    };
    return mimeTypes[extension || ''] || 'application/octet-stream';
  }

  private async downloadChunks(
    vaultItem: any,
    onProgress?: (progress: number) => void
  ): Promise<ArrayBuffer[]> {
    // Implementation would download chunks from URLs
    // This is a placeholder
    throw new Error('Chunked download not yet implemented');
  }
}

/**
 * Error handler implementation for React Native
 */
class ReactNativeErrorHandler implements VaultErrorHandler {
  handleError(error: Error, message?: string): void {
    const normalizedError = normalizeError(error);
    logger.error(`[VaultClient] ${message || 'Error'}:`, normalizedError);
    
    // You could also show a toast or alert here
    // For now, just log it
  }
}

/**
 * Vault Client Hook - Main entry point for vault functionality
 * Wraps the SDK hooks and provides React Native specific functionality
 */
export function useVaultClient(familyId: string) {
  const storageAdapter = useRef(new ReactNativeVaultStorageAdapter()).current;
  const errorHandler = useRef(new ReactNativeErrorHandler()).current;

  // Set up authentication
  const setupAuth = useCallback(async () => {
    const auth = getAuth();
    const user = auth.currentUser;
    
    if (user) {
      const idToken = await user.getIdToken();
      vaultApi.setAuthToken(idToken);
    }
  }, []);

  // Use SDK hooks
  const vault = useVaultSDK({
    familyId,
    errorHandler,
    enabled: !!familyId,
  });

  const vaultFile = useVaultFileSDK({
    storageAdapter,
    errorHandler,
  });

  // Initialize auth on mount
  useCallback(() => {
    setupAuth();
  }, [setupAuth]);

  // Backward compatibility methods
  const uploadFile = useCallback(
    async (uri: string, options?: any) => {
      await setupAuth();
      
      const file = {
        uri,
        name: options?.name || uri.split('/').pop() || 'file',
        type: options?.mimeType || 'application/octet-stream',
      };

      return vaultFile.uploadFileAsync({
        file,
        familyId,
        vaultItem: {
          name: file.name,
          type: options?.fileType || 'document',
          parentId: options?.parentId,
        },
        onProgress: options?.onProgress,
      });
    },
    [familyId, vaultFile, setupAuth]
  );

  const downloadFile = useCallback(
    async (itemId: string, options?: any) => {
      await setupAuth();
      
      const item = vault.items.find((i) => i.id === itemId);
      if (!item) {
        throw new Error('Item not found');
      }

      return vaultFile.downloadFileAsync({
        vaultItem: item,
        onProgress: options?.onProgress,
      });
    },
    [vault.items, vaultFile, setupAuth]
  );

  const deleteItem = useCallback(
    async (itemId: string) => {
      await setupAuth();
      vault.delete(itemId);
    },
    [vault, setupAuth]
  );

  return {
    // SDK methods
    ...vault,
    ...vaultFile,
    
    // Backward compatibility methods
    uploadFile,
    downloadFile,
    deleteItem,
    
    // Additional mobile-specific methods
    pickDocument: async () => {
      const result = await DocumentPicker.getDocumentAsync({
        type: '*/*',
        copyToCacheDirectory: true,
      });
      
      if (result.type === 'success') {
        return result;
      }
      return null;
    },
  };
}