import {defineSecret} from "firebase-functions/params";

// Single bundled B2 configuration secret
// Format: JSON object with keyId, applicationKey, bucketName, bucketId (optional)
export const B2_CONFIG = defineSecret("B2_CONFIG");

/**
 * Get the appropriate B2 bucket name based on the current environment
 * Uses same naming convention as R2 for consistency
 * @returns The bucket name for the current environment
 */
export function getEnvironmentBucketName(): string {
  // Allow override via environment variable
  if (process.env.B2_BASE_BUCKET) {
    return process.env.B2_BASE_BUCKET;
  }

  // Use environment-specific buckets (same as R2 for consistency)
  if (process.env.NODE_ENV === "production") {
    return "dynastyprod";
  } else if (process.env.NODE_ENV === "staging") {
    return "dynastytest";
  } else if (process.env.FUNCTIONS_EMULATOR === "true") {
    // Local emulator environment
    return "dynastylocal";
  } else {
    // Development or any other environment
    return "dynastytest";
  }
}

/**
 * Get B2 bucket ID based on environment
 * This is optional but can improve performance by avoiding bucket name resolution
 */
export function getEnvironmentBucketId(): string | undefined {
  // Allow override via environment variable
  if (process.env.B2_BUCKET_ID) {
    return process.env.B2_BUCKET_ID;
  }

  // Return undefined if not set - B2 service will work with bucket name
  return undefined;
}

// Optional B2 configuration (can be set as regular env vars)
export const B2_BASE_BUCKET = getEnvironmentBucketName();
export const B2_BUCKET_ID = getEnvironmentBucketId();
export const B2_MIGRATION_ENABLED = process.env.B2_MIGRATION_ENABLED === "true";
export const B2_MIGRATION_PERCENTAGE = parseInt(process.env.B2_MIGRATION_PERCENTAGE || "0");

/**
 * B2 regions and endpoints mapping
 * B2 provides S3-compatible endpoints in different regions
 */
export const B2_REGIONS = {
  "us-west-004": "https://s3.us-west-004.backblazeb2.com",
  "us-west-002": "https://s3.us-west-002.backblazeb2.com",
  "us-east-1": "https://s3.us-east-1.backblazeb2.com",
  "eu-central-1": "https://s3.eu-central-1.backblazeb2.com",
} as const;

export type B2Region = keyof typeof B2_REGIONS;

/**
 * Get B2 endpoint for a specific region
 */
export function getB2Endpoint(region: B2Region = "us-west-004"): string {
  return B2_REGIONS[region];
}

/**
 * Default B2 configuration constants
 */
export const B2_DEFAULTS = {
  region: "us-west-004" as B2Region,
  endpoint: getB2Endpoint(),
  // B2 has different checksum requirements than R2
  useChecksums: true,
  // B2 supports multipart uploads
  multipartThreshold: 100 * 1024 * 1024, // 100MB
  // B2 retry configuration
  maxRetries: 3,
  retryDelayBase: 1000,
  // B2 signed URL expiration limits
  maxSignedUrlExpiry: 7 * 24 * 60 * 60, // 7 days
} as const;
