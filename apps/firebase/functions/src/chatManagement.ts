import {onCall} from "firebase-functions/v2/https";
import * as admin from "firebase-admin";
import {withAuth, withResourceAccess, PermissionLevel, RateLimitType} from "./middleware/auth";
import {createError, ErrorCode, handleError} from "./utils/errors";
import {validateRequest} from "./utils/request-validator";
import {VALIDATION_SCHEMAS} from "./config/validation-schemas";

// Initialize if not already done
if (!admin.apps.length) {
  admin.initializeApp();
}

const db = admin.firestore();

/**
 * Create a new chat
 */
export const createChat = onCall(withAuth(async (request) => {
  try {
    const creatorId = request.auth!.uid;

    // Validate and sanitize input using centralized validator
    const validatedData = validateRequest(
      request.data,
      VALIDATION_SCHEMAS.createChat,
      creatorId
    );

    const {participantIds, isGroup, groupName, encryptionEnabled = false} = validatedData;

    // Add creator to participants if not included
    const allParticipants = [...new Set([creatorId, ...participantIds])];

    // Validate participant count
    if (allParticipants.length < 2) {
      throw createError(ErrorCode.INVALID_ARGUMENT, "Chat must have at least 2 participants");
    }

    if (isGroup && allParticipants.length < 3) {
      throw createError(ErrorCode.INVALID_ARGUMENT, "Group chat must have at least 3 participants");
    }

    // Verify all participants exist and check encryption status
    const userPromises = allParticipants.map(async (userId) => {
      const userDoc = await db.collection("users").doc(userId).get();
      if (!userDoc.exists) {
        throw createError(ErrorCode.NOT_FOUND, `User ${userId} not found`);
      }
      return {
        userId,
        hasEncryption: !!(userDoc.data()?.publicKey),
        userData: userDoc.data(),
      };
    });

    const userResults = await Promise.all(userPromises);

    // Check if all participants have encryption keys if encryption is requested
    if (encryptionEnabled) {
      const missingEncryption = userResults.filter((u) => !u.hasEncryption);
      if (missingEncryption.length > 0) {
        throw createError(
          ErrorCode.FAILED_PRECONDITION,
          `Encryption not enabled for users: ${missingEncryption.map((u) => u.userId).join(", ")}`
        );
      }
    }

    // For direct chats, check if chat already exists
    if (!isGroup && allParticipants.length === 2) {
      const sortedParticipants = allParticipants.sort();
      const chatId = `chat_${sortedParticipants.join("_")}`;

      const existingChat = await db.collection("chats").doc(chatId).get();
      if (existingChat.exists) {
        return {
          success: true,
          chatId,
          isExisting: true,
        };
      }
    }

    // Create new chat
    const chatData: any = {
      type: isGroup ? "group" : "direct",
      participants: allParticipants,
      createdBy: creatorId,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      lastMessageAt: admin.firestore.FieldValue.serverTimestamp(),
      encryptionEnabled: encryptionEnabled,
      memberCount: allParticipants.length,
      messageCount: 0,
    };

    if (isGroup && groupName) {
      // Group name is already sanitized by the validator
      chatData.name = groupName;
    }

    // Generate chat ID
    let chatId: string;
    if (!isGroup && allParticipants.length === 2) {
      const sortedParticipants = allParticipants.sort();
      chatId = `chat_${sortedParticipants.join("_")}`;
    } else {
      chatId = `group_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    // Create chat document
    await db.collection("chats").doc(chatId).set(chatData);

    // Create member documents for easy querying
    const memberPromises = allParticipants.map(async (userId) => {
      await db.collection("chats").doc(chatId).collection("members").doc(userId).set({
        userId,
        joinedAt: admin.firestore.FieldValue.serverTimestamp(),
        role: userId === creatorId ? "admin" : "member",
        notifications: true,
      });
    });

    await Promise.all(memberPromises);

    // Create chat references for each participant (for faster querying)
    const chatRefPromises = allParticipants.map(async (participantId) => {
      await db.collection("users").doc(participantId).collection("chats").doc(chatId).set({
        chatId,
        joinedAt: admin.firestore.FieldValue.serverTimestamp(),
        lastRead: admin.firestore.FieldValue.serverTimestamp(),
        muted: false,
        archived: false,
      });
    });

    await Promise.all(chatRefPromises);

    return {
      success: true,
      chatId,
      isExisting: false,
      encryptionEnabled,
    };
  } catch (error) {
    return handleError(error, "createChat");
  }
}, "createChat", {
  authLevel: "onboarded",
  rateLimitConfig: {
    type: RateLimitType.WRITE,
    maxRequests: 10,
    windowSeconds: 60,
  },
}));

/**
 * Update chat settings
 */
export const updateChatSettings = onCall(withResourceAccess(async (request, resource) => {
  try {
    const userId = request.auth!.uid;

    // Validate and sanitize input using centralized validator
    const validatedData = validateRequest(
      request.data,
      VALIDATION_SCHEMAS.updateChatSettings,
      userId
    );

    const {chatId, settings} = validatedData;

    const chat = resource;

    // Check if user is admin for group chats
    if (chat.type === "group") {
      const memberDoc = await db.collection("chats").doc(chatId).collection("members").doc(userId).get();
      if (!memberDoc.exists || memberDoc.data()?.role !== "admin") {
        throw createError(ErrorCode.PERMISSION_DENIED, "Only admins can update chat settings");
      }
    }

    // Allowed settings to update
    const allowedSettings = ["name", "description", "avatar"];
    const updateData: any = {};

    for (const key of allowedSettings) {
      if (key in settings) {
        updateData[key] = settings[key];
      }
    }

    if (Object.keys(updateData).length === 0) {
      throw createError(ErrorCode.INVALID_ARGUMENT, "No valid settings to update");
    }

    // Update chat
    await db.collection("chats").doc(chatId).update({
      ...updateData,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedBy: userId,
    });

    return {success: true};
  } catch (error) {
    return handleError(error, "updateChatSettings");
  }
}, "updateChatSettings", {
  resourceConfig: {
    resourceType: "chat",
    requiredLevel: PermissionLevel.ADMIN,
  },
  rateLimitConfig: {
    type: RateLimitType.WRITE,
    maxRequests: 10,
    windowSeconds: 60,
  },
}));

/**
 * Add members to group chat
 */
export const addChatMembers = onCall(withResourceAccess(async (request, resource) => {
  try {
    const userId = request.auth!.uid;

    // Validate and sanitize input using centralized validator
    const validatedData = validateRequest(
      request.data,
      VALIDATION_SCHEMAS.addChatMembers,
      userId
    );

    const {chatId, memberIds} = validatedData;

    const chat = resource;

    // Only group chats can add members
    if (chat.type !== "group") {
      throw createError(ErrorCode.INVALID_ARGUMENT, "Can only add members to group chats");
    }

    // Check if user is admin
    const memberDoc = await db.collection("chats").doc(chatId).collection("members").doc(userId).get();
    if (!memberDoc.exists || memberDoc.data()?.role !== "admin") {
      throw createError(ErrorCode.PERMISSION_DENIED, "Only admins can add members");
    }

    // Verify new members exist and aren't already in chat
    const newMembers: string[] = [];

    for (const memberId of memberIds) {
      // Check if user exists
      const userDoc = await db.collection("users").doc(memberId).get();
      if (!userDoc.exists) {
        throw createError(ErrorCode.NOT_FOUND, `User ${memberId} not found`);
      }

      // Check if already a member
      const existingMember = await db.collection("chats").doc(chatId).collection("members").doc(memberId).get();
      if (!existingMember.exists) {
        newMembers.push(memberId);
      }
    }

    if (newMembers.length === 0) {
      return {
        success: true,
        message: "All users are already members",
      };
    }

    // Add new members
    const batch = db.batch();

    // Update participants array
    batch.update(db.collection("chats").doc(chatId), {
      participants: admin.firestore.FieldValue.arrayUnion(...newMembers),
      memberCount: admin.firestore.FieldValue.increment(newMembers.length),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    // Create member documents
    for (const memberId of newMembers) {
      const memberRef = db.collection("chats").doc(chatId).collection("members").doc(memberId);
      batch.set(memberRef, {
        userId: memberId,
        joinedAt: admin.firestore.FieldValue.serverTimestamp(),
        role: "member",
        notifications: true,
        addedBy: userId,
      });
    }

    await batch.commit();

    // Send system message about new members
    await sendSystemMessage(chatId, `${newMembers.length} new member(s) added to the group`);

    return {
      success: true,
      addedCount: newMembers.length,
    };
  } catch (error) {
    return handleError(error, "addChatMembers");
  }
}, "addChatMembers", {
  resourceConfig: {
    resourceType: "chat",
    requiredLevel: PermissionLevel.ADMIN,
  },
  rateLimitConfig: {
    type: RateLimitType.WRITE,
    maxRequests: 10,
    windowSeconds: 60,
  },
}));

/**
 * Remove member from group chat
 */
export const removeChatMember = onCall(withResourceAccess(async (request, resource) => {
  try {
    const userId = request.auth!.uid;

    // Validate and sanitize input using centralized validator
    const validatedData = validateRequest(
      request.data,
      VALIDATION_SCHEMAS.removeChatMember,
      userId
    );

    const {chatId, memberId} = validatedData;

    const chat = resource;

    // Only group chats can remove members
    if (chat.type !== "group") {
      throw createError(ErrorCode.INVALID_ARGUMENT, "Can only remove members from group chats");
    }

    // Check permissions
    const isRemovingSelf = userId === memberId;

    if (!isRemovingSelf) {
      // Only admins can remove others
      const memberDoc = await db.collection("chats").doc(chatId).collection("members").doc(userId).get();
      if (!memberDoc.exists || memberDoc.data()?.role !== "admin") {
        throw createError(ErrorCode.PERMISSION_DENIED, "Only admins can remove members");
      }
    }

    // Check if member exists
    const targetMember = await db.collection("chats").doc(chatId).collection("members").doc(memberId).get();
    if (!targetMember.exists) {
      throw createError(ErrorCode.NOT_FOUND, "Member not found in chat");
    }

    // Don't allow removing the last admin
    if (targetMember.data()?.role === "admin") {
      const adminCount = await db.collection("chats").doc(chatId)
        .collection("members")
        .where("role", "==", "admin")
        .get();

      if (adminCount.size === 1) {
        throw createError(ErrorCode.INVALID_ARGUMENT, "Cannot remove the last admin");
      }
    }

    // Remove member
    const batch = db.batch();

    // Update participants array
    batch.update(db.collection("chats").doc(chatId), {
      participants: admin.firestore.FieldValue.arrayRemove(memberId),
      memberCount: admin.firestore.FieldValue.increment(-1),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    // Delete member document
    batch.delete(db.collection("chats").doc(chatId).collection("members").doc(memberId));

    await batch.commit();

    // Send system message
    const message = isRemovingSelf ? "left the group" : "was removed from the group";
    await sendSystemMessage(chatId, `Member ${message}`);

    return {success: true};
  } catch (error) {
    return handleError(error, "removeChatMember");
  }
}, "removeChatMember", {
  resourceConfig: {
    resourceType: "chat",
    requiredLevel: PermissionLevel.ADMIN,
  },
  rateLimitConfig: {
    type: RateLimitType.WRITE,
    maxRequests: 10,
    windowSeconds: 60,
  },
}));

/**
 * Update member role
 */
export const updateMemberRole = onCall(withResourceAccess(async (request, resource) => {
  try {
    const userId = request.auth!.uid;

    // Validate and sanitize input using centralized validator
    const validatedData = validateRequest(
      request.data,
      VALIDATION_SCHEMAS.updateMemberRole,
      userId
    );

    const {chatId, memberId, role} = validatedData;

    const chat = resource;

    // Only group chats have roles
    if (chat.type !== "group") {
      throw createError(ErrorCode.INVALID_ARGUMENT, "Only group chats have member roles");
    }

    // Check if user is admin
    const userMemberDoc = await db.collection("chats").doc(chatId).collection("members").doc(userId).get();
    if (!userMemberDoc.exists || userMemberDoc.data()?.role !== "admin") {
      throw createError(ErrorCode.PERMISSION_DENIED, "Only admins can update member roles");
    }

    // Check if target member exists
    const targetMemberRef = db.collection("chats").doc(chatId).collection("members").doc(memberId);
    const targetMember = await targetMemberRef.get();
    if (!targetMember.exists) {
      throw createError(ErrorCode.NOT_FOUND, "Member not found in chat");
    }

    // Don't allow demoting the last admin
    if (targetMember.data()?.role === "admin" && role === "member") {
      const adminCount = await db.collection("chats").doc(chatId)
        .collection("members")
        .where("role", "==", "admin")
        .get();

      if (adminCount.size === 1) {
        throw createError(ErrorCode.INVALID_ARGUMENT, "Cannot demote the last admin");
      }
    }

    // Update role
    await targetMemberRef.update({
      role,
      roleUpdatedAt: admin.firestore.FieldValue.serverTimestamp(),
      roleUpdatedBy: userId,
    });

    return {success: true};
  } catch (error) {
    return handleError(error, "updateMemberRole");
  }
}, "updateMemberRole", {
  resourceConfig: {
    resourceType: "chat",
    requiredLevel: PermissionLevel.ADMIN,
  },
  rateLimitConfig: {
    type: RateLimitType.WRITE,
    maxRequests: 10,
    windowSeconds: 60,
  },
}));

/**
 * Mute/unmute chat notifications
 */
export const updateChatNotifications = onCall(withAuth(async (request) => {
  try {
    const userId = request.auth!.uid;

    // Validate and sanitize input using centralized validator
    const validatedData = validateRequest(
      request.data,
      VALIDATION_SCHEMAS.updateChatNotifications,
      userId
    );

    const {chatId, muted} = validatedData;

    // Check if user is member
    const memberRef = db.collection("chats").doc(chatId).collection("members").doc(userId);
    const memberDoc = await memberRef.get();

    if (!memberDoc.exists) {
      throw createError(ErrorCode.NOT_FOUND, "You are not a member of this chat");
    }

    // Update notification preference
    await memberRef.update({
      notifications: !muted,
      notificationsUpdatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    return {success: true};
  } catch (error) {
    return handleError(error, "updateChatNotifications");
  }
}, "updateChatNotifications", {
  authLevel: "onboarded",
  rateLimitConfig: {
    type: RateLimitType.WRITE,
    maxRequests: 10,
    windowSeconds: 60,
  },
}));

/**
 * Delete a chat (admin only for groups, any participant for direct)
 */
export const deleteChat = onCall(withResourceAccess(async (request, resource) => {
  try {
    const userId = request.auth!.uid;

    // Validate and sanitize input using centralized validator
    const validatedData = validateRequest(
      request.data,
      VALIDATION_SCHEMAS.deleteChat,
      userId
    );

    const {chatId} = validatedData;

    const chat = resource;

    // Check permissions
    if (chat.type === "group") {
      const memberDoc = await db.collection("chats").doc(chatId).collection("members").doc(userId).get();
      if (!memberDoc.exists || memberDoc.data()?.role !== "admin") {
        throw createError(ErrorCode.PERMISSION_DENIED, "Only admins can delete group chats");
      }
    }

    // Delete all messages
    const messagesSnapshot = await db.collection("chats").doc(chatId).collection("messages").get();
    const batch = db.batch();

    messagesSnapshot.docs.forEach((doc) => {
      batch.delete(doc.ref);
    });

    // Delete all members
    const membersSnapshot = await db.collection("chats").doc(chatId).collection("members").get();
    membersSnapshot.docs.forEach((doc) => {
      batch.delete(doc.ref);
    });

    // Delete chat document
    batch.delete(db.collection("chats").doc(chatId));

    await batch.commit();

    return {success: true};
  } catch (error) {
    return handleError(error, "deleteChat");
  }
}, "deleteChat", {
  resourceConfig: {
    resourceType: "chat",
    requiredLevel: PermissionLevel.ADMIN,
  },
  rateLimitConfig: {
    type: RateLimitType.WRITE,
    maxRequests: 5,
    windowSeconds: 60,
  },
}));

/**
 * Get chat details
 */
export const getChatDetails = onCall(withResourceAccess(async (request, resource) => {
  try {
    const userId = request.auth!.uid;

    // Validate and sanitize input using centralized validator
    const validatedData = validateRequest(
      request.data,
      VALIDATION_SCHEMAS.getChatDetails,
      userId
    );

    const {chatId} = validatedData;

    const chat = {id: chatId, ...resource};

    // Get member details
    const membersSnapshot = await db.collection("chats").doc(chatId).collection("members").get();
    const members = await Promise.all(
      membersSnapshot.docs.map(async (doc) => {
        const memberData = doc.data();
        const userDoc = await db.collection("users").doc(doc.id).get();
        const userData = userDoc.data() || {};

        return {
          userId: doc.id,
          displayName: userData.displayName || "Unknown User",
          photoURL: userData.photoURL,
          role: memberData.role,
          joinedAt: memberData.joinedAt,
          notifications: memberData.notifications,
        };
      })
    );

    // Get message count
    const messageCount = await db.collection("chats").doc(chatId)
      .collection("messages")
      .count()
      .get();

    return {
      success: true,
      chat: {
        ...chat,
        members,
        messageCount: messageCount.data().count,
      },
    };
  } catch (error) {
    return handleError(error, "getChatDetails");
  }
}, "getChatDetails", {
  resourceType: "chat",
  requiredLevel: PermissionLevel.FAMILY_MEMBER,
}));

// Helper function to send system messages
async function sendSystemMessage(chatId: string, text: string) {
  try {
    await db.collection("chats").doc(chatId).collection("messages").add({
      type: "system",
      text,
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
      system: true,
    });
  } catch (error) {
    console.error("Failed to send system message:", error);
  }
}
