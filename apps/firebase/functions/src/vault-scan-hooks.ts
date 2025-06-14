import {onRequest} from "firebase-functions/v2/https";
import {logger} from "firebase-functions/v2";
import * as admin from "firebase-admin";
import {Timestamp} from "firebase-admin/firestore";
import {getVaultScanConfig} from "./config/vaultScanSecrets";

// Constants
const FUNCTION_TIMEOUT = {
  SHORT: 60,
} as const;

const DEFAULT_REGION = "us-central1";

// Initialize Firestore
const db = admin.firestore();

/**
 * Request body from the Cloudflare Worker
 */
interface ScanUpdateRequest {
  itemId: string;
  status: "pending" | "scanning" | "clean" | "infected" | "error";
  details?: {
    threats?: string[];
    error?: string;
    provider?: string;
  };
}

/**
 * Webhook endpoint for Cloudflare Worker to update vault item scan status
 *
 * Authentication: x-hook-secret header must match WORKER_SCAN_HOOK_SECRET
 * Method: POST only
 *
 * Request body:
 * {
 *   itemId: string,
 *   status: "pending" | "scanning" | "clean" | "infected" | "error",
 *   details?: {
 *     threats?: string[],
 *     error?: string,
 *     provider?: string
 *   }
 * }
 */
export const updateVaultScanStatus = onRequest({
  region: DEFAULT_REGION,
  timeoutSeconds: FUNCTION_TIMEOUT.SHORT,
  cors: false,
  maxInstances: 10,
}, async (req, res) => {
  try {
    // Only allow POST requests
    if (req.method !== "POST") {
      res.status(405).send("Method Not Allowed");
      return;
    }

    // Verify webhook secret
    const hookSecret = req.headers["x-hook-secret"] as string;
    if (!hookSecret) {
      logger.warn("Missing x-hook-secret header in vault scan webhook");
      res.status(403).send("Forbidden: Missing authentication");
      return;
    }

    // Get configuration
    const config = getVaultScanConfig();

    // Timing-safe comparison
    const expectedSecret = config.workerHookSecret;
    if (hookSecret.length !== expectedSecret.length) {
      logger.warn("Invalid x-hook-secret length in vault scan webhook");
      res.status(403).send("Forbidden: Invalid authentication");
      return;
    }

    let isValid = true;
    for (let i = 0; i < expectedSecret.length; i++) {
      if (hookSecret[i] !== expectedSecret[i]) {
        isValid = false;
      }
    }

    if (!isValid) {
      logger.warn("Invalid x-hook-secret in vault scan webhook");
      res.status(403).send("Forbidden: Invalid authentication");
      return;
    }

    // Parse request body
    const data = req.body as ScanUpdateRequest;

    // Validate required fields
    if (!data.itemId || !data.status) {
      res.status(400).send("Bad Request: Missing required fields");
      return;
    }

    // Validate status enum
    const validStatuses = ["pending", "scanning", "clean", "infected", "error"];
    if (!validStatuses.includes(data.status)) {
      res.status(400).send("Bad Request: Invalid status value");
      return;
    }

    // Get the vault item
    const itemRef = db.collection("vaultItems").doc(data.itemId);
    const itemDoc = await itemRef.get();

    if (!itemDoc.exists) {
      logger.error(`Vault item not found: ${data.itemId}`);
      res.status(404).send("Not Found: Vault item does not exist");
      return;
    }

    const itemData = itemDoc.data();

    // Prepare update data
    const updateData: any = {
      scanStatus: data.status,
      updatedAt: Timestamp.now(),
    };

    // Add scan results for completed scans
    if (data.status === "clean" || data.status === "infected" || data.status === "error") {
      updateData.scanResults = {
        scannedAt: Timestamp.now(),
        provider: data.details?.provider || "cloudmersive",
      };

      if (data.status === "infected" && data.details?.threats) {
        updateData.scanResults.threats = data.details.threats;
      }

      if (data.status === "error" && data.details?.error) {
        updateData.scanResults.error = data.details.error;
      }
    }

    // Add quarantine info for infected files
    if (data.status === "infected") {
      updateData.quarantineInfo = {
        quarantinedAt: Timestamp.now(),
        reason: data.details?.threats ? `Threats detected: ${data.details.threats.join(", ")}` : "Malware detected",
      };
    }

    // Update the vault item
    await itemRef.update(updateData);

    logger.info(`Updated vault item ${data.itemId} scan status to ${data.status}`);

    // Send notification if infected
    if (data.status === "infected" && itemData?.userId) {
      try {
        // Create notification directly in Firestore since this is a system-generated notification
        const notificationData = {
          userId: itemData.userId,
          title: "Security Alert: Infected File Detected",
          body: `The file "${itemData.name}" has been quarantined due to security threats.`,
          type: "system:announcement",
          relatedItemId: data.itemId,
          isRead: false,
          createdAt: Timestamp.now(),
          updatedAt: Timestamp.now(),
        };

        // Add notification directly to Firestore
        await db.collection("notifications").add(notificationData);

        logger.info(`Created infection notification for user ${itemData.userId} for item ${data.itemId}`);
      } catch (notificationError) {
        // Don't fail the webhook if notification fails
        logger.error("Failed to create infection notification", notificationError);
      }
    }

    // Return success
    res.status(200).json({
      success: true,
      itemId: data.itemId,
      status: data.status,
    });
  } catch (error) {
    logger.error("Error in updateVaultScanStatus webhook", error);
    res.status(500).send("Internal Server Error");
  }
});
