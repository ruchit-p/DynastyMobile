import {logger} from "firebase-functions/v2";

/**
 * Production-specific security configurations for R2
 */
export const R2_PRODUCTION_SECURITY = {
  // Signed URL settings
  signedUrls: {
    uploadExpiry: 5 * 60, // 5 minutes (not longer!)
    downloadExpiry: 60 * 60, // 1 hour max
    requireHttps: true, // Force HTTPS
    includeUserIp: true, // Tie URLs to user's IP
  },

  // Rate limiting
  rateLimits: {
    uploadsPerMinute: 10, // Max 10 uploads per minute per user
    downloadsPerMinute: 30, // Max 30 downloads per minute per user
    maxFilesPerDay: 100, // Max 100 files per day per user
  },

  // File restrictions (stricter for production)
  fileRestrictions: {
    maxFileSize: 50 * 1024 * 1024, // 50MB (vs 100MB in dev)

    // Strictly allowed MIME types only
    allowedMimeTypes: [
      // Images
      "image/jpeg",
      "image/png",
      "image/webp",
      "image/heic",

      // Videos
      "video/mp4",
      "video/quicktime",

      // Documents
      "application/pdf",

      // Audio
      "audio/mpeg",
      "audio/mp4",
    ],

    // Dangerous file extensions to always block
    blockedExtensions: [
      ".exe", ".bat", ".cmd", ".sh", ".ps1",
      ".app", ".dmg", ".pkg", ".deb", ".rpm",
      ".jar", ".zip", ".rar", ".7z",
      ".html", ".htm", ".js", ".php", ".asp",
      ".scr", ".vbs", ".wsf", ".com", ".pif",
    ],
  },

  // Monitoring thresholds
  monitoring: {
    alertOnFailedScans: true,
    alertOnRateLimitExceeded: true,
    alertOnLargeUploads: 40 * 1024 * 1024, // Alert on files > 40MB
    suspiciousPatterns: [
      /(\.\w+){2,}$/, // Double extensions like .pdf.exe
      // eslint-disable-next-line no-control-regex
      /[\x00-\x1F]/, // Control characters in filenames
    ],
  },
};

/**
 * Validate request origin for production
 */
export function validateProductionOrigin(origin: string | undefined): boolean {
  if (!origin) return false;

  const allowedOrigins = [
    "https://mydynastyapp.com",
    "https://www.mydynastyapp.com",
    "https://app.mydynastyapp.com",
    "https://api.mydynastyapp.com",
  ];

  return allowedOrigins.includes(origin);
}

/**
 * Generate secure signed URL options for production
 */
export function getProductionSignedUrlOptions(
  userId: string,
  requestIp?: string
): any {
  const options: any = {
    version: "v4",
    action: "write",
    expires: Date.now() + (R2_PRODUCTION_SECURITY.signedUrls.uploadExpiry * 1000),
  };

  // Add IP restriction if available
  if (requestIp && R2_PRODUCTION_SECURITY.signedUrls.includeUserIp) {
    options.conditions = [
      ["ip", requestIp],
    ];
  }

  return options;
}

/**
 * Log security event for production monitoring
 */
export async function logProductionSecurityEvent(
  event: {
    type: "upload" | "download" | "delete" | "scan_failure" | "rate_limit";
    userId: string;
    fileName?: string;
    fileSize?: number;
    result: "success" | "failure";
    reason?: string;
    ip?: string;
  }
): Promise<void> {
  logger.warn("Security event", event);

  // In production, you might want to:
  // 1. Send to security monitoring service
  // 2. Trigger alerts for suspicious patterns
  // 3. Update user risk score
  // 4. Block user if too many failures
}
