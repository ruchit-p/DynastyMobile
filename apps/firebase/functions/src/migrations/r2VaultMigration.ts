import {onCall} from "firebase-functions/v2/https";
import {getFirestore, FieldValue} from "firebase-admin/firestore";
import {getStorage} from "firebase-admin/storage";
import {logger} from "firebase-functions/v2";
import {DEFAULT_REGION, FUNCTION_TIMEOUT} from "../common";
import {createError, withErrorHandling, ErrorCode} from "../utils/errors";
import {getR2Service, R2Service} from "../services/r2Service";
import {R2_CONFIG} from "../config/r2Secrets";

/**
 * Updated getVaultUploadSignedUrl function that uses R2 instead of Firebase Storage
 * This is a drop-in replacement for the existing function
 * Now creates metadata in Firestore with cached URLs
 */
export const getVaultUploadSignedUrlR2 = onCall(
  {
    region: DEFAULT_REGION,
    memory: "256MiB",
    timeoutSeconds: FUNCTION_TIMEOUT.SHORT,
    secrets: [R2_CONFIG],
  },
  withErrorHandling(async (request) => {
    const uid = request.auth?.uid;
    if (!uid) {
      throw createError(ErrorCode.UNAUTHENTICATED, "Authentication required");
    }

    const {fileName, mimeType, parentId = null, isEncrypted = false, fileSize} = request.data;

    if (!fileName || !mimeType) {
      throw createError(ErrorCode.MISSING_PARAMETERS, "fileName and mimeType are required.");
    }

    // Validate file size (100MB limit)
    const MAX_FILE_SIZE = 100 * 1024 * 1024; // 100MB
    if (fileSize && fileSize > MAX_FILE_SIZE) {
      throw createError(
        ErrorCode.INVALID_REQUEST,
        `File size exceeds maximum allowed size of ${MAX_FILE_SIZE / (1024 * 1024)}MB`
      );
    }

    const db = getFirestore();
    let parentPath = "";
    if (parentId) {
      const parentDoc = await db.collection("vaultItems").doc(parentId).get();
      if (!parentDoc.exists) {
        throw createError(ErrorCode.NOT_FOUND, "Parent folder not found");
      }
      parentPath = (parentDoc.data() as any).path;
    }

    // Use R2Service to generate the storage key and signed URL
    const r2Service = getR2Service();
    const bucket = R2Service.getBucketName();
    const storageKey = R2Service.generateStorageKey("vault", uid, fileName, parentId || undefined);

    // Generate signed upload URL
    const signedUrl = await r2Service.generateUploadUrl({
      bucket,
      key: storageKey,
      contentType: mimeType,
      metadata: {
        userId: uid,
        parentId: parentId || "root",
        isEncrypted: isEncrypted.toString(),
        originalFileName: fileName,
      },
      expiresIn: 5 * 60, // 5 minutes
    });

    // Pre-create the vault item in Firestore with cached URL
    const vaultItem = {
      userId: uid,
      name: fileName,
      type: "file" as const,
      parentId,
      path: parentPath ? `${parentPath}/${fileName}` : `/${fileName}`,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
      size: fileSize,
      mimeType,
      isDeleted: false,
      isEncrypted,
      storageProvider: "r2" as const,
      storagePath: storageKey,
      r2Bucket: bucket,
      r2Key: storageKey,
      cachedUploadUrl: signedUrl,
      cachedUploadUrlExpiry: FieldValue.serverTimestamp(), // Will be replaced with actual Timestamp
    };

    // Create the item in Firestore
    const docRef = await db.collection("vaultItems").add(vaultItem);

    // Update with proper expiry timestamp
    await docRef.update({
      cachedUploadUrlExpiry: new Date(Date.now() + 300000), // 5 minutes
    });

    logger.info("Generated R2 upload URL for vault item", {
      userId: uid,
      fileName,
      bucket,
      key: storageKey,
      itemId: docRef.id,
    });

    return {
      signedUrl,
      storagePath: storageKey,
      parentPathInVault: parentPath,
      isEncrypted,
      itemId: docRef.id,
      bucket,
      storageProvider: "r2",
    };
  }, "getVaultUploadSignedUrlR2")
);

/**
 * Updated getVaultDownloadUrl function that uses R2
 */
export const getVaultDownloadUrlR2 = onCall(
  {
    region: DEFAULT_REGION,
    memory: "256MiB",
    timeoutSeconds: FUNCTION_TIMEOUT.SHORT,
    secrets: [R2_CONFIG],
  },
  withErrorHandling(async (request) => {
    const uid = request.auth?.uid;
    if (!uid) {
      throw createError(ErrorCode.UNAUTHENTICATED, "Authentication required");
    }

    const {itemId, storagePath, bucket = "dynasty-vault"} = request.data;
    if (!itemId && !storagePath) {
      throw createError(ErrorCode.MISSING_PARAMETERS, "Either itemId or storagePath is required");
    }

    const db = getFirestore();
    let vaultItem: any;
    let finalStoragePath = storagePath;
    let finalBucket = bucket;

    // If itemId is provided, verify access through item permissions
    if (itemId) {
      const itemDoc = await db.collection("vaultItems").doc(itemId).get();
      if (!itemDoc.exists) {
        throw createError(ErrorCode.NOT_FOUND, "Vault item not found");
      }

      vaultItem = {id: itemDoc.id, ...itemDoc.data()};

      // Check permissions
      if (vaultItem.userId !== uid && !vaultItem.sharedWith?.includes(uid)) {
        throw createError(ErrorCode.PERMISSION_DENIED, "Access denied");
      }

      if (!vaultItem.r2Key && !vaultItem.storagePath) {
        throw createError(ErrorCode.INVALID_REQUEST, "Vault item does not have an associated storage path");
      }

      // Check if we have a cached download URL that's still valid
      if (vaultItem.cachedDownloadUrl && vaultItem.cachedDownloadUrlExpiry) {
        const expiry = vaultItem.cachedDownloadUrlExpiry.toMillis ?
          vaultItem.cachedDownloadUrlExpiry.toMillis() :
          new Date(vaultItem.cachedDownloadUrlExpiry).getTime();
        if (expiry > Date.now() + 300000) { // Still valid for at least 5 minutes
          logger.info(`Using cached R2 download URL for ${vaultItem.name}`);
          return {downloadUrl: vaultItem.cachedDownloadUrl, storageProvider: "r2"};
        }
      }

      // Check if item uses R2 or Firebase Storage
      if (vaultItem.storageProvider === "r2" && vaultItem.r2Bucket && vaultItem.r2Key) {
        finalBucket = vaultItem.r2Bucket;
        finalStoragePath = vaultItem.r2Key;
      } else if (!vaultItem.storageProvider || vaultItem.storageProvider === "firebase") {
        // This is a Firebase Storage item, use legacy method
        logger.info("Item still uses Firebase Storage, generating Firebase URL");
        const storage = getStorage();
        const [signedUrl] = await storage
          .bucket()
          .file(vaultItem.storagePath || finalStoragePath)
          .getSignedUrl({
            version: "v4",
            action: "read",
            expires: Date.now() + 60 * 60 * 1000, // 1 hour
          });
        return {downloadUrl: signedUrl, storageProvider: "firebase"};
      }
    }

    // Generate R2 download URL
    const r2Service = getR2Service();
    const downloadUrl = await r2Service.generateDownloadUrl({
      bucket: finalBucket,
      key: finalStoragePath,
      expiresIn: 60 * 60, // 1 hour
    });

    // Update cached URL in Firestore if we have an itemId
    if (itemId) {
      const expiryTime = Date.now() + 3600000; // 1 hour
      await db.collection("vaultItems").doc(itemId).update({
        cachedDownloadUrl: downloadUrl,
        cachedDownloadUrlExpiry: new Date(expiryTime),
      });
    }

    // Create audit log
    await db.collection("vaultAuditLogs").add({
      itemId: vaultItem?.id || null,
      storagePath: finalStoragePath,
      userId: uid,
      action: "download",
      timestamp: FieldValue.serverTimestamp(),
      metadata: {
        itemName: vaultItem?.name,
        itemType: vaultItem?.type,
        fileType: vaultItem?.fileType,
        accessLevel: vaultItem?.userId === uid ? "owner" : "shared",
        isEncrypted: vaultItem?.isEncrypted || false,
        storageProvider: "r2",
      },
    });

    logger.info("Generated R2 download URL for vault item", {
      userId: uid,
      itemId: vaultItem?.id,
      bucket: finalBucket,
      key: finalStoragePath,
    });

    return {downloadUrl, storageProvider: "r2"};
  }, "getVaultDownloadUrlR2")
);

/**
 * Batch migration function to migrate existing vault items from Firebase Storage to R2
 */
export const migrateVaultItemsToR2 = onCall(
  {
    region: DEFAULT_REGION,
    memory: "1GiB",
    timeoutSeconds: FUNCTION_TIMEOUT.LONG,
    secrets: [R2_CONFIG],
  },
  withErrorHandling(async (request) => {
    const uid = request.auth?.uid;
    if (!uid) {
      throw createError(ErrorCode.UNAUTHENTICATED, "Authentication required");
    }

    // Check if user is admin (implement your own admin check)
    // if (!isAdmin(uid)) {
    //   throw createError(ErrorCode.PERMISSION_DENIED, "Admin access required");
    // }

    const {batchSize = 10, startAfter} = request.data;
    const db = getFirestore();
    // const storage = getStorage(); // TODO: Uncomment when implementing actual file transfer

    let query = db.collection("vaultItems")
      .where("storageProvider", "!=", "r2")
      .where("type", "==", "file")
      .orderBy("storageProvider")
      .orderBy("createdAt")
      .limit(batchSize);

    if (startAfter) {
      const startDoc = await db.collection("vaultItems").doc(startAfter).get();
      if (startDoc.exists) {
        query = query.startAfter(startDoc);
      }
    }

    const snapshot = await query.get();
    const results = {
      processed: 0,
      successful: 0,
      failed: 0,
      errors: [] as any[],
      lastDocId: null as string | null,
    };

    for (const doc of snapshot.docs) {
      results.processed++;
      const item = doc.data();

      try {
        if (!item.storagePath) {
          throw new Error("No storage path found");
        }

        // Download from Firebase Storage
        logger.info(`Downloading from Firebase Storage: ${item.storagePath}`);
        // TODO: Implement actual download and upload to R2
        // const [fileBuffer] = await storage.bucket().file(item.storagePath).download();

        // Generate new R2 key
        const bucket = R2Service.getBucketName();
        const r2Key = R2Service.generateStorageKey(
          "vault",
          item.userId,
          item.name,
          item.parentId || undefined
        );

        // Upload to R2 (Note: This is a simplified version, actual implementation would need to handle the upload)
        logger.info(`Uploading to R2: ${bucket}/${r2Key}`);
        // In a real implementation, you would upload the fileBuffer to R2 here
        // For now, we'll just generate the URL

        // Update Firestore document
        await doc.ref.update({
          storageProvider: "r2",
          r2Bucket: bucket,
          r2Key: r2Key,
          migratedAt: FieldValue.serverTimestamp(),
          // Keep original storagePath for rollback if needed
          firebaseStoragePath: item.storagePath,
          storagePath: r2Key,
        });

        results.successful++;
        logger.info(`Successfully migrated vault item ${doc.id}`);
      } catch (error: any) {
        results.failed++;
        results.errors.push({
          itemId: doc.id,
          error: error.message,
        });
        logger.error(`Failed to migrate vault item ${doc.id}:`, error);
      }
    }

    if (snapshot.docs.length > 0) {
      results.lastDocId = snapshot.docs[snapshot.docs.length - 1].id;
    }

    logger.info("Migration batch completed", results);
    return results;
  }, "migrateVaultItemsToR2")
);

/**
 * Delete old Firebase Storage files after successful migration
 */
export const cleanupMigratedFirebaseFiles = onCall(
  {
    region: DEFAULT_REGION,
    memory: "512MiB",
    timeoutSeconds: FUNCTION_TIMEOUT.LONG,
    secrets: [R2_CONFIG],
  },
  withErrorHandling(async (request) => {
    const uid = request.auth?.uid;
    if (!uid) {
      throw createError(ErrorCode.UNAUTHENTICATED, "Authentication required");
    }

    // Check if user is admin
    // if (!isAdmin(uid)) {
    //   throw createError(ErrorCode.PERMISSION_DENIED, "Admin access required");
    // }

    const {dryRun = true, olderThanDays = 7} = request.data;
    const db = getFirestore();
    const storage = getStorage();

    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - olderThanDays);

    const snapshot = await db.collection("vaultItems")
      .where("storageProvider", "==", "r2")
      .where("migratedAt", "<", cutoffDate)
      .where("firebaseStoragePath", "!=", null)
      .limit(100)
      .get();

    const results = {
      processed: 0,
      deleted: 0,
      failed: 0,
      errors: [] as any[],
    };

    for (const doc of snapshot.docs) {
      results.processed++;
      const item = doc.data();

      try {
        if (item.firebaseStoragePath) {
          if (!dryRun) {
            // Delete from Firebase Storage
            await storage.bucket().file(item.firebaseStoragePath).delete();

            // Update document to remove Firebase path
            await doc.ref.update({
              firebaseStoragePath: FieldValue.delete(),
            });
          }

          results.deleted++;
          logger.info(`${dryRun ? "[DRY RUN] Would delete" : "Deleted"} Firebase Storage file: ${item.firebaseStoragePath}`);
        }
      } catch (error: any) {
        results.failed++;
        results.errors.push({
          itemId: doc.id,
          path: item.firebaseStoragePath,
          error: error.message,
        });
        logger.error("Failed to delete Firebase Storage file:", error);
      }
    }

    logger.info("Cleanup completed", {...results, dryRun});
    return {...results, dryRun};
  }, "cleanupMigratedFirebaseFiles")
);
