import { LibsignalService } from '../LibsignalService';
import { ChatEncryptionService } from '../../ChatEncryptionService';
import { getFirebaseDb, getFirebaseAuth } from '../../../../lib/firebase';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { logger } from '../../../LoggingService';

// Mock dependencies
jest.mock('@react-native-async-storage/async-storage');
jest.mock('../../../../lib/firebase');
jest.mock('../../../LoggingService');
jest.mock('../../../../lib/errorUtils', () => ({
  callFirebaseFunction: jest.fn(),
}));

// Mock native module
jest.mock('../../../../specs/NativeLibsignal', () => ({
  default: {
    initialize: jest.fn().mockResolvedValue(true),
    generateIdentityKeyPair: jest.fn().mockResolvedValue({
      publicKey: 'test-public-key',
      privateKey: 'test-private-key',
    }),
    generateRegistrationId: jest.fn().mockResolvedValue(12345),
    generatePreKeys: jest.fn().mockImplementation((start, count) => 
      Promise.resolve(
        Array.from({ length: count }, (_, i) => ({
          id: start + i,
          publicKey: `prekey-${start + i}`,
        }))
      )
    ),
    generateSignedPreKey: jest.fn().mockResolvedValue({
      id: 1,
      publicKey: 'signed-public',
      privateKey: 'signed-private',
      signature: 'signature',
      timestamp: Date.now(),
    }),
    storePreKey: jest.fn().mockResolvedValue(undefined),
    storeSignedPreKey: jest.fn().mockResolvedValue(undefined),
    saveIdentityKeyPair: jest.fn().mockResolvedValue(undefined),
    hasSession: jest.fn().mockResolvedValue(false),
    createSession: jest.fn().mockResolvedValue(undefined),
    encryptMessage: jest.fn().mockResolvedValue({
      type: 3,
      body: 'encrypted-message-body',
    }),
    decryptMessage: jest.fn().mockResolvedValue({
      plaintext: 'Hello, Signal!',
      messageType: 3,
    }),
    decryptPreKeyMessage: jest.fn().mockResolvedValue({
      plaintext: 'Hello from new device!',
      messageType: 1,
    }),
    generateSafetyNumber: jest.fn().mockResolvedValue({
      numberString: '12345678901234567890',
      qrCodeData: 'qr-data',
    }),
    verifySafetyNumber: jest.fn().mockResolvedValue(true),
    clearAllData: jest.fn().mockResolvedValue(undefined),
  },
}));

describe('Signal Protocol Integration Tests', () => {
  let chatService: ChatEncryptionService;
  let libsignalService: LibsignalService;
  let mockDb: any;
  let mockAuth: any;

  beforeEach(async () => {
    jest.clearAllMocks();
    
    // Reset singletons
    (ChatEncryptionService as any).instance = null;
    (LibsignalService as any).instance = null;
    
    // Mock Firebase
    mockDb = {
      collection: jest.fn().mockReturnThis(),
      doc: jest.fn().mockReturnThis(),
      get: jest.fn(),
      set: jest.fn().mockResolvedValue(undefined),
      update: jest.fn().mockResolvedValue(undefined),
      batch: jest.fn().mockReturnValue({
        set: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
        commit: jest.fn().mockResolvedValue(undefined),
      }),
    };
    
    mockAuth = {
      currentUser: { uid: 'test-user-id', displayName: 'Test User' },
    };
    
    (getFirebaseDb as jest.Mock).mockReturnValue(mockDb);
    (getFirebaseAuth as jest.Mock).mockReturnValue(mockAuth);
    
    // Initialize services
    libsignalService = LibsignalService.getInstance();
    await libsignalService.initialize();
    
    chatService = ChatEncryptionService.getInstance();
  });

  afterEach(async () => {
    await AsyncStorage.clear();
  });

  describe('End-to-End Encryption Flow', () => {
    it('should complete full encryption flow between two users', async () => {
      const senderId = 'alice123';
      const recipientId = 'bob456';
      const chatId = 'chat123';
      const message = 'Hello, Bob! This is encrypted with Signal Protocol.';

      // Mock chat document
      mockDb.get.mockResolvedValueOnce({
        exists: true,
        data: () => ({
          id: chatId,
          type: 'direct',
          participants: [senderId, recipientId],
          encryptionEnabled: true,
        }),
      });

      // Mock recipient's Signal bundle
      const { callFirebaseFunction } = jest.requireActual('../../../../lib/errorUtils');
      callFirebaseFunction.mockImplementation((functionName: string, data: any) => {
        if (functionName === 'getUserSignalBundle') {
          return Promise.resolve({
            data: {
              registrationId: 54321,
              deviceId: 1,
              identityKey: 'bob-identity-key',
              signedPreKey: {
                keyId: 1,
                publicKey: 'bob-signed-public',
                signature: 'bob-signature',
              },
              preKey: {
                keyId: 5,
                publicKey: 'bob-prekey-5',
              },
            },
          });
        }
        return Promise.resolve({ success: true });
      });

      // Set current user
      mockAuth.currentUser = { uid: senderId, displayName: 'Alice' };

      // Send encrypted message
      await chatService.sendTextMessage(chatId, message);

      // Verify message was encrypted and sent
      expect(mockDb.collection).toHaveBeenCalledWith('messages');
      expect(mockDb.set).toHaveBeenCalled();
      
      const messageCall = mockDb.set.mock.calls[0];
      const sentMessage = messageCall[0];
      
      expect(sentMessage).toMatchObject({
        chatId,
        senderId,
        type: 'text',
        signalMetadata: expect.objectContaining({
          senderDeviceId: 1,
          recipients: expect.any(Object),
        }),
      });
    });

    it('should decrypt received message', async () => {
      const senderId = 'bob456';
      const recipientId = 'alice123';
      const encryptedMessage = {
        id: 'msg123',
        chatId: 'chat123',
        senderId,
        timestamp: { seconds: Date.now() / 1000, nanoseconds: 0 },
        type: 'text' as const,
        signalMetadata: {
          senderDeviceId: 1,
          recipients: {
            [recipientId]: {
              '1': {
                encryptedPayload: 'encrypted-data',
                messageType: 3,
              },
            },
          },
        },
        delivered: [],
        read: [],
      };

      // Set current user as recipient
      mockAuth.currentUser = { uid: recipientId, displayName: 'Alice' };

      // Decrypt message
      const decrypted = await chatService.decryptMessage(encryptedMessage);

      expect(decrypted).toMatchObject({
        id: 'msg123',
        chatId: 'chat123',
        senderId,
        type: 'text',
        text: 'Hello, Signal!',
        encrypted: true,
      });
    });
  });

  describe('Key Management', () => {
    it('should generate and publish initial keys', async () => {
      const { callFirebaseFunction } = jest.requireActual('../../../../lib/errorUtils');
      callFirebaseFunction.mockResolvedValue({ success: true });

      await libsignalService.initialize();

      // Verify key generation
      const NativeLibsignal = jest.requireActual('../../../../specs/NativeLibsignal').default;
      expect(NativeLibsignal.generateIdentityKeyPair).toHaveBeenCalled();
      expect(NativeLibsignal.generateRegistrationId).toHaveBeenCalled();
      expect(NativeLibsignal.generatePreKeys).toHaveBeenCalledWith(1, 100);
      expect(NativeLibsignal.generateSignedPreKey).toHaveBeenCalled();

      // Verify key publishing
      expect(callFirebaseFunction).toHaveBeenCalledWith('publishSignalKeys', expect.objectContaining({
        identityKey: 'test-public-key',
        registrationId: 12345,
        preKeys: expect.any(Array),
        signedPreKey: expect.any(Object),
      }));
    });

    it('should refresh prekeys when low', async () => {
      const { callFirebaseFunction } = jest.requireActual('../../../../lib/errorUtils');
      callFirebaseFunction.mockImplementation((functionName: string) => {
        if (functionName === 'getPreKeyCount') {
          return Promise.resolve({ count: 5 });
        }
        return Promise.resolve({ success: true });
      });

      await libsignalService.refreshPreKeys();

      const NativeLibsignal = jest.requireActual('../../../../specs/NativeLibsignal').default;
      expect(NativeLibsignal.generatePreKeys).toHaveBeenCalledWith(6, 95);
      expect(callFirebaseFunction).toHaveBeenCalledWith('publishPreKeys', expect.any(Object));
    });

    it('should rotate signed prekey', async () => {
      const { callFirebaseFunction } = jest.requireActual('../../../../lib/errorUtils');
      callFirebaseFunction.mockResolvedValue({ success: true });

      await libsignalService.rotateSignedPreKey();

      const NativeLibsignal = jest.requireActual('../../../../specs/NativeLibsignal').default;
      expect(NativeLibsignal.generateSignedPreKey).toHaveBeenCalled();
      expect(callFirebaseFunction).toHaveBeenCalledWith('publishSignedPreKey', expect.any(Object));
    });
  });

  describe('Safety Numbers', () => {
    it('should generate safety number for verification', async () => {
      const localUsername = 'Alice';
      const remoteUsername = 'Bob';
      const remoteIdentityKey = 'bob-identity-key';

      const safetyNumber = await libsignalService.generateSafetyNumber(
        localUsername,
        remoteUsername,
        remoteIdentityKey
      );

      expect(safetyNumber).toEqual({
        numberString: '12345678901234567890',
        qrCodeData: 'qr-data',
      });

      const NativeLibsignal = jest.requireActual('../../../../specs/NativeLibsignal').default;
      expect(NativeLibsignal.generateSafetyNumber).toHaveBeenCalledWith(
        'test-public-key',
        remoteIdentityKey,
        localUsername,
        remoteUsername
      );
    });

    it('should verify scanned safety number', async () => {
      const localUsername = 'Alice';
      const remoteUsername = 'Bob';
      const remoteIdentityKey = 'bob-identity-key';
      const scannedQrCode = 'scanned-qr-data';

      const isValid = await libsignalService.verifySafetyNumber(
        localUsername,
        remoteUsername,
        remoteIdentityKey,
        scannedQrCode
      );

      expect(isValid).toBe(true);

      const NativeLibsignal = jest.requireActual('../../../../specs/NativeLibsignal').default;
      expect(NativeLibsignal.verifySafetyNumber).toHaveBeenCalledWith(
        'test-public-key',
        remoteIdentityKey,
        localUsername,
        remoteUsername,
        scannedQrCode
      );
    });
  });

  describe('Group Messaging', () => {
    it('should encrypt group message', async () => {
      const groupId = 'group123';
      const members = ['alice123', 'bob456', 'charlie789'];
      const message = 'Hello, group!';

      // Create group session
      const distributionMessage = await libsignalService.createGroupSession(groupId, members);
      expect(distributionMessage).toBeTruthy();

      // Encrypt group message
      const encrypted = await libsignalService.encryptGroupMessage(groupId, message);
      expect(encrypted).toBeTruthy();

      const NativeLibsignal = jest.requireActual('../../../../specs/NativeLibsignal').default;
      expect(NativeLibsignal.encryptGroupMessage).toHaveBeenCalledWith(
        message,
        groupId,
        { name: 'test-user-id', deviceId: 1 }
      );
    });

    it('should decrypt group message', async () => {
      const groupId = 'group123';
      const senderId = 'bob456';
      const encryptedMessage = 'encrypted-group-message';

      const decrypted = await libsignalService.decryptGroupMessage(
        groupId,
        senderId,
        encryptedMessage
      );

      expect(decrypted).toBe('Hello, Signal!');

      const NativeLibsignal = jest.requireActual('../../../../specs/NativeLibsignal').default;
      expect(NativeLibsignal.decryptGroupMessage).toHaveBeenCalledWith(
        encryptedMessage,
        groupId,
        { name: senderId, deviceId: 1 }
      );
    });
  });

  describe('Error Handling', () => {
    it('should handle missing recipient keys', async () => {
      const chatId = 'chat123';
      const message = 'Test message';

      mockDb.get.mockResolvedValueOnce({
        exists: true,
        data: () => ({
          id: chatId,
          type: 'direct',
          participants: ['alice123', 'bob456'],
          encryptionEnabled: true,
        }),
      });

      // Mock missing keys
      const { callFirebaseFunction } = jest.requireActual('../../../../lib/errorUtils');
      callFirebaseFunction.mockRejectedValue(new Error('User has no Signal keys'));

      await expect(chatService.sendTextMessage(chatId, message))
        .rejects.toThrow('User has no Signal keys');
    });

    it('should handle decryption failures gracefully', async () => {
      const NativeLibsignal = jest.requireActual('../../../../specs/NativeLibsignal').default;
      NativeLibsignal.decryptMessage.mockRejectedValue(new Error('Invalid message'));

      const encryptedMessage = {
        id: 'msg123',
        chatId: 'chat123',
        senderId: 'bob456',
        timestamp: { seconds: Date.now() / 1000, nanoseconds: 0 },
        type: 'text' as const,
        signalMetadata: {
          senderDeviceId: 1,
          recipients: {
            'alice123': {
              '1': {
                encryptedPayload: 'invalid-data',
                messageType: 3,
              },
            },
          },
        },
        delivered: [],
        read: [],
      };

      await expect(chatService.decryptMessage(encryptedMessage))
        .rejects.toThrow('Invalid message');
    });
  });

  describe('Cleanup', () => {
    it('should clear all data on logout', async () => {
      await chatService.cleanup();
      await libsignalService.clearAllData();

      const NativeLibsignal = jest.requireActual('../../../../specs/NativeLibsignal').default;
      expect(NativeLibsignal.clearAllData).toHaveBeenCalled();
      expect(AsyncStorage.clear).toHaveBeenCalled();
    });
  });
});