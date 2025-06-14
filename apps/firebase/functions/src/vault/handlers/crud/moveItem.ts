import {onCall} from "firebase-functions/v2/https";
import {getFirestore, FieldValue} from "firebase-admin/firestore";
import {DEFAULT_REGION, FUNCTION_TIMEOUT} from "../../../common";
import {createError, withErrorHandling, ErrorCode} from "../../../utils/errors";
import {withAuth, requireAuth} from "../../../middleware";
import {SECURITY_CONFIG} from "../../../config/security-config";
import {getCorsOptions} from "../../../config/cors";
import {validateRequest} from "../../../utils/request-validator";
import {VALIDATION_SCHEMAS} from "../../../config/validation-schemas";
import {VaultItem} from "../utils/types";
import {updateDescendantPathsRecursive} from "../access/verifyAccess";

/**
 * Move a vault item to a different folder
 */
export const moveVaultItem = onCall(
  {
    ...getCorsOptions(),
    region: DEFAULT_REGION,
    memory: "256MiB",
    timeoutSeconds: FUNCTION_TIMEOUT.SHORT,
  },
  withAuth(
    async (request) => {
      const uid = requireAuth(request);

      // Validate and sanitize input using centralized validator
      const validatedData = validateRequest(request.data, VALIDATION_SCHEMAS.moveVaultItem, uid);

      const {itemId, newParentId = null} = validatedData;
      
      const db = getFirestore();
      const docRef = db.collection("vaultItems").doc(itemId);
      const doc = await docRef.get();
      
      if (!doc.exists) {
        throw createError(ErrorCode.NOT_FOUND, "Item not found");
      }
      
      const data = doc.data() as VaultItem;
      if (data.userId !== uid) {
        throw createError(ErrorCode.PERMISSION_DENIED, "Permission denied");
      }
      
      // Prevent moving into itself or descendant
      if (newParentId === itemId) {
        throw createError(ErrorCode.INVALID_ARGUMENT, "Cannot move item into itself");
      }
      
      // Build new path
      let parentPath = "";
      if (newParentId) {
        const parentDoc = await db.collection("vaultItems").doc(newParentId).get();
        if (!parentDoc.exists) {
          throw createError(ErrorCode.NOT_FOUND, "Destination folder not found");
        }
        const parentData = parentDoc.data() as VaultItem;
        parentPath = parentData.path;
      }
      
      const newPath = parentPath ? `${parentPath}/${data.name}` : `/${data.name}`;
      
      // Update this item
      await docRef.update({
        parentId: newParentId,
        path: newPath,
        updatedAt: FieldValue.serverTimestamp(),
      });
      
      // If folder, update descendants
      if (data.type === "folder") {
        await updateDescendantPathsRecursive(db, itemId, newPath);
      }
      
      return {success: true};
    },
    "moveVaultItem",
    {
      authLevel: "onboarded",
      rateLimitConfig: SECURITY_CONFIG.rateLimits.write,
    }
  )
);