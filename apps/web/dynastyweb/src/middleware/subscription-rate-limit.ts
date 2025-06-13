import { NextRequest, NextResponse } from 'next/server'
import { Ratelimit } from '@upstash/ratelimit'
import { Redis } from '@upstash/redis'

// Initialize Redis client
const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL!,
  token: process.env.UPSTASH_REDIS_REST_TOKEN!,
})

// Create rate limiters for different subscription operations
const rateLimiters = {
  // Checkout: 10 requests per hour per IP
  checkout: new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(10, '1 h'),
    analytics: true,
    prefix: 'ratelimit:checkout',
  }),
  
  // Subscription management: 30 requests per hour per IP
  management: new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(30, '1 h'),
    analytics: true,
    prefix: 'ratelimit:subscription',
  }),
  
  // Billing portal: 20 requests per hour per IP
  billing: new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(20, '1 h'),
    analytics: true,
    prefix: 'ratelimit:billing',
  }),
}

export async function subscriptionRateLimit(
  request: NextRequest,
  type: 'checkout' | 'management' | 'billing' = 'management'
) {
  // Skip rate limiting in development
  if (process.env.NODE_ENV === 'development') {
    return { success: true }
  }

  try {
    const ip = (request as any).ip ?? request.headers.get('x-forwarded-for') ?? 'anonymous'
    const { success, limit, reset, remaining } = await rateLimiters[type].limit(ip)

    if (!success) {
      return {
        success: false,
        response: NextResponse.json(
          { 
            error: 'Too many requests',
            message: 'Please try again later',
            retryAfter: new Date(reset).toISOString()
          },
          { 
            status: 429,
            headers: {
              'X-RateLimit-Limit': limit.toString(),
              'X-RateLimit-Remaining': remaining.toString(),
              'X-RateLimit-Reset': new Date(reset).toISOString(),
              'Retry-After': Math.ceil((reset - Date.now()) / 1000).toString(),
            }
          }
        )
      }
    }

    return { success: true }
  } catch (error) {
    console.error('Rate limiting error:', error)
    // Allow the request to proceed if rate limiting fails
    return { success: true }
  }
}