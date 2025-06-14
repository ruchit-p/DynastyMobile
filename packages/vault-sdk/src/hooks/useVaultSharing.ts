import { useMutation, useQuery, useQueryClient, type UseQueryOptions } from '@tanstack/react-query';

import { VaultApiClient } from '../api/VaultApiClient';
import {
  type ShareVaultItemRequest,
  type UpdateVaultItemPermissionsRequest,
  type CreateVaultShareLinkRequest,
  type VaultShareLink,
  type VaultItem,
  VaultError,
} from '../types/Vault';
import { withVaultErrorHandling } from '../utils/errors';
import { vaultQueryKeys } from './useVault';

/**
 * Query keys for sharing-related operations
 */
export const vaultSharingQueryKeys = {
  shareLinks: (itemId: string) => ['vault', 'shareLinks', itemId] as const,
  sharedWithMe: () => ['vault', 'sharedWithMe'] as const,
  myShares: () => ['vault', 'myShares'] as const,
} as const;

/**
 * Hook for vault sharing operations
 */
export function useVaultSharing(
  apiClient: VaultApiClient,
  errorHandler?: (error: VaultError, context?: string) => void
) {
  const queryClient = useQueryClient();

  // Error handling wrapper
  const handleError = (error: unknown, context: string = 'Unknown sharing operation') => {
    const vaultError = error instanceof Error ? error as VaultError : new Error('Unknown error') as VaultError;
    
    if (errorHandler) {
      errorHandler(vaultError, context);
    } else {
      console.error(`[Vault Sharing ${context}]:`, vaultError);
    }
  };

  // ============================
  // SHARING MUTATIONS
  // ============================

  /**
   * Shares a vault item with users
   */
  const useShareItem = () => {
    return useMutation({
      mutationFn: withVaultErrorHandling(
        (request: ShareVaultItemRequest) => apiClient.shareItem(request),
        'shareVaultItem'
      ),
      onSuccess: (data, variables) => {
        // Invalidate the item to refresh permissions
        queryClient.invalidateQueries({ queryKey: vaultQueryKeys.item(variables.itemId) });
        
        // Invalidate items list to refresh access levels
        queryClient.invalidateQueries({ queryKey: vaultQueryKeys.items() });
        
        // Invalidate sharing-related queries
        queryClient.invalidateQueries({ queryKey: vaultSharingQueryKeys.myShares() });
      },
      onError: (error) => {
        handleError(error, 'Share item');
      },
    });
  };

  /**
   * Updates permissions for a shared vault item
   */
  const useUpdateItemPermissions = () => {
    return useMutation({
      mutationFn: withVaultErrorHandling(
        (request: UpdateVaultItemPermissionsRequest) => apiClient.updateItemPermissions(request),
        'updateVaultItemPermissions'
      ),
      onSuccess: (data, variables) => {
        // Invalidate the item to refresh permissions
        queryClient.invalidateQueries({ queryKey: vaultQueryKeys.item(variables.itemId) });
        
        // Invalidate items list
        queryClient.invalidateQueries({ queryKey: vaultQueryKeys.items() });
        
        // Invalidate sharing queries
        queryClient.invalidateQueries({ queryKey: vaultSharingQueryKeys.myShares() });
      },
      onError: (error) => {
        handleError(error, 'Update item permissions');
      },
    });
  };

  /**
   * Revokes access to a shared vault item
   */
  const useRevokeItemAccess = () => {
    return useMutation({
      mutationFn: withVaultErrorHandling(
        (request: { itemId: string; userId: string }) => apiClient.revokeItemAccess(request),
        'revokeVaultItemAccess'
      ),
      onSuccess: (data, variables) => {
        // Invalidate the item to refresh permissions
        queryClient.invalidateQueries({ queryKey: vaultQueryKeys.item(variables.itemId) });
        
        // Invalidate items list
        queryClient.invalidateQueries({ queryKey: vaultQueryKeys.items() });
        
        // Invalidate sharing queries
        queryClient.invalidateQueries({ queryKey: vaultSharingQueryKeys.myShares() });
      },
      onError: (error) => {
        handleError(error, 'Revoke item access');
      },
    });
  };

  // ============================
  // SHARE LINK OPERATIONS
  // ============================

  /**
   * Creates a public share link for a vault item
   */
  const useCreateShareLink = () => {
    return useMutation({
      mutationFn: withVaultErrorHandling(
        (request: CreateVaultShareLinkRequest) => apiClient.createShareLink(request),
        'createVaultShareLink'
      ),
      onSuccess: (data, variables) => {
        // Update share links cache
        queryClient.setQueryData(
          vaultSharingQueryKeys.shareLinks(variables.itemId),
          (oldData: VaultShareLink[] | undefined) => {
            return oldData ? [...oldData, data] : [data];
          }
        );
        
        // Invalidate the item to show it has share links
        queryClient.invalidateQueries({ queryKey: vaultQueryKeys.item(variables.itemId) });
      },
      onError: (error) => {
        handleError(error, 'Create share link');
      },
    });
  };

  /**
   * Accesses a vault item via share link
   */
  const useAccessShareLink = () => {
    return useMutation({
      mutationFn: withVaultErrorHandling(
        (request: { shareId: string; password?: string }) => apiClient.accessShareLink(request),
        'accessVaultShareLink'
      ),
      onError: (error) => {
        handleError(error, 'Access share link');
      },
    });
  };

  // ============================
  // SHARING QUERIES
  // ============================

  /**
   * Gets share links for a specific item
   */
  const useShareLinks = (
    itemId: string,
    options?: UseQueryOptions<VaultShareLink[], VaultError>
  ) => {
    return useQuery({
      queryKey: vaultSharingQueryKeys.shareLinks(itemId),
      queryFn: withVaultErrorHandling(
        async () => {
          // Note: This would need to be implemented in the API client
          // For now, return empty array
          return [] as VaultShareLink[];
        },
        'getShareLinks'
      ),
      enabled: !!itemId,
      staleTime: 5 * 60 * 1000, // 5 minutes
      gcTime: 15 * 60 * 1000, // 15 minutes
      ...options,
      onError: (error) => {
        handleError(error, 'Get share links');
        options?.onError?.(error);
      },
    });
  };

  /**
   * Gets items shared with the current user
   */
  const useSharedWithMe = (options?: UseQueryOptions<VaultItem[], VaultError>) => {
    return useQuery({
      queryKey: vaultSharingQueryKeys.sharedWithMe(),
      queryFn: withVaultErrorHandling(
        async () => {
          // Note: This would need to be implemented in the API client
          // For now, return empty array
          return [] as VaultItem[];
        },
        'getSharedWithMe'
      ),
      staleTime: 2 * 60 * 1000, // 2 minutes
      gcTime: 10 * 60 * 1000, // 10 minutes
      ...options,
      onError: (error) => {
        handleError(error, 'Get shared with me');
        options?.onError?.(error);
      },
    });
  };

  /**
   * Gets items that the current user has shared
   */
  const useMyShares = (options?: UseQueryOptions<VaultItem[], VaultError>) => {
    return useQuery({
      queryKey: vaultSharingQueryKeys.myShares(),
      queryFn: withVaultErrorHandling(
        async () => {
          // Note: This would need to be implemented in the API client
          // For now, return empty array  
          return [] as VaultItem[];
        },
        'getMyShares'
      ),
      staleTime: 2 * 60 * 1000, // 2 minutes
      gcTime: 10 * 60 * 1000, // 10 minutes
      ...options,
      onError: (error) => {
        handleError(error, 'Get my shares');
        options?.onError?.(error);
      },
    });
  };

  // ============================
  // BULK OPERATIONS
  // ============================

  /**
   * Shares multiple items with the same users and permissions
   */
  const useBulkShareItems = () => {
    return useMutation({
      mutationFn: withVaultErrorHandling(
        async (request: { itemIds: string[]; userIds: string[]; permissions: string }) => {
          // Share each item individually
          const results = await Promise.allSettled(
            request.itemIds.map(itemId =>
              apiClient.shareItem({
                itemId,
                userIds: request.userIds,
                permissions: request.permissions as any,
              })
            )
          );
          
          // Check for failures
          const failures = results
            .map((result, index) => ({ result, itemId: request.itemIds[index] }))
            .filter(({ result }) => result.status === 'rejected');
          
          if (failures.length > 0) {
            throw new Error(`Failed to share ${failures.length} items`);
          }
          
          return { success: true, sharedCount: request.itemIds.length };
        },
        'bulkShareItems'
      ),
      onSuccess: (data, variables) => {
        // Invalidate all relevant queries
        queryClient.invalidateQueries({ queryKey: vaultQueryKeys.items() });
        queryClient.invalidateQueries({ queryKey: vaultSharingQueryKeys.myShares() });
        
        // Invalidate individual items
        variables.itemIds.forEach(itemId => {
          queryClient.invalidateQueries({ queryKey: vaultQueryKeys.item(itemId) });
        });
      },
      onError: (error) => {
        handleError(error, 'Bulk share items');
      },
    });
  };

  // ============================
  // RETURN API
  // ============================

  return {
    // Mutations
    shareItem: useShareItem,
    updateItemPermissions: useUpdateItemPermissions,
    revokeItemAccess: useRevokeItemAccess,
    createShareLink: useCreateShareLink,
    accessShareLink: useAccessShareLink,
    bulkShareItems: useBulkShareItems,
    
    // Queries
    useShareLinks,
    useSharedWithMe,
    useMyShares,
    
    // Query keys for external use
    queryKeys: vaultSharingQueryKeys,
    
    // Cache management
    invalidateSharing: () => {
      queryClient.invalidateQueries({ queryKey: vaultSharingQueryKeys.myShares() });
      queryClient.invalidateQueries({ queryKey: vaultSharingQueryKeys.sharedWithMe() });
    },
  };
}