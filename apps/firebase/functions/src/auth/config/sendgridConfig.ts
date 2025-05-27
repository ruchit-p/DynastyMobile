import {SENDGRID_CONFIG} from "./secrets";

interface SendGridConfigData {
  apiKey: string;
  fromEmail: string;
  templates: {
    verification: string;
    passwordReset: string;
    invite: string;
  };
}

/**
 * Get SendGrid configuration from bundled secret or individual secrets
 */
export function getSendGridConfig(): SendGridConfigData {
  // For local development with emulator
  if (process.env.FUNCTIONS_EMULATOR === "true") {
    // Try bundled config first
    if (process.env.SENDGRID_CONFIG) {
      try {
        return JSON.parse(process.env.SENDGRID_CONFIG);
      } catch (e) {
        // Fall through to individual env vars
      }
    }

    // Fallback to individual env vars
    return {
      apiKey: process.env.SENDGRID_APIKEY!,
      fromEmail: process.env.SENDGRID_FROMEMAIL!,
      templates: {
        verification: process.env.SENDGRID_TEMPLATES_VERIFICATION!,
        passwordReset: process.env.SENDGRID_TEMPLATES_PASSWORDRESET!,
        invite: process.env.SENDGRID_TEMPLATES_INVITE!,
      },
    };
  }

  // In production, try bundled secret first
  try {
    const configJson = SENDGRID_CONFIG.value();
    return JSON.parse(configJson);
  } catch (e) {
    // If bundled config fails, throw error
    throw new Error("SendGrid configuration not found. Please set SENDGRID_CONFIG secret.");
  }
}
