import {S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand, HeadObjectCommand, ListObjectsV2Command} from "@aws-sdk/client-s3";
import {getSignedUrl} from "@aws-sdk/s3-request-presigner";
import {logger} from "firebase-functions/v2";
import {getR2Config} from "../config/r2Config";

export interface R2Config {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  endpoint?: string;
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

  constructor(config?: R2Config) {
    // Use provided config or get from Firebase/env
    this.config = config || getR2Config();

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

    logger.info("R2Service initialized", {endpoint});
  }

  /**
   * Generate a signed URL for uploading a file to R2
   */
  async generateUploadUrl(options: R2UploadOptions): Promise<string> {
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
  }

  /**
   * Generate a signed URL for downloading a file from R2
   */
  async generateDownloadUrl(options: R2DownloadOptions): Promise<string> {
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
  }

  /**
   * Delete an object from R2
   */
  async deleteObject(bucket: string, key: string): Promise<void> {
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
   * Get bucket name for different content types
   */
  static getBucketName(): string {
    // Use environment-specific bucket naming
    const env = process.env.NODE_ENV === "production" ? "prod" : "dev";
    const baseBucket = process.env.R2_BASE_BUCKET || "dynasty";

    // For now, use single bucket with folder structure
    // In production, you might want separate buckets for different content types
    return `${baseBucket}${env}`;
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
