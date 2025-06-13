'use client';

import React, { useState, useEffect } from 'react';
import { X, Cookie, Shield, BarChart3, Wrench, AlertCircle, ChevronDown, ChevronUp } from 'lucide-react';

interface CookiePreferences {
  essential: boolean;
  analytics: boolean;
  functionality: boolean;
  thirdParty: boolean;
}

interface CookieConsentBannerProps {
  onAcceptAll?: () => void;
  onRejectAll?: () => void;
  onSavePreferences?: (preferences: CookiePreferences) => void;
}

export default function CookieConsentBanner({
  onAcceptAll,
  onRejectAll,
  onSavePreferences,
}: CookieConsentBannerProps) {
  const [showBanner, setShowBanner] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  const [preferences, setPreferences] = useState<CookiePreferences>({
    essential: true, // Always true, cannot be changed
    analytics: false,
    functionality: false,
    thirdParty: false,
  });

  useEffect(() => {
    // Check if user has already made a choice
    const consentData = localStorage.getItem('dynasty_cookie_consent');
    if (!consentData) {
      setShowBanner(true);
    } else {
      // Check if consent is older than 12 months (CPRA requirement)
      const consent = JSON.parse(consentData);
      const consentDate = new Date(consent.timestamp);
      const monthsSinceConsent = (Date.now() - consentDate.getTime()) / (1000 * 60 * 60 * 24 * 30);
      
      if (monthsSinceConsent > 12) {
        setShowBanner(true);
      }
    }
  }, []);

  const handleAcceptAll = () => {
    const allAccepted = {
      essential: true,
      analytics: true,
      functionality: true,
      thirdParty: true,
    };
    saveConsent(allAccepted);
    onAcceptAll?.();
    setShowBanner(false);
  };

  const handleRejectAll = () => {
    const onlyEssential = {
      essential: true,
      analytics: false,
      functionality: false,
      thirdParty: false,
    };
    saveConsent(onlyEssential);
    onRejectAll?.();
    setShowBanner(false);
  };

  const handleSavePreferences = () => {
    saveConsent(preferences);
    onSavePreferences?.(preferences);
    setShowBanner(false);
  };

  const saveConsent = (prefs: CookiePreferences) => {
    const consentData = {
      preferences: prefs,
      timestamp: new Date().toISOString(),
      version: '1.0',
    };
    localStorage.setItem('dynasty_cookie_consent', JSON.stringify(consentData));
    
    // Set cookie for server-side checking
    document.cookie = `dynasty_consent=${btoa(JSON.stringify(prefs))}; path=/; max-age=${365 * 24 * 60 * 60}; SameSite=Lax`;
  };

  if (!showBanner) return null;

  return (
    <>
      {/* Backdrop - only show for detailed view */}
      {showDetails && <div className="fixed inset-0 bg-black bg-opacity-30 z-40" />}
      
      {/* Banner */}
      <div className="fixed bottom-0 left-0 right-0 z-50 p-2 sm:p-4">
        <div className={`mx-auto ${showDetails ? 'max-w-2xl' : 'max-w-lg'}`}>
          <div className="bg-white rounded-lg shadow-lg overflow-hidden border border-gray-200">
            {/* Compact View */}
            {!showDetails ? (
              <div className="p-3 sm:p-4">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center space-x-2">
                    <Cookie className="h-5 w-5 text-green-600" />
                    <h2 className="text-base font-bold text-gray-900">Cookie Preferences</h2>
                  </div>
                  <button
                    onClick={() => setShowBanner(false)}
                    className="text-gray-400 hover:text-gray-500 transition-colors"
                    aria-label="Close cookie banner"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
                
                <p className="text-sm text-gray-700 mb-3">
                  We use cookies to enhance your experience. You can customize your preferences or manage your choices.
                </p>
                
                <div className="flex items-center justify-between gap-2">
                  <button
                    onClick={() => setShowDetails(true)}
                    className="text-xs text-green-600 hover:text-green-700 font-medium flex items-center"
                  >
                    <span>More options</span>
                    <ChevronDown className="h-3 w-3 ml-1" />
                  </button>
                  
                  <div className="flex gap-2">
                    <button
                      onClick={handleRejectAll}
                      className="px-3 py-1.5 text-xs bg-gray-200 text-gray-800 font-medium rounded-md hover:bg-gray-300 transition-colors"
                    >
                      Reject All
                    </button>
                    <button
                      onClick={handleAcceptAll}
                      className="px-3 py-1.5 text-xs bg-green-600 text-white font-medium rounded-md hover:bg-green-700 transition-colors"
                    >
                      Accept All
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              /* Detailed View */
              <div className="p-4">
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center space-x-2">
                    <Cookie className="h-5 w-5 text-green-600" />
                    <h2 className="text-lg font-bold text-gray-900">Cookie Preferences</h2>
                  </div>
                  <button
                    onClick={() => setShowBanner(false)}
                    className="text-gray-400 hover:text-gray-500 transition-colors"
                    aria-label="Close cookie banner"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>

                <div className="mb-4">
                  <p className="text-sm text-gray-700 mb-3">
                    Dynasty uses cookies to enhance your family&apos;s experience on our platform. You can customize your preferences below.
                  </p>
                  
                  {/* California Privacy Notice - Simplified */}
                  <div className="bg-blue-50 border-l-4 border-blue-400 p-2 mb-3 text-xs">
                    <div className="flex">
                      <AlertCircle className="h-4 w-4 text-blue-400 mr-1 flex-shrink-0" />
                      <p className="text-blue-800">
                        California residents can opt-out of personal information sharing. See our <a href="/privacy#california-rights" className="underline">Privacy Policy</a>.
                      </p>
                    </div>
                  </div>

                  {/* Cookie Categories - Compact */}
                  <div className="space-y-2 mb-3">
                    {/* Essential Cookies */}
                    <div className="border rounded p-2 bg-gray-50">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-2">
                          <Shield className="h-4 w-4 text-gray-600" />
                          <div>
                            <h3 className="text-sm font-medium text-gray-900">Essential Cookies</h3>
                            <p className="text-xs text-gray-600">Required for basic functionality</p>
                          </div>
                        </div>
                        <input
                          type="checkbox"
                          checked={true}
                          disabled
                          className="h-4 w-4 text-green-600 rounded cursor-not-allowed opacity-60"
                        />
                      </div>
                    </div>

                    {/* Analytics Cookies */}
                    <div className="border rounded p-2">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-2">
                          <BarChart3 className="h-4 w-4 text-purple-600" />
                          <div>
                            <h3 className="text-sm font-medium text-gray-900">Analytics Cookies</h3>
                            <p className="text-xs text-gray-600">Help improve our services</p>
                          </div>
                        </div>
                        <input
                          type="checkbox"
                          checked={preferences.analytics}
                          onChange={(e) => setPreferences({ ...preferences, analytics: e.target.checked })}
                          className="h-4 w-4 text-green-600 rounded focus:ring-green-500"
                        />
                      </div>
                    </div>

                    {/* Functionality Cookies */}
                    <div className="border rounded p-2">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-2">
                          <Wrench className="h-4 w-4 text-yellow-600" />
                          <div>
                            <h3 className="text-sm font-medium text-gray-900">Functionality Cookies</h3>
                            <p className="text-xs text-gray-600">Remember preferences</p>
                          </div>
                        </div>
                        <input
                          type="checkbox"
                          checked={preferences.functionality}
                          onChange={(e) => setPreferences({ ...preferences, functionality: e.target.checked })}
                          className="h-4 w-4 text-green-600 rounded focus:ring-green-500"
                        />
                      </div>
                    </div>

                    {/* Third-Party Cookies */}
                    <div className="border rounded p-2">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-2">
                          <Cookie className="h-4 w-4 text-red-600" />
                          <div>
                            <h3 className="text-sm font-medium text-gray-900">Third-Party Cookies</h3>
                            <p className="text-xs text-gray-600">Enable external services</p>
                          </div>
                        </div>
                        <input
                          type="checkbox"
                          checked={preferences.thirdParty}
                          onChange={(e) => setPreferences({ ...preferences, thirdParty: e.target.checked })}
                          className="h-4 w-4 text-green-600 rounded focus:ring-green-500"
                        />
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center justify-between">
                    <button
                      onClick={() => setShowDetails(false)}
                      className="text-xs text-gray-600 hover:text-gray-800 font-medium flex items-center"
                    >
                      <span>Hide details</span>
                      <ChevronUp className="h-3 w-3 ml-1" />
                    </button>
                    <a
                      href="/cookie-policy"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-gray-600 hover:text-gray-800 underline"
                    >
                      Cookie Policy
                    </a>
                  </div>
                </div>

                {/* Action Buttons */}
                <div className="flex gap-2">
                  <button
                    onClick={handleRejectAll}
                    className="flex-1 px-3 py-1.5 text-xs bg-gray-200 text-gray-800 font-medium rounded-md hover:bg-gray-300 transition-colors"
                  >
                    Reject All
                  </button>
                  <button
                    onClick={handleSavePreferences}
                    className="flex-1 px-3 py-1.5 text-xs bg-green-600 text-white font-medium rounded-md hover:bg-green-700 transition-colors"
                  >
                    Save Preferences
                  </button>
                </div>

                {/* Footer Note - Simplified */}
                <p className="text-xs text-gray-500 mt-2 text-center">
                  By using Dynasty, you agree to our <a href="/terms" className="underline">Terms</a> and <a href="/privacy" className="underline">Privacy Policy</a>
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}