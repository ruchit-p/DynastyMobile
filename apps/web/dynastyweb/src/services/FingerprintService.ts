import { 
  FingerprintJSPro,
  FpjsProvider,
} from '@fingerprintjs/fingerprintjs-pro-react';
import { auth, functions } from '@/lib/firebase';
import { httpsCallable } from 'firebase/functions';

// FingerprintJS configuration
const FINGERPRINT_API_KEY = process.env.NEXT_PUBLIC_FINGERPRINT_API_KEY || '';
const FINGERPRINT_ENDPOINT = process.env.NEXT_PUBLIC_FINGERPRINT_ENDPOINT || 'https://api.fpjs.io';
const FINGERPRINT_REGION = process.env.NEXT_PUBLIC_FINGERPRINT_REGION || 'global';

export interface DeviceFingerprint {
  visitorId: string;
  requestId: string;
  confidence: number;
  lastVerified: Date;
}

export interface DeviceTrustResult {
  success: boolean;
  device?: {
    id: string;
    deviceName: string;
    trustScore: number;
    isNewDevice: boolean;
  };
  riskAssessment?: {
    riskLevel: 'low' | 'medium' | 'high';
    riskFactors: string[];
    requiresAdditionalAuth: boolean;
  };
  requiresAdditionalAuth: boolean;
}

class FingerprintService {
  private fpjsClient: FingerprintJSPro | null = null;
  private initPromise: Promise<void> | null = null;
  private isInitialized = false;

  /**
   * Initialize FingerprintJS Pro client
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) return;
    
    // Prevent multiple initialization attempts
    if (this.initPromise) {
      return this.initPromise;
    }

    this.initPromise = this._initialize();
    return this.initPromise;
  }

  private async _initialize(): Promise<void> {
    try {
      if (!FINGERPRINT_API_KEY) {
        console.warn('FingerprintService: API key not configured, service disabled');
        return;
      }

      // Dynamic import to avoid SSR issues
      const FingerprintJSPro = (await import('@fingerprintjs/fingerprintjs-pro')).default;

      this.fpjsClient = await FingerprintJSPro.load({
        apiKey: FINGERPRINT_API_KEY,
        endpoint: FINGERPRINT_ENDPOINT,
        region: FINGERPRINT_REGION as any
      });
      
      this.isInitialized = true;
      console.log('FingerprintService: Initialized successfully');
    } catch (error) {
      console.error('FingerprintService: Initialization failed:', error);
    }
  }

  /**
   * Get device fingerprint
   */
  async getFingerprint(tags?: Record<string, string>): Promise<DeviceFingerprint | null> {
    try {
      // Ensure service is initialized
      await this.initialize();
      
      if (!this.fpjsClient || !this.isInitialized) {
        console.warn('FingerprintService: Not initialized');
        return this.getCachedFingerprint();
      }

      // Get visitor data
      const result = await this.fpjsClient.get({
        tag: tags,
        linkedId: auth.currentUser?.uid,
        extendedResult: true
      });

      const fingerprint: DeviceFingerprint = {
        visitorId: result.visitorId,
        requestId: result.requestId,
        confidence: result.confidence?.score || 0,
        lastVerified: new Date()
      };

      // Cache the fingerprint
      this.cacheFingerprint(fingerprint);

      return fingerprint;
    } catch (error) {
      console.error('FingerprintService: Failed to get fingerprint:', error);
      
      // Fallback to cached data
      const cached = this.getCachedFingerprint();
      if (cached) return cached;
      
      return null;
    }
  }

  /**
   * Verify device with Firebase backend
   */
  async verifyDevice(
    userId: string,
    deviceInfo?: {
      deviceName?: string;
      deviceType?: string;
      platform?: string;
    }
  ): Promise<DeviceTrustResult> {
    try {
      const fingerprint = await this.getFingerprint({
        userId,
        action: 'device_verification'
      });

      if (!fingerprint) {
        return {
          success: false,
          requiresAdditionalAuth: true
        };
      }

      // Check cache first
      const cachedTrust = this.getCachedTrust(userId, fingerprint.visitorId);
      if (cachedTrust && this.isCacheValid(cachedTrust.timestamp)) {
        return cachedTrust.result;
      }

      // Verify with backend
      const verifyDeviceFingerprint = httpsCallable<any, DeviceTrustResult>(
        functions,
        'verifyDeviceFingerprint'
      );
      
      const result = await verifyDeviceFingerprint({
        requestId: fingerprint.requestId,
        visitorId: fingerprint.visitorId,
        deviceInfo: deviceInfo || this.getWebDeviceInfo()
      });

      const trustResult = result.data;

      // Cache the result
      this.cacheTrustResult(userId, fingerprint.visitorId, trustResult);

      return trustResult;
    } catch (error) {
      console.error('FingerprintService: Device verification failed:', error);
      
      return {
        success: false,
        requiresAdditionalAuth: true
      };
    }
  }

  /**
   * Check if device is trusted (quick check)
   */
  async isDeviceTrusted(userId: string): Promise<boolean> {
    try {
      const fingerprint = this.getCachedFingerprint();
      if (!fingerprint) return false;

      // Check cached trust status
      const cachedTrust = this.getCachedTrust(userId, fingerprint.visitorId);
      if (cachedTrust && this.isCacheValid(cachedTrust.timestamp)) {
        return !cachedTrust.result.requiresAdditionalAuth;
      }

      // Quick check with backend
      const checkDeviceTrust = httpsCallable<any, {
        success: boolean;
        isTrusted: boolean;
        trustScore: number;
        requiresAdditionalAuth: boolean;
      }>(functions, 'checkDeviceTrust');

      const result = await checkDeviceTrust({
        userId,
        visitorId: fingerprint.visitorId
      });

      return result.data.isTrusted && !result.data.requiresAdditionalAuth;
    } catch (error) {
      console.error('FingerprintService: Trust check failed:', error);
      return false;
    }
  }

  /**
   * Remove trusted device
   */
  async removeTrustedDevice(visitorId: string): Promise<boolean> {
    try {
      const currentFingerprint = this.getCachedFingerprint();
      
      const removeTrustedDevice = httpsCallable<any, { success: boolean }>(
        functions,
        'removeTrustedDevice'
      );

      const result = await removeTrustedDevice({
        visitorId,
        currentVisitorId: currentFingerprint?.visitorId
      });

      // Clear cached trust for this device
      this.clearCachedTrust(visitorId);

      return result.data.success;
    } catch (error) {
      console.error('FingerprintService: Failed to remove device:', error);
      return false;
    }
  }

  /**
   * Get web device info
   */
  private getWebDeviceInfo() {
    const userAgent = navigator.userAgent;
    const platform = navigator.platform;
    
    // Detect browser
    let browserName = 'Unknown Browser';
    if (userAgent.includes('Chrome')) browserName = 'Chrome';
    else if (userAgent.includes('Safari')) browserName = 'Safari';
    else if (userAgent.includes('Firefox')) browserName = 'Firefox';
    else if (userAgent.includes('Edge')) browserName = 'Edge';
    
    // Detect OS
    let osName = 'Unknown OS';
    if (platform.includes('Win')) osName = 'Windows';
    else if (platform.includes('Mac')) osName = 'macOS';
    else if (platform.includes('Linux')) osName = 'Linux';
    else if (/Android/.test(userAgent)) osName = 'Android';
    else if (/iPhone|iPad|iPod/.test(userAgent)) osName = 'iOS';
    
    // Detect device type
    const isMobile = /Mobile|Android|iPhone|iPad|iPod/.test(userAgent);
    const isTablet = /iPad|Android/.test(userAgent) && !/Mobile/.test(userAgent);
    
    return {
      deviceName: `${browserName} on ${osName}`,
      deviceType: isTablet ? 'Tablet' : isMobile ? 'Phone' : 'Desktop',
      platform: osName
    };
  }

  /**
   * Cache fingerprint data
   */
  private cacheFingerprint(fingerprint: DeviceFingerprint): void {
    try {
      if (typeof window !== 'undefined') {
        localStorage.setItem(
          'dynasty_fingerprint',
          JSON.stringify({
            data: fingerprint,
            timestamp: Date.now()
          })
        );
      }
    } catch (error) {
      console.error('FingerprintService: Failed to cache fingerprint:', error);
    }
  }

  /**
   * Get cached fingerprint
   */
  private getCachedFingerprint(): DeviceFingerprint | null {
    try {
      if (typeof window === 'undefined') return null;
      
      const cached = localStorage.getItem('dynasty_fingerprint');
      if (!cached) return null;

      const parsed = JSON.parse(cached);
      
      // Check if cache is still valid (7 days)
      if (Date.now() - parsed.timestamp > 7 * 24 * 60 * 60 * 1000) {
        localStorage.removeItem('dynasty_fingerprint');
        return null;
      }

      return parsed.data;
    } catch (error) {
      console.error('FingerprintService: Failed to get cached fingerprint:', error);
      return null;
    }
  }

  /**
   * Cache device trust result
   */
  private cacheTrustResult(
    userId: string,
    visitorId: string,
    result: DeviceTrustResult
  ): void {
    try {
      if (typeof window !== 'undefined') {
        const key = `dynasty_device_trust_${userId}_${visitorId}`;
        localStorage.setItem(key, JSON.stringify({
          result,
          timestamp: Date.now()
        }));
      }
    } catch (error) {
      console.error('FingerprintService: Failed to cache trust result:', error);
    }
  }

  /**
   * Get cached trust result
   */
  private getCachedTrust(
    userId: string,
    visitorId: string
  ): { result: DeviceTrustResult; timestamp: number } | null {
    try {
      if (typeof window === 'undefined') return null;
      
      const key = `dynasty_device_trust_${userId}_${visitorId}`;
      const cached = localStorage.getItem(key);
      return cached ? JSON.parse(cached) : null;
    } catch (error) {
      console.error('FingerprintService: Failed to get cached trust:', error);
      return null;
    }
  }

  /**
   * Clear cached trust for a device
   */
  private clearCachedTrust(visitorId: string): void {
    try {
      if (typeof window === 'undefined') return;
      
      // Clear all trust cache entries for this visitor ID
      const keysToRemove: string[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.includes('dynasty_device_trust') && key.includes(visitorId)) {
          keysToRemove.push(key);
        }
      }
      
      keysToRemove.forEach(key => localStorage.removeItem(key));
    } catch (error) {
      console.error('FingerprintService: Failed to clear cached trust:', error);
    }
  }

  /**
   * Check if cache is still valid (1 hour)
   */
  private isCacheValid(timestamp: number): boolean {
    return Date.now() - timestamp < 60 * 60 * 1000;
  }

  /**
   * Clear all fingerprint data (for logout)
   */
  clearAllData(): void {
    try {
      if (typeof window === 'undefined') return;
      
      const keysToRemove: string[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && (key.includes('dynasty_fingerprint') || key.includes('dynasty_device_trust'))) {
          keysToRemove.push(key);
        }
      }
      
      keysToRemove.forEach(key => localStorage.removeItem(key));
    } catch (error) {
      console.error('FingerprintService: Failed to clear data:', error);
    }
  }
}

// Export singleton instance
export const fingerprintService = new FingerprintService();

// Export provider component for React
export { FpjsProvider };