import {R2_CONFIG, R2_BASE_BUCKET} from "./r2Secrets";

interface R2ConfigData {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
}

/**
 * R2 configuration that works in both local and deployed environments
 */
export function getR2Config() {
  // For local development with emulator
  if (process.env.FUNCTIONS_EMULATOR === "true") {
    // Try to parse R2_CONFIG as JSON first, fallback to individual env vars
    if (process.env.R2_CONFIG) {
      try {
        const config: R2ConfigData = JSON.parse(process.env.R2_CONFIG);
        return {
          accountId: config.accountId,
          accessKeyId: config.accessKeyId,
          secretAccessKey: config.secretAccessKey,
          baseBucket: R2_BASE_BUCKET,
          endpoint: process.env.R2_ENDPOINT,
          enableMigration: process.env.ENABLE_R2_MIGRATION === "true",
          migrationPercentage: parseInt(process.env.R2_MIGRATION_PERCENTAGE || "0"),
          storageProvider: process.env.STORAGE_PROVIDER || "firebase",
        };
      } catch (e) {
        // Fallback to individual env vars for backwards compatibility
        return {
          accountId: process.env.R2_ACCOUNT_ID!,
          accessKeyId: process.env.R2_ACCESS_KEY_ID!,
          secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
          baseBucket: R2_BASE_BUCKET,
          endpoint: process.env.R2_ENDPOINT,
          enableMigration: process.env.ENABLE_R2_MIGRATION === "true",
          migrationPercentage: parseInt(process.env.R2_MIGRATION_PERCENTAGE || "0"),
          storageProvider: process.env.STORAGE_PROVIDER || "firebase",
        };
      }
    }

    // Fallback to individual env vars
    return {
      accountId: process.env.R2_ACCOUNT_ID!,
      accessKeyId: process.env.R2_ACCESS_KEY_ID!,
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
      baseBucket: process.env.R2_BASE_BUCKET || "dynasty",
      endpoint: process.env.R2_ENDPOINT,
      enableMigration: process.env.ENABLE_R2_MIGRATION === "true",
      migrationPercentage: parseInt(process.env.R2_MIGRATION_PERCENTAGE || "0"),
      storageProvider: process.env.STORAGE_PROVIDER || "firebase",
    };
  }

  // In production, use Firebase Secrets (Gen 2)
  // Parse the bundled JSON secret
  const configJson = R2_CONFIG.value();
  const config: R2ConfigData = JSON.parse(configJson);

  return {
    accountId: config.accountId,
    accessKeyId: config.accessKeyId,
    secretAccessKey: config.secretAccessKey,
    baseBucket: R2_BASE_BUCKET,
    endpoint: process.env.R2_ENDPOINT,
    enableMigration: process.env.ENABLE_R2_MIGRATION === "true",
    migrationPercentage: parseInt(process.env.R2_MIGRATION_PERCENTAGE || "0"),
    storageProvider: process.env.STORAGE_PROVIDER || "firebase",
  };
}

/**
 * Check if R2 is properly configured
 */
export function isR2Configured(): boolean {
  const config = getR2Config();
  return !!(
    config.accountId &&
    config.accessKeyId &&
    config.secretAccessKey
  );
}
