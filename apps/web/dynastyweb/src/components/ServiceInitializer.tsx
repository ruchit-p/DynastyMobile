'use client';

import { useEffect } from 'react';
import { useCSRFClient } from '@/context/CSRFContext';
import { notificationService } from '@/services/NotificationService';
import { syncQueue } from '@/services/SyncQueueService';
import { vaultService } from '@/services/VaultService';
import { setEventUtilsCSRFClient } from '@/utils/eventUtils';
import { setStoryUtilsCSRFClient } from '@/utils/storyUtils';
import { keyBackupService } from '@/services/encryption/KeyBackupService';
import { setNotificationUtilsCSRFClient } from '@/utils/notificationUtils';
import { setFunctionUtilsCSRFClient } from '@/utils/functionUtils';

/**
 * ServiceInitializer component initializes all services with the CSRF client
 * This should be placed high in the component tree, after CSRFProvider
 */
export function ServiceInitializer({ children }: { children: React.ReactNode }) {
  const { csrfClient, isReady } = useCSRFClient();

  useEffect(() => {
    if (isReady && csrfClient) {
      // Initialize all services with CSRF client
      notificationService.setCSRFClient(csrfClient);
      vaultService.setCSRFClient(csrfClient);
      syncQueue.setCSRFClient(csrfClient);
      keyBackupService.setCSRFClient(csrfClient);
      
      // Initialize utility functions with CSRF client
      setEventUtilsCSRFClient(csrfClient);
      setStoryUtilsCSRFClient(csrfClient);
      setNotificationUtilsCSRFClient(csrfClient);
      setFunctionUtilsCSRFClient(csrfClient);
      
      console.log('All services initialized with CSRF client');
    }
  }, [csrfClient, isReady]);

  return <>{children}</>;
}