/**
 * Common configuration settings for Firebase functions
 */

// Default region for functions
export const DEFAULT_REGION = "us-central1";

// Timeout settings (in seconds) for different function types
export const FUNCTION_TIMEOUT = {
  SHORT: 60, // 1 minute
  MEDIUM: 180, // 3 minutes
  LONG: 300, // 5 minutes (max 540 seconds/9 minutes)
};

export const DEFAULT_MEMORY = {
  SHORT: "256MiB",
  MEDIUM: "512MiB",
};

// CORS settings
export const CORS_ORIGINS = {
  PRODUCTION: "https://mydynastyapp.com",
  PRODUCTION_WWW: "https://www.mydynastyapp.com",
  DEVELOPMENT: "http://localhost:3000",
  FIREBASE_AUTH: "https://dynasty-eba63.firebaseapp.com",
};
