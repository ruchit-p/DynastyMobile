import {logger} from "firebase-functions/v2";
import {EMAIL_PROVIDER} from "./secrets";

export type EmailProvider = "sendgrid" | "ses";

/**
 * Get the configured email provider
 * Defaults to SES
 */
export function getEmailProvider(): EmailProvider {
  // For local development
  if (process.env.FUNCTIONS_EMULATOR === "true") {
    const provider = process.env.EMAIL_PROVIDER as EmailProvider;
    if (provider === "ses" || provider === "sendgrid") {
      logger.info(`Using ${provider.toUpperCase()} as email provider (from env)`);
      return provider;
    }
    // Default to SES
    logger.info("No EMAIL_PROVIDER set, defaulting to SES");
    return "ses";
  }

  // In production, check secret
  try {
    const provider = EMAIL_PROVIDER.value() as EmailProvider;
    if (provider === "ses" || provider === "sendgrid") {
      logger.info(`Using ${provider.toUpperCase()} as email provider (from secret)`);
      return provider;
    }
  } catch (e) {
    logger.warn("EMAIL_PROVIDER secret not found or invalid");
  }

  // Default to SES
  logger.info("Defaulting to SES");
  return "ses";
}

/**
 * Universal email sending function that routes to the appropriate provider
 */
export async function sendEmailUniversal(options: {
  to: string;
  templateType: "verification" | "passwordReset" | "invite" | "mfa";
  dynamicTemplateData: Record<string, any>;
  fromName?: string;
}): Promise<void> {
  const provider = getEmailProvider();

  if (provider === "ses") {
    const {sendEmail} = await import("../utils/sesHelper");
    return sendEmail(options);
  } else {
    // SendGrid support has been removed - use SES instead
    throw new Error("SendGrid support has been removed. Please use AWS SES by setting EMAIL_PROVIDER=ses");
  }
}
