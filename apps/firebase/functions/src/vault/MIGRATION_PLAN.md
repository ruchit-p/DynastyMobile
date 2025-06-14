# Vault Monolith to Modular Handlers Migration Plan

## Overview
This document outlines the migration from the 4.5K LOC vault.ts monolith to modular, composable handlers that integrate with the vault-sdk package.

## Migration Status

### ✅ Completed (Phase 3A)
- **Directory Structure**: Created `src/vault/handlers/` with logical groupings
- **Access Control Module**: Extracted `verifyVaultItemAccess`, `getAccessibleVaultItems`, `updateDescendantPathsRecursive`
- **CRUD Handlers**: 
  - `createVaultFolder` - Creates new folders with sanitization
  - `renameVaultItem` - Renames files/folders with path updates  
  - `moveVaultItem` - Moves items with descendant path recursion
- **Item Management**:
  - `getVaultItems` - Lists vault items with access control
- **Encryption Handlers**:
  - `getVaultEncryptionStatus` - Checks user encryption status
  - `storeVaultItemEncryptionMetadata` - Stores E2EE metadata
  - `getVaultItemEncryptionMetadata` - Retrieves E2EE metadata
- **Versioned Router**: Backward compatible routing with `x-vault-sdk: v2` header detection

### 🔄 In Progress (Phase 3B) 
- File operations (upload/download handlers)
- Sharing operations (permissions, share links)
- Monitoring/analytics handlers
- Migration scripts for remaining functions

### ⏳ Pending (Phase 3C)
- SDK type integration (replace local types with SDK imports)
- Delete unused monolith functions after full migration
- Performance testing and optimization

## Architecture

### Modular Structure
```
src/vault/handlers/
├── crud/           # Create, rename, move operations
├── files/          # Upload, download, storage operations  
├── items/          # List, delete, restore operations
├── sharing/        # Permissions, share links
├── encryption/     # E2EE status and metadata
├── monitoring/     # Analytics, audit logs
├── migration/      # R2/B2 migration functions
├── access/         # Access control utilities
├── utils/          # Shared types and utilities
└── index.ts        # Barrel exports
```

### Versioning Strategy
- **V1 Functions**: Existing monolith functions (backward compatibility)
- **V2 Handlers**: New modular handlers (SDK integration)
- **Header Detection**: `x-vault-sdk: v2` routes to V2 handlers
- **Gradual Migration**: Function-by-function migration with fallback

## Single Source of Truth Strategy

### Current State
- Types duplicated between vault.ts and SDK
- Validation schemas separate in functions vs SDK

### Target State (Phase 4)
```typescript
// Functions will import from SDK
import {
  VaultItemSchema,
  type VaultItem,
  type CreateVaultFolderRequest,
} from "@dynasty/vault-sdk/types";

// Validation uses SDK schemas
const validatedData = VaultItemSchema.parse(request.data);
```

## Benefits Achieved
1. **Reduced Complexity**: 4.5K LOC monolith → modular 200-300 LOC handlers
2. **Better Testing**: Individual handlers can be unit tested in isolation  
3. **Type Safety**: SDK provides canonical types across client/server
4. **Maintainability**: Logical grouping makes code easier to understand
5. **Performance**: Smaller function bundles and faster cold starts

## Rollback Plan
- Remove `x-vault-sdk: v2` header → automatically falls back to V1
- No database schema changes made
- Full rollback possible without data loss

## Next Steps
1. Extract remaining file operations handlers
2. Migrate sharing and monitoring functions  
3. Add SDK type imports to replace local interfaces
4. Performance testing with V2 handlers
5. Gradual production rollout via feature flags