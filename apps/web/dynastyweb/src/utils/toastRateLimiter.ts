/**
 * Toast Rate Limiter
 * Prevents spam toast notifications by implementing rate limiting
 */

interface ToastEntry {
  message: string;
  timestamp: number;
  count: number;
}

class ToastRateLimiter {
  private static instance: ToastRateLimiter;
  private toastHistory: Map<string, ToastEntry> = new Map();
  private readonly RATE_LIMIT_WINDOW = 5000; // 5 seconds
  private readonly MAX_TOASTS_PER_WINDOW = 3;
  private readonly CLEANUP_INTERVAL = 30000; // 30 seconds

  private constructor() {
    // Cleanup old entries periodically
    setInterval(() => {
      this.cleanupOldEntries();
    }, this.CLEANUP_INTERVAL);
  }

  static getInstance(): ToastRateLimiter {
    if (!ToastRateLimiter.instance) {
      ToastRateLimiter.instance = new ToastRateLimiter();
    }
    return ToastRateLimiter.instance;
  }

  shouldShowToast(message: string, variant: string = 'default'): boolean {
    const key = `${variant}:${message}`;
    const now = Date.now();
    const entry = this.toastHistory.get(key);

    if (!entry) {
      // First time showing this toast
      this.toastHistory.set(key, {
        message,
        timestamp: now,
        count: 1,
      });
      return true;
    }

    // Check if we're within the rate limit window
    if (now - entry.timestamp < this.RATE_LIMIT_WINDOW) {
      if (entry.count >= this.MAX_TOASTS_PER_WINDOW) {
        // Rate limited - don't show toast
        return false;
      } else {
        // Within limit - increment count and show
        entry.count++;
        return true;
      }
    } else {
      // Outside rate limit window - reset counter
      entry.timestamp = now;
      entry.count = 1;
      return true;
    }
  }

  private cleanupOldEntries(): void {
    const now = Date.now();
    const cutoff = now - this.RATE_LIMIT_WINDOW * 2; // Keep entries for 2x the rate limit window

    const keysToDelete: string[] = [];
    this.toastHistory.forEach((entry, key) => {
      if (entry.timestamp < cutoff) {
        keysToDelete.push(key);
      }
    });
    keysToDelete.forEach(key => this.toastHistory.delete(key));
  }

  // Reset rate limiting for a specific message (useful for testing)
  resetRateLimit(message: string, variant: string = 'default'): void {
    const key = `${variant}:${message}`;
    this.toastHistory.delete(key);
  }

  // Get current rate limit status (useful for debugging)
  getRateLimitStatus(message: string, variant: string = 'default'): {
    isLimited: boolean;
    count: number;
    timeRemaining: number;
  } {
    const key = `${variant}:${message}`;
    const entry = this.toastHistory.get(key);
    const now = Date.now();

    if (!entry) {
      return { isLimited: false, count: 0, timeRemaining: 0 };
    }

    const timeElapsed = now - entry.timestamp;
    const timeRemaining = Math.max(0, this.RATE_LIMIT_WINDOW - timeElapsed);
    const isLimited = timeElapsed < this.RATE_LIMIT_WINDOW && entry.count >= this.MAX_TOASTS_PER_WINDOW;

    return {
      isLimited,
      count: entry.count,
      timeRemaining,
    };
  }
}

export const toastRateLimiter = ToastRateLimiter.getInstance();

// Wrapper function for rate-limited toast
export const showRateLimitedToast = (
  toastFn: (options: any) => void,
  options: {
    title?: string;
    description: string;
    variant?: 'default' | 'destructive' | 'success';
  }
): boolean => {
  const message = options.description;
  const variant = options.variant || 'default';
  
  if (toastRateLimiter.shouldShowToast(message, variant)) {
    toastFn(options);
    return true;
  }
  
  return false;
};