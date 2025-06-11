import {S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand, HeadObjectCommand, ListObjectsV2Command, CopyObjectCommand} from "@aws-sdk/client-s3";
import {getSignedUrl} from "@aws-sdk/s3-request-presigner";
import {logger} from "firebase-functions/v2";
import {getB2Config, getB2S3Config, validateB2Config} from "../config/b2Config";
import {B2_DEFAULTS} from "../config/b2Secrets";

export interface B2Config {
  keyId: string;
  applicationKey: string;
  endpoint?: string;
  region?: string;
  bucketName?: string;
  bucketId?: string;
  retry?: {
    enabled: boolean;
    maxRetries?: number;
    initialDelay?: number;
  };
}

export interface B2UploadOptions {
  bucket: string;
  key: string;
  contentType?: string;
  metadata?: Record<string, string>;
  expiresIn?: number;
  checksumSHA1?: string; // B2 supports SHA1 checksums
}

export interface B2DownloadOptions {
  bucket: string;
  key: string;
  expiresIn?: number;
}

/**
 * B2Service provides S3-compatible interface for Backblaze B2
 * Uses AWS SDK S3 client with B2's S3-compatible endpoint
 */
export class B2Service {
  private s3Client: S3Client;
  private config: ReturnType<typeof getB2Config>;
  private retryConfig: {
    enabled: boolean;
    maxRetries: number;
    initialDelay: number;
  };

  constructor(config?: B2Config) {
    // Validate configuration first
    const validation = validateB2Config();
    if (!validation.valid) {
      throw new Error(`B2 configuration invalid: ${validation.errors.join(", ")}`);
    }

    // Use provided config or get from Firebase/env
    this.config = config ? this.parseCustomConfig(config) : getB2Config();

    // Set retry configuration with B2-specific defaults
    this.retryConfig = {
      enabled: config?.retry?.enabled ?? true,
      maxRetries: config?.retry?.maxRetries ?? B2_DEFAULTS.maxRetries,
      initialDelay: config?.retry?.initialDelay ?? B2_DEFAULTS.retryDelayBase,
    };

    // Create S3 client with B2 configuration
    const s3Config = getB2S3Config();
    this.s3Client = new S3Client(s3Config);

    logger.info("B2Service initialized", {
      endpoint: s3Config.endpoint,
      region: s3Config.region,
      baseBucket: this.config.baseBucket,
      retryEnabled: this.retryConfig.enabled,
      maxRetries: this.retryConfig.maxRetries,
    });
  }

  /**
   * Parse custom config to match our internal format
   */
  private parseCustomConfig(config: B2Config): ReturnType<typeof getB2Config> {
    return {
      keyId: config.keyId,
      applicationKey: config.applicationKey,
      endpoint: config.endpoint || B2_DEFAULTS.endpoint,
      region: config.region || B2_DEFAULTS.region,
      baseBucket: config.bucketName || "dynasty",
      bucketId: config.bucketId,
      enableMigration: false,
      migrationPercentage: 0,
      storageProvider: "b2",
      downloadUrl: undefined,
    };
  }

  /**
   * Wrap an operation with retry logic
   * B2 has specific retry recommendations
   */
  private async withRetry<T>(
    operation: () => Promise<T>,
    operationName: string
  ): Promise<T> {
    if (!this.retryConfig.enabled) {
      return operation();
    }

    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= this.retryConfig.maxRetries; attempt++) {
      try {
        return await operation();
      } catch (error: any) {
        lastError = error;

        // Don't retry on client errors (4xx) except for 408, 429
        const statusCode = error.$metadata?.httpStatusCode;
        if (statusCode >= 400 && statusCode < 500) {
          // Retry on specific client errors that might be transient
          if (statusCode !== 408 && statusCode !== 429) {
            throw error;
          }
        }

        if (attempt < this.retryConfig.maxRetries) {
          const delay = this.retryConfig.initialDelay * Math.pow(2, attempt - 1); // Exponential backoff
          logger.warn(`B2 ${operationName} failed (attempt ${attempt}/${this.retryConfig.maxRetries}), retrying in ${delay}ms`, {
            error: error.message,
            statusCode,
            errorCode: error.code,
          });
          await new Promise((resolve) => setTimeout(resolve, delay));
        }
      }
    }

    logger.error(`B2 ${operationName} failed after ${this.retryConfig.maxRetries} attempts`, {error: lastError});
    throw lastError;
  }

  /**
   * Generate a signed URL for uploading a file to B2
   * B2's S3-compatible API supports standard S3 operations
   */
  async generateUploadUrl(options: B2UploadOptions): Promise<string> {
    return this.withRetry(async () => {
      const {bucket, key, contentType, metadata, expiresIn = 3600, checksumSHA1} = options;

      // Validate expiration time (B2 has limits)
      const maxExpiry = B2_DEFAULTS.maxSignedUrlExpiry;
      if (expiresIn > maxExpiry) {
        logger.warn(`B2 signed URL expiration ${expiresIn}s exceeds maximum ${maxExpiry}s, capping to maximum`);
      }
      const actualExpiresIn = Math.min(expiresIn, maxExpiry);

      const commandOptions: any = {
        Bucket: bucket,
        Key: key,
        ContentType: contentType,
        Metadata: metadata,
      };

      // Add checksum if provided (B2 supports SHA1)
      if (checksumSHA1) {
        commandOptions.ChecksumSHA1 = checksumSHA1;
      }

      const command = new PutObjectCommand(commandOptions);

      try {
        const signedUrl = await getSignedUrl(this.s3Client, command, {expiresIn: actualExpiresIn});
        logger.info("Generated B2 upload URL", {bucket, key, expiresIn: actualExpiresIn});
        return signedUrl;
      } catch (error) {
        logger.error("Failed to generate B2 upload URL", {bucket, key, error});
        throw error;
      }
    }, "generateUploadUrl");
  }

  /**
   * Generate a signed URL for downloading a file from B2
   */
  async generateDownloadUrl(options: B2DownloadOptions): Promise<string> {
    return this.withRetry(async () => {
      const {bucket, key, expiresIn = 3600} = options;

      // Validate expiration time
      const maxExpiry = B2_DEFAULTS.maxSignedUrlExpiry;
      const actualExpiresIn = Math.min(expiresIn, maxExpiry);

      const command = new GetObjectCommand({
        Bucket: bucket,
        Key: key,
      });

      try {
        const signedUrl = await getSignedUrl(this.s3Client, command, {expiresIn: actualExpiresIn});
        logger.info("Generated B2 download URL", {bucket, key, expiresIn: actualExpiresIn});
        return signedUrl;
      } catch (error) {
        logger.error("Failed to generate B2 download URL", {bucket, key, error});
        throw error;
      }
    }, "generateDownloadUrl");
  }

  /**
   * Delete an object from B2
   */
  async deleteObject(bucket: string, key: string): Promise<void> {
    return this.withRetry(async () => {
      const command = new DeleteObjectCommand({
        Bucket: bucket,
        Key: key,
      });

      try {
        await this.s3Client.send(command);
        logger.info("Deleted object from B2", {bucket, key});
      } catch (error) {
        logger.error("Failed to delete B2 object", {bucket, key, error});
        throw error;
      }
    }, "deleteObject");
  }

  /**
   * Check if an object exists in B2
   */
  async objectExists(bucket: string, key: string): Promise<boolean> {
    const command = new HeadObjectCommand({
      Bucket: bucket,
      Key: key,
    });

    try {
      await this.s3Client.send(command);
      return true;
    } catch (error: any) {
      if (error.name === "NotFound" || error.$metadata?.httpStatusCode === 404) {
        return false;
      }
      logger.error("Failed to check B2 object existence", {bucket, key, error});
      throw error;
    }
  }

  /**
   * List objects in a B2 bucket with optional prefix
   */
  async listObjects(bucket: string, prefix?: string, maxKeys: number = 1000): Promise<{
    objects: Array<{ key: string; size: number; lastModified: Date; etag?: string }>;
    isTruncated: boolean;
    nextContinuationToken?: string;
  }> {
    const command = new ListObjectsV2Command({
      Bucket: bucket,
      Prefix: prefix,
      MaxKeys: maxKeys,
    });

    try {
      const response = await this.s3Client.send(command);

      const objects = (response.Contents || []).map((obj) => ({
        key: obj.Key!,
        size: obj.Size || 0,
        lastModified: obj.LastModified!,
        etag: obj.ETag,
      }));

      return {
        objects,
        isTruncated: response.IsTruncated || false,
        nextContinuationToken: response.NextContinuationToken,
      };
    } catch (error) {
      logger.error("Failed to list B2 objects", {bucket, prefix, error});
      throw error;
    }
  }

  /**
   * Check if B2 service is reachable
   * @param timeout - Maximum time to wait for connection in milliseconds (default: 5000)
   * @returns true if B2 is reachable, false otherwise
   */
  async checkConnectivity(timeout: number = 5000): Promise<boolean> {
    try {
      const config = getB2Config();
      const bucket = config.baseBucket;

      // Try to list objects with a very small limit to test connectivity
      const command = new ListObjectsV2Command({
        Bucket: bucket,
        MaxKeys: 1,
      });

      // Create a promise that rejects after timeout
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error("B2 connectivity check timeout")), timeout);
      });

      // Race between the actual request and timeout
      await Promise.race([
        this.s3Client.send(command),
        timeoutPromise,
      ]);

      logger.info("B2 connectivity check succeeded", {bucket});
      return true;
    } catch (error) {
      logger.warn("B2 connectivity check failed", {
        error: error instanceof Error ? error.message : "Unknown error",
        timeout,
      });
      return false;
    }
  }

  /**
   * Get bucket name for different content types
   * Uses same logic as R2Service for consistency
   */
  static getBucketName(): string {
    // Get the bucket name from centralized configuration
    const config = getB2Config();
    return config.baseBucket;
  }

  /**
   * Generate a storage key with proper structure
   * Compatible with R2Service key structure for easier migration
   */
  static generateStorageKey(
    contentType: "vault" | "stories" | "events" | "profiles",
    userId: string,
    fileName: string,
    parentId?: string
  ): string {
    const timestamp = Date.now();
    const sanitizedFileName = fileName.replace(/[^a-zA-Z0-9._-]/g, "_");

    // Add content type as prefix for organization in single bucket
    switch (contentType) {
    case "vault":
      return `vault/${userId}/${parentId || "root"}/${timestamp}_${sanitizedFileName}`;
    case "stories":
      return `stories/${userId}/${timestamp}_${sanitizedFileName}`;
    case "events":
      return `events/${parentId || "general"}/${timestamp}_${sanitizedFileName}`;
    case "profiles":
      return `profiles/${userId}/${timestamp}_${sanitizedFileName}`;
    default:
      return `temp/${userId}/${timestamp}_${sanitizedFileName}`;
    }
  }

  /**
   * Get B2 download URL (may be different from signed URL for performance)
   * B2 allows direct downloads without signatures for public buckets
   */
  async getDirectDownloadUrl(bucket: string, key: string): Promise<string> {
    // For private buckets, fallback to signed URL
    if (!this.config.downloadUrl) {
      return this.generateDownloadUrl({bucket, key, expiresIn: 3600});
    }

    // If custom download URL is configured (for CDN, etc.)
    return `${this.config.downloadUrl}/${bucket}/${key}`;
  }

  /**
   * Get object metadata including B2-specific information
   */
  async getObjectMetadata(bucket: string, key: string): Promise<{
    size: number;
    lastModified: Date;
    contentType?: string;
    etag?: string;
    metadata?: Record<string, string>;
    checksumSHA1?: string;
  }> {
    const command = new HeadObjectCommand({
      Bucket: bucket,
      Key: key,
    });

    try {
      const response = await this.s3Client.send(command);
      return {
        size: response.ContentLength || 0,
        lastModified: response.LastModified!,
        contentType: response.ContentType,
        etag: response.ETag,
        metadata: response.Metadata,
        checksumSHA1: response.ChecksumSHA1,
      };
    } catch (error) {
      logger.error("Failed to get B2 object metadata", {bucket, key, error});
      throw error;
    }
  }

  /**
   * Copy object within B2 (server-side copy for efficiency)
   */
  async copyObject(
    sourceBucket: string,
    sourceKey: string,
    destBucket: string,
    destKey: string,
    metadata?: Record<string, string>
  ): Promise<void> {
    const command = new CopyObjectCommand({
      Bucket: destBucket,
      Key: destKey,
      CopySource: `${sourceBucket}/${sourceKey}`,
      Metadata: metadata,
      MetadataDirective: metadata ? "REPLACE" : "COPY",
    });

    try {
      await this.s3Client.send(command);
      logger.info("Copied object in B2", {sourceBucket, sourceKey, destBucket, destKey});
    } catch (error) {
      logger.error("Failed to copy B2 object", {sourceBucket, sourceKey, destBucket, destKey, error});
      throw error;
    }
  }
}

// Export singleton instance
let b2ServiceInstance: B2Service | null = null;

export function getB2Service(): B2Service {
  if (!b2ServiceInstance) {
    b2ServiceInstance = new B2Service();
  }
  return b2ServiceInstance;
}

// Export function to reset singleton (useful for testing)
export function resetB2ServiceInstance(): void {
  b2ServiceInstance = null;
}
