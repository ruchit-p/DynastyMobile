import { SafetyNumberService } from '../SafetyNumberService';
import NativeLibsignal from '../../specs/NativeLibsignal';
import firestore from '@react-native-firebase/firestore';

// Mock dependencies
jest.mock('../../specs/NativeLibsignal');
jest.mock('@react-native-firebase/firestore', () => ({
  __esModule: true,
  default: jest.fn(() => ({
    collection: jest.fn(() => ({
      doc: jest.fn(() => ({
        get: jest.fn(() => Promise.resolve({
          exists: true,
          data: () => ({ verified: true })
        })),
        set: jest.fn(() => Promise.resolve()),
        update: jest.fn(() => Promise.resolve()),
      }))
    }))
  }))
}));

describe('SafetyNumberService', () => {
  let service: SafetyNumberService;
  
  beforeEach(() => {
    jest.clearAllMocks();
    service = SafetyNumberService.getInstance();
  });

  describe('generateSafetyNumber', () => {
    it('generates safety number successfully', async () => {
      const mockSafetyNumber = {
        displayString: '12345 67890 12345 67890 12345 67890',
        qrCodeData: 'mock-qr-data'
      };
      
      (NativeLibsignal.generateSafetyNumber as jest.Mock).mockResolvedValue(mockSafetyNumber);
      
      const result = await service.generateSafetyNumber('user123', 'Test User');
      
      expect(NativeLibsignal.generateSafetyNumber).toHaveBeenCalledWith('user123');
      expect(result).toEqual({
        numberString: mockSafetyNumber.displayString,
        qrCodeData: mockSafetyNumber.qrCodeData,
        localUserId: expect.any(String),
        remoteUserId: 'user123',
        remoteUserName: 'Test User',
        timestamp: expect.any(Date),
      });
    });

    it('handles errors when generating safety number', async () => {
      const mockError = new Error('Failed to generate');
      (NativeLibsignal.generateSafetyNumber as jest.Mock).mockRejectedValue(mockError);
      
      await expect(service.generateSafetyNumber('user123', 'Test User'))
        .rejects.toThrow('Failed to generate safety number');
    });
  });

  describe('verifySafetyNumber', () => {
    it('verifies safety number from QR code', async () => {
      (NativeLibsignal.verifySafetyNumber as jest.Mock).mockResolvedValue(true);
      
      const result = await service.verifySafetyNumber('user123', 'qr-code-data');
      
      expect(NativeLibsignal.verifySafetyNumber).toHaveBeenCalledWith('user123', 'qr-code-data');
      expect(result).toBe(true);
    });

    it('returns false for invalid QR code', async () => {
      (NativeLibsignal.verifySafetyNumber as jest.Mock).mockResolvedValue(false);
      
      const result = await service.verifySafetyNumber('user123', 'invalid-qr-data');
      
      expect(result).toBe(false);
    });
  });

  describe('markAsVerified', () => {
    it('marks user as verified in Firestore', async () => {
      const mockCurrentUser = { uid: 'current-user' };
      const mockSet = jest.fn(() => Promise.resolve());
      const mockUpdate = jest.fn(() => Promise.resolve());
      
      const mockDoc = jest.fn(() => ({
        set: mockSet,
        update: mockUpdate,
      }));
      
      const mockCollection = jest.fn(() => ({ doc: mockDoc }));
      (firestore as jest.Mock).mockReturnValue({ collection: mockCollection });
      
      await service.markAsVerified('user123', true);
      
      expect(mockCollection).toHaveBeenCalledWith('users');
      expect(mockDoc).toHaveBeenCalled();
      expect(mockSet).toHaveBeenCalledWith(
        { verified: true },
        { merge: true }
      );
    });

    it('marks user as unverified', async () => {
      const mockSet = jest.fn(() => Promise.resolve());
      const mockDoc = jest.fn(() => ({ set: mockSet }));
      const mockCollection = jest.fn(() => ({ doc: mockDoc }));
      (firestore as jest.Mock).mockReturnValue({ collection: mockCollection });
      
      await service.markAsVerified('user123', false);
      
      expect(mockSet).toHaveBeenCalledWith(
        { verified: false },
        { merge: true }
      );
    });
  });

  describe('getVerificationStatus', () => {
    it('returns verification status from Firestore', async () => {
      const mockGet = jest.fn(() => Promise.resolve({
        exists: true,
        data: () => ({ verified: true })
      }));
      
      const mockDoc = jest.fn(() => ({ get: mockGet }));
      const mockCollection = jest.fn(() => ({ doc: mockDoc }));
      (firestore as jest.Mock).mockReturnValue({ collection: mockCollection });
      
      const result = await service.getVerificationStatus('current-user', 'user123');
      
      expect(result).toBe(true);
    });

    it('returns false for non-existent verification', async () => {
      const mockGet = jest.fn(() => Promise.resolve({
        exists: false,
        data: () => null
      }));
      
      const mockDoc = jest.fn(() => ({ get: mockGet }));
      const mockCollection = jest.fn(() => ({ doc: mockDoc }));
      (firestore as jest.Mock).mockReturnValue({ collection: mockCollection });
      
      const result = await service.getVerificationStatus('current-user', 'user123');
      
      expect(result).toBe(false);
    });

    it('returns false when verified field is not set', async () => {
      const mockGet = jest.fn(() => Promise.resolve({
        exists: true,
        data: () => ({})
      }));
      
      const mockDoc = jest.fn(() => ({ get: mockGet }));
      const mockCollection = jest.fn(() => ({ doc: mockDoc }));
      (firestore as jest.Mock).mockReturnValue({ collection: mockCollection });
      
      const result = await service.getVerificationStatus('current-user', 'user123');
      
      expect(result).toBe(false);
    });
  });

  describe('compareSafetyNumbers', () => {
    it('compares safety numbers correctly', async () => {
      const currentNumber = {
        displayString: '12345 67890',
        qrCodeData: 'qr1'
      };
      
      const newNumber = {
        displayString: '12345 67890',
        qrCodeData: 'qr1'
      };
      
      (NativeLibsignal.generateSafetyNumber as jest.Mock)
        .mockResolvedValueOnce(currentNumber)
        .mockResolvedValueOnce(newNumber);
      
      const result = await service.compareSafetyNumbers('user123');
      
      expect(result).toBe(true);
    });

    it('detects changed safety numbers', async () => {
      const currentNumber = {
        displayString: '12345 67890',
        qrCodeData: 'qr1'
      };
      
      const newNumber = {
        displayString: '09876 54321',
        qrCodeData: 'qr2'
      };
      
      (NativeLibsignal.generateSafetyNumber as jest.Mock)
        .mockResolvedValueOnce(currentNumber)
        .mockResolvedValueOnce(newNumber);
      
      const result = await service.compareSafetyNumbers('user123');
      
      expect(result).toBe(false);
    });
  });
});