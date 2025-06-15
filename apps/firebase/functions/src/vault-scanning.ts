/**
 * Vault File Scanning Functions
 * Handles virus scanning and quarantine bucket workflow
 */

import {onCall} from "firebase-functions/v2/https";
import {onSchedule} from "firebase-functions/v2/scheduler";
import {getFirestore, Timestamp} from "firebase-admin/firestore";
import {logger} from "firebase-functions/v2";
import {DEFAULT_REGION, FUNCTION_TIMEOUT} from "./common";
import {createError, withErrorHandling, ErrorCode} from "./utils/errors";
import {withAuth, requireAuth} from "./middleware";
import {createLogContext, formatErrorForLogging} from "./utils/sanitization";
import {validateRequest} from "./utils/request-validator";
import {VALIDATION_SCHEMAS} from "./config/validation-schemas";
import {getCloudmersiveService} from "./services/cloudmersiveService";
import {quarantineService} from "./services/quarantineService";
import {getVaultScanConfig, CLOUDMERSIVE_API_KEY} from "./config/vaultScanSecrets";
import {getStorageAdapter} from "./services/storageAdapter";

// Lazy-load Firestore to avoid initialization issues
const getDb = () => getFirestore();

/**
 * Process pending scans in staging bucket
 * This function can be called manually or by a scheduler
 */
export const processPendingScans = onCall(
  {
    region: DEFAULT_REGION,
    memory: "512MiB",
    timeoutSeconds: FUNCTION_TIMEOUT.LONG,
    secrets: [CLOUDMERSIVE_API_KEY],
  },
  withAuth(
    async (request) => {
      const uid = requireAuth(request);
      
      // Validate input
      const validatedData = validateRequest(
        request.data || {},
        {
          rules: [
            {field: "batchSize", type: "number"},
            {field: "forceRescan", type: "boolean"},
          ],
          xssCheck: false,
        },
        uid
      );

      const batchSize = validatedData.batchSize || 10;
      const forceRescan = validatedData.forceRescan || false;

      try {
        const result = await processVaultItemScans(batchSize, forceRescan);
        return result;
      } catch (error) {
        const {message, context} = formatErrorForLogging(error, {
          batchSize,
          forceRescan,
          userId: uid,
        });
        
        logger.error("Failed to process pending scans", {message, ...context});
        throw createError(ErrorCode.INTERNAL, "Failed to process pending scans");
      }
    },
    "processPendingScans",
    {authLevel: "admin"} // Only admins can trigger manual processing
  )
);

/**
 * Scheduled function to process pending scans automatically
 * Runs every 5 minutes to check for files needing scanning
 */
export const scheduledScanProcessor = onSchedule(
  {
    schedule: "every 5 minutes",
    region: DEFAULT_REGION,
    memory: "512MiB",
    timeoutSeconds: FUNCTION_TIMEOUT.MEDIUM,
    secrets: [CLOUDMERSIVE_API_KEY],
  },
  async () => {
    try {
      logger.info("Starting scheduled scan processing");
      const result = await processVaultItemScans(20, false); // Process 20 items
      
      logger.info("Scheduled scan processing completed", {
        processed: result.processed,
        succeeded: result.succeeded,
        failed: result.failed,
      });
    } catch (error) {
      logger.error("Scheduled scan processing failed", formatErrorForLogging(error, {}));
    }
  }
);

/**
 * Scan a specific vault item by ID
 * Useful for manual rescanning or testing
 */
export const scanVaultItem = onCall(
  {
    region: DEFAULT_REGION,
    memory: "512MiB",
    timeoutSeconds: FUNCTION_TIMEOUT.MEDIUM,
    secrets: [CLOUDMERSIVE_API_KEY],
  },
  withAuth(
    async (request) => {
      const uid = requireAuth(request);
      
      // Validate input
      const validatedData = validateRequest(
        request.data,
        {
          rules: [
            {field: "itemId", type: "id", required: true},
            {field: "forceRescan", type: "boolean"},
          ],
          xssCheck: false,
        },
        uid
      );

      const {itemId, forceRescan = false} = validatedData;

      try {
        // Get vault item
        const itemDoc = await getDb().collection("vaultItems").doc(itemId).get();
        if (!itemDoc.exists) {
          throw createError(ErrorCode.NOT_FOUND, "Vault item not found");
        }

        const itemData = itemDoc.data();
        
        // Verify ownership
        if (itemData?.userId !== uid) {
          throw createError(ErrorCode.PERMISSION_DENIED, "You don't have permission to scan this item");
        }

        // Check if item needs scanning
        if (!forceRescan && itemData?.scanStatus && itemData.scanStatus !== "pending") {
          return {
            success: true,
            message: `Item already scanned with status: ${itemData.scanStatus}`,
            scanStatus: itemData.scanStatus,
          };
        }

        // Process the scan
        const result = await processSingleVaultItem(itemDoc.id, itemData);
        
        return {
          success: result.success,
          message: result.success ? "Scan completed successfully" : "Scan failed",
          scanStatus: result.scanStatus,
          threats: result.threats,
        };
      } catch (error) {
        const {message, context} = formatErrorForLogging(error, {
          itemId,
          forceRescan,
          userId: uid,
        });
        
        logger.error("Failed to scan vault item", {message, ...context});
        throw createError(ErrorCode.INTERNAL, "Failed to scan vault item");
      }
    },
    "scanVaultItem"
  )
);

/**
 * Get quarantine status and statistics
 */
export const getQuarantineStatus = onCall(
  {
    region: DEFAULT_REGION,
    memory: "256MiB",
    timeoutSeconds: FUNCTION_TIMEOUT.SHORT,
  },
  withAuth(
    async (request) => {
      const uid = requireAuth(request);

      try {
        // Get user's quarantined files
        const quarantinedQuery = await db
          .collection("quarantinedFiles")
          .where("userId", "==", uid)
          .orderBy("quarantinedAt", "desc")
          .limit(50)
          .get();

        const quarantinedFiles = quarantinedQuery.docs.map(doc => ({
          id: doc.id,
          ...doc.data(),
        }));

        // Get pending scans count
        const pendingQuery = await db
          .collection("vaultItems")
          .where("userId", "==", uid)
          .where("scanStatus", "==", "pending")
          .get();

        return {
          quarantinedFiles,
          quarantinedCount: quarantinedFiles.length,
          pendingScansCount: pendingQuery.size,
        };
      } catch (error) {
        const {message, context} = formatErrorForLogging(error, {userId: uid});
        logger.error("Failed to get quarantine status", {message, ...context});
        throw createError(ErrorCode.INTERNAL, "Failed to get quarantine status");
      }
    },
    "getQuarantineStatus"
  )
);

/**
 * Cleanup expired quarantined files
 * Should be run periodically
 */
export const cleanupQuarantinedFiles = onSchedule(
  {
    schedule: "every 24 hours",
    region: DEFAULT_REGION,
    memory: "256MiB",
    timeoutSeconds: FUNCTION_TIMEOUT.MEDIUM,
  },
  async () => {
    try {
      logger.info("Starting quarantine cleanup");
      const result = await quarantineService.cleanupExpiredQuarantinedFiles();
      
      logger.info("Quarantine cleanup completed", {
        filesRemoved: result.cleaned,
        errors: result.errors,
      });
      
      if (result.errors.length > 0) {
        logger.warn("Some quarantine cleanup operations failed", {errors: result.errors});
      }
    } catch (error) {
      logger.error("Quarantine cleanup failed", formatErrorForLogging(error, {}));
    }
  }
);

/**
 * Core function to process vault items needing scanning
 * @param batchSize Number of items to process in this batch
 * @param forceRescan Whether to rescan items that have already been scanned
 * @returns Processing results
 */
async function processVaultItemScans(batchSize: number, forceRescan: boolean) {
  const startTime = Date.now();
  let processed = 0;
  let succeeded = 0;
  let failed = 0;
  const errors: string[] = [];

  try {
    // Query for items needing scanning
    const queryConditions = forceRescan
      ? [] // If force rescan, get all items with staging storage
      : [["scanStatus", "==", "pending"]];

    let query = db
      .collection("vaultItems")
      .where("storageProvider", "==", "r2_staging");

    // Add additional conditions if not force rescanning
    if (!forceRescan) {
      query = query.where("scanStatus", "==", "pending");
    }

    const pendingItems = await query
      .orderBy("createdAt", "asc")
      .limit(batchSize)
      .get();

    if (pendingItems.empty) {
      logger.info("No pending scans found");
      return {processed: 0, succeeded: 0, failed: 0, errors: []};
    }

    logger.info(`Processing ${pendingItems.size} vault items for scanning`);

    // Process each item
    for (const doc of pendingItems.docs) {
      try {
        const itemData = doc.data();
        processed++;

        // Update scan status to 'scanning'
        await doc.ref.update({
          scanStatus: "scanning",
          scanStartedAt: Timestamp.now(),
        });

        const result = await processSingleVaultItem(doc.id, itemData);
        
        if (result.success) {
          succeeded++;
          logger.info("Successfully processed vault item", createLogContext({
            itemId: doc.id,
            fileName: itemData.name,
            scanStatus: result.scanStatus,
            userId: itemData.userId,
          }));
        } else {
          failed++;
          errors.push(`${doc.id}: ${result.error}`);
          logger.error("Failed to process vault item", createLogContext({
            itemId: doc.id,
            fileName: itemData.name,
            error: result.error,
            userId: itemData.userId,
          }));
        }
      } catch (error) {
        failed++;
        const errorMsg = error instanceof Error ? error.message : "Unknown error";
        errors.push(`${doc.id}: ${errorMsg}`);
        
        // Update scan status to error
        await doc.ref.update({
          scanStatus: "error",
          scanResults: {
            scannedAt: Timestamp.now(),
            error: errorMsg,
            provider: "processing_error",
          },
        });
      }
    }

    const duration = Date.now() - startTime;
    
    logger.info("Batch scan processing completed", {
      processed,
      succeeded,
      failed,
      durationMs: duration,
      errorsCount: errors.length,
    });

    return {processed, succeeded, failed, errors};
  } catch (error) {
    logger.error("Batch scan processing failed", formatErrorForLogging(error, {
      batchSize,
      forceRescan,
    }));
    
    return {
      processed,
      succeeded,
      failed,
      errors: [...errors, error instanceof Error ? error.message : "Unknown error"],
    };
  }
}

/**
 * Process a single vault item for scanning
 * @param itemId Vault item document ID
 * @param itemData Vault item data
 * @returns Processing result
 */
async function processSingleVaultItem(itemId: string, itemData: any) {
  const startTime = Date.now();
  
  try {
    const config = getVaultScanConfig();
    const storageAdapter = getStorageAdapter();

    if (!itemData.r2StagingKey || !itemData.r2StagingBucket) {
      throw new Error("Missing staging storage information");
    }

    logger.info("Starting scan for vault item", createLogContext({
      itemId,
      fileName: itemData.name,
      stagingKey: itemData.r2StagingKey,
      userId: itemData.userId,
    }));

    // Download file from staging bucket
    const downloadUrl = await storageAdapter.generateDownloadUrl({
      path: itemData.r2StagingKey,
      bucket: itemData.r2StagingBucket,
      provider: "r2",
      expiresIn: 300, // 5 minutes
    });

    const response = await fetch(downloadUrl.signedUrl);
    if (!response.ok) {
      throw new Error(`Failed to download file from staging: ${response.statusText}`);
    }

    const fileBuffer = Buffer.from(await response.arrayBuffer());
    const fileHash = require("crypto").createHash("sha256").update(fileBuffer).digest("hex");

    // Perform virus scan
    const scanResult = await getCloudmersiveService().scanFile(
      fileBuffer,
      itemData.name,
      fileHash,
      itemData.userId
    );

    // Process scan result and move file
    const transferResult = await quarantineService.processScanResult(
      itemId,
      itemData.r2StagingKey,
      scanResult,
      itemData.userId
    );

    if (!transferResult.success) {
      throw new Error(`File transfer failed: ${transferResult.error}`);
    }

    const duration = Date.now() - startTime;
    
    return {
      success: true,
      scanStatus: scanResult.safe ? "clean" : "infected",
      threats: scanResult.threats,
      transferDurationMs: duration,
    };
  } catch (error) {
    const duration = Date.now() - startTime;
    const errorMsg = error instanceof Error ? error.message : "Unknown error";
    
    logger.error("Failed to process single vault item", createLogContext({
      itemId,
      fileName: itemData.name,
      error: errorMsg,
      durationMs: duration,
      userId: itemData.userId,
    }));

    return {
      success: false,
      error: errorMsg,
      scanStatus: "error",
      transferDurationMs: duration,
    };
  }
}