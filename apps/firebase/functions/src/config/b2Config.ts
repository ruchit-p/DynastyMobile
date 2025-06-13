import {B2_CONFIG, B2_BASE_BUCKET} from "./b2Secrets";

interface B2ConfigData {
  keyId: string;
  applicationKey: string;
  bucketId?: string;
  bucketName?: string;
}

/**
 * B2 configuration that works in both local and deployed environments
 * Compatible with Backblaze B2's S3-compatible API
 */
export function getB2Config() {
  // For local development with emulator
  if (process.env.FUNCTIONS_EMULATOR === "true") {
    // Try to parse B2_CONFIG as JSON first, fallback to individual env vars
    if (process.env.B2_CONFIG) {
      try {
        const config: B2ConfigData = JSON.parse(process.env.B2_CONFIG);
        return {
          // B2 uses keyId instead of accessKeyId
          keyId: config.keyId,
          applicationKey: config.applicationKey,
          // S3-compatible endpoint for B2
          endpoint: process.env.B2_ENDPOINT || "https://s3.us-west-004.backblazeb2.com",
          region: process.env.B2_REGION || "us-west-004",
          baseBucket: config.bucketName || B2_BASE_BUCKET,
          bucketId: config.bucketId,
          enableMigration: process.env.ENABLE_B2_MIGRATION === "true",
          migrationPercentage: parseInt(process.env.B2_MIGRATION_PERCENTAGE || "0"),
          storageProvider: process.env.STORAGE_PROVIDER || "firebase",
          // B2-specific configuration
          downloadUrl: process.env.B2_DOWNLOAD_URL, // Optional custom download URL
        };
      } catch (e) {
        // Fallback to individual env vars for backwards compatibility
        return {
          keyId: process.env.B2_KEY_ID!,
          applicationKey: process.env.B2_APPLICATION_KEY!,
          endpoint: process.env.B2_ENDPOINT || "https://s3.us-west-004.backblazeb2.com",
          region: process.env.B2_REGION || "us-west-004",
          baseBucket: B2_BASE_BUCKET,
          bucketId: process.env.B2_BUCKET_ID,
          enableMigration: process.env.ENABLE_B2_MIGRATION === "true",
          migrationPercentage: parseInt(process.env.B2_MIGRATION_PERCENTAGE || "0"),
          storageProvider: process.env.STORAGE_PROVIDER || "firebase",
          downloadUrl: process.env.B2_DOWNLOAD_URL,
        };
      }
    }

    // Fallback to individual env vars
    return {
      keyId: process.env.B2_KEY_ID!,
      applicationKey: process.env.B2_APPLICATION_KEY!,
      endpoint: process.env.B2_ENDPOINT || "https://s3.us-west-004.backblazeb2.com",
      region: process.env.B2_REGION || "us-west-004",
      baseBucket: process.env.B2_BASE_BUCKET || "dynasty",
      bucketId: process.env.B2_BUCKET_ID,
      enableMigration: process.env.ENABLE_B2_MIGRATION === "true",
      migrationPercentage: parseInt(process.env.B2_MIGRATION_PERCENTAGE || "0"),
      storageProvider: process.env.STORAGE_PROVIDER || "firebase",
      downloadUrl: process.env.B2_DOWNLOAD_URL,
    };
  }

  // In production, use Firebase Secrets (Gen 2)
  // Parse the bundled JSON secret
  const configJson = B2_CONFIG.value();
  const config: B2ConfigData = JSON.parse(configJson);

  return {
    keyId: config.keyId,
    applicationKey: config.applicationKey,
    endpoint: process.env.B2_ENDPOINT || "https://s3.us-west-004.backblazeb2.com",
    region: process.env.B2_REGION || "us-west-004",
    baseBucket: config.bucketName || B2_BASE_BUCKET,
    bucketId: config.bucketId,
    enableMigration: process.env.ENABLE_B2_MIGRATION === "true",
    migrationPercentage: parseInt(process.env.B2_MIGRATION_PERCENTAGE || "0"),
    storageProvider: process.env.STORAGE_PROVIDER || "firebase",
    downloadUrl: process.env.B2_DOWNLOAD_URL,
  };
}

/**
 * Check if B2 is properly configured
 */
export function isB2Configured(): boolean {
  const config = getB2Config();
  return !!(
    config.keyId &&
    config.applicationKey &&
    config.baseBucket
  );
}

/**
 * Get B2 configuration formatted for AWS SDK S3 client
 * B2 is compatible with S3 API, so we can use AWS SDK
 */
export function getB2S3Config() {
  const config = getB2Config();

  return {
    endpoint: config.endpoint,
    region: config.region,
    credentials: {
      accessKeyId: config.keyId, // B2 keyId maps to AWS accessKeyId
      secretAccessKey: config.applicationKey, // B2 applicationKey maps to AWS secretAccessKey
    },
    // B2-specific S3 client configuration
    forcePathStyle: true, // Required for some B2 operations
    s3ForcePathStyle: true,
  };
}

/**
 * Validate B2 configuration at runtime
 */
export function validateB2Config(): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  try {
    const config = getB2Config();

    if (!config.keyId) {
      errors.push("B2 keyId is missing");
    }

    if (!config.applicationKey) {
      errors.push("B2 applicationKey is missing");
    }

    if (!config.baseBucket) {
      errors.push("B2 baseBucket is missing");
    }

    if (!config.endpoint) {
      errors.push("B2 endpoint is missing");
    }

    if (!config.region) {
      errors.push("B2 region is missing");
    }

    // Validate endpoint format
    if (config.endpoint && !config.endpoint.startsWith("https://")) {
      errors.push("B2 endpoint must use HTTPS");
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  } catch (error) {
    errors.push(`B2 configuration error: ${error instanceof Error ? error.message : "Unknown error"}`);
    return {
      valid: false,
      errors,
    };
  }
}
