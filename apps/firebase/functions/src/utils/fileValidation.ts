import {logger} from "firebase-functions/v2";

/**
 * File validation utilities - provider agnostic
 * These utilities can be used across different storage providers (Firebase, R2, S3, etc.)
 */

/**
 * Common file validation configuration
 */
export const FILE_VALIDATION_CONFIG = {
  // Allowed MIME types for security
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
    // Archives (for data export/import)
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
    "audio/mp4",
  ],
  // Dangerous file extensions to always block
  blockedExtensions: [
    ".exe", ".bat", ".cmd", ".sh", ".ps1",
    ".app", ".dmg", ".pkg", ".deb", ".rpm",
    ".jar", ".com", ".pif", ".scr", ".vbs",
    ".wsf", ".html", ".htm", ".js", ".php",
    ".asp", ".aspx", ".jsp", ".py", ".rb",
  ],
  // Suspicious patterns in filenames
  suspiciousPatterns: [
    /(\.\w+){2,}$/, // Double extensions like .pdf.exe
    // eslint-disable-next-line no-control-regex
    /[\x00-\x1F]/, // Control characters in filenames
  ],
  // Maximum filename length
  maxFileNameLength: 255,
  // Maximum path length
  maxPathLength: 1024,
};

/**
 * Validate file upload request (security only, no size limit)
 * This is provider-agnostic and focuses on security validation
 */
export function validateUploadRequest(
  fileName: string,
  mimeType: string
): { valid: boolean; error?: string } {
  // Check filename length
  if (fileName.length > FILE_VALIDATION_CONFIG.maxFileNameLength) {
    return {
      valid: false,
      error: `Filename too long. Maximum ${FILE_VALIDATION_CONFIG.maxFileNameLength} characters allowed`,
    };
  }

  // Check MIME type
  if (!FILE_VALIDATION_CONFIG.allowedMimeTypes.includes(mimeType)) {
    return {
      valid: false,
      error: `File type ${mimeType} is not allowed`,
    };
  }

  // Check file extension
  const extension = fileName.substring(fileName.lastIndexOf(".")).toLowerCase();
  if (FILE_VALIDATION_CONFIG.blockedExtensions.includes(extension)) {
    return {
      valid: false,
      error: `File extension ${extension} is not allowed for security reasons`,
    };
  }

  // Check for suspicious patterns
  for (const pattern of FILE_VALIDATION_CONFIG.suspiciousPatterns) {
    if (pattern.test(fileName)) {
      return {
        valid: false,
        error: "File name contains suspicious patterns",
      };
    }
  }

  return {valid: true};
}

/**
 * Validate file path for security
 */
export function validateFilePath(path: string): { valid: boolean; error?: string } {
  // Check path length
  if (path.length > FILE_VALIDATION_CONFIG.maxPathLength) {
    return {
      valid: false,
      error: `Path too long. Maximum ${FILE_VALIDATION_CONFIG.maxPathLength} characters allowed`,
    };
  }

  // Prevent directory traversal
  if (path.includes("..") || path.includes("//")) {
    return {
      valid: false,
      error: "Invalid path: directory traversal detected",
    };
  }

  // Check for null bytes
  if (path.includes("\0")) {
    return {
      valid: false,
      error: "Invalid path: null bytes detected",
    };
  }

  return {valid: true};
}

/**
 * Get file type category from MIME type
 */
export function getFileTypeCategory(mimeType: string): string {
  if (mimeType.startsWith("image/")) return "image";
  if (mimeType.startsWith("video/")) return "video";
  if (mimeType.startsWith("audio/")) return "audio";
  if (mimeType.startsWith("text/")) return "text";
  if (mimeType.includes("pdf")) return "pdf";
  if (mimeType.includes("word") || mimeType.includes("document")) return "document";
  if (mimeType.includes("sheet") || mimeType.includes("excel")) return "spreadsheet";
  if (mimeType.includes("presentation") || mimeType.includes("powerpoint")) return "presentation";
  if (mimeType.includes("zip") || mimeType.includes("tar") || mimeType.includes("rar")) return "archive";
  return "other";
}

/**
 * Check if file type is previewable
 */
export function isPreviewableFileType(mimeType: string): boolean {
  const previewableTypes = [
    "image/jpeg",
    "image/png",
    "image/gif",
    "image/webp",
    "image/svg+xml",
    "application/pdf",
    "text/plain",
    "text/csv",
    "application/json",
    "text/xml",
    "application/xml",
  ];
  
  return previewableTypes.includes(mimeType);
}

/**
 * Get file extension from filename
 */
export function getFileExtension(fileName: string): string {
  const lastDot = fileName.lastIndexOf(".");
  if (lastDot === -1) return "";
  return fileName.substring(lastDot + 1).toLowerCase();
}

/**
 * Generate safe filename (removes special characters)
 */
export function generateSafeFileName(fileName: string): string {
  // Replace spaces with underscores
  let safeName = fileName.replace(/\s+/g, "_");
  
  // Remove special characters except dots, dashes, and underscores
  safeName = safeName.replace(/[^a-zA-Z0-9._-]/g, "");
  
  // Remove multiple consecutive dots
  safeName = safeName.replace(/\.{2,}/g, ".");
  
  // Ensure filename doesn't start or end with a dot
  safeName = safeName.replace(/^\.+|\.+$/g, "");
  
  // If filename is empty after sanitization, generate a default
  if (!safeName) {
    safeName = `file_${Date.now()}`;
  }
  
  return safeName;
}

/**
 * Validate batch file upload
 */
export function validateBatchUpload(
  files: Array<{fileName: string; mimeType: string}>
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  
  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    const validation = validateUploadRequest(file.fileName, file.mimeType);
    
    if (!validation.valid) {
      errors.push(`File ${i + 1} (${file.fileName}): ${validation.error}`);
    }
  }
  
  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Log file validation event
 */
export function logFileValidationEvent(
  event: {
    type: "validation_success" | "validation_failure";
    fileName: string;
    mimeType: string;
    userId?: string;
    error?: string;
  }
): void {
  const level = event.type === "validation_success" ? "info" : "warn";
  
  logger.log({
    severity: level.toUpperCase(),
    message: `File validation ${event.type === "validation_success" ? "passed" : "failed"}`,
    labels: {
      type: "file_validation",
      result: event.type,
    },
    data: {
      fileName: event.fileName,
      mimeType: event.mimeType,
      userId: event.userId,
      error: event.error,
    },
  });
}