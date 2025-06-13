import { onCall } from 'firebase-functions/v2/https';
import { getFirestore, FieldValue, FieldPath } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions/v2';
import { DEFAULT_REGION, FUNCTION_TIMEOUT } from '../../common';
import { createError, ErrorCode } from '../../utils/errors';
import { withAuth, requireAuth } from '../../middleware';
import { SECURITY_CONFIG } from '../../config/security-config';
import { createLogContext } from '../../utils/sanitization';
import { getCorsOptions } from '../../config/cors';
import { validateItemId } from '../../utils/vault-sanitization';
import { ShareVaultItemRequest } from '@dynasty/vault-sdk';
import { logVaultAuditEvent } from '../utils/audit';
import { z } from 'zod';

// Validation schema for share item request (using SDK schema as base)
const ShareItemRequestSchema = z.object({
  itemId: z.string().min(1),
  sharedWith: z.array(z.string().min(1)),
  permissions: z.enum(['view', 'edit']).default('view'),
  expiresAt: z.string().datetime().optional(),
});

// Type definition for existing vault item
interface VaultItem {
  id: string;
  userId: string;
  ownerId: string;
  name: string;
  type: 'folder' | 'file';
  parentId: string | null;
  path: string;
  createdAt: FirebaseFirestore.Timestamp;
  updatedAt: FirebaseFirestore.Timestamp;
  fileType?: string;
  size?: number;
  storagePath?: string;
  downloadURL?: string;
  mimeType?: string;
  isDeleted: boolean;
  isEncrypted?: boolean;
  encryptionKeyId?: string;
  permissions?: {
    canRead: string[];
    canWrite: string[];
  };
  sharedWith?: string[];
}

/**
 * Validate that all user IDs exist in the system
 */
async function validateUserIds(
  db: FirebaseFirestore.Firestore,
  userIds: string[]
): Promise<void> {
  if (userIds.length === 0) {
    return;
  }

  // Firestore 'in' queries are limited to 10 items
  const chunks = [];
  for (let i = 0; i < userIds.length; i += 10) {
    chunks.push(userIds.slice(i, i + 10));
  }

  for (const chunk of chunks) {
    const usersSnapshot = await db
      .collection('users')
      .where(FieldPath.documentId(), 'in', chunk)
      .get();

    if (usersSnapshot.size !== chunk.length) {
      const foundUserIds = usersSnapshot.docs.map(doc => doc.id);
      const missingUserIds = chunk.filter(id => !foundUserIds.includes(id));
      throw createError(
        ErrorCode.INVALID_REQUEST,
        `User IDs not found: ${missingUserIds.join(', ')}`
      );
    }
  }
}

/**
 * Update sharing permissions on the item
 */
function updateSharingPermissions(
  currentSharedWith: string[],
  currentPermissions: { canRead: string[]; canWrite: string[] },
  newUserIds: string[],
  permissionLevel: 'view' | 'edit'
): { sharedWith: string[]; permissions: { canRead: string[]; canWrite: string[] } } {
  // Remove duplicates and merge
  const newSharedWith = Array.from(new Set([...currentSharedWith, ...newUserIds]));
  
  let newCanRead = [...(currentPermissions.canRead || [])];
  let newCanWrite = [...(currentPermissions.canWrite || [])];

  if (permissionLevel === 'view') {
    // Grant read permission
    newCanRead = Array.from(new Set([...newCanRead, ...newUserIds]));
  } else if (permissionLevel === 'edit') {
    // Grant both read and write permissions
    newCanRead = Array.from(new Set([...newCanRead, ...newUserIds]));
    newCanWrite = Array.from(new Set([...newCanWrite, ...newUserIds]));
  }

  return {
    sharedWith: newSharedWith,
    permissions: {
      canRead: newCanRead,
      canWrite: newCanWrite,
    },
  };
}

/**
 * Share vault item - V2 handler that imports SDK schemas
 */
export const shareItem = onCall(
  {
    ...getCorsOptions(),
    region: DEFAULT_REGION,
    memory: '256MiB',
    timeoutSeconds: FUNCTION_TIMEOUT.SHORT,
  },
  withAuth(
    async (request) => {
      const uid = requireAuth(request);

      // Validate input using SDK-compatible schema
      const validatedData = ShareItemRequestSchema.parse(request.data);
      const { itemId, sharedWith: userIds, permissions, expiresAt } = validatedData;

      // Validate item ID format
      if (!validateItemId(itemId)) {
        throw createError(ErrorCode.INVALID_ARGUMENT, 'Invalid item ID format');
      }

      const db = getFirestore();

      try {
        // Get the item to share
        const itemRef = db.collection('vaultItems').doc(itemId);
        const doc = await itemRef.get();

        if (!doc.exists) {
          throw createError(ErrorCode.NOT_FOUND, 'Vault item not found');
        }

        const item = doc.data() as VaultItem;

        // Check permissions - only owner can share
        if (item.userId !== uid) {
          throw createError(
            ErrorCode.PERMISSION_DENIED,
            "You don't have permission to share this item"
          );
        }

        // SDK only handles files, not folders
        if (item.type !== 'file') {
          throw createError(ErrorCode.INVALID_ARGUMENT, 'Can only share files, not folders');
        }

        // Remove the owner from the list if they're trying to share with themselves
        const filteredUserIds = userIds.filter(userId => userId !== uid);
        
        if (filteredUserIds.length === 0) {
          throw createError(ErrorCode.INVALID_ARGUMENT, 'Cannot share item with yourself');
        }

        // Validate that all user IDs exist
        await validateUserIds(db, filteredUserIds);

        // Update sharing permissions
        const currentSharedWith = item.sharedWith || [];
        const currentPermissions = item.permissions || { canRead: [], canWrite: [] };
        
        const permissionLevel = permissions === 'edit' ? 'edit' : 'view';
        const updatedSharing = updateSharingPermissions(
          currentSharedWith,
          currentPermissions,
          filteredUserIds,
          permissionLevel
        );

        // Prepare update data
        const updateData: any = {
          sharedWith: updatedSharing.sharedWith,
          permissions: updatedSharing.permissions,
          updatedAt: FieldValue.serverTimestamp(),
        };

        // Add expiration if provided
        if (expiresAt) {
          updateData.shareExpiresAt = new Date(expiresAt);
        }

        // Update the item
        await itemRef.update(updateData);

        // Create audit log entries for each shared user
        const auditPromises = filteredUserIds.map(async (targetUserId) => {
          await logVaultAuditEvent(uid, 'share_vault_item', itemId, {
            targetUserId,
            permissions: permissionLevel,
            itemName: item.name,
            itemType: item.fileType || 'file',
            expiresAt: expiresAt || null,
          });
        });

        await Promise.all(auditPromises);

        logger.info(
          'Shared vault item (v2)',
          createLogContext({
            itemId,
            itemName: item.name,
            sharedWithCount: filteredUserIds.length,
            permissions: permissionLevel,
            userId: uid,
            version: 'v2',
          })
        );

        return {
          success: true,
          itemId,
          sharedWith: updatedSharing.sharedWith,
          permissions: updatedSharing.permissions,
        };
      } catch (error) {
        logger.error('Failed to share vault item:', error);
        await logVaultAuditEvent(uid, 'share_vault_item_error', itemId, {
          error: error instanceof Error ? error.message : 'Unknown error',
          targetUserCount: userIds.length,
        });
        throw error;
      }
    },
    'shareItem',
    {
      authLevel: 'onboarded',
      rateLimitConfig: SECURITY_CONFIG.rateLimits.write,
    }
  )
);