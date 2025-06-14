import {onCall} from "firebase-functions/v2/https";
import {getFirestore, FieldValue} from "firebase-admin/firestore";
import {DEFAULT_REGION, FUNCTION_TIMEOUT} from "../../../common";
import {createError, withErrorHandling, ErrorCode} from "../../../utils/errors";
import {withAuth, requireAuth} from "../../../middleware";
import {SECURITY_CONFIG} from "../../../config/security-config";
import {getCorsOptions} from "../../../config/cors";
import {validateRequest} from "../../../utils/request-validator";
import {VALIDATION_SCHEMAS} from "../../../config/validation-schemas";
import {sanitizeFolderName} from "../../../utils/vault-sanitization";
import {VaultItem} from "../utils/types";

/**
 * Create a new folder in the vault
 */
export const createVaultFolder = onCall(
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
      const validatedData = validateRequest(
        request.data,
        VALIDATION_SCHEMAS.createVaultFolder,
        uid
      );

      const {name, parentFolderId} = validatedData;
      const parentId = parentFolderId ?? null;

      // Additional sanitization for folder name
      const sanitizedName = sanitizeFolderName(name);

      const db = getFirestore();
      
      // Build path with sanitized name
      let path = `/${sanitizedName}`;
      if (parentId) {
        const parentDoc = await db.collection("vaultItems").doc(parentId).get();
        if (!parentDoc.exists) {
          throw createError(ErrorCode.NOT_FOUND, "Parent folder not found");
        }
        const parentData = parentDoc.data() as VaultItem;
        path = `${parentData.path}/${sanitizedName}`;
      }
      
      const docRef = await db.collection("vaultItems").add({
        userId: uid,
        ownerId: uid,
        name: sanitizedName,
        type: "folder",
        parentId,
        path,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
        isDeleted: false,
      });
      
      return {id: docRef.id};
    },
    "createVaultFolder",
    {
      authLevel: "onboarded",
      rateLimitConfig: SECURITY_CONFIG.rateLimits.write,
    }
  )
);