import 'react-native-get-random-values';
import { NativeModules } from 'react-native';
import { Buffer } from 'buffer';
import * as QuickCrypto from 'react-native-quick-crypto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import E2EEService from './E2EEService';
import { getFirebaseDb, getFirebaseAuth } from '../../lib/firebase';
import { FirebaseFirestoreTypes } from '@react-native-firebase/firestore';

type Timestamp = FirebaseFirestoreTypes.Timestamp;

interface SenderKey {
  id: string;
  chainKey: string;
  chainIndex: number;
  publicKey: string;
  privateKey?: string; // Only for the owner
  createdAt: Timestamp;
  expiresAt: Timestamp;
}

interface GroupMemberKeys {
  userId: string;
  publicKey: string;
  addedAt: Timestamp;
  addedBy: string;
  isActive: boolean;
}

interface GroupSession {
  groupId: string;
  senderKeys: Map<string, SenderKey>;
  memberKeys: Map<string, GroupMemberKeys>;
  currentSenderKeyId?: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

interface GroupMessage {
  id: string;
  groupId: string;
  senderId: string;
  senderKeyId: string;
  encryptedPayloads: Map<string, string>; // userId -> encrypted message
  signature: string;
  timestamp: Timestamp;
}

export default class GroupE2EEService {
  private static instance: GroupE2EEService;
  private groupSessions: Map<string, GroupSession> = new Map();
  private readonly SENDER_KEY_ROTATION_INTERVAL = 7 * 24 * 60 * 60 * 1000; // 7 days
  private readonly MAX_CHAIN_LENGTH = 1000;

  private constructor() {}

  static getInstance(): GroupE2EEService {
    if (!GroupE2EEService.instance) {
      GroupE2EEService.instance = new GroupE2EEService();
    }
    return GroupE2EEService.instance;
  }

  /**
   * Initialize or join a group session
   */
  async initializeGroupSession(groupId: string, memberIds: string[]): Promise<void> {
    const auth = getFirebaseAuth();
    const currentUserId = auth.currentUser?.uid;
    if (!currentUserId) throw new Error('User not authenticated');

    const db = getFirebaseDb();
    const groupRef = db.collection('groups').doc(groupId);
    const sessionRef = groupRef.collection('sessions').doc('current');

    try {
      const sessionDoc = await sessionRef.get();
      
      if (!sessionDoc.exists) {
        // Create new group session
        await this.createNewGroupSession(groupId, currentUserId, memberIds);
      } else {
        // Load existing session
        await this.loadGroupSession(groupId);
      }
    } catch (error) {
      console.error('Failed to initialize group session:', error);
      throw error;
    }
  }

  /**
   * Create a new group session with initial sender key
   */
  private async createNewGroupSession(
    groupId: string, 
    creatorId: string, 
    memberIds: string[]
  ): Promise<void> {
    const db = getFirebaseDb();
    const groupRef = db.collection('groups').doc(groupId);
    const sessionRef = groupRef.collection('sessions').doc('current');

    // Generate initial sender key for the creator
    const senderKey = await this.generateSenderKey();
    
    // Get member public keys
    const memberKeys = new Map<string, GroupMemberKeys>();
    for (const memberId of memberIds) {
      const userDoc = await db.collection('users').doc(memberId).get();
      const userData = userDoc.data();
      if (userData?.publicKey) {
        memberKeys.set(memberId, {
          userId: memberId,
          publicKey: userData.publicKey,
          addedAt: Timestamp.now(),
          addedBy: creatorId,
          isActive: true
        });
      }
    }

    const session: GroupSession = {
      groupId,
      senderKeys: new Map([[senderKey.id, senderKey]]),
      memberKeys,
      currentSenderKeyId: senderKey.id,
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now()
    };

    // Save to Firestore
    await sessionRef.set({
      groupId,
      currentSenderKeyId: senderKey.id,
      createdAt: session.createdAt,
      updatedAt: session.updatedAt
    });

    // Save sender key (without private key)
    const senderKeyData = { ...senderKey };
    delete senderKeyData.privateKey;
    await sessionRef.collection('senderKeys').doc(senderKey.id).set(senderKeyData);

    // Save member keys
    for (const [userId, memberKey] of memberKeys) {
      await sessionRef.collection('members').doc(userId).set(memberKey);
    }

    // Cache locally
    this.groupSessions.set(groupId, session);

    // Store private key locally
    await this.storeSenderKeyLocally(groupId, senderKey);
  }

  /**
   * Generate a new sender key pair
   */
  private async generateSenderKey(): Promise<SenderKey> {
    const keyPair = await E2EEService.getInstance().generateKeyPair();
    const chainKey = await this.generateChainKey();
    
    return {
      id: QuickCrypto.randomUUID(),
      chainKey,
      chainIndex: 0,
      publicKey: keyPair.publicKey,
      privateKey: keyPair.privateKey,
      createdAt: Timestamp.now(),
      expiresAt: Timestamp.fromDate(new Date(Date.now() + this.SENDER_KEY_ROTATION_INTERVAL))
    };
  }

  /**
   * Generate a random chain key
   */
  private async generateChainKey(): Promise<string> {
    const randomBytes = QuickCrypto.randomBytes(32);
    return Buffer.from(randomBytes).toString('base64');
  }

  /**
   * Derive message key from chain key
   */
  private async deriveMessageKey(chainKey: string, index: number): Promise<string> {
    const data = chainKey + index.toString();
    const hash = QuickCrypto.createHash('sha256')
      .update(data)
      .digest('base64');
    return hash;
  }

  /**
   * Advance the chain key
   */
  private async advanceChainKey(chainKey: string): Promise<string> {
    const hash = QuickCrypto.createHash('sha256')
      .update(chainKey + 'advance')
      .digest('base64');
    return hash;
  }

  /**
   * Send a message to the group
   */
  async sendGroupMessage(
    groupId: string, 
    content: string,
    metadata?: Record<string, any>
  ): Promise<string> {
    const auth = getFirebaseAuth();
    const currentUserId = auth.currentUser?.uid;
    if (!currentUserId) throw new Error('User not authenticated');

    const session = this.groupSessions.get(groupId);
    if (!session) {
      await this.loadGroupSession(groupId);
      const loadedSession = this.groupSessions.get(groupId);
      if (!loadedSession) throw new Error('Group session not found');
    }

    const currentSession = this.groupSessions.get(groupId)!;
    const senderKey = currentSession.senderKeys.get(currentSession.currentSenderKeyId!);
    if (!senderKey) throw new Error('No active sender key');

    // Check if we need to rotate the sender key
    if (await this.shouldRotateSenderKey(senderKey)) {
      await this.rotateSenderKey(groupId);
    }

    // Derive message key from current chain state
    const messageKey = await this.deriveMessageKey(senderKey.chainKey, senderKey.chainIndex);
    
    // Create message payload
    const payload = {
      content,
      metadata,
      timestamp: Date.now(),
      senderId: currentUserId,
      chainIndex: senderKey.chainIndex
    };

    // Encrypt payload for each member
    const encryptedPayloads = new Map<string, string>();
    for (const [userId, memberKey] of currentSession.memberKeys) {
      if (memberKey.isActive) {
        const encrypted = await E2EEService.getInstance().encryptMessage(
          JSON.stringify(payload),
          memberKey.publicKey,
          messageKey
        );
        encryptedPayloads.set(userId, encrypted);
      }
    }

    // Sign the message
    const signature = await this.signMessage(JSON.stringify(payload), senderKey.privateKey!);

    // Create group message
    const groupMessage: GroupMessage = {
      id: QuickCrypto.randomUUID(),
      groupId,
      senderId: currentUserId,
      senderKeyId: senderKey.id,
      encryptedPayloads,
      signature,
      timestamp: Timestamp.now()
    };

    // Save to Firestore
    const db = getFirebaseDb();
    await db.collection('groups').doc(groupId)
      .collection('messages').doc(groupMessage.id)
      .set({
        ...groupMessage,
        encryptedPayloads: Object.fromEntries(encryptedPayloads)
      });

    // Advance chain key
    senderKey.chainKey = await this.advanceChainKey(senderKey.chainKey);
    senderKey.chainIndex++;
    
    // Update local session
    currentSession.senderKeys.set(senderKey.id, senderKey);
    await this.updateSenderKeyLocally(groupId, senderKey);

    return groupMessage.id;
  }

  /**
   * Decrypt a group message
   */
  async decryptGroupMessage(message: GroupMessage): Promise<any> {
    const auth = getFirebaseAuth();
    const currentUserId = auth.currentUser?.uid;
    if (!currentUserId) throw new Error('User not authenticated');

    const session = this.groupSessions.get(message.groupId);
    if (!session) {
      await this.loadGroupSession(message.groupId);
    }

    const encryptedPayload = message.encryptedPayloads.get(currentUserId);
    if (!encryptedPayload) {
      throw new Error('No encrypted payload for current user');
    }

    // Get sender's public key
    const senderKey = await this.getSenderKey(message.groupId, message.senderKeyId);
    if (!senderKey) throw new Error('Sender key not found');

    // Derive the message key used for this message
    const messageKey = await this.deriveMessageKey(senderKey.chainKey, message.chainIndex || 0);

    // Decrypt the message
    const decrypted = await E2EEService.getInstance().decryptMessage(
      encryptedPayload,
      senderKey.publicKey,
      messageKey
    );

    const payload = JSON.parse(decrypted);

    // Verify signature
    const isValid = await this.verifySignature(
      JSON.stringify(payload),
      message.signature,
      senderKey.publicKey
    );

    if (!isValid) {
      throw new Error('Invalid message signature');
    }

    return payload;
  }

  /**
   * Add a new member to the group
   */
  async addGroupMember(groupId: string, userId: string): Promise<void> {
    const auth = getFirebaseAuth();
    const currentUserId = auth.currentUser?.uid;
    if (!currentUserId) throw new Error('User not authenticated');

    const db = getFirebaseDb();
    const userDoc = await db.collection('users').doc(userId).get();
    const userData = userDoc.data();
    
    if (!userData?.publicKey) {
      throw new Error('User does not have encryption keys');
    }

    const session = this.groupSessions.get(groupId);
    if (!session) {
      await this.loadGroupSession(groupId);
    }

    const memberKey: GroupMemberKeys = {
      userId,
      publicKey: userData.publicKey,
      addedAt: Timestamp.now(),
      addedBy: currentUserId,
      isActive: true
    };

    // Update Firestore
    const sessionRef = db.collection('groups').doc(groupId)
      .collection('sessions').doc('current');
    await sessionRef.collection('members').doc(userId).set(memberKey);

    // Update local cache
    if (session) {
      session.memberKeys.set(userId, memberKey);
    }

    // Trigger sender key rotation for forward secrecy
    await this.rotateSenderKey(groupId);
  }

  /**
   * Remove a member from the group
   */
  async removeGroupMember(groupId: string, userId: string): Promise<void> {
    const db = getFirebaseDb();
    const sessionRef = db.collection('groups').doc(groupId)
      .collection('sessions').doc('current');

    // Mark member as inactive
    await sessionRef.collection('members').doc(userId).update({
      isActive: false,
      removedAt: Timestamp.now()
    });

    // Update local cache
    const session = this.groupSessions.get(groupId);
    if (session) {
      const memberKey = session.memberKeys.get(userId);
      if (memberKey) {
        memberKey.isActive = false;
      }
    }

    // Trigger sender key rotation for forward secrecy
    await this.rotateSenderKey(groupId);
  }

  /**
   * Rotate sender key for the group
   */
  private async rotateSenderKey(groupId: string): Promise<void> {
    const auth = getFirebaseAuth();
    const currentUserId = auth.currentUser?.uid;
    if (!currentUserId) throw new Error('User not authenticated');

    const session = this.groupSessions.get(groupId);
    if (!session) throw new Error('Group session not found');

    // Generate new sender key
    const newSenderKey = await this.generateSenderKey();

    // Update session
    session.senderKeys.set(newSenderKey.id, newSenderKey);
    session.currentSenderKeyId = newSenderKey.id;
    session.updatedAt = Timestamp.now();

    // Save to Firestore
    const db = getFirebaseDb();
    const sessionRef = db.collection('groups').doc(groupId)
      .collection('sessions').doc('current');

    await sessionRef.update({
      currentSenderKeyId: newSenderKey.id,
      updatedAt: session.updatedAt
    });

    // Save new sender key (without private key)
    const senderKeyData = { ...newSenderKey };
    delete senderKeyData.privateKey;
    await sessionRef.collection('senderKeys').doc(newSenderKey.id).set(senderKeyData);

    // Store private key locally
    await this.storeSenderKeyLocally(groupId, newSenderKey);
  }

  /**
   * Check if sender key should be rotated
   */
  private async shouldRotateSenderKey(senderKey: SenderKey): Promise<boolean> {
    // Check expiration
    if (senderKey.expiresAt.toDate() < new Date()) {
      return true;
    }

    // Check chain length
    if (senderKey.chainIndex >= this.MAX_CHAIN_LENGTH) {
      return true;
    }

    return false;
  }

  /**
   * Load group session from Firestore
   */
  private async loadGroupSession(groupId: string): Promise<void> {
    const db = getFirebaseDb();
    const sessionRef = db.collection('groups').doc(groupId)
      .collection('sessions').doc('current');

    const sessionDoc = await sessionRef.get();
    if (!sessionDoc.exists) {
      throw new Error('Group session not found');
    }

    const sessionData = sessionDoc.data()!;

    // Load sender keys
    const senderKeysSnapshot = await sessionRef.collection('senderKeys').get();
    const senderKeys = new Map<string, SenderKey>();
    
    for (const doc of senderKeysSnapshot.docs) {
      const senderKey = doc.data() as SenderKey;
      // Load private key from local storage if available
      const localKey = await this.loadSenderKeyLocally(groupId, senderKey.id);
      if (localKey) {
        senderKey.privateKey = localKey.privateKey;
      }
      senderKeys.set(doc.id, senderKey);
    }

    // Load member keys
    const membersSnapshot = await sessionRef.collection('members')
      .where('isActive', '==', true).get();
    const memberKeys = new Map<string, GroupMemberKeys>();
    
    for (const doc of membersSnapshot.docs) {
      memberKeys.set(doc.id, doc.data() as GroupMemberKeys);
    }

    const session: GroupSession = {
      groupId,
      senderKeys,
      memberKeys,
      currentSenderKeyId: sessionData.currentSenderKeyId,
      createdAt: sessionData.createdAt,
      updatedAt: sessionData.updatedAt
    };

    this.groupSessions.set(groupId, session);
  }

  /**
   * Get a specific sender key
   */
  private async getSenderKey(groupId: string, senderKeyId: string): Promise<SenderKey | null> {
    const session = this.groupSessions.get(groupId);
    if (session?.senderKeys.has(senderKeyId)) {
      return session.senderKeys.get(senderKeyId)!;
    }

    // Load from Firestore if not in cache
    const db = getFirebaseDb();
    const senderKeyDoc = await db.collection('groups').doc(groupId)
      .collection('sessions').doc('current')
      .collection('senderKeys').doc(senderKeyId).get();

    if (senderKeyDoc.exists) {
      return senderKeyDoc.data() as SenderKey;
    }

    return null;
  }

  /**
   * Store sender key locally (encrypted)
   */
  private async storeSenderKeyLocally(groupId: string, senderKey: SenderKey): Promise<void> {
    try {
      const key = `group_sender_key_${groupId}_${senderKey.id}`;
      const encryptedData = await E2EEService.getInstance().encryptForLocalStorage(
        JSON.stringify(senderKey)
      );
      await AsyncStorage.setItem(key, encryptedData);
    } catch (error) {
      console.error('Failed to store sender key locally:', error);
      throw error;
    }
  }

  /**
   * Load sender key from local storage
   */
  private async loadSenderKeyLocally(groupId: string, senderKeyId: string): Promise<SenderKey | null> {
    try {
      const key = `group_sender_key_${groupId}_${senderKeyId}`;
      const encryptedData = await AsyncStorage.getItem(key);
      if (!encryptedData) return null;
      
      const decryptedData = await E2EEService.getInstance().decryptFromLocalStorage(encryptedData);
      return JSON.parse(decryptedData) as SenderKey;
    } catch (error) {
      console.error('Failed to load sender key locally:', error);
      return null;
    }
  }

  /**
   * Update sender key in local storage
   */
  private async updateSenderKeyLocally(groupId: string, senderKey: SenderKey): Promise<void> {
    await this.storeSenderKeyLocally(groupId, senderKey);
  }

  /**
   * Sign a message
   */
  private async signMessage(message: string, privateKey: string): Promise<string> {
    // Use private key to sign message
    const hash = QuickCrypto.createHash('sha256')
      .update(message + privateKey)
      .digest('base64');
    return hash;
  }

  /**
   * Verify message signature
   */
  private async verifySignature(message: string, signature: string, publicKey: string): Promise<boolean> {
    try {
      // Verify using HMAC for now (in production, use proper signature verification)
      const expectedSignature = QuickCrypto.createHash('sha256')
        .update(message + publicKey)
        .digest('base64');
      return signature === expectedSignature;
    } catch (error) {
      console.error('Failed to verify signature:', error);
      return false;
    }
  }

  /**
   * Clear all cached sessions
   */
  clearCache(): void {
    this.groupSessions.clear();
  }
}