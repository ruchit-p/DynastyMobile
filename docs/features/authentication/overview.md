# Authentication System Overview

Dynasty uses a comprehensive authentication system built on Firebase Auth with additional security layers and custom user management.

## Table of Contents
- [Architecture](#architecture)
- [Authentication Methods](#authentication-methods)
- [User Data Model](#user-data-model)
- [Security Features](#security-features)
- [Implementation Details](#implementation-details)

## Architecture

The authentication system consists of three main components:

### 1. Client Layer (Mobile & Web)
- **AuthContext**: Manages authentication state and user sessions
- **Secure Storage**: Device-specific encrypted storage for tokens
- **Biometric Support**: Face ID/Touch ID integration on mobile

### 2. Firebase Auth
- **Identity Provider**: Core authentication service
- **Multi-factor Support**: SMS and TOTP options
- **Session Management**: Secure token handling

### 3. Custom Backend
- **User Management**: Extended user profiles in Firestore
- **Email Verification**: SendGrid integration for custom emails
- **Security Monitoring**: Login tracking and anomaly detection

## Authentication Methods

### Email/Password
- Strong password requirements (min 8 chars, mixed case, numbers, symbols)
- Real-time password strength indicator
- Secure password reset flow with email verification

### Phone Authentication
- SMS OTP verification
- Support for international numbers
- Rate limiting to prevent abuse

### Social Authentication
- Google Sign-In (OAuth 2.0)
- Apple Sign-In (iOS only)
- Automatic profile data population

### Biometric Authentication
- Face ID/Touch ID on iOS
- Fingerprint on Android
- Fallback to PIN/password

## User Data Model

```typescript
interface User {
  // Firebase Auth fields
  uid: string;
  email?: string;
  phoneNumber?: string;
  emailVerified: boolean;
  
  // Custom fields in Firestore
  firstName: string;
  lastName: string;
  dateOfBirth?: Date;
  profilePictureUrl?: string;
  bio?: string;
  
  // Security
  encryptionPublicKey?: string;
  lastLoginAt?: Date;
  loginHistory?: LoginRecord[];
  
  // Metadata
  createdAt: Date;
  updatedAt: Date;
  isActive: boolean;
}
```

## Security Features

### Password Security
- PBKDF2 hashing (100,000 iterations)
- Argon2 for new implementations
- No password storage in plaintext
- Secure reset tokens (expire in 1 hour)

### Session Management
- JWT tokens with 1-hour expiry
- Automatic token refresh
- Device-specific sessions
- Remote session invalidation

### Account Protection
- Email verification required
- Suspicious login detection
- Account lockout after 5 failed attempts
- CAPTCHA for repeated failures

### Privacy
- Minimal data collection
- GDPR compliance
- Data encryption at rest
- Secure data deletion

## Implementation Details

### Mobile (React Native)
```typescript
// Authentication hook usage
const { user, signIn, signOut } = useAuth();

// Sign in with email/password
await signIn(email, password);

// Biometric authentication
const { isAvailable } = await BiometricAuth.check();
if (isAvailable) {
  await BiometricAuth.authenticate();
}
```

### Web (Next.js)
```typescript
// Server-side session check
export async function getServerSideProps(context) {
  const session = await getSession(context);
  if (!session) {
    return { redirect: { destination: '/signin' } };
  }
  return { props: { user: session.user } };
}
```

### Backend (Firebase Functions)
```typescript
// Middleware for protected endpoints
export const requireAuth = async (req, res, next) => {
  const token = req.headers.authorization?.split('Bearer ')[1];
  if (!token) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  
  try {
    const decodedToken = await admin.auth().verifyIdToken(token);
    req.user = decodedToken;
    next();
  } catch (error) {
    return res.status(401).json({ error: 'Invalid token' });
  }
};
```

## Error Handling

Common authentication errors and their handling:

| Error Code | Description | User Message |
|------------|-------------|--------------|
| auth/invalid-email | Invalid email format | "Please enter a valid email address" |
| auth/user-disabled | Account deactivated | "This account has been disabled" |
| auth/user-not-found | No account exists | "No account found with this email" |
| auth/wrong-password | Incorrect password | "Incorrect password" |
| auth/too-many-requests | Rate limit exceeded | "Too many attempts. Try again later" |

## Best Practices

1. **Always use HTTPS** for authentication requests
2. **Implement rate limiting** on authentication endpoints
3. **Log authentication events** for security monitoring
4. **Use secure session storage** (Keychain on iOS, Keystore on Android)
5. **Implement proper logout** clearing all tokens and cache
6. **Handle offline scenarios** gracefully
7. **Provide clear error messages** without revealing security details

## Related Documentation
- [Authentication Flows](./flows.md) - Detailed flow diagrams
- [Phone Authentication](./phone-auth.md) - SMS/OTP implementation
- [Security Best Practices](../../security/best-practices.md) - Security guidelines