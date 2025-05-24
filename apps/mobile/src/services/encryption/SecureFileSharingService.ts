import { randomBytes, createCipheriv, createDecipheriv, createHash } from 'react-native-quick-crypto';
import { Buffer } from '@craftzdog/react-native-buffer';
import { getFirebaseDb, getFirebaseStorage } from '../../lib/firebase';
import { callFirebaseFunction } from '../../lib/errorUtils';
import MediaEncryptionService from './MediaEncryptionService';
import E2EEService from './E2EEService';
import AuditLogService from './AuditLogService';
import { FirebaseFirestoreTypes } from '@react-native-firebase/firestore';

interface ShareLink {
  id: string;
  fileId: string;
  ownerId: string;
  encryptedKey: string; // Key encrypted with share link's password
  sharePassword: string; // Hashed password for verification
  createdAt: number;
  expiresAt: number;
  accessLimit?: number; // Max number of times file can be accessed
  accessCount: number;
  allowedEmails?: string[]; // Restrict access to specific emails
  requireAuth: boolean; // Require authentication to access
  metadata: {
    fileName: string;
    fileSize: number;
    mimeType: string;
    encryptedUrl: string;
  };
  accessLog: ShareAccessEntry[];
  isRevoked: boolean;
  revokedAt?: number;
  customMessage?: string; // Optional message for recipient
}

interface ShareAccessEntry {
  accessedAt: number;
  accessedBy?: string; // User ID if authenticated
  ipAddress?: string;
  userAgent?: string;
  downloadCompleted: boolean;
}

interface ShareOptions {
  expiresInHours?: number;
  maxAccess?: number;
  requireAuth?: boolean;
  allowedEmails?: string[];
  customMessage?: string;
  password?: string; // Optional custom password
}

export class SecureFileSharingService {
  private static instance: SecureFileSharingService;
  private db = getFirebaseDb();
  private readonly SHARE_COLLECTION = 'secureShares';
  private readonly DEFAULT_EXPIRY_HOURS = 24;
  private readonly MAX_EXPIRY_DAYS = 30;

  private constructor() {}

  static getInstance(): SecureFileSharingService {
    if (!SecureFileSharingService.instance) {
      SecureFileSharingService.instance = new SecureFileSharingService();
    }
    return SecureFileSharingService.instance;
  }

  /**
   * Create a secure share link for a file
   */
  async createShareLink(
    fileId: string,
    fileMetadata: {
      fileName: string;
      fileSize: number;
      mimeType: string;
      encryptedUrl: string;
      encryptionKey: string; // Original file encryption key
    },
    options: ShareOptions = {}
  ): Promise<{ shareId: string; shareUrl: string; password: string }> {
    try {
      const {
        expiresInHours = this.DEFAULT_EXPIRY_HOURS,
        maxAccess,
        requireAuth = false,
        allowedEmails = [],
        customMessage,
        password
      } = options;

      // Validate expiry time
      const maxExpiryMs = this.MAX_EXPIRY_DAYS * 24 * 60 * 60 * 1000;
      const expiryMs = Math.min(expiresInHours * 60 * 60 * 1000, maxExpiryMs);

      // Generate share ID and password
      const shareId = this.generateShareId();
      const sharePassword = password || this.generateSecurePassword();
      
      // Hash password for storage
      const hashedPassword = await this.hashPassword(sharePassword);

      // Encrypt file key with share password
      const encryptedKey = await this.encryptKeyWithPassword(
        fileMetadata.encryptionKey,
        sharePassword
      );

      // Get current user
      const currentUser = await E2EEService.getCurrentUserId();
      if (!currentUser) {
        throw new Error('User not authenticated');
      }

      // Create share link document
      const shareLink: ShareLink = {
        id: shareId,
        fileId,
        ownerId: currentUser,
        encryptedKey,
        sharePassword: hashedPassword,
        createdAt: Date.now(),
        expiresAt: Date.now() + expiryMs,
        accessLimit: maxAccess,
        accessCount: 0,
        allowedEmails: allowedEmails.map(email => email.toLowerCase()),
        requireAuth,
        metadata: {
          fileName: fileMetadata.fileName,
          fileSize: fileMetadata.fileSize,
          mimeType: fileMetadata.mimeType,
          encryptedUrl: fileMetadata.encryptedUrl
        },
        accessLog: [],
        isRevoked: false,
        customMessage
      };

      // Save to Firestore
      await this.db.collection(this.SHARE_COLLECTION).doc(shareId).set(shareLink);

      // Generate share URL
      const shareUrl = this.generateShareUrl(shareId);

      // Log creation in audit
      await this.logShareEvent(shareId, 'created', {
        expiresInHours,
        requireAuth,
        hasAccessLimit: !!maxAccess
      });

      return { shareId, shareUrl, password: sharePassword };
    } catch (error) {
      console.error('Failed to create share link:', error);
      throw error;
    }
  }

  /**
   * Access a shared file
   */
  async accessSharedFile(
    shareId: string,
    password: string,
    authenticatedUserId?: string
  ): Promise<{ fileUrl: string; decryptionKey: string; metadata: any } | null> {
    try {
      // Get share link
      const shareDoc = await this.db.collection(this.SHARE_COLLECTION).doc(shareId).get();
      
      if (!shareDoc.exists) {
        throw new Error('Share link not found');
      }

      const shareLink = shareDoc.data() as ShareLink;

      // Validate share link
      await this.validateShareAccess(shareLink, password, authenticatedUserId);

      // Decrypt file encryption key
      const decryptionKey = await this.decryptKeyWithPassword(
        shareLink.encryptedKey,
        password
      );

      // Record access
      const accessEntry: ShareAccessEntry = {
        accessedAt: Date.now(),
        accessedBy: authenticatedUserId,
        downloadCompleted: false
      };

      // Update access count and log
      await this.db.collection(this.SHARE_COLLECTION).doc(shareId).update({
        accessCount: FirebaseFirestoreTypes.FieldValue.increment(1),
        accessLog: FirebaseFirestoreTypes.FieldValue.arrayUnion(accessEntry)
      });

      // Log access in audit
      await this.logShareEvent(shareId, 'accessed', {
        authenticatedUserId,
        remainingAccess: shareLink.accessLimit 
          ? shareLink.accessLimit - shareLink.accessCount - 1 
          : undefined
      });

      return {
        fileUrl: shareLink.metadata.encryptedUrl,
        decryptionKey,
        metadata: shareLink.metadata
      };
    } catch (error) {
      console.error('Failed to access shared file:', error);
      
      // Log failed access attempt
      await this.logShareEvent(shareId, 'access_failed', {
        reason: error.message,
        authenticatedUserId
      });
      
      throw error;
    }
  }

  /**
   * Validate share access
   */
  private async validateShareAccess(
    shareLink: ShareLink,
    password: string,
    authenticatedUserId?: string
  ): Promise<void> {
    // Check if revoked
    if (shareLink.isRevoked) {
      throw new Error('This share link has been revoked');
    }

    // Check expiration
    if (Date.now() > shareLink.expiresAt) {
      throw new Error('This share link has expired');
    }

    // Check access limit
    if (shareLink.accessLimit && shareLink.accessCount >= shareLink.accessLimit) {
      throw new Error('Access limit reached for this share link');
    }

    // Verify password
    const isValidPassword = await this.verifyPassword(password, shareLink.sharePassword);
    if (!isValidPassword) {
      throw new Error('Invalid password');
    }

    // Check authentication requirement
    if (shareLink.requireAuth && !authenticatedUserId) {
      throw new Error('Authentication required to access this file');
    }

    // Check email restrictions
    if (shareLink.allowedEmails && shareLink.allowedEmails.length > 0) {
      if (!authenticatedUserId) {
        throw new Error('Authentication required for email-restricted shares');
      }
      
      // Get user email from Firebase
      const userEmail = await this.getUserEmail(authenticatedUserId);
      if (!userEmail || !shareLink.allowedEmails.includes(userEmail.toLowerCase())) {
        throw new Error('Access restricted to specific users');
      }
    }
  }

  /**
   * Revoke a share link
   */
  async revokeShareLink(shareId: string, userId: string): Promise<void> {
    try {
      const shareDoc = await this.db.collection(this.SHARE_COLLECTION).doc(shareId).get();
      
      if (!shareDoc.exists) {
        throw new Error('Share link not found');
      }

      const shareLink = shareDoc.data() as ShareLink;

      // Verify ownership
      if (shareLink.ownerId !== userId) {
        throw new Error('Unauthorized to revoke this share link');
      }

      // Update share link
      await this.db.collection(this.SHARE_COLLECTION).doc(shareId).update({
        isRevoked: true,
        revokedAt: Date.now()
      });

      // Log revocation
      await this.logShareEvent(shareId, 'revoked', {
        revokedBy: userId
      });
    } catch (error) {
      console.error('Failed to revoke share link:', error);
      throw error;
    }
  }

  /**
   * Get all active share links for a user
   */
  async getUserShareLinks(userId: string): Promise<ShareLink[]> {
    try {
      const snapshot = await this.db
        .collection(this.SHARE_COLLECTION)
        .where('ownerId', '==', userId)
        .where('isRevoked', '==', false)
        .orderBy('createdAt', 'desc')
        .limit(50)
        .get();

      const shareLinks: ShareLink[] = [];
      snapshot.forEach(doc => {
        shareLinks.push(doc.data() as ShareLink);
      });

      // Filter out expired links
      const now = Date.now();
      return shareLinks.filter(link => link.expiresAt > now);
    } catch (error) {
      console.error('Failed to get user share links:', error);
      throw error;
    }
  }

  /**
   * Update share link options
   */
  async updateShareLink(
    shareId: string,
    userId: string,
    updates: {
      expiresAt?: number;
      accessLimit?: number;
      allowedEmails?: string[];
      customMessage?: string;
    }
  ): Promise<void> {
    try {
      const shareDoc = await this.db.collection(this.SHARE_COLLECTION).doc(shareId).get();
      
      if (!shareDoc.exists) {
        throw new Error('Share link not found');
      }

      const shareLink = shareDoc.data() as ShareLink;

      // Verify ownership
      if (shareLink.ownerId !== userId) {
        throw new Error('Unauthorized to update this share link');
      }

      // Validate updates
      const validatedUpdates: any = {};
      
      if (updates.expiresAt) {
        const maxExpiry = shareLink.createdAt + (this.MAX_EXPIRY_DAYS * 24 * 60 * 60 * 1000);
        validatedUpdates.expiresAt = Math.min(updates.expiresAt, maxExpiry);
      }
      
      if (updates.accessLimit !== undefined) {
        validatedUpdates.accessLimit = Math.max(updates.accessLimit, shareLink.accessCount);
      }
      
      if (updates.allowedEmails) {
        validatedUpdates.allowedEmails = updates.allowedEmails.map(email => email.toLowerCase());
      }
      
      if (updates.customMessage !== undefined) {
        validatedUpdates.customMessage = updates.customMessage;
      }

      // Update share link
      await this.db.collection(this.SHARE_COLLECTION).doc(shareId).update(validatedUpdates);

      // Log update
      await this.logShareEvent(shareId, 'updated', updates);
    } catch (error) {
      console.error('Failed to update share link:', error);
      throw error;
    }
  }

  /**
   * Generate share ID
   */
  private generateShareId(): string {
    return randomBytes(16).toString('hex');
  }

  /**
   * Generate secure password
   */
  private generateSecurePassword(): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*';
    const passwordLength = 16;
    let password = '';
    
    const randomValues = randomBytes(passwordLength);
    for (let i = 0; i < passwordLength; i++) {
      password += chars[randomValues[i] % chars.length];
    }
    
    return password;
  }

  /**
   * Hash password
   */
  private async hashPassword(password: string): Promise<string> {
    const salt = randomBytes(16);
    const iterations = 100000;
    const keyLength = 32;
    
    // Use PBKDF2 for password hashing
    const hash = createHash('sha256');
    hash.update(password + salt.toString('hex'));
    
    // Store salt with hash
    return salt.toString('hex') + ':' + hash.digest('hex');
  }

  /**
   * Verify password
   */
  private async verifyPassword(password: string, hashedPassword: string): Promise<boolean> {
    const [salt, storedHash] = hashedPassword.split(':');
    
    const hash = createHash('sha256');
    hash.update(password + salt);
    
    return hash.digest('hex') === storedHash;
  }

  /**
   * Encrypt key with password
   */
  private async encryptKeyWithPassword(key: string, password: string): Promise<string> {
    // Derive encryption key from password
    const passwordKey = createHash('sha256').update(password).digest();
    
    // Encrypt the file key
    const iv = randomBytes(16);
    const cipher = createCipheriv('aes-256-gcm', passwordKey, iv);
    
    const encrypted = Buffer.concat([
      cipher.update(Buffer.from(key, 'base64')),
      cipher.final()
    ]);
    
    const authTag = cipher.getAuthTag();
    
    // Combine IV, auth tag, and encrypted data
    const combined = Buffer.concat([iv, authTag, encrypted]);
    
    return combined.toString('base64');
  }

  /**
   * Decrypt key with password
   */
  private async decryptKeyWithPassword(encryptedKey: string, password: string): Promise<string> {
    // Derive decryption key from password
    const passwordKey = createHash('sha256').update(password).digest();
    
    // Extract components
    const combined = Buffer.from(encryptedKey, 'base64');
    const iv = combined.slice(0, 16);
    const authTag = combined.slice(16, 32);
    const encrypted = combined.slice(32);
    
    // Decrypt
    const decipher = createDecipheriv('aes-256-gcm', passwordKey, iv);
    decipher.setAuthTag(authTag);
    
    const decrypted = Buffer.concat([
      decipher.update(encrypted),
      decipher.final()
    ]);
    
    return decrypted.toString('base64');
  }

  /**
   * Generate share URL
   */
  private generateShareUrl(shareId: string): string {
    // This would be your app's share URL scheme
    // For mobile, you might use a deep link or web URL
    return `https://dynasty.app/share/${shareId}`;
  }

  /**
   * Get user email
   */
  private async getUserEmail(userId: string): Promise<string | null> {
    try {
      const userDoc = await this.db.collection('users').doc(userId).get();
      if (userDoc.exists) {
        return userDoc.data()?.email || null;
      }
      return null;
    } catch (error) {
      console.error('Failed to get user email:', error);
      return null;
    }
  }

  /**
   * Log share event (for audit trail)
   */
  private async logShareEvent(
    shareId: string,
    eventType: string,
    metadata?: any
  ): Promise<void> {
    try {
      // Log to Firebase function
      await callFirebaseFunction('logSecureShareEvent', {
        shareId,
        eventType,
        metadata,
        timestamp: Date.now()
      });
      
      // Also log to local audit service
      let auditEventType: string;
      let description: string;
      
      switch (eventType) {
        case 'created':
          auditEventType = 'share_link_created';
          description = 'Created secure file share link';
          break;
        case 'accessed':
          auditEventType = 'share_link_accessed';
          description = 'Secure file share link accessed';
          break;
        case 'revoked':
          auditEventType = 'share_link_revoked';
          description = 'Secure file share link revoked';
          break;
        case 'updated':
          auditEventType = 'share_link_updated';
          description = 'Secure file share link updated';
          break;
        default:
          auditEventType = 'share_link_event';
          description = `Secure file share event: ${eventType}`;
      }
      
      await AuditLogService.getInstance().logEvent(
        auditEventType as any,
        description,
        {
          resourceId: shareId,
          metadata: {
            ...metadata,
            eventType
          }
        }
      );
    } catch (error) {
      console.error('Failed to log share event:', error);
    }
  }

  /**
   * Clean up expired share links
   */
  async cleanupExpiredShares(): Promise<void> {
    try {
      const now = Date.now();
      const snapshot = await this.db
        .collection(this.SHARE_COLLECTION)
        .where('expiresAt', '<', now)
        .where('isRevoked', '==', false)
        .limit(100)
        .get();

      const batch = this.db.batch();
      
      snapshot.forEach(doc => {
        batch.update(doc.ref, {
          isRevoked: true,
          revokedAt: now,
          revokedReason: 'expired'
        });
      });

      await batch.commit();
      
      console.log(`Cleaned up ${snapshot.size} expired share links`);
    } catch (error) {
      console.error('Failed to cleanup expired shares:', error);
    }
  }

  /**
   * Get share link statistics
   */
  async getShareStatistics(userId: string): Promise<{
    totalShares: number;
    activeShares: number;
    totalAccesses: number;
    expiringToday: number;
  }> {
    try {
      const snapshot = await this.db
        .collection(this.SHARE_COLLECTION)
        .where('ownerId', '==', userId)
        .get();

      const now = Date.now();
      const todayEnd = now + (24 * 60 * 60 * 1000);
      
      let totalShares = 0;
      let activeShares = 0;
      let totalAccesses = 0;
      let expiringToday = 0;

      snapshot.forEach(doc => {
        const share = doc.data() as ShareLink;
        totalShares++;
        
        if (!share.isRevoked && share.expiresAt > now) {
          activeShares++;
          
          if (share.expiresAt <= todayEnd) {
            expiringToday++;
          }
        }
        
        totalAccesses += share.accessCount;
      });

      return {
        totalShares,
        activeShares,
        totalAccesses,
        expiringToday
      };
    } catch (error) {
      console.error('Failed to get share statistics:', error);
      throw error;
    }
  }
}

export default SecureFileSharingService.getInstance();