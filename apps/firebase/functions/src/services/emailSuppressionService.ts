import {getFirestore, FieldValue} from "firebase-admin/firestore";
import {logger} from "firebase-functions/v2";
import {createError, ErrorCode} from "../utils/errors";
import {createLogContext} from "../utils/sanitization";

export interface SuppressionEntry {
  email: string;
  reason: "bounce" | "complaint" | "unsubscribe";
  type: "hard" | "soft" | "transient";
  suppressedAt: FirebaseFirestore.Timestamp;
  metadata: any;
  active: boolean;
  userId?: string;
}

export interface SuppressionCheckResult {
  isSuppressed: boolean;
  reason?: string;
  type?: string;
  suppressedAt?: Date;
  canOverride?: boolean;
}

/**
 * Service for managing email suppression lists
 * Handles bounce, complaint, and unsubscribe suppression
 */
export class EmailSuppressionService {
  private db: FirebaseFirestore.Firestore;

  constructor() {
    this.db = getFirestore();
  }

  /**
   * Check if an email address is suppressed
   */
  async isEmailSuppressed(email: string): Promise<SuppressionCheckResult> {
    try {
      const normalizedEmail = email.toLowerCase().trim();
      const suppressionRef = this.db.collection("emailSuppressionList").doc(normalizedEmail);
      const suppressionDoc = await suppressionRef.get();

      if (!suppressionDoc.exists) {
        return {isSuppressed: false};
      }

      const data = suppressionDoc.data() as SuppressionEntry;

      // Check if suppression is still active
      if (!data.active) {
        return {isSuppressed: false};
      }

      // Check if it's a transient suppression that has expired
      if (data.type === "transient" && this.isTransientSuppressionExpired(data)) {
        await this.removeFromSuppressionList(normalizedEmail);
        return {isSuppressed: false};
      }

      return {
        isSuppressed: true,
        reason: data.reason,
        type: data.type,
        suppressedAt: data.suppressedAt.toDate(),
        canOverride: data.type === "soft" || data.reason === "unsubscribe",
      };
    } catch (error) {
      logger.error(
        "Error checking email suppression",
        createLogContext({
          email: email.substring(0, 3) + "***",
          error: error instanceof Error ? error.message : String(error),
        })
      );

      // In case of error, allow email to proceed (fail open)
      return {isSuppressed: false};
    }
  }

  /**
   * Add email to suppression list
   */
  async addToSuppressionList(
    email: string,
    reason: "bounce" | "complaint" | "unsubscribe",
    type: "hard" | "soft" | "transient",
    metadata: any = {},
    userId?: string
  ): Promise<void> {
    try {
      const normalizedEmail = email.toLowerCase().trim();
      const suppressionRef = this.db.collection("emailSuppressionList").doc(normalizedEmail);

      await suppressionRef.set(
        {
          email: normalizedEmail,
          reason,
          type,
          suppressedAt: FieldValue.serverTimestamp(),
          metadata,
          active: true,
          userId: userId || null,
          updatedAt: FieldValue.serverTimestamp(),
        },
        {merge: true}
      );

      logger.info(
        "Added email to suppression list",
        createLogContext({
          email: email.substring(0, 3) + "***",
          reason,
          type,
          userId,
        })
      );
    } catch (error) {
      logger.error(
        "Error adding email to suppression list",
        createLogContext({
          email: email.substring(0, 3) + "***",
          reason,
          type,
          error: error instanceof Error ? error.message : String(error),
        })
      );
      throw createError(ErrorCode.INTERNAL, "Failed to add email to suppression list");
    }
  }

  /**
   * Remove email from suppression list
   */
  async removeFromSuppressionList(email: string): Promise<void> {
    try {
      const normalizedEmail = email.toLowerCase().trim();
      const suppressionRef = this.db.collection("emailSuppressionList").doc(normalizedEmail);

      await suppressionRef.update({
        active: false,
        removedAt: FieldValue.serverTimestamp(),
      });

      logger.info(
        "Removed email from suppression list",
        createLogContext({
          email: email.substring(0, 3) + "***",
        })
      );
    } catch (error) {
      logger.error(
        "Error removing email from suppression list",
        createLogContext({
          email: email.substring(0, 3) + "***",
          error: error instanceof Error ? error.message : String(error),
        })
      );
      throw createError(ErrorCode.INTERNAL, "Failed to remove email from suppression list");
    }
  }

  /**
   * Bulk check multiple email addresses
   */
  async bulkCheckSuppression(emails: string[]): Promise<Map<string, SuppressionCheckResult>> {
    const results = new Map<string, SuppressionCheckResult>();

    // Process in batches of 10 to avoid Firestore read limits
    const batchSize = 10;
    for (let i = 0; i < emails.length; i += batchSize) {
      const batch = emails.slice(i, i + batchSize);
      const batchPromises = batch.map(async (email) => {
        const result = await this.isEmailSuppressed(email);
        return {email, result};
      });

      const batchResults = await Promise.all(batchPromises);
      batchResults.forEach(({email, result}) => {
        results.set(email, result);
      });
    }

    return results;
  }

  /**
   * Get suppression statistics
   */
  async getSuppressionStats(): Promise<{
    total: number;
    byReason: Record<string, number>;
    byType: Record<string, number>;
    recent24h: number;
  }> {
    try {
      const suppressionQuery = this.db
        .collection("emailSuppressionList")
        .where("active", "==", true);

      const snapshot = await suppressionQuery.get();
      const entries = snapshot.docs.map((doc) => doc.data() as SuppressionEntry);

      const stats = {
        total: entries.length,
        byReason: {} as Record<string, number>,
        byType: {} as Record<string, number>,
        recent24h: 0,
      };

      const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);

      entries.forEach((entry) => {
        // Count by reason
        stats.byReason[entry.reason] = (stats.byReason[entry.reason] || 0) + 1;

        // Count by type
        stats.byType[entry.type] = (stats.byType[entry.type] || 0) + 1;

        // Count recent suppressions
        if (entry.suppressedAt.toDate() > yesterday) {
          stats.recent24h++;
        }
      });

      return stats;
    } catch (error) {
      logger.error(
        "Error getting suppression stats",
        createLogContext({
          error: error instanceof Error ? error.message : String(error),
        })
      );
      throw createError(ErrorCode.INTERNAL, "Failed to get suppression statistics");
    }
  }

  /**
   * Export suppression list for compliance
   */
  async exportSuppressionList(
    reason?: "bounce" | "complaint" | "unsubscribe",
    startDate?: Date,
    endDate?: Date
  ): Promise<SuppressionEntry[]> {
    try {
      let query = this.db.collection("emailSuppressionList").where("active", "==", true);

      if (reason) {
        query = query.where("reason", "==", reason);
      }

      if (startDate) {
        query = query.where("suppressedAt", ">=", startDate);
      }

      if (endDate) {
        query = query.where("suppressedAt", "<=", endDate);
      }

      const snapshot = await query.get();
      return snapshot.docs.map((doc) => doc.data() as SuppressionEntry);
    } catch (error) {
      logger.error(
        "Error exporting suppression list",
        createLogContext({
          reason,
          startDate: startDate?.toISOString(),
          endDate: endDate?.toISOString(),
          error: error instanceof Error ? error.message : String(error),
        })
      );
      throw createError(ErrorCode.INTERNAL, "Failed to export suppression list");
    }
  }

  /**
   * Clean up old transient suppressions
   */
  async cleanupExpiredSuppressions(): Promise<number> {
    try {
      const transientQuery = this.db
        .collection("emailSuppressionList")
        .where("active", "==", true)
        .where("type", "==", "transient");

      const snapshot = await transientQuery.get();
      let cleanedCount = 0;

      const batch = this.db.batch();
      for (const doc of snapshot.docs) {
        const data = doc.data() as SuppressionEntry;
        if (this.isTransientSuppressionExpired(data)) {
          batch.update(doc.ref, {
            active: false,
            removedAt: FieldValue.serverTimestamp(),
            removalReason: "expired",
          });
          cleanedCount++;
        }
      }

      if (cleanedCount > 0) {
        await batch.commit();
        logger.info(
          "Cleaned up expired transient suppressions",
          createLogContext({
            cleanedCount,
          })
        );
      }

      return cleanedCount;
    } catch (error) {
      logger.error(
        "Error cleaning up expired suppressions",
        createLogContext({
          error: error instanceof Error ? error.message : String(error),
        })
      );
      return 0;
    }
  }

  /**
   * Check if a transient suppression has expired (24 hours)
   */
  private isTransientSuppressionExpired(suppression: SuppressionEntry): boolean {
    const expiryTime = 24 * 60 * 60 * 1000; // 24 hours
    const suppressedAt = suppression.suppressedAt.toDate().getTime();
    return Date.now() - suppressedAt > expiryTime;
  }

  /**
   * Validate email before sending (main public method)
   */
  async validateEmailForSending(
    email: string,
    emailType: "transactional" | "marketing" = "marketing",
    allowOverride: boolean = false
  ): Promise<{ canSend: boolean; reason?: string }> {
    const suppressionCheck = await this.isEmailSuppressed(email);

    if (!suppressionCheck.isSuppressed) {
      return {canSend: true};
    }

    // Always allow critical transactional emails (password reset, security alerts)
    if (emailType === "transactional" && suppressionCheck.reason === "unsubscribe") {
      return {canSend: true};
    }

    // Allow override for soft suppressions if explicitly requested
    if (allowOverride && suppressionCheck.canOverride) {
      logger.info(
        "Email suppression overridden",
        createLogContext({
          email: email.substring(0, 3) + "***",
          reason: suppressionCheck.reason,
          type: suppressionCheck.type,
        })
      );
      return {canSend: true};
    }

    return {
      canSend: false,
      reason: `Email suppressed due to ${suppressionCheck.reason} (${suppressionCheck.type})`,
    };
  }
}

// Singleton instance
let suppressionService: EmailSuppressionService | null = null;

/**
 * Get the email suppression service instance
 */
export function getEmailSuppressionService(): EmailSuppressionService {
  if (!suppressionService) {
    suppressionService = new EmailSuppressionService();
  }
  return suppressionService;
}
