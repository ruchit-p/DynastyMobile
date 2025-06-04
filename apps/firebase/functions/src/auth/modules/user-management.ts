import {onCall} from "firebase-functions/v2/https";
import {getFirestore, Timestamp} from "firebase-admin/firestore";
import {logger} from "firebase-functions/v2";
import {getStorage} from "firebase-admin/storage";
import {getAuth} from "firebase-admin/auth";
import {DEFAULT_REGION, FUNCTION_TIMEOUT} from "../../common";
import {createError, ErrorCode} from "../../utils/errors";
import {withResourceAccess, PermissionLevel} from "../../middleware";
import {UserDocument} from "../types/user";
import {MAX_OPERATIONS_PER_BATCH} from "../config/constants";
import {validateRequest} from "../../utils/request-validator";
import {VALIDATION_SCHEMAS} from "../../config/validation-schemas";
import {SECURITY_CONFIG} from "../../config/security-config";

/**
 * Handles cleanup when a user deletes their account.
 * Performs complete cleanup of user data including:
 * - User document
 * - Family relationships
 * - Stories
 * - Profile picture
 * - Family tree (if owner)
 */
export const handleAccountDeletion = onCall(
  {
    region: DEFAULT_REGION,
    timeoutSeconds: FUNCTION_TIMEOUT.MEDIUM,
    secrets: [],
  },
  withResourceAccess(
    async (request) => {
      // Validate and sanitize input using centralized validator
      const validatedData = validateRequest(
        request.data,
        VALIDATION_SCHEMAS.handleAccountDeletion,
        request.auth?.uid
      );

      const {userId} = validatedData;

      logger.info(`Starting account deletion for user ${userId}`);
      const db = getFirestore();
      const storage = getStorage();
      let batch = db.batch();
      let operationCount = 0;

      const commitBatchIfNeeded = async () => {
        if (operationCount >= MAX_OPERATIONS_PER_BATCH) {
          await batch.commit();
          batch = db.batch();
          operationCount = 0;
          logger.info(`Committed a batch during account deletion for ${userId}.`);
        }
      };

      const userDocRef = db.collection("users").doc(userId);
      const userDoc = await userDocRef.get();

      if (!userDoc.exists) {
        logger.warn(`User ${userId} not found during account deletion attempt.`);
        throw createError(ErrorCode.NOT_FOUND, `User ${userId} not found.`);
      }
      logger.info(`Found user document for ${userId}`);
      const userData = userDoc.data() as UserDocument;
      const familyTreeId = userData?.familyTreeId;
      logger.info(`User ${userId} family tree ID: ${familyTreeId}`);

      // Delete profile picture from storage if it exists
      if (userData?.profilePicture) {
        try {
          await storage.bucket().file(`profile-pictures/${userId}`).delete();
        } catch (error) {
          logger.warn(`Failed to delete profile picture for user ${userId}:`, error);
        }
      }

      if (familyTreeId) {
      // Get all users in the family tree
        const familyMembers = await db.collection("users")
          .where("familyTreeId", "==", familyTreeId)
          .get();

        // Check if user is the tree owner and if all other members are pending
        const isTreeOwner = userData?.isTreeOwner === true;
        const allMembersPending = familyMembers.docs.every((doc) => {
          const data = doc.data();
          return doc.id === userId || data.status === "pending";
        });

        // If user is tree owner and all others are pending, delete the tree and associated data
        if (isTreeOwner && allMembersPending) {
          logger.info(`Deleting family tree ${familyTreeId} and associated data`);

          // Delete all stories associated with the family tree
          const storiesSnapshot = await db.collection("stories")
            .where("familyTreeId", "==", familyTreeId)
            .get();

          storiesSnapshot.docs.forEach((doc) => {
            batch.delete(doc.ref);
            operationCount++;
          });
          await commitBatchIfNeeded();

          // Delete history book document if it exists
          const historyBookDocRef = db.collection("historyBooks").doc(familyTreeId);
          const historyBookDoc = await historyBookDocRef.get();

          if (historyBookDoc.exists) {
            batch.delete(historyBookDocRef);
            operationCount++;
            await commitBatchIfNeeded();
          }

          // Delete family tree document
          const familyTreeDocRef = db.collection("familyTrees").doc(familyTreeId);
          const familyTreeDoc = await familyTreeDocRef.get();

          if (familyTreeDoc.exists) {
            batch.delete(familyTreeDocRef);
            operationCount++;
            await commitBatchIfNeeded();
          }

          // Update status of pending members
          for (const doc of familyMembers.docs) {
            if (doc.id !== userId) {
              batch.update(doc.ref, {
                familyTreeId: null,
                status: null,
                isTreeOwner: false,
              });
              operationCount++;
              await commitBatchIfNeeded();
            }
          }
        } else {
        // If not tree owner or has active members, just remove user from tree
        // and update relationships
          const treeRef = db.collection("familyTrees").doc(familyTreeId);
          const treeDoc = await treeRef.get();
          if (treeDoc.exists) {
            const treeData = treeDoc.data();
            const memberUserIds = treeData?.memberUserIds?.filter((id: string) => id !== userId) || [];
            const adminUserIds = treeData?.adminUserIds?.filter((id: string) => id !== userId) || [];
            batch.update(treeRef, {
              memberUserIds,
              adminUserIds,
            });
            operationCount++;
            await commitBatchIfNeeded();
          }

          // Update relationships for all family members
          for (const memberDoc of familyMembers.docs) {
            if (memberDoc.id === userId) continue;
            const memberData = memberDoc.data();
            const updates: any = {};
            if (memberData.parentIds?.includes(userId)) {
              updates.parentIds = memberData.parentIds.filter((id: string) => id !== userId);
            }
            if (memberData.childrenIds?.includes(userId)) {
              updates.childrenIds = memberData.childrenIds.filter((id: string) => id !== userId);
            }
            if (memberData.spouseIds?.includes(userId)) {
              updates.spouseIds = memberData.spouseIds.filter((id: string) => id !== userId);
            }
            if (Object.keys(updates).length > 0) {
              batch.update(memberDoc.ref, updates);
              operationCount++;
              await commitBatchIfNeeded();
            }
          }
        }
      }

      // Delete user's own stories
      const userStoriesSnapshot = await db.collection("stories")
        .where("authorID", "==", userId)
        .get();

      logger.info(`Found ${userStoriesSnapshot.docs.length} stories to delete for user ${userId}`);
      userStoriesSnapshot.docs.forEach((doc) => {
        batch.delete(doc.ref);
        operationCount++;
      });
      await commitBatchIfNeeded();

      // Delete the user document
      batch.delete(userDocRef);
      operationCount++;

      // Commit any remaining changes in the current batch
      if (operationCount > 0) {
        await batch.commit();
        logger.info(`Committed final batch for account deletion of ${userId}.`);
      }
      logger.info(`Successfully processed all Firestore operations for user ${userId} account deletion.`);

      return {success: true};
    },
    "handleAccountDeletion",
    {
      resourceConfig: {
        resourceType: "user",
        resourceIdField: "userId",
        requiredLevel: PermissionLevel.PROFILE_OWNER,
        // Allow admins to delete any account as alternative permission
        additionalPermissionCheck: async (resource, uid) => {
          const db = getFirestore();
          const userDoc = await db.collection("users").doc(uid).get();
          return userDoc.exists && userDoc.data()?.isAdmin === true;
        },
      },
      rateLimitConfig: SECURITY_CONFIG.rateLimits.delete,
    }
  )
);

/**
 * Updates user profile information
 */
export const updateUserProfile = onCall(
  {
    region: DEFAULT_REGION,
    timeoutSeconds: FUNCTION_TIMEOUT.SHORT,
    secrets: [], // Accesses Firestore & Auth
  },
  withResourceAccess(
    async (request) => {
      // Validate and sanitize input using centralized validator
      const validatedData = validateRequest(
        request.data,
        VALIDATION_SCHEMAS.updateUserProfile,
        request.auth?.uid
      );

      const {uid, ...profileData} = validatedData;

      const db = getFirestore();
      const userRef = db.collection("users").doc(uid);

      // Prepare updates for Firestore, only include fields that are actually provided
      const firestoreUpdates: Partial<UserDocument> = {};
      if (profileData.displayName !== undefined) firestoreUpdates.displayName = profileData.displayName;
      if (profileData.firstName !== undefined) firestoreUpdates.firstName = profileData.firstName;
      if (profileData.lastName !== undefined) firestoreUpdates.lastName = profileData.lastName;
      if (profileData.gender !== undefined) firestoreUpdates.gender = profileData.gender;
      // if (profileData.dateOfBirth !== undefined) firestoreUpdates.dateOfBirth = Timestamp.fromDate(new Date(profileData.dateOfBirth));
      if (profileData.phoneNumber !== undefined) firestoreUpdates.phoneNumber = profileData.phoneNumber; // Handle phone verification separately if needed
      // Handle profile picture - convert string URL to proper object structure
      if (profileData.profilePicture !== undefined) {
        if (typeof profileData.profilePicture === "string") {
          firestoreUpdates.profilePicture = {url: profileData.profilePicture, path: ""};
        } else {
          firestoreUpdates.profilePicture = profileData.profilePicture;
        }
      }
      if (profileData.photoURL !== undefined) {
        // Support photoURL field name but convert to profilePicture object
        firestoreUpdates.profilePicture = {url: profileData.photoURL, path: ""};
      }
      if (profileData.onboardingCompleted !== undefined) firestoreUpdates.onboardingCompleted = profileData.onboardingCompleted;
      if (profileData.dataRetentionPeriod !== undefined) {
        firestoreUpdates.dataRetentionPeriod = profileData.dataRetentionPeriod;
        firestoreUpdates.dataRetentionLastUpdated = Timestamp.now().toDate();
      }
      // Add other updatable fields as necessary
      if (profileData.dateOfBirth !== undefined) {
        try {
          (firestoreUpdates as any).dateOfBirth = Timestamp.fromDate(new Date(profileData.dateOfBirth));
        } catch (e) {
          logger.warn(`Invalid dateOfBirth format for user ${uid} during update: ${profileData.dateOfBirth}`);
        }
      }


      firestoreUpdates.updatedAt = Timestamp.now().toDate();

      // Prepare updates for Firebase Auth (only a subset of fields can be updated here)
      const authUpdates: {displayName?: string; phoneNumber?: string; photoURL?: string} = {};
      if (profileData.displayName !== undefined) authUpdates.displayName = profileData.displayName;
      if (profileData.phoneNumber !== undefined) authUpdates.phoneNumber = profileData.phoneNumber; // Requires verification flow
      if (profileData.photoURL !== undefined) authUpdates.photoURL = profileData.photoURL;

      try {
        if (Object.keys(authUpdates).length > 0) {
          await getAuth().updateUser(uid, authUpdates);
          logger.info(`Firebase Auth profile updated for user ${uid}.`);
        }
        if (Object.keys(firestoreUpdates).length > 0) {
          await userRef.update(firestoreUpdates);
          logger.info(`Firestore profile updated for user ${uid}.`);
        }
        return {success: true, message: "Profile updated successfully."};
      } catch (error: any) {
        logger.error(`Error updating profile for user ${uid}:`, error);
        throw createError(ErrorCode.INTERNAL, "Failed to update profile.", {originalError: error.message});
      }
    },
    "updateUserProfile",
    {
      resourceConfig: {
        resourceType: "user",
        resourceIdField: "uid",
        requiredLevel: [PermissionLevel.PROFILE_OWNER, PermissionLevel.ADMIN],
      },
      rateLimitConfig: SECURITY_CONFIG.rateLimits.write,
    }
  )
);

/**
 * Updates user's data retention settings
 */
export const updateDataRetention = onCall({
  region: DEFAULT_REGION,
  memory: "512MiB",
  timeoutSeconds: FUNCTION_TIMEOUT.MEDIUM,
}, async (request) => {
  try {
    // Validate and sanitize input using centralized validator
    const validatedData = validateRequest(
      request.data,
      VALIDATION_SCHEMAS.updateDataRetention,
      request.auth?.uid
    );

    const {userId, retentionPeriod} = validatedData;
    logger.info(`Updating data retention settings for user ${userId} to ${retentionPeriod}`);

    const db = getFirestore();
    const userRef = db.collection("users").doc(userId);
    const userDoc = await userRef.get();

    if (!userDoc.exists) {
      throw new Error("User not found");
    }

    await userRef.update({
      dataRetentionPeriod: retentionPeriod,
      dataRetentionLastUpdated: new Date(),
      updatedAt: new Date(),
    });

    logger.info(`Successfully updated data retention settings for user ${userId}`);
    return {success: true};
  } catch (error) {
    logger.error("Error in updateDataRetention:", error);
    throw new Error(error instanceof Error ? error.message : "Failed to update data retention settings");
  }
});

/**
 * Retrieves a list of family members for a given family tree ID.
 * Ensures the calling user is part of that family tree.
 */
export const getFamilyMembers = onCall(
  {
    region: DEFAULT_REGION,
    timeoutSeconds: FUNCTION_TIMEOUT.SHORT,
    secrets: [], // Accesses Firestore
  },
  withResourceAccess(
    async (request) => {
      // Validate and sanitize input using centralized validator
      const validatedData = validateRequest(
        request.data,
        VALIDATION_SCHEMAS.getFamilyMembers,
        request.auth?.uid
      );

      const {familyTreeId} = validatedData;

      const db = getFirestore();
      const membersSnapshot = await db.collection("users")
        .where("familyTreeId", "==", familyTreeId)
        .orderBy("lastName") // Optional: order by a relevant field
        .orderBy("firstName")
        .get();

      if (membersSnapshot.empty) {
        return {familyMembers: [], message: "No members found in this family tree."};
      }

      const familyMembers = membersSnapshot.docs.map((doc) => {
        const memberData = doc.data() as UserDocument;
        // Selectively return fields to avoid exposing sensitive data unnecessarily
        return {
          id: doc.id,
          displayName: memberData.displayName,
          firstName: memberData.firstName,
          lastName: memberData.lastName,
          email: memberData.email, // Consider if email should always be returned
          // photoURL: memberData.photoURL,
          profilePictureUrl: memberData.profilePicture?.url,
          gender: memberData.gender,
        // Add other relevant non-sensitive fields
        };
      });

      return {familyMembers};
    },
    "getFamilyMembers",
    {
      resourceType: "family_tree",
      resourceIdField: "familyTreeId",
      requiredLevel: PermissionLevel.FAMILY_MEMBER,
    }
  )
);

/**
 * Get user settings including font preferences
 */
export const getUserSettings = onCall(
  {
    region: DEFAULT_REGION,
    timeoutSeconds: FUNCTION_TIMEOUT.SHORT,
  },
  async (request) => {
    const userId = request.auth?.uid;
    if (!userId) {
      throw createError(ErrorCode.UNAUTHENTICATED, "User not authenticated");
    }

    const db = getFirestore();
    const userRef = db.collection("users").doc(userId);
    const userDoc = await userRef.get();

    if (!userDoc.exists) {
      throw createError(ErrorCode.NOT_FOUND, "User not found");
    }

    const userData = userDoc.data() as UserDocument;

    return {
      fontSettings: userData.fontSettings || {
        fontScale: 1.0,
        useDeviceSettings: true,
      },
      notificationSettings: userData.notificationSettings,
      privacySettings: userData.privacySettings,
    };
  }
);

/**
 * Update user settings including font preferences
 */
export const updateUserSettings = onCall(
  {
    region: DEFAULT_REGION,
    timeoutSeconds: FUNCTION_TIMEOUT.SHORT,
  },
  async (request) => {
    const userId = request.auth?.uid;
    if (!userId) {
      throw createError(ErrorCode.UNAUTHENTICATED, "User not authenticated");
    }

    const {fontSettings, notificationSettings, privacySettings} = request.data;

    const db = getFirestore();
    const userRef = db.collection("users").doc(userId);

    const updates: Partial<UserDocument> = {
      updatedAt: Timestamp.now().toDate(),
    };

    if (fontSettings) {
      updates.fontSettings = {
        fontScale: fontSettings.fontScale || 1.0,
        useDeviceSettings: fontSettings.useDeviceSettings ?? true,
      };
    }

    if (notificationSettings) {
      updates.notificationSettings = notificationSettings;
    }

    if (privacySettings) {
      updates.privacySettings = privacySettings;
    }

    await userRef.update(updates);

    logger.info(`Updated settings for user ${userId}`);
    return {success: true};
  }
);

/**
 * Get user data for onboarding and profile status
 */
export const getUserData = onCall(
  {
    region: DEFAULT_REGION,
    timeoutSeconds: FUNCTION_TIMEOUT.SHORT,
  },
  async (request) => {
    const userId = request.auth?.uid;
    if (!userId) {
      throw createError(ErrorCode.UNAUTHENTICATED, "User not authenticated");
    }

    // Allow fetching another user's data only if it's provided in the request
    const targetUserId = request.data?.userId || userId;

    const db = getFirestore();
    const userRef = db.collection("users").doc(targetUserId);
    const userDoc = await userRef.get();

    if (!userDoc.exists) {
      return {
        success: false,
        message: "User not found",
        userData: null,
      };
    }

    const userData = userDoc.data() as UserDocument;

    // Return essential user data for onboarding and profile management
    return {
      success: true,
      userData: {
        onboardingCompleted: userData.onboardingCompleted || false,
        firstName: userData.firstName,
        lastName: userData.lastName,
        displayName: userData.displayName,
        dateOfBirth: userData.dateOfBirth,
        gender: userData.gender,
        phoneNumber: userData.phoneNumber,
        email: userData.email,
        familyTreeId: userData.familyTreeId,
        isAdmin: userData.isAdmin || false,
        status: userData.status,
        profilePicture: userData.profilePicture,
      },
    };
  }
);
