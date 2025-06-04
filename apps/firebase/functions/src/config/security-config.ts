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

    // Upload operations
    upload: {
      type: RateLimitType.MEDIA,
      maxRequests: 10,
      windowSeconds: 300, // 10 uploads per 5 minutes
    },

    // Read operations
    read: {
      type: RateLimitType.API,
      maxRequests: 100,
      windowSeconds: 60, // 100 reads per minute
    },
  },

};
