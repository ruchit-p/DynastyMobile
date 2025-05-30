import {MailDataRequired} from "@sendgrid/mail";
import {getSendGridConfig} from "../config/sendgridConfig";
import {logger} from "firebase-functions/v2";
import {createError, ErrorCode} from "../../utils/errors";

interface SendEmailOptions {
  to: string;
  templateType: "verification" | "passwordReset" | "invite";
  dynamicTemplateData: Record<string, any>;
  fromName?: string;
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
 * Helper function to send emails using SendGrid with bundled config
 */
export async function sendEmail(options: SendEmailOptions): Promise<void> {
  const {to, templateType, dynamicTemplateData, fromName = "Dynasty App"} = options;

  // Get configuration
  const config = getSendGridConfig();

  logger.info("SendGrid configuration loaded", {
    hasApiKey: !!config.apiKey,
    fromEmail: config.fromEmail,
    templateType,
    templateId: config.templates[templateType],
  });

  // Initialize SendGrid using require to ensure compatibility
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const sgMail = require("@sendgrid/mail");

  if (!sgMail || typeof sgMail.setApiKey !== "function") {
    throw createError(ErrorCode.INTERNAL, "SendGrid module failed to load properly");
  }

  sgMail.setApiKey(config.apiKey);
  logger.info("SendGrid initialized successfully");

  // Validate configuration
  if (!config.fromEmail || !config.templates[templateType]) {
    logger.error(`SendGrid configuration missing for template type: ${templateType}`);
    throw createError(ErrorCode.INTERNAL, "Email service configuration error.");
  }

  // Build email message
  const msg: MailDataRequired = {
    to,
    from: {
      email: config.fromEmail,
      name: fromName,
    },
    templateId: config.templates[templateType],
    dynamicTemplateData,
  };

  try {
    // Ensure URLs in email templates use the correct base URL
    const baseUrl = getBaseUrl();
    const updatedTemplateData = {
      ...dynamicTemplateData,
      baseUrl,
      // Override any existing URL fields with environment-appropriate ones
      verificationUrl: dynamicTemplateData.verificationUrl ?
        dynamicTemplateData.verificationUrl.replace(/https?:\/\/[^/]+/, baseUrl) :
        dynamicTemplateData.verificationUrl,
      resetUrl: dynamicTemplateData.resetUrl ?
        dynamicTemplateData.resetUrl.replace(/https?:\/\/[^/]+/, baseUrl) :
        dynamicTemplateData.resetUrl,
      inviteUrl: dynamicTemplateData.inviteUrl ?
        dynamicTemplateData.inviteUrl.replace(/https?:\/\/[^/]+/, baseUrl) :
        dynamicTemplateData.inviteUrl,
    };

    // Update the message with corrected template data
    msg.dynamicTemplateData = updatedTemplateData;

    // Send the email (works in all environments now)
    const response = await sgMail.send(msg);

    const environmentLabel = process.env.FUNCTIONS_EMULATOR === "true" ? "DEVELOPMENT" :
      process.env.NODE_ENV === "staging" ? "STAGING" : "PRODUCTION";

    logger.info(`📧 Email sent successfully (${environmentLabel})`, {
      to,
      templateType,
      baseUrl,
      environment: environmentLabel,
      sendgridResponse: {
        statusCode: response?.[0]?.statusCode,
        body: response?.[0]?.body,
        headers: response?.[0]?.headers,
      },
    });
  } catch (error: any) {
    const environmentLabel = process.env.FUNCTIONS_EMULATOR === "true" ? "DEVELOPMENT" :
      process.env.NODE_ENV === "staging" ? "STAGING" : "PRODUCTION";

    // Extract detailed error information
    const errorDetails = {
      message: error?.message || "Unknown error",
      code: error?.code || "Unknown code",
      status: error?.response?.status || "Unknown status",
      statusText: error?.response?.statusText || "Unknown status text",
      body: error?.response?.body || "No response body",
      stack: error?.stack || "No stack trace",
    };

    logger.error(`Failed to send email (${environmentLabel}):`, {
      errorDetails,
      to,
      templateType,
      environment: environmentLabel,
      baseUrl: getBaseUrl(),
      templateData: msg.dynamicTemplateData,
    });

    // Always throw error - let the calling function decide how to handle it
    throw createError(ErrorCode.INTERNAL, `Failed to send email. SendGrid error: ${errorDetails.message}`);
  }
}
