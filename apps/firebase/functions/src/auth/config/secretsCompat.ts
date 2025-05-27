/**
 * Compatibility layer for SendGrid secrets
 * This allows existing code to work with the bundled SENDGRID_CONFIG secret
 */
import {getSendGridConfig} from "./sendgridConfig";

// Create compatibility wrappers that extract values from the bundled secret
export const SENDGRID_APIKEY = {
  value: () => {
    const config = getSendGridConfig();
    return config.apiKey;
  },
};

export const SENDGRID_FROMEMAIL = {
  value: () => {
    const config = getSendGridConfig();
    return config.fromEmail;
  },
};

export const SENDGRID_TEMPLATES_VERIFICATION = {
  value: () => {
    const config = getSendGridConfig();
    return config.templates.verification;
  },
};

export const SENDGRID_TEMPLATES_PASSWORDRESET = {
  value: () => {
    const config = getSendGridConfig();
    return config.templates.passwordReset;
  },
};

export const SENDGRID_TEMPLATES_INVITE = {
  value: () => {
    const config = getSendGridConfig();
    return config.templates.invite;
  },
};

// Re-export other non-bundled secrets
export {SENDGRID_CONFIG, FRONTEND_URL} from "./secrets";
