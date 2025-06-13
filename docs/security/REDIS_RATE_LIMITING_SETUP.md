# Redis Rate Limiting with Vercel KV (powered by Upstash)

## Overview

This document describes the Redis-based rate limiting implementation using Vercel KV (powered by Upstash) for the Dynasty platform. Rate limiting is implemented across both Firebase Functions and the Next.js web application to protect against abuse and ensure fair usage.

> **Note**: As of January 2025, the Dynasty web app uses Vercel KV integration which automatically provisions the KV_REST_API_URL and KV_REST_API_TOKEN environment variables. The legacy UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN variables are still supported for backward compatibility.

## Setup Instructions

### 1. Create Redis Database

#### Option A: Using Vercel KV (Recommended for Vercel deployments)
1. In your Vercel dashboard, go to the Storage tab
2. Create a new KV database
3. Connect it to your project
4. Vercel automatically provisions `KV_REST_API_URL` and `KV_REST_API_TOKEN`

#### Option B: Using Upstash directly
1. Sign up for an Upstash account at https://upstash.com
2. Create a new Redis database
3. Choose a region close to your primary user base
4. Copy the REST URL and REST Token from the database details

### 2. Configure Environment Variables

#### Firebase Functions
```bash
# In apps/firebase/functions/.env
# Using Vercel KV (if available)
KV_REST_API_URL=your_kv_rest_api_url
KV_REST_API_TOKEN=your_kv_rest_api_token

# Or using Upstash directly (backward compatible)
UPSTASH_REDIS_REST_URL=your_upstash_redis_rest_url
UPSTASH_REDIS_REST_TOKEN=your_upstash_redis_rest_token
```

For Firebase Functions in production:
```bash
# Using Vercel KV variables
firebase functions:config:set kv.rest_api_url="your_url" kv.rest_api_token="your_token"

# Or using Upstash variables (backward compatible)
firebase functions:config:set upstash.redis_url="your_url" upstash.redis_token="your_token"
```

#### Next.js Web App
```bash
# In apps/web/dynastyweb/.env.local

# When using Vercel KV integration:
# These are automatically provided by Vercel when you connect KV to your project:
# KV_REST_API_URL=<automatically provided>
# KV_REST_API_TOKEN=<automatically provided>

# Or manually set (backward compatible):
KV_REST_API_URL=your_kv_rest_api_url
KV_REST_API_TOKEN=your_kv_rest_api_token

# Legacy variables (still supported):
UPSTASH_REDIS_REST_URL=your_upstash_redis_rest_url
UPSTASH_REDIS_REST_TOKEN=your_upstash_redis_rest_token
```

### 3. Rate Limit Types and Configurations

| Type | Limit | Window | Use Case |
|------|-------|--------|----------|
| `auth` | 5 requests | 15 minutes | Login, signup, password reset attempts |
| `api` | 100 requests | 1 minute | General API calls |
| `media` | 10 requests | 1 hour | File uploads, media operations |
| `write` | 30 requests | 1 minute | Create/update operations |
| `sensitive` | 3 requests | 1 hour | Password resets, critical operations |
| `sms` | 3 requests | 1 hour | SMS/phone verification |

## Implementation Details

### Firebase Functions

The rate limiting service is located at:
`apps/firebase/functions/src/services/rateLimitService.ts`

Usage in Firebase Functions:
```typescript
import { checkRateLimit } from '../services/rateLimitService';

// In your function
await checkRateLimit({
  type: 'auth',
  identifier: `user:${uid}`,
  skipForAdmin: true,
});
```

The auth middleware has been updated to use Redis rate limiting instead of Firestore-based rate limiting.

### Next.js Web Application

The rate limiting middleware is located at:
`apps/web/dynastyweb/src/lib/rate-limit.ts`

The middleware automatically applies rate limiting to all API routes based on the endpoint pattern:
- `/api/auth/*` → auth rate limit
- `/api/upload/*` or `/api/media/*` → media rate limit
- Non-GET requests → write rate limit
- `/api/password/*` or `/api/reset/*` → sensitive rate limit
- All other API routes → general api rate limit

## Monitoring and Analytics

### Rate Limit Headers

All rate-limited responses include the following headers:
- `X-RateLimit-Limit`: Maximum requests allowed
- `X-RateLimit-Remaining`: Requests remaining in current window
- `X-RateLimit-Reset`: Timestamp when the limit resets
- `Retry-After`: Seconds until the limit resets (only on 429 responses)

### Error Responses

When rate limit is exceeded:
```json
{
  "error": "RATE_LIMIT_EXCEEDED",
  "message": "Too many auth attempts. Please try again later.",
  "limit": 5,
  "remaining": 0,
  "reset": "2024-01-01T12:00:00Z",
  "retryAfter": 300
}
```

### Monitoring in Dashboard

#### For Vercel KV:
1. Access your Vercel dashboard
2. Navigate to the Storage tab
3. Select your KV database
4. Use the Data Browser to inspect rate limit keys
5. Monitor usage metrics and patterns

#### For Upstash Direct:
1. Access your Upstash dashboard
2. Navigate to your Redis database
3. Check the "Data Browser" to see rate limit keys
4. Monitor usage metrics and patterns

## Best Practices

1. **Identifier Strategy**
   - Use `user:{uid}` for authenticated requests
   - Use `ip:{ip_address}` for unauthenticated requests
   - Consider device fingerprints for enhanced security

2. **Admin Bypass**
   - Admin users can optionally bypass rate limits
   - Always verify admin status server-side
   - Log admin bypasses for audit trails

3. **Error Handling**
   - If Redis is unavailable, requests are allowed (fail-open)
   - All Redis errors are logged but don't block users
   - Consider implementing a circuit breaker pattern

4. **Testing**
   ```bash
   # Test rate limiting locally
   for i in {1..10}; do
     curl -X POST http://localhost:3000/api/auth/login \
       -H "Content-Type: application/json" \
       -d '{"email":"test@example.com","password":"test"}'
   done
   ```

## Security Considerations

1. **Key Patterns**
   - All keys are prefixed with `@dynasty/` to avoid collisions
   - Different prefixes for web vs functions
   - Keys include operation type for easy identification

2. **IP Address Extraction**
   - Properly extracts real IP from X-Forwarded-For header
   - Falls back to request IP if header is missing
   - Validates IP format to prevent spoofing

3. **Admin Detection**
   - Admin status is verified server-side only
   - Never trust client-side admin claims
   - Admin bypasses are logged for audit

## Troubleshooting

### Common Issues

1. **Rate limit not working**
   - Check environment variables are set correctly
   - Verify Redis connection is successful
   - Check middleware is properly configured

2. **False positives**
   - Review identifier strategy
   - Check if legitimate users share IPs
   - Consider increasing limits for specific operations

3. **Performance issues**
   - Vercel KV/Upstash Redis is designed for edge performance
   - Consider using multiple Redis instances in different regions
   - Implement caching for frequently accessed data
   - Vercel KV automatically uses edge locations for optimal performance

## Future Enhancements

1. **Dynamic Rate Limits**
   - Adjust limits based on user tier/subscription
   - Implement progressive rate limiting
   - Add machine learning for anomaly detection

2. **Enhanced Monitoring**
   - Integration with monitoring services
   - Real-time alerts for suspicious activity
   - Detailed analytics dashboard

3. **Advanced Features**
   - Distributed rate limiting across regions
   - Cost-based rate limiting for expensive operations
   - Integration with WAF for DDoS protection