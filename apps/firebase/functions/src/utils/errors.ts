import * as functions from "firebase-functions";
import { logger } from "firebase-functions";

/**
 * Standardized error codes for Dynasty application
 */
export enum ErrorCode {
  // Authentication errors
  UNAUTHENTICATED = "unauthenticated",
  INVALID_TOKEN = "invalid-token",
  EXPIRED_TOKEN = "expired-token",
  ALREADY_EXISTS = "already-exists",
  INVALID_CREDENTIALS = "invalid-credentials",
  TOKEN_EXPIRED = "token-expired",
  EMAIL_EXISTS = "email-exists",
  VERIFICATION_FAILED = "verification-failed",
  
  // Authorization errors
  PERMISSION_DENIED = "permission-denied",
  INSUFFICIENT_PERMISSIONS = "insufficient-permissions",
  
  // Input validation errors
  INVALID_ARGUMENT = "invalid-argument",
  INVALID_FORMAT = "invalid-format",
  MISSING_PARAMETERS = "missing-parameters",
  
  // Resource errors
  NOT_FOUND = "not-found",
  RESOURCE_EXHAUSTED = "resource-exhausted",
  
  // Rate limiting
  RATE_LIMITED = "rate-limited",
  
  // Service errors
  SERVICE_UNAVAILABLE = "service-unavailable",
  
  // General errors
  ABORTED = "aborted",
  INTERNAL = "internal",
  UNKNOWN = "unknown"
}

/**
 * Standardized error messages for Dynasty application
 */
export const ErrorMessages = {
  // Authentication errors
  [ErrorCode.UNAUTHENTICATED]: "Authentication required. Please sign in and try again.",
  [ErrorCode.INVALID_TOKEN]: "Invalid authentication token. Please sign in again.",
  [ErrorCode.EXPIRED_TOKEN]: "Your session has expired. Please sign in again.",
  [ErrorCode.ALREADY_EXISTS]: "This resource already exists.",
  [ErrorCode.INVALID_CREDENTIALS]: "Invalid credentials provided. Please check and try again.",
  [ErrorCode.TOKEN_EXPIRED]: "Your verification link has expired. Please request a new one.",
  [ErrorCode.EMAIL_EXISTS]: "An account with this email already exists.",
  [ErrorCode.VERIFICATION_FAILED]: "Email verification failed. Please try again.",
  
  // Authorization errors
  [ErrorCode.PERMISSION_DENIED]: "You don't have permission to perform this action.",
  [ErrorCode.INSUFFICIENT_PERMISSIONS]: "You don't have sufficient permissions for this operation.",
  
  // Input validation errors
  [ErrorCode.INVALID_ARGUMENT]: "Invalid argument provided.",
  [ErrorCode.INVALID_FORMAT]: "Invalid format provided.",
  [ErrorCode.MISSING_PARAMETERS]: "Required parameters are missing.",
  
  // Resource errors
  [ErrorCode.NOT_FOUND]: "The requested resource was not found.",
  [ErrorCode.RESOURCE_EXHAUSTED]: "Resource limit exceeded.",
  
  // Rate limiting
  [ErrorCode.RATE_LIMITED]: "Too many requests. Please try again later.",
  
  // Service errors
  [ErrorCode.SERVICE_UNAVAILABLE]: "Service is temporarily unavailable. Please try again later.",
  
  // General errors
  [ErrorCode.ABORTED]: "The operation was aborted.",
  [ErrorCode.INTERNAL]: "An internal error occurred. Please try again later.",
  [ErrorCode.UNKNOWN]: "An unknown error occurred. Please try again."
};

/**
 * Error data to include in HttpsError for additional error context
 */
export interface ErrorData {
  field?: string;
  details?: any;
  [key: string]: any;
}

/**
 * Creates a standardized HttpsError for Dynasty Firebase functions
 * 
 * @param code - ErrorCode enum value
 * @param message - Optional custom message, defaults to standard message
 * @param data - Optional additional error data
 * @returns HttpsError with standardized format
 */
export function createError(
  code: ErrorCode,
  message?: string,
  data?: ErrorData
): functions.https.HttpsError {
  // Determine proper https error code
  const httpsErrorCode = mapToHttpsErrorCode(code);
  
  // Use custom message or fall back to standard message
  const errorMessage = message || ErrorMessages[code];
  
  // Create error with standardized code, message, and data
  return new functions.https.HttpsError(httpsErrorCode, errorMessage, data);
}

/**
 * Maps our application ErrorCode to Firebase functions HttpsErrorCode
 */
function mapToHttpsErrorCode(code: ErrorCode): functions.https.FunctionsErrorCode {
  switch (code) {
    case ErrorCode.UNAUTHENTICATED:
      return "unauthenticated";
    case ErrorCode.INVALID_TOKEN:
    case ErrorCode.EXPIRED_TOKEN:
      return "unauthenticated";
    case ErrorCode.PERMISSION_DENIED:
    case ErrorCode.INSUFFICIENT_PERMISSIONS:
      return "permission-denied";
    case ErrorCode.INVALID_ARGUMENT:
    case ErrorCode.INVALID_FORMAT:
    case ErrorCode.MISSING_PARAMETERS:
      return "invalid-argument";
    case ErrorCode.NOT_FOUND:
      return "not-found";
    case ErrorCode.ALREADY_EXISTS:
    case ErrorCode.EMAIL_EXISTS:
      return "already-exists";
    case ErrorCode.RESOURCE_EXHAUSTED:
    case ErrorCode.RATE_LIMITED:
      return "resource-exhausted";
    case ErrorCode.SERVICE_UNAVAILABLE:
      return "unavailable";
    case ErrorCode.ABORTED:
      return "aborted";
    default:
      return "internal";
  }
}

/**
 * Handle and log error before throwing HttpsError
 * 
 * @param error - The original error to handle
 * @param functionName - Name of the function where error occurred
 * @param defaultCode - Default error code to use if not detected
 * @param context - Additional contextual data for logging
 * @throws HttpsError with standardized format
 */
export function handleError(
  error: any,
  functionName: string,
  defaultCode: ErrorCode = ErrorCode.INTERNAL,
  context: Record<string, any> = {}
): never {
  const errorData: ErrorData = {
    functionName,
    ...context
  };

  if (error instanceof functions.https.HttpsError) {
    // Log and re-throw existing HttpsError
    logger.error(`[${functionName}] ${error.code}: ${error.message}`, {
      ...errorData,
      httpsErrorData: error.details
    });
    throw error;
  }

  let code = defaultCode;

  // Try to determine error type from error message
  if (error instanceof Error) {
    if (error.message.includes("permission denied") || error.message.includes("not authorized")) {
      code = ErrorCode.PERMISSION_DENIED;
    } else if (error.message.includes("not found") || error.message.toLowerCase().includes("no document to update")) {
      code = ErrorCode.NOT_FOUND;
    } else if (error.message.includes("already exists")) {
      code = ErrorCode.ALREADY_EXISTS;
    } else if (error.message.includes("invalid argument") || error.message.includes("required")) {
      code = ErrorCode.INVALID_ARGUMENT;
    }

    errorData.originalError = {
      message: error.message,
      stack: error.stack
    };
  } else {
    errorData.originalError = error;
  }

  // Log error with context
  logger.error(`[${functionName}] ${code}: ${error.message || "Unknown error"}`, errorData);

  // Create and throw standardized error
  throw createError(code, error.message, errorData);
}

/**
 * Wraps a function to add standardized error handling
 * 
 * @param fn - The function to wrap
 * @param functionName - Name of the function for logging
 * @returns Wrapped function with error handling
 */
export function withErrorHandling<T extends (...args: any[]) => Promise<any>>(
  fn: T,
  functionName: string
): (...args: Parameters<T>) => ReturnType<T> {
  return async (...args: Parameters<T>): ReturnType<T> => {
    try {
      return await fn(...args);
    } catch (error) {
      handleError(error, functionName);
      // The above will throw, but TypeScript doesn't know that
      throw new Error("Unreachable");
    }
  };
}