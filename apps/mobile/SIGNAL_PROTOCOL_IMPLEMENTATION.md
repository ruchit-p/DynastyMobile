# Signal Protocol Implementation Guide for Dynasty Mobile

## Overview

This guide covers the complete implementation of the Signal Protocol in the Dynasty Mobile app using the official `libsignal-client` libraries for both iOS and Android.

## Implementation Status

### ✅ Completed

#### iOS Implementation
- [x] Native module bridge (Objective-C++)
- [x] Swift implementation using LibSignalClient
- [x] Persistent storage using iOS Keychain
- [x] All protocol operations (identity, sessions, encryption, groups)
- [x] Thread-safe session caching
- [x] Comprehensive error handling

#### Android Implementation
- [x] Already implemented with Kotlin and Java
- [x] Uses Android Keystore for secure storage
- [x] Complete Signal Protocol support
- [x] Coroutine-based async operations

#### JavaScript/TypeScript
- [x] TypeScript specifications (NativeLibsignal.ts)
- [x] High-level service wrapper (SignalProtocolService.ts)
- [x] Example usage code
- [x] Test component

## Build and Run Instructions

### iOS

1. **Install dependencies:**
```bash
cd apps/mobile/ios
pod install
```

2. **If you encounter pod issues:**
```bash
# Clean everything
pod deintegrate
pod cache clean --all
rm -rf Pods Podfile.lock ~/Library/Developer/Xcode/DerivedData

# Reinstall
pod repo update
pod install
```

3. **Build and run:**
```bash
cd ..
npm run ios
# or
npx expo run:ios
```

### Android

The Android implementation is already complete. Just build normally:

```bash
npm run android
# or
npx expo run:android
```

## Integration with Dynasty App

### 1. Initialize on App Start

In your main App component or authentication flow:

```typescript
import { signalProtocol } from './src/services/signal';

// In your app initialization
useEffect(() => {
  const initEncryption = async () => {
    try {
      await signalProtocol.initialize();
      console.log('Encryption initialized');
    } catch (error) {
      console.error('Failed to initialize encryption:', error);
    }
  };
  
  initEncryption();
}, []);
```

### 2. User Registration

When a new user registers:

```typescript
// This happens automatically during initialization
// But you need to upload the public keys to your server

const bundle = await signalProtocol.getPublicPreKeyBundle();
// Upload bundle to your server
await api.uploadUserKeys(userId, bundle);
```

### 3. Starting a Conversation

When starting a chat with another user:

```typescript
// Fetch the recipient's pre-key bundle from your server
const recipientBundle = await api.fetchUserPreKeyBundle(recipientId);

// Create a session
await signalProtocol.createSession(
  recipientId,
  recipientBundle.deviceId,
  recipientBundle
);

// Now you can send encrypted messages
const encrypted = await signalProtocol.encryptMessage(
  recipientId,
  recipientBundle.deviceId,
  'Hello!'
);

// Send the encrypted message through your server
await api.sendMessage(recipientId, encrypted);
```

### 4. Receiving Messages

When receiving a message:

```typescript
// Decrypt based on message type
const plaintext = await signalProtocol.decryptAnyMessage(
  senderId,
  senderDeviceId,
  encryptedMessage
);

// Display the decrypted message
console.log('Received:', plaintext);
```

### 5. Group Messaging

For family group chats:

```typescript
// When creating a group
const distribution = await signalProtocol.createGroupSession(groupId);
// Share distribution.message with all group members

// When a member joins
await signalProtocol.processGroupMemberKey(
  memberId,
  deviceId,
  memberDistributionMessage
);

// Send group messages
const encrypted = await signalProtocol.encryptGroupMessage(groupId, message);
// Broadcast to all members
```

## Security Best Practices

### 1. Key Storage
- ✅ All keys are stored in platform-specific secure storage
- ✅ iOS: Keychain with hardware encryption
- ✅ Android: Android Keystore with hardware backing

### 2. Session Management
- Implement session expiration policies
- Rotate signed pre-keys periodically (recommended: weekly)
- Monitor for identity key changes

### 3. Server Integration
- Never store private keys on the server
- Implement rate limiting for key requests
- Use secure channels (HTTPS) for all key exchanges
- Implement device management (multiple devices per user)

### 4. UI/UX Considerations
- Show safety numbers for verification
- Indicate encryption status in chat UI
- Handle gracefully when messages can't be decrypted
- Provide clear error messages for users

## Common Issues and Solutions

### iOS Build Issues

1. **"Module 'LibSignalClient' not found"**
   - Clean build folder (⇧+⌘+K)
   - Delete DerivedData
   - Run `pod install` again

2. **"Swift compiler errors"**
   - Ensure Swift version is 5.0+
   - Check that all Swift files are included in target

3. **"Undefined symbols for architecture"**
   - Make sure LibSignalClient is properly linked
   - Check Build Phases → Link Binary With Libraries

### Android Build Issues

1. **"Cannot find symbol LibsignalModule"**
   - Clean and rebuild: `cd android && ./gradlew clean`
   - Sync project with Gradle files

2. **"Duplicate class" errors**
   - Check for conflicting dependencies
   - Exclude duplicates in build.gradle

### Runtime Issues

1. **"No identity key pair found"**
   - Ensure `initialize()` is called before any operations
   - Check if app has permission to access secure storage

2. **"Session not found"**
   - Create session before encrypting
   - Handle pre-key message for first-time conversations

## Performance Optimization

1. **Batch Operations**
   - Generate pre-keys in batches
   - Process multiple messages together

2. **Caching**
   - Session cache is already implemented
   - Consider caching identity keys for frequent contacts

3. **Background Processing**
   - Decrypt messages in background
   - Pre-generate keys during idle time

## Testing

1. **Unit Tests**
   - Test key generation and storage
   - Test encryption/decryption cycles
   - Test session creation and management

2. **Integration Tests**
   - Test cross-platform message exchange
   - Test group messaging scenarios
   - Test key rotation

3. **Use the Test Component**
   ```typescript
   import { SignalProtocolTest } from './test-signal-protocol';
   
   // Add to a test screen in your app
   <SignalProtocolTest />
   ```

## Next Steps

1. **Server Implementation**
   - Create endpoints for key exchange
   - Implement pre-key distribution
   - Handle message routing

2. **UI Integration**
   - Add encryption indicators
   - Implement safety number verification UI
   - Show encryption status

3. **Advanced Features**
   - Disappearing messages
   - Sealed sender
   - Multi-device support
   - Key backup and restore

4. **Monitoring**
   - Track encryption/decryption failures
   - Monitor key usage
   - Alert on suspicious activity

## Resources

- [Signal Protocol Documentation](https://signal.org/docs/)
- [LibSignal Client Library](https://github.com/signalapp/libsignal)
- [Double Ratchet Algorithm](https://signal.org/docs/specifications/doubleratchet/)
- [X3DH Key Agreement](https://signal.org/docs/specifications/x3dh/)

## Support

For issues specific to this implementation:
1. Check the logs in Xcode (iOS) or Android Studio (Android)
2. Enable debug logging in the native modules
3. Use the test component to isolate issues
4. Check the respective README files in the native module directories

Remember: The Signal Protocol provides the cryptographic foundation, but the security of your app also depends on proper implementation of the surrounding infrastructure (server, key distribution, user authentication, etc.).
