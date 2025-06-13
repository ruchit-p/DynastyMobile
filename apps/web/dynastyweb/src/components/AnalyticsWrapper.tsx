'use client';

import dynamic from 'next/dynamic';
import { useEffect, useState } from 'react';

// Dynamically import analytics with error handling
const Analytics = dynamic(() => import('@vercel/analytics/next').then(mod => mod.Analytics), {
  ssr: false,
  loading: () => null,
});

const SpeedInsights = dynamic(
  () => import('@vercel/speed-insights/next').then(mod => mod.SpeedInsights),
  {
    ssr: false,
    loading: () => null,
  }
);

export function AnalyticsWrapper() {
  const [analyticsBlocked, setAnalyticsBlocked] = useState(false);

  // Allow disabling analytics via environment variable
  const analyticsEnabled = process.env.NEXT_PUBLIC_ENABLE_ANALYTICS !== 'false';

  useEffect(() => {
    if (!analyticsEnabled) {
      console.log('[Analytics] Disabled via environment variable');
      return;
    }
    // Check if analytics scripts are blocked
    const checkAnalytics = () => {
      // Check for common ad blocker indicators
      const testUrl = '/_vercel/insights/script.js';

      fetch(testUrl, { method: 'HEAD' })
        .then(() => {
          console.log('[Analytics] Scripts loaded successfully');
        })
        .catch(() => {
          console.warn('[Analytics] Scripts blocked by client - this is normal with ad blockers');
          setAnalyticsBlocked(true);
        });
    };

    // Delay check to ensure scripts have time to load
    const timer = setTimeout(checkAnalytics, 2000);
    return () => clearTimeout(timer);
  }, [analyticsEnabled]);

  // If analytics are disabled or blocked, render nothing silently
  if (!analyticsEnabled || analyticsBlocked) {
    return null;
  }

  return (
    <>
      <Analytics
        // Use proxy route to bypass blockers
        beforeSend={event => {
          // Optional: Add custom logic here
          return event;
        }}
      />
      <SpeedInsights />
    </>
  );
}
