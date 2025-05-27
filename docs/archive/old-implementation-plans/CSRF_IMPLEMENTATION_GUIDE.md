# CSRF Protection Implementation Guide

## Overview

This guide provides step-by-step instructions for implementing CSRF (Cross-Site Request Forgery) protection in the Dynasty application using the **double-submit cookie pattern** with encrypted tokens.

## Architecture Design

```
┌─────────────┐     ┌──────────────┐     ┌─────────────────┐
│   Browser   │────▶│   Next.js    │────▶│Firebase Function│
│             │◀────│  Middleware  │◀────│   + CSRF Valid  │
└─────────────┘     └──────────────┘     └─────────────────┘
     │                      │                       │
     ├─Cookie───────────────┤                       │
     ├─Header───────────────┤                       │
     └─Body─────────────────┴───────────────────────┘
```

## Implementation Steps

### Step 1: Create CSRF Token Service (Backend)

Create `/apps/firebase/functions/src/services/csrf-service.ts`:

```typescript
import * as crypto from 'crypto';
import { createCipheriv, createDecipheriv } from 'crypto';
import { HttpsError } from 'firebase-functions/v2/https';

interface CSRFToken {
  token: string;
  timestamp: number;
  userId: string;
  sessionId: string;
}

export class CSRFService {
  private static readonly ALGORITHM = 'aes-256-gcm';
  private static readonly TOKEN_EXPIRY = 4 * 60 * 60 * 1000; // 4 hours
  private static readonly SECRET_KEY = process.env.CSRF_SECRET_KEY || crypto.randomBytes(32).toString('hex');
  
  /**
   * Generate a new CSRF token for a user session
   */
  static generateToken(userId: string, sessionId: string): string {
    const tokenData: CSRFToken = {
      token: crypto.randomBytes(32).toString('hex'),
      timestamp: Date.now(),
      userId,
      sessionId
    };
    
    return this.encryptToken(tokenData);
  }
  
  /**
   * Validate CSRF token from request
   */
  static validateToken(
    encryptedToken: string, 
    userId: string, 
    sessionId: string
  ): boolean {
    try {
      const tokenData = this.decryptToken(encryptedToken);
      
      // Check token expiry
      if (Date.now() - tokenData.timestamp > this.TOKEN_EXPIRY) {
        return false;
      }
      
      // Validate user and session
      if (tokenData.userId !== userId || tokenData.sessionId !== sessionId) {
        return false;
      }
      
      return true;
    } catch (error) {
      return false;
    }
  }
  
  /**
   * Encrypt token data
   */
  private static encryptToken(data: CSRFToken): string {
    const key = Buffer.from(this.SECRET_KEY, 'hex');
    const iv = crypto.randomBytes(16);
    const cipher = createCipheriv(this.ALGORITHM, key, iv);
    
    const encrypted = Buffer.concat([
      cipher.update(JSON.stringify(data), 'utf8'),
      cipher.final()
    ]);
    
    const authTag = cipher.getAuthTag();
    
    return Buffer.concat([iv, authTag, encrypted]).toString('base64');
  }
  
  /**
   * Decrypt token data
   */
  private static decryptToken(encryptedData: string): CSRFToken {
    const buffer = Buffer.from(encryptedData, 'base64');
    const key = Buffer.from(this.SECRET_KEY, 'hex');
    
    const iv = buffer.slice(0, 16);
    const authTag = buffer.slice(16, 32);
    const encrypted = buffer.slice(32);
    
    const decipher = createDecipheriv(this.ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);
    
    const decrypted = Buffer.concat([
      decipher.update(encrypted),
      decipher.final()
    ]);
    
    return JSON.parse(decrypted.toString('utf8'));
  }
}
```

### Step 2: Create CSRF Middleware (Backend)

Create `/apps/firebase/functions/src/middleware/csrf.ts`:

```typescript
import { CallableRequest, HttpsError } from 'firebase-functions/v2/https';
import { CSRFService } from '../services/csrf-service';

interface CSRFValidatedRequest extends CallableRequest {
  csrfToken?: string;
  sessionId?: string;
}

/**
 * Middleware to validate CSRF tokens for state-changing operations
 */
export function requireCSRFToken<T = any>(
  handler: (request: CSRFValidatedRequest<T>) => Promise<any>
) {
  return async (request: CSRFValidatedRequest<T>) => {
    // Skip CSRF check for mobile apps (they use different auth)
    const userAgent = request.rawRequest.headers['user-agent'] || '';
    if (userAgent.includes('Expo') || userAgent.includes('okhttp')) {
      return handler(request);
    }
    
    // Extract CSRF token from header
    const csrfToken = request.rawRequest.headers['x-csrf-token'] as string;
    const csrfCookie = parseCookies(request.rawRequest.headers.cookie || '')['csrf-token'];
    
    if (!csrfToken || !csrfCookie) {
      throw new HttpsError(
        'permission-denied',
        'CSRF token missing'
      );
    }
    
    // Validate tokens match
    if (csrfToken !== csrfCookie) {
      throw new HttpsError(
        'permission-denied',
        'CSRF token mismatch'
      );
    }
    
    // Get session ID from auth token
    const sessionId = request.auth?.token?.session_id || 'default';
    
    // Validate encrypted token
    const isValid = CSRFService.validateToken(
      csrfToken,
      request.auth?.uid || '',
      sessionId
    );
    
    if (!isValid) {
      throw new HttpsError(
        'permission-denied',
        'Invalid or expired CSRF token'
      );
    }
    
    // Add validated data to request
    request.csrfToken = csrfToken;
    request.sessionId = sessionId;
    
    return handler(request);
  };
}

/**
 * Parse cookies from header string
 */
function parseCookies(cookieHeader: string): Record<string, string> {
  return cookieHeader
    .split(';')
    .map(cookie => cookie.trim().split('='))
    .reduce((acc, [key, value]) => {
      if (key && value) {
        acc[key] = decodeURIComponent(value);
      }
      return acc;
    }, {} as Record<string, string>);
}

/**
 * Generate CSRF token endpoint
 */
export const generateCSRFToken = onCall(
  { cors: true },
  async (request: CallableRequest) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Authentication required');
    }
    
    const sessionId = request.auth.token.session_id || 'default';
    const token = CSRFService.generateToken(request.auth.uid, sessionId);
    
    return { token, expiresIn: 4 * 60 * 60 * 1000 };
  }
);
```

### Step 3: Update Firebase Functions (Backend)

Update all state-changing functions to use CSRF middleware:

```typescript
// Example: /apps/firebase/functions/src/stories.ts
import { requireCSRFToken } from './middleware/csrf';

// Before
export const createStory = onCall(
  requireAuth(
    requireVerifiedUser(
      requireOnboardedUser(async (request) => {
        // ... function logic
      })
    )
  )
);

// After - wrap with CSRF protection
export const createStory = onCall(
  requireCSRFToken(
    requireAuth(
      requireVerifiedUser(
        requireOnboardedUser(async (request) => {
          // ... function logic
        })
      )
    )
  )
);
```

### Step 4: Create CSRF Hook (Frontend - Next.js)

Create `/apps/web/dynastyweb/src/hooks/useCSRF.ts`:

```typescript
import { useState, useEffect, useCallback } from 'react';
import { Functions, httpsCallable } from 'firebase/functions';
import Cookies from 'js-cookie';

interface CSRFToken {
  token: string;
  expiresIn: number;
}

export function useCSRF(functions: Functions) {
  const [csrfToken, setCSRFToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  
  // Fetch new CSRF token
  const fetchCSRFToken = useCallback(async () => {
    try {
      const generateToken = httpsCallable<void, CSRFToken>(
        functions, 
        'generateCSRFToken'
      );
      const result = await generateToken();
      
      // Set token in state
      setCSRFToken(result.data.token);
      
      // Set token in cookie (httpOnly would be better but needs SSR)
      Cookies.set('csrf-token', result.data.token, {
        expires: new Date(Date.now() + result.data.expiresIn),
        sameSite: 'strict',
        secure: process.env.NODE_ENV === 'production'
      });
      
      return result.data.token;
    } catch (error) {
      console.error('Failed to fetch CSRF token:', error);
      throw error;
    } finally {
      setIsLoading(false);
    }
  }, [functions]);
  
  // Initialize token on mount
  useEffect(() => {
    const existingToken = Cookies.get('csrf-token');
    if (existingToken) {
      setCSRFToken(existingToken);
      setIsLoading(false);
    } else {
      fetchCSRFToken();
    }
  }, [fetchCSRFToken]);
  
  // Refresh token before expiry
  useEffect(() => {
    const interval = setInterval(() => {
      fetchCSRFToken();
    }, 3.5 * 60 * 60 * 1000); // Refresh every 3.5 hours
    
    return () => clearInterval(interval);
  }, [fetchCSRFToken]);
  
  return {
    csrfToken,
    isLoading,
    refreshToken: fetchCSRFToken
  };
}
```

### Step 5: Create CSRF-Protected API Client (Frontend)

Create `/apps/web/dynastyweb/src/lib/csrf-client.ts`:

```typescript
import { Functions, httpsCallable, HttpsCallableResult } from 'firebase/functions';
import { auth } from './firebase';

interface CallOptions {
  requireCSRF?: boolean;
}

export class CSRFProtectedClient {
  constructor(
    private functions: Functions,
    private getCSRFToken: () => string | null
  ) {}
  
  /**
   * Call a Firebase Function with CSRF protection
   */
  async callFunction<T, R>(
    functionName: string,
    data: T,
    options: CallOptions = { requireCSRF: true }
  ): Promise<HttpsCallableResult<R>> {
    const callable = httpsCallable<T, R>(this.functions, functionName);
    
    // Add CSRF token to headers if required
    if (options.requireCSRF) {
      const token = this.getCSRFToken();
      if (!token) {
        throw new Error('CSRF token not available');
      }
      
      // Override fetch to add custom headers
      const originalFetch = global.fetch;
      global.fetch = async (input, init) => {
        if (typeof input === 'string' && input.includes(functionName)) {
          init = {
            ...init,
            headers: {
              ...init?.headers,
              'X-CSRF-Token': token
            }
          };
        }
        return originalFetch(input, init);
      };
      
      try {
        return await callable(data);
      } finally {
        global.fetch = originalFetch;
      }
    }
    
    return callable(data);
  }
}
```

### Step 6: Update Context Provider (Frontend)

Update `/apps/web/dynastyweb/src/context/EnhancedAuthContext.tsx`:

```typescript
import { useCSRF } from '../hooks/useCSRF';
import { CSRFProtectedClient } from '../lib/csrf-client';

export function EnhancedAuthProvider({ children }: { children: React.ReactNode }) {
  // ... existing code ...
  
  const { csrfToken, isLoading: csrfLoading } = useCSRF(functions);
  const csrfClient = useMemo(
    () => new CSRFProtectedClient(functions, () => csrfToken),
    [functions, csrfToken]
  );
  
  // Update all function calls to use CSRF client
  const createStory = async (storyData: any) => {
    try {
      const result = await csrfClient.callFunction('createStory', storyData);
      return result.data;
    } catch (error) {
      // ... error handling
    }
  };
  
  // ... update other functions similarly ...
  
  return (
    <AuthContext.Provider value={{
      ...existing,
      csrfToken,
      isCSRFReady: !csrfLoading && !!csrfToken
    }}>
      {children}
    </AuthContext.Provider>
  );
}
```

### Step 7: Add Security Headers (Next.js)

Update `/apps/web/dynastyweb/next.config.js`:

```javascript
const securityHeaders = [
  {
    key: 'X-DNS-Prefetch-Control',
    value: 'on'
  },
  {
    key: 'Strict-Transport-Security',
    value: 'max-age=63072000; includeSubDomains; preload'
  },
  {
    key: 'X-Frame-Options',
    value: 'SAMEORIGIN'
  },
  {
    key: 'X-Content-Type-Options',
    value: 'nosniff'
  },
  {
    key: 'Referrer-Policy',
    value: 'strict-origin-when-cross-origin'
  },
  {
    key: 'Content-Security-Policy',
    value: `
      default-src 'self';
      script-src 'self' 'unsafe-eval' 'unsafe-inline' *.googleapis.com *.gstatic.com;
      style-src 'self' 'unsafe-inline' *.googleapis.com;
      img-src 'self' data: blob: *.googleusercontent.com firebasestorage.googleapis.com;
      font-src 'self' data: *.gstatic.com;
      connect-src 'self' *.googleapis.com *.google.com firebasestorage.googleapis.com *.firebaseio.com wss://*.firebaseio.com;
      frame-src 'self' *.google.com;
    `.replace(/\s{2,}/g, ' ').trim()
  }
];

module.exports = {
  // ... existing config ...
  async headers() {
    return [
      {
        source: '/:path*',
        headers: securityHeaders,
      },
    ]
  },
}
```

### Step 8: Environment Configuration

Add to `/apps/firebase/functions/.env`:

```bash
# CSRF Protection Secret - Generate with: openssl rand -hex 32
CSRF_SECRET_KEY=your-generated-secret-key-here

# Session Configuration
SESSION_SECRET=your-session-secret-here
SESSION_DURATION=14400000  # 4 hours in milliseconds
```

### Step 9: Testing CSRF Protection

Create `/apps/firebase/functions/src/__tests__/csrf.test.ts`:

```typescript
import { CSRFService } from '../services/csrf-service';
import { requireCSRFToken } from '../middleware/csrf';

describe('CSRF Protection', () => {
  test('generates valid token', () => {
    const token = CSRFService.generateToken('user123', 'session456');
    expect(token).toBeTruthy();
    expect(token.length).toBeGreaterThan(50);
  });
  
  test('validates correct token', () => {
    const userId = 'user123';
    const sessionId = 'session456';
    const token = CSRFService.generateToken(userId, sessionId);
    
    const isValid = CSRFService.validateToken(token, userId, sessionId);
    expect(isValid).toBe(true);
  });
  
  test('rejects invalid token', () => {
    const token = CSRFService.generateToken('user123', 'session456');
    const isValid = CSRFService.validateToken(token, 'wronguser', 'session456');
    expect(isValid).toBe(false);
  });
  
  test('rejects expired token', () => {
    // Mock Date.now to simulate expired token
    const originalNow = Date.now;
    Date.now = () => originalNow() + 5 * 60 * 60 * 1000; // 5 hours later
    
    const token = CSRFService.generateToken('user123', 'session456');
    const isValid = CSRFService.validateToken(token, 'user123', 'session456');
    expect(isValid).toBe(false);
    
    Date.now = originalNow;
  });
});
```

### Step 10: Mobile App Updates (Optional Enhanced Security)

While CSRF protection isn't required for mobile apps, add request signing for extra security:

Create `/apps/mobile/src/lib/request-signing.ts`:

```typescript
import CryptoJS from 'crypto-js';
import { auth } from './firebase';

export class RequestSigner {
  private static readonly SECRET = process.env.MOBILE_API_SECRET;
  
  static async signRequest(functionName: string, data: any): Promise<string> {
    const user = auth().currentUser;
    if (!user) throw new Error('Not authenticated');
    
    const timestamp = Date.now();
    const payload = {
      uid: user.uid,
      function: functionName,
      timestamp,
      data: JSON.stringify(data)
    };
    
    const signature = CryptoJS.HmacSHA256(
      JSON.stringify(payload),
      this.SECRET
    ).toString();
    
    return `${timestamp}.${signature}`;
  }
}

// Use in API calls
const callFunction = async (name: string, data: any) => {
  const signature = await RequestSigner.signRequest(name, data);
  
  return functions().httpsCallable(name)(data, {
    headers: {
      'X-Mobile-Signature': signature
    }
  });
};
```

## Deployment Checklist

- [ ] Generate CSRF secret key: `openssl rand -hex 32`
- [ ] Add secret to Firebase Functions environment
- [ ] Deploy updated Firebase Functions
- [ ] Update all state-changing functions with CSRF middleware
- [ ] Deploy Next.js with security headers
- [ ] Test CSRF protection with curl/Postman
- [ ] Monitor for CSRF validation errors
- [ ] Update API documentation

## Monitoring and Alerts

Add monitoring for CSRF failures:

```typescript
// In CSRF middleware
if (!isValid) {
  // Log potential CSRF attack
  console.error('CSRF validation failed', {
    userId: request.auth?.uid,
    userAgent: request.rawRequest.headers['user-agent'],
    ip: request.rawRequest.ip,
    timestamp: new Date().toISOString()
  });
  
  // Send alert if threshold exceeded
  // ... alerting logic
}
```

## Troubleshooting

### Common Issues:

1. **"CSRF token missing" errors**
   - Check if cookie is being set
   - Verify same-site cookie settings
   - Check CORS configuration

2. **"CSRF token mismatch" errors**
   - Ensure token in header matches cookie
   - Check for cookie domain issues
   - Verify token encoding/decoding

3. **"Invalid or expired CSRF token" errors**
   - Check token expiration time
   - Verify user/session IDs match
   - Ensure clock synchronization

## Security Considerations

1. **Token Storage**: Store in httpOnly cookies in production
2. **Token Rotation**: Implement per-request token rotation for sensitive operations
3. **Rate Limiting**: Combine with rate limiting for defense in depth
4. **Monitoring**: Log and alert on repeated CSRF failures
5. **Testing**: Regular penetration testing of CSRF protection

## Conclusion

This implementation provides robust CSRF protection using encrypted tokens with the double-submit cookie pattern. The solution is compatible with Firebase Functions and provides appropriate security for production use.