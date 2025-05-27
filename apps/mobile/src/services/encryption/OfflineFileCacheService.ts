import * as FileSystem from 'expo-file-system';
import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo from '@react-native-community/netinfo';
import { Buffer } from '@craftzdog/react-native-buffer';
import { MediaEncryptionService } from './MediaEncryptionService';
import { logger } from '../LoggingService';

interface CachedFile {
  fileId: string;
  localUri: string;
  encryptedKey: string;
  metadata: {
    fileName: string;
    fileSize: number;
    mimeType: string;
    originalUri: string;
    cachedAt: number;
    lastAccessedAt: number;
    accessCount: number;
    expiresAt?: number;
  };
  isOfflineAvailable: boolean;
  isPinned: boolean; // Pinned files won't be auto-deleted
}

interface CacheConfig {
  maxCacheSize: number;
  maxFileSize: number;
  cacheExpirationMs: number;
  offlineRetentionMs: number;
}

const DEFAULT_CONFIG: CacheConfig = {
  maxCacheSize: 500 * 1024 * 1024, // 500MB
  maxFileSize: 50 * 1024 * 1024, // 50MB per file
  cacheExpirationMs: 7 * 24 * 60 * 60 * 1000, // 7 days
  offlineRetentionMs: 30 * 24 * 60 * 60 * 1000, // 30 days for pinned files
};

export class OfflineFileCacheService {
  private static instance: OfflineFileCacheService;
  private readonly CACHE_INDEX_KEY = '@dynasty_file_cache_index';
  private readonly CACHE_DIR = `${FileSystem.documentDirectory}encrypted_cache/`;
  private readonly TEMP_DIR = `${FileSystem.cacheDirectory}temp_decrypt/`;
  
  private cacheIndex: Map<string, CachedFile> = new Map();
  private config: CacheConfig;
  private isOnline: boolean = true;
  private downloadQueue: Set<string> = new Set();

  private constructor(config: Partial<CacheConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.initializeCacheDirectory();
    this.loadCacheIndex();
    this.initializeNetworkListener();
  }

  static getInstance(config?: Partial<CacheConfig>): OfflineFileCacheService {
    if (!OfflineFileCacheService.instance) {
      OfflineFileCacheService.instance = new OfflineFileCacheService(config);
    }
    return OfflineFileCacheService.instance;
  }

  private async initializeCacheDirectory() {
    // Create cache directory
    const cacheInfo = await FileSystem.getInfoAsync(this.CACHE_DIR);
    if (!cacheInfo.exists) {
      await FileSystem.makeDirectoryAsync(this.CACHE_DIR, { intermediates: true });
    }

    // Create temp directory
    const tempInfo = await FileSystem.getInfoAsync(this.TEMP_DIR);
    if (!tempInfo.exists) {
      await FileSystem.makeDirectoryAsync(this.TEMP_DIR, { intermediates: true });
    }
  }

  private initializeNetworkListener() {
    NetInfo.addEventListener(state => {
      this.isOnline = state.isConnected ?? false;
      
      if (this.isOnline) {
        // Process any pending downloads
        this.processPendingDownloads();
      }
    });
  }

  private async loadCacheIndex() {
    try {
      const indexData = await AsyncStorage.getItem(this.CACHE_INDEX_KEY);
      if (indexData) {
        const cacheArray: CachedFile[] = JSON.parse(indexData);
        cacheArray.forEach(item => this.cacheIndex.set(item.fileId, item));
      }
      
      // Validate cache entries
      await this.validateCacheEntries();
      
      // Clean up expired entries
      await this.cleanupExpiredFiles();
    } catch (error) {
      logger.error('Failed to load cache index:', error);
    }
  }

  private async saveCacheIndex() {
    try {
      const cacheArray = Array.from(this.cacheIndex.values());
      await AsyncStorage.setItem(this.CACHE_INDEX_KEY, JSON.stringify(cacheArray));
    } catch (error) {
      logger.error('Failed to save cache index:', error);
    }
  }

  /**
   * Cache a file for offline access
   */
  async cacheFile(
    fileId: string,
    fileUri: string,
    metadata: {
      fileName: string;
      fileSize: number;
      mimeType: string;
    },
    options: {
      pin?: boolean;
      expiresAt?: number;
    } = {}
  ): Promise<CachedFile | null> {
    try {
      // Check file size limit
      if (metadata.fileSize > this.config.maxFileSize) {
        throw new Error('File too large for offline cache');
      }

      // Check available space
      const hasSpace = await this.ensureCacheSpace(metadata.fileSize);
      if (!hasSpace) {
        throw new Error('Insufficient cache space');
      }

      // Download file if remote
      let localFileUri = fileUri;
      if (fileUri.startsWith('http')) {
        localFileUri = await this.downloadFile(fileId, fileUri);
      }

      // Read file data
      const fileData = await FileSystem.readAsStringAsync(localFileUri, {
        encoding: FileSystem.EncodingType.Base64
      });

      // Encrypt file
      const encryptedResult = await MediaEncryptionService.encryptFile(
        new Uint8Array(Buffer.from(fileData, 'base64'))
      );

      // Save encrypted file
      const cacheFileName = `${fileId}_${Date.now()}.enc`;
      const cacheUri = `${this.CACHE_DIR}${cacheFileName}`;

      await FileSystem.writeAsStringAsync(
        cacheUri,
        encryptedResult.encryptedData,
        { encoding: FileSystem.EncodingType.Base64 }
      );

      // Create cache entry
      const cachedFile: CachedFile = {
        fileId,
        localUri: cacheUri,
        encryptedKey: encryptedResult.encryptedKey,
        metadata: {
          ...metadata,
          originalUri: fileUri,
          cachedAt: Date.now(),
          lastAccessedAt: Date.now(),
          accessCount: 0,
          expiresAt: options.expiresAt,
        },
        isOfflineAvailable: true,
        isPinned: options.pin || false,
      };

      // Update index
      this.cacheIndex.set(fileId, cachedFile);
      await this.saveCacheIndex();

      // Clean up temp file if downloaded
      if (localFileUri !== fileUri) {
        await FileSystem.deleteAsync(localFileUri, { idempotent: true });
      }

      return cachedFile;
    } catch (error) {
      logger.error('Failed to cache file:', error);
      return null;
    }
  }

  /**
   * Get cached file
   */
  async getCachedFile(fileId: string): Promise<string | null> {
    try {
      const cached = this.cacheIndex.get(fileId);
      if (!cached) return null;

      // Check if file exists
      const fileInfo = await FileSystem.getInfoAsync(cached.localUri);
      if (!fileInfo.exists) {
        // Remove from index
        this.cacheIndex.delete(fileId);
        await this.saveCacheIndex();
        return null;
      }

      // Check expiration
      if (cached.metadata.expiresAt && Date.now() > cached.metadata.expiresAt) {
        await this.removeCachedFile(fileId);
        return null;
      }

      // Update access info
      cached.metadata.lastAccessedAt = Date.now();
      cached.metadata.accessCount++;
      this.cacheIndex.set(fileId, cached);
      await this.saveCacheIndex();

      // Decrypt file to temp location
      const decryptedUri = await this.decryptCachedFile(cached);
      return decryptedUri;
    } catch (error) {
      logger.error('Failed to get cached file:', error);
      return null;
    }
  }

  /**
   * Decrypt cached file to temporary location
   */
  private async decryptCachedFile(cached: CachedFile): Promise<string> {
    // Read encrypted data
    const encryptedData = await FileSystem.readAsStringAsync(
      cached.localUri,
      { encoding: FileSystem.EncodingType.Base64 }
    );

    // Decrypt
    const decryptedData = await MediaEncryptionService.decryptFile(
      encryptedData,
      cached.encryptedKey,
      cached.metadata
    );

    // Save to temp location
    const extension = this.getExtensionFromMime(cached.metadata.mimeType);
    const tempFileName = `${cached.fileId}_${Date.now()}.${extension}`;
    const tempUri = `${this.TEMP_DIR}${tempFileName}`;

    await FileSystem.writeAsStringAsync(
      tempUri,
      Buffer.from(decryptedData).toString('base64'),
      { encoding: FileSystem.EncodingType.Base64 }
    );

    // Schedule cleanup after a delay
    setTimeout(() => {
      FileSystem.deleteAsync(tempUri, { idempotent: true })
        .catch(err => logger.error('Failed to cleanup temp file:', err));
    }, 5 * 60 * 1000); // 5 minutes

    return tempUri;
  }

  /**
   * Pin/unpin file for offline access
   */
  async pinFile(fileId: string, pin: boolean = true): Promise<boolean> {
    const cached = this.cacheIndex.get(fileId);
    if (!cached) return false;

    cached.isPinned = pin;
    this.cacheIndex.set(fileId, cached);
    await this.saveCacheIndex();

    return true;
  }

  /**
   * Remove cached file
   */
  async removeCachedFile(fileId: string): Promise<void> {
    const cached = this.cacheIndex.get(fileId);
    if (!cached) return;

    try {
      await FileSystem.deleteAsync(cached.localUri, { idempotent: true });
    } catch (error) {
      logger.error('Failed to delete cached file:', error);
    }

    this.cacheIndex.delete(fileId);
    await this.saveCacheIndex();
  }

  /**
   * Download file from remote URL
   */
  private async downloadFile(fileId: string, url: string): Promise<string> {
    const tempFileName = `download_${fileId}_${Date.now()}`;
    const tempUri = `${FileSystem.cacheDirectory}${tempFileName}`;

    const downloadResult = await FileSystem.downloadAsync(url, tempUri);
    
    if (downloadResult.status !== 200) {
      throw new Error(`Download failed with status ${downloadResult.status}`);
    }

    return downloadResult.uri;
  }

  /**
   * Ensure cache has enough space
   */
  private async ensureCacheSpace(requiredSize: number): Promise<boolean> {
    const currentSize = await this.calculateCacheSize();
    
    if (currentSize + requiredSize <= this.config.maxCacheSize) {
      return true;
    }

    // Try to free space
    const spaceNeeded = (currentSize + requiredSize) - this.config.maxCacheSize;
    const freedSpace = await this.freeSpace(spaceNeeded);

    return freedSpace >= spaceNeeded;
  }

  /**
   * Free up cache space
   */
  private async freeSpace(targetSize: number): Promise<number> {
    let freedSpace = 0;

    // Sort by last accessed time and pinned status
    const sortedEntries = Array.from(this.cacheIndex.entries())
      .filter(([_, file]) => !file.isPinned) // Don't delete pinned files
      .sort((a, b) => a[1].metadata.lastAccessedAt - b[1].metadata.lastAccessedAt);

    for (const [fileId, cached] of sortedEntries) {
      if (freedSpace >= targetSize) break;

      await this.removeCachedFile(fileId);
      freedSpace += cached.metadata.fileSize;
    }

    return freedSpace;
  }

  /**
   * Calculate total cache size
   */
  private async calculateCacheSize(): Promise<number> {
    let totalSize = 0;
    
    for (const cached of this.cacheIndex.values()) {
      totalSize += cached.metadata.fileSize;
    }

    return totalSize;
  }

  /**
   * Validate cache entries
   */
  private async validateCacheEntries() {
    const invalidEntries: string[] = [];

    for (const [fileId, cached] of this.cacheIndex.entries()) {
      const fileInfo = await FileSystem.getInfoAsync(cached.localUri);
      if (!fileInfo.exists) {
        invalidEntries.push(fileId);
      }
    }

    // Remove invalid entries
    for (const fileId of invalidEntries) {
      this.cacheIndex.delete(fileId);
    }

    if (invalidEntries.length > 0) {
      await this.saveCacheIndex();
    }
  }

  /**
   * Clean up expired files
   */
  private async cleanupExpiredFiles() {
    const now = Date.now();
    const expiredFiles: string[] = [];

    for (const [fileId, cached] of this.cacheIndex.entries()) {
      // Check expiration
      if (cached.metadata.expiresAt && now > cached.metadata.expiresAt) {
        expiredFiles.push(fileId);
        continue;
      }

      // Check age for non-pinned files
      if (!cached.isPinned && 
          now - cached.metadata.cachedAt > this.config.cacheExpirationMs) {
        expiredFiles.push(fileId);
      }
    }

    // Remove expired files
    for (const fileId of expiredFiles) {
      await this.removeCachedFile(fileId);
    }
  }

  /**
   * Process pending downloads when back online
   */
  private async processPendingDownloads() {
    for (const fileId of this.downloadQueue) {
      // Implementation would retry failed downloads
      logger.debug(`Processing pending download for ${fileId}`);
    }
    this.downloadQueue.clear();
  }

  /**
   * Get cache statistics
   */
  async getCacheStats() {
    const totalSize = await this.calculateCacheSize();
    const fileCount = this.cacheIndex.size;
    const pinnedCount = Array.from(this.cacheIndex.values())
      .filter(f => f.isPinned).length;

    return {
      totalSize,
      fileCount,
      pinnedCount,
      maxSize: this.config.maxCacheSize,
      usagePercent: (totalSize / this.config.maxCacheSize) * 100
    };
  }

  /**
   * Clear all cached files
   */
  async clearCache(includePinned: boolean = false) {
    const filesToRemove = Array.from(this.cacheIndex.entries())
      .filter(([_, file]) => includePinned || !file.isPinned)
      .map(([fileId]) => fileId);

    for (const fileId of filesToRemove) {
      await this.removeCachedFile(fileId);
    }

    // Clear temp directory
    try {
      await FileSystem.deleteAsync(this.TEMP_DIR, { idempotent: true });
      await this.initializeCacheDirectory();
    } catch (error) {
      logger.error('Failed to clear temp directory:', error);
    }
  }

  /**
   * Get file extension from MIME type
   */
  private getExtensionFromMime(mimeType: string): string {
    const mimeToExt: { [key: string]: string } = {
      'image/jpeg': 'jpg',
      'image/png': 'png',
      'image/gif': 'gif',
      'video/mp4': 'mp4',
      'audio/mpeg': 'mp3',
      'application/pdf': 'pdf',
      'text/plain': 'txt',
      'application/json': 'json',
    };
    
    return mimeToExt[mimeType] || 'bin';
  }

  /**
   * Get all cached files
   */
  getCachedFiles(): CachedFile[] {
    return Array.from(this.cacheIndex.values());
  }

  /**
   * Check if file is cached
   */
  isFileCached(fileId: string): boolean {
    return this.cacheIndex.has(fileId);
  }
}

export default OfflineFileCacheService.getInstance();