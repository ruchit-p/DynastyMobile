/**
 * Tests for NativeLibsignalService
 */

import { NativeModules } from 'react-native';
import { NativeLibsignalService } from '../NativeLibsignalService';
import { firestore, auth } from '../../../../lib/firebase';

// Mock native modules
jest.mock('react-native', () => ({
  NativeModules: {
    Libsignal: {
      generateIdentityKeyPair: jest.fn(),
      getIdentityKeyPair: jest.fn(),
      generateRegistrationId: jest.fn(),
      getLocalRegistrationId: jest.fn(),
      generatePreKeys: jest.fn(),
      generateSignedPreKey: jest.fn(),
      createSession: jest.fn(),
      encryptMessage: jest.fn(),
      decryptMessage: jest.fn(),
      decryptPreKeyMessage: jest.fn(),
      generateSafetyNumber: jest.fn(),
      clearAllData: jest.fn(),
    },
  },
  Platform: { OS: 'ios' },
}));

// Mock Firebase
jest.mock('../../../../lib/firebase', () => ({
  firestore: {
    collection: jest.fn(() => ({
      doc: jest.fn(() => ({
        set: jest.fn(),
        get: jest.fn(),
        update: jest.fn(),
      })),
    })),
  },
  auth: {
    currentUser: { uid: 'test-user-id' },
  },
}));

describe('NativeLibsignalService', () => {
  let service: NativeLibsignalService;
  const mockLibsignal = NativeModules.Libsignal;

  beforeEach(() => {
    service = new NativeLibsignalService();
    jest.clearAllMocks();
  });

  describe('Key Management', () => {
    it('should initialize user keys', async () => {
      const mockIdentityKeyPair = {
        publicKey: 'mock-public-key',
        privateKey: 'mock-private-key',
      };
      const mockRegistrationId = 12345;

      mockLibsignal.generateIdentityKeyPair.mockResolvedValue(mockIdentityKeyPair);
      mockLibsignal.generateRegistrationId.mockResolvedValue(mockRegistrationId);
      mockLibsignal.generatePreKeys.mockResolvedValue([
        { id: 1, publicKey: 'prekey-1' },
        { id: 2, publicKey: 'prekey-2' },
      ]);
      mockLibsignal.generateSignedPreKey.mockResolvedValue({
        id: 1,
        publicKey: 'signed-prekey-public',
        privateKey: 'signed-prekey-private',
        signature: 'signed-prekey-signature',
        timestamp: Date.now(),
      });

      const result = await service.initializeUser();

      expect(result).toEqual({
        identityKeyPair: mockIdentityKeyPair,
        registrationId: mockRegistrationId,
      });

      expect(mockLibsignal.generateIdentityKeyPair).toHaveBeenCalled();
      expect(mockLibsignal.generateRegistrationId).toHaveBeenCalled();
      expect(mockLibsignal.generatePreKeys).toHaveBeenCalledWith(1, 100);
      expect(mockLibsignal.generateSignedPreKey).toHaveBeenCalled();
    });

    it('should get existing user keys', async () => {
      const mockIdentityKeyPair = {
        publicKey: 'existing-public-key',
        privateKey: 'existing-private-key',
      };
      const mockRegistrationId = 54321;

      mockLibsignal.getIdentityKeyPair.mockResolvedValue(mockIdentityKeyPair);
      mockLibsignal.getLocalRegistrationId.mockResolvedValue(mockRegistrationId);

      const result = await service.getUserKeys();

      expect(result).toEqual({
        identityKeyPair: mockIdentityKeyPair,
        registrationId: mockRegistrationId,
      });

      expect(mockLibsignal.getIdentityKeyPair).toHaveBeenCalled();
      expect(mockLibsignal.getLocalRegistrationId).toHaveBeenCalled();
    });

    it('should throw error when no keys exist', async () => {
      mockLibsignal.getIdentityKeyPair.mockResolvedValue(null);
      mockLibsignal.getLocalRegistrationId.mockRejectedValue(new Error('No registration ID'));

      await expect(service.getUserKeys()).rejects.toThrow('No identity keys found');
    });
  });

  describe('Session Management', () => {
    it('should create a session with recipient', async () => {
      const recipientId = 'recipient-123';
      const recipientData = {
        publicIdentityKey: 'recipient-public-key',
        registrationId: 67890,
        deviceId: 1,
        signedPreKey: {
          keyId: 1,
          publicKey: 'signed-prekey',
          signature: 'signature',
        },
        preKey: {
          keyId: 2,
          publicKey: 'prekey',
        },
      };

      const mockDoc = {
        get: jest.fn().mockResolvedValue({
          exists: true,
          data: () => recipientData,
        }),
      };

      (firestore.collection as jest.Mock).mockReturnValue({
        doc: jest.fn().mockReturnValue(mockDoc),
      });

      mockLibsignal.createSession.mockResolvedValue(undefined);

      await service.createSession(recipientId);

      expect(mockLibsignal.createSession).toHaveBeenCalledWith(
        { name: recipientId, deviceId: 1 },
        expect.objectContaining({
          identityKey: recipientData.publicIdentityKey,
          registrationId: recipientData.registrationId,
          deviceId: recipientData.deviceId,
          signedPreKeyId: recipientData.signedPreKey.keyId,
          signedPreKeyPublic: recipientData.signedPreKey.publicKey,
          signedPreKeySignature: recipientData.signedPreKey.signature,
          preKeyId: recipientData.preKey.keyId,
          preKeyPublic: recipientData.preKey.publicKey,
        })
      );
    });

    it('should throw error when recipient not found', async () => {
      const recipientId = 'nonexistent-user';

      const mockDoc = {
        get: jest.fn().mockResolvedValue({
          exists: false,
        }),
      };

      (firestore.collection as jest.Mock).mockReturnValue({
        doc: jest.fn().mockReturnValue(mockDoc),
      });

      await expect(service.createSession(recipientId)).rejects.toThrow('Recipient not found');
    });
  });

  describe('Message Encryption/Decryption', () => {
    it('should encrypt a message', async () => {
      const plaintext = 'Hello, World!';
      const recipientId = 'recipient-123';
      const mockEncrypted = {
        type: 3,
        body: 'encrypted-message-body',
      };

      mockLibsignal.encryptMessage.mockResolvedValue(mockEncrypted);

      const result = await service.encryptMessage(plaintext, recipientId);

      expect(result).toEqual(mockEncrypted);
      expect(mockLibsignal.encryptMessage).toHaveBeenCalledWith(
        plaintext,
        { name: recipientId, deviceId: 1 },
        expect.any(Number)
      );
    });

    it('should decrypt a message', async () => {
      const encryptedMessage = {
        type: 3,
        body: 'encrypted-message-body',
      };
      const senderId = 'sender-123';
      const expectedPlaintext = 'Hello, World!';

      mockLibsignal.decryptMessage.mockResolvedValue({
        plaintext: expectedPlaintext,
        messageType: 3,
      });

      const result = await service.decryptMessage(encryptedMessage, senderId);

      expect(result).toBe(expectedPlaintext);
      expect(mockLibsignal.decryptMessage).toHaveBeenCalledWith(
        encryptedMessage.body,
        { name: senderId, deviceId: 1 }
      );
    });

    it('should decrypt a prekey message', async () => {
      const encryptedMessage = {
        type: 1, // PreKey message type
        body: 'encrypted-prekey-message-body',
      };
      const senderId = 'sender-123';
      const expectedPlaintext = 'First message!';

      mockLibsignal.decryptPreKeyMessage.mockResolvedValue({
        plaintext: expectedPlaintext,
        messageType: 1,
      });

      const result = await service.decryptMessage(encryptedMessage, senderId);

      expect(result).toBe(expectedPlaintext);
      expect(mockLibsignal.decryptPreKeyMessage).toHaveBeenCalledWith(
        encryptedMessage.body,
        { name: senderId, deviceId: 1 }
      );
    });
  });

  describe('Safety Number', () => {
    it('should generate safety number', async () => {
      const localIdentityKey = 'local-identity-public-key';
      const remoteIdentityKey = 'remote-identity-public-key';
      const localUsername = 'alice@example.com';
      const remoteUsername = 'bob@example.com';

      const mockSafetyNumber = {
        numberString: '12345 67890 12345 67890 12345 67890',
        qrCodeData: 'base64-qr-code-data',
      };

      mockLibsignal.generateSafetyNumber.mockResolvedValue(mockSafetyNumber);
      mockLibsignal.getIdentityKeyPair.mockResolvedValue({
        publicKey: localIdentityKey,
        privateKey: 'local-private-key',
      });

      const result = await service.generateSafetyNumber(
        remoteIdentityKey,
        localUsername,
        remoteUsername
      );

      expect(result).toEqual(mockSafetyNumber);
      expect(mockLibsignal.generateSafetyNumber).toHaveBeenCalledWith(
        localIdentityKey,
        remoteIdentityKey,
        localUsername,
        remoteUsername
      );
    });
  });

  describe('Key Publishing', () => {
    it('should publish public keys to Firebase', async () => {
      const mockSetFn = jest.fn();
      const mockDoc = {
        set: mockSetFn,
      };

      (firestore.collection as jest.Mock).mockReturnValue({
        doc: jest.fn().mockReturnValue(mockDoc),
      });

      mockLibsignal.getIdentityKeyPair.mockResolvedValue({
        publicKey: 'test-public-key',
        privateKey: 'test-private-key',
      });
      mockLibsignal.getLocalRegistrationId.mockResolvedValue(12345);
      mockLibsignal.generatePreKeys.mockResolvedValue([
        { id: 1, publicKey: 'prekey-1' },
      ]);
      mockLibsignal.generateSignedPreKey.mockResolvedValue({
        id: 1,
        publicKey: 'signed-prekey',
        signature: 'signature',
        timestamp: Date.now(),
      });

      await service.publishKeys();

      expect(mockSetFn).toHaveBeenCalledWith(
        expect.objectContaining({
          publicIdentityKey: 'test-public-key',
          registrationId: 12345,
          deviceId: 1,
          signedPreKey: expect.objectContaining({
            keyId: 1,
            publicKey: 'signed-prekey',
            signature: 'signature',
          }),
          preKeys: expect.arrayContaining([
            expect.objectContaining({
              keyId: 1,
              publicKey: 'prekey-1',
            }),
          ]),
        }),
        { merge: true }
      );
    });
  });

  describe('Cleanup', () => {
    it('should clear all data', async () => {
      await service.clearAllData();
      expect(mockLibsignal.clearAllData).toHaveBeenCalled();
    });
  });

  describe('Error Handling', () => {
    it('should handle encryption errors gracefully', async () => {
      const errorMessage = 'Encryption failed';
      mockLibsignal.encryptMessage.mockRejectedValue(new Error(errorMessage));

      await expect(
        service.encryptMessage('test', 'recipient-123')
      ).rejects.toThrow(errorMessage);
    });

    it('should handle decryption errors gracefully', async () => {
      const errorMessage = 'Decryption failed';
      mockLibsignal.decryptMessage.mockRejectedValue(new Error(errorMessage));

      await expect(
        service.decryptMessage({ type: 3, body: 'invalid' }, 'sender-123')
      ).rejects.toThrow(errorMessage);
    });

    it('should handle session creation errors', async () => {
      const errorMessage = 'Session creation failed';
      mockLibsignal.createSession.mockRejectedValue(new Error(errorMessage));

      const mockDoc = {
        get: jest.fn().mockResolvedValue({
          exists: true,
          data: () => ({
            publicIdentityKey: 'key',
            registrationId: 123,
            deviceId: 1,
            signedPreKey: { keyId: 1, publicKey: 'key', signature: 'sig' },
          }),
        }),
      };

      (firestore.collection as jest.Mock).mockReturnValue({
        doc: jest.fn().mockReturnValue(mockDoc),
      });

      await expect(service.createSession('recipient-123')).rejects.toThrow(errorMessage);
    });
  });
});