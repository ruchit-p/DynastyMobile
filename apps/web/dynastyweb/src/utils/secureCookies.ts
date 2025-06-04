// Secure Cookie Utility for Dynasty Web App
// Provides secure cookie management with proper security attributes

interface CookieOptions {
  expires?: Date;
  maxAge?: number; // in seconds
  domain?: string;
  path?: string;
  secure?: boolean;
  httpOnly?: boolean;
  sameSite?: 'Strict' | 'Lax' | 'None';
}

export class SecureCookieManager {
  private static isProduction = process.env.NODE_ENV === 'production';
  private static isSecureContext = typeof window !== 'undefined' && window.isSecureContext;

  /**
   * Set a secure cookie with proper security attributes
   */
  static set(name: string, value: string, options: CookieOptions = {}) {
    if (typeof document === 'undefined') return;

    const defaultOptions: CookieOptions = {
      path: '/',
      secure: this.isProduction || this.isSecureContext,
      sameSite: 'Strict',
      // httpOnly cannot be set from JavaScript for security reasons
      ...options
    };

    let cookieString = `${encodeURIComponent(name)}=${encodeURIComponent(value)}`;

    if (defaultOptions.expires) {
      cookieString += `; Expires=${defaultOptions.expires.toUTCString()}`;
    }

    if (defaultOptions.maxAge) {
      cookieString += `; Max-Age=${defaultOptions.maxAge}`;
    }

    if (defaultOptions.domain) {
      cookieString += `; Domain=${defaultOptions.domain}`;
    }

    cookieString += `; Path=${defaultOptions.path}`;

    if (defaultOptions.secure) {
      cookieString += '; Secure';
    }

    if (defaultOptions.sameSite) {
      cookieString += `; SameSite=${defaultOptions.sameSite}`;
    }

    document.cookie = cookieString;
  }

  /**
   * Get a cookie value by name
   */
  static get(name: string): string | null {
    if (typeof document === 'undefined') return null;

    const nameEQ = encodeURIComponent(name) + '=';
    const cookies = document.cookie.split(';');

    for (let cookie of cookies) {
      cookie = cookie.trim();
      if (cookie.indexOf(nameEQ) === 0) {
        return decodeURIComponent(cookie.substring(nameEQ.length));
      }
    }

    return null;
  }

  /**
   * Delete a cookie
   */
  static delete(name: string, options: Pick<CookieOptions, 'domain' | 'path'> = {}) {
    this.set(name, '', {
      ...options,
      expires: new Date(0),
      maxAge: 0
    });
  }


  /**
   * Check if we're in a secure context (HTTPS or localhost)
   */
  static isSecure(): boolean {
    return this.isProduction || this.isSecureContext;
  }
}

// Export convenience functions
export const setCookie = SecureCookieManager.set.bind(SecureCookieManager);
export const getCookie = SecureCookieManager.get.bind(SecureCookieManager);
export const deleteCookie = SecureCookieManager.delete.bind(SecureCookieManager);