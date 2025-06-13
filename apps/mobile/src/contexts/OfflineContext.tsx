import React, { createContext, useContext, useEffect, useState, ReactNode, useRef, useCallback } from 'react';
import { networkService } from '../services/NetworkService';
import { syncService, SyncListener } from '../lib/syncService';
import { useAuth } from './AuthContext';
import { ConflictResolutionService } from '../services/ConflictResolutionService';
import { Alert } from 'react-native';
import { logger } from '../services/LoggingService';

interface OfflineContextType {
  isOnline: boolean;
  isSyncing: boolean;
  lastSyncTime: string | null;
  pendingOperationsCount: number;
  syncProgress: { current: number; total: number } | null;
  conflicts: any[];
  forceSync: () => Promise<void>;
  resolveConflict: (conflictId: string, strategy: string, mergedData?: any) => Promise<void>;
  getSyncStatus: () => {
    isOnline: boolean;
    isSyncing: boolean;
    lastSync: string | null;
    pendingOperations: number;
  };
}

const OfflineContext = createContext<OfflineContextType | undefined>(undefined);

export const useOffline = () => {
  const context = useContext(OfflineContext);
  if (!context) {
    throw new Error('useOffline must be used within an OfflineProvider');
  }
  return context;
};

interface OfflineProviderProps {
  children: ReactNode;
}

export const OfflineProvider: React.FC<OfflineProviderProps> = ({ children }) => {
  const { user } = useAuth();
  const [isOnline, setIsOnline] = useState(true);
  const [wasOffline, setWasOffline] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastSyncTime, setLastSyncTime] = useState<string | null>(null);
  const [pendingOperationsCount, setPendingOperationsCount] = useState(0);
  const [syncProgress, setSyncProgress] = useState<{ current: number; total: number } | null>(null);
  const [conflicts, setConflicts] = useState<any[]>([]);
  
  // Use refs for values that are used in callbacks but shouldn't trigger re-renders
  const isOnlineRef = useRef(isOnline);
  const isSyncingRef = useRef(isSyncing);
  const wasOfflineRef = useRef(wasOffline);

  // Keep refs in sync with state
  useEffect(() => {
    isOnlineRef.current = isOnline;
  }, [isOnline]);

  useEffect(() => {
    isSyncingRef.current = isSyncing;
  }, [isSyncing]);

  useEffect(() => {
    wasOfflineRef.current = wasOffline;
  }, [wasOffline]);
  
  const conflictService = ConflictResolutionService.getInstance();

  const updateSyncStatus = useCallback(() => {
    const status = syncService.getSyncStatus();
    setLastSyncTime(status.lastSync);
    setPendingOperationsCount(status.pendingOperations);
  }, [syncService]);

  useEffect(() => {
    // Subscribe to network status changes
    const unsubscribeNetwork = networkService.addListener((online, state) => {
      logger.debug('OfflineContext: Network status changed:', online);
      const previouslyOnline = isOnlineRef.current;
      setIsOnline(online);
      
      // Show alert when going offline
      if (!online && previouslyOnline) {
        setWasOffline(true);
        Alert.alert(
          'Offline Mode',
          'You are now offline. Changes will be saved locally and synced when you reconnect.',
          [{ text: 'OK' }]
        );
      } else if (online && wasOfflineRef.current && isSyncingRef.current === false) {
        // Only show "Back Online" if user was actually offline before
        setWasOffline(false);
        Alert.alert(
          'Back Online',
          'You are back online. Syncing your changes...',
          [{ text: 'OK' }]
        );
      }
    });

    // Subscribe to sync events
    const syncListener: SyncListener = {
      onSyncStart: () => {
        logger.debug('OfflineContext: Sync started');
        setIsSyncing(true);
        setSyncProgress(null);
      },
      onSyncComplete: (success, error) => {
        logger.debug('OfflineContext: Sync completed:', success);
        setIsSyncing(false);
        setSyncProgress(null);
        
        if (success) {
          setLastSyncTime(new Date().toISOString());
          updateSyncStatus();
        } else if (error) {
          Alert.alert(
            'Sync Failed',
            'Failed to sync your changes. Will retry automatically.',
            [{ text: 'OK' }]
          );
        }
      },
      onSyncProgress: (current, total) => {
        logger.debug(`OfflineContext: Sync progress ${current}/${total}`);
        setSyncProgress({ current, total });
      },
      onConflict: (conflict) => {
        logger.debug('OfflineContext: Conflict detected:', conflict);
        setConflicts(prev => [...prev, conflict]);
        
        Alert.alert(
          'Data Conflict',
          'Some of your changes conflict with server data. Please resolve them.',
          [
            { text: 'Later' },
            { 
              text: 'Resolve Now', 
              onPress: () => {
                // Navigate to conflict resolution screen
                // This would be handled by the app's navigation
              }
            }
          ]
        );
      }
    };

    const unsubscribeSync = syncService.addListener(syncListener);

    // Initialize and get initial status
    updateSyncStatus();

    return () => {
      unsubscribeNetwork();
      unsubscribeSync();
    };
  }, [user?.uid, updateSyncStatus]);

  const forceSync = async () => {
    if (!isOnline) {
      Alert.alert(
        'Offline',
        'Cannot sync while offline. Your changes will sync automatically when you reconnect.',
        [{ text: 'OK' }]
      );
      return;
    }

    try {
      await syncService.forceSync();
    } catch (error) {
      logger.error('OfflineContext: Force sync failed:', error);
      Alert.alert(
        'Sync Error',
        'Failed to sync. Please try again.',
        [{ text: 'OK' }]
      );
    }
  };

  const resolveConflict = async (conflictId: string, strategy: string, mergedData?: any) => {
    try {
      await conflictService.resolveConflict(conflictId, strategy as any, mergedData);
      
      // Remove from local conflicts list
      setConflicts(prev => prev.filter(c => c.id !== conflictId));
      
      // Trigger sync to apply resolution
      await forceSync();
    } catch (error) {
      logger.error('OfflineContext: Failed to resolve conflict:', error);
      Alert.alert(
        'Resolution Failed',
        'Failed to resolve conflict. Please try again.',
        [{ text: 'OK' }]
      );
    }
  };

  const getSyncStatus = () => {
    return syncService.getSyncStatus();
  };

  const value: OfflineContextType = {
    isOnline,
    isSyncing,
    lastSyncTime,
    pendingOperationsCount,
    syncProgress,
    conflicts,
    forceSync,
    resolveConflict,
    getSyncStatus
  };

  return (
    <OfflineContext.Provider value={value}>
      {children}
    </OfflineContext.Provider>
  );
};