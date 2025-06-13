'use client';

import { useEffect, useState } from 'react';
import CookieConsentBanner from '@/components/CookieConsentBanner';

export default function CookieConsentWrapper({ children }: { children: React.ReactNode }) {
  const [showBanner, setShowBanner] = useState(false);

  useEffect(() => {
    // Check for consent in localStorage
    const consent = localStorage.getItem('dynasty_cookie_consent');
    if (!consent) {
      setShowBanner(true);
    }
  }, []);

  const handleConsent = () => {
    setShowBanner(false);
  };

  return (
    <>
      {children}
      {showBanner && (
        <CookieConsentBanner
          onAcceptAll={handleConsent}
          onRejectAll={handleConsent}
          onSavePreferences={handleConsent}
        />
      )}
    </>
  );
}