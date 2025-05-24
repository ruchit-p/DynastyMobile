import * as FileSystem from 'expo-file-system';
import * as ImageManipulator from 'expo-image-manipulator';
import { createHash } from 'react-native-quick-crypto';
import { Buffer } from '@craftzdog/react-native-buffer';
import AsyncStorage from '@react-native-async-storage/async-storage';
import MediaEncryptionService from './MediaEncryptionService';
import { getFirebaseStorage } from '../../lib/firebase';

interface PreviewCache {
  fileId: string;
  previewUri: string; // Local URI of encrypted preview
  createdAt: number;
  accessedAt: number;
  encryptedKey: string; // Key used to encrypt the preview
  metadata: {
    width: number;
    height: number;
    size: number;
    mimeType: string;
  };
}

interface PreviewOptions {
  width?: number;
  height?: number;
  quality?: number;
  format?: 'jpeg' | 'png';
}

export class FilePreviewService {
  private static instance: FilePreviewService;
  private readonly PREVIEW_CACHE_KEY = '@dynasty_preview_cache';
  private readonly PREVIEW_DIR = `${FileSystem.documentDirectory}previews/`;
  private readonly MAX_CACHE_SIZE = 100 * 1024 * 1024; // 100MB
  private readonly MAX_CACHE_AGE = 7 * 24 * 60 * 60 * 1000; // 7 days
  private previewCache: Map<string, PreviewCache> = new Map();

  private constructor() {
    this.initializePreviewDirectory();
    this.loadPreviewCache();
  }

  static getInstance(): FilePreviewService {
    if (!FilePreviewService.instance) {
      FilePreviewService.instance = new FilePreviewService();
    }
    return FilePreviewService.instance;
  }

  private async initializePreviewDirectory() {
    const dirInfo = await FileSystem.getInfoAsync(this.PREVIEW_DIR);
    if (!dirInfo.exists) {
      await FileSystem.makeDirectoryAsync(this.PREVIEW_DIR, { intermediates: true });
    }
  }

  private async loadPreviewCache() {
    try {
      const cacheData = await AsyncStorage.getItem(this.PREVIEW_CACHE_KEY);
      if (cacheData) {
        const cacheArray: PreviewCache[] = JSON.parse(cacheData);
        cacheArray.forEach(item => this.previewCache.set(item.fileId, item));
      }
      
      // Clean up old previews
      await this.cleanupOldPreviews();
    } catch (error) {
      console.error('Failed to load preview cache:', error);
    }
  }

  private async savePreviewCache() {
    try {
      const cacheArray = Array.from(this.previewCache.values());
      await AsyncStorage.setItem(this.PREVIEW_CACHE_KEY, JSON.stringify(cacheArray));
    } catch (error) {
      console.error('Failed to save preview cache:', error);
    }
  }

  /**
   * Get or generate encrypted preview for a file
   */
  async getEncryptedPreview(
    fileId: string,
    fileUri: string,
    mimeType: string,
    options: PreviewOptions = {}
  ): Promise<string | null> {
    try {
      // Check cache first
      const cached = this.previewCache.get(fileId);
      if (cached) {
        // Check if preview file still exists
        const fileInfo = await FileSystem.getInfoAsync(cached.previewUri);
        if (fileInfo.exists) {
          // Update access time
          cached.accessedAt = Date.now();
          this.previewCache.set(fileId, cached);
          await this.savePreviewCache();
          return cached.previewUri;
        }
      }

      // Generate preview based on file type
      if (mimeType.startsWith('image/')) {
        return await this.generateImagePreview(fileId, fileUri, options);
      } else if (mimeType.startsWith('video/')) {
        return await this.generateVideoPreview(fileId, fileUri, options);
      } else if (mimeType === 'application/pdf') {
        return await this.generatePDFPreview(fileId, fileUri, options);
      } else {
        // For other file types, generate a placeholder preview
        return await this.generatePlaceholderPreview(fileId, mimeType);
      }
    } catch (error) {
      console.error('Failed to get encrypted preview:', error);
      return null;
    }
  }

  /**
   * Generate encrypted image preview
   */
  private async generateImagePreview(
    fileId: string,
    fileUri: string,
    options: PreviewOptions
  ): Promise<string> {
    const { width = 400, height = 400, quality = 0.8, format = 'jpeg' } = options;

    // Resize image
    const manipulated = await ImageManipulator.manipulateAsync(
      fileUri,
      [{ resize: { width, height } }],
      { compress: quality, format: ImageManipulator.SaveFormat[format.toUpperCase() as keyof typeof ImageManipulator.SaveFormat] }
    );

    // Encrypt the preview
    const previewData = await FileSystem.readAsStringAsync(manipulated.uri, {
      encoding: FileSystem.EncodingType.Base64
    });

    const encryptedResult = await MediaEncryptionService.encryptFile(
      new Uint8Array(Buffer.from(previewData, 'base64'))
    );

    // Save encrypted preview locally
    const previewFileName = `preview_${fileId}_${Date.now()}.enc`;
    const previewUri = `${this.PREVIEW_DIR}${previewFileName}`;

    await FileSystem.writeAsStringAsync(
      previewUri,
      encryptedResult.encryptedData,
      { encoding: FileSystem.EncodingType.Base64 }
    );

    // Cache preview info
    const previewCache: PreviewCache = {
      fileId,
      previewUri,
      createdAt: Date.now(),
      accessedAt: Date.now(),
      encryptedKey: encryptedResult.encryptedKey,
      metadata: {
        width: manipulated.width || width,
        height: manipulated.height || height,
        size: previewData.length,
        mimeType: `image/${format}`
      }
    };

    this.previewCache.set(fileId, previewCache);
    await this.savePreviewCache();

    // Clean up temporary file
    await FileSystem.deleteAsync(manipulated.uri, { idempotent: true });

    return previewUri;
  }

  /**
   * Generate encrypted video preview (thumbnail)
   */
  private async generateVideoPreview(
    fileId: string,
    fileUri: string,
    options: PreviewOptions
  ): Promise<string | null> {
    // Video thumbnail generation would require expo-av
    // For now, return a placeholder
    return this.generatePlaceholderPreview(fileId, 'video/mp4');
  }

  /**
   * Generate encrypted PDF preview (first page)
   */
  private async generatePDFPreview(
    fileId: string,
    fileUri: string,
    options: PreviewOptions
  ): Promise<string | null> {
    // PDF preview generation would require a PDF rendering library
    // For now, return a placeholder
    return this.generatePlaceholderPreview(fileId, 'application/pdf');
  }

  /**
   * Generate placeholder preview for unsupported types
   */
  private async generatePlaceholderPreview(
    fileId: string,
    mimeType: string
  ): Promise<string> {
    // Create a simple placeholder image based on file type
    const placeholderType = this.getFileTypeFromMime(mimeType);
    
    // This would ideally generate an actual image, but for now return a marker
    const placeholderData = {
      type: 'placeholder',
      fileType: placeholderType,
      mimeType,
      generatedAt: Date.now()
    };

    const placeholderJson = JSON.stringify(placeholderData);
    const encryptedResult = await MediaEncryptionService.encryptFile(
      new Uint8Array(Buffer.from(placeholderJson, 'utf8'))
    );

    const previewFileName = `placeholder_${fileId}_${Date.now()}.enc`;
    const previewUri = `${this.PREVIEW_DIR}${previewFileName}`;

    await FileSystem.writeAsStringAsync(
      previewUri,
      encryptedResult.encryptedData,
      { encoding: FileSystem.EncodingType.Base64 }
    );

    const previewCache: PreviewCache = {
      fileId,
      previewUri,
      createdAt: Date.now(),
      accessedAt: Date.now(),
      encryptedKey: encryptedResult.encryptedKey,
      metadata: {
        width: 200,
        height: 200,
        size: placeholderJson.length,
        mimeType: 'application/json'
      }
    };

    this.previewCache.set(fileId, previewCache);
    await this.savePreviewCache();

    return previewUri;
  }

  /**
   * Decrypt and display preview
   */
  async decryptPreview(fileId: string): Promise<{ uri: string; metadata: any } | null> {
    try {
      const cached = this.previewCache.get(fileId);
      if (!cached) return null;

      // Read encrypted preview
      const encryptedData = await FileSystem.readAsStringAsync(
        cached.previewUri,
        { encoding: FileSystem.EncodingType.Base64 }
      );

      // Decrypt preview
      const decryptedData = await MediaEncryptionService.decryptFile(
        encryptedData,
        cached.encryptedKey,
        cached.metadata
      );

      // Save decrypted preview temporarily
      const tempUri = `${FileSystem.cacheDirectory}temp_preview_${fileId}_${Date.now()}.${this.getExtensionFromMime(cached.metadata.mimeType)}`;
      
      await FileSystem.writeAsStringAsync(
        tempUri,
        Buffer.from(decryptedData).toString('base64'),
        { encoding: FileSystem.EncodingType.Base64 }
      );

      return {
        uri: tempUri,
        metadata: cached.metadata
      };
    } catch (error) {
      console.error('Failed to decrypt preview:', error);
      return null;
    }
  }

  /**
   * Clean up old previews to manage storage
   */
  private async cleanupOldPreviews() {
    const now = Date.now();
    const totalSize = await this.calculateCacheSize();
    const itemsToDelete: string[] = [];

    // Sort by last accessed time
    const sortedCache = Array.from(this.previewCache.entries())
      .sort((a, b) => a[1].accessedAt - b[1].accessedAt);

    let currentSize = totalSize;

    for (const [fileId, cache] of sortedCache) {
      // Remove if too old or if we need to free space
      if (
        now - cache.accessedAt > this.MAX_CACHE_AGE ||
        currentSize > this.MAX_CACHE_SIZE
      ) {
        itemsToDelete.push(fileId);
        currentSize -= cache.metadata.size;
      }
    }

    // Delete files and update cache
    for (const fileId of itemsToDelete) {
      const cache = this.previewCache.get(fileId);
      if (cache) {
        try {
          await FileSystem.deleteAsync(cache.previewUri, { idempotent: true });
        } catch (error) {
          console.error(`Failed to delete preview ${fileId}:`, error);
        }
        this.previewCache.delete(fileId);
      }
    }

    if (itemsToDelete.length > 0) {
      await this.savePreviewCache();
    }
  }

  /**
   * Calculate total cache size
   */
  private async calculateCacheSize(): Promise<number> {
    let totalSize = 0;
    for (const cache of this.previewCache.values()) {
      totalSize += cache.metadata.size;
    }
    return totalSize;
  }

  /**
   * Clear all previews
   */
  async clearAllPreviews() {
    // Delete all preview files
    try {
      await FileSystem.deleteAsync(this.PREVIEW_DIR, { idempotent: true });
      await this.initializePreviewDirectory();
    } catch (error) {
      console.error('Failed to clear preview directory:', error);
    }

    // Clear cache
    this.previewCache.clear();
    await AsyncStorage.removeItem(this.PREVIEW_CACHE_KEY);
  }

  /**
   * Get file type from MIME type
   */
  private getFileTypeFromMime(mimeType: string): string {
    if (mimeType.startsWith('image/')) return 'image';
    if (mimeType.startsWith('video/')) return 'video';
    if (mimeType.startsWith('audio/')) return 'audio';
    if (mimeType === 'application/pdf') return 'pdf';
    if (mimeType.includes('document') || mimeType.includes('text')) return 'document';
    return 'file';
  }

  /**
   * Get file extension from MIME type
   */
  private getExtensionFromMime(mimeType: string): string {
    const mimeToExt: { [key: string]: string } = {
      'image/jpeg': 'jpg',
      'image/png': 'png',
      'image/gif': 'gif',
      'image/webp': 'webp',
      'video/mp4': 'mp4',
      'video/quicktime': 'mov',
      'audio/mpeg': 'mp3',
      'audio/wav': 'wav',
      'application/pdf': 'pdf',
      'application/json': 'json'
    };
    
    return mimeToExt[mimeType] || 'bin';
  }

  /**
   * Preload previews for a list of files
   */
  async preloadPreviews(files: { id: string; uri: string; mimeType: string }[]) {
    const preloadPromises = files.map(file => 
      this.getEncryptedPreview(file.id, file.uri, file.mimeType)
        .catch(error => console.error(`Failed to preload preview for ${file.id}:`, error))
    );

    await Promise.all(preloadPromises);
  }
}

export default FilePreviewService.getInstance();