// B2 Migration Strategy Service
// Handles user selection, gradual rollout, and migration decision logic

import {getFirestore, FieldValue, Timestamp} from "firebase-admin/firestore";
import {logger} from "firebase-functions/v2";
import {createLogContext, formatErrorForLogging} from "../utils/sanitization";
import {createError, ErrorCode} from "../utils/errors";

interface MigrationCohort {
  id: string;
  name: string;
  description: string;
  criteria: {
    userType?: "premium" | "free" | "admin";
    signupDateBefore?: Timestamp;
    signupDateAfter?: Timestamp;
    storageUsage?: {
      min?: number;
      max?: number;
    };
    location?: string[];
    testGroup?: boolean;
  };
  rolloutPercentage: number; // 0-100
  enabled: boolean;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

interface UserMigrationStatus {
  userId: string;
  cohortId?: string;
  eligibleForB2: boolean;
  migrationStatus: "not_started" | "eligible" | "in_progress" | "completed" | "failed" | "excluded";
  migrationStartedAt?: Timestamp;
  migrationCompletedAt?: Timestamp;
  lastCheckedAt: Timestamp;
  migrationBatchId?: string;
  metrics: {
    totalFiles: number;
    totalSize: number;
    migratedFiles: number;
    migratedSize: number;
    failedFiles: number;
  };
  exclusionReason?: string;
}

export class B2MigrationStrategy {
  private db = getFirestore();

  /**
   * Create a migration cohort for targeted rollout
   */
  async createMigrationCohort(cohort: Omit<MigrationCohort, "id" | "createdAt" | "updatedAt">): Promise<string> {
    const cohortId = `cohort-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    const cohortData: MigrationCohort = {
      ...cohort,
      id: cohortId,
      createdAt: FieldValue.serverTimestamp() as Timestamp,
      updatedAt: FieldValue.serverTimestamp() as Timestamp,
    };

    await this.db.collection("migrationCohorts").doc(cohortId).set(cohortData);

    logger.info("Created migration cohort", createLogContext({
      cohortId,
      name: cohort.name,
      rolloutPercentage: cohort.rolloutPercentage,
    }));

    return cohortId;
  }

  /**
   * Update cohort rollout percentage for gradual rollout
   */
  async updateCohortRollout(cohortId: string, rolloutPercentage: number): Promise<void> {
    if (rolloutPercentage < 0 || rolloutPercentage > 100) {
      throw createError(ErrorCode.INVALID_ARGUMENT, "Rollout percentage must be between 0 and 100");
    }

    await this.db.collection("migrationCohorts").doc(cohortId).update({
      rolloutPercentage,
      updatedAt: FieldValue.serverTimestamp(),
    });

    logger.info("Updated cohort rollout", createLogContext({
      cohortId,
      rolloutPercentage,
    }));
  }

  /**
   * Check if a user is eligible for B2 migration
   */
  async checkUserEligibility(userId: string): Promise<{
    eligible: boolean;
    cohortId?: string;
    reason?: string;
  }> {
    try {
      // Get user data
      const userDoc = await this.db.collection("users").doc(userId).get();
      if (!userDoc.exists) {
        return { eligible: false, reason: "User not found" };
      }

      const userData = userDoc.data();
      if (!userData) {
        return { eligible: false, reason: "User data is null" };
      }

      // Check if user is already migrated or in progress
      const migrationStatus = await this.getUserMigrationStatus(userId);
      if (migrationStatus.migrationStatus === "completed") {
        return { eligible: false, reason: "Already migrated to B2" };
      }
      if (migrationStatus.migrationStatus === "in_progress") {
        return { eligible: false, reason: "Migration already in progress" };
      }

      // Get active cohorts
      const cohortsSnapshot = await this.db.collection("migrationCohorts")
        .where("enabled", "==", true)
        .get();

      // Check each cohort for eligibility
      for (const cohortDoc of cohortsSnapshot.docs) {
        const cohort = cohortDoc.data() as MigrationCohort;

        if (await this.userMatchesCohort(userData, cohort)) {
          // Check rollout percentage
          const userHash = this.getUserHash(userId);
          const userPercentile = userHash % 100;

          if (userPercentile < cohort.rolloutPercentage) {
            return {
              eligible: true,
              cohortId: cohort.id,
            };
          } else {
            return {
              eligible: false,
              reason: `User not in rollout percentage (${userPercentile} >= ${cohort.rolloutPercentage})`,
            };
          }
        }
      }

      return { eligible: false, reason: "User does not match any active cohort" };
    } catch (error) {
      const {message} = formatErrorForLogging(error, {userId});
      logger.error("Error checking user eligibility", {userId, error: message});
      return { eligible: false, reason: `Error checking eligibility: ${message}` };
    }
  }

  /**
   * Check if user matches cohort criteria
   */
  private async userMatchesCohort(userData: any, cohort: MigrationCohort): Promise<boolean> {
    const criteria = cohort.criteria;

    // Check user type
    if (criteria.userType) {
      const userType = userData.subscriptionStatus === "active" ? "premium" : "free";
      if (userData.role === "admin") {
        // Override for admins
        if (criteria.userType !== "admin") return false;
      } else if (userType !== criteria.userType) {
        return false;
      }
    }

    // Check signup date
    if (criteria.signupDateBefore || criteria.signupDateAfter) {
      const signupDate = userData.createdAt as Timestamp;
      if (criteria.signupDateBefore && signupDate.toMillis() >= criteria.signupDateBefore.toMillis()) {
        return false;
      }
      if (criteria.signupDateAfter && signupDate.toMillis() <= criteria.signupDateAfter.toMillis()) {
        return false;
      }
    }

    // Check storage usage
    if (criteria.storageUsage) {
      const storageUsed = userData.storageUsed || 0;
      if (criteria.storageUsage.min && storageUsed < criteria.storageUsage.min) {
        return false;
      }
      if (criteria.storageUsage.max && storageUsed > criteria.storageUsage.max) {
        return false;
      }
    }

    // Check location (if available)
    if (criteria.location && criteria.location.length > 0) {
      const userLocation = userData.location || userData.country;
      if (!userLocation || !criteria.location.includes(userLocation)) {
        return false;
      }
    }

    // Check test group
    if (criteria.testGroup !== undefined) {
      const isTestUser = userData.testUser || false;
      if (criteria.testGroup !== isTestUser) {
        return false;
      }
    }

    return true;
  }

  /**
   * Generate consistent hash for user (for stable rollout percentages)
   */
  private getUserHash(userId: string): number {
    let hash = 0;
    for (let i = 0; i < userId.length; i++) {
      const char = userId.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash);
  }

  /**
   * Get or create user migration status
   */
  async getUserMigrationStatus(userId: string): Promise<UserMigrationStatus> {
    const statusDoc = await this.db.collection("userMigrationStatus").doc(userId).get();

    if (statusDoc.exists) {
      return statusDoc.data() as UserMigrationStatus;
    }

    // Create new status
    const newStatus: UserMigrationStatus = {
      userId,
      eligibleForB2: false,
      migrationStatus: "not_started",
      lastCheckedAt: FieldValue.serverTimestamp() as Timestamp,
      metrics: {
        totalFiles: 0,
        totalSize: 0,
        migratedFiles: 0,
        migratedSize: 0,
        failedFiles: 0,
      },
    };

    await this.db.collection("userMigrationStatus").doc(userId).set(newStatus);
    return newStatus;
  }

  /**
   * Update user migration status
   */
  async updateUserMigrationStatus(
    userId: string,
    updates: Partial<UserMigrationStatus>
  ): Promise<void> {
    const updateData = {
      ...updates,
      lastCheckedAt: FieldValue.serverTimestamp(),
    };

    await this.db.collection("userMigrationStatus").doc(userId).update(updateData);

    logger.debug("Updated user migration status", createLogContext({
      userId,
      migrationStatus: updates.migrationStatus,
    }));
  }

  /**
   * Calculate user vault metrics for migration planning
   */
  async calculateUserVaultMetrics(userId: string): Promise<{
    totalFiles: number;
    totalSize: number;
    filesByProvider: Record<string, { count: number; size: number }>;
    estimatedMigrationTime: number; // in minutes
  }> {
    const vaultItemsSnapshot = await this.db.collection("vaultItems")
      .where("userId", "==", userId)
      .where("isDeleted", "==", false)
      .where("type", "==", "file")
      .get();

    let totalFiles = 0;
    let totalSize = 0;
    const filesByProvider: Record<string, { count: number; size: number }> = {};

    vaultItemsSnapshot.forEach((doc) => {
      const data = doc.data();
      const provider = data.storageProvider || "firebase";
      const size = data.size || 0;

      totalFiles++;
      totalSize += size;

      if (!filesByProvider[provider]) {
        filesByProvider[provider] = { count: 0, size: 0 };
      }
      filesByProvider[provider].count++;
      filesByProvider[provider].size += size;
    });

    // Estimate migration time (rough calculation)
    // Assume 1MB/second transfer rate for B2, plus overhead
    const estimatedMigrationTime = Math.max(1, Math.ceil(totalSize / (1024 * 1024 * 60))); // in minutes

    return {
      totalFiles,
      totalSize,
      filesByProvider,
      estimatedMigrationTime,
    };
  }

  /**
   * Get users eligible for migration in a cohort
   */
  async getEligibleUsersForCohort(
    cohortId: string,
    limit: number = 100
  ): Promise<string[]> {
    const cohortDoc = await this.db.collection("migrationCohorts").doc(cohortId).get();
    if (!cohortDoc.exists) {
      throw createError(ErrorCode.NOT_FOUND, "Cohort not found");
    }

    const cohort = cohortDoc.data() as MigrationCohort;
    if (!cohort.enabled) {
      return [];
    }

    // Get users who haven't been checked recently or are eligible
    const cutoffTime = new Date(Date.now() - 24 * 60 * 60 * 1000); // 24 hours ago
    const statusSnapshot = await this.db.collection("userMigrationStatus")
      .where("migrationStatus", "in", ["not_started", "eligible"])
      .where("lastCheckedAt", "<", Timestamp.fromDate(cutoffTime))
      .limit(limit * 2) // Get more to account for filtering
      .get();

    const eligibleUsers: string[] = [];

    for (const doc of statusSnapshot.docs) {
      if (eligibleUsers.length >= limit) break;

      const status = doc.data() as UserMigrationStatus;
      const eligibility = await this.checkUserEligibility(status.userId);

      if (eligibility.eligible && eligibility.cohortId === cohortId) {
        eligibleUsers.push(status.userId);

        // Update status
        await this.updateUserMigrationStatus(status.userId, {
          eligibleForB2: true,
          migrationStatus: "eligible",
          cohortId,
        });
      }
    }

    return eligibleUsers;
  }

  /**
   * Get migration strategy statistics
   */
  async getMigrationStats(): Promise<{
    cohorts: Array<MigrationCohort & { eligibleUsers: number }>;
    totalUsers: number;
    usersByStatus: Record<string, number>;
    migrationProgress: {
      totalEligible: number;
      inProgress: number;
      completed: number;
      failed: number;
    };
  }> {
    // Get all cohorts
    const cohortsSnapshot = await this.db.collection("migrationCohorts").get();
    const cohorts = [];

    for (const doc of cohortsSnapshot.docs) {
      const cohort = doc.data() as MigrationCohort;
      
      // Count eligible users for this cohort (approximate)
      const eligibleCount = await this.db.collection("userMigrationStatus")
        .where("cohortId", "==", cohort.id)
        .where("eligibleForB2", "==", true)
        .count()
        .get();

      cohorts.push({
        ...cohort,
        eligibleUsers: eligibleCount.data().count,
      });
    }

    // Get user status statistics
    const statusSnapshot = await this.db.collection("userMigrationStatus").get();
    const usersByStatus: Record<string, number> = {};
    let totalUsers = 0;

    statusSnapshot.forEach((doc) => {
      const status = doc.data() as UserMigrationStatus;
      totalUsers++;
      usersByStatus[status.migrationStatus] = (usersByStatus[status.migrationStatus] || 0) + 1;
    });

    const migrationProgress = {
      totalEligible: usersByStatus.eligible || 0,
      inProgress: usersByStatus.in_progress || 0,
      completed: usersByStatus.completed || 0,
      failed: usersByStatus.failed || 0,
    };

    return {
      cohorts,
      totalUsers,
      usersByStatus,
      migrationProgress,
    };
  }

  /**
   * Exclude user from B2 migration
   */
  async excludeUserFromMigration(userId: string, reason: string): Promise<void> {
    await this.updateUserMigrationStatus(userId, {
      eligibleForB2: false,
      migrationStatus: "excluded",
      exclusionReason: reason,
    });

    logger.info("User excluded from B2 migration", createLogContext({
      userId,
      reason,
    }));
  }

  /**
   * Reset user migration status (for testing or rollback)
   */
  async resetUserMigrationStatus(userId: string): Promise<void> {
    await this.updateUserMigrationStatus(userId, {
      eligibleForB2: false,
      migrationStatus: "not_started",
      cohortId: FieldValue.delete() as any,
      migrationStartedAt: FieldValue.delete() as any,
      migrationCompletedAt: FieldValue.delete() as any,
      migrationBatchId: FieldValue.delete() as any,
      exclusionReason: FieldValue.delete() as any,
      metrics: {
        totalFiles: 0,
        totalSize: 0,
        migratedFiles: 0,
        migratedSize: 0,
        failedFiles: 0,
      },
    });

    logger.info("Reset user migration status", createLogContext({userId}));
  }
}

// Export singleton instance
let migrationStrategyInstance: B2MigrationStrategy | null = null;

export function getB2MigrationStrategy(): B2MigrationStrategy {
  if (!migrationStrategyInstance) {
    migrationStrategyInstance = new B2MigrationStrategy();
  }
  return migrationStrategyInstance;
}