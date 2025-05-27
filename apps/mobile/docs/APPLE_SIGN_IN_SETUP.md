# Apple Sign In Setup Guide

This guide explains how to configure Apple Sign In for Dynasty mobile app.

## Prerequisites

1. Apple Developer Account
2. Firebase project with Authentication enabled
3. iOS app configured in Apple Developer Portal

## Setup Steps

### 1. Apple Developer Portal Configuration

1. Sign in to [Apple Developer Portal](https://developer.apple.com)
2. Go to Certificates, Identifiers & Profiles
3. Select your app identifier
4. Enable "Sign In with Apple" capability
5. Save the changes

### 2. Configure Service ID (for Firebase)

1. In Apple Developer Portal, go to Identifiers
2. Create a new Service ID:
   - Description: "Dynasty Firebase Auth"
   - Identifier: `com.dynasty.firebase.auth` (or your preferred ID)
3. Enable "Sign In with Apple"
4. Configure domains:
   - Domain: `your-project.firebaseapp.com`
   - Return URL: `https://your-project.firebaseapp.com/__/auth/handler`

### 3. Create Key for Firebase

1. In Apple Developer Portal, go to Keys
2. Create a new key:
   - Name: "Dynasty Firebase Auth Key"
   - Enable "Sign In with Apple"
3. Download the key file (you'll need this for Firebase)
4. Note down:
   - Key ID
   - Team ID

### 4. Firebase Console Configuration

1. Go to [Firebase Console](https://console.firebase.google.com)
2. Navigate to Authentication > Sign-in method
3. Enable Apple provider
4. Fill in:
   - Services ID: The Service ID created in step 2
   - Apple Team ID: Your Apple Developer Team ID
   - Key ID: From step 3
   - Private Key: Contents of the key file from step 3

### 5. Update iOS Project

The following configurations have already been added to the project:

#### Info.plist
- URL schemes for authentication callbacks
- Required permissions

#### Entitlements
- Sign in with Apple capability
- Associated domains for universal links

### 6. Testing

1. Build the app on a physical iOS device (Sign in with Apple doesn't work on simulator)
2. Ensure you're signed in to iCloud on the device
3. Test the Sign in with Apple flow

## Code Implementation

The Sign in with Apple button has been implemented in:
- `/components/ui/AppleSignInButton.tsx` - Reusable button component
- `/app/(auth)/signIn.tsx` - Sign in screen
- `/app/(auth)/signUp.tsx` - Sign up screen

## Troubleshooting

### Common Issues

1. **"Invalid client" error**
   - Verify Service ID configuration in Apple Developer Portal
   - Ensure Firebase configuration matches Apple settings

2. **Sign in button not appearing**
   - Check if device supports Sign in with Apple (iOS 13+)
   - Verify entitlements are properly configured

3. **Authentication fails**
   - Check Firebase private key configuration
   - Verify Team ID and Key ID are correct

### Debug Tips

- Check Xcode console for detailed error messages
- Enable Firebase Auth debug logging
- Test on real device, not simulator

## Security Notes

- Never commit the Apple private key to version control
- Use Firebase Secret Manager for production
- Rotate keys periodically

## Additional Resources

- [Apple Sign In Documentation](https://developer.apple.com/sign-in-with-apple/)
- [Firebase Apple Authentication](https://firebase.google.com/docs/auth/ios/apple)
- [Expo Apple Authentication](https://docs.expo.dev/versions/latest/sdk/apple-authentication/)