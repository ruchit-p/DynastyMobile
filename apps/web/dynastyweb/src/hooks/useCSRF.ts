import { useState, useEffect, useCallback, useRef } from 'react';
import { Functions, httpsCallable } from 'firebase/functions';
import Cookies from 'js-cookie';

/**
 * CSRF token response from the server
 */
interface CSRFTokenResponse {
  token: string;
  expiresIn: number;
  sessionId: string;
}

/**
 * Hook for managing CSRF tokens
 */
export interface UseCSRFReturn {
  csrfToken: string | null;
  isLoading: boolean;
  error: Error | null;
  refreshToken: () => Promise<string>;
  isReady: boolean;
}

/**
 * Custom hook for CSRF token management
 * Automatically fetches and refreshes CSRF tokens for protection against cross-site request forgery
 * 
 * @param functions Firebase Functions instance
 * @returns CSRF token management interface
 */
export function useCSRF(functions: Functions): UseCSRFReturn {
  const [csrfToken, setCSRFToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const refreshTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isMountedRef = useRef(true);

  /**
   * Fetch a new CSRF token from the server
   */
  const fetchCSRFToken = useCallback(async (): Promise<string> => {
    try {
      setError(null);
      
      const generateToken = httpsCallable<void, CSRFTokenResponse>(
        functions,
        'generateCSRFToken'
      );
      
      const result = await generateToken();
      const { token, expiresIn, sessionId } = result.data;
      
      if (!isMountedRef.current) return '';
      
      // Set token in state
      setCSRFToken(token);
      
      // Set token in cookie with secure options
      Cookies.set('csrf-token', token, {
        expires: new Date(Date.now() + expiresIn),
        sameSite: 'strict',
        secure: process.env.NODE_ENV === 'production',
        // Note: httpOnly cannot be set from client-side JavaScript
      });
      
      // Store session ID for reference
      if (sessionId) {
        sessionStorage.setItem('csrf-session-id', sessionId);
      }
      
      // Schedule token refresh before expiry (refresh at 90% of expiry time)
      const refreshTime = expiresIn * 0.9;
      if (refreshTimeoutRef.current) {
        clearTimeout(refreshTimeoutRef.current);
      }
      
      refreshTimeoutRef.current = setTimeout(() => {
        if (isMountedRef.current) {
          fetchCSRFToken().catch(err => {
            console.error('Failed to refresh CSRF token:', err);
            setError(err as Error);
          });
        }
      }, refreshTime);
      
      return token;
    } catch (err) {
      const error = err as Error;
      console.error('Failed to fetch CSRF token:', error);
      
      if (isMountedRef.current) {
        setError(error);
        // Retry after 5 seconds on error
        refreshTimeoutRef.current = setTimeout(() => {
          if (isMountedRef.current) {
            fetchCSRFToken().catch(console.error);
          }
        }, 5000);
      }
      
      throw error;
    } finally {
      if (isMountedRef.current) {
        setIsLoading(false);
      }
    }
  }, [functions]);

  /**
   * Initialize token on mount
   */
  useEffect(() => {
    isMountedRef.current = true;
    
    // Check for existing token in cookie
    const existingToken = Cookies.get('csrf-token');
    const existingSessionId = sessionStorage.getItem('csrf-session-id');
    
    if (existingToken && existingSessionId) {
      // Verify token is still valid by checking if cookie hasn't expired
      setCSRFToken(existingToken);
      setIsLoading(false);
      
      // Still schedule a refresh to ensure token stays fresh
      fetchCSRFToken().catch(err => {
        console.error('Failed to refresh existing CSRF token:', err);
      });
    } else {
      // Fetch new token
      fetchCSRFToken().catch(err => {
        console.error('Failed to fetch initial CSRF token:', err);
      });
    }
    
    // Cleanup on unmount
    return () => {
      isMountedRef.current = false;
      if (refreshTimeoutRef.current) {
        clearTimeout(refreshTimeoutRef.current);
      }
    };
  }, [fetchCSRFToken]);

  /**
   * Handle visibility change - refresh token when tab becomes visible
   */
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && csrfToken) {
        // Check if token might be expired
        const tokenCookie = Cookies.get('csrf-token');
        if (!tokenCookie || tokenCookie !== csrfToken) {
          fetchCSRFToken().catch(err => {
            console.error('Failed to refresh CSRF token on visibility change:', err);
          });
        }
      }
    };
    
    document.addEventListener('visibilitychange', handleVisibilityChange);
    
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [csrfToken, fetchCSRFToken]);

  return {
    csrfToken,
    isLoading,
    error,
    refreshToken: fetchCSRFToken,
    isReady: !isLoading && !!csrfToken && !error,
  };
}