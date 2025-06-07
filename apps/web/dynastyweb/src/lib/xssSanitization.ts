/**
 * XSS Prevention and Input Sanitization Utilities for Next.js Web App
 * 
 * This module provides comprehensive protection against XSS attacks by:
 * 1. Escaping HTML entities in user input
 * 2. Removing dangerous HTML tags and attributes
 * 3. Validating and sanitizing URLs
 * 4. Providing safe rendering functions
 */

import DOMPurify from 'isomorphic-dompurify';

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
  
  // Use DOMPurify to strip all tags
  return DOMPurify.sanitize(input, { ALLOWED_TAGS: [] });
}

/**
 * Sanitize HTML by removing dangerous tags and attributes
 * Allows safe formatting tags like <b>, <i>, <p>, etc.
 * @param input The HTML string to sanitize
 * @param allowedTags Optional list of allowed tags (defaults to safe formatting tags)
 * @returns Sanitized HTML string
 */
export function sanitizeHtml(
  input: string | null | undefined,
  allowedTags: string[] = ["b", "i", "u", "strong", "em", "p", "br", "span", "div", "h1", "h2", "h3", "h4", "h5", "h6", "blockquote", "code", "pre", "ul", "ol", "li", "a"]
): string {
  if (!input) return "";
  
  // Configure DOMPurify
  const allowedAttributes = ['class', 'id', 'style'];
  
  // For links, only allow safe protocols
  if (allowedTags.includes('a')) {
    allowedAttributes.push('href', 'target', 'rel');
  }
  
  const config: Record<string, unknown> = {
    ALLOWED_TAGS: allowedTags,
    ALLOWED_ATTR: allowedAttributes,
    FORBID_TAGS: ['script', 'iframe', 'object', 'embed', 'link', 'style', 'form', 'input'],
    FORBID_ATTR: ['onclick', 'onload', 'onerror', 'onmouseover', 'onmouseout', 'onkeydown', 'onkeyup'],
  };
  
  if (allowedTags.includes('a')) {
    config.ALLOWED_URI_REGEXP = /^(?:(?:https?|mailto):|[^a-z]|[a-z+.\-]+(?:[^a-z+.\-:]|$))/i;
  }
  
  return DOMPurify.sanitize(input, config) as unknown as string;
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
    console.warn("Blocked dangerous URL protocol", trimmedUrl.substring(0, 50));
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
    allowHtml?: boolean;
    allowedTags?: string[];
    maxLength?: number;
    trim?: boolean;
  } = {}
): string {
  if (!input) return "";
  
  const {
    allowHtml = false,
    allowedTags,
    maxLength = 10000,
    trim = true,
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
  
  // Apply appropriate sanitization
  if (allowHtml) {
    sanitized = sanitizeHtml(sanitized, allowedTags);
  } else {
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
export function sanitizeObject<T extends Record<string, unknown>>(
  obj: T,
  options: {
    allowHtml?: boolean;
    allowedTags?: string[];
    maxLength?: number;
    excludeKeys?: string[];
  } = {}
): T {
  const { excludeKeys = [] } = options;
  const sanitized: Record<string, unknown> = {};
  
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
      sanitized[key] = sanitizeObject(value as Record<string, unknown>, options);
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
 * Create safe HTML for dangerouslySetInnerHTML in React
 * @param html The HTML to sanitize
 * @param options Sanitization options
 * @returns Object safe for dangerouslySetInnerHTML
 */
export function createSafeHtml(
  html: string,
  options?: Parameters<typeof sanitizeHtml>[1]
): { __html: string } {
  return {
    __html: sanitizeHtml(html, options)
  };
}

/**
 * Sanitize form data before submission
 * @param formData The form data object
 * @param config Field-specific configuration
 * @returns Sanitized form data
 */
export function sanitizeFormData<T extends Record<string, unknown>>(
  formData: T,
  config: Record<string, { 
    maxLength?: number; 
    allowHtml?: boolean;
    allowedTags?: string[];
  }> = {}
): T {
  const sanitized: Record<string, unknown> = {};
  
  for (const [key, value] of Object.entries(formData)) {
    const fieldConfig = config[key] || {};
    
    if (typeof value === "string") {
      sanitized[key] = sanitizeUserInput(value, {
        maxLength: fieldConfig.maxLength || 1000,
        allowHtml: fieldConfig.allowHtml || false,
        allowedTags: fieldConfig.allowedTags,
        trim: true,
      });
    } else if (Array.isArray(value)) {
      sanitized[key] = value.map(item => {
        if (typeof item === "string") {
          return sanitizeUserInput(item, {
            maxLength: fieldConfig.maxLength || 1000,
            allowHtml: fieldConfig.allowHtml || false,
            allowedTags: fieldConfig.allowedTags,
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
 * Log potential XSS attempt for security monitoring
 * @param input The suspicious input
 * @param context Additional context
 */
export function logXSSAttempt(input: string, context: Record<string, unknown> = {}): void {
  console.warn("Potential XSS attempt detected", {
    ...context,
    inputLength: input.length,
    inputPreview: input.substring(0, 100),
    patterns: {
      hasScriptTag: /<script/i.test(input),
      hasEventHandler: /on\w+\s*=/i.test(input),
      hasJavascriptProtocol: /javascript:/i.test(input),
    },
    timestamp: new Date().toISOString(),
  });
  
  // In production, you might want to send this to a security monitoring service
  // Example: sendToSecurityMonitoring({ type: 'xss_attempt', ...context });
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