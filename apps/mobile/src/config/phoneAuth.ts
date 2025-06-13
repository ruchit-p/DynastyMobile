/**
 * Phone Authentication Configuration
 * 
 * This file contains configuration for Firebase Phone Authentication
 * including test phone numbers for development and debugging settings.
 */

// Development/Test phone numbers
// These should match the test numbers configured in Firebase Console
// Format: phone number -> verification code
export const TEST_PHONE_NUMBERS = {} as const;

// Phone auth configuration
export const PHONE_AUTH_CONFIG = {
  // Enable additional logging in development
  enableDebugLogging: __DEV__,
  
  // Timeout for auto-verification (Android only)
  // Set to 60 seconds by default
  autoVerificationTimeout: 60,
  
  // Whether to force reCAPTCHA flow (for testing)
  // Note: This doesn't work with React Native Firebase
  forceRecaptchaFlow: false,
  
  // Test mode settings
  testMode: {
    enabled: __DEV__,
    // Auto-fill verification code for test numbers in dev
    autoFillTestCode: __DEV__,
  },
};

// Helper function to check if a phone number is a test number
export const isTestPhoneNumber = (phoneNumber: string): boolean => {
  // Normalize the phone number by removing spaces and dashes
  const normalized = phoneNumber.replace(/[\s-]/g, '');
  return Object.keys(TEST_PHONE_NUMBERS).some(testNumber => 
    testNumber.replace(/[\s-]/g, '') === normalized
  );
};

// Helper function to get test verification code
export const getTestVerificationCode = (phoneNumber: string): string | null => {
  // Normalize the phone number
  const normalized = phoneNumber.replace(/[\s-]/g, '');
  
  for (const [testNumber, code] of Object.entries(TEST_PHONE_NUMBERS)) {
    if (testNumber.replace(/[\s-]/g, '') === normalized) {
      return code;
    }
  }
  
  return null;
};

// Platform-specific configuration notes
export const PLATFORM_NOTES = {
  ios: {
    requiresAPNs: true,
    supportsInstantVerification: false,
    recaptchaRequired: false,
    notes: [
      'Requires APNs configuration in Firebase Console',
      'Silent push notifications handle verification',
      'No reCAPTCHA needed for production',
    ],
  },
  android: {
    requiresAPNs: false,
    supportsInstantVerification: true,
    recaptchaRequired: false,
    notes: [
      'Uses SafetyNet API for app verification',
      'Supports instant verification via Play Services',
      'Auto-retrieval of SMS codes possible',
      'No reCAPTCHA needed for production',
    ],
  },
  web: {
    requiresAPNs: false,
    supportsInstantVerification: false,
    recaptchaRequired: true,
    notes: [
      'Requires reCAPTCHA implementation',
      'Not supported with React Native Firebase',
      'Use Firebase JS SDK for web support',
    ],
  },
};

// Error messages for better user experience
export const PHONE_AUTH_ERROR_MESSAGES = {
  'auth/invalid-phone-number': 'Please enter a valid phone number with country code (e.g., +1 234-567-8900)',
  'auth/missing-phone-number': 'Please enter your phone number',
  'auth/quota-exceeded': 'We\'ve reached our SMS limit for today. Please try again tomorrow or use another sign-in method.',
  'auth/user-disabled': 'This account has been disabled. Please contact support for assistance.',
  'auth/operation-not-allowed': 'Phone sign-in is temporarily unavailable. Please try another sign-in method.',
  'auth/too-many-requests': 'Too many attempts. Please wait a few minutes before trying again.',
  'auth/app-not-authorized': 'This app is not authorized for phone authentication. Please contact support.',
  'auth/captcha-check-failed': 'Security check failed. Please try again.',
  'auth/invalid-app-credential': 'App verification failed. Please try reinstalling the app.',
  'auth/missing-app-credential': 'App verification is required. Please ensure you\'re using the official app.',
  'auth/invalid-verification-code': 'Invalid verification code. Please check and try again.',
  'auth/invalid-verification-id': 'Verification session expired. Please request a new code.',
  'auth/code-expired': 'The verification code has expired. Please request a new one.',
};