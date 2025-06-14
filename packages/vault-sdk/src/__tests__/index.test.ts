/**
 * Basic smoke tests for the Vault SDK
 */

import {
  // Types
  VaultItem,
  VaultErrorCode,
  VaultFileType,
  
  // API Client
  createVaultApiClient,
  
  // Hooks (just import, don't test React hooks here)
  vaultQueryKeys,
  
  // Platform
  detectPlatform,
  webPlatformAdapter,
  
  // Utils
  createVaultError,
  normalizeVaultError,
  
  // Version
  VAULT_SDK_VERSION,
} from '../index';

describe('Vault SDK Exports', () => {
  test('should export version information', () => {
    expect(VAULT_SDK_VERSION).toBe('0.1.0');
  });

  test('should export types correctly', () => {
    expect(VaultErrorCode.UNAUTHENTICATED).toBe('UNAUTHENTICATED');
    expect(VaultErrorCode.NOT_FOUND).toBe('NOT_FOUND');
  });

  test('should export API client factory', () => {
    expect(typeof createVaultApiClient).toBe('function');
  });

  test('should export query keys', () => {
    expect(vaultQueryKeys.all).toEqual(['vault']);
    expect(vaultQueryKeys.items()).toEqual(['vault', 'items', undefined]);
    expect(vaultQueryKeys.items('folder1')).toEqual(['vault', 'items', 'folder1']);
  });

  test('should export platform utilities', () => {
    expect(typeof detectPlatform).toBe('function');
    expect(webPlatformAdapter.platform.isWeb).toBe(true);
    expect(webPlatformAdapter.platform.isReactNative).toBe(false);
  });

  test('should export error utilities', () => {
    expect(typeof createVaultError).toBe('function');
    expect(typeof normalizeVaultError).toBe('function');

    const error = createVaultError(VaultErrorCode.NOT_FOUND, 'Test error');
    expect(error.code).toBe(VaultErrorCode.NOT_FOUND);
    expect(error.message).toBe('Test error');
  });

  test('should detect web platform correctly', () => {
    const platform = detectPlatform();
    expect(platform.isWeb).toBe(true);
    expect(platform.isReactNative).toBe(false);
  });
});

describe('VaultItem Schema Validation', () => {
  test('should validate basic vault item structure', () => {
    const vaultItem: VaultItem = {
      id: 'test-id',
      userId: 'user-123',
      ownerId: 'user-123',
      name: 'Test File.pdf',
      type: 'file',
      parentId: null,
      path: '/Test File.pdf',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      isDeleted: false,
      fileType: 'document',
      size: 1024,
      mimeType: 'application/pdf',
    };

    expect(vaultItem.id).toBe('test-id');
    expect(vaultItem.type).toBe('file');
    expect(vaultItem.fileType).toBe('document');
  });
});

describe('Error Handling', () => {
  test('should create vault errors correctly', () => {
    const error = createVaultError(
      VaultErrorCode.FILE_TOO_LARGE,
      'File exceeds maximum size',
      413,
      { maxSize: 100 * 1024 * 1024 }
    );

    expect(error.code).toBe(VaultErrorCode.FILE_TOO_LARGE);
    expect(error.message).toBe('File exceeds maximum size');
    expect(error.statusCode).toBe(413);
    expect(error.context?.maxSize).toBe(100 * 1024 * 1024);
  });

  test('should normalize various error types', () => {
    const regularError = new Error('Regular error');
    const normalized = normalizeVaultError(regularError);
    
    expect(normalized.code).toBe(VaultErrorCode.UNKNOWN_ERROR);
    expect(normalized.message).toBe('Regular error');
  });
});