import {defineSecret} from "firebase-functions/params";
import {logger} from "firebase-functions/v2";

/**
 * Vault Scan Configuration Guide:
 *
 * This secret is used to authenticate webhook calls from the Cloudflare Worker
 * to the Firebase updateVaultScanStatus function.
 *
 * Setup:
 * 1. Generate a secure random string (e.g., 32+ characters)
 * 2. Set this value in both:
 *    - Firebase Secret Manager as WORKER_SCAN_HOOK_SECRET
 *    - Cloudflare Worker secrets as FIREBASE_WEBHOOK_SECRET
 * 3. The Worker will include this in the x-hook-secret header
 * 4. Firebase will verify this header before processing updates
 *
 * Security:
 * - Rotate this secret quarterly
 * - Never expose in logs or client code
 * - Use timing-safe comparison for verification
 */

// Worker Scan Hook Secret
// Used to authenticate webhook calls from Cloudflare Worker
export const WORKER_SCAN_HOOK_SECRET = defineSecret("WORKER_SCAN_HOOK_SECRET");

// Cloudmersive API Key for virus scanning
export const CLOUDMERSIVE_API_KEY = defineSecret("CLOUDMERSIVE_API_KEY");

/**
 * Vault scan configuration interface
 */
export interface VaultScanConfig {
  workerHookSecret: string;
  cloudmersiveApiKey: string;
  stagingBucket: string;
  quarantineBucket: string;
  finalStorageProvider: "b2" | "r2";
  scanTimeoutMs: number;
  maxFileSizeForScanning: number;
}

/**
 * Get vault scan configuration from secrets or environment variables
 */
export function getVaultScanConfig(): VaultScanConfig {
  // For local development with emulator
  if (process.env.FUNCTIONS_EMULATOR === "true") {
    // Try environment variables first for local development
    if (process.env.WORKER_SCAN_HOOK_SECRET && process.env.CLOUDMERSIVE_API_KEY) {
      logger.info("Using vault scan config from environment variables");
      return {
        workerHookSecret: process.env.WORKER_SCAN_HOOK_SECRET,
        cloudmersiveApiKey: process.env.CLOUDMERSIVE_API_KEY,
        stagingBucket: process.env.R2_STAGING_BUCKET || "dynasty-staging-local",
        quarantineBucket: process.env.R2_QUARANTINE_BUCKET || "dynasty-quarantine-local",
        finalStorageProvider: (process.env.FINAL_STORAGE_PROVIDER as "b2" | "r2") || "b2",
        scanTimeoutMs: parseInt(process.env.SCAN_TIMEOUT_MS || "30000"),
        maxFileSizeForScanning: parseInt(process.env.MAX_FILE_SIZE_FOR_SCANNING || "2147483648"), // 2GB
      };
    }

    // Fallback to test values for local development
    logger.warn("Vault scan config not found in environment, using test defaults");
    return {
      workerHookSecret: "test_hook_secret_for_development_only",
      cloudmersiveApiKey: "test_cloudmersive_key",
      stagingBucket: "dynasty-staging-local",
      quarantineBucket: "dynasty-quarantine-local",
      finalStorageProvider: "b2",
      scanTimeoutMs: 30000,
      maxFileSizeForScanning: 2147483648, // 2GB
    };
  }

  // In production/staging, use secrets
  try {
    const config: VaultScanConfig = {
      workerHookSecret: WORKER_SCAN_HOOK_SECRET.value(),
      cloudmersiveApiKey: CLOUDMERSIVE_API_KEY.value(),
      stagingBucket: process.env.NODE_ENV === "production" ? "dynasty-staging-prod" : "dynasty-staging-test",
      quarantineBucket: process.env.NODE_ENV === "production" ? "dynasty-quarantine-prod" : "dynasty-quarantine-test",
      finalStorageProvider: "b2", // Use B2 as final storage
      scanTimeoutMs: 30000,
      maxFileSizeForScanning: 2147483648, // 2GB
    };

    logger.info("Using vault scan config from Secret Manager");
    return config;
  } catch (error) {
    logger.error("Failed to load vault scan configuration from secrets", error);
    throw new Error("Vault scan configuration is missing. Please set required secrets.");
  }
}
