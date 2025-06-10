// Backend Vault Security Service for Dynasty Firebase Functions
// Provides server-side vault security operations using libsodium

import * as sodium from "libsodium-wrappers";
import * as winston from "winston";
import {getFirestore} from "firebase-admin/firestore";

// Configure winston logger
const logger = winston.createLogger({
  level: "info",
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({stack: true}),
    winston.format.json()
  ),
  transports: [
    new winston.transports.Console({
      format: winston.format.simple(),
    }),
  ],
});

// Constants
const VAULT_ENCRYPTION_VERSION = "2.0";
const MAX_FILE_SIZE = 100 * 1024 * 1024; // 100MB
const ALLOWED_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "video/mp4",
  "video/quicktime",
  "audio/mpeg",
  "audio/wav",
  "application/pdf",
  "text/plain",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
];

// Types
export interface VaultFileValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
  metadata: {
    size: number;
    mimeType: string;
    extension: string;
    isEncrypted: boolean;
  };
}

export interface EncryptionKeyInfo {
  keyId: string;
  userId: string;
  encryptionVersion: string;
  createdAt: Date;
  isActive: boolean;
  rotationDue?: Date;
}

export interface VaultSecurityAudit {
  fileId: string;
  userId: string;
  action: "upload" | "download" | "encrypt" | "decrypt" | "share" | "delete";
  timestamp: Date;
  ipAddress?: string;
  userAgent?: string;
  encryptionKeyId?: string;
  success: boolean;
  errorMessage?: string;
  fileMetadata?: {
    originalName: string;
    size: number;
    mimeType: string;
    isEncrypted: boolean;
  };
}

/**
 * Backend Vault Security Service
 * Handles server-side vault security operations
 */
export class VaultSecurityService {
  private static instance: VaultSecurityService;
  private sodiumReady: Promise<void>;
  private db: FirebaseFirestore.Firestore;

  private constructor() {
    this.sodiumReady = sodium.ready;
    this.db = getFirestore();
  }

  static getInstance(): VaultSecurityService {
    if (!VaultSecurityService.instance) {
      VaultSecurityService.instance = new VaultSecurityService();
    }
    return VaultSecurityService.instance;
  }

  private async ensureSodiumReady(): Promise<void> {
    await this.sodiumReady;
  }

  // MARK: - File Validation

  /**
   * Validate file for vault upload
   */
  async validateVaultFile(
    fileData: Buffer,
    originalName: string,
    mimeType: string,
    userId: string
  ): Promise<VaultFileValidationResult> {
    const errors: string[] = [];
    const warnings: string[] = [];

    try {
      // Basic validation
      if (!fileData || fileData.length === 0) {
        errors.push("File is empty");
      }

      if (fileData.length > MAX_FILE_SIZE) {
        errors.push(`File size exceeds maximum limit of ${MAX_FILE_SIZE / (1024 * 1024)}MB`);
      }

      // MIME type validation
      if (!ALLOWED_MIME_TYPES.includes(mimeType)) {
        errors.push(`File type '${mimeType}' is not allowed`);
      }

      // File extension validation
      const extension = originalName.split(".").pop()?.toLowerCase() || "";
      const expectedExtensions = this.getExpectedExtensions(mimeType);
      if (expectedExtensions.length > 0 && !expectedExtensions.includes(extension)) {
        warnings.push(`File extension '${extension}' doesn't match MIME type '${mimeType}'`);
      }

      // Content validation (magic bytes)
      const contentValidation = this.validateFileContent(fileData, mimeType);
      if (!contentValidation.isValid) {
        errors.push("File content does not match declared MIME type");
      }

      // Malware scanning (basic)
      const malwareCheck = await this.basicMalwareCheck(fileData, originalName);
      if (!malwareCheck.clean) {
        errors.push("File failed security scan");
      }

      // Check if file is already encrypted
      const isEncrypted = this.detectEncryption(fileData);

      // User quota check
      const quotaCheck = await this.checkUserQuota(userId, fileData.length);
      if (!quotaCheck.allowed) {
        errors.push(`Upload would exceed storage quota. Available: ${quotaCheck.remaining} bytes`);
      }

      const result: VaultFileValidationResult = {
        isValid: errors.length === 0,
        errors,
        warnings,
        metadata: {
          size: fileData.length,
          mimeType,
          extension,
          isEncrypted,
        },
      };

      // Log validation result
      logger.info("File validation completed", {
        userId,
        originalName,
        size: fileData.length,
        mimeType,
        isValid: result.isValid,
        errorCount: errors.length,
        warningCount: warnings.length,
      });

      return result;
    } catch (error) {
      logger.error("File validation failed", {
        userId,
        originalName,
        error: error instanceof Error ? error.message : "Unknown error",
      });

      return {
        isValid: false,
        errors: ["File validation failed due to internal error"],
        warnings: [],
        metadata: {
          size: fileData.length,
          mimeType,
          extension: originalName.split(".").pop()?.toLowerCase() || "",
          isEncrypted: false,
        },
      };
    }
  }

  /**
   * Validate file content using magic bytes
   */
  private validateFileContent(fileData: Buffer, mimeType: string): { isValid: boolean } {
    const magicBytes = fileData.slice(0, 16);

    // Check common file signatures
    const signatures: Record<string, number[][]> = {
      "image/jpeg": [[0xFF, 0xD8, 0xFF]],
      "image/png": [[0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]],
      "image/gif": [[0x47, 0x49, 0x46, 0x38, 0x37, 0x61], [0x47, 0x49, 0x46, 0x38, 0x39, 0x61]],
      "application/pdf": [[0x25, 0x50, 0x44, 0x46]],
      "video/mp4": [[0x00, 0x00, 0x00, 0x20, 0x66, 0x74, 0x79, 0x70]],
    };

    const expectedSignatures = signatures[mimeType];
    if (!expectedSignatures) {
      return {isValid: true}; // No signature check for this type
    }

    for (const signature of expectedSignatures) {
      if (signature.every((byte, index) => magicBytes[index] === byte)) {
        return {isValid: true};
      }
    }

    return {isValid: false};
  }

  /**
   * Basic malware detection using simple heuristics
   */
  private async basicMalwareCheck(
    fileData: Buffer,
    filename: string
  ): Promise<{ clean: boolean; reason?: string }> {
    // Check for suspicious file extensions
    const suspiciousExtensions = [
      "exe", "scr", "bat", "cmd", "com", "pif", "vbs", "js", "jar",
    ];

    const extension = filename.split(".").pop()?.toLowerCase();
    if (extension && suspiciousExtensions.includes(extension)) {
      return {clean: false, reason: "Suspicious file extension"};
    }

    // Check for embedded executables in other files
    const executableSignatures = [
      Buffer.from([0x4D, 0x5A]), // PE executable
      Buffer.from([0x7F, 0x45, 0x4C, 0x46]), // ELF executable
    ];

    for (const signature of executableSignatures) {
      if (fileData.includes(signature)) {
        return {clean: false, reason: "Contains executable code"};
      }
    }

    // Check file size vs content ratio (compressed files with high compression might be suspicious)
    if (fileData.length < 100 && filename.includes(".")) {
      return {clean: false, reason: "Suspiciously small file"};
    }

    return {clean: true};
  }

  /**
   * Detect if file is already encrypted
   */
  private detectEncryption(fileData: Buffer): boolean {
    // Check for high entropy (characteristic of encrypted data)
    const entropy = this.calculateEntropy(fileData.slice(0, 1024));

    // Check for libsodium secretstream header
    const sodiumHeader = fileData.slice(0, 24);

    // High entropy and no recognizable file signature suggests encryption
    return entropy > 7.5 || this.isLibsodiumHeader(sodiumHeader);
  }

  /**
   * Calculate Shannon entropy of data
   */
  private calculateEntropy(data: Buffer): number {
    const frequencies: number[] = new Array(256).fill(0);

    for (const byte of data) {
      frequencies[byte]++;
    }

    let entropy = 0;
    const length = data.length;

    for (const freq of frequencies) {
      if (freq > 0) {
        const probability = freq / length;
        entropy -= probability * Math.log2(probability);
      }
    }

    return entropy;
  }

  /**
   * Check if data looks like libsodium secretstream header
   */
  private isLibsodiumHeader(header: Buffer): boolean {
    // Basic heuristic - actual implementation would be more sophisticated
    return header.length >= 24 && this.calculateEntropy(header) > 7.0;
  }

  // MARK: - Key Management

  /**
   * Validate encryption key information
   */
  async validateEncryptionKey(
    keyId: string,
    userId: string
  ): Promise<{ valid: boolean; keyInfo?: EncryptionKeyInfo; error?: string }> {
    try {
      const keyDoc = await this.db
        .collection("vaultEncryptionKeys")
        .doc(keyId)
        .get();

      if (!keyDoc.exists) {
        return {valid: false, error: "Encryption key not found"};
      }

      const keyData = keyDoc.data();
      if (!keyData) {
        return {valid: false, error: "Invalid key data"};
      }

      // Verify key belongs to user
      if (keyData.userId !== userId) {
        return {valid: false, error: "Key does not belong to user"};
      }

      // Check if key is active
      if (!keyData.isActive) {
        return {valid: false, error: "Key is inactive"};
      }

      // Check key rotation
      if (keyData.rotationDue && new Date() > keyData.rotationDue.toDate()) {
        return {valid: false, error: "Key rotation overdue"};
      }

      const keyInfo: EncryptionKeyInfo = {
        keyId: keyDoc.id,
        userId: keyData.userId,
        encryptionVersion: keyData.encryptionVersion || "1.0",
        createdAt: keyData.createdAt.toDate(),
        isActive: keyData.isActive,
        rotationDue: keyData.rotationDue?.toDate(),
      };

      return {valid: true, keyInfo};
    } catch (error) {
      logger.error("Key validation failed", {
        keyId,
        userId,
        error: error instanceof Error ? error.message : "Unknown error",
      });

      return {valid: false, error: "Key validation failed"};
    }
  }

  // MARK: - User Quota Management

  /**
   * Check user storage quota
   */
  private async checkUserQuota(
    userId: string,
    additionalSize: number
  ): Promise<{ allowed: boolean; remaining: number; total: number }> {
    try {
      // Get user's current usage
      const usageDoc = await this.db
        .collection("userStorageUsage")
        .doc(userId)
        .get();

      const currentUsage = usageDoc.exists ? usageDoc.data()?.totalBytes || 0 : 0;

      // Get user's quota (default: 1GB for free users)
      const userDoc = await this.db
        .collection("users")
        .doc(userId)
        .get();

      const userData = userDoc.data();
      const quota = userData?.storageQuota || (1024 * 1024 * 1024); // 1GB default

      const newUsage = currentUsage + additionalSize;
      const remaining = quota - currentUsage;

      return {
        allowed: newUsage <= quota,
        remaining: Math.max(0, remaining),
        total: quota,
      };
    } catch (error) {
      logger.error("Quota check failed", {
        userId,
        additionalSize,
        error: error instanceof Error ? error.message : "Unknown error",
      });

      // Allow upload if quota check fails (fallback)
      return {
        allowed: true,
        remaining: 0,
        total: 0,
      };
    }
  }

  // MARK: - Audit Logging

  /**
   * Log vault security event
   */
  async logSecurityEvent(event: VaultSecurityAudit): Promise<void> {
    try {
      await this.db
        .collection("vaultSecurityAudits")
        .add({
          ...event,
          timestamp: new Date(),
        });

      logger.info("Security event logged", {
        fileId: event.fileId,
        userId: event.userId,
        action: event.action,
        success: event.success,
      });
    } catch (error) {
      logger.error("Failed to log security event", {
        event,
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  }

  // MARK: - Utility Methods

  /**
   * Get expected file extensions for MIME type
   */
  private getExpectedExtensions(mimeType: string): string[] {
    const extensionMap: Record<string, string[]> = {
      "image/jpeg": ["jpg", "jpeg"],
      "image/png": ["png"],
      "image/gif": ["gif"],
      "image/webp": ["webp"],
      "video/mp4": ["mp4"],
      "video/quicktime": ["mov"],
      "audio/mpeg": ["mp3"],
      "audio/wav": ["wav"],
      "application/pdf": ["pdf"],
      "text/plain": ["txt"],
      "application/msword": ["doc"],
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document": ["docx"],
      "application/vnd.ms-excel": ["xls"],
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": ["xlsx"],
    };

    return extensionMap[mimeType] || [];
  }

  /**
   * Generate secure random file ID
   */
  async generateSecureFileId(): Promise<string> {
    await this.ensureSodiumReady();
    const randomBytes = sodium.randombytes_buf(16);
    return sodium.to_hex(randomBytes);
  }

  /**
   * Validate vault item metadata
   */
  validateVaultItemMetadata(metadata: any): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (!metadata.originalName || typeof metadata.originalName !== "string") {
      errors.push("Original name is required");
    }

    if (!metadata.mimeType || typeof metadata.mimeType !== "string") {
      errors.push("MIME type is required");
    }

    if (!metadata.size || typeof metadata.size !== "number" || metadata.size <= 0) {
      errors.push("Valid file size is required");
    }

    if (!metadata.version || typeof metadata.version !== "string") {
      errors.push("Encryption version is required");
    }

    if (metadata.version !== VAULT_ENCRYPTION_VERSION) {
      errors.push(`Unsupported encryption version: ${metadata.version}`);
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }
}

export const vaultSecurityService = VaultSecurityService.getInstance();
