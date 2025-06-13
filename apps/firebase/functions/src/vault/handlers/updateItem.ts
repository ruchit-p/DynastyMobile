import { onCall } from 'firebase-functions/v2/https';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions/v2';
import { DEFAULT_REGION, FUNCTION_TIMEOUT } from '../../common';
import { createError, ErrorCode } from '../../utils/errors';
import { withAuth, requireAuth } from '../../middleware';
import { SECURITY_CONFIG } from '../../config/security-config';
import { createLogContext } from '../../utils/sanitization';
import { getCorsOptions } from '../../config/cors';
import { sanitizeFileName } from '../../utils/vault-sanitization';
import { VaultItemSchema, UpdateVaultItemRequest } from '@dynasty/vault-sdk';
import { logVaultAuditEvent } from '../utils/audit';
import { z } from 'zod';

// Validation schema for update item request (using SDK schema as base)
const UpdateItemRequestSchema = z.object({
  itemId: z.string(),
  name: z.string().min(1).max(255).optional(),
  description: z.string().optional(),
  tags: z.array(z.string()).optional(),
  metadata: z.record(z.string(), z.any()).optional(),
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
  fileType?: 'image' | 'video' | 'audio' | 'document' | 'other';
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
  tags?: string[];
  description?: string;
  metadata?: Record<string, any>;
}

/**
 * Check if user has write access to the item
 */
function hasWriteAccess(item: VaultItem, userId: string): boolean {
  // Owner always has write access
  if (item.userId === userId) {
    return true;
  }

  // Check shared permissions
  if (item.permissions?.canWrite?.includes(userId)) {
    return true;
  }

  return false;
}

/**
 * Build updated vault path if name changes
 */
async function buildUpdatedPath(
  db: FirebaseFirestore.Firestore,
  currentPath: string,
  currentName: string,
  newName: string
): Promise<string> {
  if (newName === currentName) {
    return currentPath;
  }

  // Extract parent path and replace filename
  const pathParts = currentPath.split('/');
  pathParts[pathParts.length - 1] = newName;
  return pathParts.join('/');
}

/**
 * Convert Firestore VaultItem to SDK VaultItem format
 */
function convertToSdkFormat(item: VaultItem & { id: string }) {
  return {
    id: item.id,
    familyId: item.userId,
    name: item.name,
    description: item.description,
    type: (item.fileType || 'document') as any,
    tags: item.tags || [],
    fileUrl: item.downloadURL,
    fileSize: item.size,
    mimeType: item.mimeType,
    encryptionKey: undefined, // Never return actual encryption key
    encryptionIV: undefined,
    sharedWith: item.sharedWith || [],
    createdBy: item.userId,
    createdAt: item.createdAt.toDate().toISOString(),
    updatedAt: new Date().toISOString(), // Use current time for update
    lastModifiedBy: item.userId,
    metadata: {
      ...item.metadata,
      path: item.path,
      isEncrypted: item.isEncrypted,
    },
  };
}

/**
 * Update vault item - V2 handler that imports SDK schemas
 */
export const updateItem = onCall(
  {
    ...getCorsOptions(),
    region: DEFAULT_REGION,
    memory: '256MiB',
    timeoutSeconds: FUNCTION_TIMEOUT.SHORT,
  },
  withAuth(
    async (request) => {
      const uid = requireAuth(request);

      // Validate input using custom schema
      const validatedData = UpdateItemRequestSchema.parse(request.data);

      const { itemId, name, description, tags, metadata } = validatedData;
      const db = getFirestore();

      try {
        // Get the existing item
        const itemRef = db.collection('vaultItems').doc(itemId);
        const doc = await itemRef.get();

        if (!doc.exists) {
          throw createError(ErrorCode.NOT_FOUND, 'Vault item not found');
        }

        const item = { id: doc.id, ...doc.data() } as VaultItem & { id: string };

        // Check permissions
        if (!hasWriteAccess(item, uid)) {
          throw createError(
            ErrorCode.PERMISSION_DENIED,
            "You don't have permission to update this item"
          );
        }

        // Only allow updating files (not folders) for SDK
        if (item.type !== 'file') {
          throw createError(ErrorCode.INVALID_ARGUMENT, 'Can only update files, not folders');
        }

        // Prepare update data
        const updateData: any = {
          updatedAt: FieldValue.serverTimestamp(),
        };

        // Update name if provided
        if (name !== undefined) {
          const sanitizedName = sanitizeFileName(name);
          
          // Check for duplicate names in the same folder
          if (sanitizedName !== item.name) {
            const duplicateQuery = db
              .collection('vaultItems')
              .where('userId', '==', item.userId)
              .where('name', '==', sanitizedName)
              .where('parentId', '==', item.parentId)
              .where('isDeleted', '==', false);

            const duplicateSnapshot = await duplicateQuery.get();
            const duplicates = duplicateSnapshot.docs.filter(doc => doc.id !== itemId);
            
            if (duplicates.length > 0) {
              throw createError(
                ErrorCode.ALREADY_EXISTS,
                'An item with this name already exists in the folder'
              );
            }

            updateData.name = sanitizedName;
            
            // Update path if name changed
            updateData.path = await buildUpdatedPath(
              db,
              item.path,
              item.name,
              sanitizedName
            );
          }
        }

        // Update description if provided
        if (description !== undefined) {
          updateData.description = description || null;
        }

        // Update tags if provided
        if (tags !== undefined) {
          updateData.tags = tags;
        }

        // Update metadata if provided
        if (metadata !== undefined) {
          updateData.metadata = {
            ...item.metadata,
            ...metadata,
            lastModifiedVia: 'vault-sdk',
            sdkVersion: 'v2',
          };
        }

        // Perform the update
        await itemRef.update(updateData);

        // Get the updated item
        const updatedDoc = await itemRef.get();
        const updatedItem = { id: updatedDoc.id, ...updatedDoc.data() } as VaultItem & { id: string };

        // Convert to SDK format
        const responseItem = convertToSdkFormat(updatedItem);

        // Validate response using SDK schema
        const validatedResponse = VaultItemSchema.parse(responseItem);

        // Log audit event
        await logVaultAuditEvent(uid, 'update_vault_item', itemId, {
          itemName: updatedItem.name,
          changes: Object.keys(updateData).filter(k => k !== 'updatedAt'),
          originalName: item.name,
        });

        logger.info(
          'Updated vault item (v2)',
          createLogContext({
            itemId,
            itemName: updatedItem.name,
            userId: uid,
            changes: Object.keys(updateData).length - 1, // -1 for updatedAt
            version: 'v2',
          })
        );

        return validatedResponse;
      } catch (error) {
        logger.error('Failed to update vault item:', error);
        await logVaultAuditEvent(uid, 'update_vault_item_error', itemId, {
          error: error instanceof Error ? error.message : 'Unknown error',
        });
        throw error;
      }
    },
    'updateItem',
    {
      authLevel: 'onboarded',
      rateLimitConfig: SECURITY_CONFIG.rateLimits.write,
    }
  )
);