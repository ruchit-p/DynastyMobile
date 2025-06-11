// R2 Vault Migration Service
// Handles gradual migration of vault files from Firebase Storage to Cloudflare R2

import {getFirestore, Timestamp, FieldValue} from "firebase-admin/firestore";
import {logger} from "firebase-functions/v2";
import {StorageAdapter} from "../services/storageAdapter";
import {createLogContext, formatErrorForLogging} from "../utils/sanitization";
import {createError, ErrorCode} from "../utils/errors";

interface MigrationTask {
  id: string;
  itemId: string;
  userId: string;
  sourcePath: string;
  sourceProvider: "firebase" | "r2";
  destPath: string;
  destProvider: "firebase" | "r2";
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
  };
}

interface MigrationBatch {
  id: string;
  userId?: string; // Optional - if not set, migrates all users
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
    filter?: {
      minSize?: number;
      maxSize?: number;
      fileTypes?: string[];
      createdBefore?: Timestamp;
      createdAfter?: Timestamp;
    };
  };
}

export class R2VaultMigration {
  protected db = getFirestore();
  protected storageAdapter: StorageAdapter;
  protected batchSize = 100;
  protected maxRetries = 3;

  constructor() {
    this.storageAdapter = new StorageAdapter({
      provider: "firebase", // Start with Firebase as default
      enableMigration: true,
    });
  }

  /**
   * Create a new migration batch
   */
  async createMigrationBatch(options: {
    userId?: string;
    batchSize?: number;
    maxRetries?: number;
    dryRun?: boolean;
    filter?: {
      minSize?: number;
      maxSize?: number;
      fileTypes?: string[];
      createdBefore?: Date;
      createdAfter?: Date;
    };
  }): Promise<string> {
    const batchId = `migration-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    const batch: MigrationBatch = {
      id: batchId,
      userId: options.userId,
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
        filter: options.filter ? {
          minSize: options.filter.minSize,
          maxSize: options.filter.maxSize,
          fileTypes: options.filter.fileTypes,
          createdBefore: options.filter.createdBefore ? Timestamp.fromDate(options.filter.createdBefore) : undefined,
          createdAfter: options.filter.createdAfter ? Timestamp.fromDate(options.filter.createdAfter) : undefined,
        } : undefined,
      },
    };

    await this.db.collection("vaultMigrationBatches").doc(batchId).set(batch);

    logger.info("Created migration batch", createLogContext({
      batchId,
      userId: options.userId || "all",
      dryRun: batch.options.dryRun,
    }));

    return batchId;
  }

  /**
   * Start migration for a batch
   */
  async startMigration(batchId: string): Promise<void> {
    const batchRef = this.db.collection("vaultMigrationBatches").doc(batchId);
    const batchDoc = await batchRef.get();

    if (!batchDoc.exists) {
      throw createError(ErrorCode.NOT_FOUND, "Migration batch not found");
    }

    const batch = batchDoc.data() as MigrationBatch;

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
      const items = await this.getItemsToMigrate(batch);

      // Update total count
      await batchRef.update({
        totalItems: items.length,
      });

      // Process items in chunks
      const chunkSize = batch.options.batchSize;
      for (let i = 0; i < items.length; i += chunkSize) {
        const chunk = items.slice(i, i + chunkSize);
        await this.processMigrationChunk(batchId, chunk, batch.options.dryRun);

        // Update progress
        await batchRef.update({
          processedItems: Math.min(i + chunkSize, items.length),
          updatedAt: FieldValue.serverTimestamp(),
        });
      }

      // Mark batch as completed
      await batchRef.update({
        status: "completed",
        completedAt: FieldValue.serverTimestamp(),
      });

      logger.info("Migration batch completed", createLogContext({
        batchId,
        totalItems: items.length,
      }));
    } catch (error) {
      const {message, context} = formatErrorForLogging(error, {batchId});
      logger.error("Migration batch failed", {message, ...context});

      await batchRef.update({
        status: "failed",
        error: message,
        updatedAt: FieldValue.serverTimestamp(),
      });

      throw error;
    }
  }

  /**
   * Get items that need to be migrated based on batch criteria
   */
  private async getItemsToMigrate(batch: MigrationBatch): Promise<any[]> {
    let query = this.db.collection("vaultItems")
      .where("isDeleted", "==", false)
      .where("type", "==", "file")
      .where("storageProvider", "==", "firebase"); // Only migrate Firebase items

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
   * Process a chunk of items for migration
   */
  private async processMigrationChunk(
    batchId: string,
    items: any[],
    dryRun: boolean
  ): Promise<void> {
    const migrationTasks = items.map((item) => this.createMigrationTask(batchId, item));

    if (dryRun) {
      logger.info("Dry run - would migrate items", createLogContext({
        batchId,
        itemCount: items.length,
        sampleItem: items[0]?.id,
      }));
      return;
    }

    // Process migrations in parallel with concurrency limit
    const concurrencyLimit = 5;
    const results = [];

    for (let i = 0; i < migrationTasks.length; i += concurrencyLimit) {
      const chunk = migrationTasks.slice(i, i + concurrencyLimit);
      const chunkResults = await Promise.allSettled(
        chunk.map((task) => this.executeMigrationTask(task))
      );
      results.push(...chunkResults);
    }

    // Update batch statistics
    const successCount = results.filter((r) => r.status === "fulfilled").length;
    const failedCount = results.filter((r) => r.status === "rejected").length;

    await this.db.collection("vaultMigrationBatches").doc(batchId).update({
      successCount: FieldValue.increment(successCount),
      failedCount: FieldValue.increment(failedCount),
      updatedAt: FieldValue.serverTimestamp(),
    });
  }

  /**
   * Create a migration task for an item
   */
  private createMigrationTask(batchId: string, item: any): MigrationTask {
    const r2Key = `vault/${item.userId}/${item.parentId || "root"}/${item.name}`;

    return {
      id: `${batchId}-${item.id}`,
      itemId: item.id,
      userId: item.userId,
      sourcePath: item.storagePath,
      sourceProvider: "firebase",
      destPath: r2Key,
      destProvider: "r2",
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
   * Execute a single migration task
   */
  private async executeMigrationTask(task: MigrationTask): Promise<void> {
    const taskRef = this.db.collection("vaultMigrationTasks").doc(task.id);

    try {
      // Save task
      await taskRef.set(task);

      // Update status
      await taskRef.update({
        status: "in_progress",
        attempts: FieldValue.increment(1),
        updatedAt: FieldValue.serverTimestamp(),
      });

      // Perform the actual migration
      await this.storageAdapter.copyBetweenProviders({
        sourcePath: task.sourcePath,
        sourceProvider: task.sourceProvider,
        destPath: task.destPath,
        destProvider: task.destProvider,
        destBucket: "dynasty-vault", // R2 bucket name
      });

      // Update vault item with new storage info
      await this.db.collection("vaultItems").doc(task.itemId).update({
        storageProvider: "r2",
        r2Bucket: "dynasty-vault",
        r2Key: task.destPath,
        migratedAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });

      // Mark task as completed
      await taskRef.update({
        status: "completed",
        completedAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });

      logger.info("Migration task completed", createLogContext({
        taskId: task.id,
        itemId: task.itemId,
        size: task.metadata?.fileSize,
      }));
    } catch (error) {
      const {message} = formatErrorForLogging(error, {taskId: task.id});

      await taskRef.update({
        status: "failed",
        error: message,
        updatedAt: FieldValue.serverTimestamp(),
      });

      // Re-throw to be caught by batch processor
      throw error;
    }
  }

  /**
   * Get migration status for a batch
   */
  async getMigrationStatus(batchId: string): Promise<MigrationBatch & {
    recentTasks?: MigrationTask[];
  }> {
    const batchDoc = await this.db.collection("vaultMigrationBatches").doc(batchId).get();

    if (!batchDoc.exists) {
      throw createError(ErrorCode.NOT_FOUND, "Migration batch not found");
    }

    const batch = batchDoc.data() as MigrationBatch;

    // Get recent tasks
    const tasksSnapshot = await this.db.collection("vaultMigrationTasks")
      .where("id", ">=", batchId)
      .where("id", "<", batchId + "\uffff")
      .orderBy("id")
      .orderBy("updatedAt", "desc")
      .limit(10)
      .get();

    const recentTasks = tasksSnapshot.docs.map((doc) => doc.data() as MigrationTask);

    return {
      ...batch,
      recentTasks,
    };
  }

  /**
   * Cancel a migration batch
   */
  async cancelMigration(batchId: string): Promise<void> {
    const batchRef = this.db.collection("vaultMigrationBatches").doc(batchId);
    const batchDoc = await batchRef.get();

    if (!batchDoc.exists) {
      throw createError(ErrorCode.NOT_FOUND, "Migration batch not found");
    }

    const batch = batchDoc.data() as MigrationBatch;

    if (batch.status !== "running") {
      throw createError(ErrorCode.FAILED_PRECONDITION, "Can only cancel running migrations");
    }

    await batchRef.update({
      status: "cancelled",
      updatedAt: FieldValue.serverTimestamp(),
    });

    logger.info("Migration cancelled", createLogContext({batchId}));
  }

  /**
   * Verify migration integrity
   */
  async verifyMigration(itemId: string): Promise<{
    valid: boolean;
    sourceExists: boolean;
    destExists: boolean;
    error?: string;
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

      // Check source (Firebase)
      const sourceExists = await this.storageAdapter.fileExists({
        path: item.storagePath,
        provider: "firebase",
      });

      // Check destination (R2)
      const destExists = await this.storageAdapter.fileExists({
        path: item.r2Key || "",
        bucket: item.r2Bucket,
        provider: "r2",
      });

      return {
        valid: sourceExists && destExists,
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
   * Rollback a migration for an item
   */
  async rollbackMigration(itemId: string): Promise<void> {
    const itemRef = this.db.collection("vaultItems").doc(itemId);
    const itemDoc = await itemRef.get();

    if (!itemDoc.exists) {
      throw createError(ErrorCode.NOT_FOUND, "Item not found");
    }

    const item = itemDoc.data();
    if (!item || item.storageProvider !== "r2") {
      throw createError(ErrorCode.FAILED_PRECONDITION, "Item has not been migrated to R2");
    }

    // Update item back to Firebase
    await itemRef.update({
      storageProvider: "firebase",
      r2Bucket: FieldValue.delete(),
      r2Key: FieldValue.delete(),
      migratedAt: FieldValue.delete(),
      updatedAt: FieldValue.serverTimestamp(),
    });

    logger.info("Migration rolled back", createLogContext({itemId}));
  }
}

// Export singleton instance
let migrationInstance: R2VaultMigration | null = null;

export function getR2VaultMigration(): R2VaultMigration {
  if (!migrationInstance) {
    migrationInstance = new R2VaultMigration();
  }
  return migrationInstance;
}
