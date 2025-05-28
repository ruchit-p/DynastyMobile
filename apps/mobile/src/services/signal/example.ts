import { signalProtocol } from './SignalProtocolService';
import type { PreKeyBundle } from '../../specs/NativeLibsignal';

/**
 * Example usage of the Signal Protocol service
 * This demonstrates how to integrate end-to-end encryption in your app
 */

// Initialize the Signal Protocol when your app starts
export async function initializeEncryption() {
  try {
    await signalProtocol.initialize();
    console.log('Signal Protocol initialized successfully');
  } catch (error) {
    console.error('Failed to initialize Signal Protocol:', error);
  }
}

// Example: Send an encrypted message to another user
export async function sendEncryptedMessage(
  recipientId: string,
  deviceId: number,
  message: string,
  recipientPreKeyBundle?: PreKeyBundle
) {
  try {
    // Check if we have a session with the recipient
    const hasSession = await signalProtocol.hasSession(recipientId, deviceId);
    
    if (!hasSession && recipientPreKeyBundle) {
      // Create a new session using the recipient's pre-key bundle
      console.log('Creating new session with recipient...');
      await signalProtocol.createSession(recipientId, deviceId, recipientPreKeyBundle);
    } else if (!hasSession) {
      throw new Error('No session exists and no pre-key bundle provided');
    }
    
    // Encrypt the message
    const encryptedMessage = await signalProtocol.encryptMessage(
      recipientId,
      deviceId,
      message,
      Date.now()
    );
    
    console.log('Message encrypted successfully');
    
    // In a real app, you would send this encrypted message to your server
    // The server would then deliver it to the recipient
    return {
      recipientId,
      deviceId,
      encryptedMessage,
      timestamp: Date.now()
    };
  } catch (error) {
    console.error('Failed to send encrypted message:', error);
    throw error;
  }
}

// Example: Receive and decrypt a message
export async function receiveEncryptedMessage(
  senderId: string,
  deviceId: number,
  encryptedMessage: {
    type: number;
    body: string;
  }
) {
  try {
    // Decrypt the message based on its type
    const plaintext = await signalProtocol.decryptAnyMessage(
      senderId,
      deviceId,
      encryptedMessage
    );
    
    console.log('Message decrypted successfully');
    
    return {
      senderId,
      deviceId,
      plaintext,
      timestamp: Date.now()
    };
  } catch (error) {
    console.error('Failed to decrypt message:', error);
    throw error;
  }
}

// Example: Group messaging
export async function sendGroupMessage(groupId: string, message: string) {
  try {
    // Encrypt the message for the group
    const encryptedMessage = await signalProtocol.encryptGroupMessage(groupId, message);
    
    console.log('Group message encrypted successfully');
    
    // In a real app, you would send this to your server
    // The server would distribute it to all group members
    return {
      groupId,
      encryptedMessage,
      timestamp: Date.now()
    };
  } catch (error) {
    console.error('Failed to send group message:', error);
    throw error;
  }
}

// Example: Verify another user's identity
export async function verifyUserIdentity(
  remoteUserId: string,
  remoteIdentityKey: string
) {
  try {
    const safetyNumber = await signalProtocol.generateSafetyNumber(
      remoteUserId,
      remoteIdentityKey
    );
    
    console.log('Safety number generated:', safetyNumber.numberString);
    
    // Display this safety number to the user
    // They can verify it with the other user out-of-band
    return safetyNumber;
  } catch (error) {
    console.error('Failed to generate safety number:', error);
    throw error;
  }
}

// Example: Get your pre-key bundle to share with others
export async function getMyPreKeyBundle() {
  try {
    const bundle = await signalProtocol.getPublicPreKeyBundle();
    
    // In a real app, you would upload this to your server
    // Other users would fetch it when they want to start a conversation with you
    return bundle;
  } catch (error) {
    console.error('Failed to get pre-key bundle:', error);
    throw error;
  }
}

// Example: Handle a new group member
export async function addGroupMember(
  groupId: string,
  memberId: string,
  deviceId: number,
  distributionMessage: string
) {
  try {
    // Process the new member's sender key distribution message
    await signalProtocol.processGroupMemberKey(memberId, deviceId, distributionMessage);
    
    console.log(`Added member ${memberId} to group ${groupId}`);
  } catch (error) {
    console.error('Failed to add group member:', error);
    throw error;
  }
}
