'use client';

import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import dynamic from 'next/dynamic';

// Dynamically import the banner to avoid SSR issues
const CookieConsentBanner = dynamic(() => import('@/components/CookieConsentBanner'), {
  ssr: false,
});

interface CookiePreferences {
  essential: boolean;
  analytics: boolean;
  functionality: boolean;
  thirdParty: boolean;
}

interface CookieConsentContextType {
  preferences: CookiePreferences | null;
  updatePreferences: (prefs: CookiePreferences) => void;
  showPreferences: () => void;
  hasConsented: boolean;
}

const CookieConsentContext = createContext<CookieConsentContextType | undefined>(undefined);

export const useCookieConsent = () => {
  const context = useContext(CookieConsentContext);
  if (!context) {
    throw new Error('useCookieConsent must be used within a CookieConsentProvider');
  }
  return context;
};

interface CookieConsentProviderProps {
  children: ReactNode;
}

export function CookieConsentProvider({ children }: CookieConsentProviderProps) {
  const [preferences, setPreferences] = useState<CookiePreferences | null>(null);
  const [showBanner, setShowBanner] = useState(false);
  const [hasConsented, setHasConsented] = useState(false);
  const [isClient, setIsClient] = useState(false);

  useEffect(() => {
    setIsClient(true);
    // Expose global function for showing cookie settings
    if (typeof window !== 'undefined') {
      window.dynastyShowCookieSettings = () => setShowBanner(true);
    }
  }, []);

  useEffect(() => {
    if (!isClient) return;

    // Load preferences from localStorage
    const storedConsent = localStorage.getItem('dynasty_cookie_consent');
    if (storedConsent) {
      try {
        const consent = JSON.parse(storedConsent);
        setPreferences(consent.preferences);
        setHasConsented(true);
        
        // Apply preferences (enable/disable analytics, etc.)
        applyPreferences(consent.preferences);
      } catch (error) {
        console.error('Error parsing cookie consent:', error);
      }
    }
  }, [isClient]);

  const applyPreferences = (prefs: CookiePreferences) => {
    // Google Analytics
    if (typeof window !== 'undefined' && window.gtag) {
      if (prefs.analytics) {
        window.gtag('consent', 'update', {
          'analytics_storage': 'granted'
        });
      } else {
        window.gtag('consent', 'update', {
          'analytics_storage': 'denied'
        });
      }
    }

    // Firebase Analytics
    if (typeof window !== 'undefined' && window.firebase?.analytics) {
      window.firebase.analytics().setAnalyticsCollectionEnabled(prefs.analytics);
    }

    // Apply other preference-based settings here
  };

  const updatePreferences = (prefs: CookiePreferences) => {
    setPreferences(prefs);
    setHasConsented(true);
    applyPreferences(prefs);
  };

  const showPreferences = () => {
    setShowBanner(true);
  };

  const handleAcceptAll = () => {
    const allAccepted: CookiePreferences = {
      essential: true,
      analytics: true,
      functionality: true,
      thirdParty: true,
    };
    updatePreferences(allAccepted);
  };

  const handleRejectAll = () => {
    const onlyEssential: CookiePreferences = {
      essential: true,
      analytics: false,
      functionality: false,
      thirdParty: false,
    };
    updatePreferences(onlyEssential);
  };

  const handleSavePreferences = (prefs: CookiePreferences) => {
    updatePreferences(prefs);
  };

  return (
    <CookieConsentContext.Provider
      value={{
        preferences,
        updatePreferences,
        showPreferences,
        hasConsented,
      }}
    >
      {children}
      {isClient && (showBanner || !hasConsented) && (
        <CookieConsentBanner
          onAcceptAll={handleAcceptAll}
          onRejectAll={handleRejectAll}
          onSavePreferences={handleSavePreferences}
        />
      )}
    </CookieConsentContext.Provider>
  );
}

// Extend Window interface for TypeScript
declare global {
  interface Window {
    gtag?: (...args: any[]) => void;
    firebase?: {
      analytics: () => {
        setAnalyticsCollectionEnabled: (enabled: boolean) => void;
      };
    };
    dynastyShowCookieSettings?: () => void;
    dynastyUpdateConsent?: (preferences: CookiePreferences) => void;
  }
}