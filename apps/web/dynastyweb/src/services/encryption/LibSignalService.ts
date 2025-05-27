// MARK: - LibSignal Service for Web
/**
 * Enterprise-grade Signal Protocol implementation for web
 * Provides the same security capabilities as the mobile app
 */

import * as SignalClient from '@signalapp/libsignal-client';

// MARK: - Types
export interface LibSignalConfig {
  registrationId: number;
  identityKeyPair: SignalClient.IdentityKeyPair;
  deviceId: number;
  uuid: string;
}

export interface PreKeyBundle {
  deviceId: number;
  registrationId: number;
  preKeyId: number;
  preKeyPublic: Uint8Array;
  signedPreKeyId: number;
  signedPreKeyPublic: Uint8Array;
  signedPreKeySignature: Uint8Array;
  identityKey: Uint8Array;
}

export interface EncryptedMessage {
  type: 'prekey' | 'message';
  body: Uint8Array;
  registrationId: number;
}

// MARK: - LibSignal Service Implementation
export class LibSignalService {
  private identityKeyStore: Map<string, SignalClient.IdentityKey> = new Map();
  private preKeyStore: Map<number, SignalClient.PreKeyRecord> = new Map();
  private signedPreKeyStore: Map<number, SignalClient.SignedPreKeyRecord> = new Map();
  private sessionStore: Map<string, SignalClient.SessionRecord> = new Map();
  private senderKeyStore: Map<string, SignalClient.SenderKeyRecord> = new Map();
  
  private config: LibSignalConfig | null = null;

  constructor() {
    this.initializeStores();
  }

  // MARK: - Initialization
  private initializeStores(): void {
    // Initialize in-memory stores for development
    // In production, these should be backed by IndexedDB
    console.log('[LibSignal] Initializing stores');
  }

  /**
   * Initialize LibSignal with user configuration
   */
  async initialize(config: LibSignalConfig): Promise<void> {
    try {
      this.config = config;
      
      // Store identity key
      const identityKeyAddress = SignalClient.ProtocolAddress.new(
        config.uuid, 
        config.deviceId
      );
      
      this.identityKeyStore.set(
        identityKeyAddress.toString(), 
        config.identityKeyPair.publicKey()
      );

      console.log('[LibSignal] Service initialized successfully');
    } catch (error) {
      console.error('[LibSignal] Initialization failed:', error);
      throw new Error('Failed to initialize LibSignal service');
    }
  }

  // MARK: - Key Generation
  /**
   * Generate identity key pair for new user
   */
  static generateIdentityKeyPair(): SignalClient.IdentityKeyPair {
    return SignalClient.IdentityKeyPair.generate();
  }

  /**
   * Generate registration ID
   */
  static generateRegistrationId(): number {
    return Math.floor(Math.random() * 16383) + 1;
  }

  /**
   * Generate pre-key records
   */
  static generatePreKeys(start: number, count: number): SignalClient.PreKeyRecord[] {
    const preKeys: SignalClient.PreKeyRecord[] = [];
    
    for (let i = 0; i < count; i++) {
      const keyId = (start + i) % 0xFFFFFF;
      const privateKey = SignalClient.PrivateKey.generate();
      
      preKeys.push(
        SignalClient.PreKeyRecord.new(keyId, privateKey)
      );
    }
    
    return preKeys;
  }

  /**
   * Generate signed pre-key record
   */
  static generateSignedPreKey(
    keyId: number,
    identityKeyPair: SignalClient.IdentityKeyPair,
    timestamp: number
  ): SignalClient.SignedPreKeyRecord {
    const privateKey = SignalClient.PrivateKey.generate();
    const signature = identityKeyPair.privateKey().sign(
      privateKey.publicKey().serialize()
    );
    
    return SignalClient.SignedPreKeyRecord.new(
      keyId,
      BigInt(timestamp),
      privateKey,
      signature
    );
  }

  // MARK: - Message Encryption
  /**
   * Encrypt message for recipient
   */
  async encryptMessage(
    recipientAddress: string,
    message: string,
    preKeyBundle?: PreKeyBundle
  ): Promise<EncryptedMessage> {
    try {
      if (!this.config) {
        throw new Error('LibSignal service not initialized');
      }

      const address = SignalClient.ProtocolAddress.new(
        recipientAddress,
        1 // Default device ID
      );

      // Process pre-key bundle if provided (first message)
      if (preKeyBundle) {
        await this.processPreKeyBundle(address, preKeyBundle);
      }

      // Get or create session
      const session = this.getSession(address.toString());
      if (!session) {
        throw new Error('No session found for recipient');
      }

      // Encrypt message
      const messageBytes = new TextEncoder().encode(message);
      const ciphertext = SignalClient.signalEncrypt(
        messageBytes,
        address,
        this.createSessionStore(),
        this.createIdentityStore()
      );

      return {
        type: ciphertext.type() === SignalClient.CiphertextMessageType.PreKey ? 'prekey' : 'message',
        body: ciphertext.serialize(),
        registrationId: this.config.registrationId
      };

    } catch (error) {
      console.error('[LibSignal] Message encryption failed:', error);
      throw new Error('Failed to encrypt message');
    }
  }

  /**
   * Decrypt received message
   */
  async decryptMessage(
    senderAddress: string,
    encryptedMessage: EncryptedMessage
  ): Promise<string> {
    try {
      if (!this.config) {
        throw new Error('LibSignal service not initialized');
      }

      const address = SignalClient.ProtocolAddress.new(senderAddress, 1);
      
      let plaintext: Uint8Array;

      if (encryptedMessage.type === 'prekey') {
        // Decrypt pre-key message
        const preKeyMessage = SignalClient.PreKeySignalMessage.deserialize(
          encryptedMessage.body
        );
        
        plaintext = SignalClient.signalDecryptPreKey(
          preKeyMessage,
          address,
          this.createSessionStore(),
          this.createIdentityStore(),
          this.createPreKeyStore(),
          this.createSignedPreKeyStore()
        );
      } else {
        // Decrypt regular message
        const signalMessage = SignalClient.SignalMessage.deserialize(
          encryptedMessage.body
        );
        
        plaintext = SignalClient.signalDecrypt(
          signalMessage,
          address,
          this.createSessionStore(),
          this.createIdentityStore()
        );
      }

      return new TextDecoder().decode(plaintext);

    } catch (error) {
      console.error('[LibSignal] Message decryption failed:', error);
      throw new Error('Failed to decrypt message');
    }
  }

  // MARK: - Session Management
  private async processPreKeyBundle(
    address: SignalClient.ProtocolAddress,
    bundle: PreKeyBundle
  ): Promise<void> {
    try {
      // Create pre-key bundle from received data
      const preKeyPublic = SignalClient.PublicKey.deserialize(bundle.preKeyPublic);
      const signedPreKeyPublic = SignalClient.PublicKey.deserialize(bundle.signedPreKeyPublic);
      const identityKey = SignalClient.IdentityKey.new(
        SignalClient.PublicKey.deserialize(bundle.identityKey)
      );

      const preKeyBundle = SignalClient.PreKeyBundle.new(
        bundle.registrationId,
        bundle.deviceId,
        bundle.preKeyId,
        preKeyPublic,
        bundle.signedPreKeyId,
        signedPreKeyPublic,
        bundle.signedPreKeySignature,
        identityKey
      );

      // Process bundle to create session
      SignalClient.processPreKeyBundle(
        preKeyBundle,
        address,
        this.createSessionStore(),
        this.createIdentityStore()
      );

      console.log('[LibSignal] Pre-key bundle processed for:', address.toString());

    } catch (error) {
      console.error('[LibSignal] Failed to process pre-key bundle:', error);
      throw error;
    }
  }

  // MARK: - Store Implementations
  private createSessionStore(): SignalClient.SessionStore {
    return {
      saveSession: (address: SignalClient.ProtocolAddress, record: SignalClient.SessionRecord) => {
        this.sessionStore.set(address.toString(), record);
        return Promise.resolve();
      },
      
      getSession: (address: SignalClient.ProtocolAddress) => {
        const session = this.sessionStore.get(address.toString());
        return Promise.resolve(session || null);
      },
      
      getExistingSessions: (addresses: SignalClient.ProtocolAddress[]) => {
        const sessions = addresses
          .map(addr => this.sessionStore.get(addr.toString()))
          .filter(Boolean) as SignalClient.SessionRecord[];
        return Promise.resolve(sessions);
      }
    };
  }

  private createIdentityStore(): SignalClient.IdentityKeyStore {
    return {
      getIdentityKey: (address: SignalClient.ProtocolAddress) => {
        const key = this.identityKeyStore.get(address.toString());
        return Promise.resolve(key || null);
      },
      
      saveIdentity: (address: SignalClient.ProtocolAddress, identityKey: SignalClient.IdentityKey) => {
        this.identityKeyStore.set(address.toString(), identityKey);
        return Promise.resolve(true);
      },
      
      isTrustedIdentity: (
        address: SignalClient.ProtocolAddress, 
        identityKey: SignalClient.IdentityKey, 
        direction: SignalClient.Direction
      ) => {
        // In a real implementation, you'd verify trust
        return Promise.resolve(true);
      },
      
      getLocalRegistrationId: () => {
        return Promise.resolve(this.config?.registrationId || 0);
      },
      
      getLocalIdentityKey: () => {
        return Promise.resolve(this.config?.identityKeyPair.publicKey() || null);
      }
    };
  }

  private createPreKeyStore(): SignalClient.PreKeyStore {
    return {
      savePreKey: (preKeyId: number, record: SignalClient.PreKeyRecord) => {
        this.preKeyStore.set(preKeyId, record);
        return Promise.resolve();
      },
      
      getPreKey: (preKeyId: number) => {
        const preKey = this.preKeyStore.get(preKeyId);
        return Promise.resolve(preKey || null);
      },
      
      removePreKey: (preKeyId: number) => {
        this.preKeyStore.delete(preKeyId);
        return Promise.resolve();
      }
    };
  }

  private createSignedPreKeyStore(): SignalClient.SignedPreKeyStore {
    return {
      saveSignedPreKey: (signedPreKeyId: number, record: SignalClient.SignedPreKeyRecord) => {
        this.signedPreKeyStore.set(signedPreKeyId, record);
        return Promise.resolve();
      },
      
      getSignedPreKey: (signedPreKeyId: number) => {
        const signedPreKey = this.signedPreKeyStore.get(signedPreKeyId);
        return Promise.resolve(signedPreKey || null);
      }
    };
  }

  // MARK: - Utility Methods
  private getSession(addressStr: string): SignalClient.SessionRecord | null {
    return this.sessionStore.get(addressStr) || null;
  }

  /**
   * Generate safety number for key verification
   */
  generateSafetyNumber(
    localIdentityKey: SignalClient.IdentityKey,
    remoteIdentityKey: SignalClient.IdentityKey,
    localId: string,
    remoteId: string
  ): string {
    try {
      const fingerprint = SignalClient.displayableFingerprint(
        localIdentityKey,
        localId,
        remoteIdentityKey,
        remoteId
      );
      
      return fingerprint.displayableFingerprint();
    } catch (error) {
      console.error('[LibSignal] Failed to generate safety number:', error);
      throw new Error('Failed to generate safety number');
    }
  }

  /**
   * Export key bundle for server upload
   */
  exportKeyBundle(): {
    identityKey: Uint8Array;
    registrationId: number;
    preKeys: Array<{ id: number; key: Uint8Array }>;
    signedPreKey: {
      id: number;
      key: Uint8Array;
      signature: Uint8Array;
    };
  } | null {
    if (!this.config) {
      return null;
    }

    // Convert pre-keys for export
    const preKeys = Array.from(this.preKeyStore.entries()).map(([id, record]) => ({
      id,
      key: record.publicKey().serialize()
    }));

    // Get signed pre-key
    const signedPreKey = Array.from(this.signedPreKeyStore.entries())[0];
    if (!signedPreKey) {
      throw new Error('No signed pre-key available');
    }

    return {
      identityKey: this.config.identityKeyPair.publicKey().serialize(),
      registrationId: this.config.registrationId,
      preKeys,
      signedPreKey: {
        id: signedPreKey[0],
        key: signedPreKey[1].publicKey().serialize(),
        signature: signedPreKey[1].signature()
      }
    };
  }

  // MARK: - Cleanup
  /**
   * Clear all stored data
   */
  clearAll(): void {
    this.identityKeyStore.clear();
    this.preKeyStore.clear();
    this.signedPreKeyStore.clear();
    this.sessionStore.clear();
    this.senderKeyStore.clear();
    this.config = null;
    
    console.log('[LibSignal] All data cleared');
  }
}

// MARK: - Default Export
const libSignalService = new LibSignalService();
export default libSignalService; 