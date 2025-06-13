# Vault Migration Guide: VaultService → vault-sdk

This guide explains how to migrate from the existing VaultService to the new vault-sdk.

## Overview

The vault-sdk provides a modern, hook-based API that integrates with React Query for better state management and caching. The migration can be done gradually, component by component.

## Key Differences

### 1. **Service Pattern → Hook Pattern**

**Before (VaultService):**
```typescript
const vaultService = getVaultService();
await vaultService.initialize();
const items = await vaultService.getItems(parentId);
```

**After (vault-sdk):**
```typescript
const { items, isLoading, error } = useVault({ familyId });
// Data is automatically fetched and cached
```

### 2. **Manual State Management → React Query**

**Before:**
```typescript
const [items, setItems] = useState([]);
const [isLoading, setIsLoading] = useState(true);

const fetchItems = async () => {
  setIsLoading(true);
  try {
    const items = await vaultService.getItems();
    setItems(items);
  } catch (error) {
    handleError(error);
  } finally {
    setIsLoading(false);
  }
};
```

**After:**
```typescript
const { items, isLoading, error, refetch } = useVault({ familyId });
// State management is handled automatically
```

### 3. **Error Handling**

**Before:**
```typescript
try {
  await vaultService.uploadFile(...);
} catch (error) {
  handleError(error, { severity: ErrorSeverity.ERROR });
}
```

**After:**
```typescript
// Error handling is built into the hook
const { uploadFile } = useVaultFile({ 
  errorHandler: {
    handleError: (error, message) => {
      // Your error handling logic
    }
  }
});
```

## Migration Steps

### Step 1: Add VaultProvider

Wrap your app with the VaultProvider:

```typescript
// In your App.tsx or root component
import { VaultProvider } from './src/components/providers/VaultProvider';

function App() {
  return (
    <AuthProvider>
      <VaultProvider>
        {/* Your app components */}
      </VaultProvider>
    </AuthProvider>
  );
}
```

### Step 2: Replace VaultService Imports

**Before:**
```typescript
import { getVaultService, VaultItem } from '../../src/services/VaultService';
```

**After:**
```typescript
import { useVault } from '../../src/components/providers/VaultProvider';
```

### Step 3: Update Component Logic

**Before:**
```typescript
const MyComponent = () => {
  const [items, setItems] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const loadItems = async () => {
      const vaultService = getVaultService();
      await vaultService.initialize();
      const items = await vaultService.getItems();
      setItems(items);
      setIsLoading(false);
    };
    loadItems();
  }, []);

  // Component logic...
};
```

**After:**
```typescript
const MyComponent = () => {
  const { vaultClient } = useVault();
  const { items, isLoading } = vaultClient || {};

  // Component logic...
};
```

### Step 4: Update CRUD Operations

#### Listing Items
**Before:**
```typescript
const items = await vaultService.getItems(parentId);
```

**After:**
```typescript
// Items are available directly from the hook
const filteredItems = items.filter(item => 
  item.metadata?.parentId === parentId
);
```

#### Uploading Files
**Before:**
```typescript
await vaultService.uploadFile(uri, name, mimeType, parentId, {
  onProgress: (progress) => console.log(progress),
});
```

**After:**
```typescript
await vaultClient.uploadFileAsync({
  file: { uri, name, type: mimeType },
  familyId: user.uid,
  vaultItem: {
    name,
    type: 'document',
    metadata: { parentId },
  },
  onProgress: (progress) => console.log(progress),
});
```

#### Deleting Items
**Before:**
```typescript
await vaultService.bulkDelete(itemIds);
```

**After:**
```typescript
await Promise.all(
  itemIds.map(id => vaultClient.deleteFileAsync({
    vaultItem: items.find(item => item.id === id),
    familyId: user.uid,
  }))
);
```

## Migration Strategy

### Option 1: Gradual Migration (Recommended)

1. Keep both VaultService and vault-sdk running side by side
2. Use VaultServiceV2 as a bridge
3. Migrate screens one at a time
4. Remove old code once all screens are migrated

### Option 2: Complete Rewrite

1. Create new versions of all vault screens (e.g., vaultV2.tsx)
2. Test thoroughly
3. Switch all at once
4. Remove old code

## Common Patterns

### Search and Filter
```typescript
// SDK items are always available, filter them client-side
const displayItems = useMemo(() => {
  return items
    .filter(item => item.name.includes(searchQuery))
    .filter(item => item.metadata?.parentId === currentFolder)
    .sort((a, b) => a.name.localeCompare(b.name));
}, [items, searchQuery, currentFolder]);
```

### Progress Tracking
```typescript
const { uploadProgress, getUploadProgress } = vaultClient;

// In your UI
{Object.entries(uploadProgress).map(([id, progress]) => (
  <ProgressBar key={id} progress={progress} />
))}
```

### Offline Support
The SDK uses React Query which provides built-in offline support:
- Cached data is available offline
- Mutations are queued and synced when online
- Optimistic updates for better UX

## Troubleshooting

### Issue: "VaultClient not initialized"
Make sure you're using the hook inside a component wrapped with VaultProvider.

### Issue: Type mismatches
The SDK uses different type names:
- `VaultItem` → SDK item type
- `familyId` instead of `userId`
- `type` is more specific (document, photo, video, etc.)

### Issue: Missing methods
Some VaultService methods don't have direct SDK equivalents:
- `getDeletedItems()` - Query Firebase directly
- `getStorageInfo()` - Use Firebase function
- `emptyTrash()` - Use Firebase function

## Benefits of Migration

1. **Better Performance**: React Query caching reduces API calls
2. **Simpler Code**: Less boilerplate, automatic state management
3. **Type Safety**: Full TypeScript support with Zod validation
4. **Offline Support**: Built-in offline capabilities
5. **Optimistic Updates**: Better UX with immediate feedback
6. **Error Boundaries**: Automatic error handling and recovery

## Next Steps

1. Start with a simple screen (e.g., vault storage info)
2. Test thoroughly
3. Gather feedback
4. Continue migration
5. Remove old code once complete