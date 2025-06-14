import {Timestamp} from "firebase-admin/firestore";

// TODO: Import from SDK for single source of truth
// import {
//   VaultItemSchema,
//   VaultShareLinkSchema,
//   type VaultItem as SDKVaultItem,
//   type VaultShareLink as SDKVaultShareLink,
// } from "@dynasty/vault-sdk/types";

// MARK: - Vault Types (Firebase Timestamp compatibility layer)
export interface VaultItem {
  id: string;
  userId: string;
  ownerId: string; // Added for clarity - same as userId
  name: string;
  type: "folder" | "file";
  parentId: string | null;
  path: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
  fileType?: "image" | "video" | "audio" | "document" | "other";
  size?: number;
  storagePath?: string;
  downloadURL?: string;
  mimeType?: string;
  isDeleted: boolean;
  // Encryption fields
  isEncrypted?: boolean;
  encryptionKeyId?: string;
  encryptedBy?: string;
  // Sharing fields
  sharedWith?: string[];
  permissions?: {
    canRead?: string[];
    canWrite?: string[];
  };
  // Access level for the current user (added during queries)
  accessLevel?: "owner" | "read" | "write";
  // Cloud storage (R2/B2) fields
  storageProvider?: "firebase" | "r2" | "b2";
  // R2 fields (legacy)
  r2Bucket?: string;
  r2Key?: string;
  // B2 fields (new)
  b2Bucket?: string;
  b2Key?: string;
  // Cached URLs with expiration
  cachedUploadUrl?: string;
  cachedUploadUrlExpiry?: Timestamp;
  cachedDownloadUrl?: string;
  cachedDownloadUrlExpiry?: Timestamp;
  // Scan status for malware/security scanning
  scanStatus?: "pending" | "scanning" | "clean" | "infected" | "error";
  scanResults?: {
    scannedAt: Timestamp;
    threats?: string[];
    provider: "cloudmersive";
  };
  quarantineInfo?: {
    quarantinedAt: Timestamp;
    reason: string;
  };
}

export interface VaultShareLink {
  shareId: string;
  itemId: string;
  ownerId: string;
  expiresAt: Timestamp | null;
  allowDownload: boolean;
  passwordHash: string | null;
  createdAt: Timestamp;
  accessCount: number;
  maxAccessCount: number | null;
  lastAccessedAt?: Timestamp;
}

// MARK: - Constants
export const MAX_UPDATE_DEPTH = 10;

// MARK: - Response Types
export interface VaultAccessResult {
  hasAccess: boolean;
  item?: VaultItem;
  reason?: string;
}

export interface StorageInfo {
  totalFiles: number;
  totalSize: number;
  encryptedFiles: number;
  encryptedSize: number;
  usedQuota: number;
  totalQuota: number;
}