// Export NativeLibsignalService as the main implementation
export { NativeLibsignalService as LibsignalService } from './libsignal/NativeLibsignalService';
export { NativeLibsignalService as E2EEService } from './libsignal/NativeLibsignalService'; // Temporary compatibility alias

export { default as MediaEncryptionService } from './MediaEncryptionService';
export { ChatEncryptionService } from './ChatEncryptionService';
export { default as KeyRotationService } from './KeyRotationService';
export { default as MultiDeviceService } from './MultiDeviceService';
export { default as GroupE2EEService } from './GroupE2EEService';
export { default as KeyBackupService } from './KeyBackupService';
export { default as DoubleRatchetService } from './DoubleRatchetService';
export { default as OfflineQueueService } from './OfflineQueueService';
export { default as MetadataEncryptionService } from './MetadataEncryptionService';
export { default as EncryptedSearchService } from './EncryptedSearchService';
export { default as FilePreviewService } from './FilePreviewService';
export { default as OfflineFileCacheService } from './OfflineFileCacheService';
export { default as SecureFileSharingService } from './SecureFileSharingService';
export { default as AuditLogService } from './AuditLogService';

// Vault encryption services
export { VaultCryptoService } from './VaultCryptoService';
export { VaultKeyManager } from './VaultKeyManager';
export { BiometricVaultAccess } from './BiometricVaultAccess';
export { VaultStreamService } from './VaultStreamService';
export { VaultSearchService } from './VaultSearchService';
export { FamilyVaultSharing } from './FamilyVaultSharing';

// Export types from NativeLibsignalService
export type {
  MessagePayload,
  DeviceMessage
} from './libsignal/NativeLibsignalService';

// Export compatibility types
export type KeyPair = {
  publicKey: string;
  privateKey: string;
};

export type EncryptedMessage = {
  content: string;
  ephemeralPublicKey: string;
  nonce: string;
  mac: string;
};

export type {
  EncryptedFile,
  FileEncryptionResult
} from './MediaEncryptionService';

export type {
  UserKeys,
  Chat,
  Message,
  EncryptedMessageData
} from './ChatEncryptionService';

// Vault encryption types
export type {
  VaultKeyInfo,
  VaultConfig,
  FamilyKeyPair,
  KeyRotationInfo
} from './VaultKeyManager';

export type {
  BiometricCapabilities,
  VaultSetupOptions,
  VaultAccessResult,
  VaultSecurityStatus
} from './BiometricVaultAccess';

export type {
  StreamProgress,
  StreamOptions,
  StreamResult,
  ResumeInfo
} from './VaultStreamService';

export type {
  SearchableMetadata,
  SearchIndex,
  SearchOptions,
  SearchResult
} from './VaultSearchService';

export type {
  SharePermissions,
  VaultShare,
  ShareRequest,
  ShareAcceptResult,
  SharingStats
} from './FamilyVaultSharing';
