import {defineSecret} from "firebase-functions/params";

// Single bundled R2 configuration secret
// Format: JSON object with accountId, accessKeyId, secretAccessKey
export const R2_CONFIG = defineSecret("R2_CONFIG");

/**
 * Get the appropriate R2 bucket name based on the current environment
 * @returns The bucket name for the current environment
 */
export function getEnvironmentBucketName(): string {
  // Allow override via environment variable
  if (process.env.R2_BASE_BUCKET) {
    return process.env.R2_BASE_BUCKET;
  }

  // Use environment-specific buckets
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

// Optional R2 configuration (can be set as regular env vars)
export const R2_BASE_BUCKET = getEnvironmentBucketName();
export const R2_MIGRATION_ENABLED = process.env.R2_MIGRATION_ENABLED === "true";
export const R2_MIGRATION_PERCENTAGE = parseInt(process.env.R2_MIGRATION_PERCENTAGE || "0");
