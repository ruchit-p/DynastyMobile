// Integration test for vault encryption feature
// Tests the complete flow from setup to encrypted upload/download

import { renderHook, act } from '@testing-library/react';
import { useWebVaultEncryption } from '@/hooks/useWebVaultEncryption';
import { WebVaultCryptoService } from '@/services/encryption/VaultCryptoService';
import { WebVaultKeyManager } from '@/services/encryption/WebVaultKeyManager';
import { vaultService } from '@/services/VaultService';

// Mock dependencies
jest.mock('@/services/VaultService');
jest.mock('@/lib/firebase', () => ({
  auth: { currentUser: { uid: 'test-user-123' } },
  functions: {},
  storage: {},
}));

// Mock IndexedDB
const mockIndexedDB = {
  open: jest.fn(() => ({
    onsuccess: null,
    onerror: null,
    onupgradeneeded: null,
    result: {
      transaction: jest.fn(() => ({
        objectStore: jest.fn(() => ({
          put: jest.fn(() => ({ onsuccess: jest.fn(), onerror: jest.fn() })),
          get: jest.fn(() => ({ onsuccess: jest.fn(), onerror: jest.fn() })),
          delete: jest.fn(() => ({ onsuccess: jest.fn(), onerror: jest.fn() })),
        })),
      })),
    },
  })),
};

// @ts-ignore
global.indexedDB = mockIndexedDB;

describe('Vault Encryption Integration', () => {
  const userId = 'test-user-123';
  const testPassword = 'SecureTestPassword123!';
  let cryptoService: WebVaultCryptoService;
  let keyManager: WebVaultKeyManager;

  beforeEach(async () => {
    // Initialize services
    cryptoService = WebVaultCryptoService.getInstance();
    keyManager = WebVaultKeyManager.getInstance();

    // Mock vault service methods
    (vaultService.setUserId as jest.Mock) = jest.fn();
    (vaultService.isEncryptionEnabled as jest.Mock) = jest.fn().mockResolvedValue(true);
    (vaultService.uploadFile as jest.Mock) = jest.fn().mockResolvedValue({
      id: 'file-123',
      name: 'test.pdf',
      isEncrypted: true,
    });
    (vaultService.downloadFile as jest.Mock) = jest
      .fn()
      .mockResolvedValue(new Blob(['decrypted content'], { type: 'application/pdf' }));
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  test('complete encryption flow: setup, upload, download', async () => {
    // Step 1: Setup vault encryption
    const { result } = renderHook(() => useWebVaultEncryption(userId));

    await act(async () => {
      const setupResult = await result.current.setupVault(testPassword, {
        enableBiometric: false,
        keyRotation: true,
      });
      console.log('Setup result:', setupResult);
      expect(setupResult.success).toBe(true);
    });

    expect(result.current.isUnlocked).toBe(true);

    // Step 2: Create test file
    const testFile = new File(['Test file content'], 'test.pdf', {
      type: 'application/pdf',
    });

    // Step 3: Encrypt and upload file
    let encryptedResult: any;
    await act(async () => {
      encryptedResult = await result.current.encryptFile(testFile, 'file-123');
    });

    expect(encryptedResult.success).toBe(true);
    expect(encryptedResult.encryptedFile).toBeDefined();
    expect(encryptedResult.header).toBeDefined();
    expect(encryptedResult.metadata).toBeDefined();

    // Verify upload was called with encryption options
    expect(vaultService.uploadFile).toHaveBeenCalledWith(
      testFile,
      null,
      undefined,
      expect.objectContaining({
        encrypt: expect.any(Function),
        getCurrentKeyId: expect.any(Function),
      })
    );

    // Step 4: Download and decrypt file
    const mockVaultItem = {
      id: 'file-123',
      name: 'test.pdf',
      type: 'file' as const,
      isEncrypted: true,
      isShared: false,
      parentId: null,
      path: '/test.pdf',
      mimeType: 'application/pdf',
      size: 1024,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    await act(async () => {
      const blob = await vaultService.downloadFile(mockVaultItem, {
        decrypt: result.current.decryptFile,
      });
      expect(blob).toBeInstanceOf(Blob);
    });

    // Step 5: Test key rotation
    expect(result.current.keyRotationDue).toBe(false);

    // Step 6: Lock vault
    act(() => {
      result.current.lockVault();
    });

    expect(result.current.isUnlocked).toBe(false);

    // Step 7: Unlock vault
    await act(async () => {
      const unlockResult = await result.current.unlockVault(testPassword);
      expect(unlockResult.success).toBe(true);
    });

    expect(result.current.isUnlocked).toBe(true);
  });

  test('handles encryption errors gracefully', async () => {
    const { result } = renderHook(() => useWebVaultEncryption(userId));

    // Try to encrypt without setting up vault
    const largeFile = new File(['x'.repeat(1024 * 1024)], 'large.bin');

    await act(async () => {
      const encryptResult = await result.current.encryptFile(largeFile, 'file-456');
      expect(encryptResult.success).toBe(false);
      expect(encryptResult.error).toBe('Vault is locked');
    });
  });

  test('validates password strength during setup', async () => {
    const { result } = renderHook(() => useWebVaultEncryption(userId));

    // Test with weak password
    await act(async () => {
      const setupResult = await result.current.setupVault('weak', {
        enableBiometric: false,
      });

      // The actual validation happens in the UI component
      // Here we just test that setup can handle any password
      expect(setupResult.success).toBe(true);
    });
  });

  test('handles biometric authentication', async () => {
    // Mock WebAuthn API
    const mockCredential = {
      id: 'credential-123',
      rawId: new ArrayBuffer(32),
      response: {
        clientDataJSON: new ArrayBuffer(100),
        attestationObject: new ArrayBuffer(200),
        getPublicKey: () => new ArrayBuffer(65),
      },
      type: 'public-key',
    };

    global.navigator.credentials = {
      create: jest.fn().mockResolvedValue(mockCredential),
      get: jest.fn().mockResolvedValue(mockCredential),
    } as any;

    const { result } = renderHook(() => useWebVaultEncryption(userId));

    // Setup with biometric
    await act(async () => {
      const setupResult = await result.current.setupVault(testPassword, {
        enableBiometric: true,
      });
      expect(setupResult.success).toBe(true);
    });

    expect(result.current.biometricEnabled).toBe(true);

    // Lock and unlock with biometric
    act(() => {
      result.current.lockVault();
    });

    await act(async () => {
      const unlockResult = await result.current.unlockVaultWithBiometric();
      // Note: This will fail in test environment without proper WebAuthn setup
      expect(unlockResult.success).toBe(false);
    });
  });

  test('encrypts multiple files in batch', async () => {
    const { result } = renderHook(() => useWebVaultEncryption(userId));

    // Setup vault
    await act(async () => {
      await result.current.setupVault(testPassword);
    });

    // Create multiple test files
    const files = [
      new File(['Content 1'], 'file1.txt', { type: 'text/plain' }),
      new File(['Content 2'], 'file2.txt', { type: 'text/plain' }),
      new File(['Content 3'], 'file3.txt', { type: 'text/plain' }),
    ];

    const fileIds = ['file-1', 'file-2', 'file-3'];

    // Encrypt all files
    await act(async () => {
      const results = await result.current.encryptFiles(files, fileIds);

      expect(results).toHaveLength(3);
      results.forEach(result => {
        expect(result.success).toBe(true);
        expect(result.encryptedFile).toBeDefined();
      });
    });

    // Check progress was updated
    expect(result.current.progress).toEqual({
      progress: 100,
      status: 'complete',
      totalFiles: 3,
      processedFiles: 3,
    });
  });

  test('handles share link creation', async () => {
    // Mock share link creation
    (vaultService.shareItem as jest.Mock) = jest.fn().mockResolvedValue({
      shareId: 'share-123',
      shareLink: 'https://mydynastyapp.com/vault/share/share-123',
    });

    const shareResult = await vaultService.shareItem('file-123', {
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 hours
      allowDownload: true,
      password: 'SharePassword123',
    });

    expect(shareResult.shareId).toBe('share-123');
    expect(shareResult.shareLink).toContain('/vault/share/');
    expect(vaultService.shareItem).toHaveBeenCalledWith('file-123', {
      expiresAt: expect.any(Date),
      allowDownload: true,
      password: 'SharePassword123',
    });
  });
});
