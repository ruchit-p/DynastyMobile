import { functions } from '@/lib/firebase';
import { FirebaseFunctionsClient, createFirebaseClient } from '@/lib/functions-client';
import { standardErrorHandler, StandardErrorCode } from './standardizedErrorHandler';

// Firebase Functions client
let functionsClient: FirebaseFunctionsClient | null = null;

// Initialize the functions client
if (functions) {
  functionsClient = createFirebaseClient(functions);
}

function getFunctionsClient(): FirebaseFunctionsClient {
  if (!functionsClient) {
    throw new Error('Firebase Functions not initialized');
  }
  return functionsClient;
}

/**
 * SECURITY: Check if an account is locked before attempting authentication
 * Integrates with the Firebase account lockout system
 */
export async function checkAccountLockout(email: string): Promise<{
  isLocked: boolean;
  message?: string;
  minutesRemaining?: number;
  unlockAt?: string;
}> {
  try {
    console.log("🔒 SECURITY: Checking account lockout for", email);
    
    const result = await getFunctionsClient().callFunction('checkAccountLockout', {
      email: email.toLowerCase()
    });

    const data = result.data as {
      isLocked: boolean;
      message: string;
      minutesRemaining?: number;
      unlockAt?: string;
    };

    if (data.isLocked) {
      console.warn("🚨 SECURITY: Account is locked", {
        email,
        minutesRemaining: data.minutesRemaining,
        unlockAt: data.unlockAt
      });
    } else {
      console.log("✅ SECURITY: Account is not locked");
    }

    return data;
  } catch (error) {
    // Use standardized error handling
    const standardError = standardErrorHandler.handleError(error, {
      action: 'checkAccountLockout',
      component: 'authUtils',
      showToast: false, // Don't show toast for lockout check failures
    });
    
    console.error("❌ SECURITY: Error checking account lockout:", standardError);
    
    // Fail open - allow sign-in attempt if lockout check fails
    // This prevents the lockout system from blocking legitimate users during outages
    return {
      isLocked: false,
      message: "Unable to verify account lockout status"
    };
  }
}

/**
 * SECURITY: Record a failed authentication attempt
 * Integrates with the Firebase account lockout system
 */
export async function recordAuthenticationFailure(
  email: string, 
  errorCode: string
): Promise<{
  success: boolean;
  failedAttempts?: number;
  remainingAttempts?: number;
  message?: string;
}> {
  try {
    console.log("📝 SECURITY: Recording authentication failure", { email, errorCode });
    
    const result = await getFunctionsClient().callFunction('handleAuthenticationFailure', {
      email: email.toLowerCase(),
      errorCode
    });

    const data = result.data as {
      success: boolean;
      failedAttempts?: number;
      remainingAttempts?: number;
      message?: string;
    };

    if (data.success && data.failedAttempts !== undefined) {
      console.warn("⚠️ SECURITY: Failed authentication attempt recorded", {
        email,
        failedAttempts: data.failedAttempts,
        remainingAttempts: data.remainingAttempts
      });
    }

    return data;
  } catch (error) {
    // Use standardized error handling
    const standardError = standardErrorHandler.handleError(error, {
      action: 'recordAuthenticationFailure',
      component: 'authUtils',
      showToast: false, // Don't show toast for recording failures
    });
    
    console.error("❌ SECURITY: Error recording authentication failure:", standardError);
    
    // Don't throw error here - we don't want to block the user from seeing auth failure
    return {
      success: false,
      message: "Unable to record authentication failure"
    };
  }
}

/**
 * Extracts Firebase Auth error code from error message
 */
export function extractFirebaseErrorCode(error: Error): string {
  const errorMessage = error.message.toLowerCase();
  
  if (errorMessage.includes('auth/')) {
    const match = errorMessage.match(/auth\/([a-z-]+)/);
    return match ? `auth/${match[1]}` : 'auth/unknown-error';
  }
  
  return 'unknown-error';
}

/**
 * Maps Firebase Auth error codes to user-friendly messages
 * Enhanced with account lockout awareness
 */
export function getAuthErrorMessage(errorCode: string, lockoutInfo?: {
  isLocked: boolean;
  minutesRemaining?: number;
}): { title: string; description: string } {
  // Handle account lockout first
  if (lockoutInfo?.isLocked) {
    return {
      title: "Account Locked",
      description: `Account locked due to too many failed login attempts. Please try again in ${lockoutInfo.minutesRemaining || 30} minutes.`
    };
  }

  switch (errorCode) {
    case 'auth/invalid-credential':
      return {
        title: "Invalid Credentials",
        description: "The email or password you entered is incorrect. Please try again."
      };
    case 'auth/user-not-found':
      return {
        title: "User not found", 
        description: "No account exists with this email address. Please check your email or create a new account."
      };
    case 'auth/wrong-password':
      return {
        title: "Invalid Credentials",
        description: "The email or password you entered is incorrect. Please try again."
      };
    case 'auth/too-many-requests':
      return {
        title: "Too many attempts",
        description: "Access to this account has been temporarily disabled due to many failed login attempts. Please try again later."
      };
    case 'auth/user-disabled':
      return {
        title: "Account disabled",
        description: "This account has been disabled. Please contact support for help."
      };
    case 'auth/invalid-email':
      return {
        title: "Invalid email",
        description: "Please enter a valid email address."
      };
    case 'auth/network-request-failed':
      return {
        title: "Network error",
        description: "Unable to connect to authentication service. Please check your internet connection and try again."
      };
    default:
      return {
        title: "Login failed",
        description: "Unable to sign in. Please check your credentials and try again."
      };
  }
}