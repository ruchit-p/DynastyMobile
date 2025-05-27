import * as sgMail from "@sendgrid/mail";
import {getSendGridConfig} from "./sendgridConfig";
import {createError, ErrorCode} from "../../utils/errors";

export const initSendGrid = () => {
  const config = getSendGridConfig();
  if (!config.apiKey || config.apiKey.length === 0) {
    throw createError(ErrorCode.INTERNAL, "SendGrid API key is not set");
  }
  sgMail.setApiKey(config.apiKey);
};
