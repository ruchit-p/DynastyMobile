import { SessionService } from '../services/SessionService';
import { SignalProtocolStore } from '../stores/SignalProtocolStore';
import { KeyDistributionService } from '../services/KeyDistributionService';
import NativeLibsignal from '../../../../specs/NativeLibsignal';
import { logger } from '../../../LoggingService';

// Mock dependencies
jest.mock('../../../../specs/NativeLibsignal', () => ({
  default: {
    createSession: jest.fn(),
    hasSession: jest.fn(),
    deleteSession: jest.fn(),
    deleteAllSessions: jest.fn(),
    getSessionInfo: jest.fn(),
    encryptMessage: jest.fn(),
    decryptMessage: jest.fn(),
    decryptPreKeyMessage: jest.fn(),
    createSenderKeyDistributionMessage: jest.fn(),
    processSenderKeyDistributionMessage: jest.fn(),
    encryptGroupMessage: jest.fn(),
    decryptGroupMessage: jest.fn(),
    generateSafetyNumber: jest.fn(),
    verifySafetyNumber: jest.fn(),
  }
}));

jest.mock('../stores/SignalProtocolStore');
jest.mock('../services/KeyDistributionService');
jest.mock('../../../LoggingService');

describe('SessionService', () => {
  let service: SessionService;
  let mockStore: jest.Mocked<SignalProtocolStore>;
  let mockKeyDistService: jest.Mocked<KeyDistributionService>;

  beforeEach(() => {
    jest.clearAllMocks();
    mockStore = new SignalProtocolStore() as jest.Mocked<SignalProtocolStore>;
    mockKeyDistService = new KeyDistributionService(null as any, mockStore) as jest.Mocked<KeyDistributionService>;
    service = new SessionService(mockStore, mockKeyDistService);
  });

  describe('establishSession', () => {
    const recipientId = 'recipient123';
    const mockPreKeyBundle = {
      registrationId: 12345,
      deviceId: 1,
      preKeyId: 5,
      preKeyPublic: 'prekey-public',
      signedPreKeyId: 1,
      signedPreKeyPublic: 'signed-public',
      signedPreKeySignature: 'signature',
      identityKey: 'identity-key'
    };

    it('should establish session with recipient', async () => {
      mockKeyDistService.fetchPreKeyBundle.mockResolvedValue(mockPreKeyBundle);
      NativeLibsignal.createSession.mockResolvedValue();

      await service.establishSession(recipientId);

      expect(mockKeyDistService.fetchPreKeyBundle).toHaveBeenCalledWith(recipientId);
      expect(NativeLibsignal.createSession).toHaveBeenCalledWith(
        { name: recipientId, deviceId: 1 },
        mockPreKeyBundle
      );
      expect(logger.info).toHaveBeenCalledWith(`Session established with ${recipientId}`);
    });

    it('should handle missing prekey bundle', async () => {
      mockKeyDistService.fetchPreKeyBundle.mockResolvedValue(null);

      await expect(service.establishSession(recipientId))
        .rejects.toThrow(`No prekey bundle found for ${recipientId}`);
    });

    it('should handle session creation errors', async () => {
      mockKeyDistService.fetchPreKeyBundle.mockResolvedValue(mockPreKeyBundle);
      NativeLibsignal.createSession.mockRejectedValue(new Error('Session creation failed'));

      await expect(service.establishSession(recipientId))
        .rejects.toThrow('Session creation failed');
      expect(logger.error).toHaveBeenCalled();
    });
  });

  describe('hasSession', () => {
    const address = { name: 'recipient123', deviceId: 1 };

    it('should check if session exists', async () => {
      NativeLibsignal.hasSession.mockResolvedValue(true);

      const result = await service.hasSession(address);

      expect(NativeLibsignal.hasSession).toHaveBeenCalledWith(address);
      expect(result).toBe(true);
    });

    it('should return false if no session', async () => {
      NativeLibsignal.hasSession.mockResolvedValue(false);

      const result = await service.hasSession(address);

      expect(result).toBe(false);
    });
  });

  describe('encryptMessage', () => {
    const address = { name: 'recipient123', deviceId: 1 };
    const plaintext = 'Hello, Signal!';
    const timestamp = Date.now();

    it('should encrypt message', async () => {
      const mockEncrypted = {
        type: 3,
        body: 'encrypted-body'
      };

      NativeLibsignal.encryptMessage.mockResolvedValue(mockEncrypted);

      const result = await service.encryptMessage(address, plaintext, timestamp);

      expect(NativeLibsignal.encryptMessage).toHaveBeenCalledWith(plaintext, address, timestamp);
      expect(result).toEqual(mockEncrypted);
    });

    it('should handle encryption errors', async () => {
      NativeLibsignal.encryptMessage.mockRejectedValue(new Error('Encryption failed'));

      await expect(service.encryptMessage(address, plaintext))
        .rejects.toThrow('Encryption failed');
    });
  });

  describe('decryptMessage', () => {
    const address = { name: 'sender123', deviceId: 1 };
    const encryptedMessage = {
      type: 3,
      body: 'encrypted-body'
    };

    it('should decrypt normal message', async () => {
      const mockDecrypted = {
        plaintext: 'Hello, Signal!',
        messageType: 3
      };

      NativeLibsignal.decryptMessage.mockResolvedValue(mockDecrypted);

      const result = await service.decryptMessage(address, encryptedMessage);

      expect(NativeLibsignal.decryptMessage).toHaveBeenCalledWith(
        encryptedMessage.body,
        address
      );
      expect(result).toEqual(mockDecrypted);
    });

    it('should handle decryption errors', async () => {
      NativeLibsignal.decryptMessage.mockRejectedValue(new Error('Decryption failed'));

      await expect(service.decryptMessage(address, encryptedMessage))
        .rejects.toThrow('Decryption failed');
      expect(logger.error).toHaveBeenCalled();
    });
  });

  describe('decryptPreKeyMessage', () => {
    const address = { name: 'sender123', deviceId: 1 };
    const preKeyMessage = {
      type: 1,
      body: 'prekey-encrypted-body'
    };

    it('should decrypt prekey message', async () => {
      const mockDecrypted = {
        plaintext: 'Hello from new device!',
        messageType: 1
      };

      NativeLibsignal.decryptPreKeyMessage.mockResolvedValue(mockDecrypted);

      const result = await service.decryptPreKeyMessage(address, preKeyMessage);

      expect(NativeLibsignal.decryptPreKeyMessage).toHaveBeenCalledWith(
        preKeyMessage.body,
        address
      );
      expect(result).toEqual(mockDecrypted);
    });

    it('should handle prekey decryption errors', async () => {
      NativeLibsignal.decryptPreKeyMessage.mockRejectedValue(new Error('PreKey decryption failed'));

      await expect(service.decryptPreKeyMessage(address, preKeyMessage))
        .rejects.toThrow('PreKey decryption failed');
    });
  });

  describe('deleteSession', () => {
    const address = { name: 'recipient123', deviceId: 1 };

    it('should delete session', async () => {
      NativeLibsignal.deleteSession.mockResolvedValue();

      await service.deleteSession(address);

      expect(NativeLibsignal.deleteSession).toHaveBeenCalledWith(address);
      expect(logger.info).toHaveBeenCalledWith(`Session deleted for ${address.name}:${address.deviceId}`);
    });

    it('should handle deletion errors', async () => {
      NativeLibsignal.deleteSession.mockRejectedValue(new Error('Deletion failed'));

      await expect(service.deleteSession(address))
        .rejects.toThrow('Deletion failed');
    });
  });

  describe('deleteAllSessions', () => {
    const userId = 'user123';

    it('should delete all sessions for user', async () => {
      NativeLibsignal.deleteAllSessions.mockResolvedValue();

      await service.deleteAllSessions(userId);

      expect(NativeLibsignal.deleteAllSessions).toHaveBeenCalledWith(userId);
      expect(logger.info).toHaveBeenCalledWith(`All sessions deleted for ${userId}`);
    });
  });

  describe('getSessionInfo', () => {
    const address = { name: 'recipient123', deviceId: 1 };

    it('should get session info', async () => {
      const mockInfo = {
        hasSession: true,
        sessionVersion: 3,
        remoteRegistrationId: 54321
      };

      NativeLibsignal.getSessionInfo.mockResolvedValue(mockInfo);

      const result = await service.getSessionInfo(address);

      expect(NativeLibsignal.getSessionInfo).toHaveBeenCalledWith(address);
      expect(result).toEqual(mockInfo);
    });

    it('should return null if no session', async () => {
      NativeLibsignal.getSessionInfo.mockResolvedValue(null);

      const result = await service.getSessionInfo(address);

      expect(result).toBeNull();
    });
  });

  describe('Group Messaging', () => {
    const groupId = 'group123';
    const senderId = { name: 'sender123', deviceId: 1 };

    describe('createGroupSession', () => {
      it('should create group session', async () => {
        const mockDistributionMessage = 'distribution-message';
        
        NativeLibsignal.createSenderKeyDistributionMessage.mockResolvedValue(mockDistributionMessage);

        const result = await service.createGroupSession(groupId, 'sender123');

        expect(NativeLibsignal.createSenderKeyDistributionMessage).toHaveBeenCalledWith(
          groupId,
          senderId
        );
        expect(result).toBe(mockDistributionMessage);
      });
    });

    describe('processGroupSession', () => {
      it('should process group session', async () => {
        const distributionMessage = 'distribution-message';
        
        NativeLibsignal.processSenderKeyDistributionMessage.mockResolvedValue();

        await service.processGroupSession(groupId, 'sender123', distributionMessage);

        expect(NativeLibsignal.processSenderKeyDistributionMessage).toHaveBeenCalledWith(
          groupId,
          senderId,
          distributionMessage
        );
      });
    });

    describe('encryptGroupMessage', () => {
      it('should encrypt group message', async () => {
        const plaintext = 'Group message';
        const mockEncrypted = 'encrypted-group-message';

        NativeLibsignal.encryptGroupMessage.mockResolvedValue(mockEncrypted);

        const result = await service.encryptGroupMessage(groupId, plaintext, senderId);

        expect(NativeLibsignal.encryptGroupMessage).toHaveBeenCalledWith(
          plaintext,
          groupId,
          senderId
        );
        expect(result).toBe(mockEncrypted);
      });
    });

    describe('decryptGroupMessage', () => {
      it('should decrypt group message', async () => {
        const ciphertext = 'encrypted-group-message';
        const mockDecrypted = 'Group message';

        NativeLibsignal.decryptGroupMessage.mockResolvedValue(mockDecrypted);

        const result = await service.decryptGroupMessage(groupId, senderId, ciphertext);

        expect(NativeLibsignal.decryptGroupMessage).toHaveBeenCalledWith(
          ciphertext,
          groupId,
          senderId
        );
        expect(result).toBe(mockDecrypted);
      });
    });
  });

  describe('Safety Numbers', () => {
    const localIdentityKey = 'local-identity';
    const remoteIdentityKey = 'remote-identity';
    const localUsername = 'alice';
    const remoteUsername = 'bob';

    describe('generateSafetyNumber', () => {
      it('should generate safety number', async () => {
        const mockSafetyNumber = {
          numberString: '12345 67890 12345 67890',
          qrCodeData: 'qr-code-data'
        };

        NativeLibsignal.generateSafetyNumber.mockResolvedValue(mockSafetyNumber);

        const result = await service.generateSafetyNumber(
          localIdentityKey,
          remoteIdentityKey,
          localUsername,
          remoteUsername
        );

        expect(NativeLibsignal.generateSafetyNumber).toHaveBeenCalledWith(
          localIdentityKey,
          remoteIdentityKey,
          localUsername,
          remoteUsername
        );
        expect(result).toEqual(mockSafetyNumber);
      });
    });

    describe('verifySafetyNumber', () => {
      it('should verify safety number', async () => {
        const scannedQrCode = 'scanned-qr-data';

        NativeLibsignal.verifySafetyNumber.mockResolvedValue(true);

        const result = await service.verifySafetyNumber(
          localIdentityKey,
          remoteIdentityKey,
          localUsername,
          remoteUsername,
          scannedQrCode
        );

        expect(NativeLibsignal.verifySafetyNumber).toHaveBeenCalledWith(
          localIdentityKey,
          remoteIdentityKey,
          localUsername,
          remoteUsername,
          scannedQrCode
        );
        expect(result).toBe(true);
      });

      it('should return false for invalid QR code', async () => {
        const scannedQrCode = 'invalid-qr-data';

        NativeLibsignal.verifySafetyNumber.mockResolvedValue(false);

        const result = await service.verifySafetyNumber(
          localIdentityKey,
          remoteIdentityKey,
          localUsername,
          remoteUsername,
          scannedQrCode
        );

        expect(result).toBe(false);
      });
    });
  });

  describe('refreshSession', () => {
    const address = { name: 'recipient123', deviceId: 1 };

    it('should refresh session', async () => {
      NativeLibsignal.deleteSession.mockResolvedValue();
      service.establishSession = jest.fn().mockResolvedValue();

      await service.refreshSession(address.name);

      expect(NativeLibsignal.deleteSession).toHaveBeenCalledWith(address);
      expect(service.establishSession).toHaveBeenCalledWith(address.name);
      expect(logger.info).toHaveBeenCalledWith(`Session refreshed for ${address.name}`);
    });

    it('should handle refresh errors', async () => {
      NativeLibsignal.deleteSession.mockRejectedValue(new Error('Delete failed'));

      await expect(service.refreshSession(address.name))
        .rejects.toThrow('Delete failed');
    });
  });
});