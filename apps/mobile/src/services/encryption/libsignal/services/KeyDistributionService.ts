import { getFirebaseDb, getFirebaseAuth } from '../../../../lib/firebase';
import { FirebaseFirestoreTypes } from '@react-native-firebase/firestore';
import { KeyGenerationService } from './KeyGenerationService';
import { SignalProtocolStore } from '../stores/SignalProtocolStore';
import { Platform } from 'react-native';
import DeviceInfo from 'react-native-device-info';
import { logger } from '../../../LoggingService';

// Types for Firebase documents
interface DeviceDocument {
  deviceId: number;
  deviceName?: string;
  deviceType: 'ios' | 'android' | 'web';
  identityKey: string;
  signedPreKey: {
    keyId: number;
    publicKey: string;
    signature: string;
    timestamp: number;
  };
  preKeys: {
    keyId: number;
    publicKey: string;
  }[];
  registrationId: number;
  createdAt: FirebaseFirestoreTypes.Timestamp;
  lastSeenAt: FirebaseFirestoreTypes.Timestamp;
  lastPreKeyRefresh?: FirebaseFirestoreTypes.Timestamp;
  capabilities: {
    signalProtocol: boolean;
    version: string;
  };
}

export interface PreKeyBundle {
  registrationId: number;
  deviceId: number;
  preKeyId?: number;
  preKey?: string;
  signedPreKeyId: number;
  signedPreKey: string;
  signedPreKeySignature: string;
  identityKey: string;
}

/**
 * Service responsible for distributing and fetching Signal Protocol keys via Firebase
 * Follows Dynasty's patterns for Firebase integration
 */
export class KeyDistributionService {
  private db: FirebaseFirestoreTypes.Module;
  
  constructor(
    private keyGenService: KeyGenerationService,
    private store: SignalProtocolStore
  ) {
    this.db = getFirebaseDb();
  }
  
  /**
   * Publish this device's keys to Firebase
   * Should be called after identity initialization and periodically for key updates
   */
  async publishKeys(preKeyCount: number = 100): Promise<void> {
    try {
      const auth = getFirebaseAuth();
      const userId = auth.currentUser?.uid;
      if (!userId) {
        throw new Error('User not authenticated');
      }
      
      logger.info('Publishing keys to Firebase');
      
      // Get or generate identity and keys
      const identityKeyPair = await this.store.getIdentityKeyPair();
      const registrationId = await this.store.getLocalRegistrationId();
      
      // Check if we need to generate signed prekey
      let signedPreKey;
      const shouldRotate = await this.keyGenService.shouldRotateSignedPreKey();
      if (shouldRotate) {
        signedPreKey = await this.keyGenService.rotateSignedPreKey();
      } else {
        // Load existing signed prekey
        const keys = await this.getStoredSignedPreKeys();
        if (keys.length === 0) {
          signedPreKey = await this.keyGenService.generateSignedPreKey(
            identityKeyPair.privateKey
          );
        } else {
          signedPreKey = keys[0];
        }
      }
      
      // Check if we need more prekeys
      const preKeys = await this.keyGenService.replenishPreKeys(10);
      
      // If no new prekeys were generated, load existing ones
      let allPreKeys = preKeys;
      if (preKeys.length === 0) {
        allPreKeys = await this.getStoredPreKeys();
      }
      
      // Prepare device data
      const deviceData: DeviceDocument = {
        deviceId: registrationId,
        deviceName: await this.getDeviceName(),
        deviceType: Platform.OS as 'ios' | 'android',
        identityKey: identityKeyPair.publicKey.serialize().toString('base64'),
        signedPreKey: {
          keyId: signedPreKey.id(),
          publicKey: signedPreKey.publicKey().serialize().toString('base64'),
          signature: signedPreKey.signature().toString('base64'),
          timestamp: signedPreKey.timestamp()
        },
        preKeys: allPreKeys.slice(0, preKeyCount).map(pk => ({
          keyId: pk.id(),
          publicKey: pk.publicKey().serialize().toString('base64')
        })),
        registrationId,
        createdAt: FirebaseFirestoreTypes.FieldValue.serverTimestamp() as any,
        lastSeenAt: FirebaseFirestoreTypes.FieldValue.serverTimestamp() as any,
        capabilities: {
          signalProtocol: true,
          version: 'signal_v1'
        }
      };
      
      // Upload to Firestore
      await this.db
        .collection('users')
        .doc(userId)
        .collection('devices')
        .doc(registrationId.toString())
        .set(deviceData);
      
      // Update user document to indicate Signal Protocol is enabled
      await this.db
        .collection('users')
        .doc(userId)
        .update({
          'signalProtocol.enabled': true,
          'signalProtocol.primaryDeviceId': registrationId,
          'signalProtocol.deviceCount': FirebaseFirestoreTypes.FieldValue.increment(0), // Don't increment if already exists
          'signalProtocol.migratedAt': FirebaseFirestoreTypes.FieldValue.serverTimestamp(),
          'capabilities.signalProtocol': true,
          'capabilities.protocolVersion': 'signal_v1'
        });
      
      logger.info('Keys published successfully');
    } catch (error) {
      logger.error('Failed to publish keys:', error);
      throw error;
    }
  }
  
  /**
   * Fetch prekey bundle for a recipient
   * Consumes one prekey in the process
   */
  async fetchPreKeyBundle(userId: string, deviceId: number): Promise<PreKeyBundle> {
    try {
      logger.debug(`Fetching prekey bundle for ${userId}:${deviceId}`);
      
      const deviceDoc = await this.db
        .collection('users')
        .doc(userId)
        .collection('devices')
        .doc(deviceId.toString())
        .get();
      
      if (!deviceDoc.exists) {
        throw new Error(`Device not found: ${userId}:${deviceId}`);
      }
      
      const data = deviceDoc.data() as DeviceDocument;
      
      // Get and consume one prekey (if available)
      let preKey: { keyId: number; publicKey: string } | undefined;
      if (data.preKeys && data.preKeys.length > 0) {
        preKey = data.preKeys[0];
        
        // Remove consumed prekey from Firebase
        await deviceDoc.ref.update({
          preKeys: FirebaseFirestoreTypes.FieldValue.arrayRemove(preKey)
        });
        
        logger.debug(`Consumed prekey ${preKey.keyId} for ${userId}:${deviceId}`);
      } else {
        logger.warn(`No prekeys available for ${userId}:${deviceId}`);
      }
      
      return {
        registrationId: data.registrationId,
        deviceId: data.deviceId,
        preKeyId: preKey?.keyId,
        preKey: preKey?.publicKey,
        signedPreKeyId: data.signedPreKey.keyId,
        signedPreKey: data.signedPreKey.publicKey,
        signedPreKeySignature: data.signedPreKey.signature,
        identityKey: data.identityKey
      };
    } catch (error) {
      logger.error('Failed to fetch prekey bundle:', error);
      throw error;
    }
  }
  
  /**
   * Get all devices for a user
   */
  async getRecipientDevices(userId: string): Promise<{
    id: number;
    name?: string;
    type: string;
    lastSeen: Date;
    supportsSignalProtocol: boolean;
  }[]> {
    try {
      const devicesSnapshot = await this.db
        .collection('users')
        .doc(userId)
        .collection('devices')
        .where('capabilities.signalProtocol', '==', true)
        .get();
      
      return devicesSnapshot.docs.map(doc => {
        const data = doc.data() as DeviceDocument;
        return {
          id: data.deviceId,
          name: data.deviceName,
          type: data.deviceType,
          lastSeen: data.lastSeenAt.toDate(),
          supportsSignalProtocol: data.capabilities.signalProtocol
        };
      });
    } catch (error) {
      logger.error(`Failed to get devices for ${userId}:`, error);
      return [];
    }
  }
  
  /**
   * Update last seen timestamp for this device
   */
  async updateLastSeen(): Promise<void> {
    try {
      const auth = getFirebaseAuth();
      const userId = auth.currentUser?.uid;
      if (!userId) return;
      
      const registrationId = await this.store.getLocalRegistrationId();
      
      await this.db
        .collection('users')
        .doc(userId)
        .collection('devices')
        .doc(registrationId.toString())
        .update({
          lastSeenAt: FirebaseFirestoreTypes.FieldValue.serverTimestamp()
        });
    } catch (error) {
      logger.debug('Failed to update last seen:', error);
    }
  }
  
  /**
   * Check if a user has Signal Protocol enabled
   */
  async isSignalProtocolEnabled(userId: string): Promise<boolean> {
    try {
      const userDoc = await this.db
        .collection('users')
        .doc(userId)
        .get();
      
      if (!userDoc.exists) {
        return false;
      }
      
      const data = userDoc.data();
      return data?.capabilities?.signalProtocol === true;
    } catch (error) {
      logger.error(`Failed to check Signal Protocol status for ${userId}:`, error);
      return false;
    }
  }
  
  /**
   * Get recipient info including default device
   */
  async getRecipientInfo(userId: string): Promise<{
    supportsSignalProtocol: boolean;
    deviceId?: number;
    deviceCount: number;
  }> {
    try {
      const userDoc = await this.db
        .collection('users')
        .doc(userId)
        .get();
      
      if (!userDoc.exists) {
        return {
          supportsSignalProtocol: false,
          deviceCount: 0
        };
      }
      
      const data = userDoc.data();
      const supportsSignalProtocol = data?.capabilities?.signalProtocol === true;
      
      if (!supportsSignalProtocol) {
        return {
          supportsSignalProtocol: false,
          deviceCount: 0
        };
      }
      
      return {
        supportsSignalProtocol: true,
        deviceId: data?.signalProtocol?.primaryDeviceId,
        deviceCount: data?.signalProtocol?.deviceCount || 0
      };
    } catch (error) {
      logger.error(`Failed to get recipient info for ${userId}:`, error);
      return {
        supportsSignalProtocol: false,
        deviceCount: 0
      };
    }
  }
  
  /**
   * Monitor prekey count and trigger replenishment if needed
   */
  async checkPreKeyStatus(): Promise<{
    count: number;
    needsReplenishment: boolean;
  }> {
    try {
      const auth = getFirebaseAuth();
      const userId = auth.currentUser?.uid;
      if (!userId) {
        throw new Error('User not authenticated');
      }
      
      const registrationId = await this.store.getLocalRegistrationId();
      const deviceDoc = await this.db
        .collection('users')
        .doc(userId)
        .collection('devices')
        .doc(registrationId.toString())
        .get();
      
      if (!deviceDoc.exists) {
        return { count: 0, needsReplenishment: true };
      }
      
      const data = deviceDoc.data() as DeviceDocument;
      const count = data.preKeys?.length || 0;
      
      return {
        count,
        needsReplenishment: count < 10
      };
    } catch (error) {
      logger.error('Failed to check prekey status:', error);
      return { count: 0, needsReplenishment: true };
    }
  }
  
  /**
   * Delete device and all associated keys
   */
  async deleteDevice(deviceId?: number): Promise<void> {
    try {
      const auth = getFirebaseAuth();
      const userId = auth.currentUser?.uid;
      if (!userId) {
        throw new Error('User not authenticated');
      }
      
      const targetDeviceId = deviceId || await this.store.getLocalRegistrationId();
      
      await this.db
        .collection('users')
        .doc(userId)
        .collection('devices')
        .doc(targetDeviceId.toString())
        .delete();
      
      logger.info(`Deleted device ${targetDeviceId}`);
    } catch (error) {
      logger.error('Failed to delete device:', error);
      throw error;
    }
  }
  
  // Helper methods
  
  private async getDeviceName(): Promise<string> {
    try {
      const deviceName = await DeviceInfo.getDeviceName();
      return deviceName || `${Platform.OS} Device`;
    } catch {
      return `${Platform.OS} Device`;
    }
  }
  
  private async getStoredPreKeys(): Promise<any[]> {
    // Load prekeys from store
    const preKeys = [];
    for (let i = 1; i <= 100; i++) {
      const pk = await this.store.loadPreKey(i);
      if (pk) {
        preKeys.push(pk);
      }
    }
    return preKeys;
  }
  
  private async getStoredSignedPreKeys(): Promise<any[]> {
    // Load signed prekeys from store
    // In practice, you'd track the IDs somewhere
    const signedPreKeys = [];
    // Try to load recent signed prekeys
    const currentTime = Date.now() / 1000;
    for (let i = 0; i < 10; i++) {
      const id = Math.floor(currentTime - i * 86400); // Check last 10 days
      const spk = await this.store.loadSignedPreKey(id % 0xFFFFFF);
      if (spk) {
        signedPreKeys.push(spk);
      }
    }
    return signedPreKeys;
  }
}