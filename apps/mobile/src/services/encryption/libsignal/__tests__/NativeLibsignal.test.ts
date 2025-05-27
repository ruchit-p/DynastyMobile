import NativeLibsignal from '../../../../specs/NativeLibsignal';
import { NativeLibsignalService } from '../NativeLibsignalService';

// Mock the native module for testing
jest.mock('../../../../specs/NativeLibsignal', () => ({
  generateIdentityKeyPair: jest.fn(),
  getIdentityKeyPair: jest.fn(),
  saveIdentityKeyPair: jest.fn(),
  generateRegistrationId: jest.fn(),
  getLocalRegistrationId: jest.fn(),
  generatePreKeys: jest.fn(),
  generateSignedPreKey: jest.fn(),
  createSession: jest.fn(),
  hasSession: jest.fn(),
  encryptMessage: jest.fn(),
  decryptPreKeyMessage: jest.fn(),
  decryptMessage: jest.fn(),
  generateSafetyNumber: jest.fn(),
  clearAllData: jest.fn(),
  generateKeyPair: jest.fn(),
}));

describe('NativeLibsignal', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Native Module Interface', () => {
    it('should generate identity key pair', async () => {
      const mockKeyPair = {
        publicKey: 'mockPublicKey',
        privateKey: 'mockPrivateKey'
      };
      
      (NativeLibsignal.generateIdentityKeyPair as jest.Mock).mockResolvedValue(mockKeyPair);
      
      const result = await NativeLibsignal.generateIdentityKeyPair();
      
      expect(result).toEqual(mockKeyPair);
      expect(NativeLibsignal.generateIdentityKeyPair).toHaveBeenCalledTimes(1);
    });

    it('should generate registration ID', async () => {
      const mockRegId = 12345;
      
      (NativeLibsignal.generateRegistrationId as jest.Mock).mockResolvedValue(mockRegId);
      
      const result = await NativeLibsignal.generateRegistrationId();
      
      expect(result).toBe(mockRegId);
      expect(NativeLibsignal.generateRegistrationId).toHaveBeenCalledTimes(1);
    });

    it('should generate pre-keys', async () => {
      const mockPreKeys = [
        { id: 1, publicKey: 'preKey1' },
        { id: 2, publicKey: 'preKey2' }
      ];
      
      (NativeLibsignal.generatePreKeys as jest.Mock).mockResolvedValue(mockPreKeys);
      
      const result = await NativeLibsignal.generatePreKeys(1, 2);
      
      expect(result).toEqual(mockPreKeys);
      expect(NativeLibsignal.generatePreKeys).toHaveBeenCalledWith(1, 2);
    });

    it('should encrypt message', async () => {
      const mockEncrypted = {
        type: 3,
        body: 'encryptedMessage'
      };
      
      const address = { name: 'user123', deviceId: 1 };
      
      (NativeLibsignal.encryptMessage as jest.Mock).mockResolvedValue(mockEncrypted);
      
      const result = await NativeLibsignal.encryptMessage('Hello', address);
      
      expect(result).toEqual(mockEncrypted);
      expect(NativeLibsignal.encryptMessage).toHaveBeenCalledWith('Hello', address, undefined);
    });

    it('should decrypt message', async () => {
      const mockDecrypted = {
        plaintext: 'Hello',
        messageType: 3
      };
      
      const address = { name: 'user123', deviceId: 1 };
      
      (NativeLibsignal.decryptMessage as jest.Mock).mockResolvedValue(mockDecrypted);
      
      const result = await NativeLibsignal.decryptMessage('encryptedMessage', address);
      
      expect(result).toEqual(mockDecrypted);
      expect(NativeLibsignal.decryptMessage).toHaveBeenCalledWith('encryptedMessage', address);
    });

    it('should generate safety number', async () => {
      const mockSafetyNumber = {
        numberString: '12345 67890 12345 67890',
        qrCodeData: 'qrCodeBase64'
      };
      
      (NativeLibsignal.generateSafetyNumber as jest.Mock).mockResolvedValue(mockSafetyNumber);
      
      const result = await NativeLibsignal.generateSafetyNumber(
        'localKey',
        'remoteKey',
        'alice',
        'bob'
      );
      
      expect(result).toEqual(mockSafetyNumber);
      expect(NativeLibsignal.generateSafetyNumber).toHaveBeenCalledWith(
        'localKey',
        'remoteKey',
        'alice',
        'bob'
      );
    });
  });

  describe('NativeLibsignalService', () => {
    let service: NativeLibsignalService;

    beforeEach(() => {
      service = NativeLibsignalService.getInstance();
    });

    it('should be a singleton', () => {
      const instance1 = NativeLibsignalService.getInstance();
      const instance2 = NativeLibsignalService.getInstance();
      
      expect(instance1).toBe(instance2);
    });

    it('should generate key pair', async () => {
      const mockKeyPair = {
        publicKey: 'mockPublicKey',
        privateKey: 'mockPrivateKey'
      };
      
      (NativeLibsignal.generateKeyPair as jest.Mock).mockResolvedValue(mockKeyPair);
      
      const result = await service.generateKeyPair();
      
      expect(result).toEqual(mockKeyPair);
      expect(NativeLibsignal.generateKeyPair).toHaveBeenCalledTimes(1);
    });

    it('should clear all data', async () => {
      (NativeLibsignal.clearAllData as jest.Mock).mockResolvedValue(undefined);
      
      await NativeLibsignalService.clearAllSignalData();
      
      expect(NativeLibsignal.clearAllData).toHaveBeenCalledTimes(1);
    });
  });
});