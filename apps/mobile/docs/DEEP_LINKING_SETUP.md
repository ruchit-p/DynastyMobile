# Deep Linking Setup for Dynasty Mobile App

This document explains how deep linking and universal links are configured for the Dynasty mobile app.

## Overview

The app supports:
- **Custom URL Scheme**: `dynasty://` 
- **Universal Links (iOS)**: `https://mydynastyapp.com/*` and `https://www.mydynastyapp.com/*`
- **App Links (Android)**: Same HTTPS URLs with auto-verification

## Configuration Files

### 1. App Configuration (`app.json`)

**iOS Configuration:**
```json
"ios": {
  "associatedDomains": [
    "applinks:mydynastyapp.com",
    "applinks:www.mydynastyapp.com"
  ]
}
```

**Android Configuration:**
```json
"android": {
  "intentFilters": [
    {
      "action": "VIEW",
      "autoVerify": true,
      "data": [
        {
          "scheme": "https",
          "host": "mydynastyapp.com",
          "pathPrefix": "/"
        },
        {
          "scheme": "https",
          "host": "www.mydynastyapp.com",
          "pathPrefix": "/"
        }
      ],
      "category": ["BROWSABLE", "DEFAULT"]
    }
  ]
}
```

### 2. Web Server Files

These files must be hosted on your web server:

**Apple App Site Association** (`/.well-known/apple-app-site-association`):
- Replace `YOUR_TEAM_ID` with your Apple Developer Team ID
- No file extension, served as `application/json`

**Android App Links** (`/.well-known/assetlinks.json`):
- Replace `YOUR:SHA256:CERT:FINGERPRINT:HERE` with your app's certificate fingerprint
- Get fingerprint: `keytool -list -v -keystore your-keystore.jks`

### 3. Deep Linking Routes (`src/config/deepLinking.ts`)

Defines how URLs map to app screens. Example routes:
- `https://mydynastyapp.com/story/123` → Story Detail Screen
- `https://mydynastyapp.com/event/456` → Event Detail Screen
- `https://mydynastyapp.com/profile/789` → Member Profile Screen

## Testing Deep Links

### Development Testing

1. **Custom Scheme (works in dev)**:
   ```bash
   # iOS Simulator
   xcrun simctl openurl booted "dynasty://story/123"
   
   # Android Emulator
   adb shell am start -W -a android.intent.action.VIEW -d "dynasty://story/123" com.mydynastyapp.dynasty
   ```

2. **Universal Links (requires production build)**:
   ```bash
   # Open Safari/Chrome and navigate to:
   https://mydynastyapp.com/story/123
   ```

### Production Requirements

1. **iOS Universal Links**:
   - Valid SSL certificate on mydynastyapp.com
   - Apple App Site Association file accessible at `https://mydynastyapp.com/.well-known/apple-app-site-association`
   - App must be installed from TestFlight or App Store

2. **Android App Links**:
   - Valid SSL certificate
   - assetlinks.json file accessible
   - Certificate fingerprint must match signed APK

## Implementation in Code

### Handling Deep Links

```typescript
import { linking, getInitialURL } from '../src/config/deepLinking';
import { useEffect } from 'react';
import * as Linking from 'expo-linking';

// In your root component
useEffect(() => {
  // Handle initial URL (app opened via link)
  getInitialURL();
  
  // Listen for new URLs while app is open
  const subscription = Linking.addEventListener('url', ({ url }) => {
    handleDeepLink(url);
  });
  
  return () => subscription.remove();
}, []);
```

### Creating Deep Links

```typescript
import * as Linking from 'expo-linking';

// Create a deep link to a story
const storyUrl = Linking.createURL('story/123');
// Result: "dynasty://story/123" in dev, or full URL in prod

// Create a universal link
const universalUrl = `https://mydynastyapp.com/story/${storyId}`;
```

## Troubleshooting

### iOS Issues
1. Check Team ID is correct in apple-app-site-association
2. Verify associated domains in Xcode project
3. Test with `https://` URLs, not `http://`

### Android Issues
1. Verify SHA256 fingerprint matches your signing certificate
2. Check package name matches exactly
3. Use `adb logcat` to debug intent handling

### Common Problems
- **Link opens browser instead of app**: Universal links not properly configured
- **"Cannot open URL" error**: URL scheme not registered or app not installed
- **Deep link works in dev but not prod**: Missing web server files or wrong domain configuration

## Next Steps

1. Update `YOUR_TEAM_ID` in apple-app-site-association
2. Update certificate fingerprint in assetlinks.json
3. Deploy web server files to production
4. Test with production builds