import {onCall} from "firebase-functions/v2/https";
import {onSchedule} from "firebase-functions/v2/scheduler";
import {getFirestore, Timestamp} from "firebase-admin/firestore";
import {logger} from "firebase-functions";
import {getStorage} from "firebase-admin/storage";
import {getAuth} from "firebase-admin/auth";
import * as crypto from "crypto";
import sgMail, {MailDataRequired} from "@sendgrid/mail";
import {
  isValidEmail,
  isValidPassword,
} from "./utils/validation";
import * as functions from "firebase-functions";
import {defineSecret} from "firebase-functions/params";
import {DEFAULT_REGION, FUNCTION_TIMEOUT} from "./common";
import type {SignupData} from "./utils/validation";

// MARK: - Secret Definitions
const SENDGRID_APIKEY = defineSecret("SENDGRID_APIKEY");
const SENDGRID_FROMEMAIL = defineSecret("SENDGRID_FROMEMAIL");
const SENDGRID_TEMPLATES_VERIFICATION = defineSecret("SENDGRID_TEMPLATES_VERIFICATION");
const SENDGRID_TEMPLATES_PASSWORDRESET = defineSecret("SENDGRID_TEMPLATES_PASSWORDRESET");
const SENDGRID_TEMPLATES_INVITE = defineSecret("SENDGRID_TEMPLATES_INVITE");
const FRONTEND_URL = defineSecret("FRONTEND_URL");

// MARK: - Helper function to initialize SendGrid within each function
const initSendGrid = () => {
  const apiKey = SENDGRID_APIKEY.value();
  if (!apiKey || apiKey.length === 0) {
    throw new Error("SendGrid API key is not set");
  }
  sgMail.setApiKey(apiKey);
};

// Fix the UserDocument interface
export interface UserDocument {
  id: string;
  email: string;
  displayName?: string;
  firstName?: string;
  lastName?: string;
  phoneNumber?: string | null;
  phoneNumberVerified?: boolean;
  parentIds: string[];
  childrenIds: string[];
  spouseIds: string[];
  familyTreeId?: string;
  historyBookId?: string;
  gender?: "male" | "female" | "other" | "unspecified";
  isAdmin: boolean;
  canAddMembers: boolean;
  canEdit: boolean;
  createdAt: Date;
  updatedAt: Date;
  emailVerified: boolean;
  emailVerificationToken?: string;
  emailVerificationExpires?: Date | any;
  isPendingSignUp: boolean;
  dataRetentionPeriod: "forever" | "year" | "month" | "week";
  dataRetentionLastUpdated: Date;
  onboardingCompleted: boolean;
  invitationId?: string;
}

// Add rate limiting interface
interface RateLimitData {
  attempts: number;
  windowStart: FirebaseFirestore.Timestamp;
}

// Add interface for invitation data
interface InvitationData {
  inviteeId: string;
  inviteeName: string;
  inviteeEmail: string;
  inviterId: string;
  inviterName: string;
  familyTreeId: string;
  familyTreeName: string;
  invitationToken?: string;
  invitationExpires?: FirebaseFirestore.Timestamp;
  // Additional prefill data
  firstName: string;
  lastName: string;
  dateOfBirth?: Date;
  gender?: string;
  phoneNumber?: string;
  relationship?: string;
}

// Standard error messages
const ERROR_MESSAGES = {
  INVALID_TOKEN: "Invalid verification link. Please request a new verification email.",
  EXPIRED_TOKEN: "Verification link has expired. Please request a new verification email.",
  RATE_LIMIT: "Too many attempts. Please try again later.",
  EMAIL_SEND_FAILED: "Unable to send verification email. Please try again later.",
  USER_NOT_FOUND: "Unable to process request. Please try again.",
  INVALID_REQUEST: "Invalid request. Please try again.",
  VERIFICATION_FAILED: "Email verification failed. Please try again.",
} as const;

// Helper function to generate a secure random token
const generateSecureToken = (): string => {
  const token = crypto.randomBytes(32).toString("hex");
  logger.debug("Generated new token:", {
    tokenLength: token.length,
    tokenFirstChars: token.substring(0, 4),
    tokenLastChars: token.substring(token.length - 4),
  });
  return token;
};

// Helper function to hash a token
const hashToken = (token: string): string => {
  const hashedToken = crypto.createHash("sha256").update(token).digest("hex");
  logger.debug("Hashed token:", {
    originalTokenLength: token.length,
    hashedTokenLength: hashedToken.length,
    originalTokenFirstChars: token.substring(0, 4),
    hashedTokenFirstChars: hashedToken.substring(0, 4),
  });
  return hashedToken;
};

// Helper function to check rate limit
const checkRateLimit = async (userId: string): Promise<boolean> => {
  const db = getFirestore();
  const rateLimitRef = db.collection("rateLimits").doc(userId);
  const rateLimitDoc = await rateLimitRef.get();

  const now = Timestamp.now();
  const hourAgo = new Timestamp(now.seconds - 3600, now.nanoseconds);

  if (!rateLimitDoc.exists) {
    await rateLimitRef.set({
      attempts: 1,
      windowStart: now,
    });
    return true;
  }

  const data = rateLimitDoc.data() as RateLimitData;
  if (data.windowStart.toDate() < hourAgo.toDate()) {
    // Reset window if it's been more than an hour
    await rateLimitRef.set({
      attempts: 1,
      windowStart: now,
    });
    return true;
  }

  if (data.attempts >= 3) {
    return false;
  }

  await rateLimitRef.update({
    attempts: data.attempts + 1,
  });
  return true;
};

// Helper function to cleanup expired tokens
const cleanupExpiredTokens = async () => {
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

// Fix the scheduledTokenCleanup function correctly
export const scheduledTokenCleanup = onSchedule("every 1 hours", async () => {
  try {
    await cleanupExpiredTokens();
  } catch (error) {
    logger.error("Error in scheduled token cleanup:", error);
  }
});

/**
 * Handles cleanup when a user deletes their account.
 * Performs complete cleanup of user data including:
 * - User document
 * - Family relationships
 * - Stories
 * - Profile picture
 * - Family tree (if owner)
 */
export const handleAccountDeletion = onCall({
  region: DEFAULT_REGION,
  timeoutSeconds: FUNCTION_TIMEOUT.MEDIUM,
}, async (request) => {
  try {
    const {userId} = request.data;
    logger.info(`Starting account deletion for user ${userId}`);
    const db = getFirestore();
    const batch = db.batch();
    const storage = getStorage();

    // Get the user's data
    const userDoc = await db.collection("users").doc(userId).get();
    if (!userDoc.exists) {
      logger.error(`User ${userId} not found`);
      throw new Error("User not found");
    }
    logger.info(`Found user document for ${userId}`);

    const userData = userDoc.data();
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
        });

        // Delete history book document if it exists
        const historyBookDoc = await db.collection("historyBooks")
          .doc(familyTreeId)
          .get();

        if (historyBookDoc.exists) {
          batch.delete(historyBookDoc.ref);
        }

        // Delete family tree document
        const familyTreeDoc = await db.collection("familyTrees")
          .doc(familyTreeId)
          .get();

        if (familyTreeDoc.exists) {
          batch.delete(familyTreeDoc.ref);
        }

        // Update status of pending members
        familyMembers.docs.forEach((doc) => {
          if (doc.id !== userId) {
            batch.update(doc.ref, {
              familyTreeId: null,
              status: null,
              isTreeOwner: false,
            });
          }
        });
      } else {
        // If not tree owner or has active members, just remove user from tree
        // and update relationships
        // Remove user from family tree members array
        const treeRef = db.collection("familyTrees").doc(familyTreeId);
        const treeDoc = await treeRef.get();
        if (treeDoc.exists) {
          const treeData = treeDoc.data();
          batch.update(treeRef, {
            memberUserIds: treeData?.memberUserIds.filter((id: string) => id !== userId) || [],
            adminUserIds: treeData?.adminUserIds.filter((id: string) => id !== userId) || [],
          });
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
    });

    // Delete the user document
    batch.delete(userDoc.ref);
    logger.info(`Added user document deletion to batch for ${userId}`);

    // Commit all the changes
    await batch.commit();
    logger.info(`Successfully committed all changes for user ${userId}`);

    return {success: true};
  } catch (error) {
    logger.error("Error in handleAccountDeletion:", error);
    throw new Error(error instanceof Error ? error.message : "Failed to cleanup user data");
  }
});

/**
 * Updates user profile information
 */
export const updateUserProfile = onCall({
  region: DEFAULT_REGION,
  memory: "512MiB",
  timeoutSeconds: FUNCTION_TIMEOUT.MEDIUM,
}, async (request) => {
  try {
    const {userId, updates} = request.data;
    const callerUid = request.auth?.uid;

    // Verify authentication and authorization
    if (!callerUid) {
      throw new Error("Authentication required");
    }

    if (userId !== callerUid) {
      throw new Error("You can only update your own profile");
    }

    logger.info(`Updating profile for user ${userId}`);
    const db = getFirestore();

    // Get the user document
    const userRef = db.collection("users").doc(userId);
    const userDoc = await userRef.get();

    if (!userDoc.exists) {
      throw new Error("User not found");
    }

    // Validate date of birth if provided
    if (updates.dateOfBirth && !(updates.dateOfBirth instanceof Date)) {
      if (typeof updates.dateOfBirth === "string") {
        updates.dateOfBirth = new Date(updates.dateOfBirth);
      } else {
        throw new Error("Invalid date of birth format");
      }
    }

    // Add timestamp to updates
    const updatedData = {
      ...updates,
      updatedAt: new Date(),
    };

    // Create displayName from first and last name if both are provided
    if (updates.firstName && updates.lastName) {
      updatedData.displayName = `${updates.firstName} ${updates.lastName}`.trim();
    }

    await userRef.update(updatedData);
    logger.info(`Successfully updated profile for user ${userId}`);

    return {success: true};
  } catch (error) {
    logger.error("Error in updateUserProfile:", error);
    throw new Error(error instanceof Error ? error.message : "Failed to update profile");
  }
});

/**
 * Updates user password
 */
export const updateUserPassword = onCall({
  region: DEFAULT_REGION,
  memory: "512MiB",
  timeoutSeconds: FUNCTION_TIMEOUT.MEDIUM,
}, async (request) => {
  try {
    const {userId} = request.data;
    logger.info(`Updating password for user ${userId}`);

    // Verify the user exists
    const auth = getAuth();
    try {
      const user = await auth.getUser(userId);
      if (!user) {
        throw new Error("User not found");
      }

      // Note: Password update should be handled on the client side
      // using Firebase Auth's updatePassword method
      return {success: true};
    } catch (error) {
      logger.error("Failed to verify user:", error);
      throw new Error("Failed to verify user");
    }
  } catch (error) {
    logger.error("Error in updateUserPassword:", error);
    throw new Error(error instanceof Error ? error.message : "Failed to verify user");
  }
});

/**
 * Initiates password reset process by:
 * - Generating a password reset link
 * - Sending the reset email via SendGrid
 */
export const initiatePasswordReset = onCall({
  region: DEFAULT_REGION,
  memory: "512MiB",
  timeoutSeconds: FUNCTION_TIMEOUT.MEDIUM,
  secrets: [SENDGRID_APIKEY, SENDGRID_FROMEMAIL, SENDGRID_TEMPLATES_PASSWORDRESET, FRONTEND_URL],
}, async (request) => {
  try {
    const {email} = request.data;
    logger.info(`Initiating password reset for email ${email}`);

    // Initialize SendGrid
    initSendGrid();

    const auth = getAuth();

    // Generate the password reset link
    const resetLink = await auth.generatePasswordResetLink(email);

    // Get user details for the email template
    const userRecord = await auth.getUserByEmail(email);
    const displayName = userRecord.displayName || "User";

    // Send email using SendGrid template
    const msg: MailDataRequired = {
      to: email,
      from: SENDGRID_FROMEMAIL.value(),
      templateId: SENDGRID_TEMPLATES_PASSWORDRESET.value(),
      dynamicTemplateData: {
        username: displayName,
        resetLink: resetLink,
      },
    };

    await sgMail.send(msg);
    logger.info(`Successfully sent password reset email to ${email}`);

    return {success: true};
  } catch (error) {
    logger.error("Error in initiatePasswordReset:", error);
    throw new Error(error instanceof Error ? error.message : "Failed to initiate password reset");
  }
});

/**
 * Sends a verification email to a newly registered user
 */
export const sendVerificationEmail = onCall({
  region: DEFAULT_REGION,
  memory: "512MiB",
  timeoutSeconds: FUNCTION_TIMEOUT.MEDIUM,
  secrets: [SENDGRID_APIKEY, SENDGRID_FROMEMAIL, SENDGRID_TEMPLATES_VERIFICATION, FRONTEND_URL],
}, async (request) => {
  const {userId, email, displayName} = request.data;
  logger.info(`Starting verification email process for user ${userId}`);

  try {
    // Initialize SendGrid
    initSendGrid();

    // Input validation
    if (!userId || !email || !displayName) {
      throw new Error(ERROR_MESSAGES.INVALID_REQUEST);
    }

    // Check rate limit before proceeding
    const isWithinLimit = await checkRateLimit(userId);
    if (!isWithinLimit) {
      throw new Error(ERROR_MESSAGES.RATE_LIMIT);
    }

    // Clean up any expired tokens
    await cleanupExpiredTokens();

    // Generate verification token
    const verificationToken = generateSecureToken();
    const hashedToken = hashToken(verificationToken);

    // Set expiry time to 30 minutes from now in UTC
    const now = new Date();
    const expiryTime = new Date(now.getTime() + 30 * 60 * 1000);

    // Convert to Firestore Timestamp
    const firestoreExpiry = Timestamp.fromDate(expiryTime);

    // Store the hashed token in Firestore
    const db = getFirestore();
    await db.collection("users").doc(userId).update({
      emailVerificationToken: hashedToken,
      emailVerificationExpires: firestoreExpiry,
      emailVerified: false,
    });

    // Create verification link
    const verificationLink = `${FRONTEND_URL.value()}/verify-email/confirm?uid=${userId}&token=${verificationToken}`;

    // Send email using SendGrid template
    const msg: MailDataRequired = {
      to: email,
      from: SENDGRID_FROMEMAIL.value(),
      templateId: SENDGRID_TEMPLATES_VERIFICATION.value(),
      dynamicTemplateData: {
        username: displayName,
        verificationLink: verificationLink,
        expiryTime: expiryTime.toUTCString(),
      },
    };

    await sgMail.send(msg);
    logger.info(`Verification email sent to ${email}`);

    return {success: true};
  } catch (error) {
    logger.error("Error sending verification email:", error);
    const errorMessage = error instanceof Error ?
      error.message :
      ERROR_MESSAGES.EMAIL_SEND_FAILED;
    throw new Error(errorMessage);
  }
});

/**
 * Verifies a user's email address using the token from the verification link
 */
export const verifyEmail = onCall({
  region: DEFAULT_REGION,
  memory: "512MiB",
  timeoutSeconds: FUNCTION_TIMEOUT.MEDIUM,
}, async (request) => {
  const {userId, token} = request.data;
  logger.info(`Starting email verification process for user ${userId}`);

  try {
    // First check if user exists in Firebase Auth
    const auth = getAuth();
    let authUser;
    try {
      authUser = await auth.getUser(userId);
    } catch (authError) {
      logger.error(`Firebase Auth user ${userId} not found:`, authError);
      throw new Error(ERROR_MESSAGES.USER_NOT_FOUND);
    }

    // Then check Firestore
    const db = getFirestore();
    const userDoc = await db.collection("users").doc(userId).get();

    // If user exists in Auth but not in Firestore, create a minimal Firestore document
    if (!userDoc.exists && authUser) {
      logger.info(`Creating minimal Firestore document for user ${userId}`);

      // Create minimal user document
      await db.collection("users").doc(userId).set({
        id: userId,
        email: authUser.email || "",
        displayName: authUser.displayName || "User",
        firstName: authUser.displayName?.split(" ")[0] || "User",
        lastName: authUser.displayName?.split(" ")[1] || "",
        phoneNumber: authUser.phoneNumber || null,
        parentIds: [],
        childrenIds: [],
        spouseIds: [],
        isAdmin: true,
        canAddMembers: true,
        canEdit: true,
        isPendingSignUp: false,
        createdAt: new Date(),
        updatedAt: new Date(),
        gender: "other",
        emailVerified: true,
        dataRetentionPeriod: "forever",
        dataRetentionLastUpdated: new Date(),
        onboardingCompleted: false,
      });

      // Update Firebase Auth user
      await auth.updateUser(userId, {
        emailVerified: true,
      });

      logger.info(`Successfully created minimal Firestore document and verified email for user ${userId}`);
      return {success: true};
    }

    // Normal verification flow for existing Firestore users
    const userData = userDoc.data() as UserDocument;

    // Log the stored token details (masked)
    logger.debug("Token verification attempt:", {
      userId,
      hasStoredToken: !!userData.emailVerificationToken,
      tokenLength: userData.emailVerificationToken?.length,
    });

    // Check if token exists
    if (!userData.emailVerificationToken || !userData.emailVerificationExpires) {
      logger.error(`No verification token found for user ${userId}`);
      throw new Error(ERROR_MESSAGES.INVALID_TOKEN);
    }

    const hashedToken = hashToken(token);

    // Check if token matches
    if (userData.emailVerificationToken !== hashedToken) {
      logger.error(`Invalid token for user ${userId}`);
      throw new Error(ERROR_MESSAGES.INVALID_TOKEN);
    }

    // Get expiry time as Date object
    let expiryDate: Date;
    if (userData.emailVerificationExpires instanceof Date) {
      expiryDate = userData.emailVerificationExpires;
    } else if (userData.emailVerificationExpires) {
      try {
        // Try to use toDate() if available (for Firestore Timestamp)
        expiryDate = userData.emailVerificationExpires.toDate();
      } catch (error) {
        // If toDate() fails, use current date
        expiryDate = new Date();
        logger.warn("Could not convert emailVerificationExpires to Date", error);
      }
    } else {
      // If emailVerificationExpires is undefined
      expiryDate = new Date();
    }

    // Compare with current UTC time
    const now = new Date();

    if (now > expiryDate) {
      logger.error(`Token expired for user ${userId}`);
      throw new Error(ERROR_MESSAGES.EXPIRED_TOKEN);
    }

    // Update user document
    await db.collection("users").doc(userId).update({
      emailVerified: true,
      emailVerificationToken: null,
      emailVerificationExpires: null,
    });

    // Update Firebase Auth user
    await auth.updateUser(userId, {
      emailVerified: true,
    });

    logger.info(`Email verified successfully for user ${userId}`);
    return {success: true};
  } catch (error) {
    logger.error("Error verifying email:", error);
    const errorMessage = error instanceof Error ?
      error.message :
      ERROR_MESSAGES.VERIFICATION_FAILED;
    throw new Error(errorMessage);
  }
});

/**
 * Handles the signup process, which now only:
 * - Creates Firebase Auth account
 * - Sends verification email
 *
 * Firestore document creation is now handled in completeOnboarding
 */
export const handleSignUp = onCall({
  region: DEFAULT_REGION,
  memory: "512MiB",
  timeoutSeconds: FUNCTION_TIMEOUT.MEDIUM,
  secrets: [SENDGRID_APIKEY, SENDGRID_FROMEMAIL, SENDGRID_TEMPLATES_VERIFICATION, FRONTEND_URL],
}, async (request) => {
  const signupData: SignupData = request.data;
  logger.info(`Starting simplified signup process for email: ${signupData.email}`);

  try {
    // Initialize SendGrid
    initSendGrid();

    // Validate email and password
    if (!isValidEmail(signupData.email)) {
      throw new Error("Invalid email address");
    }

    if (!isValidPassword(signupData.password)) {
      throw new Error("Password must be at least 8 characters and include numbers and letters");
    }

    const auth = getAuth();
    const db = getFirestore();

    // Check if email already exists
    try {
      await auth.getUserByEmail(signupData.email);
      throw new functions.https.HttpsError(
        "already-exists",
        "An account with this email already exists"
      );
    } catch (error: any) {
      // Proceed only if error code is auth/user-not-found
      if (error.code !== "auth/user-not-found") {
        if (error instanceof functions.https.HttpsError) {
          throw error;
        }
        throw new functions.https.HttpsError(
          "already-exists",
          "An account with this email already exists"
        );
      }
    }

    // Create the Firebase Auth account
    const userRecord = await auth.createUser({
      email: signupData.email,
      password: signupData.password,
      emailVerified: false,
    });

    const userId = userRecord.uid;

    // Create a minimal user document in Firestore
    // This is needed so that we can later update it with onboarding data
    const userRef = db.collection("users").doc(userId);
    await userRef.set({
      id: userId,
      email: signupData.email,
      createdAt: new Date(),
      updatedAt: new Date(),
      emailVerified: false,
      onboardingCompleted: false,
      dataRetentionPeriod: "forever",
      dataRetentionLastUpdated: new Date(),
    });

    // Generate verification token and send verification email
    const verificationToken = generateSecureToken();
    const hashedToken = hashToken(verificationToken);
    const expiryTime = new Date();
    expiryTime.setMinutes(expiryTime.getMinutes() + 30); // Token expires in 30 minutes

    // Update user document with verification token
    await userRef.update({
      emailVerificationToken: hashedToken,
      emailVerificationExpires: expiryTime,
    });

    // Send verification email
    const verificationLink = `${FRONTEND_URL.value()}/verify-email/confirm?uid=${userId}&token=${verificationToken}`;
    const msg: MailDataRequired = {
      to: signupData.email,
      from: SENDGRID_FROMEMAIL.value(),
      templateId: SENDGRID_TEMPLATES_VERIFICATION.value(),
      dynamicTemplateData: {
        username: signupData.email.split("@")[0], // Use email username as fallback since we don't have names yet
        verificationLink: verificationLink,
      },
    };

    await sgMail.send(msg);
    logger.info(`Successfully completed simplified signup process for user ${userId}`);

    return {
      success: true,
      userId,
    };
  } catch (error) {
    logger.error("Error in handleSignUp:", error);
    throw new Error(error instanceof Error ? error.message : "Failed to complete signup process");
  }
});

/**
 * Handles the onboarding process, which:
 * - Updates the user document with profile information
 * - Creates family tree document (for new users) or links to existing tree (for invited users)
 * - Creates history book document
 * - Sets up necessary relationships
 * - Handles migration of data for invited users
 */
export const completeOnboarding = onCall({
  region: DEFAULT_REGION,
  memory: "512MiB",
  timeoutSeconds: FUNCTION_TIMEOUT.MEDIUM,
}, async (request) => {
  const {userId, firstName, lastName, dateOfBirth, gender, phoneNumber, displayName} = request.data;

  logger.info(`Starting onboarding process for user: ${userId}`);

  try {
    const db = getFirestore();
    const auth = getAuth();

    // Validate inputs
    if (!userId || !firstName || !lastName) {
      throw new Error("Required fields missing. Please provide userId, firstName, and lastName.");
    }

    // Get the Auth user
    let authUser;
    try {
      authUser = await auth.getUser(userId);
    } catch (error) {
      logger.error(`Auth user not found for ID: ${userId}`, error);
      throw new Error("Auth user not found. Please sign up first.");
    }

    // Get the user document
    const userRef = db.collection("users").doc(userId);
    const userDoc = await userRef.get();

    const batch = db.batch();

    // Use the provided displayName or create one from firstName and lastName
    const finalDisplayName = displayName || `${firstName} ${lastName}`.trim();

    // Update Firebase Auth profile with displayName
    try {
      await auth.updateUser(userId, {
        displayName: finalDisplayName,
      });
    } catch (error) {
      logger.warn(`Could not update Auth displayName for user ${userId}`, error);
      // Continue with the process even if Auth update fails
    }

    // If user exists in Auth but not in Firestore, create the Firestore document
    if (!userDoc.exists && authUser) {
      logger.info(`Creating Firestore document for user ${userId}`);

      // Create a new family tree for the user
      const familyTreeRef = db.collection("familyTrees").doc();
      const familyTreeId = familyTreeRef.id;

      // Create a new history book for the user
      const historyBookRef = db.collection("historyBooks").doc();
      const historyBookId = historyBookRef.id;

      // Create family tree document
      batch.set(familyTreeRef, {
        id: familyTreeId,
        ownerUserId: userId,
        memberUserIds: [userId],
        adminUserIds: [userId],
        treeName: `${firstName}'s Family Tree`,
        memberCount: 1,
        createdAt: new Date(),
        updatedAt: new Date(),
        isPrivate: true,
      });

      // Create history book document
      batch.set(historyBookRef, {
        id: historyBookId,
        ownerUserId: userId,
        familyTreeId: familyTreeId,
        title: `${firstName}'s History Book`,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      // Create user document
      const userData: UserDocument = {
        id: userId,
        displayName: finalDisplayName,
        email: authUser.email || "",
        firstName: firstName,
        lastName: lastName,
        phoneNumber: phoneNumber || authUser.phoneNumber || null,
        parentIds: [],
        childrenIds: [],
        spouseIds: [],
        familyTreeId,
        historyBookId,
        gender: gender || "other",
        isAdmin: true,
        canAddMembers: true,
        canEdit: true,
        isPendingSignUp: false,
        createdAt: new Date(),
        updatedAt: new Date(),
        emailVerified: true,
        dataRetentionPeriod: "forever",
        dataRetentionLastUpdated: new Date(),
        onboardingCompleted: true,
      };

      batch.set(userRef, userData);

      // Update Firebase Auth user to ensure email is verified
      await auth.updateUser(userId, {
        emailVerified: true,
      });

      // Commit the batch and return success
      await batch.commit();

      logger.info(`Successfully created Firestore documents for user ${userId}`);

      return {
        success: true,
        userId,
        familyTreeId,
        historyBookId,
      };
    }

    // For users that already have a Firestore document
    if (userDoc.exists) {
      const userData = userDoc.data() as Partial<UserDocument>;

      // Check if this is an invited user
      const invitationId = userData.invitationId;
      let invitation: any = null;
      let oldUserId: string | null = null;
      let familyTreeId: string | null = null;
      let prefillData: any = null;
      let oldUserParentIds: string[] = [];
      let oldUserChildrenIds: string[] = [];
      let oldUserSpouseIds: string[] = [];

      if (invitationId) {
        logger.info(`Processing invited user onboarding for invitation: ${invitationId}`);
        const invitationDoc = await db.collection("invitations").doc(invitationId).get();

        if (invitationDoc.exists) {
          invitation = invitationDoc.data();
          if (invitation) {
            oldUserId = invitation.inviteeId;
            familyTreeId = invitation.familyTreeId;
            prefillData = invitation.prefillData;

            logger.info(`Found invitation with prefill data: ${JSON.stringify(prefillData || {})}`);

            // Get the old user document if it exists
            if (oldUserId) {
              const oldUserDoc = await db.collection("users").doc(oldUserId).get();
              if (oldUserDoc.exists) {
                logger.info(`Found old user document for ${oldUserId}, will migrate relationships`);
                // Extract relationship data from old user document
                const oldUserData = oldUserDoc.data();
                oldUserParentIds = oldUserData?.parentIds || [];
                oldUserChildrenIds = oldUserData?.childrenIds || [];
                oldUserSpouseIds = oldUserData?.spouseIds || [];
                logger.info(`Retrieved relationship data from old user: parentIds(${oldUserParentIds.length}), childrenIds(${oldUserChildrenIds.length}), spouseIds(${oldUserSpouseIds.length})`);
              }
            }
          }
        }
      }

      // For non-invited users, create a new family tree
      if (!familyTreeId) {
        const familyTreeRef = db.collection("familyTrees").doc();
        familyTreeId = familyTreeRef.id;

        batch.set(familyTreeRef, {
          id: familyTreeId,
          ownerUserId: userId,
          memberUserIds: [userId],
          adminUserIds: [userId],
          treeName: `${firstName}'s Family Tree`,
          memberCount: 1,
          createdAt: new Date(),
          updatedAt: new Date(),
          isPrivate: true,
        });
      } else {
        // For invited users, add them to the existing family tree
        const familyTreeRef = db.collection("familyTrees").doc(familyTreeId);
        const familyTreeDoc = await familyTreeRef.get();

        if (familyTreeDoc.exists) {
          const treeData = familyTreeDoc.data();
          if (treeData) {
            const memberUserIds = treeData.memberUserIds || [];

            if (!memberUserIds.includes(userId)) {
              batch.update(familyTreeRef, {
                memberUserIds: [...memberUserIds, userId],
                memberCount: (treeData.memberCount || 0) + 1,
                updatedAt: new Date(),
              });
            }
          }
        }
      }

      // Create history book document
      const historyBookRef = db.collection("historyBooks").doc();
      const historyBookId = historyBookRef.id;
      batch.set(historyBookRef, {
        id: historyBookId,
        ownerUserId: userId,
        familyTreeId: familyTreeId,
        title: `${firstName}'s History Book`,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      // Use prefilled data from invitation if available and not overridden by user input
      const finalFirstName = firstName || (prefillData?.firstName) || "";
      const finalLastName = lastName || (prefillData?.lastName) || "";
      const finalDateOfBirth = dateOfBirth || (prefillData?.dateOfBirth) || null;
      const finalGender = gender || (prefillData?.gender) || "other";
      const finalPhoneNumber = phoneNumber || (prefillData?.phoneNumber) || null;

      // Update user document with onboarding information
      batch.update(userRef, {
        displayName: finalDisplayName,
        firstName: finalFirstName,
        lastName: finalLastName,
        dateOfBirth: finalDateOfBirth instanceof Date ? finalDateOfBirth : finalDateOfBirth ? new Date(finalDateOfBirth) : null,
        gender: finalGender,
        phoneNumber: finalPhoneNumber,
        familyTreeId,
        historyBookId,
        parentIds: oldUserParentIds,
        childrenIds: oldUserChildrenIds,
        spouseIds: oldUserSpouseIds,
        isAdmin: true,
        canAddMembers: true,
        canEdit: true,
        isPendingSignUp: false,
        updatedAt: new Date(),
        onboardingCompleted: true,
        // Remove the invitation ID as it's no longer needed
        invitationId: null,
      });

      // If this is an invited user, handle relationship migrations
      if (oldUserId && invitation) {
        logger.info(`Migrating relationships for invited user from ${oldUserId} to ${userId}`);

        // Update all family trees where the old user is a member
        const familyTreesQuery = await db.collection("familyTrees")
          .where("memberUserIds", "array-contains", oldUserId)
          .get();

        familyTreesQuery.forEach((doc) => {
          const treeData = doc.data();
          batch.update(doc.ref, {
            memberUserIds: (treeData.memberUserIds || []).map((id: string) => id === oldUserId ? userId : id),
            adminUserIds: (treeData.adminUserIds || []).map((id: string) => id === oldUserId ? userId : id),
            updatedAt: new Date(),
          });
        });

        // Update history books
        const historyBooksQuery = await db.collection("historyBooks")
          .where("ownerUserId", "==", oldUserId)
          .get();

        historyBooksQuery.forEach((doc) => {
          batch.update(doc.ref, {
            ownerUserId: userId,
            updatedAt: new Date(),
          });
        });

        // Update stories
        const storiesQuery = await db.collection("stories")
          .where("authorId", "==", oldUserId)
          .get();

        storiesQuery.forEach((doc) => {
          batch.update(doc.ref, {
            authorId: userId,
            updatedAt: new Date(),
          });
        });

        // Update all relationship references in other user documents
        const [parentRefs, childRefs, spouseRefs] = await Promise.all([
          db.collection("users").where("parentIds", "array-contains", oldUserId).get(),
          db.collection("users").where("childrenIds", "array-contains", oldUserId).get(),
          db.collection("users").where("spouseIds", "array-contains", oldUserId).get(),
        ]);

        const updateDoc = (doc: any, field: string) => {
          const data = doc.data();
          if (data[field]?.includes(oldUserId)) {
            batch.update(doc.ref, {
              [field]: data[field].map((id: string) => id === oldUserId ? userId : id),
              updatedAt: new Date(),
            });
          }
        };

        parentRefs.forEach((doc) => updateDoc(doc, "parentIds"));
        childRefs.forEach((doc) => updateDoc(doc, "childrenIds"));
        spouseRefs.forEach((doc) => updateDoc(doc, "spouseIds"));

        // Update any comments or reactions that reference the old user ID
        const commentsQuery = await db.collection("comments")
          .where("authorId", "==", oldUserId)
          .get();

        commentsQuery.forEach((doc) => {
          batch.update(doc.ref, {
            authorId: userId,
            updatedAt: new Date(),
          });
        });

        const reactionsQuery = await db.collection("reactions")
          .where("userId", "==", oldUserId)
          .get();

        reactionsQuery.forEach((doc) => {
          batch.update(doc.ref, {
            userId: userId,
            updatedAt: new Date(),
          });
        });

        // Delete the old user document
        const oldUserDoc = await db.collection("users").doc(oldUserId).get();
        if (oldUserDoc.exists) {
          batch.delete(oldUserDoc.ref);
        }
      }

      // Commit all Firestore operations
      await batch.commit();

      logger.info(`Successfully completed onboarding process for user ${userId}`);

      return {
        success: true,
        userId,
        familyTreeId,
        historyBookId,
      };
    }

    throw new Error("Unexpected user document state. Please contact support.");
  } catch (error) {
    logger.error("Error in completeOnboarding:", error);
    throw new Error(error instanceof Error ? error.message : "Failed to complete onboarding process");
  }
});

/**
 * Updates user's data retention settings
 */
export const updateDataRetention = onCall({
  region: DEFAULT_REGION,
  memory: "512MiB",
  timeoutSeconds: FUNCTION_TIMEOUT.MEDIUM,
}, async (request) => {
  try {
    const {userId, retentionPeriod} = request.data;
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
 * Sends an invitation email to a newly added family member
 */
export const sendFamilyTreeInvitation = onCall({
  region: DEFAULT_REGION,
  memory: "512MiB",
  timeoutSeconds: FUNCTION_TIMEOUT.MEDIUM,
  secrets: [SENDGRID_APIKEY, SENDGRID_FROMEMAIL, SENDGRID_TEMPLATES_INVITE, FRONTEND_URL],
}, async (request) => {
  const invitationData: InvitationData = request.data;
  logger.info(`Starting invitation process for ${invitationData.inviteeEmail} to family tree ${invitationData.familyTreeId}`);

  try {
    // Initialize SendGrid
    initSendGrid();

    // Input validation
    if (!invitationData.inviteeId || !invitationData.inviteeEmail || !invitationData.inviterId || !invitationData.familyTreeId) {
      throw new Error(ERROR_MESSAGES.INVALID_REQUEST);
    }

    // Verify that the inviter is the authenticated user
    const auth = request.auth;
    if (!auth) {
      throw new Error("Authentication required");
    }

    // Override inviterId with authenticated user's ID
    invitationData.inviterId = auth.uid;

    // Get the inviter's display name from Firestore
    const db = getFirestore();
    const inviterDoc = await db.collection("users").doc(auth.uid).get();
    if (inviterDoc.exists) {
      const inviterData = inviterDoc.data();
      if (inviterData && inviterData.displayName) {
        invitationData.inviterName = inviterData.displayName;
      } else {
        invitationData.inviterName = "A family member"; // Fallback
      }
    } else {
      invitationData.inviterName = "A family member"; // Fallback if user not found
    }

    // Generate invitation token
    const invitationToken = generateSecureToken();
    const hashedToken = hashToken(invitationToken);

    // Set expiry time to 7 days from now
    const now = new Date();
    const expiryTime = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    const firestoreExpiry = Timestamp.fromDate(expiryTime);

    // Store invitation data in Firestore
    const invitationRef = db.collection("invitations").doc();
    await invitationRef.set({
      id: invitationRef.id,
      inviteeId: invitationData.inviteeId,
      inviteeEmail: invitationData.inviteeEmail,
      inviterId: invitationData.inviterId,
      familyTreeId: invitationData.familyTreeId,
      token: hashedToken,
      expires: firestoreExpiry,
      status: "pending",
      createdAt: now,
      // Store prefill data
      prefillData: {
        firstName: invitationData.firstName,
        lastName: invitationData.lastName,
        dateOfBirth: invitationData.dateOfBirth,
        gender: invitationData.gender,
        phoneNumber: invitationData.phoneNumber,
        relationship: invitationData.relationship,
      },
    });

    // Create invitation link with token
    const invitationLink = `${FRONTEND_URL.value()}/signup/invited?token=${invitationToken}&id=${invitationRef.id}`;

    // Send invitation email using SendGrid template
    const msg: MailDataRequired = {
      to: invitationData.inviteeEmail,
      from: SENDGRID_FROMEMAIL.value(),
      templateId: SENDGRID_TEMPLATES_INVITE.value(),
      dynamicTemplateData: {
        name: invitationData.inviteeName,
        inviterName: invitationData.inviterName,
        familyTreeName: invitationData.familyTreeName,
        signUpLink: invitationLink,
        year: new Date().getFullYear(),
      },
    };

    await sgMail.send(msg);
    logger.info(`Successfully sent invitation email to ${invitationData.inviteeEmail}`);

    return {
      success: true,
      invitationId: invitationRef.id,
    };
  } catch (error) {
    logger.error("Error sending invitation email:", error);
    throw new Error(error instanceof Error ? error.message : "Failed to send invitation");
  }
});

/**
 * Verifies an invitation token and returns the prefill data
 */
export const verifyInvitationToken = onCall({
  region: DEFAULT_REGION,
  memory: "512MiB",
  timeoutSeconds: FUNCTION_TIMEOUT.MEDIUM,
}, async (request) => {
  const {token, invitationId} = request.data;
  logger.info(`Verifying invitation token for invitation ${invitationId}`);

  try {
    const db = getFirestore();
    const invitationDoc = await db.collection("invitations").doc(invitationId).get();

    if (!invitationDoc.exists) {
      throw new Error("Invalid invitation link");
    }

    const invitation = invitationDoc.data();

    // Verify token
    const hashedToken = hashToken(token);
    if (invitation?.token !== hashedToken) {
      throw new Error("Invalid invitation token");
    }

    // Check expiration
    const expiryDate = invitation.expires.toDate();
    if (new Date() > expiryDate) {
      throw new Error("Invitation link has expired");
    }

    // Check if invitation is still pending
    if (invitation.status !== "pending") {
      throw new Error("This invitation has already been used");
    }

    // Return prefill data and invitation details
    return {
      success: true,
      prefillData: invitation.prefillData,
      inviteeEmail: invitation.inviteeEmail,
      familyTreeId: invitation.familyTreeId,
      inviteeId: invitation.inviteeId,
    };
  } catch (error) {
    logger.error("Error verifying invitation:", error);
    throw new Error(error instanceof Error ? error.message : "Failed to verify invitation");
  }
});

/**
 * Handles the signup process for invited users
 * Now follows the same pattern as regular signup:
 * - Creates Firebase Auth account
 * - Sends verification email
 * - Stores invitation data for later use in onboarding
 */
export const handleInvitedSignUp = onCall({
  region: DEFAULT_REGION,
  memory: "512MiB",
  timeoutSeconds: FUNCTION_TIMEOUT.MEDIUM,
  secrets: [SENDGRID_APIKEY, SENDGRID_FROMEMAIL, SENDGRID_TEMPLATES_VERIFICATION, FRONTEND_URL],
}, async (request) => {
  const signupData: {
    email: string;
    password: string;
    invitationId: string;
    token: string;
  } = request.data;
  logger.info(`Starting invited signup process for email: ${signupData.email}`);

  try {
    // Initialize SendGrid
    initSendGrid();

    // Validate email and password
    if (!isValidEmail(signupData.email)) {
      throw new Error("Invalid email address");
    }

    if (!isValidPassword(signupData.password)) {
      throw new Error("Password must be at least 8 characters and include numbers and letters");
    }

    const db = getFirestore();

    // Verify invitation token first
    const invitationDoc = await db.collection("invitations").doc(signupData.invitationId).get();
    if (!invitationDoc.exists) {
      throw new Error("Invalid invitation");
    }

    const invitation = invitationDoc.data();
    const hashedToken = hashToken(signupData.token);
    if (invitation?.token !== hashedToken || invitation.status !== "pending") {
      throw new Error("Invalid or used invitation");
    }

    // Check if email matches invitation
    if (invitation.inviteeEmail !== signupData.email) {
      throw new Error("Email address does not match the invitation");
    }

    // Check if email already exists in Firebase Auth
    const auth = getAuth();
    try {
      const existingUser = await auth.getUserByEmail(signupData.email);
      if (existingUser) {
        throw new functions.https.HttpsError(
          "already-exists",
          "An account with this email already exists. Please sign in instead."
        );
      }
    } catch (error: any) {
      // Proceed only if the error is user-not-found
      if (error.code !== "auth/user-not-found") {
        if (error instanceof functions.https.HttpsError) {
          throw error;
        }
        throw new functions.https.HttpsError(
          "already-exists",
          "An account with this email already exists"
        );
      }
    }

    // Create Firebase Auth account
    const userRecord = await auth.createUser({
      email: signupData.email,
      password: signupData.password,
      emailVerified: false,
    });

    const userId = userRecord.uid;

    // Create a minimal user document in Firestore
    const userRef = db.collection("users").doc(userId);
    await userRef.set({
      id: userId,
      email: signupData.email,
      firstName: invitation.prefillData?.firstName || "",
      lastName: invitation.prefillData?.lastName || "",
      displayName: `${invitation.prefillData?.firstName || ""} ${invitation.prefillData?.lastName || ""}`.trim(),
      dateOfBirth: invitation.prefillData?.dateOfBirth || null,
      gender: invitation.prefillData?.gender || "other",
      phoneNumber: invitation.prefillData?.phoneNumber || null,
      createdAt: new Date(),
      updatedAt: new Date(),
      emailVerified: false,
      onboardingCompleted: false,
      dataRetentionPeriod: "forever",
      dataRetentionLastUpdated: new Date(),
      // Store the invitation ID for later use in onboarding
      invitationId: signupData.invitationId,
    });

    // Update invitation status to link it with the new user
    await db.collection("invitations").doc(signupData.invitationId).update({
      newUserId: userId,
      status: "accepted",
      acceptedAt: new Date(),
    });

    // Generate verification token and send verification email
    const verificationToken = generateSecureToken();
    const hashedVerificationToken = hashToken(verificationToken);
    const expiryTime = new Date();
    expiryTime.setMinutes(expiryTime.getMinutes() + 30); // Token expires in 30 minutes

    // Update user document with verification token
    await userRef.update({
      emailVerificationToken: hashedVerificationToken,
      emailVerificationExpires: expiryTime,
    });

    // Send verification email
    const verificationLink = `${FRONTEND_URL.value()}/verify-email/confirm?uid=${userId}&token=${verificationToken}`;
    const msg: MailDataRequired = {
      to: signupData.email,
      from: SENDGRID_FROMEMAIL.value(),
      templateId: SENDGRID_TEMPLATES_VERIFICATION.value(),
      dynamicTemplateData: {
        username: signupData.email.split("@")[0], // Use email username as fallback
        verificationLink: verificationLink,
      },
    };

    await sgMail.send(msg);
    logger.info(`Successfully completed invited signup process for user ${userId}`);

    return {
      success: true,
      userId,
      familyTreeId: invitation.familyTreeId,
    };
  } catch (error) {
    logger.error("Error in handleInvitedSignUp:", error);
    throw new Error(error instanceof Error ? error.message : "Failed to complete signup process");
  }
});

/**
 * Validates and handles user login
 */
export const handleLogin = onCall({
  region: DEFAULT_REGION,
  memory: "512MiB",
  timeoutSeconds: FUNCTION_TIMEOUT.MEDIUM,
}, async (request) => {
  const {email, password} = request.data;
  logger.info(`Starting login process for email: ${email}`);

  try {
    // Validate email
    if (!isValidEmail(email)) {
      throw new Error("Please enter a valid email address");
    }

    // Validate password format
    const passwordValidation = isValidPassword(password);
    if (!passwordValidation.isValid) {
      throw new Error("Invalid password format");
    }

    const auth = getAuth();

    try {
      // Check if user exists in Firebase Auth
      const userRecord = await auth.getUserByEmail(email);

      // Get user document from Firestore
      const db = getFirestore();
      const userDoc = await db.collection("users").doc(userRecord.uid).get();

      if (!userDoc.exists) {
        // Create Firestore document if it doesn't exist
        const userData: UserDocument = {
          id: userRecord.uid,
          email: userRecord.email || "",
          displayName: userRecord.displayName || "User",
          firstName: userRecord.displayName?.split(" ")[0] || "User",
          lastName: userRecord.displayName?.split(" ")[1] || "",
          phoneNumber: userRecord.phoneNumber || null,
          parentIds: [],
          childrenIds: [],
          spouseIds: [],
          isAdmin: false,
          canAddMembers: false,
          canEdit: false,
          isPendingSignUp: false,
          createdAt: new Date(),
          updatedAt: new Date(),
          gender: "other",
          emailVerified: userRecord.emailVerified,
          dataRetentionPeriod: "forever",
          dataRetentionLastUpdated: new Date(),
          onboardingCompleted: false,
        };

        await db.collection("users").doc(userRecord.uid).set(userData);
      }

      return {
        success: true,
        userId: userRecord.uid,
        emailVerified: userRecord.emailVerified,
      };
    } catch (error: any) {
      if (error.code === "auth/user-not-found") {
        throw new Error("No account found with this email address");
      }
      throw error;
    }
  } catch (error) {
    logger.error("Error in handleLogin:", error);
    throw new Error(error instanceof Error ? error.message : "Failed to log in");
  }
});

/**
 * Checks if an email exists in Firebase Auth
 * Used by the passwordless auth flow to determine if this is a sign-in or sign-up
 */
export const checkEmailExists = onCall(
  {
    region: DEFAULT_REGION,
    timeoutSeconds: 30,
  },
  async (request) => {
    try {
      const {email} = request.data;

      if (!email || !/^\S+@\S+\.\S+$/.test(email)) {
        throw new Error("Invalid email format");
      }

      const auth = getAuth();

      try {
        await auth.getUserByEmail(email);
        // If we get here, the user exists
        return {exists: true};
      } catch (error) {
        // If error is user-not-found, the user doesn't exist
        return {exists: false};
      }
    } catch (error) {
      logger.error("Error in checkEmailExists:", error);
      throw new functions.https.HttpsError(
        "internal",
        error instanceof Error ? error.message : "Failed to check email"
      );
    }
  }
);

/**
 * Gets user data from Firestore for the onboarding process
 */
export const getUserData = onCall({
  region: DEFAULT_REGION,
  memory: "512MiB",
  timeoutSeconds: FUNCTION_TIMEOUT.MEDIUM,
  cors: ["https://mydynastyapp.com", "https://dynasty-eba63.web.app", "https://dynasty-eba63.firebaseapp.com"],
}, async (request) => {
  const {userId} = request.data;

  if (!userId) {
    return {
      success: false,
      message: "User ID is required",
    };
  }

  try {
    const db = getFirestore();
    const userRef = db.collection("users").doc(userId);
    const userDoc = await userRef.get();

    if (!userDoc.exists) {
      logger.info(`User not found: ${userId}`);
      return {
        success: false,
        message: "User not found",
      };
    }

    const userData = userDoc.data();
    logger.info(`Retrieved user data for: ${userId}`);

    // We need to format the date for transmission to the client
    if (userData?.dateOfBirth) {
      // Format as ISO string if it's a Firestore timestamp
      if (userData.dateOfBirth.toDate) {
        userData.dateOfBirth = userData.dateOfBirth.toDate().toISOString();
      }
    }

    return {
      success: true,
      userData,
    };
  } catch (error) {
    logger.error("Error in getUserData:", error);
    return {
      success: false,
      message: error instanceof Error ? error.message : "Failed to get user data",
    };
  }
});

/**
 * Handles sign-in with Google
 * Creates a new user document in Firestore if needed
 */
export const handleGoogleSignIn = onCall({
  region: DEFAULT_REGION,
  memory: "512MiB",
  timeoutSeconds: FUNCTION_TIMEOUT.MEDIUM,
}, async (request) => {
  const data = request.data;
  logger.info(`Processing Google sign-in for user: ${data.email}`);

  try {
    const db = getFirestore();
    const userId = data.userId;

    // Create a user document in Firestore if it doesn't exist
    const userRef = db.collection("users").doc(userId);
    const userDoc = await userRef.get();

    if (!userDoc.exists) {
      // Extract the first and last name from the display name
      let firstName = "";
      let lastName = "";

      if (data.displayName) {
        const nameParts = data.displayName.trim().split(/\s+/);
        firstName = nameParts[0] || "";
        lastName = nameParts.slice(1).join(" ") || "";
      }

      // Create the user document
      await userRef.set({
        id: userId,
        email: data.email,
        firstName: firstName,
        lastName: lastName,
        displayName: data.displayName || "",
        profilePicture: data.photoURL || null,
        phoneNumber: null,
        parentIds: [],
        childrenIds: [],
        spouseIds: [],
        isAdmin: false,
        canAddMembers: true,
        canEdit: true,
        createdAt: new Date(),
        updatedAt: new Date(),
        emailVerified: true, // Google accounts are pre-verified
        isPendingSignUp: false,
        gender: "unspecified",
        dataRetentionPeriod: "forever",
        dataRetentionLastUpdated: new Date(),
        onboardingCompleted: false,
      });

      logger.info(`Created new user document for Google user ${userId}`);
    }

    return {
      success: true,
      userId,
    };
  } catch (error) {
    logger.error("Error in handleGoogleSignIn:", error);
    throw new Error(error instanceof Error ? error.message : "Failed to process Google sign-in");
  }
});

// MARK: - Apple Authentication
/**
 * Handles Apple sign-in authentication
 * Creates a new user document in Firestore if it doesn't exist
 * Returns the user ID for client-side processing
 */
export const handleAppleSignIn = onCall({
  region: DEFAULT_REGION,
  memory: "512MiB",
  timeoutSeconds: FUNCTION_TIMEOUT.MEDIUM,
}, async (request) => {
  const data = request.data;
  logger.info(`Processing Apple sign-in for user ID: ${data.userId}`);

  try {
    const db = getFirestore();
    const userId = data.userId;
    const email = data.email; // This will be a private relay email if user chose "Hide My Email"

    // Create a user document in Firestore if it doesn't exist
    const userRef = db.collection("users").doc(userId);
    const userDoc = await userRef.get();

    if (!userDoc.exists) {
      // Extract the first and last name from the display name
      // Note: Apple only provides name during the first sign-in
      let firstName = "";
      let lastName = "";

      if (data.displayName) {
        const nameParts = data.displayName.trim().split(/\s+/);
        firstName = nameParts[0] || "";
        lastName = nameParts.slice(1).join(" ") || "";
      }

      // Create the user document
      await userRef.set({
        id: userId,
        email: email,
        firstName: firstName,
        lastName: lastName,
        displayName: data.displayName || "",
        profilePicture: data.photoURL || null,
        phoneNumber: null,
        parentIds: [],
        childrenIds: [],
        spouseIds: [],
        isAdmin: false,
        canAddMembers: true,
        canEdit: true,
        createdAt: new Date(),
        updatedAt: new Date(),
        emailVerified: true, // Apple accounts are pre-verified
        isPendingSignUp: false,
        gender: "unspecified",
        dataRetentionPeriod: "forever",
        dataRetentionLastUpdated: new Date(),
        onboardingCompleted: false,
        isAppleUser: true, // Flag to identify Apple users
        isPrivateEmail: email.includes("privaterelay.appleid.com"), // Flag if using private relay
      });

      logger.info(`Created new user document for Apple user ${userId}`);
    } else {
      // If user exists and we have new display name info, update it
      // This handles cases where user signs in on another device and name is provided
      if (data.displayName && !userDoc.data()?.displayName) {
        const nameParts = data.displayName.trim().split(/\s+/);
        const firstName = nameParts[0] || "";
        const lastName = nameParts.slice(1).join(" ") || "";
        await userRef.update({
          displayName: data.displayName,
          firstName: firstName,
          lastName: lastName,
          updatedAt: new Date(),
        });
        logger.info(`Updated existing Apple user ${userId} with new display name`);
      }
    }

    return {
      success: true,
      userId,
    };
  } catch (error) {
    logger.error("Error in handleAppleSignIn:", error);
    throw new Error(error instanceof Error ? error.message : "Failed to process Apple sign-in");
  }
});

// MARK: - Phone Authentication
/**
 * Handles phone number verification and sign-in
 * Creates a new user if the phone number doesn't exist
 * Signs in the existing user if the phone number exists
 */
export const handlePhoneSignIn = onCall({
  region: DEFAULT_REGION,
  memory: "512MiB",
  timeoutSeconds: FUNCTION_TIMEOUT.MEDIUM,
}, async (request) => {
  const {phoneNumber, uid} = request.data;
  logger.info(`Processing phone sign-in for number: ${phoneNumber}`);

  try {
    const auth = getAuth();
    const db = getFirestore();

    // Check if this is a new user or existing user
    let userId = uid;
    let isNewUser = false;
    let userRecord;

    // Try to find an existing user with this phone number
    const usersSnapshot = await db.collection("users")
      .where("phoneNumber", "==", phoneNumber)
      .limit(1)
      .get();

    if (!usersSnapshot.empty) {
      // Existing user with this phone number
      const userDoc = usersSnapshot.docs[0];
      userId = userDoc.id;
      userRecord = await auth.getUser(userId);
      logger.info(`Found existing user with phone number: ${userId}`);
    } else if (uid) {
      // This is a new phone login for an existing Firebase Auth user
      try {
        userRecord = await auth.getUser(uid);
        logger.info(`Updating existing user ${uid} with new phone number`);
      } catch (error) {
        logger.error(`Error getting user with UID ${uid}:`, error);
        throw new Error("Invalid user ID");
      }
    } else {
      // This is a completely new user
      isNewUser = true;

      // Create a new user with only a phone number, no email
      const randomPassword = crypto.randomBytes(16).toString("hex");

      userRecord = await auth.createUser({
        phoneNumber: phoneNumber,
        password: randomPassword,
        emailVerified: true, // Not relevant but required for consistency
      });

      userId = userRecord.uid;
      logger.info(`Created new user with phone number: ${userId}`);
    }

    // Update or create the user document in Firestore
    const userRef = db.collection("users").doc(userId);
    const userDoc = await userRef.get();

    if (userDoc.exists) {
      // Update existing user
      await userRef.update({
        phoneNumber: phoneNumber,
        phoneNumberVerified: true,
        updatedAt: new Date(),
      });
    } else {
      // Create new user document
      const newUserData: any = {
        id: userId,
        phoneNumber: phoneNumber,
        phoneNumberVerified: true,
        email: "", // Using empty string for phone-only users
        emailVerified: true, // Required for authentication flow
        createdAt: new Date(),
        updatedAt: new Date(),
        onboardingCompleted: false,
        parentIds: [],
        childrenIds: [],
        spouseIds: [],
        isAdmin: false,
        canAddMembers: true,
        canEdit: true,
        isPendingSignUp: false,
        dataRetentionPeriod: "forever",
        dataRetentionLastUpdated: new Date(),
      };

      await userRef.set(newUserData);

      // Log the creation of a new user document
      logger.info(`Created new user document for phone user: ${userId} with number: ${phoneNumber}`);
    }

    // If this is a new user, create default family tree and history book
    if (isNewUser) {
      // Create a new family tree
      const familyTreeRef = db.collection("familyTrees").doc();
      const familyTreeId = familyTreeRef.id;

      await familyTreeRef.set({
        id: familyTreeId,
        name: "My Family Tree",
        createdBy: userId,
        createdAt: new Date(),
        updatedAt: new Date(),
        members: [userId],
        admins: [userId],
      });

      // Create a new history book
      const historyBookRef = db.collection("historyBooks").doc();
      const historyBookId = historyBookRef.id;

      await historyBookRef.set({
        id: historyBookId,
        name: "My History Book",
        createdBy: userId,
        createdAt: new Date(),
        updatedAt: new Date(),
        members: [userId],
        admins: [userId],
      });

      // Update user with family tree and history book IDs
      await userRef.update({
        familyTreeId: familyTreeId,
        historyBookId: historyBookId,
      });
    }

    // Return user information
    return {
      success: true,
      userId: userId,
      isNewUser: isNewUser,
      familyTreeId: userDoc.exists ? userDoc.data()?.familyTreeId : null,
      historyBookId: userDoc.exists ? userDoc.data()?.historyBookId : null,
    };
  } catch (error) {
    logger.error("Error in handlePhoneSignIn:", error);
    throw new Error(error instanceof Error ? error.message : "Failed to process phone sign-in");
  }
});

/**
 * Registers a device token for push notifications
 * Links the token to the user's account for targeted notifications
 */
export const registerDeviceTokenForAPNS = onCall({
  region: DEFAULT_REGION,
  memory: "512MiB",
  timeoutSeconds: FUNCTION_TIMEOUT.SHORT,
}, async (request) => {
  try {
    const {userId, deviceToken, deviceType} = request.data;

    if (!userId || !deviceToken) {
      throw new Error("User ID and device token are required");
    }

    if (!request.auth || request.auth.uid !== userId) {
      throw new Error("Unauthorized request");
    }

    logger.info(`Registering device token for user ${userId}`);

    const db = getFirestore();

    // Store in a device tokens collection
    const tokenRef = db.collection("deviceTokens").doc();
    await tokenRef.set({
      userId,
      deviceToken,
      deviceType: deviceType || "ios", // Default to iOS, but allow other values
      createdAt: new Date(),
      updatedAt: new Date(),
      isActive: true,
    });

    // Also store the latest token on the user document for quick access
    const userRef = db.collection("users").doc(userId);
    await userRef.update({
      deviceToken,
      deviceType: deviceType || "ios",
      deviceTokenUpdatedAt: new Date(),
    });

    logger.info(`Successfully registered device token for user ${userId}`);

    return {success: true};
  } catch (error) {
    logger.error("Error registering device token:", error);
    throw new Error(error instanceof Error ? error.message : "Failed to register device token");
  }
});
