import {Ratelimit} from "@upstash/ratelimit";
import {Redis} from "@upstash/redis";
import * as functions from "firebase-functions";
import {SecurityError} from "../utils/errors";

// Initialize Redis client
const redisUrl = process.env.UPSTASH_REDIS_REST_URL || functions.config().upstash?.redis_url || "";
const redisToken = process.env.UPSTASH_REDIS_REST_TOKEN || functions.config().upstash?.redis_token || "";

if (!redisUrl || !redisToken) {
  throw new Error("Redis configuration is missing. Please set UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN environment variables.");
}

const redis = new Redis({
  url: redisUrl,
  token: redisToken,
});

// Different rate limiters for different operations
const rateLimiters = {
  // Auth operations: 5 attempts per 15 minutes
  auth: new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(5, "15 m"),
    prefix: "@dynasty/auth",
  }),

  // API calls: 100 requests per minute
  api: new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(100, "1 m"),
    prefix: "@dynasty/api",
  }),

  // Media uploads: 10 per hour
  media: new Ratelimit({
    redis,
    limiter: Ratelimit.tokenBucket(10, "1 h", 10),
    prefix: "@dynasty/media",
  }),

  // Write operations: 30 per minute
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
};

export type RateLimitType = keyof typeof rateLimiters

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

  const rateLimiter = rateLimiters[type];
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
    write: "@dynasty/write",
    sensitive: "@dynasty/sensitive",
    sms: "@dynasty/sms"
  };
  
  const prefix = prefixMap[type];
  const key = `${prefix}:${identifier}`;

  try {
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
  const rateLimiter = rateLimiters[type];

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
