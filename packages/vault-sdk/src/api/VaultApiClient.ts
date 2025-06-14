import { 
  getFunctions, 
  httpsCallable, 
  type Functions 
} from 'firebase/functions';
import { type FirebaseApp } from 'firebase/app';
import { z } from 'zod';

import {
  // Request/Response types
  CreateVaultFolderRequest,
  AddVaultFileRequest,
  GetVaultItemsRequest,
  GetVaultItemsResponse,
  RenameVaultItemRequest,
  MoveVaultItemRequest,
  DeleteVaultItemRequest,
  ShareVaultItemRequest,
  UpdateVaultItemPermissionsRequest,
  CreateVaultShareLinkRequest,
  GetVaultUploadSignedUrlRequest,
  GetVaultUploadSignedUrlResponse,
  GetVaultDownloadUrlRequest,
  GetVaultDownloadUrlResponse,
  SearchVaultItemsRequest,
  VaultStorageInfo,
  VaultEncryptionStatus,
  VaultItem,
  VaultItems,
  VaultShareLink,
  
  // Schemas for validation
  GetVaultItemsResponseSchema,
  GetVaultUploadSignedUrlResponseSchema,
  GetVaultDownloadUrlResponseSchema,
  VaultItemSchema,
  VaultItemsSchema,
  VaultShareLinkSchema,
  VaultStorageInfoSchema,
  VaultEncryptionStatusSchema,
} from '../types/Vault';

import { 
  withVaultErrorHandling, 
  withRetry, 
  normalizeVaultError 
} from '../utils/errors';

/**
 * Configuration for the Vault API client
 */
export interface VaultApiClientConfig {
  app: FirebaseApp;
  region?: string;
  timeout?: number;
  maxRetries?: number;
  enableValidation?: boolean;
}

/**
 * Options for individual API calls
 */
export interface ApiCallOptions {
  timeout?: number;
  retries?: number;
  skipValidation?: boolean;
}

/**
 * Validates response data against a Zod schema
 */
function validateResponse<T>(data: unknown, schema: z.ZodSchema<T>, operation: string): T {
  try {
    return schema.parse(data);
  } catch (error) {
    throw normalizeVaultError(error);
  }
}

/**
 * Creates a typed Firebase function caller with error handling and validation
 */
function createFunctionCaller<TRequest, TResponse>(
  functions: Functions,
  functionName: string,
  responseSchema?: z.ZodSchema<TResponse>,
  enableValidation: boolean = true
) {
  const callable = httpsCallable(functions, functionName);
  
  return withVaultErrorHandling(
    async (data: TRequest, options?: ApiCallOptions): Promise<TResponse> => {
      const operation = async () => {
        const result = await callable(data);
        const responseData = result.data as TResponse;
        
        // Validate response if schema provided and validation enabled
        if (responseSchema && enableValidation && !options?.skipValidation) {
          return validateResponse(responseData, responseSchema, functionName);
        }
        
        return responseData;
      };
      
      // Apply retry logic if specified
      if (options?.retries !== undefined && options.retries > 0) {
        return withRetry(operation, options.retries);
      }
      
      return operation();
    },
    functionName
  );
}

/**
 * Main Vault API client for interacting with Firebase Functions
 */
export class VaultApiClient {
  private functions: Functions;
  private config: VaultApiClientConfig;

  constructor(config: VaultApiClientConfig) {
    this.config = {
      region: 'us-central1',
      timeout: 30000,
      maxRetries: 3,
      enableValidation: true,
      ...config,
    };
    
    this.functions = getFunctions(config.app, this.config.region);
  }

  // ============================
  // FOLDER OPERATIONS
  // ============================

  /**
   * Creates a new folder in the vault
   */
  createFolder = createFunctionCaller<CreateVaultFolderRequest, VaultItem>(
    this.functions,
    'createVaultFolder',
    VaultItemSchema,
    this.config.enableValidation
  );

  // ============================
  // FILE OPERATIONS
  // ============================

  /**
   * Registers a file after upload to storage
   */
  addFile = createFunctionCaller<AddVaultFileRequest, VaultItem>(
    this.functions,
    'addVaultFile',
    VaultItemSchema,
    this.config.enableValidation
  );

  /**
   * Gets signed URL for file upload
   */
  getUploadSignedUrl = createFunctionCaller<GetVaultUploadSignedUrlRequest, GetVaultUploadSignedUrlResponse>(
    this.functions,
    'getVaultUploadSignedUrl',
    GetVaultUploadSignedUrlResponseSchema,
    this.config.enableValidation
  );

  /**
   * Gets signed URL for file download
   */
  getDownloadUrl = createFunctionCaller<GetVaultDownloadUrlRequest, GetVaultDownloadUrlResponse>(
    this.functions,
    'getVaultDownloadUrl',
    GetVaultDownloadUrlResponseSchema,
    this.config.enableValidation
  );

  /**
   * Updates file content
   */
  updateFile = createFunctionCaller<{ itemId: string; fileData: string; fileName: string }, VaultItem>(
    this.functions,
    'updateVaultFile',
    VaultItemSchema,
    this.config.enableValidation
  );

  /**
   * Completes multipart file upload
   */
  completeFileUpload = createFunctionCaller<{ uploadId: string; itemId: string; parts: any[] }, VaultItem>(
    this.functions,
    'completeVaultFileUpload',
    VaultItemSchema,
    this.config.enableValidation
  );

  // ============================
  // VAULT BROWSING
  // ============================

  /**
   * Lists vault items in a folder
   */
  getItems = createFunctionCaller<GetVaultItemsRequest, GetVaultItemsResponse>(
    this.functions,
    'getVaultItems',
    GetVaultItemsResponseSchema,
    this.config.enableValidation
  );

  /**
   * Gets deleted vault items (trash)
   */
  getDeletedItems = createFunctionCaller<{}, VaultItems>(
    this.functions,
    'getDeletedVaultItems',
    VaultItemsSchema,
    this.config.enableValidation
  );

  /**
   * Searches vault items
   */
  searchItems = createFunctionCaller<SearchVaultItemsRequest, VaultItems>(
    this.functions,
    'searchVaultItems',
    VaultItemsSchema,
    this.config.enableValidation
  );

  // ============================
  // ITEM MANAGEMENT
  // ============================

  /**
   * Renames a vault item
   */
  renameItem = createFunctionCaller<RenameVaultItemRequest, VaultItem>(
    this.functions,
    'renameVaultItem',
    VaultItemSchema,
    this.config.enableValidation
  );

  /**
   * Moves a vault item to a different folder
   */
  moveItem = createFunctionCaller<MoveVaultItemRequest, VaultItem>(
    this.functions,
    'moveVaultItem',
    VaultItemSchema,
    this.config.enableValidation
  );

  /**
   * Deletes a vault item (soft delete by default)
   */
  deleteItem = createFunctionCaller<DeleteVaultItemRequest, { success: boolean }>(
    this.functions,
    'deleteVaultItem',
    z.object({ success: z.boolean() }),
    this.config.enableValidation
  );

  /**
   * Restores a deleted vault item from trash
   */
  restoreItem = createFunctionCaller<{ itemId: string }, VaultItem>(
    this.functions,
    'restoreVaultItem',
    VaultItemSchema,
    this.config.enableValidation
  );

  /**
   * Permanently deletes vault items
   */
  permanentlyDeleteItems = createFunctionCaller<{ itemIds?: string[]; deleteAll?: boolean; confirmDelete: boolean }, { success: boolean }>(
    this.functions,
    'permanentlyDeleteVaultItems',
    z.object({ success: z.boolean() }),
    this.config.enableValidation
  );

  // ============================
  // SHARING & PERMISSIONS
  // ============================

  /**
   * Shares a vault item with other users
   */
  shareItem = createFunctionCaller<ShareVaultItemRequest, { success: boolean }>(
    this.functions,
    'shareVaultItem',
    z.object({ success: z.boolean() }),
    this.config.enableValidation
  );

  /**
   * Updates permissions for a shared vault item
   */
  updateItemPermissions = createFunctionCaller<UpdateVaultItemPermissionsRequest, { success: boolean }>(
    this.functions,
    'updateVaultItemPermissions',
    z.object({ success: z.boolean() }),
    this.config.enableValidation
  );

  /**
   * Revokes access to a shared vault item
   */
  revokeItemAccess = createFunctionCaller<{ itemId: string; userId: string }, { success: boolean }>(
    this.functions,
    'revokeVaultItemAccess',
    z.object({ success: z.boolean() }),
    this.config.enableValidation
  );

  /**
   * Creates a public share link for a vault item
   */
  createShareLink = createFunctionCaller<CreateVaultShareLinkRequest, VaultShareLink>(
    this.functions,
    'createVaultShareLink',
    VaultShareLinkSchema,
    this.config.enableValidation
  );

  /**
   * Accesses a vault item via share link
   */
  accessShareLink = createFunctionCaller<{ shareId: string; password?: string }, VaultItem>(
    this.functions,
    'accessVaultShareLink',
    VaultItemSchema,
    this.config.enableValidation
  );

  // ============================
  // ENCRYPTION
  // ============================

  /**
   * Gets vault encryption status
   */
  getEncryptionStatus = createFunctionCaller<{}, VaultEncryptionStatus>(
    this.functions,
    'getVaultEncryptionStatus',
    VaultEncryptionStatusSchema,
    this.config.enableValidation
  );

  /**
   * Stores encryption metadata for a vault item
   */
  storeEncryptionMetadata = createFunctionCaller<{ itemId: string; encryptionMetadata: any }, { success: boolean }>(
    this.functions,
    'storeVaultItemEncryptionMetadata',
    z.object({ success: z.boolean() }),
    this.config.enableValidation
  );

  /**
   * Gets encryption metadata for a vault item
   */
  getEncryptionMetadata = createFunctionCaller<{ itemId: string }, any>(
    this.functions,
    'getVaultItemEncryptionMetadata',
    z.any(),
    this.config.enableValidation
  );

  /**
   * Rotates encryption key
   */
  rotateEncryptionKey = createFunctionCaller<{ keyType: string; oldKeyId: string; newKeyId: string; encryptedKey: string; metadata?: any }, { success: boolean }>(
    this.functions,
    'rotateEncryptionKey',
    z.object({ success: z.boolean() }),
    this.config.enableValidation
  );

  // ============================
  // VAULT INFO & STATS
  // ============================

  /**
   * Gets vault storage information
   */
  getStorageInfo = createFunctionCaller<{}, VaultStorageInfo>(
    this.functions,
    'getVaultStorageInfo',
    VaultStorageInfoSchema,
    this.config.enableValidation
  );

  /**
   * Gets vault audit logs
   */
  getAuditLogs = createFunctionCaller<{ startDate?: string; endDate?: string; action?: string; itemId?: string; limit?: number }, any[]>(
    this.functions,
    'getVaultAuditLogs',
    z.array(z.any()),
    this.config.enableValidation
  );

  /**
   * Cleans up deleted vault items
   */
  cleanupDeletedItems = createFunctionCaller<{ olderThanDays?: number }, { deletedCount: number }>(
    this.functions,
    'cleanupDeletedVaultItems',
    z.object({ deletedCount: z.number() }),
    this.config.enableValidation
  );

  // ============================
  // UTILITY METHODS
  // ============================

  /**
   * Updates the client configuration
   */
  updateConfig(newConfig: Partial<VaultApiClientConfig>): void {
    this.config = { ...this.config, ...newConfig };
    
    if (newConfig.app || newConfig.region) {
      this.functions = getFunctions(
        newConfig.app || this.config.app,
        newConfig.region || this.config.region
      );
    }
  }

  /**
   * Gets current configuration
   */
  getConfig(): VaultApiClientConfig {
    return { ...this.config };
  }
}

/**
 * Factory function to create a VaultApiClient instance
 */
export function createVaultApiClient(config: VaultApiClientConfig): VaultApiClient {
  return new VaultApiClient(config);
}