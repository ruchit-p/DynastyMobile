import {Ratelimit} from "@upstash/ratelimit";
import {Redis} from "@upstash/redis";
import {defineSecret} from "firebase-functions/params";
import {SecurityError} from "../utils/errors";

// Define secrets for Upstash Redis
export const UPSTASH_REDIS_REST_URL = defineSecret("UPSTASH_REDIS_REST_URL");
export const UPSTASH_REDIS_REST_TOKEN = defineSecret("UPSTASH_REDIS_REST_TOKEN");

// Lazy initialization of Redis client
let redis: Redis | null = null;
let isInitialized = false;

function getRedisClient(): Redis {
  if (!isInitialized) {
    // Try to get config from environment first (for local development)
    let redisUrl = process.env.UPSTASH_REDIS_REST_URL || "";
    let redisToken = process.env.UPSTASH_REDIS_REST_TOKEN || "";

    // In production, use the secret values
    if (UPSTASH_REDIS_REST_URL.value()) {
      redisUrl = UPSTASH_REDIS_REST_URL.value();
    }
    if (UPSTASH_REDIS_REST_TOKEN.value()) {
      redisToken = UPSTASH_REDIS_REST_TOKEN.value();
    }

    if (!redisUrl || !redisToken) {
      throw new Error("Redis configuration is missing. Please set UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN environment variables or secrets.");
    }

    redis = new Redis({
      url: redisUrl,
      token: redisToken,
    });
    isInitialized = true;
  }

  return redis!;
}

// Lazy initialization of rate limiters
let rateLimiters: Record<string, Ratelimit> | null = null;

function getRateLimiters() {
  if (!rateLimiters) {
    const redis = getRedisClient();

    rateLimiters = {
      // Auth operations: 5 attempts per 5 minutes (aligned with security-config)
      auth: new Ratelimit({
        redis,
        limiter: Ratelimit.slidingWindow(5, "5 m"),
        prefix: "@dynasty/auth",
      }),

      // API calls: 60 requests per minute (aligned with security-config)
      api: new Ratelimit({
        redis,
        limiter: Ratelimit.slidingWindow(60, "1 m"),
        prefix: "@dynasty/api",
      }),

      // Media/Upload operations: 10 per 5 minutes (aligned with security-config)
      media: new Ratelimit({
        redis,
        limiter: Ratelimit.slidingWindow(10, "5 m"),
        prefix: "@dynasty/media",
      }),

      // Alias for media (backward compatibility)
      upload: new Ratelimit({
        redis,
        limiter: Ratelimit.slidingWindow(10, "5 m"),
        prefix: "@dynasty/media",
      }),

      // Write operations: 30 per minute (already aligned)
      write: new Ratelimit({
        redis,
        limiter: Ratelimit.slidingWindow(30, "1 m"),
        prefix: "@dynasty/write",
      }),

      // Sensitive operations (password reset, etc): 3 per hour
      sensitive: new Ratelimit({
        redis,
        limiter: Ratelimit.fixedWindow(3, "1 h"),
        prefix: "@dynasty/sensitive",
      }),

      // SMS/Phone verification: 3 per hour
      sms: new Ratelimit({
        redis,
        limiter: Ratelimit.fixedWindow(3, "1 h"),
        prefix: "@dynasty/sms",
      }),

      // Support messages: 3 per 6 hours
      support: new Ratelimit({
        redis,
        limiter: Ratelimit.fixedWindow(3, "6 h"),
        prefix: "@dynasty/support",
      }),

      // Signal Protocol rate limits
      signalKeyPublish: new Ratelimit({
        redis,
        limiter: Ratelimit.fixedWindow(3, "1 h"),
        prefix: "@dynasty/signal/key-publish",
      }),

      signalKeyRetrieve: new Ratelimit({
        redis,
        limiter: Ratelimit.slidingWindow(20, "1 h"),
        prefix: "@dynasty/signal/key-retrieve",
      }),

      signalVerification: new Ratelimit({
        redis,
        limiter: Ratelimit.fixedWindow(5, "24 h"),
        prefix: "@dynasty/signal/verification",
      }),

      signalMaintenance: new Ratelimit({
        redis,
        limiter: Ratelimit.slidingWindow(10, "1 m"),
        prefix: "@dynasty/signal/maintenance",
      }),

      // Email verification rate limits
      emailVerificationSend: new Ratelimit({
        redis,
        limiter: Ratelimit.fixedWindow(3, "1 h"),
        prefix: "@dynasty/email/send",
      }),

      emailVerificationVerify: new Ratelimit({
        redis,
        limiter: Ratelimit.fixedWindow(10, "1 h"),
        prefix: "@dynasty/email/verify",
      }),
    };
  }

  return rateLimiters;
}

export type RateLimitType =
  | "auth"
  | "api"
  | "media"
  | "upload"
  | "write"
  | "sensitive"
  | "sms"
  | "support"
  | "signalKeyPublish"
  | "signalKeyRetrieve"
  | "signalVerification"
  | "signalMaintenance"
  | "emailVerificationSend"
  | "emailVerificationVerify"

interface RateLimitOptions {
  type: RateLimitType
  identifier: string
  skipForAdmin?: boolean
  customLimit?: number
  customWindow?: string
}

export async function checkRateLimit(options: RateLimitOptions): Promise<{
  success: boolean
  limit: number
  remaining: number
  reset: number
}> {
  const {type, identifier, skipForAdmin = false} = options;

  // Skip rate limiting for admin users if specified
  if (skipForAdmin && identifier.includes("admin:")) {
    return {
      success: true,
      limit: -1,
      remaining: -1,
      reset: -1,
    };
  }

  const limiters = getRateLimiters();
  const rateLimiter = limiters[type];
  if (!rateLimiter) {
    throw new Error(`Invalid rate limit type: ${type}`);
  }

  try {
    const result = await rateLimiter.limit(identifier);

    if (!result.success) {
      throw new SecurityError(
        "RATE_LIMIT_EXCEEDED",
        `Too many ${type} attempts. Please try again later.`,
        {
          limit: result.limit,
          remaining: result.remaining,
          reset: new Date(result.reset).toISOString(),
          retryAfter: Math.ceil((result.reset - Date.now()) / 1000),
        }
      );
    }

    return {
      success: result.success,
      limit: result.limit,
      remaining: result.remaining,
      reset: result.reset,
    };
  } catch (error) {
    // If Redis is unavailable, allow the request but log the error
    console.error("Rate limiting error:", error);

    // Rethrow SecurityError to maintain rate limit enforcement
    if (error instanceof SecurityError) {
      throw error;
    }

    // For other errors (Redis connection issues), allow the request
    return {
      success: true,
      limit: -1,
      remaining: -1,
      reset: -1,
    };
  }
}

// Helper function for Express middleware
export function createRateLimitMiddleware(type: RateLimitType, identifierExtractor?: (req: any) => string) {
  return async (req: any, res: any, next: any) => {
    try {
      // Extract identifier (default to IP address)
      const identifier = identifierExtractor ?
        identifierExtractor(req) :
        req.ip || req.connection.remoteAddress || "unknown";

      const result = await checkRateLimit({
        type,
        identifier,
        skipForAdmin: req.user?.role === "admin",
      });

      // Add rate limit headers
      res.set({
        "X-RateLimit-Limit": result.limit.toString(),
        "X-RateLimit-Remaining": result.remaining.toString(),
        "X-RateLimit-Reset": new Date(result.reset).toISOString(),
      });

      next();
    } catch (error: unknown) {
      if (error instanceof SecurityError) {
        res.status(429).json({
          error: error.code,
          message: error.message,
          details: error.details,
        });
      } else {
        // Log error but allow request
        console.error("Rate limit middleware error:", error);
        next();
      }
    }
  };
}

// Utility to reset rate limits (for testing or admin purposes)
export async function resetRateLimit(type: RateLimitType, identifier: string): Promise<void> {
  // Use a manual prefix mapping since the property is protected
  const prefixMap: Record<RateLimitType, string> = {
    auth: "@dynasty/auth",
    api: "@dynasty/api",
    media: "@dynasty/media",
    upload: "@dynasty/media", // Same as media
    write: "@dynasty/write",
    sensitive: "@dynasty/sensitive",
    sms: "@dynasty/sms",
    support: "@dynasty/support",
    signalKeyPublish: "@dynasty/signal/key-publish",
    signalKeyRetrieve: "@dynasty/signal/key-retrieve",
    signalVerification: "@dynasty/signal/verification",
    signalMaintenance: "@dynasty/signal/maintenance",
    emailVerificationSend: "@dynasty/email/send",
    emailVerificationVerify: "@dynasty/email/verify",
  };

  const prefix = prefixMap[type];
  const key = `${prefix}:${identifier}`;

  try {
    const redis = getRedisClient();
    await redis.del(key);
  } catch (error) {
    console.error("Failed to reset rate limit:", error);
    throw new Error("Failed to reset rate limit");
  }
}

// Get current rate limit status
export async function getRateLimitStatus(type: RateLimitType, identifier: string): Promise<{
  limit: number
  remaining: number
  reset: number
}> {
  const limiters = getRateLimiters();
  const rateLimiter = limiters[type];

  try {
    // Check without consuming
    const result = await rateLimiter.limit(identifier, {rate: 0});

    return {
      limit: result.limit,
      remaining: result.remaining,
      reset: result.reset,
    };
  } catch (error) {
    console.error("Failed to get rate limit status:", error);
    return {
      limit: -1,
      remaining: -1,
      reset: -1,
    };
  }
}
