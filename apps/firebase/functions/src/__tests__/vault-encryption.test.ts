import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import * as admin from 'firebase-admin';
import { getFirestore } from 'firebase-admin/firestore';
import firebaseFunctionsTest from 'firebase-functions-test';
import {
  addVaultFile,
  createVaultFolder,
  shareVaultItem,
  getVaultAuditLogs,
  reportSecurityIncident,
  getSecurityMonitoringData,
} from '../vault';
import {
  sanitizeFileName,
  sanitizeFolderName,
  sanitizeVaultPath,
  sanitizeMimeType,
  validateFileSize,
} from '../utils/vault-sanitization';

// Initialize test environment
const test = firebaseFunctionsTest();
const db = getFirestore();

// Mock user data
const mockUser = {
  uid: 'test-user-123',
  email: 'test@example.com',
  emailVerified: true,
};

const mockAdminUser = {
  uid: 'admin-user-123',
  email: 'admin@example.com',
  emailVerified: true,
  roles: ['admin'],
};

// Mock R2 service
jest.mock('../services/r2Service', () => ({
  getR2Service: jest.fn(() => ({
    generateUploadUrl: jest.fn().mockResolvedValue({
      uploadUrl: 'https://r2-mock.com/upload',
      storageKey: 'vault/test-user-123/file-123/test.pdf',
    }),
    generateDownloadUrl: jest.fn().mockResolvedValue({
      downloadUrl: 'https://r2-mock.com/download',
      expiresAt: new Date(Date.now() + 3600000).toISOString(),
    }),
    deleteObject: jest.fn().mockResolvedValue(true),
    copyObject: jest.fn().mockResolvedValue(true),
  })),
}));

describe('Vault Encryption Tests', () => {
  beforeEach(async () => {
    // Clear Firestore data
    const collections = ['users', 'vaultItems', 'vaultAuditLogs', 'vaultSecurityIncidents'];
    for (const collection of collections) {
      const docs = await db.collection(collection).listDocuments();
      await Promise.all(docs.map(doc => doc.delete()));
    }

    // Create test users
    await db.collection('users').doc(mockUser.uid).set(mockUser);
    await db.collection('users').doc(mockAdminUser.uid).set(mockAdminUser);
  });

  afterEach(() => {
    test.cleanup();
  });

  describe('Input Sanitization', () => {
    it('should sanitize dangerous file names', () => {
      expect(sanitizeFileName('malware.exe')).toBe('malware.exe.txt');
      expect(sanitizeFileName('script.js')).toBe('script.js.txt');
      expect(sanitizeFileName('../../../etc/passwd')).toBe('passwd');
    });

    it('should sanitize folder names', () => {
      expect(sanitizeFolderName('folder/subfolder')).toBe('folderfubfolder');
      expect(sanitizeFolderName('folder<>:"|?*')).toBe('folder');
    });

    it('should prevent path traversal', () => {
      expect(sanitizeVaultPath('../../../etc')).toBe('/etc');
      expect(sanitizeVaultPath('/vault/../../../etc')).toBe('/vaultetc');
    });

    it('should validate MIME types', () => {
      expect(sanitizeMimeType('text/html')).toBe('application/octet-stream');
      expect(sanitizeMimeType('image/jpeg')).toBe('image/jpeg');
    });

    it('should validate file sizes', () => {
      expect(validateFileSize(50 * 1024 * 1024)).toBe(true); // 50MB
      expect(validateFileSize(200 * 1024 * 1024)).toBe(false); // 200MB
    });
  });

  describe('Vault Operations', () => {
    describe('addVaultFile', () => {
      it('should add encrypted file with sanitized name', async () => {
        const wrapped = test.wrap(addVaultFile);
        const result = await wrapped(
          {
            fileName: 'test<script>.pdf',
            mimeType: 'application/pdf',
            size: 1024,
            encryptedSize: 1280,
            parentId: null,
            encryptionMetadata: {
              algorithm: 'xchacha20-poly1305',
              keyDerivation: 'pbkdf2',
              iterations: 100000,
            },
          },
          {
            auth: mockUser,
          }
        );

        expect(result.success).toBe(true);
        expect(result.uploadUrl).toBeDefined();
        expect(result.itemId).toBeDefined();

        // Verify sanitized file name in database
        const vaultItem = await db.collection('vaultItems').doc(result.itemId).get();
        expect(vaultItem.data()?.name).toBe('testscript.pdf');
      });

      it('should reject dangerous file extensions', async () => {
        const wrapped = test.wrap(addVaultFile);
        const result = await wrapped(
          {
            fileName: 'virus.exe',
            mimeType: 'application/x-executable',
            size: 1024,
            encryptedSize: 1280,
            parentId: null,
            encryptionMetadata: {
              algorithm: 'xchacha20-poly1305',
              keyDerivation: 'pbkdf2',
              iterations: 100000,
            },
          },
          {
            auth: mockUser,
          }
        );

        // File should be saved with .txt extension
        const vaultItem = await db.collection('vaultItems').doc(result.itemId).get();
        expect(vaultItem.data()?.name).toBe('virus.exe.txt');
        expect(vaultItem.data()?.mimeType).toBe('application/octet-stream');
      });

      it('should enforce file size limits', async () => {
        const wrapped = test.wrap(addVaultFile);
        
        await expect(wrapped(
          {
            fileName: 'huge.zip',
            mimeType: 'application/zip',
            size: 200 * 1024 * 1024, // 200MB
            encryptedSize: 210 * 1024 * 1024,
            parentId: null,
            encryptionMetadata: {
              algorithm: 'xchacha20-poly1305',
              keyDerivation: 'pbkdf2',
              iterations: 100000,
            },
          },
          {
            auth: mockUser,
          }
        )).rejects.toThrow('File size exceeds maximum allowed');
      });
    });

    describe('createVaultFolder', () => {
      it('should create folder with sanitized name', async () => {
        const wrapped = test.wrap(createVaultFolder);
        const result = await wrapped(
          {
            folderName: 'My Documents/../../../etc',
            parentId: null,
          },
          {
            auth: mockUser,
          }
        );

        expect(result.itemId).toBeDefined();
        
        const folder = await db.collection('vaultItems').doc(result.itemId).get();
        expect(folder.data()?.name).toBe('My Documentsetc');
        expect(folder.data()?.type).toBe('folder');
      });
    });

    describe('shareVaultItem', () => {
      let fileId: string;

      beforeEach(async () => {
        // Create a test file
        const vaultItem = {
          userId: mockUser.uid,
          name: 'test.pdf',
          type: 'file',
          size: 1024,
          encryptedSize: 1280,
          mimeType: 'application/pdf',
          path: '/test.pdf',
          parentId: null,
          isDeleted: false,
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          sharedWith: [],
        };
        const doc = await db.collection('vaultItems').add(vaultItem);
        fileId = doc.id;
      });

      it('should share file with another user', async () => {
        const wrapped = test.wrap(shareVaultItem);
        const result = await wrapped(
          {
            itemId: fileId,
            shareWith: ['shared-user-123'],
            permissions: 'read',
          },
          {
            auth: mockUser,
          }
        );

        expect(result.success).toBe(true);

        const updatedItem = await db.collection('vaultItems').doc(fileId).get();
        expect(updatedItem.data()?.sharedWith).toContain('shared-user-123');
      });

      it('should prevent sharing by non-owner', async () => {
        const wrapped = test.wrap(shareVaultItem);
        
        await expect(wrapped(
          {
            itemId: fileId,
            shareWith: ['another-user'],
            permissions: 'read',
          },
          {
            auth: { uid: 'unauthorized-user', email: 'unauthorized@example.com' },
          }
        )).rejects.toThrow();
      });
    });

    describe('Security Monitoring', () => {
      it('should report security incidents', async () => {
        const wrapped = test.wrap(reportSecurityIncident);
        const result = await wrapped(
          {
            type: 'suspicious_access',
            severity: 'high',
            details: 'Multiple failed decryption attempts',
            affectedItemId: 'file-123',
          },
          {
            auth: mockUser,
          }
        );

        expect(result.incidentId).toBeDefined();
        expect(result.notified).toBe(true);

        // Verify incident was logged
        const incident = await db.collection('vaultSecurityIncidents').doc(result.incidentId).get();
        expect(incident.exists).toBe(true);
        expect(incident.data()?.severity).toBe('high');
      });

      it('should allow admin to view security monitoring data', async () => {
        // Create some test incidents
        await db.collection('vaultSecurityIncidents').add({
          type: 'rate_limit_violation',
          severity: 'medium',
          userId: 'test-user',
          timestamp: admin.firestore.FieldValue.serverTimestamp(),
        });

        const wrapped = test.wrap(getSecurityMonitoringData);
        const result = await wrapped(
          {
            timeRange: '24h',
            severity: 'medium',
          },
          {
            auth: mockAdminUser,
          }
        );

        expect(result.incidents).toBeDefined();
        expect(result.incidents.length).toBeGreaterThan(0);
      });

      it('should prevent non-admin from viewing security data', async () => {
        const wrapped = test.wrap(getSecurityMonitoringData);
        
        await expect(wrapped(
          {
            timeRange: '24h',
            severity: 'medium',
          },
          {
            auth: mockUser,
          }
        )).rejects.toThrow('Admin access required');
      });
    });

    describe('Audit Logging', () => {
      it('should log all vault operations', async () => {
        // Perform an operation
        const wrapped = test.wrap(createVaultFolder);
        await wrapped(
          {
            folderName: 'Test Folder',
            parentId: null,
          },
          {
            auth: mockUser,
          }
        );

        // Check audit logs
        const logsWrapped = test.wrap(getVaultAuditLogs);
        const logs = await logsWrapped(
          {
            limit: 10,
          },
          {
            auth: mockUser,
          }
        );

        expect(logs.logs).toBeDefined();
        expect(logs.logs.length).toBeGreaterThan(0);
        expect(logs.logs[0].action).toBe('create_folder');
      });
    });
  });
});