import 'react-native-get-random-values';
import { Buffer } from 'buffer';
import * as QuickCrypto from 'react-native-quick-crypto';
import { E2EEService } from './E2EEService';
// import { getFirebaseDb, getFirebaseAuth } from '../../lib/firebase';
import { FirebaseFirestoreTypes } from '@react-native-firebase/firestore';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { logger } from '../LoggingService';

type Timestamp = FirebaseFirestoreTypes.Timestamp;

interface ChainKey {
  key: string;
  index: number;
}

interface MessageKeys {
  encryption: string;
  mac: string;
  iv: string;
}

interface SkippedMessageKey {
  messageKey: MessageKeys;
  timestamp: number;
}

interface RatchetHeader {
  dh: string; // Current DH public key
  pn: number; // Previous chain length
  n: number;  // Message number in current chain
}

interface Session {
  sessionId: string;
  rootKey: string;
  sendingChainKey: ChainKey;
  receivingChainKey?: ChainKey;
  sendingRatchetKey: {
    public: string;
    private: string;
  };
  receivingRatchetKey?: string;
  previousCounter: number;
  messagesSent: number;
  messagesReceived: number;
  skippedMessageKeys: Map<string, SkippedMessageKey>;
  createdAt: Timestamp;
  lastActivity: Timestamp;
}

interface DoubleRatchetMessage {
  header: RatchetHeader;
  ciphertext: string;
  mac: string;
}

export default class DoubleRatchetService {
  private static instance: DoubleRatchetService;
  private sessions: Map<string, Session> = new Map();
  private readonly MAX_SKIP = 1000;
  private readonly MAX_STORED_MESSAGE_KEYS = 2000;
  private readonly MESSAGE_KEY_LIFETIME = 7 * 24 * 60 * 60 * 1000; // 7 days
  private readonly KDF_INFO = {
    rootKey: 'Dynasty Root Key',
    chainKey: 'Dynasty Chain Key',
    messageKey: 'Dynasty Message Keys'
  };

  private constructor() {
    this.loadSessionsFromStorage();
    this.startCleanupTimer();
  }

  static getInstance(): DoubleRatchetService {
    if (!DoubleRatchetService.instance) {
      DoubleRatchetService.instance = new DoubleRatchetService();
    }
    return DoubleRatchetService.instance;
  }

  /**
   * Initialize a new Double Ratchet session (Alice)
   */
  async initializeSession(
    sessionId: string,
    bobPublicKey: string,
    sharedPreKey?: string
  ): Promise<void> {
    try {
      // Generate ephemeral key pair
      const ephemeralKeyPair = await E2EEService.getInstance().generateKeyPair();
      
      // Perform X3DH if no shared pre-key
      let sharedSecret: string;
      if (sharedPreKey) {
        sharedSecret = sharedPreKey;
      } else {
        sharedSecret = await this.performX3DH(
          ephemeralKeyPair,
          bobPublicKey
        );
      }

      // Initialize root key
      const rootKey = await this.kdfRootKey(sharedSecret);

      // Initialize sending chain
      const sendingChainKey = await this.kdfChainKey(rootKey);

      const session: Session = {
        sessionId,
        rootKey,
        sendingChainKey: {
          key: sendingChainKey,
          index: 0
        },
        sendingRatchetKey: ephemeralKeyPair,
        previousCounter: 0,
        messagesSent: 0,
        messagesReceived: 0,
        skippedMessageKeys: new Map(),
        createdAt: Timestamp.now(),
        lastActivity: Timestamp.now()
      };

      this.sessions.set(sessionId, session);
      await this.saveSessionToStorage(sessionId, session);
    } catch (error) {
      logger.error('Failed to initialize session:', error);
      throw error;
    }
  }

  /**
   * Accept a Double Ratchet session (Bob)
   */
  async acceptSession(
    sessionId: string,
    alicePublicKey: string,
    sharedPreKey?: string
  ): Promise<void> {
    try {
      // Generate ephemeral key pair
      const ephemeralKeyPair = await E2EEService.getInstance().generateKeyPair();
      
      // Perform X3DH if no shared pre-key
      let sharedSecret: string;
      if (sharedPreKey) {
        sharedSecret = sharedPreKey;
      } else {
        sharedSecret = await this.performX3DH(
          ephemeralKeyPair,
          alicePublicKey
        );
      }

      // Initialize root key
      const rootKey = await this.kdfRootKey(sharedSecret);

      // Derive receiving chain key
      const { newRootKey, chainKey } = await this.kdfRatchet(
        rootKey,
        alicePublicKey
      );

      const session: Session = {
        sessionId,
        rootKey: newRootKey,
        receivingChainKey: {
          key: chainKey,
          index: 0
        },
        sendingRatchetKey: ephemeralKeyPair,
        receivingRatchetKey: alicePublicKey,
        sendingChainKey: {
          key: '',
          index: 0
        },
        previousCounter: 0,
        messagesSent: 0,
        messagesReceived: 0,
        skippedMessageKeys: new Map(),
        createdAt: Timestamp.now(),
        lastActivity: Timestamp.now()
      };

      this.sessions.set(sessionId, session);
      await this.saveSessionToStorage(sessionId, session);
    } catch (error) {
      logger.error('Failed to accept session:', error);
      throw error;
    }
  }

  /**
   * Encrypt a message using Double Ratchet
   */
  async encryptMessage(sessionId: string, plaintext: string): Promise<DoubleRatchetMessage> {
    const session = this.sessions.get(sessionId);
    if (!session) throw new Error('Session not found');

    try {
      // Generate message keys
      const messageKeys = await this.generateMessageKeys(session.sendingChainKey);

      // Update chain key
      session.sendingChainKey = await this.advanceChainKey(session.sendingChainKey);

      // Create header
      const header: RatchetHeader = {
        dh: session.sendingRatchetKey.public,
        pn: session.previousCounter,
        n: session.messagesSent
      };

      // Encrypt message
      const ciphertext = await this.encryptWithMessageKeys(plaintext, messageKeys);

      // Create MAC
      const mac = await this.createMAC(header, ciphertext, messageKeys.mac);

      // Update session
      session.messagesSent++;
      session.lastActivity = Timestamp.now();
      await this.saveSessionToStorage(sessionId, session);

      return {
        header,
        ciphertext,
        mac
      };
    } catch (error) {
      logger.error('Failed to encrypt message:', error);
      throw error;
    }
  }

  /**
   * Decrypt a message using Double Ratchet
   */
  async decryptMessage(sessionId: string, message: DoubleRatchetMessage): Promise<string> {
    const session = this.sessions.get(sessionId);
    if (!session) throw new Error('Session not found');

    try {
      // Check if we need to perform a DH ratchet
      if (message.header.dh !== session.receivingRatchetKey) {
        await this.dhRatchet(session, message.header);
      }

      // Check for skipped messages
      const messageKeyId = `${message.header.dh}-${message.header.n}`;
      const skippedKey = session.skippedMessageKeys.get(messageKeyId);
      
      if (skippedKey) {
        // Use skipped message key
        const plaintext = await this.decryptWithMessageKeys(
          message.ciphertext,
          skippedKey.messageKey
        );
        
        // Verify MAC
        const isValid = await this.verifyMAC(
          message.header,
          message.ciphertext,
          message.mac,
          skippedKey.messageKey.mac
        );
        
        if (!isValid) throw new Error('Invalid MAC');
        
        // Remove used key
        session.skippedMessageKeys.delete(messageKeyId);
        await this.saveSessionToStorage(sessionId, session);
        
        return plaintext;
      }

      // Skip messages if needed
      if (message.header.n > session.messagesReceived) {
        await this.skipMessageKeys(
          session,
          session.messagesReceived,
          message.header.n - 1,
          session.receivingChainKey!
        );
      }

      // Generate message keys
      const messageKeys = await this.generateMessageKeys(session.receivingChainKey!);

      // Verify MAC
      const isValid = await this.verifyMAC(
        message.header,
        message.ciphertext,
        message.mac,
        messageKeys.mac
      );
      
      if (!isValid) throw new Error('Invalid MAC');

      // Decrypt message
      const plaintext = await this.decryptWithMessageKeys(
        message.ciphertext,
        messageKeys
      );

      // Update chain key
      session.receivingChainKey = await this.advanceChainKey(session.receivingChainKey!);
      session.messagesReceived = message.header.n + 1;
      session.lastActivity = Timestamp.now();
      
      await this.saveSessionToStorage(sessionId, session);

      return plaintext;
    } catch (error) {
      logger.error('Failed to decrypt message:', error);
      throw error;
    }
  }

  /**
   * Perform DH ratchet step
   */
  private async dhRatchet(session: Session, header: RatchetHeader): Promise<void> {
    // Store current sending chain length
    session.previousCounter = session.messagesSent;
    session.messagesSent = 0;
    session.messagesReceived = 0;

    // Generate new DH key pair
    const newKeyPair = await E2EEService.getInstance().generateKeyPair();

    // Update receiving ratchet
    session.receivingRatchetKey = header.dh;
    const { newRootKey: rootKey1, chainKey: newReceivingChain } = await this.kdfRatchet(
      session.rootKey,
      header.dh
    );
    session.receivingChainKey = {
      key: newReceivingChain,
      index: 0
    };

    // Update sending ratchet
    session.sendingRatchetKey = newKeyPair;
    const { newRootKey: rootKey2, chainKey: newSendingChain } = await this.kdfRatchet(
      rootKey1,
      newKeyPair.public
    );
    session.rootKey = rootKey2;
    session.sendingChainKey = {
      key: newSendingChain,
      index: 0
    };
  }

  /**
   * Skip and store message keys
   */
  private async skipMessageKeys(
    session: Session,
    from: number,
    to: number,
    chainKey: ChainKey
  ): Promise<void> {
    if (to - from > this.MAX_SKIP) {
      throw new Error('Too many messages to skip');
    }

    let currentChainKey = { ...chainKey };
    
    for (let i = from; i <= to; i++) {
      const messageKeys = await this.generateMessageKeys(currentChainKey);
      const keyId = `${session.receivingRatchetKey}-${i}`;
      
      session.skippedMessageKeys.set(keyId, {
        messageKey: messageKeys,
        timestamp: Date.now()
      });

      currentChainKey = await this.advanceChainKey(currentChainKey);
    }

    // Clean up old keys
    this.cleanupSkippedKeys(session);
  }

  /**
   * Clean up old skipped keys
   */
  private cleanupSkippedKeys(session: Session): void {
    const now = Date.now();
    const keysToDelete: string[] = [];

    // Remove expired keys
    session.skippedMessageKeys.forEach((value, key) => {
      if (now - value.timestamp > this.MESSAGE_KEY_LIFETIME) {
        keysToDelete.push(key);
      }
    });

    keysToDelete.forEach(key => session.skippedMessageKeys.delete(key));

    // Limit total stored keys
    if (session.skippedMessageKeys.size > this.MAX_STORED_MESSAGE_KEYS) {
      const sortedKeys = Array.from(session.skippedMessageKeys.entries())
        .sort((a, b) => a[1].timestamp - b[1].timestamp);
      
      const toRemove = sortedKeys.slice(
        0,
        session.skippedMessageKeys.size - this.MAX_STORED_MESSAGE_KEYS
      );
      
      toRemove.forEach(([key]) => session.skippedMessageKeys.delete(key));
    }
  }

  /**
   * Perform X3DH key agreement
   */
  private async performX3DH(
    ephemeralKeyPair: { publicKey: string; privateKey: string },
    recipientPublicKey: string
  ): Promise<string> {
    // Simplified X3DH - in production would use proper curve25519
    const sharedSecret = QuickCrypto.createHash('sha256')
      .update(ephemeralKeyPair.privateKey + recipientPublicKey)
      .digest('base64');
    return sharedSecret;
  }

  /**
   * KDF for root key
   */
  private async kdfRootKey(input: string): Promise<string> {
    const data = input + this.KDF_INFO.rootKey;
    const hash = QuickCrypto.createHash('sha256')
      .update(data)
      .digest('base64');
    return hash;
  }

  /**
   * KDF for chain key
   */
  private async kdfChainKey(input: string): Promise<string> {
    const data = input + this.KDF_INFO.chainKey;
    const hash = QuickCrypto.createHash('sha256')
      .update(data)
      .digest('base64');
    return hash;
  }

  /**
   * KDF for ratchet step
   */
  private async kdfRatchet(
    rootKey: string,
    dhOutput: string
  ): Promise<{ newRootKey: string; chainKey: string }> {
    const combined = rootKey + dhOutput;
    
    const newRootKey = QuickCrypto.createHash('sha256')
      .update(combined + '0')
      .digest('base64');
    
    const chainKey = QuickCrypto.createHash('sha256')
      .update(combined + '1')
      .digest('base64');
    
    return { newRootKey, chainKey };
  }

  /**
   * Generate message keys from chain key
   */
  private async generateMessageKeys(chainKey: ChainKey): Promise<MessageKeys> {
    const baseKey = chainKey.key + chainKey.index.toString();
    
    const encryption = QuickCrypto.createHash('sha256')
      .update(baseKey + 'encryption')
      .digest('base64');
    
    const mac = QuickCrypto.createHash('sha256')
      .update(baseKey + 'mac')
      .digest('base64');
    
    const ivBytes = QuickCrypto.randomBytes(16);
    const iv = Buffer.from(ivBytes).toString('base64');
    
    return { encryption, mac, iv };
  }

  /**
   * Advance chain key
   */
  private async advanceChainKey(chainKey: ChainKey): Promise<ChainKey> {
    const newKey = QuickCrypto.createHash('sha256')
      .update(chainKey.key + 'advance')
      .digest('base64');
    
    return {
      key: newKey,
      index: chainKey.index + 1
    };
  }

  /**
   * Encrypt with message keys
   */
  private async encryptWithMessageKeys(
    plaintext: string,
    messageKeys: MessageKeys
  ): Promise<string> {
    try {
      const key = Buffer.from(messageKeys.encryption, 'base64').slice(0, 32);
      const iv = Buffer.from(messageKeys.iv, 'base64');
      
      const cipher = QuickCrypto.createCipheriv('aes-256-gcm', key, iv);
      const encrypted = Buffer.concat([
        cipher.update(Buffer.from(plaintext, 'utf8')),
        cipher.final()
      ]);
      
      const tag = cipher.getAuthTag();
      return Buffer.concat([tag, encrypted]).toString('base64');
    } catch (error) {
      logger.error('Failed to encrypt with message keys:', error);
      throw error;
    }
  }

  /**
   * Decrypt with message keys
   */
  private async decryptWithMessageKeys(
    ciphertext: string,
    messageKeys: MessageKeys
  ): Promise<string> {
    try {
      const data = Buffer.from(ciphertext, 'base64');
      const tag = data.slice(0, 16);
      const encrypted = data.slice(16);
      
      const key = Buffer.from(messageKeys.encryption, 'base64').slice(0, 32);
      const iv = Buffer.from(messageKeys.iv, 'base64');
      
      const decipher = QuickCrypto.createDecipheriv('aes-256-gcm', key, iv);
      decipher.setAuthTag(tag);
      
      const decrypted = Buffer.concat([
        decipher.update(encrypted),
        decipher.final()
      ]);
      
      return decrypted.toString('utf8');
    } catch (error) {
      logger.error('Failed to decrypt with message keys:', error);
      throw error;
    }
  }

  /**
   * Create MAC
   */
  private async createMAC(
    header: RatchetHeader,
    ciphertext: string,
    macKey: string
  ): Promise<string> {
    const data = JSON.stringify(header) + ciphertext;
    const mac = QuickCrypto.createHash('sha256')
      .update(data + macKey)
      .digest('base64');
    return mac;
  }

  /**
   * Verify MAC
   */
  private async verifyMAC(
    header: RatchetHeader,
    ciphertext: string,
    mac: string,
    macKey: string
  ): Promise<boolean> {
    const expectedMac = await this.createMAC(header, ciphertext, macKey);
    return mac === expectedMac;
  }

  /**
   * Save session to storage
   */
  private async saveSessionToStorage(sessionId: string, session: Session): Promise<void> {
    try {
      const sessionData = {
        ...session,
        skippedMessageKeys: Object.fromEntries(session.skippedMessageKeys)
      };
      
      await AsyncStorage.setItem(
        `dr_session_${sessionId}`,
        JSON.stringify(sessionData)
      );
    } catch (error) {
      logger.error('Failed to save session:', error);
    }
  }

  /**
   * Load sessions from storage
   */
  private async loadSessionsFromStorage(): Promise<void> {
    try {
      const keys = await AsyncStorage.getAllKeys();
      const sessionKeys = keys.filter(k => k.startsWith('dr_session_'));
      
      for (const key of sessionKeys) {
        const data = await AsyncStorage.getItem(key);
        if (data) {
          const sessionData = JSON.parse(data);
          const session: Session = {
            ...sessionData,
            skippedMessageKeys: new Map(Object.entries(sessionData.skippedMessageKeys))
          };
          const sessionId = key.replace('dr_session_', '');
          this.sessions.set(sessionId, session);
        }
      }
    } catch (error) {
      logger.error('Failed to load sessions:', error);
    }
  }

  /**
   * Start cleanup timer
   */
  private startCleanupTimer(): void {
    setInterval(() => {
      this.sessions.forEach((session, sessionId) => {
        this.cleanupSkippedKeys(session);
        this.saveSessionToStorage(sessionId, session);
      });
    }, 60 * 60 * 1000); // Every hour
  }

  /**
   * Delete session
   */
  async deleteSession(sessionId: string): Promise<void> {
    this.sessions.delete(sessionId);
    await AsyncStorage.removeItem(`dr_session_${sessionId}`);
  }

  /**
   * Get session info
   */
  getSessionInfo(sessionId: string): Session | undefined {
    return this.sessions.get(sessionId);
  }

  /**
   * Export session for backup
   */
  async exportSession(sessionId: string): Promise<string> {
    const session = this.sessions.get(sessionId);
    if (!session) throw new Error('Session not found');
    
    const exportData = {
      ...session,
      skippedMessageKeys: Object.fromEntries(session.skippedMessageKeys),
      exportedAt: new Date().toISOString()
    };
    
    return Buffer.from(JSON.stringify(exportData)).toString('base64');
  }

  /**
   * Import session from backup
   */
  async importSession(sessionId: string, exportData: string): Promise<void> {
    try {
      const data = JSON.parse(Buffer.from(exportData, 'base64').toString());
      const session: Session = {
        ...data,
        skippedMessageKeys: new Map(Object.entries(data.skippedMessageKeys))
      };
      
      this.sessions.set(sessionId, session);
      await this.saveSessionToStorage(sessionId, session);
    } catch (error) {
      logger.error('Failed to import session:', error);
      throw error;
    }
  }
}