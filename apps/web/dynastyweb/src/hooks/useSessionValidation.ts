import { useEffect, useRef, useCallback } from 'react';
import { User } from 'firebase/auth';

interface SessionValidationOptions {
  interval?: number; // Validation interval in milliseconds
  onInvalidSession?: () => void;
}

export const useSessionValidation = (
  user: User | null,
  options: SessionValidationOptions = {}
) => {
  const { 
    interval = 5 * 60 * 1000, // Default: 5 minutes
    onInvalidSession 
  } = options;
  
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const lastValidationRef = useRef<number>(0);

  const validateSession = useCallback(async () => {
    if (!user) return true;

    try {
      const token = await user.getIdToken();
      
      const response = await fetch('/api/auth/check', {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      const data = await response.json();
      
      if (!data.valid) {
        console.warn('Session validation failed');
        onInvalidSession?.();
        return false;
      }

      // Update last validation time
      lastValidationRef.current = Date.now();
      
      // Log cache hit rate for monitoring
      if (data.cached) {
        console.debug('Session validated from cache');
      } else {
        console.debug('Session validated from Firebase');
      }

      return true;
    } catch (error) {
      console.error('Session validation error:', error);
      return false;
    }
  }, [user, onInvalidSession]);

  // Validate session on user change
  useEffect(() => {
    if (user) {
      validateSession();
    }
  }, [user, validateSession]);

  // Set up periodic validation
  useEffect(() => {
    if (!user || interval <= 0) return;

    // Clear existing interval
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
    }

    // Set up new interval
    intervalRef.current = setInterval(() => {
      validateSession();
    }, interval) as unknown as NodeJS.Timeout;

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [user, interval, validateSession]);

  // Expose manual validation method
  return {
    validateSession,
    lastValidation: lastValidationRef.current,
  };
};