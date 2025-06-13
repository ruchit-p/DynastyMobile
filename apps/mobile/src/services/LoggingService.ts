import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Sentry from '@sentry/react-native';
import crashlytics from '@react-native-firebase/crashlytics';
import DeviceInfo from 'react-native-device-info';

// Log levels
export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
  FATAL = 4,
}

// Log entry interface
interface LogEntry {
  timestamp: string;
  level: string;
  message: string;
  extra?: any;
  platform: string;
  deviceId: string;
  version: string;
  buildNumber: string;
  stackTrace?: string;
  context?: string;
  userId?: string;
}

// Logging configuration
interface LogConfig {
  enableConsoleInDev: boolean;
  enableSentry: boolean;
  enableCrashlytics: boolean;
  enableLocalStorage: boolean;
  maxLocalLogs: number;
  sentryDsn?: string;
  environment: string;
}

// Performance monitoring
interface PerformanceMetric {
  name: string;
  startTime: number;
  endTime?: number;
  metadata?: Record<string, any>;
}

class LoggingService {
  private isDev = __DEV__;
  private config: LogConfig;
  private deviceId: string = '';
  private appVersion: string = '';
  private buildNumber: string = '';
  private performanceMetrics: Map<string, PerformanceMetric> = new Map();
  private userId?: string;
  private userContext: Record<string, any> = {};
  private breadcrumbs: Sentry.Breadcrumb[] = [];
  private initialized = false;

  constructor() {
    this.config = {
      enableConsoleInDev: true,
      enableSentry: !__DEV__,
      enableCrashlytics: !__DEV__,
      enableLocalStorage: true,
      maxLocalLogs: 1000,
      environment: __DEV__ ? 'development' : 'production',
      sentryDsn: process.env.EXPO_PUBLIC_SENTRY_DSN,
    };
  }

  async initialize(sentryDsnOverride?: string) {
    if (this.initialized) return;

    const finalSentryDsn = sentryDsnOverride || this.config.sentryDsn;

    try {
      // Get device info
      this.deviceId = await DeviceInfo.getUniqueId();
      this.appVersion = DeviceInfo.getVersion();
      this.buildNumber = DeviceInfo.getBuildNumber();

      // Initialize Sentry
      if (this.config.enableSentry && finalSentryDsn) {
        Sentry.init({
          dsn: finalSentryDsn,
          environment: this.config.environment,
          tracesSampleRate: this.isDev ? 1.0 : 0.2,
          debug: this.isDev,
          attachStacktrace: true,
          beforeSend: (event, hint) => {
            // Filter out sensitive data
            if (event.extra) {
              delete event.extra.password;
              delete event.extra.token;
              delete event.extra.privateKey;
            }
            return event;
          },
          integrations: [
            Sentry.reactNativeTracingIntegration(),
          ],
        });

        // Set initial context
        Sentry.setContext('device', {
          deviceId: this.deviceId,
          platform: Platform.OS,
          version: Platform.Version,
          model: await DeviceInfo.getModel(),
        });
      }

      // Initialize Crashlytics
      if (this.config.enableCrashlytics) {
        await crashlytics().setCrashlyticsCollectionEnabled(!this.isDev);
        crashlytics().setAttribute('deviceId', this.deviceId);
        crashlytics().setAttribute('appVersion', this.appVersion);
      }

      this.initialized = true;
      this.info('LoggingService initialized', {
        deviceId: this.deviceId,
        appVersion: this.appVersion,
        buildNumber: this.buildNumber,
        platform: Platform.OS,
      });
    } catch (error) {
      console.error('Failed to initialize LoggingService:', error);
    }
  }

  // Set user context for better error tracking
  async setUser(userId: string, email?: string, attributes?: Record<string, any>) {
    this.userId = userId;
    this.userContext = { ...attributes, email };

    if (this.config.enableSentry) {
      Sentry.setUser({
        id: userId,
        email,
        ...attributes,
      });
    }

    if (this.config.enableCrashlytics) {
      await crashlytics().setUserId(userId);
      if (email) await crashlytics().setAttribute('email', email);
      if (attributes) {
        for (const [key, value] of Object.entries(attributes)) {
          await crashlytics().setAttribute(key, String(value));
        }
      }
    }
  }

  // Clear user context (on logout)
  clearUser() {
    this.userId = undefined;
    this.userContext = {};

    if (this.config.enableSentry) {
      Sentry.setUser(null);
    }

    if (this.config.enableCrashlytics) {
      crashlytics().setUserId('');
    }
  }

  // Main logging method
  private async log(level: LogLevel, message: string, extra?: any, error?: Error) {
    const timestamp = new Date().toISOString();
    const logEntry: LogEntry = {
      timestamp,
      level: LogLevel[level],
      message,
      extra: this.sanitizeData(extra),
      platform: Platform.OS,
      deviceId: this.deviceId,
      version: this.appVersion,
      buildNumber: this.buildNumber,
      userId: this.userId,
      stackTrace: error?.stack,
      context: this.getCurrentContext(),
    };

    // Console logging in development
    if (this.isDev && this.config.enableConsoleInDev) {
      const color = this.getConsoleColor(level);
      const prefix = `[${LogLevel[level]}] ${timestamp.split('T')[1].split('.')[0]}`;
      
      if (error) {
        console.log(`%c${prefix} ${message}`, color, extra, error);
      } else if (extra) {
        console.log(`%c${prefix} ${message}`, color, extra);
      } else {
        console.log(`%c${prefix} ${message}`, color);
      }
    }

    // Send to Sentry
    if (this.config.enableSentry && !this.isDev) {
      this.logToSentry(level, message, extra, error);
    }

    // Send to Crashlytics
    if (this.config.enableCrashlytics && !this.isDev) {
      this.logToCrashlytics(level, message, extra, error);
    }

    // Store locally
    if (this.config.enableLocalStorage) {
      await this.storeLocalLog(logEntry);
    }

    // Add breadcrumb
    this.addBreadcrumb(level, message, extra);
  }

  // Public logging methods
  debug(message: string, extra?: any) {
    this.log(LogLevel.DEBUG, message, extra);
  }

  info(message: string, extra?: any) {
    this.log(LogLevel.INFO, message, extra);
  }

  warn(message: string, extra?: any) {
    this.log(LogLevel.WARN, message, extra);
  }

  error(message: string, error?: Error | any, extra?: any) {
    if (error instanceof Error) {
      this.log(LogLevel.ERROR, message, extra, error);
    } else {
      this.log(LogLevel.ERROR, message, { ...extra, error });
    }
  }

  fatal(message: string, error?: Error | any, extra?: any) {
    if (error instanceof Error) {
      this.log(LogLevel.FATAL, message, extra, error);
    } else {
      this.log(LogLevel.FATAL, message, { ...extra, error });
    }
    
    // Fatal errors should crash the app in production for proper error reporting
    if (!this.isDev) {
      throw error || new Error(message);
    }
  }

  // Performance monitoring
  startPerformanceMetric(name: string, metadata?: Record<string, any>) {
    this.performanceMetrics.set(name, {
      name,
      startTime: Date.now(),
      metadata,
    });
  }

  endPerformanceMetric(name: string) {
    const metric = this.performanceMetrics.get(name);
    if (!metric) {
      this.warn(`Performance metric '${name}' not found`);
      return;
    }

    metric.endTime = Date.now();
    const duration = metric.endTime - metric.startTime;

    this.info(`Performance: ${name}`, {
      duration: `${duration}ms`,
      ...metric.metadata,
    });

    if (this.config.enableSentry) {
      Sentry.metrics.distribution(name, duration, {
        unit: 'millisecond',
        tags: metric.metadata,
      });
    }

    this.performanceMetrics.delete(name);
  }

  // Network request logging
  logNetworkRequest(method: string, url: string, status: number, duration: number, error?: any) {
    const isError = status >= 400;
    const message = `${method} ${url} - ${status}`;
    
    const data = {
      method,
      url,
      status,
      duration: `${duration}ms`,
      error: error?.message,
    };

    if (isError) {
      this.error(message, error, data);
    } else {
      this.debug(message, data);
    }
  }

  // Analytics event logging
  logEvent(eventName: string, parameters?: Record<string, any>) {
    this.info(`Event: ${eventName}`, parameters);

    if (this.config.enableSentry) {
      Sentry.addBreadcrumb({
        category: 'event',
        message: eventName,
        data: parameters,
        level: 'info',
      });
    }

    if (this.config.enableCrashlytics) {
      crashlytics().log(`Event: ${eventName} ${JSON.stringify(parameters || {})}`);
    }
  }

  // Private helper methods
  private logToSentry(level: LogLevel, message: string, extra?: any, error?: Error) {
    switch (level) {
      case LogLevel.DEBUG:
      case LogLevel.INFO:
        Sentry.addBreadcrumb({
          message,
          level: level === LogLevel.DEBUG ? 'debug' : 'info',
          data: extra,
        });
        break;
      case LogLevel.WARN:
        Sentry.captureMessage(message, 'warning');
        break;
      case LogLevel.ERROR:
      case LogLevel.FATAL:
        if (error) {
          Sentry.captureException(error, {
            contexts: {
              extra,
            },
          });
        } else {
          Sentry.captureMessage(message, level === LogLevel.ERROR ? 'error' : 'fatal');
        }
        break;
    }
  }

  private logToCrashlytics(level: LogLevel, message: string, extra?: any, error?: Error) {
    const logMessage = `[${LogLevel[level]}] ${message} ${extra ? JSON.stringify(extra) : ''}`;
    crashlytics().log(logMessage);

    if (level >= LogLevel.ERROR && error) {
      crashlytics().recordError(error);
    }
  }

  private async storeLocalLog(logEntry: LogEntry) {
    try {
      const logs = await this.getStoredLogs();
      logs.push(logEntry);

      // Keep only recent logs
      if (logs.length > this.config.maxLocalLogs) {
        logs.splice(0, logs.length - this.config.maxLocalLogs);
      }

      await AsyncStorage.setItem('@dynasty_logs', JSON.stringify(logs));
    } catch (error) {
      // Fail silently to avoid infinite loop
      if (this.isDev) {
        console.error('Failed to store log locally:', error);
      }
    }
  }

  async getStoredLogs(): Promise<LogEntry[]> {
    try {
      const logs = await AsyncStorage.getItem('@dynasty_logs');
      return logs ? JSON.parse(logs) : [];
    } catch {
      return [];
    }
  }

  async clearStoredLogs() {
    await AsyncStorage.removeItem('@dynasty_logs');
  }

  async exportLogs(): Promise<string> {
    const logs = await this.getStoredLogs();
    return JSON.stringify(logs, null, 2);
  }

  private sanitizeData(data: any): any {
    if (!data) return data;

    const sensitiveKeys = ['password', 'token', 'secret', 'key', 'privateKey', 'pin'];
    
    if (typeof data === 'object') {
      const sanitized = { ...data };
      for (const key of Object.keys(sanitized)) {
        if (sensitiveKeys.some(sensitive => key.toLowerCase().includes(sensitive))) {
          sanitized[key] = '[REDACTED]';
        } else if (typeof sanitized[key] === 'object') {
          sanitized[key] = this.sanitizeData(sanitized[key]);
        }
      }
      return sanitized;
    }
    
    return data;
  }

  private getCurrentContext(): string {
    // This could be enhanced to track the current screen/route
    return 'app';
  }

  private addBreadcrumb(level: LogLevel, message: string, data?: any) {
    const breadcrumb: Sentry.Breadcrumb = {
      timestamp: Date.now() / 1000,
      message,
      level: this.getSentryLevel(level),
      data,
    };

    this.breadcrumbs.push(breadcrumb);
    if (this.breadcrumbs.length > 100) {
      this.breadcrumbs.shift();
    }
  }

  private getConsoleColor(level: LogLevel): string {
    switch (level) {
      case LogLevel.DEBUG: return 'color: #888';
      case LogLevel.INFO: return 'color: #2196F3';
      case LogLevel.WARN: return 'color: #FF9800';
      case LogLevel.ERROR: return 'color: #F44336';
      case LogLevel.FATAL: return 'color: #D32F2F; font-weight: bold';
      default: return 'color: #000';
    }
  }

  private getSentryLevel(level: LogLevel): Sentry.SeverityLevel {
    switch (level) {
      case LogLevel.DEBUG: return 'debug';
      case LogLevel.INFO: return 'info';
      case LogLevel.WARN: return 'warning';
      case LogLevel.ERROR: return 'error';
      case LogLevel.FATAL: return 'fatal';
      default: return 'info';
    }
  }
}

// Export singleton instance
export const logger = new LoggingService();

// Export convenience functions
export const logDebug = (message: string, extra?: any) => logger.debug(message, extra);
export const logInfo = (message: string, extra?: any) => logger.info(message, extra);
export const logWarn = (message: string, extra?: any) => logger.warn(message, extra);
export const logError = (message: string, error?: Error | any, extra?: any) => logger.error(message, error, extra);
export const logFatal = (message: string, error?: Error | any, extra?: any) => logger.fatal(message, error, extra);
export const logEvent = (eventName: string, parameters?: Record<string, any>) => logger.logEvent(eventName, parameters);
export const startMetric = (name: string, metadata?: Record<string, any>) => logger.startPerformanceMetric(name, metadata);
export const endMetric = (name: string) => logger.endPerformanceMetric(name);