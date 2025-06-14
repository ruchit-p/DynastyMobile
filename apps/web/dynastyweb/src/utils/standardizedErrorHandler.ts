/**
 * Standardized Error Handler
 * Bridges Firebase Functions error codes with web client error handling
 * Provides consistent error handling across platforms
 */

import { toast } from '@/components/ui/use-toast';
import { errorHandler, ErrorSeverity, ErrorMetadata } from '@/services/ErrorHandlingService';

// Mirror of Firebase Functions ErrorCode enum for consistency
export enum StandardErrorCode {
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

  // File/Security errors
  FILE_TOO_LARGE = "file-too-large",
  INVALID_FILE_TYPE = "invalid-file-type",
  SECURITY_VIOLATION = "security-violation",
  ACCOUNT_LOCKED = "account-locked",

  // General errors
  ABORTED = "aborted",
  INTERNAL = "internal",
  UNKNOWN = "unknown",
  UNIMPLEMENTED = "unimplemented",
  INVALID_STATE = "invalid-state",
}

// Standardized error messages that match Firebase Functions
export const StandardErrorMessages = {
  [StandardErrorCode.UNAUTHENTICATED]: "Authentication required. Please sign in and try again.",
  [StandardErrorCode.INVALID_TOKEN]: "Invalid authentication token. Please sign in again.",
  [StandardErrorCode.EXPIRED_TOKEN]: "Your session has expired. Please sign in again.",
  [StandardErrorCode.ALREADY_EXISTS]: "This resource already exists.",
  [StandardErrorCode.INVALID_CREDENTIALS]: "Invalid credentials provided. Please check and try again.",
  [StandardErrorCode.TOKEN_EXPIRED]: "Your verification link has expired. Please request a new one.",
  [StandardErrorCode.EMAIL_EXISTS]: "An account with this email already exists.",
  [StandardErrorCode.VERIFICATION_FAILED]: "Email verification failed. Please try again.",
  [StandardErrorCode.PERMISSION_DENIED]: "You don't have permission to perform this action.",
  [StandardErrorCode.INSUFFICIENT_PERMISSIONS]: "You don't have sufficient permissions for this operation.",
  [StandardErrorCode.INVALID_ARGUMENT]: "Invalid argument provided.",
  [StandardErrorCode.INVALID_FORMAT]: "Invalid format provided.",
  [StandardErrorCode.MISSING_PARAMETERS]: "Required parameters are missing.",
  [StandardErrorCode.INVALID_REQUEST]: "Invalid request provided.",
  [StandardErrorCode.NOT_FOUND]: "The requested resource was not found.",
  [StandardErrorCode.RESOURCE_EXHAUSTED]: "Resource limit exceeded.",
  [StandardErrorCode.FAILED_PRECONDITION]: "Operation failed due to precondition check.",
  [StandardErrorCode.RATE_LIMITED]: "Too many requests. Please try again later.",
  [StandardErrorCode.SERVICE_UNAVAILABLE]: "Service is temporarily unavailable. Please try again later.",
  [StandardErrorCode.FILE_TOO_LARGE]: "File size exceeds the maximum allowed limit.",
  [StandardErrorCode.INVALID_FILE_TYPE]: "File type is not supported.",
  [StandardErrorCode.SECURITY_VIOLATION]: "Security violation detected. Please contact support.",
  [StandardErrorCode.ACCOUNT_LOCKED]: "Account is temporarily locked. Please try again later.",
  [StandardErrorCode.ABORTED]: "The operation was aborted.",
  [StandardErrorCode.INTERNAL]: "An internal error occurred. Please try again later.",
  [StandardErrorCode.UNKNOWN]: "An unknown error occurred. Please try again.",
  [StandardErrorCode.UNIMPLEMENTED]: "This feature is not yet implemented.",
  [StandardErrorCode.INVALID_STATE]: "The operation cannot be performed in the current state.",
};

// Error severity mapping
const ErrorSeverityMap = {
  // Authentication errors
  [StandardErrorCode.UNAUTHENTICATED]: ErrorSeverity.MEDIUM,
  [StandardErrorCode.INVALID_TOKEN]: ErrorSeverity.MEDIUM,
  [StandardErrorCode.EXPIRED_TOKEN]: ErrorSeverity.LOW,
  [StandardErrorCode.ALREADY_EXISTS]: ErrorSeverity.LOW,
  [StandardErrorCode.INVALID_CREDENTIALS]: ErrorSeverity.MEDIUM,
  [StandardErrorCode.TOKEN_EXPIRED]: ErrorSeverity.LOW,
  [StandardErrorCode.EMAIL_EXISTS]: ErrorSeverity.LOW,
  [StandardErrorCode.VERIFICATION_FAILED]: ErrorSeverity.MEDIUM,

  // Authorization errors
  [StandardErrorCode.PERMISSION_DENIED]: ErrorSeverity.MEDIUM,
  [StandardErrorCode.INSUFFICIENT_PERMISSIONS]: ErrorSeverity.MEDIUM,

  // Input validation errors
  [StandardErrorCode.INVALID_ARGUMENT]: ErrorSeverity.LOW,
  [StandardErrorCode.INVALID_FORMAT]: ErrorSeverity.LOW,
  [StandardErrorCode.MISSING_PARAMETERS]: ErrorSeverity.LOW,
  [StandardErrorCode.INVALID_REQUEST]: ErrorSeverity.LOW,

  // Resource errors
  [StandardErrorCode.NOT_FOUND]: ErrorSeverity.LOW,
  [StandardErrorCode.RESOURCE_EXHAUSTED]: ErrorSeverity.HIGH,
  [StandardErrorCode.FAILED_PRECONDITION]: ErrorSeverity.MEDIUM,

  // Rate limiting
  [StandardErrorCode.RATE_LIMITED]: ErrorSeverity.HIGH,

  // Service errors
  [StandardErrorCode.SERVICE_UNAVAILABLE]: ErrorSeverity.HIGH,

  // File/Security errors
  [StandardErrorCode.FILE_TOO_LARGE]: ErrorSeverity.LOW,
  [StandardErrorCode.INVALID_FILE_TYPE]: ErrorSeverity.LOW,
  [StandardErrorCode.SECURITY_VIOLATION]: ErrorSeverity.CRITICAL,
  [StandardErrorCode.ACCOUNT_LOCKED]: ErrorSeverity.HIGH,

  // General errors
  [StandardErrorCode.ABORTED]: ErrorSeverity.MEDIUM,
  [StandardErrorCode.INTERNAL]: ErrorSeverity.CRITICAL,
  [StandardErrorCode.UNKNOWN]: ErrorSeverity.MEDIUM,
  [StandardErrorCode.UNIMPLEMENTED]: ErrorSeverity.LOW,
  [StandardErrorCode.INVALID_STATE]: ErrorSeverity.MEDIUM,
  // Default to MEDIUM for unmapped errors
};

/**
 * Standardized error interface for cross-platform consistency
 */
export interface StandardError {
  code: StandardErrorCode;
  message: string;
  details?: any;
  originalError?: Error;
  context?: {
    action?: string;
    component?: string;
    userId?: string;
    [key: string]: any;
  };
}

/**
 * Standardized Error Handler Class
 * Provides consistent error handling across Firebase Functions and Web Client
 */
export class StandardizedErrorHandler {
  private static instance: StandardizedErrorHandler;

  private constructor() {}

  static getInstance(): StandardizedErrorHandler {
    if (!StandardizedErrorHandler.instance) {
      StandardizedErrorHandler.instance = new StandardizedErrorHandler();
    }
    return StandardizedErrorHandler.instance;
  }

  /**
   * Parse Firebase Functions error to StandardError
   */
  parseFirebaseFunctionError(error: any): StandardError {
    // Check if it's already a Firebase Functions error
    if (error?.code && error?.message) {
      const standardCode = this.mapFirebaseCodeToStandard(error.code);
      return {
        code: standardCode,
        message: StandardErrorMessages[standardCode] || error.message,
        details: error.details,
        originalError: error,
      };
    }

    // Check if it's a generic error
    if (error instanceof Error) {
      return {
        code: StandardErrorCode.UNKNOWN,
        message: error.message,
        originalError: error,
      };
    }

    // Fallback for unknown error types
    return {
      code: StandardErrorCode.UNKNOWN,
      message: String(error),
    };
  }

  /**
   * Parse Firebase Auth error to StandardError
   */
  parseFirebaseAuthError(error: any): StandardError {
    const authErrorMap: Record<string, StandardErrorCode> = {
      'auth/invalid-credential': StandardErrorCode.INVALID_CREDENTIALS,
      'auth/user-not-found': StandardErrorCode.INVALID_CREDENTIALS,
      'auth/wrong-password': StandardErrorCode.INVALID_CREDENTIALS,
      'auth/too-many-requests': StandardErrorCode.RATE_LIMITED,
      'auth/user-disabled': StandardErrorCode.PERMISSION_DENIED,
      'auth/invalid-email': StandardErrorCode.INVALID_ARGUMENT,
      'auth/email-already-in-use': StandardErrorCode.EMAIL_EXISTS,
      'auth/weak-password': StandardErrorCode.INVALID_ARGUMENT,
      'auth/network-request-failed': StandardErrorCode.SERVICE_UNAVAILABLE,
    };

    const standardCode = authErrorMap[error?.code] || StandardErrorCode.UNKNOWN;
    
    return {
      code: standardCode,
      message: StandardErrorMessages[standardCode] || error?.message || 'Authentication error',
      details: { firebaseCode: error?.code },
      originalError: error,
    };
  }

  /**
   * Handle error with standardized response
   */
  handleError(
    error: any, 
    context?: {
      action?: string;
      component?: string;
      showToast?: boolean;
      toastTitle?: string;
    }
  ): StandardError {
    let standardError: StandardError;

    // Parse the error based on its type
    if (this.isFirebaseFunctionError(error)) {
      standardError = this.parseFirebaseFunctionError(error);
    } else if (this.isFirebaseAuthError(error)) {
      standardError = this.parseFirebaseAuthError(error);
    } else if (error?.name === 'AccountLocked') {
      standardError = {
        code: StandardErrorCode.ACCOUNT_LOCKED,
        message: error.message || StandardErrorMessages[StandardErrorCode.ACCOUNT_LOCKED],
        originalError: error,
      };
    } else {
      standardError = {
        code: StandardErrorCode.UNKNOWN,
        message: error?.message || String(error),
        originalError: error instanceof Error ? error : new Error(String(error)),
      };
    }

    // Add context
    if (context) {
      standardError.context = {
        ...standardError.context,
        ...context,
      };
    }

    // Log to error handling service
    const severity = ErrorSeverityMap[standardError.code] || ErrorSeverity.MEDIUM;
    const metadata: ErrorMetadata = {
      action: context?.action,
      context: standardError.context,
    };

    errorHandler.handleError(
      standardError.originalError || new Error(standardError.message),
      severity,
      metadata
    );

    // Show toast notification if requested
    if (context?.showToast !== false) {
      this.showErrorToast(standardError, context?.toastTitle);
    }

    return standardError;
  }

  /**
   * Show error toast with consistent styling
   */
  private showErrorToast(error: StandardError, customTitle?: string) {
    const title = customTitle || this.getErrorTitle(error.code);
    
    toast({
      title,
      description: error.message,
      variant: "destructive",
    });
  }

  /**
   * Get appropriate error title based on error code
   */
  private getErrorTitle(code: StandardErrorCode): string {
    switch (code) {
      case StandardErrorCode.UNAUTHENTICATED:
      case StandardErrorCode.INVALID_TOKEN:
      case StandardErrorCode.EXPIRED_TOKEN:
        return "Authentication Required";
      case StandardErrorCode.PERMISSION_DENIED:
      case StandardErrorCode.INSUFFICIENT_PERMISSIONS:
        return "Permission Denied";
      case StandardErrorCode.RATE_LIMITED:
        return "Too Many Requests";
      case StandardErrorCode.SERVICE_UNAVAILABLE:
        return "Service Unavailable";
      case StandardErrorCode.ACCOUNT_LOCKED:
        return "Account Locked";
      case StandardErrorCode.SECURITY_VIOLATION:
        return "Security Alert";
      case StandardErrorCode.INVALID_ARGUMENT:
      case StandardErrorCode.INVALID_FORMAT:
        return "Invalid Input";
      default:
        return "Error";
    }
  }

  /**
   * Map Firebase error codes to standard codes
   */
  private mapFirebaseCodeToStandard(firebaseCode: string): StandardErrorCode {
    const codeMap: Record<string, StandardErrorCode> = {
      'unauthenticated': StandardErrorCode.UNAUTHENTICATED,
      'permission-denied': StandardErrorCode.PERMISSION_DENIED,
      'not-found': StandardErrorCode.NOT_FOUND,
      'already-exists': StandardErrorCode.ALREADY_EXISTS,
      'invalid-argument': StandardErrorCode.INVALID_ARGUMENT,
      'resource-exhausted': StandardErrorCode.RESOURCE_EXHAUSTED,
      'failed-precondition': StandardErrorCode.FAILED_PRECONDITION,
      'aborted': StandardErrorCode.ABORTED,
      'internal': StandardErrorCode.INTERNAL,
      'unavailable': StandardErrorCode.SERVICE_UNAVAILABLE,
      'unknown': StandardErrorCode.UNKNOWN,
    };

    return codeMap[firebaseCode] || StandardErrorCode.UNKNOWN;
  }

  /**
   * Check if error is from Firebase Functions
   */
  private isFirebaseFunctionError(error: any): boolean {
    return error?.code && typeof error.code === 'string' && !error.code.startsWith('auth/');
  }

  /**
   * Check if error is from Firebase Auth
   */
  private isFirebaseAuthError(error: any): boolean {
    return error?.code && typeof error.code === 'string' && error.code.startsWith('auth/');
  }

  /**
   * Create a standardized error response
   */
  createError(
    code: StandardErrorCode,
    customMessage?: string,
    details?: any
  ): StandardError {
    return {
      code,
      message: customMessage || StandardErrorMessages[code],
      details,
    };
  }

  /**
   * Check if error should trigger a retry
   */
  shouldRetry(error: StandardError): boolean {
    const retryableCodes = [
      StandardErrorCode.SERVICE_UNAVAILABLE,
      StandardErrorCode.INTERNAL,
      StandardErrorCode.ABORTED,
    ];

    return retryableCodes.includes(error.code);
  }

  /**
   * Check if error requires user action
   */
  requiresUserAction(error: StandardError): boolean {
    const userActionCodes = [
      StandardErrorCode.UNAUTHENTICATED,
      StandardErrorCode.PERMISSION_DENIED,
      StandardErrorCode.INVALID_CREDENTIALS,
      StandardErrorCode.ACCOUNT_LOCKED,
    ];

    return userActionCodes.includes(error.code);
  }
}

// Export singleton instance
export const standardErrorHandler = StandardizedErrorHandler.getInstance();

// React hook for standardized error handling
export function useStandardErrorHandler() {
  const handleError = (
    error: any,
    context?: {
      action?: string;
      component?: string;
      showToast?: boolean;
      toastTitle?: string;
    }
  ): StandardError => {
    return standardErrorHandler.handleError(error, context);
  };

  const createError = (
    code: StandardErrorCode,
    customMessage?: string,
    details?: any
  ): StandardError => {
    return standardErrorHandler.createError(code, customMessage, details);
  };

  return {
    handleError,
    createError,
    shouldRetry: (error: StandardError) => standardErrorHandler.shouldRetry(error),
    requiresUserAction: (error: StandardError) => standardErrorHandler.requiresUserAction(error),
  };
}