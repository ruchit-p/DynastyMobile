import {CallableRequest} from "firebase-functions/v2/https";
import {logger} from "firebase-functions/v2";

/**
 * List of function names that are exempt from CSRF protection
 * These are typically authentication endpoints that need to work
 * without an existing session
 */
const CSRF_EXEMPT_FUNCTIONS = new Set([
  // Authentication functions
  "handleSignUp",
  "handleSignIn", 
  "handleGoogleSignIn",
  "handleAppleSignIn",
  "handlePhoneSignIn",
  "confirmPhoneSignIn",
  "resetPassword",
  "confirmPasswordReset",
  "sendVerificationEmail",
  "verifyEmail",
  "verifyEmailToken",
  
  // Initial token generation (public endpoint)
  "generateInitialCSRFToken",
  
  // Public invitation verification
  "verifyInvitation",
  "signUpWithInvitation",
  
  // Device verification (called during auth flow)
  "verifyDeviceFingerprint",
  "initiatePasswordReset",
]);

/**
 * Check if a function is exempt from CSRF protection
 * @param functionName The name of the function being called
 * @returns Boolean indicating if the function is exempt
 */
export function isCSRFExempt(functionName: string): boolean {
  return CSRF_EXEMPT_FUNCTIONS.has(functionName);
}

/**
 * Middleware that applies CSRF protection only to non-exempt functions
 * @param handler The function handler to wrap
 * @param functionName The name of the function
 * @returns Wrapped function with conditional CSRF validation
 */
export function withConditionalCSRF<T = any, R = any>(
  handler: (request: CallableRequest<T>) => Promise<R>,
  functionName: string
) {
  return async (request: CallableRequest<T>): Promise<R> => {
    // Check if function is exempt
    if (isCSRFExempt(functionName)) {
      logger.debug(`Skipping CSRF check for exempt function: ${functionName}`);
      return handler(request);
    }
    
    // For non-exempt functions, apply CSRF protection
    const {requireCSRFToken} = await import("./csrf");
    return requireCSRFToken(handler)(request);
  };
}