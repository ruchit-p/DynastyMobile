import { LibsignalService } from '../LibsignalService';
import { SignalProtocolStore } from '../stores/SignalProtocolStore';
import { KeyGenerationService } from '../services/KeyGenerationService';
import { KeyDistributionService } from '../services/KeyDistributionService';
import { SessionService } from '../services/SessionService';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getFirebaseDb } from '../../../../lib/firebase';
import { logger } from '../../../LoggingService';

// Mock dependencies
jest.mock('@react-native-async-storage/async-storage');
jest.mock('../../../../lib/firebase');
jest.mock('../../../LoggingService');
jest.mock('../stores/SignalProtocolStore');
jest.mock('../services/KeyGenerationService');
jest.mock('../services/KeyDistributionService');
jest.mock('../services/SessionService');

describe('LibsignalService', () => {
  let service: LibsignalService;
  let mockStore: jest.Mocked<SignalProtocolStore>;
  let mockKeyGenService: jest.Mocked<KeyGenerationService>;
  let mockKeyDistService: jest.Mocked<KeyDistributionService>;
  let mockSessionService: jest.Mocked<SessionService>;
  let mockDb: any;

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Reset singleton
    (LibsignalService as any).instance = null;
    
    // Create mock instances
    mockStore = new SignalProtocolStore() as jest.Mocked<SignalProtocolStore>;
    mockKeyGenService = new KeyGenerationService(mockStore) as jest.Mocked<KeyGenerationService>;
    mockKeyDistService = new KeyDistributionService(mockKeyGenService, mockStore) as jest.Mocked<KeyDistributionService>;
    mockSessionService = new SessionService(mockStore, mockKeyDistService) as jest.Mocked<SessionService>;
    
    // Mock Firebase
    mockDb = {
      collection: jest.fn().mockReturnThis(),
      doc: jest.fn().mockReturnThis(),
      get: jest.fn(),
      set: jest.fn(),
      update: jest.fn(),
    };
    (getFirebaseDb as jest.Mock).mockReturnValue(mockDb);
    
    // Mock constructors
    (SignalProtocolStore as jest.Mock).mockImplementation(() => mockStore);
    (KeyGenerationService as jest.Mock).mockImplementation(() => mockKeyGenService);
    (KeyDistributionService as jest.Mock).mockImplementation(() => mockKeyDistService);
    (SessionService as jest.Mock).mockImplementation(() => mockSessionService);
    
    service = LibsignalService.getInstance();
  });

  describe('getInstance', () => {
    it('should return singleton instance', () => {
      const instance1 = LibsignalService.getInstance();
      const instance2 = LibsignalService.getInstance();
      expect(instance1).toBe(instance2);
    });
  });

  describe('initialize', () => {
    it('should initialize all services', async () => {
      mockStore.hasIdentityKey.mockResolvedValue(false);
      mockKeyGenService.generateIdentityKeyPair.mockResolvedValue({
        publicKey: 'mock-public-key',
        privateKey: 'mock-private-key'
      });
      mockKeyGenService.generateRegistrationId.mockResolvedValue(12345);
      mockKeyGenService.generatePreKeys.mockResolvedValue([]);
      mockKeyGenService.generateSignedPreKey.mockResolvedValue({
        id: 1,
        publicKey: 'mock-signed-public',
        privateKey: 'mock-signed-private',
        signature: 'mock-signature',
        timestamp: Date.now()
      });
      mockKeyDistService.publishKeys.mockResolvedValue();

      await service.initialize();

      expect(mockStore.hasIdentityKey).toHaveBeenCalled();
      expect(mockKeyGenService.generateIdentityKeyPair).toHaveBeenCalled();
      expect(mockKeyGenService.generateRegistrationId).toHaveBeenCalled();
      expect(mockKeyGenService.generatePreKeys).toHaveBeenCalled();
      expect(mockKeyGenService.generateSignedPreKey).toHaveBeenCalled();
      expect(mockKeyDistService.publishKeys).toHaveBeenCalled();
    });

    it('should not generate new keys if already exist', async () => {
      mockStore.hasIdentityKey.mockResolvedValue(true);

      await service.initialize();

      expect(mockKeyGenService.generateIdentityKeyPair).not.toHaveBeenCalled();
      expect(mockKeyGenService.generateRegistrationId).not.toHaveBeenCalled();
    });

    it('should handle initialization errors', async () => {
      mockStore.hasIdentityKey.mockRejectedValue(new Error('Storage error'));
      
      await expect(service.initialize()).rejects.toThrow('Storage error');
      expect(logger.error).toHaveBeenCalled();
    });
  });

  describe('encryptMessage', () => {
    const recipientId = 'recipient123';
    const message = 'Hello, Signal!';

    beforeEach(() => {
      mockSessionService.hasSession.mockResolvedValue(true);
      mockSessionService.encryptMessage.mockResolvedValue({
        type: 3,
        body: 'encrypted-body'
      });
    });

    it('should encrypt message for recipient', async () => {
      const result = await service.encryptMessage(recipientId, message);

      expect(mockSessionService.hasSession).toHaveBeenCalledWith({ name: recipientId, deviceId: 1 });
      expect(mockSessionService.encryptMessage).toHaveBeenCalledWith(
        { name: recipientId, deviceId: 1 },
        message
      );
      expect(result).toEqual({
        type: 3,
        body: 'encrypted-body'
      });
    });

    it('should establish session if none exists', async () => {
      mockSessionService.hasSession.mockResolvedValue(false);
      mockSessionService.establishSession.mockResolvedValue();

      await service.encryptMessage(recipientId, message);

      expect(mockSessionService.establishSession).toHaveBeenCalledWith(recipientId);
      expect(mockSessionService.encryptMessage).toHaveBeenCalled();
    });

    it('should handle encryption errors', async () => {
      mockSessionService.encryptMessage.mockRejectedValue(new Error('Encryption failed'));

      await expect(service.encryptMessage(recipientId, message))
        .rejects.toThrow('Encryption failed');
    });
  });

  describe('decryptMessage', () => {
    const senderId = 'sender123';
    const encryptedMessage = {
      type: 3,
      body: 'encrypted-body'
    };

    it('should decrypt normal message', async () => {
      mockSessionService.decryptMessage.mockResolvedValue({
        plaintext: 'Hello, Signal!',
        messageType: 3
      });

      const result = await service.decryptMessage(senderId, encryptedMessage);

      expect(mockSessionService.decryptMessage).toHaveBeenCalledWith(
        { name: senderId, deviceId: 1 },
        encryptedMessage
      );
      expect(result).toBe('Hello, Signal!');
    });

    it('should decrypt prekey message', async () => {
      const prekeyMessage = {
        type: 1,
        body: 'prekey-encrypted-body'
      };

      mockSessionService.decryptPreKeyMessage.mockResolvedValue({
        plaintext: 'Hello from new device!',
        messageType: 1
      });

      const result = await service.decryptMessage(senderId, prekeyMessage);

      expect(mockSessionService.decryptPreKeyMessage).toHaveBeenCalledWith(
        { name: senderId, deviceId: 1 },
        prekeyMessage
      );
      expect(result).toBe('Hello from new device!');
    });

    it('should handle decryption errors', async () => {
      mockSessionService.decryptMessage.mockRejectedValue(new Error('Decryption failed'));

      await expect(service.decryptMessage(senderId, encryptedMessage))
        .rejects.toThrow('Decryption failed');
    });
  });

  describe('createGroupSession', () => {
    const groupId = 'group123';
    const members = ['member1', 'member2', 'member3'];

    it('should create group session for all members', async () => {
      mockSessionService.createGroupSession.mockResolvedValue('distribution-message');

      const result = await service.createGroupSession(groupId, members);

      expect(mockSessionService.createGroupSession).toHaveBeenCalledWith(groupId, 'sender123');
      expect(result).toBe('distribution-message');
    });

    it('should handle group session errors', async () => {
      mockSessionService.createGroupSession.mockRejectedValue(new Error('Group error'));

      await expect(service.createGroupSession(groupId, members))
        .rejects.toThrow('Group error');
    });
  });

  describe('encryptGroupMessage', () => {
    const groupId = 'group123';
    const message = 'Group message';

    it('should encrypt group message', async () => {
      mockSessionService.encryptGroupMessage.mockResolvedValue('encrypted-group-message');

      const result = await service.encryptGroupMessage(groupId, message);

      expect(mockSessionService.encryptGroupMessage).toHaveBeenCalledWith(
        groupId,
        message,
        { name: 'sender123', deviceId: 1 }
      );
      expect(result).toBe('encrypted-group-message');
    });
  });

  describe('decryptGroupMessage', () => {
    const groupId = 'group123';
    const senderId = 'sender456';
    const encryptedMessage = 'encrypted-group-message';

    it('should decrypt group message', async () => {
      mockSessionService.decryptGroupMessage.mockResolvedValue('Group message');

      const result = await service.decryptGroupMessage(groupId, senderId, encryptedMessage);

      expect(mockSessionService.decryptGroupMessage).toHaveBeenCalledWith(
        groupId,
        { name: senderId, deviceId: 1 },
        encryptedMessage
      );
      expect(result).toBe('Group message');
    });
  });

  describe('generateSafetyNumber', () => {
    const localUsername = 'alice';
    const remoteUsername = 'bob';
    const remoteIdentityKey = 'remote-identity-key';

    it('should generate safety number', async () => {
      mockStore.getIdentityKeyPair.mockResolvedValue({
        publicKey: 'local-public-key',
        privateKey: 'local-private-key'
      });

      mockSessionService.generateSafetyNumber.mockResolvedValue({
        numberString: '12345 67890 12345 67890',
        qrCodeData: 'qr-code-data'
      });

      const result = await service.generateSafetyNumber(
        localUsername,
        remoteUsername,
        remoteIdentityKey
      );

      expect(mockSessionService.generateSafetyNumber).toHaveBeenCalledWith(
        'local-public-key',
        remoteIdentityKey,
        localUsername,
        remoteUsername
      );
      expect(result).toHaveProperty('numberString');
      expect(result).toHaveProperty('qrCodeData');
    });

    it('should throw if no identity key', async () => {
      mockStore.getIdentityKeyPair.mockResolvedValue(null);

      await expect(service.generateSafetyNumber(
        localUsername,
        remoteUsername,
        remoteIdentityKey
      )).rejects.toThrow('No identity key pair found');
    });
  });

  describe('verifySafetyNumber', () => {
    const localUsername = 'alice';
    const remoteUsername = 'bob';
    const remoteIdentityKey = 'remote-identity-key';
    const scannedQrCode = 'scanned-qr-data';

    it('should verify safety number', async () => {
      mockStore.getIdentityKeyPair.mockResolvedValue({
        publicKey: 'local-public-key',
        privateKey: 'local-private-key'
      });

      mockSessionService.verifySafetyNumber.mockResolvedValue(true);

      const result = await service.verifySafetyNumber(
        localUsername,
        remoteUsername,
        remoteIdentityKey,
        scannedQrCode
      );

      expect(mockSessionService.verifySafetyNumber).toHaveBeenCalledWith(
        'local-public-key',
        remoteIdentityKey,
        localUsername,
        remoteUsername,
        scannedQrCode
      );
      expect(result).toBe(true);
    });
  });

  describe('rotateSignedPreKey', () => {
    it('should rotate signed prekey', async () => {
      mockKeyGenService.generateSignedPreKey.mockResolvedValue({
        id: 2,
        publicKey: 'new-signed-public',
        privateKey: 'new-signed-private',
        signature: 'new-signature',
        timestamp: Date.now()
      });
      mockKeyDistService.publishSignedPreKey.mockResolvedValue();
      mockStore.removeSignedPreKey.mockResolvedValue();

      await service.rotateSignedPreKey();

      expect(mockKeyGenService.generateSignedPreKey).toHaveBeenCalled();
      expect(mockKeyDistService.publishSignedPreKey).toHaveBeenCalled();
      expect(logger.info).toHaveBeenCalledWith('Signed prekey rotated successfully');
    });
  });

  describe('refreshPreKeys', () => {
    it('should refresh prekeys when low', async () => {
      mockStore.getPreKeyCount.mockResolvedValue(5);
      mockKeyGenService.generatePreKeys.mockResolvedValue([]);
      mockKeyDistService.publishPreKeys.mockResolvedValue();

      await service.refreshPreKeys();

      expect(mockKeyGenService.generatePreKeys).toHaveBeenCalledWith(6, 95);
      expect(mockKeyDistService.publishPreKeys).toHaveBeenCalled();
    });

    it('should not refresh if enough prekeys', async () => {
      mockStore.getPreKeyCount.mockResolvedValue(50);

      await service.refreshPreKeys();

      expect(mockKeyGenService.generatePreKeys).not.toHaveBeenCalled();
    });
  });

  describe('clearAllData', () => {
    it('should clear all data', async () => {
      await service.clearAllData();

      expect(AsyncStorage.clear).toHaveBeenCalled();
      expect(logger.info).toHaveBeenCalledWith('All Signal Protocol data cleared');
    });
  });

  describe('getSessionInfo', () => {
    const recipientId = 'recipient123';

    it('should get session info', async () => {
      mockSessionService.getSessionInfo.mockResolvedValue({
        hasSession: true,
        sessionVersion: 3,
        remoteRegistrationId: 54321
      });

      const result = await service.getSessionInfo(recipientId);

      expect(mockSessionService.getSessionInfo).toHaveBeenCalledWith({
        name: recipientId,
        deviceId: 1
      });
      expect(result).toHaveProperty('hasSession', true);
      expect(result).toHaveProperty('sessionVersion', 3);
    });
  });

  describe('isTrustedIdentity', () => {
    const recipientId = 'recipient123';
    const identityKey = 'identity-key';

    it('should check if identity is trusted', async () => {
      mockStore.isTrustedIdentity.mockResolvedValue(true);

      const result = await service.isTrustedIdentity(recipientId, identityKey);

      expect(mockStore.isTrustedIdentity).toHaveBeenCalledWith(
        { name: recipientId, deviceId: 1 },
        identityKey,
        'sending'
      );
      expect(result).toBe(true);
    });
  });

  describe('trustIdentity', () => {
    const recipientId = 'recipient123';
    const identityKey = 'identity-key';

    it('should save trusted identity', async () => {
      mockStore.saveIdentity.mockResolvedValue(true);

      const result = await service.trustIdentity(recipientId, identityKey);

      expect(mockStore.saveIdentity).toHaveBeenCalledWith(
        { name: recipientId, deviceId: 1 },
        identityKey
      );
      expect(result).toBe(true);
    });
  });
});