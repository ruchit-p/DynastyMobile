import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import { NativeModules } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import firestore from '@react-native-firebase/firestore';
import functions from '@react-native-firebase/functions';

// Import E2EE services
import { E2EEService } from '../../src/services/encryption/E2EEService';
import { GroupE2EEService } from '../../src/services/encryption/GroupE2EEService';
import { DoubleRatchetService } from '../../src/services/encryption/DoubleRatchetService';
import { KeyRotationService } from '../../src/services/encryption/KeyRotationService';
import { ChatEncryptionService } from '../../src/services/encryption/ChatEncryptionService';
import { MediaEncryptionService } from '../../src/services/encryption/MediaEncryptionService';
import { LibsignalService } from '../../src/services/encryption/libsignal/LibsignalService';
import { callFirebaseFunction } from '../../src/lib/errorUtils';

// Mock native modules
jest.mock('react-native', () => ({
  NativeModules: {
    RNLibsignal: {
      initializeSession: jest.fn(),
      encryptMessage: jest.fn(),
      decryptMessage: jest.fn(),
      generateKeyPair: jest.fn(),
      generatePreKeys: jest.fn(),
      generateSignedPreKey: jest.fn(),
      generateRegistrationId: jest.fn(),
      createSession: jest.fn(),
      processPreKeyBundle: jest.fn(),
    },
  },
  Platform: {
    OS: 'ios',
    Version: '14.0',
  },
}));

const mockLibsignal = NativeModules.RNLibsignal as jest.Mocked<any>;

describe('End-to-End Encryption Cross-Platform Integration Tests', () => {
  let e2eeService: E2EEService;
  let groupE2ee: GroupE2EEService;
  let chatEncryption: ChatEncryptionService;
  let libsignal: LibsignalService;

  beforeEach(async () => {
    jest.clearAllMocks();
    await AsyncStorage.clear();
    
    // Initialize services
    e2eeService = E2EEService.getInstance();
    groupE2ee = GroupE2EEService.getInstance();
    chatEncryption = ChatEncryptionService.getInstance();
    libsignal = LibsignalService.getInstance();
    
    // Mock initial setup
    mockLibsignal.generateRegistrationId.mockResolvedValue(12345);
    mockLibsignal.generateKeyPair.mockResolvedValue({
      publicKey: 'mock-public-key',
      privateKey: 'mock-private-key',
    });
  });

  describe('Signal Protocol Implementation', () => {
    it('should establish secure session between two devices', async () => {
      const aliceId = 'alice-123';
      const bobId = 'bob-456';
      
      // Alice generates identity and pre-keys
      const aliceIdentity = await libsignal.generateIdentityKeyPair();
      const alicePreKeys = await libsignal.generatePreKeys(0, 100);
      const aliceSignedPreKey = await libsignal.generateSignedPreKey(
        aliceIdentity.privateKey,
        0
      );
      
      // Bob fetches Alice's pre-key bundle
      const aliceBundle = {
        registrationId: 12345,
        identityKey: aliceIdentity.publicKey,
        signedPreKey: {
          keyId: aliceSignedPreKey.keyId,
          publicKey: aliceSignedPreKey.keyPair.publicKey,
          signature: aliceSignedPreKey.signature,
        },
        preKey: {
          keyId: alicePreKeys[0].keyId,
          publicKey: alicePreKeys[0].keyPair.publicKey,
        },
      };
      
      // Bob processes pre-key bundle and creates session
      await libsignal.processPreKeyBundle(bobId, aliceId, aliceBundle);
      
      // Verify session established
      const hasSession = await libsignal.hasSession(aliceId);
      expect(hasSession).toBe(true);
    });

    it('should handle double ratchet algorithm correctly', async () => {
      const aliceId = 'alice-123';
      const bobId = 'bob-456';
      
      // Establish session
      await e2eeService.establishSession(aliceId, bobId);
      
      // Alice sends multiple messages
      const messages = [
        'Hello Bob',
        'How are you?',
        'This is Alice',
      ];
      
      const encryptedMessages = [];
      for (const msg of messages) {
        const encrypted = await e2eeService.encryptMessage(aliceId, bobId, msg);
        encryptedMessages.push(encrypted);
      }
      
      // Verify each message has different ratchet keys
      const ratchetKeys = encryptedMessages.map(m => m.ratchetKey);
      expect(new Set(ratchetKeys).size).toBe(ratchetKeys.length);
      
      // Bob decrypts messages out of order
      const decrypted2 = await e2eeService.decryptMessage(
        bobId,
        aliceId,
        encryptedMessages[2]
      );
      const decrypted0 = await e2eeService.decryptMessage(
        bobId,
        aliceId,
        encryptedMessages[0]
      );
      const decrypted1 = await e2eeService.decryptMessage(
        bobId,
        aliceId,
        encryptedMessages[1]
      );
      
      expect(decrypted0).toBe(messages[0]);
      expect(decrypted1).toBe(messages[1]);
      expect(decrypted2).toBe(messages[2]);
    });

    it('should handle pre-key exhaustion and replenishment', async () => {
      const userId = 'user-123';
      
      // Generate initial pre-keys
      await libsignal.generatePreKeys(0, 10);
      
      // Simulate using up pre-keys
      for (let i = 0; i < 8; i++) {
        await libsignal.consumePreKey(i);
      }
      
      // Check remaining pre-keys
      const remaining = await libsignal.getPreKeyCount();
      expect(remaining).toBe(2);
      
      // Service should automatically replenish
      await e2eeService.checkAndReplenishPreKeys(userId);
      
      const afterReplenish = await libsignal.getPreKeyCount();
      expect(afterReplenish).toBeGreaterThan(50);
    });
  });

  describe('Group Messaging Encryption', () => {
    it('should establish group session with multiple participants', async () => {
      const groupId = 'family-group-123';
      const participants = ['alice-123', 'bob-456', 'charlie-789'];
      
      // Create group session
      await groupE2ee.createGroupSession(groupId, participants);
      
      // Verify all participants have group keys
      for (const participant of participants) {
        const hasKey = await groupE2ee.hasGroupKey(participant, groupId);
        expect(hasKey).toBe(true);
      }
    });

    it('should handle member addition to existing group', async () => {
      const groupId = 'family-group-123';
      const existingMembers = ['alice-123', 'bob-456'];
      const newMember = 'david-012';
      
      // Create initial group
      await groupE2ee.createGroupSession(groupId, existingMembers);
      
      // Add new member
      await groupE2ee.addMemberToGroup(groupId, newMember);
      
      // Verify new member can decrypt group messages
      const testMessage = 'Welcome to the group!';
      const encrypted = await groupE2ee.encryptGroupMessage(
        'alice-123',
        groupId,
        testMessage
      );
      
      const decrypted = await groupE2ee.decryptGroupMessage(
        newMember,
        groupId,
        encrypted
      );
      
      expect(decrypted).toBe(testMessage);
    });

    it('should handle member removal and key rotation', async () => {
      const groupId = 'family-group-123';
      const members = ['alice-123', 'bob-456', 'charlie-789'];
      const removedMember = 'charlie-789';
      
      // Create group
      await groupE2ee.createGroupSession(groupId, members);
      
      // Store old key for verification
      const oldKey = await groupE2ee.getGroupKey('alice-123', groupId);
      
      // Remove member
      await groupE2ee.removeMemberFromGroup(groupId, removedMember);
      
      // Verify key rotation occurred
      const newKey = await groupE2ee.getGroupKey('alice-123', groupId);
      expect(newKey).not.toBe(oldKey);
      
      // Verify removed member cannot decrypt new messages
      const message = 'Secret message after removal';
      const encrypted = await groupE2ee.encryptGroupMessage(
        'alice-123',
        groupId,
        message
      );
      
      await expect(
        groupE2ee.decryptGroupMessage(removedMember, groupId, encrypted)
      ).rejects.toThrow('No group key available');
    });

    it('should optimize large group message encryption', async () => {
      const groupId = 'large-family-123';
      const members = Array.from({ length: 50 }, (_, i) => `member-${i}`);
      
      // Create large group
      await groupE2ee.createGroupSession(groupId, members);
      
      // Measure encryption time
      const message = 'Announcement to all family members';
      const startTime = Date.now();
      
      const encrypted = await groupE2ee.encryptGroupMessage(
        members[0],
        groupId,
        message
      );
      
      const encryptionTime = Date.now() - startTime;
      
      // Should use sender key for efficiency
      expect(encrypted.usedSenderKey).toBe(true);
      expect(encryptionTime).toBeLessThan(100); // Should be fast
      
      // Verify all members can decrypt
      const decryptionPromises = members.slice(1, 10).map(member =>
        groupE2ee.decryptGroupMessage(member, groupId, encrypted)
      );
      
      const decrypted = await Promise.all(decryptionPromises);
      expect(decrypted.every(msg => msg === message)).toBe(true);
    });
  });

  describe('Key Rotation and Management', () => {
    it('should rotate keys based on time policy', async () => {
      const userId = 'user-123';
      
      // Set rotation policy
      await KeyRotationService.getInstance().setRotationPolicy({
        identityKey: 365 * 24 * 60 * 60 * 1000, // 1 year
        signedPreKey: 30 * 24 * 60 * 60 * 1000, // 30 days
        preKeys: 7 * 24 * 60 * 60 * 1000, // 7 days
      });
      
      // Fast-forward time
      jest.advanceTimersByTime(31 * 24 * 60 * 60 * 1000);
      
      // Check for required rotations
      const rotations = await KeyRotationService.getInstance()
        .checkRequiredRotations(userId);
      
      expect(rotations).toContain('signedPreKey');
      expect(rotations).not.toContain('identityKey');
    });

    it('should handle emergency key rotation', async () => {
      const userId = 'user-123';
      const reason = 'Device compromised';
      
      // Get current keys
      const oldKeys = await e2eeService.getUserKeys(userId);
      
      // Perform emergency rotation
      await KeyRotationService.getInstance().emergencyRotation(userId, reason);
      
      // Verify all keys changed
      const newKeys = await e2eeService.getUserKeys(userId);
      
      expect(newKeys.identityKey).not.toBe(oldKeys.identityKey);
      expect(newKeys.signedPreKey).not.toBe(oldKeys.signedPreKey);
      
      // Verify audit log
      const auditLog = await KeyRotationService.getInstance()
        .getRotationHistory(userId);
      
      expect(auditLog[0]).toEqual(
        expect.objectContaining({
          reason,
          type: 'emergency',
          timestamp: expect.any(Number),
        })
      );
    });

    it('should maintain message decryption after key rotation', async () => {
      const aliceId = 'alice-123';
      const bobId = 'bob-456';
      
      // Establish session and send message
      await e2eeService.establishSession(aliceId, bobId);
      const message1 = 'Message before rotation';
      const encrypted1 = await e2eeService.encryptMessage(aliceId, bobId, message1);
      
      // Rotate Alice's keys
      await KeyRotationService.getInstance().rotateUserKeys(aliceId);
      
      // Send new message with rotated keys
      const message2 = 'Message after rotation';
      const encrypted2 = await e2eeService.encryptMessage(aliceId, bobId, message2);
      
      // Bob should decrypt both messages
      const decrypted1 = await e2eeService.decryptMessage(bobId, aliceId, encrypted1);
      const decrypted2 = await e2eeService.decryptMessage(bobId, aliceId, encrypted2);
      
      expect(decrypted1).toBe(message1);
      expect(decrypted2).toBe(message2);
    });
  });

  describe('Media Encryption', () => {
    it('should encrypt large media files efficiently', async () => {
      const mediaService = MediaEncryptionService.getInstance();
      
      // Mock large file
      const largeFile = {
        uri: 'file:///video.mp4',
        size: 100 * 1024 * 1024, // 100MB
        type: 'video/mp4',
      };
      
      // Encrypt file
      const startTime = Date.now();
      const encrypted = await mediaService.encryptMedia(largeFile);
      const encryptionTime = Date.now() - startTime;
      
      // Should use streaming encryption
      expect(encrypted.chunked).toBe(true);
      expect(encrypted.chunks).toBeGreaterThan(1);
      expect(encryptionTime).toBeLessThan(5000); // Should complete in 5 seconds
    });

    it('should generate secure thumbnail for encrypted media', async () => {
      const mediaService = MediaEncryptionService.getInstance();
      
      const imageFile = {
        uri: 'file:///photo.jpg',
        size: 5 * 1024 * 1024,
        type: 'image/jpeg',
      };
      
      const result = await mediaService.encryptMediaWithThumbnail(imageFile);
      
      expect(result.encrypted).toBeDefined();
      expect(result.thumbnail).toBeDefined();
      expect(result.thumbnail.encrypted).toBe(true);
      expect(result.thumbnail.size).toBeLessThan(100 * 1024); // Thumbnail < 100KB
    });

    it('should handle progressive media decryption', async () => {
      const mediaService = MediaEncryptionService.getInstance();
      
      const encryptedMedia = {
        id: 'media-123',
        chunks: 10,
        chunkSize: 1024 * 1024,
        key: 'encrypted-media-key',
      };
      
      const progressCallback = jest.fn();
      
      // Decrypt with progress
      await mediaService.decryptMediaProgressive(
        encryptedMedia,
        progressCallback
      );
      
      // Verify progress callbacks
      expect(progressCallback).toHaveBeenCalledTimes(10);
      expect(progressCallback).toHaveBeenLastCalledWith({
        percentage: 100,
        bytesDecrypted: 10 * 1024 * 1024,
      });
    });
  });

  describe('Cross-Platform Message Compatibility', () => {
    it('should ensure iOS and Android message compatibility', async () => {
      // Mock iOS message format
      const iosMessage = {
        type: 3, // PREKEY_MESSAGE
        registrationId: 12345,
        preKeyId: 1,
        signedPreKeyId: 0,
        baseKey: 'ios-base-key',
        identityKey: 'ios-identity-key',
        message: 'ios-encrypted-content',
      };
      
      // Mock Android message format
      const androidMessage = {
        type: 3,
        registrationId: 12345,
        preKeyId: 1,
        signedPreKeyId: 0,
        baseKey: 'android-base-key',
        identityKey: 'android-identity-key',
        message: 'android-encrypted-content',
      };
      
      // Verify format compatibility
      const iosValid = await libsignal.validateMessageFormat(iosMessage);
      const androidValid = await libsignal.validateMessageFormat(androidMessage);
      
      expect(iosValid).toBe(true);
      expect(androidValid).toBe(true);
    });

    it('should handle protocol version differences', async () => {
      const v3Message = {
        version: 3,
        content: 'encrypted-v3',
      };
      
      const v4Message = {
        version: 4,
        content: 'encrypted-v4',
        additionalData: 'new-in-v4',
      };
      
      // Should handle both versions
      const v3Decrypted = await e2eeService.handleVersionedMessage(v3Message);
      const v4Decrypted = await e2eeService.handleVersionedMessage(v4Message);
      
      expect(v3Decrypted).toBeDefined();
      expect(v4Decrypted).toBeDefined();
    });
  });

  describe('Security Edge Cases', () => {
    it('should prevent replay attacks', async () => {
      const aliceId = 'alice-123';
      const bobId = 'bob-456';
      
      await e2eeService.establishSession(aliceId, bobId);
      
      // Alice sends message
      const message = 'Original message';
      const encrypted = await e2eeService.encryptMessage(aliceId, bobId, message);
      
      // Bob decrypts successfully
      const decrypted1 = await e2eeService.decryptMessage(bobId, aliceId, encrypted);
      expect(decrypted1).toBe(message);
      
      // Replay attempt should fail
      await expect(
        e2eeService.decryptMessage(bobId, aliceId, encrypted)
      ).rejects.toThrow('Message already processed');
    });

    it('should detect and handle corrupted messages', async () => {
      const aliceId = 'alice-123';
      const bobId = 'bob-456';
      
      await e2eeService.establishSession(aliceId, bobId);
      
      const message = 'Test message';
      const encrypted = await e2eeService.encryptMessage(aliceId, bobId, message);
      
      // Corrupt the message
      encrypted.ciphertext = encrypted.ciphertext.replace('a', 'b');
      
      await expect(
        e2eeService.decryptMessage(bobId, aliceId, encrypted)
      ).rejects.toThrow('Message authentication failed');
    });

    it('should handle identity key changes securely', async () => {
      const aliceId = 'alice-123';
      const bobId = 'bob-456';
      
      // Establish initial session
      await e2eeService.establishSession(aliceId, bobId);
      const aliceIdentity1 = await e2eeService.getIdentityKey(aliceId);
      
      // Simulate Alice's identity key change (new device)
      await e2eeService.resetIdentity(aliceId);
      const aliceIdentity2 = await e2eeService.getIdentityKey(aliceId);
      
      expect(aliceIdentity2).not.toBe(aliceIdentity1);
      
      // Bob should get security warning
      const securityCheck = await e2eeService.verifyIdentity(bobId, aliceId);
      expect(securityCheck.changed).toBe(true);
      expect(securityCheck.requiresVerification).toBe(true);
    });
  });

  describe('Performance and Optimization', () => {
    it('should batch encrypt messages for multiple recipients', async () => {
      const senderId = 'sender-123';
      const recipients = Array.from({ length: 20 }, (_, i) => `recipient-${i}`);
      const message = 'Broadcast message';
      
      // Establish sessions
      for (const recipient of recipients) {
        await e2eeService.establishSession(senderId, recipient);
      }
      
      // Batch encrypt
      const startTime = Date.now();
      const encrypted = await e2eeService.batchEncryptMessage(
        senderId,
        recipients,
        message
      );
      const batchTime = Date.now() - startTime;
      
      // Compare with individual encryption
      const individualStart = Date.now();
      for (const recipient of recipients) {
        await e2eeService.encryptMessage(senderId, recipient, message);
      }
      const individualTime = Date.now() - individualStart;
      
      // Batch should be significantly faster
      expect(batchTime).toBeLessThan(individualTime / 2);
      expect(encrypted.length).toBe(recipients.length);
    });

    it('should cache session data for performance', async () => {
      const aliceId = 'alice-123';
      const bobId = 'bob-456';
      
      await e2eeService.establishSession(aliceId, bobId);
      
      // First message (cold cache)
      const cold1 = Date.now();
      await e2eeService.encryptMessage(aliceId, bobId, 'Message 1');
      const coldTime = Date.now() - cold1;
      
      // Subsequent messages (warm cache)
      const warmTimes = [];
      for (let i = 2; i <= 5; i++) {
        const start = Date.now();
        await e2eeService.encryptMessage(aliceId, bobId, `Message ${i}`);
        warmTimes.push(Date.now() - start);
      }
      
      const avgWarmTime = warmTimes.reduce((a, b) => a + b) / warmTimes.length;
      expect(avgWarmTime).toBeLessThan(coldTime / 2);
    });
  });

  describe('Firebase Integration', () => {
    it('should sync encrypted messages through Firebase', async () => {
      const senderId = 'sender-123';
      const recipientId = 'recipient-456';
      const chatId = 'chat-789';
      
      // Encrypt message
      const message = 'Hello via Firebase';
      const encrypted = await chatEncryption.encryptAndSend({
        senderId,
        recipientId,
        chatId,
        content: message,
      });
      
      // Verify Firebase function call
      expect(callFirebaseFunction).toHaveBeenCalledWith(
        'messaging-sendMessage',
        expect.objectContaining({
          chatId,
          encryptedContent: expect.any(String),
          senderKeyDistribution: expect.any(String),
        })
      );
    });

    it('should handle pre-key bundle fetching from Firebase', async () => {
      const userId = 'user-123';
      const targetId = 'target-456';
      
      // Mock Firebase response
      const mockBundle = {
        identityKey: 'firebase-identity-key',
        signedPreKey: {
          keyId: 1,
          publicKey: 'firebase-signed-key',
          signature: 'firebase-signature',
        },
        preKey: {
          keyId: 10,
          publicKey: 'firebase-pre-key',
        },
      };
      
      jest.spyOn(functions(), 'httpsCallable')
        .mockReturnValue(jest.fn().mockResolvedValue({ data: mockBundle }));
      
      // Fetch bundle
      const bundle = await e2eeService.fetchPreKeyBundle(targetId);
      
      expect(bundle).toEqual(mockBundle);
      expect(functions().httpsCallable).toHaveBeenCalledWith(
        'encryption-getPreKeyBundle'
      );
    });
  });
});

describe('E2EE Stress Tests', () => {
  it('should handle rapid message exchange', async () => {
    const aliceId = 'alice-stress';
    const bobId = 'bob-stress';
    
    await E2EEService.getInstance().establishSession(aliceId, bobId);
    
    const messageCount = 100;
    const messages = Array.from({ length: messageCount }, (_, i) => 
      `Rapid message ${i}`
    );
    
    // Alice sends rapidly
    const encryptedBatch = await Promise.all(
      messages.map(msg => 
        E2EEService.getInstance().encryptMessage(aliceId, bobId, msg)
      )
    );
    
    // Bob decrypts all
    const decryptedBatch = await Promise.all(
      encryptedBatch.map(enc =>
        E2EEService.getInstance().decryptMessage(bobId, aliceId, enc)
      )
    );
    
    expect(decryptedBatch).toEqual(messages);
  });

  it('should handle concurrent group operations', async () => {
    const groupId = 'stress-group';
    const memberCount = 30;
    const members = Array.from({ length: memberCount }, (_, i) => `member-${i}`);
    
    // Create group
    await GroupE2EEService.getInstance().createGroupSession(groupId, members);
    
    // All members send messages concurrently
    const messagePromises = members.map((sender, i) =>
      GroupE2EEService.getInstance().encryptGroupMessage(
        sender,
        groupId,
        `Message from ${sender}`
      )
    );
    
    const allEncrypted = await Promise.all(messagePromises);
    expect(allEncrypted.length).toBe(memberCount);
    
    // Random members decrypt random messages
    const decryptionTests = [];
    for (let i = 0; i < 50; i++) {
      const randomMember = members[Math.floor(Math.random() * memberCount)];
      const randomMessage = allEncrypted[Math.floor(Math.random() * memberCount)];
      
      decryptionTests.push(
        GroupE2EEService.getInstance().decryptGroupMessage(
          randomMember,
          groupId,
          randomMessage
        )
      );
    }
    
    const results = await Promise.all(decryptionTests);
    expect(results.every(r => r.startsWith('Message from'))).toBe(true);
  });
});