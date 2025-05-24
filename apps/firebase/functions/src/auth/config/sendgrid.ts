import * as sgMail from "@sendgrid/mail";
import {SENDGRID_APIKEY} from "./secrets";
import {createError, ErrorCode} from "../../utils/errors";

export const initSendGrid = () => {
  const apiKey = SENDGRID_APIKEY.value();
  if (!apiKey || apiKey.length === 0) {
    throw createError(ErrorCode.INTERNAL, "SendGrid API key is not set");
  }
  sgMail.setApiKey(apiKey);
};
