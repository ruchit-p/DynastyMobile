import {onCall} from "firebase-functions/v2/https";
import {getFirestore, FieldValue, FieldPath} from "firebase-admin/firestore";
import {logger} from "firebase-functions/v2";
import {DEFAULT_REGION, FUNCTION_TIMEOUT} from "../../../common";
import {createError, ErrorCode} from "../../../utils/errors";
import {withAuth, requireAuth} from "../../../middleware";
import {SECURITY_CONFIG} from "../../../config/security-config";
import {validateRequest} from "../../../utils/request-validator";
import {VALIDATION_SCHEMAS} from "../../../config/validation-schemas";
import {createLogContext} from "../../../utils/sanitization";
import {VaultItem} from "../utils/types";

/**
 * Share a vault item with other users
 */
export const shareVaultItem = onCall(
  {
    region: DEFAULT_REGION,
    memory: "256MiB",
    timeoutSeconds: FUNCTION_TIMEOUT.SHORT,
  },
  withAuth(
    async (request) => {
      const uid = requireAuth(request);

      // Validate and sanitize input using centralized validator
      const validatedData = validateRequest(request.data, VALIDATION_SCHEMAS.shareVaultItem, uid);

      const {itemId, userIds, permissions = "read"} = validatedData;

      const db = getFirestore();
      const itemRef = db.collection("vaultItems").doc(itemId);
      const doc = await itemRef.get();

      if (!doc.exists) {
        throw createError(ErrorCode.NOT_FOUND, "Vault item not found");
      }

      const data = doc.data() as VaultItem;
      if (data.userId !== uid) {
        throw createError(
          ErrorCode.PERMISSION_DENIED,
          "You don't have permission to share this item"
        );
      }

      // Verify all user IDs exist
      const usersSnapshot = await db
        .collection("users")
        .where(FieldPath.documentId(), "in", userIds)
        .get();

      if (usersSnapshot.size !== userIds.length) {
        throw createError(ErrorCode.INVALID_REQUEST, "One or more user IDs are invalid");
      }

      // Update sharing permissions
      const currentSharedWith = data.sharedWith || [];
      const currentPermissions = data.permissions || {canRead: [], canWrite: []};

      // Remove duplicates and merge
      const newSharedWith = Array.from(new Set([...currentSharedWith, ...userIds]));
      const newPermissions = {
        canRead:
          permissions === "read" ?
            Array.from(new Set([...(currentPermissions.canRead || []), ...userIds])) :
            currentPermissions.canRead || [],
        canWrite:
          permissions === "write" ?
            Array.from(new Set([...(currentPermissions.canWrite || []), ...userIds])) :
            currentPermissions.canWrite || [],
      };

      // If granting write permission, also grant read
      if (permissions === "write") {
        newPermissions.canRead = Array.from(new Set([...newPermissions.canRead, ...userIds]));
      }

      await itemRef.update({
        sharedWith: newSharedWith,
        permissions: newPermissions,
        updatedAt: FieldValue.serverTimestamp(),
      });

      // Create audit log entries
      const batch = db.batch();
      for (const userId of userIds) {
        const auditRef = db.collection("vaultAuditLogs").doc();
        batch.set(auditRef, {
          itemId,
          userId: uid,
          targetUserId: userId,
          action: "share",
          permissions,
          timestamp: FieldValue.serverTimestamp(),
          metadata: {
            itemName: data.name,
            itemType: data.type,
          },
        });
      }
      await batch.commit();

      logger.info(
        "Shared vault item",
        createLogContext({
          itemId,
          sharedWithCount: userIds.length,
          permissions,
          userId: uid,
        })
      );
      return {success: true};
    },
    "shareVaultItem",
    {
      authLevel: "onboarded",
      rateLimitConfig: SECURITY_CONFIG.rateLimits.write,
    }
  )
);