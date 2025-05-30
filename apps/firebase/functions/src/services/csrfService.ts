import * as crypto from "crypto";
import {createCipheriv, createDecipheriv} from "crypto";
import {logger} from "firebase-functions/v2";
import {createError, ErrorCode} from "../utils/errors";

/**
 * CSRF token data structure
 */
interface CSRFTokenData {
  token: string;
  timestamp: number;
  userId: string;
  sessionId: string;
}

/**
 * Service for generating and validating CSRF tokens
 * Uses AES-256-GCM encryption for token security
 */
export class CSRFService {
  private static readonly ALGORITHM = "aes-256-gcm";
  private static readonly TOKEN_EXPIRY = 4 * 60 * 60 * 1000; // 4 hours
  private static readonly IV_LENGTH = 16;
  private static readonly AUTH_TAG_LENGTH = 16;

  /**
   * Get or generate the CSRF secret key
   * In production, this should be set via environment variable
   */
  private static getSecretKey(): Buffer {
    const secretKey = process.env.CSRF_SECRET_KEY;

    if (!secretKey) {
      // In production, this MUST be set
      if (process.env.NODE_ENV === "production" || process.env.FUNCTIONS_EMULATOR !== "true") {
        throw createError(
          ErrorCode.INTERNAL,
          "CSRF_SECRET_KEY must be set in production environment"
        );
      }

      // Development only: use a consistent key for testing
      logger.warn("CSRF_SECRET_KEY not set, using development key (NOT FOR PRODUCTION)");
      return Buffer.from("development-only-csrf-secret-key-do-not-use-in-production-ever", "utf8").subarray(0, 32);
    }

    return Buffer.from(secretKey, "hex");
  }

  /**
   * Generate a new CSRF token for a user session
   * @param userId User ID
   * @param sessionId Session ID
   * @returns Encrypted CSRF token
   */
  static generateToken(userId: string, sessionId: string): string {
    if (!userId || !sessionId) {
      throw createError(
        ErrorCode.INVALID_ARGUMENT,
        "User ID and session ID are required for CSRF token generation"
      );
    }

    const tokenData: CSRFTokenData = {
      token: crypto.randomBytes(32).toString("hex"),
      timestamp: Date.now(),
      userId,
      sessionId,
    };

    return this.encryptToken(tokenData);
  }

  /**
   * Validate CSRF token from request
   * @param encryptedToken Encrypted token from client
   * @param userId Expected user ID
   * @param sessionId Expected session ID
   * @returns Boolean indicating if token is valid
   */
  static validateToken(
    encryptedToken: string,
    userId: string,
    sessionId: string
  ): boolean {
    if (!encryptedToken || !userId || !sessionId) {
      return false;
    }

    try {
      const tokenData = this.decryptToken(encryptedToken);

      // Check token expiry
      if (Date.now() - tokenData.timestamp > this.TOKEN_EXPIRY) {
        logger.debug(`CSRF token expired for user ${userId}`);
        return false;
      }

      // Validate user and session
      if (tokenData.userId !== userId || tokenData.sessionId !== sessionId) {
        logger.warn(`CSRF token mismatch for user ${userId}`);
        return false;
      }

      return true;
    } catch (error) {
      logger.error("CSRF token validation error:", error);
      return false;
    }
  }

  /**
   * Encrypt token data
   * @param data Token data to encrypt
   * @returns Base64 encoded encrypted data
   */
  private static encryptToken(data: CSRFTokenData): string {
    const key = this.getSecretKey();
    const iv = crypto.randomBytes(this.IV_LENGTH);
    const cipher = createCipheriv(this.ALGORITHM, key, iv);

    const jsonData = JSON.stringify(data);
    const encrypted = Buffer.concat([
      cipher.update(jsonData, "utf8"),
      cipher.final(),
    ]);

    const authTag = cipher.getAuthTag();

    // Combine IV, auth tag, and encrypted data
    const combined = Buffer.concat([iv, authTag, encrypted]);

    return combined.toString("base64");
  }

  /**
   * Decrypt token data
   * @param encryptedData Base64 encoded encrypted data
   * @returns Decrypted token data
   */
  private static decryptToken(encryptedData: string): CSRFTokenData {
    const buffer = Buffer.from(encryptedData, "base64");
    const key = this.getSecretKey();

    // Extract components
    const iv = buffer.subarray(0, this.IV_LENGTH);
    const authTag = buffer.subarray(this.IV_LENGTH, this.IV_LENGTH + this.AUTH_TAG_LENGTH);
    const encrypted = buffer.subarray(this.IV_LENGTH + this.AUTH_TAG_LENGTH);

    const decipher = createDecipheriv(this.ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);

    const decrypted = Buffer.concat([
      decipher.update(encrypted),
      decipher.final(),
    ]);

    return JSON.parse(decrypted.toString("utf8"));
  }

  /**
   * Get time until token expiry in milliseconds
   * @param encryptedToken Encrypted token
   * @returns Milliseconds until expiry, or 0 if expired/invalid
   */
  static getTimeUntilExpiry(encryptedToken: string): number {
    try {
      const tokenData = this.decryptToken(encryptedToken);
      const expiryTime = tokenData.timestamp + this.TOKEN_EXPIRY;
      const timeUntilExpiry = expiryTime - Date.now();

      return Math.max(0, timeUntilExpiry);
    } catch (error) {
      return 0;
    }
  }
}

// Export an instance for convenience
export const csrfService = CSRFService;
