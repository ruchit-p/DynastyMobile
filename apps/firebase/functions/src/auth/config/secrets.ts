import {defineSecret} from "firebase-functions/params";

export const SENDGRID_APIKEY = defineSecret("SENDGRID_APIKEY");
export const SENDGRID_FROMEMAIL = defineSecret("SENDGRID_FROMEMAIL");
export const SENDGRID_TEMPLATES_VERIFICATION = defineSecret("SENDGRID_TEMPLATES_VERIFICATION");
export const SENDGRID_TEMPLATES_PASSWORDRESET = defineSecret("SENDGRID_TEMPLATES_PASSWORDRESET");
export const SENDGRID_TEMPLATES_INVITE = defineSecret("SENDGRID_TEMPLATES_INVITE");
export const FRONTEND_URL = defineSecret("FRONTEND_URL");
