import { format, formatDistanceToNow, isValid } from 'date-fns';
import { errorHandler, ErrorSeverity } from './ErrorHandlingService';

/**
 * Supported timestamp types for mobile (Date, plain object, number, string).
 */
export type TimestampType =
  | Date
  | { seconds: number; nanoseconds?: number }
  | { _seconds: number; _nanoseconds: number }
  | { toDate: () => Date }
  | number
  | string
  | null
  | undefined;

/**
 * Convert various timestamp formats to a JavaScript Date object.
 * Returns null if the timestamp is invalid or missing.
 */
export function toDate(timestamp: TimestampType): Date | null {
  try {
    if (!timestamp) return null;

    // Handle Date object
    if (timestamp instanceof Date) {
      return isValid(timestamp) ? timestamp : null;
    }

    // Handle Firestore Timestamp-like objects
    if (typeof (timestamp as any).toDate === 'function') {
      const date = (timestamp as any).toDate();
      return isValid(date) ? date : null;
    }

    // Handle plain object with seconds & nanoseconds
    if (typeof timestamp === 'object') {
      const tsObj = timestamp as any;
      if (typeof tsObj.seconds === 'number') {
        return new Date(tsObj.seconds * 1000);
      }
      if (typeof tsObj._seconds === 'number') {
        return new Date(tsObj._seconds * 1000);
      }
    }

    // Handle number (milliseconds since epoch)
    if (typeof timestamp === 'number') {
      const date = new Date(timestamp);
      return isValid(date) ? date : null;
    }

    // Handle string (ISO 8601)
    if (typeof timestamp === 'string') {
      const date = new Date(timestamp);
      return isValid(date) ? date : null;
    }

    return null;
  } catch (error) {
    errorHandler.handleError(error, {
      severity: ErrorSeverity.WARNING,
      title: 'Date Conversion Error',
      metadata: {
        action: 'toDate',
        timestampType: typeof timestamp,
        timestampValue: String(timestamp).substring(0, 100) // Truncate for safety
      },
      showAlert: false
    });
    return null;
  }
}

/**
 * Format a timestamp to a human-readable date string (e.g., "June 3, 2025").
 */
export function formatDate(
  timestamp: TimestampType,
  formatString = 'MMMM d, yyyy',
  fallback = 'Unknown date'
): string {
  try {
    const date = toDate(timestamp);
    if (!date) return fallback;
    return format(date, formatString);
  } catch (error) {
    errorHandler.handleError(error, {
      severity: ErrorSeverity.INFO,
      title: 'Date Formatting Error',
      metadata: {
        action: 'formatDate',
        formatString,
        timestampType: typeof timestamp
      },
      showAlert: false
    });
    return fallback;
  }
}

/**
 * Format a timestamp as a relative time (e.g., "2 hours ago").
 */
export function formatTimeAgo(
  timestamp: TimestampType,
  addSuffix = true,
  fallback = 'Unknown time'
): string {
  try {
    const date = toDate(timestamp);
    if (!date) return fallback;
    return formatDistanceToNow(date, { addSuffix });
  } catch (error) {
    errorHandler.handleError(error, {
      severity: ErrorSeverity.INFO,
      title: 'Time Ago Formatting Error',
      metadata: {
        action: 'formatTimeAgo',
        addSuffix,
        timestampType: typeof timestamp
      },
      showAlert: false
    });
    return fallback;
  }
}

/**
 * Get a smart date display:
 * - If today: "Today at h:mm a"
 * - If this year: "MMMM d"
 * - Otherwise: "MMMM d, yyyy"
 */
export function getSmartDate(
  timestamp: TimestampType,
  fallback = 'Unknown date'
): string {
  try {
    const date = toDate(timestamp);
    if (!date) return fallback;
    const now = new Date();

    // Same day
    if (
      date.getFullYear() === now.getFullYear() &&
      date.getMonth() === now.getMonth() &&
      date.getDate() === now.getDate()
    ) {
      return `Today at ${format(date, 'h:mm a')}`;
    }

    // Same year
    if (date.getFullYear() === now.getFullYear()) {
      return format(date, 'MMMM d');
    }

    // Different year
    return format(date, 'MMMM d, yyyy');
  } catch (error) {
    errorHandler.handleError(error, {
      severity: ErrorSeverity.INFO,
      title: 'Smart Date Formatting Error',
      metadata: {
        action: 'getSmartDate',
        timestampType: typeof timestamp
      },
      showAlert: false
    });
    return fallback;
  }
} 