import { auth } from '@/lib/firebase';
import { httpsCallable } from 'firebase/functions';
import { functions } from '@/lib/firebase';

export interface AdminUser {
  uid: string;
  email: string;
  isAdmin: boolean;
  adminSince?: string;
  lastVerified?: Date;
}

export interface AdminAuditLog {
  id: string;
  action: AdminAction;
  targetUserId?: string;
  performedBy: string;
  timestamp: Date;
  metadata?: Record<string, any>;
}

export type AdminAction = 
  | 'GRANT_ADMIN' 
  | 'REVOKE_ADMIN' 
  | 'ADMIN_ACCESS_VERIFIED'
  | 'ADMIN_LOGIN'
  | 'ADMIN_LOGOUT'
  | 'USER_MODIFIED'
  | 'USER_SUSPENDED'
  | 'USER_REACTIVATED'
  | 'SUBSCRIPTION_MODIFIED'
  | 'CONTENT_MODERATED'
  | 'SYSTEM_CONFIG_CHANGED'
  | 'FEATURE_FLAG_TOGGLED';

export class AdminSecurityService {
  private static instance: AdminSecurityService;
  private verificationCache: Map<string, { verified: boolean; timestamp: number }> = new Map();
  private readonly CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

  private constructor() {}

  static getInstance(): AdminSecurityService {
    if (!AdminSecurityService.instance) {
      AdminSecurityService.instance = new AdminSecurityService();
    }
    return AdminSecurityService.instance;
  }

  /**
   * Verifies if the current user has admin access
   */
  async verifyAdminAccess(): Promise<boolean> {
    try {
      const user = auth.currentUser;
      if (!user) return false;

      // Check cache
      const cached = this.verificationCache.get(user.uid);
      if (cached && Date.now() - cached.timestamp < this.CACHE_DURATION) {
        return cached.verified;
      }

      // Get fresh ID token with custom claims
      const idTokenResult = await user.getIdTokenResult(true);
      
      // Check custom claim
      if (!idTokenResult.claims.admin) {
        this.verificationCache.set(user.uid, { verified: false, timestamp: Date.now() });
        return false;
      }

      // Call Firebase function for additional verification
      const verifyAdmin = httpsCallable(functions, 'verifyAdminAccess');
      const result = await verifyAdmin();
      const data = result.data as any;

      const verified = data.success && data.isAdmin;
      this.verificationCache.set(user.uid, { verified, timestamp: Date.now() });
      
      return verified;
    } catch (error) {
      console.error('Admin verification failed:', error);
      return false;
    }
  }

  /**
   * Clears the verification cache (e.g., on logout)
   */
  clearCache(): void {
    this.verificationCache.clear();
  }

  /**
   * Checks if the request is from an allowed IP (for server-side validation)
   */
  isAllowedIP(ip: string, allowedIPs: string[]): boolean {
    if (allowedIPs.length === 0) return true; // No IP restrictions
    
    return allowedIPs.some(allowedIP => {
      // Support CIDR notation
      if (allowedIP.includes('/')) {
        return this.isIPInCIDR(ip, allowedIP);
      }
      return ip === allowedIP;
    });
  }

  /**
   * Check if IP is in CIDR range
   */
  private isIPInCIDR(ip: string, cidr: string): boolean {
    const [range, bits = '32'] = cidr.split('/');
    const mask = -1 << (32 - parseInt(bits));
    
    const ipNum = this.ipToNumber(ip);
    const rangeNum = this.ipToNumber(range);
    
    return (ipNum & mask) === (rangeNum & mask);
  }

  /**
   * Convert IP address to number for CIDR calculation
   */
  private ipToNumber(ip: string): number {
    return ip.split('.').reduce((acc, octet) => (acc << 8) + parseInt(octet), 0) >>> 0;
  }

  /**
   * Logs an admin action
   */
  async logAdminAction(
    action: AdminAction,
    metadata?: Record<string, any>
  ): Promise<void> {
    try {
      // This would be called from Firebase Functions
      // Client-side logging is handled by the functions
      console.log('Admin action:', action, metadata);
    } catch (error) {
      console.error('Failed to log admin action:', error);
    }
  }

  /**
   * Generate a secure admin session token
   */
  async generateAdminSessionToken(): Promise<string> {
    const user = auth.currentUser;
    if (!user) throw new Error('No authenticated user');

    // Get a fresh ID token
    const idToken = await user.getIdToken(true);
    
    // Add additional entropy
    const timestamp = Date.now();
    const random = crypto.getRandomValues(new Uint8Array(16));
    const entropy = Array.from(random).map(b => b.toString(16).padStart(2, '0')).join('');
    
    // Create session identifier
    const sessionData = `${idToken}:${timestamp}:${entropy}`;
    
    // Hash it for storage
    const encoder = new TextEncoder();
    const data = encoder.encode(sessionData);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const sessionToken = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    
    return sessionToken;
  }

  /**
   * Validate admin subdomain
   */
  isAdminSubdomain(): boolean {
    const hostname = window.location.hostname;
    return hostname.startsWith('admin.') || hostname === 'admin.localhost';
  }

  /**
   * Get admin dashboard URL
   */
  getAdminDashboardUrl(): string {
    const isDevelopment = process.env.NODE_ENV === 'development';
    
    if (isDevelopment) {
      return 'http://admin.localhost:3002/dashboard';
    }
    
    // Use the main domain from current hostname
    const currentHost = window.location.hostname;
    const mainDomain = currentHost.replace(/^(www\.|admin\.)/, '');
    
    return `https://admin.${mainDomain}/dashboard`;
  }

  /**
   * Redirect to admin subdomain if not already there
   */
  ensureAdminSubdomain(): void {
    if (!this.isAdminSubdomain()) {
      window.location.href = this.getAdminDashboardUrl();
    }
  }
}

// Export singleton instance
export const adminSecurity = AdminSecurityService.getInstance();