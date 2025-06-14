/**
 * Secure Vault Cache Service
 * Provides secure caching for vault files with proper access control and encryption
 */

import {logger} from "firebase-functions/v2";
import {getFirestore, Timestamp} from "firebase-admin/firestore";
import {createHash, randomBytes, createCipheriv, createDecipheriv} from "crypto";
import {FILE_SIZE_LIMITS} from "../common";

/**
 * Cache entry interface for vault files
 */
interface SecureVaultCacheEntry {
  userId: string;
  vaultItemId: string;
  fileHash: string;
  encryptedContent: string; // Base64 encoded encrypted content
  encryptionIV: string; // Initialization vector for encryption
  mimeType: string;
  fileSize: number;
  accessCount: number;
  lastAccessed: Timestamp;
  createdAt: Timestamp;
  expiresAt: Timestamp;
  accessControlHash: string; // Hash of user permissions for validation
}

/**
 * Cache metadata for monitoring and cleanup
 */
interface CacheMetadata {
  totalEntries: number;
  totalSizeBytes: number;
  oldestEntry: Timestamp;
  newestEntry: Timestamp;
  averageAccessCount: number;
}

/**
 * Access context for cache operations
 */
interface CacheAccessContext {
  userId: string;
  vaultItemId: string;
  userPermissions: string[]; // User's permissions for this vault item
  clientIP?: string;
  userAgent?: string;
}

export class SecureVaultCacheService {
  private static instance: SecureVaultCacheService;
  private readonly db = getFirestore();
  private readonly COLLECTION_NAME = "secureVaultCache";
  private readonly ENCRYPTION_ALGORITHM = "aes-256-gcm";
  private readonly CACHE_TTL_HOURS = 24; // Cache expires after 24 hours
  private readonly MAX_CACHE_SIZE_MB = 100; // Maximum cache size per user
  private readonly MAX_CACHED_FILE_SIZE = FILE_SIZE_LIMITS.MAX_FILE_SIZE; // Use standardized file limit

  private constructor() {}

  static getInstance(): SecureVaultCacheService {
    if (!SecureVaultCacheService.instance) {
      SecureVaultCacheService.instance = new SecureVaultCacheService();
    }
    return SecureVaultCacheService.instance;
  }

  /**
   * SECURITY: Cache vault file content with encryption and access control
   */
  async cacheVaultFile(
    content: Buffer,
    context: CacheAccessContext,
    mimeType: string
  ): Promise<{ success: boolean; cacheKey?: string; error?: string }> {
    try {
      // Security validation
      if (!this.validateCacheRequest(content, context)) {
        return {
          success: false,
          error: "Cache request validation failed"
        };
      }

      // Check user's cache quota
      const quotaCheck = await this.checkUserCacheQuota(context.userId, content.length);
      if (!quotaCheck.allowed) {
        return {
          success: false,
          error: quotaCheck.reason
        };
      }

      // Generate secure cache key
      const cacheKey = this.generateCacheKey(context);
      const fileHash = this.calculateFileHash(content);

      // Encrypt the content
      const encryptionResult = this.encryptContent(content);
      
      // Create access control hash for validation
      const accessControlHash = this.createAccessControlHash(context);

      // Store in Firestore with security metadata
      const cacheEntry: SecureVaultCacheEntry = {
        userId: context.userId,
        vaultItemId: context.vaultItemId,
        fileHash,
        encryptedContent: encryptionResult.encryptedContent,
        encryptionIV: encryptionResult.iv,
        mimeType,
        fileSize: content.length,
        accessCount: 0,
        lastAccessed: Timestamp.now(),
        createdAt: Timestamp.now(),
        expiresAt: Timestamp.fromDate(
          new Date(Date.now() + this.CACHE_TTL_HOURS * 60 * 60 * 1000)
        ),
        accessControlHash,
      };

      await this.db.collection(this.COLLECTION_NAME).doc(cacheKey).set(cacheEntry);

      // Log cache operation for security monitoring
      this.logCacheOperation("cache_created", context, {
        fileSize: content.length,
        mimeType,
        cacheKey,
      });

      return {
        success: true,
        cacheKey,
      };
    } catch (error) {
      logger.error("Error caching vault file", {
        userId: context.userId,
        vaultItemId: context.vaultItemId,
        error: error instanceof Error ? error.message : String(error),
      });

      return {
        success: false,
        error: "Internal cache error"
      };
    }
  }

  /**
   * SECURITY: Retrieve cached vault file with access control validation
   */
  async retrieveCachedVaultFile(
    cacheKey: string,
    context: CacheAccessContext
  ): Promise<{ 
    success: boolean; 
    content?: Buffer; 
    mimeType?: string; 
    error?: string;
  }> {
    try {
      // Get cache entry
      const doc = await this.db.collection(this.COLLECTION_NAME).doc(cacheKey).get();
      
      if (!doc.exists) {
        return {
          success: false,
          error: "Cache entry not found"
        };
      }

      const cacheEntry = doc.data() as SecureVaultCacheEntry;

      // Security validations
      const validationResult = this.validateCacheAccess(cacheEntry, context);
      if (!validationResult.valid) {
        this.logCacheSecurityViolation("access_denied", context, validationResult.reason);
        return {
          success: false,
          error: "Access denied"
        };
      }

      // Check if cache entry has expired
      if (cacheEntry.expiresAt.toDate() < new Date()) {
        // Clean up expired entry
        await doc.ref.delete();
        return {
          success: false,
          error: "Cache entry expired"
        };
      }

      // Decrypt content
      const decryptedContent = this.decryptContent(
        cacheEntry.encryptedContent,
        cacheEntry.encryptionIV
      );

      // Update access metadata
      await doc.ref.update({
        accessCount: cacheEntry.accessCount + 1,
        lastAccessed: Timestamp.now(),
      });

      // Log successful cache access
      this.logCacheOperation("cache_accessed", context, {
        accessCount: cacheEntry.accessCount + 1,
        fileSize: cacheEntry.fileSize,
      });

      return {
        success: true,
        content: decryptedContent,
        mimeType: cacheEntry.mimeType,
      };
    } catch (error) {
      logger.error("Error retrieving cached vault file", {
        cacheKey,
        userId: context.userId,
        error: error instanceof Error ? error.message : String(error),
      });

      return {
        success: false,
        error: "Internal cache error"
      };
    }
  }

  /**
   * SECURITY: Invalidate cache entries for a specific vault item
   */
  async invalidateVaultItemCache(
    vaultItemId: string,
    userId: string
  ): Promise<{ success: boolean; entriesRemoved: number }> {
    try {
      const query = await this.db
        .collection(this.COLLECTION_NAME)
        .where("vaultItemId", "==", vaultItemId)
        .where("userId", "==", userId)
        .get();

      if (query.empty) {
        return { success: true, entriesRemoved: 0 };
      }

      const batch = this.db.batch();
      query.forEach(doc => batch.delete(doc.ref));
      await batch.commit();

      logger.info("Invalidated vault item cache", {
        vaultItemId,
        userId,
        entriesRemoved: query.size,
      });

      return { success: true, entriesRemoved: query.size };
    } catch (error) {
      logger.error("Error invalidating vault item cache", {
        vaultItemId,
        userId,
        error: error instanceof Error ? error.message : String(error),
      });

      return { success: false, entriesRemoved: 0 };
    }
  }

  /**
   * Clean up expired cache entries and enforce quotas
   */
  async cleanupCache(): Promise<CacheMetadata> {
    try {
      const now = Timestamp.now();
      
      // Clean up expired entries
      const expiredQuery = await this.db
        .collection(this.COLLECTION_NAME)
        .where("expiresAt", "<", now)
        .limit(100)
        .get();

      if (!expiredQuery.empty) {
        const batch = this.db.batch();
        expiredQuery.forEach(doc => batch.delete(doc.ref));
        await batch.commit();

        logger.info(`Cleaned up ${expiredQuery.size} expired cache entries`);
      }

      // Get cache metadata
      const allEntriesQuery = await this.db
        .collection(this.COLLECTION_NAME)
        .get();

      const metadata: CacheMetadata = {
        totalEntries: allEntriesQuery.size,
        totalSizeBytes: 0,
        oldestEntry: now,
        newestEntry: Timestamp.fromDate(new Date(0)),
        averageAccessCount: 0,
      };

      let totalAccessCount = 0;

      allEntriesQuery.forEach(doc => {
        const entry = doc.data() as SecureVaultCacheEntry;
        metadata.totalSizeBytes += entry.fileSize;
        totalAccessCount += entry.accessCount;

        if (entry.createdAt.toMillis() < metadata.oldestEntry.toMillis()) {
          metadata.oldestEntry = entry.createdAt;
        }
        if (entry.createdAt.toMillis() > metadata.newestEntry.toMillis()) {
          metadata.newestEntry = entry.createdAt;
        }
      });

      metadata.averageAccessCount = metadata.totalEntries > 0 
        ? totalAccessCount / metadata.totalEntries 
        : 0;

      return metadata;
    } catch (error) {
      logger.error("Error during cache cleanup", error);
      throw error;
    }
  }

  /**
   * SECURITY: Validate cache request against security policies
   */
  private validateCacheRequest(content: Buffer, context: CacheAccessContext): boolean {
    // Check file size limit
    if (content.length > this.MAX_CACHED_FILE_SIZE) {
      logger.warn("Cache request rejected: file too large", {
        userId: context.userId,
        fileSize: content.length,
        maxSize: this.MAX_CACHED_FILE_SIZE,
      });
      return false;
    }

    // Check user permissions (basic validation)
    if (!context.userPermissions.includes("read")) {
      logger.warn("Cache request rejected: insufficient permissions", {
        userId: context.userId,
        permissions: context.userPermissions,
      });
      return false;
    }

    return true;
  }

  /**
   * SECURITY: Validate cache access permissions
   */
  private validateCacheAccess(
    cacheEntry: SecureVaultCacheEntry,
    context: CacheAccessContext
  ): { valid: boolean; reason?: string } {
    // User must match
    if (cacheEntry.userId !== context.userId) {
      return { valid: false, reason: "User mismatch" };
    }

    // Vault item must match
    if (cacheEntry.vaultItemId !== context.vaultItemId) {
      return { valid: false, reason: "Vault item mismatch" };
    }

    // Validate access control hash
    const expectedHash = this.createAccessControlHash(context);
    if (cacheEntry.accessControlHash !== expectedHash) {
      return { valid: false, reason: "Access control validation failed" };
    }

    return { valid: true };
  }

  /**
   * Check user's cache quota
   */
  private async checkUserCacheQuota(
    userId: string,
    newFileSize: number
  ): Promise<{ allowed: boolean; reason?: string }> {
    try {
      const userCacheQuery = await this.db
        .collection(this.COLLECTION_NAME)
        .where("userId", "==", userId)
        .get();

      let totalUserCacheSize = 0;
      userCacheQuery.forEach(doc => {
        const entry = doc.data() as SecureVaultCacheEntry;
        totalUserCacheSize += entry.fileSize;
      });

      const maxCacheSizeBytes = this.MAX_CACHE_SIZE_MB * 1024 * 1024;
      
      if (totalUserCacheSize + newFileSize > maxCacheSizeBytes) {
        return {
          allowed: false,
          reason: `Cache quota exceeded. Current: ${Math.round(totalUserCacheSize / (1024 * 1024))}MB, Max: ${this.MAX_CACHE_SIZE_MB}MB`
        };
      }

      return { allowed: true };
    } catch (error) {
      logger.error("Error checking cache quota", { userId, error });
      return { allowed: false, reason: "Quota check failed" };
    }
  }

  /**
   * Generate secure cache key
   */
  private generateCacheKey(context: CacheAccessContext): string {
    const keyData = `${context.userId}:${context.vaultItemId}:${Date.now()}`;
    return createHash("sha256").update(keyData).digest("hex");
  }

  /**
   * Calculate file hash for integrity checking
   */
  private calculateFileHash(content: Buffer): string {
    return createHash("sha256").update(content).digest("hex");
  }

  /**
   * Encrypt content for secure caching
   */
  private encryptContent(content: Buffer): { encryptedContent: string; iv: string } {
    const key = this.getCacheEncryptionKey();
    const iv = randomBytes(16);
    const cipher = createCipheriv(this.ENCRYPTION_ALGORITHM, key, iv);
    
    let encrypted = cipher.update(content);
    encrypted = Buffer.concat([encrypted, cipher.final()]);
    
    return {
      encryptedContent: encrypted.toString("base64"),
      iv: iv.toString("hex"),
    };
  }

  /**
   * Decrypt cached content
   */
  private decryptContent(encryptedContent: string, ivHex: string): Buffer {
    const key = this.getCacheEncryptionKey();
    const iv = Buffer.from(ivHex, "hex");
    const encryptedBuffer = Buffer.from(encryptedContent, "base64");
    
    const decipher = createDecipheriv(this.ENCRYPTION_ALGORITHM, key, iv);
    let decrypted = decipher.update(encryptedBuffer);
    decrypted = Buffer.concat([decrypted, decipher.final()]);
    
    return decrypted;
  }

  /**
   * Get encryption key for cache (should be from environment or secret manager)
   */
  private getCacheEncryptionKey(): Buffer {
    // In production, this should come from Firebase Secret Manager
    const keyString = process.env.VAULT_CACHE_ENCRYPTION_KEY || "default-key-for-development-only";
    return createHash("sha256").update(keyString).digest();
  }

  /**
   * Create access control hash for validation
   */
  private createAccessControlHash(context: CacheAccessContext): string {
    const accessData = `${context.userId}:${context.vaultItemId}:${context.userPermissions.sort().join(",")}`;
    return createHash("sha256").update(accessData).digest("hex");
  }

  /**
   * Log cache operations for security monitoring
   */
  private logCacheOperation(
    operation: string,
    context: CacheAccessContext,
    metadata?: Record<string, any>
  ): void {
    logger.info("Vault cache operation", {
      operation,
      userId: context.userId,
      vaultItemId: context.vaultItemId,
      clientIP: context.clientIP,
      timestamp: new Date().toISOString(),
      ...metadata,
    });
  }

  /**
   * Log security violations for monitoring
   */
  private logCacheSecurityViolation(
    violationType: string,
    context: CacheAccessContext,
    reason?: string
  ): void {
    logger.warn("Vault cache security violation", {
      violationType,
      userId: context.userId,
      vaultItemId: context.vaultItemId,
      reason,
      clientIP: context.clientIP,
      userAgent: context.userAgent,
      timestamp: new Date().toISOString(),
    });
  }
}

// Export singleton instance
export const secureVaultCacheService = SecureVaultCacheService.getInstance();