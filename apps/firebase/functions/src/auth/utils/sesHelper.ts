import {getSESConfig} from "../config/sesConfig";
import {logger} from "firebase-functions/v2";
import {createError, ErrorCode} from "../../utils/errors";
import {getSESService, SES_TEMPLATE_NAMES, mapTemplateVariables} from "../../services/sesService";
import {createLogContext} from "../../utils/sanitization";
import {getUnsubscribeService} from "../../services/unsubscribeService";
import {getFirestore} from "firebase-admin/firestore";

interface SendEmailOptions {
  to: string;
  templateType:
    | "verification"
    | "passwordReset"
    | "invite"
    | "mfa"
    | "paymentFailed"
    | "paymentRetry"
    | "subscriptionSuspended";
  dynamicTemplateData: Record<string, any>;
  fromName?: string;
  userId?: string;
}

/**
 * Get the appropriate base URL for the current environment
 */
function getBaseUrl(): string {
  // Check environment variables for explicit configuration
  if (process.env.BASE_URL) {
    return process.env.BASE_URL;
  }

  // Environment-specific URLs
  if (process.env.FUNCTIONS_EMULATOR === "true" || process.env.NODE_ENV === "development") {
    return "http://localhost:3000"; // Development
  }

  if (process.env.NODE_ENV === "staging") {
    return "https://dynastytest.com"; // Staging
  }

  return "https://mydynastyapp.com"; // Production
}

/**
 * Helper function to send emails using AWS SES
 * Drop-in replacement for sendgridHelper.ts
 */
export async function sendEmail(options: SendEmailOptions): Promise<void> {
  const {to, templateType, dynamicTemplateData, fromName, userId} = options;

  try {
    // Get configuration
    const config = getSESConfig();

    // Override fromName if provided
    if (fromName) {
      config.fromName = fromName;
    }

    logger.info(
      "SES configuration loaded",
      createLogContext({
        hasConfig: !!config,
        fromEmail: config.fromEmail,
        fromName: config.fromName || "Dynasty App",
        templateType,
        templateName: SES_TEMPLATE_NAMES[templateType],
        region: config.region,
      })
    );

    // Ensure required fields are present for SESService
    const sesConfig = {
      ...config,
      fromName: config.fromName || "Dynasty App", // Provide default if not set
    };

    // Initialize or get SES service
    const sesService = getSESService(sesConfig);

    // Generate unsubscribe links for compliance
    const unsubscribeService = getUnsubscribeService();
    let unsubscribeUrl = "";
    let preferencesUrl = "";

    // Determine if this is a marketing email or transactional
    const isMarketingEmail = [
      "invite",
      "paymentFailed",
      "paymentRetry",
      "subscriptionSuspended",
    ].includes(templateType);

    if (isMarketingEmail) {
      try {
        // Try to find userId from email if not provided
        let resolvedUserId = userId;
        if (!resolvedUserId) {
          const db = getFirestore();
          const userQuery = await db
            .collection("users")
            .where("email", "==", to.toLowerCase())
            .limit(1)
            .get();

          if (!userQuery.empty) {
            resolvedUserId = userQuery.docs[0].id;
          }
        }

        unsubscribeUrl = await unsubscribeService.generateUnsubscribeUrl(
          to,
          resolvedUserId,
          "unsubscribe-all"
        );
        preferencesUrl = await unsubscribeService.generatePreferenceCenterUrl(to, resolvedUserId);
      } catch (error) {
        logger.warn(
          "Failed to generate unsubscribe links",
          createLogContext({
            error: error instanceof Error ? error.message : String(error),
            templateType,
            to: to.substring(0, 3) + "***",
          })
        );
        // Fallback URLs
        const baseUrl = getBaseUrl();
        unsubscribeUrl = `${baseUrl}/unsubscribe`;
        preferencesUrl = `${baseUrl}/email-preferences`;
      }
    }

    // Ensure URLs in email templates use the correct base URL
    const baseUrl = getBaseUrl();
    const updatedTemplateData = {
      ...dynamicTemplateData,
      baseUrl,
      // Add compliance URLs
      unsubscribeUrl,
      preferencesUrl,
      // Company information for CAN-SPAM compliance
      companyName: "Dynasty Platforms LLC",
      companyAddress: "7901 4th St N STE 300, St. Petersburg, FL 33702",
      // Override any existing URL fields with environment-appropriate ones
      verificationUrl: dynamicTemplateData.verificationUrl ?
        dynamicTemplateData.verificationUrl.replace(/https?:\/\/[^/]+/, baseUrl) :
        dynamicTemplateData.verificationUrl,
      resetUrl: dynamicTemplateData.resetUrl ?
        dynamicTemplateData.resetUrl.replace(/https?:\/\/[^/]+/, baseUrl) :
        dynamicTemplateData.resetUrl,
      resetLink: dynamicTemplateData.resetLink ?
        dynamicTemplateData.resetLink.replace(/https?:\/\/[^/]+/, baseUrl) :
        dynamicTemplateData.resetLink,
      inviteUrl: dynamicTemplateData.inviteUrl ?
        dynamicTemplateData.inviteUrl.replace(/https?:\/\/[^/]+/, baseUrl) :
        dynamicTemplateData.inviteUrl,
      acceptLink: dynamicTemplateData.acceptLink ?
        dynamicTemplateData.acceptLink.replace(/https?:\/\/[^/]+/, baseUrl) :
        dynamicTemplateData.acceptLink,
      signUpLink: dynamicTemplateData.signUpLink ?
        dynamicTemplateData.signUpLink.replace(/https?:\/\/[^/]+/, baseUrl) :
        dynamicTemplateData.signUpLink,
    };

    // Map template variables from SendGrid format to SES format
    const mappedTemplateData = mapTemplateVariables(templateType, updatedTemplateData);

    // Get the SES template name
    const sesTemplateName = SES_TEMPLATE_NAMES[templateType];

    // Send the email using SES
    await sesService.sendTemplatedEmail({
      to,
      template: sesTemplateName,
      templateData: mappedTemplateData,
      emailType: isMarketingEmail ? "marketing" : "transactional",
      // Add List-Unsubscribe headers for marketing emails
      ...(isMarketingEmail &&
        unsubscribeUrl && {
        // Note: SES service would need to be updated to support custom headers
        customHeaders: {
          "List-Unsubscribe": `<${unsubscribeUrl}>`,
          "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
        },
      }),
    });

    const environmentLabel =
      process.env.FUNCTIONS_EMULATOR === "true" ?
        "DEVELOPMENT" :
        process.env.NODE_ENV === "staging" ?
          "STAGING" :
          "PRODUCTION";

    logger.info(
      `📧 Email sent successfully via SES (${environmentLabel})`,
      createLogContext({
        to,
        templateType,
        templateName: sesTemplateName,
        baseUrl,
        environment: environmentLabel,
      })
    );
  } catch (error: any) {
    const environmentLabel =
      process.env.FUNCTIONS_EMULATOR === "true" ?
        "DEVELOPMENT" :
        process.env.NODE_ENV === "staging" ?
          "STAGING" :
          "PRODUCTION";

    // Extract detailed error information
    const errorDetails = {
      message: error?.message || "Unknown error",
      code: error?.code || "Unknown code",
      statusCode: error?.statusCode,
      type: error?.type,
      stack: error?.stack || "No stack trace",
    };

    logger.error(
      `Failed to send email via SES (${environmentLabel}):`,
      createLogContext({
        errorDetails,
        to,
        templateType,
        environment: environmentLabel,
        baseUrl: getBaseUrl(),
      })
    );

    // Re-throw the error if it's already a Firebase error
    if (error.code && error.code.startsWith("functions/")) {
      throw error;
    }

    // Otherwise, create a new error
    throw createError(ErrorCode.INTERNAL, `Failed to send email: ${errorDetails.message}`);
  }
}

/**
 * Send MFA code email (new functionality not in SendGrid implementation)
 */
export async function sendMFACode(options: {
  to: string;
  code: string;
  username: string;
  expiryMinutes?: number;
}): Promise<void> {
  const {to, code, username, expiryMinutes = 10} = options;

  await sendEmail({
    to,
    templateType: "mfa",
    dynamicTemplateData: {
      username,
      code,
      expiryMinutes: expiryMinutes.toString(),
    },
  });
}
