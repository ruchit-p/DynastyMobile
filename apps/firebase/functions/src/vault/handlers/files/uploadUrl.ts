import {onCall} from "firebase-functions/v2/https";
import {getFirestore, FieldValue, Timestamp} from "firebase-admin/firestore";
import {logger} from "firebase-functions/v2";
import {DEFAULT_REGION, FUNCTION_TIMEOUT} from "../../../common";
import {createError, ErrorCode} from "../../../utils/errors";
import {withAuth, requireAuth} from "../../../middleware";
import {SECURITY_CONFIG} from "../../../config/security-config";
import {getCorsOptions} from "../../../config/cors";
import {validateRequest} from "../../../utils/request-validator";
import {VALIDATION_SCHEMAS} from "../../../config/validation-schemas";
import {sanitizeFileName, sanitizeMimeType} from "../../../utils/vault-sanitization";
import {createLogContext} from "../../../utils/sanitization";
import {validateUploadRequest} from "../../../utils/fileValidation";
import {SubscriptionValidationService} from "../../../services/subscriptionValidationService";
import {getStorageAdapter} from "../../../services/storageAdapter";
import {getVaultScanConfig} from "../../../config/vaultScanSecrets";
import {R2_CONFIG} from "../../../config/r2Secrets";
import {VaultItem} from "../utils/types";

/**
 * Generate a signed upload URL for vault file uploads
 */
export const getVaultUploadSignedUrl = onCall(
  {
    ...getCorsOptions(),
    region: DEFAULT_REGION,
    memory: "256MiB",
    timeoutSeconds: FUNCTION_TIMEOUT.SHORT,
    secrets: [R2_CONFIG],
  },
  withAuth(
    async (request) => {
      const uid = requireAuth(request);

      // Validate and sanitize input using centralized validator
      const validatedData = validateRequest(
        request.data,
        VALIDATION_SCHEMAS.getVaultUploadSignedUrl,
        uid
      );

      const {fileName, mimeType, parentId = null, isEncrypted = false, fileSize} = validatedData;

      // Sanitize inputs
      const sanitizedFileName = sanitizeFileName(fileName);
      const sanitizedMimeType = sanitizeMimeType(mimeType);

      // Use the new SubscriptionValidationService for comprehensive storage validation
      const validationService = new SubscriptionValidationService();
      const storageValidation = await validationService.validateStorageAllocation(
        uid,
        fileSize,
        sanitizedMimeType
      );

      if (!storageValidation.isValid) {
        throw createError(ErrorCode.RESOURCE_EXHAUSTED, storageValidation.errors.join("; "));
      }

      // Log warnings if any (e.g., usage > 80%)
      if (storageValidation.warnings && storageValidation.warnings.length > 0) {
        logger.warn("Storage allocation warnings", {
          userId: uid,
          warnings: storageValidation.warnings,
          fileSize,
          fileName: sanitizedFileName,
        });
      }

      // Validate file for security (MIME type, extensions)
      const validation = validateUploadRequest(sanitizedFileName, sanitizedMimeType);
      if (!validation.valid) {
        throw createError(ErrorCode.INVALID_REQUEST, validation.error || "Invalid upload request");
      }

      const db = getFirestore();
      let parentPath = "";
      if (parentId) {
        const parentDoc = await db.collection("vaultItems").doc(parentId).get();
        if (!parentDoc.exists) {
          throw createError(ErrorCode.NOT_FOUND, "Parent folder not found");
        }
        parentPath = (parentDoc.data() as VaultItem).path;
      }

      // Initialize storage adapter
      const storageAdapter = getStorageAdapter();
      // Force provider to be "r2"
      const storageProvider = "r2";

      // Pre-create the vault item BEFORE generating signed URL
      const vaultItemData: Partial<VaultItem> = {
        userId: uid,
        name: sanitizedFileName,
        type: "file",
        parentId,
        path: parentPath ? `${parentPath}/${sanitizedFileName}` : `/${sanitizedFileName}`,
        createdAt: FieldValue.serverTimestamp() as Timestamp,
        updatedAt: FieldValue.serverTimestamp() as Timestamp,
        size: fileSize,
        mimeType: sanitizedMimeType,
        isDeleted: false,
        isEncrypted,
        storageProvider,
        scanStatus: "pending", // Add scanStatus field
      };

      // Create the item in Firestore first to get the document ID
      const docRef = await db.collection("vaultItems").add(vaultItemData);
      const itemId = docRef.id;

      // Use R2 staging bucket for initial upload (quarantine bucket pattern)
      const scanConfig = getVaultScanConfig();
      const r2StagingBucket = scanConfig.stagingBucket;
      const r2StagingKey = `staging/${uid}/${Date.now()}_${sanitizedFileName}`;
      
      logger.info("Generating upload URL for staging bucket", createLogContext({
        stagingBucket: r2StagingBucket,
        stagingKey: r2StagingKey,
        fileName: sanitizedFileName,
        userId: uid,
      }));

      const result = await storageAdapter.generateUploadUrl({
        path: r2StagingKey,
        contentType: sanitizedMimeType,
        expiresIn: 300, // 5 minutes
        metadata: {
          "uploadedby": uid, // lowercase key
          "originalname": sanitizedFileName, // lowercase key
          "parentid": parentId || "root", // lowercase key
          "isencrypted": isEncrypted.toString(), // lowercase key
          "cf-item-id": itemId, // Add cf-item-id with the document ID
          "scan-status": "pending", // Track scan status
          "staging-upload": "true", // Mark as staging upload
        },
        bucket: r2StagingBucket,
        provider: "r2",
      });

      const signedUrl = result.signedUrl;
      const storagePath = r2StagingKey; // For staging, storagePath is the staging key

      // Update the vault item with staging details and cached upload URL
      await docRef.update({
        storagePath,
        r2StagingBucket,
        r2StagingKey,
        storageProvider: "r2_staging", // Mark as staging
        cachedUploadUrl: signedUrl,
        cachedUploadUrlExpiry: Timestamp.fromMillis(Date.now() + 300000), // 5 minutes
      });

      return {
        signedUrl,
        storagePath,
        parentPathInVault: parentPath,
        isEncrypted,
        itemId: docRef.id,
        storageProvider,
        r2Bucket: r2StagingBucket,
        r2Key: r2StagingKey,
      };
    },
    "getVaultUploadSignedUrl",
    {
      authLevel: "onboarded",
      rateLimitConfig: SECURITY_CONFIG.rateLimits.mediaUpload,
    }
  )
);