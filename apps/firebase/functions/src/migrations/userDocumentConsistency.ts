import {onCall} from "firebase-functions/v2/https";
import {getFirestore} from "firebase-admin/firestore";
import {logger} from "firebase-functions/v2";
import {DEFAULT_REGION, FUNCTION_TIMEOUT} from "../common";
import {createError, withErrorHandling, ErrorCode} from "../utils/errors";

/**
 * Migration function to ensure all user documents have consistent structure
 * This fixes:
 * - Missing required fields (parentIds, childrenIds, spouseIds, etc.)
 * - Incorrect field names (uid -> id)
 * - Profile picture structure (string URL -> object with url and path)
 * - Missing permission fields
 * - Missing status fields
 */
export const migrateUserDocumentConsistency = onCall(
  {
    region: DEFAULT_REGION,
    memory: "1GiB",
    timeoutSeconds: FUNCTION_TIMEOUT.LONG,
  },
  withErrorHandling(async (request) => {
    // Check if user is admin (implement your own admin check)
    const uid = request.auth?.uid;
    if (!uid) {
      throw createError(ErrorCode.UNAUTHENTICATED, "Authentication required");
    }

    // TODO: Add proper admin check
    // const userDoc = await getFirestore().collection("users").doc(uid).get();
    // if (!userDoc.exists || !userDoc.data()?.isAdmin) {
    //   throw createError(ErrorCode.PERMISSION_DENIED, "Admin access required");
    // }

    const {dryRun = true, batchSize = 500} = request.data;
    const db = getFirestore();

    logger.info(`Starting user document consistency migration. Dry run: ${dryRun}`);

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
          // Fix 'uid' field to 'id'
          if (data.uid && !data.id) {
            updates.id = data.uid;
            logger.info(`Fixing uid->id for user ${doc.id}`);
          }

          // Ensure required arrays exist
          if (!Array.isArray(data.parentIds)) {
            updates.parentIds = [];
          }
          if (!Array.isArray(data.childrenIds)) {
            updates.childrenIds = [];
          }
          if (!Array.isArray(data.spouseIds)) {
            updates.spouseIds = [];
          }

          // Ensure permission fields exist
          if (data.isAdmin === undefined) {
            updates.isAdmin = false;
          }
          if (data.canAddMembers === undefined) {
            updates.canAddMembers = false;
          }
          if (data.canEdit === undefined) {
            updates.canEdit = false;
          }

          // Ensure status fields exist
          if (data.isPendingSignUp === undefined) {
            updates.isPendingSignUp = false;
          }
          if (data.phoneNumberVerified === undefined) {
            updates.phoneNumberVerified = false;
          }
          if (data.emailVerified === undefined) {
            updates.emailVerified = false;
          }
          if (data.onboardingCompleted === undefined) {
            updates.onboardingCompleted = true; // Assume old users completed onboarding
          }

          // Fix profile picture structure
          if (data.photoURL && !data.profilePicture) {
            updates.profilePicture = {url: data.photoURL, path: ""};
            logger.info(`Converting photoURL to profilePicture for user ${doc.id}`);
          } else if (data.profilePicture && typeof data.profilePicture === "string") {
            updates.profilePicture = {url: data.profilePicture, path: ""};
            logger.info(`Converting profilePicture string to object for user ${doc.id}`);
          }

          // Ensure data retention fields
          if (!data.dataRetentionPeriod) {
            updates.dataRetentionPeriod = "forever";
            updates.dataRetentionLastUpdated = new Date();
          }

          // Ensure timestamp fields
          if (!data.createdAt) {
            updates.createdAt = new Date();
          }
          if (!data.updatedAt) {
            updates.updatedAt = new Date();
          }

          // Only update if there are changes
          if (Object.keys(updates).length > 0) {
            updates.updatedAt = new Date(); // Always update the timestamp

            if (!dryRun) {
              batch.update(doc.ref, updates);
              batchUpdates++;
            }

            totalUpdated++;
            logger.info(`User ${doc.id} needs ${Object.keys(updates).length} updates`, {updates});
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

    logger.info("User document consistency migration completed", summary);
    return summary;
  }, "migrateUserDocumentConsistency")
);

/**
 * Helper function to check a single user's document consistency
 */
export const checkUserDocumentConsistency = onCall(
  {
    region: DEFAULT_REGION,
    timeoutSeconds: FUNCTION_TIMEOUT.SHORT,
  },
  withErrorHandling(async (request) => {
    const {userId} = request.data;

    if (!userId) {
      throw createError(ErrorCode.INVALID_ARGUMENT, "userId is required");
    }

    const db = getFirestore();
    const userDoc = await db.collection("users").doc(userId).get();

    if (!userDoc.exists) {
      throw createError(ErrorCode.NOT_FOUND, "User not found");
    }

    const data = userDoc.data()!;
    const issues: string[] = [];

    // Check for issues
    if (data.uid && !data.id) {
      issues.push("Has 'uid' field instead of 'id'");
    }
    if (!Array.isArray(data.parentIds)) {
      issues.push("Missing parentIds array");
    }
    if (!Array.isArray(data.childrenIds)) {
      issues.push("Missing childrenIds array");
    }
    if (!Array.isArray(data.spouseIds)) {
      issues.push("Missing spouseIds array");
    }
    if (data.isAdmin === undefined) {
      issues.push("Missing isAdmin field");
    }
    if (data.canAddMembers === undefined) {
      issues.push("Missing canAddMembers field");
    }
    if (data.canEdit === undefined) {
      issues.push("Missing canEdit field");
    }
    if (data.isPendingSignUp === undefined) {
      issues.push("Missing isPendingSignUp field");
    }
    if (data.phoneNumberVerified === undefined) {
      issues.push("Missing phoneNumberVerified field");
    }
    if (data.photoURL && !data.profilePicture) {
      issues.push("Has photoURL but no profilePicture");
    }
    if (data.profilePicture && typeof data.profilePicture === "string") {
      issues.push("profilePicture is string instead of object");
    }
    if (!data.dataRetentionPeriod) {
      issues.push("Missing dataRetentionPeriod");
    }

    return {
      userId,
      hasIssues: issues.length > 0,
      issues,
      documentSnapshot: data,
    };
  }, "checkUserDocumentConsistency")
);
