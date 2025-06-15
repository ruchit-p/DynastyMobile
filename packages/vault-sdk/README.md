# Dynasty Vault SDK

A unified SDK for Dynasty's secure vault functionality, providing cross-platform support for web and mobile applications.

## Overview

The Dynasty Vault SDK provides a consistent API for:
- Secure file storage and encryption
- Real-time synchronization
- File sharing and permissions
- Audit logging and monitoring
- Cross-platform compatibility (Web & React Native)

## Installation

```bash
# Using yarn (recommended for Dynasty monorepo)
yarn add @dynasty/vault-sdk

# Using npm
npm install @dynasty/vault-sdk
```

## Quick Start

### Basic Setup

```typescript
import { createVaultApiClient, useVault } from '@dynasty/vault-sdk';
import { initializeApp } from 'firebase/app';

// Initialize Firebase
const firebaseApp = initializeApp(firebaseConfig);

// Create API client
const vaultClient = createVaultApiClient({
  app: firebaseApp,
  region: 'us-central1',
  timeout: 30000,
  maxRetries: 3,
  enableValidation: true,
});

// Or use React hooks
function MyComponent() {
  const vault = useVault({
    firebaseApp,
    region: 'us-central1',
  });

  // Use vault operations
  const { data: items } = vault.useVaultItems();
}
```

### File Upload

```typescript
// Direct API usage
const uploadedItem = await vaultClient.addFile({
  itemId: 'unique-id',
  name: 'document.pdf',
  storagePath: 'uploads/document.pdf',
  fileType: 'document',
  size: 1024000,
  mimeType: 'application/pdf',
  isEncrypted: true,
});

// React hook usage
function UploadComponent() {
  const vault = useVault({ firebaseApp });
  const uploadMutation = vault.addFile();

  const handleUpload = async (file: File) => {
    const result = await uploadMutation.mutateAsync({
      itemId: generateId(),
      name: file.name,
      storagePath: `uploads/${file.name}`,
      fileType: getFileType(file.type),
      size: file.size,
      mimeType: file.type,
    });
  };
}
```

### Real-time Subscriptions

```typescript
import { createVaultRealtimeService } from '@dynasty/vault-sdk';

// Create realtime service
const realtimeService = createVaultRealtimeService({
  app: firebaseApp,
  enableOfflinePersistence: true,
});

// Subscribe to vault items
const unsubscribe = realtimeService.subscribeToVaultItems(
  userId,
  { 
    parentId: null,
    includeDeleted: false,
  },
  (items) => {
    console.log('Vault items updated:', items);
  },
  (error) => {
    console.error('Subscription error:', error);
  }
);

// Clean up
unsubscribe();
```

## API Reference

### VaultApiClient

The main client for interacting with vault functions.

#### Methods

##### File Operations
- `addFile(request)` - Register a new file in the vault
- `getUploadSignedUrl(request)` - Get a signed URL for file upload
- `getDownloadUrl(request)` - Get a signed URL for file download
- `updateFile(request)` - Update file content
- `deleteItem(request)` - Delete or soft-delete a file

##### Folder Operations
- `createFolder(request)` - Create a new folder
- `moveItem(request)` - Move item to another folder
- `renameItem(request)` - Rename a file or folder

##### Browsing & Search
- `getItems(request)` - List items in a folder
- `getDeletedItems()` - Get soft-deleted items
- `searchItems(request)` - Search vault items
- `restoreItem(request)` - Restore deleted item

##### Sharing & Permissions
- `shareItem(request)` - Share item with users
- `createShareLink(request)` - Create public share link
- `accessShareLink(request)` - Access item via share link
- `revokeShareLink(request)` - Revoke a share link
- `updateItemPermissions(request)` - Update user permissions

##### Encryption & Security
- `getEncryptionStatus()` - Check encryption status
- `storeEncryptionMetadata(request)` - Store encryption metadata
- `getEncryptionMetadata(request)` - Retrieve encryption metadata
- `rotateEncryptionKey(request)` - Rotate encryption keys

##### Monitoring & Analytics
- `getStorageInfo()` - Get storage usage information
- `getAuditLogs(request)` - Retrieve audit logs
- `getSystemStats()` - Get system-wide statistics

### React Hooks

#### useVault

Main hook for vault operations with React Query integration.

```typescript
const vault = useVault(config, errorHandler);

// Available hooks
vault.useVaultItems(request, options);
vault.useDeletedVaultItems(options);
vault.useVaultSearch(request, options);
vault.useVaultStorageInfo(options);
vault.useVaultEncryptionStatus(options);

// Mutations
vault.createFolder();
vault.addFile();
vault.renameItem();
vault.moveItem();
vault.deleteItem();
vault.restoreItem();

// Direct access
vault.apiClient;
vault.realtimeService;
```

#### useVaultFile

Hook for file upload/download operations with progress tracking.

```typescript
const { uploadFile, downloadFile } = useVaultFile(config);

// Upload with progress
const upload = uploadFile({
  onProgress: (progress) => {
    console.log(`Uploaded: ${progress.percentage}%`);
  },
});

const result = await upload.mutateAsync(file);
```

#### useVaultEncryption

Hook for encryption operations.

```typescript
const encryption = useVaultEncryption(config);

// Check status
const { data: status } = encryption.useEncryptionStatus();

// Store metadata
await encryption.storeMetadata({
  itemId: 'file-id',
  encryptionMetadata: metadata,
});
```

#### useVaultSharing

Hook for sharing operations.

```typescript
const sharing = useVaultSharing(config);

// Share with users
await sharing.shareItem({
  itemId: 'file-id',
  userIds: ['user1', 'user2'],
  permissions: 'read',
});

// Create share link
const link = await sharing.createShareLink({
  itemId: 'file-id',
  expiresAt: '2024-12-31',
  allowDownload: true,
});
```

## Platform-Specific Configuration

### Web

```typescript
import { createWebPlatformAdapter } from '@dynasty/vault-sdk/platform/web';

const adapter = createWebPlatformAdapter({
  storage: 'indexeddb', // or 'localstorage'
  encryption: 'webcrypto',
});
```

### React Native

```typescript
import { createNativePlatformAdapter } from '@dynasty/vault-sdk/platform/native';

const adapter = createNativePlatformAdapter({
  storage: 'securestore',
  encryption: 'native',
});
```

## Error Handling

The SDK provides structured error handling with typed errors:

```typescript
import { VaultError, VaultErrorCode } from '@dynasty/vault-sdk';

try {
  await vaultClient.addFile(request);
} catch (error) {
  if (error instanceof VaultError) {
    switch (error.code) {
      case VaultErrorCode.PERMISSION_DENIED:
        // Handle permission error
        break;
      case VaultErrorCode.FILE_TOO_LARGE:
        // Handle file size error
        break;
      default:
        // Handle other errors
    }
  }
}
```

## Best Practices

1. **Use React Hooks**: Prefer hooks over direct API calls for automatic caching and state management
2. **Handle Offline**: Enable offline persistence for better user experience
3. **Monitor Performance**: Use the built-in performance monitoring
4. **Secure Keys**: Never expose encryption keys in client code
5. **Rate Limiting**: Implement appropriate rate limiting for API calls

## Migration from Legacy VaultService

If migrating from the legacy VaultService:

```typescript
// Old
import { vaultService } from '@/services/VaultService';
await vaultService.uploadFile(file);

// New
import { vaultSDKService } from '@/services/VaultSDKService';
await vaultSDKService.uploadFile(file);
```

The VaultSDKService provides a compatibility layer with the same API as the legacy service.

## Contributing

See the main Dynasty repository for contribution guidelines.

## License

MIT - See LICENSE file in the root repository