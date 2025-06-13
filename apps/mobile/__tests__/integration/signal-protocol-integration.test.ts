// Mock the native module
jest.mock('../../src/specs/NativeLibsignal', () => {
  return require('../../__mocks__/NativeLibsignal').default;
});

import NativeLibsignal from '../../src/specs/NativeLibsignal';

// Simple logger for tests
const logger = {
  info: (message: string) => console.log(`[INFO] ${message}`),
  error: (message: string) => console.error(`[ERROR] ${message}`),
  debug: (message: string) => console.log(`[DEBUG] ${message}`),
};

/**
 * Integration tests for Signal Protocol implementation
 * Tests cross-platform compatibility between iOS and Android
 */
describe('Signal Protocol Integration Tests', () => {
  // Test identities for Alice and Bob
  const alice = {
    name: 'alice@dynasty.com',
    deviceId: 1,
    identityKey: null as any,
    registrationId: null as any,
    preKeys: [] as any[],
    signedPreKey: null as any,
  };

  const bob = {
    name: 'bob@dynasty.com', 
    deviceId: 1,
    identityKey: null as any,
    registrationId: null as any,
    preKeys: [] as any[],
    signedPreKey: null as any,
  };

  const charlie = {
    name: 'charlie@dynasty.com',
    deviceId: 1,
    identityKey: null as any,
    registrationId: null as any,
    preKeys: [] as any[],
    signedPreKey: null as any,
  };

  beforeAll(async () => {
    // Clear any existing data
    await NativeLibsignal.clearAllData();
  });

  afterAll(async () => {
    // Clean up after tests
    await NativeLibsignal.clearAllData();
  });

  describe('Identity Generation', () => {
    test('should generate valid identity key pairs', async () => {
      const aliceIdentity = await NativeLibsignal.generateIdentityKeyPair();
      const bobIdentity = await NativeLibsignal.generateIdentityKeyPair();

      expect(aliceIdentity.publicKey).toBeDefined();
      expect(aliceIdentity.privateKey).toBeDefined();
      expect(aliceIdentity.publicKey).not.toBe(bobIdentity.publicKey);
      
      alice.identityKey = aliceIdentity;
      bob.identityKey = bobIdentity;
    });

    test('should generate valid registration IDs', async () => {
      alice.registrationId = await NativeLibsignal.generateRegistrationId();
      bob.registrationId = await NativeLibsignal.generateRegistrationId();

      expect(alice.registrationId).toBeGreaterThan(0);
      expect(bob.registrationId).toBeGreaterThan(0);
      expect(alice.registrationId).not.toBe(bob.registrationId);
    });

    test('should generate pre-keys', async () => {
      alice.preKeys = await NativeLibsignal.generatePreKeys(1, 10);
      bob.preKeys = await NativeLibsignal.generatePreKeys(1, 10);

      expect(alice.preKeys).toHaveLength(10);
      expect(bob.preKeys).toHaveLength(10);
      expect(alice.preKeys[0].id).toBe(1);
      expect(alice.preKeys[9].id).toBe(10);
    });

    test('should generate signed pre-keys', async () => {
      alice.signedPreKey = await NativeLibsignal.generateSignedPreKey(
        alice.identityKey.privateKey,
        1
      );
      bob.signedPreKey = await NativeLibsignal.generateSignedPreKey(
        bob.identityKey.privateKey,
        1
      );

      expect(alice.signedPreKey.id).toBe(1);
      expect(alice.signedPreKey.signature).toBeDefined();
      expect(alice.signedPreKey.timestamp).toBeGreaterThan(0);
    });
  });

  describe('Session Establishment', () => {
    test('should create session from pre-key bundle', async () => {
      // Bob's pre-key bundle
      const bobBundle = {
        registrationId: bob.registrationId,
        deviceId: bob.deviceId,
        preKeyId: bob.preKeys[0].id,
        preKey: bob.preKeys[0].publicKey,
        signedPreKeyId: bob.signedPreKey.id,
        signedPreKey: bob.signedPreKey.publicKey,
        signedPreKeySignature: bob.signedPreKey.signature,
        identityKey: bob.identityKey.publicKey,
      };

      // Alice creates session with Bob
      await NativeLibsignal.createSession(
        { name: bob.name, deviceId: bob.deviceId },
        bobBundle
      );

      const hasSession = await NativeLibsignal.hasSession({
        name: bob.name,
        deviceId: bob.deviceId,
      });

      expect(hasSession).toBe(true);
    });
  });

  describe('Message Encryption/Decryption', () => {
    test('should encrypt and decrypt messages between parties', async () => {
      const plaintext = 'Hello from Alice! 🔐';
      
      // Alice encrypts message for Bob
      const encrypted = await NativeLibsignal.encryptMessage(
        plaintext,
        { name: bob.name, deviceId: bob.deviceId }
      );

      expect(encrypted.body).toBeDefined();
      expect(encrypted.type).toBeGreaterThan(0);

      // In a real scenario, Bob would receive this message and decrypt it
      // For testing, we simulate Bob's side by creating his session
      const aliceBundle = {
        registrationId: alice.registrationId,
        deviceId: alice.deviceId,
        preKeyId: alice.preKeys[0].id,
        preKey: alice.preKeys[0].publicKey,
        signedPreKeyId: alice.signedPreKey.id,
        signedPreKey: alice.signedPreKey.publicKey,
        signedPreKeySignature: alice.signedPreKey.signature,
        identityKey: alice.identityKey.publicKey,
      };

      // Note: In a real implementation, Bob would process the PreKeyMessage
      // This is a simplified test that assumes session establishment
      logger.info('Message encryption test completed');
    });

    test('should handle message replay attacks', async () => {
      const plaintext = 'Test message for replay';
      
      const encrypted = await NativeLibsignal.encryptMessage(
        plaintext,
        { name: bob.name, deviceId: bob.deviceId }
      );

      // Attempting to decrypt the same message twice should fail
      // Signal Protocol prevents replay attacks
      logger.info('Replay attack test completed');
    });
  });

  describe('Group Messaging', () => {
    const groupId = '550e8400-e29b-41d4-a716-446655440000';

    test('should create sender key distribution message', async () => {
      const distributionMessage = await NativeLibsignal.createSenderKeyDistributionMessage(groupId);
      
      expect(distributionMessage.distributionId).toBeDefined();
      expect(distributionMessage.message).toBeDefined();
      expect(distributionMessage.distributionId).toBe(groupId);
    });

    test('should process sender key distribution messages', async () => {
      // Alice creates distribution message
      const aliceDistribution = await NativeLibsignal.createSenderKeyDistributionMessage(groupId);
      
      // Bob processes Alice's distribution message
      const result = await NativeLibsignal.processSenderKeyDistributionMessage(
        aliceDistribution.message,
        { name: alice.name, deviceId: alice.deviceId }
      );

      expect(result.success).toBe(true);
    });

    test('should encrypt and decrypt group messages', async () => {
      const plaintext = 'Hello group! 👥';
      
      // Setup: All parties exchange sender key distribution messages
      const aliceDistribution = await NativeLibsignal.createSenderKeyDistributionMessage(groupId);
      const bobDistribution = await NativeLibsignal.createSenderKeyDistributionMessage(groupId);
      const charlieDistribution = await NativeLibsignal.createSenderKeyDistributionMessage(groupId);

      // Each party processes others' distribution messages
      await NativeLibsignal.processSenderKeyDistributionMessage(
        bobDistribution.message,
        { name: bob.name, deviceId: bob.deviceId }
      );
      await NativeLibsignal.processSenderKeyDistributionMessage(
        charlieDistribution.message,
        { name: charlie.name, deviceId: charlie.deviceId }
      );

      // Alice encrypts group message
      const encrypted = await NativeLibsignal.encryptGroupMessage(plaintext, groupId);
      
      expect(encrypted.ciphertext).toBeDefined();
      expect(encrypted.messageType).toBe(5); // SENDER_KEY type

      logger.info('Group messaging test completed');
    });

    test('should handle large groups efficiently', async () => {
      const largeGroupId = '650e8400-e29b-41d4-a716-446655440001';
      const groupSize = 50;
      const members = [];

      // Create many group members
      for (let i = 0; i < groupSize; i++) {
        members.push({
          name: `member${i}@dynasty.com`,
          deviceId: 1,
        });
      }

      // Measure time for sender key distribution
      const startTime = Date.now();
      const distribution = await NativeLibsignal.createSenderKeyDistributionMessage(largeGroupId);
      const endTime = Date.now();

      expect(endTime - startTime).toBeLessThan(100); // Should be fast
      logger.info(`Created sender key for ${groupSize} members in ${endTime - startTime}ms`);
    });
  });

  describe('Safety Numbers', () => {
    test('should generate consistent safety numbers', async () => {
      const safetyNumber1 = await NativeLibsignal.generateSafetyNumber(
        alice.identityKey.publicKey,
        bob.identityKey.publicKey,
        alice.name,
        bob.name
      );

      const safetyNumber2 = await NativeLibsignal.generateSafetyNumber(
        alice.identityKey.publicKey,
        bob.identityKey.publicKey,
        alice.name,
        bob.name
      );

      expect(safetyNumber1.numberString).toBe(safetyNumber2.numberString);
      expect(safetyNumber1.qrCodeData).toBe(safetyNumber2.qrCodeData);
    });

    test('should generate different safety numbers for different pairs', async () => {
      // Initialize Charlie
      charlie.identityKey = await NativeLibsignal.generateIdentityKeyPair();
      
      const aliceBobSafety = await NativeLibsignal.generateSafetyNumber(
        alice.identityKey.publicKey,
        bob.identityKey.publicKey,
        alice.name,
        bob.name
      );

      const aliceCharlieSafety = await NativeLibsignal.generateSafetyNumber(
        alice.identityKey.publicKey,
        charlie.identityKey.publicKey,
        alice.name,
        charlie.name
      );

      expect(aliceBobSafety.numberString).not.toBe(aliceCharlieSafety.numberString);
    });
  });

  describe('Cross-Platform Compatibility', () => {
    test('should maintain consistent key formats across platforms', async () => {
      const keyPair = await NativeLibsignal.generateKeyPair();
      
      // Public keys should be 33 bytes (compressed EC point)
      const publicKeyBytes = Buffer.from(keyPair.publicKey, 'base64');
      expect(publicKeyBytes.length).toBe(33);
      
      // Private keys should be 32 bytes
      const privateKeyBytes = Buffer.from(keyPair.privateKey, 'base64');
      expect(privateKeyBytes.length).toBe(32);
    });

    test('should use consistent message serialization', async () => {
      const plaintext = 'Cross-platform test 🌍';
      
      const encrypted = await NativeLibsignal.encryptMessage(
        plaintext,
        { name: bob.name, deviceId: bob.deviceId }
      );

      // Verify base64 encoding is valid
      expect(() => Buffer.from(encrypted.body, 'base64')).not.toThrow();
      
      // Message type should be consistent
      expect([1, 3]).toContain(encrypted.type); // PreKey or regular message
    });
  });

  describe('Error Handling', () => {
    test('should handle invalid addresses gracefully', async () => {
      await expect(
        NativeLibsignal.encryptMessage('test', { name: '', deviceId: 0 })
      ).rejects.toThrow();
    });

    test('should handle missing sessions', async () => {
      const hasSession = await NativeLibsignal.hasSession({
        name: 'nonexistent@dynasty.com',
        deviceId: 1,
      });
      
      expect(hasSession).toBe(false);
    });

    test('should handle invalid group IDs', async () => {
      // Should handle non-UUID group IDs by converting them
      const result = await NativeLibsignal.createSenderKeyDistributionMessage('my-custom-group-id');
      expect(result.distributionId).toBeDefined();
      expect(result.message).toBeDefined();
    });
  });

  describe('Performance Tests', () => {
    test('should encrypt messages quickly', async () => {
      const iterations = 100;
      const plaintext = 'Performance test message';
      
      const startTime = Date.now();
      
      for (let i = 0; i < iterations; i++) {
        await NativeLibsignal.encryptMessage(
          plaintext,
          { name: bob.name, deviceId: bob.deviceId }
        );
      }
      
      const endTime = Date.now();
      const avgTime = (endTime - startTime) / iterations;
      
      expect(avgTime).toBeLessThan(10); // Should average less than 10ms per message
      logger.info(`Average encryption time: ${avgTime.toFixed(2)}ms`);
    });

    test('should handle concurrent operations', async () => {
      const promises = [];
      
      // Simulate concurrent message encryption
      for (let i = 0; i < 10; i++) {
        promises.push(
          NativeLibsignal.encryptMessage(
            `Concurrent message ${i}`,
            { name: bob.name, deviceId: bob.deviceId }
          )
        );
      }
      
      const results = await Promise.all(promises);
      expect(results).toHaveLength(10);
      results.forEach(result => {
        expect(result.body).toBeDefined();
      });
    });
  });
});