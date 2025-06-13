import * as crypto from "crypto";
import {logger} from "firebase-functions/v2";
import {createLogContext} from "../../utils/sanitization";

interface SNSMessage {
  Type: string;
  MessageId: string;
  TopicArn: string;
  Subject?: string;
  Message: string;
  Timestamp: string;
  SignatureVersion: string;
  Signature: string;
  SigningCertURL: string;
  Token?: string; // Present in subscription confirmation
  SubscribeURL?: string; // Present in subscription confirmation
}

/**
 * Validates SNS message signature for security
 * Implements AWS SNS signature verification algorithm
 */
export async function validateSNSSignature(message: SNSMessage): Promise<boolean> {
  try {
    // Check signature version
    if (message.SignatureVersion !== "1") {
      logger.warn(
        "Unsupported SNS signature version",
        createLogContext({
          signatureVersion: message.SignatureVersion,
          messageId: message.MessageId,
        })
      );
      return false;
    }

    // Validate signing certificate URL
    if (!isValidSigningCertURL(message.SigningCertURL)) {
      logger.warn(
        "Invalid signing certificate URL",
        createLogContext({
          signingCertURL: message.SigningCertURL,
          messageId: message.MessageId,
        })
      );
      return false;
    }

    // Download and cache the certificate
    const certificate = await downloadSigningCertificateWithCache(message.SigningCertURL);
    if (!certificate) {
      logger.error(
        "Failed to download signing certificate",
        createLogContext({
          signingCertURL: message.SigningCertURL,
          messageId: message.MessageId,
        })
      );
      return false;
    }

    // Build the string to sign based on message type
    const stringToSign = buildStringToSign(message);

    // Verify signature
    const isValid = verifySignature(stringToSign, message.Signature, certificate);

    if (!isValid) {
      logger.warn(
        "SNS signature verification failed",
        createLogContext({
          messageId: message.MessageId,
          type: message.Type,
        })
      );
    }

    return isValid;
  } catch (error) {
    logger.error(
      "Error validating SNS signature",
      createLogContext({
        error: error instanceof Error ? error.message : String(error),
        messageId: message.MessageId,
      })
    );
    return false;
  }
}

/**
 * Validates that the signing certificate URL is from AWS
 */
function isValidSigningCertURL(url: string): boolean {
  try {
    const parsedURL = new URL(url);

    // Must be HTTPS
    if (parsedURL.protocol !== "https:") {
      return false;
    }

    // Must be from sns.amazonaws.com or sns.<region>.amazonaws.com
    const hostname = parsedURL.hostname;
    if (!hostname.endsWith(".amazonaws.com")) {
      return false;
    }

    // Must be an SNS domain
    if (!hostname.match(/^sns\.[a-z0-9-]+\.amazonaws\.com$/)) {
      return false;
    }

    // Path must end with .pem
    if (!parsedURL.pathname.endsWith(".pem")) {
      return false;
    }

    return true;
  } catch {
    return false;
  }
}

/**
 * Downloads and caches the SNS signing certificate
 */
async function downloadSigningCertificate(url: string): Promise<string | null> {
  try {
    // In production, you might want to cache certificates
    // For now, we'll download fresh each time
    const response = await fetch(url);

    if (!response.ok) {
      logger.error(
        "Failed to download certificate",
        createLogContext({
          url,
          status: response.status,
          statusText: response.statusText,
        })
      );
      return null;
    }

    const certificate = await response.text();

    // Basic validation that it looks like a PEM certificate
    if (
      !certificate.includes("-----BEGIN CERTIFICATE-----") ||
      !certificate.includes("-----END CERTIFICATE-----")
    ) {
      logger.error(
        "Downloaded content is not a valid PEM certificate",
        createLogContext({
          url,
          contentPreview: certificate.substring(0, 100),
        })
      );
      return null;
    }

    return certificate;
  } catch (error) {
    logger.error(
      "Error downloading signing certificate",
      createLogContext({
        url,
        error: error instanceof Error ? error.message : String(error),
      })
    );
    return null;
  }
}

/**
 * Builds the canonical string to sign for different message types
 */
function buildStringToSign(message: SNSMessage): string {
  const fields: string[] = [];

  // Fields to include based on message type
  const fieldsToSign =
    message.Type === "SubscriptionConfirmation" || message.Type === "UnsubscribeConfirmation" ?
      ["Message", "MessageId", "SubscribeURL", "Timestamp", "Token", "TopicArn", "Type"] :
      ["Message", "MessageId", "Subject", "Timestamp", "TopicArn", "Type"];

  // Build canonical string
  for (const field of fieldsToSign) {
    const value = (message as any)[field];
    if (value !== undefined && value !== null) {
      fields.push(`${field}\n${value}\n`);
    }
  }

  return fields.join("");
}

/**
 * Verifies the signature using the public key from the certificate
 */
function verifySignature(stringToSign: string, signature: string, certificate: string): boolean {
  try {
    // Create verifier
    const verifier = crypto.createVerify("RSA-SHA1");
    verifier.update(stringToSign, "utf8");

    // Verify signature
    return verifier.verify(certificate, signature, "base64");
  } catch (error) {
    logger.error(
      "Error verifying signature",
      createLogContext({
        error: error instanceof Error ? error.message : String(error),
      })
    );
    return false;
  }
}

/**
 * Cache for storing downloaded certificates (in-memory cache)
 * In production, consider using Redis or another persistent cache
 */
const certificateCache = new Map<string, { certificate: string; timestamp: number }>();
const CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours

/**
 * Downloads signing certificate with caching
 */
async function downloadSigningCertificateWithCache(url: string): Promise<string | null> {
  // Check cache first
  const cached = certificateCache.get(url);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.certificate;
  }

  // Download fresh certificate
  const certificate = await downloadSigningCertificate(url);
  if (certificate) {
    // Cache the certificate
    certificateCache.set(url, {
      certificate,
      timestamp: Date.now(),
    });
  }

  return certificate;
}

/**
 * Validates the timestamp is recent (within 15 minutes)
 * Helps prevent replay attacks
 */
export function isTimestampRecent(timestamp: string): boolean {
  try {
    const messageTime = new Date(timestamp).getTime();
    const currentTime = Date.now();
    const fifteenMinutes = 15 * 60 * 1000;

    return Math.abs(currentTime - messageTime) <= fifteenMinutes;
  } catch {
    return false;
  }
}
