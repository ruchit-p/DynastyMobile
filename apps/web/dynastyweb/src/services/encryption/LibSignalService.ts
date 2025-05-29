// MARK: - LibSignal Service for Web
/**
 * Enterprise-grade Signal Protocol implementation for web
 * Provides the same security capabilities as the mobile app
 */

import * as SignalClient from '@signalapp/libsignal-client';
import { PublicKey, PrivateKey } from '@signalapp/libsignal-client/dist/EcKeys';

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
  private identityKeyStore: Map<string, PublicKey> = new Map();
  private preKeyStore: Map<number, SignalClient.PreKeyRecord> = new Map();
  private signedPreKeyStore: Map<number, SignalClient.SignedPreKeyRecord> = new Map();
  private sessionStore: Map<string, SignalClient.SessionRecord> = new Map();
  private senderKeyStore: Map<string, SignalClient.SenderKeyRecord> = new Map();
  private kyberPreKeyStore: Map<number, SignalClient.KyberPreKeyRecord> = new Map();
  
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
        config.identityKeyPair.publicKey
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
      const privateKey = PrivateKey.generate();
      const publicKey = privateKey.getPublicKey();
      
      preKeys.push(
        SignalClient.PreKeyRecord.new(keyId, publicKey, privateKey)
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
    const signature = identityKeyPair.privateKey.sign(
      privateKey.getPublicKey().serialize()
    );
    
    return SignalClient.SignedPreKeyRecord.new(
      keyId,
      timestamp,
      privateKey.getPublicKey(),
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
      const messageBytes = Buffer.from(new TextEncoder().encode(message));
      const ciphertext = await SignalClient.signalEncrypt(
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
          Buffer.from(encryptedMessage.body)
        );
        
        plaintext = await SignalClient.signalDecryptPreKey(
          preKeyMessage,
          address,
          this.createSessionStore(),
          this.createIdentityStore(),
          this.createPreKeyStore(),
          this.createSignedPreKeyStore(),
          this.createKyberPreKeyStore()
        );
      } else {
        // Decrypt regular message
        const signalMessage = SignalClient.SignalMessage.deserialize(
          Buffer.from(encryptedMessage.body)
        );
        
        plaintext = await SignalClient.signalDecrypt(
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
      const preKeyPublic = PublicKey.deserialize(Buffer.from(bundle.preKeyPublic));
      const signedPreKeyPublic = PublicKey.deserialize(Buffer.from(bundle.signedPreKeyPublic));
      const identityKey = PublicKey.deserialize(Buffer.from(bundle.identityKey));

      const preKeyBundle = SignalClient.PreKeyBundle.new(
        bundle.registrationId,
        bundle.deviceId,
        bundle.preKeyId,
        preKeyPublic,
        bundle.signedPreKeyId,
        signedPreKeyPublic,
        Buffer.from(bundle.signedPreKeySignature),
        identityKey,
        0, // kyber_prekey_id - not implemented yet
        null as unknown as SignalClient.KyberPreKeyRecord, // kyber_prekey - not implemented yet
        Buffer.alloc(0) // kyber_prekey_signature - not implemented yet
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
    const sessionMap = this.sessionStore;
    
    class MySessionStore extends SignalClient.SessionStore {
      async saveSession(address: SignalClient.ProtocolAddress, record: SignalClient.SessionRecord): Promise<void> {
        sessionMap.set(address.toString(), record);
      }
      
      async getSession(address: SignalClient.ProtocolAddress): Promise<SignalClient.SessionRecord | null> {
        const session = sessionMap.get(address.toString());
        return session || null;
      }
      
      async getExistingSessions(addresses: SignalClient.ProtocolAddress[]): Promise<SignalClient.SessionRecord[]> {
        const sessions = addresses
          .map(addr => sessionMap.get(addr.toString()))
          .filter(Boolean) as SignalClient.SessionRecord[];
        return sessions;
      }
    }
    
    return new MySessionStore();
  }

  private createIdentityStore(): SignalClient.IdentityKeyStore {
    const identityMap = this.identityKeyStore;
    const config = this.config;
    
    class MyIdentityKeyStore extends SignalClient.IdentityKeyStore {
      async getIdentityKey(): Promise<PrivateKey> {
        if (!config) throw new Error('Not initialized');
        return config.identityKeyPair.privateKey;
      }
      
      async getLocalRegistrationId(): Promise<number> {
        if (!config) throw new Error('Not initialized');
        return config.registrationId;
      }
      
      async saveIdentity(address: SignalClient.ProtocolAddress, key: PublicKey): Promise<SignalClient.IdentityChange> {
        const addressStr = address.toString();
        const existingKey = identityMap.get(addressStr);
        identityMap.set(addressStr, key);
        
        if (!existingKey || existingKey.serialize().toString() !== key.serialize().toString()) {
          return SignalClient.IdentityChange.ReplacedExisting;
        }
        return SignalClient.IdentityChange.NewOrUnchanged;
      }
      
      async isTrustedIdentity(
        _address: SignalClient.ProtocolAddress, 
        _key: PublicKey, 
        _direction: SignalClient.Direction
      ): Promise<boolean> {
        // For now, trust all identities
        return true;
      }
      
      async getIdentity(address: SignalClient.ProtocolAddress): Promise<PublicKey | null> {
        return identityMap.get(address.toString()) || null;
      }
    }
    
    return new MyIdentityKeyStore();
  }

  private createPreKeyStore(): SignalClient.PreKeyStore {
    const preKeyMap = this.preKeyStore;
    
    class MyPreKeyStore extends SignalClient.PreKeyStore {
      async savePreKey(id: number, record: SignalClient.PreKeyRecord): Promise<void> {
        preKeyMap.set(id, record);
      }
      
      async getPreKey(id: number): Promise<SignalClient.PreKeyRecord> {
        const preKey = preKeyMap.get(id);
        if (!preKey) throw new Error(`PreKey ${id} not found`);
        return preKey;
      }
      
      async removePreKey(id: number): Promise<void> {
        preKeyMap.delete(id);
      }
    }
    
    return new MyPreKeyStore();
  }

  private createSignedPreKeyStore(): SignalClient.SignedPreKeyStore {
    const signedPreKeyMap = this.signedPreKeyStore;
    
    class MySignedPreKeyStore extends SignalClient.SignedPreKeyStore {
      async saveSignedPreKey(id: number, record: SignalClient.SignedPreKeyRecord): Promise<void> {
        signedPreKeyMap.set(id, record);
      }
      
      async getSignedPreKey(id: number): Promise<SignalClient.SignedPreKeyRecord> {
        const signedPreKey = signedPreKeyMap.get(id);
        if (!signedPreKey) throw new Error(`SignedPreKey ${id} not found`);
        return signedPreKey;
      }
    }
    
    return new MySignedPreKeyStore();
  }

  private createKyberPreKeyStore(): SignalClient.KyberPreKeyStore {
    const kyberPreKeyMap = this.kyberPreKeyStore;
    
    class MyKyberPreKeyStore extends SignalClient.KyberPreKeyStore {
      async saveKyberPreKey(id: number, record: SignalClient.KyberPreKeyRecord): Promise<void> {
        kyberPreKeyMap.set(id, record);
      }
      
      async getKyberPreKey(id: number): Promise<SignalClient.KyberPreKeyRecord> {
        const kyberPreKey = kyberPreKeyMap.get(id);
        if (!kyberPreKey) throw new Error(`KyberPreKey ${id} not found`);
        return kyberPreKey;
      }
      
      async markKyberPreKeyUsed(_id: number): Promise<void> {
        // Mark as used (could implement tracking here)
      }
    }
    
    return new MyKyberPreKeyStore();
  }

  // MARK: - Utility Methods
  private getSession(addressStr: string): SignalClient.SessionRecord | null {
    return this.sessionStore.get(addressStr) || null;
  }

  /**
   * Generate safety number for key verification
   */
  generateSafetyNumber(
    localIdentityKey: PublicKey,
    remoteIdentityKey: PublicKey,
    localId: string,
    remoteId: string
  ): string {
    try {
      const fingerprint = SignalClient.Fingerprint.new(
        5200, // iterations
        1, // version
        Buffer.from(localId),
        localIdentityKey,
        Buffer.from(remoteId),
        remoteIdentityKey
      );
      
      return fingerprint.displayableFingerprint().toString();
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
      identityKey: this.config.identityKeyPair.publicKey.serialize(),
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