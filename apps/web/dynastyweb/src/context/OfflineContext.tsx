'use client';

import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { networkMonitor, useNetworkStatus } from '@/services/NetworkMonitor';
import { syncQueue, useSyncQueue } from '@/services/SyncQueueService';
import { cacheService } from '@/services/CacheService';

interface OfflineContextType {
  isOnline: boolean;
  networkStatus: 'online' | 'offline' | 'slow';
  syncQueueSize: number;
  isProcessingSync: boolean;
  lastSyncTime: Date | null;
  forceSync: () => Promise<void>;
  clearCache: () => Promise<void>;
  clearSyncQueue: () => Promise<void>;
}

const OfflineContext = createContext<OfflineContextType | undefined>(undefined);

export function OfflineProvider({ children }: { children: React.ReactNode }) {
  const { status: networkStatus, isOnline } = useNetworkStatus();
  const { queueSize: syncQueueSize, isProcessing: isProcessingSync } = useSyncQueue();
  const [lastSyncTime, setLastSyncTime] = useState<Date | null>(null);

  // Initialize network monitoring
  useEffect(() => {
    networkMonitor.start();

    // Add sync callback
    const unsubscribe = networkMonitor.addSyncCallback(async () => {
      console.log('Network reconnected, syncing...');
      setLastSyncTime(new Date());
    });

    return () => {
      unsubscribe();
    };
  }, []);

  // Force sync operation
  const forceSync = useCallback(async () => {
    if (!isOnline) {
      throw new Error('Cannot sync while offline');
    }

    try {
      await syncQueue.processSyncQueue();
      setLastSyncTime(new Date());
    } catch (error) {
      console.error('Sync failed:', error);
      throw error;
    }
  }, [isOnline]);

  // Clear all cached data
  const clearCache = useCallback(async () => {
    cacheService.clear();
  }, []);

  // Clear sync queue
  const clearSyncQueue = useCallback(async () => {
    await syncQueue.clearQueue();
  }, []);

  // Register service worker
  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker
        .register('/firebase-messaging-sw.js')
        .then((registration) => {
          console.log('Service Worker registered:', registration);
        })
        .catch((error) => {
          console.error('Service Worker registration failed:', error);
        });
    }
  }, []);

  const value: OfflineContextType = {
    isOnline,
    networkStatus,
    syncQueueSize,
    isProcessingSync,
    lastSyncTime,
    forceSync,
    clearCache,
    clearSyncQueue
  };

  return (
    <OfflineContext.Provider value={value}>
      {children}
    </OfflineContext.Provider>
  );
}

export function useOffline() {
  const context = useContext(OfflineContext);
  if (!context) {
    throw new Error('useOffline must be used within OfflineProvider');
  }
  return context;
}