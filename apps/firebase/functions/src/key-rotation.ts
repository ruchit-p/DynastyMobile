import { onCall } from "firebase-functions/v2/https";
import * as admin from "firebase-admin";
import { getFirestore, Timestamp } from "firebase-admin/firestore";
import { logger } from "firebase-functions/v2";
import { createError, ErrorCode, handleError } from "./utils/errors";
import { withAuth } from "./middleware/auth";
import { validateRequest } from "./utils/request-validator";
import { VALIDATION_SCHEMAS } from "./config/validation-schemas";
import { DEFAULT_REGION, FUNCTION_TIMEOUT } from "./common";

// Initialize if not already done
if (!admin.apps.length) {
  admin.initializeApp();
}

const db = getFirestore();

// Constants
const KEY_ROTATION_INTERVAL_DAYS = 30;
const MAX_ACTIVE_KEYS = 3;
const KEY_EXPIRY_GRACE_PERIOD_DAYS = 7;

// Types
export interface RotatedEncryptionKey {
  id: string;
  userId: string;
  keyId: string;
  publicKey: string; // Base64 encoded
  keyType: 'identity' | 'prekey' | 'vault_master';
  version: number;
  createdAt: Timestamp;
  expiresAt: Timestamp;
  isActive: boolean;
  rotationReason?: 'scheduled' | 'compromise' | 'manual';
  deviceId?: string;
}

export interface KeyRotationSchedule {
  userId: string;
  nextRotationDate: Timestamp;
  intervalDays: number;
  enabledKeyTypes: string[];
  warningDays: number;
  lastNotified?: Timestamp;
}

export interface KeyRotationEvent {
  userId: string;
  eventType: 'rotation_started' | 'rotation_completed' | 'rotation_failed' | 'key_expired';
  keyType: string;
  oldKeyId?: string;
  newKeyId?: string;
  reason: string;
  timestamp: Timestamp;
  metadata?: Record<string, any>;
}

/**
 * Upload rotated encryption key (called by mobile apps)
 */
export const uploadRotatedEncryptionKey = onCall(
  {
    region: DEFAULT_REGION,
    memory: "256MiB",
    timeoutSeconds: FUNCTION_TIMEOUT.SHORT,
  },
  withAuth(async (request) => {
    const functionName = "uploadRotatedEncryptionKey";

    try {
      const userId = request.auth!.uid;

      // Validate input
      const validatedData = validateRequest(
        request.data,
        VALIDATION_SCHEMAS.uploadRotatedEncryptionKey,
        userId
      );

      const {
        keyId,
        publicKey,
        keyType = 'identity',
        version,
        expiresAt,
        rotationReason = 'scheduled',
        deviceId
      } = validatedData;

      // Check if key already exists
      const existingKeyQuery = await db
        .collection('encryption_keys')
        .where('keyId', '==', keyId)
        .where('userId', '==', userId)
        .get();

      if (!existingKeyQuery.empty) {
        throw createError(ErrorCode.ALREADY_EXISTS, 'Key with this ID already exists');
      }

      // Create key record
      const rotatedKey: RotatedEncryptionKey = {
        id: `key_${Date.now()}_${Math.random().toString(36).substring(2)}`,
        userId,
        keyId,
        publicKey,
        keyType,
        version,
        createdAt: Timestamp.now(),
        expiresAt: Timestamp.fromMillis(expiresAt),
        isActive: true,
        rotationReason,
        deviceId
      };

      const batch = db.batch();

      // Store new key
      const keyRef = db.collection('encryption_keys').doc(rotatedKey.id);
      batch.set(keyRef, rotatedKey);

      // Deactivate old keys of the same type
      const oldKeysQuery = await db
        .collection('encryption_keys')
        .where('userId', '==', userId)
        .where('keyType', '==', keyType)
        .where('isActive', '==', true)
        .get();

      for (const doc of oldKeysQuery.docs) {
        batch.update(doc.ref, {
          isActive: false,
          deactivatedAt: Timestamp.now()
        });
      }

      // Log rotation event
      const rotationEventRef = db.collection('key_rotation_events').doc();
      const rotationEvent: KeyRotationEvent = {
        userId,
        eventType: 'rotation_completed',
        keyType,
        newKeyId: keyId,
        reason: rotationReason,
        timestamp: Timestamp.now(),
        metadata: {
          version,
          deviceId
        }
      };
      batch.set(rotationEventRef, rotationEvent);

      // Update rotation schedule
      const scheduleRef = db.collection('key_rotation_schedules').doc(userId);
      const scheduleDoc = await scheduleRef.get();
      
      if (scheduleDoc.exists) {
        batch.update(scheduleRef, {
          nextRotationDate: Timestamp.fromMillis(
            Date.now() + (KEY_ROTATION_INTERVAL_DAYS * 24 * 60 * 60 * 1000)
          ),
          lastNotified: null
        });
      }

      // Commit all changes
      await batch.commit();

      // Clean up old keys (async)
      cleanupOldKeys(userId, keyType).catch(error => {
        logger.warn('Failed to cleanup old keys:', error);
      });

      logger.info(`[${functionName}] Encryption key uploaded successfully`, {
        userId,
        keyId,
        keyType,
        version
      });

      return {
        success: true,
        keyId: rotatedKey.id,
        message: 'Encryption key uploaded successfully'
      };
    } catch (error) {
      return handleError(error, functionName);
    }
  })
);

/**
 * Get active encryption keys for a user
 */
export const getActiveEncryptionKeys = onCall(
  {
    region: DEFAULT_REGION,
    memory: "256MiB",
    timeoutSeconds: FUNCTION_TIMEOUT.SHORT,
  },
  withAuth(async (request) => {
    const functionName = "getActiveEncryptionKeys";

    try {
      const userId = request.auth!.uid;
      const { keyType } = request.data;

      let query = db
        .collection('encryption_keys')
        .where('userId', '==', userId)
        .where('isActive', '==', true)
        .orderBy('createdAt', 'desc');

      if (keyType) {
        query = query.where('keyType', '==', keyType);
      }

      const keysSnapshot = await query.get();
      
      const keys = keysSnapshot.docs.map(doc => {
        const data = doc.data() as RotatedEncryptionKey;
        return {
          id: data.id,
          keyId: data.keyId,
          publicKey: data.publicKey,
          keyType: data.keyType,
          version: data.version,
          createdAt: data.createdAt,
          expiresAt: data.expiresAt,
          isActive: data.isActive
        };
      });

      return {
        success: true,
        keys
      };
    } catch (error) {
      return handleError(error, functionName);
    }
  })
);

/**
 * Setup key rotation schedule for a user
 */
export const setupKeyRotationSchedule = onCall(
  {
    region: DEFAULT_REGION,
    memory: "256MiB",
    timeoutSeconds: FUNCTION_TIMEOUT.SHORT,
  },
  withAuth(async (request) => {
    const functionName = "setupKeyRotationSchedule";

    try {
      const userId = request.auth!.uid;

      const validatedData = validateRequest(
        request.data,
        VALIDATION_SCHEMAS.setupKeyRotationSchedule,
        userId
      );

      const {
        intervalDays = KEY_ROTATION_INTERVAL_DAYS,
        enabledKeyTypes = ['identity', 'vault_master'],
        warningDays = 7
      } = validatedData;

      const schedule: KeyRotationSchedule = {
        userId,
        nextRotationDate: Timestamp.fromMillis(
          Date.now() + (intervalDays * 24 * 60 * 60 * 1000)
        ),
        intervalDays,
        enabledKeyTypes,
        warningDays
      };

      await db.collection('key_rotation_schedules').doc(userId).set(schedule);

      logger.info(`[${functionName}] Key rotation schedule setup`, {
        userId,
        intervalDays,
        enabledKeyTypes
      });

      return {
        success: true,
        schedule: {
          nextRotationDate: schedule.nextRotationDate,
          intervalDays: schedule.intervalDays,
          enabledKeyTypes: schedule.enabledKeyTypes
        }
      };
    } catch (error) {
      return handleError(error, functionName);
    }
  })
);

/**
 * Check key rotation status for a user
 */
export const checkKeyRotationStatus = onCall(
  {
    region: DEFAULT_REGION,
    memory: "256MiB",
    timeoutSeconds: FUNCTION_TIMEOUT.SHORT,
  },
  withAuth(async (request) => {
    const functionName = "checkKeyRotationStatus";

    try {
      const userId = request.auth!.uid;

      // Get rotation schedule
      const scheduleDoc = await db.collection('key_rotation_schedules').doc(userId).get();
      
      if (!scheduleDoc.exists) {
        return {
          success: true,
          rotationRequired: false,
          scheduleExists: false,
          message: 'No rotation schedule found'
        };
      }

      const schedule = scheduleDoc.data() as KeyRotationSchedule;
      const now = Date.now();
      const nextRotation = schedule.nextRotationDate.toMillis();
      const warningThreshold = nextRotation - (schedule.warningDays * 24 * 60 * 60 * 1000);

      // Get active keys
      const activeKeysSnapshot = await db
        .collection('encryption_keys')
        .where('userId', '==', userId)
        .where('isActive', '==', true)
        .get();

      const keysByType = activeKeysSnapshot.docs.reduce((acc, doc) => {
        const data = doc.data() as RotatedEncryptionKey;
        acc[data.keyType] = data;
        return acc;
      }, {} as Record<string, RotatedEncryptionKey>);

      // Check if rotation is required
      const rotationRequired = now >= nextRotation;
      const warningRequired = now >= warningThreshold && !schedule.lastNotified;

      // Get recent rotation events
      const recentEventsSnapshot = await db
        .collection('key_rotation_events')
        .where('userId', '==', userId)
        .orderBy('timestamp', 'desc')
        .limit(5)
        .get();

      const recentEvents = recentEventsSnapshot.docs.map(doc => doc.data());

      return {
        success: true,
        rotationRequired,
        warningRequired,
        scheduleExists: true,
        schedule: {
          nextRotationDate: schedule.nextRotationDate,
          intervalDays: schedule.intervalDays,
          enabledKeyTypes: schedule.enabledKeyTypes,
          warningDays: schedule.warningDays
        },
        activeKeys: Object.keys(keysByType),
        recentEvents,
        daysUntilRotation: Math.ceil((nextRotation - now) / (24 * 60 * 60 * 1000))
      };
    } catch (error) {
      return handleError(error, functionName);
    }
  })
);

/**
 * Force key rotation for a user (admin or emergency use)
 */
export const forceKeyRotation = onCall(
  {
    region: DEFAULT_REGION,
    memory: "256MiB",
    timeoutSeconds: FUNCTION_TIMEOUT.SHORT,
  },
  withAuth(async (request) => {
    const functionName = "forceKeyRotation";

    try {
      const userId = request.auth!.uid;

      const validatedData = validateRequest(
        request.data,
        VALIDATION_SCHEMAS.forceKeyRotation,
        userId
      );

      const {
        keyTypes = ['identity', 'vault_master'],
        reason = 'manual'
      } = validatedData;

      const batch = db.batch();

      // Deactivate current keys
      for (const keyType of keyTypes) {
        const activeKeysSnapshot = await db
          .collection('encryption_keys')
          .where('userId', '==', userId)
          .where('keyType', '==', keyType)
          .where('isActive', '==', true)
          .get();

        for (const doc of activeKeysSnapshot.docs) {
          batch.update(doc.ref, {
            isActive: false,
            deactivatedAt: Timestamp.now(),
            rotationReason: reason
          });

          // Log rotation event
          const eventRef = db.collection('key_rotation_events').doc();
          const rotationEvent: KeyRotationEvent = {
            userId,
            eventType: 'rotation_started',
            keyType,
            oldKeyId: doc.data().keyId,
            reason,
            timestamp: Timestamp.now()
          };
          batch.set(eventRef, rotationEvent);
        }
      }

      // Update rotation schedule to force immediate rotation
      const scheduleRef = db.collection('key_rotation_schedules').doc(userId);
      batch.update(scheduleRef, {
        nextRotationDate: Timestamp.now(),
        lastNotified: null
      });

      await batch.commit();

      logger.info(`[${functionName}] Forced key rotation initiated`, {
        userId,
        keyTypes,
        reason
      });

      return {
        success: true,
        message: 'Key rotation forced successfully',
        keyTypes,
        reason
      };
    } catch (error) {
      return handleError(error, functionName);
    }
  })
);

/**
 * Get key rotation history for a user
 */
export const getKeyRotationHistory = onCall(
  {
    region: DEFAULT_REGION,
    memory: "256MiB",
    timeoutSeconds: FUNCTION_TIMEOUT.SHORT,
  },
  withAuth(async (request) => {
    const functionName = "getKeyRotationHistory";

    try {
      const userId = request.auth!.uid;
      const { limit = 20, keyType } = request.data;

      let query = db
        .collection('key_rotation_events')
        .where('userId', '==', userId)
        .orderBy('timestamp', 'desc')
        .limit(limit);

      if (keyType) {
        query = query.where('keyType', '==', keyType);
      }

      const eventsSnapshot = await query.get();
      const events = eventsSnapshot.docs.map(doc => doc.data());

      return {
        success: true,
        events
      };
    } catch (error) {
      return handleError(error, functionName);
    }
  })
);

/**
 * Cleanup old keys (keep only MAX_ACTIVE_KEYS per type)
 */
async function cleanupOldKeys(userId: string, keyType: string): Promise<void> {
  try {
    const keysSnapshot = await db
      .collection('encryption_keys')
      .where('userId', '==', userId)
      .where('keyType', '==', keyType)
      .orderBy('createdAt', 'desc')
      .get();

    if (keysSnapshot.docs.length <= MAX_ACTIVE_KEYS) {
      return; // No cleanup needed
    }

    const batch = db.batch();
    const keysToDelete = keysSnapshot.docs.slice(MAX_ACTIVE_KEYS);

    for (const doc of keysToDelete) {
      const keyData = doc.data() as RotatedEncryptionKey;
      
      // Only delete keys that are past the grace period
      const gracePeriodEnd = keyData.expiresAt.toMillis() + 
        (KEY_EXPIRY_GRACE_PERIOD_DAYS * 24 * 60 * 60 * 1000);
      
      if (Date.now() > gracePeriodEnd) {
        batch.delete(doc.ref);
      }
    }

    await batch.commit();
    
    logger.info('Cleaned up old encryption keys', {
      userId,
      keyType,
      deletedCount: keysToDelete.length
    });
  } catch (error) {
    logger.error('Failed to cleanup old keys:', error);
    throw error;
  }
}

/**
 * Scheduled function to check for required key rotations
 * This would typically be called by a Cloud Scheduler job
 */
export const checkScheduledKeyRotations = onCall(
  {
    region: DEFAULT_REGION,
    memory: "512MiB",
    timeoutSeconds: FUNCTION_TIMEOUT.MEDIUM,
  },
  async (request) => {
    const functionName = "checkScheduledKeyRotations";

    try {
      // This should ideally be an admin-only function or triggered by Cloud Scheduler
      const now = Timestamp.now();
      
      // Find schedules that need rotation or warning
      const schedulesSnapshot = await db
        .collection('key_rotation_schedules')
        .where('nextRotationDate', '<=', now)
        .get();

      const results = {
        rotationsRequired: 0,
        warningsIssued: 0,
        errors: 0
      };

      for (const doc of schedulesSnapshot.docs) {
        try {
          const schedule = doc.data() as KeyRotationSchedule;
          const warningThreshold = schedule.nextRotationDate.toMillis() - 
            (schedule.warningDays * 24 * 60 * 60 * 1000);

          if (now.toMillis() >= schedule.nextRotationDate.toMillis()) {
            // Rotation required
            await sendRotationNotification(schedule.userId, 'rotation_required');
            results.rotationsRequired++;
          } else if (now.toMillis() >= warningThreshold && !schedule.lastNotified) {
            // Warning required
            await sendRotationNotification(schedule.userId, 'rotation_warning');
            await doc.ref.update({ lastNotified: now });
            results.warningsIssued++;
          }
        } catch (error) {
          logger.error('Error processing rotation schedule:', error);
          results.errors++;
        }
      }

      logger.info(`[${functionName}] Checked scheduled rotations`, results);

      return {
        success: true,
        results
      };
    } catch (error) {
      logger.error(`[${functionName}] Failed to check scheduled rotations:`, error);
      return {
        success: false,
        error: error.message
      };
    }
  }
);

/**
 * Send rotation notification to user
 */
async function sendRotationNotification(
  userId: string,
  type: 'rotation_required' | 'rotation_warning'
): Promise<void> {
  try {
    // Create notification record
    await db.collection('notifications').add({
      userId,
      type: 'security',
      title: type === 'rotation_required' ? 
        'Key Rotation Required' : 
        'Key Rotation Warning',
      message: type === 'rotation_required' ?
        'Your encryption keys need to be rotated for security. Please update your app.' :
        'Your encryption keys will expire soon. Consider rotating them.',
      data: {
        notificationType: type,
        action: 'key_rotation'
      },
      createdAt: Timestamp.now(),
      isRead: false
    });

    logger.info('Rotation notification sent', { userId, type });
  } catch (error) {
    logger.error('Failed to send rotation notification:', error);
    throw error;
  }
} 