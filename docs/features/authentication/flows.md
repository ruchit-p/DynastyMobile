# Authentication Flows

This document details the authentication flows used in Dynasty across different scenarios.

## Email/Password Sign Up Flow

```mermaid
sequenceDiagram
    participant User
    participant App
    participant Firebase
    participant Backend
    participant SendGrid

    User->>App: Enter email, password, profile info
    App->>App: Validate inputs locally
    App->>Firebase: createUserWithEmailAndPassword()
    Firebase-->>App: User created (uid)
    App->>Backend: createUserProfile(uid, profileData)
    Backend->>Backend: Generate encryption keys
    Backend->>Firestore: Save user document
    Backend->>SendGrid: Send verification email
    SendGrid-->>User: Verification email
    Backend-->>App: Profile created
    App->>App: Store auth token
    App->>User: Show verification prompt
```

## Email/Password Sign In Flow

```mermaid
sequenceDiagram
    participant User
    participant App
    participant Firebase
    participant Backend

    User->>App: Enter email, password
    App->>Firebase: signInWithEmailAndPassword()
    Firebase->>Firebase: Verify credentials
    Firebase-->>App: Auth token
    App->>Backend: getUserProfile(uid)
    Backend->>Firestore: Fetch user data
    Backend->>Backend: Update lastLoginAt
    Backend-->>App: User profile
    App->>App: Initialize encryption
    App->>User: Navigate to home
```

## Phone Authentication Flow

```mermaid
sequenceDiagram
    participant User
    participant App
    participant Firebase
    participant Backend

    User->>App: Enter phone number
    App->>App: Format phone number
    App->>Firebase: signInWithPhoneNumber(phoneNumber)
    Firebase->>Firebase: Send SMS
    Firebase-->>User: SMS with OTP
    Firebase-->>App: Confirmation object
    User->>App: Enter OTP code
    App->>Firebase: confirm(otpCode)
    Firebase-->>App: User authenticated
    App->>Backend: checkUserExists(phoneNumber)
    
    alt User exists
        Backend-->>App: User profile
        App->>User: Navigate to home
    else New user
        Backend-->>App: No profile
        App->>User: Navigate to profile setup
    end
```

## Social Authentication Flow (Google/Apple)

```mermaid
sequenceDiagram
    participant User
    participant App
    participant Provider
    participant Firebase
    participant Backend

    User->>App: Tap "Sign in with Google/Apple"
    App->>Provider: Request authentication
    Provider->>User: Show consent screen
    User->>Provider: Approve access
    Provider-->>App: Auth token + user info
    App->>Firebase: signInWithCredential(credential)
    Firebase-->>App: Firebase user
    App->>Backend: createOrUpdateProfile(userData)
    
    alt First time user
        Backend->>Backend: Create user profile
        Backend->>Backend: Generate encryption keys
    else Returning user
        Backend->>Backend: Update profile if needed
    end
    
    Backend-->>App: User profile
    App->>User: Navigate to home
```

## Password Reset Flow

```mermaid
sequenceDiagram
    participant User
    participant App
    participant Firebase
    participant SendGrid

    User->>App: Tap "Forgot Password"
    User->>App: Enter email
    App->>Firebase: sendPasswordResetEmail(email)
    Firebase->>SendGrid: Trigger reset email
    SendGrid-->>User: Reset email with link
    User->>Browser: Click reset link
    Browser->>Firebase: Verify reset token
    Firebase-->>Browser: Show reset form
    User->>Browser: Enter new password
    Browser->>Firebase: confirmPasswordReset(token, newPassword)
    Firebase-->>Browser: Password updated
    Browser->>User: Redirect to app
```

## Biometric Authentication Flow

```mermaid
sequenceDiagram
    participant User
    participant App
    participant Device
    participant Keychain
    participant Firebase

    Note over App: Initial setup required
    App->>Device: Check biometric availability
    Device-->>App: Available (FaceID/TouchID)
    App->>User: Prompt to enable
    User->>App: Enable biometric auth
    App->>Keychain: Store refresh token
    
    Note over App: Subsequent logins
    User->>App: Open app
    App->>Device: Request biometric auth
    Device->>User: Show biometric prompt
    User->>Device: Authenticate (face/finger)
    Device-->>App: Success
    App->>Keychain: Retrieve refresh token
    App->>Firebase: Exchange for auth token
    Firebase-->>App: New auth token
    App->>User: Navigate to home
```

## Session Management Flow

```mermaid
sequenceDiagram
    participant App
    participant Firebase
    participant Backend

    loop Every 50 minutes
        App->>Firebase: Check token expiry
        alt Token expiring soon
            App->>Firebase: refreshToken()
            Firebase-->>App: New token
            App->>App: Update stored token
        end
    end

    Note over App: On app foreground
    App->>Backend: validateSession()
    alt Session valid
        Backend-->>App: Continue
    else Session invalid
        Backend-->>App: 401 Unauthorized
        App->>User: Navigate to login
    end
```

## Multi-Factor Authentication Flow

```mermaid
sequenceDiagram
    participant User
    participant App
    participant Firebase
    participant Authenticator

    Note over App: MFA Setup
    User->>App: Enable 2FA
    App->>Firebase: multiFactor.enroll()
    Firebase-->>App: QR Code data
    App->>User: Display QR Code
    User->>Authenticator: Scan QR Code
    Authenticator-->>User: Show TOTP code
    User->>App: Enter verification code
    App->>Firebase: Verify TOTP
    Firebase-->>App: MFA enabled

    Note over App: Login with MFA
    User->>App: Enter email/password
    App->>Firebase: signIn()
    Firebase-->>App: MFA required
    App->>User: Prompt for 2FA code
    User->>Authenticator: Get current code
    User->>App: Enter TOTP code
    App->>Firebase: Verify MFA code
    Firebase-->>App: Auth success
```

## Security Considerations

### Token Storage
- **Mobile**: iOS Keychain / Android Keystore
- **Web**: HttpOnly secure cookies
- **Never store in**: LocalStorage, AsyncStorage (unencrypted)

### Session Security
- Tokens expire after 1 hour
- Refresh tokens rotated on use
- Device binding for sensitive operations
- Logout clears all tokens

### Network Security
- All auth requests over HTTPS
- Certificate pinning on mobile
- Request signing for sensitive operations

### Error Handling
- Generic error messages to users
- Detailed logging server-side only
- Rate limiting on all auth endpoints
- Account lockout after failed attempts

## Implementation Notes

### Mobile Considerations
- Handle app suspension/resume
- Biometric prompt on app open
- Offline token validation
- Background token refresh

-### Web Considerations
- Secure cookie configuration
- SSR session validation
- Cross-tab session sync

### Backend Considerations
- Stateless authentication
- Token validation caching
- Audit logging
- Anomaly detection