import { Ratelimit } from '@upstash/ratelimit'
import { Redis } from '@upstash/redis'
import { NextRequest, NextResponse } from 'next/server'

// Initialize Redis client
const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL!,
  token: process.env.UPSTASH_REDIS_REST_TOKEN!,
})

// Different rate limiters for different operations
export const rateLimiters = {
  // Auth operations: 5 attempts per 15 minutes
  auth: new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(5, '15 m'),
    prefix: '@dynasty/web/auth',
  }),
  
  // API calls: 100 requests per minute
  api: new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(100, '1 m'),
    prefix: '@dynasty/web/api',
  }),
  
  // Media uploads: 10 per hour
  media: new Ratelimit({
    redis,
    limiter: Ratelimit.tokenBucket(10, '1 h', 10),
    prefix: '@dynasty/web/media',
  }),
  
  // Write operations: 30 per minute
  write: new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(30, '1 m'),
    prefix: '@dynasty/web/write',
  }),
  
  // Sensitive operations (password reset, etc): 3 per hour
  sensitive: new Ratelimit({
    redis,
    limiter: Ratelimit.fixedWindow(3, '1 h'),
    prefix: '@dynasty/web/sensitive',
  }),
}

export type RateLimitType = keyof typeof rateLimiters

interface RateLimitOptions {
  type: RateLimitType
  skipForAdmin?: boolean
}

export async function checkRateLimit(
  request: NextRequest,
  options: RateLimitOptions
): Promise<NextResponse | null> {
  const { type, skipForAdmin = false } = options
  
  // Get identifier from IP or user session
  const ip = request.ip ?? '127.0.0.1'
  const sessionCookie = request.cookies.get('session')
  const identifier = sessionCookie?.value ? `user:${sessionCookie.value}` : `ip:${ip}`
  
  // Skip rate limiting for admin users if specified
  if (skipForAdmin && identifier.includes('admin:')) {
    return null // Allow request
  }
  
  const rateLimiter = rateLimiters[type]
  if (!rateLimiter) {
    console.error(`Invalid rate limit type: ${type}`)
    return null // Allow request if invalid type
  }
  
  try {
    const { success, limit, remaining, reset } = await rateLimiter.limit(identifier)
    
    if (!success) {
      return NextResponse.json(
        {
          error: 'Too many requests',
          message: `Too many ${type} attempts. Please try again later.`,
          limit,
          remaining,
          reset: new Date(reset).toISOString(),
          retryAfter: Math.ceil((reset - Date.now()) / 1000),
        },
        {
          status: 429,
          headers: {
            'X-RateLimit-Limit': limit.toString(),
            'X-RateLimit-Remaining': remaining.toString(),
            'X-RateLimit-Reset': new Date(reset).toISOString(),
            'Retry-After': Math.ceil((reset - Date.now()) / 1000).toString(),
          },
        }
      )
    }
    
    return null // Allow request
  } catch (error) {
    // If Redis is unavailable, allow the request but log the error
    console.error('Rate limiting error:', error)
    return null // Allow request on error
  }
}

// Middleware helper for API routes
export function withRateLimit(
  handler: (req: NextRequest) => Promise<Response>,
  type: RateLimitType = 'api'
) {
  return async (req: NextRequest) => {
    const rateLimitResponse = await checkRateLimit(req, { type })
    if (rateLimitResponse) {
      return rateLimitResponse
    }
    
    const response = await handler(req)
    
    // Add rate limit headers to successful responses
    try {
      const ip = req.ip ?? '127.0.0.1'
      const sessionCookie = req.cookies.get('session')
      const identifier = sessionCookie?.value ? `user:${sessionCookie.value}` : `ip:${ip}`
      
      const { limit, remaining, reset } = await rateLimiters[type].limit(identifier, { rate: 0 })
      
      response.headers.set('X-RateLimit-Limit', limit.toString())
      response.headers.set('X-RateLimit-Remaining', remaining.toString())
      response.headers.set('X-RateLimit-Reset', new Date(reset).toISOString())
    } catch (error) {
      console.error('Failed to add rate limit headers:', error)
    }
    
    return response
  }
}