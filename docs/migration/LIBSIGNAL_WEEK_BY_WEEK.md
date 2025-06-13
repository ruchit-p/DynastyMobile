# libsignal Migration: Week-by-Week Implementation Guide

## Week 1: Protocol Store Foundation

### Day 1-2: Project Setup
```bash
# Install dependencies
cd apps/mobile
yarn add @signalapp/libsignal-client
yarn add --dev @types/libsignal-client

# Create directory structure
mkdir -p src/services/encryption/libsignal/{stores,services,types,utils}
mkdir -p src/__tests__/libsignal
```

### Day 3-4: Implement Base Protocol Store
```typescript
// src/services/encryption/libsignal/stores/SignalProtocolStore.ts
import {
  ProtocolStore,
  ProtocolAddress,
  PublicKey,
  PrivateKey,
  IdentityKeyPair,
  PreKeyRecord,
  SignedPreKeyRecord,
  SessionRecord,
  SenderKeyRecord,
  Direction
} from '@signalapp/libsignal-client';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Keychain from 'react-native-keychain';

export class SignalProtocolStore implements ProtocolStore {
  private readonly storagePrefix = 'signal_protocol_';
  
  // Core identity methods
  async getIdentityKeyPair(): Promise<IdentityKeyPair> {
    const stored = await Keychain.getInternetCredentials(
      `${this.storagePrefix}identity`
    );
    
    if (!stored) {
      throw new Error('Identity key pair not found');
    }
    
    return IdentityKeyPair.deserialize(
      Buffer.from(stored.password, 'base64')
    );
  }
  
  async getLocalRegistrationId(): Promise<number> {
    const id = await AsyncStorage.getItem(
      `${this.storagePrefix}registration_id`
    );
    
    if (!id) {
      throw new Error('Registration ID not found');
    }
    
    return parseInt(id, 10);
  }
  
  async saveIdentity(
    address: ProtocolAddress,
    identity: PublicKey
  ): Promise<boolean> {
    const key = `${this.storagePrefix}identity_${address.toString()}`;
    const existing = await AsyncStorage.getItem(key);
    
    await AsyncStorage.setItem(
      key,
      identity.serialize().toString('base64')
    );
    
    return existing !== null && 
           existing !== identity.serialize().toString('base64');
  }
  
  async isTrustedIdentity(
    address: ProtocolAddress,
    identity: PublicKey,
    direction: Direction
  ): Promise<boolean> {
    const key = `${this.storagePrefix}identity_${address.toString()}`;
    const saved = await AsyncStorage.getItem(key);
    
    if (!saved) {
      // First time seeing this identity
      return true;
    }
    
    return saved === identity.serialize().toString('base64');
  }
  
  async getIdentity(
    address: ProtocolAddress
  ): Promise<PublicKey | undefined> {
    const key = `${this.storagePrefix}identity_${address.toString()}`;
    const saved = await AsyncStorage.getItem(key);
    
    if (!saved) {
      return undefined;
    }
    
    return PublicKey.deserialize(Buffer.from(saved, 'base64'));
  }
}
```

### Day 5: Complete Store Implementation
```typescript
// Continue SignalProtocolStore.ts

  // PreKey methods
  async loadPreKey(id: number): Promise<PreKeyRecord | undefined> {
    const key = `${this.storagePrefix}prekey_${id}`;
    const saved = await AsyncStorage.getItem(key);
    
    if (!saved) {
      return undefined;
    }
    
    return PreKeyRecord.deserialize(Buffer.from(saved, 'base64'));
  }
  
  async storePreKey(id: number, record: PreKeyRecord): Promise<void> {
    const key = `${this.storagePrefix}prekey_${id}`;
    await AsyncStorage.setItem(
      key,
      record.serialize().toString('base64')
    );
  }
  
  async removePreKey(id: number): Promise<void> {
    const key = `${this.storagePrefix}prekey_${id}`;
    await AsyncStorage.removeItem(key);
  }
  
  // Session methods
  async loadSession(
    address: ProtocolAddress
  ): Promise<SessionRecord | undefined> {
    const key = `${this.storagePrefix}session_${address.toString()}`;
    const saved = await AsyncStorage.getItem(key);
    
    if (!saved) {
      return undefined;
    }
    
    return SessionRecord.deserialize(Buffer.from(saved, 'base64'));
  }
  
  async storeSession(
    address: ProtocolAddress,
    record: SessionRecord
  ): Promise<void> {
    const key = `${this.storagePrefix}session_${address.toString()}`;
    await AsyncStorage.setItem(
      key,
      record.serialize().toString('base64')
    );
  }
```

## Week 2: Key Management & Distribution

### Day 1-2: Key Generation Service
```typescript
// src/services/encryption/libsignal/services/KeyGenerationService.ts
import {
  PrivateKey,
  PublicKey,
  IdentityKeyPair,
  PreKeyRecord,
  SignedPreKeyRecord,
  generateIdentityKeyPair,
  generateRegistrationId
} from '@signalapp/libsignal-client';
import { SignalProtocolStore } from '../stores/SignalProtocolStore';

export class KeyGenerationService {
  constructor(private store: SignalProtocolStore) {}
  
  async initializeIdentity(): Promise<{
    identityKeyPair: IdentityKeyPair;
    registrationId: number;
  }> {
    // Generate new identity
    const identityKeyPair = IdentityKeyPair.generate();
    const registrationId = generateRegistrationId();
    
    // Store securely
    await this.storeIdentityKeyPair(identityKeyPair);
    await this.storeRegistrationId(registrationId);
    
    return { identityKeyPair, registrationId };
  }
  
  async generatePreKeys(start: number, count: number): Promise<PreKeyRecord[]> {
    const preKeys: PreKeyRecord[] = [];
    
    for (let i = 0; i < count; i++) {
      const id = start + i;
      const keyPair = PrivateKey.generate();
      const preKey = PreKeyRecord.new(id, keyPair.getPublicKey(), keyPair);
      
      await this.store.storePreKey(id, preKey);
      preKeys.push(preKey);
    }
    
    return preKeys;
  }
  
  async generateSignedPreKey(
    identityKey: PrivateKey
  ): Promise<SignedPreKeyRecord> {
    const keyId = Date.now() % 0xFFFFFF; // Use timestamp-based ID
    const keyPair = PrivateKey.generate();
    
    const signature = identityKey.sign(
      keyPair.getPublicKey().serialize()
    );
    
    const signedPreKey = SignedPreKeyRecord.new(
      keyId,
      Date.now(),
      keyPair.getPublicKey(),
      keyPair,
      signature
    );
    
    await this.store.storeSignedPreKey(keyId, signedPreKey);
    
    return signedPreKey;
  }
}
```

### Day 3-4: Firebase Key Distribution
```typescript
// src/services/encryption/libsignal/services/KeyDistributionService.ts
import { getFirebaseDb, getFirebaseAuth } from '../../../lib/firebase';
import { FirebaseFirestoreTypes } from '@react-native-firebase/firestore';
import { KeyGenerationService } from './KeyGenerationService';
import { SignalProtocolStore } from '../stores/SignalProtocolStore';

export class KeyDistributionService {
  private db: FirebaseFirestoreTypes.Module;
  
  constructor(
    private keyGenService: KeyGenerationService,
    private store: SignalProtocolStore
  ) {
    this.db = getFirebaseDb();
  }
  
  async publishKeys(): Promise<void> {
    const auth = getFirebaseAuth();
    const userId = auth.currentUser?.uid;
    if (!userId) throw new Error('User not authenticated');
    
    // Get identity keys
    const identityKeyPair = await this.store.getIdentityKeyPair();
    const registrationId = await this.store.getLocalRegistrationId();
    
    // Generate keys if needed
    const signedPreKey = await this.keyGenService.generateSignedPreKey(
      identityKeyPair.privateKey
    );
    const preKeys = await this.keyGenService.generatePreKeys(1, 100);
    
    // Prepare for upload
    const deviceData = {
      identityKey: identityKeyPair.publicKey.serialize().toString('base64'),
      registrationId,
      signedPreKey: {
        keyId: signedPreKey.id(),
        publicKey: signedPreKey.publicKey().serialize().toString('base64'),
        signature: signedPreKey.signature().toString('base64'),
        timestamp: signedPreKey.timestamp()
      },
      preKeys: preKeys.map(pk => ({
        keyId: pk.id(),
        publicKey: pk.publicKey().serialize().toString('base64')
      })),
      lastUpdated: FirebaseFirestoreTypes.FieldValue.serverTimestamp()
    };
    
    // Upload to Firestore
    await this.db
      .collection('users')
      .doc(userId)
      .collection('devices')
      .doc(registrationId.toString())
      .set(deviceData);
  }
  
  async fetchPreKeyBundle(userId: string, deviceId: number): Promise<PreKeyBundle> {
    const deviceDoc = await this.db
      .collection('users')
      .doc(userId)
      .collection('devices')
      .doc(deviceId.toString())
      .get();
    
    if (!deviceDoc.exists) {
      throw new Error('Device not found');
    }
    
    const data = deviceDoc.data()!;
    
    // Get and consume one prekey
    const preKey = data.preKeys[0];
    if (preKey) {
      // Remove consumed prekey
      await deviceDoc.ref.update({
        preKeys: FirebaseFirestoreTypes.FieldValue.arrayRemove(preKey)
      });
    }
    
    return {
      registrationId: data.registrationId,
      deviceId,
      preKeyId: preKey?.keyId,
      preKey: preKey ? Buffer.from(preKey.publicKey, 'base64') : undefined,
      signedPreKeyId: data.signedPreKey.keyId,
      signedPreKey: Buffer.from(data.signedPreKey.publicKey, 'base64'),
      signedPreKeySignature: Buffer.from(data.signedPreKey.signature, 'base64'),
      identityKey: Buffer.from(data.identityKey, 'base64')
    };
  }
}
```

### Day 5: Testing Key Management
```typescript
// src/__tests__/libsignal/KeyManagement.test.ts
import { KeyGenerationService } from '../../services/encryption/libsignal/services/KeyGenerationService';
import { SignalProtocolStore } from '../../services/encryption/libsignal/stores/SignalProtocolStore';

describe('Key Management', () => {
  let store: SignalProtocolStore;
  let keyService: KeyGenerationService;
  
  beforeEach(() => {
    store = new SignalProtocolStore();
    keyService = new KeyGenerationService(store);
  });
  
  test('generates and stores identity correctly', async () => {
    const { identityKeyPair, registrationId } = 
      await keyService.initializeIdentity();
    
    expect(identityKeyPair).toBeDefined();
    expect(registrationId).toBeGreaterThan(0);
    
    // Verify storage
    const storedIdentity = await store.getIdentityKeyPair();
    expect(storedIdentity.serialize()).toEqual(identityKeyPair.serialize());
  });
  
  test('generates prekeys with correct IDs', async () => {
    const preKeys = await keyService.generatePreKeys(1, 10);
    
    expect(preKeys).toHaveLength(10);
    preKeys.forEach((pk, index) => {
      expect(pk.id()).toBe(index + 1);
    });
  });
});
```

## Week 3: Message Encryption Integration

### Day 1-2: Session Management
```typescript
// src/services/encryption/libsignal/services/SessionService.ts
import {
  ProtocolAddress,
  PreKeyBundle,
  processPreKeyBundle,
  SessionCipher,
  CiphertextMessage,
  MessageType
} from '@signalapp/libsignal-client';
import { SignalProtocolStore } from '../stores/SignalProtocolStore';

export class SessionService {
  constructor(private store: SignalProtocolStore) {}
  
  async createSession(
    recipientId: string,
    deviceId: number,
    bundle: PreKeyBundle
  ): Promise<void> {
    const address = new ProtocolAddress(recipientId, deviceId);
    
    await processPreKeyBundle(
      bundle.registrationId,
      address,
      bundle.preKeyId,
      bundle.preKey ? PublicKey.deserialize(bundle.preKey) : undefined,
      bundle.signedPreKeyId,
      PublicKey.deserialize(bundle.signedPreKey),
      bundle.signedPreKeySignature,
      PublicKey.deserialize(bundle.identityKey),
      this.store
    );
  }
  
  async encryptMessage(
    recipientId: string,
    deviceId: number,
    message: string
  ): Promise<{
    type: MessageType;
    body: string;
  }> {
    const address = new ProtocolAddress(recipientId, deviceId);
    const cipher = new SessionCipher(address, this.store);
    
    const plaintext = Buffer.from(message, 'utf8');
    const ciphertext = await cipher.encrypt(plaintext);
    
    return {
      type: ciphertext.type(),
      body: ciphertext.serialize().toString('base64')
    };
  }
  
  async decryptMessage(
    senderId: string,
    deviceId: number,
    ciphertext: {
      type: MessageType;
      body: string;
    }
  ): Promise<string> {
    const address = new ProtocolAddress(senderId, deviceId);
    const cipher = new SessionCipher(address, this.store);
    
    const message = CiphertextMessage.from(
      ciphertext.type,
      Buffer.from(ciphertext.body, 'base64')
    );
    
    const plaintext = await cipher.decrypt(message);
    return plaintext.toString('utf8');
  }
}
```

### Day 3-4: Compatibility Layer
```typescript
// src/services/encryption/libsignal/LibsignalCompatibilityService.ts
import { SessionService } from './services/SessionService';
import { KeyDistributionService } from './services/KeyDistributionService';
import { E2EEService } from '../E2EEService';
import { getFirebaseAuth } from '../../lib/firebase';

export class LibsignalCompatibilityService {
  constructor(
    private sessionService: SessionService,
    private keyDistService: KeyDistributionService,
    private legacyE2EE: E2EEService
  ) {}
  
  async encryptMessage(
    conversationId: string,
    message: any,
    recipientId: string
  ): Promise<any> {
    try {
      // Check recipient capabilities
      const recipientInfo = await this.getRecipientInfo(recipientId);
      
      if (recipientInfo.supportsSignalProtocol) {
        // Ensure session exists
        await this.ensureSession(recipientId, recipientInfo.deviceId);
        
        // Encrypt with Signal Protocol
        const encrypted = await this.sessionService.encryptMessage(
          recipientId,
          recipientInfo.deviceId,
          JSON.stringify(message)
        );
        
        return {
          protocolVersion: 'signal_v1',
          deviceId: recipientInfo.deviceId,
          ...encrypted
        };
      }
    } catch (error) {
      console.warn('Signal Protocol encryption failed, falling back', error);
    }
    
    // Fall back to legacy
    return await this.legacyE2EE.encryptMessage(message, recipientId);
  }
  
  private async ensureSession(recipientId: string, deviceId: number): Promise<void> {
    const address = new ProtocolAddress(recipientId, deviceId);
    const hasSession = await this.store.loadSession(address);
    
    if (!hasSession) {
      // Fetch and process prekey bundle
      const bundle = await this.keyDistService.fetchPreKeyBundle(
        recipientId,
        deviceId
      );
      
      await this.sessionService.createSession(
        recipientId,
        deviceId,
        bundle
      );
    }
  }
}
```

### Day 5: Update Chat Service
```typescript
// src/services/encryption/ChatEncryptionService.ts
// Add to existing service

import { LibsignalCompatibilityService } from './libsignal/LibsignalCompatibilityService';

export class ChatEncryptionService {
  private compatibilityService?: LibsignalCompatibilityService;
  
  async initializeLibsignal(): Promise<void> {
    if (await this.isSignalProtocolEnabled()) {
      const store = new SignalProtocolStore();
      const keyGenService = new KeyGenerationService(store);
      const keyDistService = new KeyDistributionService(keyGenService, store);
      const sessionService = new SessionService(store);
      
      this.compatibilityService = new LibsignalCompatibilityService(
        sessionService,
        keyDistService,
        this.e2eeService
      );
      
      // Initialize identity if needed
      const hasIdentity = await this.checkIdentityExists(store);
      if (!hasIdentity) {
        await keyGenService.initializeIdentity();
        await keyDistService.publishKeys();
      }
    }
  }
  
  async encryptAndSendMessage(
    conversationId: string,
    content: any,
    recipientIds: string[]
  ): Promise<void> {
    const encryptionService = this.compatibilityService || this.e2eeService;
    
    const encryptedMessages = await Promise.all(
      recipientIds.map(async (recipientId) => {
        const encrypted = await encryptionService.encryptMessage(
          conversationId,
          content,
          recipientId
        );
        
        return {
          recipientId,
          encrypted
        };
      })
    );
    
    // Send via Firebase
    await this.sendEncryptedMessages(conversationId, encryptedMessages);
  }
}
```

## Week 4: Group Messaging

### Day 1-2: Sender Key Implementation
```typescript
// src/services/encryption/libsignal/services/GroupService.ts
import {
  ProtocolAddress,
  SenderKeyName,
  SenderKeyDistributionMessage,
  GroupSessionBuilder,
  GroupCipher,
  processSenderKeyDistributionMessage
} from '@signalapp/libsignal-client';
import { SignalProtocolStore } from '../stores/SignalProtocolStore';
import { SessionService } from './SessionService';

export class GroupService {
  constructor(
    private store: SignalProtocolStore,
    private sessionService: SessionService
  ) {}
  
  async createGroup(groupId: string, memberIds: string[]): Promise<void> {
    const currentUserId = getFirebaseAuth().currentUser?.uid;
    if (!currentUserId) throw new Error('Not authenticated');
    
    const deviceId = await this.store.getLocalRegistrationId();
    const senderKeyName = new SenderKeyName(groupId, currentUserId + '.' + deviceId);
    
    // Create distribution message
    const builder = new GroupSessionBuilder(this.store);
    const distributionMessage = await builder.create(senderKeyName);
    
    // Send to all members via 1-on-1 encrypted channels
    await Promise.all(
      memberIds
        .filter(id => id !== currentUserId)
        .map(memberId => this.sendSenderKeyDistribution(
          memberId,
          groupId,
          distributionMessage
        ))
    );
  }
  
  private async sendSenderKeyDistribution(
    recipientId: string,
    groupId: string,
    distribution: SenderKeyDistributionMessage
  ): Promise<void> {
    // Get recipient's default device
    const deviceId = await this.getDefaultDeviceId(recipientId);
    
    // Create special message type
    const message = {
      type: 'sender_key_distribution',
      groupId,
      distribution: distribution.serialize().toString('base64')
    };
    
    // Send via regular 1-on-1 encryption
    const encrypted = await this.sessionService.encryptMessage(
      recipientId,
      deviceId,
      JSON.stringify(message)
    );
    
    // Store in Firebase
    await this.sendDistributionMessage(recipientId, encrypted);
  }
  
  async processSenderKeyDistribution(
    senderId: string,
    groupId: string,
    distributionData: string
  ): Promise<void> {
    const senderKeyName = new SenderKeyName(groupId, senderId);
    const distribution = SenderKeyDistributionMessage.deserialize(
      Buffer.from(distributionData, 'base64')
    );
    
    await processSenderKeyDistributionMessage(
      senderKeyName,
      distribution,
      this.store
    );
  }
  
  async encryptGroupMessage(
    groupId: string,
    message: string
  ): Promise<string> {
    const currentUserId = getFirebaseAuth().currentUser?.uid;
    const deviceId = await this.store.getLocalRegistrationId();
    const senderKeyName = new SenderKeyName(
      groupId, 
      currentUserId + '.' + deviceId
    );
    
    const cipher = new GroupCipher(senderKeyName, this.store);
    const ciphertext = await cipher.encrypt(Buffer.from(message, 'utf8'));
    
    return ciphertext.serialize().toString('base64');
  }
}
```

### Day 3-4: Group Message Flow
```typescript
// src/services/encryption/libsignal/services/GroupMessageService.ts
export class GroupMessageService {
  constructor(
    private groupService: GroupService,
    private db: FirebaseFirestoreTypes.Module
  ) {}
  
  async sendGroupMessage(
    groupId: string,
    content: any
  ): Promise<void> {
    const encrypted = await this.groupService.encryptGroupMessage(
      groupId,
      JSON.stringify(content)
    );
    
    const messageData = {
      groupId,
      senderId: getFirebaseAuth().currentUser?.uid,
      deviceId: await this.store.getLocalRegistrationId(),
      encryptedContent: encrypted,
      timestamp: FirebaseFirestoreTypes.FieldValue.serverTimestamp(),
      protocolVersion: 'signal_group_v1'
    };
    
    await this.db
      .collection('groups')
      .doc(groupId)
      .collection('messages')
      .add(messageData);
  }
  
  async receiveGroupMessage(message: any): Promise<any> {
    const { groupId, senderId, deviceId, encryptedContent } = message;
    
    const senderKeyName = new SenderKeyName(
      groupId,
      senderId + '.' + deviceId
    );
    
    const cipher = new GroupCipher(senderKeyName, this.store);
    const plaintext = await cipher.decrypt(
      Buffer.from(encryptedContent, 'base64')
    );
    
    return JSON.parse(plaintext.toString('utf8'));
  }
}
```

### Day 5: Group Management
```typescript
// src/services/encryption/libsignal/services/GroupManagementService.ts
export class GroupManagementService {
  async addMemberToGroup(
    groupId: string,
    newMemberId: string
  ): Promise<void> {
    // Get current sender key
    const senderKeyName = new SenderKeyName(
      groupId,
      this.currentUserId + '.' + this.deviceId
    );
    
    const builder = new GroupSessionBuilder(this.store);
    const distribution = await builder.create(senderKeyName);
    
    // Send to new member
    await this.groupService.sendSenderKeyDistribution(
      newMemberId,
      groupId,
      distribution
    );
    
    // Update group membership in Firebase
    await this.updateGroupMembership(groupId, newMemberId, 'add');
  }
  
  async removeMemberFromGroup(
    groupId: string,
    memberId: string
  ): Promise<void> {
    // Rotate group key
    await this.rotateGroupKey(groupId);
    
    // Update membership
    await this.updateGroupMembership(groupId, memberId, 'remove');
  }
  
  private async rotateGroupKey(groupId: string): Promise<void> {
    // Create new sender key
    const newSenderKeyName = new SenderKeyName(
      groupId,
      this.currentUserId + '.' + this.deviceId + '.' + Date.now()
    );
    
    const builder = new GroupSessionBuilder(this.store);
    const newDistribution = await builder.create(newSenderKeyName);
    
    // Get current members
    const members = await this.getGroupMembers(groupId);
    
    // Distribute new key to remaining members
    await Promise.all(
      members.map(memberId => 
        this.groupService.sendSenderKeyDistribution(
          memberId,
          groupId,
          newDistribution
        )
      )
    );
  }
}
```

## Week 5: Testing & Performance

### Day 1-2: Integration Tests
```typescript
// src/__tests__/libsignal/Integration.test.ts
describe('Signal Protocol Integration', () => {
  let alice: TestUser;
  let bob: TestUser;
  
  beforeEach(async () => {
    alice = await createTestUser('alice');
    bob = await createTestUser('bob');
  });
  
  test('complete message exchange', async () => {
    // Alice fetches Bob's prekey bundle
    const bobBundle = await alice.keyDistService.fetchPreKeyBundle(
      bob.userId,
      bob.deviceId
    );
    
    // Alice creates session with Bob
    await alice.sessionService.createSession(
      bob.userId,
      bob.deviceId,
      bobBundle
    );
    
    // Alice sends message
    const message = 'Hello Bob!';
    const encrypted = await alice.sessionService.encryptMessage(
      bob.userId,
      bob.deviceId,
      message
    );
    
    // Bob receives and decrypts
    const decrypted = await bob.sessionService.decryptMessage(
      alice.userId,
      alice.deviceId,
      encrypted
    );
    
    expect(decrypted).toBe(message);
    
    // Bob replies
    const reply = 'Hi Alice!';
    const encryptedReply = await bob.sessionService.encryptMessage(
      alice.userId,
      alice.deviceId,
      reply
    );
    
    // Alice decrypts reply
    const decryptedReply = await alice.sessionService.decryptMessage(
      bob.userId,
      bob.deviceId,
      encryptedReply
    );
    
    expect(decryptedReply).toBe(reply);
  });
});
```

### Day 3-4: Performance Optimization
```typescript
// src/services/encryption/libsignal/utils/PerformanceMonitor.ts
export class PerformanceMonitor {
  private metrics: Map<string, number[]> = new Map();
  
  async measureOperation<T>(
    operation: string,
    fn: () => Promise<T>
  ): Promise<T> {
    const start = performance.now();
    
    try {
      const result = await fn();
      const duration = performance.now() - start;
      
      this.recordMetric(operation, duration);
      
      return result;
    } catch (error) {
      const duration = performance.now() - start;
      this.recordMetric(`${operation}_error`, duration);
      throw error;
    }
  }
  
  private recordMetric(operation: string, duration: number): void {
    if (!this.metrics.has(operation)) {
      this.metrics.set(operation, []);
    }
    
    const metrics = this.metrics.get(operation)!;
    metrics.push(duration);
    
    // Keep only last 100 measurements
    if (metrics.length > 100) {
      metrics.shift();
    }
    
    // Log if operation is slow
    if (duration > 100) {
      console.warn(`Slow operation: ${operation} took ${duration}ms`);
    }
  }
  
  getMetrics(): Record<string, {
    avg: number;
    min: number;
    max: number;
    p95: number;
  }> {
    const results: Record<string, any> = {};
    
    this.metrics.forEach((durations, operation) => {
      const sorted = [...durations].sort((a, b) => a - b);
      
      results[operation] = {
        avg: durations.reduce((a, b) => a + b, 0) / durations.length,
        min: sorted[0],
        max: sorted[sorted.length - 1],
        p95: sorted[Math.floor(sorted.length * 0.95)]
      };
    });
    
    return results;
  }
}
```

### Day 5: Load Testing
```typescript
// src/__tests__/libsignal/LoadTest.test.ts
describe('Load Testing', () => {
  test('handles 1000 concurrent messages', async () => {
    const users = await Promise.all(
      Array.from({ length: 10 }, (_, i) => 
        createTestUser(`user${i}`)
      )
    );
    
    // Establish sessions between all users
    for (let i = 0; i < users.length; i++) {
      for (let j = i + 1; j < users.length; j++) {
        await establishSession(users[i], users[j]);
      }
    }
    
    // Send 1000 messages concurrently
    const messagePromises: Promise<void>[] = [];
    
    for (let i = 0; i < 1000; i++) {
      const sender = users[i % users.length];
      const recipient = users[(i + 1) % users.length];
      
      messagePromises.push(
        sender.sendMessage(recipient.userId, `Message ${i}`)
      );
    }
    
    const start = Date.now();
    await Promise.all(messagePromises);
    const duration = Date.now() - start;
    
    console.log(`1000 messages processed in ${duration}ms`);
    expect(duration).toBeLessThan(10000); // Should complete in < 10s
  });
});
```

## Week 6: Production Preparation

### Day 1-2: Error Handling
```typescript
// src/services/encryption/libsignal/utils/ErrorHandler.ts
export enum SignalProtocolError {
  NO_SESSION = 'NO_SESSION',
  UNTRUSTED_IDENTITY = 'UNTRUSTED_IDENTITY',
  INVALID_KEY = 'INVALID_KEY',
  PREKEY_NOT_FOUND = 'PREKEY_NOT_FOUND',
  RATE_LIMIT = 'RATE_LIMIT'
}

export class SignalProtocolErrorHandler {
  async handleError(error: any, context: {
    operation: string;
    userId?: string;
    deviceId?: number;
  }): Promise<void> {
    console.error('Signal Protocol error:', error, context);
    
    if (error.message?.includes('No session')) {
      await this.handleNoSession(context);
    } else if (error.message?.includes('Untrusted identity')) {
      await this.handleUntrustedIdentity(context);
    } else if (error.message?.includes('PreKey not found')) {
      await this.handlePreKeyNotFound(context);
    }
    
    // Log to analytics
    await analytics.track('signal_protocol_error', {
      error: error.message,
      ...context
    });
  }
  
  private async handleNoSession(context: any): Promise<void> {
    // Attempt to establish new session
    if (context.userId && context.deviceId) {
      try {
        const bundle = await this.keyDistService.fetchPreKeyBundle(
          context.userId,
          context.deviceId
        );
        
        await this.sessionService.createSession(
          context.userId,
          context.deviceId,
          bundle
        );
      } catch (retryError) {
        console.error('Failed to establish session:', retryError);
      }
    }
  }
}
```

### Day 3-4: Migration Tools
```typescript
// src/services/encryption/libsignal/migration/MigrationService.ts
export class MigrationService {
  async migrateUser(userId: string): Promise<void> {
    try {
      // Initialize Signal Protocol
      await this.initializeSignalProtocol(userId);
      
      // Migrate existing conversations
      const conversations = await this.getUserConversations(userId);
      
      for (const conversation of conversations) {
        await this.migrateConversation(conversation.id);
      }
      
      // Update user capabilities
      await this.updateUserCapabilities(userId);
      
      // Log success
      await analytics.track('signal_migration_success', { userId });
    } catch (error) {
      await analytics.track('signal_migration_failed', { 
        userId,
        error: error.message 
      });
      
      throw error;
    }
  }
  
  async rollbackUser(userId: string): Promise<void> {
    // Disable Signal Protocol
    await this.db.collection('users').doc(userId).update({
      'capabilities.signalProtocol': false
    });
    
    // Clear Signal Protocol data
    await this.clearSignalData(userId);
    
    // Revert to legacy encryption
    await analytics.track('signal_rollback', { userId });
  }
}
```

### Day 5: Deployment Checklist
```typescript
// deployment/signal-protocol-checklist.ts
export const deploymentChecklist = {
  preDeployment: [
    'Run all tests',
    'Performance benchmarks pass',
    'Security audit complete',
    'Rollback plan tested',
    'Feature flags configured',
    'Monitoring dashboards ready'
  ],
  
  deployment: [
    'Deploy to staging',
    'Test with beta users',
    'Monitor error rates',
    'Check performance metrics',
    'Verify message delivery'
  ],
  
  postDeployment: [
    'Monitor adoption rate',
    'Track error metrics',
    'Gather user feedback',
    'Plan gradual rollout',
    'Document lessons learned'
  ]
};
```

## Success Criteria

- [ ] All tests passing (unit, integration, load)
- [ ] Performance targets met (< 50ms encryption)
- [ ] Zero data loss during migration
- [ ] Rollback tested and working
- [ ] Documentation complete
- [ ] Team trained on Signal Protocol

## Daily Standups Format

```markdown
### Day X Standup

**Completed:**
- Task 1
- Task 2

**In Progress:**
- Task 3 (70% complete)

**Blockers:**
- None / Issue description

**Next:**
- Task 4
- Task 5

**Metrics:**
- Tests: X/Y passing
- Coverage: X%
- Performance: Xms avg
```