import {onCall} from "firebase-functions/v2/https";
import {getFirestore} from "firebase-admin/firestore";
import {logger} from "firebase-functions/v2";
import {DEFAULT_REGION, FUNCTION_TIMEOUT} from "../../../common";
import {withAuth, requireAuth} from "../../../middleware";
import {SECURITY_CONFIG} from "../../../config/security-config";
import {getCorsOptions} from "../../../config/cors";
import {validateRequest} from "../../../utils/request-validator";
import {VALIDATION_SCHEMAS} from "../../../config/validation-schemas";
import {createLogContext} from "../../../utils/sanitization";
import {getAccessibleVaultItems} from "../access/verifyAccess";

/**
 * Get vault items for a specific parent folder
 */
export const getVaultItems = onCall(
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
      const validatedData = validateRequest(request.data, VALIDATION_SCHEMAS.getVaultItems, uid);

      const parentId = validatedData.parentId ?? null;
      const db = getFirestore();

      // Get all accessible items (owned + shared) for the specified parent
      const items = await getAccessibleVaultItems(db, uid, parentId);

      // Sort: folders first, then by name
      items.sort((a, b) => {
        if (a.type !== b.type) {
          return a.type === "folder" ? -1 : 1;
        }
        return a.name.localeCompare(b.name);
      });

      logger.info(
        "Retrieved vault items",
        createLogContext({
          itemCount: items.length,
          userId: uid,
          parentId: parentId || "root",
        })
      );
      
      return {items};
    },
    "getVaultItems",
    {
      authLevel: "onboarded",
      rateLimitConfig: SECURITY_CONFIG.rateLimits.read,
    }
  )
);