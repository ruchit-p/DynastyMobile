import {onCall} from "firebase-functions/v2/https";
import {getFirestore, Timestamp, FieldValue} from "firebase-admin/firestore";
import {logger} from "firebase-functions/v2";
import {getAuth} from "firebase-admin/auth";
import {MailDataRequired} from "@sendgrid/mail";
import * as sgMail from "@sendgrid/mail";
import {isValidEmail} from "../../utils/validation";
import {DEFAULT_REGION, FUNCTION_TIMEOUT} from "../../common";
import {createError, withErrorHandling, ErrorCode} from "../../utils/errors";
import {withAuth, RateLimitType} from "../../middleware";
import {UserDocument} from "../types/user";
import {initSendGrid} from "../config/sendgrid";
import {SENDGRID_APIKEY, SENDGRID_FROMEMAIL, SENDGRID_TEMPLATES_VERIFICATION, FRONTEND_URL} from "../config/secrets";
import {ERROR_MESSAGES, TOKEN_EXPIRY} from "../config/constants";
import {generateSecureToken, hashToken} from "../utils/tokens";

/**
 * Sends a verification email to a newly registered user
 */
export const sendVerificationEmail = onCall(
  {
    region: DEFAULT_REGION,
    timeoutSeconds: FUNCTION_TIMEOUT.SHORT,
    secrets: [SENDGRID_APIKEY, SENDGRID_FROMEMAIL, SENDGRID_TEMPLATES_VERIFICATION, FRONTEND_URL],
  },
  withAuth(
    async (request) => {
      const {userId, email, displayName} = request.data;

      if (!email || !isValidEmail(email)) {
        throw createError(ErrorCode.INVALID_ARGUMENT, "Valid email address is required.");
      }

      initSendGrid();
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

      // Prepare and send email
      const fromEmail = SENDGRID_FROMEMAIL.value();
      const verificationTemplateId = SENDGRID_TEMPLATES_VERIFICATION.value();
      const frontendUrlValue = FRONTEND_URL.value();

      if (!fromEmail || !verificationTemplateId || !frontendUrlValue) {
        logger.error("SendGrid configuration secrets are missing for sendVerificationEmail.");
        throw createError(ErrorCode.INTERNAL, "Email service configuration error.");
      }

      const verificationLink = `${frontendUrlValue}/verify-email?token=${verificationToken}`;
      const msg: MailDataRequired = {
        to: email,
        from: {
          email: fromEmail,
          name: "Dynasty App",
        },
        templateId: verificationTemplateId,
        dynamicTemplateData: {
          userName: displayName || userData.firstName || "User",
          verificationLink: verificationLink,
        },
      };

      try {
        await sgMail.send(msg);
        logger.info(`Verification email sent to ${email} for user ${request.auth?.uid}`);
        return {success: true, message: "Verification email sent successfully."};
      } catch (error) {
        logger.error("Failed to send verification email:", {error, userId: request.auth?.uid, email});
        throw createError(ErrorCode.INTERNAL, ERROR_MESSAGES.EMAIL_SEND_FAILED);
      }
    },
    "sendVerificationEmail",
    "auth", // Authentication level
    {
      type: RateLimitType.AUTH,
      maxRequests: 3, // 3 verification emails per hour
      windowSeconds: 3600, // 1 hour window
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
  withErrorHandling(async (request) => {
    const {token} = request.data;

    if (!token || typeof token !== "string") {
      throw createError(ErrorCode.INVALID_ARGUMENT, "Verification token is required.");
    }

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
  }, "verifyEmail")
);
