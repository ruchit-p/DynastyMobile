# Rate Limiting Options for Dynasty Web

Since you're already using **Cloudflare** as your nameserver and have **Firebase Functions**, here are better rate limiting options than Upstash:

## Option 1: Cloudflare Rate Limiting (Recommended)

Since Cloudflare is already your nameserver, this is the most efficient option.

### Setup Steps:

1. **Log into Cloudflare Dashboard**
2. **Navigate to Security → WAF → Rate limiting rules**
3. **Create a new rate limiting rule:**
   ```
   - Name: "Dynasty Web Rate Limit"
   - Path: /* (all paths)
   - Requests: 60
   - Period: 1 minute
   - Response: 429 (Too Many Requests)
   - Action: Block
   ```

### Advantages:
- **No code changes needed** - Already removed Upstash from middleware
- **Free tier**: 10,000 requests/month included
- **DDoS protection** built-in
- **Global edge network** for low latency
- **Works before traffic hits your app**

### Additional Cloudflare Security Features:
- Enable **Bot Fight Mode** (free)
- Enable **Security Level** to Medium
- Set up **Page Rules** for caching
- Enable **Always Use HTTPS**

## Option 2: Firebase Functions Rate Limiting

Your Firebase functions already have rate limiting implemented in the CSRF middleware.

### Current Implementation:
```typescript
// In Firebase functions middleware
export const requireCSRFToken = functions.runWith({
  maxInstances: 100,
  timeoutSeconds: 60,
  memory: '256MB'
}).https.onCall(...)
```

### Enhance with Firebase App Check:
```typescript
// Add to Firebase functions
import { getAppCheck } from 'firebase-admin/app-check';

export const protectedFunction = functions.https.onCall(async (data, context) => {
  // Verify App Check token
  const appCheckToken = context.app?.token;
  if (!appCheckToken) {
    throw new functions.https.HttpsError('unauthenticated', 'App Check token missing');
  }
  
  try {
    await getAppCheck().verifyToken(appCheckToken);
  } catch (err) {
    throw new functions.https.HttpsError('unauthenticated', 'Invalid App Check token');
  }
  
  // Your function logic
});
```

## Option 3: Vercel Edge Config (If using Vercel)

If deploying to Vercel, use their Edge Config for rate limiting without external dependencies:

```typescript
// middleware.ts
import { get } from '@vercel/edge-config';

export async function middleware(request: NextRequest) {
  const rateLimit = await get('rateLimit');
  // Implement simple in-memory rate limiting
}
```

## Current Middleware (Updated)

The middleware now focuses on security headers without Upstash:

```typescript
// middleware.ts - Clean implementation
import { NextRequest, NextResponse } from 'next/server';

export async function middleware(request: NextRequest) {
  const response = NextResponse.next();
  const isDevelopment = process.env.NODE_ENV === 'development';
  
  // Generate nonce for CSP
  const nonce = Buffer.from(crypto.randomUUID()).toString('base64');
  
  // CSP and security headers configuration
  // ... (rest of the security headers implementation)
}
```

## Recommendation

**Use Cloudflare Rate Limiting** because:
1. You already have Cloudflare as nameserver
2. No code dependencies or changes needed
3. Protects at the edge before traffic reaches your app
4. Free tier is generous (10k requests/month)
5. Additional DDoS and bot protection included

## Setup Checklist

- [ ] Enable Cloudflare Rate Limiting rules
- [ ] Enable Bot Fight Mode in Cloudflare
- [ ] Ensure Firebase Functions have proper rate limits
- [ ] Consider Firebase App Check for API protection
- [ ] Monitor rate limit metrics in Cloudflare Analytics

The application now has clean middleware focused on security headers, while rate limiting is handled by your existing infrastructure (Cloudflare + Firebase).