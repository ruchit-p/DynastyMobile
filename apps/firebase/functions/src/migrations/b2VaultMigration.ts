// B2 Vault Migration Service
// Handles gradual migration of vault files from R2/Firebase Storage to Backblaze B2

import {Timestamp, FieldValue} from "firebase-admin/firestore";
import {logger} from "firebase-functions/v2";
import {StorageAdapter} from "../services/storageAdapter";
import {createLogContext, formatErrorForLogging} from "../utils/sanitization";
import {createError, ErrorCode} from "../utils/errors";
import {R2VaultMigration} from "./r2VaultMigration";

interface B2MigrationTask {
  id: string;
  itemId: string;
  userId: string;
  sourcePath: string;
  sourceProvider: "firebase" | "r2" | "b2";
  destPath: string;
  destProvider: "firebase" | "r2" | "b2";
  status: "pending" | "in_progress" | "completed" | "failed";
  attempts: number;
  error?: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
  completedAt?: Timestamp;
  metadata?: {
    fileSize?: number;
    mimeType?: string;
    itemName?: string;
    sourceChecksum?: string;
    destChecksum?: string;
  };
}

interface B2MigrationBatch {
  id: string;
  userId?: string; // Optional - if not set, migrates all users
  sourceProvider: "firebase" | "r2"; // Where to migrate from
  destProvider: "b2"; // Always B2
  status: "pending" | "running" | "completed" | "failed" | "cancelled";
  totalItems: number;
  processedItems: number;
  successCount: number;
  failedCount: number;
  startedAt: Timestamp;
  completedAt?: Timestamp;
  error?: string;
  options: {
    batchSize: number;
    maxRetries: number;
    dryRun: boolean;
    verifyChecksums: boolean;
    preserveOriginal: boolean; // Keep source files for safety
    filter?: {
      minSize?: number;
      maxSize?: number;
      fileTypes?: string[];
      createdBefore?: Timestamp;
      createdAfter?: Timestamp;
    };
  };
}

export class B2VaultMigration extends R2VaultMigration {
  constructor() {
    super();
    // Override defaults for B2 to avoid rate limits
    this.batchSize = 50; // Smaller batches for B2 to avoid rate limits
    this.maxRetries = 5; // More retries for B2 due to potential rate limiting
    
    this.storageAdapter = new StorageAdapter({
      provider: "firebase", // Start with Firebase as default
      enableMigration: true,
    });
  }

  /**
   * Create a new B2 migration batch
   */
  async createB2MigrationBatch(options: {
    userId?: string;
    sourceProvider: "firebase" | "r2";
    batchSize?: number;
    maxRetries?: number;
    dryRun?: boolean;
    verifyChecksums?: boolean;
    preserveOriginal?: boolean;
    filter?: {
      minSize?: number;
      maxSize?: number;
      fileTypes?: string[];
      createdBefore?: Date;
      createdAfter?: Date;
    };
  }): Promise<string> {
    const batchId = `b2-migration-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    const batch: B2MigrationBatch = {
      id: batchId,
      userId: options.userId,
      sourceProvider: options.sourceProvider,
      destProvider: "b2",
      status: "pending",
      totalItems: 0,
      processedItems: 0,
      successCount: 0,
      failedCount: 0,
      startedAt: FieldValue.serverTimestamp() as Timestamp,
      options: {
        batchSize: options.batchSize || this.batchSize,
        maxRetries: options.maxRetries || this.maxRetries,
        dryRun: options.dryRun || false,
        verifyChecksums: options.verifyChecksums ?? true,
        preserveOriginal: options.preserveOriginal ?? true,
        filter: options.filter ? {
          minSize: options.filter.minSize,
          maxSize: options.filter.maxSize,
          fileTypes: options.filter.fileTypes,
          createdBefore: options.filter.createdBefore ? Timestamp.fromDate(options.filter.createdBefore) : undefined,
          createdAfter: options.filter.createdAfter ? Timestamp.fromDate(options.filter.createdAfter) : undefined,
        } : undefined,
      },
    };

    await this.db.collection("b2MigrationBatches").doc(batchId).set(batch);

    logger.info("Created B2 migration batch", createLogContext({
      batchId,
      userId: options.userId || "all",
      sourceProvider: options.sourceProvider,
      dryRun: batch.options.dryRun,
      verifyChecksums: batch.options.verifyChecksums,
    }));

    return batchId;
  }

  /**
   * Start B2 migration for a batch
   */
  async startB2Migration(batchId: string): Promise<void> {
    const batchRef = this.db.collection("b2MigrationBatches").doc(batchId);
    const batchDoc = await batchRef.get();

    if (!batchDoc.exists) {
      throw createError(ErrorCode.NOT_FOUND, "B2 migration batch not found");
    }

    const batch = batchDoc.data() as B2MigrationBatch;

    if (batch.status !== "pending") {
      throw createError(ErrorCode.FAILED_PRECONDITION, `Batch is already ${batch.status}`);
    }

    // Update batch status
    await batchRef.update({
      status: "running",
      updatedAt: FieldValue.serverTimestamp(),
    });

    try {
      // Get items to migrate
      const items = await this.getB2ItemsToMigrate(batch);

      // Update total count
      await batchRef.update({
        totalItems: items.length,
      });

      // Process items in chunks (smaller for B2)
      const chunkSize = batch.options.batchSize;
      for (let i = 0; i < items.length; i += chunkSize) {
        const chunk = items.slice(i, i + chunkSize);
        await this.processB2MigrationChunk(batchId, chunk, batch);

        // Update progress
        await batchRef.update({
          processedItems: Math.min(i + chunkSize, items.length),
          updatedAt: FieldValue.serverTimestamp(),
        });

        // Add delay between chunks to avoid B2 rate limits
        if (i + chunkSize < items.length) {
          await new Promise((resolve) => setTimeout(resolve, 1000)); // 1 second delay
        }
      }

      // Mark batch as completed
      await batchRef.update({
        status: "completed",
        completedAt: FieldValue.serverTimestamp(),
      });

      logger.info("B2 migration batch completed", createLogContext({
        batchId,
        totalItems: items.length,
      }));
    } catch (error) {
      const {message, context} = formatErrorForLogging(error, {batchId});
      logger.error("B2 migration batch failed", {message, ...context});

      await batchRef.update({
        status: "failed",
        error: message,
        updatedAt: FieldValue.serverTimestamp(),
      });

      throw error;
    }
  }

  /**
   * Get items that need to be migrated to B2 based on batch criteria
   */
  private async getB2ItemsToMigrate(batch: B2MigrationBatch): Promise<any[]> {
    let query = this.db.collection("vaultItems")
      .where("isDeleted", "==", false)
      .where("type", "==", "file")
      .where("storageProvider", "==", batch.sourceProvider); // Migrate from specified provider

    // Apply user filter if specified
    if (batch.userId) {
      query = query.where("userId", "==", batch.userId);
    }

    // Apply other filters
    const filter = batch.options.filter;
    if (filter) {
      if (filter.fileTypes && filter.fileTypes.length > 0) {
        query = query.where("fileType", "in", filter.fileTypes);
      }
      if (filter.createdAfter) {
        query = query.where("createdAt", ">=", filter.createdAfter);
      }
      if (filter.createdBefore) {
        query = query.where("createdAt", "<=", filter.createdBefore);
      }
    }

    const snapshot = await query.get();
    const items: any[] = [];

    snapshot.forEach((doc) => {
      const data = doc.data();

      // Apply size filters if specified
      if (filter) {
        if (filter.minSize && data.size < filter.minSize) return;
        if (filter.maxSize && data.size > filter.maxSize) return;
      }

      items.push({
        id: doc.id,
        ...data,
      });
    });

    return items;
  }

  /**
   * Process a chunk of items for B2 migration
   */
  private async processB2MigrationChunk(
    batchId: string,
    items: any[],
    batch: B2MigrationBatch
  ): Promise<void> {
    const migrationTasks = items.map((item) => this.createB2MigrationTask(batchId, item, batch));

    if (batch.options.dryRun) {
      logger.info("Dry run - would migrate items to B2", createLogContext({
        batchId,
        itemCount: items.length,
        sampleItem: items[0]?.id,
        sourceProvider: batch.sourceProvider,
      }));
      return;
    }

    // Process migrations in parallel with lower concurrency for B2
    const concurrencyLimit = 3; // Lower concurrency for B2 to avoid rate limits
    const results = [];

    for (let i = 0; i < migrationTasks.length; i += concurrencyLimit) {
      const chunk = migrationTasks.slice(i, i + concurrencyLimit);
      const chunkResults = await Promise.allSettled(
        chunk.map((task) => this.executeB2MigrationTask(task, batch.options))
      );
      results.push(...chunkResults);

      // Add small delay between concurrent chunks
      if (i + concurrencyLimit < migrationTasks.length) {
        await new Promise((resolve) => setTimeout(resolve, 500)); // 500ms delay
      }
    }

    // Update batch statistics
    const successCount = results.filter((r) => r.status === "fulfilled").length;
    const failedCount = results.filter((r) => r.status === "rejected").length;

    await this.db.collection("b2MigrationBatches").doc(batchId).update({
      successCount: FieldValue.increment(successCount),
      failedCount: FieldValue.increment(failedCount),
      updatedAt: FieldValue.serverTimestamp(),
    });
  }

  /**
   * Create a B2 migration task for an item
   */
  private createB2MigrationTask(batchId: string, item: any, batch: B2MigrationBatch): B2MigrationTask {
    // Use B2Service's key generation for consistency
    const b2Key = `vault/${item.userId}/${item.parentId || "root"}/${Date.now()}_${item.name}`;

    // Determine source path based on current storage provider
    let sourcePath = item.storagePath;
    if (batch.sourceProvider === "r2" && item.r2Key) {
      sourcePath = item.r2Key;
    }

    return {
      id: `${batchId}-${item.id}`,
      itemId: item.id,
      userId: item.userId,
      sourcePath,
      sourceProvider: batch.sourceProvider,
      destPath: b2Key,
      destProvider: "b2",
      status: "pending",
      attempts: 0,
      createdAt: FieldValue.serverTimestamp() as Timestamp,
      updatedAt: FieldValue.serverTimestamp() as Timestamp,
      metadata: {
        fileSize: item.size,
        mimeType: item.mimeType,
        itemName: item.name,
      },
    };
  }

  /**
   * Execute a single B2 migration task
   */
  private async executeB2MigrationTask(
    task: B2MigrationTask,
    options: B2MigrationBatch["options"]
  ): Promise<void> {
    const taskRef = this.db.collection("b2MigrationTasks").doc(task.id);
    let attempt = 0;

    while (attempt < options.maxRetries) {
      try {
        attempt++;

        // Save/update task
        await taskRef.set({
          ...task,
          status: "in_progress",
          attempts: attempt,
          updatedAt: FieldValue.serverTimestamp(),
        });

        // Get source bucket for R2
        let sourceBucket: string | undefined;
        if (task.sourceProvider === "r2") {
          const itemDoc = await this.db.collection("vaultItems").doc(task.itemId).get();
          const itemData = itemDoc.data();
          sourceBucket = itemData?.r2Bucket;
        }

        // Perform the actual migration with B2-specific configuration
        await this.storageAdapter.copyBetweenProviders({
          sourcePath: task.sourcePath,
          sourceProvider: task.sourceProvider,
          sourceBucket,
          destPath: task.destPath,
          destProvider: task.destProvider,
          destBucket: "dynasty-vault", // B2 bucket name (same as R2 for consistency)
        });

        // Verify checksum if enabled
        if (options.verifyChecksums) {
          await this.verifyB2Migration(task);
        }

        // Update vault item with new B2 storage info
        const updateData: any = {
          storageProvider: "b2",
          b2Bucket: "dynasty-vault",
          b2Key: task.destPath,
          migratedToB2At: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        };

        // Keep original storage info if preserveOriginal is true
        if (!options.preserveOriginal && task.sourceProvider === "r2") {
          updateData.r2Bucket = FieldValue.delete();
          updateData.r2Key = FieldValue.delete();
        }

        await this.db.collection("vaultItems").doc(task.itemId).update(updateData);

        // Mark task as completed
        await taskRef.update({
          status: "completed",
          completedAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        });

        logger.info("B2 migration task completed", createLogContext({
          taskId: task.id,
          itemId: task.itemId,
          size: task.metadata?.fileSize,
          attempts: attempt,
        }));

        return; // Success, exit retry loop
      } catch (error) {
        const {message} = formatErrorForLogging(error, {taskId: task.id, attempt});

        if (attempt >= options.maxRetries) {
          // Final failure
          await taskRef.update({
            status: "failed",
            error: message,
            attempts: attempt,
            updatedAt: FieldValue.serverTimestamp(),
          });

          logger.error("B2 migration task failed after retries", createLogContext({
            taskId: task.id,
            itemId: task.itemId,
            attempts: attempt,
            error: message,
          }));

          throw error;
        } else {
          // Retry with exponential backoff
          const delay = Math.min(1000 * Math.pow(2, attempt - 1), 30000); // Max 30 seconds
          logger.warn(`B2 migration task failed (attempt ${attempt}/${options.maxRetries}), retrying in ${delay}ms`, {
            taskId: task.id,
            error: message,
          });

          await new Promise((resolve) => setTimeout(resolve, delay));
        }
      }
    }
  }

  /**
   * Verify B2 migration integrity by checking file existence and optional checksum
   */
  private async verifyB2Migration(task: B2MigrationTask): Promise<void> {
    // Check if file exists in B2
    const destExists = await this.storageAdapter.fileExists({
      path: task.destPath,
      bucket: "dynasty-vault",
      provider: "b2",
    });

    if (!destExists) {
      throw new Error("B2 migration verification failed: destination file does not exist");
    }

    // TODO: Add checksum verification if B2Service supports metadata retrieval
    // For now, we just verify existence
    logger.debug("B2 migration verified", createLogContext({
      taskId: task.id,
      destPath: task.destPath,
    }));
  }

  /**
   * Get B2 migration status for a batch
   */
  async getB2MigrationStatus(batchId: string): Promise<B2MigrationBatch & {
    recentTasks?: B2MigrationTask[];
  }> {
    const batchDoc = await this.db.collection("b2MigrationBatches").doc(batchId).get();

    if (!batchDoc.exists) {
      throw createError(ErrorCode.NOT_FOUND, "B2 migration batch not found");
    }

    const batch = batchDoc.data() as B2MigrationBatch;

    // Get recent tasks
    const tasksSnapshot = await this.db.collection("b2MigrationTasks")
      .where("id", ">=", batchId)
      .where("id", "<", batchId + "\uffff")
      .orderBy("id")
      .orderBy("updatedAt", "desc")
      .limit(10)
      .get();

    const recentTasks = tasksSnapshot.docs.map((doc) => doc.data() as B2MigrationTask);

    return {
      ...batch,
      recentTasks,
    };
  }

  /**
   * Verify B2 migration integrity for an item
   */
  async verifyB2ItemMigration(itemId: string): Promise<{
    valid: boolean;
    sourceExists: boolean;
    destExists: boolean;
    error?: string;
    checksumMatch?: boolean;
  }> {
    try {
      const itemDoc = await this.db.collection("vaultItems").doc(itemId).get();

      if (!itemDoc.exists) {
        return {
          valid: false,
          sourceExists: false,
          destExists: false,
          error: "Item not found",
        };
      }

      const item = itemDoc.data();
      if (!item) {
        return {
          valid: false,
          sourceExists: false,
          destExists: false,
          error: "Item data is null",
        };
      }

      // Check source based on original provider
      let sourceExists = false;
      let sourcePath = "";
      let sourceProvider: "firebase" | "r2" = "firebase";

      if (item.r2Key && item.r2Bucket) {
        sourcePath = item.r2Key;
        sourceProvider = "r2";
      } else {
        sourcePath = item.storagePath;
        sourceProvider = "firebase";
      }

      sourceExists = await this.storageAdapter.fileExists({
        path: sourcePath,
        bucket: sourceProvider === "r2" ? item.r2Bucket : undefined,
        provider: sourceProvider,
      });

      // Check destination (B2)
      const destExists = await this.storageAdapter.fileExists({
        path: item.b2Key || "",
        bucket: item.b2Bucket,
        provider: "b2",
      });

      return {
        valid: destExists, // For B2, we mainly care that destination exists
        sourceExists,
        destExists,
      };
    } catch (error) {
      const {message} = formatErrorForLogging(error, {itemId});
      return {
        valid: false,
        sourceExists: false,
        destExists: false,
        error: message,
      };
    }
  }

  /**
   * Rollback a B2 migration for an item
   */
  async rollbackB2Migration(itemId: string, rollbackTo: "firebase" | "r2" = "r2"): Promise<void> {
    const itemRef = this.db.collection("vaultItems").doc(itemId);
    const itemDoc = await itemRef.get();

    if (!itemDoc.exists) {
      throw createError(ErrorCode.NOT_FOUND, "Item not found");
    }

    const item = itemDoc.data();
    if (!item || item.storageProvider !== "b2") {
      throw createError(ErrorCode.FAILED_PRECONDITION, "Item has not been migrated to B2");
    }

    // Verify rollback target exists
    if (rollbackTo === "r2" && (!item.r2Key || !item.r2Bucket)) {
      throw createError(ErrorCode.FAILED_PRECONDITION, "Cannot rollback to R2: no R2 storage info found");
    }

    const updateData: any = {
      storageProvider: rollbackTo,
      b2Bucket: FieldValue.delete(),
      b2Key: FieldValue.delete(),
      migratedToB2At: FieldValue.delete(),
      rolledBackFromB2At: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    };

    await itemRef.update(updateData);

    logger.info("B2 migration rolled back", createLogContext({
      itemId,
      rollbackTo,
    }));
  }

  /**
   * Cancel a B2 migration batch
   */
  async cancelB2Migration(batchId: string): Promise<void> {
    const batchRef = this.db.collection("b2MigrationBatches").doc(batchId);
    const batchDoc = await batchRef.get();

    if (!batchDoc.exists) {
      throw createError(ErrorCode.NOT_FOUND, "B2 migration batch not found");
    }

    const batch = batchDoc.data() as B2MigrationBatch;

    if (batch.status !== "running") {
      throw createError(ErrorCode.FAILED_PRECONDITION, "Can only cancel running B2 migrations");
    }

    await batchRef.update({
      status: "cancelled",
      updatedAt: FieldValue.serverTimestamp(),
    });

    logger.info("B2 migration cancelled", createLogContext({batchId}));
  }

  /**
   * Get migration statistics across all providers
   */
  async getStorageMigrationStats(): Promise<{
    firebase: { count: number; totalSize: number };
    r2: { count: number; totalSize: number };
    b2: { count: number; totalSize: number };
  }> {
    const stats = {
      firebase: {count: 0, totalSize: 0},
      r2: {count: 0, totalSize: 0},
      b2: {count: 0, totalSize: 0},
    };

    const snapshot = await this.db.collection("vaultItems")
      .where("isDeleted", "==", false)
      .where("type", "==", "file")
      .get();

    snapshot.forEach((doc) => {
      const data = doc.data();
      const provider = data.storageProvider || "firebase";
      const size = data.size || 0;

      if (stats[provider as keyof typeof stats]) {
        stats[provider as keyof typeof stats].count++;
        stats[provider as keyof typeof stats].totalSize += size;
      }
    });

    return stats;
  }
}

// Export singleton instance
let b2MigrationInstance: B2VaultMigration | null = null;

export function getB2VaultMigration(): B2VaultMigration {
  if (!b2MigrationInstance) {
    b2MigrationInstance = new B2VaultMigration();
  }
  return b2MigrationInstance;
}
