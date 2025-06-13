import {RateLimitType} from "../middleware";

/**
 * Centralized security configuration for Firebase Functions
 */
export const SECURITY_CONFIG = {
  /**
   * Rate limiting configurations for different operation types
   */
  rateLimits: {
    // Authentication operations (login, signup, password reset)
    auth: {
      type: RateLimitType.AUTH,
      maxRequests: 5,
      windowSeconds: 300, // 5 requests per 5 minutes
    },

    // Email verification operations
    emailVerification: {
      type: RateLimitType.AUTH,
      maxRequests: 3,
      windowSeconds: 3600, // 3 requests per hour
    },

    // Password reset operations
    passwordReset: {
      type: RateLimitType.AUTH,
      maxRequests: 3,
      windowSeconds: 3600, // 3 requests per hour
    },

    // General write operations (create/update content)
    write: {
      type: RateLimitType.WRITE,
      maxRequests: 30,
      windowSeconds: 60, // 30 writes per minute
    },

    // Media upload operations
    mediaUpload: {
      type: RateLimitType.MEDIA,
      maxRequests: 10,
      windowSeconds: 300, // 10 uploads per 5 minutes
    },

    // General API operations
    api: {
      type: RateLimitType.API,
      maxRequests: 60,
      windowSeconds: 60, // 60 requests per minute
    },

    // Delete operations
    delete: {
      type: RateLimitType.WRITE,
      maxRequests: 10,
      windowSeconds: 60, // 10 deletes per minute
    },

    // Read operations
    read: {
      type: RateLimitType.API,
      maxRequests: 100,
      windowSeconds: 60, // 100 reads per minute
    },

    // Signal Protocol key publishing operations
    signal_key_publish: {
      type: RateLimitType.SIGNAL_KEY_PUBLISH,
      maxRequests: 3,
      windowSeconds: 3600, // 3 per hour
    },

    // Signal Protocol key retrieval operations
    signal_key_retrieve: {
      type: RateLimitType.SIGNAL_KEY_RETRIEVE,
      maxRequests: 20,
      windowSeconds: 3600, // 20 per hour
    },

    // Signal Protocol verification operations
    signal_verification: {
      type: RateLimitType.SIGNAL_VERIFICATION,
      maxRequests: 5,
      windowSeconds: 86400, // 5 per day
    },

    // Signal Protocol maintenance operations
    signal_maintenance: {
      type: RateLimitType.SIGNAL_MAINTENANCE,
      maxRequests: 10,
      windowSeconds: 60, // 10 per minute
    },

    // Vault security monitoring operations
    vault_audit_logs: {
      type: RateLimitType.API,
      maxRequests: 30,
      windowSeconds: 300, // 30 per 5 minutes
    },

    security_incident_report: {
      type: RateLimitType.WRITE,
      maxRequests: 10,
      windowSeconds: 3600, // 10 per hour to prevent abuse
    },

    security_monitoring_data: {
      type: RateLimitType.API,
      maxRequests: 10,
      windowSeconds: 300, // 10 per 5 minutes (admin only)
    },

    security_alert_config: {
      type: RateLimitType.WRITE,
      maxRequests: 5,
      windowSeconds: 300, // 5 per 5 minutes (admin only)
    },
  },

};
