'use client';

import React from 'react';
import { useOffline } from '@/context/OfflineContext';
import { RefreshCw, Check, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';

interface SyncStatusProps {
  className?: string;
  showDetails?: boolean;
}

export function SyncStatus({ className, showDetails = false }: SyncStatusProps) {
  const { 
    isOnline, 
    syncQueueSize, 
    isProcessingSync, 
    lastSyncTime,
    forceSync 
  } = useOffline();

  const handleSync = async () => {
    if (!isOnline || isProcessingSync) return;
    
    try {
      await forceSync();
    } catch (error) {
      console.error('Sync failed:', error);
    }
  };

  return (
    <div className={cn('flex items-center gap-2', className)}>
      <button
        onClick={handleSync}
        disabled={!isOnline || isProcessingSync}
        className={cn(
          'flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium transition-colors',
          {
            'bg-gray-100 text-gray-600 hover:bg-gray-200': isOnline && !isProcessingSync,
            'bg-gray-50 text-gray-400 cursor-not-allowed': !isOnline || isProcessingSync,
          }
        )}
      >
        <RefreshCw 
          className={cn('h-3 w-3', {
            'animate-spin': isProcessingSync
          })} 
        />
        {isProcessingSync ? 'Syncing...' : 'Sync'}
      </button>

      {showDetails && (
        <div className="flex items-center gap-2 text-xs text-gray-500">
          {syncQueueSize > 0 ? (
            <>
              <span className="flex items-center gap-1">
                <X className="h-3 w-3 text-red-500" />
                {syncQueueSize} pending
              </span>
            </>
          ) : (
            <>
              <Check className="h-3 w-3 text-green-500" />
              <span>All synced</span>
            </>
          )}
          
          {lastSyncTime && (
            <span className="text-gray-400">
              • Last sync: {format(lastSyncTime, 'HH:mm')}
            </span>
          )}
        </div>
      )}
    </div>
  );
}