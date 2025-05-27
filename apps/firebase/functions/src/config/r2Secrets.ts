import {defineSecret} from "firebase-functions/params";

// Single bundled R2 configuration secret
// Format: JSON object with accountId, accessKeyId, secretAccessKey
export const R2_CONFIG = defineSecret("R2_CONFIG");

// Optional R2 configuration (can be set as regular env vars)
export const R2_BASE_BUCKET = process.env.R2_BASE_BUCKET || "dynasty";
export const R2_MIGRATION_ENABLED = process.env.R2_MIGRATION_ENABLED === "true";
export const R2_MIGRATION_PERCENTAGE = parseInt(process.env.R2_MIGRATION_PERCENTAGE || "0");
