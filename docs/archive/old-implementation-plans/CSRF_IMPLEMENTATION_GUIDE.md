
## Overview


## Architecture Design

```
┌─────────────┐     ┌──────────────┐     ┌─────────────────┐
│   Browser   │────▶│   Next.js    │────▶│Firebase Function│
└─────────────┘     └──────────────┘     └─────────────────┘
     │                      │                       │
     ├─Cookie───────────────┤                       │
     ├─Header───────────────┤                       │
     └─Body─────────────────┴───────────────────────┘
```

## Implementation Steps



```typescript
import * as crypto from 'crypto';
import { createCipheriv, createDecipheriv } from 'crypto';
import { HttpsError } from 'firebase-functions/v2/https';

  token: string;
  timestamp: number;
  userId: string;
  sessionId: string;
}

  private static readonly ALGORITHM = 'aes-256-gcm';
  private static readonly TOKEN_EXPIRY = 4 * 60 * 60 * 1000; // 4 hours
  
  /**
   */
  static generateToken(userId: string, sessionId: string): string {
      token: crypto.randomBytes(32).toString('hex'),
      timestamp: Date.now(),
      userId,
      sessionId
    };
    
    return this.encryptToken(tokenData);
  }
  
  /**
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



```typescript
import { CallableRequest, HttpsError } from 'firebase-functions/v2/https';

  sessionId?: string;
}

/**
 */
) {
    const userAgent = request.rawRequest.headers['user-agent'] || '';
    if (userAgent.includes('Expo') || userAgent.includes('okhttp')) {
      return handler(request);
    }
    
    
      throw new HttpsError(
        'permission-denied',
      );
    }
    
    // Validate tokens match
      throw new HttpsError(
        'permission-denied',
      );
    }
    
    // Get session ID from auth token
    const sessionId = request.auth?.token?.session_id || 'default';
    
    // Validate encrypted token
      request.auth?.uid || '',
      sessionId
    );
    
    if (!isValid) {
      throw new HttpsError(
        'permission-denied',
      );
    }
    
    // Add validated data to request
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
 */
  { cors: true },
  async (request: CallableRequest) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Authentication required');
    }
    
    const sessionId = request.auth.token.session_id || 'default';
    
    return { token, expiresIn: 4 * 60 * 60 * 1000 };
  }
);
```

### Step 3: Update Firebase Functions (Backend)


```typescript
// Example: /apps/firebase/functions/src/stories.ts

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

export const createStory = onCall(
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



```typescript
import { useState, useEffect, useCallback } from 'react';
import { Functions, httpsCallable } from 'firebase/functions';
import Cookies from 'js-cookie';

  token: string;
  expiresIn: number;
}

  const [isLoading, setIsLoading] = useState(true);
  
    try {
        functions, 
      );
      const result = await generateToken();
      
      // Set token in state
      
      // Set token in cookie (httpOnly would be better but needs SSR)
        expires: new Date(Date.now() + result.data.expiresIn),
        sameSite: 'strict',
        secure: process.env.NODE_ENV === 'production'
      });
      
      return result.data.token;
    } catch (error) {
      throw error;
    } finally {
      setIsLoading(false);
    }
  }, [functions]);
  
  // Initialize token on mount
  useEffect(() => {
    if (existingToken) {
      setIsLoading(false);
    } else {
    }
  
  // Refresh token before expiry
  useEffect(() => {
    const interval = setInterval(() => {
    }, 3.5 * 60 * 60 * 1000); // Refresh every 3.5 hours
    
    return () => clearInterval(interval);
  
  return {
    isLoading,
  };
}
```



```typescript
import { Functions, httpsCallable, HttpsCallableResult } from 'firebase/functions';
import { auth } from './firebase';

interface CallOptions {
}

  constructor(
    private functions: Functions,
  ) {}
  
  /**
   */
  async callFunction<T, R>(
    functionName: string,
    data: T,
  ): Promise<HttpsCallableResult<R>> {
    const callable = httpsCallable<T, R>(this.functions, functionName);
    
      if (!token) {
      }
      
      // Override fetch to add custom headers
      const originalFetch = global.fetch;
      global.fetch = async (input, init) => {
        if (typeof input === 'string' && input.includes(functionName)) {
          init = {
            ...init,
            headers: {
              ...init?.headers,
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

export function EnhancedAuthProvider({ children }: { children: React.ReactNode }) {
  // ... existing code ...
  
  );
  
  const createStory = async (storyData: any) => {
    try {
      return result.data;
    } catch (error) {
      // ... error handling
    }
  };
  
  // ... update other functions similarly ...
  
  return (
    <AuthContext.Provider value={{
      ...existing,
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

# Session Configuration
SESSION_SECRET=your-session-secret-here
SESSION_DURATION=14400000  # 4 hours in milliseconds
```



```typescript

  test('generates valid token', () => {
    expect(token).toBeTruthy();
    expect(token.length).toBeGreaterThan(50);
  });
  
  test('validates correct token', () => {
    const userId = 'user123';
    const sessionId = 'session456';
    
    expect(isValid).toBe(true);
  });
  
  test('rejects invalid token', () => {
    expect(isValid).toBe(false);
  });
  
  test('rejects expired token', () => {
    // Mock Date.now to simulate expired token
    const originalNow = Date.now;
    Date.now = () => originalNow() + 5 * 60 * 60 * 1000; // 5 hours later
    
    expect(isValid).toBe(false);
    
    Date.now = originalNow;
  });
});
```

### Step 10: Mobile App Updates (Optional Enhanced Security)


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

- [ ] Add secret to Firebase Functions environment
- [ ] Deploy updated Firebase Functions
- [ ] Deploy Next.js with security headers
- [ ] Update API documentation

## Monitoring and Alerts


```typescript
if (!isValid) {
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

   - Check if cookie is being set
   - Verify same-site cookie settings
   - Check CORS configuration

   - Ensure token in header matches cookie
   - Check for cookie domain issues
   - Verify token encoding/decoding

   - Check token expiration time
   - Verify user/session IDs match
   - Ensure clock synchronization

## Security Considerations

1. **Token Storage**: Store in httpOnly cookies in production
2. **Token Rotation**: Implement per-request token rotation for sensitive operations
3. **Rate Limiting**: Combine with rate limiting for defense in depth

## Conclusion

