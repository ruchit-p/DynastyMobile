'use client';

import { FpjsProvider } from '@fingerprintjs/fingerprintjs-pro-react';
import { ReactNode } from 'react';

const FINGERPRINT_API_KEY = process.env.NEXT_PUBLIC_FINGERPRINT_API_KEY || '';
const FINGERPRINT_ENDPOINT = process.env.NEXT_PUBLIC_FINGERPRINT_ENDPOINT || 'https://api.fpjs.io';
const FINGERPRINT_REGION = process.env.NEXT_PUBLIC_FINGERPRINT_REGION || 'global';

interface FingerprintProviderProps {
  children: ReactNode;
}

export function FingerprintProvider({ children }: FingerprintProviderProps) {
  if (!FINGERPRINT_API_KEY) {
    console.warn('FingerprintJS API key not configured');
    return <>{children}</>;
  }

  return (
    <FpjsProvider
      loadOptions={{
        apiKey: FINGERPRINT_API_KEY,
        endpoint: FINGERPRINT_ENDPOINT,
        region: FINGERPRINT_REGION as 'us' | 'eu' | 'ap',
      }}
      cacheLocation="memory"
      cacheTimeInSeconds={60 * 60} // 1 hour
    >
      {children}
    </FpjsProvider>
  );
}