import { VaultError, VaultErrorCode, VaultErrorSeverity } from '../types/Vault';

/**
 * Mapping from HTTP status codes to vault error codes
 */
const statusCodeToErrorCode: Record<number, VaultErrorCode> = {
  400: VaultErrorCode.INVALID_ARGUMENT,
  401: VaultErrorCode.UNAUTHENTICATED,
  403: VaultErrorCode.PERMISSION_DENIED,
  404: VaultErrorCode.NOT_FOUND,
  413: VaultErrorCode.FILE_TOO_LARGE,
  415: VaultErrorCode.INVALID_FILE_TYPE,
  429: VaultErrorCode.RATE_LIMITED,
  500: VaultErrorCode.UNKNOWN_ERROR,
  503: VaultErrorCode.RESOURCE_EXHAUSTED,
};

/**
 * Mapping from vault error codes to severity levels
 */
const errorCodeToSeverity: Record<VaultErrorCode, VaultErrorSeverity> = {
  [VaultErrorCode.UNAUTHENTICATED]: VaultErrorSeverity.HIGH,
  [VaultErrorCode.PERMISSION_DENIED]: VaultErrorSeverity.HIGH,
  [VaultErrorCode.INVALID_ARGUMENT]: VaultErrorSeverity.MEDIUM,
  [VaultErrorCode.NOT_FOUND]: VaultErrorSeverity.MEDIUM,
  [VaultErrorCode.RATE_LIMITED]: VaultErrorSeverity.LOW,
  [VaultErrorCode.RESOURCE_EXHAUSTED]: VaultErrorSeverity.HIGH,
  [VaultErrorCode.FILE_TOO_LARGE]: VaultErrorSeverity.MEDIUM,
  [VaultErrorCode.INVALID_FILE_TYPE]: VaultErrorSeverity.MEDIUM,
  [VaultErrorCode.ENCRYPTION_ERROR]: VaultErrorSeverity.CRITICAL,
  [VaultErrorCode.QUARANTINE_ERROR]: VaultErrorSeverity.HIGH,
  [VaultErrorCode.UNKNOWN_ERROR]: VaultErrorSeverity.HIGH,
};

/**
 * Standard error messages for vault operations
 */
const errorMessages: Record<VaultErrorCode, string> = {
  [VaultErrorCode.UNAUTHENTICATED]: 'Authentication required. Please sign in and try again.',
  [VaultErrorCode.PERMISSION_DENIED]: 'You don\'t have permission to access this item.',
  [VaultErrorCode.INVALID_ARGUMENT]: 'Invalid input provided. Please check your data and try again.',
  [VaultErrorCode.NOT_FOUND]: 'The requested item could not be found.',
  [VaultErrorCode.RATE_LIMITED]: 'Too many requests. Please wait a moment and try again.',
  [VaultErrorCode.RESOURCE_EXHAUSTED]: 'Service temporarily unavailable. Please try again later.',
  [VaultErrorCode.FILE_TOO_LARGE]: 'File is too large. Maximum file size exceeded.',
  [VaultErrorCode.INVALID_FILE_TYPE]: 'File type not supported or blocked for security reasons.',
  [VaultErrorCode.ENCRYPTION_ERROR]: 'Encryption operation failed. Please try again.',
  [VaultErrorCode.QUARANTINE_ERROR]: 'File has been quarantined due to security concerns.',
  [VaultErrorCode.UNKNOWN_ERROR]: 'An unexpected error occurred. Please try again.',
};

/**
 * Creates a standardized VaultError from various error sources
 */
export function createVaultError(
  code: VaultErrorCode,
  message?: string,
  statusCode?: number,
  context?: Record<string, unknown>
): VaultError {
  const error = new Error(message || errorMessages[code]) as VaultError;
  error.name = 'VaultError';
  error.code = code;
  error.severity = errorCodeToSeverity[code] || VaultErrorSeverity.MEDIUM;
  error.statusCode = statusCode;
  error.context = context;
  return error;
}

/**
 * Normalizes errors from various sources (Firebase Functions, Axios, etc.) into VaultError
 */
export function normalizeVaultError(error: unknown): VaultError {
  // Already a VaultError
  if (error instanceof Error && 'code' in error && 'severity' in error) {
    return error as VaultError;
  }

  // Firebase Functions error
  if (error && typeof error === 'object' && 'code' in error) {
    const firebaseError = error as any;
    let code = VaultErrorCode.UNKNOWN_ERROR;
    
    // Map Firebase error codes to vault error codes
    switch (firebaseError.code) {
      case 'unauthenticated':
        code = VaultErrorCode.UNAUTHENTICATED;
        break;
      case 'permission-denied':
        code = VaultErrorCode.PERMISSION_DENIED;
        break;
      case 'invalid-argument':
        code = VaultErrorCode.INVALID_ARGUMENT;
        break;
      case 'not-found':
        code = VaultErrorCode.NOT_FOUND;
        break;
      case 'resource-exhausted':
        code = VaultErrorCode.RESOURCE_EXHAUSTED;
        break;
      case 'failed-precondition':
        code = VaultErrorCode.INVALID_ARGUMENT;
        break;
      default:
        // Check for specific vault error codes in message
        if (firebaseError.message?.includes('file-too-large')) {
          code = VaultErrorCode.FILE_TOO_LARGE;
        } else if (firebaseError.message?.includes('invalid-file-type')) {
          code = VaultErrorCode.INVALID_FILE_TYPE;
        } else if (firebaseError.message?.includes('quarantine')) {
          code = VaultErrorCode.QUARANTINE_ERROR;
        } else if (firebaseError.message?.includes('encryption')) {
          code = VaultErrorCode.ENCRYPTION_ERROR;
        }
        break;
    }

    return createVaultError(
      code,
      firebaseError.message,
      undefined,
      { originalCode: firebaseError.code, details: firebaseError.details }
    );
  }

  // Axios/HTTP error
  if (error && typeof error === 'object' && 'response' in error) {
    const axiosError = error as any;
    const statusCode = axiosError.response?.status;
    const code = statusCodeToErrorCode[statusCode] || VaultErrorCode.UNKNOWN_ERROR;
    
    return createVaultError(
      code,
      axiosError.message || axiosError.response?.data?.message,
      statusCode,
      { 
        url: axiosError.config?.url,
        method: axiosError.config?.method,
        data: axiosError.response?.data
      }
    );
  }

  // Generic Error
  if (error instanceof Error) {
    return createVaultError(
      VaultErrorCode.UNKNOWN_ERROR,
      error.message,
      undefined,
      { stack: error.stack }
    );
  }

  // Unknown error type
  return createVaultError(
    VaultErrorCode.UNKNOWN_ERROR,
    'An unknown error occurred',
    undefined,
    { originalError: error }
  );
}

/**
 * Type guard to check if an error is a VaultError
 */
export function isVaultError(error: unknown): error is VaultError {
  return error instanceof Error && 'code' in error && 'severity' in error;
}

/**
 * Wrapper function to add standardized error handling to async functions
 */
export function withVaultErrorHandling<T extends (...args: any[]) => Promise<any>>(
  fn: T,
  operation: string
): (...args: Parameters<T>) => Promise<Awaited<ReturnType<T>>> {
  return async (...args: Parameters<T>) => {
    try {
      return await fn(...args);
    } catch (error) {
      const vaultError = normalizeVaultError(error);
      
      // Add operation context
      vaultError.context = {
        ...vaultError.context,
        operation,
        timestamp: new Date().toISOString(),
      };

      throw vaultError;
    }
  };
}

/**
 * Retries an operation with exponential backoff
 */
export async function withRetry<T>(
  operation: () => Promise<T>,
  maxRetries: number = 3,
  baseDelay: number = 1000,
  backoffFactor: number = 2
): Promise<T> {
  let lastError: VaultError;
  
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = normalizeVaultError(error);
      
      // Don't retry certain error types
      if (
        lastError.code === VaultErrorCode.PERMISSION_DENIED ||
        lastError.code === VaultErrorCode.UNAUTHENTICATED ||
        lastError.code === VaultErrorCode.INVALID_ARGUMENT ||
        lastError.code === VaultErrorCode.NOT_FOUND
      ) {
        throw lastError;
      }
      
      // Don't retry on final attempt
      if (attempt === maxRetries) {
        throw lastError;
      }
      
      // Wait before next attempt
      const delay = baseDelay * Math.pow(backoffFactor, attempt);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  
  throw lastError!;
}