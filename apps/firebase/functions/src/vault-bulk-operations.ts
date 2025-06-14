import {onCall} from "firebase-functions/v2/https";
import * as admin from "firebase-admin";
import {getFirestore, Timestamp} from "firebase-admin/firestore";
import {logger} from "firebase-functions/v2";
import {createError, ErrorCode, handleError} from "./utils/errors";
import {withAuth} from "./middleware/auth";
import {validateRequest} from "./utils/request-validator";
import {VALIDATION_SCHEMAS} from "./config/validation-schemas";
import {DEFAULT_REGION, FUNCTION_TIMEOUT} from "./common";
import {getStorageAdapter} from "./services/storageAdapter";

// Initialize if not already done
if (!admin.apps.length) {
  admin.initializeApp();
}

const db = getFirestore();

// Constants
const MAX_BATCH_SIZE = 490; // Firestore limit is 500
const MAX_OPERATIONS_PER_REQUEST = 100;

// Types
export interface VaultBulkOperation {
  operation: "encrypt" | "decrypt" | "share" | "unshare" | "delete" | "restore" | "move";
  itemIds: string[];
  metadata?: Record<string, any>;
}

export interface VaultBulkResult {
  success: boolean;
  totalItems: number;
  successfulItems: string[];
  failedItems: Array<{
    itemId: string;
    error: string;
  }>;
  operationId: string;
}

export interface VaultShareTarget {
  userId: string;
  permissions: "read" | "write" | "admin";
  expiresAt?: Timestamp;
}

/**
 * Execute bulk vault operations
 */
export const executeBulkVaultOperation = onCall(
  {
    region: DEFAULT_REGION,
    memory: "1GiB",
    timeoutSeconds: FUNCTION_TIMEOUT.LONG,
  },
  withAuth(async (request) => {
    const functionName = "executeBulkVaultOperation";

    try {
      const userId = request.auth!.uid;

      // Validate input
      const validatedData = validateRequest(
        request.data,
        VALIDATION_SCHEMAS.executeBulkVaultOperation,
        userId
      );

      const {operation, itemIds, metadata = {}} = validatedData as VaultBulkOperation;

      if (itemIds.length === 0) {
        throw createError(ErrorCode.INVALID_ARGUMENT, "No items specified");
      }

      if (itemIds.length > MAX_OPERATIONS_PER_REQUEST) {
        throw createError(
          ErrorCode.INVALID_ARGUMENT,
          `Too many items. Maximum ${MAX_OPERATIONS_PER_REQUEST} allowed`
        );
      }

      const operationId = `bulk_${operation}_${Date.now()}_${Math.random().toString(36).substring(2)}`;

      logger.info(`[${functionName}] Starting bulk operation`, {
        operationId,
        operation,
        itemCount: itemIds.length,
        userId,
      });

      // Execute operation based on type
      let result: VaultBulkResult;

      switch (operation) {
      case "delete":
        result = await executeBulkDelete(userId, itemIds, operationId);
        break;
      case "restore":
        result = await executeBulkRestore(userId, itemIds, operationId);
        break;
      case "share":
        result = await executeBulkShare(userId, itemIds, metadata.shareTargets || [], operationId);
        break;
      case "unshare":
        result = await executeBulkUnshare(userId, itemIds, metadata.targetUserIds || [], operationId);
        break;
      case "move":
        result = await executeBulkMove(userId, itemIds, metadata.targetFolderId, operationId);
        break;
      case "encrypt":
        result = await executeBulkEncrypt(userId, itemIds, operationId);
        break;
      case "decrypt":
        result = await executeBulkDecrypt(userId, itemIds, operationId);
        break;
      default:
        throw createError(ErrorCode.INVALID_ARGUMENT, `Unsupported operation: ${operation}`);
      }

      // Log operation result
      await logBulkOperation(userId, operation, result);

      logger.info(`[${functionName}] Bulk operation completed`, {
        operationId,
        successful: result.successfulItems.length,
        failed: result.failedItems.length,
      });

      return result;
    } catch (error) {
      return handleError(error, functionName);
    }
  })
);

/**
 * Execute bulk delete operation
 */
async function executeBulkDelete(
  userId: string,
  itemIds: string[],
  operationId: string
): Promise<VaultBulkResult> {
  const result: VaultBulkResult = {
    success: true,
    totalItems: itemIds.length,
    successfulItems: [],
    failedItems: [],
    operationId,
  };

  // Process in batches
  for (let i = 0; i < itemIds.length; i += MAX_BATCH_SIZE) {
    const batchIds = itemIds.slice(i, i + MAX_BATCH_SIZE);

    try {
      // Get items to verify ownership and collect storage info
      const itemsSnapshot = await db.collection("vaultItems")
        .where(admin.firestore.FieldPath.documentId(), "in", batchIds)
        .where("ownerId", "==", userId)
        .where("isDeleted", "==", false)
        .get();

      const batch = db.batch();
      const storageDeletePromises: Promise<void>[] = [];

      for (const doc of itemsSnapshot.docs) {
        const data = doc.data();

        // Soft delete in Firestore
        batch.update(doc.ref, {
          isDeleted: true,
          deletedAt: Timestamp.now(),
          updatedAt: Timestamp.now(),
        });

        // Schedule storage deletion if it's a file
        if (data.type === "file" && data.storagePath) {
          storageDeletePromises.push(
            deleteFromStorage(data.storagePath, data.storageProvider || "firebase")
              .catch((error) => {
                logger.warn("Failed to delete from storage", {
                  itemId: doc.id,
                  storagePath: data.storagePath,
                  error: error.message,
                });
              })
          );
        }

        result.successfulItems.push(doc.id);
      }

      // Commit Firestore batch
      await batch.commit();

      // Execute storage deletions (non-blocking)
      Promise.all(storageDeletePromises).catch((error) => {
        logger.error("Some storage deletions failed:", error);
      });

      // Mark items that weren't found as failed
      const foundIds = itemsSnapshot.docs.map((doc) => doc.id);
      const notFoundIds = batchIds.filter((id) => !foundIds.includes(id));

      for (const id of notFoundIds) {
        result.failedItems.push({
          itemId: id,
          error: "Item not found or not owned by user",
        });
      }
    } catch (error) {
      logger.error("Batch delete failed:", error);

      // Mark all items in this batch as failed
      for (const id of batchIds) {
        if (!result.successfulItems.includes(id)) {
          result.failedItems.push({
            itemId: id,
            error: error.message || "Unknown error",
          });
        }
      }
    }
  }

  result.success = result.failedItems.length === 0;
  return result;
}

/**
 * Execute bulk restore operation
 */
async function executeBulkRestore(
  userId: string,
  itemIds: string[],
  operationId: string
): Promise<VaultBulkResult> {
  const result: VaultBulkResult = {
    success: true,
    totalItems: itemIds.length,
    successfulItems: [],
    failedItems: [],
    operationId,
  };

  // Process in batches
  for (let i = 0; i < itemIds.length; i += MAX_BATCH_SIZE) {
    const batchIds = itemIds.slice(i, i + MAX_BATCH_SIZE);

    try {
      // Get deleted items to verify ownership
      const itemsSnapshot = await db.collection("vaultItems")
        .where(admin.firestore.FieldPath.documentId(), "in", batchIds)
        .where("ownerId", "==", userId)
        .where("isDeleted", "==", true)
        .get();

      const batch = db.batch();

      for (const doc of itemsSnapshot.docs) {
        // Restore item
        batch.update(doc.ref, {
          isDeleted: false,
          deletedAt: admin.firestore.FieldValue.delete(),
          updatedAt: Timestamp.now(),
        });

        result.successfulItems.push(doc.id);
      }

      // Commit batch
      await batch.commit();

      // Mark items that weren't found as failed
      const foundIds = itemsSnapshot.docs.map((doc) => doc.id);
      const notFoundIds = batchIds.filter((id) => !foundIds.includes(id));

      for (const id of notFoundIds) {
        result.failedItems.push({
          itemId: id,
          error: "Item not found or not deleted",
        });
      }
    } catch (error) {
      logger.error("Batch restore failed:", error);

      for (const id of batchIds) {
        if (!result.successfulItems.includes(id)) {
          result.failedItems.push({
            itemId: id,
            error: error.message || "Unknown error",
          });
        }
      }
    }
  }

  result.success = result.failedItems.length === 0;
  return result;
}

/**
 * Execute bulk share operation
 */
async function executeBulkShare(
  userId: string,
  itemIds: string[],
  shareTargets: VaultShareTarget[],
  operationId: string
): Promise<VaultBulkResult> {
  const result: VaultBulkResult = {
    success: true,
    totalItems: itemIds.length,
    successfulItems: [],
    failedItems: [],
    operationId,
  };

  if (shareTargets.length === 0) {
    result.success = false;
    result.failedItems = itemIds.map((id) => ({
      itemId: id,
      error: "No share targets specified",
    }));
    return result;
  }

  try {
    // Verify all items exist and are owned by user
    const itemsSnapshot = await db.collection("vaultItems")
      .where(admin.firestore.FieldPath.documentId(), "in", itemIds)
      .where("ownerId", "==", userId)
      .where("isDeleted", "==", false)
      .get();

    const batch = db.batch();
    // const sharePromises: Promise<void>[] = [];

    for (const doc of itemsSnapshot.docs) {
      for (const target of shareTargets) {
        // Create share record
        const shareRef = db.collection("vaultShares").doc();
        const shareData = {
          itemId: doc.id,
          ownerId: userId,
          sharedWithUserId: target.userId,
          permissions: target.permissions,
          createdAt: Timestamp.now(),
          expiresAt: target.expiresAt || null,
          isActive: true,
        };

        batch.set(shareRef, shareData);
      }

      // Update item to mark as shared
      batch.update(doc.ref, {
        isShared: true,
        sharedWith: shareTargets.map((t) => t.userId),
        updatedAt: Timestamp.now(),
      });

      result.successfulItems.push(doc.id);
    }

    // Commit batch
    await batch.commit();

    // Mark items that weren't found as failed
    const foundIds = itemsSnapshot.docs.map((doc) => doc.id);
    const notFoundIds = itemIds.filter((id) => !foundIds.includes(id));

    for (const id of notFoundIds) {
      result.failedItems.push({
        itemId: id,
        error: "Item not found or not owned by user",
      });
    }
  } catch (error) {
    logger.error("Bulk share failed:", error);
    result.success = false;
    result.failedItems = itemIds.map((id) => ({
      itemId: id,
      error: error.message || "Unknown error",
    }));
  }

  result.success = result.failedItems.length === 0;
  return result;
}

/**
 * Execute bulk unshare operation
 */
async function executeBulkUnshare(
  userId: string,
  itemIds: string[],
  targetUserIds: string[],
  operationId: string
): Promise<VaultBulkResult> {
  const result: VaultBulkResult = {
    success: true,
    totalItems: itemIds.length,
    successfulItems: [],
    failedItems: [],
    operationId,
  };

  try {
    const batch = db.batch();

    for (const itemId of itemIds) {
      try {
        // Remove shares
        const sharesSnapshot = await db.collection("vaultShares")
          .where("itemId", "==", itemId)
          .where("ownerId", "==", userId)
          .where("sharedWithUserId", "in", targetUserIds)
          .get();

        for (const shareDoc of sharesSnapshot.docs) {
          batch.delete(shareDoc.ref);
        }

        // Update item
        const itemRef = db.collection("vaultItems").doc(itemId);
        const itemDoc = await itemRef.get();

        if (itemDoc.exists && itemDoc.data()?.ownerId === userId) {
          const currentSharedWith = itemDoc.data()?.sharedWith || [];
          const updatedSharedWith = currentSharedWith.filter(
            (uid: string) => !targetUserIds.includes(uid)
          );

          batch.update(itemRef, {
            sharedWith: updatedSharedWith,
            isShared: updatedSharedWith.length > 0,
            updatedAt: Timestamp.now(),
          });

          result.successfulItems.push(itemId);
        } else {
          result.failedItems.push({
            itemId,
            error: "Item not found or not owned by user",
          });
        }
      } catch (error) {
        result.failedItems.push({
          itemId,
          error: error.message || "Unknown error",
        });
      }
    }

    // Commit batch
    await batch.commit();
  } catch (error) {
    logger.error("Bulk unshare failed:", error);
    result.success = false;
    result.failedItems = itemIds.map((id) => ({
      itemId: id,
      error: error.message || "Unknown error",
    }));
  }

  result.success = result.failedItems.length === 0;
  return result;
}

/**
 * Execute bulk move operation
 */
async function executeBulkMove(
  userId: string,
  itemIds: string[],
  targetFolderId: string | null,
  operationId: string
): Promise<VaultBulkResult> {
  const result: VaultBulkResult = {
    success: true,
    totalItems: itemIds.length,
    successfulItems: [],
    failedItems: [],
    operationId,
  };

  try {
    // Verify target folder exists and is owned by user (if not null)
    if (targetFolderId) {
      const folderDoc = await db.collection("vaultItems").doc(targetFolderId).get();
      if (!folderDoc.exists ||
          folderDoc.data()?.ownerId !== userId ||
          folderDoc.data()?.type !== "folder") {
        throw new Error("Target folder not found or not accessible");
      }
    }

    const batch = db.batch();

    // Verify and move items
    const itemsSnapshot = await db.collection("vaultItems")
      .where(admin.firestore.FieldPath.documentId(), "in", itemIds)
      .where("ownerId", "==", userId)
      .where("isDeleted", "==", false)
      .get();

    for (const doc of itemsSnapshot.docs) {
      batch.update(doc.ref, {
        parentId: targetFolderId,
        updatedAt: Timestamp.now(),
      });

      result.successfulItems.push(doc.id);
    }

    // Commit batch
    await batch.commit();

    // Mark items that weren't found as failed
    const foundIds = itemsSnapshot.docs.map((doc) => doc.id);
    const notFoundIds = itemIds.filter((id) => !foundIds.includes(id));

    for (const id of notFoundIds) {
      result.failedItems.push({
        itemId: id,
        error: "Item not found or not owned by user",
      });
    }
  } catch (error) {
    logger.error("Bulk move failed:", error);
    result.success = false;
    result.failedItems = itemIds.map((id) => ({
      itemId: id,
      error: error.message || "Unknown error",
    }));
  }

  result.success = result.failedItems.length === 0;
  return result;
}

/**
 * Execute bulk encrypt operation
 * Note: This prepares items for encryption - actual encryption must be done client-side
 */
async function executeBulkEncrypt(
  userId: string,
  itemIds: string[],
  operationId: string
): Promise<VaultBulkResult> {
  const result: VaultBulkResult = {
    success: true,
    totalItems: itemIds.length,
    successfulItems: [],
    failedItems: [],
    operationId,
  };

  // Process in batches
  for (let i = 0; i < itemIds.length; i += MAX_BATCH_SIZE) {
    const batchIds = itemIds.slice(i, i + MAX_BATCH_SIZE);

    try {
      // Get items to verify ownership and check encryption status
      const itemsSnapshot = await db.collection("vaultItems")
        .where(admin.firestore.FieldPath.documentId(), "in", batchIds)
        .where("ownerId", "==", userId)
        .where("isDeleted", "==", false)
        .get();

      const batch = db.batch();
      const encryptableItems: string[] = [];

      for (const doc of itemsSnapshot.docs) {
        const data = doc.data();

        // Check if item is already encrypted
        const encryptionMetadataDoc = await db.collection("vaultEncryptionMetadata")
          .doc(doc.id)
          .get();

        if (encryptionMetadataDoc.exists && encryptionMetadataDoc.data()?.encryptionMetadata) {
          result.failedItems.push({
            itemId: doc.id,
            error: "Item is already encrypted",
          });
          continue;
        }

        // Check if item type supports encryption (files only for now)
        if (data.type !== "file") {
          result.failedItems.push({
            itemId: doc.id,
            error: "Only files can be encrypted",
          });
          continue;
        }

        // Mark item as pending encryption
        batch.update(doc.ref, {
          encryptionStatus: "pending",
          encryptionOperationId: operationId,
          updatedAt: Timestamp.now(),
        });

        encryptableItems.push(doc.id);
        result.successfulItems.push(doc.id);
      }

      // Commit batch update
      if (encryptableItems.length > 0) {
        await batch.commit();

        // Log encryption preparation
        logger.info("Prepared items for encryption", {
          operationId,
          userId,
          itemCount: encryptableItems.length,
          itemIds: encryptableItems,
        });
      }

      // Mark items that weren't found as failed
      const foundIds = itemsSnapshot.docs.map((doc) => doc.id);
      const notFoundIds = batchIds.filter((id) => !foundIds.includes(id));

      for (const id of notFoundIds) {
        result.failedItems.push({
          itemId: id,
          error: "Item not found or not owned by user",
        });
      }
    } catch (error) {
      logger.error("Batch encryption preparation failed:", error);

      // Mark all items in this batch as failed
      for (const id of batchIds) {
        if (!result.successfulItems.includes(id)) {
          result.failedItems.push({
            itemId: id,
            error: error.message || "Unknown error",
          });
        }
      }
    }
  }

  result.success = result.failedItems.length === 0;
  return result;
}

/**
 * Execute bulk decrypt operation
 * Note: This prepares items for decryption - actual decryption must be done client-side
 */
async function executeBulkDecrypt(
  userId: string,
  itemIds: string[],
  operationId: string
): Promise<VaultBulkResult> {
  const result: VaultBulkResult = {
    success: true,
    totalItems: itemIds.length,
    successfulItems: [],
    failedItems: [],
    operationId,
  };

  // Process in batches
  for (let i = 0; i < itemIds.length; i += MAX_BATCH_SIZE) {
    const batchIds = itemIds.slice(i, i + MAX_BATCH_SIZE);

    try {
      // Get items to verify ownership and check encryption status
      const itemsSnapshot = await db.collection("vaultItems")
        .where(admin.firestore.FieldPath.documentId(), "in", batchIds)
        .where("ownerId", "==", userId)
        .where("isDeleted", "==", false)
        .get();

      const batch = db.batch();
      const decryptableItems: string[] = [];

      for (const doc of itemsSnapshot.docs) {
        const data = doc.data();

        // Check if item is encrypted
        const encryptionMetadataDoc = await db.collection("vaultEncryptionMetadata")
          .doc(doc.id)
          .get();

        if (!encryptionMetadataDoc.exists || !encryptionMetadataDoc.data()?.encryptionMetadata) {
          result.failedItems.push({
            itemId: doc.id,
            error: "Item is not encrypted",
          });
          continue;
        }

        // Check if item type supports decryption (files only for now)
        if (data.type !== "file") {
          result.failedItems.push({
            itemId: doc.id,
            error: "Only files can be decrypted",
          });
          continue;
        }

        // Mark item as pending decryption
        batch.update(doc.ref, {
          encryptionStatus: "pending_decryption",
          decryptionOperationId: operationId,
          updatedAt: Timestamp.now(),
        });

        decryptableItems.push(doc.id);
        result.successfulItems.push(doc.id);
      }

      // Commit batch update
      if (decryptableItems.length > 0) {
        await batch.commit();

        // Log decryption preparation
        logger.info("Prepared items for decryption", {
          operationId,
          userId,
          itemCount: decryptableItems.length,
          itemIds: decryptableItems,
        });
      }

      // Mark items that weren't found as failed
      const foundIds = itemsSnapshot.docs.map((doc) => doc.id);
      const notFoundIds = batchIds.filter((id) => !foundIds.includes(id));

      for (const id of notFoundIds) {
        result.failedItems.push({
          itemId: id,
          error: "Item not found or not owned by user",
        });
      }
    } catch (error) {
      logger.error("Batch decryption preparation failed:", error);

      // Mark all items in this batch as failed
      for (const id of batchIds) {
        if (!result.successfulItems.includes(id)) {
          result.failedItems.push({
            itemId: id,
            error: error.message || "Unknown error",
          });
        }
      }
    }
  }

  result.success = result.failedItems.length === 0;
  return result;
}

/**
 * Helper function to delete from storage
 */
async function deleteFromStorage(
  storagePath: string,
  provider: string
): Promise<void> {
  try {
    const storageAdapter = getStorageAdapter();

    if (provider === "r2") {
      // Extract bucket and key from path
      const pathParts = storagePath.split("/");
      const bucket = pathParts[0];
      const key = pathParts.slice(1).join("/");

      await storageAdapter.deleteFile({
        path: key,
        bucket,
        provider: "r2",
      });
    } else {
      // Firebase Storage
      await storageAdapter.deleteFile({
        path: storagePath,
        provider: "firebase",
      });
    }
  } catch (error) {
    logger.error("Failed to delete from storage:", error);
    throw error;
  }
}

/**
 * Log bulk operation result
 */
async function logBulkOperation(
  userId: string,
  operation: string,
  result: VaultBulkResult
): Promise<void> {
  try {
    await db.collection("vault_bulk_operations").add({
      operationId: result.operationId,
      userId,
      operation,
      totalItems: result.totalItems,
      successfulItems: result.successfulItems.length,
      failedItems: result.failedItems.length,
      timestamp: Timestamp.now(),
      success: result.success,
    });
  } catch (error) {
    logger.error("Failed to log bulk operation:", error);
  }
}

/**
 * Get bulk operation status
 */
export const getBulkOperationStatus = onCall(
  {
    region: DEFAULT_REGION,
    memory: "256MiB",
    timeoutSeconds: FUNCTION_TIMEOUT.SHORT,
  },
  withAuth(async (request) => {
    const functionName = "getBulkOperationStatus";

    try {
      const userId = request.auth!.uid;
      const {operationId} = request.data;

      if (!operationId) {
        throw createError(ErrorCode.INVALID_ARGUMENT, "Operation ID required");
      }

      const operationDoc = await db
        .collection("vault_bulk_operations")
        .where("operationId", "==", operationId)
        .where("userId", "==", userId)
        .limit(1)
        .get();

      if (operationDoc.empty) {
        throw createError(ErrorCode.NOT_FOUND, "Operation not found");
      }

      const operationData = operationDoc.docs[0].data();

      return {
        success: true,
        operation: operationData,
      };
    } catch (error) {
      return handleError(error, functionName);
    }
  })
);
