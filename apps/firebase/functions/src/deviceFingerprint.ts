import {onCall, HttpsError} from "firebase-functions/v2/https";
import {onSchedule} from "firebase-functions/v2/scheduler";
import * as admin from "firebase-admin";
import {deviceFingerprintService} from "./services/deviceFingerprintService";
import {createError, ErrorCode} from "./utils/errors";
import {FINGERPRINT_SERVER_API_KEY} from "./auth/config/secrets";
import {validateRequest} from "./utils/request-validator";
import {VALIDATION_SCHEMAS} from "./config/validation-schemas";

/**
 * Verify device fingerprint and register/update trusted device
 */
export const verifyDeviceFingerprint = onCall({
  timeoutSeconds: 30,
  memory: "256MiB",
  secrets: [FINGERPRINT_SERVER_API_KEY],
}, async (request) => {
  try {
    // Ensure user is authenticated
    if (!request.auth) {
      throw new HttpsError(
        "unauthenticated",
        "User must be authenticated to verify device fingerprint"
      );
    }

    // Validate and sanitize input using centralized validator
    const validatedData = validateRequest(
      request.data,
      VALIDATION_SCHEMAS.verifyDeviceFingerprint,
      request.auth.uid
    );

    const {requestId, visitorId, deviceInfo} = validatedData;
    const userId = request.auth.uid;

    // Verify fingerprint with FingerprintJS Pro
    const fingerprint = await deviceFingerprintService.verifyFingerprint(
      requestId,
      visitorId
    );

    // Assess device risk
    const riskAssessment = await deviceFingerprintService.assessDeviceRisk(fingerprint);

    // Register or update trusted device
    const trustedDevice = await deviceFingerprintService.registerTrustedDevice(
      userId,
      fingerprint,
      deviceInfo
    );

    // Log authentication event
    await admin.firestore().collection("authEvents").add({
      userId,
      visitorId,
      eventType: "device_verification",
      trustScore: trustedDevice.trustScore,
      riskLevel: riskAssessment.riskLevel,
      riskFactors: riskAssessment.riskFactors,
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
      metadata: {
        browserDetails: fingerprint.browserDetails,
        location: fingerprint.ipLocation,
        vpn: fingerprint.vpn?.result,
        incognito: fingerprint.incognito,
      },
    });

    return {
      success: true,
      device: {
        id: trustedDevice.id,
        deviceName: trustedDevice.deviceName,
        trustScore: trustedDevice.trustScore,
        isNewDevice: !trustedDevice.metadata?.loginCount || trustedDevice.metadata.loginCount === 1,
      },
      riskAssessment,
      requiresAdditionalAuth: riskAssessment.requiresAdditionalAuth,
    };
  } catch (error) {
    console.error("Error in verifyDeviceFingerprint:", error);
    if (error instanceof HttpsError) {
      throw error;
    }
    throw createError(ErrorCode.INTERNAL, "Failed to verify device fingerprint");
  }
});

/**
 * Get user's trusted devices
 */
export const getTrustedDevices = onCall({
  timeoutSeconds: 10,
  memory: "128MiB",
}, async (request) => {
  try {
    // Ensure user is authenticated
    if (!request.auth) {
      throw new HttpsError(
        "unauthenticated",
        "User must be authenticated to get trusted devices"
      );
    }

    // Validate and sanitize input using centralized validator
    const validatedData = validateRequest(
      request.data || {},
      VALIDATION_SCHEMAS.getTrustedDevices,
      request.auth.uid
    );

    const userId = request.auth.uid;
    const devices = await deviceFingerprintService.getUserTrustedDevices(userId);

    // Mark current device if visitorId provided
    const currentVisitorId = validatedData.currentVisitorId;
    if (currentVisitorId) {
      devices.forEach((device) => {
        device.isCurrentDevice = device.visitorId === currentVisitorId;
      });
    }

    return {
      success: true,
      devices: devices.map((device) => ({
        id: device.id,
        visitorId: device.visitorId,
        deviceName: device.deviceName,
        deviceType: device.deviceType,
        platform: device.platform,
        lastUsed: device.lastUsed.toMillis(),
        addedAt: device.addedAt.toMillis(),
        trustScore: device.trustScore,
        isCurrentDevice: device.isCurrentDevice || false,
        lastLocation: device.lastLocation,
      })),
    };
  } catch (error) {
    console.error("Error in getTrustedDevices:", error);
    if (error instanceof HttpsError) {
      throw error;
    }
    throw createError(ErrorCode.INTERNAL, "Failed to get trusted devices");
  }
});

/**
 * Remove a trusted device
 */
export const removeTrustedDevice = onCall({
  timeoutSeconds: 10,
  memory: "128MiB",
}, async (request) => {
  try {
    // Ensure user is authenticated
    if (!request.auth) {
      throw new HttpsError(
        "unauthenticated",
        "User must be authenticated to remove trusted device"
      );
    }

    // Validate and sanitize input using centralized validator
    const validatedData = validateRequest(
      request.data,
      VALIDATION_SCHEMAS.removeTrustedDevice,
      request.auth.uid
    );

    const userId = request.auth.uid;
    const {visitorId, currentVisitorId} = validatedData;

    // Check if trying to remove current device
    if (currentVisitorId === visitorId) {
      throw new HttpsError(
        "failed-precondition",
        "Cannot remove the device you are currently using"
      );
    }

    await deviceFingerprintService.removeTrustedDevice(userId, visitorId);

    // Log the removal
    await admin.firestore().collection("authEvents").add({
      userId,
      visitorId,
      eventType: "device_removed",
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
    });

    return {
      success: true,
      message: "Device removed successfully",
    };
  } catch (error) {
    console.error("Error in removeTrustedDevice:", error);
    if (error instanceof HttpsError) {
      throw error;
    }
    throw createError(ErrorCode.INTERNAL, "Failed to remove trusted device");
  }
});

/**
 * Check device trust status (called during authentication)
 */
export const checkDeviceTrust = onCall({
  timeoutSeconds: 10,
  memory: "128MiB",
}, async (request) => {
  try {
    // Validate and sanitize input using centralized validator
    const validatedData = validateRequest(
      request.data,
      VALIDATION_SCHEMAS.checkDeviceTrust,
      request.auth?.uid
    );

    const {visitorId, userId: dataUserId} = validatedData;

    // This can be called before full authentication
    const userId = request.auth?.uid || dataUserId;

    if (!userId) {
      throw new HttpsError(
        "invalid-argument",
        "User ID is required"
      );
    }
    const isTrusted = await deviceFingerprintService.isDeviceTrusted(userId, visitorId);

    // Get device details if trusted
    let deviceDetails = null;
    if (isTrusted) {
      const devices = await deviceFingerprintService.getUserTrustedDevices(userId);
      deviceDetails = devices.find((d) => d.visitorId === visitorId);
    }

    return {
      success: true,
      isTrusted,
      trustScore: deviceDetails?.trustScore || 0,
      requiresAdditionalAuth: !isTrusted || (deviceDetails?.trustScore || 0) < 70,
    };
  } catch (error) {
    console.error("Error in checkDeviceTrust:", error);
    if (error instanceof HttpsError) {
      throw error;
    }
    throw createError(ErrorCode.INTERNAL, "Failed to check device trust");
  }
});

/**
 * Clean up old devices (scheduled function)
 */
export const cleanupOldDevices = onSchedule({
  schedule: "every 24 hours",
  timeoutSeconds: 540,
  memory: "512MiB",
}, async () => {
  try {
    console.log("Starting cleanup of old devices...");

    const cutoffDays = 90; // Remove devices not used in 90 days
    const batchSize = 100;
    let lastUserId: string | undefined;

    let hasMoreUsers = true;
    while (hasMoreUsers) {
      // Get batch of users
      let query = admin.firestore().collection("users").limit(batchSize);
      if (lastUserId) {
        query = query.startAfter(lastUserId);
      }

      const usersSnapshot = await query.get();
      if (usersSnapshot.empty) {
        hasMoreUsers = false;
        break;
      }

      // Process each user
      const promises = usersSnapshot.docs.map(async (userDoc) => {
        try {
          await deviceFingerprintService.cleanupOldDevices(userDoc.id, cutoffDays);
        } catch (error) {
          console.error(`Error cleaning devices for user ${userDoc.id}:`, error);
        }
      });

      await Promise.all(promises);

      // Update last processed user ID
      lastUserId = usersSnapshot.docs[usersSnapshot.docs.length - 1].id;
    }

    console.log("Device cleanup completed successfully");
  } catch (error) {
    console.error("Error in cleanupOldDevices:", error);
    throw error;
  }
});
