# ⚠️ DEPRECATED - FingerprintJS Pro Implementation Guide

> **DEPRECATED as of January 2025**: This documentation is obsolete. The Dynasty codebase has been fully cleaned of FingerprintJS device fingerprinting library while preserving all encryption and security-related fingerprint functionality.
>
> **What was removed:**
> - All FingerprintJS dependencies (`@fingerprintjs/fingerprintjs*` packages)
> - FingerprintJS service files: `FingerprintService.ts`, `EnhancedFingerprintService.ts`, `FingerprintProvider.tsx`
> - Device fingerprinting using FingerprintJS API
>
> **What was preserved:**
> - Cryptographic key fingerprints for Signal Protocol verification
> - E2EE key fingerprint generation (`e2eeService.generateFingerprint`)
> - Biometric authentication (Touch ID/Face ID) functionality
> - Device identification now uses native device properties (`Device.brand`, `Device.modelName`, etc.)
>
> **Migration notes:**
> - Trusted device functionality continues to work using device-based IDs
> - No impact on end-to-end encryption or security features
> - All cryptographic fingerprints remain functional for key verification
>
> For current device identification implementation, see the updated authentication modules in `/apps/firebase/functions/src/auth/`.

---

# FingerprintJS Pro Implementation Guide

This document outlines the implementation of FingerprintJS Pro for device fingerprinting and trust management in the Dynasty app.

## Overview

FingerprintJS Pro has been integrated across all platforms (Firebase backend, React Native mobile app, and Next.js web app) to provide:

1. **Device Fingerprinting** - Unique identification of devices
2. **Trust Scoring** - Risk assessment based on device characteristics
3. **Multi-Device Management** - Allow users to manage trusted devices
4. **Enhanced Security** - Additional authentication for untrusted devices

## Architecture

### Backend Service (`deviceFingerprintService`)

The core device fingerprinting logic resides in Firebase Functions:

- **Location**: `/apps/firebase/functions/src/services/deviceFingerprintService.ts`
- **Features**:
  - Device verification with FingerprintJS Pro API
  - Trust score calculation (0-100)
  - Risk assessment (low/medium/high)
  - Device history tracking
  - Automatic cleanup of old devices

### Trust Score Calculation

Trust scores are calculated based on multiple factors:

- **Base Score**: 50 points
- **Confidence Score**: +0-30 points (based on FingerprintJS confidence)
- **Negative Factors**:
  - Incognito mode: -10 points
  - VPN usage: -15 points
  - Bot detection: -25 points
- **Positive Factors**:
  - Time since first seen: +5-10 points
  - Login frequency: +5-10 points
  - Location consistency: +5 points

## Setup Instructions

### 1. Get FingerprintJS Pro API Keys

1. Sign up at [FingerprintJS Pro](https://fingerprintjs.com)
2. Create a new application
3. Note your:
   - **Public API Key** (for client-side)
   - **Server API Key** (for backend verification)

### 2. Configure Firebase Backend

```bash
# Navigate to functions directory
cd apps/firebase/functions

# Run the setup script
./scripts/setup-fingerprint-secrets.sh

# Enter your Server API Key when prompted
```

### 3. Configure Mobile App

Create `.env` file in `/apps/mobile/`:

```env
EXPO_PUBLIC_FINGERPRINT_API_KEY=your_public_api_key
EXPO_PUBLIC_FINGERPRINT_ENDPOINT=https://api.fpjs.io
EXPO_PUBLIC_FINGERPRINT_REGION=global
```

### 4. Configure Web App

Create `.env.local` file in `/apps/web/dynastyweb/`:

```env
NEXT_PUBLIC_FINGERPRINT_API_KEY=your_public_api_key
NEXT_PUBLIC_FINGERPRINT_ENDPOINT=https://api.fpjs.io
NEXT_PUBLIC_FINGERPRINT_REGION=global
```

### 5. Deploy Functions

```bash
firebase deploy --only functions
```

## Firebase Functions

### `verifyDeviceFingerprint`

Verifies a device fingerprint and registers/updates the trusted device.

**Request**:
```typescript
{
  requestId: string;
  visitorId: string;
  deviceInfo?: {
    deviceName?: string;
    deviceType?: string;
    platform?: string;
  }
}
```

**Response**:
```typescript
{
  success: boolean;
  device: {
    id: string;
    deviceName: string;
    trustScore: number;
    isNewDevice: boolean;
  };
  riskAssessment: {
    riskLevel: 'low' | 'medium' | 'high';
    riskFactors: string[];
    requiresAdditionalAuth: boolean;
  };
  requiresAdditionalAuth: boolean;
}
```

### `getTrustedDevices`

Retrieves all trusted devices for a user.

**Response**:
```typescript
{
  success: boolean;
  devices: Array<{
    id: string;
    visitorId: string;
    deviceName: string;
    deviceType: string;
    platform: string;
    lastUsed: number;
    addedAt: number;
    trustScore: number;
    isCurrentDevice: boolean;
    lastLocation?: {
      city?: string;
      country?: string;
    };
  }>;
}
```

### `removeTrustedDevice`

Removes a trusted device from the user's account.

### `checkDeviceTrust`

Quick check to see if a device is trusted (used during authentication).

## Mobile App Integration

### FingerprintService

The mobile app uses `/apps/mobile/src/services/FingerprintService.ts`:

```typescript
// Initialize on app start
await fingerprintService.initialize();

// Verify device during login
const trustResult = await fingerprintService.verifyDevice(userId, {
  deviceName: Device.deviceName,
  deviceType: 'Phone',
  platform: 'iOS'
});

// Check if additional auth needed
if (trustResult.requiresAdditionalAuth) {
  // Show 2FA or additional verification
}
```

### AuthContext Integration

Device verification is automatically performed when users sign in:

1. User authenticates
2. Device fingerprint is captured
3. Trust score is calculated
4. Additional auth is required if device is untrusted

### Trusted Devices Screen

Users can manage their trusted devices at `/app/(screens)/trustedDevices.tsx`:

- View all trusted devices
- See trust scores and risk levels
- Remove devices (except current)
- View last location and usage

## Web App Integration

### FingerprintService

The web app uses `/apps/web/dynastyweb/src/services/FingerprintService.ts`:

```typescript
// Verify device during login
const trustResult = await fingerprintService.verifyDevice(userId);

// The service automatically detects browser and OS information
```

### FingerprintProvider

The app is wrapped with `FingerprintProvider` in the root layout:

```tsx
<FingerprintProvider>
  <AuthProvider>
    {/* App content */}
  </AuthProvider>
</FingerprintProvider>
```

## Security Considerations

### 1. API Key Security

- **Public keys** are used client-side (safe to expose)
- **Server keys** are stored as Firebase secrets (never exposed)
- Keys are environment-specific (dev/staging/prod)

### 2. Privacy

- Device fingerprints are hashed
- Location data is approximate (city/country level)
- Users can remove devices at any time
- Data retention follows user preferences

### 3. Risk Mitigation

High-risk factors trigger additional authentication:
- New device from different country
- VPN usage on untrusted device
- Bot-like behavior detected
- Multiple failed login attempts

### 4. Compliance

- GDPR compliant (user consent, data deletion)
- Clear privacy policy updates needed
- Device tracking is opt-in compatible

## Testing

### Local Testing

1. Use Firebase emulators for backend testing
2. Set test API keys in environment files
3. Use FingerprintJS test mode for development

### Test Scenarios

1. **New Device Login**
   - Should create new trusted device
   - Trust score should be calculated
   - May require additional auth

2. **Trusted Device Login**
   - Should recognize device
   - No additional auth needed
   - Trust score should improve

3. **VPN/Incognito Testing**
   - Should detect and lower trust score
   - Should require additional auth

4. **Device Removal**
   - Should remove from all lists
   - Should require re-verification

## Monitoring

### Metrics to Track

1. **Device Trust Distribution**
   - Average trust scores
   - Risk level breakdown
   - New vs returning devices

2. **Security Events**
   - Failed verifications
   - High-risk login attempts
   - Device removal frequency

3. **Performance**
   - Fingerprint API response times
   - Cache hit rates
   - Error rates

### Alerts

Set up alerts for:
- Multiple high-risk login attempts
- Sudden spike in new devices
- API errors or timeouts

## Troubleshooting

### Common Issues

1. **"FingerprintJS API key not configured"**
   - Ensure secrets are set in Firebase
   - Check environment variables in apps
   - Verify API key is valid

2. **"Invalid fingerprint data"**
   - Check network connectivity
   - Verify API key permissions
   - Check FingerprintJS dashboard for errors

3. **Low Trust Scores**
   - Review risk factors in logs
   - Check for VPN/proxy usage
   - Verify device time is correct

### Debug Mode

Enable debug logging:

```typescript
// Mobile
fingerprintService.enableDebugMode();

// Web
localStorage.setItem('fingerprint_debug', 'true');
```

## Future Enhancements

1. **Biometric Binding**
   - Link fingerprints to biometric auth
   - Require biometrics for untrusted devices

2. **Behavioral Analysis**
   - Track usage patterns
   - Detect anomalous behavior
   - Adjust trust scores dynamically

3. **Cross-Device Sync**
   - Share trust between linked devices
   - Family device groups
   - Temporary device access

4. **Advanced Risk Rules**
   - Custom risk thresholds
   - Time-based access controls
   - Geofencing options

## Resources

- [FingerprintJS Pro Docs](https://dev.fingerprint.com/docs)
- [Firebase Security Best Practices](https://firebase.google.com/docs/rules/basics)
- [OWASP Device Fingerprinting](https://owasp.org/www-community/controls/Device_Fingerprinting)