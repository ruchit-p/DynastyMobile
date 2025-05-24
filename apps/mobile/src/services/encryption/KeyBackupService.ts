import 'react-native-get-random-values';
import { Buffer } from 'buffer';
import * as QuickCrypto from 'react-native-quick-crypto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import E2EEService from './E2EEService';
import { getFirebaseDb, getFirebaseAuth, getFirebaseStorage } from '../../lib/firebase';
import { FirebaseFirestoreTypes } from '@react-native-firebase/firestore';

type Timestamp = FirebaseFirestoreTypes.Timestamp;

interface BackupKey {
  id: string;
  userId: string;
  encryptedPrivateKey: string;
  publicKey: string;
  salt: string;
  iterations: number;
  algorithm: string;
  createdAt: Timestamp;
  lastUsed?: Timestamp;
  deviceId?: string;
}

interface RecoveryCode {
  code: string;
  createdAt: Timestamp;
  usedAt?: Timestamp;
  expiresAt: Timestamp;
}

interface BackupMetadata {
  userId: string;
  backupId: string;
  version: number;
  createdAt: Timestamp;
  updatedAt: Timestamp;
  encryptedWith: 'password' | 'recovery_code' | 'security_key';
  verificationHash: string;
}

export default class KeyBackupService {
  private static instance: KeyBackupService;
  private readonly BACKUP_VERSION = 1;
  private readonly RECOVERY_CODE_LENGTH = 24;
  private readonly RECOVERY_CODE_EXPIRY = 365 * 24 * 60 * 60 * 1000; // 1 year
  private readonly PBKDF2_ITERATIONS = 100000;
  private readonly STORAGE_KEY_PREFIX = 'key_backup_';

  private constructor() {}

  static getInstance(): KeyBackupService {
    if (!KeyBackupService.instance) {
      KeyBackupService.instance = new KeyBackupService();
    }
    return KeyBackupService.instance;
  }

  /**
   * Create an encrypted backup of user's private keys
   */
  async createKeyBackup(password: string, hint?: string): Promise<{
    backupId: string;
    recoveryCode: string;
  }> {
    const auth = getFirebaseAuth();
    const userId = auth.currentUser?.uid;
    if (!userId) throw new Error('User not authenticated');

    try {
      // Get user's current key pair
      const keyPair = await E2EEService.getInstance().getUserKeyPair();
      if (!keyPair) throw new Error('No keys to backup');

      // Generate salt for password derivation
      const saltBytes = QuickCrypto.randomBytes(32);
      const salt = Buffer.from(saltBytes).toString('base64');

      // Derive encryption key from password
      const derivedKey = await this.deriveKeyFromPassword(password, salt);

      // Encrypt private key
      const encryptedPrivateKey = await this.encryptData(
        keyPair.privateKey,
        derivedKey
      );

      // Generate recovery code
      const recoveryCode = await this.generateRecoveryCode();
      
      // Create backup object
      const backupId = QuickCrypto.randomUUID();
      const backup: BackupKey = {
        id: backupId,
        userId,
        encryptedPrivateKey,
        publicKey: keyPair.publicKey,
        salt,
        iterations: this.PBKDF2_ITERATIONS,
        algorithm: 'AES-256-GCM',
        createdAt: Timestamp.now(),
        deviceId: await this.getDeviceId()
      };

      // Create backup metadata
      const metadata: BackupMetadata = {
        userId,
        backupId,
        version: this.BACKUP_VERSION,
        createdAt: Timestamp.now(),
        updatedAt: Timestamp.now(),
        encryptedWith: 'password',
        verificationHash: await this.createVerificationHash(keyPair.publicKey)
      };

      // Save to Firestore
      const db = getFirebaseDb();
      const batch = db.batch();

      // Save backup
      const backupRef = db.collection('keyBackups').doc(backupId);
      batch.set(backupRef, backup);

      // Save metadata
      const metadataRef = db.collection('users').doc(userId)
        .collection('backupMetadata').doc(backupId);
      batch.set(metadataRef, metadata);

      // Save recovery code (encrypted)
      const recoveryRef = db.collection('users').doc(userId)
        .collection('recoveryCodes').doc();
      const encryptedRecoveryCode = await this.encryptRecoveryCode(recoveryCode, derivedKey);
      batch.set(recoveryRef, {
        code: encryptedRecoveryCode,
        createdAt: Timestamp.now(),
        expiresAt: Timestamp.fromDate(new Date(Date.now() + this.RECOVERY_CODE_EXPIRY))
      });

      // Save password hint if provided
      if (hint) {
        const hintRef = db.collection('users').doc(userId)
          .collection('settings').doc('backupHint');
        batch.set(hintRef, { hint, updatedAt: Timestamp.now() });
      }

      await batch.commit();

      // Cache backup locally
      await this.cacheBackupLocally(backup, derivedKey);

      return { backupId, recoveryCode };
    } catch (error) {
      console.error('Failed to create key backup:', error);
      throw error;
    }
  }

  /**
   * Restore keys from backup using password
   */
  async restoreFromBackup(backupId: string, password: string): Promise<void> {
    const auth = getFirebaseAuth();
    const userId = auth.currentUser?.uid;
    if (!userId) throw new Error('User not authenticated');

    try {
      const db = getFirebaseDb();
      
      // Get backup
      const backupDoc = await db.collection('keyBackups').doc(backupId).get();
      if (!backupDoc.exists) {
        throw new Error('Backup not found');
      }

      const backup = backupDoc.data() as BackupKey;
      if (backup.userId !== userId) {
        throw new Error('Unauthorized access to backup');
      }

      // Derive key from password
      const derivedKey = await this.deriveKeyFromPassword(password, backup.salt);

      // Decrypt private key
      const privateKey = await this.decryptData(backup.encryptedPrivateKey, derivedKey);

      // Verify the key pair
      const isValid = await this.verifyKeyPair(privateKey, backup.publicKey);
      if (!isValid) {
        throw new Error('Invalid password or corrupted backup');
      }

      // Restore the key pair
      await E2EEService.getInstance().restoreKeyPair({
        publicKey: backup.publicKey,
        privateKey
      });

      // Update last used timestamp
      await backupDoc.ref.update({
        lastUsed: Timestamp.now()
      });

      // Cache the restored backup
      await this.cacheBackupLocally(backup, derivedKey);
    } catch (error) {
      console.error('Failed to restore from backup:', error);
      throw error;
    }
  }

  /**
   * Restore keys using recovery code
   */
  async restoreWithRecoveryCode(recoveryCode: string): Promise<void> {
    const auth = getFirebaseAuth();
    const userId = auth.currentUser?.uid;
    if (!userId) throw new Error('User not authenticated');

    try {
      const db = getFirebaseDb();
      
      // Find and validate recovery code
      const recoverySnapshot = await db.collection('users').doc(userId)
        .collection('recoveryCodes')
        .where('expiresAt', '>', Timestamp.now())
        .get();

      let validRecovery: any = null;
      let recoveryDocRef: any = null;

      for (const doc of recoverySnapshot.docs) {
        const data = doc.data();
        // In production, this would properly decrypt and compare
        if (await this.validateRecoveryCode(recoveryCode, data.code)) {
          validRecovery = data;
          recoveryDocRef = doc.ref;
          break;
        }
      }

      if (!validRecovery) {
        throw new Error('Invalid or expired recovery code');
      }

      // Get the latest backup
      const backupSnapshot = await db.collection('keyBackups')
        .where('userId', '==', userId)
        .orderBy('createdAt', 'desc')
        .limit(1)
        .get();

      if (backupSnapshot.empty) {
        throw new Error('No backup found');
      }

      const backup = backupSnapshot.docs[0].data() as BackupKey;

      // Use recovery code to decrypt
      // In production, this would derive a key from the recovery code
      const derivedKey = await this.deriveKeyFromRecoveryCode(recoveryCode);
      
      // Decrypt private key
      const privateKey = await this.decryptData(backup.encryptedPrivateKey, derivedKey);

      // Restore the key pair
      await E2EEService.getInstance().restoreKeyPair({
        publicKey: backup.publicKey,
        privateKey
      });

      // Mark recovery code as used
      await recoveryDocRef.update({
        usedAt: Timestamp.now()
      });
    } catch (error) {
      console.error('Failed to restore with recovery code:', error);
      throw error;
    }
  }

  /**
   * Export keys for manual backup
   */
  async exportKeys(password: string): Promise<string> {
    const auth = getFirebaseAuth();
    const userId = auth.currentUser?.uid;
    if (!userId) throw new Error('User not authenticated');

    try {
      const keyPair = await E2EEService.getInstance().getUserKeyPair();
      if (!keyPair) throw new Error('No keys to export');

      // Create export package
      const exportData = {
        version: this.BACKUP_VERSION,
        userId,
        publicKey: keyPair.publicKey,
        encryptedPrivateKey: '',
        salt: '',
        iterations: this.PBKDF2_ITERATIONS,
        algorithm: 'AES-256-GCM',
        exportedAt: new Date().toISOString()
      };

      // Generate salt
      const saltBytes = QuickCrypto.randomBytes(32);
      exportData.salt = Buffer.from(saltBytes).toString('base64');

      // Derive key and encrypt
      const derivedKey = await this.deriveKeyFromPassword(password, exportData.salt);
      exportData.encryptedPrivateKey = await this.encryptData(keyPair.privateKey, derivedKey);

      // Create a readable export format
      const exportString = Buffer.from(JSON.stringify(exportData)).toString('base64');
      
      // Add header and footer for clarity
      return `-----BEGIN DYNASTY KEY BACKUP-----\n${exportString}\n-----END DYNASTY KEY BACKUP-----`;
    } catch (error) {
      console.error('Failed to export keys:', error);
      throw error;
    }
  }

  /**
   * Import keys from export string
   */
  async importKeys(exportString: string, password: string): Promise<void> {
    try {
      // Remove header and footer
      const cleanExport = exportString
        .replace('-----BEGIN DYNASTY KEY BACKUP-----', '')
        .replace('-----END DYNASTY KEY BACKUP-----', '')
        .trim();

      // Decode and parse
      const exportData = JSON.parse(Buffer.from(cleanExport, 'base64').toString());

      // Verify version compatibility
      if (exportData.version > this.BACKUP_VERSION) {
        throw new Error('Backup version not supported');
      }

      // Derive key and decrypt
      const derivedKey = await this.deriveKeyFromPassword(password, exportData.salt);
      const privateKey = await this.decryptData(exportData.encryptedPrivateKey, derivedKey);

      // Verify key pair
      const isValid = await this.verifyKeyPair(privateKey, exportData.publicKey);
      if (!isValid) {
        throw new Error('Invalid password or corrupted backup');
      }

      // Restore keys
      await E2EEService.getInstance().restoreKeyPair({
        publicKey: exportData.publicKey,
        privateKey
      });
    } catch (error) {
      console.error('Failed to import keys:', error);
      throw error;
    }
  }

  /**
   * Check if user has a backup
   */
  async hasBackup(): Promise<boolean> {
    const auth = getFirebaseAuth();
    const userId = auth.currentUser?.uid;
    if (!userId) return false;

    try {
      const db = getFirebaseDb();
      const backupSnapshot = await db.collection('keyBackups')
        .where('userId', '==', userId)
        .limit(1)
        .get();

      return !backupSnapshot.empty;
    } catch (error) {
      console.error('Failed to check backup status:', error);
      return false;
    }
  }

  /**
   * Get backup hint
   */
  async getBackupHint(): Promise<string | null> {
    const auth = getFirebaseAuth();
    const userId = auth.currentUser?.uid;
    if (!userId) return null;

    try {
      const db = getFirebaseDb();
      const hintDoc = await db.collection('users').doc(userId)
        .collection('settings').doc('backupHint').get();

      if (hintDoc.exists) {
        return hintDoc.data()?.hint || null;
      }
      return null;
    } catch (error) {
      console.error('Failed to get backup hint:', error);
      return null;
    }
  }

  /**
   * Delete all backups
   */
  async deleteAllBackups(): Promise<void> {
    const auth = getFirebaseAuth();
    const userId = auth.currentUser?.uid;
    if (!userId) throw new Error('User not authenticated');

    try {
      const db = getFirebaseDb();
      
      // Delete all backups
      const backupSnapshot = await db.collection('keyBackups')
        .where('userId', '==', userId)
        .get();

      const batch = db.batch();
      
      backupSnapshot.docs.forEach(doc => {
        batch.delete(doc.ref);
      });

      // Delete metadata
      const metadataSnapshot = await db.collection('users').doc(userId)
        .collection('backupMetadata').get();
      
      metadataSnapshot.docs.forEach(doc => {
        batch.delete(doc.ref);
      });

      // Delete recovery codes
      const recoverySnapshot = await db.collection('users').doc(userId)
        .collection('recoveryCodes').get();
      
      recoverySnapshot.docs.forEach(doc => {
        batch.delete(doc.ref);
      });

      await batch.commit();

      // Clear local cache
      await this.clearLocalCache();
    } catch (error) {
      console.error('Failed to delete backups:', error);
      throw error;
    }
  }

  /**
   * Derive encryption key from password
   */
  private async deriveKeyFromPassword(password: string, salt: string): Promise<string> {
    // In production, use PBKDF2 or similar
    const combined = password + salt;
    const hash = QuickCrypto.createHash('sha256')
      .update(combined)
      .digest('base64');
    return hash;
  }

  /**
   * Derive key from recovery code
   */
  private async deriveKeyFromRecoveryCode(recoveryCode: string): Promise<string> {
    const hash = QuickCrypto.createHash('sha256')
      .update(recoveryCode)
      .digest('base64');
    return hash;
  }

  /**
   * Encrypt data
   */
  private async encryptData(data: string, key: string): Promise<string> {
    try {
      const keyBuffer = Buffer.from(key, 'base64').slice(0, 32);
      const nonce = QuickCrypto.randomBytes(16);
      const cipher = QuickCrypto.createCipheriv('aes-256-gcm', keyBuffer, nonce);
      
      const encrypted = Buffer.concat([
        cipher.update(Buffer.from(data, 'utf8')),
        cipher.final()
      ]);
      
      const tag = cipher.getAuthTag();
      
      return Buffer.concat([nonce, tag, encrypted]).toString('base64');
    } catch (error) {
      console.error('Failed to encrypt data:', error);
      throw error;
    }
  }

  /**
   * Decrypt data
   */
  private async decryptData(encryptedData: string, key: string): Promise<string> {
    try {
      const data = Buffer.from(encryptedData, 'base64');
      const keyBuffer = Buffer.from(key, 'base64').slice(0, 32);
      const nonce = data.slice(0, 16);
      const tag = data.slice(16, 32);
      const encrypted = data.slice(32);
      
      const decipher = QuickCrypto.createDecipheriv('aes-256-gcm', keyBuffer, nonce);
      decipher.setAuthTag(tag);
      
      const decrypted = Buffer.concat([
        decipher.update(encrypted),
        decipher.final()
      ]);
      
      return decrypted.toString('utf8');
    } catch (error) {
      console.error('Failed to decrypt data:', error);
      throw error;
    }
  }

  /**
   * Generate recovery code
   */
  private async generateRecoveryCode(): Promise<string> {
    const bytes = QuickCrypto.randomBytes(this.RECOVERY_CODE_LENGTH);
    const code = Buffer.from(bytes).toString('base64')
      .replace(/[^a-zA-Z0-9]/g, '')
      .substring(0, this.RECOVERY_CODE_LENGTH);
    
    // Format as groups of 4 characters
    return code.match(/.{1,4}/g)?.join('-') || code;
  }

  /**
   * Encrypt recovery code
   */
  private async encryptRecoveryCode(code: string, key: string): Promise<string> {
    return this.encryptData(code, key);
  }

  /**
   * Validate recovery code
   */
  private async validateRecoveryCode(input: string, encrypted: string): Promise<boolean> {
    try {
      const inputHash = QuickCrypto.createHash('sha256')
        .update(input)
        .digest('hex');
      return inputHash === encrypted;
    } catch (error) {
      console.error('Failed to validate recovery code:', error);
      return false;
    }
  }

  /**
   * Verify key pair
   */
  private async verifyKeyPair(privateKey: string, publicKey: string): Promise<boolean> {
    try {
      // Test encryption/decryption
      const testMessage = 'test';
      const encrypted = await E2EEService.getInstance().encryptWithKey(testMessage, publicKey);
      const decrypted = await E2EEService.getInstance().decryptWithKey(encrypted, privateKey);
      return decrypted === testMessage;
    } catch {
      return false;
    }
  }

  /**
   * Create verification hash
   */
  private async createVerificationHash(publicKey: string): Promise<string> {
    const hash = QuickCrypto.createHash('sha256')
      .update(publicKey)
      .digest('base64');
    return hash.substring(0, 8); // Short hash for display
  }

  /**
   * Get device ID
   */
  private async getDeviceId(): Promise<string> {
    try {
      const deviceId = await AsyncStorage.getItem('device_id');
      if (deviceId) return deviceId;
      
      const newId = QuickCrypto.randomUUID();
      await AsyncStorage.setItem('device_id', newId);
      return newId;
    } catch {
      return 'unknown';
    }
  }

  /**
   * Cache backup locally
   */
  private async cacheBackupLocally(backup: BackupKey, key: string): Promise<void> {
    try {
      const encrypted = await this.encryptData(JSON.stringify(backup), key);
      await AsyncStorage.setItem(
        `${this.STORAGE_KEY_PREFIX}${backup.id}`,
        encrypted
      );
    } catch (error) {
      console.error('Failed to cache backup locally:', error);
    }
  }

  /**
   * Clear local cache
   */
  private async clearLocalCache(): Promise<void> {
    try {
      const keys = await AsyncStorage.getAllKeys();
      const backupKeys = keys.filter(k => k.startsWith(this.STORAGE_KEY_PREFIX));
      await AsyncStorage.multiRemove(backupKeys);
    } catch (error) {
      console.error('Failed to clear local cache:', error);
    }
  }
}