import { useState, useEffect, useCallback, useRef } from 'react';
import { Functions, httpsCallable } from 'firebase/functions';
import { auth } from '@/lib/firebase';
import Cookies from 'js-cookie';

/**
 * CSRF token response from the server
 */
interface CSRFTokenResponse {
  token: string;
  expiresIn: number;
  sessionId: string;
  isAuthenticated?: boolean;
}

/**
 * CSRF token request data
 */
interface CSRFTokenRequest {
  visitorId?: string;
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
  getCSRFToken: () => Promise<string>;
  ensureCSRFToken: () => Promise<void>;
}

/**
 * Custom hook for CSRF token management
 * Automatically fetches and refreshes CSRF tokens for protection against cross-site request forgery
 * 
 * @param functions Firebase Functions instance
 * @returns CSRF token management interface
 */
export function useCSRF(functions: Functions | null | undefined): UseCSRFReturn {
  const [csrfToken, setCSRFToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const refreshTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isMountedRef = useRef(true);
  const hasInitialized = useRef(false);

  /**
   * Fetch a new CSRF token from the server
   */
  const fetchCSRFToken = useCallback(async (): Promise<string> => {
    try {
      setError(null);
      setIsLoading(true);
      
      // Check if functions is defined
      if (!functions) {
        throw new Error('Firebase Functions not initialized');
      }
      
      // Check if user is authenticated
      const isAuthenticated = auth.currentUser != null;
      
      // Use different endpoints based on authentication state
      const functionName = isAuthenticated
        ? 'generateCSRFToken'  // Authenticated refresh
        : 'generateInitialCSRFToken'; // Initial token for unauthenticated users
        
      const generateToken = httpsCallable<CSRFTokenRequest, CSRFTokenResponse>(
        functions,
        functionName
      );
      
      // Prepare request data - no visitor ID for now to avoid FingerprintJS dependency
      const requestData: CSRFTokenRequest = {};
      
      const result = await generateToken(requestData);
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
   * Initialize token on mount - fetch automatically if no existing token
   */
  useEffect(() => {
    isMountedRef.current = true;
    
    // If functions is not available, set loading to false and return
    if (!functions) {
      setIsLoading(false);
      setError(new Error('Firebase Functions not initialized'));
      return;
    }
    
    // Check for existing token in cookie
    const existingToken = Cookies.get('csrf-token');
    const existingSessionId = sessionStorage.getItem('csrf-session-id');
    
    if (existingToken && existingSessionId) {
      // Verify token is still valid by checking if cookie hasn't expired
      setCSRFToken(existingToken);
      hasInitialized.current = true;
    } else {
      // No existing token, fetch one automatically
      hasInitialized.current = true;
      fetchCSRFToken().catch(err => {
        console.error('Failed to initialize CSRF token:', err);
      });
    }
    
    // Cleanup on unmount
    return () => {
      isMountedRef.current = false;
      if (refreshTimeoutRef.current) {
        clearTimeout(refreshTimeoutRef.current);
      }
    };
  }, [fetchCSRFToken, functions]);

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

  /**
   * Get CSRF token - fetch if not already available
   */
  const getCSRFToken = useCallback(async (): Promise<string> => {
    // If we already have a token, return it
    if (csrfToken) {
      return csrfToken;
    }
    
    // If we're already loading, wait for it
    if (isLoading) {
      return new Promise((resolve) => {
        const checkInterval = setInterval(() => {
          if (!isLoading) {
            clearInterval(checkInterval);
            resolve(csrfToken || '');
          }
        }, 100);
      });
    }
    
    // Otherwise, fetch a new token
    return fetchCSRFToken();
  }, [csrfToken, isLoading, fetchCSRFToken]);

  /**
   * Ensure CSRF token is available
   */
  const ensureCSRFToken = useCallback(async () => {
    if (!csrfToken && !isLoading && !hasInitialized.current) {
      hasInitialized.current = true;
      await fetchCSRFToken();
    }
  }, [csrfToken, isLoading, fetchCSRFToken]);

  return {
    csrfToken,
    isLoading,
    error,
    refreshToken: fetchCSRFToken,
    isReady: !isLoading && !!csrfToken && !error,
    getCSRFToken,
    ensureCSRFToken,
  };
}