import {defineSecret} from "firebase-functions/params";

// Email provider selection (currently only supports ses)
export const EMAIL_PROVIDER = defineSecret("EMAIL_PROVIDER");

// AWS SES configuration
// Format: JSON object with region, fromEmail, and fromName
export const SES_CONFIG = defineSecret("SES_CONFIG");

// Frontend URL remains separate as it's not always used with SendGrid
export const FRONTEND_URL = defineSecret("FRONTEND_URL");

