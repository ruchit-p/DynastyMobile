// Export all vault-related types and schemas
export * from './Vault';

// Re-export commonly used types for convenience
export type {
  VaultItem,
  VaultItems,
  VaultFileType,
  VaultPermission,
  VaultError,
  VaultErrorCode,
  VaultErrorSeverity,
  VaultEncryptionMetadata,
  VaultShareLink,
  GetVaultItemsRequest,
  GetVaultItemsResponse,
  CreateVaultFolderRequest,
  SearchVaultItemsRequest,
  VaultStorageInfo,
  VaultEncryptionStatus,
  RestoreVaultItemRequest,
  GetVaultAuditLogsRequest,
  VaultAuditLog,
  GetVaultAuditLogsResponse,
  AccessVaultShareLinkRequest,
  RevokeVaultItemAccessRequest,
  GetVaultSystemStatsRequest,
  GetVaultSystemStatsResponse,
  PermanentlyDeleteVaultItemsRequest,
} from './Vault';