'use client';

import { useEffect } from 'react';
import FontSizeService from '@/services/FontSizeService';

export function FontSizeProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    // Initialize font size service
    const fontService = FontSizeService.getInstance();
    fontService.initialize();
  }, []);

  return <>{children}</>;
}