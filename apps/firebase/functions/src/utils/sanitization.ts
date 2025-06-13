/**
 * Utility functions for sanitizing sensitive data in logs and error messages
 */

/**
 * Sanitize a user ID by showing only first 8 characters
 */
export function sanitizeUserId(userId?: string | null): string {
  if (!userId) return "unknown";
  if (userId.length <= 8) return userId.substring(0, 4) + "****";
  return userId.substring(0, 8) + "...";
}

/**
 * Sanitize an email address by masking the local part
 */
export function sanitizeEmail(email?: string | null): string {
  if (!email) return "unknown";
  const parts = email.split("@");
  if (parts.length !== 2) return "invalid****";

  const localPart = parts[0];
  const domain = parts[1];

  if (localPart.length <= 2) {
    return localPart.charAt(0) + "****@" + domain;
  }

  return localPart.charAt(0) + "****" + localPart.charAt(localPart.length - 1) + "@" + domain;
}

/**
 * Sanitize a phone number by showing only last 4 digits
 */
export function sanitizePhoneNumber(phone?: string | null): string {
  if (!phone) return "unknown";
  const digits = phone.replace(/\D/g, "");
  if (digits.length < 4) return "****";
  return "****" + digits.substring(digits.length - 4);
}

/**
 * Sanitize a file path by showing only the filename
 */
export function sanitizeFilePath(path?: string | null): string {
  if (!path) return "unknown";
  const parts = path.split("/");
  return parts[parts.length - 1] || "unknown";
}

/**
 * Create a structured log context with sanitized data
 */
export function createLogContext(data: Record<string, any>): Record<string, any> {
  const sanitized: Record<string, any> = {};

  for (const [key, value] of Object.entries(data)) {
    if (key.toLowerCase().includes("userid") || key === "uid") {
      sanitized[key] = sanitizeUserId(value);
    } else if (key.toLowerCase().includes("email")) {
      sanitized[key] = sanitizeEmail(value);
    } else if (key.toLowerCase().includes("phone")) {
      sanitized[key] = sanitizePhoneNumber(value);
    } else if (key.toLowerCase().includes("path") && typeof value === "string") {
      sanitized[key] = sanitizeFilePath(value);
    } else {
      sanitized[key] = value;
    }
  }

  return sanitized;
}

/**
 * Format error for logging with sanitized context
 */
export function formatErrorForLogging(error: any, context?: Record<string, any>): {
  message: string;
  context: Record<string, any>;
} {
  const errorMessage = error instanceof Error ? error.message : String(error);
  const sanitizedContext = context ? createLogContext(context) : {};

  return {
    message: errorMessage,
    context: {
      ...sanitizedContext,
      errorType: error?.constructor?.name || "Unknown",
      stack: process.env.NODE_ENV === "development" ? error?.stack : undefined,
    },
  };
}
