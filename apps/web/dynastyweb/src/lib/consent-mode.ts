// Google Consent Mode Initialization Script
// This must be loaded before Google Analytics or any other Google services

export const consentModeScript = `
  // Define dataLayer and the gtag function.
  window.dataLayer = window.dataLayer || [];
  function gtag(){dataLayer.push(arguments);}

  // Default consent settings - deny all by default
  gtag('consent', 'default', {
    'ad_storage': 'denied',
    'ad_user_data': 'denied',
    'ad_personalization': 'denied',
    'analytics_storage': 'denied',
    'functionality_storage': 'denied',
    'personalization_storage': 'denied',
    'security_storage': 'granted' // Always granted for essential cookies
  });

  // Dynasty consent mode helper
  window.dynastyUpdateConsent = function(preferences) {
    gtag('consent', 'update', {
      'analytics_storage': preferences.analytics ? 'granted' : 'denied',
      'functionality_storage': preferences.functionality ? 'granted' : 'denied',
      'ad_storage': preferences.thirdParty ? 'granted' : 'denied',
      'ad_user_data': preferences.thirdParty ? 'granted' : 'denied',
      'ad_personalization': preferences.thirdParty ? 'granted' : 'denied',
      'personalization_storage': preferences.functionality ? 'granted' : 'denied'
    });
  };

  // Check for existing consent
  try {
    const storedConsent = localStorage.getItem('dynasty_cookie_consent');
    if (storedConsent) {
      const consent = JSON.parse(storedConsent);
      if (consent.preferences) {
        window.dynastyUpdateConsent(consent.preferences);
      }
    }
  } catch (e) {
    console.error('Error loading consent preferences:', e);
  }
`;