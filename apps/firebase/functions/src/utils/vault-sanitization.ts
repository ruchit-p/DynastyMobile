/**
 * Vault Input Sanitization Utilities
 * Provides comprehensive sanitization for vault operations to prevent XSS, path traversal, and other attacks
 */

import {sanitizeUserInput} from "./xssSanitization";
import {createError, ErrorCode} from "./errors";

// Maximum lengths for various fields
const MAX_LENGTHS = {
  fileName: 255,
  folderName: 100,
  description: 1000,
  sharePassword: 128,
  searchQuery: 100,
  tag: 50,
  path: 500,
  mimeType: 100,
};

// Allowed characters for different field types
const ALLOWED_PATTERNS = {
  fileName: /^[a-zA-Z0-9._\-\s()[\]{}]+$/,
  folderName: /^[a-zA-Z0-9._\-\s]+$/,
  tag: /^[a-zA-Z0-9\-_]+$/,
  shareId: /^[a-zA-Z0-9\-_]+$/,
  itemId: /^[a-zA-Z0-9\-_]+$/,
};

// Dangerous file extensions
const DANGEROUS_EXTENSIONS = [
  ".exe", ".bat", ".cmd", ".com", ".pif", ".scr", ".vbs", ".js", ".jse",
  ".wsf", ".wsh", ".msc", ".jar", ".hta", ".ps1", ".psm1", ".ps1xml",
  ".ps2", ".ps2xml", ".psc1", ".psc2", ".msh", ".msh1", ".msh2",
  ".mshxml", ".msh1xml", ".msh2xml", ".scf", ".lnk", ".inf",
  ".reg", ".app", ".dmg", ".pkg", ".deb", ".rpm",
];

// MIME type whitelist for vault uploads
const ALLOWED_MIME_TYPES = [
  // Images
  "image/jpeg", "image/jpg", "image/png", "image/gif", "image/webp",
  "image/bmp", "image/svg+xml", "image/tiff",

  // Videos
  "video/mp4", "video/mpeg", "video/quicktime", "video/x-msvideo",
  "video/x-ms-wmv", "video/webm", "video/ogg",

  // Audio
  "audio/mpeg", "audio/wav", "audio/mp4", "audio/ogg", "audio/webm",
  "audio/x-m4a", "audio/flac",

  // Documents
  "application/pdf", "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "text/plain", "text/csv", "application/rtf",

  // Archives (with caution)
  "application/zip", "application/x-rar-compressed", "application/x-tar",
  "application/gzip", "application/x-7z-compressed",

  // Other safe types
  "application/json", "application/xml", "text/xml",
];

/**
 * Sanitize file name for vault storage
 */
export function sanitizeFileName(fileName: string): string {
  if (!fileName || typeof fileName !== "string") {
    throw createError(ErrorCode.INVALID_ARGUMENT, "Invalid file name");
  }

  // Remove any path components
  const baseName = fileName.split(/[/\\]/).pop() || fileName;

  // Truncate to maximum length
  let sanitized = baseName.substring(0, MAX_LENGTHS.fileName);

  // Remove null bytes and control characters
  // eslint-disable-next-line no-control-regex
  sanitized = sanitized.replace(/[\x00-\x1f\x7f-\x9f]/g, "");

  // Remove leading dots (hidden files)
  sanitized = sanitized.replace(/^\.+/, "");

  // Replace multiple spaces with single space
  sanitized = sanitized.replace(/\s+/g, " ").trim();

  // Remove dangerous characters but keep common ones
  sanitized = sanitized.replace(/[<>:"|?*]/g, "");

  // Check for dangerous extensions
  const lowerName = sanitized.toLowerCase();
  for (const ext of DANGEROUS_EXTENSIONS) {
    if (lowerName.endsWith(ext)) {
      // Append .txt to dangerous files
      sanitized += ".txt";
      break;
    }
  }

  // Ensure we have a valid filename
  if (!sanitized || sanitized === ".txt") {
    sanitized = "unnamed_file";
  }

  // Final validation against allowed pattern
  if (!ALLOWED_PATTERNS.fileName.test(sanitized)) {
    // Replace any remaining invalid characters with underscore
    sanitized = sanitized.replace(/[^a-zA-Z0-9._\-\s()[\]{}]/g, "_");
  }

  return sanitized;
}

/**
 * Sanitize folder name
 */
export function sanitizeFolderName(folderName: string): string {
  if (!folderName || typeof folderName !== "string") {
    throw createError(ErrorCode.INVALID_ARGUMENT, "Invalid folder name");
  }

  let sanitized = folderName.substring(0, MAX_LENGTHS.folderName);

  // Remove control characters and null bytes
  // eslint-disable-next-line no-control-regex
  sanitized = sanitized.replace(/[\x00-\x1f\x7f-\x9f]/g, "");

  // Remove path separators
  sanitized = sanitized.replace(/[/\\]/g, "");

  // Replace multiple spaces with single space
  sanitized = sanitized.replace(/\s+/g, " ").trim();

  // Remove special characters
  sanitized = sanitized.replace(/[<>:"|?*]/g, "");

  // Remove leading/trailing dots
  sanitized = sanitized.replace(/^\.+|\.+$/g, "");

  if (!sanitized) {
    sanitized = "New Folder";
  }

  // Validate against pattern
  if (!ALLOWED_PATTERNS.folderName.test(sanitized)) {
    sanitized = sanitized.replace(/[^a-zA-Z0-9._\-\s]/g, "_");
  }

  return sanitized;
}

/**
 * Sanitize vault path to prevent directory traversal
 */
export function sanitizeVaultPath(path: string): string {
  if (!path || typeof path !== "string") {
    return "/";
  }

  // Normalize path separators
  let sanitized = path.replace(/\\/g, "/");

  // Remove null bytes and control characters
  // eslint-disable-next-line no-control-regex
  sanitized = sanitized.replace(/[\x00-\x1f\x7f-\x9f]/g, "");

  // Remove any directory traversal attempts
  sanitized = sanitized.replace(/\.\.+/g, "");

  // Remove double slashes
  sanitized = sanitized.replace(/\/+/g, "/");

  // Ensure path starts with /
  if (!sanitized.startsWith("/")) {
    sanitized = "/" + sanitized;
  }

  // Remove trailing slash unless it's root
  if (sanitized.length > 1 && sanitized.endsWith("/")) {
    sanitized = sanitized.slice(0, -1);
  }

  // Validate path components
  const components = sanitized.split("/").filter(Boolean);
  const validComponents = components.map((component) => {
    // Apply folder name sanitization to each component
    return sanitizeFolderName(component);
  });

  // Reconstruct path
  sanitized = "/" + validComponents.join("/");

  // Enforce maximum length
  if (sanitized.length > MAX_LENGTHS.path) {
    throw createError(ErrorCode.INVALID_ARGUMENT, "Path too long");
  }

  return sanitized;
}

/**
 * Validate and sanitize MIME type
 */
export function sanitizeMimeType(mimeType: string): string {
  if (!mimeType || typeof mimeType !== "string") {
    return "application/octet-stream";
  }

  // Convert to lowercase and trim
  let sanitized = mimeType.toLowerCase().trim();

  // Remove any parameters (e.g., charset)
  sanitized = sanitized.split(";")[0].trim();

  // Basic MIME type validation
  if (!/^[a-z]+\/[a-z0-9\-+.]+$/.test(sanitized)) {
    return "application/octet-stream";
  }

  // Map common variations to allowed types first
  const mimeMap: Record<string, string> = {
    "image/jpg": "image/jpeg",
    "audio/mp3": "audio/mpeg",
    "video/x-m4v": "video/mp4",
    "application/x-zip-compressed": "application/zip",
  };

  if (mimeMap[sanitized]) {
    sanitized = mimeMap[sanitized];
  }

  // Check against whitelist
  if (!ALLOWED_MIME_TYPES.includes(sanitized)) {
    sanitized = "application/octet-stream";
  }

  return sanitized.substring(0, MAX_LENGTHS.mimeType);
}

/**
 * Sanitize search query
 */
export function sanitizeSearchQuery(query: string): string {
  if (!query || typeof query !== "string") {
    return "";
  }

  // Apply XSS sanitization first
  let sanitized = sanitizeUserInput(query);

  // Limit length
  sanitized = sanitized.substring(0, MAX_LENGTHS.searchQuery);

  // Remove special regex characters to prevent regex injection
  sanitized = sanitized.replace(/[.*+?^${}()|[\]\\]/g, "");

  // Remove SQL-like keywords (basic protection)
  const sqlKeywords = ["drop", "delete", "insert", "update", "alter", "create"];
  const words = sanitized.toLowerCase().split(/\s+/);
  const filtered = words.filter((word: string) => !sqlKeywords.includes(word));

  return filtered.join(" ").trim();
}

/**
 * Sanitize tag
 */
export function sanitizeTag(tag: string): string {
  if (!tag || typeof tag !== "string") {
    return "";
  }

  let sanitized = tag.substring(0, MAX_LENGTHS.tag);

  // Remove spaces and special characters
  sanitized = sanitized.replace(/\s+/g, "-");
  sanitized = sanitized.toLowerCase();

  // Validate against pattern
  if (!ALLOWED_PATTERNS.tag.test(sanitized)) {
    sanitized = sanitized.replace(/[^a-zA-Z0-9\-_]/g, "");
  }

  return sanitized;
}

/**
 * Sanitize share password
 */
export function sanitizeSharePassword(password: string): string {
  if (!password || typeof password !== "string") {
    return "";
  }

  // Limit length but don't modify content (passwords need exact match)
  return password.substring(0, MAX_LENGTHS.sharePassword);
}

/**
 * Validate item ID format
 */
export function validateItemId(itemId: string): boolean {
  if (!itemId || typeof itemId !== "string") {
    return false;
  }

  // Check length (typical UUID or custom ID length)
  if (itemId.length < 10 || itemId.length > 100) {
    return false;
  }

  // Check pattern
  return ALLOWED_PATTERNS.itemId.test(itemId);
}

/**
 * Validate share ID format
 */
export function validateShareId(shareId: string): boolean {
  if (!shareId || typeof shareId !== "string") {
    return false;
  }

  // Check length
  if (shareId.length < 10 || shareId.length > 50) {
    return false;
  }

  // Check pattern
  return ALLOWED_PATTERNS.shareId.test(shareId);
}

/**
 * Sanitize file metadata
 */
export function sanitizeFileMetadata(metadata: any): Record<string, any> {
  if (!metadata || typeof metadata !== "object") {
    return {};
  }

  const sanitized: Record<string, any> = {};

  // Whitelist of allowed metadata fields
  const allowedFields = [
    "width", "height", "duration", "pages", "originalName",
    "uploadedAt", "modifiedAt", "cameraModel", "location",
  ];

  for (const field of allowedFields) {
    if (field in metadata) {
      const value = metadata[field];

      // Sanitize based on field type
      switch (field) {
      case "width":
      case "height":
      case "duration":
      case "pages": {
        // Ensure numeric values
        if (typeof value === "number" && value > 0 && value < 1000000) {
          sanitized[field] = Math.floor(value);
        }
        break;
      }

      case "originalName": {
        // Apply file name sanitization
        sanitized[field] = sanitizeFileName(String(value));
        break;
      }

      case "uploadedAt":
      case "modifiedAt": {
        // Validate date
        const date = new Date(value);
        if (!isNaN(date.getTime())) {
          sanitized[field] = date.toISOString();
        }
        break;
      }

      case "cameraModel": {
        // Basic string sanitization
        if (typeof value === "string") {
          sanitized[field] = sanitizeUserInput(value).substring(0, 100);
        }
        break;
      }

      case "location": {
        // Validate location object
        if (typeof value === "object" && value.latitude && value.longitude) {
          const lat = parseFloat(value.latitude);
          const lng = parseFloat(value.longitude);
          if (!isNaN(lat) && !isNaN(lng) &&
                lat >= -90 && lat <= 90 &&
                lng >= -180 && lng <= 180) {
            sanitized[field] = {latitude: lat, longitude: lng};
          }
        }
        break;
      }
      }
    }
  }

  return sanitized;
}

/**
 * Generate safe file ID
 */
export function generateSafeFileId(): string {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 15);
  return `vault-${timestamp}-${random}`;
}

/**
 * Check if file size is within limits
 */
export function validateFileSize(size: number, maxSizeMB: number = 100): boolean {
  if (typeof size !== "number" || size < 0) {
    return false;
  }

  const maxBytes = maxSizeMB * 1024 * 1024;
  return size <= maxBytes;
}

/**
 * Extract and validate file extension
 */
export function getFileExtension(fileName: string): string {
  const sanitized = sanitizeFileName(fileName);
  const lastDot = sanitized.lastIndexOf(".");

  if (lastDot === -1 || lastDot === sanitized.length - 1) {
    return "";
  }

  return sanitized.substring(lastDot).toLowerCase();
}

/**
 * Comprehensive vault input sanitization
 */
export function sanitizeVaultInput(input: any, type: string): any {
  switch (type) {
  case "fileName":
    return sanitizeFileName(input);

  case "folderName":
    return sanitizeFolderName(input);

  case "path":
    return sanitizeVaultPath(input);

  case "mimeType":
    return sanitizeMimeType(input);

  case "searchQuery":
    return sanitizeSearchQuery(input);

  case "tag":
    return sanitizeTag(input);

  case "sharePassword":
    return sanitizeSharePassword(input);

  case "description":
    return sanitizeUserInput(String(input)).substring(0, MAX_LENGTHS.description);

  case "metadata":
    return sanitizeFileMetadata(input);

  default:
    // Generic string sanitization
    return sanitizeUserInput(String(input));
  }
}
