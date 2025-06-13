// Error Handling Service for Dynasty Web App
// Provides centralized error management with Sentry integration

export enum ErrorSeverity {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  CRITICAL = 'critical',
}

export interface ErrorMetadata {
  userId?: string;
  action?: string;
  context?: Record<string, unknown>;
  timestamp?: number;
  [key: string]: unknown; // Allow additional properties
}

class ErrorHandlingService {
  private static instance: ErrorHandlingService;
  private userId: string | null = null;
  private isProduction = process.env.NODE_ENV === 'production';
  private errorHandlers: Map<string, (error: unknown) => void> = new Map();
  private errorMetrics: { byType: Record<string, number>; byEndpoint: Record<string, number> } = {
    byType: {},
    byEndpoint: {},
  };

  private constructor() {
    this.initializeSentry();
  }

  static getInstance(): ErrorHandlingService {
    if (!ErrorHandlingService.instance) {
      ErrorHandlingService.instance = new ErrorHandlingService();
    }
    return ErrorHandlingService.instance;
  }

  private initializeSentry() {
    // Sentry is initialized in sentry.client.config.ts
    // This method can be used for additional setup
  }

  setUserId(userId: string | null) {
    this.userId = userId;
    if (typeof window !== 'undefined' && window.Sentry) {
      window.Sentry.setUser(userId ? { id: userId } : null);
    }
  }

  handleError(
    error: Error | unknown,
    severity: ErrorSeverity = ErrorSeverity.MEDIUM,
    metadata?: ErrorMetadata,
    skipConsoleLog?: boolean
  ) {
    const errorObj = error instanceof Error ? error : new Error(String(error));

    // Enhance metadata with default values
    const enhancedMetadata: ErrorMetadata = {
      ...metadata,
      userId: metadata?.userId || this.userId || undefined,
      timestamp: Date.now(),
    };

    // Log to console in development
    if (!this.isProduction && !skipConsoleLog) {
      console.error('Error:', errorObj.message, {
        severity,
        metadata: enhancedMetadata,
        stack: errorObj.stack,
      });
    }

    // Send to Sentry
    if (typeof window !== 'undefined' && window.Sentry) {
      window.Sentry.captureException(errorObj, {
        level: this.mapSeverityToSentryLevel(severity),
        extra: enhancedMetadata,
        tags: {
          severity,
          action: enhancedMetadata.action || 'unknown',
        },
      });
    }

    // Store in local error log for offline access
    this.storeErrorLocally(errorObj, severity, enhancedMetadata);
  }

  private mapSeverityToSentryLevel(
    severity: ErrorSeverity
  ): 'info' | 'warning' | 'error' | 'fatal' {
    switch (severity) {
      case ErrorSeverity.LOW:
        return 'info';
      case ErrorSeverity.MEDIUM:
        return 'warning';
      case ErrorSeverity.HIGH:
        return 'error';
      case ErrorSeverity.CRITICAL:
        return 'fatal';
      default:
        return 'warning';
    }
  }

  private async storeErrorLocally(error: Error, severity: ErrorSeverity, metadata: ErrorMetadata) {
    try {
      if (typeof window === 'undefined') return;

      const errorLog = {
        message: error.message,
        stack: error.stack,
        severity,
        metadata,
        timestamp: metadata.timestamp || Date.now(),
      };

      // Store in IndexedDB for persistence
      const db = await this.openErrorDatabase();
      const transaction = db.transaction(['errors'], 'readwrite');
      const store = transaction.objectStore('errors');

      await store.add(errorLog);

      // Keep only last 100 errors
      const countRequest = store.count();
      countRequest.onsuccess = async () => {
        const count = countRequest.result;
        if (count > 100) {
          const keysRequest = store.getAllKeys();
          keysRequest.onsuccess = () => {
            const keys = keysRequest.result;
            if (keys[0]) {
              store.delete(keys[0]);
            }
          };
        }
      };
    } catch (e) {
      console.error('Failed to store error locally:', e);
    }
  }

  private openErrorDatabase(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open('DynastyErrors', 1);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);

      request.onupgradeneeded = event => {
        const db = (event.target as IDBOpenDBRequest).result;
        if (!db.objectStoreNames.contains('errors')) {
          db.createObjectStore('errors', { autoIncrement: true });
        }
      };
    });
  }

  async getStoredErrors(): Promise<unknown[]> {
    try {
      if (typeof window === 'undefined') return [];

      const db = await this.openErrorDatabase();
      const transaction = db.transaction(['errors'], 'readonly');
      const store = transaction.objectStore('errors');

      return new Promise((resolve, reject) => {
        const request = store.getAll();
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
    } catch (e) {
      console.error('Failed to retrieve stored errors:', e);
      return [];
    }
  }

  async clearStoredErrors() {
    try {
      if (typeof window === 'undefined') return;

      const db = await this.openErrorDatabase();
      const transaction = db.transaction(['errors'], 'readwrite');
      const store = transaction.objectStore('errors');
      await store.clear();
    } catch (e) {
      console.error('Failed to clear stored errors:', e);
    }
  }

  // Utility method for Firebase errors
  handleFirebaseError(error: unknown, action: string) {
    let message = 'An error occurred';
    let severity = ErrorSeverity.MEDIUM;

    const firebaseError = error as { code?: string; message?: string };

    // Map common Firebase error codes
    switch (firebaseError.code) {
      case 'auth/user-not-found':
      case 'auth/wrong-password':
        message = 'Invalid credentials';
        severity = ErrorSeverity.LOW;
        break;
      case 'auth/too-many-requests':
        message = 'Too many attempts. Please try again later';
        severity = ErrorSeverity.HIGH;
        break;
      case 'permission-denied':
        message = 'You do not have permission to perform this action';
        severity = ErrorSeverity.MEDIUM;
        break;
      case 'unavailable':
        message = 'Service temporarily unavailable';
        severity = ErrorSeverity.HIGH;
        break;
      default:
        message = firebaseError.message || message;
    }

    // Special handling for offline errors
    if (firebaseError.message && firebaseError.message.includes('client is offline')) {
      message = 'You are currently offline. Some features may be limited.';
      severity = ErrorSeverity.LOW;

      // Don't log offline errors to console in development to reduce noise
      const enhancedError = new Error(message);
      enhancedError.name = 'FirebaseOfflineError';

      this.handleError(
        enhancedError,
        severity,
        {
          action,
          context: {
            code: firebaseError.code,
            originalMessage: firebaseError.message,
            isOfflineError: true,
          },
        },
        true
      ); // Skip console logging for offline errors

      return message;
    }

    const enhancedError = new Error(message);
    enhancedError.name = 'FirebaseError';

    this.handleError(enhancedError, severity, {
      action,
      context: {
        code: firebaseError.code,
        originalMessage: firebaseError.message,
      },
    });

    return message;
  }

  // Event handler registration
  onError(type: string, handler: (error: unknown) => void): void {
    this.errorHandlers.set(type, handler);
  }

  // Generic error handler
  async handle(error: unknown): Promise<void> {
    const errorType = this.categorizeError(error);
    const handler = this.errorHandlers.get(errorType);

    if (handler) {
      handler(error);
    }

    // Also call the main error handler
    this.handleError(error, ErrorSeverity.MEDIUM, { errorType });
  }

  // Error recovery handler
  async handleWithRecovery(error: {
    code?: string;
    recoverable?: boolean;
    retry?: () => void;
  }): Promise<{ recovered: boolean }> {
    if (error.recoverable && error.retry) {
      try {
        error.retry();
        return { recovered: true };
      } catch (retryError) {
        this.handleError(retryError, ErrorSeverity.HIGH, {
          action: 'error-recovery-failed',
          originalError: error.code,
        });
        return { recovered: false };
      }
    }

    return { recovered: false };
  }

  // Track error metrics
  async track(error: { type?: string; endpoint?: string }): Promise<void> {
    if (error.type) {
      this.errorMetrics.byType[error.type] = (this.errorMetrics.byType[error.type] || 0) + 1;
    }

    if (error.endpoint) {
      this.errorMetrics.byEndpoint[error.endpoint] =
        (this.errorMetrics.byEndpoint[error.endpoint] || 0) + 1;
    }
  }

  // Get error metrics
  async getMetrics(): Promise<{
    byType: Record<string, number>;
    byEndpoint: Record<string, number>;
  }> {
    return { ...this.errorMetrics };
  }

  // Categorize errors for handling
  private categorizeError(error: unknown): string {
    if (error instanceof Error) {
      const message = error.message.toLowerCase();

      if (message.includes('network') || message.includes('fetch')) {
        return 'network';
      }

      if (error instanceof TypeError) {
        return 'type';
      }

      if (error instanceof RangeError) {
        return 'range';
      }
    }

    // Check for Firebase auth errors
    const firebaseError = error as { code?: string };
    if (firebaseError.code && firebaseError.code.startsWith('auth/')) {
      return 'auth';
    }

    return 'unknown';
  }
}

export const errorHandler = ErrorHandlingService.getInstance();

// React hook for error handling
export function useErrorHandler() {
  const handleError = (
    error: Error | unknown,
    severity?: ErrorSeverity,
    metadata?: ErrorMetadata,
    skipConsoleLog?: boolean
  ) => {
    errorHandler.handleError(error, severity, metadata, skipConsoleLog);
  };

  const handleFirebaseError = (error: unknown, action: string): string => {
    return errorHandler.handleFirebaseError(error, action);
  };

  return {
    handleError,
    handleFirebaseError,
    setUserId: (userId: string | null) => errorHandler.setUserId(userId),
  };
}

// Declare Sentry on window for TypeScript
declare global {
  interface Window {
    Sentry?: {
      captureException: (error: Error, context?: unknown) => void;
      setUser: (user: { id: string } | null) => void;
    };
  }
}
