// Environment configuration
// DO NOT COMMIT ACTUAL VALUES - Use environment variables

export const SENTRY_DSN = process.env.EXPO_PUBLIC_SENTRY_DSN || '';
export const SENTRY_AUTH_TOKEN = process.env.SENTRY_AUTH_TOKEN || '';
export const SENTRY_ORG = process.env.SENTRY_ORG || 'mydynastyapp';
export const SENTRY_PROJECT = process.env.SENTRY_PROJECT || 'dynasty';

// Feature flags
export const ENABLE_SENTRY = !__DEV__ || process.env.EXPO_PUBLIC_ENABLE_SENTRY_DEV === 'true';
export const ENABLE_CRASHLYTICS = !__DEV__ || process.env.EXPO_PUBLIC_ENABLE_CRASHLYTICS_DEV === 'true';
export const ENABLE_LOCAL_LOGS = true;

// API endpoints
export const API_BASE_URL = process.env.EXPO_PUBLIC_API_BASE_URL || '';

// Other configs
export const APP_ENV = process.env.EXPO_PUBLIC_APP_ENV || (__DEV__ ? 'development' : 'production');

// Google OAuth Configuration
export const GOOGLE_OAUTH_WEB_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_OAUTH_WEB_CLIENT_ID || '';