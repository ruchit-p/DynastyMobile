export const ERROR_MESSAGES = {
  INVALID_TOKEN: "Invalid verification link. Please request a new verification email.",
  EXPIRED_TOKEN: "Verification link has expired. Please request a new verification email.",
  RATE_LIMIT: "Too many attempts. Please try again later.",
  EMAIL_SEND_FAILED: "Unable to send verification email. Please try again later.",
  USER_NOT_FOUND: "Unable to process request. Please try again.",
  INVALID_REQUEST: "Invalid request. Please try again.",
  VERIFICATION_FAILED: "Email verification failed. Please try again.",
} as const;

export const TOKEN_EXPIRY = {
  EMAIL_VERIFICATION: 3600000, // 1 hour in milliseconds
  PASSWORD_RESET: 1800000, // 30 minutes in milliseconds
  INVITATION: 7 * 24 * 60 * 60 * 1000, // 7 days in milliseconds
};

export const CLEANUP_INTERVALS = {
  TOKEN_CLEANUP: "every 1 hours",
};

export const MAX_OPERATIONS_PER_BATCH = 490;
