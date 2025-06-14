/**
 * Simple logger utility for server-side logging
 */

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface LogContext {
  [key: string]: any;
}

class Logger {
  private isDevelopment = process.env.NODE_ENV === 'development';

  private log(level: LogLevel, message: string, context?: LogContext): void {
    const timestamp = new Date().toISOString();
    const logObject = {
      timestamp,
      level,
      message,
      ...context,
    };

    // In production, you would send logs to a service like DataDog, LogRocket, etc.
    // For now, we'll use console methods
    switch (level) {
      case 'debug':
        if (this.isDevelopment) {
          console.debug(`[${timestamp}] DEBUG:`, message, context || '');
        }
        break;
      case 'info':
        console.info(`[${timestamp}] INFO:`, message, context || '');
        break;
      case 'warn':
        console.warn(`[${timestamp}] WARN:`, message, context || '');
        break;
      case 'error':
        console.error(`[${timestamp}] ERROR:`, message, context || '');
        break;
    }

    // In production, send to logging service
    if (process.env.NODE_ENV === 'production') {
      // TODO: Implement production logging service integration
      // Example: sendToLoggingService(logObject);
    }
  }

  debug(message: string, context?: LogContext): void {
    this.log('debug', message, context);
  }

  info(message: string, context?: LogContext): void {
    this.log('info', message, context);
  }

  warn(message: string, context?: LogContext): void {
    this.log('warn', message, context);
  }

  error(message: string, error?: Error | unknown, context?: LogContext): void {
    const errorContext: LogContext = { ...context };
    
    if (error instanceof Error) {
      errorContext.errorMessage = error.message;
      errorContext.errorStack = error.stack;
      errorContext.errorName = error.name;
    } else if (error) {
      errorContext.error = error;
    }

    this.log('error', message, errorContext);
  }
}

// Export singleton instance
export const logger = new Logger();