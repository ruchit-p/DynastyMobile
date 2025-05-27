import { 
  FingerprintJsProAgent,
  FingerprintJsProAgentParams,
  FingerprintJsProProvider
} from '@fingerprintjs/fingerprintjs-pro-react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { callFirebaseFunction } from '../lib/errorUtils';
import { errorHandler, ErrorSeverity } from '../lib/ErrorHandlingService';
import { networkService } from './NetworkService';
import { logger } from './LoggingService';

// FingerprintJS configuration
const FINGERPRINT_API_KEY = process.env.EXPO_PUBLIC_FINGERPRINT_API_KEY || '';
const FINGERPRINT_ENDPOINT = process.env.EXPO_PUBLIC_FINGERPRINT_ENDPOINT || 'https://api.fpjs.io';
const FINGERPRINT_REGION = process.env.EXPO_PUBLIC_FINGERPRINT_REGION || 'global';

// Cache keys
const CACHE_KEYS = {
  VISITOR_ID: '@dynasty_fingerprint_visitor_id',
  DEVICE_TRUST: '@dynasty_device_trust_',
  LAST_VERIFICATION: '@dynasty_last_device_verification'
} as const;

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
  private agent: FingerprintJsProAgent | null = null;
  private initPromise: Promise<void> | null = null;
  private isInitialized = false;

  /**
   * Initialize FingerprintJS Pro agent
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
        logger.warn('FingerprintService: API key not configured, service disabled');
        return;
      }

      const config: FingerprintJsProAgentParams = {
        apiKey: FINGERPRINT_API_KEY,
        endpoint: FINGERPRINT_ENDPOINT,
        region: FINGERPRINT_REGION as any,
        extendedResult: true
      };

      this.agent = new FingerprintJsProAgent(config);
      await this.agent.init();
      
      this.isInitialized = true;
      logger.debug('FingerprintService: Initialized successfully');
    } catch (error) {
      logger.error('FingerprintService: Initialization failed:', error);
      errorHandler.handleError(error, {
        severity: ErrorSeverity.WARNING,
        title: 'Device Fingerprinting Setup',
        metadata: { service: 'FingerprintService' }
      });
    }
  }

  /**
   * Get device fingerprint
   */
  async getFingerprint(tags?: Record<string, string>): Promise<DeviceFingerprint | null> {
    try {
      // Ensure service is initialized
      await this.initialize();
      
      if (!this.agent || !this.isInitialized) {
        logger.warn('FingerprintService: Not initialized, using cached data');
        return this.getCachedFingerprint();
      }

      // Check if online
      if (!networkService.isOnline()) {
        logger.debug('FingerprintService: Offline, using cached fingerprint');
        return this.getCachedFingerprint();
      }

      // Get visitor data
      const result = await this.agent.getVisitorData({
        tags,
        linkedId: await this.getLinkedId()
      });

      const fingerprint: DeviceFingerprint = {
        visitorId: result.visitorId,
        requestId: result.requestId,
        confidence: result.confidence?.score || 0,
        lastVerified: new Date()
      };

      // Cache the fingerprint
      await this.cacheFingerprint(fingerprint);

      return fingerprint;
    } catch (error) {
      logger.error('FingerprintService: Failed to get fingerprint:', error);
      
      // Fallback to cached data
      const cached = await this.getCachedFingerprint();
      if (cached) return cached;

      errorHandler.handleError(error, {
        severity: ErrorSeverity.LOW,
        title: 'Device Identification',
        metadata: { service: 'FingerprintService' }
      });
      
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
      const cachedTrust = await this.getCachedTrust(userId, fingerprint.visitorId);
      if (cachedTrust && this.isCacheValid(cachedTrust.timestamp)) {
        return cachedTrust.result;
      }

      // Verify with backend
      const result = await callFirebaseFunction<DeviceTrustResult>(
        'verifyDeviceFingerprint',
        {
          requestId: fingerprint.requestId,
          visitorId: fingerprint.visitorId,
          deviceInfo
        }
      );

      // Cache the result
      await this.cacheTrustResult(userId, fingerprint.visitorId, result);

      return result;
    } catch (error) {
      logger.error('FingerprintService: Device verification failed:', error);
      
      errorHandler.handleError(error, {
        severity: ErrorSeverity.MEDIUM,
        title: 'Device Verification',
        metadata: { userId, service: 'FingerprintService' }
      });

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
      const fingerprint = await this.getCachedFingerprint();
      if (!fingerprint) return false;

      // Check cached trust status
      const cachedTrust = await this.getCachedTrust(userId, fingerprint.visitorId);
      if (cachedTrust && this.isCacheValid(cachedTrust.timestamp)) {
        return !cachedTrust.result.requiresAdditionalAuth;
      }

      // Quick check with backend
      const result = await callFirebaseFunction<{
        success: boolean;
        isTrusted: boolean;
        trustScore: number;
        requiresAdditionalAuth: boolean;
      }>('checkDeviceTrust', {
        userId,
        visitorId: fingerprint.visitorId
      });

      return result.isTrusted && !result.requiresAdditionalAuth;
    } catch (error) {
      logger.error('FingerprintService: Trust check failed:', error);
      return false;
    }
  }

  /**
   * Remove trusted device
   */
  async removeTrustedDevice(visitorId: string, currentVisitorId?: string): Promise<boolean> {
    try {
      const result = await callFirebaseFunction<{ success: boolean }>(
        'removeTrustedDevice',
        {
          visitorId,
          currentVisitorId: currentVisitorId || (await this.getCachedFingerprint())?.visitorId
        }
      );

      // Clear cached trust for this device
      await this.clearCachedTrust(visitorId);

      return result.success;
    } catch (error) {
      logger.error('FingerprintService: Failed to remove device:', error);
      
      errorHandler.handleError(error, {
        severity: ErrorSeverity.MEDIUM,
        title: 'Remove Device',
        metadata: { visitorId, service: 'FingerprintService' }
      });
      
      return false;
    }
  }

  /**
   * Get linked ID for the current user
   */
  private async getLinkedId(): Promise<string | undefined> {
    try {
      // You can use user ID or another stable identifier
      const { getFirebaseAuth } = await import('../lib/firebase');
      const auth = getFirebaseAuth();
      return auth.currentUser?.uid;
    } catch {
      return undefined;
    }
  }

  /**
   * Cache fingerprint data
   */
  private async cacheFingerprint(fingerprint: DeviceFingerprint): Promise<void> {
    try {
      await AsyncStorage.setItem(
        CACHE_KEYS.VISITOR_ID,
        JSON.stringify({
          data: fingerprint,
          timestamp: Date.now()
        })
      );
    } catch (error) {
      logger.error('FingerprintService: Failed to cache fingerprint:', error);
    }
  }

  /**
   * Get cached fingerprint
   */
  private async getCachedFingerprint(): Promise<DeviceFingerprint | null> {
    try {
      const cached = await AsyncStorage.getItem(CACHE_KEYS.VISITOR_ID);
      if (!cached) return null;

      const parsed = JSON.parse(cached);
      
      // Check if cache is still valid (7 days)
      if (Date.now() - parsed.timestamp > 7 * 24 * 60 * 60 * 1000) {
        await AsyncStorage.removeItem(CACHE_KEYS.VISITOR_ID);
        return null;
      }

      return parsed.data;
    } catch (error) {
      logger.error('FingerprintService: Failed to get cached fingerprint:', error);
      return null;
    }
  }

  /**
   * Cache device trust result
   */
  private async cacheTrustResult(
    userId: string,
    visitorId: string,
    result: DeviceTrustResult
  ): Promise<void> {
    try {
      const key = `${CACHE_KEYS.DEVICE_TRUST}${userId}_${visitorId}`;
      await AsyncStorage.setItem(key, JSON.stringify({
        result,
        timestamp: Date.now()
      }));
    } catch (error) {
      logger.error('FingerprintService: Failed to cache trust result:', error);
    }
  }

  /**
   * Get cached trust result
   */
  private async getCachedTrust(
    userId: string,
    visitorId: string
  ): Promise<{ result: DeviceTrustResult; timestamp: number } | null> {
    try {
      const key = `${CACHE_KEYS.DEVICE_TRUST}${userId}_${visitorId}`;
      const cached = await AsyncStorage.getItem(key);
      return cached ? JSON.parse(cached) : null;
    } catch (error) {
      logger.error('FingerprintService: Failed to get cached trust:', error);
      return null;
    }
  }

  /**
   * Clear cached trust for a device
   */
  private async clearCachedTrust(visitorId: string): Promise<void> {
    try {
      // Clear all trust cache entries for this visitor ID
      const keys = await AsyncStorage.getAllKeys();
      const trustKeys = keys.filter(key => 
        key.startsWith(CACHE_KEYS.DEVICE_TRUST) && key.includes(visitorId)
      );
      
      if (trustKeys.length > 0) {
        await AsyncStorage.multiRemove(trustKeys);
      }
    } catch (error) {
      logger.error('FingerprintService: Failed to clear cached trust:', error);
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
  async clearAllData(): Promise<void> {
    try {
      const keys = await AsyncStorage.getAllKeys();
      const fingerprintKeys = keys.filter(key => 
        key.startsWith('@dynasty_fingerprint') || 
        key.startsWith('@dynasty_device_trust')
      );
      
      if (fingerprintKeys.length > 0) {
        await AsyncStorage.multiRemove(fingerprintKeys);
      }
    } catch (error) {
      logger.error('FingerprintService: Failed to clear data:', error);
    }
  }
}

// Export singleton instance
export const fingerprintService = new FingerprintService();

// Export provider component for React Native
export { FingerprintJsProProvider };