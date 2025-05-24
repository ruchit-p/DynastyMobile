'use client';

import React from 'react';
import { useOffline } from '@/context/OfflineContext';
import { CloudOff, Wifi, WifiOff } from 'lucide-react';
import { cn } from '@/lib/utils';

export function OfflineIndicator() {
  const { isOnline, networkStatus, syncQueueSize } = useOffline();

  if (isOnline && syncQueueSize === 0) {
    return null; // Don't show indicator when online with no pending syncs
  }

  return (
    <div
      className={cn(
        'fixed bottom-4 left-4 z-50 flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium shadow-lg transition-all duration-300',
        {
          'bg-red-500 text-white': networkStatus === 'offline',
          'bg-yellow-500 text-white': networkStatus === 'slow',
          'bg-green-500 text-white': networkStatus === 'online' && syncQueueSize > 0,
        }
      )}
    >
      {networkStatus === 'offline' ? (
        <>
          <WifiOff className="h-4 w-4" />
          <span>Offline</span>
        </>
      ) : networkStatus === 'slow' ? (
        <>
          <Wifi className="h-4 w-4" />
          <span>Slow Connection</span>
        </>
      ) : (
        <>
          <CloudOff className="h-4 w-4" />
          <span>{syncQueueSize} pending sync{syncQueueSize !== 1 ? 's' : ''}</span>
        </>
      )}
    </div>
  );
}