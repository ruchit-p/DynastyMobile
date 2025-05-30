import {getSendGridConfig} from "./sendgridConfig";
import {createError, ErrorCode} from "../../utils/errors";

export const initSendGrid = () => {
  const config = getSendGridConfig();
  if (!config.apiKey || config.apiKey.length === 0) {
    throw createError(ErrorCode.INTERNAL, "SendGrid API key is not set");
  }

  // Use require() to load SendGrid in CommonJS environment
  const sgMail = require("@sendgrid/mail");

  // Check if the module loaded correctly
  if (!sgMail || typeof sgMail.setApiKey !== "function") {
    throw createError(ErrorCode.INTERNAL, "SendGrid module failed to load properly");
  }

  sgMail.setApiKey(config.apiKey);
};
