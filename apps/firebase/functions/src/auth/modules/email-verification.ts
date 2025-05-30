import {onCall} from "firebase-functions/v2/https";
import {getFirestore, Timestamp, FieldValue} from "firebase-admin/firestore";
import {logger} from "firebase-functions/v2";
import {getAuth} from "firebase-admin/auth";
import {DEFAULT_REGION, FUNCTION_TIMEOUT} from "../../common";
import {createError, ErrorCode} from "../../utils/errors";
import {withAuth, RateLimitType} from "../../middleware";
import {UserDocument} from "../types/user";
import {sendEmail} from "../utils/sendgridHelper";
import {FRONTEND_URL} from "../config/secrets";
import {ERROR_MESSAGES, TOKEN_EXPIRY} from "../config/constants";
import {generateSecureToken, hashToken} from "../utils/tokens";
import {validateRequest} from "../../utils/request-validator";
import {VALIDATION_SCHEMAS} from "../../config/validation-schemas";

/**
 * Sends a verification email to a newly registered user
 */
export const sendVerificationEmail = onCall(
  {
    region: DEFAULT_REGION,
    timeoutSeconds: FUNCTION_TIMEOUT.SHORT,
    secrets: [FRONTEND_URL],
  },
  withAuth(
    async (request) => {
      // Validate and sanitize input using centralized validator
      const validatedData = validateRequest(
        request.data,
        VALIDATION_SCHEMAS.sendVerificationEmail,
        request.auth?.uid
      );

      const {userId, email, displayName} = validatedData;

      const db = getFirestore();
      const userRef = db.collection("users").doc(userId);
      const userDoc = await userRef.get();

      if (!userDoc.exists) {
        throw createError(ErrorCode.NOT_FOUND, "User record not found.");
      }

      const userData = userDoc.data() as UserDocument;
      if (userData.emailVerified) {
        return {success: true, message: "Email is already verified."};
      }

      // Generate verification token and expiry
      const verificationToken = generateSecureToken();
      const hashedToken = hashToken(verificationToken);
      const verificationExpires = Timestamp.fromMillis(Date.now() + TOKEN_EXPIRY.EMAIL_VERIFICATION);

      await userRef.update({
        emailVerificationToken: hashedToken,
        emailVerificationExpires: verificationExpires,
        email: email, // Update email if it's being changed during this process
      });

      // Get frontend URL (with fallback for development)
      const frontendUrlValue = FRONTEND_URL.value() ||
        (process.env.FUNCTIONS_EMULATOR === "true" ? "http://localhost:3000" : "https://mydynastyapp.com");

      const verificationLink = `${frontendUrlValue}/verify-email?token=${verificationToken}`;

      logger.info("Sending verification email", {
        userId: request.auth?.uid,
        email,
        verificationLink,
        frontendUrl: frontendUrlValue,
        environment: process.env.FUNCTIONS_EMULATOR === "true" ? "DEVELOPMENT" : "PRODUCTION",
      });

      try {
        // Use the updated sendEmail helper function
        await sendEmail({
          to: email,
          templateType: "verification",
          dynamicTemplateData: {
            userName: displayName || userData.firstName || "User",
            verificationUrl: verificationLink, // Note: changed from verificationLink to verificationUrl for template consistency
          },
        });

        logger.info(`Verification email sent successfully to ${email} for user ${request.auth?.uid}`);
        return {success: true, message: "Verification email sent successfully."};
      } catch (error) {
        logger.error("Failed to send verification email:", {
          error: error instanceof Error ? error.message : error,
          userId: request.auth?.uid,
          email,
          verificationLink,
        });
        throw createError(ErrorCode.INTERNAL, ERROR_MESSAGES.EMAIL_SEND_FAILED);
      }
    },
    "sendVerificationEmail",
    {
      authLevel: "auth",
      enableCSRF: false, // Disable CSRF for email verification - auth + rate limiting provides sufficient protection
      rateLimitConfig: {
        type: RateLimitType.AUTH,
        maxRequests: 3, // 3 verification emails per hour
        windowSeconds: 3600, // 1 hour window
      },
    }
  )
);

/**
 * Verifies a user's email address using the token from the verification link
 */
export const verifyEmail = onCall(
  {
    region: DEFAULT_REGION,
    timeoutSeconds: FUNCTION_TIMEOUT.SHORT,
    secrets: [],
  },
  withAuth(async (request) => {
    // Validate and sanitize input using centralized validator
    const validatedData = validateRequest(
      request.data,
      VALIDATION_SCHEMAS.verifyEmail,
      request.auth?.uid
    );

    const {token} = validatedData;

    const db = getFirestore();
    const hashedToken = hashToken(token);

    // Find user by token
    const usersRef = db.collection("users");
    const query = usersRef.where("emailVerificationToken", "==", hashedToken).limit(1);
    const snapshot = await query.get();

    if (snapshot.empty) {
      throw createError(ErrorCode.INVALID_ARGUMENT, ERROR_MESSAGES.INVALID_TOKEN);
    }

    const userDoc = snapshot.docs[0];
    const userData = userDoc.data() as UserDocument;

    // Check if token expired
    if (userData.emailVerificationExpires && userData.emailVerificationExpires.toMillis() < Date.now()) {
      // Clear expired token
      await userDoc.ref.update({
        emailVerificationToken: null,
        emailVerificationExpires: null,
      });
      throw createError(ErrorCode.INVALID_ARGUMENT, ERROR_MESSAGES.EXPIRED_TOKEN);
    }

    // Mark email as verified and clear token
    await userDoc.ref.update({
      emailVerified: true,
      emailVerificationToken: null,
      emailVerificationExpires: null,
      updatedAt: FieldValue.serverTimestamp(),
    });

    // Also update Firebase Auth user record
    try {
      await getAuth().updateUser(userDoc.id, {emailVerified: true});
      logger.info(`Email verified for user ${userDoc.id} via token.`);
    } catch (authError) {
      logger.error(`Failed to update Firebase Auth record for user ${userDoc.id} after email verification:`, authError);
    }

    return {success: true, message: "Email verified successfully."};
  }, "verifyEmail", {
    authLevel: "none", // Email verification doesn't require auth
    enableCSRF: true,
    rateLimitConfig: {
      type: RateLimitType.AUTH,
      maxRequests: 10, // Allow more attempts for email verification
      windowSeconds: 3600, // 1 hour window
    },
  })
);
