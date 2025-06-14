import {onCall} from "firebase-functions/v2/https";
import {getFirestore, FieldValue} from "firebase-admin/firestore";
import {logger} from "firebase-functions/v2";
import {DEFAULT_REGION, FUNCTION_TIMEOUT} from "../../../common";
import {createError, withErrorHandling, ErrorCode} from "../../../utils/errors";
import {withAuth, requireAuth} from "../../../middleware";
import {SECURITY_CONFIG} from "../../../config/security-config";
import {getCorsOptions} from "../../../config/cors";
import {validateRequest} from "../../../utils/request-validator";
import {VALIDATION_SCHEMAS} from "../../../config/validation-schemas";
import {createLogContext, formatErrorForLogging} from "../../../utils/sanitization";

/**
 * Get vault encryption status for a user
 */
export const getVaultEncryptionStatus = onCall(
  {
    ...getCorsOptions(),
    region: DEFAULT_REGION,
    memory: "256MiB",
    timeoutSeconds: FUNCTION_TIMEOUT.SHORT,
  },
  withAuth(
    async (request) => {
      const uid = requireAuth(request);

      const db = getFirestore();

      try {
        // Check if user has encryption enabled
        const userDoc = await db.collection("users").doc(uid).get();
        const userData = userDoc.data();

        const encryptionEnabled = userData?.vaultEncryptionEnabled || false;

        return {encryptionEnabled};
      } catch (error) {
        const {message, context} = formatErrorForLogging(error, {userId: uid});
        logger.error("Error getting encryption status", {message, ...context});
        return {encryptionEnabled: false};
      }
    },
    "getVaultEncryptionStatus",
    {
      authLevel: "auth",
      rateLimitConfig: SECURITY_CONFIG.rateLimits.read,
    }
  )
);

/**
 * Store encryption metadata for a vault item
 */
export const storeVaultItemEncryptionMetadata = onCall(
  {
    ...getCorsOptions(),
    region: DEFAULT_REGION,
    memory: "256MiB",
    timeoutSeconds: FUNCTION_TIMEOUT.SHORT,
  },
  withAuth(
    async (request) => {
      const uid = requireAuth(request);

      const validatedData = validateRequest(
        request.data,
        VALIDATION_SCHEMAS.storeVaultItemEncryptionMetadata,
        uid
      );

      const {itemId, encryptionMetadata} = validatedData;

      const db = getFirestore();

      // Verify ownership
      const itemDoc = await db.collection("vaultItems").doc(itemId).get();
      if (!itemDoc.exists || itemDoc.data()?.userId !== uid) {
        throw createError(ErrorCode.PERMISSION_DENIED, "Not authorized to update this item");
      }

      // Store encryption metadata in a separate collection
      await db.collection("vaultEncryptionMetadata").doc(itemId).set({
        userId: uid,
        itemId,
        encryptionMetadata,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });

      logger.info(
        "Stored encryption metadata",
        createLogContext({
          itemId,
          userId: uid,
        })
      );

      return {success: true};
    },
    "storeVaultItemEncryptionMetadata",
    {
      authLevel: "onboarded",
      rateLimitConfig: SECURITY_CONFIG.rateLimits.write,
    }
  )
);

/**
 * Get encryption metadata for a vault item
 */
export const getVaultItemEncryptionMetadata = onCall(
  {
    ...getCorsOptions(),
    region: DEFAULT_REGION,
    memory: "256MiB",
    timeoutSeconds: FUNCTION_TIMEOUT.SHORT,
  },
  withAuth(
    async (request) => {
      const uid = requireAuth(request);

      const validatedData = validateRequest(
        request.data,
        VALIDATION_SCHEMAS.getVaultItemEncryptionMetadata,
        uid
      );

      const {itemId} = validatedData;

      const db = getFirestore();

      // Verify access to the item
      const itemDoc = await db.collection("vaultItems").doc(itemId).get();
      if (!itemDoc.exists) {
        throw createError(ErrorCode.NOT_FOUND, "Vault item not found");
      }

      const itemData = itemDoc.data();
      
      // Check if user has access (owner or shared with)
      const hasAccess = itemData?.userId === uid || 
                       (itemData?.sharedWith && itemData.sharedWith.includes(uid));
      
      if (!hasAccess) {
        throw createError(ErrorCode.PERMISSION_DENIED, "Not authorized to access this item");
      }

      // Get encryption metadata
      const metadataDoc = await db.collection("vaultEncryptionMetadata").doc(itemId).get();
      
      if (!metadataDoc.exists) {
        return {encryptionMetadata: null};
      }

      const metadata = metadataDoc.data();

      return {
        encryptionMetadata: metadata?.encryptionMetadata || null,
      };
    },
    "getVaultItemEncryptionMetadata",
    {
      authLevel: "auth",
      rateLimitConfig: SECURITY_CONFIG.rateLimits.read,
    }
  )
);