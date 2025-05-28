import {CallableRequest, onCall} from "firebase-functions/v2/https";
import {logger} from "firebase-functions/v2";
import {CSRFService} from "../services/csrfService";
import {createError, ErrorCode, withErrorHandling} from "../utils/errors";
import {requireAuth} from "./auth";
import {getCorsOptions} from "../config/cors";

/**
 * Extended request interface with CSRF token data
 */
export interface CSRFValidatedRequest<T = any> extends CallableRequest<T> {
  csrfToken?: string;
  sessionId?: string;
}

/**
 * Parse cookies from header string
 * @param cookieHeader Cookie header string
 * @returns Parsed cookies as key-value pairs
 */
function parseCookies(cookieHeader: string): Record<string, string> {
  if (!cookieHeader) return {};

  return cookieHeader
    .split(";")
    .map((cookie) => cookie.trim().split("="))
    .reduce((acc, [key, value]) => {
      if (key && value) {
        acc[key] = decodeURIComponent(value);
      }
      return acc;
    }, {} as Record<string, string>);
}

/**
 * Check if the request is from a mobile app
 * @param userAgent User agent string
 * @returns Boolean indicating if request is from mobile app
 */
function isMobileApp(userAgent: string): boolean {
  return userAgent.includes("Expo") ||
         userAgent.includes("okhttp") ||
         userAgent.includes("Dynasty/Mobile");
}

/**
 * Middleware to validate CSRF tokens for state-changing operations
 * @param handler The function handler to wrap
 * @returns Wrapped function with CSRF validation
 */
export function requireCSRFToken<T = any, R = any>(
  handler: (request: CSRFValidatedRequest<T>) => Promise<R>
) {
  return async (request: CSRFValidatedRequest<T>): Promise<R> => {
    // Skip CSRF check for mobile apps (they use different auth)
    const userAgent = request.rawRequest.headers["user-agent"] || "";
    if (isMobileApp(userAgent)) {
      logger.debug("Skipping CSRF check for mobile app request");
      return handler(request);
    }

    // Extract CSRF token from header
    const csrfHeader = request.rawRequest.headers["x-csrf-token"] as string;
    const cookieHeader = request.rawRequest.headers.cookie || "";
    const cookies = parseCookies(cookieHeader);
    const csrfCookie = cookies["csrf-token"];

    if (!csrfHeader) {
      throw createError(
        ErrorCode.PERMISSION_DENIED,
        "CSRF token missing in request header"
      );
    }

    if (!csrfCookie) {
      throw createError(
        ErrorCode.PERMISSION_DENIED,
        "CSRF token missing in cookie"
      );
    }

    // Validate tokens match (double-submit cookie pattern)
    if (csrfHeader !== csrfCookie) {
      logger.warn("CSRF token mismatch", {
        userId: request.auth?.uid,
        userAgent,
        ip: request.rawRequest.ip,
      });
      throw createError(
        ErrorCode.PERMISSION_DENIED,
        "CSRF token mismatch"
      );
    }

    // Get session ID from auth token
    const sessionId = request.auth?.token?.sessionId ||
                     request.auth?.token?.session_id;

    if (!sessionId) {
      throw new HttpsError(
        "unauthenticated",
        "No valid session found for CSRF validation"
      );
    }

    // Validate encrypted token
    const userId = request.auth?.uid || "";
    const isValid = CSRFService.validateToken(csrfHeader, userId, sessionId);

    if (!isValid) {
      logger.warn("Invalid or expired CSRF token", {
        userAgent,
        ip: request.rawRequest.ip,
        timestamp: new Date().toISOString(),
      });
      throw createError(
        ErrorCode.PERMISSION_DENIED,
        "Invalid or expired CSRF token"
      );
    }

    // Add validated data to request
    request.csrfToken = csrfHeader;
    request.sessionId = sessionId;

    // Only log in development
    if (process.env.NODE_ENV !== "production") {
      logger.debug("CSRF token validated successfully", {userId});
    }

    return handler(request);
  };
}

/**
 * Higher-order function that combines authentication and CSRF protection
 * @param handler The function handler to wrap
 * @returns Wrapped function with auth and CSRF checks
 */
export function withCSRFProtection<T = any, R = any>(
  handler: (request: CSRFValidatedRequest<T>) => Promise<R>
) {
  return requireCSRFToken(async (request: CSRFValidatedRequest<T>) => {
    // Ensure user is authenticated
    requireAuth(request);
    return handler(request);
  });
}

/**
 * Generate CSRF token endpoint
 * This endpoint is called by the web client to get a new CSRF token
 */
export const generateCSRFToken = onCall(
  {
    ...getCorsOptions(),
    region: "us-central1",
  },
  withErrorHandling(async (request: CallableRequest) => {
    // Require authentication
    const uid = requireAuth(request);

    // Get or generate session ID
    const sessionId = request.auth?.token?.sessionId ||
                     request.auth?.token?.session_id ||
                     crypto.randomBytes(16).toString("hex");

    // Generate new CSRF token
    const token = CSRFService.generateToken(uid, sessionId);
    const expiresIn = 4 * 60 * 60 * 1000; // 4 hours in milliseconds

    // Only log in development
    if (process.env.NODE_ENV !== "production") {
      logger.debug("Generated new CSRF token", {userId: uid});
    }

    return {
      token,
      expiresIn,
      sessionId,
    };
  }, "generateCSRFToken")
);

/**
 * Validate CSRF token endpoint (for testing)
 * This endpoint can be used to test if a CSRF token is valid
 */
export const validateCSRFToken = onCall(
  {
    ...getCorsOptions(),
    region: "us-central1",
  },
  withCSRFProtection(async (request: CSRFValidatedRequest<{token: string}>) => {
    // If we reach here, the token is valid
    return {
      valid: true,
      userId: request.auth?.uid,
      sessionId: request.sessionId,
      timeUntilExpiry: CSRFService.getTimeUntilExpiry(request.data.token),
    };
  })
);

// Import crypto for session ID generation
import * as crypto from "crypto";
