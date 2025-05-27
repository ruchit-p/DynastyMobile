import * as LocalAuthentication from 'expo-local-authentication';
import { Platform, Alert } from 'react-native';
import { VaultCryptoService } from './VaultCryptoService';
import { VaultKeyManager } from './VaultKeyManager';
import { logger } from '../LoggingService';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Constants
const BIOMETRIC_SETUP_KEY = 'biometric_vault_setup_';
const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_DURATION = 30 * 60 * 1000; // 30 minutes
const FAILED_ATTEMPTS_KEY = 'vault_failed_attempts_';
const LAST_LOCKOUT_KEY = 'vault_last_lockout_';

// Types
export interface BiometricCapabilities {
  isAvailable: boolean;
  hasHardware: boolean;
  isEnrolled: boolean;
  supportedTypes: LocalAuthentication.AuthenticationType[];
  securityLevel: 'none' | 'biometric' | 'device_credential' | 'both';
}

export interface VaultSetupOptions {
  password: string;
  enableBiometric: boolean;
  enableKeyRotation: boolean;
  familyVaultMode: boolean;
}

export interface VaultAccessResult {
  success: boolean;
  masterKey?: Uint8Array;
  error?: string;
  requiresSetup?: boolean;
  isLockedOut?: boolean;
  remainingLockoutTime?: number;
}

export interface VaultSecurityStatus {
  isSetup: boolean;
  biometricEnabled: boolean;
  keyRotationEnabled: boolean;
  lastAccess: number;
  failedAttempts: number;
  isLockedOut: boolean;
  nextKeyRotation?: number;
}

export class BiometricVaultAccess {
  private static instance: BiometricVaultAccess;
  private cryptoService: VaultCryptoService;
  private keyManager: VaultKeyManager;

  private constructor() {
    this.cryptoService = VaultCryptoService.getInstance();
    this.keyManager = VaultKeyManager.getInstance();
  }

  static getInstance(): BiometricVaultAccess {
    if (!BiometricVaultAccess.instance) {
      BiometricVaultAccess.instance = new BiometricVaultAccess();
    }
    return BiometricVaultAccess.instance;
  }

  /**
   * Check device biometric capabilities
   */
  async checkBiometricCapabilities(): Promise<BiometricCapabilities> {
    try {
      const hasHardware = await LocalAuthentication.hasHardwareAsync();
      const isEnrolled = await LocalAuthentication.isEnrolledAsync();
      const supportedTypes = await LocalAuthentication.supportedAuthenticationTypesAsync();
      
      const isAvailable = hasHardware && isEnrolled;
      
      let securityLevel: BiometricCapabilities['securityLevel'] = 'none';
      if (isAvailable) {
        if (supportedTypes.includes(LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION) ||
            supportedTypes.includes(LocalAuthentication.AuthenticationType.FINGERPRINT)) {
          securityLevel = 'biometric';
        } else {
          securityLevel = 'device_credential';
        }
      }

      const capabilities: BiometricCapabilities = {
        isAvailable,
        hasHardware,
        isEnrolled,
        supportedTypes,
        securityLevel
      };

      logger.info('BiometricVaultAccess: Capabilities checked', {
        hasHardware,
        isEnrolled,
        supportedTypes: supportedTypes.map(type => 
          LocalAuthentication.AuthenticationType[type]
        ),
        securityLevel
      });

      return capabilities;
    } catch (error) {
      logger.error('BiometricVaultAccess: Failed to check capabilities:', error);
      return {
        isAvailable: false,
        hasHardware: false,
        isEnrolled: false,
        supportedTypes: [],
        securityLevel: 'none'
      };
    }
  }

  /**
   * Setup vault with biometric protection
   */
  async setupBiometricVault(
    userId: string, 
    options: VaultSetupOptions
  ): Promise<VaultAccessResult> {
    try {
      logger.info(`BiometricVaultAccess: Setting up vault for user ${userId}`);
      
      // Check if already setup
      const existingSetup = await this.isVaultSetup(userId);
      if (existingSetup) {
        return {
          success: false,
          error: 'Vault already setup for this user'
        };
      }

      // Validate biometric capability if requested
      if (options.enableBiometric) {
        const capabilities = await this.checkBiometricCapabilities();
        if (!capabilities.isAvailable) {
          return {
            success: false,
            error: 'Biometric authentication not available'
          };
        }
      }

      // Generate vault salt and derive master key
      const salt = this.cryptoService.generateSalt();
      const masterKey = await this.cryptoService.deriveVaultMasterKey(options.password, salt);

      // Store salt (non-sensitive)
      await this.keyManager.storeVaultSalt(userId, salt);

      // Store master key with biometric protection
      const keyInfo = await this.keyManager.storeVaultMasterKey(
        userId, 
        masterKey, 
        { 
          requireBiometric: options.enableBiometric,
          keyRotation: false 
        }
      );

      // Generate family keypair if family mode enabled
      if (options.familyVaultMode) {
        await this.keyManager.generateFamilyKeyPair(userId);
      }

      // Store vault configuration
      const vaultConfig = {
        vaultId: this.cryptoService.generateSecureFileId(),
        ownerId: userId,
        encryptionVersion: '1.0',
        keyRotationEnabled: options.enableKeyRotation,
        lastRotation: Date.now(),
        nextRotation: options.enableKeyRotation ? 
          Date.now() + (90 * 24 * 60 * 60 * 1000) : 0, // 90 days
        familyMode: options.familyVaultMode,
        memberCount: 1
      };

      await this.keyManager.storeVaultConfiguration(userId, vaultConfig);

      // Mark setup as complete
      await this.markVaultSetupComplete(userId, {
        biometricEnabled: options.enableBiometric,
        setupTimestamp: Date.now(),
        keyId: keyInfo.keyId
      });

      // Reset failed attempts
      await this.resetFailedAttempts(userId);

      logger.info(`BiometricVaultAccess: Vault setup completed for user ${userId}`);
      
      return {
        success: true,
        masterKey
      };
    } catch (error) {
      logger.error('BiometricVaultAccess: Failed to setup vault:', error);
      return {
        success: false,
        error: `Failed to setup vault: ${error.message}`
      };
    }
  }

  /**
   * Authenticate and access vault
   */
  async authenticateAndAccessVault(
    userId: string,
    options: {
      promptMessage?: string;
      fallbackToPasscode?: boolean;
      bypassLockout?: boolean;
    } = {}
  ): Promise<VaultAccessResult> {
    try {
      const {
        promptMessage = 'Unlock Dynasty Vault',
        fallbackToPasscode = true,
        bypassLockout = false
      } = options;

      // Check if vault is setup
      const isSetup = await this.isVaultSetup(userId);
      if (!isSetup) {
        return {
          success: false,
          requiresSetup: true,
          error: 'Vault not setup'
        };
      }

      // Check lockout status
      if (!bypassLockout) {
        const lockoutStatus = await this.checkLockoutStatus(userId);
        if (lockoutStatus.isLockedOut) {
          return {
            success: false,
            isLockedOut: true,
            remainingLockoutTime: lockoutStatus.remainingTime,
            error: 'Vault is locked due to too many failed attempts'
          };
        }
      }

      // Get capabilities to determine authentication method
      const capabilities = await this.checkBiometricCapabilities();
      
      try {
        // Attempt authentication
        const authResult = await LocalAuthentication.authenticateAsync({
          promptMessage,
          fallbackLabel: fallbackToPasscode ? 'Use Passcode' : undefined,
          disableDeviceFallback: !fallbackToPasscode,
          requireConfirmation: Platform.OS === 'android',
          cancelLabel: 'Cancel'
        });

        if (!authResult.success) {
          // Handle authentication failure
          await this.recordFailedAttempt(userId);
          
          const failedAttempts = await this.getFailedAttempts(userId);
          let errorMessage = `Authentication failed (${failedAttempts}/${MAX_FAILED_ATTEMPTS} attempts)`;
          if (!authResult.success && 'error' in authResult && authResult.error === 'user_cancel') {
            errorMessage = 'Authentication cancelled';
          }
          
          return {
            success: false,
            error: errorMessage
          };
        }

        // Authentication successful - retrieve master key
        const masterKey = await this.keyManager.retrieveVaultMasterKey(userId, {
          promptMessage,
          fallbackToPasscode
        });

        // Reset failed attempts on successful access
        await this.resetFailedAttempts(userId);
        
        // Update last access time
        await this.updateLastAccess(userId);

        logger.info(`BiometricVaultAccess: Vault accessed successfully for user ${userId}`);
        
        return {
          success: true,
          masterKey
        };
      } catch (authError) {
        // Handle authentication errors
        await this.recordFailedAttempt(userId);
        
        if (authError.message.includes('cancel')) {
          return {
            success: false,
            error: 'Authentication cancelled by user'
          };
        }
        
        throw authError;
      }
    } catch (error) {
      logger.error('BiometricVaultAccess: Failed to authenticate vault access:', error);
      
      // Record failed attempt
      await this.recordFailedAttempt(userId);
      
      return {
        success: false,
        error: `Failed to access vault: ${error.message}`
      };
    }
  }

  /**
   * Change vault password with re-encryption
   */
  async changeVaultPassword(
    userId: string,
    currentPassword: string,
    newPassword: string
  ): Promise<VaultAccessResult> {
    try {
      logger.info(`BiometricVaultAccess: Changing vault password for user ${userId}`);
      
      // Verify current password by trying to derive key
      const currentSalt = await this.keyManager.retrieveVaultSalt(userId);
      if (!currentSalt) {
        return {
          success: false,
          error: 'Current vault salt not found'
        };
      }

      const currentKey = await this.cryptoService.deriveVaultMasterKey(currentPassword, currentSalt);
      
      // Try to retrieve vault key to verify current password
      try {
        await this.keyManager.retrieveVaultMasterKey(userId);
      } catch (error) {
        return {
          success: false,
          error: 'Current password is incorrect'
        };
      }

      // Generate new salt and derive new key
      const newSalt = this.cryptoService.generateSalt();
      const newMasterKey = await this.cryptoService.deriveVaultMasterKey(newPassword, newSalt);

      // Store new salt and key
      await this.keyManager.storeVaultSalt(userId, newSalt);
      await this.keyManager.storeVaultMasterKey(userId, newMasterKey);

      logger.info(`BiometricVaultAccess: Password changed successfully for user ${userId}`);
      
      return {
        success: true,
        masterKey: newMasterKey
      };
    } catch (error) {
      logger.error('BiometricVaultAccess: Failed to change password:', error);
      return {
        success: false,
        error: `Failed to change password: ${error.message}`
      };
    }
  }

  /**
   * Get vault security status
   */
  async getVaultSecurityStatus(userId: string): Promise<VaultSecurityStatus> {
    try {
      const isSetup = await this.isVaultSetup(userId);
      const setupData = await this.getVaultSetupData(userId);
      const config = await this.keyManager.retrieveVaultConfiguration(userId);
      const failedAttempts = await this.getFailedAttempts(userId);
      const lockoutStatus = await this.checkLockoutStatus(userId);
      
      return {
        isSetup,
        biometricEnabled: setupData?.biometricEnabled || false,
        keyRotationEnabled: config?.keyRotationEnabled || false,
        lastAccess: setupData?.lastAccess || 0,
        failedAttempts,
        isLockedOut: lockoutStatus.isLockedOut,
        nextKeyRotation: config?.nextRotation
      };
    } catch (error) {
      logger.error('BiometricVaultAccess: Failed to get security status:', error);
      return {
        isSetup: false,
        biometricEnabled: false,
        keyRotationEnabled: false,
        lastAccess: 0,
        failedAttempts: 0,
        isLockedOut: false
      };
    }
  }

  /**
   * Reset vault (delete all data)
   */
  async resetVault(userId: string): Promise<boolean> {
    try {
      logger.info(`BiometricVaultAccess: Resetting vault for user ${userId}`);
      
      // Show confirmation dialog
      const confirmed = await this.showResetConfirmation();
      if (!confirmed) {
        return false;
      }

      // Delete all vault keys and data
      await this.keyManager.deleteAllVaultKeys(userId);
      
      // Clear setup data
      await this.clearVaultSetupData(userId);
      
      // Reset failed attempts
      await this.resetFailedAttempts(userId);
      
      logger.info(`BiometricVaultAccess: Vault reset completed for user ${userId}`);
      return true;
    } catch (error) {
      logger.error('BiometricVaultAccess: Failed to reset vault:', error);
      return false;
    }
  }

  // Private helper methods

  private async isVaultSetup(userId: string): Promise<boolean> {
    try {
      const setupKey = `${BIOMETRIC_SETUP_KEY}${userId}`;
      const setupData = await AsyncStorage.getItem(setupKey);
      return setupData !== null;
    } catch (error) {
      logger.error('BiometricVaultAccess: Failed to check setup status:', error);
      return false;
    }
  }

  private async markVaultSetupComplete(
    userId: string, 
    setupData: {
      biometricEnabled: boolean;
      setupTimestamp: number;
      keyId: string;
    }
  ): Promise<void> {
    const setupKey = `${BIOMETRIC_SETUP_KEY}${userId}`;
    const data = {
      ...setupData,
      lastAccess: Date.now(),
      version: '1.0'
    };
    await AsyncStorage.setItem(setupKey, JSON.stringify(data));
  }

  private async getVaultSetupData(userId: string): Promise<any> {
    try {
      const setupKey = `${BIOMETRIC_SETUP_KEY}${userId}`;
      const data = await AsyncStorage.getItem(setupKey);
      return data ? JSON.parse(data) : null;
    } catch (error) {
      logger.error('BiometricVaultAccess: Failed to get setup data:', error);
      return null;
    }
  }

  private async clearVaultSetupData(userId: string): Promise<void> {
    const setupKey = `${BIOMETRIC_SETUP_KEY}${userId}`;
    await AsyncStorage.removeItem(setupKey);
  }

  private async updateLastAccess(userId: string): Promise<void> {
    try {
      const setupData = await this.getVaultSetupData(userId);
      if (setupData) {
        setupData.lastAccess = Date.now();
        await this.markVaultSetupComplete(userId, setupData);
      }
    } catch (error) {
      logger.error('BiometricVaultAccess: Failed to update last access:', error);
    }
  }

  private async recordFailedAttempt(userId: string): Promise<void> {
    try {
      const attemptsKey = `${FAILED_ATTEMPTS_KEY}${userId}`;
      const currentAttempts = await this.getFailedAttempts(userId);
      const newAttempts = currentAttempts + 1;
      
      await AsyncStorage.setItem(attemptsKey, newAttempts.toString());
      
      // Check if lockout threshold reached
      if (newAttempts >= MAX_FAILED_ATTEMPTS) {
        const lockoutKey = `${LAST_LOCKOUT_KEY}${userId}`;
        await AsyncStorage.setItem(lockoutKey, Date.now().toString());
        
        logger.warn(`BiometricVaultAccess: User ${userId} locked out after ${newAttempts} failed attempts`);
      }
    } catch (error) {
      logger.error('BiometricVaultAccess: Failed to record failed attempt:', error);
    }
  }

  private async getFailedAttempts(userId: string): Promise<number> {
    try {
      const attemptsKey = `${FAILED_ATTEMPTS_KEY}${userId}`;
      const attempts = await AsyncStorage.getItem(attemptsKey);
      return attempts ? parseInt(attempts, 10) : 0;
    } catch (error) {
      logger.error('BiometricVaultAccess: Failed to get failed attempts:', error);
      return 0;
    }
  }

  private async resetFailedAttempts(userId: string): Promise<void> {
    try {
      const attemptsKey = `${FAILED_ATTEMPTS_KEY}${userId}`;
      await AsyncStorage.removeItem(attemptsKey);
      
      const lockoutKey = `${LAST_LOCKOUT_KEY}${userId}`;
      await AsyncStorage.removeItem(lockoutKey);
    } catch (error) {
      logger.error('BiometricVaultAccess: Failed to reset failed attempts:', error);
    }
  }

  private async checkLockoutStatus(userId: string): Promise<{
    isLockedOut: boolean;
    remainingTime: number;
  }> {
    try {
      const failedAttempts = await this.getFailedAttempts(userId);
      
      if (failedAttempts < MAX_FAILED_ATTEMPTS) {
        return { isLockedOut: false, remainingTime: 0 };
      }
      
      const lockoutKey = `${LAST_LOCKOUT_KEY}${userId}`;
      const lockoutTimeStr = await AsyncStorage.getItem(lockoutKey);
      
      if (!lockoutTimeStr) {
        return { isLockedOut: false, remainingTime: 0 };
      }
      
      const lockoutTime = parseInt(lockoutTimeStr, 10);
      const now = Date.now();
      const elapsedTime = now - lockoutTime;
      
      if (elapsedTime >= LOCKOUT_DURATION) {
        // Lockout period expired
        await this.resetFailedAttempts(userId);
        return { isLockedOut: false, remainingTime: 0 };
      }
      
      return {
        isLockedOut: true,
        remainingTime: LOCKOUT_DURATION - elapsedTime
      };
    } catch (error) {
      logger.error('BiometricVaultAccess: Failed to check lockout status:', error);
      return { isLockedOut: false, remainingTime: 0 };
    }
  }

  private async showResetConfirmation(): Promise<boolean> {
    return new Promise((resolve) => {
      Alert.alert(
        'Reset Vault',
        'This will permanently delete all vault keys and encrypted data. This action cannot be undone.\n\nAre you sure you want to continue?',
        [
          {
            text: 'Cancel',
            style: 'cancel',
            onPress: () => resolve(false)
          },
          {
            text: 'Reset Vault',
            style: 'destructive',
            onPress: () => resolve(true)
          }
        ]
      );
    });
  }
}

export default BiometricVaultAccess.getInstance();