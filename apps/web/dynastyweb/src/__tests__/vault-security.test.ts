import { vaultService } from '@/services/VaultService';
import { WebVaultCryptoService } from '@/services/encryption/VaultCryptoService';
import { sanitizeFilename } from '@/lib/xssSanitization';

describe('Vault Security Tests', () => {
  let cryptoService: WebVaultCryptoService;

  beforeEach(() => {
    cryptoService = WebVaultCryptoService.getInstance();
  });

  describe('Input Sanitization', () => {
    test('sanitizes malicious file names', () => {
      const maliciousNames = [
        '<script>alert("XSS")</script>.txt',
        '../../etc/passwd',
        'file\x00name.txt',
        'file<img src=x onerror=alert(1)>.jpg',
        'file%3Cscript%3Ealert(1)%3C/script%3E.pdf',
        'file\r\nContent-Type: text/html\r\n\r\n<script>alert(1)</script>',
        'file\u202E.txt.exe', // Right-to-left override
        'file\uFEFF.txt', // Zero-width space
      ];

      maliciousNames.forEach(name => {
        const sanitized = sanitizeFilename(name);
        expect(sanitized).not.toContain('<script>');
        expect(sanitized).not.toContain('</script>');
        expect(sanitized).not.toContain('..');
        expect(sanitized).not.toContain('\x00');
        expect(sanitized).not.toContain('\r');
        expect(sanitized).not.toContain('\n');
        expect(sanitized).not.toContain('\u202E');
        expect(sanitized).not.toContain('\uFEFF');
        expect(sanitized).not.toContain('%3C');
        expect(sanitized).not.toContain('%3E');
      });
    });

    test('preserves safe file names', () => {
      const safeNames = [
        'document.pdf',
        'family-photo-2024.jpg',
        'My_Important_File.docx',
        'résumé.doc',
        '文档.txt',
        'file (1).png',
        'file.with.multiple.dots.txt'
      ];

      safeNames.forEach(name => {
        const sanitized = sanitizeFilename(name);
        // Should preserve most of the original name
        expect(sanitized.length).toBeGreaterThan(0);
        expect(sanitized).toMatch(/\.[a-zA-Z0-9]+$/); // Should have extension
      });
    });

    test('handles extremely long file names', () => {
      const longName = 'a'.repeat(300) + '.txt';
      const sanitized = sanitizeFilename(longName);
      
      expect(sanitized.length).toBeLessThanOrEqual(255); // Max filename length
      expect(sanitized).toEndWith('.txt'); // Should preserve extension
    });
  });

  describe('Path Traversal Prevention', () => {
    test('prevents directory traversal in paths', () => {
      const maliciousPaths = [
        '../../../etc/passwd',
        '..\\..\\..\\windows\\system32',
        'folder/../../../etc/passwd',
        'folder/./../../etc/passwd',
        'folder/%2e%2e/%2e%2e/etc/passwd',
        'folder/..%2F..%2F..%2Fetc%2Fpasswd',
      ];

      maliciousPaths.forEach(path => {
        expect(() => {
          vaultService.validatePath(path);
        }).toThrow(/Invalid path/);
      });
    });

    test('allows valid paths', () => {
      const validPaths = [
        'documents/file.pdf',
        'photos/2024/january/photo.jpg',
        'work/projects/report.docx',
        'personal/taxes/2023.pdf'
      ];

      validPaths.forEach(path => {
        expect(() => {
          vaultService.validatePath(path);
        }).not.toThrow();
      });
    });
  });

  describe('Content Type Validation', () => {
    test('validates MIME types', () => {
      const validTypes = [
        'image/jpeg',
        'image/png',
        'application/pdf',
        'text/plain',
        'video/mp4',
        'audio/mpeg'
      ];

      validTypes.forEach(type => {
        expect(vaultService.isValidMimeType(type)).toBe(true);
      });
    });

    test('rejects dangerous MIME types', () => {
      const dangerousTypes = [
        'application/x-executable',
        'application/x-msdownload',
        'application/x-msdos-program',
        'text/html',
        'application/javascript',
        'application/x-httpd-php',
        'application/x-sh',
        'application/x-bat'
      ];

      dangerousTypes.forEach(type => {
        expect(vaultService.isValidMimeType(type)).toBe(false);
      });
    });

    test('detects MIME type mismatches', async () => {
      // Create an HTML file disguised as an image
      const htmlContent = '<html><script>alert(1)</script></html>';
      const fakeImage = new File([htmlContent], 'image.jpg', { type: 'image/jpeg' });
      
      const actualType = await vaultService.detectActualMimeType(fakeImage);
      expect(actualType).not.toBe('image/jpeg');
      expect(actualType).toBe('text/html');
    });
  });

  describe('Encryption Key Security', () => {
    test('prevents key extraction from memory', () => {
      const key = cryptoService.generateFileKey();
      
      // Try to access key through various methods
      const keyString = key.toString();
      const keyJSON = JSON.stringify(key);
      
      // Key should not be exposed in readable format
      expect(keyString).not.toContain(Array.from(key).join(''));
      expect(keyJSON).not.toContain(btoa(String.fromCharCode(...key)));
    });

    test('clears keys from memory after use', async () => {
      const key = new Uint8Array(32);
      key.fill(42); // Fill with test pattern
      
      // Use key in encryption
      const file = new File(['test'], 'test.txt');
      await cryptoService.encryptFile(file, key);
      
      // Key should be zeroed
      expect(key.every(byte => byte === 0)).toBe(true);
    });

    test('prevents timing attacks on key comparison', () => {
      const key1 = new Uint8Array(32).fill(1);
      const key2 = new Uint8Array(32).fill(2);
      const key3 = new Uint8Array(32).fill(1);
      key3[31] = 2; // Only last byte different
      
      // Measure comparison times
      const iterations = 10000;
      
      const start1 = performance.now();
      for (let i = 0; i < iterations; i++) {
        cryptoService.constantTimeCompare(key1, key2);
      }
      const time1 = performance.now() - start1;
      
      const start2 = performance.now();
      for (let i = 0; i < iterations; i++) {
        cryptoService.constantTimeCompare(key1, key3);
      }
      const time2 = performance.now() - start2;
      
      // Times should be similar (within 10% tolerance)
      const ratio = Math.max(time1, time2) / Math.min(time1, time2);
      expect(ratio).toBeLessThan(1.1);
    });
  });

  describe('Share Link Security', () => {
    test('share links expire correctly', async () => {
      const itemId = 'test-item';
      const expiresAt = new Date(Date.now() - 1000); // Already expired
      
      const { shareId } = await vaultService.shareItem(itemId, { expiresAt });
      
      await expect(vaultService.accessShareLink(shareId)).rejects.toThrow(/expired/);
    });

    test('password-protected links require correct password', async () => {
      const itemId = 'test-item';
      const password = 'SecureSharePassword123!';
      
      const { shareId } = await vaultService.shareItem(itemId, { password });
      
      // Wrong password
      await expect(
        vaultService.accessShareLink(shareId, 'wrongpassword')
      ).rejects.toThrow(/Invalid password/);
      
      // Correct password
      await expect(
        vaultService.accessShareLink(shareId, password)
      ).resolves.toBeDefined();
    });

    test('share links have access limits', async () => {
      const itemId = 'test-item';
      const maxAccess = 3;
      
      const { shareId } = await vaultService.shareItem(itemId, { 
        maxAccessCount: maxAccess 
      });
      
      // Access up to limit
      for (let i = 0; i < maxAccess; i++) {
        await vaultService.accessShareLink(shareId);
      }
      
      // Next access should fail
      await expect(
        vaultService.accessShareLink(shareId)
      ).rejects.toThrow(/Access limit exceeded/);
    });

    test('share links cannot access other users files', async () => {
      const user1ItemId = 'user1-item';
      const user2ItemId = 'user2-item';
      
      // User 1 creates share link
      vaultService.setUserId('user1');
      const { shareId } = await vaultService.shareItem(user1ItemId, {});
      
      // Try to use share link to access user 2's item
      vaultService.setUserId('user2');
      const maliciousShareData = {
        shareId,
        itemId: user2ItemId // Try to access different item
      };
      
      await expect(
        vaultService.accessShareLinkWithData(maliciousShareData)
      ).rejects.toThrow(/Not authorized/);
    });
  });

  describe('Rate Limiting', () => {
    test('limits encryption operations per user', async () => {
      const promises = [];
      const userId = 'test-user';
      vaultService.setUserId(userId);
      
      // Attempt 20 uploads rapidly
      for (let i = 0; i < 20; i++) {
        const file = new File([`content${i}`], `file${i}.txt`);
        promises.push(vaultService.uploadFile(file));
      }
      
      const results = await Promise.allSettled(promises);
      const failures = results.filter(r => r.status === 'rejected');
      
      // Should have some rate limit failures
      expect(failures.length).toBeGreaterThan(0);
      expect(failures.some(f => 
        f.reason.message.includes('Rate limit exceeded')
      )).toBe(true);
    });

    test('limits share link creation', async () => {
      const itemId = 'test-item';
      const promises = [];
      
      // Try to create 10 share links rapidly
      for (let i = 0; i < 10; i++) {
        promises.push(vaultService.shareItem(itemId, {}));
      }
      
      const results = await Promise.allSettled(promises);
      const failures = results.filter(r => r.status === 'rejected');
      
      expect(failures.length).toBeGreaterThan(0);
    });
  });

  describe('Audit Logging', () => {
    test('logs all file access', async () => {
      const itemId = 'test-item';
      const userId = 'test-user';
      vaultService.setUserId(userId);
      
      // Perform various operations
      await vaultService.downloadFile({ id: itemId } as any);
      await vaultService.shareItem(itemId, {});
      await vaultService.deleteFile(itemId);
      
      // Check audit logs
      const logs = await vaultService.getAuditLogs();
      
      expect(logs).toContainEqual(expect.objectContaining({
        action: 'download',
        itemId,
        userId
      }));
      
      expect(logs).toContainEqual(expect.objectContaining({
        action: 'share',
        itemId,
        userId
      }));
      
      expect(logs).toContainEqual(expect.objectContaining({
        action: 'delete',
        itemId,
        userId
      }));
    });

    test('audit logs are immutable', async () => {
      const logs = await vaultService.getAuditLogs();
      const originalLog = logs[0];
      
      // Try to modify log
      originalLog.action = 'modified';
      
      // Fetch logs again
      const newLogs = await vaultService.getAuditLogs();
      const sameLog = newLogs.find(l => l.id === originalLog.id);
      
      expect(sameLog.action).not.toBe('modified');
    });
  });

  describe('Memory Safety', () => {
    test('prevents memory leaks with large files', async () => {
      const initialMemory = (performance as any).memory?.usedJSHeapSize || 0;
      
      // Process multiple large files
      for (let i = 0; i < 5; i++) {
        const largeFile = new File([new ArrayBuffer(50 * 1024 * 1024)], `large${i}.bin`);
        const key = cryptoService.generateFileKey();
        
        const result = await cryptoService.encryptFile(largeFile, key);
        expect(result.success).toBe(true);
        
        // Force garbage collection if available
        if (global.gc) {
          global.gc();
        }
      }
      
      const finalMemory = (performance as any).memory?.usedJSHeapSize || 0;
      const memoryIncrease = finalMemory - initialMemory;
      
      // Memory increase should be reasonable (less than 100MB)
      expect(memoryIncrease).toBeLessThan(100 * 1024 * 1024);
    });

    test('clears sensitive data from closures', () => {
      let exposedKey: Uint8Array | null = null;
      
      const encryptionFunction = (() => {
        const sensitiveKey = new Uint8Array(32).fill(42);
        
        return {
          encrypt: (data: Uint8Array) => {
            // This should not expose the key
            return new Uint8Array(data.length);
          },
          // Intentionally try to expose key
          getKey: () => sensitiveKey
        };
      })();
      
      // Try to access the key
      exposedKey = encryptionFunction.getKey();
      
      // The key should be cleared after use
      cryptoService.memzero(exposedKey);
      expect(exposedKey.every(byte => byte === 0)).toBe(true);
    });
  });

  describe('Browser Compatibility', () => {
    test('handles missing crypto.subtle gracefully', async () => {
      const originalCrypto = global.crypto;
      global.crypto = {} as any; // No subtle crypto
      
      const service = new WebVaultCryptoService();
      await expect(service.initialize()).rejects.toThrow(/Crypto API not available/);
      
      global.crypto = originalCrypto;
    });

    test('falls back when IndexedDB is unavailable', async () => {
      const originalIndexedDB = global.indexedDB;
      delete (global as any).indexedDB;
      
      const keyManager = WebVaultKeyManager.getInstance();
      const result = await keyManager.initialize();
      
      // Should fall back to localStorage
      expect(result).toBe(true);
      expect(keyManager.getStorageType()).toBe('localStorage');
      
      (global as any).indexedDB = originalIndexedDB;
    });
  });

  describe('Concurrency Safety', () => {
    test('handles concurrent encryptions safely', async () => {
      const files = Array.from({ length: 10 }, (_, i) => 
        new File([`content${i}`], `file${i}.txt`)
      );
      
      const promises = files.map(file => {
        const key = cryptoService.generateFileKey();
        return cryptoService.encryptFile(file, key);
      });
      
      const results = await Promise.all(promises);
      
      // All should succeed
      expect(results.every(r => r.success)).toBe(true);
      
      // Each should have unique headers
      const headers = results.map(r => r.header);
      const uniqueHeaders = new Set(headers.map(h => 
        h ? btoa(String.fromCharCode(...h)) : ''
      ));
      
      expect(uniqueHeaders.size).toBe(headers.length);
    });

    test('prevents race conditions in key rotation', async () => {
      const rotationPromises = [];
      
      // Try to rotate keys concurrently
      for (let i = 0; i < 3; i++) {
        const newKey = new Uint8Array(32).fill(i);
        rotationPromises.push(
          rotationService.rotateVaultKey(newKey)
        );
      }
      
      const results = await Promise.allSettled(rotationPromises);
      
      // Only one should succeed
      const successes = results.filter(r => 
        r.status === 'fulfilled' && r.value.success
      );
      
      expect(successes.length).toBe(1);
    });
  });
});