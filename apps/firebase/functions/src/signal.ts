import {onCall} from "firebase-functions/v2/https";
import {onDocumentUpdated} from "firebase-functions/v2/firestore";
import {onSchedule} from "firebase-functions/v2/scheduler";
import {getFirestore, FieldValue} from "firebase-admin/firestore";
import {logger} from "firebase-functions/v2";
import {withAuth} from "./middleware/auth";
import {validateRequest} from "./utils/request-validator";
import {VALIDATION_SCHEMAS} from "./config/validation-schemas";
import {SECURITY_CONFIG} from "./config/security-config";
import {createError, ErrorCode} from "./utils/errors";

const db = getFirestore();


/**
 * Publish Signal Protocol keys for a user
 */
export const publishSignalKeys = onCall(withAuth(async (request) => {
  try {
    const userId = request.auth!.uid;

    // Validate request data
    const validatedData = validateRequest(request.data, VALIDATION_SCHEMAS.publishSignalKeys, userId);

    const {
      identityKey,
      signedPreKey,
      preKeys,
      registrationId,
      deviceId = 1,
    } = validatedData;

    // Start a batch write
    const batch = db.batch();

    // Store identity key
    const identityRef = db.collection("signalKeys").doc(userId);
    batch.set(identityRef, {
      userId,
      identityKey,
      registrationId,
      lastUpdated: FieldValue.serverTimestamp(),
    }, {merge: true});

    // Store device-specific keys
    const deviceRef = identityRef.collection("devices").doc(deviceId.toString());
    batch.set(deviceRef, {
      deviceId,
      signedPreKey: {
        keyId: signedPreKey.id,
        publicKey: signedPreKey.publicKey,
        signature: signedPreKey.signature,
        timestamp: signedPreKey.timestamp,
      },
      lastUpdated: FieldValue.serverTimestamp(),
    });

    // Store prekeys
    for (const preKey of preKeys) {
      const preKeyRef = db
        .collection("users")
        .doc(userId)
        .collection("prekeys")
        .doc(preKey.id.toString());

      batch.set(preKeyRef, {
        userId,
        deviceId,
        keyId: preKey.id,
        publicKey: preKey.publicKey,
        createdAt: FieldValue.serverTimestamp(),
      });
    }

    await batch.commit();

    logger.info(`Published Signal keys for user ${userId}`);
    return {success: true};
  } catch (error) {
    logger.error("Error publishing Signal keys:", error);
    if (error && typeof error === 'object' && 'code' in error && 'message' in error) {
      throw error;
    }
    throw createError(ErrorCode.INTERNAL, "Failed to publish Signal keys");
  }
}, "publishSignalKeys", {
  authLevel: "verified",
  rateLimitConfig: SECURITY_CONFIG.rateLimits.signal_key_publish,
}));

/**
 * Get user's Signal Protocol bundle for key exchange
 */
export const getUserSignalBundle = onCall(withAuth(async (request) => {
  try {
    const requesterId = request.auth!.uid;

    // Validate request data
    const validatedData = validateRequest(request.data, VALIDATION_SCHEMAS.getUserSignalBundle, requesterId);
    const {userId, deviceId = 1} = validatedData;

    // Get identity key
    const identityDoc = await db.collection("signalKeys").doc(userId).get();
    if (!identityDoc.exists) {
      throw createError(ErrorCode.NOT_FOUND, "User has no Signal keys");
    }

    const identityData = identityDoc.data()!;

    // Get device-specific signed prekey
    const deviceDoc = await identityDoc.ref
      .collection("devices")
      .doc(deviceId.toString())
      .get();

    if (!deviceDoc.exists) {
      throw createError(ErrorCode.NOT_FOUND, "Device not found");
    }

    const deviceData = deviceDoc.data()!;

    // Get one prekey (and remove it after use)
    const prekeysSnapshot = await db
      .collection("users")
      .doc(userId)
      .collection("prekeys")
      .where("deviceId", "==", deviceId)
      .limit(1)
      .get();

    let preKey = null;
    if (!prekeysSnapshot.empty) {
      const preKeyDoc = prekeysSnapshot.docs[0];
      preKey = {
        keyId: preKeyDoc.data().keyId,
        publicKey: preKeyDoc.data().publicKey,
      };

      // Delete the used prekey
      await preKeyDoc.ref.delete();

      // Check remaining prekey count and notify if low
      const remainingPrekeys = await db
        .collection("users")
        .doc(userId)
        .collection("prekeys")
        .where("deviceId", "==", deviceId)
        .count()
        .get();

      const prekeyCount = remainingPrekeys.data().count;
      if (prekeyCount < 10) {
        // Create notification for user to upload more prekeys
        await db.collection("notifications").add({
          userId,
          type: "low_prekeys",
          deviceId,
          prekeyCount,
          createdAt: FieldValue.serverTimestamp(),
          read: false,
        });

        logger.warn(`User ${userId} device ${deviceId} has only ${prekeyCount} prekeys remaining`);
      }
    }

    return {
      registrationId: identityData.registrationId,
      deviceId,
      identityKey: identityData.identityKey,
      signedPreKey: deviceData.signedPreKey,
      preKey, // May be null if no prekeys available
    };
  } catch (error) {
    logger.error("Error getting Signal bundle:", error);
    if (error && typeof error === 'object' && 'code' in error && 'message' in error) {
      throw error;
    }
    throw createError(ErrorCode.INTERNAL, "Failed to get Signal bundle");
  }
}, "getUserSignalBundle", {
  authLevel: "verified",
  rateLimitConfig: SECURITY_CONFIG.rateLimits.signal_key_retrieve,
}));

/**
 * Publish new signed prekey
 */
export const publishSignedPreKey = onCall(withAuth(async (request) => {
  try {
    const userId = request.auth!.uid;

    // Validate request data
    const validatedData = validateRequest(request.data, VALIDATION_SCHEMAS.publishSignedPreKey, userId);
    const {signedPreKey, deviceId = 1} = validatedData;

    // Update device's signed prekey
    const deviceRef = db
      .collection("signalKeys")
      .doc(userId)
      .collection("devices")
      .doc(deviceId.toString());

    await deviceRef.update({
      signedPreKey: {
        keyId: signedPreKey.id,
        publicKey: signedPreKey.publicKey,
        signature: signedPreKey.signature,
        timestamp: signedPreKey.timestamp,
      },
      lastUpdated: FieldValue.serverTimestamp(),
    });

    logger.info(`Updated signed prekey for user ${userId}`);
    return {success: true};
  } catch (error) {
    logger.error("Error publishing signed prekey:", error);
    if (error && typeof error === 'object' && 'code' in error && 'message' in error) {
      throw error;
    }
    throw createError(ErrorCode.INTERNAL, "Failed to publish signed prekey");
  }
}, "publishSignedPreKey", {
  authLevel: "verified",
  rateLimitConfig: SECURITY_CONFIG.rateLimits.signal_key_publish,
}));

/**
 * Publish new prekeys
 */
export const publishPreKeys = onCall(withAuth(async (request) => {
  try {
    const userId = request.auth!.uid;

    // Validate request data
    const validatedData = validateRequest(request.data, VALIDATION_SCHEMAS.publishPreKeys, userId);
    const {preKeys, deviceId = 1} = validatedData;

    const batch = db.batch();

    for (const preKey of preKeys) {
      const preKeyRef = db
        .collection("users")
        .doc(userId)
        .collection("prekeys")
        .doc(preKey.id.toString());

      batch.set(preKeyRef, {
        userId,
        deviceId,
        keyId: preKey.id,
        publicKey: preKey.publicKey,
        createdAt: FieldValue.serverTimestamp(),
      });
    }

    await batch.commit();

    logger.info(`Published ${preKeys.length} prekeys for user ${userId}`);
    return {success: true};
  } catch (error) {
    logger.error("Error publishing prekeys:", error);
    if (error && typeof error === 'object' && 'code' in error && 'message' in error) {
      throw error;
    }
    throw createError(ErrorCode.INTERNAL, "Failed to publish prekeys");
  }
}, "publishPreKeys", {
  authLevel: "verified",
  rateLimitConfig: SECURITY_CONFIG.rateLimits.signal_key_publish,
}));

/**
 * Mark a user's identity as verified
 */
export const markUserAsVerified = onCall(withAuth(async (request) => {
  try {
    const verifierId = request.auth!.uid;

    // Validate request data
    const validatedData = validateRequest(request.data, VALIDATION_SCHEMAS.markUserAsVerified, verifierId);
    const {userId} = validatedData;

    // Store verification record
    await db
      .collection("users")
      .doc(verifierId)
      .collection("keyVerifications")
      .doc(userId)
      .set({
        verifiedUserId: userId,
        verifiedAt: FieldValue.serverTimestamp(),
        verifiedBy: verifierId,
      });

    logger.info(`User ${verifierId} verified ${userId}`);
    return {success: true};
  } catch (error) {
    logger.error("Error marking user as verified:", error);
    if (error && typeof error === 'object' && 'code' in error && 'message' in error) {
      throw error;
    }
    throw createError(ErrorCode.INTERNAL, "Failed to mark user as verified");
  }
}, "markUserAsVerified", {
  authLevel: "verified",
  rateLimitConfig: SECURITY_CONFIG.rateLimits.signal_verification,
}));

/**
 * Trust a user's new identity key
 */
export const trustUserIdentity = onCall(withAuth(async (request) => {
  try {
    const trusterId = request.auth!.uid;

    // Validate request data
    const validatedData = validateRequest(request.data, VALIDATION_SCHEMAS.trustUserIdentity, trusterId);
    const {userId} = validatedData;

    // Get the current identity key
    const identityDoc = await db.collection("signalKeys").doc(userId).get();
    if (!identityDoc.exists) {
      throw createError(ErrorCode.NOT_FOUND, "User has no Signal keys");
    }

    const identityKey = identityDoc.data()!.identityKey;

    // Store trust record
    await db
      .collection("users")
      .doc(trusterId)
      .collection("trustedIdentities")
      .doc(userId)
      .set({
        userId,
        identityKey,
        trustedAt: FieldValue.serverTimestamp(),
        trustedBy: trusterId,
      });

    logger.info(`User ${trusterId} trusted identity for ${userId}`);
    return {success: true};
  } catch (error) {
    logger.error("Error trusting user identity:", error);
    if (error && typeof error === 'object' && 'code' in error && 'message' in error) {
      throw error;
    }
    throw createError(ErrorCode.INTERNAL, "Failed to trust user identity");
  }
}, "trustUserIdentity", {
  authLevel: "verified",
  rateLimitConfig: SECURITY_CONFIG.rateLimits.signal_verification,
}));

/**
 * Get prekey count for a user
 */
export const getPreKeyCount = onCall(withAuth(async (request) => {
  try {
    const userId = request.auth!.uid;

    // Validate request data
    const validatedData = validateRequest(request.data, VALIDATION_SCHEMAS.getPreKeyCount, userId);
    const {deviceId = 1} = validatedData;

    const snapshot = await db
      .collection("users")
      .doc(userId)
      .collection("prekeys")
      .where("deviceId", "==", deviceId)
      .count()
      .get();

    return {count: snapshot.data().count};
  } catch (error) {
    logger.error("Error getting prekey count:", error);
    if (error && typeof error === 'object' && 'code' in error && 'message' in error) {
      throw error;
    }
    throw createError(ErrorCode.INTERNAL, "Failed to get prekey count");
  }
}, "getPreKeyCount", {
  authLevel: "auth",
  rateLimitConfig: SECURITY_CONFIG.rateLimits.signal_maintenance,
}));

/**
 * Notify users when someone's key changes
 */
export const notifyKeyChange = onDocumentUpdated("signalKeys/{userId}", async (event) => {
  const userId = event.params.userId;
  const before = event.data?.before.data();
  const after = event.data?.after.data();

  if (!before || !after) {
    logger.warn(`Missing data for key change notification: ${userId}`);
    return;
  }

  // Check if identity key changed
  if (before.identityKey !== after.identityKey) {
    logger.info(`Identity key changed for user ${userId}`);

    // Get all users who have active chats with this user
    const chatsSnapshot = await db
      .collection("chats")
      .where("participants", "array-contains", userId)
      .get();

    const affectedUserIds = new Set<string>();
    chatsSnapshot.forEach((doc) => {
      const participants = doc.data().participants as string[];
      participants.forEach((p) => {
        if (p !== userId) affectedUserIds.add(p);
      });
    });

    // Create key change notifications and invalidate sessions
    const batch = db.batch();
    const notificationId = `keychange_${userId}_${Date.now()}`;

    const notification = {
      id: notificationId,
      type: "key_change",
      affectedUserId: userId,
      participants: Array.from(affectedUserIds),
      createdAt: FieldValue.serverTimestamp(),
    };

    batch.set(
      db.collection("keyChangeNotifications").doc(notificationId),
      notification
    );

    // Invalidate all active sessions with this user
    for (const affectedUserId of affectedUserIds) {
      // Mark any existing trusted identities as untrusted
      const trustedIdentityRef = db
        .collection("users")
        .doc(affectedUserId)
        .collection("trustedIdentities")
        .doc(userId);

      batch.update(trustedIdentityRef, {
        trusted: false,
        untrustedAt: FieldValue.serverTimestamp(),
        reason: "key_changed",
      });

      // Create a notification for each affected user
      const userNotificationRef = db.collection("notifications").doc();
      batch.set(userNotificationRef, {
        userId: affectedUserId,
        type: "identity_key_changed",
        affectedUserId: userId,
        message: `Security alert: ${userId}'s encryption keys have changed. Please verify their identity before continuing.`,
        createdAt: FieldValue.serverTimestamp(),
        read: false,
        priority: "high",
      });
    }

    await batch.commit();

    logger.info(`Created key change notification for ${affectedUserIds.size} users`);
  }
});

/**
 * Clean up old prekeys (scheduled function)
 */
export const cleanupOldPreKeys = onSchedule("every 24 hours", async () => {
  try {
    // Get all users
    const usersSnapshot = await db.collection("users").get();

    let totalDeleted = 0;
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    for (const userDoc of usersSnapshot.docs) {
      const userId = userDoc.id;

      // Get all prekeys grouped by device
      const allPrekeysSnapshot = await userDoc.ref
        .collection("prekeys")
        .orderBy("createdAt", "asc")
        .get();

      if (allPrekeysSnapshot.empty) continue;

      // Group prekeys by device
      const prekeysByDevice = new Map<number, any[]>();
      allPrekeysSnapshot.forEach((doc) => {
        const data = doc.data();
        const deviceId = data.deviceId || 1;
        if (!prekeysByDevice.has(deviceId)) {
          prekeysByDevice.set(deviceId, []);
        }
        prekeysByDevice.get(deviceId)!.push({doc, data});
      });

      // Process each device
      for (const [deviceId, prekeys] of prekeysByDevice) {
        // Keep at least 20 prekeys per device
        const minPrekeys = 20;

        if (prekeys.length <= minPrekeys) {
          // Not enough prekeys, notify user
          await db.collection("notifications").add({
            userId,
            type: "low_prekeys",
            deviceId,
            prekeyCount: prekeys.length,
            createdAt: FieldValue.serverTimestamp(),
            read: false,
          });
          continue;
        }

        // Find old prekeys to delete (keep newest minPrekeys)
        const oldPrekeys = prekeys
          .filter((pk) => pk.data.createdAt.toDate() < thirtyDaysAgo)
          .slice(0, prekeys.length - minPrekeys);

        if (oldPrekeys.length > 0) {
          const batch = db.batch();
          oldPrekeys.forEach(({doc}) => {
            batch.delete(doc.ref);
          });
          await batch.commit();
          totalDeleted += oldPrekeys.length;
        }
      }
    }

    logger.info(`Cleaned up ${totalDeleted} old prekeys`);
  } catch (error) {
    logger.error("Error cleaning up old prekeys:", error);
  }
});
