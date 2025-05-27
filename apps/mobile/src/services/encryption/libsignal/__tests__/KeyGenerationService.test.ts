import { KeyGenerationService } from '../services/KeyGenerationService';
import { SignalProtocolStore } from '../stores/SignalProtocolStore';
import NativeLibsignal from '../../../../specs/NativeLibsignal';
import { logger } from '../../../LoggingService';

// Mock dependencies
jest.mock('../../../../specs/NativeLibsignal', () => ({
  default: {
    generateIdentityKeyPair: jest.fn(),
    generateRegistrationId: jest.fn(),
    generatePreKeys: jest.fn(),
    generateSignedPreKey: jest.fn(),
    generateKeyPair: jest.fn(),
    storePreKey: jest.fn(),
    storeSignedPreKey: jest.fn(),
    saveIdentityKeyPair: jest.fn(),
  }
}));

jest.mock('../stores/SignalProtocolStore');
jest.mock('../../../LoggingService');

describe('KeyGenerationService', () => {
  let service: KeyGenerationService;
  let mockStore: jest.Mocked<SignalProtocolStore>;

  beforeEach(() => {
    jest.clearAllMocks();
    mockStore = new SignalProtocolStore() as jest.Mocked<SignalProtocolStore>;
    service = new KeyGenerationService(mockStore);
  });

  describe('generateIdentityKeyPair', () => {
    it('should generate and store identity key pair', async () => {
      const mockKeyPair = {
        publicKey: 'mock-public-key',
        privateKey: 'mock-private-key'
      };

      NativeLibsignal.generateIdentityKeyPair.mockResolvedValue(mockKeyPair);
      mockStore.storeIdentityKeyPair.mockResolvedValue();

      const result = await service.generateIdentityKeyPair();

      expect(NativeLibsignal.generateIdentityKeyPair).toHaveBeenCalled();
      expect(mockStore.storeIdentityKeyPair).toHaveBeenCalledWith(mockKeyPair);
      expect(result).toEqual(mockKeyPair);
    });

    it('should handle generation errors', async () => {
      NativeLibsignal.generateIdentityKeyPair.mockRejectedValue(new Error('Generation failed'));

      await expect(service.generateIdentityKeyPair()).rejects.toThrow('Generation failed');
      expect(logger.error).toHaveBeenCalled();
    });
  });

  describe('generateRegistrationId', () => {
    it('should generate and store registration ID', async () => {
      const mockRegId = 12345;

      NativeLibsignal.generateRegistrationId.mockResolvedValue(mockRegId);
      mockStore.storeLocalRegistrationId.mockResolvedValue();

      const result = await service.generateRegistrationId();

      expect(NativeLibsignal.generateRegistrationId).toHaveBeenCalled();
      expect(mockStore.storeLocalRegistrationId).toHaveBeenCalledWith(mockRegId);
      expect(result).toBe(mockRegId);
    });

    it('should handle errors', async () => {
      NativeLibsignal.generateRegistrationId.mockRejectedValue(new Error('Failed'));

      await expect(service.generateRegistrationId()).rejects.toThrow('Failed');
    });
  });

  describe('generatePreKeys', () => {
    it('should generate batch of prekeys', async () => {
      const start = 1;
      const count = 10;
      const mockPreKeys = Array.from({ length: count }, (_, i) => ({
        id: start + i,
        publicKey: `prekey-public-${i}`
      }));

      NativeLibsignal.generatePreKeys.mockResolvedValue(mockPreKeys);
      mockStore.storePreKey.mockResolvedValue();

      const result = await service.generatePreKeys(start, count);

      expect(NativeLibsignal.generatePreKeys).toHaveBeenCalledWith(start, count);
      expect(mockStore.storePreKey).toHaveBeenCalledTimes(count);
      expect(result).toEqual(mockPreKeys);
    });

    it('should store each prekey', async () => {
      const mockPreKeys = [
        { id: 1, publicKey: 'key1' },
        { id: 2, publicKey: 'key2' }
      ];

      NativeLibsignal.generatePreKeys.mockResolvedValue(mockPreKeys);

      await service.generatePreKeys(1, 2);

      expect(mockStore.storePreKey).toHaveBeenCalledWith(1, 'key1', expect.any(String));
      expect(mockStore.storePreKey).toHaveBeenCalledWith(2, 'key2', expect.any(String));
    });

    it('should handle generation errors', async () => {
      NativeLibsignal.generatePreKeys.mockRejectedValue(new Error('PreKey generation failed'));

      await expect(service.generatePreKeys(1, 10)).rejects.toThrow('PreKey generation failed');
    });
  });

  describe('generateSignedPreKey', () => {
    it('should generate signed prekey', async () => {
      const mockSignedPreKey = {
        id: 1,
        publicKey: 'signed-public',
        privateKey: 'signed-private',
        signature: 'signature',
        timestamp: Date.now()
      };

      mockStore.getIdentityKeyPair.mockResolvedValue({
        publicKey: 'identity-public',
        privateKey: 'identity-private'
      });
      NativeLibsignal.generateSignedPreKey.mockResolvedValue(mockSignedPreKey);
      mockStore.storeSignedPreKey.mockResolvedValue();

      const result = await service.generateSignedPreKey();

      expect(NativeLibsignal.generateSignedPreKey).toHaveBeenCalledWith('identity-private', 1);
      expect(mockStore.storeSignedPreKey).toHaveBeenCalledWith(
        mockSignedPreKey.id,
        mockSignedPreKey.publicKey,
        mockSignedPreKey.privateKey,
        mockSignedPreKey.signature,
        mockSignedPreKey.timestamp
      );
      expect(result).toEqual(mockSignedPreKey);
    });

    it('should increment signed prekey ID', async () => {
      const mockSignedPreKey = {
        id: 5,
        publicKey: 'signed-public',
        privateKey: 'signed-private',
        signature: 'signature',
        timestamp: Date.now()
      };

      mockStore.getIdentityKeyPair.mockResolvedValue({
        publicKey: 'identity-public',
        privateKey: 'identity-private'
      });
      mockStore.getCurrentSignedPreKeyId.mockResolvedValue(4);
      NativeLibsignal.generateSignedPreKey.mockResolvedValue(mockSignedPreKey);

      await service.generateSignedPreKey();

      expect(NativeLibsignal.generateSignedPreKey).toHaveBeenCalledWith('identity-private', 5);
    });

    it('should throw if no identity key', async () => {
      mockStore.getIdentityKeyPair.mockResolvedValue(null);

      await expect(service.generateSignedPreKey()).rejects.toThrow('No identity key pair found');
    });
  });

  describe('generateSenderKey', () => {
    it('should generate sender key', async () => {
      const mockKeyPair = {
        publicKey: 'sender-public',
        privateKey: 'sender-private'
      };

      NativeLibsignal.generateKeyPair.mockResolvedValue(mockKeyPair);

      const result = await service.generateSenderKey();

      expect(NativeLibsignal.generateKeyPair).toHaveBeenCalled();
      expect(result).toEqual(mockKeyPair);
    });

    it('should handle errors', async () => {
      NativeLibsignal.generateKeyPair.mockRejectedValue(new Error('Sender key failed'));

      await expect(service.generateSenderKey()).rejects.toThrow('Sender key failed');
    });
  });

  describe('generateInitialKeys', () => {
    it('should generate all initial keys', async () => {
      const mockIdentityKeyPair = {
        publicKey: 'identity-public',
        privateKey: 'identity-private'
      };
      const mockRegId = 12345;
      const mockPreKeys = Array.from({ length: 100 }, (_, i) => ({
        id: i + 1,
        publicKey: `prekey-${i}`
      }));
      const mockSignedPreKey = {
        id: 1,
        publicKey: 'signed-public',
        privateKey: 'signed-private',
        signature: 'signature',
        timestamp: Date.now()
      };

      // Set up mocks in order
      service.generateIdentityKeyPair = jest.fn().mockResolvedValue(mockIdentityKeyPair);
      service.generateRegistrationId = jest.fn().mockResolvedValue(mockRegId);
      service.generatePreKeys = jest.fn().mockResolvedValue(mockPreKeys);
      service.generateSignedPreKey = jest.fn().mockResolvedValue(mockSignedPreKey);

      const result = await service.generateInitialKeys();

      expect(service.generateIdentityKeyPair).toHaveBeenCalled();
      expect(service.generateRegistrationId).toHaveBeenCalled();
      expect(service.generatePreKeys).toHaveBeenCalledWith(1, 100);
      expect(service.generateSignedPreKey).toHaveBeenCalled();

      expect(result).toEqual({
        identityKeyPair: mockIdentityKeyPair,
        registrationId: mockRegId,
        preKeys: mockPreKeys,
        signedPreKey: mockSignedPreKey
      });
    });

    it('should handle partial failures', async () => {
      service.generateIdentityKeyPair = jest.fn().mockResolvedValue({
        publicKey: 'identity-public',
        privateKey: 'identity-private'
      });
      service.generateRegistrationId = jest.fn().mockRejectedValue(new Error('Reg ID failed'));

      await expect(service.generateInitialKeys()).rejects.toThrow('Reg ID failed');
      expect(logger.error).toHaveBeenCalled();
    });
  });

  describe('getOrCreateIdentityKeyPair', () => {
    it('should return existing key pair', async () => {
      const existingKeyPair = {
        publicKey: 'existing-public',
        privateKey: 'existing-private'
      };

      mockStore.getIdentityKeyPair.mockResolvedValue(existingKeyPair);

      const result = await service.getOrCreateIdentityKeyPair();

      expect(mockStore.getIdentityKeyPair).toHaveBeenCalled();
      expect(service.generateIdentityKeyPair).not.toHaveBeenCalled();
      expect(result).toEqual(existingKeyPair);
    });

    it('should generate new key pair if none exists', async () => {
      const newKeyPair = {
        publicKey: 'new-public',
        privateKey: 'new-private'
      };

      mockStore.getIdentityKeyPair.mockResolvedValue(null);
      service.generateIdentityKeyPair = jest.fn().mockResolvedValue(newKeyPair);

      const result = await service.getOrCreateIdentityKeyPair();

      expect(mockStore.getIdentityKeyPair).toHaveBeenCalled();
      expect(service.generateIdentityKeyPair).toHaveBeenCalled();
      expect(result).toEqual(newKeyPair);
    });
  });

  describe('validateKeys', () => {
    it('should validate all keys successfully', async () => {
      mockStore.hasIdentityKey.mockResolvedValue(true);
      mockStore.getLocalRegistrationId.mockResolvedValue(12345);
      mockStore.getPreKeyCount.mockResolvedValue(50);
      mockStore.getCurrentSignedPreKeyId.mockResolvedValue(1);

      const result = await service.validateKeys();

      expect(result).toEqual({
        hasIdentityKey: true,
        hasRegistrationId: true,
        preKeyCount: 50,
        hasSignedPreKey: true
      });
    });

    it('should detect missing keys', async () => {
      mockStore.hasIdentityKey.mockResolvedValue(false);
      mockStore.getLocalRegistrationId.mockResolvedValue(0);
      mockStore.getPreKeyCount.mockResolvedValue(0);
      mockStore.getCurrentSignedPreKeyId.mockResolvedValue(0);

      const result = await service.validateKeys();

      expect(result).toEqual({
        hasIdentityKey: false,
        hasRegistrationId: false,
        preKeyCount: 0,
        hasSignedPreKey: false
      });
    });
  });
});