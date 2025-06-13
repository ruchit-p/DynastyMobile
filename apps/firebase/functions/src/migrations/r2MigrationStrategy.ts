import {getFirestore} from "firebase-admin/firestore";
import {logger} from "firebase-functions/v2";

export class R2MigrationStrategy {
  private static db = getFirestore();

  /**
   * Determine if a user should use R2 based on rollout percentage
   */
  static async shouldUseR2(userId: string): Promise<boolean> {
    // Check if migration is enabled
    if (process.env.ENABLE_R2_MIGRATION !== "true") {
      return false;
    }

    // Check user-specific override
    const userDoc = await this.db.collection("users").doc(userId).get();
    const userData = userDoc.data();

    // Explicit opt-in/opt-out
    if (userData?.storageProvider === "r2") return true;
    if (userData?.storageProvider === "firebase") return false;

    // Percentage-based rollout
    const rolloutPercentage = parseInt(process.env.R2_MIGRATION_PERCENTAGE || "0");
    if (rolloutPercentage === 0) return false;
    if (rolloutPercentage >= 100) return true;

    // Use consistent hashing based on userId
    const hash = this.hashUserId(userId);
    return (hash % 100) < rolloutPercentage;
  }

  /**
   * Migrate a specific user to R2
   */
  static async migrateUserToR2(userId: string): Promise<void> {
    const batch = this.db.batch();

    // Update user document
    const userRef = this.db.collection("users").doc(userId);
    batch.update(userRef, {
      storageProvider: "r2",
      r2MigrationDate: new Date(),
      r2MigrationStatus: "in_progress",
    });

    // Mark all user's vault items for migration
    const vaultItems = await this.db.collection("vaultItems")
      .where("userId", "==", userId)
      .where("type", "==", "file")
      .where("storageProvider", "!=", "r2")
      .get();

    vaultItems.forEach((doc) => {
      batch.update(doc.ref, {
        pendingMigration: true,
        migrationPriority: "high",
      });
    });

    await batch.commit();

    logger.info(`User ${userId} marked for R2 migration`, {
      itemCount: vaultItems.size,
    });
  }

  /**
   * Rollback a user from R2 to Firebase Storage
   */
  static async rollbackUserFromR2(userId: string, reason: string): Promise<void> {
    const batch = this.db.batch();

    // Update user document
    const userRef = this.db.collection("users").doc(userId);
    batch.update(userRef, {
      storageProvider: "firebase",
      r2RollbackDate: new Date(),
      r2RollbackReason: reason,
    });

    // Log rollback
    await this.db.collection("r2Rollbacks").add({
      userId,
      reason,
      timestamp: new Date(),
      affectedItems: await this.countR2Items(userId),
    });

    await batch.commit();

    logger.warn(`User ${userId} rolled back from R2`, {reason});
  }

  private static hashUserId(userId: string): number {
    let hash = 0;
    for (let i = 0; i < userId.length; i++) {
      const char = userId.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash);
  }

  private static async countR2Items(userId: string): Promise<number> {
    const snapshot = await this.db.collection("vaultItems")
      .where("userId", "==", userId)
      .where("storageProvider", "==", "r2")
      .count()
      .get();

    return snapshot.data().count;
  }
}
