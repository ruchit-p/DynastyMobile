# libsignal Testing Strategy & QA Process

## Overview

This document outlines the comprehensive testing strategy for the libsignal integration into Dynasty. The strategy covers unit testing, integration testing, end-to-end testing, performance testing, and security validation.

## Testing Phases

### Phase 1: Unit Testing (Week 1-2)

#### 1.1 Protocol Store Tests
```typescript
// src/__tests__/libsignal/stores/SignalProtocolStore.test.ts
import { SignalProtocolStore } from '../../../services/encryption/libsignal/stores/SignalProtocolStore';
import { IdentityKeyPair, PreKeyRecord, SignedPreKeyRecord } from '@signalapp/libsignal-client';
import AsyncStorage from '@react-native-async-storage/async-storage';

describe('SignalProtocolStore', () => {
  let store: SignalProtocolStore;
  
  beforeEach(() => {
    AsyncStorage.clear();
    store = new SignalProtocolStore();
  });
  
  describe('Identity Key Management', () => {
    test('stores and retrieves identity key pair', async () => {
      const keyPair = IdentityKeyPair.generate();
      await store.storeIdentityKeyPair(keyPair);
      
      const retrieved = await store.getIdentityKeyPair();
      expect(retrieved.serialize()).toEqual(keyPair.serialize());
    });
    
    test('throws when identity key not found', async () => {
      await expect(store.getIdentityKeyPair()).rejects.toThrow('Identity key pair not found');
    });
    
    test('stores and retrieves registration ID', async () => {
      const registrationId = 12345;
      await store.storeLocalRegistrationId(registrationId);
      
      const retrieved = await store.getLocalRegistrationId();
      expect(retrieved).toBe(registrationId);
    });
  });
  
  describe('PreKey Management', () => {
    test('stores and loads prekeys', async () => {
      const preKey = PreKeyRecord.new(1, PrivateKey.generate());
      await store.storePreKey(1, preKey);
      
      const loaded = await store.loadPreKey(1);
      expect(loaded?.serialize()).toEqual(preKey.serialize());
    });
    
    test('returns undefined for non-existent prekey', async () => {
      const loaded = await store.loadPreKey(999);
      expect(loaded).toBeUndefined();
    });
    
    test('removes prekeys', async () => {
      const preKey = PreKeyRecord.new(1, PrivateKey.generate());
      await store.storePreKey(1, preKey);
      await store.removePreKey(1);
      
      const loaded = await store.loadPreKey(1);
      expect(loaded).toBeUndefined();
    });
  });
  
  describe('Session Management', () => {
    test('correctly identifies trusted identities', async () => {
      const address = new ProtocolAddress('user123', 1);
      const identity = PrivateKey.generate().getPublicKey();
      
      // First time seeing identity should be trusted
      const firstTime = await store.isTrustedIdentity(address, identity, Direction.Sending);
      expect(firstTime).toBe(true);
      
      // Save the identity
      await store.saveIdentity(address, identity);
      
      // Same identity should still be trusted
      const sameTrust = await store.isTrustedIdentity(address, identity, Direction.Sending);
      expect(sameTrust).toBe(true);
      
      // Different identity should not be trusted
      const newIdentity = PrivateKey.generate().getPublicKey();
      const differentTrust = await store.isTrustedIdentity(address, newIdentity, Direction.Sending);
      expect(differentTrust).toBe(false);
    });
  });
});
```

#### 1.2 Encryption/Decryption Tests
```typescript
// src/__tests__/libsignal/services/SessionService.test.ts
describe('SessionService', () => {
  let aliceStore: SignalProtocolStore;
  let bobStore: SignalProtocolStore;
  let aliceService: SessionService;
  let bobService: SessionService;
  
  beforeEach(async () => {
    // Setup Alice
    aliceStore = new SignalProtocolStore();
    aliceService = new SessionService(aliceStore);
    const aliceIdentity = IdentityKeyPair.generate();
    await aliceStore.storeIdentityKeyPair(aliceIdentity);
    await aliceStore.storeLocalRegistrationId(1111);
    
    // Setup Bob
    bobStore = new SignalProtocolStore();
    bobService = new SessionService(bobStore);
    const bobIdentity = IdentityKeyPair.generate();
    await bobStore.storeIdentityKeyPair(bobIdentity);
    await bobStore.storeLocalRegistrationId(2222);
    
    // Generate Bob's prekeys
    const bobPreKey = PreKeyRecord.new(1, PrivateKey.generate());
    const bobSignedPreKey = SignedPreKeyRecord.new(
      1,
      Date.now(),
      PrivateKey.generate(),
      bobIdentity.privateKey.sign(bobPreKey.publicKey().serialize())
    );
    
    await bobStore.storePreKey(1, bobPreKey);
    await bobStore.storeSignedPreKey(1, bobSignedPreKey);
  });
  
  test('establishes session and exchanges messages', async () => {
    // Alice creates session with Bob
    const bobBundle = {
      registrationId: 2222,
      deviceId: 1,
      preKeyId: 1,
      preKey: (await bobStore.loadPreKey(1))!.publicKey().serialize(),
      signedPreKeyId: 1,
      signedPreKey: (await bobStore.loadSignedPreKey(1))!.publicKey().serialize(),
      signedPreKeySignature: (await bobStore.loadSignedPreKey(1))!.signature(),
      identityKey: (await bobStore.getIdentityKeyPair()).publicKey.serialize()
    };
    
    await aliceService.createSession('bob', 1, bobBundle);
    
    // Alice encrypts message
    const message = 'Hello Bob!';
    const encrypted = await aliceService.encryptMessage('bob', 1, message);
    
    expect(encrypted.type).toBeDefined();
    expect(encrypted.body).toBeDefined();
    
    // Bob decrypts message
    const decrypted = await bobService.decryptMessage('alice', 1, encrypted);
    expect(decrypted).toBe(message);
    
    // Bob can now reply
    const reply = 'Hi Alice!';
    const encryptedReply = await bobService.encryptMessage('alice', 1, reply);
    const decryptedReply = await aliceService.decryptMessage('bob', 1, encryptedReply);
    
    expect(decryptedReply).toBe(reply);
  });
  
  test('handles out-of-order messages', async () => {
    // Establish session
    await establishSession(aliceService, bobService);
    
    // Alice sends multiple messages
    const messages = ['Message 1', 'Message 2', 'Message 3'];
    const encrypted = await Promise.all(
      messages.map(msg => aliceService.encryptMessage('bob', 1, msg))
    );
    
    // Bob receives in different order
    const decrypted2 = await bobService.decryptMessage('alice', 1, encrypted[1]);
    const decrypted3 = await bobService.decryptMessage('alice', 1, encrypted[2]);
    const decrypted1 = await bobService.decryptMessage('alice', 1, encrypted[0]);
    
    expect(decrypted1).toBe('Message 1');
    expect(decrypted2).toBe('Message 2');
    expect(decrypted3).toBe('Message 3');
  });
});
```

### Phase 2: Integration Testing (Week 3-4)

#### 2.1 Firebase Integration Tests
```typescript
// src/__tests__/libsignal/integration/FirebaseIntegration.test.ts
import { KeyDistributionService } from '../../../services/encryption/libsignal/services/KeyDistributionService';
import { initializeTestEnvironment } from '@firebase/rules-unit-testing';

describe('Firebase Integration', () => {
  let testEnv: RulesTestEnvironment;
  let aliceAuth: RulesTestContext;
  let bobAuth: RulesTestContext;
  
  beforeAll(async () => {
    testEnv = await initializeTestEnvironment({
      projectId: 'dynasty-test',
      firestore: {
        rules: fs.readFileSync('../../firebase/firestore.rules', 'utf8')
      }
    });
  });
  
  beforeEach(async () => {
    await testEnv.clearFirestore();
    aliceAuth = testEnv.authenticatedContext('alice');
    bobAuth = testEnv.authenticatedContext('bob');
  });
  
  test('publishes and fetches prekey bundles', async () => {
    const aliceService = new KeyDistributionService(aliceAuth.firestore());
    const bobService = new KeyDistributionService(bobAuth.firestore());
    
    // Alice publishes keys
    await aliceService.publishKeys();
    
    // Bob fetches Alice's bundle
    const bundle = await bobService.fetchPreKeyBundle('alice', 1111);
    
    expect(bundle.registrationId).toBe(1111);
    expect(bundle.identityKey).toBeDefined();
    expect(bundle.signedPreKey).toBeDefined();
    expect(bundle.preKey).toBeDefined();
    
    // Verify prekey was consumed
    const bundle2 = await bobService.fetchPreKeyBundle('alice', 1111);
    expect(bundle2.preKeyId).not.toBe(bundle.preKeyId);
  });
  
  test('handles prekey exhaustion', async () => {
    const aliceService = new KeyDistributionService(aliceAuth.firestore());
    
    // Publish limited prekeys
    await aliceService.publishKeys(5); // Only 5 prekeys
    
    // Fetch all prekeys
    for (let i = 0; i < 5; i++) {
      const bundle = await aliceService.fetchPreKeyBundle('alice', 1111);
      expect(bundle.preKey).toBeDefined();
    }
    
    // Next fetch should have no prekey
    const bundle = await aliceService.fetchPreKeyBundle('alice', 1111);
    expect(bundle.preKey).toBeUndefined();
    expect(bundle.signedPreKey).toBeDefined(); // But signed prekey still available
  });
});
```

#### 2.2 Message Flow Integration Tests
```typescript
// src/__tests__/libsignal/integration/MessageFlow.test.ts
describe('Message Flow Integration', () => {
  test('complete chat workflow', async () => {
    const { alice, bob } = await setupTestUsers();
    
    // Create chat
    const chatId = await alice.createChat([alice.userId, bob.userId]);
    
    // Alice sends first message (establishes session)
    await alice.sendMessage(chatId, 'Hello Bob!');
    
    // Verify message stored encrypted
    const messageDoc = await getLatestMessage(chatId);
    expect(messageDoc.encryptedPayloads[bob.userId]).toBeDefined();
    expect(messageDoc.text).toBeUndefined(); // No plaintext stored
    
    // Bob receives and decrypts
    const bobMessages = await bob.getMessages(chatId);
    expect(bobMessages[0].text).toBe('Hello Bob!');
    
    // Bob replies
    await bob.sendMessage(chatId, 'Hi Alice!');
    
    // Alice receives
    const aliceMessages = await alice.getMessages(chatId);
    expect(aliceMessages[1].text).toBe('Hi Alice!');
  });
  
  test('group chat workflow', async () => {
    const { alice, bob, charlie } = await setupTestUsers();
    
    // Alice creates group
    const groupId = await alice.createGroup('Test Group', [
      alice.userId,
      bob.userId,
      charlie.userId
    ]);
    
    // Wait for key distribution
    await waitForKeyDistribution(groupId, [bob.userId, charlie.userId]);
    
    // Alice sends group message
    await alice.sendGroupMessage(groupId, 'Hello everyone!');
    
    // All members receive
    const bobMessages = await bob.getGroupMessages(groupId);
    const charlieMessages = await charlie.getGroupMessages(groupId);
    
    expect(bobMessages[0].text).toBe('Hello everyone!');
    expect(charlieMessages[0].text).toBe('Hello everyone!');
    
    // Members can reply
    await bob.sendGroupMessage(groupId, 'Hi from Bob!');
    await charlie.sendGroupMessage(groupId, 'Hi from Charlie!');
    
    // Everyone sees all messages
    const allMessages = await alice.getGroupMessages(groupId);
    expect(allMessages).toHaveLength(3);
  });
});
```

### Phase 3: End-to-End Testing (Week 5-6)

#### 3.1 Device Testing Matrix
```typescript
// e2e/libsignal/deviceMatrix.test.ts
const deviceConfigs = [
  { platform: 'ios', version: '15.0', device: 'iPhone 12' },
  { platform: 'ios', version: '16.0', device: 'iPhone 14' },
  { platform: 'android', version: '11', device: 'Pixel 5' },
  { platform: 'android', version: '13', device: 'Pixel 7' }
];

describe('Cross-Device E2E Tests', () => {
  deviceConfigs.forEach(sender => {
    deviceConfigs.forEach(receiver => {
      if (sender !== receiver) {
        test(`${sender.device} -> ${receiver.device}`, async () => {
          const senderClient = await createClient(sender);
          const receiverClient = await createClient(receiver);
          
          // Test message exchange
          await testMessageExchange(senderClient, receiverClient);
          
          // Test media sharing
          await testMediaSharing(senderClient, receiverClient);
          
          // Test group messaging
          await testGroupMessaging(senderClient, receiverClient);
        });
      }
    });
  });
});
```

#### 3.2 Offline Scenario Tests
```typescript
// e2e/libsignal/offline.test.ts
describe('Offline Scenarios', () => {
  test('queues messages when recipient offline', async () => {
    const { alice, bob } = await setupTestUsers();
    
    // Bob goes offline
    await bob.goOffline();
    
    // Alice sends messages
    await alice.sendMessage(bob.userId, 'Message 1');
    await alice.sendMessage(bob.userId, 'Message 2');
    await alice.sendMessage(bob.userId, 'Message 3');
    
    // Verify messages queued
    const queuedMessages = await getQueuedMessages(bob.userId);
    expect(queuedMessages).toHaveLength(3);
    
    // Bob comes online
    await bob.goOnline();
    
    // Bob receives all messages in order
    const messages = await bob.waitForMessages(3);
    expect(messages.map(m => m.text)).toEqual([
      'Message 1',
      'Message 2',
      'Message 3'
    ]);
  });
  
  test('handles session establishment while offline', async () => {
    const { alice, bob } = await setupTestUsers();
    
    // Alice goes offline before establishing session
    await alice.goOffline();
    
    // Alice tries to send message (no session yet)
    await alice.sendMessage(bob.userId, 'Offline message');
    
    // Message should be queued with pending session
    const queuedOps = await getQueuedOperations(alice.userId);
    expect(queuedOps).toContainEqual({
      type: 'establish_session',
      recipientId: bob.userId
    });
    
    // Alice comes online
    await alice.goOnline();
    
    // Session established and message sent
    await waitForOperation('session_established', { userId: bob.userId });
    
    const messages = await bob.getMessages();
    expect(messages[0].text).toBe('Offline message');
  });
});
```

### Phase 4: Performance Testing (Week 7)

#### 4.1 Benchmark Suite
```typescript
// src/__tests__/libsignal/performance/benchmarks.test.ts
describe('Performance Benchmarks', () => {
  const metrics = new PerformanceMetrics();
  
  afterAll(() => {
    metrics.generateReport();
  });
  
  test('key generation performance', async () => {
    const timings: number[] = [];
    
    for (let i = 0; i < 100; i++) {
      const start = performance.now();
      
      const identity = IdentityKeyPair.generate();
      const preKeys = generatePreKeys(100);
      const signedPreKey = generateSignedPreKey(identity.privateKey);
      
      const duration = performance.now() - start;
      timings.push(duration);
    }
    
    const avg = average(timings);
    const p95 = percentile(timings, 95);
    
    expect(avg).toBeLessThan(100); // < 100ms average
    expect(p95).toBeLessThan(200); // < 200ms for 95th percentile
    
    metrics.record('key_generation', timings);
  });
  
  test('message encryption performance', async () => {
    const { alice, bob } = await setupBenchmarkUsers();
    const messages = generateTestMessages(1000); // 1000 messages of varying sizes
    
    const timings: number[] = [];
    
    for (const message of messages) {
      const start = performance.now();
      await alice.encryptMessage(bob.userId, message);
      const duration = performance.now() - start;
      
      timings.push(duration);
    }
    
    const avg = average(timings);
    expect(avg).toBeLessThan(50); // < 50ms average
    
    metrics.record('message_encryption', timings);
  });
  
  test('concurrent encryption stress test', async () => {
    const users = await setupBenchmarkUsers(10); // 10 users
    const messageCount = 100; // Each sends 100 messages
    
    const start = performance.now();
    
    // All users send messages concurrently
    await Promise.all(
      users.flatMap(sender =>
        users
          .filter(u => u !== sender)
          .map(receiver =>
            Array.from({ length: messageCount }, (_, i) =>
              sender.sendMessage(receiver.userId, `Message ${i}`)
            )
          ).flat()
      )
    );
    
    const totalDuration = performance.now() - start;
    const totalMessages = users.length * (users.length - 1) * messageCount;
    const throughput = totalMessages / (totalDuration / 1000); // messages per second
    
    expect(throughput).toBeGreaterThan(100); // > 100 messages/second
    
    metrics.record('throughput', [throughput]);
  });
});
```

#### 4.2 Memory Usage Tests
```typescript
// src/__tests__/libsignal/performance/memory.test.ts
describe('Memory Usage', () => {
  test('memory usage stays bounded', async () => {
    const initialMemory = getMemoryUsage();
    const users = await setupBenchmarkUsers(5);
    
    // Generate many sessions
    for (let i = 0; i < 1000; i++) {
      const sender = users[i % users.length];
      const receiver = users[(i + 1) % users.length];
      
      await sender.sendMessage(receiver.userId, `Message ${i}`);
      
      if (i % 100 === 0) {
        const currentMemory = getMemoryUsage();
        const increase = currentMemory - initialMemory;
        
        // Memory increase should be reasonable
        expect(increase).toBeLessThan(100 * 1024 * 1024); // < 100MB
      }
    }
  });
  
  test('cleanup releases memory', async () => {
    const store = new SignalProtocolStore();
    
    // Create many sessions
    for (let i = 0; i < 100; i++) {
      const address = new ProtocolAddress(`user${i}`, 1);
      await store.storeSession(address, generateMockSession());
    }
    
    const beforeCleanup = getMemoryUsage();
    
    // Clear old sessions
    await store.clearSessionsOlderThan(Date.now() - 7 * 24 * 60 * 60 * 1000);
    
    // Force garbage collection
    if (global.gc) global.gc();
    
    const afterCleanup = getMemoryUsage();
    expect(afterCleanup).toBeLessThan(beforeCleanup);
  });
});
```

### Phase 5: Security Testing (Week 8)

#### 5.1 Cryptographic Validation
```typescript
// src/__tests__/libsignal/security/crypto.test.ts
describe('Cryptographic Security', () => {
  test('prevents identity key reuse', async () => {
    const identity1 = IdentityKeyPair.generate();
    const identity2 = IdentityKeyPair.generate();
    
    // Verify keys are different
    expect(identity1.publicKey.serialize()).not.toEqual(
      identity2.publicKey.serialize()
    );
  });
  
  test('detects MITM attacks', async () => {
    const { alice, bob, mallory } = await setupTestUsers();
    
    // Alice establishes session with Bob
    await alice.createSessionWith(bob);
    
    // Mallory tries to intercept
    const maliciousBundle = await mallory.createFakeBundle(bob.userId);
    
    // Alice's store should detect identity change
    const isTrusted = await alice.store.isTrustedIdentity(
      new ProtocolAddress(bob.userId, 1),
      maliciousBundle.identityKey,
      Direction.Sending
    );
    
    expect(isTrusted).toBe(false);
  });
  
  test('forward secrecy', async () => {
    const { alice, bob } = await setupTestUsers();
    
    // Exchange several messages
    const messages = [];
    for (let i = 0; i < 10; i++) {
      await alice.sendMessage(bob.userId, `Message ${i}`);
      messages.push(await bob.getLatestMessage());
    }
    
    // Compromise current session key
    const currentSession = await alice.store.loadSession(
      new ProtocolAddress(bob.userId, 1)
    );
    
    // Verify old messages cannot be decrypted with current key
    for (let i = 0; i < 5; i++) {
      await expect(
        decryptWithSession(messages[i], currentSession)
      ).rejects.toThrow();
    }
  });
});
```

#### 5.2 Attack Scenario Tests
```typescript
// src/__tests__/libsignal/security/attacks.test.ts
describe('Attack Scenarios', () => {
  test('replay attack protection', async () => {
    const { alice, bob } = await setupTestUsers();
    
    // Alice sends message
    const encrypted = await alice.encryptMessage(bob.userId, 'Secret message');
    
    // Bob decrypts successfully
    const decrypted1 = await bob.decryptMessage(alice.userId, encrypted);
    expect(decrypted1).toBe('Secret message');
    
    // Attempt replay attack
    await expect(
      bob.decryptMessage(alice.userId, encrypted)
    ).rejects.toThrow('Duplicate message');
  });
  
  test('malformed message handling', async () => {
    const { alice, bob } = await setupTestUsers();
    
    const malformedMessages = [
      { type: 1, body: 'not-base64!' },
      { type: 1, body: Buffer.from('random').toString('base64') },
      { type: 999, body: Buffer.from('data').toString('base64') }
    ];
    
    for (const msg of malformedMessages) {
      await expect(
        bob.decryptMessage(alice.userId, msg)
      ).rejects.toThrow();
    }
    
    // Verify session not corrupted
    await alice.sendMessage(bob.userId, 'Valid message');
    const valid = await bob.getLatestMessage();
    expect(valid.text).toBe('Valid message');
  });
});
```

## Test Infrastructure

### Mock Factories
```typescript
// src/__tests__/libsignal/mocks/factories.ts
export class TestUserFactory {
  static async create(name: string): Promise<TestUser> {
    const userId = `test_${name}_${Date.now()}`;
    const deviceId = Math.floor(Math.random() * 10000);
    
    const store = new SignalProtocolStore();
    const identity = IdentityKeyPair.generate();
    const registrationId = generateRegistrationId();
    
    await store.storeIdentityKeyPair(identity);
    await store.storeLocalRegistrationId(registrationId);
    
    const service = new LibsignalService(store);
    await service.initialize();
    
    return new TestUser(userId, deviceId, service);
  }
}

export class TestMessageFactory {
  static text(content: string): TestMessage {
    return {
      type: 'text',
      content,
      timestamp: Date.now()
    };
  }
  
  static media(url: string, mimeType: string): TestMessage {
    return {
      type: 'media',
      url,
      mimeType,
      timestamp: Date.now()
    };
  }
  
  static generateBatch(count: number): TestMessage[] {
    return Array.from({ length: count }, (_, i) => 
      this.text(`Test message ${i}`)
    );
  }
}
```

### Test Utilities
```typescript
// src/__tests__/libsignal/utils/testHelpers.ts
export async function waitForCondition(
  condition: () => Promise<boolean>,
  timeout = 5000,
  interval = 100
): Promise<void> {
  const start = Date.now();
  
  while (Date.now() - start < timeout) {
    if (await condition()) {
      return;
    }
    await new Promise(resolve => setTimeout(resolve, interval));
  }
  
  throw new Error('Condition not met within timeout');
}

export async function measureOperation<T>(
  name: string,
  operation: () => Promise<T>
): Promise<{ result: T; duration: number }> {
  const start = performance.now();
  const result = await operation();
  const duration = performance.now() - start;
  
  console.log(`${name} took ${duration.toFixed(2)}ms`);
  
  return { result, duration };
}

export function generateTestData(size: 'small' | 'medium' | 'large'): string {
  const sizes = {
    small: 100,
    medium: 1000,
    large: 10000
  };
  
  return 'x'.repeat(sizes[size]);
}
```

## CI/CD Integration

### GitHub Actions Workflow
```yaml
# .github/workflows/libsignal-tests.yml
name: libsignal Tests

on:
  push:
    paths:
      - 'src/services/encryption/libsignal/**'
      - 'src/__tests__/libsignal/**'
  pull_request:
    paths:
      - 'src/services/encryption/libsignal/**'

jobs:
  unit-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '18'
      - run: yarn install
      - run: yarn test:libsignal:unit
      
  integration-tests:
    runs-on: ubuntu-latest
    services:
      firestore:
        image: gcr.io/google.com/cloudsdktool/cloud-sdk:emulators
        ports:
          - 8080:8080
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
      - run: yarn install
      - run: yarn test:libsignal:integration
        
  e2e-tests:
    strategy:
      matrix:
        platform: [ios, android]
        device: [simulator, emulator]
    runs-on: macos-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
      - run: yarn install
      - run: yarn e2e:libsignal:${{ matrix.platform }}
```

### Test Commands
```json
// package.json
{
  "scripts": {
    "test:libsignal": "jest src/__tests__/libsignal",
    "test:libsignal:unit": "jest src/__tests__/libsignal/unit",
    "test:libsignal:integration": "jest src/__tests__/libsignal/integration",
    "test:libsignal:e2e": "detox test -c libsignal",
    "test:libsignal:performance": "jest src/__tests__/libsignal/performance --runInBand",
    "test:libsignal:security": "jest src/__tests__/libsignal/security",
    "test:libsignal:coverage": "jest src/__tests__/libsignal --coverage",
    "test:libsignal:watch": "jest src/__tests__/libsignal --watch"
  }
}
```

## QA Process

### Manual Testing Checklist

#### Basic Functionality
- [ ] Can create new identity
- [ ] Can publish prekeys to Firebase
- [ ] Can establish session with new contact
- [ ] Can send and receive text messages
- [ ] Can send and receive media
- [ ] Messages arrive in correct order

#### Group Messaging
- [ ] Can create group
- [ ] Can add members to group
- [ ] Can remove members from group
- [ ] All members receive messages
- [ ] Key rotation works correctly

#### Edge Cases
- [ ] Handles offline scenarios
- [ ] Recovers from network errors
- [ ] Handles app backgrounding
- [ ] Works after app force quit
- [ ] Handles storage limitations

#### Security
- [ ] Safety numbers display correctly
- [ ] Identity verification works
- [ ] Untrusted identity warnings appear
- [ ] No plaintext leaks in logs
- [ ] Secure storage verified

### Regression Testing

#### Critical Paths
1. **New User Onboarding**
   - Generate identity
   - Publish keys
   - Send first message

2. **Existing User Migration**
   - Preserve existing chats
   - Migrate to Signal Protocol
   - Maintain message history

3. **Multi-Device Sync**
   - Link new device
   - Sync existing sessions
   - Messages appear on all devices

### Performance Acceptance Criteria

| Operation | Target | Maximum |
|-----------|--------|---------|
| Key Generation | < 50ms | 100ms |
| Message Encryption | < 30ms | 50ms |
| Message Decryption | < 20ms | 40ms |
| Session Creation | < 100ms | 200ms |
| Group Message | < 50ms | 100ms |
| Batch Encryption (100 msgs) | < 3s | 5s |

### Security Validation

1. **Cryptographic Review**
   - Code review by security expert
   - Automated security scanning
   - Dependency vulnerability checks

2. **Penetration Testing**
   - MITM attack scenarios
   - Replay attack testing
   - Message tampering detection

3. **Privacy Validation**
   - No metadata leaks
   - Proper key isolation
   - Secure key storage

## Monitoring & Alerts

### Production Metrics
```typescript
// src/services/monitoring/LibsignalMetrics.ts
export class LibsignalMetrics {
  static async trackOperation(
    operation: string,
    success: boolean,
    duration: number,
    metadata?: any
  ): Promise<void> {
    await analytics.track('libsignal_operation', {
      operation,
      success,
      duration,
      protocolVersion: 'signal_v1',
      ...metadata
    });
    
    // Alert on failures
    if (!success && this.isCriticalOperation(operation)) {
      await this.sendAlert({
        level: 'error',
        operation,
        metadata
      });
    }
    
    // Alert on performance degradation
    if (duration > this.getThreshold(operation)) {
      await this.sendAlert({
        level: 'warning',
        operation,
        duration,
        threshold: this.getThreshold(operation)
      });
    }
  }
}
```

## Success Criteria

### Launch Readiness
- [ ] All automated tests passing
- [ ] Manual QA checklist complete
- [ ] Performance targets met
- [ ] Security review passed
- [ ] No critical bugs in staging
- [ ] Rollback plan tested
- [ ] Monitoring configured
- [ ] Documentation complete

### Post-Launch Monitoring
- Error rate < 0.1%
- Performance within targets
- No security incidents
- User satisfaction maintained
- Successful message delivery > 99.9%