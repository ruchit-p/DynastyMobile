import {onCall} from "firebase-functions/v2/https";
import {getFirestore} from "firebase-admin/firestore";
import {logger} from "firebase-functions/v2";
import {getAuth} from "firebase-admin/auth";
import {FUNCTION_TIMEOUT, DEFAULT_REGION} from "./common";
import {createError, ErrorCode} from "./utils/errors";
import {createLogContext} from "./utils";
import {validateRequest} from "./utils/request-validator";
import {VALIDATION_SCHEMAS} from "./config/validation-schemas";
import {withAuth, RateLimitType} from "./middleware/auth";
import {getNotionService, SupportTicketData} from "./services/notionService";

/**
 * Submit support message from authenticated users
 * Automatically fetches user info from auth context
 */
export const submitSupportMessage = onCall({
  region: DEFAULT_REGION,
  memory: "256MiB",
  timeoutSeconds: FUNCTION_TIMEOUT.SHORT,
  secrets: ["NOTION_API_KEY", "NOTION_DB_ID"],
}, withAuth(
  async (request) => {
    // Validate and sanitize input
    const validatedData = validateRequest(
      request.data,
      VALIDATION_SCHEMAS.submitSupportMessage,
      request.auth?.uid
    );

    const {message, category} = validatedData;

    logger.info("submitSupportMessage: Processing support request", createLogContext({
      userId: request.auth?.uid,
      category,
    }));

    try {
      const auth = getAuth();
      const db = getFirestore();

      // Get user information
      const userRecord = await auth.getUser(request.auth!.uid);
      const userDoc = await db.collection("users").doc(request.auth!.uid).get();
      const userData = userDoc.data();

      // Prepare support ticket data
      const ticketData: SupportTicketData = {
        name: userData?.displayName || userRecord.displayName || "Unknown User",
        email: userRecord.email,
        phone: userData?.phoneNumber || userRecord.phoneNumber,
        category: category || "other",
        message: message.trim(),
        userId: request.auth!.uid,
      };

      // Create support ticket in Notion
      const notionService = getNotionService();
      const ticketId = await notionService.createSupportTicket(ticketData);

      logger.info("submitSupportMessage: Support ticket created", createLogContext({
        userId: request.auth!.uid,
        ticketId,
        category,
      }));

      return {
        success: true,
        ticketId,
        message: "Your support request has been submitted successfully. We'll get back to you soon.",
      };
    } catch (error: any) {
      logger.error("submitSupportMessage: Failed to create support ticket", createLogContext({
        userId: request.auth?.uid,
        error: error?.message || "Unknown error",
      }));

      throw createError(
        ErrorCode.INTERNAL,
        "Failed to submit support request. Please try again later."
      );
    }
  },
  "submitSupportMessage",
  {
    authLevel: "auth", // Requires authenticated user
    rateLimitConfig: {
      type: RateLimitType.SUPPORT,
      maxRequests: 3,
      windowSeconds: 21600, // 6 hours
    },
  }
));

/**
 * Submit contact message from public contact form
 * Available to unauthenticated users
 */
export const submitContactMessage = onCall({
  region: DEFAULT_REGION,
  memory: "256MiB",
  timeoutSeconds: FUNCTION_TIMEOUT.SHORT,
  secrets: ["NOTION_API_KEY", "NOTION_DB_ID"],
}, withAuth(
  async (request) => {
    // Validate and sanitize input
    const validatedData = validateRequest(
      request.data,
      VALIDATION_SCHEMAS.submitContactMessage,
      undefined
    );

    const {name, email, subject, message} = validatedData;

    logger.info("submitContactMessage: Processing contact request", createLogContext({
      email,
      subject,
    }));

    try {
      // Check if user exists (optional - for better support experience)
      let userId: string | undefined;
      try {
        const auth = getAuth();
        const userRecord = await auth.getUserByEmail(email);
        userId = userRecord.uid;
      } catch {
        // User doesn't exist, that's fine for public contact form
      }

      // Prepare support ticket data
      const ticketData: SupportTicketData = {
        name: name.trim(),
        email: email.trim(),
        category: subject, // Maps subject to category
        message: message.trim(),
        userId,
      };

      // Create support ticket in Notion
      const notionService = getNotionService();
      const ticketId = await notionService.createSupportTicket(ticketData);

      logger.info("submitContactMessage: Contact message created", createLogContext({
        ticketId,
        email,
        subject,
      }));

      return {
        success: true,
        ticketId,
        message: "Thank you for contacting us. We'll respond to your inquiry within 24-48 hours.",
      };
    } catch (error: any) {
      logger.error("submitContactMessage: Failed to create contact message", createLogContext({
        email,
        error: error?.message || "Unknown error",
      }));

      throw createError(
        ErrorCode.INTERNAL,
        "Failed to submit your message. Please try again later."
      );
    }
  },
  "submitContactMessage",
  {
    authLevel: "none", // Public endpoint - no auth required
    rateLimitConfig: {
      type: RateLimitType.SUPPORT,
      maxRequests: 3,
      windowSeconds: 21600, // 6 hours
    },
  }
));

/**
 * Admin function to get support ticket statistics
 * Only accessible to admin users
 */
export const getSupportStats = onCall({
  region: DEFAULT_REGION,
  memory: "256MiB",
  timeoutSeconds: FUNCTION_TIMEOUT.SHORT,
  secrets: ["NOTION_API_KEY", "NOTION_DB_ID"],
}, withAuth(
  async (request) => {
    // Check if user is admin
    const db = getFirestore();
    const userDoc = await db.collection("users").doc(request.auth!.uid).get();
    const userData = userDoc.data();

    if (!userData?.isAdmin) {
      throw createError(
        ErrorCode.PERMISSION_DENIED,
        "Admin access required for this operation."
      );
    }

    const timeRange = request.data?.timeRange || "week";

    logger.info("getSupportStats: Fetching support statistics", createLogContext({
      userId: request.auth?.uid,
      timeRange,
    }));

    try {
      const notionService = getNotionService();
      const stats = await notionService.getSupportTicketStats(timeRange);

      return {
        success: true,
        stats,
      };
    } catch (error: any) {
      logger.error("getSupportStats: Failed to fetch statistics", createLogContext({
        userId: request.auth?.uid,
        error: error?.message || "Unknown error",
      }));

      throw createError(
        ErrorCode.INTERNAL,
        "Failed to fetch support statistics."
      );
    }
  },
  "getSupportStats",
  {
    authLevel: "onboarded", // Requires onboarded user (we'll add admin check in handler)
    rateLimitConfig: {
      type: RateLimitType.API,
      maxRequests: 60,
      windowSeconds: 60, // Standard API rate limit
    },
  }
));
