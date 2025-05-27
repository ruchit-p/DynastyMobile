# CSRF Protection Implementation

Cross-Site Request Forgery (CSRF) protection in Dynasty uses a double-submit cookie pattern with additional security measures.

## Overview

CSRF attacks attempt to perform unauthorized actions on behalf of authenticated users. Our implementation prevents these attacks through:

1. **Double-Submit Cookie Pattern** - Matching tokens in cookie and header
2. **Origin Validation** - Verifying request origins
3. **SameSite Cookies** - Browser-level protection
4. **Token Rotation** - Regular token refresh

## Implementation Architecture

### Backend (Firebase Functions)

```typescript
// Middleware: /apps/firebase/functions/src/middleware/csrf.ts
export const csrfProtection = async (req, res, next) => {
  // Skip CSRF for authenticated Firebase requests
  if (req.headers.authorization?.startsWith('Bearer ')) {
    return next();
  }

  const cookieToken = req.cookies._csrf;
  const headerToken = req.headers['x-csrf-token'];

  if (!cookieToken || !headerToken || cookieToken !== headerToken) {
    return res.status(403).json({ error: 'Invalid CSRF token' });
  }

  next();
};
```

### Web Client (Next.js)

```typescript
// Hook: /apps/web/dynastyweb/src/hooks/useCSRF.ts
export function useCSRF() {
  const [csrfToken, setCsrfToken] = useState<string>('');

  useEffect(() => {
    // Get or generate CSRF token
    const token = getCookie('_csrf') || generateToken();
    setCookie('_csrf', token, { 
      sameSite: 'strict',
      secure: true,
      httpOnly: false // Must be readable by JS
    });
    setCsrfToken(token);
  }, []);

  return { csrfToken };
}

// Fetch wrapper with CSRF
export async function fetchWithCSRF(url: string, options: RequestInit = {}) {
  const csrfToken = getCookie('_csrf');
  
  return fetch(url, {
    ...options,
    headers: {
      ...options.headers,
      'X-CSRF-Token': csrfToken || '',
    },
    credentials: 'include',
  });
}
```

### Mobile Client

Mobile apps are not vulnerable to CSRF attacks as they don't use cookies. They use:
- Bearer token authentication
- No cookie-based sessions
- Certificate pinning for added security

## Security Configuration

### Cookie Settings
```javascript
{
  name: '_csrf',
  value: token,
  options: {
    httpOnly: false,    // Must be readable by JavaScript
    secure: true,       // HTTPS only
    sameSite: 'strict', // Strict same-site policy
    path: '/',          // Available site-wide
    maxAge: 86400      // 24 hours
  }
}
```

### CORS Configuration
```javascript
{
  origin: [
    'https://dynasty.app',
    'https://www.dynasty.app'
  ],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'X-CSRF-Token', 'Authorization']
}
```

## Token Generation

```typescript
function generateCSRFToken(): string {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  return btoa(String.fromCharCode(...array))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
}
```

## Integration Points

### Protected Endpoints
All state-changing operations require CSRF tokens:
- User profile updates
- File uploads/deletions
- Settings changes
- Family member management
- Story/event creation

### Exempted Endpoints
These endpoints don't require CSRF tokens:
- Public content (read-only)
- Authentication endpoints (use other protections)
- Webhooks (use signature verification)

## Testing

### Manual Testing
```bash
# Test CSRF protection
node apps/firebase/functions/test-csrf-integration.js

# Frontend integration test
node apps/web/dynastyweb/test-csrf-frontend.js
```

### Automated Tests
```typescript
describe('CSRF Protection', () => {
  it('should reject requests without CSRF token', async () => {
    const response = await fetch('/api/updateProfile', {
      method: 'POST',
      body: JSON.stringify({ name: 'Test' })
    });
    expect(response.status).toBe(403);
  });

  it('should accept requests with valid CSRF token', async () => {
    const token = generateCSRFToken();
    document.cookie = `_csrf=${token}`;
    
    const response = await fetch('/api/updateProfile', {
      method: 'POST',
      headers: { 'X-CSRF-Token': token },
      body: JSON.stringify({ name: 'Test' })
    });
    expect(response.status).toBe(200);
  });
});
```

## Troubleshooting

### Common Issues

1. **"Invalid CSRF token" errors**
   - Check cookie is being set
   - Verify header is being sent
   - Ensure tokens match

2. **Token not persisting**
   - Check SameSite policy
   - Verify HTTPS is used
   - Check cookie domain

3. **Mobile app issues**
   - Mobile apps should use Bearer auth
   - Don't implement CSRF for mobile

### Debug Logging
```typescript
// Enable debug logging
if (process.env.NODE_ENV === 'development') {
  console.log('CSRF Debug:', {
    cookieToken: req.cookies._csrf,
    headerToken: req.headers['x-csrf-token'],
    origin: req.headers.origin,
    referer: req.headers.referer
  });
}
```

## Best Practices

1. **Always use HTTPS** - CSRF tokens can be intercepted over HTTP
2. **Validate origin** - Additional check beyond token matching
3. **Rotate tokens** - Generate new tokens periodically
4. **Log failures** - Monitor for potential attacks
5. **User education** - Warn about phishing attempts

## Additional Security Layers

### Origin Validation
```typescript
const allowedOrigins = ['https://dynasty.app'];
const origin = req.headers.origin;

if (!allowedOrigins.includes(origin)) {
  return res.status(403).json({ error: 'Invalid origin' });
}
```

### Referer Checking
```typescript
const referer = req.headers.referer;
if (!referer?.startsWith('https://dynasty.app')) {
  return res.status(403).json({ error: 'Invalid referer' });
}
```

### Rate Limiting
```typescript
const rateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests
  message: 'Too many requests from this IP'
});
```

## Related Documentation
- [Security Overview](./README.md)
- [Authentication](../features/authentication/overview.md)
- [API Security](../api-reference/README.md)