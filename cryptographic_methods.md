# Cryptographic Methods for End-to-End Encrypted Messaging with Firebase

This document analyzes the cryptographic methods suitable for implementing end-to-end encrypted messaging with Firebase, focusing on cross-platform compatibility between React Native mobile apps and Next.js web applications.

## Core Cryptographic Requirements

For a robust end-to-end encrypted messaging system, the following cryptographic components are essential:

1. **Key Generation and Management**
2. **Secure Key Exchange**
3. **Message Encryption/Decryption**
4. **Secure Storage**
5. **Group Messaging Cryptography**

## Recommended Cryptographic Methods

### 1. Key Generation and Management

#### Asymmetric Key Pairs
- **Algorithm**: RSA (2048-bit or higher) or Elliptic Curve Cryptography (ECC)
- **Recommendation**: ECC is preferred for mobile applications due to smaller key sizes and faster operations
- **Implementation**: 
  - React Native: `react-native-quick-crypto` or `react-native-crypto`
  - Web/Next.js: Web Crypto API

```javascript
// Example of ECC key generation in React Native
import Crypto from 'react-native-quick-crypto';

const generateKeyPair = async () => {
  return new Promise((resolve, reject) => {
    Crypto.generateKeyPair('ec', {
      namedCurve: 'prime256v1', // or 'secp256k1'
    }, (err, keys) => {
      if (err) reject(err);
      resolve({
        privateKey: keys.privateKey,
        publicKey: keys.publicKey
      });
    });
  });
};
```

```javascript
// Example of ECC key generation in Web/Next.js
const generateKeyPair = async () => {
  const keyPair = await window.crypto.subtle.generateKey(
    {
      name: 'ECDH',
      namedCurve: 'P-256',
    },
    true, // extractable
    ['deriveKey', 'deriveBits'] // usages
  );
  
  return keyPair;
};
```

### 2. Secure Key Exchange

#### Diffie-Hellman Key Exchange
- **Algorithm**: ECDH (Elliptic Curve Diffie-Hellman)
- **Purpose**: Establish a shared secret between two parties without transmitting the secret itself
- **Implementation**:
  - React Native: `react-native-quick-crypto`
  - Web/Next.js: Web Crypto API

```javascript
// Example of ECDH in React Native
const deriveSharedSecret = async (privateKey, otherPublicKey) => {
  return new Promise((resolve, reject) => {
    const ecdh = Crypto.createECDH('prime256v1');
    ecdh.setPrivateKey(privateKey);
    const sharedSecret = ecdh.computeSecret(otherPublicKey);
    resolve(sharedSecret);
  });
};
```

```javascript
// Example of ECDH in Web/Next.js
const deriveSharedSecret = async (privateKey, publicKey) => {
  const sharedSecret = await window.crypto.subtle.deriveBits(
    {
      name: 'ECDH',
      public: publicKey,
    },
    privateKey,
    256 // number of bits to derive
  );
  
  return sharedSecret;
};
```

### 3. Message Encryption/Decryption

#### Symmetric Encryption
- **Algorithm**: AES-256-GCM (Galois/Counter Mode)
- **Advantages**: Provides both confidentiality and integrity (authentication)
- **Implementation**:
  - React Native: `react-native-quick-crypto` or `react-native-aes-gcm`
  - Web/Next.js: Web Crypto API

```javascript
// Example of AES-GCM encryption in React Native
const encryptMessage = async (message, sharedSecret) => {
  // Generate a random IV (Initialization Vector)
  const iv = Crypto.randomBytes(12);
  
  // Create cipher using the shared secret and IV
  const cipher = Crypto.createCipheriv('aes-256-gcm', sharedSecret, iv);
  
  // Encrypt the message
  let encrypted = cipher.update(message, 'utf8', 'base64');
  encrypted += cipher.final('base64');
  
  // Get the authentication tag
  const authTag = cipher.getAuthTag();
  
  return {
    encrypted,
    iv: iv.toString('base64'),
    authTag: authTag.toString('base64')
  };
};

const decryptMessage = async (encryptedData, sharedSecret) => {
  const { encrypted, iv, authTag } = encryptedData;
  
  // Create decipher
  const decipher = Crypto.createDecipheriv(
    'aes-256-gcm',
    sharedSecret,
    Buffer.from(iv, 'base64')
  );
  
  // Set auth tag
  decipher.setAuthTag(Buffer.from(authTag, 'base64'));
  
  // Decrypt
  let decrypted = decipher.update(encrypted, 'base64', 'utf8');
  decrypted += decipher.final('utf8');
  
  return decrypted;
};
```

```javascript
// Example of AES-GCM encryption in Web/Next.js
const encryptMessage = async (message, sharedSecret) => {
  // Generate a random IV
  const iv = window.crypto.getRandomValues(new Uint8Array(12));
  
  // Import the shared secret as a key
  const key = await window.crypto.subtle.importKey(
    'raw',
    sharedSecret,
    { name: 'AES-GCM' },
    false,
    ['encrypt']
  );
  
  // Encrypt the message
  const encodedMessage = new TextEncoder().encode(message);
  const encryptedBuffer = await window.crypto.subtle.encrypt(
    {
      name: 'AES-GCM',
      iv: iv,
    },
    key,
    encodedMessage
  );
  
  return {
    encrypted: arrayBufferToBase64(encryptedBuffer),
    iv: arrayBufferToBase64(iv)
  };
};

const decryptMessage = async (encryptedData, sharedSecret) => {
  const { encrypted, iv } = encryptedData;
  
  // Import the shared secret as a key
  const key = await window.crypto.subtle.importKey(
    'raw',
    sharedSecret,
    { name: 'AES-GCM' },
    false,
    ['decrypt']
  );
  
  // Decrypt the message
  const decryptedBuffer = await window.crypto.subtle.decrypt(
    {
      name: 'AES-GCM',
      iv: base64ToArrayBuffer(iv),
    },
    key,
    base64ToArrayBuffer(encrypted)
  );
  
  return new TextDecoder().decode(decryptedBuffer);
};
```

### 4. Secure Storage

#### Key Storage
- **React Native**:
  - iOS: Keychain via `react-native-keychain`
  - Android: Keystore via `react-native-keychain`
- **Web/Next.js**:
  - IndexedDB with encryption
  - `localforage` with custom encryption layer

```javascript
// Example of secure storage in React Native
import Keychain from 'react-native-keychain';

const storeKeys = async (userId, keyPair) => {
  await Keychain.setGenericPassword(
    `${userId}_private_key`,
    JSON.stringify(keyPair.privateKey),
    {
      service: 'com.yourapp.keys',
      accessControl: Keychain.ACCESS_CONTROL.BIOMETRY_ANY_OR_DEVICE_PASSCODE,
      accessible: Keychain.ACCESSIBLE.WHEN_UNLOCKED_THIS_DEVICE_ONLY
    }
  );
  
  // Public keys can be stored in regular storage or Firebase
  // as they don't need the same level of protection
};

const retrievePrivateKey = async (userId) => {
  try {
    const credentials = await Keychain.getGenericPassword({
      service: 'com.yourapp.keys'
    });
    
    if (credentials) {
      return JSON.parse(credentials.password);
    }
    return null;
  } catch (error) {
    console.error('Error retrieving private key', error);
    return null;
  }
};
```

```javascript
// Example of secure storage in Web/Next.js
import localforage from 'localforage';
import CryptoJS from 'crypto-js';

// Initialize storage
const keysStorage = localforage.createInstance({
  name: 'encryptedMessaging',
  storeName: 'keys'
});

const storeKeys = async (userId, keyPair, devicePassword) => {
  // Encrypt the private key with the device password before storing
  const encryptedPrivateKey = CryptoJS.AES.encrypt(
    JSON.stringify(keyPair.privateKey),
    devicePassword
  ).toString();
  
  await keysStorage.setItem(`${userId}_private_key`, encryptedPrivateKey);
  
  // Public keys can be stored without encryption or in Firebase
};

const retrievePrivateKey = async (userId, devicePassword) => {
  try {
    const encryptedPrivateKey = await keysStorage.getItem(`${userId}_private_key`);
    
    if (encryptedPrivateKey) {
      const decrypted = CryptoJS.AES.decrypt(encryptedPrivateKey, devicePassword);
      return JSON.parse(decrypted.toString(CryptoJS.enc.Utf8));
    }
    return null;
  } catch (error) {
    console.error('Error retrieving private key', error);
    return null;
  }
};
```

### 5. Group Messaging Cryptography

For group messaging, there are two main approaches:

#### 1. Fan-out Encryption (Simpler)
- Encrypt the message separately for each recipient using their public key
- **Pros**: Simple to implement
- **Cons**: Not scalable for large groups, requires multiple encryptions

#### 2. Signal Protocol / MLS (More Advanced)
- Uses a shared group key that evolves over time
- Provides forward secrecy and post-compromise security
- **Pros**: Scalable, more secure
- **Cons**: More complex to implement

For Firebase implementation with React Native and Next.js, the recommended approach depends on group size:

- **Small Groups (< 10 members)**: Fan-out encryption is sufficient
- **Large Groups**: Consider using a library that implements MLS (Messaging Layer Security) or Signal Protocol

## Firebase Integration

### Storing Encrypted Messages

```javascript
// Example of storing an encrypted message in Firebase
const sendEncryptedMessage = async (roomId, senderId, encryptedData) => {
  const messageRef = firebase.database().ref(`messages/${roomId}`).push();
  
  await messageRef.set({
    sender: senderId,
    encryptedContent: encryptedData.encrypted,
    iv: encryptedData.iv,
    authTag: encryptedData.authTag,
    timestamp: firebase.database.ServerValue.TIMESTAMP
  });
  
  return messageRef.key;
};
```

### Storing Public Keys

```javascript
// Example of storing public keys in Firebase
const storePublicKey = async (userId, publicKey) => {
  await firebase.database().ref(`publicKeys/${userId}`).set({
    key: publicKey.toString('base64'),
    updatedAt: firebase.database.ServerValue.TIMESTAMP
  });
};

const retrievePublicKey = async (userId) => {
  const snapshot = await firebase.database().ref(`publicKeys/${userId}`).once('value');
  if (snapshot.exists()) {
    return Buffer.from(snapshot.val().key, 'base64');
  }
  return null;
};
```

## Cross-Platform Considerations

### React Native Specific
- Use native modules for cryptographic operations when possible for better performance
- Consider platform-specific secure storage mechanisms
- Test on both iOS and Android as cryptographic implementations may differ

### Web/Next.js Specific
- Use Web Crypto API for cryptographic operations
- Be aware of browser compatibility issues
- Implement proper key storage with additional encryption layer

## Recommended Libraries

### React Native
1. `react-native-quick-crypto` - Provides Node.js-like crypto API
2. `react-native-keychain` - For secure key storage
3. `react-native-aes-gcm` - For AES-GCM encryption
4. `@seald-io/sdk` - Turnkey E2EE solution

### Web/Next.js
1. Web Crypto API (built into modern browsers)
2. `localforage` - For IndexedDB storage
3. `crypto-js` - For additional cryptographic operations
4. `@seald-io/sdk` - Turnkey E2EE solution

## Conclusion

For implementing end-to-end encrypted messaging with Firebase that works across React Native and Next.js:

1. **Key Generation**: Use ECC for better performance on mobile
2. **Key Exchange**: Implement ECDH for secure shared secret derivation
3. **Encryption**: Use AES-256-GCM for message encryption
4. **Storage**: Use platform-specific secure storage mechanisms
5. **Group Messaging**: Choose between fan-out encryption or more advanced protocols based on group size

The Seald SDK provides a turnkey solution that handles much of this complexity, but understanding the underlying cryptographic methods is essential for proper implementation and security assessment.
