import BiometricVaultAccess from '../../src/services/encryption/BiometricVaultAccess';
import VaultCryptoService from '../../src/services/encryption/VaultCryptoService';
import VaultKeyManager from '../../src/services/encryption/VaultKeyManager';
import * as LocalAuthentication from 'expo-local-authentication';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Alert } from 'react-native';

// Mock dependencies
jest.mock('expo-local-authentication');
jest.mock('@react-native-async-storage/async-storage');
jest.mock('../../src/services/encryption/VaultCryptoService');
jest.mock('../../src/services/encryption/VaultKeyManager');
jest.mock('../../src/services/LoggingService', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn()
  }
}));
jest.mock('react-native', () => ({
  Alert: {
    alert: jest.fn()
  },
  Platform: {
    OS: 'ios'
  }
}));

const mockLocalAuth = LocalAuthentication as jest.Mocked<typeof LocalAuthentication>;
const mockAsyncStorage = AsyncStorage as jest.Mocked<typeof AsyncStorage>;
const mockCryptoService = VaultCryptoService as jest.Mocked<typeof VaultCryptoService>;
const mockKeyManager = VaultKeyManager as jest.Mocked<typeof VaultKeyManager>;
const mockAlert = Alert as jest.Mocked<typeof Alert>;

describe('BiometricVaultAccess', () => {
  let biometricAccess: BiometricVaultAccess;
  const testUserId = 'test-user-123';
  const testPassword = 'test-password-456';
  const testMasterKey = new Uint8Array(32);
  
  beforeEach(() => {
    biometricAccess = BiometricVaultAccess.getInstance();
    jest.clearAllMocks();
    
    testMasterKey.fill(42);
    
    // Mock VaultCryptoService
    mockCryptoService.getInstance = jest.fn().mockReturnValue({
      generateSalt: jest.fn().mockReturnValue(new Uint8Array(32)),
      deriveVaultMasterKey: jest.fn().mockResolvedValue(testMasterKey),
      generateSecureFileId: jest.fn().mockReturnValue('secure-id-123')
    });
    
    // Mock VaultKeyManager
    mockKeyManager.getInstance = jest.fn().mockReturnValue({
      storeVaultSalt: jest.fn().mockResolvedValue(undefined),
      storeVaultMasterKey: jest.fn().mockResolvedValue({
        keyId: 'key-123',
        createdAt: Date.now(),
        isActive: true,
        version: '1.0'
      }),
      generateFamilyKeyPair: jest.fn().mockResolvedValue({
        publicKey: 'public-key',
        privateKey: 'private-key',
        keyId: 'keypair-123',
        createdAt: Date.now()
      }),
      storeVaultConfiguration: jest.fn().mockResolvedValue(undefined),
      retrieveVaultMasterKey: jest.fn().mockResolvedValue(testMasterKey),
      hasVaultKeys: jest.fn().mockResolvedValue(false),
      retrieveVaultConfiguration: jest.fn().mockResolvedValue(null),
      deleteAllVaultKeys: jest.fn().mockResolvedValue(undefined)
    });
  });

  describe('Biometric Capabilities', () => {
    it('should check biometric capabilities correctly', async () => {
      mockLocalAuth.hasHardwareAsync.mockResolvedValue(true);
      mockLocalAuth.isEnrolledAsync.mockResolvedValue(true);
      mockLocalAuth.supportedAuthenticationTypesAsync.mockResolvedValue([
        LocalAuthentication.AuthenticationType.FINGERPRINT,
        LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION
      ]);
      
      const capabilities = await biometricAccess.checkBiometricCapabilities();
      
      expect(capabilities.isAvailable).toBe(true);
      expect(capabilities.hasHardware).toBe(true);
      expect(capabilities.isEnrolled).toBe(true);
      expect(capabilities.securityLevel).toBe('biometric');
      expect(capabilities.supportedTypes).toEqual([
        LocalAuthentication.AuthenticationType.FINGERPRINT,
        LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION
      ]);
    });

    it('should handle device without biometric hardware', async () => {
      mockLocalAuth.hasHardwareAsync.mockResolvedValue(false);
      mockLocalAuth.isEnrolledAsync.mockResolvedValue(false);
      mockLocalAuth.supportedAuthenticationTypesAsync.mockResolvedValue([]);
      
      const capabilities = await biometricAccess.checkBiometricCapabilities();
      
      expect(capabilities.isAvailable).toBe(false);
      expect(capabilities.hasHardware).toBe(false);
      expect(capabilities.securityLevel).toBe('none');
    });

    it('should detect device credential only security', async () => {
      mockLocalAuth.hasHardwareAsync.mockResolvedValue(true);
      mockLocalAuth.isEnrolledAsync.mockResolvedValue(true);
      mockLocalAuth.supportedAuthenticationTypesAsync.mockResolvedValue([
        LocalAuthentication.AuthenticationType.PASSCODE
      ]);
      
      const capabilities = await biometricAccess.checkBiometricCapabilities();
      
      expect(capabilities.isAvailable).toBe(true);
      expect(capabilities.securityLevel).toBe('device_credential');
    });

    it('should handle capabilities check errors gracefully', async () => {
      mockLocalAuth.hasHardwareAsync.mockRejectedValue(new Error('Hardware check failed'));
      
      const capabilities = await biometricAccess.checkBiometricCapabilities();
      
      expect(capabilities.isAvailable).toBe(false);
      expect(capabilities.securityLevel).toBe('none');
    });
  });

  describe('Vault Setup', () => {
    it('should setup vault with biometric protection', async () => {
      const setupOptions = {
        password: testPassword,
        enableBiometric: true,
        enableKeyRotation: true,
        familyVaultMode: false
      };
      
      mockLocalAuth.hasHardwareAsync.mockResolvedValue(true);
      mockLocalAuth.isEnrolledAsync.mockResolvedValue(true);
      mockLocalAuth.supportedAuthenticationTypesAsync.mockResolvedValue([
        LocalAuthentication.AuthenticationType.FINGERPRINT
      ]);
      
      mockAsyncStorage.getItem.mockResolvedValue(null); // No existing setup
      mockAsyncStorage.setItem.mockResolvedValue();
      
      const result = await biometricAccess.setupBiometricVault(testUserId, setupOptions);
      
      expect(result.success).toBe(true);
      expect(result.masterKey).toEqual(testMasterKey);
      
      // Verify salt and key were stored
      expect(mockKeyManager.getInstance().storeVaultSalt).toHaveBeenCalled();
      expect(mockKeyManager.getInstance().storeVaultMasterKey).toHaveBeenCalledWith(
        testUserId,
        testMasterKey,
        { requireBiometric: true, keyRotation: false }
      );
      
      // Verify vault configuration was stored
      expect(mockKeyManager.getInstance().storeVaultConfiguration).toHaveBeenCalledWith(
        testUserId,
        expect.objectContaining({
          encryptionVersion: '1.0',
          keyRotationEnabled: true,
          familyMode: false,
          memberCount: 1
        })
      );
    });

    it('should setup vault with family mode enabled', async () => {
      const setupOptions = {
        password: testPassword,
        enableBiometric: true,
        enableKeyRotation: false,
        familyVaultMode: true
      };
      
      mockLocalAuth.hasHardwareAsync.mockResolvedValue(true);
      mockLocalAuth.isEnrolledAsync.mockResolvedValue(true);
      mockLocalAuth.supportedAuthenticationTypesAsync.mockResolvedValue([
        LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION
      ]);
      
      mockAsyncStorage.getItem.mockResolvedValue(null);
      mockAsyncStorage.setItem.mockResolvedValue();
      
      const result = await biometricAccess.setupBiometricVault(testUserId, setupOptions);
      
      expect(result.success).toBe(true);
      
      // Verify family keypair was generated
      expect(mockKeyManager.getInstance().generateFamilyKeyPair).toHaveBeenCalledWith(testUserId);
      
      // Verify vault configuration includes family mode
      expect(mockKeyManager.getInstance().storeVaultConfiguration).toHaveBeenCalledWith(
        testUserId,
        expect.objectContaining({
          familyMode: true
        })
      );
    });

    it('should fail setup when biometric not available', async () => {
      const setupOptions = {
        password: testPassword,
        enableBiometric: true,
        enableKeyRotation: false,
        familyVaultMode: false
      };
      
      mockLocalAuth.hasHardwareAsync.mockResolvedValue(false);
      mockLocalAuth.isEnrolledAsync.mockResolvedValue(false);
      mockLocalAuth.supportedAuthenticationTypesAsync.mockResolvedValue([]);
      
      const result = await biometricAccess.setupBiometricVault(testUserId, setupOptions);
      
      expect(result.success).toBe(false);
      expect(result.error).toBe('Biometric authentication not available');
    });

    it('should fail setup when vault already exists', async () => {
      const setupOptions = {
        password: testPassword,
        enableBiometric: true,
        enableKeyRotation: false,
        familyVaultMode: false
      };
      
      mockAsyncStorage.getItem.mockResolvedValue('existing-setup-data');
      
      const result = await biometricAccess.setupBiometricVault(testUserId, setupOptions);
      
      expect(result.success).toBe(false);
      expect(result.error).toBe('Vault already setup for this user');
    });
  });

  describe('Vault Authentication', () => {
    beforeEach(() => {
      // Setup existing vault
      mockAsyncStorage.getItem.mockImplementation((key) => {
        if (key === `biometric_vault_setup_${testUserId}`) {
          return Promise.resolve(JSON.stringify({
            biometricEnabled: true,
            setupTimestamp: Date.now(),
            keyId: 'key-123'
          }));
        }
        return Promise.resolve(null);
      });
    });

    it('should authenticate and unlock vault successfully', async () => {
      mockLocalAuth.hasHardwareAsync.mockResolvedValue(true);
      mockLocalAuth.isEnrolledAsync.mockResolvedValue(true);
      mockLocalAuth.supportedAuthenticationTypesAsync.mockResolvedValue([
        LocalAuthentication.AuthenticationType.FINGERPRINT
      ]);
      
      mockLocalAuth.authenticateAsync.mockResolvedValue({
        success: true
      });
      
      const result = await biometricAccess.authenticateAndAccessVault(testUserId);
      
      expect(result.success).toBe(true);
      expect(result.masterKey).toEqual(testMasterKey);
      expect(mockKeyManager.getInstance().retrieveVaultMasterKey).toHaveBeenCalledWith(
        testUserId,
        expect.objectContaining({
          promptMessage: 'Unlock Dynasty Vault',
          fallbackToPasscode: true
        })
      );
    });

    it('should handle authentication cancellation', async () => {
      mockLocalAuth.authenticateAsync.mockResolvedValue({
        success: false,
        error: 'UserCancel'
      });
      
      const result = await biometricAccess.authenticateAndAccessVault(testUserId);
      
      expect(result.success).toBe(false);
      expect(result.error).toBe('Authentication cancelled');
    });

    it('should handle authentication failure with attempt tracking', async () => {
      mockLocalAuth.authenticateAsync.mockResolvedValue({
        success: false,
        error: 'AuthenticationFailed'
      });
      
      mockAsyncStorage.getItem.mockImplementation((key) => {
        if (key === `biometric_vault_setup_${testUserId}`) {
          return Promise.resolve(JSON.stringify({ biometricEnabled: true }));
        }
        if (key === `vault_failed_attempts_${testUserId}`) {
          return Promise.resolve('2'); // 2 previous attempts
        }
        return Promise.resolve(null);
      });
      
      mockAsyncStorage.setItem.mockResolvedValue();
      
      const result = await biometricAccess.authenticateAndAccessVault(testUserId);
      
      expect(result.success).toBe(false);
      expect(result.error).toContain('Authentication failed (3/5 attempts)');
      
      // Verify failed attempt was recorded
      expect(mockAsyncStorage.setItem).toHaveBeenCalledWith(
        `vault_failed_attempts_${testUserId}`,
        '3'
      );
    });

    it('should handle lockout after max failed attempts', async () => {
      const lockoutTime = Date.now();
      
      mockAsyncStorage.getItem.mockImplementation((key) => {
        if (key === `biometric_vault_setup_${testUserId}`) {
          return Promise.resolve(JSON.stringify({ biometricEnabled: true }));
        }
        if (key === `vault_failed_attempts_${testUserId}`) {
          return Promise.resolve('5'); // Max attempts reached
        }
        if (key === `vault_last_lockout_${testUserId}`) {
          return Promise.resolve(lockoutTime.toString());
        }
        return Promise.resolve(null);
      });
      
      const result = await biometricAccess.authenticateAndAccessVault(testUserId);
      
      expect(result.success).toBe(false);
      expect(result.isLockedOut).toBe(true);
      expect(result.remainingLockoutTime).toBeGreaterThan(0);
    });

    it('should require vault setup when not configured', async () => {
      mockAsyncStorage.getItem.mockResolvedValue(null); // No setup data
      
      const result = await biometricAccess.authenticateAndAccessVault(testUserId);
      
      expect(result.success).toBe(false);
      expect(result.requiresSetup).toBe(true);
      expect(result.error).toBe('Vault not setup');
    });

    it('should use custom authentication options', async () => {
      mockLocalAuth.authenticateAsync.mockResolvedValue({ success: true });
      
      await biometricAccess.authenticateAndAccessVault(testUserId, {
        promptMessage: 'Custom prompt',
        fallbackToPasscode: false
      });
      
      expect(mockLocalAuth.authenticateAsync).toHaveBeenCalledWith({
        promptMessage: 'Custom prompt',
        fallbackLabel: undefined,
        disableDeviceFallback: true,
        requireConfirmation: false,
        cancelLabel: 'Cancel'
      });
    });
  });

  describe('Password Management', () => {
    it('should change vault password successfully', async () => {
      const currentPassword = 'old-password';
      const newPassword = 'new-password';
      const currentSalt = new Uint8Array(32);
      const newSalt = new Uint8Array(32);
      const newMasterKey = new Uint8Array(32);
      
      currentSalt.fill(100);
      newSalt.fill(200);
      newMasterKey.fill(50);
      
      mockKeyManager.getInstance().retrieveVaultSalt.mockResolvedValue(currentSalt);
      mockKeyManager.getInstance().retrieveVaultMasterKey.mockResolvedValue(testMasterKey);
      
      mockCryptoService.getInstance().generateSalt.mockReturnValue(newSalt);
      mockCryptoService.getInstance().deriveVaultMasterKey
        .mockResolvedValueOnce(testMasterKey) // Current password verification
        .mockResolvedValueOnce(newMasterKey); // New password derivation
      
      mockKeyManager.getInstance().storeVaultSalt.mockResolvedValue();
      mockKeyManager.getInstance().storeVaultMasterKey.mockResolvedValue({
        keyId: 'new-key-123',
        createdAt: Date.now(),
        isActive: true,
        version: '1.0'
      });
      
      const result = await biometricAccess.changeVaultPassword(
        testUserId,
        currentPassword,
        newPassword
      );
      
      expect(result.success).toBe(true);
      expect(result.masterKey).toEqual(newMasterKey);
      
      // Verify new salt and key were stored
      expect(mockKeyManager.getInstance().storeVaultSalt).toHaveBeenCalledWith(testUserId, newSalt);
      expect(mockKeyManager.getInstance().storeVaultMasterKey).toHaveBeenCalledWith(testUserId, newMasterKey);
    });

    it('should fail when current password is incorrect', async () => {
      mockKeyManager.getInstance().retrieveVaultSalt.mockResolvedValue(new Uint8Array(32));
      mockKeyManager.getInstance().retrieveVaultMasterKey.mockRejectedValue(
        new Error('Authentication failed')
      );
      
      const result = await biometricAccess.changeVaultPassword(
        testUserId,
        'wrong-password',
        'new-password'
      );
      
      expect(result.success).toBe(false);
      expect(result.error).toBe('Current password is incorrect');
    });

    it('should fail when salt is not found', async () => {
      mockKeyManager.getInstance().retrieveVaultSalt.mockResolvedValue(null);
      
      const result = await biometricAccess.changeVaultPassword(
        testUserId,
        'current-password',
        'new-password'
      );
      
      expect(result.success).toBe(false);
      expect(result.error).toBe('Current vault salt not found');
    });
  });

  describe('Security Status', () => {
    it('should get comprehensive vault security status', async () => {
      const setupData = {
        biometricEnabled: true,
        lastAccess: Date.now() - 1000,
        setupTimestamp: Date.now() - 10000
      };
      
      const vaultConfig = {
        keyRotationEnabled: true,
        nextRotation: Date.now() + 1000000
      };
      
      mockAsyncStorage.getItem.mockImplementation((key) => {
        if (key === `biometric_vault_setup_${testUserId}`) {
          return Promise.resolve(JSON.stringify(setupData));
        }
        if (key === `vault_failed_attempts_${testUserId}`) {
          return Promise.resolve('2');
        }
        return Promise.resolve(null);
      });
      
      mockKeyManager.getInstance().hasVaultKeys.mockResolvedValue(true);
      mockKeyManager.getInstance().retrieveVaultConfiguration.mockResolvedValue(vaultConfig);
      
      const status = await biometricAccess.getVaultSecurityStatus(testUserId);
      
      expect(status.isSetup).toBe(true);
      expect(status.biometricEnabled).toBe(true);
      expect(status.keyRotationEnabled).toBe(true);
      expect(status.lastAccess).toBe(setupData.lastAccess);
      expect(status.failedAttempts).toBe(2);
      expect(status.isLockedOut).toBe(false);
      expect(status.nextKeyRotation).toBe(vaultConfig.nextRotation);
    });

    it('should handle missing vault gracefully', async () => {
      mockKeyManager.getInstance().hasVaultKeys.mockResolvedValue(false);
      mockAsyncStorage.getItem.mockResolvedValue(null);
      
      const status = await biometricAccess.getVaultSecurityStatus(testUserId);
      
      expect(status.isSetup).toBe(false);
      expect(status.biometricEnabled).toBe(false);
      expect(status.failedAttempts).toBe(0);
    });
  });

  describe('Vault Reset', () => {
    it('should reset vault after confirmation', async () => {
      // Mock confirmation dialog
      mockAlert.alert.mockImplementation((title, message, buttons) => {
        const confirmButton = buttons?.find(b => b.text === 'Reset Vault');
        if (confirmButton && confirmButton.onPress) {
          confirmButton.onPress();
        }
      });
      
      const result = await biometricAccess.resetVault(testUserId);
      
      expect(result).toBe(true);
      expect(mockKeyManager.getInstance().deleteAllVaultKeys).toHaveBeenCalledWith(testUserId);
      expect(mockAsyncStorage.removeItem).toHaveBeenCalledWith(`biometric_vault_setup_${testUserId}`);
    });

    it('should cancel reset when user cancels', async () => {
      // Mock cancellation
      mockAlert.alert.mockImplementation((title, message, buttons) => {
        const cancelButton = buttons?.find(b => b.text === 'Cancel');
        if (cancelButton && cancelButton.onPress) {
          cancelButton.onPress();
        }
      });
      
      const result = await biometricAccess.resetVault(testUserId);
      
      expect(result).toBe(false);
      expect(mockKeyManager.getInstance().deleteAllVaultKeys).not.toHaveBeenCalled();
    });
  });

  describe('Failed Attempt Management', () => {
    it('should track and reset failed attempts correctly', async () => {
      // Test failed attempt recording
      mockAsyncStorage.getItem.mockResolvedValue('2'); // 2 previous attempts
      mockAsyncStorage.setItem.mockResolvedValue();
      
      // Simulate failed authentication
      mockLocalAuth.authenticateAsync.mockResolvedValue({
        success: false,
        error: 'AuthenticationFailed'
      });
      
      await biometricAccess.authenticateAndAccessVault(testUserId);
      
      // Verify attempt was incremented
      expect(mockAsyncStorage.setItem).toHaveBeenCalledWith(
        `vault_failed_attempts_${testUserId}`,
        '3'
      );
      
      // Test successful authentication resets attempts
      mockLocalAuth.authenticateAsync.mockResolvedValue({ success: true });
      mockAsyncStorage.removeItem.mockResolvedValue();
      
      await biometricAccess.authenticateAndAccessVault(testUserId);
      
      // Verify attempts were reset
      expect(mockAsyncStorage.removeItem).toHaveBeenCalledWith(`vault_failed_attempts_${testUserId}`);
      expect(mockAsyncStorage.removeItem).toHaveBeenCalledWith(`vault_last_lockout_${testUserId}`);
    });

    it('should trigger lockout after max attempts', async () => {
      mockAsyncStorage.getItem.mockResolvedValue('4'); // 4 previous attempts
      mockAsyncStorage.setItem.mockResolvedValue();
      
      mockLocalAuth.authenticateAsync.mockResolvedValue({
        success: false,
        error: 'AuthenticationFailed'
      });
      
      await biometricAccess.authenticateAndAccessVault(testUserId);
      
      // Verify lockout was triggered (5th attempt)
      expect(mockAsyncStorage.setItem).toHaveBeenCalledWith(
        `vault_failed_attempts_${testUserId}`,
        '5'
      );
      expect(mockAsyncStorage.setItem).toHaveBeenCalledWith(
        `vault_last_lockout_${testUserId}`,
        expect.any(String)
      );
    });
  });

  describe('Singleton Pattern', () => {
    it('should return the same instance', () => {
      const instance1 = BiometricVaultAccess.getInstance();
      const instance2 = BiometricVaultAccess.getInstance();
      
      expect(instance1).toBe(instance2);
    });
  });

  describe('Error Handling', () => {
    it('should handle LocalAuthentication errors gracefully', async () => {
      mockLocalAuth.hasHardwareAsync.mockRejectedValue(new Error('Hardware error'));
      
      const capabilities = await biometricAccess.checkBiometricCapabilities();
      
      expect(capabilities.isAvailable).toBe(false);
      expect(capabilities.securityLevel).toBe('none');
    });

    it('should handle storage errors during setup', async () => {
      const setupOptions = {
        password: testPassword,
        enableBiometric: false,
        enableKeyRotation: false,
        familyVaultMode: false
      };
      
      mockAsyncStorage.getItem.mockResolvedValue(null);
      mockKeyManager.getInstance().storeVaultMasterKey.mockRejectedValue(
        new Error('Storage error')
      );
      
      const result = await biometricAccess.setupBiometricVault(testUserId, setupOptions);
      
      expect(result.success).toBe(false);
      expect(result.error).toContain('Failed to setup vault');
    });
  });
});