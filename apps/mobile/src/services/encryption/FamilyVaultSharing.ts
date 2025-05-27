/**
 * FamilyVaultSharing - Secure file sharing between family members
 * 
 * Implements secure sharing of encrypted vault files using:
 * - Key wrapping with recipient's public key (crypto_box)
 * - Per-file sharing keys
 * - Access control (read/write permissions)
 * - Share revocation
 * - Audit trail
 */

import Sodium from 'react-native-libsodium';
import { FirebaseFirestoreTypes } from '@react-native-firebase/firestore';
import { logger } from '../LoggingService';
import { getFirebaseDb } from '../../lib/firebase';
import { callFirebaseFunction, normalizeError } from '../../lib/errorUtils';

// Constants
const VAULT_SHARES_COLLECTION = 'vault_shares';
const MAX_SHARE_RECIPIENTS = 50;
const SHARE_EXPIRY_DAYS = 90; // Default share expiry

// Types
export interface SharePermissions {
  read: boolean;
  write: boolean;
  reshare: boolean;
}

export interface VaultShare {
  id: string;
  fileId: string;
  ownerId: string;
  recipientId: string;
  permissions: SharePermissions;
  encryptedFileKey: {
    ciphertext: string; // Base64
    nonce: string; // Base64
    senderPublicKey: string; // Base64
  };
  status: 'pending' | 'active' | 'revoked' | 'expired';
  createdAt: FirebaseFirestoreTypes.Timestamp;
  expiresAt?: FirebaseFirestoreTypes.Timestamp;
  acceptedAt?: FirebaseFirestoreTypes.Timestamp;
  revokedAt?: FirebaseFirestoreTypes.Timestamp;
  metadata?: {
    fileName?: string;
    fileSize?: number;
    message?: string;
  };
}

export interface ShareRequest {
  shareId: string;
  recipientEmail: string;
  recipientName?: string;
  message?: string;
}

export interface ShareAcceptResult {
  success: boolean;
  fileKey?: Uint8Array;
  error?: string;
}

export interface SharingStats {
  totalShares: number;
  activeShares: number;
  pendingShares: number;
  sharedWithMe: number;
  sharedByMe: number;
}

export class FamilyVaultSharing {
  private static instance: FamilyVaultSharing;
  private sodium: typeof Sodium;
  private db: FirebaseFirestoreTypes.Module;
  private userKeyPair: {
    publicKey: Uint8Array;
    secretKey: Uint8Array;
  } | null = null;
  private currentUserId: string | null = null;
  private isInitialized = false;

  private constructor() {
    this.sodium = Sodium;
    this.db = getFirebaseDb();
  }

  static getInstance(): FamilyVaultSharing {
    if (!FamilyVaultSharing.instance) {
      FamilyVaultSharing.instance = new FamilyVaultSharing();
    }
    return FamilyVaultSharing.instance;
  }

  /**
   * Initialize sharing service with user's key pair
   */
  async initialize(userId: string): Promise<void> {
    if (this.isInitialized && this.currentUserId === userId) return;

    try {
      await this.sodium.ready;
      this.currentUserId = userId;

      // Load or generate user's sharing key pair
      this.userKeyPair = await this.loadOrGenerateKeyPair(userId);
      
      // Publish public key to user profile
      await this.publishPublicKey(userId, this.userKeyPair.publicKey);

      this.isInitialized = true;
      logger.info('FamilyVaultSharing: Initialized successfully');
    } catch (error) {
      logger.error('FamilyVaultSharing: Initialization failed', error);
      throw new Error('Failed to initialize sharing service');
    }
  }

  /**
   * Share a vault file with a family member
   */
  async shareFile(
    fileId: string,
    fileKey: Uint8Array,
    recipientId: string,
    permissions: Partial<SharePermissions> = { read: true },
    options: {
      expiryDays?: number;
      message?: string;
      fileName?: string;
      fileSize?: number;
    } = {}
  ): Promise<VaultShare> {
    if (!this.userKeyPair || !this.currentUserId) {
      throw new Error('Sharing service not initialized');
    }

    try {
      // Get recipient's public key
      const recipientPublicKey = await this.fetchUserPublicKey(recipientId);
      if (!recipientPublicKey) {
        throw new Error('Recipient public key not found');
      }

      // Generate nonce
      const nonce = this.sodium.randombytes_buf(this.sodium.crypto_box_NONCEBYTES);

      // Encrypt file key for recipient
      const encryptedFileKey = this.sodium.crypto_box_easy(
        fileKey,
        nonce,
        recipientPublicKey,
        this.userKeyPair.secretKey
      );

      // Calculate expiry
      const expiresAt = options.expiryDays
        ? new Date(Date.now() + options.expiryDays * 24 * 60 * 60 * 1000)
        : new Date(Date.now() + SHARE_EXPIRY_DAYS * 24 * 60 * 60 * 1000);

      // Create share document
      const shareData = {
        fileId,
        ownerId: this.currentUserId,
        recipientId,
        permissions: {
          read: permissions.read ?? true,
          write: permissions.write ?? false,
          reshare: permissions.reshare ?? false
        },
        encryptedFileKey: {
          ciphertext: this.sodium.to_base64(encryptedFileKey),
          nonce: this.sodium.to_base64(nonce),
          senderPublicKey: this.sodium.to_base64(this.userKeyPair.publicKey)
        },
        status: 'pending' as const,
        createdAt: FirebaseFirestoreTypes.Timestamp.now(),
        expiresAt: FirebaseFirestoreTypes.Timestamp.fromDate(expiresAt),
        metadata: {
          fileName: options.fileName,
          fileSize: options.fileSize,
          message: options.message
        }
      };

      // Save to Firestore
      const shareRef = await this.db
        .collection(VAULT_SHARES_COLLECTION)
        .add(shareData);

      const share: VaultShare = {
        id: shareRef.id,
        ...shareData
      };

      // Send notification to recipient
      await this.sendShareNotification(recipientId, share);

      logger.info(`FamilyVaultSharing: Shared file ${fileId} with ${recipientId}`);
      return share;

    } catch (error) {
      logger.error('FamilyVaultSharing: Failed to share file', error);
      throw normalizeError(error);
    }
  }

  /**
   * Accept a shared file
   */
  async acceptShare(shareId: string): Promise<ShareAcceptResult> {
    if (!this.userKeyPair || !this.currentUserId) {
      throw new Error('Sharing service not initialized');
    }

    try {
      // Fetch share document
      const shareDoc = await this.db
        .collection(VAULT_SHARES_COLLECTION)
        .doc(shareId)
        .get();

      if (!shareDoc.exists) {
        return { success: false, error: 'Share not found' };
      }

      const share = shareDoc.data() as VaultShare;

      // Verify recipient
      if (share.recipientId !== this.currentUserId) {
        return { success: false, error: 'Not authorized to accept this share' };
      }

      // Check status
      if (share.status !== 'pending') {
        return { success: false, error: `Share is ${share.status}` };
      }

      // Check expiry
      if (share.expiresAt && share.expiresAt.toDate() < new Date()) {
        await this.updateShareStatus(shareId, 'expired');
        return { success: false, error: 'Share has expired' };
      }

      // Decrypt file key
      const encryptedFileKey = this.sodium.from_base64(share.encryptedFileKey.ciphertext);
      const nonce = this.sodium.from_base64(share.encryptedFileKey.nonce);
      const senderPublicKey = this.sodium.from_base64(share.encryptedFileKey.senderPublicKey);

      const fileKey = this.sodium.crypto_box_open_easy(
        encryptedFileKey,
        nonce,
        senderPublicKey,
        this.userKeyPair.secretKey
      );

      // Update share status
      await shareDoc.ref.update({
        status: 'active',
        acceptedAt: FirebaseFirestoreTypes.Timestamp.now()
      });

      // Create access record for recipient
      await this.createAccessRecord(share.fileId, this.currentUserId, share.permissions);

      logger.info(`FamilyVaultSharing: Accepted share ${shareId}`);
      return { success: true, fileKey };

    } catch (error) {
      logger.error('FamilyVaultSharing: Failed to accept share', error);
      return { success: false, error: normalizeError(error).message };
    }
  }

  /**
   * Revoke a shared file
   */
  async revokeShare(shareId: string): Promise<void> {
    if (!this.currentUserId) {
      throw new Error('Sharing service not initialized');
    }

    try {
      const shareDoc = await this.db
        .collection(VAULT_SHARES_COLLECTION)
        .doc(shareId)
        .get();

      if (!shareDoc.exists) {
        throw new Error('Share not found');
      }

      const share = shareDoc.data() as VaultShare;

      // Verify owner
      if (share.ownerId !== this.currentUserId) {
        throw new Error('Not authorized to revoke this share');
      }

      // Update status
      await shareDoc.ref.update({
        status: 'revoked',
        revokedAt: FirebaseFirestoreTypes.Timestamp.now()
      });

      // Remove access record
      await this.removeAccessRecord(share.fileId, share.recipientId);

      // Notify recipient
      await this.sendRevokeNotification(share.recipientId, share);

      logger.info(`FamilyVaultSharing: Revoked share ${shareId}`);
    } catch (error) {
      logger.error('FamilyVaultSharing: Failed to revoke share', error);
      throw normalizeError(error);
    }
  }

  /**
   * Get all shares for current user
   */
  async getMyShares(type: 'shared-by-me' | 'shared-with-me' = 'shared-with-me'): Promise<VaultShare[]> {
    if (!this.currentUserId) {
      throw new Error('Sharing service not initialized');
    }

    try {
      const field = type === 'shared-by-me' ? 'ownerId' : 'recipientId';
      
      const snapshot = await this.db
        .collection(VAULT_SHARES_COLLECTION)
        .where(field, '==', this.currentUserId)
        .where('status', 'in', ['pending', 'active'])
        .orderBy('createdAt', 'desc')
        .get();

      const shares: VaultShare[] = [];
      
      for (const doc of snapshot.docs) {
        const data = doc.data();
        
        // Check expiry
        if (data.expiresAt && data.expiresAt.toDate() < new Date()) {
          await this.updateShareStatus(doc.id, 'expired');
          continue;
        }
        
        shares.push({
          id: doc.id,
          ...data
        } as VaultShare);
      }

      return shares;
    } catch (error) {
      logger.error('FamilyVaultSharing: Failed to get shares', error);
      throw normalizeError(error);
    }
  }

  /**
   * Get shares for a specific file
   */
  async getFileShares(fileId: string): Promise<VaultShare[]> {
    if (!this.currentUserId) {
      throw new Error('Sharing service not initialized');
    }

    try {
      const snapshot = await this.db
        .collection(VAULT_SHARES_COLLECTION)
        .where('fileId', '==', fileId)
        .where('ownerId', '==', this.currentUserId)
        .where('status', 'in', ['pending', 'active'])
        .get();

      return snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      } as VaultShare));

    } catch (error) {
      logger.error('FamilyVaultSharing: Failed to get file shares', error);
      throw normalizeError(error);
    }
  }

  /**
   * Check if user has access to a file
   */
  async checkAccess(fileId: string, userId: string): Promise<SharePermissions | null> {
    try {
      // Check if user is owner
      const fileDoc = await this.db
        .collection('vault')
        .doc(fileId)
        .get();

      if (fileDoc.exists && fileDoc.data()?.userId === userId) {
        return { read: true, write: true, reshare: true };
      }

      // Check active shares
      const shareSnapshot = await this.db
        .collection(VAULT_SHARES_COLLECTION)
        .where('fileId', '==', fileId)
        .where('recipientId', '==', userId)
        .where('status', '==', 'active')
        .limit(1)
        .get();

      if (!shareSnapshot.empty) {
        const share = shareSnapshot.docs[0].data() as VaultShare;
        
        // Check expiry
        if (share.expiresAt && share.expiresAt.toDate() < new Date()) {
          await this.updateShareStatus(shareSnapshot.docs[0].id, 'expired');
          return null;
        }
        
        return share.permissions;
      }

      return null;
    } catch (error) {
      logger.error('FamilyVaultSharing: Failed to check access', error);
      return null;
    }
  }

  /**
   * Get sharing statistics
   */
  async getSharingStats(): Promise<SharingStats> {
    if (!this.currentUserId) {
      throw new Error('Sharing service not initialized');
    }

    try {
      const [sharedByMe, sharedWithMe] = await Promise.all([
        this.db
          .collection(VAULT_SHARES_COLLECTION)
          .where('ownerId', '==', this.currentUserId)
          .get(),
        this.db
          .collection(VAULT_SHARES_COLLECTION)
          .where('recipientId', '==', this.currentUserId)
          .get()
      ]);

      const stats: SharingStats = {
        totalShares: sharedByMe.size + sharedWithMe.size,
        activeShares: 0,
        pendingShares: 0,
        sharedByMe: sharedByMe.size,
        sharedWithMe: sharedWithMe.size
      };

      // Count by status
      [...sharedByMe.docs, ...sharedWithMe.docs].forEach(doc => {
        const status = doc.data().status;
        if (status === 'active') stats.activeShares++;
        if (status === 'pending') stats.pendingShares++;
      });

      return stats;
    } catch (error) {
      logger.error('FamilyVaultSharing: Failed to get stats', error);
      throw normalizeError(error);
    }
  }

  /**
   * Bulk share files with multiple recipients
   */
  async bulkShareFiles(
    fileIds: string[],
    fileKeys: Map<string, Uint8Array>,
    recipientIds: string[],
    permissions: Partial<SharePermissions> = { read: true }
  ): Promise<{ successful: number; failed: number }> {
    if (recipientIds.length > MAX_SHARE_RECIPIENTS) {
      throw new Error(`Cannot share with more than ${MAX_SHARE_RECIPIENTS} recipients at once`);
    }

    let successful = 0;
    let failed = 0;

    for (const fileId of fileIds) {
      const fileKey = fileKeys.get(fileId);
      if (!fileKey) {
        failed++;
        continue;
      }

      for (const recipientId of recipientIds) {
        try {
          await this.shareFile(fileId, fileKey, recipientId, permissions);
          successful++;
        } catch (error) {
          logger.error(`Failed to share ${fileId} with ${recipientId}:`, error);
          failed++;
        }
      }
    }

    return { successful, failed };
  }

  // Private helper methods

  private async loadOrGenerateKeyPair(userId: string): Promise<{
    publicKey: Uint8Array;
    secretKey: Uint8Array;
  }> {
    // In production, this would load from secure storage
    // For now, generate a new key pair
    const keyPair = this.sodium.crypto_box_keypair();
    return {
      publicKey: keyPair.publicKey,
      secretKey: keyPair.privateKey
    };
  }

  private async publishPublicKey(userId: string, publicKey: Uint8Array): Promise<void> {
    try {
      await this.db
        .collection('users')
        .doc(userId)
        .update({
          vaultSharingPublicKey: this.sodium.to_base64(publicKey),
          vaultSharingKeyUpdatedAt: FirebaseFirestoreTypes.Timestamp.now()
        });
    } catch (error) {
      logger.error('FamilyVaultSharing: Failed to publish public key', error);
      throw error;
    }
  }

  private async fetchUserPublicKey(userId: string): Promise<Uint8Array | null> {
    try {
      const userDoc = await this.db
        .collection('users')
        .doc(userId)
        .get();

      if (!userDoc.exists) {
        return null;
      }

      const publicKeyBase64 = userDoc.data()?.vaultSharingPublicKey;
      if (!publicKeyBase64) {
        return null;
      }

      return this.sodium.from_base64(publicKeyBase64);
    } catch (error) {
      logger.error('FamilyVaultSharing: Failed to fetch user public key', error);
      return null;
    }
  }

  private async updateShareStatus(shareId: string, status: VaultShare['status']): Promise<void> {
    await this.db
      .collection(VAULT_SHARES_COLLECTION)
      .doc(shareId)
      .update({ status });
  }

  private async createAccessRecord(fileId: string, userId: string, permissions: SharePermissions): Promise<void> {
    // This would integrate with the vault access control system
    // For now, just log
    logger.info(`Creating access record for ${userId} on file ${fileId}`, permissions);
  }

  private async removeAccessRecord(fileId: string, userId: string): Promise<void> {
    // This would integrate with the vault access control system
    // For now, just log
    logger.info(`Removing access record for ${userId} on file ${fileId}`);
  }

  private async sendShareNotification(recipientId: string, share: VaultShare): Promise<void> {
    try {
      await callFirebaseFunction('sendShareNotification', {
        recipientId,
        shareId: share.id,
        fileName: share.metadata?.fileName,
        message: share.metadata?.message,
        ownerId: share.ownerId
      });
    } catch (error) {
      logger.warn('FamilyVaultSharing: Failed to send share notification', error);
    }
  }

  private async sendRevokeNotification(recipientId: string, share: VaultShare): Promise<void> {
    try {
      await callFirebaseFunction('sendRevokeNotification', {
        recipientId,
        fileName: share.metadata?.fileName,
        ownerId: share.ownerId
      });
    } catch (error) {
      logger.warn('FamilyVaultSharing: Failed to send revoke notification', error);
    }
  }
}