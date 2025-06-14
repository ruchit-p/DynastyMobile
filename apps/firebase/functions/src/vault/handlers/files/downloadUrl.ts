import {onCall} from "firebase-functions/v2/https";
import {getFirestore, FieldValue, Timestamp} from "firebase-admin/firestore";
import {getStorage} from "firebase-admin/storage";
import {logger} from "firebase-functions/v2";
import {DEFAULT_REGION, FUNCTION_TIMEOUT} from "../../../common";
import {createError, withErrorHandling, ErrorCode} from "../../../utils/errors";
import {SECURITY_CONFIG} from "../../../config/security-config";
import {validateRequest} from "../../../utils/request-validator";
import {VALIDATION_SCHEMAS} from "../../../config/validation-schemas";
import {sanitizeFileName} from "../../../utils/vault-sanitization";
import {createLogContext, formatErrorForLogging} from "../../../utils/sanitization";
import {getStorageAdapter} from "../../../services/storageAdapter";
import {R2_CONFIG} from "../../../config/r2Secrets";
import {verifyVaultItemAccess} from "../access/verifyAccess";
import {VaultItem} from "../utils/types";

/**
 * Generate a signed download URL for vault files
 */
export const getVaultDownloadUrl = onCall(
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

    // Validate and sanitize input using centralized validator
    const validatedData = validateRequest(
      request.data,
      VALIDATION_SCHEMAS.getVaultDownloadUrl,
      uid
    );

    const {itemId, storagePath} = validatedData;
    if (!itemId && !storagePath) {
      throw createError(ErrorCode.MISSING_PARAMETERS, "Either itemId or storagePath is required");
    }

    const db = getFirestore();
    let vaultItem: VaultItem | undefined;

    // If itemId is provided, verify access through item permissions
    if (itemId) {
      const accessResult = await verifyVaultItemAccess(db, itemId, uid, "read");
      if (!accessResult.hasAccess) {
        throw createError(
          ErrorCode.PERMISSION_DENIED,
          `Access denied: ${accessResult.reason || "No read permission"}`
        );
      }
      vaultItem = accessResult.item;

      if (!vaultItem?.storagePath && !vaultItem?.r2Key && !vaultItem?.b2Key) {
        throw createError(
          ErrorCode.INVALID_REQUEST,
          "Vault item does not have an associated storage path"
        );
      }
    } else {
      // Legacy support: verify by storagePath (less secure, should be deprecated)
      const itemQuery = await db
        .collection("vaultItems")
        .where("storagePath", "==", storagePath)
        .where("isDeleted", "==", false)
        .limit(1)
        .get();

      if (itemQuery.empty) {
        throw createError(ErrorCode.NOT_FOUND, "Vault item not found for storage path");
      }

      const itemDoc = itemQuery.docs[0];
      const accessResult = await verifyVaultItemAccess(db, itemDoc.id, uid, "read");
      if (!accessResult.hasAccess) {
        throw createError(
          ErrorCode.PERMISSION_DENIED,
          `Access denied: ${accessResult.reason || "No read permission"}`
        );
      }
      vaultItem = accessResult.item;
    }

    // Check if we have a cached download URL that's still valid
    if (vaultItem?.cachedDownloadUrl && vaultItem?.cachedDownloadUrlExpiry) {
      const expiry = vaultItem.cachedDownloadUrlExpiry.toMillis();
      if (expiry > Date.now() + 300000) {
        // Still valid for at least 5 minutes
        logger.info(
          "Using cached download URL",
          createLogContext({
            fileName: sanitizeFileName(vaultItem.name),
            userId: uid,
          })
        );
        return {downloadUrl: vaultItem.cachedDownloadUrl};
      }
    }

    let signedUrl: string;
    const expiresInMinutes = 60; // 1 hour
    const expires = Date.now() + expiresInMinutes * 60 * 1000;

    try {
      // Generate new URL based on storage provider
      if (vaultItem?.storageProvider === "r2" && vaultItem?.r2Bucket && vaultItem?.r2Key) {
        // Use R2 for download
        const storageAdapter = getStorageAdapter();
        const result = await storageAdapter.generateDownloadUrl(
          vaultItem.r2Key,
          3600 // 1 hour
        );
        signedUrl = result.signedUrl;
      } else if (vaultItem?.storageProvider === "b2" && vaultItem?.b2Bucket && vaultItem?.b2Key) {
        // Use B2 for download
        const storageAdapter = getStorageAdapter();
        const result = await storageAdapter.generateDownloadUrl(
          vaultItem.b2Key,
          3600 // 1 hour
        );
        signedUrl = result.signedUrl;
      } else {
        // Use Firebase Storage
        const finalStoragePath = vaultItem?.storagePath || storagePath;
        const [url] = await getStorage().bucket().file(finalStoragePath).getSignedUrl({
          version: "v4",
          action: "read",
          expires,
        });
        signedUrl = url;
      }

      // Update cached URL in Firestore (without triggering updatedAt)
      if (vaultItem?.id) {
        await db
          .collection("vaultItems")
          .doc(vaultItem.id)
          .update({
            cachedDownloadUrl: signedUrl,
            cachedDownloadUrlExpiry: Timestamp.fromMillis(expires),
          });
      }

      // Create detailed audit log for file access
      await db.collection("vaultAuditLogs").add({
        itemId: vaultItem?.id,
        storagePath: vaultItem?.storagePath || vaultItem?.r2Key || vaultItem?.b2Key,
        userId: uid,
        action: "download",
        timestamp: FieldValue.serverTimestamp(),
        metadata: {
          itemName: vaultItem?.name,
          itemType: vaultItem?.type,
          fileType: vaultItem?.fileType,
          accessLevel: vaultItem?.userId === uid ? "owner" : "shared",
          isEncrypted: vaultItem?.isEncrypted || false,
          storageProvider: vaultItem?.storageProvider || "firebase",
        },
      });

      logger.info(
        "Generated download URL",
        createLogContext({
          fileName: sanitizeFileName(vaultItem?.name || "unknown"),
          userId: uid,
          storageProvider: vaultItem?.storageProvider || "firebase",
        })
      );
      return {downloadUrl: signedUrl};
    } catch (error) {
      const {message, context} = formatErrorForLogging(error, {
        fileName: vaultItem?.name ? sanitizeFileName(vaultItem.name) : undefined,
        userId: uid,
        storageProvider: vaultItem?.storageProvider,
      });
      logger.error("Error generating signed URL", {message, ...context});
      throw createError(ErrorCode.INTERNAL, "Failed to generate download URL");
    }
  }, "getVaultDownloadUrl")
);