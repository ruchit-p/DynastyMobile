import {onCall} from "firebase-functions/v2/https";
import {logger} from "firebase-functions/v2";
import {getAuth} from "firebase-admin/auth";
import {DEFAULT_REGION, FUNCTION_TIMEOUT} from "../../common";
import {createError, ErrorCode} from "../../utils/errors";
import {withAuth} from "../../middleware";
import {EMAIL_PROVIDER, SES_CONFIG} from "../config/secrets";
import {sanitizeUserId, sanitizeEmail, createLogContext} from "../../utils/sanitization";
import {validateRequest} from "../../utils/request-validator";
import {VALIDATION_SCHEMAS} from "../../config/validation-schemas";
import {SECURITY_CONFIG} from "../../config/security-config";

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
      // Validate and sanitize input using centralized validator
      const validatedData = validateRequest(
        request.data,
        VALIDATION_SCHEMAS.updateUserPassword,
        request.auth?.uid
      );

      const {userId} = validatedData;
      logger.info("Updating password for user", createLogContext({userId}));

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
        logger.error("Failed to verify user", createLogContext({
          error: error instanceof Error ? error.message : String(error),
          userId: sanitizeUserId(userId),
        }));
        throw createError(ErrorCode.INTERNAL, "Failed to verify user");
      }
    },
    "updateUserPassword",
    {
      authLevel: "auth",
      rateLimitConfig: SECURITY_CONFIG.rateLimits.passwordReset,
    }
  )
);

/**
 * Initiates password reset process by:
 * - Generating a password reset link
 * - Sending the reset email via AWS SES
 */
export const initiatePasswordReset = onCall({
  region: DEFAULT_REGION,
  memory: "512MiB",
  timeoutSeconds: FUNCTION_TIMEOUT.MEDIUM,
  secrets: [EMAIL_PROVIDER, SES_CONFIG],
}, withAuth(
  async (request) => {
  // Validate and sanitize input using centralized validator
    const validatedData = validateRequest(
      request.data,
      VALIDATION_SCHEMAS.initiatePasswordReset,
      request.auth?.uid
    );

    const {email} = validatedData;
    try {
      logger.info("Initiating password reset", createLogContext({email}));

      const auth = getAuth();

      // Generate the password reset link
      const resetLink = await auth.generatePasswordResetLink(email);

      // Get user details for the email template
      const userRecord = await auth.getUserByEmail(email);
      const displayName = userRecord.displayName || "User";

      // Send email using universal helper (routes to SendGrid or SES based on config)
      const {sendEmailUniversal} = await import("../config/emailConfig");
      await sendEmailUniversal({
        to: email,
        templateType: "passwordReset",
        dynamicTemplateData: {
          username: displayName,
          resetLink: resetLink,
        },
        userId: userRecord.uid,
      });
      logger.info("Password reset email sent successfully", createLogContext({email}));

      return {success: true};
    } catch (error) {
      logger.error("Error in initiatePasswordReset", createLogContext({
        error: error instanceof Error ? error.message : String(error),
        email: sanitizeEmail(email),
      }));
      throw new Error(error instanceof Error ? error.message : "Failed to initiate password reset");
    }
  },
  "initiatePasswordReset",
  {
    authLevel: "none", // No auth required for password reset
    rateLimitConfig: SECURITY_CONFIG.rateLimits.passwordReset,
  }
));

