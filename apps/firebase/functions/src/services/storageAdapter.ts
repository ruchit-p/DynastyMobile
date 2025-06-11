import {getStorage} from "firebase-admin/storage";
import {logger} from "firebase-functions/v2";
import {getR2Service, R2Service} from "./r2Service";
import {getB2Service, B2Service} from "./b2Service";
import {getEnvironmentBucketName} from "../config/r2Secrets";
import {getEnvironmentBucketName as getB2EnvironmentBucketName} from "../config/b2Secrets";

export type StorageProvider = "firebase" | "r2" | "b2";

export interface StorageAdapterConfig {
  provider: StorageProvider;
  enableMigration?: boolean;
  r2Config?: {
    defaultBucket: string;
  };
  b2Config?: {
    defaultBucket: string;
  };
}

/**
 * Unified storage adapter that can work with Firebase Storage, Cloudflare R2, and Backblaze B2
 * This allows for gradual migration and A/B testing between providers
 */
export class StorageAdapter {
  private provider: StorageProvider;
  private r2Service: R2Service | null = null;
  private b2Service: B2Service | null = null;
  private firebaseStorage = getStorage();
  private config: StorageAdapterConfig;
  private r2Available: boolean = false;
  private b2Available: boolean = false;
  private connectivityChecked: boolean = false;

  constructor(config?: StorageAdapterConfig) {
    this.config = config || {
      provider: (process.env.STORAGE_PROVIDER as StorageProvider) || "firebase",
      enableMigration: process.env.ENABLE_STORAGE_MIGRATION === "true",
      r2Config: {
        defaultBucket: getEnvironmentBucketName(),
      },
      b2Config: {
        defaultBucket: getB2EnvironmentBucketName(),
      },
    };

    this.provider = this.config.provider;

    // In emulator mode, default to R2 but prepare for fallback
    if (process.env.FUNCTIONS_EMULATOR === "true" && !config?.provider) {
      this.provider = "r2";
      logger.info("Emulator mode detected, defaulting to R2 storage with Firebase fallback");
    }

    // Initialize services based on provider and migration settings
    if (this.provider === "r2" || this.config.enableMigration) {
      this.r2Service = getR2Service();
    }

    if (this.provider === "b2" || this.config.enableMigration) {
      this.b2Service = getB2Service();
    }

    logger.info("StorageAdapter initialized", {
      provider: this.provider,
      enableMigration: this.config.enableMigration,
      isEmulator: process.env.FUNCTIONS_EMULATOR === "true",
    });
  }

  /**
   * Check cloud storage connectivity and update provider if needed
   * This is called lazily on first operation to avoid blocking initialization
   */
  private async ensureProviderAvailability(): Promise<void> {
    // Only check once per instance
    if (this.connectivityChecked) {
      return;
    }

    this.connectivityChecked = true;

    // Check connectivity for cloud providers in emulator mode
    if (process.env.FUNCTIONS_EMULATOR === "true") {
      if (this.provider === "r2" && this.r2Service) {
        logger.info("Checking R2 connectivity for emulator mode...");
        try {
          this.r2Available = await this.r2Service.checkConnectivity(3000);
          if (!this.r2Available) {
            logger.warn("R2 not available in emulator mode, falling back to Firebase Storage emulator");
            this.provider = "firebase";
          } else {
            logger.info("R2 connectivity confirmed in emulator mode");
          }
        } catch (error) {
          logger.error("Error checking R2 connectivity", {error});
          this.r2Available = false;
          this.provider = "firebase";
        }
      } else if (this.provider === "b2" && this.b2Service) {
        logger.info("Checking B2 connectivity for emulator mode...");
        try {
          this.b2Available = await this.b2Service.checkConnectivity(3000);
          if (!this.b2Available) {
            logger.warn("B2 not available in emulator mode, falling back to Firebase Storage emulator");
            this.provider = "firebase";
          } else {
            logger.info("B2 connectivity confirmed in emulator mode");
          }
        } catch (error) {
          logger.error("Error checking B2 connectivity", {error});
          this.b2Available = false;
          this.provider = "firebase";
        }
      }
    } else {
      // For non-emulator environments, assume the configured provider is available
      this.r2Available = this.provider === "r2";
      this.b2Available = this.provider === "b2";
    }
  }

  /**
   * Generate a signed URL for upload
   * Overloaded to support both old parameter style and new options style
   */
  async generateUploadUrl(
    pathOrOptions: string | {
      path: string;
      contentType?: string;
      expiresIn?: number;
      metadata?: Record<string, string>;
      bucket?: string;
      provider?: StorageProvider;
    },
    contentType?: string,
    expiresIn?: number,
    metadata?: Record<string, string>
  ): Promise<{ signedUrl: string; provider: StorageProvider; bucket?: string; key?: string }> {
    // Handle both old and new parameter styles
    let options: {
      path: string;
      contentType?: string;
      expiresIn?: number;
      metadata?: Record<string, string>;
      bucket?: string;
      provider?: StorageProvider;
    };

    if (typeof pathOrOptions === "string") {
      // Old style: path, contentType, expiresIn, metadata
      options = {
        path: pathOrOptions,
        contentType,
        expiresIn,
        metadata,
      };
    } else {
      // New style: options object
      options = pathOrOptions;
    }

    const {
      path,
      contentType: cType = "application/octet-stream",
      expiresIn: expires = 3600,
      metadata: meta,
      bucket,
      provider = this.provider,
    } = options;

    // Ensure provider is available before operations
    await this.ensureProviderAvailability();

    // Use the actual provider after connectivity check
    const actualProvider = (provider === "r2" || provider === "b2") ? this.provider : provider;

    if (actualProvider === "r2" && this.r2Service) {
      const r2Bucket = bucket || this.config.r2Config?.defaultBucket;
      if (!r2Bucket) {
        throw new Error("R2 bucket not configured");
      }
      const signedUrl = await this.r2Service.generateUploadUrl({
        bucket: r2Bucket,
        key: path,
        contentType: cType,
        metadata: meta,
        expiresIn: expires,
      });

      return {
        signedUrl,
        provider: actualProvider as StorageProvider,
        bucket: r2Bucket,
        key: path,
      };
    } else if (actualProvider === "b2" && this.b2Service) {
      const b2Bucket = bucket || this.config.b2Config?.defaultBucket;
      if (!b2Bucket) {
        throw new Error("B2 bucket not configured");
      }
      const signedUrl = await this.b2Service.generateUploadUrl({
        bucket: b2Bucket,
        key: path,
        contentType: cType,
        metadata: meta,
        expiresIn: expires,
      });

      return {
        signedUrl,
        provider: actualProvider as StorageProvider,
        bucket: b2Bucket,
        key: path,
      };
    } else {
      // Firebase Storage
      const file = this.firebaseStorage.bucket().file(path);
      const signedUrlResponse = await file.getSignedUrl({
        version: "v4",
        action: "write",
        expires: Date.now() + (expires * 1000),
        contentType: cType,
        extensionHeaders: meta ? Object.entries(meta).reduce((acc, [key, value]) => {
          acc[`x-goog-meta-${key}`] = value;
          return acc;
        }, {} as Record<string, string>) : undefined,
      });

      const signedUrl = signedUrlResponse[0];

      return {
        signedUrl,
        provider: actualProvider as StorageProvider,
      };
    }
  }

  /**
   * Generate a signed URL for download
   * Overloaded to support both old parameter style and new options style
   */
  async generateDownloadUrl(
    pathOrOptions: string | {
      path: string;
      expiresIn?: number;
      bucket?: string;
      provider?: StorageProvider;
    },
    expiresIn?: number
  ): Promise<{ signedUrl: string; provider: StorageProvider }> {
    // Handle both old and new parameter styles
    let options: {
      path: string;
      expiresIn?: number;
      bucket?: string;
      provider?: StorageProvider;
    };

    if (typeof pathOrOptions === "string") {
      // Old style: path, expiresIn
      options = {
        path: pathOrOptions,
        expiresIn,
      };
    } else {
      // New style: options object
      options = pathOrOptions;
    }

    const {path, expiresIn: expires = 3600, bucket, provider = this.provider} = options;

    // Ensure provider is available before operations
    await this.ensureProviderAvailability();

    // Use the actual provider after connectivity check
    const actualProvider = (provider === "r2" || provider === "b2") ? this.provider : provider;

    if (actualProvider === "r2" && this.r2Service) {
      const r2Bucket = bucket || this.config.r2Config?.defaultBucket;
      if (!r2Bucket) {
        throw new Error("R2 bucket not configured");
      }
      const signedUrl = await this.r2Service.generateDownloadUrl({
        bucket: r2Bucket,
        key: path,
        expiresIn: expires,
      });
      return {signedUrl, provider: actualProvider as StorageProvider};
    } else if (actualProvider === "b2" && this.b2Service) {
      const b2Bucket = bucket || this.config.b2Config?.defaultBucket;
      if (!b2Bucket) {
        throw new Error("B2 bucket not configured");
      }
      const signedUrl = await this.b2Service.generateDownloadUrl({
        bucket: b2Bucket,
        key: path,
        expiresIn: expires,
      });
      return {signedUrl, provider: actualProvider as StorageProvider};
    } else {
      // Firebase Storage
      const file = this.firebaseStorage.bucket().file(path);
      const [signedUrl] = await file.getSignedUrl({
        version: "v4",
        action: "read",
        expires: Date.now() + (expires * 1000),
      });
      return {signedUrl, provider: actualProvider as StorageProvider};
    }
  }

  /**
   * Delete a file
   * Supports both string path and options object
   */
  async deleteFile(
    pathOrOptions: string | {
      path: string;
      bucket?: string;
      provider?: StorageProvider;
    }
  ): Promise<void> {
    let options: {
      path: string;
      bucket?: string;
      provider?: StorageProvider;
    };

    if (typeof pathOrOptions === "string") {
      options = {path: pathOrOptions};
    } else {
      options = pathOrOptions;
    }

    const {path, bucket, provider = this.provider} = options;

    // Ensure provider is available before operations
    await this.ensureProviderAvailability();

    // Use the actual provider after connectivity check
    const actualProvider = (provider === "r2" || provider === "b2") ? this.provider : provider;

    if (actualProvider === "r2" && this.r2Service) {
      const r2Bucket = bucket || this.config.r2Config?.defaultBucket;
      if (!r2Bucket) {
        throw new Error("R2 bucket not configured");
      }
      await this.r2Service.deleteObject(r2Bucket, path);
    } else if (actualProvider === "b2" && this.b2Service) {
      const b2Bucket = bucket || this.config.b2Config?.defaultBucket;
      if (!b2Bucket) {
        throw new Error("B2 bucket not configured");
      }
      await this.b2Service.deleteObject(b2Bucket, path);
    } else {
      // Firebase Storage
      await this.firebaseStorage.bucket().file(path).delete();
    }
  }

  /**
   * Check if a file exists
   */
  async fileExists(options: {
    path: string;
    bucket?: string;
    provider?: StorageProvider;
  }): Promise<boolean> {
    const {path, bucket, provider = this.provider} = options;

    // Ensure provider is available before operations
    await this.ensureProviderAvailability();

    // Use the actual provider after connectivity check
    const actualProvider = (provider === "r2" || provider === "b2") ? this.provider : provider;

    if (actualProvider === "r2" && this.r2Service) {
      const r2Bucket = bucket || this.config.r2Config?.defaultBucket;
      if (!r2Bucket) {
        throw new Error("R2 bucket not configured");
      }
      return await this.r2Service.objectExists(r2Bucket, path);
    } else if (actualProvider === "b2" && this.b2Service) {
      const b2Bucket = bucket || this.config.b2Config?.defaultBucket;
      if (!b2Bucket) {
        throw new Error("B2 bucket not configured");
      }
      return await this.b2Service.objectExists(b2Bucket, path);
    } else {
      // Firebase Storage
      const [exists] = await this.firebaseStorage.bucket().file(path).exists();
      return exists;
    }
  }

  /**
   * Copy a file from one provider to another (useful for migration)
   */
  async copyBetweenProviders(options: {
    sourcePath: string;
    sourceProvider: StorageProvider;
    sourceBucket?: string;
    destPath: string;
    destProvider: StorageProvider;
    destBucket?: string;
  }): Promise<void> {
    const {sourcePath, sourceProvider, sourceBucket, destPath, destProvider, destBucket} = options;

    if (sourceProvider === destProvider) {
      throw new Error("Source and destination providers must be different");
    }

    // Download from source
    const downloadResult = await this.generateDownloadUrl({
      path: sourcePath,
      provider: sourceProvider,
      bucket: sourceBucket,
      expiresIn: 300, // 5 minutes
    });

    const response = await fetch(downloadResult.signedUrl);
    if (!response.ok) {
      throw new Error(`Failed to download file: ${response.statusText}`);
    }

    const fileBuffer = await response.arrayBuffer();

    // Upload to destination
    // Temporarily set provider to generate URL for destination
    const originalProvider = this.provider;
    this.setProvider(destProvider);

    const uploadUrlResult = await this.generateUploadUrl({
      path: destPath,
      bucket: destBucket,
      contentType: response.headers.get("content-type") || undefined,
      expiresIn: 300,
    });

    // Restore original provider
    this.setProvider(originalProvider);

    const uploadResponse = await fetch(uploadUrlResult.signedUrl, {
      method: "PUT",
      body: fileBuffer,
      headers: {
        "Content-Type": response.headers.get("content-type") || "application/octet-stream",
      },
    });

    if (!uploadResponse.ok) {
      throw new Error(`Failed to upload file: ${uploadResponse.statusText}`);
    }

    logger.info("File copied between providers", {
      sourcePath,
      sourceProvider,
      destPath,
      destProvider,
    });
  }

  /**
   * Get the current storage provider
   */
  getProvider(): StorageProvider {
    return this.provider;
  }

  /**
   * Get current storage status including connectivity information
   * Useful for debugging and monitoring
   */
  async getStorageStatus(): Promise<{
    configuredProvider: StorageProvider;
    actualProvider: StorageProvider;
    r2Available: boolean;
    b2Available: boolean;
    connectivityChecked: boolean;
    bucket: string;
    isEmulator: boolean;
  }> {
    await this.ensureProviderAvailability();

    // Determine the appropriate bucket based on the actual provider
    let bucket = "default";
    if (this.provider === "r2") {
      bucket = this.config.r2Config?.defaultBucket || "default";
    } else if (this.provider === "b2") {
      bucket = this.config.b2Config?.defaultBucket || "default";
    }

    return {
      configuredProvider: this.config.provider,
      actualProvider: this.provider,
      r2Available: this.r2Available,
      b2Available: this.b2Available,
      connectivityChecked: this.connectivityChecked,
      bucket,
      isEmulator: process.env.FUNCTIONS_EMULATOR === "true",
    };
  }

  /**
   * Switch storage provider (useful for testing or gradual rollout)
   */
  setProvider(provider: StorageProvider): void {
    this.provider = provider;
    if (provider === "r2" && !this.r2Service) {
      this.r2Service = getR2Service();
    }
    if (provider === "b2" && !this.b2Service) {
      this.b2Service = getB2Service();
    }
    logger.info("Storage provider switched", {provider});
  }
}

// Export singleton instance
let storageAdapterInstance: StorageAdapter | null = null;

export function getStorageAdapter(config?: StorageAdapterConfig): StorageAdapter {
  if (!storageAdapterInstance) {
    storageAdapterInstance = new StorageAdapter(config);
  }
  return storageAdapterInstance;
}
