/**
 * Input sanitization utilities to prevent XSS attacks
 */

/**
 * Sanitize user input for display in HTML
 * Escapes HTML special characters to prevent XSS
 */
export function sanitizeUserInput(input: string | null | undefined): string {
  if (!input) return '';
  
  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;')
    .replace(/\//g, '&#x2F;');
}

/**
 * Sanitize user ID for display (shows only first 8 characters)
 */
export function sanitizeUserId(userId: string | null | undefined): string {
  if (!userId) return 'Unknown';
  if (userId.length <= 8) return userId.substring(0, 4) + '****';
  return userId.substring(0, 8) + '...';
}

/**
 * Sanitize email for display (masks the local part)
 */
export function sanitizeEmail(email: string | null | undefined): string {
  if (!email) return 'Unknown';
  const parts = email.split('@');
  if (parts.length !== 2) return 'Invalid****';
  
  const localPart = parts[0];
  const domain = parts[1];
  
  if (localPart.length <= 2) {
    return localPart.charAt(0) + '****@' + domain;
  }
  
  return localPart.charAt(0) + '****' + localPart.charAt(localPart.length - 1) + '@' + domain;
}

/**
 * Sanitize phone number for display (shows only last 4 digits)
 */
export function sanitizePhoneNumber(phone: string | null | undefined): string {
  if (!phone) return 'Unknown';
  const digits = phone.replace(/\D/g, '');
  if (digits.length < 4) return '****';
  return '****' + digits.substring(digits.length - 4);
}

/**
 * Sanitize and truncate long text
 */
export function sanitizeAndTruncate(text: string | null | undefined, maxLength: number = 100): string {
  if (!text) return '';
  const sanitized = sanitizeUserInput(text);
  if (sanitized.length <= maxLength) return sanitized;
  return sanitized.substring(0, maxLength) + '...';
}

/**
 * Sanitize object for display (recursively sanitizes all string values)
 */
export function sanitizeObject<T extends Record<string, any>>(obj: T): T {
  const sanitized = {} as T;
  
  for (const [key, value] of Object.entries(obj)) {
    if (typeof value === 'string') {
      // Apply appropriate sanitization based on key name
      if (key.toLowerCase().includes('userid') || key === 'id' || key === 'uid') {
        sanitized[key as keyof T] = sanitizeUserId(value) as T[keyof T];
      } else if (key.toLowerCase().includes('email')) {
        sanitized[key as keyof T] = sanitizeEmail(value) as T[keyof T];
      } else if (key.toLowerCase().includes('phone')) {
        sanitized[key as keyof T] = sanitizePhoneNumber(value) as T[keyof T];
      } else {
        sanitized[key as keyof T] = sanitizeUserInput(value) as T[keyof T];
      }
    } else if (value && typeof value === 'object' && !Array.isArray(value) && !(value instanceof Date)) {
      sanitized[key as keyof T] = sanitizeObject(value) as T[keyof T];
    } else {
      sanitized[key as keyof T] = value;
    }
  }
  
  return sanitized;
}

/**
 * Create safe HTML from user content
 * This is a basic implementation - for production, use a library like DOMPurify
 */
export function createSafeHTML(content: string): { __html: string } {
  // Basic sanitization - in production, use DOMPurify
  const sanitized = sanitizeUserInput(content)
    .replace(/\n/g, '<br />')
    .replace(/\[b\](.*?)\[\/b\]/g, '<strong>$1</strong>')
    .replace(/\[i\](.*?)\[\/i\]/g, '<em>$1</em>');
  
  return { __html: sanitized };
}

/**
 * Validate and sanitize URL
 */
export function sanitizeUrl(url: string | null | undefined): string {
  if (!url) return '#';
  
  // Only allow http, https, and relative URLs
  const trimmed = url.trim();
  if (trimmed.startsWith('/') || 
      trimmed.startsWith('http://') || 
      trimmed.startsWith('https://')) {
    return sanitizeUserInput(trimmed);
  }
  
  return '#';
}

/**
 * Sanitize file name
 */
export function sanitizeFileName(fileName: string | null | undefined): string {
  if (!fileName) return 'unknown-file';
  
  // Remove path traversal attempts and special characters
  return fileName
    .replace(/\.\./g, '')
    .replace(/[\/\\]/g, '')
    .replace(/[^a-zA-Z0-9.-]/g, '_')
    .substring(0, 255);
}