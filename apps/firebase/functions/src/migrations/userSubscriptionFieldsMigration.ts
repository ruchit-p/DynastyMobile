import {onCall} from "firebase-functions/v2/https";
import {getFirestore} from "firebase-admin/firestore";
import {logger} from "firebase-functions/v2";
import {DEFAULT_REGION, FUNCTION_TIMEOUT} from "../common";
import {createError, withErrorHandling, ErrorCode} from "../utils/errors";
import {SubscriptionPlan, SubscriptionStatus} from "../types/subscription";
import {validateRequest} from "../utils/request-validator";
import {VALIDATION_SCHEMAS} from "../config/validation-schemas";

/**
 * Migration function to add subscription-related fields to existing user documents
 * This adds:
 * - subscriptionId - Reference to subscription document
 * - stripeCustomerId - Stripe customer ID for easy lookup
 * - subscriptionPlan - Quick reference (free/individual/family)
 * - subscriptionStatus - Quick reference (active/past_due/canceled/incomplete)
 * - storageUsedBytes - Current storage usage
 * - storageQuotaBytes - Total storage quota
 * - referralCode - User's unique referral code
 * - referredBy - Who referred this user
 * - familyPlanOwnerId - If member of family plan, the owner's ID
 */
export const migrateUserSubscriptionFields = onCall(
  {
    region: DEFAULT_REGION,
    memory: "1GiB",
    timeoutSeconds: FUNCTION_TIMEOUT.LONG,
  },
  withErrorHandling(async (request) => {
    // Check if user is authenticated
    const uid = request.auth?.uid;
    if (!uid) {
      throw createError(ErrorCode.UNAUTHENTICATED, "Authentication required");
    }

    // Check if user is admin
    const db = getFirestore();
    const userDoc = await db.collection("users").doc(uid).get();
    if (!userDoc.exists || !userDoc.data()?.isAdmin) {
      throw createError(ErrorCode.PERMISSION_DENIED, "Admin access required");
    }

    // Validate request data
    const validatedData = validateRequest(
      request.data,
      VALIDATION_SCHEMAS.migrateUserSubscriptionFields,
      uid
    );

    const {dryRun = true, batchSize = 500} = validatedData;

    logger.info(`Starting user subscription fields migration. Dry run: ${dryRun}`);

    let totalProcessed = 0;
    let totalUpdated = 0;
    let totalErrors = 0;
    const errors: string[] = [];

    // Process users in batches
    let lastDoc = null;
    let hasMore = true;

    while (hasMore) {
      let query = db.collection("users")
        .orderBy("createdAt")
        .limit(batchSize);

      if (lastDoc) {
        query = query.startAfter(lastDoc);
      }

      const snapshot = await query.get();

      if (snapshot.empty) {
        hasMore = false;
        break;
      }

      const batch = db.batch();
      let batchUpdates = 0;

      for (const doc of snapshot.docs) {
        totalProcessed++;
        const data = doc.data();
        const updates: any = {};

        try {
          // Check if subscription fields are missing and add defaults
          // Add subscriptionId if missing (will be null until user subscribes)
          if (data.subscriptionId === undefined) {
            updates.subscriptionId = null;
          }

          // Add stripeCustomerId if missing (will be null until user subscribes)
          if (data.stripeCustomerId === undefined) {
            updates.stripeCustomerId = null;
          }

          // Add subscriptionPlan if missing (default to free)
          if (data.subscriptionPlan === undefined) {
            updates.subscriptionPlan = SubscriptionPlan.FREE;
          }

          // Add subscriptionStatus if missing (default to active for free users)
          if (data.subscriptionStatus === undefined) {
            updates.subscriptionStatus = SubscriptionStatus.ACTIVE;
          }

          // Add storageUsedBytes if missing (default to 0)
          if (data.storageUsedBytes === undefined) {
            updates.storageUsedBytes = 0;
          }

          // Add storageQuotaBytes if missing (default to 1GB for free plan)
          if (data.storageQuotaBytes === undefined) {
            updates.storageQuotaBytes = 1073741824; // 1GB in bytes
          }

          // Generate unique referral code if missing
          if (data.referralCode === undefined) {
            // Generate a unique referral code using user ID and timestamp
            const timestamp = Date.now().toString(36).toUpperCase();
            const userIdHash = doc.id.substring(0, 6).toUpperCase();
            updates.referralCode = `DYN${userIdHash}${timestamp}`;
          }

          // Add referredBy if missing (will be null if not referred)
          if (data.referredBy === undefined) {
            updates.referredBy = null;
          }

          // Add familyPlanOwnerId if missing (will be null if not part of family plan)
          if (data.familyPlanOwnerId === undefined) {
            updates.familyPlanOwnerId = null;
          }

          // Only update if there are changes
          if (Object.keys(updates).length > 0) {
            updates.updatedAt = new Date(); // Always update the timestamp

            if (!dryRun) {
              batch.update(doc.ref, updates);
              batchUpdates++;
            }

            totalUpdated++;
            logger.info(`User ${doc.id} needs ${Object.keys(updates).length} subscription field updates`, {updates});
          }
        } catch (error) {
          totalErrors++;
          const errorMsg = `Error processing user ${doc.id}: ${error}`;
          logger.error(errorMsg);
          errors.push(errorMsg);
        }
      }

      // Commit batch if not dry run and there are updates
      if (!dryRun && batchUpdates > 0) {
        await batch.commit();
        logger.info(`Committed batch of ${batchUpdates} updates`);
      }

      // Set last document for pagination
      lastDoc = snapshot.docs[snapshot.docs.length - 1];
    }

    const summary = {
      dryRun,
      totalProcessed,
      totalUpdated,
      totalErrors,
      errors: errors.slice(0, 10), // Return first 10 errors
      message: dryRun ?
        `Dry run complete. Would update ${totalUpdated} out of ${totalProcessed} users.` :
        `Migration complete. Updated ${totalUpdated} out of ${totalProcessed} users.`,
    };

    logger.info("User subscription fields migration completed", summary);
    return summary;
  }, "migrateUserSubscriptionFields")
);

/**
 * Helper function to check a single user's subscription fields
 */
export const checkUserSubscriptionFields = onCall(
  {
    region: DEFAULT_REGION,
    timeoutSeconds: FUNCTION_TIMEOUT.SHORT,
  },
  withErrorHandling(async (request) => {
    // Validate request data
    const validatedData = validateRequest(
      request.data,
      VALIDATION_SCHEMAS.checkUserSubscriptionFields,
      request.auth?.uid
    );

    const {userId} = validatedData;

    const db = getFirestore();
    const userDoc = await db.collection("users").doc(userId).get();

    if (!userDoc.exists) {
      throw createError(ErrorCode.NOT_FOUND, "User not found");
    }

    const data = userDoc.data()!;
    const missingFields: string[] = [];

    // Check for missing subscription fields
    if (data.subscriptionId === undefined) {
      missingFields.push("subscriptionId");
    }
    if (data.stripeCustomerId === undefined) {
      missingFields.push("stripeCustomerId");
    }
    if (data.subscriptionPlan === undefined) {
      missingFields.push("subscriptionPlan");
    }
    if (data.subscriptionStatus === undefined) {
      missingFields.push("subscriptionStatus");
    }
    if (data.storageUsedBytes === undefined) {
      missingFields.push("storageUsedBytes");
    }
    if (data.storageQuotaBytes === undefined) {
      missingFields.push("storageQuotaBytes");
    }
    if (data.referralCode === undefined) {
      missingFields.push("referralCode");
    }
    if (data.referredBy === undefined) {
      missingFields.push("referredBy");
    }
    if (data.familyPlanOwnerId === undefined) {
      missingFields.push("familyPlanOwnerId");
    }

    return {
      userId,
      hasMissingFields: missingFields.length > 0,
      missingFields,
      currentSubscriptionData: {
        subscriptionId: data.subscriptionId,
        stripeCustomerId: data.stripeCustomerId,
        subscriptionPlan: data.subscriptionPlan,
        subscriptionStatus: data.subscriptionStatus,
        storageUsedBytes: data.storageUsedBytes,
        storageQuotaBytes: data.storageQuotaBytes,
        referralCode: data.referralCode,
        referredBy: data.referredBy,
        familyPlanOwnerId: data.familyPlanOwnerId,
      },
    };
  }, "checkUserSubscriptionFields")
);

/**
 * Helper function to generate unique referral codes for users who don't have one
 */
export const generateMissingReferralCodes = onCall(
  {
    region: DEFAULT_REGION,
    timeoutSeconds: FUNCTION_TIMEOUT.MEDIUM,
  },
  withErrorHandling(async (request) => {
    // Check if user is authenticated
    const uid = request.auth?.uid;
    if (!uid) {
      throw createError(ErrorCode.UNAUTHENTICATED, "Authentication required");
    }

    // Check if user is admin
    const db = getFirestore();
    const userDoc = await db.collection("users").doc(uid).get();
    if (!userDoc.exists || !userDoc.data()?.isAdmin) {
      throw createError(ErrorCode.PERMISSION_DENIED, "Admin access required");
    }

    // Validate request data
    const validatedData = validateRequest(
      request.data,
      VALIDATION_SCHEMAS.generateMissingReferralCodes,
      uid
    );

    const {dryRun = true} = validatedData;

    logger.info(`Generating missing referral codes. Dry run: ${dryRun}`);

    // Find all users without referral codes
    const snapshot = await db.collection("users")
      .where("referralCode", "==", null)
      .limit(500)
      .get();

    const updates: Array<{userId: string; referralCode: string}> = [];
    const batch = db.batch();

    for (const doc of snapshot.docs) {
      const timestamp = Date.now().toString(36).toUpperCase();
      const userIdHash = doc.id.substring(0, 6).toUpperCase();
      const referralCode = `DYN${userIdHash}${timestamp}`;

      updates.push({userId: doc.id, referralCode});

      if (!dryRun) {
        batch.update(doc.ref, {
          referralCode,
          updatedAt: new Date(),
        });
      }
    }

    if (!dryRun && updates.length > 0) {
      await batch.commit();
    }

    return {
      dryRun,
      totalGenerated: updates.length,
      referralCodes: updates.slice(0, 10), // Show first 10 as sample
      message: dryRun ?
        `Would generate ${updates.length} referral codes` :
        `Generated ${updates.length} referral codes`,
    };
  }, "generateMissingReferralCodes")
);
