import {S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand, HeadObjectCommand, ListObjectsV2Command} from "@aws-sdk/client-s3";
import {getSignedUrl} from "@aws-sdk/s3-request-presigner";
import {logger} from "firebase-functions/v2";
import {getR2Config} from "../config/r2Config";

export interface R2Config {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  endpoint?: string;
  retry?: {
    enabled: boolean;
    maxRetries?: number;
    initialDelay?: number;
  };
}

export interface R2UploadOptions {
  bucket: string;
  key: string;
  contentType?: string;
  metadata?: Record<string, string>;
  expiresIn?: number;
}

export interface R2DownloadOptions {
  bucket: string;
  key: string;
  expiresIn?: number;
}

export class R2Service {
  private s3Client: S3Client;
  private config: R2Config;
  private retryConfig: {
    enabled: boolean;
    maxRetries: number;
    initialDelay: number;
  };

  constructor(config?: R2Config) {
    // Use provided config or get from Firebase/env
    this.config = config || getR2Config();

    // Set retry configuration with defaults
    this.retryConfig = {
      enabled: this.config.retry?.enabled ?? true,
      maxRetries: this.config.retry?.maxRetries ?? 3,
      initialDelay: this.config.retry?.initialDelay ?? 1000,
    };

    const endpoint = this.config.endpoint ||
      `https://${this.config.accountId}.r2.cloudflarestorage.com`;

    this.s3Client = new S3Client({
      endpoint,
      region: "auto",
      credentials: {
        accessKeyId: this.config.accessKeyId,
        secretAccessKey: this.config.secretAccessKey,
      },
    });

    logger.info("R2Service initialized", {
      endpoint,
      retryEnabled: this.retryConfig.enabled,
      maxRetries: this.retryConfig.maxRetries,
    });
  }

  /**
   * Wrap an operation with retry logic
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

        // Don't retry on client errors (4xx)
        if (error.$metadata?.httpStatusCode >= 400 && error.$metadata?.httpStatusCode < 500) {
          throw error;
        }

        if (attempt < this.retryConfig.maxRetries) {
          const delay = this.retryConfig.initialDelay * Math.pow(2, attempt - 1); // Exponential backoff
          logger.warn(`R2 ${operationName} failed (attempt ${attempt}/${this.retryConfig.maxRetries}), retrying in ${delay}ms`, {
            error: error.message,
            statusCode: error.$metadata?.httpStatusCode,
          });
          await new Promise((resolve) => setTimeout(resolve, delay));
        }
      }
    }

    logger.error(`R2 ${operationName} failed after ${this.retryConfig.maxRetries} attempts`, {error: lastError});
    throw lastError;
  }

  /**
   * Generate a signed URL for uploading a file to R2
   */
  async generateUploadUrl(options: R2UploadOptions): Promise<string> {
    return this.withRetry(async () => {
      const {bucket, key, contentType, metadata, expiresIn = 3600} = options;

      const command = new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        ContentType: contentType,
        Metadata: metadata,
      });

      try {
        const signedUrl = await getSignedUrl(this.s3Client, command, {expiresIn});
        logger.info("Generated upload URL", {bucket, key, expiresIn});
        return signedUrl;
      } catch (error) {
        logger.error("Failed to generate upload URL", {bucket, key, error});
        throw error;
      }
    }, "generateUploadUrl");
  }

  /**
   * Generate a signed URL for downloading a file from R2
   */
  async generateDownloadUrl(options: R2DownloadOptions): Promise<string> {
    return this.withRetry(async () => {
      const {bucket, key, expiresIn = 3600} = options;

      const command = new GetObjectCommand({
        Bucket: bucket,
        Key: key,
      });

      try {
        const signedUrl = await getSignedUrl(this.s3Client, command, {expiresIn});
        logger.info("Generated download URL", {bucket, key, expiresIn});
        return signedUrl;
      } catch (error) {
        logger.error("Failed to generate download URL", {bucket, key, error});
        throw error;
      }
    }, "generateDownloadUrl");
  }

  /**
   * Delete an object from R2
   */
  async deleteObject(bucket: string, key: string): Promise<void> {
    return this.withRetry(async () => {
      const command = new DeleteObjectCommand({
        Bucket: bucket,
        Key: key,
      });

      try {
        await this.s3Client.send(command);
        logger.info("Deleted object from R2", {bucket, key});
      } catch (error) {
        logger.error("Failed to delete object", {bucket, key, error});
        throw error;
      }
    }, "deleteObject");
  }

  /**
   * Check if an object exists in R2
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
      logger.error("Failed to check object existence", {bucket, key, error});
      throw error;
    }
  }

  /**
   * List objects in a bucket with optional prefix
   */
  async listObjects(bucket: string, prefix?: string, maxKeys: number = 1000): Promise<{
    objects: Array<{ key: string; size: number; lastModified: Date }>;
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
      }));

      return {
        objects,
        isTruncated: response.IsTruncated || false,
        nextContinuationToken: response.NextContinuationToken,
      };
    } catch (error) {
      logger.error("Failed to list objects", {bucket, prefix, error});
      throw error;
    }
  }

  /**
   * Check if R2 service is reachable
   * @param timeout - Maximum time to wait for connection in milliseconds (default: 5000)
   * @returns true if R2 is reachable, false otherwise
   */
  async checkConnectivity(timeout: number = 5000): Promise<boolean> {
    try {
      const config = getR2Config();
      const bucket = config.baseBucket;

      // Try to list objects with a very small limit to test connectivity
      const command = new ListObjectsV2Command({
        Bucket: bucket,
        MaxKeys: 1,
      });

      // Create a promise that rejects after timeout
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error("R2 connectivity check timeout")), timeout);
      });

      // Race between the actual request and timeout
      await Promise.race([
        this.s3Client.send(command),
        timeoutPromise,
      ]);

      logger.info("R2 connectivity check succeeded", {bucket});
      return true;
    } catch (error) {
      logger.warn("R2 connectivity check failed", {
        error: error instanceof Error ? error.message : "Unknown error",
        timeout,
      });
      return false;
    }
  }

  /**
   * Get bucket name for different content types
   */
  static getBucketName(): string {
    // Get the bucket name from centralized configuration
    const config = getR2Config();
    return config.baseBucket;
  }

  /**
   * Generate a storage key with proper structure
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
}

// Export singleton instance
let r2ServiceInstance: R2Service | null = null;

export function getR2Service(): R2Service {
  if (!r2ServiceInstance) {
    r2ServiceInstance = new R2Service();
  }
  return r2ServiceInstance;
}
