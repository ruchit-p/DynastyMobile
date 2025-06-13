import * as SecureStore from 'expo-secure-store';
import * as Device from 'expo-device';
import { Platform } from 'react-native';
import { Buffer } from '@craftzdog/react-native-buffer';
import { randomBytes, createHmac, createHash } from 'react-native-quick-crypto';
import { callFirebaseFunction } from '../../lib/errorUtils';
import { LibsignalService } from './libsignal/LibsignalService';
import { KeyPair, EncryptedMessage } from './index';
import { logger } from '../LoggingService';
import { getFirebaseAuth } from '../../lib/firebase';

export interface DeviceInfo {
  deviceId: string;
  deviceName: string;
  deviceType: 'ios' | 'android' | 'web';
  identityKey: string;
  signedPreKey: SignedPreKey;
  oneTimePreKeys: PreKey[];
  registrationId: number;
  registeredAt: number;
  lastSeenAt: number;
}

export interface PreKey {
  keyId: number;
  publicKey: string;
}

export interface SignedPreKey extends PreKey {
  signature: string;
  timestamp: number;
}

interface DeviceSession {
  deviceId: string;
  sessionKey: string;
  chainIndex: number;
  lastUsed: number;
}

const DEVICE_PREFIX = 'e2e_device_';
const DEVICE_ID_KEY = `${DEVICE_PREFIX}id`;
const DEVICE_SESSIONS_KEY = `${DEVICE_PREFIX}sessions`;
const PRE_KEY_PREFIX = `${DEVICE_PREFIX}prekey_`;
const SIGNED_PRE_KEY = `${DEVICE_PREFIX}signed_prekey`;

export class MultiDeviceService {
  private static instance: MultiDeviceService;
  private deviceId?: string;
  private deviceSessions = new Map<string, DeviceSession>();

  private constructor() {}

  static getInstance(): MultiDeviceService {
    if (!MultiDeviceService.instance) {
      MultiDeviceService.instance = new MultiDeviceService();
    }
    return MultiDeviceService.instance;
  }

  /**
   * Initialize multi-device support
   */
  async initialize(): Promise<void> {
    try {
      // Get or generate device ID
      let deviceId = await SecureStore.getItemAsync(DEVICE_ID_KEY);
      
      if (!deviceId) {
        deviceId = await this.generateDeviceId();
        await SecureStore.setItemAsync(DEVICE_ID_KEY, deviceId);
      }
      
      this.deviceId = deviceId;
      
      // Check if device is registered
      const isRegistered = await this.isDeviceRegistered();
      
      if (!isRegistered) {
        await this.registerDevice();
      } else {
        // Update last seen
        await this.updateLastSeen();
      }
      
      // Load existing sessions
      await this.loadDeviceSessions();
    } catch (error) {
      logger.error('Failed to initialize multi-device support:', error);
      throw error;
    }
  }

  /**
   * Register current device
   */
  async registerDevice(): Promise<void> {
    if (!this.deviceId) throw new Error('Device ID not initialized');

    try {
      logger.debug('Registering device...');
      
      // Generate device-specific identity key
      const identityKeyPair = await LibsignalService.getInstance().generateKeyPair();
      
      // Generate signed pre-key
      const signedPreKey = await this.generateSignedPreKey(identityKeyPair.privateKey);
      
      // Generate one-time pre-keys
      const oneTimePreKeys = await this.generateOneTimePreKeys(100);
      
      // Store keys locally
      await this.storeDeviceKeys(identityKeyPair, signedPreKey, oneTimePreKeys);
      
      // Upload to Firebase
      const deviceInfo: DeviceInfo = {
        deviceId: this.deviceId,
        deviceName: await this.getDeviceName(),
        deviceType: Platform.OS as 'ios' | 'android',
        identityKey: identityKeyPair.publicKey,
        signedPreKey: {
          keyId: signedPreKey.keyId,
          publicKey: signedPreKey.publicKey,
          signature: signedPreKey.signature,
          timestamp: signedPreKey.timestamp,
        },
        oneTimePreKeys: oneTimePreKeys.map(key => ({
          keyId: key.keyId,
          publicKey: key.publicKey,
        })),
        registrationId: await this.generateRegistrationId(),
        registeredAt: Date.now(),
        lastSeenAt: Date.now(),
      };
      
      await callFirebaseFunction('registerDevice', deviceInfo);
      
      logger.debug('Device registered successfully');
    } catch (error) {
      logger.error('Failed to register device:', error);
      throw error;
    }
  }

  /**
   * Get all devices for a user
   */
  async getUserDevices(userId: string): Promise<DeviceInfo[]> {
    try {
      const result = await callFirebaseFunction('getUserDevices', { userId });
      return result.devices || [];
    } catch (error) {
      logger.error('Failed to get user devices:', error);
      return [];
    }
  }

  /**
   * Encrypt message for all devices of a user
   */
  async encryptForAllDevices(
    message: string,
    userId: string
  ): Promise<Map<string, EncryptedMessage>> {
    const devices = await this.getUserDevices(userId);
    const encryptedMessages = new Map<string, EncryptedMessage>();

    for (const device of devices) {
      try {
        // Skip encryption for own device
        if (device.deviceId === this.deviceId) continue;
        
        // Get or establish session
        const session = await this.getOrEstablishSession(device);
        
        // Encrypt message
        // TODO: Use LibsignalService.sendMessage instead
        // For now, create a basic encrypted message structure
        const encrypted: EncryptedMessage = {
          content: Buffer.from(message).toString('base64'),
          ephemeralPublicKey: '',
          nonce: randomBytes(24).toString('base64'),
          mac: ''
        };
        encryptedMessages.set(device.deviceId, encrypted);
      } catch (error) {
        logger.error(`Failed to encrypt for device ${device.deviceId}:`, error);
      }
    }

    return encryptedMessages;
  }

  /**
   * Establish session with a device
   */
  private async getOrEstablishSession(device: DeviceInfo): Promise<DeviceSession> {
    const sessionKey = `${device.deviceId}:${device.identityKey}`;
    
    // Check if session exists
    let session = this.deviceSessions.get(sessionKey);
    
    if (!session || this.isSessionExpired(session)) {
      // Establish new session
      session = await this.establishNewSession(device);
      this.deviceSessions.set(sessionKey, session);
      await this.saveDeviceSessions();
    }
    
    return session;
  }

  /**
   * Establish new session with device
   */
  private async establishNewSession(device: DeviceInfo): Promise<DeviceSession> {
    // Use one-time pre-key if available
    const preKey = device.oneTimePreKeys.length > 0 
      ? device.oneTimePreKeys[0] 
      : device.signedPreKey;
    
    // Perform X3DH key agreement
    const sessionKey = await this.performX3DH(device.identityKey, preKey.publicKey);
    
    const session: DeviceSession = {
      deviceId: device.deviceId,
      sessionKey: sessionKey.toString('base64'),
      chainIndex: 0,
      lastUsed: Date.now(),
    };
    
    // Notify server that we used a one-time pre-key
    if (device.oneTimePreKeys.length > 0) {
      await callFirebaseFunction('consumeOneTimePreKey', {
        userId: device.deviceId.split('_')[0], // Extract user ID
        deviceId: device.deviceId,
        keyId: preKey.keyId,
      });
    }
    
    return session;
  }

  /**
   * Perform X3DH key agreement
   */
  private async performX3DH(
    remoteIdentityKey: string,
    remotePreKey: string
  ): Promise<Buffer> {
    // This is simplified - full X3DH would include:
    // 1. DH between our identity key and their identity key
    // 2. DH between our ephemeral key and their identity key
    // 3. DH between our ephemeral key and their pre-key
    // 4. Optional: DH between our identity key and their pre-key
    
    // Create a simple shared secret using HKDF-like approach
    const identityKeyPair = await LibsignalService.getInstance().getIdentityKeyPair();
    if (!identityKeyPair) throw new Error('No identity key pair');
    
    const combined = identityKeyPair.privateKey + remoteIdentityKey + remotePreKey;
    const hash = createHash('sha256');
    hash.update(combined);
    
    return hash.digest();
  }

  /**
   * Generate device ID
   */
  private async generateDeviceId(): Promise<string> {
    const userId = await this.getCurrentUserId();
    const randomPart = randomBytes(8).toString('hex');
    return `${userId}_${Platform.OS}_${randomPart}`;
  }

  /**
   * Get device name
   */
  private async getDeviceName(): Promise<string> {
    if (Device.deviceName) {
      return Device.deviceName;
    }
    
    return `${Device.modelName || Platform.OS} Device`;
  }

  /**
   * Generate registration ID
   */
  private async generateRegistrationId(): Promise<number> {
    const bytes = randomBytes(4);
    return bytes.readUInt32BE(0) & 0x7fffffff; // Ensure positive number
  }

  /**
   * Generate signed pre-key
   */
  private async generateSignedPreKey(identityPrivateKey: string): Promise<SignedPreKey> {
    const keyPair = await LibsignalService.getInstance().generateKeyPair();
    const keyId = Math.floor(Math.random() * 0xFFFFFF);
    
    // Sign the public key
    const signature = await this.signPublicKey(keyPair.publicKey, identityPrivateKey);
    
    return {
      keyId,
      publicKey: keyPair.publicKey,
      signature: signature.toString('base64'),
      timestamp: Date.now(),
    };
  }

  /**
   * Generate one-time pre-keys
   */
  private async generateOneTimePreKeys(count: number): Promise<PreKey[]> {
    const keys: PreKey[] = [];
    const startId = Math.floor(Math.random() * 0xFFFFFF);
    
    for (let i = 0; i < count; i++) {
      const keyPair = await LibsignalService.getInstance().generateKeyPair();
      keys.push({
        keyId: startId + i,
        publicKey: keyPair.publicKey,
      });
      
      // Store private key locally
      await SecureStore.setItemAsync(
        `${PRE_KEY_PREFIX}${startId + i}`,
        keyPair.privateKey
      );
    }
    
    return keys;
  }

  /**
   * Sign public key
   */
  private async signPublicKey(publicKey: string, privateKey: string): Promise<Buffer> {
    // Create signature using HMAC for now
    const hmac = createHmac('sha256', privateKey);
    hmac.update(Buffer.from(publicKey, 'base64'));
    return hmac.digest();
  }

  /**
   * Store device keys locally
   */
  private async storeDeviceKeys(
    identityKeyPair: KeyPair,
    signedPreKey: SignedPreKey,
    oneTimePreKeys: PreKey[]
  ): Promise<void> {
    // Store identity key
    await LibsignalService.getInstance().restoreKeyPair(identityKeyPair);
    
    // Store signed pre-key
    await SecureStore.setItemAsync(SIGNED_PRE_KEY, JSON.stringify(signedPreKey));
    
    // One-time pre-keys are already stored in generateOneTimePreKeys
  }

  /**
   * Check if device is registered
   */
  private async isDeviceRegistered(): Promise<boolean> {
    try {
      if (!this.deviceId) return false;
      
      const result = await callFirebaseFunction('checkDeviceRegistration', {
        deviceId: this.deviceId,
      });
      
      return result.registered || false;
    } catch (error) {
      return false;
    }
  }

  /**
   * Update last seen timestamp
   */
  private async updateLastSeen(): Promise<void> {
    if (!this.deviceId) return;
    
    try {
      await callFirebaseFunction('updateDeviceLastSeen', {
        deviceId: this.deviceId,
        lastSeenAt: Date.now(),
      });
    } catch (error) {
      logger.error('Failed to update last seen:', error);
    }
  }

  /**
   * Get current user ID
   */
  private async getCurrentUserId(): Promise<string> {
    const auth = getFirebaseAuth();
    const userId = auth.currentUser?.uid;
    if (!userId) throw new Error('User not authenticated');
    return userId;
  }

  /**
   * Check if session is expired
   */
  private isSessionExpired(session: DeviceSession): boolean {
    const SESSION_LIFETIME = 7 * 24 * 60 * 60 * 1000; // 7 days
    return Date.now() - session.lastUsed > SESSION_LIFETIME;
  }

  /**
   * Load device sessions from storage
   */
  private async loadDeviceSessions(): Promise<void> {
    try {
      const sessionsData = await SecureStore.getItemAsync(DEVICE_SESSIONS_KEY);
      if (sessionsData) {
        const sessions = JSON.parse(sessionsData);
        this.deviceSessions = new Map(Object.entries(sessions));
      }
    } catch (error) {
      logger.error('Failed to load device sessions:', error);
    }
  }

  /**
   * Save device sessions to storage
   */
  private async saveDeviceSessions(): Promise<void> {
    try {
      const sessions = Object.fromEntries(this.deviceSessions);
      await SecureStore.setItemAsync(DEVICE_SESSIONS_KEY, JSON.stringify(sessions));
    } catch (error) {
      logger.error('Failed to save device sessions:', error);
    }
  }

  /**
   * Remove device
   */
  async removeDevice(deviceId: string): Promise<void> {
    try {
      await callFirebaseFunction('removeDevice', { deviceId });
      
      // Remove sessions for this device
      const keysToRemove: string[] = [];
      this.deviceSessions.forEach((session, key) => {
        if (session.deviceId === deviceId) {
          keysToRemove.push(key);
        }
      });
      
      keysToRemove.forEach(key => this.deviceSessions.delete(key));
      await this.saveDeviceSessions();
    } catch (error) {
      logger.error('Failed to remove device:', error);
      throw error;
    }
  }

  /**
   * Get current device info
   */
  getCurrentDeviceId(): string | undefined {
    return this.deviceId;
  }

  /**
   * Get device sessions info
   */
  getActiveSessionsCount(): number {
    return this.deviceSessions.size;
  }
}

export default MultiDeviceService.getInstance();