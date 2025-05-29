# Firebase Phone Authentication Implementation

## Overview

Dynasty uses Firebase Auth's built-in phone authentication, which handles SMS sending and verification automatically. This is more secure and cost-effective than implementing custom SMS verification.

## Client-Side Flow (Mobile/Web)

```typescript
// 1. Initialize Firebase Auth
import { getAuth, signInWithPhoneNumber, RecaptchaVerifier } from 'firebase/auth';

// 2. Set up reCAPTCHA (required for web, automatic on mobile)
const auth = getAuth();
const recaptchaVerifier = new RecaptchaVerifier('recaptcha-container', {
  size: 'invisible',
}, auth);

// 3. Send verification code
const phoneNumber = '+1234567890';
const confirmationResult = await signInWithPhoneNumber(auth, phoneNumber, recaptchaVerifier);

// 4. User enters the SMS code
const code = '123456'; // From user input
const userCredential = await confirmationResult.confirm(code);

// 5. User is now authenticated! Call our backend to create user document
const idToken = await userCredential.user.getIdToken();
const response = await httpsCallable(functions, 'signInWithPhoneNumber')({});
```

## Server-Side Function

The `signInWithPhoneNumber` function in `authentication.ts`:
- Is called AFTER Firebase Auth verification is complete
- Creates or updates the user document in Firestore
- Returns user info and onboarding status

## Key Benefits

1. **No SMS costs** - Firebase Auth includes SMS in their pricing
2. **Built-in security** - Automatic rate limiting and fraud protection
3. **Multi-platform** - Works on iOS, Android, and Web
4. **No custom SMS code** - Firebase handles verification codes
5. **Automatic retry** - Users can request new codes easily

## Security Features

- reCAPTCHA protection (web)
- Automatic rate limiting
- Phone number format validation
- Fraud detection
- IP-based throttling

## Environment Setup

No additional environment variables needed for phone auth! Firebase Auth uses your project's built-in SMS quota.

## Testing

For testing, use Firebase Auth's test phone numbers:
- Configure in Firebase Console > Authentication > Sign-in method > Phone > Test numbers
- These numbers don't send real SMS messages
- Work in development and staging environments