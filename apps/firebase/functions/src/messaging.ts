import {onCall} from "firebase-functions/v2/https";
import * as admin from "firebase-admin";
import {withAuth} from "./middleware/auth";
import {createError, ErrorCode, handleError} from "./utils/errors";

// Initialize if not already done
if (!admin.apps.length) {
  admin.initializeApp();
}

const db = admin.firestore();
const messaging = admin.messaging();

interface MessageData {
  text?: string;
  mediaUrls?: string[];
  type: "text" | "media" | "voice" | "file";
  encryptedContent?: Record<string, string>; // For E2EE messages
  metadata?: any;
}

/**
 * Send a message to a chat
 * Supports both encrypted and non-encrypted messages
 */
export const sendMessage = onCall(withAuth(async (request) => {
  try {
    const {chatId, message} = request.data;
    const senderId = request.auth!.uid;

    if (!chatId || !message) {
      throw createError(ErrorCode.INVALID_ARGUMENT, "Chat ID and message are required");
    }

    // Validate message structure
    const {text, mediaUrls, type = "text", encryptedContent, metadata} = message as MessageData;

    if (!type || !["text", "media", "voice", "file"].includes(type)) {
      throw createError(ErrorCode.INVALID_ARGUMENT, "Invalid message type");
    }

    // Get chat details
    const chatDoc = await db.collection("chats").doc(chatId).get();
    if (!chatDoc.exists) {
      throw createError(ErrorCode.NOT_FOUND, "Chat not found");
    }

    const chat = chatDoc.data()!;

    // Verify sender is participant
    if (!chat.participants.includes(senderId)) {
      throw createError(ErrorCode.PERMISSION_DENIED, "You are not a participant in this chat");
    }

    // Get sender details
    const senderDoc = await db.collection("users").doc(senderId).get();
    const senderData = senderDoc.data()!;

    // Build message data
    const messageData: any = {
      senderId,
      senderName: senderData.name || "Unknown",
      type,
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
      delivered: [],
      read: [],
      metadata: metadata || {},
    };

    // Handle different message types
    if (chat.encryptionEnabled && encryptedContent) {
      // Encrypted message
      messageData.isEncrypted = true;
      messageData.encryptedContent = encryptedContent;
      // Store a placeholder for notification
      messageData.notificationText = type === "text" ? "Encrypted message" : `Encrypted ${type}`;
    } else {
      // Regular message
      messageData.isEncrypted = false;
      if (text) messageData.text = text;
      if (mediaUrls && mediaUrls.length > 0) messageData.mediaUrls = mediaUrls;
    }

    // Add message to chat
    const messageRef = await db
      .collection("chats")
      .doc(chatId)
      .collection("messages")
      .add(messageData);

    // Update chat metadata
    await db.collection("chats").doc(chatId).update({
      lastMessage: messageData,
      lastMessageAt: admin.firestore.FieldValue.serverTimestamp(),
      messageCount: admin.firestore.FieldValue.increment(1),
    });

    // Update last read for sender
    await db
      .collection("users")
      .doc(senderId)
      .collection("chats")
      .doc(chatId)
      .update({
        lastRead: admin.firestore.FieldValue.serverTimestamp(),
      });

    // TODO: Trigger push notifications for other participants
    // This should be done via a Firestore trigger or separate notification service

    return {
      success: true,
      messageId: messageRef.id,
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
    };
  } catch (error) {
    return handleError(error, "sendMessage");
  }
}, "sendMessage"));

/**
 * Send push notification for a new message
 */
export const sendMessageNotification = onCall(withAuth(async (request) => {
  try {
    const {chatId, messageId} = request.data;
    const senderId = request.auth!.uid;

    if (!chatId || !messageId) {
      throw createError(ErrorCode.INVALID_ARGUMENT, "Chat ID and message ID are required");
    }

    // Get chat details
    const chatDoc = await db.collection("chats").doc(chatId).get();
    if (!chatDoc.exists) {
      throw createError(ErrorCode.NOT_FOUND, "Chat not found");
    }

    const chat = chatDoc.data()!;

    // Verify sender is participant
    if (!chat.participants.includes(senderId)) {
      throw createError(ErrorCode.PERMISSION_DENIED, "You are not a participant in this chat");
    }

    // Get message details
    const messageDoc = await db
      .collection("chats")
      .doc(chatId)
      .collection("messages")
      .doc(messageId)
      .get();

    if (!messageDoc.exists) {
      throw createError(ErrorCode.NOT_FOUND, "Message not found");
    }

    const message = messageDoc.data()!;

    // Get sender details
    const senderDoc = await db.collection("users").doc(senderId).get();
    const senderName = senderDoc.data()?.displayName || "Someone";

    // Get recipients (all participants except sender)
    const recipients = chat.participants.filter((p: string) => p !== senderId);

    // Get FCM tokens for all recipients
    const tokenPromises = recipients.map(async (userId: string) => {
      const userDoc = await db.collection("users").doc(userId).get();
      return {
        userId,
        tokens: userDoc.data()?.fcmTokens || [],
        settings: userDoc.data()?.notificationSettings || {},
      };
    });

    const recipientData = await Promise.all(tokenPromises);

    // Prepare notification payload
    const notificationPayload: admin.messaging.MulticastMessage = {
      data: {
        type: "message",
        chatId,
        messageId,
        senderId,
        senderName,
        messageType: message.type,
        timestamp: Date.now().toString(),
      },
      notification: {
        title: senderName,
        body: getNotificationBody(message.type),
      },
      android: {
        priority: "high",
        notification: {
          channelId: "dynasty_messages",
          icon: "ic_notification",
          color: "#4CAF50",
        },
      },
      apns: {
        payload: {
          aps: {
            alert: {
              title: senderName,
              body: getNotificationBody(message.type),
            },
            badge: 1,
            sound: "default",
            threadId: chatId,
            category: "MESSAGE",
          },
        },
      },
      tokens: [],
    };

    // Collect all tokens
    const allTokens: string[] = [];

    for (const recipient of recipientData) {
      // Check if user has notifications enabled
      if (recipient.settings.enabled !== false) {
        allTokens.push(...recipient.tokens);
      }
    }

    if (allTokens.length === 0) {
      console.log("No FCM tokens found for recipients");
      return {success: true, sent: 0};
    }

    // Remove duplicates
    const uniqueTokens = [...new Set(allTokens)];
    notificationPayload.tokens = uniqueTokens;

    // Send notifications
    const response = await messaging.sendMulticast(notificationPayload);

    // Handle failed tokens
    if (response.failureCount > 0) {
      const failedTokens: string[] = [];
      response.responses.forEach((resp, idx) => {
        if (!resp.success && resp.error) {
          console.error("FCM send error:", resp.error);
          failedTokens.push(uniqueTokens[idx]);
        }
      });

      // Remove invalid tokens
      if (failedTokens.length > 0) {
        await removeInvalidTokens(failedTokens);
      }
    }

    return {
      success: true,
      sent: response.successCount,
      failed: response.failureCount,
    };
  } catch (error) {
    return handleError(error, "sendMessageNotification");
  }
}, "sendMessageNotification"));

/**
 * Handle notification settings update
 */
export const updateNotificationSettings = onCall(withAuth(async (request) => {
  try {
    const {settings} = request.data;
    const userId = request.auth!.uid;

    if (!settings || typeof settings !== "object") {
      throw createError(ErrorCode.INVALID_ARGUMENT, "Invalid settings object");
    }

    // Update user's notification settings
    await db.collection("users").doc(userId).update({
      notificationSettings: settings,
      notificationSettingsUpdatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    return {success: true};
  } catch (error) {
    return handleError(error, "updateNotificationSettings");
  }
}, "updateNotificationSettings"));

/**
 * Register FCM token
 */
export const registerFCMToken = onCall(withAuth(async (request) => {
  try {
    const {token} = request.data;
    const userId = request.auth!.uid;

    if (!token || typeof token !== "string") {
      throw createError(ErrorCode.INVALID_ARGUMENT, "Invalid FCM token");
    }

    // Add token to user's token array
    await db.collection("users").doc(userId).update({
      fcmTokens: admin.firestore.FieldValue.arrayUnion(token),
      lastTokenUpdate: admin.firestore.FieldValue.serverTimestamp(),
    });

    return {success: true};
  } catch (error) {
    return handleError(error, "registerFCMToken");
  }
}, "registerFCMToken"));

/**
 * Remove FCM token
 */
export const removeFCMToken = onCall(withAuth(async (request) => {
  try {
    const {token} = request.data;
    const userId = request.auth!.uid;

    if (!token || typeof token !== "string") {
      throw createError(ErrorCode.INVALID_ARGUMENT, "Invalid FCM token");
    }

    // Remove token from user's token array
    await db.collection("users").doc(userId).update({
      fcmTokens: admin.firestore.FieldValue.arrayRemove(token),
      lastTokenUpdate: admin.firestore.FieldValue.serverTimestamp(),
    });

    return {success: true};
  } catch (error) {
    return handleError(error, "removeFCMToken");
  }
}, "removeFCMToken"));

/**
 * Send typing indicator notification
 */
export const sendTypingNotification = onCall(withAuth(async (request) => {
  try {
    const {chatId, isTyping} = request.data;
    const userId = request.auth!.uid;

    if (!chatId || typeof isTyping !== "boolean") {
      throw createError(ErrorCode.INVALID_ARGUMENT, "Invalid parameters");
    }

    // Get chat details
    const chatDoc = await db.collection("chats").doc(chatId).get();
    if (!chatDoc.exists) {
      throw createError(ErrorCode.NOT_FOUND, "Chat not found");
    }

    const chat = chatDoc.data()!;

    // Verify user is participant
    if (!chat.participants.includes(userId)) {
      throw createError(ErrorCode.PERMISSION_DENIED, "You are not a participant in this chat");
    }

    // Update typing status in Firestore
    const typingRef = db.collection("chats").doc(chatId).collection("typing").doc(userId);

    if (isTyping) {
      await typingRef.set({
        userId,
        timestamp: admin.firestore.FieldValue.serverTimestamp(),
      });
    } else {
      await typingRef.delete();
    }

    return {success: true};
  } catch (error) {
    return handleError(error, "sendTypingNotification");
  }
}, "sendTypingNotification"));

// Helper functions

function getNotificationBody(messageType: string): string {
  switch (messageType) {
  case "text":
    return "Sent you a message";
  case "voice":
    return "🎤 Sent a voice message";
  case "media":
    return "📷 Sent a photo";
  case "file":
    return "📎 Sent a file";
  default:
    return "Sent you a message";
  }
}

async function removeInvalidTokens(tokens: string[]) {
  try {
    // Find all users with these tokens
    const usersSnapshot = await db
      .collection("users")
      .where("fcmTokens", "array-contains-any", tokens)
      .get();

    const updatePromises = usersSnapshot.docs.map(async (doc) => {
      const userTokens = doc.data().fcmTokens || [];
      const validTokens = userTokens.filter((t: string) => !tokens.includes(t));

      return doc.ref.update({
        fcmTokens: validTokens,
        lastTokenUpdate: admin.firestore.FieldValue.serverTimestamp(),
      });
    });

    await Promise.all(updatePromises);
    console.log(`Removed ${tokens.length} invalid FCM tokens`);
  } catch (error) {
    console.error("Failed to remove invalid tokens:", error);
  }
}
