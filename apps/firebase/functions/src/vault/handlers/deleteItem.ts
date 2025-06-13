import { onCall } from 'firebase-functions/v2/https';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions/v2';
import { DEFAULT_REGION, FUNCTION_TIMEOUT } from '../../common';
import { createError, ErrorCode } from '../../utils/errors';
import { withAuth, requireAuth } from '../../middleware';
import { SECURITY_CONFIG } from '../../config/security-config';
import { createLogContext } from '../../utils/sanitization';
import { getCorsOptions } from '../../config/cors';
import { validateItemId } from '../../utils/vault-sanitization';
import { logVaultAuditEvent } from '../utils/audit';
import { z } from 'zod';

// Validation schema for delete item request
const DeleteItemRequestSchema = z.object({
  itemId: z.string().min(1),
  permanent: z.boolean().default(false), // Whether to permanently delete or soft delete
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
  storageProvider?: 'firebase' | 'r2' | 'b2';
  r2Bucket?: string;
  r2Key?: string;
}

/**
 * Check if user has delete access to the item
 */
function hasDeleteAccess(item: VaultItem, userId: string): boolean {
  // Owner always has delete access
  if (item.userId === userId) {
    return true;
  }

  // Check shared permissions (write permission includes delete)
  if (item.permissions?.canWrite?.includes(userId)) {
    return true;
  }

  return false;
}

/**
 * Clean up related collections for deleted items
 */
async function cleanupRelatedCollections(
  db: FirebaseFirestore.Firestore,
  itemIds: string[],
  userId: string
): Promise<void> {
  const batch = db.batch();
  let operationsCount = 0;
  const maxBatchSize = 500;

  try {
    // Clean up encryption metadata
    for (const itemId of itemIds) {
      if (operationsCount >= maxBatchSize) {
        await batch.commit();
        operationsCount = 0;
      }

      // Delete encryption metadata
      const encryptionMetadataRef = db.collection('encryptionMetadata').doc(itemId);
      batch.delete(encryptionMetadataRef);
      operationsCount++;

      // Delete share links
      const shareLinksQuery = await db
        .collection('vaultShareLinks')
        .where('itemId', '==', itemId)
        .get();

      shareLinksQuery.docs.forEach((doc) => {
        if (operationsCount < maxBatchSize) {
          batch.delete(doc.ref);
          operationsCount++;
        }
      });
    }

    if (operationsCount > 0) {
      await batch.commit();
    }
  } catch (error) {
    logger.warn('Failed to clean up related collections:', error);
  }
}

/**
 * Delete vault item - V2 handler for single item deletion
 */
export const deleteItem = onCall(
  {
    ...getCorsOptions(),
    region: DEFAULT_REGION,
    memory: '256MiB',
    timeoutSeconds: FUNCTION_TIMEOUT.SHORT,
  },
  withAuth(
    async (request) => {
      const uid = requireAuth(request);

      // Validate input
      const validatedData = DeleteItemRequestSchema.parse(request.data);
      const { itemId, permanent } = validatedData;

      // Validate item ID format
      if (!validateItemId(itemId)) {
        throw createError(ErrorCode.INVALID_ARGUMENT, 'Invalid item ID format');
      }

      const db = getFirestore();

      try {
        // Get the item to delete
        const docRef = db.collection('vaultItems').doc(itemId);
        const doc = await docRef.get();

        if (!doc.exists) {
          throw createError(ErrorCode.NOT_FOUND, 'Vault item not found');
        }

        const item = { id: doc.id, ...doc.data() } as VaultItem;

        // Check permissions
        if (!hasDeleteAccess(item, uid)) {
          throw createError(
            ErrorCode.PERMISSION_DENIED,
            "You don't have permission to delete this item"
          );
        }

        // SDK only handles files, not folders
        if (item.type !== 'file') {
          throw createError(ErrorCode.INVALID_ARGUMENT, 'Can only delete files, not folders');
        }

        if (permanent) {
          // Permanent deletion - remove from database completely
          await docRef.delete();

          // Clean up related collections
          await cleanupRelatedCollections(db, [itemId], uid);

          // Note: File storage cleanup is handled separately by scheduled functions
          // This is to avoid blocking the API call with potentially slow storage operations

          await logVaultAuditEvent(uid, 'permanent_delete_vault_item', itemId, {
            itemName: item.name,
            itemType: item.fileType || 'file',
            itemPath: item.path,
            storageProvider: item.storageProvider || 'firebase',
          });

          logger.info(
            'Permanently deleted vault item (v2)',
            createLogContext({
              itemId,
              itemName: item.name,
              userId: uid,
              version: 'v2',
            })
          );
        } else {
          // Soft deletion - mark as deleted
          await docRef.update({
            isDeleted: true,
            deletedAt: FieldValue.serverTimestamp(),
            updatedAt: FieldValue.serverTimestamp(),
          });

          await logVaultAuditEvent(uid, 'soft_delete_vault_item', itemId, {
            itemName: item.name,
            itemType: item.fileType || 'file',
            itemPath: item.path,
          });

          logger.info(
            'Soft deleted vault item (v2)',
            createLogContext({
              itemId,
              itemName: item.name,
              userId: uid,
              version: 'v2',
            })
          );
        }

        return { success: true, itemId, permanent };
      } catch (error) {
        logger.error('Failed to delete vault item:', error);
        await logVaultAuditEvent(uid, 'delete_vault_item_error', itemId, {
          error: error instanceof Error ? error.message : 'Unknown error',
          permanent,
        });
        throw error;
      }
    },
    'deleteItem',
    {
      authLevel: 'onboarded',
      rateLimitConfig: SECURITY_CONFIG.rateLimits.write,
    }
  )
);