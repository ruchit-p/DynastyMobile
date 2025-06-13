import * as crypto from "crypto";
import {logger} from "firebase-functions/v2";

/**
 * Generates a secure random token
 */
export const generateSecureToken = (): string => {
  const token = crypto.randomBytes(32).toString("hex");
  logger.debug("Generated new token:", {
    tokenLength: token.length,
    tokenFirstChars: token.substring(0, 4),
    tokenLastChars: token.substring(token.length - 4),
  });
  return token;
};

/**
 * Hashes a token using SHA256
 */
export const hashToken = (token: string): string => {
  const hashedToken = crypto.createHash("sha256").update(token).digest("hex");
  logger.debug("Hashed token:", {
    originalTokenLength: token.length,
    hashedTokenLength: hashedToken.length,
    originalTokenFirstChars: token.substring(0, 4),
    hashedTokenFirstChars: hashedToken.substring(0, 4),
  });
  return hashedToken;
};
