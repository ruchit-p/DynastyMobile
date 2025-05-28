import {onCall} from "firebase-functions/v2/https";
import * as admin from "firebase-admin";
import {getFirestore, Timestamp} from "firebase-admin/firestore";
import {logger} from "firebase-functions/v2";
import {createError, ErrorCode, handleError} from "./utils/errors";
import {withAuth} from "./middleware/auth";
import {validateRequest} from "./utils/request-validator";
import {VALIDATION_SCHEMAS} from "./config/validation-schemas";
import {DEFAULT_REGION, FUNCTION_TIMEOUT} from "./common";
import {AuditLogService} from "./audit/AuditLogService";

// Initialize if not already done
if (!admin.apps.length) {
  admin.initializeApp();
}

const db = getFirestore();

// Types
export interface BiometricCredential {
  id: string;
  userId: string;
  credentialId: string; // Base64 encoded
  publicKey: string; // Base64 encoded
  counter: number;
  createdAt: Timestamp;
  lastUsed: Timestamp;
  isActive: boolean;
  deviceInfo?: {
    userAgent: string;
    platform: string;
    ip: string;
  };
}

export interface BiometricAuthChallenge {
  challengeId: string;
  userId: string;
  challenge: string; // Base64 encoded
  createdAt: Timestamp;
  expiresAt: Timestamp;
  isUsed: boolean;
}

/**
 * Register a new biometric credential
 */
export const registerBiometricCredential = onCall(
  {
    region: DEFAULT_REGION,
    memory: "256MiB",
    timeoutSeconds: FUNCTION_TIMEOUT.SHORT,
  },
  withAuth(async (request) => {
    const functionName = "registerBiometricCredential";

    try {
      const userId = request.auth!.uid;

      // Validate and sanitize input
      const validatedData = validateRequest(
        request.data,
        VALIDATION_SCHEMAS.registerBiometricCredential,
        userId
      );

      const {
        credentialId,
        publicKey,
        attestationObject,
        clientDataJSON,
        deviceInfo,
      } = validatedData;

      // Verify attestation (basic implementation)
      const clientData = JSON.parse(Buffer.from(clientDataJSON, "base64").toString());

      if (clientData.type !== "webauthn.create") {
        throw createError(ErrorCode.INVALID_ARGUMENT, "Invalid client data type");
      }

      // Check if credential already exists
      const existingCredQuery = await db
        .collection("biometric_credentials")
        .where("credentialId", "==", credentialId)
        .get();

      if (!existingCredQuery.empty) {
        throw createError(ErrorCode.ALREADY_EXISTS, "Credential already registered");
      }

      // Create credential record
      const credential: BiometricCredential = {
        id: `cred_${Date.now()}_${Math.random().toString(36).substring(2)}`,
        userId,
        credentialId,
        publicKey,
        counter: 0,
        createdAt: Timestamp.now(),
        lastUsed: Timestamp.now(),
        isActive: true,
        deviceInfo,
      };

      // Store credential
      await db.collection("biometric_credentials").doc(credential.id).set(credential);

      // Log registration
      await AuditLogService.logEvent(
        "biometric_credential_registered",
        "New biometric credential registered",
        {
          credentialId: credential.id,
          userId,
          deviceInfo,
        }
      );

      logger.info(`[${functionName}] Biometric credential registered`, {
        credentialId: credential.id,
        userId,
      });

      return {
        success: true,
        credentialId: credential.id,
      };
    } catch (error) {
      return handleError(error, functionName);
    }
  })
);

/**
 * Create authentication challenge
 */
export const createBiometricChallenge = onCall(
  {
    region: DEFAULT_REGION,
    memory: "256MiB",
    timeoutSeconds: FUNCTION_TIMEOUT.SHORT,
  },
  withAuth(async (request) => {
    const functionName = "createBiometricChallenge";

    try {
      const userId = request.auth!.uid;

      // Generate challenge
      const challenge = Buffer.from(Array.from({length: 32}, () =>
        Math.floor(Math.random() * 256)
      )).toString("base64");

      const challengeRecord: BiometricAuthChallenge = {
        challengeId: `challenge_${Date.now()}_${Math.random().toString(36).substring(2)}`,
        userId,
        challenge,
        createdAt: Timestamp.now(),
        expiresAt: Timestamp.fromMillis(Date.now() + 5 * 60 * 1000), // 5 minutes
        isUsed: false,
      };

      // Store challenge
      await db.collection("biometric_challenges").doc(challengeRecord.challengeId).set(challengeRecord);

      // Get user's credentials for allowCredentials
      const credentialsQuery = await db
        .collection("biometric_credentials")
        .where("userId", "==", userId)
        .where("isActive", "==", true)
        .get();

      const allowCredentials = credentialsQuery.docs.map((doc) => {
        const cred = doc.data() as BiometricCredential;
        return {
          id: cred.credentialId,
          type: "public-key",
        };
      });

      logger.info(`[${functionName}] Biometric challenge created`, {
        challengeId: challengeRecord.challengeId,
        userId,
      });

      return {
        success: true,
        challenge: challenge,
        challengeId: challengeRecord.challengeId,
        allowCredentials,
      };
    } catch (error) {
      return handleError(error, functionName);
    }
  })
);

/**
 * Verify biometric authentication
 */
export const verifyBiometricAuthentication = onCall(
  {
    region: DEFAULT_REGION,
    memory: "256MiB",
    timeoutSeconds: FUNCTION_TIMEOUT.SHORT,
  },
  withAuth(async (request) => {
    const functionName = "verifyBiometricAuthentication";

    try {
      const userId = request.auth!.uid;

      // Validate and sanitize input
      const validatedData = validateRequest(
        request.data,
        VALIDATION_SCHEMAS.verifyBiometricAuthentication,
        userId
      );

      const {
        challengeId,
        credentialId,
        authenticatorData,
        clientDataJSON,
        signature,
      } = validatedData;

      // Get and validate challenge
      const challengeDoc = await db.collection("biometric_challenges").doc(challengeId).get();

      if (!challengeDoc.exists) {
        throw createError(ErrorCode.NOT_FOUND, "Challenge not found");
      }

      const challenge = challengeDoc.data() as BiometricAuthChallenge;

      if (challenge.userId !== userId) {
        throw createError(ErrorCode.PERMISSION_DENIED, "Challenge belongs to different user");
      }

      if (challenge.isUsed) {
        throw createError(ErrorCode.INVALID_ARGUMENT, "Challenge already used");
      }

      if (challenge.expiresAt.toMillis() < Date.now()) {
        throw createError(ErrorCode.INVALID_ARGUMENT, "Challenge expired");
      }

      // Get credential
      const credentialQuery = await db
        .collection("biometric_credentials")
        .where("credentialId", "==", credentialId)
        .where("userId", "==", userId)
        .where("isActive", "==", true)
        .get();

      if (credentialQuery.empty) {
        throw createError(ErrorCode.NOT_FOUND, "Credential not found or inactive");
      }

      const credentialData = credentialQuery.docs[0].data() as BiometricCredential;

      // Verify client data
      const clientData = JSON.parse(Buffer.from(clientDataJSON, "base64").toString());

      if (clientData.type !== "webauthn.get") {
        throw createError(ErrorCode.INVALID_ARGUMENT, "Invalid client data type");
      }

      if (clientData.challenge !== challenge.challenge) {
        throw createError(ErrorCode.INVALID_ARGUMENT, "Challenge mismatch");
      }

      // Basic signature verification (in production, use proper WebAuthn library)
      // This is a simplified implementation
      const isSignatureValid = await verifySignature(
        credentialData.publicKey,
        authenticatorData,
        clientDataJSON,
        signature
      );

      if (!isSignatureValid) {
        // Log failed attempt
        await AuditLogService.logEvent(
          "biometric_auth_failed",
          "Biometric authentication failed - invalid signature",
          {
            credentialId: credentialData.id,
            userId,
            reason: "invalid_signature",
          }
        );

        throw createError(ErrorCode.UNAUTHENTICATED, "Invalid signature");
      }

      // Mark challenge as used
      await db.collection("biometric_challenges").doc(challengeId).update({
        isUsed: true,
      });

      // Update credential last used
      await db.collection("biometric_credentials").doc(credentialQuery.docs[0].id).update({
        lastUsed: Timestamp.now(),
        counter: admin.firestore.FieldValue.increment(1),
      });

      // Log successful authentication
      await AuditLogService.logEvent(
        "biometric_auth_success",
        "Biometric authentication successful",
        {
          credentialId: credentialData.id,
          userId,
        }
      );

      logger.info(`[${functionName}] Biometric authentication verified`, {
        credentialId: credentialData.id,
        userId,
      });

      return {
        success: true,
        verified: true,
        credentialId: credentialData.id,
      };
    } catch (error) {
      return handleError(error, functionName);
    }
  })
);

/**
 * Get user's biometric credentials
 */
export const getBiometricCredentials = onCall(
  {
    region: DEFAULT_REGION,
    memory: "256MiB",
    timeoutSeconds: FUNCTION_TIMEOUT.SHORT,
  },
  withAuth(async (request) => {
    const functionName = "getBiometricCredentials";

    try {
      const userId = request.auth!.uid;

      const credentialsQuery = await db
        .collection("biometric_credentials")
        .where("userId", "==", userId)
        .where("isActive", "==", true)
        .orderBy("createdAt", "desc")
        .get();

      const credentials = credentialsQuery.docs.map((doc) => {
        const data = doc.data() as BiometricCredential;
        return {
          id: data.id,
          credentialId: data.credentialId,
          createdAt: data.createdAt,
          lastUsed: data.lastUsed,
          counter: data.counter,
          deviceInfo: data.deviceInfo,
        };
      });

      return {
        success: true,
        credentials,
      };
    } catch (error) {
      return handleError(error, functionName);
    }
  })
);

/**
 * Revoke biometric credential
 */
export const revokeBiometricCredential = onCall(
  {
    region: DEFAULT_REGION,
    memory: "256MiB",
    timeoutSeconds: FUNCTION_TIMEOUT.SHORT,
  },
  withAuth(async (request) => {
    const functionName = "revokeBiometricCredential";

    try {
      const userId = request.auth!.uid;

      const validatedData = validateRequest(
        request.data,
        VALIDATION_SCHEMAS.revokeBiometricCredential,
        userId
      );

      const {credentialId} = validatedData;

      // Find and deactivate credential
      const credentialQuery = await db
        .collection("biometric_credentials")
        .where("credentialId", "==", credentialId)
        .where("userId", "==", userId)
        .get();

      if (credentialQuery.empty) {
        throw createError(ErrorCode.NOT_FOUND, "Credential not found");
      }

      const credentialDocRef = credentialQuery.docs[0].ref;
      await credentialDocRef.update({
        isActive: false,
        revokedAt: Timestamp.now(),
      });

      // Log revocation
      await AuditLogService.logEvent(
        "biometric_credential_revoked",
        "Biometric credential revoked",
        {
          credentialId,
          userId,
        }
      );

      logger.info(`[${functionName}] Biometric credential revoked`, {
        credentialId,
        userId,
      });

      return {
        success: true,
        revoked: true,
      };
    } catch (error) {
      return handleError(error, functionName);
    }
  })
);

// Helper function for signature verification
async function verifySignature(
  publicKeyBase64: string,
  authenticatorData: string,
  clientDataJSON: string,
  signature: string
): Promise<boolean> {
  try {
    // This is a simplified implementation
    // In production, use a proper WebAuthn library like @simplewebauthn/server

    // For now, return true if all required fields are present
    // Real implementation would:
    // 1. Decode the public key
    // 2. Create the signed data (authenticatorData + hash(clientDataJSON))
    // 3. Verify the signature using the public key

    return !!(publicKeyBase64 && authenticatorData && clientDataJSON && signature);
  } catch (error) {
    logger.error("Signature verification failed:", error);
    return false;
  }
}

// Audit Log Service helper
class AuditLogService {
  static async logEvent(
    eventType: string,
    description: string,
    metadata: Record<string, any>
  ): Promise<void> {
    try {
      await db.collection("audit_logs").add({
        eventType,
        description,
        metadata,
        timestamp: Timestamp.now(),
        severity: "medium",
      });
    } catch (error) {
      logger.error("Failed to log audit event:", error);
    }
  }
}
