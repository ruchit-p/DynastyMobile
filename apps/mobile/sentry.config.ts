import { SENTRY_DSN } from './src/config/environment';

export const sentryConfig = {
  dsn: SENTRY_DSN,
  
  // Performance Monitoring
  tracesSampleRate: __DEV__ ? 1.0 : 0.2,
  
  // Session Replay
  sessionSampleRate: __DEV__ ? 1.0 : 0.1,
  errorSampleRate: 1.0,
  
  // Release tracking
  release: `dynasty-mobile@${require('./package.json').version}`,
  
  // Environment
  environment: __DEV__ ? 'development' : 'production',
  
  // Debugging
  debug: __DEV__,
  
  // Integrations config
  attachStacktrace: true,
  attachThreads: true,
  attachScreenshot: true,
  attachViewHierarchy: true,
  
  // Privacy
  sendDefaultPii: false,
  
  // Filtering
  ignoreErrors: [
    // React Native
    'Native module cannot be null',
    'Non-Error promise rejection captured',
    'Unhandled promise rejection',
    
    // Network
    'Network request failed',
    'NetworkError',
    'Failed to fetch',
    
    // User cancellations
    'User cancelled',
    'User denied',
    'Cancelled by user',
  ],
  
  beforeSend: (event: any, hint: any) => {
    // Filter out sensitive data
    if (event.request?.cookies) {
      delete event.request.cookies;
    }
    
    if (event.extra) {
      const sensitiveKeys = ['password', 'token', 'secret', 'key', 'pin'];
      Object.keys(event.extra).forEach(key => {
        if (sensitiveKeys.some(sensitive => key.toLowerCase().includes(sensitive))) {
          event.extra[key] = '[REDACTED]';
        }
      });
    }
    
    // Don't send events in development unless explicitly enabled
    if (__DEV__ && !global.FORCE_SENTRY_IN_DEV) {
      return null;
    }
    
    return event;
  },
  
  beforeSendTransaction: (transaction: any) => {
    // Filter out sensitive URLs
    if (transaction.transaction?.includes('/api/auth/')) {
      transaction.transaction = transaction.transaction.replace(/\/api\/auth\/.*/, '/api/auth/[REDACTED]');
    }
    
    return transaction;
  },
};