import {getFirestore, Timestamp, FieldValue} from "firebase-admin/firestore";
import {logger} from "firebase-functions/v2";
import {createError, ErrorCode} from "../utils/errors";
import {StorageCalculationResult} from "./storageCalculationService";
import * as admin from "firebase-admin";

/**
 * Storage notification thresholds and tracking
 */
export interface StorageNotificationTracking {
  lastNotified80?: Timestamp;
  lastNotified90?: Timestamp;
  lastNotified100?: Timestamp;
  lastUsagePercentage: number;
  lastChecked: Timestamp;
}

export interface StorageNotificationResult {
  notificationSent: boolean;
  threshold?: number;
  message?: string;
}

/**
 * Service to handle storage limit notifications following Dynasty's notification patterns.
 * Ensures users are notified at key thresholds (80%, 90%, 100%) without spam.
 */
export class StorageNotificationService {
  private db = getFirestore();
  private readonly NOTIFICATION_COOLDOWN_HOURS = 24; // Minimum hours between same threshold notifications
  private readonly RESET_THRESHOLD = 70; // If usage drops below this, reset notification eligibility

  /**
   * Check storage usage and send notifications if thresholds are crossed
   */
  async checkAndNotifyStorageLimit(
    userId: string,
    storageResult: StorageCalculationResult
  ): Promise<StorageNotificationResult> {
    try {
      const usagePercentage = storageResult.usagePercentage;
      
      // Get user's notification tracking
      const userDoc = await this.db.collection("users").doc(userId).get();
      const userData = userDoc.data();
      
      if (!userData) {
        throw createError(ErrorCode.NOT_FOUND, "User not found");
      }

      const tracking = userData.storageNotifications as StorageNotificationTracking || {
        lastUsagePercentage: 0,
        lastChecked: Timestamp.now(),
      };

      // Check if we should send a notification
      const notificationResult = await this.evaluateNotificationNeed(
        userId,
        usagePercentage,
        tracking,
        storageResult
      );

      // Update tracking
      await this.updateNotificationTracking(userId, usagePercentage, notificationResult);

      return notificationResult;
    } catch (error) {
      logger.error("Failed to check storage notifications", {userId, error});
      throw error;
    }
  }

  /**
   * Evaluate if a notification should be sent based on thresholds and history
   */
  private async evaluateNotificationNeed(
    userId: string,
    currentPercentage: number,
    tracking: StorageNotificationTracking,
    storageResult: StorageCalculationResult
  ): Promise<StorageNotificationResult> {
    // If usage dropped below reset threshold, clear notification history
    if (currentPercentage < this.RESET_THRESHOLD && tracking.lastUsagePercentage >= this.RESET_THRESHOLD) {
      await this.resetNotificationHistory(userId);
      return {notificationSent: false};
    }

    // Check each threshold
    const thresholds = [
      {value: 100, lastNotifiedKey: "lastNotified100"},
      {value: 90, lastNotifiedKey: "lastNotified90"},
      {value: 80, lastNotifiedKey: "lastNotified80"},
    ];

    for (const threshold of thresholds) {
      if (this.shouldNotifyForThreshold(
        currentPercentage,
        tracking.lastUsagePercentage,
        threshold.value,
        tracking[threshold.lastNotifiedKey as keyof StorageNotificationTracking] as Timestamp | undefined
      )) {
        // Send notification
        await this.sendStorageNotification(userId, threshold.value, storageResult);
        
        // Update tracking
        await this.db.collection("users").doc(userId).update({
          [`storageNotifications.${threshold.lastNotifiedKey}`]: Timestamp.now(),
        });

        return {
          notificationSent: true,
          threshold: threshold.value,
          message: this.getNotificationMessage(threshold.value, storageResult),
        };
      }
    }

    return {notificationSent: false};
  }

  /**
   * Determine if we should notify for a specific threshold
   */
  private shouldNotifyForThreshold(
    currentPercentage: number,
    lastPercentage: number,
    threshold: number,
    lastNotified?: Timestamp
  ): boolean {
    // Must be at or above threshold
    if (currentPercentage < threshold) {
      return false;
    }

    // Must have crossed the threshold (wasn't at this level before)
    if (lastPercentage >= threshold) {
      return false;
    }

    // Check cooldown period if previously notified
    if (lastNotified) {
      const hoursSinceNotified = (Date.now() - lastNotified.toMillis()) / (1000 * 60 * 60);
      if (hoursSinceNotified < this.NOTIFICATION_COOLDOWN_HOURS) {
        return false;
      }
    }

    return true;
  }

  /**
   * Send storage notification to user
   */
  private async sendStorageNotification(
    userId: string,
    threshold: number,
    storageResult: StorageCalculationResult
  ): Promise<void> {
    try {
      const message = this.getNotificationMessage(threshold, storageResult);
      const title = this.getNotificationTitle(threshold);

      // Get user's FCM tokens
      const tokensSnapshot = await this.db
        .collection("users")
        .doc(userId)
        .collection("tokens")
        .where("active", "==", true)
        .get();

      if (tokensSnapshot.empty) {
        logger.warn("No active FCM tokens for user", {userId});
        return;
      }

      // Send to all user's devices
      const tokens = tokensSnapshot.docs.map(doc => doc.data().token);
      
      const multicastMessage: admin.messaging.MulticastMessage = {
        tokens,
        notification: {
          title,
          body: message,
        },
        data: {
          type: "storage_limit",
          threshold: threshold.toString(),
          usagePercentage: storageResult.usagePercentage.toFixed(1),
          availableBytes: storageResult.availableBytes.toString(),
        },
        android: {
          priority: "high",
          notification: {
            channelId: "storage_alerts",
            priority: threshold >= 90 ? "high" : "default",
          },
        },
        apns: {
          payload: {
            aps: {
              alert: {
                title,
                body: message,
              },
              badge: 1,
              sound: "default",
              contentAvailable: true,
            },
          },
        },
      };

      const response = await admin.messaging().sendEachForMulticast(multicastMessage);
      
      logger.info("Storage notification sent", {
        userId,
        threshold,
        successCount: response.successCount,
        failureCount: response.failureCount,
      });

      // Store notification record
      await this.db.collection("notifications").add({
        userId,
        type: "storage_limit",
        title,
        body: message,
        threshold,
        storageData: {
          usagePercentage: storageResult.usagePercentage,
          usedBytes: storageResult.usedBytes,
          totalGB: storageResult.totalGB,
          availableBytes: storageResult.availableBytes,
        },
        read: false,
        createdAt: Timestamp.now(),
      });

    } catch (error) {
      logger.error("Failed to send storage notification", {userId, threshold, error});
      // Don't throw - we don't want to fail the entire operation if notification fails
    }
  }

  /**
   * Get notification title based on threshold
   */
  private getNotificationTitle(threshold: number): string {
    switch (threshold) {
      case 100:
        return "Storage Full! 🚨";
      case 90:
        return "Storage Almost Full ⚠️";
      case 80:
        return "Storage 80% Full";
      default:
        return "Storage Alert";
    }
  }

  /**
   * Get notification message based on threshold
   */
  private getNotificationMessage(threshold: number, storageResult: StorageCalculationResult): string {
    const usedGB = (storageResult.usedBytes / (1024 * 1024 * 1024)).toFixed(1);
    const availableGB = (storageResult.availableBytes / (1024 * 1024 * 1024)).toFixed(1);

    switch (threshold) {
      case 100:
        return `Your storage is full. You cannot upload new files. Please upgrade your plan or free up ${usedGB}GB of space.`;
      case 90:
        return `You're using ${usedGB}GB of ${storageResult.totalGB}GB. Only ${availableGB}GB remaining. Upgrade now to avoid interruptions.`;
      case 80:
        return `You're using ${usedGB}GB of ${storageResult.totalGB}GB storage. Consider managing your files or upgrading your plan.`;
      default:
        return `Storage usage: ${storageResult.usagePercentage.toFixed(0)}%`;
    }
  }

  /**
   * Update notification tracking in user document
   */
  private async updateNotificationTracking(
    userId: string,
    currentPercentage: number,
    notificationResult: StorageNotificationResult
  ): Promise<void> {
    const update: any = {
      "storageNotifications.lastUsagePercentage": currentPercentage,
      "storageNotifications.lastChecked": Timestamp.now(),
    };

    await this.db.collection("users").doc(userId).update(update);
  }

  /**
   * Reset notification history when usage drops significantly
   */
  private async resetNotificationHistory(userId: string): Promise<void> {
    await this.db.collection("users").doc(userId).update({
      "storageNotifications.lastNotified80": FieldValue.delete(),
      "storageNotifications.lastNotified90": FieldValue.delete(),
      "storageNotifications.lastNotified100": FieldValue.delete(),
    });

    logger.info("Reset storage notification history", {userId});
  }

  /**
   * Get notification history for a user
   */
  async getNotificationHistory(userId: string): Promise<StorageNotificationTracking | null> {
    const userDoc = await this.db.collection("users").doc(userId).get();
    const userData = userDoc.data();
    
    if (!userData) {
      return null;
    }

    return userData.storageNotifications as StorageNotificationTracking || null;
  }
}

// Export singleton instance
export const storageNotificationService = new StorageNotificationService();