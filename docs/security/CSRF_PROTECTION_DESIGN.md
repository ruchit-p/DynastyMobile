# CSRF Protection Design

## Overview

Dynasty implements CSRF (Cross-Site Request Forgery) protection using a double-submit cookie pattern with encrypted tokens. This document explains the security design and implementation details.

## Security Architecture

### Token Types

1. **Initial Session Tokens**
   - Generated via `generateInitialCSRFToken` endpoint (public)
   - Bound to session using IP + User Agent + Session ID hash
   - 30-minute expiry for initial tokens
   - Used for unauthenticated operations (login, signup)

2. **Authenticated Tokens**
   - Generated via `generateCSRFToken` endpoint (requires auth)
   - Bound to authenticated user ID and session
   - 4-hour expiry for authenticated tokens
   - Used for all authenticated operations

### CSRF-Exempt Endpoints

The following endpoints are exempt from CSRF protection as they are entry points:

```typescript
const CSRF_EXEMPT_FUNCTIONS = [
  // Authentication functions
  "handleSignUp",
  "handleSignIn", 
  "handleGoogleSignIn",
  "handleAppleSignIn",
  "handlePhoneSignIn",
  "confirmPhoneSignIn",
  "resetPassword",
  "confirmPasswordReset",
  "sendVerificationEmail",
  "verifyEmail",
  
  // Initial token generation
  "generateInitialCSRFToken",
  
  // Public invitation verification
  "verifyInvitation",
];
```

### Token Validation Flow

1. **Session-Based Validation (Unauthenticated)**
   ```
   Client IP + User Agent + Session ID → SHA256 Hash → Session Identifier
   Token validated against Session Identifier
   ```

2. **User-Based Validation (Authenticated)**
   ```
   User ID + Session ID → Token validation
   ```

### Security Properties

1. **Token Binding**
   - Initial tokens bound to client session (IP, User Agent)
   - Authenticated tokens bound to user ID
   - Prevents token reuse across sessions/users

2. **Encryption**
   - Tokens encrypted using AES-256-GCM
   - Includes timestamp for expiry validation
   - Auth tag prevents tampering

3. **Double Submit Cookie Pattern**
   - Token sent in both cookie and header
   - Validates that both values match
   - Prevents CSRF attacks even with XSS

4. **Expiry**
   - Initial tokens: 30 minutes
   - Authenticated tokens: 4 hours
   - Automatic refresh before expiry

## Implementation Details

### Client-Side (React)

```typescript
// Lazy loading of CSRF tokens
const { getCSRFToken } = useCSRF(functions);

// Token automatically fetched when needed
const csrfClient = createCSRFClient(functions, getCSRFToken);
```

### Server-Side (Firebase Functions)

```typescript
// Apply CSRF protection to function
export const protectedFunction = onCall(
  withCSRFProtection(async (request) => {
    // Function logic
  })
);

// Or conditional CSRF (checks exemption list)
export const conditionalFunction = onCall(
  withConditionalCSRF(async (request) => {
    // Function logic
  }, "functionName")
);
```

### Middleware Configuration

The Next.js middleware adds security headers including CSRF token support:

```typescript
response.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-CSRF-Token');
```

## Security Considerations

1. **Why Not Anonymous Tokens?**
   - Anonymous tokens (like `anon_xxx`) are less secure
   - Can be obtained by attackers
   - No strong binding to legitimate user

2. **Session Binding**
   - IP + User Agent provides reasonable session binding
   - Not perfect (proxies, NAT) but prevents most attacks
   - Combined with short expiry limits exposure

3. **Authentication Flow**
   - Auth endpoints exempt from CSRF
   - Initial token obtained on page load
   - Upgraded to user token after authentication

4. **Mobile App Exclusion**
   - Mobile apps identified by User-Agent
   - Use different authentication mechanism
   - CSRF not applicable to native apps

## Best Practices

1. **Always use CSRF protection for:**
   - State-changing operations
   - Sensitive data access
   - Admin functions

2. **Exempt only when necessary:**
   - Authentication endpoints
   - Public data endpoints
   - Health checks

3. **Token Management:**
   - Let the useCSRF hook manage tokens
   - Don't manually handle token refresh
   - Use csrfClient for all protected calls

4. **Error Handling:**
   - Catch CSRF errors specifically
   - Prompt user to refresh on token expiry
   - Log suspicious activity

## Testing

```bash
# Test CSRF token generation
curl -X POST https://us-central1-dynasty-eba63.cloudfunctions.net/generateInitialCSRFToken \
  -H "Content-Type: application/json" \
  -d '{}'

# Test protected endpoint without token (should fail)
curl -X POST https://us-central1-dynasty-eba63.cloudfunctions.net/someProtectedFunction \
  -H "Content-Type: application/json" \
  -d '{"data": "test"}'
```

## Monitoring

Monitor for:
- Repeated CSRF validation failures
- Token generation spikes
- Unusual session patterns
- Geographic anomalies in token usage