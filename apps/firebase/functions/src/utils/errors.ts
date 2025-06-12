import {logger} from "firebase-functions/v2";
import {HttpsError} from "firebase-functions/v2/https";

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
  INVALID_REQUEST = "invalid-request",

  // Resource errors
  NOT_FOUND = "not-found",
  RESOURCE_EXHAUSTED = "resource-exhausted",
  FAILED_PRECONDITION = "failed-precondition",

  // Rate limiting
  RATE_LIMITED = "rate-limited",

  // Service errors
  SERVICE_UNAVAILABLE = "service-unavailable",

  // Sync errors
  SYNC_CONFLICT = "sync-conflict",
  SYNC_QUEUE_FULL = "sync-queue-full",
  OFFLINE_OPERATION_FAILED = "offline-operation-failed",
  SYNC_VERSION_MISMATCH = "sync-version-mismatch",

  // General errors
  ABORTED = "aborted",
  INTERNAL = "internal",
  UNKNOWN = "unknown",
  UNIMPLEMENTED = "unimplemented",
  INVALID_STATE = "invalid-state",

  // Subscription/Payment errors
  SUBSCRIPTION_NOT_FOUND = "subscription-not-found",
  PAYMENT_FAILED = "payment-failed",
  PAYMENT_METHOD_REQUIRED = "payment-method-required",
  PLAN_CHANGE_INVALID = "plan-change-invalid",
  FAMILY_MEMBER_LIMIT = "family-member-limit",
  FAMILY_MEMBER_LIMIT_EXCEEDED = "family-member-limit-exceeded",
  ADDON_INVALID = "addon-invalid",
  REFERRAL_INVALID = "referral-invalid",
  REFERRAL_EXPIRED = "referral-expired",
  STRIPE_ERROR = "stripe-error",
  WEBHOOK_SIGNATURE_INVALID = "webhook-signature-invalid",
  WEBHOOK_SIGNATURE_MISSING = "webhook-signature-missing",
  SUBSCRIPTION_EXPIRED = "subscription-expired",
  STORAGE_LIMIT_EXCEEDED = "storage-limit-exceeded",

  // Phase 2: Enhanced subscription and family plan errors
  SUBSCRIPTION_ALREADY_EXISTS = "subscription-already-exists",
  CUSTOMER_CREATION_FAILED = "customer-creation-failed",
  FAMILY_RELATIONSHIP_NOT_VERIFIED = "family-relationship-not-verified",
  FAMILY_MEMBER_ALREADY_IN_PLAN = "family-member-already-in-plan",
  FAMILY_MEMBER_NOT_FOUND = "family-member-not-found",
  INVITATION_EXPIRED = "invitation-expired",
  INVITATION_ALREADY_ACCEPTED = "invitation-already-accepted",
  INVITATION_ALREADY_DECLINED = "invitation-already-declined",

  // Phase 2: Addon-specific errors
  ADDON_NOT_ELIGIBLE = "addon-not-eligible",
  ADDON_LIMIT_EXCEEDED = "addon-limit-exceeded",
  ADDON_CONFLICT = "addon-conflict",
  ADDON_ALREADY_EXISTS = "addon-already-exists",
  ADDON_NOT_FOUND = "addon-not-found",
  ADDON_TIER_REQUIREMENT_NOT_MET = "addon-tier-requirement-not-met",
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
  [ErrorCode.INVALID_REQUEST]: "Invalid request provided.",

  // Resource errors
  [ErrorCode.NOT_FOUND]: "The requested resource was not found.",
  [ErrorCode.RESOURCE_EXHAUSTED]: "Resource limit exceeded.",
  [ErrorCode.FAILED_PRECONDITION]: "Operation failed due to precondition check.",

  // Rate limiting
  [ErrorCode.RATE_LIMITED]: "Too many requests. Please try again later.",

  // Service errors
  [ErrorCode.SERVICE_UNAVAILABLE]: "Service is temporarily unavailable. Please try again later.",

  // Sync errors
  [ErrorCode.SYNC_CONFLICT]: "Data conflict detected. Please resolve conflicts before syncing.",
  [ErrorCode.SYNC_QUEUE_FULL]: "Sync queue is full. Please try again later.",
  [ErrorCode.OFFLINE_OPERATION_FAILED]: "Offline operation failed. Please check your connection.",
  [ErrorCode.SYNC_VERSION_MISMATCH]: "Data version mismatch. Please refresh and try again.",

  // General errors
  [ErrorCode.ABORTED]: "The operation was aborted.",
  [ErrorCode.INTERNAL]: "An internal error occurred. Please try again later.",
  [ErrorCode.UNKNOWN]: "An unknown error occurred. Please try again.",
  [ErrorCode.INVALID_STATE]: "The operation cannot be performed in the current state.",

  // Subscription/Payment errors
  [ErrorCode.SUBSCRIPTION_NOT_FOUND]: "Subscription not found. Please check your account status.",
  [ErrorCode.PAYMENT_FAILED]: "Payment failed. Please check your payment method and try again.",
  [ErrorCode.PAYMENT_METHOD_REQUIRED]:
    "Payment method required. Please add a valid payment method.",
  [ErrorCode.PLAN_CHANGE_INVALID]:
    "Invalid plan change. Please check plan requirements and try again.",
  [ErrorCode.FAMILY_MEMBER_LIMIT]:
    "Family member limit reached. Please upgrade your plan to add more members.",
  [ErrorCode.FAMILY_MEMBER_LIMIT_EXCEEDED]:
    "Family member limit exceeded. Maximum members allowed for this plan.",
  [ErrorCode.ADDON_INVALID]: "Invalid addon selection. This addon is not available for your plan.",
  [ErrorCode.REFERRAL_INVALID]: "Invalid referral code. Please check and try again.",
  [ErrorCode.REFERRAL_EXPIRED]: "Referral code has expired. Please request a new one.",
  [ErrorCode.STRIPE_ERROR]: "Payment processing error. Please try again or contact support.",
  [ErrorCode.WEBHOOK_SIGNATURE_INVALID]: "Invalid webhook signature. Request not authenticated.",
  [ErrorCode.WEBHOOK_SIGNATURE_MISSING]: "Missing webhook signature. Request not authenticated.",
  [ErrorCode.SUBSCRIPTION_EXPIRED]: "Your subscription has expired. Please renew to continue.",
  [ErrorCode.STORAGE_LIMIT_EXCEEDED]:
    "Storage limit exceeded. Please upgrade your plan or remove some files.",

  // Phase 2: Enhanced subscription and family plan error messages
  [ErrorCode.SUBSCRIPTION_ALREADY_EXISTS]:
    "You already have an active subscription. Use upgrade/downgrade to change your plan.",
  [ErrorCode.CUSTOMER_CREATION_FAILED]:
    "Failed to setup billing account. Please try again or contact support.",
  [ErrorCode.FAMILY_RELATIONSHIP_NOT_VERIFIED]:
    "Family relationship could not be verified. Please ensure this person is in your family tree.",
  [ErrorCode.FAMILY_MEMBER_ALREADY_IN_PLAN]: "This person is already a member of a family plan.",
  [ErrorCode.INVITATION_EXPIRED]: "This invitation has expired. Please request a new invitation.",
  [ErrorCode.INVITATION_ALREADY_ACCEPTED]: "This invitation has already been accepted.",
  [ErrorCode.INVITATION_ALREADY_DECLINED]: "This invitation has already been declined.",

  // Phase 2: Addon-specific error messages
  [ErrorCode.ADDON_NOT_ELIGIBLE]:
    "This addon is not available for your current plan. Addons are only available for Individual plans.",
  [ErrorCode.ADDON_LIMIT_EXCEEDED]:
    "Addon limit exceeded. You have reached the maximum number of addons for your plan.",
  [ErrorCode.ADDON_CONFLICT]:
    "This addon conflicts with your existing addons. Please remove conflicting addons first.",
  [ErrorCode.ADDON_ALREADY_EXISTS]: "You already have this addon active on your subscription.",
  [ErrorCode.ADDON_NOT_FOUND]: "Addon not found. It may have already been removed.",
  [ErrorCode.ADDON_TIER_REQUIREMENT_NOT_MET]:
    "This addon requires a higher tier plan. Please upgrade your tier first.",
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
 * Custom security error class for rate limiting and other security violations
 */
export class SecurityError extends Error {
  public readonly code: string;
  public readonly details?: any;

  constructor(code: string, message: string, details?: any) {
    super(message);
    this.name = "SecurityError";
    this.code = code;
    this.details = details;
  }
}

/**
 * Creates a standardized HttpsError for Dynasty Firebase functions
 *
 * @param code - ErrorCode enum value
 * @param message - Optional custom message, defaults to standard message
 * @param data - Optional additional error data
 * @returns HttpsError with standardized format
 */
export function createError(code: ErrorCode, message?: string, data?: ErrorData): HttpsError {
  const httpsErrorCode = mapToHttpsErrorCode(code);
  return new HttpsError(httpsErrorCode, message || code, data);
}

/**
 * Maps our application ErrorCode to Firebase functions HttpsErrorCode
 */
function mapToHttpsErrorCode(
  code: ErrorCode
):
  | "ok"
  | "cancelled"
  | "unknown"
  | "invalid-argument"
  | "deadline-exceeded"
  | "not-found"
  | "already-exists"
  | "permission-denied"
  | "resource-exhausted"
  | "failed-precondition"
  | "aborted"
  | "out-of-range"
  | "unimplemented"
  | "internal"
  | "unavailable"
  | "data-loss"
  | "unauthenticated" {
  switch (code) {
  // Authentication errors
  case ErrorCode.UNAUTHENTICATED:
  case ErrorCode.INVALID_TOKEN:
  case ErrorCode.EXPIRED_TOKEN:
  case ErrorCode.INVALID_CREDENTIALS:
  case ErrorCode.TOKEN_EXPIRED:
    return "unauthenticated";
  case ErrorCode.EMAIL_EXISTS:
  case ErrorCode.ALREADY_EXISTS:
    return "already-exists";
  case ErrorCode.VERIFICATION_FAILED:
    return "invalid-argument"; // Or another appropriate mapping

    // Authorization errors
  case ErrorCode.PERMISSION_DENIED:
  case ErrorCode.INSUFFICIENT_PERMISSIONS:
    return "permission-denied";

    // Input validation errors
  case ErrorCode.INVALID_ARGUMENT:
  case ErrorCode.INVALID_FORMAT:
  case ErrorCode.MISSING_PARAMETERS:
  case ErrorCode.INVALID_REQUEST:
    return "invalid-argument";

    // Resource errors
  case ErrorCode.NOT_FOUND:
    return "not-found";
  case ErrorCode.RESOURCE_EXHAUSTED:
  case ErrorCode.RATE_LIMITED: // Grouping RATE_LIMITED here
  case ErrorCode.SYNC_QUEUE_FULL:
    return "resource-exhausted";
  case ErrorCode.FAILED_PRECONDITION:
    return "failed-precondition";

    // Service errors
  case ErrorCode.SERVICE_UNAVAILABLE:
    return "unavailable";

    // Sync errors
  case ErrorCode.SYNC_CONFLICT:
  case ErrorCode.SYNC_VERSION_MISMATCH:
    return "failed-precondition";
  case ErrorCode.OFFLINE_OPERATION_FAILED:
    return "unavailable";

    // General errors
  case ErrorCode.ABORTED:
    return "aborted";
  case ErrorCode.INTERNAL:
    return "internal";
  case ErrorCode.UNKNOWN:
    return "unknown";
  case ErrorCode.UNIMPLEMENTED:
    return "unavailable"; // Mapped to unavailable as per previous attempt

    // Subscription/Payment errors
  case ErrorCode.SUBSCRIPTION_NOT_FOUND:
    return "not-found";
  case ErrorCode.PAYMENT_FAILED:
  case ErrorCode.PAYMENT_METHOD_REQUIRED:
  case ErrorCode.STRIPE_ERROR:
    return "failed-precondition";
  case ErrorCode.PLAN_CHANGE_INVALID:
  case ErrorCode.ADDON_INVALID:
  case ErrorCode.REFERRAL_INVALID:
  case ErrorCode.REFERRAL_EXPIRED:
    return "invalid-argument";
  case ErrorCode.FAMILY_MEMBER_LIMIT:
  case ErrorCode.FAMILY_MEMBER_LIMIT_EXCEEDED:
  case ErrorCode.STORAGE_LIMIT_EXCEEDED:
    return "resource-exhausted";
  case ErrorCode.WEBHOOK_SIGNATURE_INVALID:
  case ErrorCode.WEBHOOK_SIGNATURE_MISSING:
    return "unauthenticated";
  case ErrorCode.SUBSCRIPTION_EXPIRED:
    return "failed-precondition";

    // Phase 2: Enhanced subscription and family plan error mappings
  case ErrorCode.SUBSCRIPTION_ALREADY_EXISTS:
    return "already-exists";
  case ErrorCode.CUSTOMER_CREATION_FAILED:
    return "failed-precondition";
  case ErrorCode.FAMILY_RELATIONSHIP_NOT_VERIFIED:
  case ErrorCode.FAMILY_MEMBER_ALREADY_IN_PLAN:
    return "failed-precondition";
  case ErrorCode.INVITATION_EXPIRED:
  case ErrorCode.INVITATION_ALREADY_ACCEPTED:
  case ErrorCode.INVITATION_ALREADY_DECLINED:
    return "failed-precondition";

    // Phase 2: Addon-specific error mappings
  case ErrorCode.ADDON_NOT_ELIGIBLE:
  case ErrorCode.ADDON_TIER_REQUIREMENT_NOT_MET:
    return "failed-precondition";
  case ErrorCode.ADDON_LIMIT_EXCEEDED:
    return "resource-exhausted";
  case ErrorCode.ADDON_CONFLICT:
    return "failed-precondition";
  case ErrorCode.ADDON_ALREADY_EXISTS:
    return "already-exists";
  case ErrorCode.ADDON_NOT_FOUND:
    return "not-found";

  case ErrorCode.INVALID_STATE:
    return "failed-precondition";

  default: {
    // This exhaustive check helps ensure all enum members are considered.
    // If new ErrorCodes are added, TypeScript will error here until they are mapped.
    logger.error("Unhandled ErrorCode in mapToHttpsErrorCode:", code);
    return "internal"; // Fallback for safety, though ideally unreachable
  }
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
    ...context,
  };

  if (error instanceof HttpsError) {
    // Log and re-throw existing HttpsError
    logger.error(`[${functionName}] ${error.code}: ${error.message}`, {
      ...errorData,
      httpsErrorData: error.details,
    });
    throw error;
  }

  let code = defaultCode;

  // Try to determine error type from error message
  if (error instanceof Error) {
    if (error.message.includes("permission denied") || error.message.includes("not authorized")) {
      code = ErrorCode.PERMISSION_DENIED;
    } else if (
      error.message.includes("not found") ||
      error.message.toLowerCase().includes("no document to update")
    ) {
      code = ErrorCode.NOT_FOUND;
    } else if (error.message.includes("already exists")) {
      code = ErrorCode.ALREADY_EXISTS;
    } else if (error.message.includes("invalid argument") || error.message.includes("required")) {
      code = ErrorCode.INVALID_ARGUMENT;
    }

    errorData.originalError = {
      message: error.message,
      stack: error.stack,
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
export function withErrorHandling<T extends(...args: any[]) => Promise<any>>(
  fn: T,
  functionName: string
): (...args: Parameters<T>) => Promise<Awaited<ReturnType<T>>> {
  return async (...args: Parameters<T>) => {
    try {
      return await fn(...args);
    } catch (error) {
      handleError(error, functionName);
      // The above will throw, but TypeScript doesn't know that
      throw new Error("Unreachable");
    }
  };
}
