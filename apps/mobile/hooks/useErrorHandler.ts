import { useEffect, useCallback, useState } from 'react';
import { errorHandler, ErrorSeverity, EnhancedAppError } from '../src/lib/ErrorHandlingService';

interface ErrorHandlerConfig {
  severity: ErrorSeverity;
  title: string;
  trackCurrentScreen?: boolean;
}

interface UseErrorHandlerReturn {
  handleError: (error: any, metadata?: Record<string, any>) => EnhancedAppError;
  clearError: () => void;
  error: EnhancedAppError | null;
  hasError: boolean;
  isError: boolean;
  reset: () => void;
  withErrorHandling: <T extends (...args: any[]) => Promise<any>>(
    fn: T,
    metadata?: Record<string, any>
  ) => (...args: Parameters<T>) => Promise<ReturnType<T>>;
}

export function useErrorHandler(config: ErrorHandlerConfig): UseErrorHandlerReturn {
  const [error, setError] = useState<EnhancedAppError | null>(null);
  const [hasError, setHasError] = useState(false);

  // Set current screen for tracking if enabled
  useEffect(() => {
    if (config.trackCurrentScreen) {
      // Try to extract screen name from the title or use a default
      const screenName = config.title?.replace(/ Error$/, '') || 'UnknownScreen';
      errorHandler.setCurrentScreen(screenName);
    }
  }, [config.trackCurrentScreen, config.title]);

  // Reset error state when config changes (e.g., navigating to new screen)
  useEffect(() => {
    setError(null);
    setHasError(false);
  }, [config.title]);

  const handleError = useCallback((error: any, metadata?: Record<string, any>) => {
    const normalizedError = errorHandler.handleError(error, {
      severity: config.severity,
      title: config.title,
      metadata
    });
    setError(normalizedError);
    setHasError(true);
    return normalizedError;
  }, [config]);

  const clearError = useCallback(() => {
    setError(null);
    setHasError(false);
  }, []);

  const reset = useCallback(() => {
    setError(null);
    setHasError(false);
  }, []);

  const withErrorHandling = useCallback(<T extends (...args: any[]) => Promise<any>>(
    fn: T,
    metadata?: Record<string, any>
  ): (...args: Parameters<T>) => Promise<ReturnType<T>> => {
    return errorHandler.createErrorWrapper(fn, {
      severity: config.severity,
      title: config.title,
      metadata
    });
  }, [config]);

  return {
    handleError,
    clearError,
    reset,
    error,
    hasError,
    isError: hasError,
    withErrorHandling
  };
}