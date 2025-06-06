import { useCallback } from 'react';
import { useToast } from '@/components/ui/use-toast';
import { errorHandler, ErrorSeverity, ErrorMetadata } from '@/services/ErrorHandlingService';

interface UseErrorHandlerOptions {
  title?: string;
  skipToast?: boolean;
}

export function useErrorHandler(options: UseErrorHandlerOptions = {}) {
  const { toast } = useToast();
  const { title = 'Error', skipToast = false } = options;

  const handleError = useCallback((error: Error | unknown, customMessage?: string) => {
    // Log the error
    errorHandler.handleError(
      error,
      ErrorSeverity.MEDIUM,
      {
        context: title,
        action: customMessage || 'Unknown action'
      } as ErrorMetadata
    );

    // Show toast if not skipped
    if (!skipToast) {
      const errorMessage = customMessage || (error instanceof Error ? error.message : 'An unexpected error occurred');
      
      toast({
        title,
        description: errorMessage,
        variant: 'destructive',
      });
    }
  }, [title, skipToast, toast]);

  const withErrorHandling = useCallback(<T extends any[], R>(
    fn: (...args: T) => Promise<R>
  ) => {
    return async (...args: T): Promise<R | undefined> => {
      try {
        return await fn(...args);
      } catch (error) {
        handleError(error);
        return undefined;
      }
    };
  }, [handleError]);

  return {
    handleError,
    withErrorHandling
  };
}