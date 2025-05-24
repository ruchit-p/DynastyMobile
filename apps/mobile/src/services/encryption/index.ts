export { E2EEService } from './E2EEService';
export { default as MediaEncryptionService } from './MediaEncryptionService';
export { default as ChatEncryptionService } from './ChatEncryptionService';
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

// Export types
export type {
  KeyPair,
  EncryptedMessage
} from './E2EEService';

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
