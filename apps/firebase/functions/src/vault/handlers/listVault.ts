import { onCall } from 'firebase-functions/v2/https';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions/v2';
import { DEFAULT_REGION, FUNCTION_TIMEOUT } from '../../common';
import { withAuth, requireAuth } from '../../middleware';
import { SECURITY_CONFIG } from '../../config/security-config';
import { validateRequest } from '../../utils/request-validator';
import { VALIDATION_SCHEMAS } from '../../config/validation-schemas';
import { createLogContext } from '../../utils/sanitization';
import { getCorsOptions } from '../../config/cors';
import { VaultItemsSchema } from '@dynasty/vault-sdk';
import { logVaultAuditEvent } from '../utils/audit';

// Type definition matching existing vault schema
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
  accessLevel?: 'owner' | 'read' | 'write';
}

/**
 * Get all accessible vault items for a user in a specific folder
 */
async function getAccessibleVaultItems(
  db: FirebaseFirestore.Firestore,
  userId: string,
  parentId: string | null = null
): Promise<VaultItem[]> {
  const ownedItemsQuery = db
    .collection('vaultItems')
    .where('userId', '==', userId)
    .where('isDeleted', '==', false)
    .where('parentId', '==', parentId);

  const sharedItemsQuery = db
    .collection('vaultItems')
    .where('sharedWith', 'array-contains', userId)
    .where('isDeleted', '==', false)
    .where('parentId', '==', parentId);

  const [ownedSnapshot, sharedSnapshot] = await Promise.all([
    ownedItemsQuery.get(),
    sharedItemsQuery.get(),
  ]);

  const itemsMap = new Map<string, VaultItem>();

  // Add owned items
  ownedSnapshot.docs.forEach((doc) => {
    const item = { id: doc.id, ...doc.data() } as VaultItem;
    itemsMap.set(doc.id, { ...item, accessLevel: 'owner' as const });
  });

  // Add shared items (if not already owned)
  sharedSnapshot.docs.forEach((doc) => {
    if (!itemsMap.has(doc.id)) {
      const item = { id: doc.id, ...doc.data() } as VaultItem;
      const permissions = item.permissions || { canRead: [], canWrite: [] };

      // Determine access level
      let accessLevel: 'read' | 'write' = 'read';
      if (permissions.canWrite?.includes(userId)) {
        accessLevel = 'write';
      }

      itemsMap.set(doc.id, { ...item, accessLevel });
    }
  });

  return Array.from(itemsMap.values());
}

/**
 * Convert Firestore VaultItem to SDK VaultItem format
 */
function convertToSdkFormat(item: VaultItem) {
  return {
    id: item.id,
    familyId: item.userId, // Map userId to familyId for SDK compatibility
    name: item.name,
    description: undefined, // Not in current schema
    type: item.fileType || 'document',
    tags: [], // Not in current schema
    fileUrl: item.downloadURL,
    fileSize: item.size,
    mimeType: item.mimeType,
    encryptionKey: undefined, // Handled separately for security
    encryptionIV: undefined,
    sharedWith: item.sharedWith || [],
    createdBy: item.userId,
    createdAt: item.createdAt.toDate().toISOString(),
    updatedAt: item.updatedAt.toDate().toISOString(),
    lastModifiedBy: item.userId,
    metadata: {
      path: item.path,
      isEncrypted: item.isEncrypted,
      accessLevel: item.accessLevel,
    },
  };
}

/**
 * List vault items - V2 handler that imports SDK schemas
 */
export const listVault = onCall(
  {
    ...getCorsOptions(),
    region: DEFAULT_REGION,
    memory: '256MiB',
    timeoutSeconds: FUNCTION_TIMEOUT.SHORT,
  },
  withAuth(
    async (request) => {
      const uid = requireAuth(request);

      // Validate input using existing Dynasty validation
      const validatedData = validateRequest(
        request.data,
        VALIDATION_SCHEMAS.getVaultItems,
        uid
      );

      const parentId = validatedData.parentId ?? null;
      const db = getFirestore();

      try {
        // Get all accessible items (owned + shared) for the specified parent
        const items = await getAccessibleVaultItems(db, uid, parentId);

        // Sort: folders first, then by name
        items.sort((a, b) => {
          if (a.type !== b.type) {
            return a.type === 'folder' ? -1 : 1;
          }
          return a.name.localeCompare(b.name);
        });

        // Convert to SDK format
        const sdkItems = items
          .filter((item) => item.type === 'file') // SDK only handles files, not folders
          .map(convertToSdkFormat);

        // Validate response using SDK schema
        const validatedResponse = VaultItemsSchema.parse(sdkItems);

        // Log audit event
        await logVaultAuditEvent(uid, 'list_vault_items', undefined, {
          itemCount: validatedResponse.length,
          parentId: parentId || 'root',
        });

        logger.info(
          'Retrieved vault items (v2)',
          createLogContext({
            itemCount: validatedResponse.length,
            userId: uid,
            parentId: parentId || 'root',
            version: 'v2',
          })
        );

        return { items: validatedResponse };
      } catch (error) {
        logger.error('Failed to list vault items:', error);
        await logVaultAuditEvent(uid, 'list_vault_items_error', undefined, {
          error: error instanceof Error ? error.message : 'Unknown error',
          parentId: parentId || 'root',
        });
        throw error;
      }
    },
    'listVault',
    {
      authLevel: 'onboarded',
      rateLimitConfig: SECURITY_CONFIG.rateLimits.read,
    }
  )
);