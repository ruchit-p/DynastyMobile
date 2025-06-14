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

/**
 * Vault scan configuration interface
 */
export interface VaultScanConfig {
  workerHookSecret: string;
  // Future: Add Cloudmersive API key here if Firebase needs direct access
}

/**
 * Get vault scan configuration from secrets or environment variables
 */
export function getVaultScanConfig(): VaultScanConfig {
  // For local development with emulator
  if (process.env.FUNCTIONS_EMULATOR === "true") {
    // Try environment variables first for local development
    if (process.env.WORKER_SCAN_HOOK_SECRET) {
      logger.info("Using vault scan config from environment variables");
      return {
        workerHookSecret: process.env.WORKER_SCAN_HOOK_SECRET,
      };
    }

    // Fallback to test values for local development
    logger.warn("Vault scan config not found in environment, using test defaults");
    return {
      workerHookSecret: "test_hook_secret_for_development_only",
    };
  }

  // In production/staging, use secrets
  try {
    const config: VaultScanConfig = {
      workerHookSecret: WORKER_SCAN_HOOK_SECRET.value(),
    };

    logger.info("Using vault scan config from Secret Manager");
    return config;
  } catch (error) {
    logger.error("Failed to load vault scan configuration from secrets", error);
    throw new Error("Vault scan configuration is missing. Please set WORKER_SCAN_HOOK_SECRET secret.");
  }
}
