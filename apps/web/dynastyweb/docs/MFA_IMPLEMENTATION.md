# Multi-Factor Authentication (MFA) Implementation

This document describes the comprehensive MFA implementation for the Dynasty Web application using Firebase Web SDK v9+.

## Overview

The MFA implementation provides both Time-based One-Time Password (TOTP) and SMS-based authentication as second factors. Users can enroll multiple MFA factors and manage them through the account settings.

## Components

### 1. EnhancedAuthContext (`src/context/EnhancedAuthContext.tsx`)

The main authentication context that provides MFA functionality:

**MFA State Management:**

- `mfaSignInState`: Current MFA sign-in status and available factors
- Real-time tracking of MFA requirements during authentication

**MFA Methods:**

- `getMfaEnrollmentInfo()`: Get list of enrolled MFA factors
- `setupTotpMfa(displayName)`: Initialize TOTP setup and generate QR code
- `enrollTotpMfa(totpSecret, code)`: Complete TOTP enrollment with verification
- `setupPhoneMfa(phoneNumber, displayName)`: Send SMS verification for phone enrollment
- `enrollPhoneMfa(verificationId, code)`: Complete phone MFA enrollment
- `unenrollMfa(factorId)`: Remove an MFA factor
- `completeMfaSignIn(factorId, code)`: Complete MFA challenge during sign-in
- `selectMfaFactor(factor)`: Select which MFA factor to use
- `resetMfaSignIn()`: Reset MFA sign-in state

### 2. MfaManagement Component (`src/components/security/MfaManagement.tsx`)

A comprehensive MFA management interface for account settings:

**Features:**

- Display enrolled MFA factors with details
- Setup new TOTP authenticators with QR code generation
- Setup SMS-based MFA with phone number verification
- Remove existing MFA factors
- Clear status indicators and error handling

**Usage:**

```tsx
import MfaManagement from "@/components/security/MfaManagement";

<MfaManagement className="mt-8" />;
```

### 3. MfaSignInModal Component (`src/components/auth/MfaSignInModal.tsx`)

A modal that automatically appears when MFA is required during sign-in:

**Features:**

- Factor selection interface
- Code input with validation
- Support for both TOTP and SMS factors
- Error handling and retry functionality
- Automatic appearance when `mfaSignInState.isRequired` is true

**Usage:**
The modal is automatically included in the main layout and will appear when needed. No manual integration required.

## Integration

### 1. Main Layout Integration

The MFA modal is integrated into the root layout (`src/app/layout.tsx`):

```tsx
import MfaSignInModal from "@/components/auth/MfaSignInModal";

// Inside the layout providers
<AuthProvider>
  <NotificationProvider>
    {children}
    <MfaSignInModal />
    <Toaster />
  </NotificationProvider>
</AuthProvider>;
```

### 2. Account Settings Integration

The MFA management component is integrated into the privacy & security settings page (`src/app/(protected)/account-settings/privacy-security/page.tsx`):

```tsx
import MfaManagement from "@/components/security/MfaManagement";

// In the security section
<MfaManagement className="mt-8" />;
```

## User Flows

### MFA Enrollment Flow

1. User navigates to Account Settings → Privacy & Security
2. In the Multi-Factor Authentication section, user can:
   - View currently enrolled factors
   - Add new TOTP authenticator by scanning QR code
   - Add SMS verification by entering phone number
3. User completes verification process for chosen method
4. MFA factor is enrolled and appears in active methods list

### MFA Sign-In Flow

1. User enters email and password on sign-in page
2. If MFA is required, the sign-in method throws an MFA error
3. `EnhancedAuthContext` catches the error and sets `mfaSignInState.isRequired = true`
4. `MfaSignInModal` automatically appears showing available factors
5. User selects preferred MFA method
6. User enters verification code (TOTP or SMS)
7. Upon successful verification, user is signed in

## Security Features

### TOTP Implementation

- Uses Firebase's built-in TOTP support
- Generates secure QR codes for easy setup
- Supports manual key entry as backup
- Compatible with standard authenticator apps (Google Authenticator, Authy, 1Password)

### SMS Implementation

- Uses Firebase's phone authentication
- Requires reCAPTCHA verification
- Supports international phone numbers
- Rate limiting and abuse protection

### Error Handling

- Comprehensive error handling for all MFA operations
- User-friendly error messages
- Automatic retry mechanisms
- Fallback options for failed verifications

## Required HTML Elements

The implementation requires these HTML elements to be present for reCAPTCHA:

```html
<!-- For general phone authentication -->
<div id="recaptcha-container" style="display: none;"></div>

<!-- For MFA-specific operations -->
<div id="mfa-recaptcha-container" style="display: none;"></div>
```

These are automatically included in the components that need them.

## Firebase Configuration

Ensure your Firebase project has the following enabled:

1. **Authentication Providers:**

   - Email/Password (required for MFA base authentication)
   - Phone (required for SMS MFA)

2. **Multi-Factor Authentication:**

   - Enable MFA in Firebase Console
   - Configure allowed second factors (TOTP and SMS)

3. **reCAPTCHA:**
   - Configure reCAPTCHA settings for phone authentication

## Dependencies

The implementation uses the following Firebase Web SDK v9+ features:

- `multiFactor()` - Core MFA functionality
- `TotpMultiFactorGenerator` - TOTP factor management
- `PhoneMultiFactorGenerator` - SMS factor management
- `RecaptchaVerifier` - Phone verification

## Error Codes

Common error codes and their meanings:

- `auth/multi-factor-auth-required` - MFA is required for sign-in
- `auth/invalid-multi-factor-session` - MFA session expired
- `auth/maximum-second-factor-count-exceeded` - Too many factors enrolled
- `auth/second-factor-already-in-use` - Factor already enrolled for another user
- `auth/unsupported-first-factor` - Base auth method doesn't support MFA

## Best Practices

1. **User Experience:**

   - Always provide clear instructions for each MFA method
   - Show backup options if primary method fails
   - Provide easy factor management in account settings

2. **Security:**

   - Encourage users to enroll at least one MFA factor
   - Verify phone numbers before allowing SMS MFA
   - Implement proper session management

3. **Error Handling:**
   - Provide specific error messages for different failure scenarios
   - Allow users to retry failed operations
   - Implement proper loading states

## Testing

To test the MFA implementation:

1. **TOTP Testing:**

   - Use a real authenticator app to scan QR codes
   - Test with invalid codes to verify error handling
   - Test factor removal and re-enrollment

2. **SMS Testing:**

   - Use real phone numbers for testing
   - Test with invalid verification codes
   - Verify international number support

3. **Sign-In Flow Testing:**
   - Test sign-in with and without MFA
   - Test factor selection interface
   - Test cancellation and retry flows
