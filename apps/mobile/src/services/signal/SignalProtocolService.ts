import { Platform } from 'react-native';
import type { 
  SignalAddress, 
  PreKeyBundle, 
  SignalMessage, 
  IdentityKeyPair, 
  PreKey, 
  SignedPreKey,
  DecryptedMessage,
  SafetyNumber,
  SenderKeyDistributionMessage,
  GroupMessage,
  DecryptedGroupMessage
} from '../../specs/NativeLibsignal';

// Import the native module
import Libsignal from '../../specs/NativeLibsignal';

/**
 * High-level Signal Protocol service wrapper
 * Provides an easy-to-use API for end-to-end encryption
 */
export class SignalProtocolService {
  private static instance: SignalProtocolService;
  private initialized: boolean = false;
  
  /**
   * Get singleton instance
   */
  static getInstance(): SignalProtocolService {
    if (!SignalProtocolService.instance) {
      SignalProtocolService.instance = new SignalProtocolService();
    }
    return SignalProtocolService.instance;
  }
  
  /**
   * Initialize the Signal Protocol
   * This should be called once when the app starts
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }
    
    try {
      // Check if we have an existing identity
      const identity = await Libsignal.getIdentityKeyPair();
      
      if (!identity) {
        console.log('No existing identity found, generating new one...');
        
        // Generate new identity
        await Libsignal.generateIdentityKeyPair();
        
        // Generate registration ID
        await Libsignal.generateRegistrationId();
        
        // Generate pre-keys
        await this.generateAndUploadPreKeys();
        
        // Generate signed pre-key
        await this.generateAndUploadSignedPreKey();
      } else {
        console.log('Found existing identity');
      }
      
      this.initialized = true;
    } catch (error) {
      console.error('Failed to initialize Signal Protocol:', error);
      throw error;
    }
  }
  
  /**
   * Get the local user's identity key pair
   */
  async getIdentityKeyPair(): Promise<IdentityKeyPair | null> {
    return await Libsignal.getIdentityKeyPair();
  }
  
  /**
   * Get the local registration ID
   */
  async getLocalRegistrationId(): Promise<number> {
    return await Libsignal.getLocalRegistrationId();
  }
  
  /**
   * Generate and store pre-keys
   * @param startId Starting ID for pre-keys
   * @param count Number of pre-keys to generate
   */
  async generateAndUploadPreKeys(startId: number = 1, count: number = 100): Promise<PreKey[]> {
    const preKeys = await Libsignal.generatePreKeys(startId, count);
    
    // In a real app, you would upload these to your server
    // For now, we just return them
    console.log(`Generated ${preKeys.length} pre-keys`);
    
    return preKeys;
  }
  
  /**
   * Generate and store a signed pre-key
   * @param signedPreKeyId ID for the signed pre-key
   */
  async generateAndUploadSignedPreKey(signedPreKeyId: number = 1): Promise<SignedPreKey> {
    const identityKeyPair = await this.getIdentityKeyPair();
    if (!identityKeyPair) {
      throw new Error('No identity key pair found');
    }
    
    const signedPreKey = await Libsignal.generateSignedPreKey(
      identityKeyPair.privateKey,
      signedPreKeyId
    );
    
    // In a real app, you would upload this to your server
    console.log('Generated signed pre-key');
    
    return signedPreKey;
  }
  
  /**
   * Create a session with a remote user
   * @param recipientId The recipient's ID
   * @param deviceId The recipient's device ID
   * @param preKeyBundle The recipient's pre-key bundle
   */
  async createSession(
    recipientId: string,
    deviceId: number,
    preKeyBundle: PreKeyBundle
  ): Promise<void> {
    const address: SignalAddress = { name: recipientId, deviceId };
    await Libsignal.createSession(address, preKeyBundle);
    console.log(`Session created with ${recipientId}:${deviceId}`);
  }
  
  /**
   * Check if a session exists with a remote user
   * @param recipientId The recipient's ID
   * @param deviceId The recipient's device ID
   */
  async hasSession(recipientId: string, deviceId: number): Promise<boolean> {
    const address: SignalAddress = { name: recipientId, deviceId };
    return await Libsignal.hasSession(address);
  }
  
  /**
   * Encrypt a message for a recipient
   * @param recipientId The recipient's ID
   * @param deviceId The recipient's device ID
   * @param message The plaintext message
   * @param timestamp Optional timestamp
   */
  async encryptMessage(
    recipientId: string,
    deviceId: number,
    message: string,
    timestamp?: number
  ): Promise<SignalMessage> {
    const address: SignalAddress = { name: recipientId, deviceId };
    
    // Check if we have a session
    const hasSession = await this.hasSession(recipientId, deviceId);
    if (!hasSession) {
      throw new Error(`No session with ${recipientId}:${deviceId}. Create a session first.`);
    }
    
    return await Libsignal.encryptMessage(message, address, timestamp);
  }
  
  /**
   * Decrypt a pre-key message from a sender
   * @param senderId The sender's ID
   * @param deviceId The sender's device ID
   * @param encryptedMessage The encrypted message (base64)
   */
  async decryptPreKeyMessage(
    senderId: string,
    deviceId: number,
    encryptedMessage: string
  ): Promise<DecryptedMessage> {
    const address: SignalAddress = { name: senderId, deviceId };
    return await Libsignal.decryptPreKeyMessage(encryptedMessage, address);
  }
  
  /**
   * Decrypt a regular message from a sender
   * @param senderId The sender's ID
   * @param deviceId The sender's device ID
   * @param encryptedMessage The encrypted message (base64)
   */
  async decryptMessage(
    senderId: string,
    deviceId: number,
    encryptedMessage: string
  ): Promise<DecryptedMessage> {
    const address: SignalAddress = { name: senderId, deviceId };
    return await Libsignal.decryptMessage(encryptedMessage, address);
  }
  
  /**
   * Decrypt any type of message
   * @param senderId The sender's ID
   * @param deviceId The sender's device ID
   * @param message The encrypted message
   */
  async decryptAnyMessage(
    senderId: string,
    deviceId: number,
    message: SignalMessage
  ): Promise<string> {
    try {
      if (message.type === 3) { // PreKeySignalMessage
        const decrypted = await this.decryptPreKeyMessage(senderId, deviceId, message.body);
        return decrypted.plaintext;
      } else if (message.type === 1) { // SignalMessage
        const decrypted = await this.decryptMessage(senderId, deviceId, message.body);
        return decrypted.plaintext;
      } else {
        throw new Error(`Unknown message type: ${message.type}`);
      }
    } catch (error) {
      console.error('Failed to decrypt message:', error);
      throw error;
    }
  }
  
  /**
   * Generate a safety number for verification
   * @param remoteUserId The remote user's ID
   * @param remoteIdentityKey The remote user's identity key (base64)
   */
  async generateSafetyNumber(
    remoteUserId: string,
    remoteIdentityKey: string
  ): Promise<SafetyNumber> {
    const identity = await this.getIdentityKeyPair();
    if (!identity) {
      throw new Error('No local identity found');
    }
    
    // Get the current user's ID (in a real app, this would come from your auth system)
    const localUserId = 'currentUser'; // Replace with actual user ID
    
    return await Libsignal.generateSafetyNumber(
      identity.publicKey,
      remoteIdentityKey,
      localUserId,
      remoteUserId
    );
  }
  
  // MARK: - Group Messaging
  
  /**
   * Create a sender key distribution message for a group
   * @param groupId The group ID
   */
  async createGroupSession(groupId: string): Promise<SenderKeyDistributionMessage> {
    return await Libsignal.createSenderKeyDistributionMessage(groupId);
  }
  
  /**
   * Process a sender key distribution message from another member
   * @param senderId The sender's ID
   * @param deviceId The sender's device ID
   * @param message The distribution message (base64)
   */
  async processGroupMemberKey(
    senderId: string,
    deviceId: number,
    message: string
  ): Promise<void> {
    const senderAddress: SignalAddress = { name: senderId, deviceId };
    await Libsignal.processSenderKeyDistributionMessage(message, senderAddress);
  }
  
  /**
   * Encrypt a message for a group
   * @param groupId The group ID
   * @param message The plaintext message
   */
  async encryptGroupMessage(
    groupId: string,
    message: string
  ): Promise<GroupMessage> {
    return await Libsignal.encryptGroupMessage(message, groupId);
  }
  
  /**
   * Decrypt a group message
   * @param senderId The sender's ID
   * @param deviceId The sender's device ID
   * @param encryptedMessage The encrypted message (base64)
   * @param groupId The group ID
   */
  async decryptGroupMessage(
    senderId: string,
    deviceId: number,
    encryptedMessage: string,
    groupId: string
  ): Promise<DecryptedGroupMessage> {
    const senderAddress: SignalAddress = { name: senderId, deviceId };
    return await Libsignal.decryptGroupMessage(encryptedMessage, senderAddress, groupId);
  }
  
  /**
   * Clear all Signal Protocol data
   * WARNING: This will delete all keys and sessions!
   */
  async clearAllData(): Promise<void> {
    await Libsignal.clearAllData();
    this.initialized = false;
  }
  
  /**
   * Get a pre-key bundle for sharing with other users
   * This is what you would upload to your server
   */
  async getPublicPreKeyBundle(): Promise<PreKeyBundle> {
    const identity = await this.getIdentityKeyPair();
    const registrationId = await this.getLocalRegistrationId();
    
    if (!identity) {
      throw new Error('No identity key pair found');
    }
    
    // In a real app, you would fetch the current pre-key and signed pre-key from storage
    // For now, we'll use placeholder values
    const bundle: PreKeyBundle = {
      registrationId,
      deviceId: 1, // In a real app, this would be the actual device ID
      identityKey: identity.publicKey,
      signedPreKeyId: 1,
      signedPreKey: '', // Would be fetched from storage
      signedPreKeySignature: '', // Would be fetched from storage
      preKeyId: 1, // Optional
      preKey: '' // Optional, would be fetched from storage
    };
    
    return bundle;
  }
}

// Export singleton instance
export const signalProtocol = SignalProtocolService.getInstance();
