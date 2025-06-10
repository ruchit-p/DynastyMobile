import {logger} from "firebase-functions/v2";
import {SES_CONFIG} from "./secrets";

interface SESConfigData {
  region: string;
  fromEmail: string;
  fromName?: string;
  accessKeyId?: string;
  secretAccessKey?: string;
}

/**
 * Get the appropriate from email based on environment
 */
function getFromEmail(): string {
  // Check environment variables for explicit configuration
  if (process.env.SES_FROM_EMAIL) {
    return process.env.SES_FROM_EMAIL;
  }

  // Environment-specific emails
  if (process.env.NODE_ENV === "staging") {
    return "noreply@dynastytest.com";
  }

  // Default to production domain
  return "noreply@mydynastyapp.com";
}

/**
 * Get SES configuration from bundled secret or environment variables
 */
export function getSESConfig(): SESConfigData {
  // For local development with emulator
  if (process.env.FUNCTIONS_EMULATOR === "true") {
    // Try bundled config first
    if (process.env.SES_CONFIG) {
      try {
        const config = JSON.parse(process.env.SES_CONFIG);
        logger.info("Using bundled SES config from environment");
        return config;
      } catch (e) {
        logger.warn("Failed to parse SES_CONFIG, falling back to individual env vars");
      }
    }

    // Fallback to individual env vars for local development
    const config: SESConfigData = {
      region: process.env.AWS_REGION || process.env.SES_REGION || "us-east-2",
      fromEmail: getFromEmail(),
      fromName: process.env.SES_FROM_NAME || "My Dynasty App",
    };

    // Only add credentials if explicitly provided (for local testing)
    if (process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY) {
      config.accessKeyId = process.env.AWS_ACCESS_KEY_ID;
      config.secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;
    }

    return config;
  }

  // In production, try bundled secret first
  try {
    const configJson = SES_CONFIG.value();
    const config = JSON.parse(configJson);
    logger.info("Using SES config from Secret Manager");
    return {
      region: config.region || "us-east-2",
      fromEmail: config.fromEmail,
      fromName: config.fromName || "My Dynasty App",
      // Don't include credentials in production - use IAM roles
    };
  } catch (e) {
    // If bundled config fails in production, use defaults with IAM role
    logger.warn("SES_CONFIG secret not found, using defaults with IAM role");
    return {
      region: process.env.AWS_REGION || "us-east-2",
      fromEmail: getFromEmail(),
      fromName: "My Dynasty App",
    };
  }
}
