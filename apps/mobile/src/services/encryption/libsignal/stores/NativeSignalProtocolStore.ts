import AsyncStorage from '@react-native-async-storage/async-storage';
import NativeLibsignal from '../../../../specs/NativeLibsignal';
import { logger } from '../../../LoggingService';
import type { 
  SignalAddress, 
  PreKeyBundle as NativePreKeyBundle,
  IdentityKeyPair as NativeIdentityKeyPair
} from '../../../../specs/NativeLibsignal';

/**
 * Native implementation of Signal Protocol Store
 * Uses the native libsignal modules for iOS and Android
 */
export class NativeSignalProtocolStore {
  private readonly storagePrefix = 'signal_protocol_native_';
  
  /**
   * Identity Key Management
   */
  async getIdentityKeyPair(): Promise<NativeIdentityKeyPair> {
    try {
      const keyPair = await NativeLibsignal.getIdentityKeyPair();
      
      if (!keyPair) {
        logger.error('Identity key pair not found');
        throw new Error('Identity key pair not found');
      }
      
      return keyPair;
    } catch (error) {
      logger.error('Failed to get identity key pair:', error);
      throw error;
    }
  }
  
  async storeIdentityKeyPair(publicKey: string, privateKey: string): Promise<void> {
    try {
      await NativeLibsignal.saveIdentityKeyPair(publicKey, privateKey);
      logger.debug('Identity key pair stored successfully');
    } catch (error) {
      logger.error('Failed to store identity key pair:', error);
      throw error;
    }
  }
  
  async generateIdentityKeyPair(): Promise<NativeIdentityKeyPair> {
    try {
      const keyPair = await NativeLibsignal.generateIdentityKeyPair();
      await this.storeIdentityKeyPair(keyPair.publicKey, keyPair.privateKey);
      return keyPair;
    } catch (error) {
      logger.error('Failed to generate identity key pair:', error);
      throw error;
    }
  }
  
  async getLocalRegistrationId(): Promise<number> {
    try {
      return await NativeLibsignal.getLocalRegistrationId();
    } catch (error) {
      logger.error('Failed to get registration ID:', error);
      throw error;
    }
  }
  
  async generateRegistrationId(): Promise<number> {
    try {
      const regId = await NativeLibsignal.generateRegistrationId();
      // Store it for persistence
      await AsyncStorage.setItem(`${this.storagePrefix}registration_id`, regId.toString());
      return regId;
    } catch (error) {
      logger.error('Failed to generate registration ID:', error);
      throw error;
    }
  }
  
  /**
   * PreKey Management
   */
  async generatePreKeys(start: number, count: number): Promise<{id: number; publicKey: string}[]> {
    try {
      return await NativeLibsignal.generatePreKeys(start, count);
    } catch (error) {
      logger.error('Failed to generate pre-keys:', error);
      throw error;
    }
  }
  
  /**
   * Signed PreKey Management
   */
  async generateSignedPreKey(identityPrivateKey: string, signedPreKeyId: number) {
    try {
      return await NativeLibsignal.generateSignedPreKey(identityPrivateKey, signedPreKeyId);
    } catch (error) {
      logger.error('Failed to generate signed pre-key:', error);
      throw error;
    }
  }
  
  /**
   * Session Management
   */
  async createSession(address: SignalAddress, preKeyBundle: NativePreKeyBundle): Promise<void> {
    try {
      await NativeLibsignal.createSession(address, preKeyBundle);
      
      // Mark session as established
      const key = `${this.storagePrefix}session_established_${address.name}_${address.deviceId}`;
      await AsyncStorage.setItem(key, Date.now().toString());
    } catch (error) {
      logger.error('Failed to create session:', error);
      throw error;
    }
  }
  
  async hasSession(address: SignalAddress): Promise<boolean> {
    try {
      return await NativeLibsignal.hasSession(address);
    } catch (error) {
      logger.error('Failed to check session:', error);
      return false;
    }
  }
  
  /**
   * Encryption/Decryption
   */
  async encryptMessage(plaintext: string, address: SignalAddress) {
    try {
      return await NativeLibsignal.encryptMessage(plaintext, address);
    } catch (error) {
      logger.error('Failed to encrypt message:', error);
      throw error;
    }
  }
  
  async decryptMessage(ciphertext: string, address: SignalAddress, isPreKeyMessage: boolean) {
    try {
      if (isPreKeyMessage) {
        return await NativeLibsignal.decryptPreKeyMessage(ciphertext, address);
      } else {
        return await NativeLibsignal.decryptMessage(ciphertext, address);
      }
    } catch (error) {
      logger.error('Failed to decrypt message:', error);
      throw error;
    }
  }
  
  /**
   * Safety Number Generation
   */
  async generateSafetyNumber(
    localIdentityKey: string,
    remoteIdentityKey: string,
    localUsername: string,
    remoteUsername: string
  ) {
    try {
      return await NativeLibsignal.generateSafetyNumber(
        localIdentityKey,
        remoteIdentityKey,
        localUsername,
        remoteUsername
      );
    } catch (error) {
      logger.error('Failed to generate safety number:', error);
      throw error;
    }
  }
  
  /**
   * Check if we have an identity
   */
  async hasIdentity(): Promise<boolean> {
    try {
      const keyPair = await NativeLibsignal.getIdentityKeyPair();
      return keyPair !== null;
    } catch (error) {
      return false;
    }
  }
  
  /**
   * Clear all data
   */
  async clearAllData(): Promise<void> {
    try {
      // Clear native module data
      await NativeLibsignal.clearAllData();
      
      // Clear AsyncStorage data
      const keys = await AsyncStorage.getAllKeys();
      const signalKeys = keys.filter(key => key.startsWith(this.storagePrefix));
      if (signalKeys.length > 0) {
        await AsyncStorage.multiRemove(signalKeys);
      }
      
      logger.info('All Signal Protocol data cleared');
    } catch (error) {
      logger.error('Failed to clear Signal Protocol data:', error);
      throw error;
    }
  }
  
  /**
   * Get session establishment time
   */
  async getSessionEstablishedTime(address: SignalAddress): Promise<Date | undefined> {
    try {
      const key = `${this.storagePrefix}session_established_${address.name}_${address.deviceId}`;
      const timestamp = await AsyncStorage.getItem(key);
      return timestamp ? new Date(parseInt(timestamp)) : undefined;
    } catch (error) {
      return undefined;
    }
  }
}