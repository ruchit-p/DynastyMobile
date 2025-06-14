import {onCall} from "firebase-functions/v2/https";
import {getFirestore, FieldValue} from "firebase-admin/firestore";
import {getStorage} from "firebase-admin/storage";
import {logger} from "firebase-functions/v2";
import {DEFAULT_REGION, FUNCTION_TIMEOUT} from "../../../common";
import {createError, ErrorCode} from "../../../utils/errors";
import {withAuth, requireAuth} from "../../../middleware";
import {SECURITY_CONFIG} from "../../../config/security-config";
import {validateRequest} from "../../../utils/request-validator";
import {VALIDATION_SCHEMAS} from "../../../config/validation-schemas";
import {createLogContext, formatErrorForLogging} from "../../../utils/sanitization";
import {getStorageAdapter} from "../../../services/storageAdapter";
import {fileSecurityService} from "../../../services/fileSecurityService";
import {VaultItem} from "../utils/types";

/**
 * Add a vault file after upload (complete the upload process)
 */
export const addVaultFile = onCall(
  {
    region: DEFAULT_REGION,
    memory: "256MiB",
    timeoutSeconds: FUNCTION_TIMEOUT.SHORT,
  },
  withAuth(
    async (request) => {
      const uid = requireAuth(request);

      // Validate and sanitize input using centralized validator
      const validatedData = validateRequest(request.data, VALIDATION_SCHEMAS.addVaultFile, uid);

      const {
        itemId, // New: ID of pre-created item from getVaultUploadSignedUrl
        name, // The file name
        parentId = null, // The ID of the parent folder in the vault
        storagePath, // The full path in Firebase Storage where the file was uploaded
        // downloadURL is NO LONGER passed from client; it's generated here.
        fileType,
        size,
        mimeType,
        // Encryption fields
        isEncrypted = false,
        encryptionKeyId = null,
      } = validatedData;

      const db = getFirestore();

      // If itemId is provided, update the pre-created item
      if (itemId) {
        const itemRef = db.collection("vaultItems").doc(itemId);
        const itemDoc = await itemRef.get();

        if (!itemDoc.exists) {
          throw createError(ErrorCode.NOT_FOUND, "Pre-created vault item not found");
        }

        const existingItem = itemDoc.data() as VaultItem;

        // Verify ownership
        if (existingItem.userId !== uid) {
          throw createError(
            ErrorCode.PERMISSION_DENIED,
            "You don't have permission to update this item"
          );
        }

        // Update the item with final details
        const updateData: any = {
          updatedAt: FieldValue.serverTimestamp(),
          // Update size if provided
          ...(size && {size}),
          // Clear cached upload URL
          cachedUploadUrl: FieldValue.delete(),
          cachedUploadUrlExpiry: FieldValue.delete(),
        };

        // Add encryption fields if file is encrypted
        if (isEncrypted && encryptionKeyId) {
          updateData.isEncrypted = true;
          updateData.encryptionKeyId = encryptionKeyId;
          updateData.encryptedBy = uid;
        }

        await itemRef.update(updateData);

        // For quarantine bucket system, files are scanned asynchronously
        if (existingItem.storageProvider === "r2_staging") {
          // File is in staging bucket - will be scanned by the scanning function
          logger.info(
            "File uploaded to staging bucket, queued for scanning",
            createLogContext({
              fileName: existingItem.name,
              fileSize: size || existingItem.size || 0,
              stagingKey: existingItem.r2StagingKey,
              userId: uid,
            })
          );

          // Mark scan as pending (should already be pending from getVaultUploadSignedUrl)
          await itemRef.update({
            scanStatus: "pending",
            uploadCompletedAt: FieldValue.serverTimestamp(),
          });

          // Return success - scanning will happen asynchronously
          return {
            success: true,
            itemId,
            scanStatus: "pending",
            message: "File uploaded successfully. Virus scanning in progress.",
          };
        } else if (existingItem.storageProvider === "r2" && existingItem.r2Key) {
          // Legacy R2 upload - perform immediate scan for backward compatibility
          try {
            logger.info(
              "Starting immediate security scan for legacy upload",
              createLogContext({
                fileName: existingItem.name,
                fileSize: size || existingItem.size || 0,
                userId: uid,
              })
            );

            const storageAdapter = getStorageAdapter();
            const downloadUrl = await storageAdapter.generateDownloadUrl({
              path: existingItem.r2Key,
              expiresIn: 300, // 5 minutes expiry
              bucket: existingItem.r2Bucket,
              provider: "r2",
            });

            // Fetch the file content
            const response = await fetch(downloadUrl.signedUrl);
            if (!response.ok) {
              throw new Error(`Failed to download file from R2: ${response.statusText}`);
            }
            const arrayBuffer = await response.arrayBuffer();
            const fileBuffer = Buffer.from(arrayBuffer);

            // Perform immediate scan for legacy uploads
            const scanResult = await fileSecurityService.scanFile(
              fileBuffer,
              existingItem.name,
              existingItem.mimeType || "application/octet-stream",
              size || existingItem.size || 0,
              uid
            );

            if (!scanResult.safe) {
              // File is not safe - delete it and the vault item
              logger.warn(
                "File failed security scan",
                createLogContext({
                  fileName: existingItem.name,
                  threats: scanResult.threats,
                  userId: uid,
                })
              );

              // Delete the file from storage
              await storageAdapter.deleteFile({
                path: existingItem.r2Key,
                bucket: existingItem.r2Bucket,
                provider: "r2",
              });

              // Delete the vault item
              await itemRef.delete();

              throw createError(
                ErrorCode.INVALID_REQUEST,
                `File failed security scan: ${scanResult.threats.join(", ")}`
              );
            }

            // Update item with scan results
            await itemRef.update({
              lastScannedAt: FieldValue.serverTimestamp(),
              scanResult: "safe",
              scanStatus: "clean",
            });

            logger.info(
              "File passed security scan",
              createLogContext({
                fileName: existingItem.name,
                userId: uid,
              })
            );
          } catch (scanError) {
            const {message, context} = formatErrorForLogging(scanError, {
              fileName: existingItem.name,
              userId: uid,
            });
            logger.error("Error during file security scan", {message, ...context});

            // On scan error, fail closed (reject the file)
            const storageAdapter = getStorageAdapter();
            await storageAdapter.deleteFile({
              path: existingItem.r2Key,
              bucket: existingItem.r2Bucket,
              provider: "r2",
            });

            await itemRef.delete();

            throw createError(
              ErrorCode.INVALID_REQUEST,
              "File failed security scan due to processing error"
            );
          }
        } else {
          // Legacy Firebase Storage upload - perform immediate scan
          try {
            logger.info(
              "Starting immediate security scan for Firebase Storage upload",
              createLogContext({
                fileName: existingItem.name,
                fileSize: size || existingItem.size || 0,
                userId: uid,
              })
            );

            const storagePath = existingItem.storagePath || "";
            if (!storagePath) {
              throw new Error("Storage path is missing");
            }
            
            const file = getStorage().bucket().file(storagePath);
            const [exists] = await file.exists();

            if (!exists) {
              throw new Error("Uploaded file not found in storage");
            }

            const [buffer] = await file.download();
            
            // Perform immediate scan for Firebase Storage uploads
            const scanResult = await fileSecurityService.scanFile(
              buffer,
              existingItem.name,
              existingItem.mimeType || "application/octet-stream",
              size || existingItem.size || 0,
              uid
            );

            if (!scanResult.safe) {
              // File is not safe - delete it and the vault item
              logger.warn(
                "File failed security scan",
                createLogContext({
                  fileName: existingItem.name,
                  threats: scanResult.threats,
                  userId: uid,
                })
              );

              // Delete the file from Firebase Storage
              await file.delete();

              // Delete the vault item
              await itemRef.delete();

              throw createError(
                ErrorCode.INVALID_REQUEST,
                `File failed security scan: ${scanResult.threats.join(", ")}`
              );
            }

            // Update item with scan results
            await itemRef.update({
              lastScannedAt: FieldValue.serverTimestamp(),
              scanResult: "safe",
              scanStatus: "clean",
            });

            logger.info(
              "File passed security scan",
              createLogContext({
                fileName: existingItem.name,
                userId: uid,
              })
            );
          } catch (scanError) {
            const {message, context} = formatErrorForLogging(scanError, {
              fileName: existingItem.name,
              userId: uid,
            });
            logger.error("Error during Firebase Storage file security scan", {message, ...context});

            // On scan error, fail closed (reject the file)
            const storagePath = existingItem.storagePath || "";
            if (storagePath) {
              await getStorage().bucket().file(storagePath).delete();
            }

            await itemRef.delete();

            throw createError(
              ErrorCode.INVALID_REQUEST,
              "File failed security scan due to processing error"
            );
          }
        }

        // Return success for legacy uploads
        return {
          success: true,
          itemId,
          scanStatus: "clean",
          message: "File uploaded and scanned successfully.",
        };
      } else {
        // Legacy flow: not supported in quarantine bucket system
        throw createError(
          ErrorCode.INVALID_REQUEST,
          "Legacy upload flow not supported. Please use getVaultUploadSignedUrl first."
        );
      }
    },
    "addVaultFile",
    {
      authLevel: "onboarded",
      rateLimitConfig: SECURITY_CONFIG.rateLimits.write,
    }
  )
);