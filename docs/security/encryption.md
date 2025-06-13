# Dynasty End-to-End Encryption Implementation Guide

## Table of Contents

1. [Overview](#overview)
2. [Architecture](#architecture)
3. [Cryptographic Primitives](#cryptographic-primitives)
4. [Key Management](#key-management)
5. [Message Encryption](#message-encryption)
6. [Group Messaging](#group-messaging)
7. [Media Encryption](#media-encryption)
8. [Cross-Platform Implementation](#cross-platform-implementation)
9. [Security Considerations](#security-considerations)
10. [Testing](#testing)
11. [Performance Optimization](#performance-optimization)
12. [Migration Strategy](#migration-strategy)

## Overview

Dynasty implements end-to-end encryption (E2EE) across all sensitive user communications and data storage. This document provides technical specifications and implementation details for the encryption system used in both React Native mobile apps and Next.js web applications.

### Core Principles

- **Zero-Knowledge Architecture**: Dynasty servers cannot decrypt user data
- **Cross-Platform Compatibility**: Seamless encryption between mobile and web
- **Forward Secrecy**: Compromised keys don't affect past communications
- **Post-Compromise Security**: System recovers security after key compromise
- **Performance Optimization**: Minimal impact on user experience

### Encryption Scope

- Direct messages (1-to-1 chat)
- Group messages
- Media files (photos, videos, documents)
- Vault storage
- User profile data (optional)
- Event details (optional)

## Architecture

### Cryptographic Stack

```
┌─────────────────────────────────────┐
│      Application Layer              │
│  (React Native / Next.js)           │
├─────────────────────────────────────┤
│      E2EE Service Layer             │
│  (Key Management, Encryption)       │
├─────────────────────────────────────┤
│    Cryptographic Libraries          │
│ (react-native-quick-crypto / WebCrypto) │
├─────────────────────────────────────┤
│      Secure Storage Layer           │
│  (Keychain / Keystore / IndexedDB)  │
└─────────────────────────────────────┘
```

### Data Flow

```
User A (Sender)                    Firebase                    User B (Receiver)
      │                                │                              │
      ├─ Generate Keys ────────────────┤                              │
      │                                │                              │
      ├─ Encrypt Message ──────────────┤                              │
      │                                │                              │
      ├─ Send Encrypted ───────────────► Store Encrypted             │
      │                                │      │                       │
      │                                │      └──────────────────────►│
      │                                │                              │
      │                                │                         Decrypt Message
      │                                │                              │
```

## Cryptographic Primitives

### Algorithms

| Purpose | Algorithm | Key Size | Mode | Notes |
|---------|-----------|----------|------|-------|
| Key Exchange | X25519 (ECDH) | 256-bit | - | Curve25519 for efficiency |
| Digital Signatures | Ed25519 | 256-bit | - | For message authentication |
| Symmetric Encryption | AES | 256-bit | GCM | Authenticated encryption |
| Key Derivation | HKDF | - | SHA-256 | Derive keys from shared secrets |
| Password KDF | Argon2id | - | - | Memory-hard function |
| Hashing | SHA-256/Blake2b | 256-bit | - | Integrity verification |

### Implementation

```typescript
// Core encryption configuration
export const CRYPTO_CONFIG = {
  // Key exchange
  keyExchange: {
    algorithm: 'X25519',
    keySize: 256
  },
  
  // Message encryption
  symmetric: {
    algorithm: 'AES-GCM',
    keySize: 256,
    ivSize: 96, // 12 bytes
    tagSize: 128 // 16 bytes
  },
  
  // Digital signatures
  signing: {
    algorithm: 'Ed25519',
    keySize: 256
  },
  
  // Key derivation
  kdf: {
    algorithm: 'HKDF',
    hash: 'SHA-256',
    saltSize: 256
  },
  
  // Password hashing
  passwordKdf: {
    algorithm: 'argon2id',
    memory: 65536, // 64MB
    iterations: 3,
    parallelism: 4,
    saltSize: 16
  }
};
```

## Key Management

### Key Hierarchy

```
Master Key (Device-specific)
    │
    ├─── Identity Key Pair (Ed25519)
    │     └── Used for signing
    │
    ├─── Agreement Key Pair (X25519)
    │     └── Used for key exchange
    │
    └─── Prekey Bundle
          ├── Signed Prekey (rotated monthly)
          └── One-time Prekeys (consumed per session)
```

### Key Generation

```typescript
// React Native implementation
import { generateKeyPair, randomBytes } from 'react-native-quick-crypto';

export class KeyManager {
  async generateIdentityKeyPair(): Promise<IdentityKeyPair> {
    const keyPair = await generateKeyPair('ed25519');
    return {
      publicKey: keyPair.publicKey,
      privateKey: keyPair.privateKey,
      keyId: randomBytes(16).toString('hex')
    };
  }
  
  async generateAgreementKeyPair(): Promise<AgreementKeyPair> {
    const keyPair = await generateKeyPair('x25519');
    return {
      publicKey: keyPair.publicKey,
      privateKey: keyPair.privateKey,
      keyId: randomBytes(16).toString('hex')
    };
  }
  
  async generatePrekeys(count: number = 100): Promise<Prekey[]> {
    const prekeys: Prekey[] = [];
    
    for (let i = 0; i < count; i++) {
      const keyPair = await generateKeyPair('x25519');
      prekeys.push({
        keyId: i,
        publicKey: keyPair.publicKey,
        privateKey: keyPair.privateKey
      });
    }
    
    return prekeys;
  }
}
```

```typescript
// Web implementation using Web Crypto API
export class WebKeyManager {
  async generateIdentityKeyPair(): Promise<IdentityKeyPair> {
    // Ed25519 support via @noble/ed25519
    const privateKey = ed25519.utils.randomPrivateKey();
    const publicKey = await ed25519.getPublicKey(privateKey);
    
    return {
      publicKey: Buffer.from(publicKey),
      privateKey: Buffer.from(privateKey),
      keyId: crypto.randomUUID()
    };
  }
  
  async generateAgreementKeyPair(): Promise<AgreementKeyPair> {
    const keyPair = await crypto.subtle.generateKey(
      {
        name: 'ECDH',
        namedCurve: 'P-256'
      },
      true,
      ['deriveKey', 'deriveBits']
    );
    
    return {
      publicKey: await crypto.subtle.exportKey('raw', keyPair.publicKey),
      privateKey: keyPair.privateKey,
      keyId: crypto.randomUUID()
    };
  }
}
```

### Key Storage

```typescript
// Secure storage abstraction
export interface SecureStorage {
  store(key: string, value: any): Promise<void>;
  retrieve(key: string): Promise<any>;
  remove(key: string): Promise<void>;
}

// React Native implementation
import Keychain from 'react-native-keychain';

export class KeychainStorage implements SecureStorage {
  async store(key: string, value: any): Promise<void> {
    await Keychain.setInternetCredentials(
      'com.dynasty.keys',
      key,
      JSON.stringify(value),
      {
        accessControl: Keychain.ACCESS_CONTROL.BIOMETRY_CURRENT_SET,
        accessible: Keychain.ACCESSIBLE.WHEN_UNLOCKED_THIS_DEVICE_ONLY
      }
    );
  }
  
  async retrieve(key: string): Promise<any> {
    const credentials = await Keychain.getInternetCredentials('com.dynasty.keys');
    if (credentials && credentials.username === key) {
      return JSON.parse(credentials.password);
    }
    return null;
  }
}

// Web implementation with encrypted IndexedDB
export class EncryptedIndexedDBStorage implements SecureStorage {
  private dbName = 'dynasty-keys';
  private storeName = 'keys';
  private encryptionKey: CryptoKey;
  
  async initialize(password: string): Promise<void> {
    // Derive encryption key from password
    const salt = await this.getSalt();
    const keyMaterial = await crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode(password),
      'PBKDF2',
      false,
      ['deriveKey']
    );
    
    this.encryptionKey = await crypto.subtle.deriveKey(
      {
        name: 'PBKDF2',
        salt,
        iterations: 100000,
        hash: 'SHA-256'
      },
      keyMaterial,
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt', 'decrypt']
    );
  }
  
  async store(key: string, value: any): Promise<void> {
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const encrypted = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv },
      this.encryptionKey,
      new TextEncoder().encode(JSON.stringify(value))
    );
    
    // Store in IndexedDB
    const db = await this.openDB();
    const tx = db.transaction([this.storeName], 'readwrite');
    await tx.objectStore(this.storeName).put({
      key,
      iv: Array.from(iv),
      data: Array.from(new Uint8Array(encrypted))
    });
  }
}
```

### Key Rotation

```typescript
export class KeyRotationService {
  private rotationInterval = 30 * 24 * 60 * 60 * 1000; // 30 days
  
  async shouldRotateKeys(lastRotation: Date): boolean {
    return Date.now() - lastRotation.getTime() > this.rotationInterval;
  }
  
  async rotateKeys(userId: string): Promise<void> {
    // Generate new key pairs
    const newIdentityKey = await this.keyManager.generateIdentityKeyPair();
    const newAgreementKey = await this.keyManager.generateAgreementKeyPair();
    
    // Upload new public keys to Firebase
    await this.uploadPublicKeys(userId, {
      identity: newIdentityKey.publicKey,
      agreement: newAgreementKey.publicKey,
      timestamp: Date.now()
    });
    
    // Store new private keys securely
    await this.secureStorage.store(`${userId}_identity`, newIdentityKey.privateKey);
    await this.secureStorage.store(`${userId}_agreement`, newAgreementKey.privateKey);
    
    // Mark old keys for deletion after grace period
    await this.scheduleKeyDeletion(userId, 7); // 7 days grace period
  }
}
```

## Message Encryption

### Session Establishment

```typescript
export class SessionManager {
  async establishSession(
    senderId: string,
    recipientId: string
  ): Promise<Session> {
    // Fetch recipient's public keys
    const recipientBundle = await this.fetchKeyBundle(recipientId);
    
    // Perform X3DH key agreement
    const ephemeralKey = await this.keyManager.generateAgreementKeyPair();
    
    // Calculate shared secrets
    const dh1 = await this.performDH(
      this.identityKey.privateKey,
      recipientBundle.signedPrekey.publicKey
    );
    
    const dh2 = await this.performDH(
      ephemeralKey.privateKey,
      recipientBundle.identityKey.publicKey
    );
    
    const dh3 = await this.performDH(
      ephemeralKey.privateKey,
      recipientBundle.signedPrekey.publicKey
    );
    
    // Derive session key
    const sessionKey = await this.deriveSessionKey([dh1, dh2, dh3]);
    
    return {
      sessionId: crypto.randomUUID(),
      sessionKey,
      recipientId,
      ephemeralPublicKey: ephemeralKey.publicKey
    };
  }
}
```

### Message Encryption/Decryption

```typescript
export class MessageEncryptor {
  async encryptMessage(
    message: string,
    session: Session
  ): Promise<EncryptedMessage> {
    // Generate random IV
    const iv = crypto.getRandomValues(new Uint8Array(12));
    
    // Encrypt message
    const encrypted = await crypto.subtle.encrypt(
      {
        name: 'AES-GCM',
        iv
      },
      session.sessionKey,
      new TextEncoder().encode(message)
    );
    
    // Create message header
    const header = {
      sessionId: session.sessionId,
      messageId: crypto.randomUUID(),
      timestamp: Date.now(),
      ephemeralKey: session.ephemeralPublicKey
    };
    
    return {
      header,
      iv: base64.encode(iv),
      ciphertext: base64.encode(encrypted),
      recipientId: session.recipientId
    };
  }
  
  async decryptMessage(
    encryptedMessage: EncryptedMessage,
    session: Session
  ): Promise<string> {
    const iv = base64.decode(encryptedMessage.iv);
    const ciphertext = base64.decode(encryptedMessage.ciphertext);
    
    const decrypted = await crypto.subtle.decrypt(
      {
        name: 'AES-GCM',
        iv
      },
      session.sessionKey,
      ciphertext
    );
    
    return new TextDecoder().decode(decrypted);
  }
}
```

### Double Ratchet Implementation

```typescript
export class DoubleRatchet {
  private rootKey: CryptoKey;
  private sendingChain: ChainKey;
  private receivingChains: Map<string, ChainKey>;
  
  async ratchetSendingChain(): Promise<void> {
    // Generate new ephemeral key pair
    const newEphemeral = await this.keyManager.generateAgreementKeyPair();
    
    // Perform DH with recipient's public key
    const sharedSecret = await this.performDH(
      newEphemeral.privateKey,
      this.remotePublicKey
    );
    
    // Derive new root and chain keys
    const keys = await this.kdfRootKey(this.rootKey, sharedSecret);
    this.rootKey = keys.rootKey;
    this.sendingChain = keys.chainKey;
    
    // Update ephemeral key
    this.currentEphemeral = newEphemeral;
  }
  
  async deriveMessageKey(chain: ChainKey): Promise<MessageKey> {
    // Derive message key from chain key
    const messageKey = await this.kdfChainKey(chain);
    
    // Advance chain key
    chain.key = await this.advanceChainKey(chain.key);
    chain.index++;
    
    return messageKey;
  }
}
```

## Group Messaging

### Group Key Management

```typescript
export class GroupKeyManager {
  private groupKeys: Map<string, GroupKey> = new Map();
  
  async createGroup(
    groupId: string,
    members: string[]
  ): Promise<GroupKey> {
    // Generate group master key
    const masterKey = await crypto.subtle.generateKey(
      {
        name: 'AES-GCM',
        length: 256
      },
      true,
      ['encrypt', 'decrypt']
    );
    
    // Create member keys using key encapsulation
    const memberKeys = await Promise.all(
      members.map(async (memberId) => {
        const memberPublicKey = await this.fetchPublicKey(memberId);
        const encapsulated = await this.encapsulateKey(
          masterKey,
          memberPublicKey
        );
        
        return {
          memberId,
          encapsulatedKey: encapsulated
        };
      })
    );
    
    const groupKey: GroupKey = {
      groupId,
      masterKey,
      memberKeys,
      epoch: 0,
      createdAt: Date.now()
    };
    
    this.groupKeys.set(groupId, groupKey);
    return groupKey;
  }
  
  async addMember(
    groupId: string,
    newMemberId: string
  ): Promise<void> {
    const groupKey = this.groupKeys.get(groupId);
    if (!groupKey) throw new Error('Group not found');
    
    // Increment epoch to ensure forward secrecy
    groupKey.epoch++;
    
    // Generate new group key
    const newMasterKey = await this.deriveNewGroupKey(
      groupKey.masterKey,
      groupKey.epoch
    );
    
    // Re-encapsulate for all members including new one
    const members = [...groupKey.memberKeys.map(m => m.memberId), newMemberId];
    groupKey.memberKeys = await this.encapsulateForMembers(
      newMasterKey,
      members
    );
    
    groupKey.masterKey = newMasterKey;
  }
  
  async removeMember(
    groupId: string,
    memberId: string
  ): Promise<void> {
    const groupKey = this.groupKeys.get(groupId);
    if (!groupKey) throw new Error('Group not found');
    
    // Increment epoch
    groupKey.epoch++;
    
    // Generate new group key (post-compromise security)
    const newMasterKey = await this.deriveNewGroupKey(
      groupKey.masterKey,
      groupKey.epoch
    );
    
    // Remove member and re-encapsulate for remaining members
    groupKey.memberKeys = groupKey.memberKeys.filter(
      m => m.memberId !== memberId
    );
    
    const remainingMembers = groupKey.memberKeys.map(m => m.memberId);
    groupKey.memberKeys = await this.encapsulateForMembers(
      newMasterKey,
      remainingMembers
    );
    
    groupKey.masterKey = newMasterKey;
  }
}
```

### Sender Keys (for large groups)

```typescript
export class SenderKeyService {
  async distributeSenderKey(
    groupId: string,
    members: string[]
  ): Promise<void> {
    // Generate sender key
    const senderKey = await crypto.subtle.generateKey(
      {
        name: 'AES-GCM',
        length: 256
      },
      true,
      ['encrypt', 'decrypt']
    );
    
    // Distribute to each member via established sessions
    await Promise.all(
      members.map(async (memberId) => {
        const session = await this.sessionManager.getSession(memberId);
        const encryptedKey = await this.encryptForSession(
          senderKey,
          session
        );
        
        await this.sendSenderKey(groupId, memberId, encryptedKey);
      })
    );
  }
  
  async encryptGroupMessage(
    message: string,
    groupId: string,
    senderKey: CryptoKey
  ): Promise<EncryptedGroupMessage> {
    const iv = crypto.getRandomValues(new Uint8Array(12));
    
    const encrypted = await crypto.subtle.encrypt(
      {
        name: 'AES-GCM',
        iv
      },
      senderKey,
      new TextEncoder().encode(message)
    );
    
    return {
      groupId,
      senderId: this.userId,
      iv: base64.encode(iv),
      ciphertext: base64.encode(encrypted),
      senderKeyId: await this.getSenderKeyId(senderKey),
      timestamp: Date.now()
    };
  }
}
```

## Media Encryption

### File Encryption

```typescript
export class MediaEncryptor {
  private chunkSize = 64 * 1024; // 64KB chunks
  
  async encryptFile(
    file: File | Blob,
    key?: CryptoKey
  ): Promise<EncryptedFile> {
    // Generate file key if not provided
    const fileKey = key || await crypto.subtle.generateKey(
      {
        name: 'AES-GCM',
        length: 256
      },
      true,
      ['encrypt', 'decrypt']
    );
    
    // Generate random IV
    const iv = crypto.getRandomValues(new Uint8Array(12));
    
    // Encrypt file metadata
    const metadata = {
      filename: file.name || 'unnamed',
      size: file.size,
      type: file.type,
      lastModified: file.lastModified
    };
    
    const encryptedMetadata = await this.encryptMetadata(metadata, fileKey, iv);
    
    // Encrypt file content in chunks
    const chunks: ArrayBuffer[] = [];
    const reader = file.stream().getReader();
    
    let counter = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      
      // Use counter mode for chunk encryption
      const chunkIv = this.incrementIv(iv, counter);
      const encryptedChunk = await crypto.subtle.encrypt(
        {
          name: 'AES-GCM',
          iv: chunkIv
        },
        fileKey,
        value
      );
      
      chunks.push(encryptedChunk);
      counter++;
    }
    
    return {
      metadata: encryptedMetadata,
      chunks,
      iv: base64.encode(iv),
      keyId: await this.storeFileKey(fileKey)
    };
  }
  
  async decryptFile(
    encryptedFile: EncryptedFile,
    key: CryptoKey
  ): Promise<Blob> {
    const iv = base64.decode(encryptedFile.iv);
    
    // Decrypt metadata
    const metadata = await this.decryptMetadata(
      encryptedFile.metadata,
      key,
      iv
    );
    
    // Decrypt chunks
    const decryptedChunks: ArrayBuffer[] = [];
    
    for (let i = 0; i < encryptedFile.chunks.length; i++) {
      const chunkIv = this.incrementIv(iv, i);
      const decryptedChunk = await crypto.subtle.decrypt(
        {
          name: 'AES-GCM',
          iv: chunkIv
        },
        key,
        encryptedFile.chunks[i]
      );
      
      decryptedChunks.push(decryptedChunk);
    }
    
    // Combine chunks into blob
    return new Blob(decryptedChunks, { type: metadata.type });
  }
  
  private incrementIv(iv: Uint8Array, counter: number): Uint8Array {
    const newIv = new Uint8Array(iv);
    // Increment last 4 bytes as counter
    const view = new DataView(newIv.buffer);
    const currentCounter = view.getUint32(8, false);
    view.setUint32(8, currentCounter + counter, false);
    return newIv;
  }
}
```

### Thumbnail Generation

```typescript
export class SecureThumbnailService {
  async generateEncryptedThumbnail(
    image: Blob,
    maxSize: number = 200
  ): Promise<EncryptedThumbnail> {
    // Generate thumbnail
    const thumbnail = await this.resizeImage(image, maxSize);
    
    // Generate thumbnail key derived from file key
    const thumbnailKey = await this.deriveThumbnailKey(fileKey);
    
    // Encrypt thumbnail
    const encryptedThumbnail = await this.mediaEncryptor.encryptFile(
      thumbnail,
      thumbnailKey
    );
    
    return {
      encrypted: encryptedThumbnail,
      dimensions: {
        width: thumbnail.width,
        height: thumbnail.height
      }
    };
  }
  
  private async resizeImage(
    image: Blob,
    maxSize: number
  ): Promise<Blob> {
    return new Promise((resolve) => {
      const img = new Image();
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d')!;
      
      img.onload = () => {
        const scale = Math.min(maxSize / img.width, maxSize / img.height);
        canvas.width = img.width * scale;
        canvas.height = img.height * scale;
        
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        
        canvas.toBlob((blob) => {
          resolve(blob!);
        }, 'image/jpeg', 0.8);
      };
      
      img.src = URL.createObjectURL(image);
    });
  }
}
```

## Cross-Platform Implementation

### Abstraction Layer

```typescript
// Common encryption interface
export interface EncryptionService {
  generateKeyPair(): Promise<KeyPair>;
  encrypt(data: string, key: CryptoKey): Promise<EncryptedData>;
  decrypt(encrypted: EncryptedData, key: CryptoKey): Promise<string>;
  deriveSharedSecret(privateKey: CryptoKey, publicKey: CryptoKey): Promise<CryptoKey>;
}

// Platform-specific implementations
export class NativeEncryptionService implements EncryptionService {
  // React Native implementation using react-native-quick-crypto
}

export class WebEncryptionService implements EncryptionService {
  // Web implementation using Web Crypto API
}

// Factory pattern for platform selection
export function createEncryptionService(): EncryptionService {
  if (typeof window !== 'undefined' && window.crypto?.subtle) {
    return new WebEncryptionService();
  } else {
    return new NativeEncryptionService();
  }
}
```

### Compatibility Layer

```typescript
// Ensure compatible data formats across platforms
export class CryptoCompatibility {
  // Convert between platform-specific key formats
  static async exportKey(key: CryptoKey): Promise<JsonWebKey> {
    if (isWebCrypto(key)) {
      return await crypto.subtle.exportKey('jwk', key);
    } else {
      // React Native conversion
      return convertToJWK(key);
    }
  }
  
  static async importKey(jwk: JsonWebKey): Promise<CryptoKey> {
    if (isWebPlatform()) {
      return await crypto.subtle.importKey(
        'jwk',
        jwk,
        { name: 'AES-GCM' },
        false,
        ['encrypt', 'decrypt']
      );
    } else {
      // React Native import
      return importFromJWK(jwk);
    }
  }
  
  // Ensure consistent encoding
  static encode(data: ArrayBuffer): string {
    return base64.encode(new Uint8Array(data));
  }
  
  static decode(encoded: string): ArrayBuffer {
    return base64.decode(encoded).buffer;
  }
}
```

## Security Considerations

### Threat Model

1. **Server Compromise**: Even if Dynasty servers are compromised, user data remains encrypted
2. **Man-in-the-Middle**: Public key verification prevents MITM attacks
3. **Device Compromise**: Limited impact due to forward secrecy
4. **Metadata Analysis**: Minimize metadata exposure where possible

### Security Measures

```typescript
export class SecurityService {
  // Verify message authenticity
  async verifyMessage(
    message: EncryptedMessage,
    senderPublicKey: CryptoKey
  ): Promise<boolean> {
    const signature = base64.decode(message.signature);
    const data = new TextEncoder().encode(
      message.header.messageId + message.ciphertext
    );
    
    return await crypto.subtle.verify(
      'Ed25519',
      senderPublicKey,
      signature,
      data
    );
  }
  
  // Key fingerprint for out-of-band verification
  async generateFingerprint(publicKey: CryptoKey): Promise<string> {
    const exported = await crypto.subtle.exportKey('raw', publicKey);
    const hash = await crypto.subtle.digest('SHA-256', exported);
    
    // Format as readable fingerprint
    const bytes = new Uint8Array(hash);
    return Array.from(bytes)
      .map(b => b.toString(16).padStart(2, '0'))
      .join(' ')
      .match(/.{1,4}/g)!
      .join(' ')
      .toUpperCase();
  }
  
  // Constant-time comparison to prevent timing attacks
  constantTimeEqual(a: Uint8Array, b: Uint8Array): boolean {
    if (a.length !== b.length) return false;
    
    let result = 0;
    for (let i = 0; i < a.length; i++) {
      result |= a[i] ^ b[i];
    }
    
    return result === 0;
  }
}
```

### Key Backup and Recovery

```typescript
export class KeyBackupService {
  async createBackup(
    keys: KeyBundle,
    recoveryPassword: string
  ): Promise<EncryptedBackup> {
    // Derive backup key from recovery password
    const salt = crypto.getRandomValues(new Uint8Array(32));
    const backupKey = await this.deriveBackupKey(recoveryPassword, salt);
    
    // Encrypt keys
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const encrypted = await crypto.subtle.encrypt(
      {
        name: 'AES-GCM',
        iv
      },
      backupKey,
      new TextEncoder().encode(JSON.stringify(keys))
    );
    
    return {
      version: 1,
      salt: base64.encode(salt),
      iv: base64.encode(iv),
      data: base64.encode(encrypted),
      createdAt: Date.now()
    };
  }
  
  private async deriveBackupKey(
    password: string,
    salt: Uint8Array
  ): Promise<CryptoKey> {
    const encoder = new TextEncoder();
    const keyMaterial = await crypto.subtle.importKey(
      'raw',
      encoder.encode(password),
      'PBKDF2',
      false,
      ['deriveKey']
    );
    
    return await crypto.subtle.deriveKey(
      {
        name: 'PBKDF2',
        salt,
        iterations: 600000, // OWASP recommendation for PBKDF2-SHA256
        hash: 'SHA-256'
      },
      keyMaterial,
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt', 'decrypt']
    );
  }
}
```

## Testing

### Unit Tests

```typescript
describe('EncryptionService', () => {
  let service: EncryptionService;
  
  beforeEach(() => {
    service = createEncryptionService();
  });
  
  test('should generate valid key pairs', async () => {
    const keyPair = await service.generateKeyPair();
    
    expect(keyPair.publicKey).toBeDefined();
    expect(keyPair.privateKey).toBeDefined();
  });
  
  test('should encrypt and decrypt messages', async () => {
    const message = 'Hello, Dynasty!';
    const key = await service.generateSymmetricKey();
    
    const encrypted = await service.encrypt(message, key);
    const decrypted = await service.decrypt(encrypted, key);
    
    expect(decrypted).toBe(message);
  });
  
  test('should establish shared secret', async () => {
    const alice = await service.generateKeyPair();
    const bob = await service.generateKeyPair();
    
    const aliceShared = await service.deriveSharedSecret(
      alice.privateKey,
      bob.publicKey
    );
    
    const bobShared = await service.deriveSharedSecret(
      bob.privateKey,
      alice.publicKey
    );
    
    // Shared secrets should be identical
    expect(aliceShared).toEqual(bobShared);
  });
  
  test('should handle group key rotation', async () => {
    const groupManager = new GroupKeyManager();
    const members = ['user1', 'user2', 'user3'];
    
    const groupKey = await groupManager.createGroup('group1', members);
    const initialEpoch = groupKey.epoch;
    
    await groupManager.addMember('group1', 'user4');
    const updatedKey = groupManager.getGroupKey('group1');
    
    expect(updatedKey.epoch).toBe(initialEpoch + 1);
    expect(updatedKey.memberKeys).toHaveLength(4);
  });
});
```

### Integration Tests

```typescript
describe('E2E Messaging Flow', () => {
  test('complete message flow between users', async () => {
    // Setup users
    const alice = await createUser('alice');
    const bob = await createUser('bob');
    
    // Alice sends message to Bob
    const message = 'Secret message';
    const encrypted = await alice.sendMessage(bob.userId, message);
    
    // Verify encrypted in transit
    expect(encrypted.ciphertext).not.toContain(message);
    
    // Bob receives and decrypts
    const decrypted = await bob.receiveMessage(encrypted);
    expect(decrypted.content).toBe(message);
    expect(decrypted.senderId).toBe(alice.userId);
  });
  
  test('group messaging with member changes', async () => {
    const group = await createGroup(['alice', 'bob', 'charlie']);
    
    // Send initial message
    await alice.sendGroupMessage(group.id, 'Hello group!');
    
    // Add new member
    await group.addMember('david');
    
    // New member should not decrypt old messages
    const oldMessages = await david.getGroupMessages(group.id);
    expect(oldMessages[0].decrypted).toBe(false);
    
    // But should decrypt new messages
    await bob.sendGroupMessage(group.id, 'Welcome David!');
    const newMessages = await david.getGroupMessages(group.id);
    expect(newMessages[0].content).toBe('Welcome David!');
  });
});
```

### Security Tests

```typescript
describe('Security Tests', () => {
  test('should prevent replay attacks', async () => {
    const message = await alice.sendMessage(bob.userId, 'Test');
    
    // Attempt replay
    await expect(
      bob.receiveMessage(message)
    ).rejects.toThrow('Message already processed');
  });
  
  test('should detect tampered messages', async () => {
    const encrypted = await alice.sendMessage(bob.userId, 'Original');
    
    // Tamper with ciphertext
    encrypted.ciphertext = encrypted.ciphertext.replace('A', 'B');
    
    await expect(
      bob.receiveMessage(encrypted)
    ).rejects.toThrow('Authentication failed');
  });
  
  test('should maintain forward secrecy', async () => {
    // Send messages
    const msg1 = await alice.sendMessage(bob.userId, 'Message 1');
    const msg2 = await alice.sendMessage(bob.userId, 'Message 2');
    
    // Compromise current key
    const compromisedKey = await alice.exportCurrentKey();
    
    // Old messages should not be decryptable with current key
    await expect(
      decryptWithKey(msg1, compromisedKey)
    ).rejects.toThrow();
  });
});
```

## Performance Optimization

### Key Caching

```typescript
export class KeyCache {
  private cache: LRUCache<string, CryptoKey>;
  private readonly maxAge = 3600000; // 1 hour
  
  constructor(maxSize: number = 100) {
    this.cache = new LRUCache({ max: maxSize, ttl: this.maxAge });
  }
  
  async getOrDerive(
    keyId: string,
    deriver: () => Promise<CryptoKey>
  ): Promise<CryptoKey> {
    const cached = this.cache.get(keyId);
    if (cached) return cached;
    
    const key = await deriver();
    this.cache.set(keyId, key);
    return key;
  }
}
```

### Batch Operations

```typescript
export class BatchEncryptor {
  async encryptBatch(
    messages: string[],
    recipients: string[]
  ): Promise<EncryptedMessage[]> {
    // Pre-fetch all recipient keys
    const recipientKeys = await Promise.all(
      recipients.map(id => this.keyManager.getPublicKey(id))
    );
    
    // Encrypt in parallel with limited concurrency
    const limit = pLimit(10); // Max 10 concurrent operations
    
    return Promise.all(
      messages.map((message, i) =>
        limit(() => this.encrypt(message, recipientKeys[i]))
      )
    );
  }
}
```

### Background Processing

```typescript
export class BackgroundCrypto {
  private worker: Worker;
  
  constructor() {
    this.worker = new Worker('/crypto-worker.js');
  }
  
  async offloadEncryption(
    data: ArrayBuffer,
    key: CryptoKey
  ): Promise<ArrayBuffer> {
    return new Promise((resolve, reject) => {
      const id = crypto.randomUUID();
      
      this.worker.postMessage({
        id,
        operation: 'encrypt',
        data,
        key: await crypto.subtle.exportKey('jwk', key)
      });
      
      this.worker.onmessage = (event) => {
        if (event.data.id === id) {
          if (event.data.error) {
            reject(new Error(event.data.error));
          } else {
            resolve(event.data.result);
          }
        }
      };
    });
  }
}
```

## Migration Strategy

### Phase 1: Preparation
1. Deploy encryption infrastructure
2. Generate keys for existing users
3. Test encryption/decryption flow

### Phase 2: Gradual Rollout
1. Enable E2EE for new conversations
2. Provide opt-in for existing conversations
3. Monitor performance and issues

### Phase 3: Full Migration
1. Encrypt existing messages in background
2. Enable E2EE by default
3. Deprecate unencrypted messaging

### Backwards Compatibility

```typescript
export class MigrationService {
  async handleMessage(message: any): Promise<ProcessedMessage> {
    // Check if message is encrypted
    if (message.version && message.version >= 2) {
      // Handle encrypted message
      return await this.decryptMessage(message);
    } else {
      // Handle legacy unencrypted message
      console.warn('Processing unencrypted legacy message');
      return {
        content: message.content,
        isEncrypted: false,
        senderId: message.senderId
      };
    }
  }
  
  async migrateConversation(conversationId: string): Promise<void> {
    const messages = await this.fetchMessages(conversationId);
    
    for (const message of messages) {
      if (!message.isEncrypted) {
        // Encrypt and update
        const encrypted = await this.encryptForMigration(message);
        await this.updateMessage(message.id, encrypted);
      }
    }
  }
}
```

## Conclusion

This encryption implementation provides Dynasty with a robust, cross-platform E2EE system that ensures user privacy while maintaining performance and usability. The system is designed to be:

- **Secure**: Using modern cryptographic primitives and best practices
- **Scalable**: Efficient for both small and large group communications
- **Cross-platform**: Seamless operation across React Native and web
- **Future-proof**: Extensible architecture for new features and improvements

Regular security audits and updates will ensure the system remains secure against evolving threats.