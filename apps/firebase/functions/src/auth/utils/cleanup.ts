import {onSchedule} from "firebase-functions/v2/scheduler";
import {getFirestore} from "firebase-admin/firestore";
import {logger} from "firebase-functions/v2";
import {DEFAULT_REGION, FUNCTION_TIMEOUT} from "../../common";
import {CLEANUP_INTERVALS} from "../config/constants";

/**
 * Helper function to cleanup expired tokens
 */
export const cleanupExpiredTokens = async () => {
  const db = getFirestore();
  const now = new Date();

  try {
    // Clean up expired email verification tokens in users collection
    const usersRef = db.collection("users");
    const expiredVerificationTokensQuery = usersRef.where("emailVerificationExpires", "<", now);
    const verificationTokensSnapshot = await expiredVerificationTokensQuery.get();

    if (verificationTokensSnapshot.size > 0) {
      const batch = db.batch();
      verificationTokensSnapshot.docs.forEach((doc) => {
        batch.update(doc.ref, {
          emailVerificationToken: null,
          emailVerificationExpires: null,
        });
      });
      await batch.commit();
      logger.info(`Cleaned up ${verificationTokensSnapshot.size} expired verification tokens`);
    }

    // Clean up expired passwordless tokens
    const passwordlessTokensRef = db.collection("passwordlessTokens");
    const expiredPasswordlessTokensQuery = passwordlessTokensRef.where("expiresAt", "<", now);
    const passwordlessTokensSnapshot = await expiredPasswordlessTokensQuery.get();

    if (passwordlessTokensSnapshot.size > 0) {
      const batch = db.batch();
      passwordlessTokensSnapshot.docs.forEach((doc) => {
        batch.delete(doc.ref);
      });
      await batch.commit();
      logger.info(`Cleaned up ${passwordlessTokensSnapshot.size} expired passwordless tokens`);
    }

    return {
      verificationTokensCleaned: verificationTokensSnapshot.size,
      passwordlessTokensCleaned: passwordlessTokensSnapshot.size,
    };
  } catch (error) {
    logger.error("Error cleaning up expired tokens:", error);
    throw error;
  }
};

/**
 * Scheduled function to clean up expired tokens
 */
export const scheduledTokenCleanup = onSchedule(
  {
    schedule: CLEANUP_INTERVALS.TOKEN_CLEANUP,
    region: DEFAULT_REGION,
    timeoutSeconds: FUNCTION_TIMEOUT.MEDIUM,
    secrets: [],
  },
  async () => {
    try {
      logger.info("Scheduled token cleanup started.");
      const result = await cleanupExpiredTokens();
      logger.info("Scheduled token cleanup finished successfully.", result);
    } catch (error) {
      logger.error("Error in scheduled token cleanup:", error);
    }
  }
);
