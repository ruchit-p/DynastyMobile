/**
 * Quarantine Management Service
 * Handles file movement between staging, quarantine, and final storage buckets
 */

import {logger} from "firebase-functions/v2";
import {getFirestore, Timestamp} from "firebase-admin/firestore";
import {getStorageAdapter} from "./storageAdapter";
import {getVaultScanConfig} from "../config/vaultScanSecrets";
import {createError, ErrorCode} from "../utils/errors";
import {createLogContext, formatErrorForLogging} from "../utils/sanitization";
import {VirusScanResult} from "./cloudmersiveService";

export interface QuarantineItem {
  vaultItemId: string;
  userId: string;
  fileName: string;
  originalSize: number;
  quarantinedAt: Timestamp;
  reason: string;
  threats: string[];
  scanProvider: string;
  stagingPath: string;
  quarantinePath: string;
  retentionExpiry: Timestamp;
}

export interface FileTransferResult {
  success: boolean;
  sourceDeleted: boolean;
  targetCreated: boolean;
  error?: string;
  transferSizeBytes?: number;
  transferDurationMs?: number;
}

/**
 * Quarantine Management Service
 * Manages the lifecycle of files through staging, scanning, and final placement
 */
export class QuarantineService {
  private static instance: QuarantineService;
  private db: ReturnType<typeof getFirestore> | undefined;
  private storageAdapter: ReturnType<typeof getStorageAdapter> | undefined;
  private config: ReturnType<typeof getVaultScanConfig> | undefined;

  private constructor() {}

  static getInstance(): QuarantineService {
    if (!QuarantineService.instance) {
      QuarantineService.instance = new QuarantineService();
    }
    return QuarantineService.instance;
  }

  private getDb() {
    if (!this.db) {
      this.db = getFirestore();
    }
    return this.db;
  }

  private getStorageAdapter() {
    if (!this.storageAdapter) {
      this.storageAdapter = getStorageAdapter();
    }
    return this.storageAdapter;
  }

  private getConfig() {
    if (!this.config) {
      this.config = getVaultScanConfig();
    }
    return this.config;
  }

  /**
   * Process scan result and move file to appropriate destination
   * @param vaultItemId Firestore document ID for the vault item
   * @param stagingKey R2 staging bucket key
   * @param scanResult Result from virus scanning
   * @param userId User ID for logging
   * @returns File transfer result
   */
  async processScanResult(
    vaultItemId: string,
    stagingKey: string,
    scanResult: VirusScanResult,
    userId: string
  ): Promise<FileTransferResult> {
    const startTime = Date.now();
    
    try {
      logger.info("Processing scan result", createLogContext({
        vaultItemId,
        stagingKey,
        scanResult: scanResult.safe ? "clean" : "infected",
        threats: scanResult.threats,
        userId,
      }));

      if (scanResult.safe) {
        // File is clean - move to final storage (B2)
        return await this.moveToFinalStorage(vaultItemId, stagingKey, userId);
      } else {
        // File is infected - move to quarantine
        return await this.moveToQuarantine(vaultItemId, stagingKey, scanResult, userId);
      }
    } catch (error) {
      const duration = Date.now() - startTime;
      const {message, context} = formatErrorForLogging(error, {
        vaultItemId,
        stagingKey,
        userId,
        processingDurationMs: duration,
      });
      
      logger.error("Failed to process scan result", {message, ...context});
      
      return {
        success: false,
        sourceDeleted: false,
        targetCreated: false,
        error: message,
      };
    }
  }

  /**
   * Move clean file from R2 staging to B2 final storage
   * @param vaultItemId Vault item ID
   * @param stagingKey R2 staging key
   * @param userId User ID
   * @returns Transfer result
   */
  private async moveToFinalStorage(
    vaultItemId: string,
    stagingKey: string,
    userId: string
  ): Promise<FileTransferResult> {
    const startTime = Date.now();
    
    try {
      // Generate final storage path in B2
      const finalKey = this.generateFinalStorageKey(stagingKey, userId);
      
      logger.info("Moving clean file to final storage", createLogContext({
        vaultItemId,
        stagingKey,
        finalKey,
        provider: this.config.finalStorageProvider,
        userId,
      }));

      // Download from R2 staging
      const downloadUrl = await this.storageAdapter.generateDownloadUrl({
        path: stagingKey,
        bucket: this.config.stagingBucket,
        provider: "r2",
        expiresIn: 300, // 5 minutes
      });

      const response = await fetch(downloadUrl.signedUrl);
      if (!response.ok) {
        throw new Error(`Failed to download from staging: ${response.statusText}`);
      }

      const fileBuffer = Buffer.from(await response.arrayBuffer());
      const fileSize = fileBuffer.length;

      // Upload to final storage (B2)
      const uploadUrl = await this.storageAdapter.generateUploadUrl({
        path: finalKey,
        bucket: this.getFinalStorageBucket(),
        provider: this.config.finalStorageProvider,
        expiresIn: 300,
        contentType: response.headers.get("content-type") || "application/octet-stream",
      });

      const uploadResponse = await fetch(uploadUrl.signedUrl, {
        method: "PUT",
        body: fileBuffer,
        headers: {
          "Content-Type": response.headers.get("content-type") || "application/octet-stream",
        },
      });

      if (!uploadResponse.ok) {
        throw new Error(`Failed to upload to final storage: ${uploadResponse.statusText}`);
      }

      // Delete from staging bucket
      await this.storageAdapter.deleteFile({
        path: stagingKey,
        bucket: this.config.stagingBucket,
        provider: "r2",
      });

      // Update vault item with final storage information
      await this.updateVaultItemFinalStorage(vaultItemId, finalKey, fileSize);

      const duration = Date.now() - startTime;
      
      logger.info("File moved to final storage successfully", createLogContext({
        vaultItemId,
        finalKey,
        fileSize,
        transferDurationMs: duration,
        userId,
      }));

      return {
        success: true,
        sourceDeleted: true,
        targetCreated: true,
        transferSizeBytes: fileSize,
        transferDurationMs: duration,
      };
    } catch (error) {
      const duration = Date.now() - startTime;
      const {message, context} = formatErrorForLogging(error, {
        vaultItemId,
        stagingKey,
        userId,
        transferDurationMs: duration,
      });
      
      logger.error("Failed to move file to final storage", {message, ...context});
      
      return {
        success: false,
        sourceDeleted: false,
        targetCreated: false,
        error: message,
        transferDurationMs: duration,
      };
    }
  }

  /**
   * Move infected file from R2 staging to R2 quarantine bucket
   * @param vaultItemId Vault item ID
   * @param stagingKey R2 staging key
   * @param scanResult Scan result with threat information
   * @param userId User ID
   * @returns Transfer result
   */
  private async moveToQuarantine(
    vaultItemId: string,
    stagingKey: string,
    scanResult: VirusScanResult,
    userId: string
  ): Promise<FileTransferResult> {
    const startTime = Date.now();
    
    try {
      // Generate quarantine path
      const quarantineKey = this.generateQuarantineKey(stagingKey, userId);
      
      logger.warn("Moving infected file to quarantine", createLogContext({
        vaultItemId,
        stagingKey,
        quarantineKey,
        threats: scanResult.threats,
        userId,
      }));

      // Download from staging
      const downloadUrl = await this.storageAdapter.generateDownloadUrl({
        path: stagingKey,
        bucket: this.config.stagingBucket,
        provider: "r2",
        expiresIn: 300,
      });

      const response = await fetch(downloadUrl.signedUrl);
      if (!response.ok) {
        throw new Error(`Failed to download from staging: ${response.statusText}`);
      }

      const fileBuffer = Buffer.from(await response.arrayBuffer());
      const fileSize = fileBuffer.length;

      // Upload to quarantine bucket with additional metadata
      const uploadUrl = await this.storageAdapter.generateUploadUrl({
        path: quarantineKey,
        bucket: this.config.quarantineBucket,
        provider: "r2",
        expiresIn: 300,
        contentType: response.headers.get("content-type") || "application/octet-stream",
        metadata: {
          "quarantined-at": new Date().toISOString(),
          "vault-item-id": vaultItemId,
          "user-id": userId,
          "threats": scanResult.threats.join(";"),
          "scan-provider": scanResult.scanProvider,
          "original-staging-key": stagingKey,
        },
      });

      const uploadResponse = await fetch(uploadUrl.signedUrl, {
        method: "PUT",
        body: fileBuffer,
        headers: {
          "Content-Type": response.headers.get("content-type") || "application/octet-stream",
        },
      });

      if (!uploadResponse.ok) {
        throw new Error(`Failed to upload to quarantine: ${uploadResponse.statusText}`);
      }

      // Delete from staging
      await this.storageAdapter.deleteFile({
        path: stagingKey,
        bucket: this.config.stagingBucket,
        provider: "r2",
      });

      // Create quarantine record
      await this.createQuarantineRecord(vaultItemId, stagingKey, quarantineKey, scanResult, userId, fileSize);

      // Update vault item with quarantine status
      await this.updateVaultItemQuarantined(vaultItemId, quarantineKey, scanResult);

      const duration = Date.now() - startTime;
      
      logger.warn("File quarantined successfully", createLogContext({
        vaultItemId,
        quarantineKey,
        threats: scanResult.threats,
        transferDurationMs: duration,
        userId,
      }));

      return {
        success: true,
        sourceDeleted: true,
        targetCreated: true,
        transferSizeBytes: fileSize,
        transferDurationMs: duration,
      };
    } catch (error) {
      const duration = Date.now() - startTime;
      const {message, context} = formatErrorForLogging(error, {
        vaultItemId,
        stagingKey,
        userId,
        transferDurationMs: duration,
      });
      
      logger.error("Failed to quarantine file", {message, ...context});
      
      return {
        success: false,
        sourceDeleted: false,
        targetCreated: false,
        error: message,
        transferDurationMs: duration,
      };
    }
  }

  /**
   * Generate final storage key for B2
   */
  private generateFinalStorageKey(stagingKey: string, userId: string): string {
    // Remove staging prefix and add vault prefix for final storage
    const timestamp = Date.now();
    const fileName = stagingKey.split("/").pop() || "unknown";
    return `vault/${userId}/${timestamp}_${fileName}`;
  }

  /**
   * Generate quarantine storage key
   */
  private generateQuarantineKey(stagingKey: string, userId: string): string {
    const timestamp = Date.now();
    const fileName = stagingKey.split("/").pop() || "unknown";
    return `quarantine/${userId}/${timestamp}_${fileName}`;
  }

  /**
   * Get final storage bucket name based on configuration
   */
  private getFinalStorageBucket(): string {
    if (this.config.finalStorageProvider === "b2") {
      // Use B2 bucket names (should match existing B2Service configuration)
      return process.env.NODE_ENV === "production" ? "dynastyprod" : "dynastytest";
    } else {
      // Use R2 bucket names
      return process.env.NODE_ENV === "production" ? "dynasty-final-prod" : "dynasty-final-test";
    }
  }

  /**
   * Update vault item with final storage information
   */
  private async updateVaultItemFinalStorage(vaultItemId: string, finalKey: string, fileSize: number): Promise<void> {
    const updateData: any = {
      scanStatus: "clean",
      updatedAt: Timestamp.now(),
      size: fileSize,
    };

    if (this.config.finalStorageProvider === "b2") {
      updateData.storageProvider = "b2";
      updateData.b2Key = finalKey;
      updateData.b2Bucket = this.getFinalStorageBucket();
      // Clear R2 staging info
      updateData.r2Key = null;
      updateData.r2Bucket = null;
    } else {
      updateData.storageProvider = "r2";
      updateData.r2Key = finalKey;
      updateData.r2Bucket = this.getFinalStorageBucket();
    }

    await this.db.collection("vaultItems").doc(vaultItemId).update(updateData);
  }

  /**
   * Update vault item with quarantine information
   */
  private async updateVaultItemQuarantined(
    vaultItemId: string,
    quarantineKey: string,
    scanResult: VirusScanResult
  ): Promise<void> {
    const updateData = {
      scanStatus: "infected",
      updatedAt: Timestamp.now(),
      quarantineInfo: {
        quarantinedAt: Timestamp.now(),
        reason: `Threats detected: ${scanResult.threats.join(", ")}`,
        quarantineKey,
        quarantineBucket: this.config.quarantineBucket,
      },
      scanResults: {
        scannedAt: Timestamp.now(),
        threats: scanResult.threats,
        provider: scanResult.scanProvider,
        safe: false,
      },
    };

    await this.db.collection("vaultItems").doc(vaultItemId).update(updateData);
  }

  /**
   * Create quarantine record for tracking and management
   */
  private async createQuarantineRecord(
    vaultItemId: string,
    stagingKey: string,
    quarantineKey: string,
    scanResult: VirusScanResult,
    userId: string,
    fileSize: number
  ): Promise<void> {
    const quarantineItem: QuarantineItem = {
      vaultItemId,
      userId,
      fileName: stagingKey.split("/").pop() || "unknown",
      originalSize: fileSize,
      quarantinedAt: Timestamp.now(),
      reason: `Threats detected: ${scanResult.threats.join(", ")}`,
      threats: scanResult.threats,
      scanProvider: scanResult.scanProvider,
      stagingPath: stagingKey,
      quarantinePath: quarantineKey,
      retentionExpiry: Timestamp.fromDate(new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)), // 30 days
    };

    await this.db.collection("quarantinedFiles").add(quarantineItem);
  }

  /**
   * Clean up expired quarantined files
   * Should be called by a scheduled function
   */
  async cleanupExpiredQuarantinedFiles(): Promise<{cleaned: number; errors: string[]}> {
    try {
      const expiredQuery = await this.db
        .collection("quarantinedFiles")
        .where("retentionExpiry", "<", Timestamp.now())
        .limit(100)
        .get();

      const errors: string[] = [];
      let cleaned = 0;

      for (const doc of expiredQuery.docs) {
        try {
          const quarantineItem = doc.data() as QuarantineItem;
          
          // Delete from quarantine bucket
          await this.storageAdapter.deleteFile({
            path: quarantineItem.quarantinePath,
            bucket: this.config.quarantineBucket,
            provider: "r2",
          });

          // Delete quarantine record
          await doc.ref.delete();
          
          cleaned++;
          
          logger.info("Cleaned up expired quarantined file", createLogContext({
            quarantineId: doc.id,
            vaultItemId: quarantineItem.vaultItemId,
            fileName: quarantineItem.fileName,
            userId: quarantineItem.userId,
          }));
        } catch (error) {
          const errorMsg = error instanceof Error ? error.message : "Unknown error";
          errors.push(`Failed to cleanup ${doc.id}: ${errorMsg}`);
        }
      }

      return {cleaned, errors};
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : "Unknown error";
      return {cleaned: 0, errors: [errorMsg]};
    }
  }
}

// Export singleton instance
export const quarantineService = QuarantineService.getInstance();