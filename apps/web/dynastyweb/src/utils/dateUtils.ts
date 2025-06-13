import { format, formatDistanceToNow, isValid } from "date-fns";
import { Timestamp } from "firebase/firestore";

/**
 * Types of timestamp formats that can be encountered in the application
 */
export type TimestampType = 
  | Date 
  | Timestamp
  | { seconds: number; nanoseconds: number } 
  | { _seconds: number; _nanoseconds: number } 
  | number
  | string
  | null
  | undefined;

/**
 * Converts any timestamp format to a JavaScript Date object
 * 
 * @param timestamp - The timestamp to convert (various formats supported)
 * @returns A JavaScript Date object or null if invalid/missing
 */
export function toDate(timestamp: TimestampType): Date | null {
  try {
    if (!timestamp) return null;

    // Handle Date object
    if (timestamp instanceof Date) {
      return isValid(timestamp) ? timestamp : null;
    }

    // Handle Firebase Timestamp
    if (timestamp instanceof Timestamp) {
      return timestamp.toDate();
    }

    // Handle empty object (server timestamp that hasn't been processed yet)
    if (typeof timestamp === 'object' && 
        timestamp !== null && 
        Object.keys(timestamp).length === 0) {
      console.log("Converting empty object timestamp to current time");
      // Use current time as fallback for new comments with empty timestamp objects
      return new Date();
    }

    // Handle object with seconds and nanoseconds
    if (typeof timestamp === 'object' && 'seconds' in timestamp && typeof timestamp.seconds === 'number') {
      return new Date(timestamp.seconds * 1000);
    }

    // Handle object with _seconds and _nanoseconds
    if (typeof timestamp === 'object' && '_seconds' in timestamp && typeof timestamp._seconds === 'number') {
      return new Date(timestamp._seconds * 1000);
    }

    // Handle number (milliseconds since epoch)
    if (typeof timestamp === 'number') {
      return new Date(timestamp);
    }

    // Handle string (ISO date string)
    if (typeof timestamp === 'string') {
      const date = new Date(timestamp);
      return isValid(date) ? date : null;
    }

    return null;
  } catch (error) {
    console.error("Error converting timestamp to Date:", error, timestamp);
    return null;
  }
}

/**
 * Format a timestamp to a human-readable date string
 * 
 * @param timestamp - The timestamp to format (various formats supported)
 * @param formatString - Optional date-fns format string (default: "MMMM d, yyyy")
 * @param fallback - Optional fallback string if date is invalid (default: "Unknown date")
 * @returns Formatted date string
 */
export function formatDate(
  timestamp: TimestampType, 
  formatString = "MMMM d, yyyy",
  fallback = "Unknown date"
): string {
  try {
    const date = toDate(timestamp);
    if (!date) return fallback;
    
    return format(date, formatString);
  } catch (error) {
    console.error("Error formatting date:", error, timestamp);
    return fallback;
  }
}

/**
 * Format a timestamp as a relative time (e.g., "2 hours ago")
 * 
 * @param timestamp - The timestamp to format (various formats supported)
 * @param addSuffix - Whether to add a suffix (default: true)
 * @param fallback - Optional fallback string if date is invalid (default: "Unknown time")
 * @returns Relative time string
 */
export function formatTimeAgo(
  timestamp: TimestampType,
  addSuffix = true,
  fallback = "Unknown time"
): string {
  try {
    const date = toDate(timestamp);
    if (!date) return fallback;
    
    return formatDistanceToNow(date, { addSuffix });
  } catch (error) {
    console.error("Error formatting time ago:", error, timestamp);
    return fallback;
  }
}

/**
 * Check if a date is today
 * 
 * @param timestamp - The timestamp to check (various formats supported)
 * @returns True if the date is today, false otherwise
 */
export function isToday(timestamp: TimestampType): boolean {
  const date = toDate(timestamp);
  if (!date) return false;
  
  const today = new Date();
  return date.getDate() === today.getDate() &&
    date.getMonth() === today.getMonth() &&
    date.getFullYear() === today.getFullYear();
}

/**
 * Get a formatted date with intelligent display logic
 * - If today: "Today at HH:mm"
 * - If this year: "MMMM d"
 * - Otherwise: "MMMM d, yyyy"
 * 
 * @param timestamp - The timestamp to format (various formats supported)
 * @param fallback - Optional fallback string if date is invalid (default: "Unknown date")
 * @returns Intelligently formatted date string
 */
export function getSmartDate(
  timestamp: TimestampType,
  fallback = "Unknown date"
): string {
  try {
    const date = toDate(timestamp);
    if (!date) return fallback;
    
    if (isToday(date)) {
      return `Today at ${format(date, "h:mm a")}`;
    }
    
    const now = new Date();
    if (date.getFullYear() === now.getFullYear()) {
      return format(date, "MMMM d");
    }
    
    return format(date, "MMMM d, yyyy");
  } catch (error) {
    console.error("Error formatting smart date:", error, timestamp);
    return fallback;
  }
}

/**
 * Format a date specifically for vault items with better fallbacks
 * 
 * @param timestamp - The timestamp to format (various formats supported)
 * @param formatString - Optional date-fns format string (default: "MMM d, yyyy")
 * @returns Formatted date string with intelligent fallbacks
 */
export function formatVaultDate(
  timestamp: TimestampType,
  formatString = "MMM d, yyyy"
): string {
  try {
    // Debug logging to understand what we're receiving
    console.log("formatVaultDate received:", timestamp, typeof timestamp);
    
    const date = toDate(timestamp);
    
    if (!date) {
      // If no date is available, show "Just now" for recent items
      console.log("No valid date found, using fallback");
      return "Recently added";
    }
    
    return format(date, formatString);
  } catch (error) {
    console.error("Error formatting vault date:", error, timestamp);
    return "Recently added";
  }
} 