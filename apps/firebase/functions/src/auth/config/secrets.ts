import {defineSecret} from "firebase-functions/params";

// Bundled SendGrid configuration
// Format: JSON object with apiKey, fromEmail, and templates
export const SENDGRID_CONFIG = defineSecret("SENDGRID_CONFIG");

// Email provider selection (ses or sendgrid)
export const EMAIL_PROVIDER = defineSecret("EMAIL_PROVIDER");

// AWS SES configuration
// Format: JSON object with region, fromEmail, and fromName
export const SES_CONFIG = defineSecret("SES_CONFIG");

// Frontend URL remains separate as it's not always used with SendGrid
export const FRONTEND_URL = defineSecret("FRONTEND_URL");

// FingerprintJS Pro Server API Key for device fingerprinting
export const FINGERPRINT_SERVER_API_KEY = defineSecret("FINGERPRINT_SERVER_API_KEY");
