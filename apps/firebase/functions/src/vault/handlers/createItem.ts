import { onCall } from 'firebase-functions/v2/https';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions/v2';
import { DEFAULT_REGION, FUNCTION_TIMEOUT, FILE_SIZE_LIMITS } from '../../common';
import { createError, ErrorCode } from '../../utils/errors';
import { withAuth, requireAuth } from '../../middleware';
import { SECURITY_CONFIG } from '../../config/security-config';
import { validateRequest } from '../../utils/request-validator';
import { createLogContext } from '../../utils/sanitization';
import { getCorsOptions } from '../../config/cors';
import { sanitizeFileName, sanitizeMimeType } from '../../utils/vault-sanitization';
import { VaultItemSchema, CreateVaultItemRequest } from '@dynasty/vault-sdk';
import { logVaultAuditEvent } from '../utils/audit';
import { z } from 'zod';

// Validation schema for create item request (using SDK schema as base)
const CreateItemRequestSchema = z.object({
  name: z.string().min(1).max(255),
  description: z.string().optional(),
  type: z.enum(['document', 'photo', 'video', 'audio', 'password', 'note', 'other']),
  tags: z.array(z.string()).default([]),
  fileUrl: z.string().url().optional(),
  fileSize: z.number().optional(),
  mimeType: z.string().optional(),
  encryptionKey: z.string().optional(),
  encryptionIV: z.string().optional(),
  metadata: z.record(z.string(), z.any()).optional(),
  // Legacy compatibility fields
  parentId: z.string().optional(),
  storagePath: z.string().optional(),
});

/**
 * Build vault item path for the logical file system
 */
async function buildVaultPath(
  db: FirebaseFirestore.Firestore,
  name: string,
  parentId: string | null
): Promise<string> {
  let vaultPath = `/${name}`;
  
  if (parentId) {
    const parentDoc = await db.collection('vaultItems').doc(parentId).get();
    if (!parentDoc.exists) {
      throw createError(
        ErrorCode.NOT_FOUND,
        'Parent folder not found for vault item path construction.'
      );
    }
    
    const parentData = parentDoc.data();
    if (parentData?.path) {
      vaultPath = `${parentData.path}/${name}`;
    }
  }
  
  return vaultPath;
}

/**
 * Create vault item - V2 handler that imports SDK schemas
 */
export const createItem = onCall(
  {
    ...getCorsOptions(),
    region: DEFAULT_REGION,
    memory: '256MiB',
    timeoutSeconds: FUNCTION_TIMEOUT.SHORT,
  },
  withAuth(
    async (request) => {
      const uid = requireAuth(request);

      // Validate input using SDK schema
      const validatedData = CreateItemRequestSchema.parse(request.data);

      const {
        name,
        description,
        type,
        tags = [],
        fileUrl,
        fileSize,
        mimeType,
        encryptionKey,
        encryptionIV,
        metadata,
        parentId = null,
        storagePath,
      } = validatedData;

      const db = getFirestore();

      try {
        // Sanitize inputs using Dynasty utilities
        const sanitizedName = sanitizeFileName(name);
        const sanitizedMimeType = mimeType ? sanitizeMimeType(mimeType) : undefined;

        // Validate file size (1GB limit)
        if (fileSize && fileSize > FILE_SIZE_LIMITS.MAX_FILE_SIZE) {
          throw createError(
            ErrorCode.INVALID_REQUEST,
            `File size exceeds maximum allowed size of ${FILE_SIZE_LIMITS.MAX_FILE_SIZE_MB}MB`
          );
        }

        // Build vault path
        const vaultPath = await buildVaultPath(db, sanitizedName, parentId);

        // Check for duplicate names in the same folder
        const duplicateQuery = db
          .collection('vaultItems')
          .where('userId', '==', uid)
          .where('name', '==', sanitizedName)
          .where('parentId', '==', parentId)
          .where('isDeleted', '==', false);

        const duplicateSnapshot = await duplicateQuery.get();
        if (!duplicateSnapshot.empty) {
          throw createError(
            ErrorCode.ALREADY_EXISTS,
            'An item with this name already exists in the folder'
          );
        }

        // Create the vault item
        const now = FieldValue.serverTimestamp();
        const vaultItemData = {
          userId: uid,
          ownerId: uid,
          name: sanitizedName,
          description: description || null,
          type: 'file', // All SDK items are files
          fileType: type,
          parentId,
          path: vaultPath,
          size: fileSize || null,
          storagePath: storagePath || null,
          downloadURL: fileUrl || null,
          mimeType: sanitizedMimeType || null,
          isDeleted: false,
          isEncrypted: !!encryptionKey,
          encryptionKeyId: encryptionKey ? `key_${Date.now()}` : null,
          sharedWith: [],
          tags: tags,
          metadata: {
            ...metadata,
            sdkVersion: 'v2',
            createdVia: 'vault-sdk',
          },
          createdAt: now,
          updatedAt: now,
        };

        const docRef = await db.collection('vaultItems').add(vaultItemData);

        // Create the response in SDK format
        const responseItem = {
          id: docRef.id,
          familyId: uid,
          name: sanitizedName,
          description: description || undefined,
          type,
          tags,
          fileUrl: fileUrl || undefined,
          fileSize: fileSize || undefined,
          mimeType: sanitizedMimeType || undefined,
          encryptionKey: undefined, // Never return actual encryption key
          encryptionIV: undefined,
          sharedWith: [],
          createdBy: uid,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          lastModifiedBy: uid,
          metadata: {
            ...metadata,
            path: vaultPath,
            isEncrypted: !!encryptionKey,
          },
        };

        // Validate response using SDK schema
        const validatedResponse = VaultItemSchema.parse(responseItem);

        // Log audit event
        await logVaultAuditEvent(uid, 'create_vault_item', docRef.id, {
          itemName: sanitizedName,
          itemType: type,
          fileSize: fileSize || 0,
          isEncrypted: !!encryptionKey,
          parentId: parentId || 'root',
        });

        logger.info(
          'Created vault item (v2)',
          createLogContext({
            itemId: docRef.id,
            itemName: sanitizedName,
            itemType: type,
            userId: uid,
            version: 'v2',
          })
        );

        return validatedResponse;
      } catch (error) {
        logger.error('Failed to create vault item:', error);
        await logVaultAuditEvent(uid, 'create_vault_item_error', undefined, {
          error: error instanceof Error ? error.message : 'Unknown error',
          itemName: name,
        });
        throw error;
      }
    },
    'createItem',
    {
      authLevel: 'onboarded',
      rateLimitConfig: SECURITY_CONFIG.rateLimits.write,
    }
  )
);