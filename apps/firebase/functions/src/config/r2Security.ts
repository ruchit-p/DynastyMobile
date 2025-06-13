import {logger} from "firebase-functions/v2";
import {getFirestore} from "firebase-admin/firestore";

/**
 * Consolidated R2 Configuration
 * This replaces r2Security.ts and r2ProductionSecurity.ts
 */

// Storage plans configuration
export const STORAGE_PLANS = {
  free: {
    name: "Free",
    storageLimit: 5 * 1024 * 1024 * 1024, // 5GB
  },
  premium: {
    name: "Premium",
    storageLimit: 100 * 1024 * 1024 * 1024, // 100GB
  },
  enterprise: {
    name: "Enterprise",
    storageLimit: 1024 * 1024 * 1024 * 1024, // 1TB
  },
} as const;

export const R2_CONFIG = {
  // CORS configuration for R2 bucket
  cors: {
    allowedOrigins: process.env.NODE_ENV === "production" ?
      [
        "https://mydynastyapp.com",
        "https://www.mydynastyapp.com",
      ] :
      [
        "https://mydynastyapp.com",
        "https://dynastytest.com",
        "https://www.dynastytest.com",
        "capacitor://localhost", // iOS
        "http://localhost", // Android
        "http://localhost:3000", // Dev
        "http://localhost:3001", // Dev alternate
      ],
    allowedMethods: ["GET", "PUT", "DELETE"],
    allowedHeaders: ["Content-Type", "Content-Length", "x-amz-meta-*"],
    exposeHeaders: ["ETag"],
    maxAge: 3600,
  },

  // Content Security Policy for downloads
  csp: {
    "default-src": ["'self'"],
    "img-src": ["'self'", "data:", "https://mydynastyapp.com"],
    "media-src": ["'self'", "https://mydynastyapp.com"],
    "object-src": ["'none'"],
    "script-src": ["'none'"],
  },

  // Security headers for R2 responses
  securityHeaders: {
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "Cache-Control": "private, no-cache, no-store, must-revalidate",
    "Pragma": "no-cache",
    "Expires": "0",
  },

  // Upload validation (no size limits - checked against user storage)
  upload: {
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
  },

  // Signed URL configuration
  signedUrls: {
    uploadExpiry: 5 * 60, // 5 minutes
    downloadExpiry: 60 * 60, // 1 hour
    requireAuth: true,
    requireHttps: process.env.NODE_ENV === "production",
    includeUserIp: process.env.NODE_ENV === "production",
  },

  // Rate limiting (API protection, not file size)
  rateLimits: {
    uploadsPerMinute: 10, // Max 10 upload requests per minute per user
    downloadsPerMinute: 30, // Max 30 download requests per minute per user
    maxFilesPerDay: 500, // Max 500 files per day per user (no size limit)
  },

  // Monitoring configuration
  monitoring: {
    alertOnFailedScans: true,
    alertOnRateLimitExceeded: true,
    // Alert when user is approaching storage limit
    alertOnStorageThreshold: 0.9, // Alert at 90% capacity
    suspiciousPatterns: [
      /(\.\w+){2,}$/, // Double extensions like .pdf.exe
      // eslint-disable-next-line no-control-regex
      /[\x00-\x1F]/, // Control characters in filenames
    ],
  },
};

/**
 * Get user's storage plan and limits
 * TODO: Implement actual plan lookup from user document or subscription
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export async function getUserStoragePlan(userId: string): Promise<{
  plan: keyof typeof STORAGE_PLANS;
  storageLimit: number;
}> {
  // TODO: Fetch user's actual plan from database
  // For now, return free plan as default
  return {
    plan: "free",
    storageLimit: STORAGE_PLANS.free.storageLimit,
  };
}

/**
 * Get user's current storage usage
 * TODO: This should query the actual storage usage from database
 */
export async function getUserStorageUsage(userId: string): Promise<number> {
  const db = getFirestore();

  try {
    // Query all user's vault items
    const vaultItems = await db.collection("vaultItems")
      .where("userId", "==", userId)
      .where("isDeleted", "==", false)
      .where("type", "==", "file")
      .select("size")
      .get();

    let totalUsage = 0;
    vaultItems.forEach((doc) => {
      const data = doc.data();
      if (data.size && typeof data.size === "number") {
        totalUsage += data.size;
      }
    });

    return totalUsage;
  } catch (error) {
    logger.error("Error calculating storage usage", {userId, error});
    return 0;
  }
}

/**
 * Check if user has enough storage for upload
 */
export async function checkUserStorageCapacity(
  userId: string,
  fileSize: number
): Promise<{ allowed: boolean; reason?: string; usage?: number; limit?: number }> {
  try {
    const [plan, currentUsage] = await Promise.all([
      getUserStoragePlan(userId),
      getUserStorageUsage(userId),
    ]);

    const remainingStorage = plan.storageLimit - currentUsage;

    if (fileSize > remainingStorage) {
      return {
        allowed: false,
        reason: `Insufficient storage. You have ${formatBytes(remainingStorage)} remaining.`,
        usage: currentUsage,
        limit: plan.storageLimit,
      };
    }

    return {
      allowed: true,
      usage: currentUsage,
      limit: plan.storageLimit,
    };
  } catch (error) {
    logger.error("Error checking storage capacity", {userId, fileSize, error});
    // Fail open for now - allow upload if check fails
    return {allowed: true};
  }
}

/**
 * Validate file upload request (security only, no size limit)
 */
export function validateUploadRequest(
  fileName: string,
  mimeType: string
): { valid: boolean; error?: string } {
  const config = R2_CONFIG.upload;

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
      error: `File extension ${extension} is not allowed for security reasons`,
    };
  }

  // Check for suspicious patterns
  for (const pattern of R2_CONFIG.monitoring.suspiciousPatterns) {
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
 * Generate secure signed URL options
 */
export function getSignedUrlOptions(
  action: "read" | "write",
  userId: string,
  requestIp?: string
): any {
  const isUpload = action === "write";
  const expiry = isUpload ?
    R2_CONFIG.signedUrls.uploadExpiry :
    R2_CONFIG.signedUrls.downloadExpiry;

  const options: any = {
    version: "v4",
    action,
    expires: Date.now() + (expiry * 1000),
  };

  // Add IP restriction in production
  if (requestIp && R2_CONFIG.signedUrls.includeUserIp && process.env.NODE_ENV === "production") {
    options.conditions = [
      ["ip", requestIp],
    ];
  }

  return options;
}

/**
 * Log security event for monitoring
 */
export async function logSecurityEvent(
  event: {
    type: "upload" | "download" | "delete" | "scan_failure" | "rate_limit" | "storage_limit";
    userId: string;
    fileName?: string;
    fileSize?: number;
    result: "success" | "failure";
    reason?: string;
    ip?: string;
    storageUsage?: number;
    storageLimit?: number;
  }
): Promise<void> {
  logger.info("R2 Security Event", event);

  // Check if user is approaching storage limit
  if (event.storageUsage && event.storageLimit) {
    const usageRatio = event.storageUsage / event.storageLimit;
    if (usageRatio >= R2_CONFIG.monitoring.alertOnStorageThreshold) {
      logger.warn("User approaching storage limit", {
        userId: event.userId,
        usage: formatBytes(event.storageUsage),
        limit: formatBytes(event.storageLimit),
        percentage: Math.round(usageRatio * 100),
      });
      // TODO: Send notification to user about storage limit
    }
  }
}

/**
 * Format bytes to human readable string
 */
function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 Bytes";
  const k = 1024;
  const sizes = ["Bytes", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
}

/**
 * Generate Content Security Policy header for R2 file responses
 * @param fileType The type of file being served
 * @returns CSP header value
 */
export function generateR2CSPHeader(fileType?: string): string {
  const baseCSP = [
    "default-src 'none'",
    "object-src 'none'",
    "script-src 'none'",
    "style-src 'none'",
    "base-uri 'none'",
    "form-action 'none'",
    "frame-ancestors 'none'",
  ];

  // Add specific directives based on file type
  if (fileType?.startsWith("image/")) {
    baseCSP.push("img-src 'self'");
  } else if (fileType?.startsWith("video/") || fileType?.startsWith("audio/")) {
    baseCSP.push("media-src 'self'");
  } else if (fileType === "application/pdf") {
    baseCSP.push("object-src 'self'");
  }

  return baseCSP.join("; ");
}

/**
 * Get security headers for R2 responses
 * @param fileType Optional file type for CSP customization
 * @returns Object containing security headers
 */
export function getR2SecurityHeaders(fileType?: string): Record<string, string> {
  return {
    ...R2_CONFIG.securityHeaders,
    "Content-Security-Policy": generateR2CSPHeader(fileType),
  };
}
