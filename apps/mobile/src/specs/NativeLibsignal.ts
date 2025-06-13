import type { TurboModule } from 'react-native';
import { TurboModuleRegistry } from 'react-native';

/**
 * Type definitions for Signal Protocol operations
 */
export interface SignalAddress {
  name: string;
  deviceId: number;
}

export interface PreKeyBundle {
  registrationId: number;
  deviceId: number;
  preKeyId?: number | null;
  preKey?: string; // base64
  signedPreKeyId: number;
  signedPreKey: string; // base64
  signedPreKeySignature: string; // base64
  identityKey: string; // base64
}

export interface SignalMessage {
  type: number; // 1 = PreKeySignalMessage, 3 = SignalMessage
  body: string; // base64
}

export interface IdentityKeyPair {
  publicKey: string; // base64
  privateKey: string; // base64
}

export interface PreKey {
  id: number;
  publicKey: string; // base64
}

export interface SignedPreKey {
  id: number;
  publicKey: string; // base64
  privateKey: string; // base64
  signature: string; // base64
  timestamp: number;
}

export interface DecryptedMessage {
  plaintext: string;
  messageType: number;
}

export interface SafetyNumber {
  numberString: string;
  qrCodeData: string; // base64
}

export interface SenderKeyDistributionMessage {
  distributionId: string;
  message: string; // base64
}

export interface GroupMessage {
  ciphertext: string; // base64
  messageType: number;
}

export interface DecryptedGroupMessage {
  plaintext: string;
  messageType: number;
}

/**
 * Native module interface for Signal Protocol operations
 */
export interface Spec extends TurboModule {
  // Identity Key Management
  generateIdentityKeyPair(): Promise<IdentityKeyPair>;
  getIdentityKeyPair(): Promise<IdentityKeyPair | null>;
  saveIdentityKeyPair(publicKey: string, privateKey: string): Promise<void>;
  
  // Registration ID
  generateRegistrationId(): Promise<number>;
  getLocalRegistrationId(): Promise<number>;
  
  // PreKey Management
  generatePreKeys(start: number, count: number): Promise<PreKey[]>;
  
  // Signed PreKey Management
  generateSignedPreKey(identityPrivateKey: string, signedPreKeyId: number): Promise<SignedPreKey>;
  
  // Session Management
  createSession(address: SignalAddress, preKeyBundle: PreKeyBundle): Promise<void>;
  hasSession(address: SignalAddress): Promise<boolean>;
  
  // Encryption/Decryption
  encryptMessage(
    plaintext: string,
    address: SignalAddress,
    timestamp?: number
  ): Promise<SignalMessage>;
  
  decryptPreKeyMessage(
    message: string, // base64
    address: SignalAddress
  ): Promise<DecryptedMessage>;
  
  decryptMessage(
    message: string, // base64
    address: SignalAddress
  ): Promise<DecryptedMessage>;
  
  // Fingerprint/Safety Number
  generateSafetyNumber(
    localIdentityKey: string,
    remoteIdentityKey: string,
    localUsername: string,
    remoteUsername: string
  ): Promise<SafetyNumber>;
  
  // Group Messaging
  createSenderKeyDistributionMessage(
    groupId: string
  ): Promise<SenderKeyDistributionMessage>;
  
  processSenderKeyDistributionMessage(
    message: string, // base64
    senderAddress: SignalAddress
  ): Promise<{ success: boolean; distributionId: string }>;
  
  encryptGroupMessage(
    plaintext: string,
    groupId: string
  ): Promise<GroupMessage>;
  
  decryptGroupMessage(
    encryptedMessage: string, // base64
    senderAddress: SignalAddress,
    groupId: string
  ): Promise<DecryptedGroupMessage>;
  
  // Cleanup
  clearAllData(): Promise<void>;
  
  // Utilities
  generateKeyPair(): Promise<IdentityKeyPair>;
  
  // Attachment Encryption (AES-256-CBC)
  encryptAttachment(
    data: string, // base64
    key: string, // base64 (32 bytes)
    iv: string // base64 (16 bytes)
  ): Promise<string>; // base64 encrypted data
  
  decryptAttachment(
    encryptedData: string, // base64
    key: string, // base64 (32 bytes)
    iv: string // base64 (16 bytes)
  ): Promise<string>; // base64 decrypted data
  
  generateAttachmentKey(): Promise<string>; // base64 (64 bytes: 32 AES + 32 HMAC)
  generateIV(): Promise<string>; // base64 (16 bytes)
  
  calculateHMAC(
    data: string, // base64
    key: string // base64 (32 bytes)
  ): Promise<string>; // base64 HMAC
}

export default TurboModuleRegistry.getEnforcing<Spec>('Libsignal');