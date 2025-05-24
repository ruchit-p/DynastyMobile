// MARK: - Notifications Firebase Functions

import {onCall} from "firebase-functions/v2/https";
import {logger} from "firebase-functions/v2";
import {getFirestore, FieldValue} from "firebase-admin/firestore";
import {getMessaging} from "firebase-admin/messaging";
import {DEFAULT_REGION, FUNCTION_TIMEOUT} from "./common";
import {createError, withErrorHandling, ErrorCode} from "./utils/errors";
import {onDocumentCreated} from "firebase-functions/v2/firestore";
import {onSchedule} from "firebase-functions/v2/scheduler";

const db = getFirestore();
const messaging = getMessaging();

// MARK: - Types

interface NotificationData {
  id?: string;
  userId: string;
  title: string;
  body: string;
  type: NotificationType;
  relatedItemId?: string;
  link?: string;
  imageUrl?: string;
  isRead: boolean;
  createdAt?: any;
  updatedAt?: any;
}

type NotificationType =
  | "story:new"
  | "story:liked"
  | "comment:new"
  | "comment:reply"
  | "event:invitation"
  | "event:updated"
  | "event:reminder"
  | "family:invitation"
  | "system:announcement";

interface UserDevice {
  userId: string;
  token: string;
  platform: "web" | "ios" | "android";
  createdAt: any;
  lastActive: any;
}

// MARK: - Helper Functions

/**
 * Creates a notification and sends it via FCM
 */
const createAndSendNotification = async (
  notification: NotificationData,
  token?: string
): Promise<string> => {
  try {
    // Create notification document in Firestore
    const notificationRef = db.collection("notifications").doc();
    const notificationId = notificationRef.id;

    // Add createdAt, updatedAt and id
    const notificationData = {
      ...notification,
      id: notificationId,
      isRead: false,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    };

    // Save notification to Firestore
    await notificationRef.set(notificationData);
    logger.info(`Created notification ${notificationId} for user ${notification.userId}`);

    // If token is provided, send push notification directly
    if (token) {
      try {
        await messaging.send({
          token,
          notification: {
            title: notification.title,
            body: notification.body,
            imageUrl: notification.imageUrl,
          },
          data: {
            notificationId,
            type: notification.type,
            relatedItemId: notification.relatedItemId || "",
            link: notification.link || "",
            clickAction: "FLUTTER_NOTIFICATION_CLICK", // Standard for mobile apps
          },
          webpush: {
            notification: {
              icon: "/dynasty.png",
              actions: [
                {
                  action: "view",
                  title: "View",
                },
              ],
            },
            fcmOptions: {
              link: notification.link || "/notifications",
            },
          },
        });
        logger.info(`Sent push notification ${notificationId} to token`);
      } catch (error) {
        logger.error("Failed to send push notification to token:", error);
        // Continue even if push fails, notification is still stored in Firestore
      }
      return notificationId;
    }

    // Otherwise, get all user's device tokens
    const devicesSnapshot = await db.collection("userDevices")
      .where("userId", "==", notification.userId)
      .get();

    if (devicesSnapshot.empty) {
      logger.info(`No devices found for user ${notification.userId}`);
      return notificationId; // Return early, notification is stored in Firestore
    }

    // Send to all user devices
    const sendPromises = devicesSnapshot.docs.map(async (doc) => {
      const device = doc.data() as UserDevice;
      try {
        await messaging.send({
          token: device.token,
          notification: {
            title: notification.title,
            body: notification.body,
            imageUrl: notification.imageUrl,
          },
          data: {
            notificationId,
            type: notification.type,
            relatedItemId: notification.relatedItemId || "",
            link: notification.link || "",
            clickAction: "FLUTTER_NOTIFICATION_CLICK", // Standard for mobile apps
          },
          webpush: {
            notification: {
              icon: "/dynasty.png",
              actions: [
                {
                  action: "view",
                  title: "View",
                },
              ],
            },
            fcmOptions: {
              link: notification.link || "/notifications",
            },
          },
        });
        logger.info(`Sent push notification ${notificationId} to device ${device.token.substring(0, 5)}...`);
        return true;
      } catch (error) {
        logger.error(`Failed to send push notification to device ${device.token.substring(0, 5)}...`, error);

        // Check if error is due to invalid token
        const errorMessage = error instanceof Error ? error.message : String(error);
        if (
          errorMessage.includes("not a valid FCM") ||
          errorMessage.includes("invalid-argument") ||
          errorMessage.includes("registration-token-not-registered")
        ) {
          // Delete invalid device token
          await doc.ref.delete();
          logger.info(`Deleted invalid device token ${device.token.substring(0, 5)}...`);
        }
        return false;
      }
    });

    await Promise.all(sendPromises);
    return notificationId;
  } catch (error) {
    logger.error("Error creating and sending notification:", error);
    throw error;
  }
};

// MARK: - Cloud Functions

/**
 * Register a device token for push notifications
 */
export const registerDeviceToken = onCall({
  region: DEFAULT_REGION,
  timeoutSeconds: FUNCTION_TIMEOUT.SHORT,
}, withErrorHandling(async (request) => {
  const {auth, data} = request;

  if (!auth) {
    throw createError(ErrorCode.UNAUTHENTICATED, "You must be logged in to register a device token");
  }

  const {token, platform, deleteDuplicates} = data;

  if (!token) {
    throw createError(ErrorCode.INVALID_ARGUMENT, "Device token is required");
  }

  const tokenSnapshot = await db.collection("userDevices")
    .where("token", "==", token)
    .limit(1)
    .get();

  if (!tokenSnapshot.empty) {
    await tokenSnapshot.docs[0].ref.update({
      lastActive: FieldValue.serverTimestamp(),
      userId: auth.uid,
      platform: platform || "web",
    });
    logger.info(`Updated existing device token for user ${auth.uid}`);
    if (deleteDuplicates) {
      const duplicatesSnapshot = await db.collection("userDevices")
        .where("userId", "==", auth.uid)
        .where("token", "!=", token)
        .get();
      if (!duplicatesSnapshot.empty) {
        const deletePromises = duplicatesSnapshot.docs.map((doc) => doc.ref.delete());
        await Promise.all(deletePromises);
        logger.info(`Deleted ${duplicatesSnapshot.size} duplicate tokens for user ${auth.uid}`);
      }
    }
    return {success: true, message: "Device token updated"};
  }

  const deviceRef = db.collection("userDevices").doc();
  await deviceRef.set({
    id: deviceRef.id,
    userId: auth.uid,
    token,
    platform: platform || "web",
    createdAt: FieldValue.serverTimestamp(),
    lastActive: FieldValue.serverTimestamp(),
  });
  logger.info(`Registered new device token for user ${auth.uid}`);
  if (deleteDuplicates) {
    const duplicatesSnapshot = await db.collection("userDevices")
      .where("userId", "==", auth.uid)
      .where("token", "!=", token)
      .get();
    if (!duplicatesSnapshot.empty) {
      const deletePromises = duplicatesSnapshot.docs.map((doc) => doc.ref.delete());
      await Promise.all(deletePromises);
      logger.info(`Deleted ${duplicatesSnapshot.size} duplicate tokens for user ${auth.uid}`);
    }
  }
  return {success: true, message: "Device token registered"};
}, "registerDeviceToken"));

/**
 * Send a notification to a specific user
 */
export const sendNotification = onCall({
  region: DEFAULT_REGION,
  timeoutSeconds: FUNCTION_TIMEOUT.SHORT,
}, withErrorHandling(async (request) => {
  const {auth, data} = request;

  if (!auth) {
    throw createError(ErrorCode.UNAUTHENTICATED, "You must be logged in to send a notification");
  }

  const {userId, title, body, type, relatedItemId, link, imageUrl} = data;
  if (!userId || !title || !body || !type) {
    throw createError(ErrorCode.INVALID_ARGUMENT, "userId, title, body, and type are required");
  }

  const notification: NotificationData = {
    userId,
    title,
    body,
    type,
    isRead: false,
    relatedItemId,
    link,
    imageUrl,
  };

  const notificationId = await createAndSendNotification(notification);
  return {
    success: true,
    notificationId,
  };
}, "sendNotification"));

/**
 * Mark a notification as read
 */
export const markNotificationRead = onCall({
  region: DEFAULT_REGION,
  timeoutSeconds: FUNCTION_TIMEOUT.SHORT,
}, withErrorHandling(async (request) => {
  const {auth, data} = request;

  if (!auth) {
    throw createError(ErrorCode.UNAUTHENTICATED, "You must be logged in to update notifications");
  }

  const {notificationId} = data;
  if (!notificationId) {
    throw createError(ErrorCode.INVALID_ARGUMENT, "Notification ID is required");
  }

  const notificationRef = db.collection("notifications").doc(notificationId);
  const notificationDoc = await notificationRef.get();
  if (!notificationDoc.exists) {
    throw createError(ErrorCode.NOT_FOUND, "Notification not found");
  }

  const notificationData = notificationDoc.data();
  if (notificationData?.userId !== auth.uid) {
    throw createError(ErrorCode.PERMISSION_DENIED, "You don't have permission to update this notification");
  }

  await notificationRef.update({
    isRead: true,
    updatedAt: FieldValue.serverTimestamp(),
  });
  return {success: true, message: "Notification marked as read"};
}, "markNotificationRead"));

/**
 * Mark all notifications as read for a user
 */
export const markAllNotificationsRead = onCall({
  region: DEFAULT_REGION,
  timeoutSeconds: FUNCTION_TIMEOUT.MEDIUM,
}, withErrorHandling(async (request) => {
  const {auth} = request;

  if (!auth) {
    throw createError(ErrorCode.UNAUTHENTICATED, "You must be logged in to update notifications");
  }

  const notificationsSnapshot = await db.collection("notifications")
    .where("userId", "==", auth.uid)
    .where("isRead", "==", false)
    .get();
  if (notificationsSnapshot.empty) {
    return {success: true, message: "No unread notifications found"};
  }

  const batch = db.batch();
  notificationsSnapshot.docs.forEach((doc) => {
    batch.update(doc.ref, {
      isRead: true,
      updatedAt: FieldValue.serverTimestamp(),
    });
  });
  await batch.commit();
  return {
    success: true,
    message: `Marked ${notificationsSnapshot.size} notifications as read`,
  };
}, "markAllNotificationsRead"));

/**
 * Get notifications for a user
 */
export const getUserNotifications = onCall({
  region: DEFAULT_REGION,
  timeoutSeconds: FUNCTION_TIMEOUT.SHORT,
}, withErrorHandling(async (request) => {
  const {auth, data} = request;

  if (!auth) {
    throw createError(ErrorCode.UNAUTHENTICATED, "You must be logged in to get notifications");
  }

  const {limit = 20, offset = 0, includeRead = true} = data || {};
  let query = db.collection("notifications")
    .where("userId", "==", auth.uid)
    .orderBy("createdAt", "desc");
  if (!includeRead) {
    query = query.where("isRead", "==", false);
  }
  query = query.limit(limit).offset(offset);
  const notificationsSnapshot = await query.get();
  const unreadCountSnapshot = await db.collection("notifications")
    .where("userId", "==", auth.uid)
    .where("isRead", "==", false)
    .count()
    .get();
  const unreadCount = unreadCountSnapshot.data().count;
  const notifications = notificationsSnapshot.docs.map((doc) => {
    const docData = doc.data();
    return {
      ...docData,
      createdAt: docData.createdAt ? docData.createdAt.toDate().toISOString() : null,
      updatedAt: docData.updatedAt ? docData.updatedAt.toDate().toISOString() : null,
    };
  });
  return {
    success: true,
    notifications,
    unreadCount,
  };
}, "getUserNotifications"));

/**
 * Delete a notification
 */
export const deleteNotification = onCall({
  region: DEFAULT_REGION,
  timeoutSeconds: FUNCTION_TIMEOUT.SHORT,
}, withErrorHandling(async (request) => {
  const {auth, data} = request;

  if (!auth) {
    throw createError(ErrorCode.UNAUTHENTICATED, "You must be logged in to delete notifications");
  }

  const {notificationId} = data;
  if (!notificationId) {
    throw createError(ErrorCode.INVALID_ARGUMENT, "Notification ID is required");
  }

  const notificationRef = db.collection("notifications").doc(notificationId);
  const notificationDoc = await notificationRef.get();
  if (!notificationDoc.exists) {
    throw createError(ErrorCode.NOT_FOUND, "Notification not found");
  }

  const notificationData = notificationDoc.data();
  if (notificationData?.userId !== auth.uid) {
    throw createError(ErrorCode.PERMISSION_DENIED, "You don't have permission to delete this notification");
  }

  await notificationRef.delete();
  return {success: true, message: "Notification deleted"};
}, "deleteNotification"));

/**
 * Send a test notification
 */
export const sendTestNotification = onCall({
  region: DEFAULT_REGION,
  timeoutSeconds: FUNCTION_TIMEOUT.SHORT,
}, withErrorHandling(async (request) => {
  const {auth} = request;

  if (!auth) {
    throw createError(ErrorCode.UNAUTHENTICATED, "You must be logged in to test notifications");
  }

  const notification: NotificationData = {
    userId: auth.uid,
    title: "Test Notification",
    body: "This is a test notification. If you can see this, push notifications are working!",
    type: "system:announcement",
    isRead: false,
    link: "/notifications",
  };

  const notificationId = await createAndSendNotification(notification);
  return {
    success: true,
    message: "Test notification sent",
    notificationId,
  };
}, "sendTestNotification"));

/**
 * Cleanup duplicate device tokens - keeps only the most recent token per user
 * This function is callable manually when needed
 */
export const cleanupDuplicateTokens = onCall({
  region: DEFAULT_REGION,
  timeoutSeconds: FUNCTION_TIMEOUT.MEDIUM,
}, withErrorHandling(async (request) => {
  const {auth} = request;

  if (!auth) {
    throw createError(ErrorCode.UNAUTHENTICATED, "You must be logged in to run this function");
  }

  logger.info("Starting duplicate token cleanup");
  const usersWithDevices = await db.collection("userDevices")
    .select("userId")
    .get();
  const userIds = new Set<string>();
  usersWithDevices.docs.forEach((doc) => {
    const deviceData = doc.data();
    if (deviceData.userId) {
      userIds.add(deviceData.userId);
    }
  });
  logger.info(`Found ${userIds.size} users with registered devices`);
  let tokensDeleted = 0;
  let usersProcessed = 0;
  for (const userId of userIds) {
    const userDevices = await db.collection("userDevices")
      .where("userId", "==", userId)
      .orderBy("lastActive", "desc")
      .get();
    if (userDevices.size > 1) {
      const devicesToDelete = userDevices.docs.slice(1);
      const deletePromises = devicesToDelete.map((doc) => doc.ref.delete());
      await Promise.all(deletePromises);
      tokensDeleted += devicesToDelete.length;
      logger.info(`Deleted ${devicesToDelete.length} duplicate tokens for user ${userId}`);
    }
    usersProcessed++;
  }
  logger.info(`Duplicate token cleanup complete. Processed ${usersProcessed} users and deleted ${tokensDeleted} duplicate tokens.`);
  return {
    success: true,
    message: `Cleanup complete. Deleted ${tokensDeleted} duplicate tokens across ${usersProcessed} users.`,
  };
}, "cleanupDuplicateTokens"));

/**
 * Scheduled function to validate FCM tokens and remove invalid ones
 * Runs once daily to ensure tokens are valid
 */
export const validateTokensScheduled = onSchedule({
  schedule: "every 24 hours",
  region: DEFAULT_REGION,
  timeoutSeconds: FUNCTION_TIMEOUT.MEDIUM,
}, async () => {
  try {
    logger.info("Starting scheduled token validation");

    // Get all device tokens
    const tokensSnapshot = await db.collection("userDevices")
      .get();

    if (tokensSnapshot.empty) {
      logger.info("No device tokens found to validate");
      return;
    }

    logger.info(`Found ${tokensSnapshot.size} tokens to validate`);

    let invalidTokensRemoved = 0;
    let tokensValidated = 0;

    // Process in batches of 100 to avoid hitting limits
    const batchSize = 100;
    const batches = [];

    for (let i = 0; i < tokensSnapshot.size; i += batchSize) {
      batches.push(tokensSnapshot.docs.slice(i, i + batchSize));
    }

    for (const batch of batches) {
      const validationPromises = batch.map(async (doc) => {
        const device = doc.data() as UserDevice;
        tokensValidated++;

        try {
          // Test sending a silent message to validate the token
          await messaging.send({
            token: device.token,
            data: {
              validate: "true",
            },
            // This is a "silent" notification that doesn't show to users
            android: {
              priority: "normal",
              ttl: 0,
            },
            apns: {
              headers: {
                "apns-priority": "5",
                "apns-expiration": "0",
              },
              payload: {
                aps: {
                  contentAvailable: true,
                },
              },
            },
            webpush: {
              headers: {
                TTL: "0",
              },
            },
          });

          // Token is valid - update lastValidated
          await doc.ref.update({
            lastValidated: FieldValue.serverTimestamp(),
          });

          return {valid: true, docId: doc.id};
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error);

          // Check if error is due to invalid token
          if (
            errorMessage.includes("not a valid FCM") ||
            errorMessage.includes("invalid-argument") ||
            errorMessage.includes("registration-token-not-registered")
          ) {
            // Delete invalid token
            await doc.ref.delete();
            invalidTokensRemoved++;
            logger.info(`Deleted invalid device token ${device.token.substring(0, 5)}... for user ${device.userId}`);
            return {valid: false, docId: doc.id, reason: "invalid_token"};
          }

          // For other errors, log but don't delete
          logger.warn(`Error validating token ${device.token.substring(0, 5)}...`, error);
          return {valid: false, docId: doc.id, reason: "validation_error"};
        }
      });

      await Promise.all(validationPromises);
    }

    logger.info(`Token validation complete. Validated ${tokensValidated} tokens and removed ${invalidTokensRemoved} invalid tokens.`);
  } catch (error) {
    logger.error("Error in scheduled token validation:", error);
  }
});

// MARK: - Event Triggers

/**
 * Create notification when a story is liked
 */
export const onStoryLiked = onDocumentCreated({
  document: "storyLikes/{likeId}",
  region: DEFAULT_REGION,
}, async (event) => {
  try {
    const snapshot = event.data;
    if (!snapshot) {
      logger.error("No data associated with the event");
      return;
    }

    const likeData = snapshot.data();
    const storyId = likeData.storyId;
    const userId = likeData.userId;

    // Get the story to find the author
    const storyDoc = await db.collection("stories").doc(storyId).get();
    if (!storyDoc.exists) {
      logger.error(`Story ${storyId} not found for like notification`);
      return;
    }

    const storyData = storyDoc.data();
    const authorId = storyData?.authorID;

    // Don't notify if user likes their own story
    if (authorId === userId) {
      return;
    }

    // Get user info for the notification
    const userDoc = await db.collection("users").doc(userId).get();
    if (!userDoc.exists) {
      logger.error(`User ${userId} not found for like notification`);
      return;
    }

    const userData = userDoc.data();
    const userName = userData?.displayName || userData?.firstName || "Someone";

    // Create notification
    const notification: NotificationData = {
      userId: authorId,
      title: "New like on your story",
      body: `${userName} liked your story "${storyData?.title || "Untitled"}"`,
      type: "story:liked",
      relatedItemId: storyId,
      link: `/story/${storyId}`,
      isRead: false,
    };

    await createAndSendNotification(notification);
  } catch (error) {
    logger.error("Error creating like notification:", error);
  }
});

/**
 * Create notification when a comment is added to a story
 */
export const onCommentAdded = onDocumentCreated({
  document: "comments/{commentId}",
  region: DEFAULT_REGION,
}, async (event) => {
  try {
    const snapshot = event.data;
    if (!snapshot) {
      logger.error("No data associated with the event");
      return;
    }

    const commentData = snapshot.data();
    const storyId = commentData.storyId;
    const userId = commentData.userId;
    const parentId = commentData.parentId;

    // If it's a reply to another comment, notify the parent comment author
    if (parentId) {
      const parentCommentDoc = await db.collection("comments").doc(parentId).get();
      if (parentCommentDoc.exists) {
        const parentComment = parentCommentDoc.data();
        const parentAuthorId = parentComment?.userId;

        // Don't notify if user replies to their own comment
        if (parentAuthorId === userId) {
          return;
        }

        // Get user info
        const userDoc = await db.collection("users").doc(userId).get();
        if (!userDoc.exists) {
          logger.error(`User ${userId} not found for comment notification`);
          return;
        }

        const userData = userDoc.data();
        const userName = userData?.displayName || userData?.firstName || "Someone";

        // Create notification for reply
        const notification: NotificationData = {
          userId: parentAuthorId,
          title: "New reply to your comment",
          body: `${userName} replied to your comment`,
          type: "comment:reply",
          relatedItemId: storyId,
          link: `/story/${storyId}?comment=${commentData.id}`,
          isRead: false,
        };

        await createAndSendNotification(notification);
      }
    } else {
      // It's a comment on a story, notify the story author
      const storyDoc = await db.collection("stories").doc(storyId).get();
      if (!storyDoc.exists) {
        logger.error(`Story ${storyId} not found for comment notification`);
        return;
      }

      const storyData = storyDoc.data();
      const authorId = storyData?.authorID;

      // Don't notify if user comments on their own story
      if (authorId === userId) {
        return;
      }

      // Get user info
      const userDoc = await db.collection("users").doc(userId).get();
      if (!userDoc.exists) {
        logger.error(`User ${userId} not found for comment notification`);
        return;
      }

      const userData = userDoc.data();
      const userName = userData?.displayName || userData?.firstName || "Someone";

      // Create notification for comment
      const notification: NotificationData = {
        userId: authorId,
        title: "New comment on your story",
        body: `${userName} commented on your story "${storyData?.title || "Untitled"}"`,
        type: "comment:new",
        relatedItemId: storyId,
        link: `/story/${storyId}?comment=${commentData.id}`,
        isRead: false,
      };

      await createAndSendNotification(notification);
    }
  } catch (error) {
    logger.error("Error creating comment notification:", error);
  }
});

/**
 * Create notification when an event invitation is sent
 */
export const onEventInvitationCreated = onDocumentCreated({
  document: "eventInvitations/{invitationId}",
  region: DEFAULT_REGION,
}, async (event) => {
  try {
    const snapshot = event.data;
    if (!snapshot) {
      logger.error("No data associated with the event");
      return;
    }

    const invitationData = snapshot.data();
    const eventId = invitationData.eventId;
    const memberId = invitationData.memberId;

    // Get event details
    const eventDoc = await db.collection("events").doc(eventId).get();
    if (!eventDoc.exists) {
      logger.error(`Event ${eventId} not found for invitation notification`);
      return;
    }

    const eventData = eventDoc.data();
    const hostId = eventData?.hostId;

    // Get host info for the notification
    const hostDoc = await db.collection("users").doc(hostId).get();
    if (!hostDoc.exists) {
      logger.error(`Host ${hostId} not found for invitation notification`);
      return;
    }

    const hostData = hostDoc.data();
    const hostName = hostData?.displayName || hostData?.firstName || "Someone";

    // Create notification
    const notification: NotificationData = {
      userId: memberId,
      title: "New Event Invitation",
      body: `${hostName} invited you to "${eventData?.title || "an event"}"`,
      type: "event:invitation",
      relatedItemId: eventId,
      link: `/events/${eventId}`,
      isRead: false,
    };

    await createAndSendNotification(notification);
  } catch (error) {
    logger.error("Error creating event invitation notification:", error);
  }
});

/**
 * Create notifications for event reminders
 */
export const sendEventReminders = onSchedule({
  schedule: "every 1 hours",
  region: DEFAULT_REGION,
  timeoutSeconds: FUNCTION_TIMEOUT.MEDIUM,
}, async () => {
  try {
    // Get current date/time
    const now = new Date();
    const oneDayFromNow = new Date(now);
    oneDayFromNow.setHours(now.getHours() + 24);

    // Find events happening in the next 24 hours
    const eventsSnapshot = await db.collection("events")
      .where("eventDate", ">=", now.toISOString().split("T")[0])
      .where("eventDate", "<=", oneDayFromNow.toISOString().split("T")[0])
      .get();

    if (eventsSnapshot.empty) {
      logger.info("No upcoming events found for reminders");
      return;
    }

    for (const eventDoc of eventsSnapshot.docs) {
      const eventData = eventDoc.data();
      const eventId = eventDoc.id;
      const eventDate = new Date(eventData.eventDate);

      // Calculate hours until event
      const hoursUntilEvent = Math.floor((eventDate.getTime() - now.getTime()) / (1000 * 60 * 60));

      // Only send reminders at 24h, 3h, and 1h before event
      if (hoursUntilEvent !== 24 && hoursUntilEvent !== 3 && hoursUntilEvent !== 1) {
        continue;
      }

      // Get all accepted invitations for this event
      const invitationsSnapshot = await db.collection("eventInvitations")
        .where("eventId", "==", eventId)
        .where("rsvpStatus", "==", "yes")
        .get();

      if (invitationsSnapshot.empty) {
        continue;
      }

      // Send reminder to each attendee
      for (const invitationDoc of invitationsSnapshot.docs) {
        const invitation = invitationDoc.data();
        const userId = invitation.memberId;

        // Create notification
        const notification: NotificationData = {
          userId,
          title: "Event Reminder",
          body: hoursUntilEvent === 1 ?
            `${eventData.title} starts in 1 hour` :
            `${eventData.title} starts in ${hoursUntilEvent} hours`,
          type: "event:reminder",
          relatedItemId: eventId,
          link: `/events/${eventId}`,
          isRead: false,
        };

        await createAndSendNotification(notification);
      }

      logger.info(`Sent ${invitationsSnapshot.size} reminders for event ${eventId}`);
    }
  } catch (error) {
    logger.error("Error sending event reminders:", error);
  }
});
