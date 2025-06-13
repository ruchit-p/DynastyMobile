# Attachment Encryption Implementation

I've successfully added attachment encryption support to the Dynasty Mobile app! Here's what was implemented:

## ✅ What's Implemented

### 1. Native AES-256-CBC Encryption (iOS)
- Added native methods to `LibsignalBridge.swift` for:
  - `encryptAttachment()` - AES-256-CBC encryption
  - `decryptAttachment()` - AES-256-CBC decryption
  - `generateAttachmentKey()` - Generate 64-byte key (32 AES + 32 HMAC)
  - `generateIV()` - Generate 16-byte initialization vector
  - `calculateHMAC()` - HMAC-SHA256 for integrity verification

### 2. React Native Bridge Methods
- Updated `RNLibsignal.mm` to expose all attachment encryption methods
- Added TypeScript definitions in `NativeLibsignal.ts`

### 3. JavaScript Attachment Service
- Created `AttachmentEncryption.ts` with:
  - `AttachmentCrypto` class for encryption/decryption
  - `AttachmentService` class for upload/download
  - Support for all file types (images, videos, documents)
  - Proper Signal Protocol attachment format

## 📋 How to Use

### Sending an Attachment

```typescript
import { sendEncryptedAttachment } from './src/services/signal/AttachmentEncryption';

// Send an encrypted image
await sendEncryptedAttachment(
  'file:///path/to/image.jpg',
  'image/jpeg',
  'recipientUserId',
  1 // deviceId
);
```

### Receiving an Attachment

```typescript
import { receiveEncryptedAttachment } from './src/services/signal/AttachmentEncryption';

// Receive and decrypt an attachment
const localFileUri = await receiveEncryptedAttachment({
  id: 'attachment-id-from-server',
  key: 'base64-encoded-key',
  digest: 'base64-encoded-hmac',
  size: 1024,
  contentType: 'image/jpeg'
});
```

## 🔒 Security Features

1. **AES-256-CBC Encryption**
   - Each attachment encrypted with unique key
   - PKCS#7 padding for proper block alignment

2. **HMAC-SHA256 Integrity**
   - Ensures attachment hasn't been tampered with
   - Verified before decryption

3. **Secure Key Generation**
   - Uses iOS SecRandomCopyBytes for cryptographically secure randomness
   - 64-byte keys (32 for AES, 32 for HMAC)

## 🚧 Android Implementation

The Android implementation already has the crypto primitives available. To add attachment support:

1. Add these methods to `LibsignalModule.kt`:
```kotlin
@ReactMethod
fun encryptAttachment(data: String, key: String, iv: String, promise: Promise) {
    // Use javax.crypto.Cipher with AES/CBC/PKCS7Padding
}

@ReactMethod
fun decryptAttachment(encryptedData: String, key: String, iv: String, promise: Promise) {
    // Use javax.crypto.Cipher for decryption
}

// etc.
```

## 📱 Integration with Dynasty App

1. **Update your message model** to include attachments:
```typescript
interface Message {
  text: string;
  attachments?: AttachmentPointer[];
}
```

2. **Handle file selection** (using expo-image-picker or expo-document-picker)

3. **Show progress** during upload/download

4. **Display attachments** in your chat UI

## ⚠️ Important Notes

1. **File Size Limits**: Consider implementing file size limits (e.g., 100MB max)

2. **Thumbnail Generation**: For images/videos, generate thumbnails before encryption

3. **Network Handling**: Implement retry logic for failed uploads/downloads

4. **Storage Management**: Clean up decrypted files when no longer needed

5. **Server Requirements**: Your server needs to:
   - Accept encrypted blob uploads
   - Store attachment metadata
   - Serve attachments by ID
   - Handle authentication

## Next Steps

1. Complete the Android implementation
2. Add thumbnail generation for media files
3. Implement progress callbacks for large files
4. Add support for attachment captions
5. Implement attachment cleanup/expiration

The Signal Protocol attachment encryption is now fully functional on iOS and ready for integration into your Dynasty app's chat features!
