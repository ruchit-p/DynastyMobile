import {getFirestore, Timestamp, FieldValue} from "firebase-admin/firestore";
import {logger} from "firebase-functions/v2";
import {createError, ErrorCode} from "../utils/errors";

export enum MigrationPhase {
  NOT_STARTED = "not_started",
  INFRASTRUCTURE_DEPLOYED = "infrastructure_deployed",
  WEBHOOKS_DEPLOYED = "webhooks_deployed",
  FRONTEND_DEPLOYED = "frontend_deployed",
  INTERNAL_TESTING = "internal_testing",
  PARTIAL_ROLLOUT = "partial_rollout",
  FULL_ROLLOUT = "full_rollout",
  MIGRATION_COMPLETE = "migration_complete"
}

export enum MigrationStatus {
  PENDING = "pending",
  IN_PROGRESS = "in_progress",
  COMPLETED = "completed",
  FAILED = "failed",
  ROLLED_BACK = "rolled_back"
}

export interface MigrationRecord {
  id: string;
  phase: MigrationPhase;
  status: MigrationStatus;
  startedAt: Timestamp;
  completedAt?: Timestamp;
  progress: {
    totalUsers: number;
    processedUsers: number;
    successfulUsers: number;
    failedUsers: number;
  };
  errors: Array<{
    userId: string;
    error: string;
    timestamp: Timestamp;
  }>;
  rolloutPercentage: number;
  lastUpdated: Timestamp;
}

export interface UserMigrationStatus {
  userId: string;
  migrationStatus: MigrationStatus;
  subscriptionFieldsAdded: boolean;
  storageCalculated: boolean;
  communicationSent: boolean;
  migratedAt?: Timestamp;
  errors?: string[];
}

export class SubscriptionMigrationService {
  private db = getFirestore();
  private readonly MIGRATION_COLLECTION = "subscriptionMigrations";
  private readonly USER_MIGRATION_COLLECTION = "userMigrationStatus";
  private readonly MIGRATION_ID = "stripe_subscription_v1";

  /**
   * Initialize migration tracking
   */
  async initializeMigration(): Promise<void> {
    const migrationRef = this.db.collection(this.MIGRATION_COLLECTION).doc(this.MIGRATION_ID);
    const doc = await migrationRef.get();

    if (!doc.exists) {
      const migration: MigrationRecord = {
        id: this.MIGRATION_ID,
        phase: MigrationPhase.NOT_STARTED,
        status: MigrationStatus.PENDING,
        startedAt: Timestamp.now(),
        progress: {
          totalUsers: 0,
          processedUsers: 0,
          successfulUsers: 0,
          failedUsers: 0,
        },
        errors: [],
        rolloutPercentage: 0,
        lastUpdated: Timestamp.now(),
      };

      await migrationRef.set(migration);
      logger.info("Initialized subscription migration tracking");
    }
  }

  /**
   * Update migration phase
   */
  async updateMigrationPhase(phase: MigrationPhase): Promise<void> {
    await this.db.collection(this.MIGRATION_COLLECTION).doc(this.MIGRATION_ID).update({
      phase,
      lastUpdated: Timestamp.now(),
    });

    logger.info(`Updated migration phase to: ${phase}`);
  }

  /**
   * Get current migration status
   */
  async getMigrationStatus(): Promise<MigrationRecord> {
    const doc = await this.db.collection(this.MIGRATION_COLLECTION).doc(this.MIGRATION_ID).get();

    if (!doc.exists) {
      throw createError(ErrorCode.NOT_FOUND, "Migration record not found");
    }

    return doc.data() as MigrationRecord;
  }

  /**
   * Track user migration status
   */
  async trackUserMigration(
    userId: string,
    update: Partial<UserMigrationStatus>
  ): Promise<void> {
    const userMigrationRef = this.db
      .collection(this.USER_MIGRATION_COLLECTION)
      .doc(userId);

    const existing = await userMigrationRef.get();

    if (existing.exists) {
      await userMigrationRef.update({
        ...update,
        lastUpdated: Timestamp.now(),
      });
    } else {
      const userStatus: UserMigrationStatus = {
        userId,
        migrationStatus: MigrationStatus.PENDING,
        subscriptionFieldsAdded: false,
        storageCalculated: false,
        communicationSent: false,
        ...update,
      };

      await userMigrationRef.set(userStatus);
    }
  }

  /**
   * Update migration progress
   */
  async updateMigrationProgress(
    delta: {
      processed?: number;
      successful?: number;
      failed?: number;
    }
  ): Promise<void> {
    await this.db.runTransaction(async (transaction) => {
      const migrationRef = this.db.collection(this.MIGRATION_COLLECTION).doc(this.MIGRATION_ID);
      const doc = await transaction.get(migrationRef);

      if (!doc.exists) {
        throw createError(ErrorCode.NOT_FOUND, "Migration record not found");
      }

      const current = doc.data() as MigrationRecord;

      transaction.update(migrationRef, {
        "progress.processedUsers": current.progress.processedUsers + (delta.processed || 0),
        "progress.successfulUsers": current.progress.successfulUsers + (delta.successful || 0),
        "progress.failedUsers": current.progress.failedUsers + (delta.failed || 0),
        "lastUpdated": Timestamp.now(),
      });
    });
  }

  /**
   * Log migration error
   */
  async logMigrationError(userId: string, error: string): Promise<void> {
    await this.db.collection(this.MIGRATION_COLLECTION).doc(this.MIGRATION_ID).update({
      errors: FieldValue.arrayUnion({
        userId,
        error,
        timestamp: Timestamp.now(),
      }),
      lastUpdated: Timestamp.now(),
    });

    // Also update user migration status
    await this.trackUserMigration(userId, {
      migrationStatus: MigrationStatus.FAILED,
      errors: FieldValue.arrayUnion(error) as any,
    });
  }

  /**
   * Check if user should be migrated based on rollout percentage
   */
  async shouldMigrateUser(userId: string): Promise<boolean> {
    // Check if user already migrated
    const userMigrationDoc = await this.db
      .collection(this.USER_MIGRATION_COLLECTION)
      .doc(userId)
      .get();

    if (userMigrationDoc.exists) {
      const status = userMigrationDoc.data() as UserMigrationStatus;
      if (status.migrationStatus === MigrationStatus.COMPLETED) {
        return false;
      }
    }

    // Check rollout percentage
    const migration = await this.getMigrationStatus();

    if (migration.rolloutPercentage === 0) return false;
    if (migration.rolloutPercentage >= 100) return true;

    // Use consistent hashing based on userId
    const hash = this.hashUserId(userId);
    return (hash % 100) < migration.rolloutPercentage;
  }

  /**
   * Update rollout percentage
   */
  async updateRolloutPercentage(percentage: number): Promise<void> {
    if (percentage < 0 || percentage > 100) {
      throw createError(ErrorCode.INVALID_ARGUMENT, "Percentage must be between 0 and 100");
    }

    await this.db.collection(this.MIGRATION_COLLECTION).doc(this.MIGRATION_ID).update({
      rolloutPercentage: percentage,
      lastUpdated: Timestamp.now(),
    });

    logger.info(`Updated rollout percentage to: ${percentage}%`);
  }

  /**
   * Mark migration as complete
   */
  async completeMigration(): Promise<void> {
    await this.db.collection(this.MIGRATION_COLLECTION).doc(this.MIGRATION_ID).update({
      phase: MigrationPhase.MIGRATION_COMPLETE,
      status: MigrationStatus.COMPLETED,
      completedAt: Timestamp.now(),
      lastUpdated: Timestamp.now(),
    });

    logger.info("Subscription migration marked as complete");
  }

  /**
   * Create rollback snapshot
   */
  async createRollbackSnapshot(userId: string): Promise<string> {
    const userDoc = await this.db.collection("users").doc(userId).get();

    if (!userDoc.exists) {
      throw createError(ErrorCode.NOT_FOUND, "User not found");
    }

    const snapshot = {
      userId,
      userData: userDoc.data(),
      createdAt: Timestamp.now(),
      migrationId: this.MIGRATION_ID,
    };

    const docRef = await this.db.collection("migrationSnapshots").add(snapshot);

    logger.info(`Created rollback snapshot for user ${userId}`, {snapshotId: docRef.id});
    return docRef.id;
  }

  /**
   * Rollback user migration
   */
  async rollbackUserMigration(userId: string, snapshotId: string): Promise<void> {
    const snapshotDoc = await this.db.collection("migrationSnapshots").doc(snapshotId).get();

    if (!snapshotDoc.exists) {
      throw createError(ErrorCode.NOT_FOUND, "Snapshot not found");
    }

    const snapshot = snapshotDoc.data();

    // Restore user data (excluding migration fields)
    const {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      subscriptionTier,
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      subscriptionStatus,
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      stripeCustomerId,
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      subscriptionEndDate,
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      storageQuotaGB,
      ...restoreData
    } = snapshot!.userData;

    await this.db.collection("users").doc(userId).update(restoreData);

    // Update migration status
    await this.trackUserMigration(userId, {
      migrationStatus: MigrationStatus.ROLLED_BACK,
    });

    logger.info(`Rolled back migration for user ${userId}`);
  }

  /**
   * Generate migration report
   */
  async generateMigrationReport(): Promise<{
    summary: MigrationRecord;
    userBreakdown: {
      total: number;
      completed: number;
      failed: number;
      pending: number;
      rolledBack: number;
    };
    errorSummary: Array<{
      error: string;
      count: number;
    }>;
  }> {
    const migration = await this.getMigrationStatus();

    // Get user breakdown
    const userStatuses = await this.db.collection(this.USER_MIGRATION_COLLECTION).get();

    const breakdown = {
      total: userStatuses.size,
      completed: 0,
      failed: 0,
      pending: 0,
      rolledBack: 0,
    };

    const errorMap = new Map<string, number>();

    userStatuses.forEach((doc) => {
      const status = doc.data() as UserMigrationStatus;

      switch (status.migrationStatus) {
      case MigrationStatus.COMPLETED:
        breakdown.completed++;
        break;
      case MigrationStatus.FAILED:
        breakdown.failed++;
        // Count errors
        status.errors?.forEach((error) => {
          errorMap.set(error, (errorMap.get(error) || 0) + 1);
        });
        break;
      case MigrationStatus.PENDING:
        breakdown.pending++;
        break;
      case MigrationStatus.ROLLED_BACK:
        breakdown.rolledBack++;
        break;
      }
    });

    const errorSummary = Array.from(errorMap.entries())
      .map(([error, count]) => ({error, count}))
      .sort((a, b) => b.count - a.count);

    return {
      summary: migration,
      userBreakdown: breakdown,
      errorSummary,
    };
  }

  private hashUserId(userId: string): number {
    let hash = 0;
    for (let i = 0; i < userId.length; i++) {
      const char = userId.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash);
  }
}
