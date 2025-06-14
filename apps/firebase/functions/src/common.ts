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
  SMALL: "128MiB" as const,
  SHORT: "256MiB" as const,
  MEDIUM: "512MiB" as const,
  LARGE: "1GiB" as const,
};

// File upload size limits (standardized to 1GB)
export const FILE_SIZE_LIMITS = {
  MAX_FILE_SIZE: 1024 * 1024 * 1024, // 1GB in bytes
  MAX_FILE_SIZE_MB: 1024, // 1GB in MB
  MAX_IMAGE_SIZE: 1024 * 1024 * 1024, // 1GB for images
  MAX_VIDEO_SIZE: 1024 * 1024 * 1024, // 1GB for videos
  MAX_DOCUMENT_SIZE: 1024 * 1024 * 1024, // 1GB for documents
  MAX_AUDIO_SIZE: 1024 * 1024 * 1024, // 1GB for audio
} as const;

// CORS settings
export const CORS_ORIGINS = {
  PRODUCTION: "https://mydynastyapp.com",
  PRODUCTION_WWW: "https://www.mydynastyapp.com",
  DEVELOPMENT: "http://localhost:3000",
  FIREBASE_AUTH: "https://dynasty-eba63.firebaseapp.com",
};
