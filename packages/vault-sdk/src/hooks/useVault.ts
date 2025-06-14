import { useQuery, useMutation, useQueryClient, type UseQueryOptions, type UseMutationOptions } from '@tanstack/react-query';
import { type FirebaseApp } from 'firebase/app';

import {
  VaultApiClient,
  createVaultApiClient,
  type VaultApiClientConfig,
} from '../api/VaultApiClient';
import {
  type VaultItem,
  type VaultItems,
  type GetVaultItemsRequest,
  type GetVaultItemsResponse,
  type CreateVaultFolderRequest,
  type AddVaultFileRequest,
  type RenameVaultItemRequest,
  type MoveVaultItemRequest,
  type DeleteVaultItemRequest,
  type SearchVaultItemsRequest,
  VaultError,
} from '../types/Vault';
import { withVaultErrorHandling, isVaultError } from '../utils/errors';

// Query keys for React Query
export const vaultQueryKeys = {
  all: ['vault'] as const,
  items: (parentId?: string) => ['vault', 'items', parentId] as const,
  item: (itemId: string) => ['vault', 'item', itemId] as const,
  search: (query: string, parentId?: string) => ['vault', 'search', query, parentId] as const,
  deletedItems: () => ['vault', 'deleted'] as const,
  storageInfo: () => ['vault', 'storage'] as const,
  encryptionStatus: () => ['vault', 'encryption'] as const,
} as const;

/**
 * Configuration for the useVault hook
 */
export interface UseVaultConfig {
  firebaseApp: FirebaseApp;
  region?: string;
  timeout?: number;
  maxRetries?: number;
  enableValidation?: boolean;
}

/**
 * Options for vault mutations
 */
export interface VaultMutationOptions<TData = unknown, TError = VaultError, TVariables = unknown> 
  extends Omit<UseMutationOptions<TData, TError, TVariables>, 'mutationFn'> {
  // Custom options can be added here
}

/**
 * Options for vault queries  
 */
export interface VaultQueryOptions<TData = unknown, TError = VaultError>
  extends Omit<UseQueryOptions<TData, TError>, 'queryKey' | 'queryFn'> {
  // Custom options can be added here
}

/**
 * Error handler interface that can be injected from host applications
 */
export interface VaultErrorHandler {
  handleError: (error: VaultError, context?: string) => void;
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  title?: string;
}

/**
 * Main hook for vault operations with React Query integration
 */
export function useVault(config: UseVaultConfig, errorHandler?: VaultErrorHandler) {
  const queryClient = useQueryClient();
  
  // Create API client instance
  const apiClient = createVaultApiClient({
    app: config.firebaseApp,
    region: config.region,
    timeout: config.timeout,
    maxRetries: config.maxRetries,
    enableValidation: config.enableValidation,
  });

  // Error handling wrapper
  const handleError = (error: unknown, context: string = 'Unknown operation') => {
    const vaultError = isVaultError(error) ? error : new Error('Unknown error') as VaultError;
    
    if (errorHandler?.handleError) {
      errorHandler.handleError(vaultError, context);
    } else {
      // Default error handling - just log to console
      console.error(`[Vault ${context}]:`, vaultError);
    }
  };

  // ============================
  // QUERIES
  // ============================

  /**
   * Gets vault items for a specific folder
   */
  const useVaultItems = (
    request: GetVaultItemsRequest = {},
    options?: VaultQueryOptions<GetVaultItemsResponse>
  ) => {
    return useQuery({
      queryKey: vaultQueryKeys.items(request.parentId),
      queryFn: withVaultErrorHandling(
        () => apiClient.getItems(request),
        'getVaultItems'
      ),
      staleTime: 5 * 60 * 1000, // 5 minutes
      gcTime: 10 * 60 * 1000, // 10 minutes
      ...options,
      onError: (error) => {
        handleError(error, 'Get vault items');
        options?.onError?.(error);
      },
    });
  };

  /**
   * Gets deleted vault items (trash)
   */
  const useDeletedVaultItems = (options?: VaultQueryOptions<VaultItems>) => {
    return useQuery({
      queryKey: vaultQueryKeys.deletedItems(),
      queryFn: withVaultErrorHandling(
        () => apiClient.getDeletedItems({}),
        'getDeletedVaultItems'
      ),
      staleTime: 2 * 60 * 1000, // 2 minutes
      gcTime: 5 * 60 * 1000, // 5 minutes
      ...options,
      onError: (error) => {
        handleError(error, 'Get deleted vault items');
        options?.onError?.(error);
      },
    });
  };

  /**
   * Searches vault items
   */
  const useVaultSearch = (
    request: SearchVaultItemsRequest,
    options?: VaultQueryOptions<VaultItems>
  ) => {
    return useQuery({
      queryKey: vaultQueryKeys.search(request.query || '', request.parentId),
      queryFn: withVaultErrorHandling(
        () => apiClient.searchItems(request),
        'searchVaultItems'
      ),
      enabled: !!request.query && request.query.length > 0,
      staleTime: 30 * 1000, // 30 seconds
      gcTime: 2 * 60 * 1000, // 2 minutes
      ...options,
      onError: (error) => {
        handleError(error, 'Search vault items');
        options?.onError?.(error);
      },
    });
  };

  /**
   * Gets vault storage information
   */
  const useVaultStorageInfo = (options?: VaultQueryOptions) => {
    return useQuery({
      queryKey: vaultQueryKeys.storageInfo(),
      queryFn: withVaultErrorHandling(
        () => apiClient.getStorageInfo({}),
        'getVaultStorageInfo'
      ),
      staleTime: 10 * 60 * 1000, // 10 minutes
      gcTime: 30 * 60 * 1000, // 30 minutes
      ...options,
      onError: (error) => {
        handleError(error, 'Get vault storage info');
        options?.onError?.(error);
      },
    });
  };

  /**
   * Gets vault encryption status
   */
  const useVaultEncryptionStatus = (options?: VaultQueryOptions) => {
    return useQuery({
      queryKey: vaultQueryKeys.encryptionStatus(),
      queryFn: withVaultErrorHandling(
        () => apiClient.getEncryptionStatus({}),
        'getVaultEncryptionStatus'
      ),
      staleTime: 5 * 60 * 1000, // 5 minutes
      gcTime: 15 * 60 * 1000, // 15 minutes
      ...options,
      onError: (error) => {
        handleError(error, 'Get vault encryption status');
        options?.onError?.(error);
      },
    });
  };

  // ============================
  // MUTATIONS
  // ============================

  /**
   * Creates a new folder
   */
  const useCreateFolder = (options?: VaultMutationOptions<VaultItem, VaultError, CreateVaultFolderRequest>) => {
    return useMutation({
      mutationFn: withVaultErrorHandling(
        (request: CreateVaultFolderRequest) => apiClient.createFolder(request),
        'createVaultFolder'
      ),
      onSuccess: (data, variables) => {
        // Invalidate and refetch items list
        queryClient.invalidateQueries({ queryKey: vaultQueryKeys.items(variables.parentFolderId) });
        queryClient.invalidateQueries({ queryKey: vaultQueryKeys.storageInfo() });
        
        options?.onSuccess?.(data, variables, undefined);
      },
      onError: (error, variables) => {
        handleError(error, 'Create folder');
        options?.onError?.(error, variables, undefined);
      },
      ...options,
    });
  };

  /**
   * Adds a file to the vault
   */
  const useAddFile = (options?: VaultMutationOptions<VaultItem, VaultError, AddVaultFileRequest>) => {
    return useMutation({
      mutationFn: withVaultErrorHandling(
        (request: AddVaultFileRequest) => apiClient.addFile(request),
        'addVaultFile'
      ),
      onSuccess: (data, variables) => {
        // Optimistically update items list
        const parentId = data.parentId;
        queryClient.setQueryData(
          vaultQueryKeys.items(parentId || undefined),
          (oldData: GetVaultItemsResponse | undefined) => {
            if (!oldData) return { items: [data], totalCount: 1, hasMore: false };
            return {
              ...oldData,
              items: [...oldData.items, data],
              totalCount: (oldData.totalCount || 0) + 1,
            };
          }
        );
        
        // Invalidate related queries
        queryClient.invalidateQueries({ queryKey: vaultQueryKeys.storageInfo() });
        
        options?.onSuccess?.(data, variables, undefined);
      },
      onError: (error, variables) => {
        handleError(error, 'Add file');
        options?.onError?.(error, variables, undefined);
      },
      ...options,
    });
  };

  /**
   * Renames a vault item
   */
  const useRenameItem = (options?: VaultMutationOptions<VaultItem, VaultError, RenameVaultItemRequest>) => {
    return useMutation({
      mutationFn: withVaultErrorHandling(
        (request: RenameVaultItemRequest) => apiClient.renameItem(request),
        'renameVaultItem'
      ),
      onSuccess: (data, variables) => {
        // Update item in cache
        queryClient.setQueryData(vaultQueryKeys.item(variables.itemId), data);
        
        // Invalidate items list
        queryClient.invalidateQueries({ queryKey: vaultQueryKeys.items(data.parentId || undefined) });
        
        options?.onSuccess?.(data, variables, undefined);
      },
      onError: (error, variables) => {
        handleError(error, 'Rename item');
        options?.onError?.(error, variables, undefined);
      },
      ...options,
    });
  };

  /**
   * Moves a vault item
   */
  const useMoveItem = (options?: VaultMutationOptions<VaultItem, VaultError, MoveVaultItemRequest>) => {
    return useMutation({
      mutationFn: withVaultErrorHandling(
        (request: MoveVaultItemRequest) => apiClient.moveItem(request),
        'moveVaultItem'
      ),
      onSuccess: (data, variables) => {
        // Update item in cache
        queryClient.setQueryData(vaultQueryKeys.item(variables.itemId), data);
        
        // Invalidate both source and destination folder lists
        queryClient.invalidateQueries({ queryKey: vaultQueryKeys.items() });
        
        options?.onSuccess?.(data, variables, undefined);
      },
      onError: (error, variables) => {
        handleError(error, 'Move item');
        options?.onError?.(error, variables, undefined);
      },
      ...options,
    });
  };

  /**
   * Deletes a vault item
   */
  const useDeleteItem = (options?: VaultMutationOptions<{ success: boolean }, VaultError, DeleteVaultItemRequest>) => {
    return useMutation({
      mutationFn: withVaultErrorHandling(
        (request: DeleteVaultItemRequest) => apiClient.deleteItem(request),
        'deleteVaultItem'
      ),
      onSuccess: (data, variables) => {
        // Remove from items list if permanent delete, otherwise invalidate
        if (variables.permanent) {
          // Invalidate all queries since item is permanently deleted
          queryClient.invalidateQueries({ queryKey: vaultQueryKeys.all });
        } else {
          // Soft delete - move to trash
          queryClient.invalidateQueries({ queryKey: vaultQueryKeys.items() });
          queryClient.invalidateQueries({ queryKey: vaultQueryKeys.deletedItems() });
        }
        
        options?.onSuccess?.(data, variables, undefined);
      },
      onError: (error, variables) => {
        handleError(error, 'Delete item');
        options?.onError?.(error, variables, undefined);
      },
      ...options,
    });
  };

  /**
   * Restores a deleted vault item
   */
  const useRestoreItem = (options?: VaultMutationOptions<VaultItem, VaultError, { itemId: string }>) => {
    return useMutation({
      mutationFn: withVaultErrorHandling(
        (request: { itemId: string }) => apiClient.restoreItem(request),
        'restoreVaultItem'
      ),
      onSuccess: (data, variables) => {
        // Invalidate deleted items and regular items
        queryClient.invalidateQueries({ queryKey: vaultQueryKeys.deletedItems() });
        queryClient.invalidateQueries({ queryKey: vaultQueryKeys.items(data.parentId || undefined) });
        
        options?.onSuccess?.(data, variables, undefined);
      },
      onError: (error, variables) => {
        handleError(error, 'Restore item');
        options?.onError?.(error, variables, undefined);
      },
      ...options,
    });
  };

  // ============================
  // RETURN API
  // ============================

  return {
    // Queries
    useVaultItems,
    useDeletedVaultItems,
    useVaultSearch,
    useVaultStorageInfo,
    useVaultEncryptionStatus,
    
    // Mutations
    createFolder: useCreateFolder,
    addFile: useAddFile,
    renameItem: useRenameItem,
    moveItem: useMoveItem,
    deleteItem: useDeleteItem,
    restoreItem: useRestoreItem,
    
    // Direct API access for advanced use cases
    apiClient,
    
    // Cache management
    invalidateAll: () => queryClient.invalidateQueries({ queryKey: vaultQueryKeys.all }),
    invalidateItems: (parentId?: string) => queryClient.invalidateQueries({ queryKey: vaultQueryKeys.items(parentId) }),
    
    // Query keys for external use
    queryKeys: vaultQueryKeys,
  };
}