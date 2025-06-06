export const R2_SECURITY_CONFIG = {
  // CORS configuration for R2 bucket
  cors: {
    allowedOrigins: [
      "https://mydynastyapp.com",
      "https://app.mydynastyapp.com",
      "capacitor://localhost", // iOS
      "http://localhost", // Android
    ],
    allowedMethods: ["GET", "PUT", "DELETE"],
    allowedHeaders: ["Content-Type", "Content-Length", "x-amz-meta-*"],
    exposeHeaders: ["ETag"],
    maxAge: 3600,
  },

  // Content Security Policy for downloads
  csp: {
    "default-src": ["'self'"],
    "img-src": ["'self'", "data:", "https://cdn.mydynastyapp.com"],
    "media-src": ["'self'", "https://cdn.mydynastyapp.com"],
    "object-src": ["'none'"],
    "script-src": ["'none'"],
  },

  // Upload restrictions
  upload: {
    maxFileSize: 100 * 1024 * 1024, // 100MB
    allowedMimeTypes: [
      // Images
      "image/jpeg",
      "image/png",
      "image/gif",
      "image/webp",
      "image/heic",
      "image/heif",
      "image/bmp",
      "image/tiff",
      "image/svg+xml",
      // Videos
      "video/mp4",
      "video/quicktime",
      "video/x-msvideo",
      "video/webm",
      "video/ogg",
      // Documents
      "application/pdf",
      "application/msword",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "application/vnd.ms-excel",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "application/vnd.ms-powerpoint",
      "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      "text/plain",
      "text/csv",
      "text/rtf",
      // Archives
      "application/zip",
      "application/x-rar-compressed",
      "application/x-7z-compressed",
      "application/gzip",
      "application/x-tar",
      // Data formats
      "application/json",
      "application/xml",
      "text/xml",
      "application/yaml",
      "text/yaml",
      // Audio
      "audio/mpeg",
      "audio/wav",
      "audio/x-m4a",
      "audio/ogg",
      "audio/flac",
      "audio/aac",
    ],
    // File extensions to block (even if MIME type is allowed)
    blockedExtensions: [".exe", ".bat", ".cmd", ".sh", ".app", ".dmg", ".pkg"],
  },

  // Signed URL configuration
  signedUrls: {
    uploadExpiry: 5 * 60, // 5 minutes
    downloadExpiry: 60 * 60, // 1 hour
    requireAuth: true,
    ipWhitelist: process.env.NODE_ENV === "production" ? [] : ["*"],
  },
};

/**
 * Validate file upload request
 */
export function validateUploadRequest(
  fileName: string,
  mimeType: string,
  fileSize?: number
): { valid: boolean; error?: string } {
  const config = R2_SECURITY_CONFIG.upload;

  // Check file size
  if (fileSize && fileSize > config.maxFileSize) {
    return {
      valid: false,
      error: `File size exceeds maximum of ${config.maxFileSize / (1024 * 1024)}MB`,
    };
  }

  // Check MIME type
  if (!config.allowedMimeTypes.includes(mimeType)) {
    return {
      valid: false,
      error: `File type ${mimeType} is not allowed`,
    };
  }

  // Check file extension
  const extension = fileName.substring(fileName.lastIndexOf(".")).toLowerCase();
  if (config.blockedExtensions.includes(extension)) {
    return {
      valid: false,
      error: `File extension ${extension} is not allowed`,
    };
  }

  return {valid: true};
}
