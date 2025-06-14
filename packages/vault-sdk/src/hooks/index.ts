// Export all vault hooks
export {
  useVault,
  vaultQueryKeys,
  type UseVaultConfig,
  type VaultMutationOptions,
  type VaultQueryOptions,
  type VaultErrorHandler,
} from './useVault';

export {
  useVaultFileUpload,
  useVaultFileDownload,
  useVaultFile,
  type UploadProgress,
  type DownloadProgress,
  type FileUploadOptions,
  type FileDownloadOptions,
  type UploadState,
  type DownloadState,
} from './useVaultFile';

export {
  useVaultSharing,
  vaultSharingQueryKeys,
} from './useVaultSharing';

export {
  useVaultEncryption,
  vaultEncryptionQueryKeys,
  type EncryptionSetupOptions,
  type KeyRotationOptions,
} from './useVaultEncryption';