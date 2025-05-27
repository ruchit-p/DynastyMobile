import { NativeSignalProtocolStore } from './stores/NativeSignalProtocolStore';
import NativeLibsignal from '../../../specs/NativeLibsignal';
import { getFirebaseAuth } from '../../../lib/firebase';
import { getFirestore } from '../../../lib/firebase';
import { logger } from '../../LoggingService';
import type { SignalAddress, PreKeyBundle, SignalMessage } from '../../../specs/NativeLibsignal';

export interface MessagePayload {
  text?: string;
  metadata?: any;
  type?: 'text' | 'media' | 'system';
}

export interface DeviceMessage {
  deviceId: number;
  encrypted: SignalMessage;
}

/**
 * Native implementation of LibsignalService
 * Uses native libsignal modules for iOS and Android
 */
export class NativeLibsignalService {
  private static instance: NativeLibsignalService;
  
  private store: NativeSignalProtocolStore;
  private initialized = false;
  private userId?: string;
  private deviceId?: number;
  
  private constructor() {
    this.store = new NativeSignalProtocolStore();
  }
  
  static getInstance(): NativeLibsignalService {
    if (!NativeLibsignalService.instance) {
      NativeLibsignalService.instance = new NativeLibsignalService();
    }
    return NativeLibsignalService.instance;
  }
  
  /**
   * Initialize Signal Protocol for the current user
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      logger.debug('NativeLibsignalService already initialized');
      return;
    }
    
    try {
      const auth = getFirebaseAuth();
      const user = auth.currentUser;
      
      if (!user) {
        throw new Error('User not authenticated');
      }
      
      this.userId = user.uid;
      
      logger.info('Initializing Native Signal Protocol');
      
      // Check if we have an existing identity
      const hasIdentity = await this.store.hasIdentity();
      
      if (!hasIdentity) {
        logger.info('No identity found, generating new one');
        
        // Generate identity key pair
        await this.store.generateIdentityKeyPair();
        
        // Generate registration ID
        const registrationId = await this.store.generateRegistrationId();
        this.deviceId = registrationId;
        
        // Generate initial pre-keys
        const preKeys = await this.store.generatePreKeys(1, 100);
        
        // Generate signed pre-key
        const identityKeyPair = await this.store.getIdentityKeyPair();
        const signedPreKey = await this.store.generateSignedPreKey(identityKeyPair.privateKey, 1);
        
        // Publish to Firebase
        await this.publishKeys(preKeys, signedPreKey);
        
        logger.info('Signal Protocol identity created and published');
      } else {
        // Load existing identity
        this.deviceId = await this.store.getLocalRegistrationId();
        logger.info(`Signal Protocol initialized with existing identity, device ID: ${this.deviceId}`);
      }
      
      this.initialized = true;
      
    } catch (error) {
      logger.error('Failed to initialize Signal Protocol:', error);
      throw error;
    }
  }
  
  /**
   * Publish keys to Firebase
   */
  private async publishKeys(
    preKeys: Array<{id: number; publicKey: string}>,
    signedPreKey: {id: number; publicKey: string; signature: string; timestamp: number}
  ): Promise<void> {
    const firestore = getFirestore();
    const identityKeyPair = await this.store.getIdentityKeyPair();
    
    // Store device info in Firestore
    const deviceDoc = firestore
      .collection('users')
      .doc(this.userId!)
      .collection('devices')
      .doc(this.deviceId!.toString());
      
    await deviceDoc.set({
      registrationId: this.deviceId,
      identityKey: identityKeyPair.publicKey,
      signedPreKey: {
        id: signedPreKey.id,
        publicKey: signedPreKey.publicKey,
        signature: signedPreKey.signature,
        timestamp: signedPreKey.timestamp
      },
      preKeys: preKeys.map(pk => ({
        id: pk.id,
        publicKey: pk.publicKey
      })),
      lastSeen: new Date(),
      supportsSignalProtocol: true,
      deviceInfo: {
        platform: 'react-native',
        version: '1.0.0'
      }
    });
  }
  
  /**
   * Send an encrypted message to a recipient
   */
  async sendMessage(
    recipientId: string,
    message: MessagePayload
  ): Promise<DeviceMessage[]> {
    await this.ensureInitialized();
    
    try {
      logger.debug(`Sending message to ${recipientId}`);
      
      // Get recipient's devices from Firebase
      const devices = await this.getRecipientDevices(recipientId);
      
      if (devices.length === 0) {
        throw new Error(`No Signal-enabled devices found for ${recipientId}`);
      }
      
      // Encrypt for each device
      const encryptedMessages: DeviceMessage[] = [];
      
      for (const device of devices) {
        try {
          const address: SignalAddress = {
            name: recipientId,
            deviceId: device.id
          };
          
          // Check if we have a session
          const hasSession = await this.store.hasSession(address);
          
          if (!hasSession) {
            // Fetch pre-key bundle and create session
            const bundle = await this.fetchPreKeyBundle(recipientId, device.id);
            await this.store.createSession(address, bundle);
          }
          
          // Encrypt message
          const messageStr = JSON.stringify(message);
          const encrypted = await this.store.encryptMessage(messageStr, address);
          
          encryptedMessages.push({
            deviceId: device.id,
            encrypted
          });
        } catch (error) {
          logger.error(`Failed to encrypt for device ${device.id}:`, error);
          // Continue with other devices
        }
      }
      
      if (encryptedMessages.length === 0) {
        throw new Error('Failed to encrypt message for any device');
      }
      
      logger.debug(`Message encrypted for ${encryptedMessages.length} devices`);
      
      return encryptedMessages;
    } catch (error) {
      logger.error('Failed to send message:', error);
      throw error;
    }
  }
  
  /**
   * Receive and decrypt a message
   */
  async receiveMessage(
    senderId: string,
    deviceId: number,
    encryptedMessage: SignalMessage,
    isPreKeyMessage: boolean
  ): Promise<MessagePayload> {
    await this.ensureInitialized();
    
    try {
      logger.debug(`Receiving message from ${senderId}:${deviceId}`);
      
      const address: SignalAddress = {
        name: senderId,
        deviceId
      };
      
      const decrypted = await this.store.decryptMessage(
        encryptedMessage.body,
        address,
        isPreKeyMessage
      );
      
      return JSON.parse(decrypted.plaintext) as MessagePayload;
    } catch (error) {
      logger.error(`Failed to decrypt message from ${senderId}:${deviceId}:`, error);
      
      // Handle specific errors
      if (error.message?.includes('No session')) {
        // Try to establish session and retry
        logger.info('No session found, attempting to establish');
        
        const bundle = await this.fetchPreKeyBundle(senderId, deviceId);
        await this.store.createSession(address, bundle);
        
        // Retry decryption
        const decrypted = await this.store.decryptMessage(
          encryptedMessage.body,
          address,
          isPreKeyMessage
        );
        
        return JSON.parse(decrypted.plaintext) as MessagePayload;
      }
      
      throw error;
    }
  }
  
  /**
   * Generate safety number for identity verification
   */
  async generateSafetyNumber(recipientId: string): Promise<string> {
    await this.ensureInitialized();
    
    try {
      // Get our identity
      const ourIdentity = await this.store.getIdentityKeyPair();
      
      // Get recipient's identity
      const recipientDevice = await this.getRecipientPrimaryDevice(recipientId);
      if (!recipientDevice) {
        throw new Error('Recipient has no Signal-enabled device');
      }
      
      const safetyNumber = await this.store.generateSafetyNumber(
        ourIdentity.publicKey,
        recipientDevice.identityKey,
        this.userId!,
        recipientId
      );
      
      return safetyNumber.numberString;
    } catch (error) {
      logger.error('Failed to generate safety number:', error);
      throw error;
    }
  }
  
  /**
   * Clear all Signal Protocol data
   */
  async clearAllData(): Promise<void> {
    try {
      logger.warn('Clearing all Signal Protocol data');
      
      // Clear native store
      await this.store.clearAllData();
      
      // Delete device from Firebase
      if (this.userId && this.deviceId) {
        const firestore = getFirestore();
        await firestore
          .collection('users')
          .doc(this.userId)
          .collection('devices')
          .doc(this.deviceId.toString())
          .delete();
      }
      
      // Reset state
      this.initialized = false;
      this.userId = undefined;
      this.deviceId = undefined;
      
      logger.info('Signal Protocol data cleared');
    } catch (error) {
      logger.error('Failed to clear Signal Protocol data:', error);
      throw error;
    }
  }
  
  // Private helper methods
  
  private async ensureInitialized(): Promise<void> {
    if (!this.initialized) {
      throw new Error('NativeLibsignalService not initialized');
    }
  }
  
  private async getRecipientDevices(recipientId: string): Promise<Array<{id: number; identityKey: string}>> {
    const firestore = getFirestore();
    const devicesSnapshot = await firestore
      .collection('users')
      .doc(recipientId)
      .collection('devices')
      .where('supportsSignalProtocol', '==', true)
      .get();
      
    return devicesSnapshot.docs.map(doc => ({
      id: parseInt(doc.id),
      identityKey: doc.data().identityKey
    }));
  }
  
  private async getRecipientPrimaryDevice(recipientId: string) {
    const devices = await this.getRecipientDevices(recipientId);
    return devices[0] || null;
  }
  
  private async fetchPreKeyBundle(userId: string, deviceId: number): Promise<PreKeyBundle> {
    const firestore = getFirestore();
    const deviceDoc = await firestore
      .collection('users')
      .doc(userId)
      .collection('devices')
      .doc(deviceId.toString())
      .get();
      
    if (!deviceDoc.exists) {
      throw new Error(`Device ${deviceId} not found for user ${userId}`);
    }
    
    const data = deviceDoc.data()!;
    
    // Get a pre-key
    const preKey = data.preKeys && data.preKeys.length > 0 ? data.preKeys[0] : null;
    
    const bundle: PreKeyBundle = {
      registrationId: data.registrationId,
      deviceId: deviceId,
      preKeyId: preKey?.id,
      preKey: preKey?.publicKey,
      signedPreKeyId: data.signedPreKey.id,
      signedPreKey: data.signedPreKey.publicKey,
      signedPreKeySignature: data.signedPreKey.signature,
      identityKey: data.identityKey
    };
    
    // Remove used pre-key from Firebase
    if (preKey) {
      const updatedPreKeys = data.preKeys.filter((pk: any) => pk.id !== preKey.id);
      await deviceDoc.ref.update({ preKeys: updatedPreKeys });
    }
    
    return bundle;
  }
  
  // Compatibility methods for E2EEService migration
  
  async generateKeyPair(): Promise<{ publicKey: string; privateKey: string }> {
    return NativeLibsignal.generateKeyPair();
  }
  
  async getIdentityKeyPair(): Promise<{ publicKey: string; privateKey: string } | null> {
    try {
      return await NativeLibsignal.getIdentityKeyPair();
    } catch (error) {
      logger.error('Failed to get identity key pair:', error);
      return null;
    }
  }
  
  static async clearAllSignalData(): Promise<void> {
    const instance = NativeLibsignalService.instance;
    if (instance) {
      await instance.clearAllData();
    }
  }
}