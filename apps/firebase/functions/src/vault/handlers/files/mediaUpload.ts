import {onCall} from "firebase-functions/v2/https";
import {getStorage} from "firebase-admin/storage";
import {DEFAULT_REGION, FUNCTION_TIMEOUT} from "../../../common";
import {createError, ErrorCode} from "../../../utils/errors";
import {withAuth, requireAuth} from "../../../middleware";
import {SECURITY_CONFIG} from "../../../config/security-config";
import {getCorsOptions} from "../../../config/cors";
import {getStorageAdapter} from "../../../services/storageAdapter";
import {checkUserStorageCapacity} from "../../../utils/storageUtils";
import {logVaultAuditEvent} from "../../utils/audit";

/**
 * Generate a signed upload URL for media files
 */
export const getMediaUploadUrl = onCall(
  {
    ...getCorsOptions(),
    region: DEFAULT_REGION,
    memory: "256MiB",
    timeoutSeconds: FUNCTION_TIMEOUT.SHORT,
  },
  withAuth(
    async (request) => {
      const uid = requireAuth(request);

      const {path, contentType, fileSize, metadata} = request.data as {
        path: string;
        contentType: string;
        fileSize: number;
        metadata?: Record<string, string>;
      };

      // Validate input
      if (!path || !contentType || !fileSize) {
        throw createError(ErrorCode.INVALID_ARGUMENT, "Missing required fields");
      }

      // Check user's storage capacity
      const storageCheck = await checkUserStorageCapacity(uid, fileSize);
      if (!storageCheck.allowed) {
        throw createError(
          ErrorCode.RESOURCE_EXHAUSTED,
          storageCheck.reason || "Insufficient storage capacity"
        );
      }

      // Sanitize path
      const sanitizedPath = path.replace(/[^a-zA-Z0-9\-_/.]/g, "_");

      // Initialize storage adapter
      const storageAdapter = getStorageAdapter();
      // Default to R2, fallback to Firebase only for local emulator without R2
      const storageProvider = process.env.STORAGE_PROVIDER === "firebase" ? "firebase" : "r2";

      let signedUrl: string;
      let storagePath: string;

      if (storageProvider === "r2") {
        // Use R2 storage
        const r2Key = sanitizedPath;

        const result = await storageAdapter.generateUploadUrl(
          r2Key,
          contentType,
          300, // 5 minutes
          {
            uploadedBy: uid,
            ...metadata,
          }
        );

        signedUrl = result.signedUrl;
        storagePath = r2Key;
      } else {
        // Use Firebase Storage
        storagePath = sanitizedPath;

        const fiveMinutesInSeconds = 5 * 60;
        const expires = Date.now() + fiveMinutesInSeconds * 1000;

        const [url] = await getStorage().bucket().file(storagePath).getSignedUrl({
          version: "v4",
          action: "write",
          expires,
          contentType,
        });

        signedUrl = url;
      }

      // Log the upload request
      await logVaultAuditEvent(uid, "media_upload_requested", undefined, {
        path: sanitizedPath,
        contentType,
        fileSize,
        storageProvider,
      });

      return {
        signedUrl,
        storagePath,
        storageProvider,
      };
    },
    "getMediaUploadUrl",
    {
      authLevel: "verified",
      rateLimitConfig: SECURITY_CONFIG.rateLimits.mediaUpload,
    }
  )
);