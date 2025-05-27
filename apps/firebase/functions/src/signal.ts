import {onCall, HttpsError} from "firebase-functions/v2/https";
import {onDocumentUpdated} from "firebase-functions/v2/firestore";
import {onSchedule} from "firebase-functions/v2/scheduler";
import {getFirestore, FieldValue} from "firebase-admin/firestore";
import {logger} from "firebase-functions/v2";

const db = getFirestore();

/**
 * Sanitize input to prevent XSS
 */
function sanitizeInput(input: string): string {
  return input.trim().replace(/<[^>]*>?/gm, "");
}

/**
 * Validate that the request is authenticated
 */
function validateAuth(request: any) {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "User must be authenticated");
  }
  return request.auth.uid;
}

/**
 * Publish Signal Protocol keys for a user
 */
export const publishSignalKeys = onCall(async (request) => {
  try {
    const userId = validateAuth(request);

    const {
      identityKey,
      signedPreKey,
      preKeys,
      registrationId,
      deviceId = 1,
    } = request.data;

    // Validate input
    if (!identityKey || !signedPreKey || !preKeys || !registrationId) {
      throw new HttpsError("invalid-argument", "Missing required key data");
    }

    // Start a batch write
    const batch = db.batch();

    // Store identity key
    const identityRef = db.collection("signalKeys").doc(userId);
    batch.set(identityRef, {
      userId,
      identityKey: sanitizeInput(identityKey),
      registrationId,
      lastUpdated: FieldValue.serverTimestamp(),
    }, {merge: true});

    // Store device-specific keys
    const deviceRef = identityRef.collection("devices").doc(deviceId.toString());
    batch.set(deviceRef, {
      deviceId,
      signedPreKey: {
        keyId: signedPreKey.id,
        publicKey: sanitizeInput(signedPreKey.publicKey),
        signature: sanitizeInput(signedPreKey.signature),
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
        publicKey: sanitizeInput(preKey.publicKey),
        createdAt: FieldValue.serverTimestamp(),
      });
    }

    await batch.commit();

    logger.info(`Published Signal keys for user ${userId}`);
    return {success: true};
  } catch (error) {
    logger.error("Error publishing Signal keys:", error);
    if (error instanceof HttpsError) {
      throw error;
    }
    throw new HttpsError("internal", "Failed to publish Signal keys");
  }
});

/**
 * Get user's Signal Protocol bundle for key exchange
 */
export const getUserSignalBundle = onCall(async (request) => {
  try {
    validateAuth(request);

    const {userId, deviceId = 1} = request.data;

    if (!userId) {
      throw new HttpsError("invalid-argument", "User ID is required");
    }

    // Get identity key
    const identityDoc = await db.collection("signalKeys").doc(userId).get();
    if (!identityDoc.exists) {
      throw new HttpsError("not-found", "User has no Signal keys");
    }

    const identityData = identityDoc.data()!;

    // Get device-specific signed prekey
    const deviceDoc = await identityDoc.ref
      .collection("devices")
      .doc(deviceId.toString())
      .get();

    if (!deviceDoc.exists) {
      throw new HttpsError("not-found", "Device not found");
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
    if (error instanceof HttpsError) {
      throw error;
    }
    throw new HttpsError("internal", "Failed to get Signal bundle");
  }
});

/**
 * Publish new signed prekey
 */
export const publishSignedPreKey = onCall(async (request) => {
  try {
    const userId = validateAuth(request);

    const {signedPreKey, deviceId = 1} = request.data;

    if (!signedPreKey) {
      throw new HttpsError("invalid-argument", "Signed prekey is required");
    }

    // Update device's signed prekey
    const deviceRef = db
      .collection("signalKeys")
      .doc(userId)
      .collection("devices")
      .doc(deviceId.toString());

    await deviceRef.update({
      signedPreKey: {
        keyId: signedPreKey.id,
        publicKey: sanitizeInput(signedPreKey.publicKey),
        signature: sanitizeInput(signedPreKey.signature),
        timestamp: signedPreKey.timestamp,
      },
      lastUpdated: FieldValue.serverTimestamp(),
    });

    logger.info(`Updated signed prekey for user ${userId}`);
    return {success: true};
  } catch (error) {
    logger.error("Error publishing signed prekey:", error);
    if (error instanceof HttpsError) {
      throw error;
    }
    throw new HttpsError("internal", "Failed to publish signed prekey");
  }
});

/**
 * Publish new prekeys
 */
export const publishPreKeys = onCall(async (request) => {
  try {
    const userId = validateAuth(request);

    const {preKeys, deviceId = 1} = request.data;

    if (!preKeys || !Array.isArray(preKeys)) {
      throw new HttpsError("invalid-argument", "PreKeys array is required");
    }

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
        publicKey: sanitizeInput(preKey.publicKey),
        createdAt: FieldValue.serverTimestamp(),
      });
    }

    await batch.commit();

    logger.info(`Published ${preKeys.length} prekeys for user ${userId}`);
    return {success: true};
  } catch (error) {
    logger.error("Error publishing prekeys:", error);
    if (error instanceof HttpsError) {
      throw error;
    }
    throw new HttpsError("internal", "Failed to publish prekeys");
  }
});

/**
 * Mark a user's identity as verified
 */
export const markUserAsVerified = onCall(async (request) => {
  try {
    const verifierId = validateAuth(request);

    const {userId} = request.data;

    if (!userId) {
      throw new HttpsError("invalid-argument", "User ID is required");
    }

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
    if (error instanceof HttpsError) {
      throw error;
    }
    throw new HttpsError("internal", "Failed to mark user as verified");
  }
});

/**
 * Trust a user's new identity key
 */
export const trustUserIdentity = onCall(async (request) => {
  try {
    const trusterId = validateAuth(request);

    const {userId} = request.data;

    if (!userId) {
      throw new HttpsError("invalid-argument", "User ID is required");
    }

    // Get the current identity key
    const identityDoc = await db.collection("signalKeys").doc(userId).get();
    if (!identityDoc.exists) {
      throw new HttpsError("not-found", "User has no Signal keys");
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
    if (error instanceof HttpsError) {
      throw error;
    }
    throw new HttpsError("internal", "Failed to trust user identity");
  }
});

/**
 * Get prekey count for a user
 */
export const getPreKeyCount = onCall(async (request) => {
  try {
    const userId = validateAuth(request);

    const {deviceId = 1} = request.data;

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
    if (error instanceof HttpsError) {
      throw error;
    }
    throw new HttpsError("internal", "Failed to get prekey count");
  }
});

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

    // Create key change notifications
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

    await batch.commit();

    logger.info(`Created key change notification for ${affectedUserIds.size} users`);
  }
});

/**
 * Clean up old prekeys (scheduled function)
 */
export const cleanupOldPreKeys = onSchedule("every 24 hours", async (event) => {
  try {
    // Get all users
    const usersSnapshot = await db.collection("users").get();

    let totalDeleted = 0;
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    for (const userDoc of usersSnapshot.docs) {
      // Get old prekeys
      const oldPrekeysSnapshot = await userDoc.ref
        .collection("prekeys")
        .where("createdAt", "<", thirtyDaysAgo)
        .get();

      if (!oldPrekeysSnapshot.empty) {
        const batch = db.batch();
        oldPrekeysSnapshot.forEach((doc) => {
          batch.delete(doc.ref);
        });
        await batch.commit();

        totalDeleted += oldPrekeysSnapshot.size;
      }
    }

    logger.info(`Cleaned up ${totalDeleted} old prekeys`);
  } catch (error) {
    logger.error("Error cleaning up old prekeys:", error);
  }
});
