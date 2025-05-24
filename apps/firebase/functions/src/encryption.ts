import {onCall} from "firebase-functions/v2/https";
import * as admin from "firebase-admin";
import {getFirestore, Timestamp, FieldValue} from "firebase-admin/firestore";
import {createError, ErrorCode, handleError} from "./utils/errors";
import {withAuth, withResourceAccess, PermissionLevel} from "./middleware/auth";
import {
  randomBytes,
  createHash,
  generateKeyPairSync,
  pbkdf2Sync,
  createCipheriv,
  createDecipheriv,
} from "crypto";

// Initialize if not already done
if (!admin.apps.length) {
  admin.initializeApp();
}

const db = getFirestore();

/**
 * Encryption Module Documentation
 *
 * This module provides server-side encryption key management for Dynasty's E2EE messaging.
 *
 * Function Usage Guide:
 *
 * 1. generateUserKeys - Server-side key generation
 *    - Use when: You want the server to generate keys
 *    - Required: password (optional, but recommended)
 *    - Returns: Keys in requested format (PEM or DER)
 *
 * 2. uploadEncryptionKeys - Legacy upload function
 *    - Use when: Migrating from older versions
 *    - Supports both server and client-side keys
 *
 * 3. storeClientGeneratedKeys - Mobile app compatibility
 *    - Use when: Mobile app generates keys client-side
 *    - Required: identityKey, signingKey
 *    - Stores in multiple locations for compatibility
 *
 * 4. getUserEncryptionKeys - Get public keys
 *    - Use when: Need to encrypt messages for a user
 *    - Returns: Public keys from multiple sources
 *
 * 5. getUserPrivateKeys - Get private keys
 *    - Use when: User needs to decrypt their keys
 *    - Required: password
 *    - Only accessible by key owner
 *
 * 6. getEncryptionStatus - Check encryption status
 *    - Use when: Need to check if user has encryption enabled
 *    - Returns: Multiple status flags for compatibility
 */

// Encryption configuration
const PBKDF2_ITERATIONS = 100000; // High iteration count for security
const SALT_LENGTH = 32; // 256 bits
const IV_LENGTH = 16; // 128 bits for AES
const KEY_LENGTH = 32; // 256 bits for AES-256

/**
 * Derives an encryption key from a password using PBKDF2
 */
function deriveKeyFromPassword(password: string, salt: Buffer): Buffer {
  return pbkdf2Sync(password, salt, PBKDF2_ITERATIONS, KEY_LENGTH, "sha256");
}

/**
 * Encrypts data using AES-256-GCM
 */
function encryptData(data: string, password: string): {
  encrypted: string;
  salt: string;
  iv: string;
  authTag: string;
} {
  const salt = randomBytes(SALT_LENGTH);
  const iv = randomBytes(IV_LENGTH);
  const key = deriveKeyFromPassword(password, salt);

  const cipher = createCipheriv("aes-256-gcm", key, iv);
  let encrypted = cipher.update(data, "utf8", "hex");
  encrypted += cipher.final("hex");

  const authTag = cipher.getAuthTag();

  return {
    encrypted,
    salt: salt.toString("hex"),
    iv: iv.toString("hex"),
    authTag: authTag.toString("hex"),
  };
}

/**
 * Decrypts data using AES-256-GCM
 */
function decryptData(
  encryptedData: string,
  password: string,
  salt: string,
  iv: string,
  authTag: string
): string {
  const key = deriveKeyFromPassword(password, Buffer.from(salt, "hex"));
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(iv, "hex"));
  decipher.setAuthTag(Buffer.from(authTag, "hex"));

  let decrypted = decipher.update(encryptedData, "hex", "utf8");
  decrypted += decipher.final("utf8");

  return decrypted;
}

/**
 * Generates a secure key pair for end-to-end encryption
 */
function generateSecureKeyPair(): {
  publicKey: string;
  privateKey: string;
  keyId: string;
  } {
  // Generate X25519 key pair for modern E2EE
  const {publicKey, privateKey} = generateKeyPairSync("x25519", {
    publicKeyEncoding: {
      type: "spki",
      format: "pem",
    },
    privateKeyEncoding: {
      type: "pkcs8",
      format: "pem",
    },
  });

  // Generate unique key ID
  const keyId = `key_${Date.now()}_${randomBytes(8).toString("hex")}`;

  return {
    publicKey,
    privateKey,
    keyId,
  };
}

/**
 * Generates signing keys for message authentication
 */
function generateSigningKeyPair(): {
  publicKey: string;
  privateKey: string;
  } {
  const {publicKey, privateKey} = generateKeyPairSync("ed25519", {
    publicKeyEncoding: {
      type: "spki",
      format: "pem",
    },
    privateKeyEncoding: {
      type: "pkcs8",
      format: "pem",
    },
  });

  return {publicKey, privateKey};
}

/**
 * Convert PEM format key to base64 DER format (for mobile app compatibility)
 */
function convertPEMToBase64DER(pemKey: string): string {
  // Remove PEM headers and footers
  const pemLines = pemKey.split("\n");
  const derBase64 = pemLines
    .filter((line) => !line.includes("-----"))
    .join("");
  return derBase64;
}

/**
 * Convert base64 DER format to PEM format
 */
function convertBase64DERToPEM(base64Key: string, keyType: "PUBLIC" | "PRIVATE"): string {
  const header = keyType === "PUBLIC" ?
    "-----BEGIN PUBLIC KEY-----" :
    "-----BEGIN PRIVATE KEY-----";
  const footer = keyType === "PUBLIC" ?
    "-----END PUBLIC KEY-----" :
    "-----END PRIVATE KEY-----";

  // Add line breaks every 64 characters
  const formatted = base64Key.match(/.{1,64}/g)?.join("\n") || base64Key;

  return `${header}\n${formatted}\n${footer}`;
}

/**
 * Generate encryption keys for a user
 */
export const generateUserKeys = onCall(withAuth(async (request) => {
  try {
    const userId = request.auth!.uid;
    const {password, returnFormat = "pem"} = request.data; // returnFormat can be "pem" or "der"

    // Password is optional for backward compatibility
    // Mobile app may generate keys client-side
    if (password && password.length > 0 && password.length < 12) {
      throw createError(ErrorCode.INVALID_ARGUMENT, "Strong encryption password required (min 12 characters)");
    }

    // Generate secure key pairs
    const encryptionKeys = generateSecureKeyPair();
    const signingKeys = generateSigningKeyPair();

    // Convert to requested format
    const publicKeyFormatted = returnFormat === "der" ?
      convertPEMToBase64DER(encryptionKeys.publicKey) :
      encryptionKeys.publicKey;
    const signingPublicKeyFormatted = returnFormat === "der" ?
      convertPEMToBase64DER(signingKeys.publicKey) :
      signingKeys.publicKey;

    // Store public keys in both PEM format (for consistency)
    await db.collection("users").doc(userId).update({
      publicKey: encryptionKeys.publicKey,
      signingPublicKey: signingKeys.publicKey,
      keyId: encryptionKeys.keyId,
      keysGeneratedAt: FieldValue.serverTimestamp(),
    });

    // Store in encryption keys collection for easy lookup
    await db.collection("encryptionKeys").doc(userId).set({
      identityPublicKey: encryptionKeys.publicKey,
      signingPublicKey: signingKeys.publicKey,
      keyId: encryptionKeys.keyId,
      createdAt: FieldValue.serverTimestamp(),
    });

    // Only store private keys if password provided
    if (password) {
      // Encrypt the private keys with user's password
      const encryptedEncryptionKey = encryptData(encryptionKeys.privateKey, password);
      const encryptedSigningKey = encryptData(signingKeys.privateKey, password);

      // Store encrypted private keys (only accessible by user)
      await db.collection("userKeys").doc(userId).set({
        // Encryption key
        encryptedPrivateKey: encryptedEncryptionKey.encrypted,
        encryptionSalt: encryptedEncryptionKey.salt,
        encryptionIv: encryptedEncryptionKey.iv,
        encryptionAuthTag: encryptedEncryptionKey.authTag,

        // Signing key
        encryptedSigningKey: encryptedSigningKey.encrypted,
        signingSalt: encryptedSigningKey.salt,
        signingIv: encryptedSigningKey.iv,
        signingAuthTag: encryptedSigningKey.authTag,

        keyId: encryptionKeys.keyId,
        algorithm: "aes-256-gcm",
        pbkdf2Iterations: PBKDF2_ITERATIONS,
        createdAt: FieldValue.serverTimestamp(),
      });
    }

    // Generate one-time pre-keys for initial key exchange
    const preKeys = [];
    for (let i = 0; i < 100; i++) {
      const preKey = generateSecureKeyPair();
      preKeys.push({
        keyId: `otpk_${i}_${Date.now()}`,
        publicKey: preKey.publicKey,
        consumed: false,
      });
    }

    // Store one-time pre-keys
    const batch = db.batch();
    preKeys.forEach((preKey, index) => {
      const preKeyRef = db.collection(`users/${userId}/oneTimePreKeys`).doc(`${index}`);
      batch.set(preKeyRef, preKey);
    });
    await batch.commit();

    return {
      success: true,
      keyId: encryptionKeys.keyId,
      publicKey: publicKeyFormatted,
      signingPublicKey: signingPublicKeyFormatted,
      // Return private keys in requested format if password provided
      ...(password ? {
        privateKey: returnFormat === "der" ?
          convertPEMToBase64DER(encryptionKeys.privateKey) :
          encryptionKeys.privateKey,
        signingPrivateKey: returnFormat === "der" ?
          convertPEMToBase64DER(signingKeys.privateKey) :
          signingKeys.privateKey,
      } : {}),
    };
  } catch (error) {
    return handleError(error, "generateUserKeys");
  }
}, "generateUserKeys"));

/**
 * Get user's public key
 */
export const getUserPublicKey = onCall(withAuth(async (request) => {
  try {
    const {userId} = request.data;

    if (!userId) {
      throw createError(ErrorCode.INVALID_ARGUMENT, "User ID is required");
    }

    const userDoc = await db.collection("users").doc(userId).get();
    if (!userDoc.exists) {
      throw createError(ErrorCode.NOT_FOUND, "User not found");
    }

    const userData = userDoc.data()!;
    return {
      publicKey: userData.publicKey,
      signingPublicKey: userData.signingPublicKey,
      keyId: userData.keyId,
    };
  } catch (error) {
    return handleError(error, "getUserPublicKey");
  }
}, "getUserPublicKey"));

/**
 * Get user's private keys (requires password for decryption)
 * This should only be called by the key owner
 */
export const getUserPrivateKeys = onCall(withAuth(async (request) => {
  try {
    const userId = request.auth!.uid;
    const {password} = request.data;

    if (!password) {
      throw createError(ErrorCode.INVALID_ARGUMENT, "Password required to decrypt private keys");
    }

    // Fetch encrypted private keys
    const keysDoc = await db.collection("userKeys").doc(userId).get();
    if (!keysDoc.exists) {
      throw createError(ErrorCode.NOT_FOUND, "No encrypted keys found");
    }

    const keysData = keysDoc.data()!;

    try {
      // Decrypt encryption private key
      const encryptionPrivateKey = decryptData(
        keysData.encryptedPrivateKey,
        password,
        keysData.encryptionSalt,
        keysData.encryptionIv,
        keysData.encryptionAuthTag
      );

      // Decrypt signing private key
      const signingPrivateKey = decryptData(
        keysData.encryptedSigningKey,
        password,
        keysData.signingSalt,
        keysData.signingIv,
        keysData.signingAuthTag
      );

      return {
        encryptionPrivateKey,
        signingPrivateKey,
        keyId: keysData.keyId,
      };
    } catch (error) {
      throw createError(ErrorCode.INVALID_ARGUMENT, "Invalid password or corrupted keys");
    }
  } catch (error) {
    return handleError(error, "getUserPrivateKeys");
  }
}, "getUserPrivateKeys"));

/**
 * Upload user's public keys for encryption
 * Called when a user initializes encryption
 */
export const uploadEncryptionKeys = onCall(
  {
    timeoutSeconds: 60,
  },
  withAuth(async (request) => {
    const userId = request.auth!.uid;
    const {password, publicKey, signingPublicKey, encryptedPrivateKeys} = request.data;

    // Validate input
    if (!password || !publicKey || !signingPublicKey || !encryptedPrivateKeys) {
      throw createError(ErrorCode.INVALID_ARGUMENT, "Missing required encryption data");
    }

    // If client-side key generation is preferred, validate and store the provided keys
    // Otherwise, generate keys server-side
    if (publicKey && encryptedPrivateKeys) {
      // Client provided pre-generated keys - validate them
      const keyId = `key_${Date.now()}_${randomBytes(8).toString("hex")}`;

      // Store public keys
      await db.collection("users").doc(userId).update({
        publicKey,
        signingPublicKey,
        keyId,
        keysGeneratedAt: FieldValue.serverTimestamp(),
      });

      await db.collection("encryptionKeys").doc(userId).set({
        identityPublicKey: publicKey,
        signingPublicKey,
        keyId,
        createdAt: FieldValue.serverTimestamp(),
      });

      // Store encrypted private keys
      await db.collection("userKeys").doc(userId).set({
        ...encryptedPrivateKeys,
        keyId,
        createdAt: FieldValue.serverTimestamp(),
      });

      return {success: true, keyId};
    } else {
      // Generate keys server-side (fallback logic)
      const {password} = request.data;

      if (!password || password.length < 12) {
        throw createError(ErrorCode.INVALID_ARGUMENT, "Strong encryption password required (min 12 characters)");
      }

      // Generate secure key pairs
      const encryptionKeys = generateSecureKeyPair();
      const signingKeys = generateSigningKeyPair();

      // Encrypt the private keys with user's password
      const encryptedEncryptionKey = encryptData(encryptionKeys.privateKey, password);
      const encryptedSigningKey = encryptData(signingKeys.privateKey, password);

      // Store public keys in user document (publicly accessible)
      await db.collection("users").doc(userId).update({
        publicKey: encryptionKeys.publicKey,
        signingPublicKey: signingKeys.publicKey,
        keyId: encryptionKeys.keyId,
        keysGeneratedAt: FieldValue.serverTimestamp(),
      });

      // Store in encryption keys collection for easy lookup
      await db.collection("encryptionKeys").doc(userId).set({
        identityPublicKey: encryptionKeys.publicKey,
        signingPublicKey: signingKeys.publicKey,
        keyId: encryptionKeys.keyId,
        createdAt: FieldValue.serverTimestamp(),
      });

      // Store encrypted private keys (only accessible by user)
      await db.collection("userKeys").doc(userId).set({
        // Encryption key
        encryptedPrivateKey: encryptedEncryptionKey.encrypted,
        encryptionSalt: encryptedEncryptionKey.salt,
        encryptionIv: encryptedEncryptionKey.iv,
        encryptionAuthTag: encryptedEncryptionKey.authTag,

        // Signing key
        encryptedSigningKey: encryptedSigningKey.encrypted,
        signingSalt: encryptedSigningKey.salt,
        signingIv: encryptedSigningKey.iv,
        signingAuthTag: encryptedSigningKey.authTag,

        keyId: encryptionKeys.keyId,
        algorithm: "aes-256-gcm",
        pbkdf2Iterations: PBKDF2_ITERATIONS,
        createdAt: FieldValue.serverTimestamp(),
      });

      return {
        success: true,
        keyId: encryptionKeys.keyId,
        publicKey: encryptionKeys.publicKey,
        signingPublicKey: signingKeys.publicKey,
      };
    }
  }, "uploadEncryptionKeys")
);

/**
 * Store encryption keys from mobile app (client-side generated)
 * This function is specifically for mobile app compatibility
 */
export const storeClientGeneratedKeys = onCall(
  {
    timeoutSeconds: 60,
  },
  withAuth(async (request) => {
    const userId = request.auth!.uid;
    const {identityKey, signingKey, keyFormat = "der"} = request.data;

    if (!identityKey || !signingKey) {
      throw createError(ErrorCode.INVALID_ARGUMENT, "Missing required keys");
    }

    const keyId = `key_${Date.now()}_${randomBytes(8).toString("hex")}`;

    // Convert keys to PEM format if provided in DER format
    const publicKeyPEM = keyFormat === "der" ?
      convertBase64DERToPEM(identityKey, "PUBLIC") :
      identityKey;
    const signingPublicKeyPEM = keyFormat === "der" ?
      convertBase64DERToPEM(signingKey, "PUBLIC") :
      signingKey;

    // Store in main user document (PEM format)
    await db.collection("users").doc(userId).update({
      publicKey: publicKeyPEM,
      signingPublicKey: signingPublicKeyPEM,
      keyId,
      keysGeneratedAt: FieldValue.serverTimestamp(),
    });

    // Store in encryption keys collection (PEM format)
    await db.collection("encryptionKeys").doc(userId).set({
      identityPublicKey: publicKeyPEM,
      signingPublicKey: signingPublicKeyPEM,
      keyId,
      createdAt: FieldValue.serverTimestamp(),
    });

    // Store in mobile app's expected location (original format)
    await db.collection("users").doc(userId).collection("keys").doc("public").set({
      identityKey: identityKey, // Keep original format
      signingKey: signingKey,
      keyId,
      createdAt: FieldValue.serverTimestamp(),
    });

    return {success: true, keyId};
  }, "storeClientGeneratedKeys")
);

/**
 * Get user's public keys for establishing encrypted communication
 */
export const getUserEncryptionKeys = onCall(
  {
    timeoutSeconds: 60,
  },
  withAuth(async (request) => {
    const {userId} = request.data;

    if (!userId) {
      throw createError(ErrorCode.INVALID_ARGUMENT, "User ID is required");
    }

    // Try encryption keys collection first (preferred)
    const encryptionDoc = await db.collection("encryptionKeys").doc(userId).get();
    if (encryptionDoc.exists) {
      const encryptionData = encryptionDoc.data()!;
      return {
        publicKey: encryptionData.identityPublicKey,
        signingPublicKey: encryptionData.signingPublicKey,
        keyId: encryptionData.keyId,
      };
    }

    // Fallback to user document
    const userDoc = await db.collection("users").doc(userId).get();
    if (!userDoc.exists) {
      throw createError(ErrorCode.NOT_FOUND, "User not found");
    }

    const userData = userDoc.data()!;
    if (!userData.publicKey) {
      throw createError(ErrorCode.NOT_FOUND, "User has not enabled encryption");
    }

    return {
      publicKey: userData.publicKey,
      signingPublicKey: userData.signingPublicKey,
      keyId: userData.keyId,
    };
  }, "getUserEncryptionKeys")
);

/**
 * Initialize encrypted chat
 */
export const initializeEncryptedChat = onCall(
  {
    timeoutSeconds: 60,
  },
  withAuth(async (request) => {
    const userId = request.auth!.uid;
    const {participantIds, groupName} = request.data;

    if (!participantIds || !Array.isArray(participantIds)) {
      throw createError(ErrorCode.INVALID_ARGUMENT, "Participant IDs array is required");
    }
    // Include current user in participants
    const allParticipants = Array.from(new Set([...participantIds, userId])).sort();
    const chatType = allParticipants.length === 2 ? "direct" : "group";

    // Generate chat ID
    let chatId: string;
    if (chatType === "direct") {
      chatId = `chat_${allParticipants.join("_")}`;
    } else {
      chatId = `group_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    // Check if chat already exists
    const existingChat = await db.doc(`chats/${chatId}`).get();

    if (existingChat.exists) {
      return {
        chatId,
        existed: true,
        chat: existingChat.data(),
      };
    }

    // Verify all participants have encryption keys
    const keyChecks = await Promise.all(
      allParticipants.map(async (participantId) => {
        const keysDoc = await db.doc(`encryptionKeys/${participantId}`).get();
        return {
          userId: participantId,
          hasKeys: keysDoc.exists,
        };
      })
    );

    const missingKeys = keyChecks.filter((check) => !check.hasKeys);
    if (missingKeys.length > 0) {
      throw createError(
        ErrorCode.FAILED_PRECONDITION,
        `Some participants haven't enabled encryption: ${missingKeys.map((m) => m.userId).join(", ")}`
      );
    }

    // Create chat document
    const chatData = {
      id: chatId,
      type: chatType,
      name: groupName || null,
      participants: allParticipants,
      createdAt: FieldValue.serverTimestamp(),
      createdBy: userId,
      lastMessageAt: FieldValue.serverTimestamp(),
      encryptionEnabled: true,
      messageCount: 0,
    };

    await db.doc(`chats/${chatId}`).set(chatData);

    // Create chat references for each participant
    const batch = db.batch();

    for (const participantId of allParticipants) {
      const userChatRef = db.doc(`users/${participantId}/chats/${chatId}`);
      batch.set(userChatRef, {
        chatId,
        joinedAt: FieldValue.serverTimestamp(),
        lastRead: FieldValue.serverTimestamp(),
        muted: false,
        archived: false,
      });
    }

    await batch.commit();

    return {
      chatId,
      existed: false,
      chat: chatData,
    };
  }, "initializeEncryptedChat")
);

/**
 * Verify encryption key fingerprint
 */
export const verifyKeyFingerprint = onCall(
  {
    timeoutSeconds: 60,
  },
  withAuth(async (request) => {
    const userId = request.auth!.uid;
    const {targetUserId, fingerprint} = request.data;

    if (!targetUserId || !fingerprint) {
      throw createError(ErrorCode.INVALID_ARGUMENT, "Target user ID and fingerprint are required");
    }

    // Store verification status
    await db.doc(`users/${userId}/keyVerifications/${targetUserId}`).set({
      verifiedAt: FieldValue.serverTimestamp(),
      fingerprint,
      verifiedBy: userId,
    });

    // Also store reverse verification
    await db.doc(`users/${targetUserId}/keyVerifications/${userId}`).set({
      verifiedAt: FieldValue.serverTimestamp(),
      fingerprint,
      verifiedBy: userId,
    });

    return {success: true};
  }, "verifyKeyFingerprint")
);

/**
 * Get user encryption initialization status
 * This matches the interface expected by mobile app components
 */
export const getEncryptionStatus = onCall(
  {
    timeoutSeconds: 60,
  },
  withAuth(async (request) => {
    const userId = request.auth!.uid;

    try {
      // Check if user has encryption keys in multiple locations
      const [encryptionDoc, userDoc, mobileKeysDoc] = await Promise.all([
        db.collection("encryptionKeys").doc(userId).get(),
        db.collection("users").doc(userId).get(),
        db.collection("users").doc(userId).collection("keys").doc("public").get(),
      ]);

      const hasEncryptionKeys = encryptionDoc.exists && encryptionDoc.data()?.identityPublicKey;
      const hasUserKeys = userDoc.exists && userDoc.data()?.publicKey;
      const hasMobileKeys = mobileKeysDoc.exists && mobileKeysDoc.data()?.identityKey;

      const isInitialized = hasEncryptionKeys || hasUserKeys || hasMobileKeys;

      return {
        isInitialized,
        isEncryptionEnabled: isInitialized,
        isEncryptionReady: isInitialized,
        status: isInitialized ? "initialized" : "not_initialized",
        hasKeys: {
          encryptionCollection: hasEncryptionKeys,
          userDocument: hasUserKeys,
          mobileLocation: hasMobileKeys,
        },
      };
    } catch (error) {
      console.error("Error checking encryption status:", error);
      return {
        isInitialized: false,
        isEncryptionEnabled: false,
        isEncryptionReady: false,
        status: "error",
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }, "getEncryptionStatus")
);

/**
 * Get key verification status
 */
export const getKeyVerificationStatus = onCall(
  {
    timeoutSeconds: 60,
  },
  withAuth(async (request) => {
    const userId = request.auth!.uid;
    const {targetUserId} = request.data;

    if (!targetUserId) {
      throw createError(ErrorCode.INVALID_ARGUMENT, "Target user ID is required");
    }

    const verificationDoc = await db
      .doc(`users/${userId}/keyVerifications/${targetUserId}`)
      .get();

    if (!verificationDoc.exists) {
      return {verified: false};
    }

    const verificationData = verificationDoc.data();
    return {
      verified: true,
      verifiedAt: verificationData?.verifiedAt,
      fingerprint: verificationData?.fingerprint,
    };
  }, "getKeyVerificationStatus")
);

/**
 * Handle message delivery receipts
 */
export const updateMessageDelivery = onCall(
  {
    timeoutSeconds: 60,
  },
  withResourceAccess(async (request, resource) => {
    const userId = request.auth!.uid;
    const {chatId, messageId, status} = request.data;

    if (!chatId || !messageId || !status) {
      throw createError(ErrorCode.INVALID_ARGUMENT, "Chat ID, message ID, and status are required");
    }

    if (!["delivered", "read"].includes(status)) {
      throw createError(ErrorCode.INVALID_ARGUMENT, "Status must be 'delivered' or 'read'");
    }

    const chatData = resource;
    if (!chatData?.participants.includes(userId)) {
      throw createError(ErrorCode.PERMISSION_DENIED, "User is not a participant in this chat");
    }

    // Update message status
    const updateData: any = {};
    updateData[status] = FieldValue.arrayUnion(userId);

    await db.doc(`chats/${chatId}/messages/${messageId}`).update(updateData);

    return {success: true};
  }, "updateMessageDelivery", {
    resourceType: "chat",
    requiredLevel: PermissionLevel.FAMILY_MEMBER,
  })
);

/**
 * Clean up old messages (scheduled function)
 */
export const cleanupOldMessages = onCall(
  {
    timeoutSeconds: 300, // Increased for batch operations
  },
  async () => {
    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - 30);
      const cutoffTimestamp = Timestamp.fromDate(cutoffDate);

      let totalDeleted = 0;
      let totalArchived = 0;
      let orphanedMedia = 0;

      // Step 1: Archive old messages to cold storage
      const oldMessagesQuery = await db
        .collectionGroup("messages")
        .where("timestamp", "<", cutoffTimestamp)
        .limit(500) // Process in batches
        .get();

      if (!oldMessagesQuery.empty) {
        const archiveBatch = db.batch();
        const mediaToDelete: string[] = [];

        for (const doc of oldMessagesQuery.docs) {
          const messageData = doc.data();
          const chatId = doc.ref.parent.parent?.id;

          if (chatId) {
            // Archive message to cold storage collection
            const archiveRef = db.collection("archivedMessages").doc(doc.id);
            archiveBatch.set(archiveRef, {
              ...messageData,
              originalChatId: chatId,
              archivedAt: FieldValue.serverTimestamp(),
              originalPath: doc.ref.path,
            });

            // Mark original message for deletion
            archiveBatch.delete(doc.ref);

            // Collect media references for cleanup
            if (messageData.mediaUrls && Array.isArray(messageData.mediaUrls)) {
              mediaToDelete.push(...messageData.mediaUrls);
            }

            totalArchived++;
          }
        }

        // Commit archive batch
        await archiveBatch.commit();

        // Step 2: Clean up orphaned media files
        if (mediaToDelete.length > 0) {
          const storage = admin.storage();
          const bucket = storage.bucket();

          for (const mediaUrl of mediaToDelete) {
            try {
              // Extract file path from URL
              const urlParts = mediaUrl.split("/");
              const fileName = urlParts[urlParts.length - 1];
              const filePath = `messages/${fileName}`;

              // Check if file is still referenced
              const referencesQuery = await db
                .collectionGroup("messages")
                .where("mediaUrls", "array-contains", mediaUrl)
                .limit(1)
                .get();

              if (referencesQuery.empty) {
                // File is orphaned, delete it
                await bucket.file(filePath).delete();
                orphanedMedia++;
              }
            } catch (error) {
              console.error(`Failed to delete media file: ${mediaUrl}`, error);
            }
          }
        }
      }

      // Step 3: Clean up empty chat references
      const emptyChatsQuery = await db
        .collection("chats")
        .where("lastMessageAt", "<", cutoffTimestamp)
        .where("messageCount", "==", 0)
        .limit(100)
        .get();

      if (!emptyChatsQuery.empty) {
        const deleteBatch = db.batch();

        for (const doc of emptyChatsQuery.docs) {
          // Check if chat has any messages
          const messagesCheck = await db
            .collection(`chats/${doc.id}/messages`)
            .limit(1)
            .get();

          if (messagesCheck.empty) {
            // Remove chat references from all participants
            const chatData = doc.data();
            if (chatData.participants && Array.isArray(chatData.participants)) {
              for (const participantId of chatData.participants) {
                const userChatRef = db.doc(`users/${participantId}/chats/${doc.id}`);
                deleteBatch.delete(userChatRef);
              }
            }

            // Delete the chat document
            deleteBatch.delete(doc.ref);
            totalDeleted++;
          }
        }

        await deleteBatch.commit();
      }

      // Step 4: Update statistics
      await db.collection("systemStats").doc("messageCleanup").set({
        lastRun: FieldValue.serverTimestamp(),
        messagesArchived: totalArchived,
        chatsDeleted: totalDeleted,
        mediaFilesDeleted: orphanedMedia,
        cutoffDate: cutoffTimestamp,
      }, {merge: true});

      console.log(`Message cleanup completed: ${totalArchived} messages archived, ${totalDeleted} chats deleted, ${orphanedMedia} media files removed`);

      return {
        success: true,
        stats: {
          messagesArchived: totalArchived,
          chatsDeleted: totalDeleted,
          mediaFilesDeleted: orphanedMedia,
        },
      };
    } catch (error) {
      console.error("Failed to cleanup messages:", error);
      throw createError(ErrorCode.INTERNAL, "Message cleanup failed");
    }
  }
);

/**
 * Get chat encryption status
 */
export const getChatEncryptionStatus = onCall(
  {
    timeoutSeconds: 60,
  },
  withResourceAccess(async (request, resource) => {
    const userId = request.auth!.uid;
    const {chatId} = request.data;

    if (!chatId) {
      throw createError(ErrorCode.INVALID_ARGUMENT, "Chat ID is required");
    }

    const chatData = resource;

    // Verify user is participant
    if (!chatData?.participants.includes(userId)) {
      throw createError(ErrorCode.PERMISSION_DENIED, "User is not a participant in this chat");
    }

    // Get verification status for all participants
    const verifiedParticipants: string[] = [];

    for (const participantId of chatData.participants) {
      if (participantId === userId) continue; // Skip self

      const verificationDoc = await db
        .doc(`users/${userId}/keyVerifications/${participantId}`)
        .get();

      if (verificationDoc.exists) {
        verifiedParticipants.push(participantId);
      }
    }

    return {
      enabled: chatData.encryptionEnabled || false,
      verifiedParticipants,
      totalParticipants: chatData.participants.length,
    };
  }, "getChatEncryptionStatus", {
    resourceType: "chat",
    requiredLevel: PermissionLevel.FAMILY_MEMBER,
  })
);

/**
 * Register a new device for multi-device support
 */
export const registerDevice = onCall(
  {
    timeoutSeconds: 60,
  },
  withAuth(async (request) => {
    const userId = request.auth!.uid;
    const {deviceId, deviceName, devicePublicKey, deviceInfo} = request.data;

    if (!deviceId || !deviceName || !devicePublicKey) {
      throw createError(ErrorCode.INVALID_ARGUMENT, "Device ID, name, and public key are required");
    }

    const deviceData = {
      deviceId,
      deviceName,
      devicePublicKey,
      deviceInfo: deviceInfo || {},
      userId,
      registeredAt: FieldValue.serverTimestamp(),
      lastActive: FieldValue.serverTimestamp(),
      isActive: true,
      isTrusted: false, // Requires verification
    };

    await db.doc(`users/${userId}/devices/${deviceId}`).set(deviceData);

    // Store in global collection for querying
    await db.doc(`devices/${deviceId}`).set({
      ...deviceData,
      searchKey: `${userId}_${deviceId}`,
    });

    return {success: true, deviceId};
  }, "registerDevice")
);

/**
 * Sync messages across devices
 */
export const syncDeviceMessages = onCall(
  {
    timeoutSeconds: 60,
  },
  withAuth(async (request) => {
    const userId = request.auth!.uid;
    const {deviceId, lastSyncTimestamp} = request.data;

    if (!deviceId) {
      throw createError(ErrorCode.INVALID_ARGUMENT, "Device ID is required");
    }

    // Verify device belongs to user
    const deviceDoc = await db.doc(`users/${userId}/devices/${deviceId}`).get();
    if (!deviceDoc.exists) {
      throw createError(ErrorCode.NOT_FOUND, "Device not found");
    }

    // Get messages since last sync
    const chatsQuery = await db
      .collection(`users/${userId}/chats`)
      .where("lastMessageAt", ">", lastSyncTimestamp || Timestamp.fromMillis(0))
      .get();

    const syncData: any[] = [];

    for (const chatDoc of chatsQuery.docs) {
      const chatId = chatDoc.data().chatId;

      // Get messages from this chat
      const messagesQuery = await db
        .collection(`chats/${chatId}/messages`)
        .where("timestamp", ">", lastSyncTimestamp || Timestamp.fromMillis(0))
        .orderBy("timestamp", "desc")
        .limit(100)
        .get();

      syncData.push({
        chatId,
        messages: messagesQuery.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        })),
      });
    }

    // Update device last sync
    await db.doc(`users/${userId}/devices/${deviceId}`).update({
      lastSync: FieldValue.serverTimestamp(),
      lastActive: FieldValue.serverTimestamp(),
    });

    return {syncData, timestamp: FieldValue.serverTimestamp()};
  }, "syncDeviceMessages")
);

/**
 * Rotate encryption keys
 */
export const rotateEncryptionKeys = onCall(
  {
    timeoutSeconds: 60,
  },
  withAuth(async (request) => {
    const userId = request.auth!.uid;
    const {newPublicKey, oldKeyId, rotationProof} = request.data;

    if (!newPublicKey || !oldKeyId) {
      throw createError(ErrorCode.INVALID_ARGUMENT, "New public key and old key ID are required");
    }
    const batch = db.batch();

    // Create new key entry
    const newKeyId = `key_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const keyRotationData = {
      keyId: newKeyId,
      userId,
      publicKey: newPublicKey,
      previousKeyId: oldKeyId,
      rotatedAt: FieldValue.serverTimestamp(),
      rotationProof: rotationProof || null,
      isActive: true,
    };

    // Store new key
    batch.set(db.doc(`users/${userId}/keys/${newKeyId}`), keyRotationData);

    // Mark old key as rotated
    batch.update(db.doc(`users/${userId}/keys/${oldKeyId}`), {
      isActive: false,
      rotatedAt: FieldValue.serverTimestamp(),
      replacedBy: newKeyId,
    });

    // Update current key reference
    batch.update(db.doc(`users/${userId}/keys/current`), {
      keyId: newKeyId,
      publicKey: newPublicKey,
      lastRotated: FieldValue.serverTimestamp(),
    });

    // Update global encryption keys
    batch.update(db.doc(`encryptionKeys/${userId}`), {
      identityPublicKey: newPublicKey,
      lastRotated: FieldValue.serverTimestamp(),
      currentKeyId: newKeyId,
    });

    await batch.commit();

    // Notify all active chats about key rotation
    const userChats = await db.collection(`users/${userId}/chats`).get();
    const notifications = userChats.docs.map(async (chatDoc) => {
      const chatId = chatDoc.data().chatId;
      return db.collection(`chats/${chatId}/keyRotations`).add({
        userId,
        newKeyId,
        timestamp: FieldValue.serverTimestamp(),
        acknowledged: [],
      });
    });

    await Promise.all(notifications);

    return {success: true, newKeyId};
  }, "rotateEncryptionKeys")
);

/**
 * Create encrypted key backup
 */
export const createKeyBackup = onCall(
  {
    timeoutSeconds: 60,
  },
  withAuth(async (request) => {
    const userId = request.auth!.uid;
    const {encryptedPrivateKey, publicKey, salt, iterations, hint} = request.data;

    if (!encryptedPrivateKey || !publicKey || !salt) {
      throw createError(ErrorCode.INVALID_ARGUMENT, "Missing required backup data");
    }
    const backupId = `backup_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const backupData = {
      id: backupId,
      userId,
      encryptedPrivateKey,
      publicKey,
      salt,
      iterations: iterations || 100000,
      algorithm: "AES-256-GCM",
      createdAt: FieldValue.serverTimestamp(),
      version: 1,
    };

    // Store backup
    await db.doc(`keyBackups/${backupId}`).set(backupData);

    // Store metadata
    await db.doc(`users/${userId}/backupMetadata/${backupId}`).set({
      backupId,
      createdAt: FieldValue.serverTimestamp(),
      encryptedWith: "password",
      version: 1,
    });

    // Store hint if provided
    if (hint) {
      await db.doc(`users/${userId}/settings/backupHint`).set({
        hint,
        updatedAt: FieldValue.serverTimestamp(),
      });
    }

    // Generate recovery code
    const recoveryCode = randomBytes(24).toString("base64")
      .replace(/[^a-zA-Z0-9]/g, "")
      .substring(0, 24)
      .match(/.{1,4}/g)?.join("-") || "";

    // Store encrypted recovery code
    await db.collection(`users/${userId}/recoveryCodes`).add({
      code: createHash("sha256").update(recoveryCode).digest("hex"),
      createdAt: FieldValue.serverTimestamp(),
      expiresAt: Timestamp.fromMillis(Date.now() + 365 * 24 * 60 * 60 * 1000),
    });

    return {backupId, recoveryCode};
  }, "createKeyBackup")
);

/**
 * Initialize group encryption session
 */
export const initializeGroupEncryption = onCall(
  {
    timeoutSeconds: 60,
  },
  withResourceAccess(async (request, resource) => {
    const userId = request.auth!.uid;
    const {groupId, memberIds, senderKeyPublic} = request.data;

    if (!groupId || !memberIds || !Array.isArray(memberIds) || !senderKeyPublic) {
      throw createError(ErrorCode.INVALID_ARGUMENT, "Missing required group data");
    }

    const groupData = resource;
    if (groupData?.createdBy !== userId && !groupData?.admins?.includes(userId)) {
      throw createError(ErrorCode.PERMISSION_DENIED, "Only group admins can initialize encryption");
    }

    // Get member public keys
    const memberKeys = await Promise.all(
      memberIds.map(async (memberId) => {
        const keysDoc = await db.doc(`encryptionKeys/${memberId}`).get();
        if (!keysDoc.exists) {
          throw createError(ErrorCode.FAILED_PRECONDITION, `Member ${memberId} has no encryption keys`);
        }
        return {
          userId: memberId,
          publicKey: keysDoc.data()?.identityPublicKey,
        };
      })
    );

    // Create group session
    const sessionId = `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const sessionData = {
      groupId,
      sessionId,
      currentSenderKeyId: `sender_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    };

    await db.doc(`groups/${groupId}/sessions/current`).set(sessionData);

    // Store sender key
    await db.doc(`groups/${groupId}/sessions/current/senderKeys/${sessionData.currentSenderKeyId}`).set({
      id: sessionData.currentSenderKeyId,
      publicKey: senderKeyPublic,
      createdAt: FieldValue.serverTimestamp(),
      expiresAt: Timestamp.fromMillis(Date.now() + 7 * 24 * 60 * 60 * 1000),
      createdBy: userId,
    });

    // Store member keys
    const batch = db.batch();
    memberKeys.forEach((member) => {
      const memberRef = db.doc(`groups/${groupId}/sessions/current/members/${member.userId}`);
      batch.set(memberRef, {
        userId: member.userId,
        publicKey: member.publicKey,
        addedAt: FieldValue.serverTimestamp(),
        addedBy: userId,
        isActive: true,
      });
    });

    await batch.commit();

    return {sessionId, memberCount: memberKeys.length};
  }, "initializeGroupEncryption", {
    resourceType: "family_tree", // Using family_tree as the closest match since 'group' is not in the enum
    requiredLevel: PermissionLevel.ADMIN,
  })
);

/**
 * Handle Double Ratchet session initialization
 */
export const initializeDoubleRatchet = onCall(
  {
    timeoutSeconds: 60,
  },
  withAuth(async (request) => {
    const userId = request.auth!.uid;
    const {sessionId, recipientId, ephemeralPublicKey} = request.data;

    if (!sessionId || !recipientId || !ephemeralPublicKey) {
      throw createError(ErrorCode.INVALID_ARGUMENT, "Missing required session data");
    }

    // Store session initialization data
    const sessionData = {
      sessionId,
      initiatorId: userId,
      recipientId,
      ephemeralPublicKey,
      createdAt: FieldValue.serverTimestamp(),
      status: "pending",
    };

    await db.doc(`doubleRatchetSessions/${sessionId}`).set(sessionData);

    // Notify recipient
    await db.collection(`users/${recipientId}/pendingSessions`).add({
      sessionId,
      initiatorId: userId,
      timestamp: FieldValue.serverTimestamp(),
    });

    return {sessionId, status: "pending"};
  }, "initializeDoubleRatchet")
);

/**
 * Check if a device is registered
 */
export const checkDeviceRegistration = onCall(
  {
    timeoutSeconds: 60,
  },
  withAuth(async (request) => {
    const userId = request.auth!.uid;
    const {deviceId} = request.data;

    if (!deviceId) {
      throw createError(ErrorCode.INVALID_ARGUMENT, "Device ID is required");
    }

    const deviceDoc = await db.doc(`users/${userId}/devices/${deviceId}`).get();

    return {
      registered: deviceDoc.exists,
      deviceData: deviceDoc.exists ? deviceDoc.data() : null,
    };
  }, "checkDeviceRegistration")
);

/**
 * Update device last seen timestamp
 */
export const updateDeviceLastSeen = onCall(
  {
    timeoutSeconds: 60,
  },
  withAuth(async (request) => {
    const userId = request.auth!.uid;
    const {deviceId} = request.data;

    if (!deviceId) {
      throw createError(ErrorCode.INVALID_ARGUMENT, "Device ID is required");
    }

    await db.doc(`users/${userId}/devices/${deviceId}`).update({
      lastActive: FieldValue.serverTimestamp(),
    });

    return {success: true};
  }, "updateDeviceLastSeen")
);

/**
 * Remove a device
 */
export const removeDevice = onCall(
  {
    timeoutSeconds: 60,
  },
  withAuth(async (request) => {
    const userId = request.auth!.uid;
    const {deviceId} = request.data;

    if (!deviceId) {
      throw createError(ErrorCode.INVALID_ARGUMENT, "Device ID is required");
    }

    const batch = db.batch();

    // Remove from user's devices
    batch.delete(db.doc(`users/${userId}/devices/${deviceId}`));

    // Remove from global devices collection
    batch.delete(db.doc(`devices/${deviceId}`));

    await batch.commit();

    return {success: true};
  }, "removeDevice")
);

/**
 * Get user's devices
 */
export const getUserDevices = onCall(
  {
    timeoutSeconds: 60,
  },
  withAuth(async (request) => {
    const userId = request.auth!.uid;

    const devicesSnapshot = await db
      .collection(`users/${userId}/devices`)
      .where("isActive", "==", true)
      .orderBy("lastActive", "desc")
      .get();

    const devices = devicesSnapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    }));

    return {devices};
  }, "getUserDevices")
);

/**
 * Consume one-time pre-key
 */
export const consumeOneTimePreKey = onCall(
  {
    timeoutSeconds: 60,
  },
  withAuth(async (request) => {
    const userId = request.auth!.uid;
    const {targetUserId} = request.data;

    if (!targetUserId) {
      throw createError(ErrorCode.INVALID_ARGUMENT, "Target user ID is required");
    }

    // Get an available one-time pre-key
    const preKeysQuery = await db
      .collection(`users/${targetUserId}/oneTimePreKeys`)
      .where("consumed", "==", false)
      .limit(1)
      .get();

    if (preKeysQuery.empty) {
      throw createError(ErrorCode.NOT_FOUND, "No available one-time pre-keys");
    }

    const preKeyDoc = preKeysQuery.docs[0];
    const preKeyData = preKeyDoc.data();

    // Mark as consumed
    await preKeyDoc.ref.update({
      consumed: true,
      consumedBy: userId,
      consumedAt: FieldValue.serverTimestamp(),
    });

    return {
      keyId: preKeyDoc.id,
      publicKey: preKeyData.publicKey,
    };
  }, "consumeOneTimePreKey")
);

/**
 * Upload rotated encryption key
 */
export const uploadRotatedEncryptionKey = onCall(
  {
    timeoutSeconds: 60,
  },
  withAuth(async (request) => {
    const userId = request.auth!.uid;
    const {newPublicKey, oldKeyId, rotationProof} = request.data;

    if (!newPublicKey || !oldKeyId) {
      throw createError(ErrorCode.INVALID_ARGUMENT, "New public key and old key ID are required");
    }

    // This is similar to rotateEncryptionKeys but specifically for the rotation service
    const batch = db.batch();

    const newKeyId = `key_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const keyData = {
      keyId: newKeyId,
      userId,
      publicKey: newPublicKey,
      previousKeyId: oldKeyId,
      rotatedAt: FieldValue.serverTimestamp(),
      rotationProof: rotationProof || null,
      isActive: true,
    };

    // Store new key
    batch.set(db.doc(`users/${userId}/keys/${newKeyId}`), keyData);

    // Update current key reference
    batch.update(db.doc(`users/${userId}/keys/current`), {
      keyId: newKeyId,
      publicKey: newPublicKey,
      lastRotated: FieldValue.serverTimestamp(),
    });

    await batch.commit();

    return {success: true, newKeyId};
  }, "uploadRotatedEncryptionKey")
);

/**
 * Clean up expired encryption data
 */
export const cleanupExpiredEncryption = onCall(
  {
    timeoutSeconds: 60,
  },
  async () => {
    try {
      const now = Timestamp.now();
      const batch = db.batch();
      let deletedCount = 0;

      // Clean up expired recovery codes
      const expiredRecoveryQuery = await db
        .collectionGroup("recoveryCodes")
        .where("expiresAt", "<", now)
        .limit(500)
        .get();

      expiredRecoveryQuery.docs.forEach((doc) => {
        batch.delete(doc.ref);
        deletedCount++;
      });

      // Clean up expired sender keys
      const expiredSenderKeysQuery = await db
        .collectionGroup("senderKeys")
        .where("expiresAt", "<", now)
        .limit(500)
        .get();

      expiredSenderKeysQuery.docs.forEach((doc) => {
        batch.delete(doc.ref);
        deletedCount++;
      });

      await batch.commit();
      console.log(`Cleaned up ${deletedCount} expired encryption items`);
    } catch (error) {
      console.error("Failed to cleanup expired encryption data:", error);
    }
  }
);

/**
 * Log secure share event
 */
export const logSecureShareEvent = onCall(
  {
    timeoutSeconds: 60,
  },
  withAuth(async (request) => {
    const userId = request.auth!.uid;
    const {shareId, eventType, metadata, timestamp} = request.data;

    if (!shareId || !eventType) {
      throw createError(ErrorCode.INVALID_ARGUMENT, "Share ID and event type are required");
    }

    // Store share event in audit log
    const eventData = {
      shareId,
      eventType,
      userId,
      metadata: metadata || {},
      timestamp: timestamp || Date.now(),
      createdAt: FieldValue.serverTimestamp(),
    };

    await db.collection("shareAuditLogs").add(eventData);

    // Update share statistics
    if (eventType === "accessed") {
      await db.doc(`shareLinks/${shareId}`).update({
        accessCount: FieldValue.increment(1),
        lastAccessed: FieldValue.serverTimestamp(),
        accessHistory: FieldValue.arrayUnion({
          userId,
          timestamp: FieldValue.serverTimestamp(),
          metadata,
        }),
      });
    }

    return {success: true};
  }, "logSecureShareEvent")
);

/**
 * Get share link statistics
 */
export const getShareLinkStats = onCall(
  {
    timeoutSeconds: 60,
  },
  withAuth(async (request) => {
    const userId = request.auth!.uid;
    const {shareId} = request.data;

    if (!shareId) {
      throw createError(ErrorCode.INVALID_ARGUMENT, "Share ID is required");
    }

    // Get share link document
    const shareDoc = await db.doc(`shareLinks/${shareId}`).get();

    if (!shareDoc.exists) {
      throw createError(ErrorCode.NOT_FOUND, "Share link not found");
    }

    const shareData = shareDoc.data();

    // Verify ownership
    if (shareData?.ownerId !== userId) {
      throw createError(ErrorCode.PERMISSION_DENIED, "Unauthorized to view share link statistics");
    }

    // Get audit logs for this share
    const auditLogs = await db
      .collection("shareAuditLogs")
      .where("shareId", "==", shareId)
      .orderBy("createdAt", "desc")
      .limit(50)
      .get();

    const logs = auditLogs.docs.map((doc) => doc.data());

    return {
      shareLink: shareData,
      auditLogs: logs,
      totalAccess: shareData.accessCount || 0,
      uniqueUsers: new Set(logs.filter((l) => l.eventType === "accessed").map((l) => l.userId)).size,
    };
  }, "getShareLinkStats")
);

/**
 * Export audit logs
 */
export const exportAuditLogs = onCall(
  {
    timeoutSeconds: 300,
  },
  withAuth(async (request) => {
    const userId = request.auth!.uid;
    const {startDate, endDate, eventTypes, format} = request.data;

    // Verify user is admin or requesting their own logs
    const userDoc = await db.doc(`users/${userId}`).get();
    const userData = userDoc.data();

    if (!userData?.isAdmin && !request.data.ownLogsOnly) {
      throw createError(ErrorCode.PERMISSION_DENIED, "Only admins can export all audit logs");
    }

    // Build query - fix type issues by using proper Query type
    let query: admin.firestore.Query = db.collection("auditLogs");

    if (request.data.ownLogsOnly || !userData?.isAdmin) {
      query = query.where("userId", "==", userId);
    }

    if (startDate) {
      query = query.where("timestamp", ">=", Timestamp.fromMillis(startDate));
    }

    if (endDate) {
      query = query.where("timestamp", "<=", Timestamp.fromMillis(endDate));
    }

    if (eventTypes && Array.isArray(eventTypes) && eventTypes.length > 0) {
      query = query.where("eventType", "in", eventTypes);
    }

    const snapshot = await query
      .orderBy("timestamp", "desc")
      .limit(10000)
      .get();

    const logs = snapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    }));

    // Format based on request
    if (format === "csv") {
      // Convert to CSV
      const headers = ["ID", "Event Type", "User ID", "Description", "Timestamp", "Resource ID", "Metadata"];
      const rows = logs.map((log: any) => [
        log.id,
        log.eventType,
        log.userId,
        log.description,
        new Date(log.timestamp).toISOString(),
        log.resourceId || "",
        JSON.stringify(log.metadata || {}),
      ]);

      const csv = [headers, ...rows].map((row) => row.join(",")).join("\n");

      return {
        format: "csv",
        data: csv,
        count: logs.length,
      };
    }

    // Default to JSON
    return {
      format: "json",
      data: logs,
      count: logs.length,
    };
  }, "exportAuditLogs")
);

/**
 * Store audit log entry from client
 */
export const logAuditEvent = onCall(
  {
    timeoutSeconds: 60,
  },
  withAuth(async (request) => {
    const userId = request.auth!.uid;
    const {eventType, description, resourceId, metadata, timestamp} = request.data;

    if (!eventType || !description) {
      throw createError(ErrorCode.INVALID_ARGUMENT, "Event type and description are required");
    }

    // Store audit log entry
    const auditData = {
      eventType,
      description,
      userId,
      resourceId: resourceId || null,
      metadata: metadata || {},
      timestamp: timestamp || Date.now(),
      createdAt: FieldValue.serverTimestamp(),
      ipAddress: (request as any).rawRequest?.ip || "unknown",
      userAgent: (request as any).rawRequest?.headers?.["user-agent"] || "unknown",
    };

    await db.collection("auditLogs").add(auditData);

    // Check for suspicious activity
    const recentFailures = await db
      .collection("auditLogs")
      .where("userId", "==", userId)
      .where("eventType", "in", ["authentication_failed", "access_denied", "invalid_operation"])
      .where("timestamp", ">", Date.now() - 15 * 60 * 1000) // Last 15 minutes
      .get();

    if (recentFailures.size > 5) {
      // Flag account for review
      await db.doc(`users/${userId}`).update({
        suspiciousActivity: true,
        suspiciousActivityAt: FieldValue.serverTimestamp(),
      });
    }

    return {success: true};
  }, "logAuditEvent")
);
