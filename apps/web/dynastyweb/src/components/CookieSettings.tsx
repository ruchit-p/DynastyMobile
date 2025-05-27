'use client';

import React, { useState, useEffect } from 'react';
import { Shield, BarChart3, Wrench, Cookie as CookieIcon, Check, X } from 'lucide-react';
import { useCookieConsent } from '@/context/CookieConsentContext';

export default function CookieSettings() {
  const { preferences, updatePreferences } = useCookieConsent();
  const [localPreferences, setLocalPreferences] = useState(preferences || {
    essential: true,
    analytics: false,
    functionality: false,
    thirdParty: false,
  });
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (preferences) {
      setLocalPreferences(preferences);
    }
  }, [preferences]);

  const handleSave = () => {
    updatePreferences(localPreferences);
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  };

  const handleToggle = (category: keyof typeof localPreferences) => {
    if (category === 'essential') return; // Essential cookies cannot be disabled
    
    setLocalPreferences(prev => ({
      ...prev,
      [category]: !prev[category]
    }));
  };

  return (
    <div className="max-w-2xl">
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-gray-900 mb-2">Cookie Preferences</h2>
        <p className="text-gray-600">
          Manage how Dynasty uses cookies to enhance your experience. Your preferences will be saved and applied immediately.
        </p>
      </div>

      <div className="space-y-4">
        {/* Essential Cookies */}
        <div className="bg-white border border-gray-200 rounded-lg p-6">
          <div className="flex items-start justify-between">
            <div className="flex items-start space-x-3">
              <Shield className="h-6 w-6 text-gray-600 mt-0.5" />
              <div className="flex-1">
                <h3 className="text-lg font-semibold text-gray-900">Essential Cookies</h3>
                <p className="text-gray-600 mt-1">
                  Required for Dynasty to function properly. These cookies enable core features like security, account access, and basic navigation.
                </p>
                <p className="text-sm text-gray-500 mt-2">
                  Includes: Authentication tokens, security features, session management
                </p>
              </div>
            </div>
            <div className="ml-4">
              <div className="relative inline-block w-12 h-6">
                <input
                  type="checkbox"
                  checked={true}
                  disabled
                  className="sr-only"
                />
                <div className="block bg-green-600 w-12 h-6 rounded-full opacity-60 cursor-not-allowed"></div>
                <div className="absolute left-1 top-1 bg-white w-4 h-4 rounded-full transition transform translate-x-6"></div>
              </div>
              <p className="text-xs text-gray-500 mt-1">Always On</p>
            </div>
          </div>
        </div>

        {/* Analytics Cookies */}
        <div className="bg-white border border-gray-200 rounded-lg p-6">
          <div className="flex items-start justify-between">
            <div className="flex items-start space-x-3">
              <BarChart3 className="h-6 w-6 text-purple-600 mt-0.5" />
              <div className="flex-1">
                <h3 className="text-lg font-semibold text-gray-900">Analytics Cookies</h3>
                <p className="text-gray-600 mt-1">
                  Help us understand how families use Dynasty to improve our services. All data is anonymized and never sold.
                </p>
                <p className="text-sm text-gray-500 mt-2">
                  Includes: Google Analytics, Firebase Analytics, usage patterns
                </p>
              </div>
            </div>
            <div className="ml-4">
              <button
                onClick={() => handleToggle('analytics')}
                className="relative inline-block w-12 h-6"
                role="switch"
                aria-checked={localPreferences.analytics}
              >
                <div className={`block w-12 h-6 rounded-full transition-colors ${
                  localPreferences.analytics ? 'bg-green-600' : 'bg-gray-300'
                }`}></div>
                <div className={`absolute left-1 top-1 bg-white w-4 h-4 rounded-full transition transform ${
                  localPreferences.analytics ? 'translate-x-6' : ''
                }`}></div>
              </button>
            </div>
          </div>
        </div>

        {/* Functionality Cookies */}
        <div className="bg-white border border-gray-200 rounded-lg p-6">
          <div className="flex items-start justify-between">
            <div className="flex items-start space-x-3">
              <Wrench className="h-6 w-6 text-yellow-600 mt-0.5" />
              <div className="flex-1">
                <h3 className="text-lg font-semibold text-gray-900">Functionality Cookies</h3>
                <p className="text-gray-600 mt-1">
                  Remember your preferences and provide enhanced features for a personalized experience.
                </p>
                <p className="text-sm text-gray-500 mt-2">
                  Includes: Theme preferences, language settings, display options, timezone
                </p>
              </div>
            </div>
            <div className="ml-4">
              <button
                onClick={() => handleToggle('functionality')}
                className="relative inline-block w-12 h-6"
                role="switch"
                aria-checked={localPreferences.functionality}
              >
                <div className={`block w-12 h-6 rounded-full transition-colors ${
                  localPreferences.functionality ? 'bg-green-600' : 'bg-gray-300'
                }`}></div>
                <div className={`absolute left-1 top-1 bg-white w-4 h-4 rounded-full transition transform ${
                  localPreferences.functionality ? 'translate-x-6' : ''
                }`}></div>
              </button>
            </div>
          </div>
        </div>

        {/* Third-Party Cookies */}
        <div className="bg-white border border-gray-200 rounded-lg p-6">
          <div className="flex items-start justify-between">
            <div className="flex items-start space-x-3">
              <CookieIcon className="h-6 w-6 text-red-600 mt-0.5" />
              <div className="flex-1">
                <h3 className="text-lg font-semibold text-gray-900">Third-Party Service Cookies</h3>
                <p className="text-gray-600 mt-1">
                  Enable features from external services that enhance your Dynasty experience.
                </p>
                <p className="text-sm text-gray-500 mt-2">
                  Includes: Google Maps (event locations), Stripe (payments), Sentry (error tracking)
                </p>
              </div>
            </div>
            <div className="ml-4">
              <button
                onClick={() => handleToggle('thirdParty')}
                className="relative inline-block w-12 h-6"
                role="switch"
                aria-checked={localPreferences.thirdParty}
              >
                <div className={`block w-12 h-6 rounded-full transition-colors ${
                  localPreferences.thirdParty ? 'bg-green-600' : 'bg-gray-300'
                }`}></div>
                <div className={`absolute left-1 top-1 bg-white w-4 h-4 rounded-full transition transform ${
                  localPreferences.thirdParty ? 'translate-x-6' : ''
                }`}></div>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Actions */}
      <div className="mt-8 flex items-center justify-between">
        <a
          href="/cookie-policy"
          target="_blank"
          rel="noopener noreferrer"
          className="text-green-600 hover:text-green-700 font-medium"
        >
          View Full Cookie Policy
        </a>
        
        <button
          onClick={handleSave}
          className="px-6 py-2 bg-green-600 text-white font-semibold rounded-lg hover:bg-green-700 transition-colors flex items-center space-x-2"
        >
          {saved ? (
            <>
              <Check className="h-5 w-5" />
              <span>Saved</span>
            </>
          ) : (
            <>
              <span>Save Preferences</span>
            </>
          )}
        </button>
      </div>

      {/* Info Box */}
      <div className="mt-8 bg-blue-50 border border-blue-200 rounded-lg p-4">
        <h4 className="text-sm font-semibold text-blue-900 mb-1">About Your Privacy</h4>
        <p className="text-sm text-blue-800">
          Dynasty is committed to protecting your privacy. We never sell your personal data, and all analytics are used solely to improve your family&apos;s experience on our platform. You can change these settings at any time.
        </p>
      </div>
    </div>
  );
}