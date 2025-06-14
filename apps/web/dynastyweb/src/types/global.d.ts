// Global type declarations

declare global {
  interface Window {
    gtag?: (
      command: 'config' | 'event' | 'exception' | 'timing_complete',
      targetId: string,
      config?: Record<string, unknown>
    ) => void;
    
    analytics?: {
      track: (eventName: string, properties?: Record<string, unknown>) => void;
      identify: (userId: string, traits?: Record<string, unknown>) => void;
      page: (name?: string, properties?: Record<string, unknown>) => void;
    };

    Sentry?: {
      captureException: (error: Error | unknown) => void;
      setUser: (user: { id: string } | null) => void;
      captureMessage: (message: string, level?: string) => void;
    };
  }
}

export {};