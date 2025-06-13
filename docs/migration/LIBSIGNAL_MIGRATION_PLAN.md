# Dynasty App libsignal Migration Plan

## Executive Summary

This document outlines the comprehensive plan for migrating Dynasty's custom E2E encryption implementation to libsignal (Signal Protocol). The migration will enhance security, add new features, and ensure compliance with industry standards for end-to-end encryption.

### Key Benefits
- **Security**: Eliminate current cryptographic vulnerabilities
- **Features**: Gain sealed sender, proper group messaging, multi-device support
- **Performance**: Native Rust implementation with hardware acceleration
- **Trust**: Leverage Signal Protocol's proven track record

### Timeline
- **Total Duration**: 10-12 weeks
- **Team Size**: 3 developers (2 senior, 1 mid-level)
- **Rollout Strategy**: Phased migration with backward compatibility

## Current State Analysis

### Existing Encryption Stack
```
├── E2EEService.ts (Basic ECDH + AES-256-GCM)
├── DoubleRatchetService.ts (Custom ratcheting)
├── GroupE2EEService.ts (Basic sender keys)
├── ChatEncryptionService.ts (Orchestration)
├── MediaEncryptionService.ts (File encryption)
└── KeyBackupService.ts (Key management)
```

### Critical Issues to Address
1. **Improper key generation** - Using random bytes instead of EC keys
2. **No prekey infrastructure** - Can't receive offline messages
3. **Weak Double Ratchet** - Missing forward secrecy guarantees
4. **No proper signatures** - Using HMAC instead of Ed25519
5. **Limited group messaging** - Basic implementation without epochs

## Migration Architecture

### Target Architecture
```
┌─────────────────────────────────────────────────┐
│                  Dynasty App                     │
├─────────────────────────────────────────────────┤
│          ChatEncryptionService (Modified)        │
├─────────────────────────────────────────────────┤
│              LibsignalBridge (New)              │
├─────────────────────────────────────────────────┤
│    React Native libsignal Module (New)          │
├─────────────────────────────────────────────────┤
│         @signalapp/libsignal-client             │
└─────────────────────────────────────────────────┘
```

### Component Mapping
| Current Component | libsignal Replacement | Migration Complexity |
|------------------|----------------------|---------------------|
| E2EEService | SessionCipher | High |
| DoubleRatchetService | Built-in ratcheting | Medium |
| GroupE2EEService | GroupCipher | High |
| Key Storage | ProtocolStore | High |
| MediaEncryptionService | Keep (use libsignal crypto) | Low |

## Phase 1: Foundation (Weeks 1-3)

### Week 1: Protocol Store Implementation

#### 1.1 Create Signal Protocol Store
```typescript
// src/services/encryption/libsignal/SignalProtocolStore.ts
import { 
  ProtocolStore, 
  ProtocolAddress, 
  PublicKey,
  PrivateKey,
  IdentityKeyPair,
  PreKeyRecord,
  SignedPreKeyRecord,
  SessionRecord,
  SenderKeyRecord 
} from '@signalapp/libsignal-client';

export class SignalProtocolStore implements ProtocolStore {
  // Identity Key Storage
  async getIdentityKeyPair(): Promise<IdentityKeyPair> { }
  async getLocalRegistrationId(): Promise<number> { }
  async saveIdentity(address: ProtocolAddress, key: PublicKey): Promise<boolean> { }
  async isTrustedIdentity(address: ProtocolAddress, key: PublicKey): Promise<boolean> { }
  
  // PreKey Storage
  async loadPreKey(id: number): Promise<PreKeyRecord | undefined> { }
  async storePreKey(id: number, record: PreKeyRecord): Promise<void> { }
  async removePreKey(id: number): Promise<void> { }
  
  // Signed PreKey Storage
  async loadSignedPreKey(id: number): Promise<SignedPreKeyRecord | undefined> { }
  async storeSignedPreKey(id: number, record: SignedPreKeyRecord): Promise<void> { }
  
  // Session Storage
  async loadSession(address: ProtocolAddress): Promise<SessionRecord | undefined> { }
  async storeSession(address: ProtocolAddress, record: SessionRecord): Promise<void> { }
  
  // Sender Key Storage (Groups)
  async loadSenderKey(sender: ProtocolAddress, distributionId: string): Promise<SenderKeyRecord | undefined> { }
  async storeSenderKey(sender: ProtocolAddress, distributionId: string, record: SenderKeyRecord): Promise<void> { }
}
```

#### 1.2 Secure Storage Backend
```typescript
// src/services/encryption/libsignal/SecureStorageAdapter.ts
import AsyncStorage from '@react-native-async-storage/async-storage';
import { encrypt, decrypt } from '../KeychainService';

export class SecureStorageAdapter {
  private readonly keyPrefix = 'signal_protocol_';
  
  async store(key: string, value: any): Promise<void> {
    const encrypted = await encrypt(JSON.stringify(value));
    await AsyncStorage.setItem(`${this.keyPrefix}${key}`, encrypted);
  }
  
  async load(key: string): Promise<any | undefined> {
    const encrypted = await AsyncStorage.getItem(`${this.keyPrefix}${key}`);
    if (!encrypted) return undefined;
    
    const decrypted = await decrypt(encrypted);
    return JSON.parse(decrypted);
  }
  
  async remove(key: string): Promise<void> {
    await AsyncStorage.removeItem(`${this.keyPrefix}${key}`);
  }
}
```

### Week 2: React Native Bridge

#### 2.1 Native Module Structure
```typescript
// src/services/encryption/libsignal/LibsignalBridge.ts
import {
  PreKeyBundle,
  processPreKeyBundle,
  signalEncrypt,
  signalDecrypt,
  generateIdentityKeyPair,
  generatePreKey,
  generateSignedPreKey,
  generateRegistrationId
} from '@signalapp/libsignal-client';

export class LibsignalBridge {
  private store: SignalProtocolStore;
  
  constructor(store: SignalProtocolStore) {
    this.store = store;
  }
  
  // Key Generation
  async initializeIdentity(): Promise<void> {
    const identityKeyPair = generateIdentityKeyPair();
    const registrationId = generateRegistrationId();
    
    await this.store.storeIdentityKeyPair(identityKeyPair);
    await this.store.storeLocalRegistrationId(registrationId);
  }
  
  async generatePreKeys(start: number, count: number): Promise<void> {
    for (let i = 0; i < count; i++) {
      const keyId = start + i;
      const preKey = generatePreKey(keyId);
      await this.store.storePreKey(keyId, preKey);
    }
  }
  
  // Session Management
  async createSession(
    remoteAddress: ProtocolAddress, 
    bundle: PreKeyBundle
  ): Promise<void> {
    await processPreKeyBundle(
      bundle,
      remoteAddress,
      await this.store.getSessionRecord(remoteAddress),
      await this.store.getIdentityKeyPair(),
      this.store
    );
  }
  
  // Message Encryption/Decryption
  async encryptMessage(
    remoteAddress: ProtocolAddress,
    message: Uint8Array
  ): Promise<CiphertextMessage> {
    return await signalEncrypt(
      message,
      remoteAddress,
      await this.store.getSessionRecord(remoteAddress),
      await this.store.getIdentityKeyPair(),
      this.store
    );
  }
  
  async decryptMessage(
    remoteAddress: ProtocolAddress,
    ciphertext: CiphertextMessage
  ): Promise<Uint8Array> {
    return await signalDecrypt(
      ciphertext,
      remoteAddress,
      await this.store.getSessionRecord(remoteAddress),
      await this.store.getIdentityKeyPair(),
      this.store
    );
  }
}
```

### Week 3: Firebase Integration

#### 3.1 Firestore Schema Updates
```typescript
// Update collections for Signal Protocol

// users/{userId}/devices/{deviceId}
interface DeviceDocument {
  deviceId: number;
  identityKey: string; // Base64 encoded public key
  signedPreKey: {
    keyId: number;
    publicKey: string;
    signature: string;
  };
  preKeys: Array<{
    keyId: number;
    publicKey: string;
  }>;
  registrationId: number;
  createdAt: Timestamp;
  lastSeenAt: Timestamp;
}

// users/{userId}/conversations/{conversationId}
interface ConversationDocument {
  participants: string[];
  type: 'individual' | 'group';
  lastMessage: {
    timestamp: Timestamp;
    senderId: string;
    preview: string; // Encrypted
  };
  sessionData: {
    [deviceId: string]: string; // Encrypted session state
  };
}
```

#### 3.2 Key Distribution Service
```typescript
// src/services/encryption/libsignal/KeyDistributionService.ts
export class KeyDistributionService {
  async publishKeys(userId: string, deviceId: number): Promise<void> {
    const identityKeyPair = await this.store.getIdentityKeyPair();
    const signedPreKey = await this.generateSignedPreKey();
    const preKeys = await this.generateOneTimePreKeys(100);
    
    await firestore
      .collection('users')
      .doc(userId)
      .collection('devices')
      .doc(deviceId.toString())
      .set({
        deviceId,
        identityKey: identityKeyPair.publicKey.serialize().toString('base64'),
        signedPreKey: {
          keyId: signedPreKey.id,
          publicKey: signedPreKey.publicKey.serialize().toString('base64'),
          signature: signedPreKey.signature.toString('base64')
        },
        preKeys: preKeys.map(pk => ({
          keyId: pk.id,
          publicKey: pk.publicKey.serialize().toString('base64')
        })),
        registrationId: await this.store.getLocalRegistrationId(),
        createdAt: serverTimestamp(),
        lastSeenAt: serverTimestamp()
      });
  }
  
  async fetchPreKeyBundle(userId: string, deviceId: number): Promise<PreKeyBundle> {
    const deviceDoc = await firestore
      .collection('users')
      .doc(userId)
      .collection('devices')
      .doc(deviceId.toString())
      .get();
      
    const data = deviceDoc.data();
    
    // Fetch and consume one prekey
    const preKey = data.preKeys.shift();
    
    // Update remaining prekeys
    await deviceDoc.ref.update({
      preKeys: data.preKeys
    });
    
    return new PreKeyBundle(
      data.registrationId,
      deviceId,
      preKey?.keyId,
      preKey ? PublicKey.deserialize(Buffer.from(preKey.publicKey, 'base64')) : undefined,
      data.signedPreKey.keyId,
      PublicKey.deserialize(Buffer.from(data.signedPreKey.publicKey, 'base64')),
      Buffer.from(data.signedPreKey.signature, 'base64'),
      PublicKey.deserialize(Buffer.from(data.identityKey, 'base64'))
    );
  }
}
```

## Phase 2: Core Migration (Weeks 4-7)

### Week 4: Message Encryption Migration

#### 4.1 Create Compatibility Layer
```typescript
// src/services/encryption/libsignal/MessageCompatibilityService.ts
export class MessageCompatibilityService {
  async encryptMessage(
    conversationId: string,
    message: any,
    recipientId: string
  ): Promise<EncryptedMessage> {
    // Check if recipient supports Signal Protocol
    const recipientCapabilities = await this.getRecipientCapabilities(recipientId);
    
    if (recipientCapabilities.supportsSignalProtocol) {
      // Use libsignal
      return await this.libsignalBridge.encryptMessage(
        new ProtocolAddress(recipientId, recipientCapabilities.deviceId),
        Buffer.from(JSON.stringify(message))
      );
    } else {
      // Fall back to legacy encryption
      return await this.legacyEncryption.encryptMessage(message, recipientId);
    }
  }
  
  async decryptMessage(
    encryptedMessage: EncryptedMessage,
    senderId: string
  ): Promise<any> {
    if (encryptedMessage.protocolVersion === 'signal_v1') {
      const plaintext = await this.libsignalBridge.decryptMessage(
        new ProtocolAddress(senderId, encryptedMessage.deviceId),
        encryptedMessage.ciphertext
      );
      return JSON.parse(plaintext.toString());
    } else {
      // Legacy decryption
      return await this.legacyEncryption.decryptMessage(encryptedMessage, senderId);
    }
  }
}
```

#### 4.2 Update ChatEncryptionService
```typescript
// src/services/encryption/ChatEncryptionService.ts
export class ChatEncryptionService {
  private compatibilityService: MessageCompatibilityService;
  
  async sendMessage(
    conversationId: string,
    content: any,
    recipientIds: string[]
  ): Promise<void> {
    // Encrypt for each recipient
    const encryptedMessages = await Promise.all(
      recipientIds.map(async (recipientId) => {
        const devices = await this.getRecipientDevices(recipientId);
        
        return Promise.all(
          devices.map(async (device) => {
            const encrypted = await this.compatibilityService.encryptMessage(
              conversationId,
              content,
              recipientId,
              device.id
            );
            
            return {
              recipientId,
              deviceId: device.id,
              encrypted
            };
          })
        );
      })
    );
    
    // Store encrypted messages in Firestore
    await this.storeEncryptedMessages(conversationId, encryptedMessages.flat());
  }
}
```

### Week 5: Group Messaging Migration

#### 5.1 Implement Sender Key Distribution
```typescript
// src/services/encryption/libsignal/GroupEncryptionService.ts
export class GroupEncryptionService {
  async createGroup(groupId: string, memberIds: string[]): Promise<void> {
    // Generate sender key for this device
    const senderKeyDistributionMessage = await this.createSenderKeyDistributionMessage(groupId);
    
    // Distribute to all members
    await Promise.all(
      memberIds.map(async (memberId) => {
        if (memberId === this.currentUserId) return;
        
        // Send via 1-on-1 encrypted channel
        await this.sendSenderKeyDistribution(
          memberId,
          groupId,
          senderKeyDistributionMessage
        );
      })
    );
  }
  
  async encryptGroupMessage(
    groupId: string,
    message: any
  ): Promise<EncryptedGroupMessage> {
    const groupCipher = new GroupCipher(
      new SenderKeyName(groupId, this.currentUserId, this.deviceId),
      this.store
    );
    
    const encrypted = await groupCipher.encrypt(
      Buffer.from(JSON.stringify(message))
    );
    
    return {
      groupId,
      senderId: this.currentUserId,
      deviceId: this.deviceId,
      ciphertext: encrypted.serialize().toString('base64'),
      timestamp: Date.now()
    };
  }
}
```

### Week 6: Multi-Device Support

#### 6.1 Device Management
```typescript
// src/services/encryption/libsignal/DeviceManagementService.ts
export class DeviceManagementService {
  async linkNewDevice(verificationCode: string): Promise<void> {
    // Generate device-specific keys
    const deviceKeyPair = generateIdentityKeyPair();
    const deviceId = generateRegistrationId();
    
    // Link with primary device
    const linkData = await this.createDeviceLinkData(
      deviceKeyPair,
      deviceId,
      verificationCode
    );
    
    // Upload to server
    await this.publishDeviceKeys(deviceId, deviceKeyPair);
    
    // Sync existing sessions
    await this.syncSessionsToDevice(deviceId);
  }
  
  async syncSessionsToDevice(targetDeviceId: number): Promise<void> {
    const sessions = await this.store.getAllSessions();
    
    for (const [address, session] of sessions) {
      // Encrypt session for target device
      const encryptedSession = await this.encryptForDevice(
        targetDeviceId,
        session.serialize()
      );
      
      // Store in sync queue
      await this.queueSessionSync(targetDeviceId, address, encryptedSession);
    }
  }
}
```

### Week 7: Testing & Quality Assurance

#### 7.1 Test Suite
```typescript
// src/__tests__/libsignal/SignalProtocolIntegration.test.ts
describe('Signal Protocol Integration', () => {
  describe('Basic Messaging', () => {
    it('should establish session and exchange messages', async () => {
      // Setup two users
      const alice = await createTestUser('alice');
      const bob = await createTestUser('bob');
      
      // Alice fetches Bob's prekey bundle
      const bobBundle = await alice.fetchPreKeyBundle(bob.userId, bob.deviceId);
      
      // Alice creates session
      await alice.createSession(bob.address, bobBundle);
      
      // Alice sends message
      const message = 'Hello Bob!';
      const encrypted = await alice.encryptMessage(bob.address, message);
      
      // Bob receives and decrypts
      const decrypted = await bob.decryptMessage(alice.address, encrypted);
      expect(decrypted).toBe(message);
    });
  });
  
  describe('Group Messaging', () => {
    it('should handle group encryption/decryption', async () => {
      const members = await Promise.all([
        createTestUser('alice'),
        createTestUser('bob'),
        createTestUser('charlie')
      ]);
      
      // Create group
      const groupId = 'test-group';
      await members[0].createGroup(groupId, members.map(m => m.userId));
      
      // Send group message
      const message = 'Hello group!';
      const encrypted = await members[0].encryptGroupMessage(groupId, message);
      
      // All members decrypt
      for (const member of members.slice(1)) {
        const decrypted = await member.decryptGroupMessage(encrypted);
        expect(decrypted).toBe(message);
      }
    });
  });
});
```

## Phase 3: Rollout (Weeks 8-10)

### Week 8: Feature Flag Implementation

#### 8.1 Progressive Rollout System
```typescript
// src/services/FeatureFlagService.ts
export class FeatureFlagService {
  async isSignalProtocolEnabled(userId: string): Promise<boolean> {
    // Check rollout percentage
    const rolloutConfig = await this.getRolloutConfig();
    
    // Check if user is in test group
    if (rolloutConfig.testUsers.includes(userId)) {
      return true;
    }
    
    // Check percentage rollout
    const userHash = this.hashUserId(userId);
    return userHash < rolloutConfig.percentage;
  }
  
  async enableSignalProtocol(userId: string): Promise<void> {
    // Initialize Signal Protocol for user
    await this.libsignalService.initializeForUser(userId);
    
    // Migrate existing conversations
    await this.migrationService.migrateUserConversations(userId);
    
    // Update user capabilities
    await firestore.collection('users').doc(userId).update({
      capabilities: {
        signalProtocol: true,
        protocolVersion: 'signal_v1'
      }
    });
  }
}
```

### Week 9: Migration Tools

#### 9.1 Conversation Migration
```typescript
// src/services/encryption/libsignal/ConversationMigrationService.ts
export class ConversationMigrationService {
  async migrateConversation(conversationId: string): Promise<void> {
    // Get conversation participants
    const conversation = await this.getConversation(conversationId);
    
    // For each participant, establish Signal session
    for (const participantId of conversation.participants) {
      if (participantId === this.currentUserId) continue;
      
      try {
        // Fetch prekey bundle
        const bundle = await this.keyDistributionService.fetchPreKeyBundle(
          participantId,
          await this.getDefaultDeviceId(participantId)
        );
        
        // Create session
        await this.libsignalBridge.createSession(
          new ProtocolAddress(participantId, bundle.deviceId),
          bundle
        );
        
        // Mark as migrated
        await this.markConversationMigrated(conversationId, participantId);
      } catch (error) {
        console.error(`Failed to migrate session with ${participantId}:`, error);
        // Continue with other participants
      }
    }
  }
}
```

### Week 10: Monitoring & Optimization

#### 10.1 Performance Monitoring
```typescript
// src/services/monitoring/EncryptionMetrics.ts
export class EncryptionMetrics {
  async trackEncryption(operation: string, duration: number): Promise<void> {
    await analytics.track('encryption_performance', {
      operation,
      duration,
      protocolVersion: 'signal_v1',
      deviceType: Platform.OS,
      timestamp: Date.now()
    });
  }
  
  async monitorKeyOperations(): Promise<void> {
    // Track prekey consumption
    const prekeyCount = await this.store.getPreKeyCount();
    if (prekeyCount < 10) {
      await this.replenishPreKeys();
    }
    
    // Track signed prekey age
    const signedPreKeyAge = await this.getSignedPreKeyAge();
    if (signedPreKeyAge > 48 * 60 * 60 * 1000) { // 48 hours
      await this.rotateSignedPreKey();
    }
  }
}
```

## Phase 4: Cleanup (Weeks 11-12)

### Week 11: Legacy Code Removal

#### 11.1 Remove Old Encryption Services
- Delete `E2EEService.ts` (after confirming all users migrated)
- Delete `DoubleRatchetService.ts`
- Remove custom cryptographic implementations
- Update all imports and dependencies

### Week 12: Documentation & Training

#### 12.1 Update Documentation
- API documentation for new encryption methods
- Security audit documentation
- Developer guides for Signal Protocol
- User-facing documentation about encryption

## Rollback Strategy

### Immediate Rollback (< 24 hours)
```typescript
export class RollbackService {
  async immediateRollback(userId: string): Promise<void> {
    // Disable Signal Protocol for user
    await this.featureFlagService.disableSignalProtocol(userId);
    
    // Clear Signal Protocol data
    await this.clearSignalProtocolData(userId);
    
    // Revert to legacy encryption
    await this.enableLegacyEncryption(userId);
  }
}
```

### Gradual Rollback (> 24 hours)
1. Stop new user enrollment
2. Allow existing users to continue
3. Provide migration path back to legacy
4. Monitor and fix issues
5. Re-attempt migration after fixes

## Success Metrics

### Key Performance Indicators
1. **Encryption Performance**
   - Target: < 50ms for message encryption
   - Target: < 30ms for message decryption

2. **Reliability**
   - Message delivery success rate > 99.9%
   - Session establishment success rate > 99.5%

3. **User Experience**
   - No noticeable latency increase
   - Smooth migration without data loss

### Monitoring Dashboard
```typescript
interface EncryptionMetrics {
  messagesSent: number;
  messagesReceived: number;
  encryptionDuration: number[];
  decryptionDuration: number[];
  sessionEstablishments: number;
  failures: {
    encryption: number;
    decryption: number;
    sessionCreation: number;
  };
  protocolVersions: {
    [version: string]: number;
  };
}
```

## Risk Mitigation

### Technical Risks
1. **Data Loss**
   - Mitigation: Comprehensive backup before migration
   - Recovery: Point-in-time restore capability

2. **Performance Degradation**
   - Mitigation: Load testing before rollout
   - Recovery: Quick rollback mechanism

3. **Compatibility Issues**
   - Mitigation: Extensive cross-platform testing
   - Recovery: Compatibility mode for legacy clients

### Security Risks
1. **Key Material Exposure**
   - Mitigation: Hardware-backed key storage
   - Monitoring: Key access audit logs

2. **Man-in-the-Middle**
   - Mitigation: Certificate pinning
   - Validation: Safety number verification

## Team Responsibilities

### Lead Developer
- Architecture decisions
- Code reviews
- Security implementation

### Backend Developer
- Firebase integration
- Key distribution service
- Migration tools

### Mobile Developer
- React Native bridge
- UI/UX updates
- Performance optimization

### QA Engineer
- Test plan execution
- Cross-platform testing
- Performance benchmarking

## Conclusion

This migration plan provides a structured approach to implementing libsignal in the Dynasty app. The phased approach ensures minimal disruption while significantly improving security and features. Success depends on careful execution, comprehensive testing, and gradual rollout with monitoring.