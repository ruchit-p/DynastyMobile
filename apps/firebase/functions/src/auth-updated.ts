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
import {
  ErrorCode,
  createError,
  handleError,
  withErrorHandling
} from "./utils/errors";

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
    throw createError(ErrorCode.INTERNAL, "SendGrid API key is not set");
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
    handleError(error, "cleanupExpiredTokens", ErrorCode.INTERNAL);
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
}, withErrorHandling(async (request) => {
  const {userId} = request.data;
  
  if (!userId) {
    throw createError(ErrorCode.MISSING_PARAMETERS, "User ID is required");
  }
  
  logger.info(`Starting account deletion for user ${userId}`);
  const db = getFirestore();
  const batch = db.batch();
  const storage = getStorage();

  // Get the user's data
  const userDoc = await db.collection("users").doc(userId).get();
  if (!userDoc.exists) {
    throw createError(ErrorCode.NOT_FOUND, `User ${userId} not found`);
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
}, "handleAccountDeletion"));

/**
 * Updates user profile information
 */
export const updateUserProfile = onCall({
  region: DEFAULT_REGION,
  memory: "512MiB",
  timeoutSeconds: FUNCTION_TIMEOUT.MEDIUM,
}, withErrorHandling(async (request) => {
  const {userId, updates} = request.data;
  const callerUid = request.auth?.uid;

  // Verify authentication and authorization
  if (!callerUid) {
    throw createError(ErrorCode.UNAUTHENTICATED, "Authentication required");
  }

  if (userId !== callerUid) {
    throw createError(ErrorCode.PERMISSION_DENIED, "You can only update your own profile");
  }

  logger.info(`Updating profile for user ${userId}`);
  const db = getFirestore();

  // Get the user document
  const userRef = db.collection("users").doc(userId);
  const userDoc = await userRef.get();

  if (!userDoc.exists) {
    throw createError(ErrorCode.NOT_FOUND, "User not found");
  }

  // Validate date of birth if provided
  if (updates.dateOfBirth && !(updates.dateOfBirth instanceof Date)) {
    if (typeof updates.dateOfBirth === "string") {
      updates.dateOfBirth = new Date(updates.dateOfBirth);
      if (isNaN(updates.dateOfBirth.getTime())) {
        throw createError(ErrorCode.INVALID_FORMAT, "Invalid date of birth format");
      }
    } else {
      throw createError(ErrorCode.INVALID_FORMAT, "Invalid date of birth format");
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
}, "updateUserProfile"));

/**
 * Sends a verification email to a newly registered user
 */
export const sendVerificationEmail = onCall({
  region: DEFAULT_REGION,
  memory: "512MiB",
  timeoutSeconds: FUNCTION_TIMEOUT.MEDIUM,
  secrets: [SENDGRID_APIKEY, SENDGRID_FROMEMAIL, SENDGRID_TEMPLATES_VERIFICATION, FRONTEND_URL],
}, withErrorHandling(async (request) => {
  const {userId, email, displayName} = request.data;
  
  // Log received data immediately
  logger.info("sendVerificationEmail: Received data:", { userId, email, displayName }); 
  logger.info(`Starting verification email process for user ${userId}`);

  // Input validation
  if (!userId || !email || !displayName) {
    throw createError(
      ErrorCode.MISSING_PARAMETERS, 
      "User ID, email, and display name are required"
    );
  }

  // Initialize SendGrid
  initSendGrid();

  // Check rate limit before proceeding
  const isWithinLimit = await checkRateLimit(userId);
  if (!isWithinLimit) {
    throw createError(
      ErrorCode.RATE_LIMITED, 
      "Too many attempts. Please try again later."
    );
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
  await db.collection("users").doc(userId).set({
    emailVerificationToken: hashedToken,
    emailVerificationExpires: firestoreExpiry,
    emailVerified: false,
  }, { merge: true });

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

  try {
    await sgMail.send(msg);
    logger.info(`Verification email sent to ${email}`);

    return {success: true};
  } catch (error) {
    logger.error("Error sending verification email:", error);
    throw createError(
      ErrorCode.SERVICE_UNAVAILABLE, 
      "Failed to send verification email. Please try again later.",
      { originalError: error }
    );
  }
}, "sendVerificationEmail"));

/**
 * Function to handle signup - example for calling another Firebase function with error handling
 */
export const handleSignUp = onCall({
  region: DEFAULT_REGION,
  memory: "512MiB",
  timeoutSeconds: FUNCTION_TIMEOUT.MEDIUM,
  secrets: [SENDGRID_APIKEY, SENDGRID_FROMEMAIL, SENDGRID_TEMPLATES_VERIFICATION, FRONTEND_URL],
}, withErrorHandling(async (request) => {
  const signupData: SignupData = request.data;
  logger.info(`Starting simplified signup process for email: ${signupData.email}`);

  // Validate email and password
  if (!isValidEmail(signupData.email)) {
    throw createError(ErrorCode.INVALID_FORMAT, "Invalid email address");
  }

  if (!isValidPassword(signupData.password)) {
    throw createError(
      ErrorCode.INVALID_FORMAT, 
      "Password must be at least 8 characters and include numbers and letters"
    );
  }

  // Initialize SendGrid
  try {
    initSendGrid();
  } catch (error) {
    throw createError(
      ErrorCode.SERVICE_UNAVAILABLE, 
      "Email service is currently unavailable. Please try again later."
    );
  }

  const auth = getAuth();
  const db = getFirestore();

  // Check if email already exists
  try {
    await auth.getUserByEmail(signupData.email);
    throw createError(
      ErrorCode.ALREADY_EXISTS, 
      "An account with this email already exists"
    );
  } catch (error: any) {
    // Proceed only if error code is auth/user-not-found
    if (error.code !== "auth/user-not-found") {
      if (error instanceof functions.https.HttpsError) {
        throw error;
      }
      throw createError(
        ErrorCode.ALREADY_EXISTS,
        "An account with this email already exists"
      );
    }
  }

  // Create the Firebase Auth account
  try {
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
  } catch (error: any) {
    // Use our error handling system
    if (error.code === "auth/email-already-exists") {
      throw createError(
        ErrorCode.ALREADY_EXISTS, 
        "An account with this email already exists"
      );
    } else if (error.code === "auth/invalid-email") {
      throw createError(
        ErrorCode.INVALID_FORMAT, 
        "The email address is not valid"
      );
    } else if (error.code === "auth/weak-password") {
      throw createError(
        ErrorCode.INVALID_FORMAT,
        "The password is too weak"
      );
    } else {
      throw handleError(error, "handleSignUp", ErrorCode.INTERNAL);
    }
  }
}, "handleSignUp"));