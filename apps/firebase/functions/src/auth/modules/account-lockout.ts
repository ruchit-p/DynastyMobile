import {onCall} from "firebase-functions/v2/https";
import {getFirestore, Timestamp} from "firebase-admin/firestore";
import {logger} from "firebase-functions/v2";
import {createError, ErrorCode, withErrorHandling} from "../../utils/errors";
import {createLogContext} from "../../utils/sanitization";
import {validateRequest} from "../../utils/request-validator";
import {DEFAULT_REGION, FUNCTION_TIMEOUT} from "../../common";
import {beforeUserSignedIn} from "firebase-functions/v2/identity";

// Constants for account lockout
const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_DURATION_MINUTES = 30;
const FAILED_ATTEMPT_WINDOW_MINUTES = 15;

interface FailedLoginAttempt {
  email: string;
  timestamp: Timestamp;
  ipAddress?: string;
  userAgent?: string;
}

interface AccountLockout {
  email: string;
  lockedAt: Timestamp;
  unlockAt: Timestamp;
  failedAttempts: number;
  lastFailedAttempt: Timestamp;
  reason: string;
}

// Lazy load Firestore to avoid initialization issues
const getDb = () => getFirestore();

/**
 * Record a failed login attempt
 * This should be called from the client when a login fails
 */
export const recordFailedLogin = onCall(
  {
    region: DEFAULT_REGION,
    timeoutSeconds: FUNCTION_TIMEOUT.SHORT,
  },
  withErrorHandling(async (request) => {
    // Validate and sanitize input
    const validatedData = validateRequest(
      request.data,
      {
        rules: [
          {field: "email", type: "email", required: true},
        ],
        xssCheck: true,
      },
      undefined
    );

    const {email} = validatedData;
    const ipAddress = request.rawRequest?.ip ||
                     request.rawRequest?.headers?.["x-forwarded-for"]?.split(",")[0]?.trim() ||
                     "unknown";
    const userAgent = request.rawRequest?.headers?.["user-agent"] || "unknown";

    logger.info("Recording failed login attempt", createLogContext({
      email,
      ipPartial: ipAddress.substring(0, 8) + "...",
    }));

    const now = Timestamp.now();
    const windowStart = Timestamp.fromDate(
      new Date(Date.now() - FAILED_ATTEMPT_WINDOW_MINUTES * 60 * 1000)
    );

    // Get recent failed attempts
    const failedAttemptsRef = getDb().collection("failedLoginAttempts");
    const recentAttemptsSnapshot = await failedAttemptsRef
      .where("email", "==", email.toLowerCase())
      .where("timestamp", ">", windowStart)
      .orderBy("timestamp", "desc")
      .get();

    const recentAttempts = recentAttemptsSnapshot.size;

    // Record this failed attempt
    await failedAttemptsRef.add({
      email: email.toLowerCase(),
      timestamp: now,
      ipAddress,
      userAgent,
    } as FailedLoginAttempt);

    // Check if we need to lock the account
    if (recentAttempts + 1 >= MAX_FAILED_ATTEMPTS) {
      const lockoutRef = getDb().collection("accountLockouts").doc(email.toLowerCase());
      const unlockAt = Timestamp.fromDate(
        new Date(Date.now() + LOCKOUT_DURATION_MINUTES * 60 * 1000)
      );

      await lockoutRef.set({
        email: email.toLowerCase(),
        lockedAt: now,
        unlockAt,
        failedAttempts: recentAttempts + 1,
        lastFailedAttempt: now,
        reason: `Too many failed login attempts (${recentAttempts + 1})`,
      } as AccountLockout);

      logger.warn("Account locked due to failed login attempts", createLogContext({
        email,
        failedAttempts: recentAttempts + 1,
        unlockAt: unlockAt.toDate().toISOString(),
      }));

      throw createError(
        ErrorCode.PERMISSION_DENIED,
        `Account locked due to too many failed login attempts. Please try again in ${LOCKOUT_DURATION_MINUTES} minutes.`
      );
    }

    return {
      failedAttempts: recentAttempts + 1,
      remainingAttempts: MAX_FAILED_ATTEMPTS - (recentAttempts + 1),
      message: `${MAX_FAILED_ATTEMPTS - (recentAttempts + 1)} attempts remaining before account lockout.`,
    };
  }, "recordFailedLogin")
);

/**
 * Check if an account is locked
 * This can be called before attempting login
 */
export const checkAccountLockout = onCall(
  {
    region: DEFAULT_REGION,
    timeoutSeconds: FUNCTION_TIMEOUT.SHORT,
  },
  withErrorHandling(async (request) => {
    // Validate and sanitize input
    const validatedData = validateRequest(
      request.data,
      {
        rules: [
          {field: "email", type: "email", required: true},
        ],
        xssCheck: true,
      },
      undefined
    );

    const {email} = validatedData;

    const lockoutRef = getDb().collection("accountLockouts").doc(email.toLowerCase());
    const lockoutDoc = await lockoutRef.get();

    if (!lockoutDoc.exists) {
      return {
        isLocked: false,
        message: "Account is not locked.",
      };
    }

    const lockout = lockoutDoc.data() as AccountLockout;
    const now = new Date();
    const unlockTime = lockout.unlockAt.toDate();

    if (now >= unlockTime) {
      // Lockout has expired, remove it
      await lockoutRef.delete();

      // Also clean up old failed attempts
      const failedAttemptsRef = getDb().collection("failedLoginAttempts");
      const oldAttemptsSnapshot = await failedAttemptsRef
        .where("email", "==", email.toLowerCase())
        .where("timestamp", "<", Timestamp.fromDate(now))
        .get();

      const batch = getDb().batch();
      oldAttemptsSnapshot.forEach((doc) => {
        batch.delete(doc.ref);
      });
      await batch.commit();

      return {
        isLocked: false,
        message: "Account lockout has expired.",
      };
    }

    const minutesRemaining = Math.ceil((unlockTime.getTime() - now.getTime()) / (60 * 1000));

    return {
      isLocked: true,
      unlockAt: unlockTime.toISOString(),
      minutesRemaining,
      message: `Account is locked. Please try again in ${minutesRemaining} minutes.`,
    };
  }, "checkAccountLockout")
);

/**
 * Clear failed login attempts for a user (admin function)
 */
export const clearFailedLoginAttempts = onCall(
  {
    region: DEFAULT_REGION,
    timeoutSeconds: FUNCTION_TIMEOUT.SHORT,
  },
  withErrorHandling(async (request) => {
    // Check if the caller is an admin
    if (!request.auth) {
      throw createError(ErrorCode.UNAUTHENTICATED, "Authentication required");
    }

    const callerDoc = await getDb().collection("users").doc(request.auth.uid).get();
    if (!callerDoc.exists || !callerDoc.data()?.isAdmin) {
      throw createError(ErrorCode.PERMISSION_DENIED, "Admin access required");
    }

    // Validate and sanitize input
    const validatedData = validateRequest(
      request.data,
      {
        rules: [
          {field: "email", type: "email", required: true},
        ],
        xssCheck: true,
      },
      request.auth.uid
    );

    const {email} = validatedData;

    // Remove lockout
    const lockoutRef = getDb().collection("accountLockouts").doc(email.toLowerCase());
    await lockoutRef.delete();

    // Remove failed attempts
    const failedAttemptsRef = getDb().collection("failedLoginAttempts");
    const attemptsSnapshot = await failedAttemptsRef
      .where("email", "==", email.toLowerCase())
      .get();

    const batch = getDb().batch();
    attemptsSnapshot.forEach((doc) => {
      batch.delete(doc.ref);
    });
    await batch.commit();

    logger.info("Cleared failed login attempts", createLogContext({
      email,
      adminId: request.auth.uid,
      clearedAttempts: attemptsSnapshot.size,
    }));

    return {
      success: true,
      message: `Cleared ${attemptsSnapshot.size} failed login attempts for ${email}`,
    };
  }, "clearFailedLoginAttempts")
);

/**
 * Firebase Auth Blocking Function - runs before sign in
 * This prevents locked accounts from signing in
 */
export const beforeSignIn = beforeUserSignedIn(
  {
    region: DEFAULT_REGION,
    minInstances: 0,
    timeoutSeconds: 10,
  },
  async (event) => {
    const email = event.data?.email;

    if (!email) {
      // Allow sign in for non-email providers
      return;
    }

    logger.debug("Checking account lockout before sign in", createLogContext({
      email,
      uid: event.data?.uid,
    }));

    // Check if account is locked
    const lockoutRef = getDb().collection("accountLockouts").doc(email.toLowerCase());
    const lockoutDoc = await lockoutRef.get();

    if (!lockoutDoc.exists) {
      // No lockout, allow sign in
      return;
    }

    const lockout = lockoutDoc.data() as AccountLockout;
    const now = new Date();
    const unlockTime = lockout.unlockAt.toDate();

    if (now >= unlockTime) {
      // Lockout has expired, clean it up and allow sign in
      await lockoutRef.delete();
      return;
    }

    // Account is locked, prevent sign in
    const minutesRemaining = Math.ceil((unlockTime.getTime() - now.getTime()) / (60 * 1000));

    logger.warn("Blocked sign in attempt for locked account", createLogContext({
      email,
      uid: event.data?.uid,
      minutesRemaining,
    }));

    throw new Error(
      `Account locked due to too many failed login attempts. Please try again in ${minutesRemaining} minutes.`
    );
  }
);

/**
 * Clean up old failed login attempts (scheduled function)
 */
export const cleanupFailedAttempts = onCall(
  {
    region: DEFAULT_REGION,
    timeoutSeconds: FUNCTION_TIMEOUT.MEDIUM,
  },
  withErrorHandling(async () => {
    const cutoffTime = Timestamp.fromDate(
      new Date(Date.now() - 24 * 60 * 60 * 1000) // 24 hours ago
    );

    // Clean up old failed attempts
    const failedAttemptsRef = getDb().collection("failedLoginAttempts");
    const oldAttemptsSnapshot = await failedAttemptsRef
      .where("timestamp", "<", cutoffTime)
      .limit(500) // Process in batches
      .get();

    const batch = getDb().batch();
    oldAttemptsSnapshot.forEach((doc) => {
      batch.delete(doc.ref);
    });
    await batch.commit();

    // Clean up expired lockouts
    const lockoutsRef = getDb().collection("accountLockouts");
    const expiredLockoutsSnapshot = await lockoutsRef
      .where("unlockAt", "<", Timestamp.now())
      .limit(100)
      .get();

    const lockoutBatch = getDb().batch();
    expiredLockoutsSnapshot.forEach((doc) => {
      lockoutBatch.delete(doc.ref);
    });
    await lockoutBatch.commit();

    logger.info("Cleaned up old authentication data", createLogContext({
      failedAttemptsDeleted: oldAttemptsSnapshot.size,
      expiredLockoutsDeleted: expiredLockoutsSnapshot.size,
    }));

    return {
      failedAttemptsDeleted: oldAttemptsSnapshot.size,
      expiredLockoutsDeleted: expiredLockoutsSnapshot.size,
    };
  }, "cleanupFailedAttempts")
);
