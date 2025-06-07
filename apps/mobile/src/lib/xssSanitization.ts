import { logger } from '../services/LoggingService';
/**
 * XSS Prevention and Input Sanitization Utilities for React Native
 * 
 * This module provides comprehensive protection against XSS attacks by:
 * 1. Escaping HTML entities in user input
 * 2. Removing dangerous HTML tags and attributes
 * 3. Validating and sanitizing URLs
 * 4. Providing safe rendering functions
 */

/**
 * HTML entities that need to be escaped
 */
const HTML_ENTITIES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#x27;",
  "/": "&#x2F;",
  "`": "&#x60;",
  "=": "&#x3D;",
};

/**
 * Dangerous HTML tags that should be removed entirely
 */
// const DANGEROUS_TAGS = [
//   "script",
//   "iframe",
//   "object",
//   "embed",
//   "link",
//   "style",
//   "form",
//   "input",
//   "button",
//   "select",
//   "textarea",
//   "frameset",
//   "frame",
//   "applet",
//   "audio",
//   "video",
//   "canvas",
//   "map",
//   "svg",
//   "math",
//   "meta",
//   "base",
// ];

/**
 * Dangerous HTML attributes that should be removed
 */
// const DANGEROUS_ATTRIBUTES = [
//   "onclick",
//   "onload",
//   "onerror",
//   "onmouseover",
//   "onmouseout",
//   "onmousedown",
//   "onmouseup",
//   "onkeydown",
//   "onkeyup",
//   "onkeypress",
//   "onfocus",
//   "onblur",
//   "onchange",
//   "onsubmit",
//   "onreset",
//   "ondblclick",
//   "oncontextmenu",
//   "javascript:",
//   "vbscript:",
//   "data:",
//   "src",
//   "href",
//   "xlink:href",
//   "action",
//   "background",
//   "dynsrc",
//   "lowsrc",
//   "formaction",
// ];

/**
 * Escape HTML entities to prevent XSS
 * @param input The string to escape
 * @returns Escaped string safe for HTML rendering
 */
export function escapeHtml(input: string | null | undefined): string {
  if (!input) return "";
  
  return String(input).replace(/[&<>"'`=\/]/g, (char) => HTML_ENTITIES[char] || char);
}

/**
 * Remove all HTML tags from input (strict mode)
 * @param input The string to strip
 * @returns Plain text without any HTML
 */
export function stripAllHtml(input: string | null | undefined): string {
  if (!input) return "";
  
  // Remove all HTML tags and their content
  return String(input)
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "")
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, "")
    .replace(/<[^>]+>/g, "")
    .trim();
}

/**
 * Sanitize HTML by removing dangerous tags and attributes
 * For React Native, this mainly strips all HTML since RN doesn't render HTML
 * @param input The HTML string to sanitize
 * @returns Sanitized string
 */
export function sanitizeHtml(input: string | null | undefined): string {
  if (!input) return "";
  
  // For React Native, we typically want to strip all HTML
  // since Text components don't render HTML
  return stripAllHtml(input);
}

/**
 * Sanitize URL to prevent javascript: and data: protocols
 * @param url The URL to sanitize
 * @returns Sanitized URL or empty string if dangerous
 */
export function sanitizeUrl(url: string | null | undefined): string {
  if (!url) return "";
  
  const trimmedUrl = String(url).trim().toLowerCase();
  
  // Block dangerous protocols
  if (
    trimmedUrl.startsWith("javascript:") ||
    trimmedUrl.startsWith("vbscript:") ||
    trimmedUrl.startsWith("data:") ||
    trimmedUrl.includes("javascript:") ||
    trimmedUrl.includes("vbscript:")
  ) {
    logger.warn("Blocked dangerous URL protocol", trimmedUrl.substring(0, 50));
    return "";
  }
  
  // Ensure URL starts with safe protocol
  if (!trimmedUrl.match(/^https?:\/\/|^\/|^#|^mailto:/)) {
    return "";
  }
  
  return String(url).trim();
}

/**
 * Sanitize user input for safe storage and display
 * This is the main function to use for general user input
 * @param input The user input to sanitize
 * @param options Sanitization options
 * @returns Sanitized input
 */
export function sanitizeUserInput(
  input: string | null | undefined,
  options: {
    maxLength?: number;
    trim?: boolean;
    stripHtml?: boolean;
  } = {}
): string {
  if (!input) return "";
  
  const {
    maxLength = 10000,
    trim = true,
    stripHtml = true,
  } = options;
  
  let sanitized = String(input);
  
  // Trim if requested
  if (trim) {
    sanitized = sanitized.trim();
  }
  
  // Apply length limit
  if (sanitized.length > maxLength) {
    sanitized = sanitized.substring(0, maxLength);
  }
  
  // Strip HTML for React Native
  if (stripHtml) {
    sanitized = stripAllHtml(sanitized);
  } else {
    // At minimum, escape HTML entities
    sanitized = escapeHtml(sanitized);
  }
  
  // Additional safety: remove null bytes and other control characters
  sanitized = sanitized.replace(/\0/g, "").replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "");
  
  return sanitized;
}

/**
 * Sanitize an object by applying sanitization to all string values
 * @param obj The object to sanitize
 * @param options Sanitization options
 * @returns New object with sanitized values
 */
export function sanitizeObject<T extends Record<string, any>>(
  obj: T,
  options: {
    maxLength?: number;
    excludeKeys?: string[];
    stripHtml?: boolean;
  } = {}
): T {
  const { excludeKeys = [] } = options;
  const sanitized: any = {};
  
  for (const [key, value] of Object.entries(obj)) {
    if (excludeKeys.includes(key)) {
      sanitized[key] = value;
    } else if (typeof value === "string") {
      sanitized[key] = sanitizeUserInput(value, options);
    } else if (Array.isArray(value)) {
      sanitized[key] = value.map(item => 
        typeof item === "string" ? sanitizeUserInput(item, options) : item
      );
    } else if (value && typeof value === "object" && !(value instanceof Date)) {
      // Recursively sanitize nested objects (but not Dates)
      sanitized[key] = sanitizeObject(value, options);
    } else {
      sanitized[key] = value;
    }
  }
  
  return sanitized as T;
}

/**
 * Validate and sanitize file names to prevent path traversal
 * @param filename The filename to sanitize
 * @returns Sanitized filename
 */
export function sanitizeFilename(filename: string | null | undefined): string {
  if (!filename) return "";
  
  // Remove path traversal attempts
  let sanitized = String(filename)
    .replace(/\.\./g, "")
    .replace(/[\/\\]/g, "")
    .replace(/^\.+/, "");
  
  // Remove dangerous characters
  sanitized = sanitized.replace(/[^\w\s\-\.\(\)]/g, "");
  
  // Limit length
  if (sanitized.length > 255) {
    const extension = sanitized.split(".").pop() || "";
    const name = sanitized.substring(0, 250 - extension.length - 1);
    sanitized = `${name}.${extension}`;
  }
  
  return sanitized || "unnamed";
}

/**
 * Check if input contains potential XSS patterns
 * @param input The input to check
 * @returns True if suspicious patterns detected
 */
export function detectXSSPatterns(input: string | null | undefined): boolean {
  if (!input) return false;
  
  const patterns = [
    /<script[\s>]/i,
    /<iframe[\s>]/i,
    /javascript:/i,
    /on\w+\s*=/i,
    /<object[\s>]/i,
    /<embed[\s>]/i,
    /vbscript:/i,
    /data:text\/html/i,
    /<img[^>]+src[^>]+>/i,
    /<link[^>]+href[^>]+>/i,
  ];
  
  return patterns.some(pattern => pattern.test(String(input)));
}

/**
 * Sanitize text for display in React Native Text components
 * This is specifically for React Native where we don't render HTML
 * @param text The text to sanitize
 * @param maxLength Maximum length allowed
 * @returns Sanitized text safe for display
 */
export function sanitizeForDisplay(text: string | null | undefined, maxLength: number = 1000): string {
  if (!text) return "";
  
  // Remove all HTML tags and entities
  let sanitized = stripAllHtml(text);
  
  // Remove any control characters
  sanitized = sanitized.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "");
  
  // Trim and limit length
  sanitized = sanitized.trim();
  if (sanitized.length > maxLength) {
    sanitized = sanitized.substring(0, maxLength - 3) + "...";
  }
  
  return sanitized;
}

/**
 * Sanitize form data before submission
 * @param formData The form data object
 * @param config Field-specific configuration
 * @returns Sanitized form data
 */
export function sanitizeFormData<T extends Record<string, any>>(
  formData: T,
  config: Record<string, { maxLength?: number; stripHtml?: boolean }> = {}
): T {
  const sanitized: any = {};
  
  for (const [key, value] of Object.entries(formData)) {
    const fieldConfig = config[key] || {};
    
    if (typeof value === "string") {
      sanitized[key] = sanitizeUserInput(value, {
        maxLength: fieldConfig.maxLength || 1000,
        stripHtml: fieldConfig.stripHtml !== false, // Default to true
        trim: true,
      });
    } else if (Array.isArray(value)) {
      sanitized[key] = value.map(item => {
        if (typeof item === "string") {
          return sanitizeUserInput(item, {
            maxLength: fieldConfig.maxLength || 1000,
            stripHtml: fieldConfig.stripHtml !== false,
            trim: true,
          });
        }
        return item;
      });
    } else {
      sanitized[key] = value;
    }
  }
  
  return sanitized as T;
}

/**
 * Validate and sanitize user IDs to prevent injection attacks
 * @param userId The user ID to validate
 * @returns The validated user ID
 * @throws Error if the user ID is invalid
 */
export function sanitizeUserId(userId: string): string {
  if (!userId || typeof userId !== 'string') {
    throw new Error('Invalid user ID format');
  }

  // Trim whitespace
  const trimmed = userId.trim();
  
  // Check if empty after trimming
  if (!trimmed) {
    throw new Error('Invalid user ID format');
  }

  // Check length (Firebase UIDs can be up to 128 characters)
  if (trimmed.length > 128) {
    throw new Error('Invalid user ID format');
  }

  // Only allow alphanumeric characters, hyphens, and underscores
  if (!/^[a-zA-Z0-9_-]+$/.test(trimmed)) {
    throw new Error('Invalid user ID format');
  }

  return trimmed;
}

/**
 * Sanitize email addresses
 * @param email The email to sanitize
 * @returns Sanitized email
 */
export function sanitizeEmail(email: string | null | undefined): string {
  if (!email) return '';
  
  // Convert to lowercase and trim
  let sanitized = String(email).toLowerCase().trim();
  
  // Remove any HTML tags or scripts
  sanitized = stripAllHtml(sanitized);
  
  // Remove dangerous characters but keep valid email chars
  sanitized = sanitized.replace(/[^a-z0-9@.\-_+]/gi, '');
  
  // Validate basic email format
  if (!sanitized.includes('@') || sanitized.includes('..')) {
    return '';
  }
  
  return sanitized;
}

/**
 * Sanitize phone numbers
 * @param phone The phone number to sanitize
 * @returns Sanitized phone number
 */
export function sanitizePhoneNumber(phone: string | null | undefined): string {
  if (!phone) return '';
  
  // Remove all non-numeric characters except + for international
  let sanitized = String(phone).replace(/[^\d+]/g, '');
  
  // Ensure + is only at the beginning
  if (sanitized.includes('+')) {
    const hasLeadingPlus = sanitized.startsWith('+');
    sanitized = sanitized.replace(/\+/g, '');
    if (hasLeadingPlus) {
      sanitized = '+' + sanitized;
    }
  }
  
  return sanitized;
}