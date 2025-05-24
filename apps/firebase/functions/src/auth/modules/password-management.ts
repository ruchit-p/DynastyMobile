import {onCall} from "firebase-functions/v2/https";
import {getFirestore, FieldValue} from "firebase-admin/firestore";
import {logger} from "firebase-functions/v2";
import {getAuth} from "firebase-admin/auth";
import {MailDataRequired} from "@sendgrid/mail";
import * as sgMail from "@sendgrid/mail";
import {isValidPassword} from "../../utils/validation";
import {DEFAULT_REGION, FUNCTION_TIMEOUT} from "../../common";
import {createError, withErrorHandling, ErrorCode} from "../../utils/errors";
import {withAuth} from "../../middleware";
import {PasswordResetToken} from "../types/auth";
import {initSendGrid} from "../config/sendgrid";
import {SENDGRID_APIKEY, SENDGRID_FROMEMAIL, SENDGRID_TEMPLATES_PASSWORDRESET, FRONTEND_URL} from "../config/secrets";
import {hashToken} from "../utils/tokens";

/**
 * Updates user password
 */
export const updateUserPassword = onCall(
  {
    region: DEFAULT_REGION,
    memory: "512MiB",
    timeoutSeconds: FUNCTION_TIMEOUT.MEDIUM,
  },
  withAuth(
    async (request) => {
      const {userId} = request.data;
      logger.info(`Updating password for user ${userId}`);

      // Verify the user exists
      const auth = getAuth();
      try {
        const user = await auth.getUser(userId);
        if (!user) {
          throw createError(ErrorCode.NOT_FOUND, "User not found");
        }

        // Note: Password update should be handled on the client side
        // using Firebase Auth's updatePassword method
        return {success: true};
      } catch (error) {
        logger.error("Failed to verify user:", error);
        throw createError(ErrorCode.INTERNAL, "Failed to verify user");
      }
    },
    "updateUserPassword",
    "auth"
  )
);

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
 * Resets the user's password using a token.
 */
export const resetPassword = onCall(
  {
    region: DEFAULT_REGION,
    timeoutSeconds: FUNCTION_TIMEOUT.SHORT,
    secrets: [], // No direct secrets, but interacts with Firestore & Auth
  },
  withErrorHandling(async (request) => {
    const {token, newPassword} = request.data;

    if (!token || typeof token !== "string") {
      throw createError(ErrorCode.INVALID_ARGUMENT, "Reset token is required.");
    }

    const passwordValidation = isValidPassword(newPassword);
    if (!newPassword || !passwordValidation.isValid) {
      throw createError(ErrorCode.INVALID_ARGUMENT, passwordValidation.message || "Password is required.");
    }

    const db = getFirestore();
    const hashedToken = hashToken(token);

    // Find token in passwordResetTokens collection
    const tokenRef = db.collection("passwordResetTokens").doc(hashedToken);
    const tokenDoc = await tokenRef.get();

    if (!tokenDoc.exists) {
      throw createError(ErrorCode.INVALID_ARGUMENT, "Invalid or expired password reset link.");
    }

    const tokenData = tokenDoc.data() as PasswordResetToken;

    if (tokenData.expiresAt.toMillis() < Date.now()) {
      await tokenRef.delete(); // Clean up expired token
      throw createError(ErrorCode.INVALID_ARGUMENT, "Password reset link has expired. Please request a new one.");
    }

    // Update Firebase Auth user's password
    try {
      await getAuth().updateUser(tokenData.userId, {password: newPassword});
      logger.info(`Password reset successfully for user ${tokenData.userId}`);

      // Delete the used reset token
      await tokenRef.delete();

      // Optionally: Update last password change timestamp in user document
      await db.collection("users").doc(tokenData.userId).update({
        updatedAt: FieldValue.serverTimestamp(), // Or a specific passwordLastChanged field
      });

      return {success: true, message: "Password reset successfully."};
    } catch (error) {
      logger.error("Failed to reset password in Firebase Auth:", {error, userId: tokenData.userId});
      throw createError(ErrorCode.INTERNAL, "Failed to reset password. Please try again.");
    }
  }, "resetPassword")
);
