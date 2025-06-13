import { normalizeError, showErrorAlert, AppError } from './errorUtils';
import { logger, LogLevel } from '../services/LoggingService';
import * as Sentry from '@sentry/react-native';

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
    // Update logger with user context
    if (userId) {
      logger.setUser(userId);
    } else {
      logger.clearUser();
    }
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

    // Log error using LoggingService
    switch (config.severity) {
      case ErrorSeverity.INFO:
        logger.info(`${config.title}: ${enhancedError.message}`, enhancedError);
        break;
      case ErrorSeverity.WARNING:
        logger.warn(`${config.title}: ${enhancedError.message}`, enhancedError);
        break;
      case ErrorSeverity.ERROR:
        logger.error(`${config.title}: ${enhancedError.message}`, enhancedError.originalError || enhancedError, enhancedError);
        break;
      case ErrorSeverity.FATAL:
        logger.fatal(`${config.title}: ${enhancedError.message}`, enhancedError.originalError || enhancedError, enhancedError);
        break;
    }

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

  private logToAnalytics(errorData: EnhancedAppError) {
    // Log event for analytics
    logger.logEvent('error_occurred', {
      severity: errorData.severity,
      code: errorData.code,
      screen: errorData.screenName,
      message: errorData.message,
      metadata: errorData.metadata
    });

    // Add Sentry context
    if (errorData.screenName) {
      Sentry.setTag('screen', errorData.screenName);
    }
    if (errorData.metadata?.userId) {
      Sentry.setUser({ id: errorData.metadata.userId });
    }
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
    // Set up global error handlers
    const originalHandler = ErrorUtils.getGlobalHandler();
    
    ErrorUtils.setGlobalHandler((error: Error, isFatal?: boolean) => {
      // Log to our service
      if (isFatal) {
        logger.fatal('Unhandled error (fatal)', error);
      } else {
        logger.error('Unhandled error', error);
      }
      
      // Call original handler
      originalHandler(error, isFatal);
    });
    
    logger.info('ErrorHandlingService initialized');
    return this;
  }
}

export const errorHandlingService = new ErrorHandlingService();
export const errorHandler = errorHandlingService; // Export as both names for compatibility
export default errorHandlingService;