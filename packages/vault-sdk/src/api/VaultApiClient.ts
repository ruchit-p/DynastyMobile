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
function validateResponse<T>(data: unknown, schema: z.ZodSchema<T>, _operation: string): T {
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
  createFolder(data: CreateVaultFolderRequest, options?: ApiCallOptions): Promise<VaultItem> {
    return createFunctionCaller<CreateVaultFolderRequest, VaultItem>(
      this.functions,
      'createVaultFolder',
      undefined,
      false
    )(data, options);
  }

  // ============================
  // FILE OPERATIONS
  // ============================

  /**
   * Registers a file after upload to storage
   */
  addFile(data: AddVaultFileRequest, options?: ApiCallOptions): Promise<VaultItem> {
    return createFunctionCaller<AddVaultFileRequest, VaultItem>(
      this.functions,
      'addVaultFile',
      undefined,
      false
    )(data, options);
  }

  /**
   * Gets signed URL for file upload
   */
  getUploadSignedUrl(data: GetVaultUploadSignedUrlRequest, options?: ApiCallOptions): Promise<GetVaultUploadSignedUrlResponse> {
    return createFunctionCaller<GetVaultUploadSignedUrlRequest, GetVaultUploadSignedUrlResponse>(
      this.functions,
      'getVaultUploadSignedUrl',
      undefined,
      false
    )(data, options);
  }

  /**
   * Gets signed URL for file download
   */
  getDownloadUrl(data: GetVaultDownloadUrlRequest, options?: ApiCallOptions): Promise<GetVaultDownloadUrlResponse> {
    return createFunctionCaller<GetVaultDownloadUrlRequest, GetVaultDownloadUrlResponse>(
      this.functions,
      'getVaultDownloadUrl',
      undefined,
      false
    )(data, options);
  }

  /**
   * Updates file content
   */
  updateFile(data: { itemId: string; fileData: string; fileName: string }, options?: ApiCallOptions): Promise<VaultItem> {
    return createFunctionCaller<{ itemId: string; fileData: string; fileName: string }, VaultItem>(
      this.functions,
      'updateVaultFile',
      undefined,
      false
    )(data, options);
  }

  /**
   * Completes multipart file upload
   */
  completeFileUpload(data: { uploadId: string; itemId: string; parts: any[] }, options?: ApiCallOptions): Promise<VaultItem> {
    return createFunctionCaller<{ uploadId: string; itemId: string; parts: any[] }, VaultItem>(
      this.functions,
      'completeVaultFileUpload',
      undefined,
      false
    )(data, options);
  }

  // ============================
  // VAULT BROWSING
  // ============================

  /**
   * Lists vault items in a folder
   */
  getItems(data: GetVaultItemsRequest, options?: ApiCallOptions): Promise<GetVaultItemsResponse> {
    return createFunctionCaller<GetVaultItemsRequest, GetVaultItemsResponse>(
      this.functions,
      'getVaultItems',
      undefined,
      false
    )(data, options);
  }

  /**
   * Gets deleted vault items (trash)
   */
  getDeletedItems(data: {} = {}, options?: ApiCallOptions): Promise<VaultItems> {
    return createFunctionCaller<{}, VaultItems>(
      this.functions,
      'getDeletedVaultItems',
      undefined,
      false
    )(data, options);
  }

  /**
   * Searches vault items
   */
  searchItems(data: SearchVaultItemsRequest, options?: ApiCallOptions): Promise<VaultItems> {
    return createFunctionCaller<SearchVaultItemsRequest, VaultItems>(
      this.functions,
      'searchVaultItems',
      undefined,
      false
    )(data, options);
  }

  // ============================
  // ITEM MANAGEMENT
  // ============================

  /**
   * Renames a vault item
   */
  renameItem(data: RenameVaultItemRequest, options?: ApiCallOptions): Promise<VaultItem> {
    return createFunctionCaller<RenameVaultItemRequest, VaultItem>(
      this.functions,
      'renameVaultItem',
      undefined,
      false
    )(data, options);
  }

  /**
   * Moves a vault item to a different folder
   */
  moveItem(data: MoveVaultItemRequest, options?: ApiCallOptions): Promise<VaultItem> {
    return createFunctionCaller<MoveVaultItemRequest, VaultItem>(
      this.functions,
      'moveVaultItem',
      undefined,
      false
    )(data, options);
  }

  /**
   * Deletes a vault item (soft delete by default)
   */
  deleteItem(data: DeleteVaultItemRequest, options?: ApiCallOptions): Promise<{ success: boolean }> {
    return createFunctionCaller<DeleteVaultItemRequest, { success: boolean }>(
      this.functions,
      'deleteVaultItem',
      z.object({ success: z.boolean() }),
      false
    )(data, options);
  }

  /**
   * Restores a deleted vault item from trash
   */
  restoreItem(data: { itemId: string }, options?: ApiCallOptions): Promise<VaultItem> {
    return createFunctionCaller<{ itemId: string }, VaultItem>(
      this.functions,
      'restoreVaultItem',
      undefined,
      false
    )(data, options);
  }

  /**
   * Permanently deletes vault items
   */
  permanentlyDeleteItems(data: { itemIds?: string[]; deleteAll?: boolean; confirmDelete: boolean }, options?: ApiCallOptions): Promise<{ success: boolean }> {
    return createFunctionCaller<{ itemIds?: string[]; deleteAll?: boolean; confirmDelete: boolean }, { success: boolean }>(
      this.functions,
      'permanentlyDeleteVaultItems',
      z.object({ success: z.boolean() }),
      false
    )(data, options);
  }

  // ============================
  // SHARING & PERMISSIONS
  // ============================

  /**
   * Shares a vault item with other users
   */
  shareItem(data: ShareVaultItemRequest, options?: ApiCallOptions): Promise<{ success: boolean }> {
    return createFunctionCaller<ShareVaultItemRequest, { success: boolean }>(
      this.functions,
      'shareVaultItem',
      z.object({ success: z.boolean() }),
      false
    )(data, options);
  }

  /**
   * Updates permissions for a shared vault item
   */
  updateItemPermissions(data: UpdateVaultItemPermissionsRequest, options?: ApiCallOptions): Promise<{ success: boolean }> {
    return createFunctionCaller<UpdateVaultItemPermissionsRequest, { success: boolean }>(
      this.functions,
      'updateVaultItemPermissions',
      z.object({ success: z.boolean() }),
      false
    )(data, options);
  }

  /**
   * Revokes access to a shared vault item
   */
  revokeItemAccess(data: { itemId: string; userId: string }, options?: ApiCallOptions): Promise<{ success: boolean }> {
    return createFunctionCaller<{ itemId: string; userId: string }, { success: boolean }>(
      this.functions,
      'revokeVaultItemAccess',
      z.object({ success: z.boolean() }),
      false
    )(data, options);
  }

  /**
   * Creates a public share link for a vault item
   */
  createShareLink(data: CreateVaultShareLinkRequest, options?: ApiCallOptions): Promise<VaultShareLink> {
    return createFunctionCaller<CreateVaultShareLinkRequest, VaultShareLink>(
      this.functions,
      'createVaultShareLink',
      undefined,
      false
    )(data, options);
  }

  /**
   * Accesses a vault item via share link
   */
  accessShareLink(data: { shareId: string; password?: string }, options?: ApiCallOptions): Promise<VaultItem> {
    return createFunctionCaller<{ shareId: string; password?: string }, VaultItem>(
      this.functions,
      'accessVaultShareLink',
      undefined,
      false
    )(data, options);
  }

  // ============================
  // ENCRYPTION
  // ============================

  /**
   * Gets vault encryption status
   */
  getEncryptionStatus(data: {} = {}, options?: ApiCallOptions): Promise<VaultEncryptionStatus> {
    return createFunctionCaller<{}, VaultEncryptionStatus>(
      this.functions,
      'getVaultEncryptionStatus',
      undefined,
      false
    )(data, options);
  }

  /**
   * Stores encryption metadata for a vault item
   */
  storeEncryptionMetadata(data: { itemId: string; encryptionMetadata: any }, options?: ApiCallOptions): Promise<{ success: boolean }> {
    return createFunctionCaller<{ itemId: string; encryptionMetadata: any }, { success: boolean }>(
      this.functions,
      'storeVaultItemEncryptionMetadata',
      z.object({ success: z.boolean() }),
      false
    )(data, options);
  }

  /**
   * Gets encryption metadata for a vault item
   */
  getEncryptionMetadata(data: { itemId: string }, options?: ApiCallOptions): Promise<any> {
    return createFunctionCaller<{ itemId: string }, any>(
      this.functions,
      'getVaultItemEncryptionMetadata',
      z.any(),
      false
    )(data, options);
  }

  /**
   * Rotates encryption key
   */
  rotateEncryptionKey(data: { keyType: string; oldKeyId: string; newKeyId: string; encryptedKey: string; metadata?: any }, options?: ApiCallOptions): Promise<{ success: boolean }> {
    return createFunctionCaller<{ keyType: string; oldKeyId: string; newKeyId: string; encryptedKey: string; metadata?: any }, { success: boolean }>(
      this.functions,
      'rotateEncryptionKey',
      z.object({ success: z.boolean() }),
      false
    )(data, options);
  }

  // ============================
  // VAULT INFO & STATS
  // ============================

  /**
   * Gets vault storage information
   */
  getStorageInfo(data: {} = {}, options?: ApiCallOptions): Promise<VaultStorageInfo> {
    return createFunctionCaller<{}, VaultStorageInfo>(
      this.functions,
      'getVaultStorageInfo',
      undefined,
      false
    )(data, options);
  }

  /**
   * Gets vault audit logs
   */
  getAuditLogs(data: { startDate?: string; endDate?: string; action?: string; itemId?: string; limit?: number }, options?: ApiCallOptions): Promise<any[]> {
    return createFunctionCaller<{ startDate?: string; endDate?: string; action?: string; itemId?: string; limit?: number }, any[]>(
      this.functions,
      'getVaultAuditLogs',
      z.array(z.any()),
      false
    )(data, options);
  }

  /**
   * Cleans up deleted vault items
   */
  cleanupDeletedItems(data: { olderThanDays?: number }, options?: ApiCallOptions): Promise<{ deletedCount: number }> {
    return createFunctionCaller<{ olderThanDays?: number }, { deletedCount: number }>(
      this.functions,
      'cleanupDeletedVaultItems',
      z.object({ deletedCount: z.number() }),
      false
    )(data, options);
  }

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