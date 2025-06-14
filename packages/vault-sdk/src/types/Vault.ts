import { z } from 'zod';

// Base validation schemas reused from Firebase Functions
export const VaultFileTypeSchema = z.enum(['image', 'video', 'audio', 'document', 'other']);
export const VaultPermissionSchema = z.enum(['read', 'write', 'admin']);
export const VaultSortBySchema = z.enum(['name', 'date', 'size', 'type']);
export const VaultSortOrderSchema = z.enum(['asc', 'desc']);
export const VaultScanStatusSchema = z.enum(['pending', 'scanning', 'clean', 'infected', 'error']);
export const VaultStorageProviderSchema = z.enum(['firebase', 'r2', 'b2']);

// Encryption metadata schema
export const VaultEncryptionMetadataSchema = z.object({
  // Version 1.0: Chunked encryption (legacy)
  headerUrl: z.string().optional(),
  chunkUrls: z.array(z.string()).optional(),
  
  // Version 2.0: Streaming encryption (current)
  streamingMode: z.boolean().optional(),
  headerBase64: z.string().optional(),
  encryptedFileUrl: z.string().optional(),
  
  // Common encryption fields
  encryptionKeyId: z.string().optional(),
  algorithm: z.string().optional(),
  keyDerivationParams: z.object({
    salt: z.string(),
    iterations: z.number(),
    memLimit: z.number().optional(),
    opsLimit: z.number().optional(),
  }).optional(),
});

// Share link schema
export const VaultShareLinkSchema = z.object({
  shareId: z.string(),
  itemId: z.string(),
  ownerId: z.string(),
  expiresAt: z.string().nullable(),
  allowDownload: z.boolean(),
  passwordHash: z.string().nullable(),
  createdAt: z.string(),
  accessCount: z.number(),
  maxAccessCount: z.number().nullable(),
  lastAccessedAt: z.string().optional(),
});

// File scanning results schema
export const VaultScanResultsSchema = z.object({
  scannedAt: z.string(),
  threats: z.array(z.string()).optional(),
  provider: z.string(),
  scanId: z.string().optional(),
});

// Quarantine info schema
export const VaultQuarantineInfoSchema = z.object({
  quarantinedAt: z.string(),
  reason: z.string(),
  scanResults: VaultScanResultsSchema.optional(),
});

// Main vault item schema
export const VaultItemSchema = z.object({
  id: z.string(),
  userId: z.string(),
  ownerId: z.string(),
  name: z.string().min(1).max(255),
  type: z.enum(['file', 'folder']),
  parentId: z.string().nullable(),
  path: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
  
  // File-specific fields
  fileType: VaultFileTypeSchema.optional(),
  size: z.number().optional(),
  storagePath: z.string().optional(),
  mimeType: z.string().optional(),
  
  // Encryption fields
  isEncrypted: z.boolean().optional(),
  encryptionKeyId: z.string().optional(),
  encryptedBy: z.string().optional(),
  encryptionMetadata: VaultEncryptionMetadataSchema.optional(),
  
  // Sharing & permissions
  sharedWith: z.array(z.string()).optional(),
  permissions: z.object({
    canRead: z.array(z.string()).optional(),
    canWrite: z.array(z.string()).optional(),
  }).optional(),
  accessLevel: z.enum(['owner', 'read', 'write']).optional(),
  
  // Cloud storage
  storageProvider: VaultStorageProviderSchema.optional(),
  r2Bucket: z.string().optional(),
  r2Key: z.string().optional(),
  b2Bucket: z.string().optional(),
  b2Key: z.string().optional(),
  
  // Security scanning
  scanStatus: VaultScanStatusSchema.optional(),
  scanResults: VaultScanResultsSchema.optional(),
  quarantineInfo: VaultQuarantineInfoSchema.optional(),
  
  // Soft delete
  isDeleted: z.boolean().default(false),
  
  // Cached URLs (runtime fields)
  cachedDownloadUrl: z.string().optional(),
  cachedDownloadUrlExpiry: z.string().optional(),
  thumbnailUrl: z.string().optional(),
});

// Array of vault items schema
export const VaultItemsSchema = z.array(VaultItemSchema);

// API Request/Response schemas
export const CreateVaultFolderRequestSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  parentFolderId: z.string().optional(),
});

export const AddVaultFileRequestSchema = z.object({
  itemId: z.string(),
  name: z.string().min(1).max(255),
  storagePath: z.string().max(500),
  fileType: VaultFileTypeSchema,
  size: z.number().positive(),
  mimeType: z.string().max(100),
  isEncrypted: z.boolean().optional(),
  encryptionMetadata: VaultEncryptionMetadataSchema.optional(),
});

export const GetVaultItemsRequestSchema = z.object({
  parentId: z.string().optional(),
  includeDeleted: z.boolean().optional(),
});

export const GetVaultItemsResponseSchema = z.object({
  items: VaultItemsSchema,
  totalCount: z.number().optional(),
  hasMore: z.boolean().optional(),
});

export const RenameVaultItemRequestSchema = z.object({
  itemId: z.string(),
  newName: z.string().min(1).max(255),
});

export const MoveVaultItemRequestSchema = z.object({
  itemId: z.string(),
  newParentId: z.string().optional(),
});

export const DeleteVaultItemRequestSchema = z.object({
  itemId: z.string(),
  permanent: z.boolean().optional(),
});

export const ShareVaultItemRequestSchema = z.object({
  itemId: z.string(),
  userIds: z.array(z.string()).max(50),
  permissions: VaultPermissionSchema,
});

export const UpdateVaultItemPermissionsRequestSchema = z.object({
  itemId: z.string(),
  userId: z.string(),
  permissions: VaultPermissionSchema,
});

export const CreateVaultShareLinkRequestSchema = z.object({
  itemId: z.string(),
  expiresAt: z.string().optional(),
  allowDownload: z.boolean().optional(),
  password: z.string().max(100).optional(),
});

export const GetVaultUploadSignedUrlRequestSchema = z.object({
  fileName: z.string().min(1).max(255),
  mimeType: z.string().max(100),
  fileSize: z.number().positive(),
  parentId: z.string().optional(),
  isEncrypted: z.boolean().optional(),
});

export const GetVaultUploadSignedUrlResponseSchema = z.object({
  uploadUrl: z.string(),
  itemId: z.string(),
  storagePath: z.string(),
  expires: z.string(),
});

export const GetVaultDownloadUrlRequestSchema = z.object({
  itemId: z.string().optional(),
  storagePath: z.string().max(500).optional(),
});

export const GetVaultDownloadUrlResponseSchema = z.object({
  downloadUrl: z.string(),
  expires: z.string(),
});

export const SearchVaultItemsRequestSchema = z.object({
  query: z.string().max(100).optional(),
  fileTypes: z.array(VaultFileTypeSchema).max(10).optional(),
  parentId: z.string().optional(),
  includeDeleted: z.boolean().optional(),
  sortBy: VaultSortBySchema.optional(),
  sortOrder: VaultSortOrderSchema.optional(),
  limit: z.number().positive().max(100).optional(),
});

export const VaultStorageInfoSchema = z.object({
  totalFiles: z.number(),
  totalSize: z.number(),
  encryptedFiles: z.number(),
  encryptedSize: z.number(),
  usedQuota: z.number(),
  totalQuota: z.number(),
});

export const VaultEncryptionStatusSchema = z.object({
  isEnabled: z.boolean(),
  keyRotationDate: z.string().optional(),
  totalEncryptedItems: z.number(),
  encryptionProgress: z.number(),
});

// TypeScript types derived from schemas
export type VaultFileType = z.infer<typeof VaultFileTypeSchema>;
export type VaultPermission = z.infer<typeof VaultPermissionSchema>;
export type VaultSortBy = z.infer<typeof VaultSortBySchema>;
export type VaultSortOrder = z.infer<typeof VaultSortOrderSchema>;
export type VaultScanStatus = z.infer<typeof VaultScanStatusSchema>;
export type VaultStorageProvider = z.infer<typeof VaultStorageProviderSchema>;

export type VaultEncryptionMetadata = z.infer<typeof VaultEncryptionMetadataSchema>;
export type VaultShareLink = z.infer<typeof VaultShareLinkSchema>;
export type VaultScanResults = z.infer<typeof VaultScanResultsSchema>;
export type VaultQuarantineInfo = z.infer<typeof VaultQuarantineInfoSchema>;
export type VaultItem = z.infer<typeof VaultItemSchema>;
export type VaultItems = z.infer<typeof VaultItemsSchema>;

// API Request/Response types
export type CreateVaultFolderRequest = z.infer<typeof CreateVaultFolderRequestSchema>;
export type AddVaultFileRequest = z.infer<typeof AddVaultFileRequestSchema>;
export type GetVaultItemsRequest = z.infer<typeof GetVaultItemsRequestSchema>;
export type GetVaultItemsResponse = z.infer<typeof GetVaultItemsResponseSchema>;
export type RenameVaultItemRequest = z.infer<typeof RenameVaultItemRequestSchema>;
export type MoveVaultItemRequest = z.infer<typeof MoveVaultItemRequestSchema>;
export type DeleteVaultItemRequest = z.infer<typeof DeleteVaultItemRequestSchema>;
export type ShareVaultItemRequest = z.infer<typeof ShareVaultItemRequestSchema>;
export type UpdateVaultItemPermissionsRequest = z.infer<typeof UpdateVaultItemPermissionsRequestSchema>;
export type CreateVaultShareLinkRequest = z.infer<typeof CreateVaultShareLinkRequestSchema>;
export type GetVaultUploadSignedUrlRequest = z.infer<typeof GetVaultUploadSignedUrlRequestSchema>;
export type GetVaultUploadSignedUrlResponse = z.infer<typeof GetVaultUploadSignedUrlResponseSchema>;
export type GetVaultDownloadUrlRequest = z.infer<typeof GetVaultDownloadUrlRequestSchema>;
export type GetVaultDownloadUrlResponse = z.infer<typeof GetVaultDownloadUrlResponseSchema>;
export type SearchVaultItemsRequest = z.infer<typeof SearchVaultItemsRequestSchema>;
export type VaultStorageInfo = z.infer<typeof VaultStorageInfoSchema>;
export type VaultEncryptionStatus = z.infer<typeof VaultEncryptionStatusSchema>;

// Error types
export enum VaultErrorCode {
  UNAUTHENTICATED = 'UNAUTHENTICATED',
  PERMISSION_DENIED = 'PERMISSION_DENIED',
  INVALID_ARGUMENT = 'INVALID_ARGUMENT',
  NOT_FOUND = 'NOT_FOUND',
  RATE_LIMITED = 'RATE_LIMITED',
  RESOURCE_EXHAUSTED = 'RESOURCE_EXHAUSTED',
  FILE_TOO_LARGE = 'FILE_TOO_LARGE',
  INVALID_FILE_TYPE = 'INVALID_FILE_TYPE',
  ENCRYPTION_ERROR = 'ENCRYPTION_ERROR',
  QUARANTINE_ERROR = 'QUARANTINE_ERROR',
  UNKNOWN_ERROR = 'UNKNOWN_ERROR',
}

export enum VaultErrorSeverity {
  LOW = 'LOW',
  MEDIUM = 'MEDIUM',
  HIGH = 'HIGH',
  CRITICAL = 'CRITICAL',
}

export interface VaultError extends Error {
  code: VaultErrorCode;
  severity: VaultErrorSeverity;
  statusCode?: number;
  context?: Record<string, unknown>;
}