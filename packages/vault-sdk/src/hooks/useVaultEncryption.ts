import { useMutation, useQuery, useQueryClient, type UseQueryOptions } from '@tanstack/react-query';

import { VaultApiClient } from '../api/VaultApiClient';
import {
  type VaultEncryptionStatus,
  type VaultEncryptionMetadata,
  VaultError,
} from '../types/Vault';
import { withVaultErrorHandling } from '../utils/errors';
import { vaultQueryKeys } from './useVault';

/**
 * Query keys for encryption-related operations
 */
export const vaultEncryptionQueryKeys = {
  encryptionStatus: () => ['vault', 'encryption', 'status'] as const,
  encryptionMetadata: (itemId: string) => ['vault', 'encryption', 'metadata', itemId] as const,
  keyRotationStatus: () => ['vault', 'encryption', 'keyRotation'] as const,
} as const;

/**
 * Encryption setup options
 */
export interface EncryptionSetupOptions {
  keyDerivationParams?: {
    iterations?: number;
    memLimit?: number;
    opsLimit?: number;
  };
  enableBiometrics?: boolean;
  autoKeyRotation?: boolean;
  keyRotationDays?: number;
}

/**
 * Key rotation options
 */
export interface KeyRotationOptions {
  reason?: 'scheduled' | 'compromise' | 'manual';
  forceRotation?: boolean;
  preserveOldKey?: boolean;
}

/**
 * Hook for vault encryption operations
 */
export function useVaultEncryption(
  apiClient: VaultApiClient,
  errorHandler?: (error: VaultError, context?: string) => void
) {
  const queryClient = useQueryClient();

  // Error handling wrapper
  const handleError = (error: unknown, context: string = 'Unknown encryption operation') => {
    const vaultError = error instanceof Error ? error as VaultError : new Error('Unknown error') as VaultError;
    
    if (errorHandler) {
      errorHandler(vaultError, context);
    } else {
      console.error(`[Vault Encryption ${context}]:`, vaultError);
    }
  };

  // ============================
  // ENCRYPTION STATUS QUERIES
  // ============================

  /**
   * Gets the current vault encryption status
   */
  const useEncryptionStatus = (options?: UseQueryOptions<VaultEncryptionStatus, VaultError>) => {
    return useQuery({
      queryKey: vaultEncryptionQueryKeys.encryptionStatus(),
      queryFn: withVaultErrorHandling(
        () => apiClient.getEncryptionStatus({}),
        'getVaultEncryptionStatus'
      ),
      staleTime: 5 * 60 * 1000, // 5 minutes
      gcTime: 15 * 60 * 1000, // 15 minutes
      refetchOnWindowFocus: true,
      ...options,
    });
  };

  /**
   * Gets encryption metadata for a specific item
   */
  const useEncryptionMetadata = (
    itemId: string,
    options?: UseQueryOptions<VaultEncryptionMetadata, VaultError>
  ) => {
    return useQuery({
      queryKey: vaultEncryptionQueryKeys.encryptionMetadata(itemId),
      queryFn: withVaultErrorHandling(
        () => apiClient.getEncryptionMetadata({ itemId }),
        'getVaultItemEncryptionMetadata'
      ),
      enabled: !!itemId,
      staleTime: 10 * 60 * 1000, // 10 minutes
      gcTime: 30 * 60 * 1000, // 30 minutes
      ...options,
    });
  };

  /**
   * Gets key rotation status
   */
  const useKeyRotationStatus = (options?: UseQueryOptions<any, VaultError>) => {
    return useQuery({
      queryKey: vaultEncryptionQueryKeys.keyRotationStatus(),
      queryFn: withVaultErrorHandling(
        async () => {
          // Note: This would need to be implemented in the API client
          // For now, return mock data
          return {
            lastRotation: new Date().toISOString(),
            nextScheduledRotation: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString(),
            rotationIntervalDays: 90,
            pendingRotations: 0,
          };
        },
        'getKeyRotationStatus'
      ),
      staleTime: 60 * 60 * 1000, // 1 hour
      gcTime: 4 * 60 * 60 * 1000, // 4 hours
      ...options,
    });
  };

  // ============================
  // ENCRYPTION SETUP MUTATIONS
  // ============================

  /**
   * Sets up vault encryption for the first time
   */
  const useSetupEncryption = () => {
    return useMutation<
      { success: boolean; encryptionEnabled: boolean },
      VaultError,
      EncryptionSetupOptions
    >({
      mutationFn: withVaultErrorHandling(
        async (_options: EncryptionSetupOptions) => {
          // Note: This would need to be implemented in the API client
          // For now, return success
          return { success: true, encryptionEnabled: true };
        },
        'setupVaultEncryption'
      ),
      onSuccess: () => {
        // Invalidate encryption status to reflect new state
        queryClient.invalidateQueries({ queryKey: vaultEncryptionQueryKeys.encryptionStatus() });
        
        // Invalidate all vault items as they may now show encryption status
        queryClient.invalidateQueries({ queryKey: vaultQueryKeys.items() });
      },
      onError: (error: VaultError) => {
        handleError(error, 'Setup encryption');
      },
    });
  };

  /**
   * Disables vault encryption (with confirmation)
   */
  const useDisableEncryption = () => {
    return useMutation<
      { success: boolean; encryptionEnabled: boolean },
      VaultError,
      { confirmDisable: boolean; password?: string }
    >({
      mutationFn: withVaultErrorHandling(
        async (confirmation: { confirmDisable: boolean; password?: string }) => {
          if (!confirmation.confirmDisable) {
            throw new Error('Encryption disable not confirmed');
          }
          
          // Note: This would need to be implemented in the API client
          // For now, return success
          return { success: true, encryptionEnabled: false };
        },
        'disableVaultEncryption'
      ),
      onSuccess: () => {
        // Invalidate encryption status
        queryClient.invalidateQueries({ queryKey: vaultEncryptionQueryKeys.encryptionStatus() });
        
        // Invalidate all vault items
        queryClient.invalidateQueries({ queryKey: vaultQueryKeys.items() });
      },
      onError: (error: VaultError) => {
        handleError(error, 'Disable encryption');
      },
    });
  };

  // ============================
  // ENCRYPTION METADATA MUTATIONS
  // ============================

  /**
   * Stores encryption metadata for a vault item
   */
  const useStoreEncryptionMetadata = () => {
    return useMutation<
      { success: boolean },
      VaultError,
      { itemId: string; encryptionMetadata: VaultEncryptionMetadata }
    >({
      mutationFn: withVaultErrorHandling(
        (request: { itemId: string; encryptionMetadata: VaultEncryptionMetadata }) =>
          apiClient.storeEncryptionMetadata(request),
        'storeVaultItemEncryptionMetadata'
      ),
      onSuccess: (_data, variables) => {
        // Update the cached metadata
        queryClient.setQueryData(
          vaultEncryptionQueryKeys.encryptionMetadata(variables.itemId),
          variables.encryptionMetadata
        );
        
        // Invalidate the item to show it's encrypted
        queryClient.invalidateQueries({ queryKey: vaultQueryKeys.item(variables.itemId) });
      },
      onError: (error: VaultError) => {
        handleError(error, 'Store encryption metadata');
      },
    });
  };

  // ============================
  // KEY ROTATION MUTATIONS
  // ============================

  /**
   * Rotates encryption keys
   */
  const useRotateKeys = () => {
    return useMutation<
      any,
      VaultError,
      KeyRotationOptions | undefined
    >({
      mutationFn: withVaultErrorHandling(
        async (options: KeyRotationOptions = {}) => {
          // Generate new key ID
          const newKeyId = `vault_key_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
          const oldKeyId = 'current_vault_key'; // This would come from current encryption status
          
          // Note: This would need to be implemented in the API client
          const result = await apiClient.rotateEncryptionKey({
            keyType: 'vault',
            oldKeyId,
            newKeyId,
            encryptedKey: 'encrypted_key_data', // This would be the actual encrypted key
            metadata: {
              reason: options.reason || 'manual',
              timestamp: new Date().toISOString(),
            },
          });
          
          return { ...result, newKeyId, oldKeyId };
        },
        'rotateEncryptionKey'
      ),
      onSuccess: () => {
        // Invalidate encryption status and key rotation status
        queryClient.invalidateQueries({ queryKey: vaultEncryptionQueryKeys.encryptionStatus() });
        queryClient.invalidateQueries({ queryKey: vaultEncryptionQueryKeys.keyRotationStatus() });
        
        // Invalidate all encryption metadata as keys have changed
        queryClient.invalidateQueries({ 
          queryKey: ['vault', 'encryption', 'metadata'],
          exact: false 
        });
      },
      onError: (error: VaultError) => {
        handleError(error, 'Rotate encryption keys');
      },
    });
  };

  // ============================
  // BULK ENCRYPTION OPERATIONS
  // ============================

  /**
   * Encrypts multiple unencrypted items
   */
  const useBulkEncryptItems = () => {
    return useMutation<
      { success: boolean; encryptedCount: number },
      VaultError,
      { itemIds: string[]; encryptionMetadata: VaultEncryptionMetadata }
    >({
      mutationFn: withVaultErrorHandling(
        async (request: { itemIds: string[]; encryptionMetadata: VaultEncryptionMetadata }) => {
          // Encrypt each item individually
          const results = await Promise.allSettled(
            request.itemIds.map(itemId =>
              apiClient.storeEncryptionMetadata({
                itemId,
                encryptionMetadata: request.encryptionMetadata,
              })
            )
          );
          
          // Check for failures
          const failures = results
            .map((result, index) => ({ result, itemId: request.itemIds[index] }))
            .filter(({ result }) => result.status === 'rejected');
          
          if (failures.length > 0) {
            throw new Error(`Failed to encrypt ${failures.length} items`);
          }
          
          return { success: true, encryptedCount: request.itemIds.length };
        },
        'bulkEncryptItems'
      ),
      onSuccess: (_data, variables) => {
        // Invalidate encryption status
        queryClient.invalidateQueries({ queryKey: vaultEncryptionQueryKeys.encryptionStatus() });
        
        // Invalidate affected items
        variables.itemIds.forEach(itemId => {
          queryClient.invalidateQueries({ queryKey: vaultQueryKeys.item(itemId) });
          queryClient.invalidateQueries({ queryKey: vaultEncryptionQueryKeys.encryptionMetadata(itemId) });
        });
        
        // Invalidate items list
        queryClient.invalidateQueries({ queryKey: vaultQueryKeys.items() });
      },
      onError: (error: VaultError) => {
        handleError(error, 'Bulk encrypt items');
      },
    });
  };

  // ============================
  // UTILITY FUNCTIONS
  // ============================

  /**
   * Checks if an item is encrypted
   */
  const isItemEncrypted = (item: { isEncrypted?: boolean; encryptionKeyId?: string }) => {
    return item.isEncrypted === true || !!item.encryptionKeyId;
  };

  /**
   * Gets encryption progress percentage
   */
  const getEncryptionProgress = (status: VaultEncryptionStatus) => {
    return status.encryptionProgress || 0;
  };

  // ============================
  // RETURN API
  // ============================

  return {
    // Queries
    useEncryptionStatus,
    useEncryptionMetadata,
    useKeyRotationStatus,
    
    // Setup mutations
    setupEncryption: useSetupEncryption,
    disableEncryption: useDisableEncryption,
    
    // Metadata mutations
    storeEncryptionMetadata: useStoreEncryptionMetadata,
    
    // Key rotation mutations
    rotateKeys: useRotateKeys,
    
    // Bulk operations
    bulkEncryptItems: useBulkEncryptItems,
    
    // Utility functions
    isItemEncrypted,
    getEncryptionProgress,
    
    // Query keys for external use
    queryKeys: vaultEncryptionQueryKeys,
    
    // Cache management
    invalidateEncryption: () => {
      queryClient.invalidateQueries({ queryKey: vaultEncryptionQueryKeys.encryptionStatus() });
      queryClient.invalidateQueries({ queryKey: vaultEncryptionQueryKeys.keyRotationStatus() });
    },
  };
}