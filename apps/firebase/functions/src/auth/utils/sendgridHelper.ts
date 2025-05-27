import * as sgMail from "@sendgrid/mail";
import {MailDataRequired} from "@sendgrid/mail";
import {getSendGridConfig} from "../config/sendgridConfig";
import {initSendGrid} from "../config/sendgrid";
import {logger} from "firebase-functions/v2";
import {createError, ErrorCode} from "../../utils/errors";

interface SendEmailOptions {
  to: string;
  templateType: "verification" | "passwordReset" | "invite";
  dynamicTemplateData: Record<string, any>;
  fromName?: string;
}

/**
 * Helper function to send emails using SendGrid with bundled config
 */
export async function sendEmail(options: SendEmailOptions): Promise<void> {
  const {to, templateType, dynamicTemplateData, fromName = "Dynasty App"} = options;

  // Initialize SendGrid
  initSendGrid();

  // Get configuration
  const config = getSendGridConfig();

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
    await sgMail.send(msg);
    logger.info("Email sent successfully", {to, templateType});
  } catch (error) {
    logger.error("Failed to send email:", {error, to, templateType});
    throw createError(ErrorCode.INTERNAL, "Failed to send email. Please try again later.");
  }
}
