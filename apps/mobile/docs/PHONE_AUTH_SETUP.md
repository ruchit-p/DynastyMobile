# Firebase Phone Authentication Setup Guide

This guide explains how Firebase Phone Authentication is implemented in the Dynasty mobile app.

## Overview

Firebase Phone Authentication in React Native works differently than in web applications:

- **iOS**: Uses silent push notifications (APNs) - no reCAPTCHA needed
- **Android**: Uses SafetyNet API automatically - no reCAPTCHA needed  
- **Web/Expo Go**: Would require reCAPTCHA, but not supported in React Native Firebase

## Implementation Details

### 1. Phone Sign In Screen (`/app/(auth)/phoneSignIn.tsx`)

- Uses `react-native-phone-number-input` for proper phone number formatting
- Validates phone numbers before sending OTP
- Shows test phone numbers in development mode
- Comprehensive error handling with user-friendly messages

### 2. OTP Verification Screen (`/app/(auth)/verifyOtp.tsx`)

- 6-digit OTP input validation
- Auto-fills test verification codes in development
- Resend OTP functionality with countdown timer
- Custom error messages for common issues

### 3. Configuration (`/src/config/phoneAuth.ts`)

Contains:
- Test phone numbers for development
- Platform-specific notes
- Custom error messages
- Debug logging configuration

## Firebase Console Setup

### 1. Enable Phone Authentication

1. Go to Firebase Console → Authentication → Sign-in method
2. Enable "Phone" provider
3. Add your app's SHA-1/SHA-256 fingerprints (Android)
4. Configure APNs authentication key (iOS)

### 2. Configure Test Phone Numbers

1. In Phone provider settings, add test phone numbers:
   - `+1 650-555-1234` → `123456`
   - `+1 650-555-4321` → `654321`
   - `+44 7700 900123` → `123456`
   - `+91 98765 43210` → `123456`

### 3. iOS Setup

1. Enable Push Notifications capability in Xcode
2. Upload APNs authentication key to Firebase Console
3. Ensure `GoogleService-Info.plist` is added to your iOS project

### 4. Android Setup

1. Add SHA-1 and SHA-256 fingerprints to Firebase Console
2. Ensure `google-services.json` is in `android/app/`
3. SafetyNet is automatically configured

## Testing

### Development Testing

1. **Use Test Phone Numbers**: Configure test numbers in Firebase Console
2. **Real Device Testing**: Use actual devices with SIM cards
3. **Emulator Testing**: Limited support, use test numbers

### Test Flow

1. Enter a test phone number (e.g., `+1 650-555-1234`)
2. In development, the app shows the verification code
3. Enter the test code (e.g., `123456`)
4. Authentication completes without sending real SMS

### Debugging

Enable debug logging in development:
- Phone auth attempts are logged to console
- Test phone numbers are identified with 📱 emoji
- Error codes are logged for troubleshooting

## Common Issues

### "auth/app-not-authorized"
- **iOS**: Check APNs configuration and bundle ID
- **Android**: Verify SHA fingerprints are correct

### "auth/invalid-phone-number"
- Ensure phone number includes country code
- Format: `+1 234-567-8900`

### "auth/quota-exceeded"
- Daily SMS limit reached
- Use test phone numbers for development

### "auth/too-many-requests"
- Rate limiting triggered
- Wait before retrying

## Platform Differences

### iOS
- Silent push notifications handle verification
- No visible reCAPTCHA
- Requires APNs setup

### Android
- SafetyNet API for app verification
- Auto-retrieval of SMS codes possible
- No visible reCAPTCHA

### Web (Not Supported)
- React Native Firebase doesn't support web platform
- Would require Firebase JS SDK with reCAPTCHA
- Use test phone numbers instead

## Security Best Practices

1. **Never hardcode real phone numbers** in your code
2. **Use test numbers** for development and testing
3. **Implement rate limiting** on your backend
4. **Validate phone numbers** on both client and server
5. **Monitor usage** in Firebase Console

## Additional Resources

- [React Native Firebase Phone Auth](https://rnfirebase.io/auth/phone-auth)
- [Firebase Phone Auth Documentation](https://firebase.google.com/docs/auth/ios/phone-auth)
- [Troubleshooting Guide](https://rnfirebase.io/auth/phone-auth#troubleshooting)