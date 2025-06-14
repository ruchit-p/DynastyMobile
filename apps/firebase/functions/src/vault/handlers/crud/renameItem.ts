import {onCall} from "firebase-functions/v2/https";
import {getFirestore, FieldValue} from "firebase-admin/firestore";
import {DEFAULT_REGION, FUNCTION_TIMEOUT} from "../../../common";
import {createError, withErrorHandling, ErrorCode} from "../../../utils/errors";
import {withAuth, requireAuth} from "../../../middleware";
import {SECURITY_CONFIG} from "../../../config/security-config";
import {getCorsOptions} from "../../../config/cors";
import {validateRequest} from "../../../utils/request-validator";
import {VALIDATION_SCHEMAS} from "../../../config/validation-schemas";
import {sanitizeFileName} from "../../../utils/vault-sanitization";
import {VaultItem} from "../utils/types";
import {updateDescendantPathsRecursive} from "../access/verifyAccess";

/**
 * Rename a vault item (file or folder)
 */
export const renameVaultItem = onCall(
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
      const validatedData = validateRequest(request.data, VALIDATION_SCHEMAS.renameVaultItem, uid);

      const {itemId, newName} = validatedData;
      
      // Additional sanitization for filename
      const sanitizedName = sanitizeFileName(newName);

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

      // Build new path with sanitized name
      const parentPath = data.parentId ?
        (await db.collection("vaultItems").doc(data.parentId).get()).data()!.path :
        "";
      const newPath = parentPath ? `${parentPath}/${sanitizedName}` : `/${sanitizedName}`;
      
      // Update this item
      await docRef.update({
        name: sanitizedName,
        path: newPath,
        updatedAt: FieldValue.serverTimestamp(),
      });
      
      // If folder, update descendants
      if (data.type === "folder") {
        await updateDescendantPathsRecursive(db, itemId, newPath);
      }
      
      return {success: true};
    },
    "renameVaultItem",
    {
      authLevel: "onboarded",
      rateLimitConfig: SECURITY_CONFIG.rateLimits.write,
    }
  )
);