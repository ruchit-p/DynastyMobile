// Key Backup Service for Dynasty Web App
// Manages secure backup and recovery of encryption keys

import { httpsCallable } from 'firebase/functions';
import { functions } from '@/lib/firebase';
import { e2eeService } from './E2EEService';
import type { ExportedKeyPair } from './E2EEService';
import { errorHandler, ErrorSeverity } from '../ErrorHandlingService';

export interface KeyBackup {
  id: string;
  encryptedPrivateKey: string;
  publicKey: string;
  salt: string;
  iterations: number;
  createdAt: Date;
  lastAccessedAt?: Date;
  deviceName?: string;
}

export interface BackupOptions {
  password: string;
  deviceName?: string;
  hint?: string;
}

export interface RecoveryOptions {
  backupId: string;
  password: string;
}

class KeyBackupService {
  private static instance: KeyBackupService;
  private readonly iterations = 100000;

  private constructor() {}

  static getInstance(): KeyBackupService {
    if (!KeyBackupService.instance) {
      KeyBackupService.instance = new KeyBackupService();
    }
    return KeyBackupService.instance;
  }

  async createBackup(
    keyPair: ExportedKeyPair,
    options: BackupOptions
  ): Promise<string> {
    try {
      // Generate salt for password derivation
      const salt = crypto.getRandomValues(new Uint8Array(16));
      
      // Derive encryption key from password
      const { key: encryptionKey } = await e2eeService.deriveKeyFromPassword(
        options.password,
        salt
      );

      // Encrypt private key
      const encoder = new TextEncoder();
      const privateKeyData = encoder.encode(keyPair.privateKey);
      
      const iv = crypto.getRandomValues(new Uint8Array(12));
      const encryptedPrivateKey = await crypto.subtle.encrypt(
        {
          name: 'AES-GCM',
          iv,
        },
        encryptionKey,
        privateKeyData
      );

      // Combine IV and ciphertext
      const combined = new Uint8Array(iv.length + encryptedPrivateKey.byteLength);
      combined.set(iv);
      combined.set(new Uint8Array(encryptedPrivateKey), iv.length);

      // Create backup on server
      const createKeyBackup = httpsCallable(functions, 'createKeyBackup');
      const result = await createKeyBackup({
        encryptedPrivateKey: this.arrayBufferToBase64(combined.buffer),
        publicKey: keyPair.publicKey,
        salt: this.arrayBufferToBase64(salt.buffer.slice(salt.byteOffset, salt.byteOffset + salt.byteLength)),
        iterations: this.iterations,
        deviceName: options.deviceName || this.getDeviceName(),
        hint: options.hint,
      });

      const { backupId } = result.data as { backupId: string };
      
      // Store backup ID locally
      this.storeBackupId(backupId);
      
      return backupId;
    } catch (error) {
      errorHandler.handleError(error, ErrorSeverity.CRITICAL, {
        action: 'create-key-backup'
      });
      throw error;
    }
  }

  async recoverFromBackup(options: RecoveryOptions): Promise<ExportedKeyPair> {
    try {
      // Fetch backup from server
      const getKeyBackup = httpsCallable(functions, 'getKeyBackup');
      const result = await getKeyBackup({ backupId: options.backupId });
      const backup = result.data as KeyBackup;

      // Derive decryption key from password
      const salt = this.base64ToArrayBuffer(backup.salt);
      const { key: decryptionKey } = await e2eeService.deriveKeyFromPassword(
        options.password,
        new Uint8Array(salt)
      );

      // Decrypt private key
      const combined = this.base64ToArrayBuffer(backup.encryptedPrivateKey);
      const iv = combined.slice(0, 12);
      const encryptedPrivateKey = combined.slice(12);

      const decryptedPrivateKey = await crypto.subtle.decrypt(
        {
          name: 'AES-GCM',
          iv,
        },
        decryptionKey,
        encryptedPrivateKey
      );

      const decoder = new TextDecoder();
      const privateKey = decoder.decode(decryptedPrivateKey);

      // Update last accessed time
      await this.updateBackupAccess(options.backupId);

      return {
        publicKey: backup.publicKey,
        privateKey,
      };
    } catch (error) {
      errorHandler.handleError(error, ErrorSeverity.HIGH, {
        action: 'recover-from-backup'
      });
      throw error;
    }
  }

  async listBackups(): Promise<KeyBackup[]> {
    try {
      const listKeyBackups = httpsCallable(functions, 'listKeyBackups');
      const result = await listKeyBackups();
      return (result.data as { backups: KeyBackup[] }).backups || [];
    } catch (error) {
      errorHandler.handleError(error, ErrorSeverity.MEDIUM, {
        action: 'list-key-backups'
      });
      throw error;
    }
  }

  async deleteBackup(backupId: string): Promise<void> {
    try {
      const deleteKeyBackup = httpsCallable(functions, 'deleteKeyBackup');
      await deleteKeyBackup({ backupId });
      
      // Remove from local storage
      this.removeBackupId(backupId);
    } catch (error) {
      errorHandler.handleError(error, ErrorSeverity.MEDIUM, {
        action: 'delete-key-backup'
      });
      throw error;
    }
  }

  async verifyBackupPassword(
    backupId: string,
    password: string
  ): Promise<boolean> {
    try {
      // Attempt to recover with the provided password
      await this.recoverFromBackup({ backupId, password });
      return true;
    } catch {
      // If decryption fails, password is incorrect
      return false;
    }
  }

  // Local Storage Management

  private storeBackupId(backupId: string) {
    try {
      const backups = this.getStoredBackupIds();
      if (!backups.includes(backupId)) {
        backups.push(backupId);
        localStorage.setItem('dynasty_key_backups', JSON.stringify(backups));
      }
    } catch (error) {
      console.error('Failed to store backup ID:', error);
    }
  }

  private removeBackupId(backupId: string) {
    try {
      const backups = this.getStoredBackupIds();
      const filtered = backups.filter(id => id !== backupId);
      localStorage.setItem('dynasty_key_backups', JSON.stringify(filtered));
    } catch (error) {
      console.error('Failed to remove backup ID:', error);
    }
  }

  getStoredBackupIds(): string[] {
    try {
      const stored = localStorage.getItem('dynasty_key_backups');
      return stored ? JSON.parse(stored) : [];
    } catch (error) {
      console.error('Failed to get stored backup IDs:', error);
      return [];
    }
  }

  // Utility Functions

  private async updateBackupAccess(backupId: string): Promise<void> {
    try {
      const updateKeyBackupAccess = httpsCallable(functions, 'updateKeyBackupAccess');
      await updateKeyBackupAccess({ backupId });
    } catch (error) {
      // Non-critical error, don't throw
      console.error('Failed to update backup access time:', error);
    }
  }

  private getDeviceName(): string {
    const userAgent = navigator.userAgent;
    
    // Try to detect device type
    if (/mobile/i.test(userAgent)) {
      if (/android/i.test(userAgent)) return 'Android Device';
      if (/iphone|ipad|ipod/i.test(userAgent)) return 'iOS Device';
      return 'Mobile Device';
    }
    
    if (/macintosh|mac os x/i.test(userAgent)) return 'Mac';
    if (/windows/i.test(userAgent)) return 'Windows PC';
    if (/linux/i.test(userAgent)) return 'Linux PC';
    
    return 'Web Browser';
  }

  private arrayBufferToBase64(buffer: ArrayBuffer): string {
    const bytes = new Uint8Array(buffer);
    let binary = '';
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  }

  private base64ToArrayBuffer(base64: string): ArrayBuffer {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes.buffer;
  }

  // Password Strength Validation

  validateBackupPassword(password: string): {
    isValid: boolean;
    errors: string[];
  } {
    const errors: string[] = [];

    if (password.length < 8) {
      errors.push('Password must be at least 8 characters long');
    }

    if (!/[A-Z]/.test(password)) {
      errors.push('Password must contain at least one uppercase letter');
    }

    if (!/[a-z]/.test(password)) {
      errors.push('Password must contain at least one lowercase letter');
    }

    if (!/[0-9]/.test(password)) {
      errors.push('Password must contain at least one number');
    }

    if (!/[^A-Za-z0-9]/.test(password)) {
      errors.push('Password must contain at least one special character');
    }

    return {
      isValid: errors.length === 0,
      errors,
    };
  }
}

// Export singleton instance
export const keyBackupService = KeyBackupService.getInstance();