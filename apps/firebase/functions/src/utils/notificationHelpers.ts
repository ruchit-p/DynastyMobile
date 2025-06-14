import {getFirestore, FieldValue} from "firebase-admin/firestore";
import {getMessaging} from "firebase-admin/messaging";
import {logger} from "firebase-functions/v2";

const db = getFirestore();
const messaging = getMessaging();

export type NotificationType =
  | "story:new"
  | "story:liked"
  | "story:tagged"
  | "comment:new"
  | "comment:reply"
  | "event:invitation"
  | "event:updated"
  | "event:reminder"
  | "event:rsvp"
  | "family:invitation"
  | "system:announcement"
  | "message:new"
  | "storage:warning"
  | "storage:full"
  | "subscription:expired"
  | "subscription:renewed"
  | "subscription:addon_added"
  | "subscription:addon_removed"
  | "family:member_added"
  | "family:member_removed";

export interface NotificationData {
  id?: string;
  userId: string;
  title: string;
  body: string;
  type: NotificationType;
  relatedItemId?: string;
  link?: string;
  imageUrl?: string;
  isRead?: boolean;
  createdAt?: any;
  updatedAt?: any;
  data?: Record<string, any>; // Additional data for the notification
}

/**
 * Creates a notification in Firestore
 * @param notification Notification data
 * @returns The notification ID
 */
export async function createNotification(notification: NotificationData): Promise<string> {
  try {
    const notificationRef = db.collection("notifications").doc();
    const notificationId = notificationRef.id;

    const notificationData = {
      ...notification,
      id: notificationId,
      isRead: notification.isRead ?? false,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    };

    await notificationRef.set(notificationData);
    logger.info(`Created notification ${notificationId} for user ${notification.userId}`);

    return notificationId;
  } catch (error) {
    logger.error("Error creating notification", {notification, error});
    throw error;
  }
}

/**
 * Creates a notification and optionally sends a push notification
 * @param notification Notification data
 * @param sendPush Whether to send push notification
 * @returns The notification ID
 */
export async function createAndSendNotification(
  notification: NotificationData,
  sendPush: boolean = true
): Promise<string> {
  // Create the notification in Firestore
  const notificationId = await createNotification(notification);

  // Send push notification if requested
  if (sendPush) {
    try {
      // Get user's device tokens
      const devicesSnapshot = await db
        .collection("userDevices")
        .where("userId", "==", notification.userId)
        .get();

      if (!devicesSnapshot.empty) {
        const tokens = devicesSnapshot.docs.map(doc => doc.data().token);
        
        // Send to all user's devices
        const message = {
          notification: {
            title: notification.title,
            body: notification.body,
            ...(notification.imageUrl && {imageUrl: notification.imageUrl}),
          },
          data: {
            notificationId,
            type: notification.type,
            ...(notification.relatedItemId && {relatedItemId: notification.relatedItemId}),
            ...(notification.link && {link: notification.link}),
            ...(notification.data || {}),
          },
          tokens,
        };

        const response = await messaging.sendEachForMulticast(message);
        logger.info(`Push notification sent: ${response.successCount} success, ${response.failureCount} failures`);
      }
    } catch (error) {
      // Log error but don't fail - notification was still created
      logger.error("Error sending push notification", {notificationId, error});
    }
  }

  return notificationId;
}

/**
 * Send a storage warning notification
 * @param userId User ID
 * @param usagePercentage Current usage percentage
 * @param storageUsedBytes Current storage used in bytes
 * @param storageLimitBytes Storage limit in bytes
 */
export async function sendStorageWarningNotification(
  userId: string,
  usagePercentage: number,
  storageUsedBytes: number,
  storageLimitBytes: number
): Promise<void> {
  const title = usagePercentage >= 100 
    ? "Storage Full" 
    : `Storage Warning: ${usagePercentage}% Used`;
  
  const body = usagePercentage >= 100
    ? "Your storage is full. Please upgrade your plan or delete some files to continue uploading."
    : `You've used ${usagePercentage}% of your storage. Consider upgrading your plan for more space.`;

  await createAndSendNotification({
    userId,
    title,
    body,
    type: usagePercentage >= 100 ? "storage:full" : "storage:warning",
    link: "/settings/storage",
    data: {
      storageUsedBytes: storageUsedBytes.toString(),
      storageLimitBytes: storageLimitBytes.toString(),
      usagePercentage: usagePercentage.toString(),
    },
  });
}