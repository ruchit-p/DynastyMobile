import { Alert } from 'react-native';
import { FirebaseFunctionsTypes } from '@react-native-firebase/functions';
import { logger } from '../services/LoggingService';

/**
 * Standard error codes that match the server-side codes
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
 * Standard error messages that match server-side messages
 */
export const ErrorMessages: Record<string, string> = {
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
  [ErrorCode.INVALID_ARGUMENT]: "Invalid information provided.",
  [ErrorCode.INVALID_FORMAT]: "Invalid format provided.",
  [ErrorCode.MISSING_PARAMETERS]: "Required information is missing.",
  
  // Resource errors
  [ErrorCode.NOT_FOUND]: "The requested resource was not found.",
  [ErrorCode.RESOURCE_EXHAUSTED]: "Resource limit exceeded.",
  
  // Rate limiting
  [ErrorCode.RATE_LIMITED]: "Too many requests. Please try again later.",
  
  // Service errors
  [ErrorCode.SERVICE_UNAVAILABLE]: "Service is temporarily unavailable. Please try again later.",
  
  // General errors
  [ErrorCode.ABORTED]: "The operation was canceled.",
  [ErrorCode.INTERNAL]: "An unexpected error occurred. Please try again later.",
  [ErrorCode.UNKNOWN]: "An unknown error occurred. Please try again."
};

/**
 * Firebase Auth error code mapping to our standard error codes
 */
const firebaseAuthErrorMapping: Record<string, ErrorCode> = {
  'auth/invalid-email': ErrorCode.INVALID_FORMAT,
  'auth/user-disabled': ErrorCode.PERMISSION_DENIED,
  'auth/user-not-found': ErrorCode.INVALID_CREDENTIALS,
  'auth/wrong-password': ErrorCode.INVALID_CREDENTIALS,
  'auth/email-already-in-use': ErrorCode.EMAIL_EXISTS,
  'auth/weak-password': ErrorCode.INVALID_FORMAT,
  'auth/invalid-credential': ErrorCode.INVALID_CREDENTIALS,
  'auth/operation-not-allowed': ErrorCode.PERMISSION_DENIED,
  'auth/account-exists-with-different-credential': ErrorCode.ALREADY_EXISTS,
  'auth/invalid-verification-code': ErrorCode.INVALID_TOKEN,
  'auth/invalid-verification-id': ErrorCode.INVALID_TOKEN,
  'auth/invalid-phone-number': ErrorCode.INVALID_FORMAT,
  'auth/missing-phone-number': ErrorCode.MISSING_PARAMETERS,
  'auth/quota-exceeded': ErrorCode.RESOURCE_EXHAUSTED,
  'auth/captcha-check-failed': ErrorCode.INVALID_TOKEN,
  'auth/too-many-requests': ErrorCode.RATE_LIMITED,
  'auth/user-token-expired': ErrorCode.TOKEN_EXPIRED,
  'auth/web-storage-unsupported': ErrorCode.SERVICE_UNAVAILABLE,
  'auth/network-request-failed': ErrorCode.SERVICE_UNAVAILABLE
};

/**
 * Structured error interface for app-wide use
 */
export interface AppError {
  code: ErrorCode;
  message: string;
  details?: any;
  originalError?: any;
}

/**
 * Convert any error to a standardized AppError
 */
export function normalizeError(error: any): AppError {
  logger.error('Error occurred:', error);
  
  // Already an AppError
  if (error && error.code && Object.values(ErrorCode).includes(error.code)) {
    return error as AppError;
  }
  
  // Firebase Auth Error
  if (error && error.code && error.code.startsWith('auth/')) {
    const code = firebaseAuthErrorMapping[error.code] || ErrorCode.UNKNOWN;
    return {
      code,
      message: error.message || ErrorMessages[code],
      originalError: error
    };
  }
  
  // Firebase Functions Error
  if (error && error.code && typeof error.code === 'string') {
    const code = error.code as ErrorCode;
    return {
      code,
      message: error.message || ErrorMessages[code] || ErrorMessages[ErrorCode.UNKNOWN],
      details: error.details,
      originalError: error
    };
  }
  
  // Generic Error
  if (error instanceof Error) {
    return {
      code: ErrorCode.UNKNOWN,
      message: error.message || ErrorMessages[ErrorCode.UNKNOWN],
      originalError: error
    };
  }
  
  // Fallback
  return {
    code: ErrorCode.UNKNOWN,
    message: ErrorMessages[ErrorCode.UNKNOWN],
    originalError: error
  };
}

/**
 * Show standardized error alert
 */
export function showErrorAlert(
  error: any,
  title = 'Error',
  onOk?: () => void
) {
  const appError = normalizeError(error);
  
  Alert.alert(
    title,
    appError.message,
    [{ text: 'OK', onPress: onOk }],
    { cancelable: false }
  );
  
  // Log the error for analytics/debugging
  logger.error(`Error (${appError.code}): ${appError.message}`, appError);
}

/**
 * Parse firebase function errors
 */
export function parseFirebaseFunctionError(error: unknown): AppError {
  // React Native Firebase uses a different error structure
  if (error && typeof error === 'object' && 'code' in error) {
    const fbError = error as any;
    const errorDetails = fbError.message || 'Unknown error occurred';
    
    return {
      code: fbError.code as ErrorCode,
      message: ErrorMessages[fbError.code as ErrorCode] || errorDetails,
      details: fbError.details,
      originalError: error
    };
  }
  
  return normalizeError(error);
}

/**
 * Safely call a Firebase Cloud Function with proper error handling
 * 
 * @param functionName The name of the Firebase function to call
 * @param data The data to pass to the function
 * @param functions The Firebase Functions instance
 * @returns The result from the function
 * @throws AppError if the function call fails
 */
export async function callFirebaseFunction<T = any, R = any>(
  functionName: string,
  data?: T,
  functions?: FirebaseFunctionsTypes.Module
): Promise<R> {
  try {
    if (!functions) {
      // Lazy import to avoid circular dependency
      const { getFirebaseFunctions } = await import('./firebase');
      functions = getFirebaseFunctions();
    }
    const functionCall = functions.httpsCallable(functionName);
    const result = await functionCall(data);
    return result.data;
  } catch (error) {
    throw parseFirebaseFunctionError(error);
  }
}

/**
 * Get user-friendly error message from error object
 */
export function getErrorMessage(error: any): string {
  if (!error) return ErrorMessages[ErrorCode.UNKNOWN];
  
  const appError = normalizeError(error);
  return appError.message;
}

/**
 * Typed wrapper for Firebase functions to provide better developer experience
 * 
 * @example
 * // Define the function signature
 * type GetUserProfile = (data: { userId: string }) => Promise<{ user: UserProfile }>;
 * 
 * // Create the typed function
 * const getUserProfile = createFunctionCaller<GetUserProfile>('getUserProfile');
 * 
 * // Use with full type checking
 * const { user } = await getUserProfile({ userId: '123' });
 */
export function createFunctionCaller<T extends (data?: any) => Promise<any>>(
  functionName: string
): T {
  return ((data?: any) => callFirebaseFunction(functionName, data, undefined)) as T;
}