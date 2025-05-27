import { FirebaseFirestoreTypes } from '@react-native-firebase/firestore';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FileSystem from 'expo-file-system';
import { 
  callFirebaseFunction, 
  normalizeError,
  ErrorCode 
} from '../lib/errorUtils';
import { getFirebaseDb } from '../lib/firebase';
import { SyncDatabase } from '../database/SyncDatabase';
import NetInfo from '@react-native-community/netinfo';
import { logger } from './LoggingService';
import { VaultCryptoService } from './encryption/VaultCryptoService';
import { VaultKeyManager } from './encryption/VaultKeyManager';
import { BiometricVaultAccess, 
  VaultSetupOptions, 
  VaultAccessResult,
  VaultSecurityStatus 
} from './encryption/BiometricVaultAccess';
import { VaultStreamService, StreamProgress } from './encryption/VaultStreamService';
import { 
  VaultSearchService, 
  SearchableMetadata, 
  SearchOptions
} from './encryption/VaultSearchService';
import { 
  FamilyVaultSharing,
  VaultShare,
  SharePermissions,
  ShareAcceptResult,
  SharingStats
} from './encryption/FamilyVaultSharing';

// Custom AppError class for vault operations
class AppError extends Error {
  constructor(public code: ErrorCode, message: string, public details?: any) {
    super(message);
    this.name = 'AppError';
  }
}

// Simple cache wrapper for VaultService
class SimpleCache {
  async get<T>(key: string): Promise<T | null> {
    try {
      const data = await AsyncStorage.getItem(key);
      if (!data) return null;
      
      const parsed = JSON.parse(data);
      if (parsed.expiresAt && parsed.expiresAt < Date.now()) {
        await AsyncStorage.removeItem(key);
        return null;
      }
      
      return parsed.value as T;
    } catch (error) {
      logger.error('[SimpleCache] Get error:', error);
      return null;
    }
  }
  
  async set<T>(key: string, value: T, ttl: number): Promise<void> {
    try {
      const data = {
        value,
        expiresAt: Date.now() + ttl
      };
      await AsyncStorage.setItem(key, JSON.stringify(data));
    } catch (error) {
      logger.error('[SimpleCache] Set error:', error);
    }
  }
  
  async delete(key: string): Promise<void> {
    try {
      await AsyncStorage.removeItem(key);
    } catch (error) {
      logger.error('[SimpleCache] Delete error:', error);
    }
  }
}

// Constants
const VAULT_CACHE_PREFIX = 'vault_cache_';
const VAULT_CACHE_TTL = 30 * 60 * 1000; // 30 minutes
const MAX_FILE_SIZE = 100 * 1024 * 1024; // 100MB
const STREAMING_THRESHOLD = 10 * 1024 * 1024; // 10MB - Use streaming for files larger than this
const MAX_RETRY_ATTEMPTS = 3;

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
  encryptionMetadata?: {
    // Version 1.0 properties (standard chunked encryption)
    headerUrl?: string;
    chunkUrls?: string[];
    chunkCount?: number;
    encryptedSize?: number;
    version?: string;
    
    // Version 2.0 properties (streaming encryption)
    streamingMode?: boolean;
    headerBase64?: string;
    encryptedFileUrl?: string;
  };
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

export interface EncryptedVaultUploadResult {
  vaultItem: VaultItem;
  encryptedChunks: {
    headerUrl: string;
    chunkUrls: string[];
  };
}

export interface VaultInitializationStatus {
  isInitialized: boolean;
  hasVaultKeys: boolean;
  biometricEnabled: boolean;
  requiresSetup: boolean;
  securityStatus: VaultSecurityStatus;
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
  private cacheManager: SimpleCache;
  private syncDb: SyncDatabase | null = null;
  private uploadQueue: Map<string, any> = new Map();
  private downloadCache: Map<string, any> = new Map();
  private isInitialized = false;
  
  // Encryption services
  private cryptoService: VaultCryptoService;
  private keyManager: VaultKeyManager;
  private biometricAccess: BiometricVaultAccess;
  private streamService: VaultStreamService;
  private searchService: VaultSearchService;
  private sharingService: FamilyVaultSharing;
  private currentUserId: string | null = null;
  private vaultMasterKey: Uint8Array | null = null;

  private constructor() {
    this.db = getFirebaseDb();
    this.cacheManager = new SimpleCache();
    this.cryptoService = VaultCryptoService.getInstance();
    this.keyManager = VaultKeyManager.getInstance();
    this.biometricAccess = BiometricVaultAccess.getInstance();
    this.streamService = VaultStreamService.getInstance();
    this.searchService = VaultSearchService.getInstance();
    this.sharingService = FamilyVaultSharing.getInstance();
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
      logger.debug('[VaultService] Initializing...');
      
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
      logger.debug('[VaultService] Initialized successfully');
    } catch (error) {
      logger.error('[VaultService] Initialization error:', error);
      throw normalizeError(error);
    }
  }

  // ============== VAULT ENCRYPTION METHODS ==============

  /**
   * Setup encrypted vault for user
   */
  async setupVault(userId: string, options: VaultSetupOptions): Promise<VaultAccessResult> {
    try {
      logger.info(`[VaultService] Setting up encrypted vault for user: ${userId}`);
      this.currentUserId = userId;
      
      const result = await this.biometricAccess.setupBiometricVault(userId, options);
      
      if (result.success && result.masterKey) {
        this.vaultMasterKey = result.masterKey;
        
        // Initialize search service with master key
        await this.searchService.initialize(result.masterKey);
        
        // Initialize sharing service
        await this.sharingService.initialize(userId);
        
        logger.info(`[VaultService] Vault setup completed successfully for user: ${userId}`);
      }
      
      return result;
    } catch (error) {
      logger.error('[VaultService] Failed to setup vault:', error);
      throw normalizeError(error);
    }
  }

  /**
   * Authenticate and unlock vault
   */
  async unlockVault(userId: string): Promise<VaultAccessResult> {
    try {
      logger.info(`[VaultService] Unlocking vault for user: ${userId}`);
      this.currentUserId = userId;
      
      const result = await this.biometricAccess.authenticateAndAccessVault(userId);
      
      if (result.success && result.masterKey) {
        this.vaultMasterKey = result.masterKey;
        
        // Initialize search service with master key
        await this.searchService.initialize(result.masterKey);
        
        // Initialize sharing service
        await this.sharingService.initialize(userId);
        
        logger.info(`[VaultService] Vault unlocked successfully for user: ${userId}`);
      }
      
      return result;
    } catch (error) {
      logger.error('[VaultService] Failed to unlock vault:', error);
      throw normalizeError(error);
    }
  }

  /**
   * Lock vault (clear master key from memory)
   */
  lockVault(): void {
    if (this.vaultMasterKey) {
      // Zero out the key in memory for security
      this.vaultMasterKey.fill(0);
      this.vaultMasterKey = null;
    }
    this.currentUserId = null;
    logger.info('[VaultService] Vault locked');
  }

  /**
   * Check vault initialization status
   */
  async getVaultStatus(userId: string): Promise<VaultInitializationStatus> {
    try {
      const hasVaultKeys = await this.keyManager.hasVaultKeys(userId);
      const securityStatus = await this.biometricAccess.getVaultSecurityStatus(userId);
      
      return {
        isInitialized: this.isInitialized,
        hasVaultKeys,
        biometricEnabled: securityStatus.biometricEnabled,
        requiresSetup: !hasVaultKeys,
        securityStatus
      };
    } catch (error) {
      logger.error('[VaultService] Failed to get vault status:', error);
      return {
        isInitialized: false,
        hasVaultKeys: false,
        biometricEnabled: false,
        requiresSetup: true,
        securityStatus: {
          isSetup: false,
          biometricEnabled: false,
          keyRotationEnabled: false,
          lastAccess: 0,
          failedAttempts: 0,
          isLockedOut: false
        }
      };
    }
  }

  /**
   * Ensure vault is unlocked before crypto operations
   */
  private async ensureVaultUnlocked(): Promise<Uint8Array> {
    if (!this.currentUserId) {
      throw new AppError(ErrorCode.UNAUTHENTICATED, 'No user ID set for vault operations');
    }

    if (!this.vaultMasterKey) {
      throw new AppError(ErrorCode.UNAUTHENTICATED, 'Vault is locked. Please unlock vault first.');
    }

    return this.vaultMasterKey;
  }

  /**
   * Generate file encryption key from vault master key
   */
  private generateFileKey(fileId: string): Uint8Array {
    if (!this.vaultMasterKey) {
      throw new AppError(ErrorCode.UNAUTHENTICATED, 'Vault master key not available');
    }
    
    return this.cryptoService.deriveFileKey(this.vaultMasterKey, fileId);
  }

  // Fetch vault items with caching
  async getItems(parentId: string | null = null, forceRefresh = false): Promise<VaultItem[]> {
    const cacheKey = `${VAULT_CACHE_PREFIX}items_${parentId || 'root'}`;

    // Check cache first if not forcing refresh
    if (!forceRefresh) {
      const cached = await this.cacheManager.get<VaultItem[]>(cacheKey);
      if (cached) {
        logger.debug('[VaultService] Returning cached items');
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
      logger.error('[VaultService] Error fetching items:', error);
      
      // If offline, try to get from SQLite
      if (this.syncDb) {
        const offlineItems = await this.getOfflineItems(parentId);
        if (offlineItems.length > 0) {
          logger.debug('[VaultService] Returning offline items');
          return offlineItems;
        }
      }
      
      throw error;
    }
  }

  /**
   * Fetch vault items including shared files
   */
  async getItemsWithShared(parentId: string | null = null, forceRefresh = false): Promise<VaultItem[]> {
    try {
      // Get owned items
      const ownedItems = await this.getItems(parentId, forceRefresh);
      
      // Only include shared items at root level
      if (parentId !== null) {
        return ownedItems;
      }
      
      // Get shared items
      const shares = await this.sharingService.getMyShares('shared-with-me');
      const activeShares = shares.filter(s => s.status === 'active');
      
      // Fetch shared item details
      const sharedItems: VaultItem[] = [];
      for (const share of activeShares) {
        try {
          const itemDoc = await this.db
            .collection('vault')
            .doc(share.fileId)
            .get();
          
          if (itemDoc.exists()) {
            const item = {
              id: itemDoc.id,
              ...itemDoc.data(),
              isShared: true,
              shareId: share.id,
              sharedBy: share.ownerId,
              sharePermissions: share.permissions
            } as VaultItem & { isShared: boolean; shareId: string; sharedBy: string; sharePermissions: SharePermissions };
            
            sharedItems.push(item);
          }
        } catch (error) {
          logger.warn(`[VaultService] Failed to fetch shared item ${share.fileId}:`, error);
        }
      }
      
      // Combine owned and shared items
      const allItems = [...ownedItems, ...sharedItems];
      
      // Sort by type (folders first) then name
      allItems.sort((a, b) => {
        if (a.type !== b.type) {
          return a.type === 'folder' ? -1 : 1;
        }
        return a.name.localeCompare(b.name);
      });
      
      return allItems;
    } catch (error) {
      logger.error('[VaultService] Error fetching items with shared:', error);
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
      logger.error('[VaultService] Error creating folder:', error);
      throw error;
    }
  }

  // Upload file with encryption support
  async uploadFile(
    uri: string,
    fileName: string,
    mimeType: string,
    parentId: string | null = null,
    options: VaultUploadOptions = {}
  ): Promise<VaultItem> {
    try {
      // Ensure vault is unlocked for encryption
      await this.ensureVaultUnlocked();
      
      // Get file info
      const fileInfo = await this.getFileInfo(uri);
      
      // Validate file size
      if (fileInfo.size > MAX_FILE_SIZE) {
        throw new AppError(
          ErrorCode.INVALID_ARGUMENT,
          `File size exceeds maximum allowed size of ${MAX_FILE_SIZE / (1024 * 1024)}MB`
        );
      }

      // Generate unique file ID and upload ID
      const fileId = this.cryptoService.generateSecureFileId();
      const uploadId = `upload_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      
      logger.info(`[VaultService] Starting encrypted upload: ${fileName} (${fileInfo.size} bytes)`);
      
      // Add to upload queue
      this.uploadQueue.set(uploadId, {
        uri,
        fileName,
        mimeType,
        parentId,
        options,
        status: 'encrypting',
        progress: 0,
        startTime: Date.now()
      });

      try {
        // 1. DETERMINE ENCRYPTION METHOD BASED ON FILE SIZE
        const fileKey = this.generateFileKey(fileId);
        let uploadResults: string[];
        let encryptionMetadata: any;
        let encryptedFileMetadata: any;

        if (fileInfo.size > STREAMING_THRESHOLD) {
          // Use streaming for large files
          logger.info(`[VaultService] Using streaming encryption for large file: ${fileName} (${fileInfo.size} bytes)`);
          
          // Create temp encrypted file path
          const tempEncryptedPath = `${FileSystem.cacheDirectory}vault_encrypted_${fileId}.enc`;
          
          // Stream encrypt the file
          const streamResult = await this.streamService.encryptFileStream(
            uri,
            tempEncryptedPath,
            fileKey,
            fileId,
            {
              onProgress: (progress: StreamProgress) => {
                // Map streaming progress to overall upload progress (0-50%)
                const overallProgress = Math.floor(progress.percentage * 0.5);
                if (options.onProgress) options.onProgress(overallProgress);
                
                // Update upload queue
                this.uploadQueue.set(uploadId, {
                  ...this.uploadQueue.get(uploadId),
                  status: 'encrypting',
                  progress: overallProgress,
                  bytesProcessed: progress.bytesProcessed,
                  bytesPerSecond: progress.bytesPerSecond
                });
              }
            }
          );

          if (!streamResult.success || !streamResult.header) {
            throw new Error(streamResult.error || 'Streaming encryption failed');
          }

          // Upload the encrypted file from temp storage
          const encryptedFileInfo = await this.getFileInfo(tempEncryptedPath);
          
          // Generate upload URL for the entire encrypted file
          const uploadUrl = await callFirebaseFunction('generateVaultUploadUrl', {
            fileId: `${fileId}_encrypted`,
            contentType: 'application/octet-stream',
            size: encryptedFileInfo.size
          });

          // Upload the encrypted file
          await this.uploadFileSimple(
            tempEncryptedPath,
            uploadUrl.data.signedUrl,
            'application/octet-stream',
            uploadId,
            (progress) => {
              // Map upload progress to overall progress (50-90%)
              const overallProgress = 50 + Math.floor(progress * 0.4);
              if (options.onProgress) options.onProgress(overallProgress);
            }
          );

          // Clean up temp file
          await FileSystem.deleteAsync(tempEncryptedPath, { idempotent: true });

          uploadResults = [uploadUrl.data.publicUrl];
          encryptionMetadata = {
            streamingMode: true,
            headerBase64: Buffer.from(streamResult.header).toString('base64'),
            encryptedFileUrl: uploadUrl.data.publicUrl,
            encryptedSize: encryptedFileInfo.size,
            version: '2.0' // Version 2.0 indicates streaming encryption
          };
          
          // Create basic metadata for streaming
          encryptedFileMetadata = await this.cryptoService.encryptData(
            JSON.stringify({
              fileName,
              mimeType,
              originalSize: fileInfo.size,
              encryptionTimestamp: Date.now()
            }),
            fileKey
          );

        } else {
          // Use regular encryption for smaller files
          logger.info(`[VaultService] Using standard encryption for file: ${fileName} (${fileInfo.size} bytes)`);
          
          // Report encryption progress
          if (options.onProgress) options.onProgress(10);
          
          const encryptionResult = await this.cryptoService.encryptLargeFile(
            uri,
            fileKey,
            fileName,
            mimeType
          );
          
          // Report encryption complete
          if (options.onProgress) options.onProgress(25);
          
          // Update upload queue
          this.uploadQueue.set(uploadId, {
            ...this.uploadQueue.get(uploadId),
            status: 'uploading',
            progress: 25
          });

          // 2. UPLOAD ENCRYPTED CHUNKS
          const chunkUploadPromises: Promise<string>[] = [];
          
          // Upload header first
          const headerUploadUrl = await callFirebaseFunction('generateVaultUploadUrl', {
            fileId: `${fileId}_header`,
            contentType: 'application/octet-stream',
            size: encryptionResult.header.length
          });
          
          chunkUploadPromises.push(
            this.uploadEncryptedChunk(encryptionResult.header, headerUploadUrl.data.signedUrl)
          );
          
          // Upload encrypted chunks in parallel
          for (let i = 0; i < encryptionResult.encryptedChunks.length; i++) {
            const chunkUploadUrl = await callFirebaseFunction('generateVaultUploadUrl', {
              fileId: `${fileId}_chunk_${i}`,
              contentType: 'application/octet-stream',
              size: encryptionResult.encryptedChunks[i].length
            });
            
            chunkUploadPromises.push(
              this.uploadEncryptedChunk(encryptionResult.encryptedChunks[i], chunkUploadUrl.data.signedUrl)
            );
          }
          
          // Wait for all uploads to complete
          uploadResults = await Promise.all(chunkUploadPromises);
          
          // Report upload complete
          if (options.onProgress) options.onProgress(75);
          
          encryptionMetadata = {
            streamingMode: false,
            headerUrl: uploadResults[0],
            chunkUrls: uploadResults.slice(1),
            chunkCount: encryptionResult.encryptedChunks.length,
            encryptedSize: encryptionResult.totalSize,
            version: '1.0'
          };
          
          encryptedFileMetadata = await this.cryptoService.encryptData(
            JSON.stringify(encryptionResult.metadata),
            fileKey
          );
        }
        
        // 3. CREATE FILE RECORD IN FIRESTORE
        const fileType = this.getFileType(mimeType, fileName);
        const result = await callFirebaseFunction('addEncryptedVaultFile', {
          fileId,
          name: fileName,
          parentId,
          fileType,
          size: fileInfo.size,
          mimeType,
          encryptionMetadata,
          encryptedFileMetadata: {
            encrypted: Buffer.from(encryptedFileMetadata.encrypted).toString('base64'),
            nonce: Buffer.from(encryptedFileMetadata.nonce).toString('base64')
          },
          metadata: {
            uploadedAt: new Date().toISOString(),
            uploadId,
            encryptionVersion: encryptionMetadata.version
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
        
        // Generate search index
        try {
          const searchableMetadata: SearchableMetadata = {
            fileName,
            fileType,
            mimeType,
            // TODO: Add content extraction for documents
          };
          
          await this.searchService.generateSearchableIndex(
            fileId,
            this.currentUserId!,
            searchableMetadata
          );
          logger.info(`[VaultService] Generated search index for: ${fileName}`);
        } catch (error) {
          // Don't fail upload if search indexing fails
          logger.error('[VaultService] Failed to generate search index:', error);
        }

        logger.info(`[VaultService] Encrypted upload completed: ${fileName}`);
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
      logger.error('[VaultService] Encrypted upload error:', error);
      throw normalizeError(error);
    }
  }

  /**
   * Upload encrypted chunk to storage
   */
  private async uploadEncryptedChunk(chunkData: Uint8Array, signedUrl: string): Promise<string> {
    const response = await fetch(signedUrl, {
      method: 'PUT',
      body: chunkData,
      headers: {
        'Content-Type': 'application/octet-stream',
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to upload chunk: ${response.status} ${response.statusText}`);
    }

    return signedUrl.split('?')[0]; // Return the URL without query parameters
  }

  // Download and decrypt file
  async downloadFile(
    item: VaultItem,
    options: VaultDownloadOptions = {}
  ): Promise<string> {
    try {
      // Ensure vault is unlocked for decryption
      await this.ensureVaultUnlocked();
      
      // Check if file is encrypted
      if (!item.isEncrypted || !item.encryptionMetadata) {
        throw new AppError(ErrorCode.INVALID_ARGUMENT, 'File is not encrypted or missing encryption metadata');
      }

      // Check download cache
      const cacheKey = `download_${item.id}`;
      if (!options.saveToDevice && this.downloadCache.has(cacheKey)) {
        return this.downloadCache.get(cacheKey);
      }

      logger.info(`[VaultService] Starting encrypted download: ${item.name} (version: ${item.encryptionMetadata.version || '1.0'})`);
      
      // Report download start
      if (options.onProgress) options.onProgress(5);

      // Check encryption version
      const encryptionVersion = item.encryptionMetadata.version || '1.0';
      
      // Get file key - either from ownership or share
      const fileKey = await this.getFileKeyForAccess(item);
      
      // Determine output path
      const downloadDir = options.saveToDevice ? 
        FileSystem.documentDirectory! : 
        FileSystem.cacheDirectory!;
      const localPath = `${downloadDir}${item.name}`;

      let decryptedPath: string;

      if (encryptionVersion === '2.0' && item.encryptionMetadata.streamingMode) {
        // Handle streaming decryption for large files
        logger.info(`[VaultService] Using streaming decryption for file: ${item.name}`);
        
        const { headerBase64, encryptedFileUrl } = item.encryptionMetadata;
        
        if (!headerBase64 || !encryptedFileUrl) {
          throw new AppError(ErrorCode.INVALID_ARGUMENT, 'Missing streaming encryption header or file URL');
        }

        // Convert base64 header back to Uint8Array
        const header = new Uint8Array(Buffer.from(headerBase64, 'base64'));
        
        // Create temp path for encrypted file download
        const tempEncryptedPath = `${FileSystem.cacheDirectory}vault_encrypted_temp_${item.id}.enc`;
        
        // Download the encrypted file
        logger.info(`[VaultService] Downloading encrypted file...`);
        const downloadProgress = new Map<string, number>();
        
        // Download encrypted file with progress tracking
        await this.downloadFileWithProgress(
          encryptedFileUrl,
          tempEncryptedPath,
          (progress) => {
            // Map download progress to overall progress (5-50%)
            const overallProgress = 5 + Math.floor(progress * 0.45);
            if (options.onProgress) options.onProgress(overallProgress);
            downloadProgress.set('download', progress);
          }
        );
        
        // Report download complete
        if (options.onProgress) options.onProgress(50);
        
        // Stream decrypt the file
        const streamResult = await this.streamService.decryptFileStream(
          tempEncryptedPath,
          localPath,
          fileKey,
          header,
          {
            onProgress: (progress: StreamProgress) => {
              // Map decryption progress to overall progress (50-95%)
              const overallProgress = 50 + Math.floor(progress.percentage * 0.45);
              if (options.onProgress) options.onProgress(overallProgress);
            }
          }
        );
        
        if (!streamResult.success) {
          throw new Error(streamResult.error || 'Streaming decryption failed');
        }
        
        // Clean up temp encrypted file
        await FileSystem.deleteAsync(tempEncryptedPath, { idempotent: true });
        
        decryptedPath = localPath;
        
      } else {
        // Handle standard decryption for smaller files (version 1.0)
        logger.info(`[VaultService] Using standard decryption for file: ${item.name}`);
        
        // 1. DOWNLOAD ENCRYPTED CHUNKS
        const { headerUrl, chunkUrls } = item.encryptionMetadata;
        
        if (!headerUrl || !chunkUrls) {
          throw new AppError(ErrorCode.INVALID_ARGUMENT, 'Missing encryption header or chunk URLs');
        }

        // Download header
        const headerResponse = await fetch(headerUrl);
        if (!headerResponse.ok) {
          throw new Error(`Failed to download header: ${headerResponse.status}`);
        }
        const headerData = new Uint8Array(await headerResponse.arrayBuffer());
        
        // Report header downloaded
        if (options.onProgress) options.onProgress(15);

        // Download all chunks in parallel
        const chunkPromises = chunkUrls.map(async (chunkUrl, index) => {
          const response = await fetch(chunkUrl);
          if (!response.ok) {
            throw new Error(`Failed to download chunk ${index}: ${response.status}`);
          }
          return new Uint8Array(await response.arrayBuffer());
        });
        
        const encryptedChunks = await Promise.all(chunkPromises);
        
        // Report chunks downloaded
        if (options.onProgress) options.onProgress(50);

        // 2. DECRYPT THE FILE
        decryptedPath = await this.cryptoService.decryptLargeFile(
          headerData,
          encryptedChunks,
          fileKey,
          localPath
        );
        
        // Report decryption complete
        if (options.onProgress) options.onProgress(90);
      }

      // 3. VERIFY FILE INTEGRITY (optional)
      if (item.size) {
        const fileInfo = await FileSystem.getInfoAsync(decryptedPath);
        if (fileInfo.exists && 'size' in fileInfo && fileInfo.size !== item.size) {
          logger.warn(`[VaultService] File size mismatch: expected ${item.size}, got ${fileInfo.size}`);
        }
      }

      // Cache result if requested
      if (options.cacheResult && !options.saveToDevice) {
        this.downloadCache.set(cacheKey, decryptedPath);
      }

      // Report complete
      if (options.onProgress) options.onProgress(100);

      logger.info(`[VaultService] Encrypted download completed: ${item.name}`);
      return decryptedPath;
      
    } catch (error) {
      logger.error('[VaultService] Encrypted download error:', error);
      throw normalizeError(error);
    }
  }

  /**
   * Download file for preview (smaller cache, faster access)
   */
  async downloadFileForPreview(item: VaultItem): Promise<string> {
    return this.downloadFile(item, {
      cacheResult: true,
      saveToDevice: false
    });
  }

  // Delete item (soft delete)
  async deleteItem(itemId: string): Promise<void> {
    try {
      await callFirebaseFunction('deleteVaultItem', { itemId });
      
      // Delete search index
      try {
        await this.searchService.deleteSearchIndex(itemId);
        logger.info(`[VaultService] Deleted search index for item: ${itemId}`);
      } catch (error) {
        // Don't fail delete if search index removal fails
        logger.error('[VaultService] Failed to delete search index:', error);
      }
      
      // Clear all caches as we don't know which folder was affected
      await this.clearAllCaches();
    } catch (error) {
      logger.error('[VaultService] Delete error:', error);
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
      logger.error('[VaultService] Restore error:', error);
      throw error;
    }
  }

  // Get deleted items (trash)
  async getDeletedItems(): Promise<VaultItem[]> {
    try {
      const result = await callFirebaseFunction('getDeletedVaultItems', {});
      return result.data.items as VaultItem[];
    } catch (error) {
      logger.error('[VaultService] Error fetching deleted items:', error);
      throw error;
    }
  }

  // Search vault items using encrypted search
  async searchItems(options: VaultSearchOptions = {}): Promise<VaultItem[]> {
    try {
      // Ensure vault is unlocked
      await this.ensureVaultUnlocked();
      
      if (!options.query || options.query.trim().length === 0) {
        // If no query, return recent items or empty array
        return [];
      }
      
      // Convert VaultSearchOptions to SearchOptions
      const searchOptions: SearchOptions = {
        fuzzy: true, // Enable fuzzy search by default
        fileTypes: options.fileTypes,
        sortBy: options.sortBy === 'name' ? 'name' : 
                options.sortBy === 'date' ? 'date' : 'relevance',
        limit: options.limit
      };
      
      // Perform encrypted search
      const searchResults = await this.searchService.searchFiles(
        this.currentUserId!,
        options.query,
        searchOptions
      );
      
      // Convert search results to VaultItems
      const vaultItems: VaultItem[] = [];
      
      for (const result of searchResults) {
        // Fetch the actual vault item using the fileId
        try {
          const itemSnapshot = await this.db
            .collection('vault')
            .doc(result.fileId)
            .get();
          
          if (itemSnapshot.exists()) {
            const item = {
              id: itemSnapshot.id,
              ...itemSnapshot.data()
            } as VaultItem;
            
            vaultItems.push(item);
          }
        } catch (error) {
          logger.warn(`[VaultService] Failed to fetch vault item ${result.fileId}:`, error);
        }
      }
      
      logger.info(`[VaultService] Search returned ${vaultItems.length} results for query: "${options.query}"`);
      return vaultItems;
      
    } catch (error) {
      logger.error('[VaultService] Search error:', error);
      throw error;
    }
  }

  // Get storage info
  async getStorageInfo(): Promise<VaultStorageInfo> {
    try {
      const result = await callFirebaseFunction('getVaultStorageInfo', {});
      return result.data as VaultStorageInfo;
    } catch (error) {
      logger.error('[VaultService] Error getting storage info:', error);
      throw error;
    }
  }

  // Rename item
  async renameItem(itemId: string, newName: string): Promise<void> {
    try {
      await callFirebaseFunction('renameVaultItem', { itemId, newName });
      
      // Update search index with new name
      try {
        // Fetch the item to get other metadata
        const itemSnapshot = await this.db
          .collection('vault')
          .doc(itemId)
          .get();
        
        if (itemSnapshot.exists()) {
          const item = itemSnapshot.data() as VaultItem;
          const searchableMetadata: SearchableMetadata = {
            fileName: newName,
            fileType: item.fileType,
            mimeType: item.mimeType,
          };
          
          await this.searchService.updateSearchIndex(
            itemId,
            this.currentUserId!,
            searchableMetadata
          );
          logger.info(`[VaultService] Updated search index for renamed item: ${newName}`);
        }
      } catch (error) {
        // Don't fail rename if search index update fails
        logger.error('[VaultService] Failed to update search index:', error);
      }
      
      // Clear all caches
      await this.clearAllCaches();
    } catch (error) {
      logger.error('[VaultService] Rename error:', error);
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
      logger.error('[VaultService] Move error:', error);
      throw error;
    }
  }

  // ============== VAULT SHARING METHODS ==============

  /**
   * Share a vault file with family members using end-to-end encryption
   */
  async shareVaultFile(
    itemId: string,
    recipientIds: string[],
    permissions: Partial<SharePermissions> = { read: true },
    options: {
      expiryDays?: number;
      message?: string;
    } = {}
  ): Promise<{ successful: number; failed: number }> {
    try {
      // Ensure vault is unlocked
      await this.ensureVaultUnlocked();
      
      // Fetch the vault item
      const itemDoc = await this.db
        .collection('vault')
        .doc(itemId)
        .get();
      
      if (!itemDoc.exists) {
        throw new AppError(ErrorCode.NOT_FOUND, 'Vault item not found');
      }
      
      const item = itemDoc.data() as VaultItem;
      
      // Verify ownership
      if (item.userId !== this.currentUserId) {
        throw new AppError(ErrorCode.PERMISSION_DENIED, 'You do not own this file');
      }
      
      // Get the file key
      const fileKey = this.generateFileKey(itemId);
      
      let successful = 0;
      let failed = 0;
      
      // Share with each recipient
      for (const recipientId of recipientIds) {
        try {
          await this.sharingService.shareFile(
            itemId,
            fileKey,
            recipientId,
            permissions,
            {
              ...options,
              fileName: item.name,
              fileSize: item.size
            }
          );
          successful++;
        } catch (error) {
          logger.error(`[VaultService] Failed to share with ${recipientId}:`, error);
          failed++;
        }
      }
      
      logger.info(`[VaultService] Shared file ${itemId} with ${successful} users (${failed} failed)`);
      return { successful, failed };
      
    } catch (error) {
      logger.error('[VaultService] Share error:', error);
      throw normalizeError(error);
    }
  }

  /**
   * Accept a shared vault file
   */
  async acceptSharedFile(shareId: string): Promise<ShareAcceptResult> {
    try {
      const result = await this.sharingService.acceptShare(shareId);
      
      if (result.success) {
        // Invalidate cache to show new shared file
        await this.clearAllCaches();
      }
      
      return result;
    } catch (error) {
      logger.error('[VaultService] Accept share error:', error);
      throw normalizeError(error);
    }
  }

  /**
   * Revoke a shared file
   */
  async revokeSharedFile(shareId: string): Promise<void> {
    try {
      await this.sharingService.revokeShare(shareId);
      
      // Invalidate cache
      await this.clearAllCaches();
      
    } catch (error) {
      logger.error('[VaultService] Revoke share error:', error);
      throw normalizeError(error);
    }
  }

  /**
   * Get shared files (shared with me or by me)
   */
  async getSharedFiles(type: 'shared-by-me' | 'shared-with-me' = 'shared-with-me'): Promise<VaultShare[]> {
    try {
      return await this.sharingService.getMyShares(type);
    } catch (error) {
      logger.error('[VaultService] Get shared files error:', error);
      throw normalizeError(error);
    }
  }

  /**
   * Get all shares for a specific file
   */
  async getFileShares(fileId: string): Promise<VaultShare[]> {
    try {
      return await this.sharingService.getFileShares(fileId);
    } catch (error) {
      logger.error('[VaultService] Get file shares error:', error);
      throw normalizeError(error);
    }
  }

  /**
   * Get sharing statistics
   */
  async getSharingStats(): Promise<SharingStats> {
    try {
      return await this.sharingService.getSharingStats();
    } catch (error) {
      logger.error('[VaultService] Get sharing stats error:', error);
      throw normalizeError(error);
    }
  }

  /**
   * Check if current user has access to a file (owned or shared)
   */
  async hasFileAccess(fileId: string, requiredPermission: 'read' | 'write' = 'read'): Promise<boolean> {
    try {
      if (!this.currentUserId) return false;
      
      const permissions = await this.sharingService.checkAccess(fileId, this.currentUserId);
      
      if (!permissions) return false;
      
      if (requiredPermission === 'read') {
        return permissions.read;
      } else {
        return permissions.write;
      }
    } catch (error) {
      logger.error('[VaultService] Check file access error:', error);
      return false;
    }
  }

  // Private helper methods

  /**
   * Get file key for access - either from ownership or share
   */
  private async getFileKeyForAccess(item: VaultItem): Promise<Uint8Array> {
    if (!this.currentUserId) {
      throw new AppError(ErrorCode.UNAUTHENTICATED, 'No user ID set');
    }

    // Check if user owns the file
    if (item.userId === this.currentUserId) {
      return this.generateFileKey(item.id);
    }

    // Otherwise, check for active shares
    const shares = await this.sharingService.getMyShares('shared-with-me');
    const share = shares.find(s => 
      s.fileId === item.id && 
      s.status === 'active' &&
      s.recipientId === this.currentUserId
    );

    if (!share) {
      throw new AppError(ErrorCode.PERMISSION_DENIED, 'You do not have access to this file');
    }

    // The share should have already been accepted and the file key should be
    // available. However, we need to decrypt it again from the share
    const acceptResult = await this.sharingService.acceptShare(share.id);
    if (!acceptResult.success || !acceptResult.fileKey) {
      throw new AppError(ErrorCode.PERMISSION_DENIED, 'Failed to access shared file key');
    }

    return acceptResult.fileKey;
  }

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
    logger.debug('[VaultService] Chunked upload not implemented yet, using simple upload');
    return this.uploadFileSimple(uri, signedUrl, 'application/octet-stream', uploadId, onProgress);
  }

  /**
   * Download file with progress tracking
   */
  private async downloadFileWithProgress(
    url: string,
    outputPath: string,
    onProgress?: (progress: number) => void
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      
      xhr.addEventListener('progress', (event) => {
        if (event.lengthComputable && onProgress) {
          const progress = Math.round((event.loaded / event.total) * 100);
          onProgress(progress);
        }
      });

      xhr.onload = async () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          try {
            // Save the response to file
            const arrayBuffer = xhr.response as ArrayBuffer;
            const base64 = btoa(
              new Uint8Array(arrayBuffer)
                .reduce((data, byte) => data + String.fromCharCode(byte), '')
            );
            
            await FileSystem.writeAsStringAsync(outputPath, base64, {
              encoding: FileSystem.EncodingType.Base64
            });
            
            resolve();
          } catch (error) {
            reject(new Error(`Failed to save downloaded file: ${error}`));
          }
        } else {
          reject(new Error(`Download failed with status: ${xhr.status}`));
        }
      };

      xhr.onerror = () => reject(new Error('Network request failed'));
      xhr.ontimeout = () => reject(new Error('Download timed out'));

      xhr.open('GET', url);
      xhr.responseType = 'arraybuffer';
      xhr.timeout = 300000; // 5 minutes timeout for large files
      xhr.send();
    });
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
      
      logger.debug(`[VaultService] Retrieved ${items.length} offline items`);
      return items;
    } catch (error) {
      logger.error('[VaultService] Error getting offline items:', error);
      return [];
    }
  }

  private async processOfflineQueue(): Promise<void> {
    if (!this.syncDb) return;
    
    logger.debug('[VaultService] Processing offline queue...');
    
    try {
      // Get pending operations from queue
      const results = await this.syncDb.executeSql(
        'SELECT * FROM sync_queue WHERE status = ? AND entity_type = ? ORDER BY created_at ASC LIMIT 10',
        ['pending', 'vault']
      );
      
      if (results[0].rows.length === 0) {
        logger.debug('[VaultService] No pending operations in offline queue');
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
          await this.syncDb.executeSql(
            'UPDATE sync_queue SET status = ?, synced_at = ? WHERE id = ?',
            ['completed', new Date().toISOString(), operation.id]
          );
          
        } catch (error) {
          logger.error(`[VaultService] Failed to process operation ${operation.id}:`, error);
          
          // Update retry count
          const retryCount = (operation.retry_count || 0) + 1;
          if (retryCount >= MAX_RETRY_ATTEMPTS) {
            await this.syncDb.executeSql(
              'UPDATE sync_queue SET status = ?, error_message = ? WHERE id = ?',
              ['failed', normalizeError(error).message, operation.id]
            );
          } else {
            await this.syncDb.executeSql(
              'UPDATE sync_queue SET retry_count = ? WHERE id = ?',
              [retryCount, operation.id]
            );
          }
        }
      }
    } catch (error) {
      logger.error('[VaultService] Error processing offline queue:', error);
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
      logger.error('[VaultService] Cache cleanup error:', error);
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
      logger.error('[VaultService] Error clearing caches:', error);
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
    for (const [id, upload] of Array.from(this.uploadQueue.entries())) {
      if (upload.status === 'completed' && Date.now() - upload.completedAt > 60000) {
        this.uploadQueue.delete(id);
      }
    }
  }

  // Retry failed upload
  async retryUpload(uploadId: string): Promise<void> {
    const upload = this.uploadQueue.get(uploadId);
    if (!upload || upload.status !== 'failed') {
      throw new AppError(ErrorCode.INVALID_ARGUMENT, 'Upload not found or not in failed state');
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

  // Get search statistics
  async getSearchStats(): Promise<{
    totalIndexedFiles: number;
    indexSize: number;
    lastUpdated: Date | null;
  }> {
    if (!this.currentUserId) {
      throw new Error('No user ID set for search stats');
    }
    
    return this.searchService.getSearchStats(this.currentUserId);
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
        logger.error(`[VaultService] Failed to delete item ${itemId}:`, error);
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
        logger.error(`[VaultService] Failed to move item ${itemId}:`, error);
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
        // Get the file key
        const fileKey = this.generateFileKey(itemId);
        
        // Share with each user
        for (const userId of userIds) {
          await this.sharingService.shareFile(itemId, fileKey, userId, { read: true, write: permissions === 'write', reshare: false });
        }
        success++;
      } catch (error) {
        logger.error(`[VaultService] Failed to share item ${itemId}:`, error);
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
          logger.error(`[VaultService] Failed to download item ${item.id}:`, error);
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