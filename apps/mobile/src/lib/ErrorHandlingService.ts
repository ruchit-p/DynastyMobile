import { normalizeError, showErrorAlert, AppError } from './errorUtils';

export enum ErrorSeverity {
  INFO = 'info',
  WARNING = 'warning',
  ERROR = 'error',
  FATAL = 'fatal'
}

export interface ErrorHandlerConfig {
  severity: ErrorSeverity;
  title: string;
  trackCurrentScreen?: boolean;
  showAlert?: boolean;
  logToAnalytics?: boolean;
  metadata?: Record<string, any>;
}

export interface ErrorMetadata {
  screenName?: string;
  functionName?: string;
  userId?: string;
  timestamp?: string;
  [key: string]: any;
}

export interface EnhancedAppError extends AppError {
  severity: ErrorSeverity;
  screenName?: string;
  timestamp: string;
  metadata?: Record<string, any>;
}

class ErrorHandlingService {
  private currentScreen?: string;
  private currentAction?: string;
  private userId?: string;

  setCurrentScreen(screenName: string) {
    this.currentScreen = screenName;
  }

  getCurrentScreen(): string | undefined {
    return this.currentScreen;
  }

  setCurrentAction(action: string) {
    this.currentAction = action;
  }

  getCurrentAction(): string | undefined {
    return this.currentAction;
  }

  setUserId(userId: string | null | undefined) {
    this.userId = userId || undefined;
  }

  getUserId(): string | undefined {
    return this.userId;
  }

  handleError(
    error: any,
    config: ErrorHandlerConfig,
    metadata?: ErrorMetadata
  ): EnhancedAppError {
    const normalizedError = normalizeError(error);
    
    const enhancedError: EnhancedAppError = {
      ...normalizedError,
      severity: config.severity,
      timestamp: new Date().toISOString(),
      screenName: config.trackCurrentScreen ? this.currentScreen : metadata?.screenName,
      metadata: { 
        ...metadata, 
        ...config.metadata,
        userId: this.userId || metadata?.userId,
      }
    };

    // Log error for debugging
    console.error(`[${config.severity.toUpperCase()}] ${config.title}:`, enhancedError);

    // Show alert if configured to do so (default: true for ERROR and FATAL)
    const shouldShowAlert = config.showAlert !== false && 
      (config.severity === ErrorSeverity.ERROR || config.severity === ErrorSeverity.FATAL);

    if (shouldShowAlert) {
      showErrorAlert(normalizedError, config.title);
    }

    // Log to analytics if configured
    if (config.logToAnalytics !== false) {
      this.logToAnalytics(enhancedError);
    }

    return enhancedError;
  }

  private logToAnalytics(errorData: any) {
    // In a real app, this would send to analytics service
    // For now, just log to console
    console.log('Analytics Error Log:', errorData);
  }

  /**
   * Higher-order function to wrap async functions with error handling
   */
  withErrorHandling<T extends (...args: any[]) => Promise<any>>(
    fn: T,
    config: ErrorHandlerConfig,
    metadata?: ErrorMetadata
  ): T {
    return (async (...args: any[]) => {
      try {
        return await fn(...args);
      } catch (error) {
        this.handleError(error, config, metadata);
        throw error; // Re-throw to allow component to handle if needed
      }
    }) as T;
  }

  /**
   * Create an error wrapper for specific configurations
   */
  createErrorWrapper<T extends (...args: any[]) => Promise<any>>(
    fn: T,
    config: ErrorHandlerConfig,
    metadata?: Record<string, any>
  ) {
    return async (...args: Parameters<T>): Promise<ReturnType<T>> => {
      try {
        return await fn(...args);
      } catch (error) {
        this.handleError(error, config, metadata);
        throw error;
      }
    };
  }

  /**
   * Handle Firebase-specific errors
   */
  handleFirebaseError(error: any, config?: ErrorHandlerConfig | string, metadata?: Record<string, any>): EnhancedAppError {
    // Support both old and new calling patterns
    if (typeof config === 'string') {
      return this.handleError(error, {
        severity: ErrorSeverity.ERROR,
        title: config || 'Firebase Operation Failed',
        metadata
      });
    } else if (config && typeof config === 'object') {
      return this.handleError(error, config);
    } else {
      return this.handleError(error, {
        severity: ErrorSeverity.ERROR,
        title: 'Firebase Operation Failed',
        metadata
      });
    }
  }

  /**
   * Initialize the error handling service
   */
  initialize() {
    // Set up global error handlers if needed
    console.log('ErrorHandlingService initialized');
    return this;
  }
}

export const errorHandlingService = new ErrorHandlingService();
export const errorHandler = errorHandlingService; // Export as both names for compatibility
export default errorHandlingService;