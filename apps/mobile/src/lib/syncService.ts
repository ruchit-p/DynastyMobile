import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo, { NetInfoState } from '@react-native-community/netinfo';
import DeviceInfo from 'react-native-device-info';
import { getFirebaseDb, getFirebaseFunctions } from './firebase';
import { callFirebaseFunction } from './errorUtils';
import { FirebaseFirestoreTypes } from '@react-native-firebase/firestore';
import { SyncDatabase } from '../database/SyncDatabase';
import { 
  SyncOperation, 
  OperationType, 
  EntityType,
  SyncStatus,
  LocalSyncOperation 
} from '../database/schema';

// Constants
const SYNC_STORAGE_KEY = '@dynasty_sync_state';
const SYNC_INTERVAL = 30000; // 30 seconds
const MAX_RETRY_ATTEMPTS = 3;
const BATCH_SIZE = 50;

interface SyncState {
  lastSyncTimestamp: string;
  syncVersion: number;
  pendingOperations: number;
  deviceId: string;
  isSyncing: boolean;
}

interface NetworkListener {
  unsubscribe: () => void;
}

export interface SyncListener {
  onSyncStart?: () => void;
  onSyncComplete?: (success: boolean, error?: Error) => void;
  onSyncProgress?: (processed: number, total: number) => void;
  onConflict?: (conflict: any) => void;
}

class SyncService {
  private static instance: SyncService;
  private db: SyncDatabase;
  private deviceId: string = '';
  private syncState: SyncState | null = null;
  private networkListener: NetworkListener | null = null;
  private syncInterval: NodeJS.Timeout | null = null;
  private isSyncing = false;
  private listeners: Set<SyncListener> = new Set();
  private isInitialized = false;

  private constructor() {
    this.db = SyncDatabase.getInstance();
  }

  static getInstance(): SyncService {
    if (!SyncService.instance) {
      SyncService.instance = new SyncService();
    }
    return SyncService.instance;
  }

  /**
   * Initialize the sync service
   */
  async initialize(userId: string): Promise<void> {
    if (this.isInitialized) {
      console.log('SyncService: Already initialized');
      return;
    }

    try {
      console.log('SyncService: Initializing...');
      
      // Get device ID
      this.deviceId = await DeviceInfo.getUniqueId();
      console.log('SyncService: Device ID:', this.deviceId);
      
      // Load sync state
      await this.loadSyncState(userId);
      
      // Initialize database
      await this.db.init();
      
      // Set up network monitoring
      this.setupNetworkMonitoring();
      
      // Start sync interval
      this.startSyncInterval();
      
      this.isInitialized = true;
      console.log('SyncService: Initialization complete');
      
      // Perform initial sync if online
      const netState = await NetInfo.fetch();
      if (netState.isConnected) {
        this.sync();
      }
    } catch (error) {
      console.error('SyncService: Initialization failed:', error);
      throw error;
    }
  }

  /**
   * Clean up and stop sync service
   */
  async cleanup(): Promise<void> {
    console.log('SyncService: Cleaning up...');
    
    if (this.networkListener) {
      this.networkListener.unsubscribe();
      this.networkListener = null;
    }
    
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
      this.syncInterval = null;
    }
    
    this.listeners.clear();
    this.isInitialized = false;
  }

  /**
   * Add a sync listener
   */
  addListener(listener: SyncListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /**
   * Queue an operation for sync
   */
  async queueOperation(
    operation: OperationType,
    entityType: EntityType,
    entityId: string,
    data: any,
    userId: string
  ): Promise<void> {
    try {
      const syncOp: LocalSyncOperation = {
        id: `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        userId,
        deviceId: this.deviceId,
        operationType: operation,
        entityType,
        entityId,
        data: JSON.stringify(data),
        localTimestamp: Date.now(),
        status: SyncStatus.PENDING,
        retryCount: 0,
        error: null
      };
      
      await this.db.addToSyncQueue(syncOp);
      console.log('SyncService: Operation queued:', syncOp.id);
      
      // Update pending count
      if (this.syncState) {
        this.syncState.pendingOperations++;
        await this.saveSyncState();
      }
      
      // Try to sync immediately if online
      const netState = await NetInfo.fetch();
      if (netState.isConnected && !this.isSyncing) {
        this.sync();
      }
    } catch (error) {
      console.error('SyncService: Failed to queue operation:', error);
      throw error;
    }
  }

  /**
   * Perform sync operation
   */
  async sync(): Promise<void> {
    if (this.isSyncing) {
      console.log('SyncService: Sync already in progress');
      return;
    }
    
    // Check network
    const netState = await NetInfo.fetch();
    if (!netState.isConnected) {
      console.log('SyncService: No network connection, skipping sync');
      return;
    }
    
    this.isSyncing = true;
    this.notifyListeners('onSyncStart');
    
    try {
      console.log('SyncService: Starting sync...');
      
      // Get pending operations
      const pendingOps = await this.db.getPendingOperations(BATCH_SIZE);
      console.log(`SyncService: Found ${pendingOps.length} pending operations`);
      
      if (pendingOps.length === 0) {
        this.isSyncing = false;
        this.notifyListeners('onSyncComplete', true);
        return;
      }
      
      // Process operations in batches
      let processed = 0;
      const errors: Error[] = [];
      
      for (const op of pendingOps) {
        try {
          await this.processSyncOperation(op);
          processed++;
          this.notifyListeners('onSyncProgress', processed, pendingOps.length);
        } catch (error) {
          console.error('SyncService: Operation failed:', op.id, error);
          errors.push(error as Error);
          
          // Update retry count
          await this.db.updateSyncOperationStatus(
            op.id,
            SyncStatus.FAILED,
            (error as Error).message
          );
        }
      }
      
      // Update sync state
      if (this.syncState) {
        this.syncState.lastSyncTimestamp = new Date().toISOString();
        this.syncState.pendingOperations = await this.db.getPendingOperationsCount();
        await this.saveSyncState();
      }
      
      console.log(`SyncService: Sync complete. Processed: ${processed}/${pendingOps.length}`);
      this.notifyListeners('onSyncComplete', errors.length === 0);
      
    } catch (error) {
      console.error('SyncService: Sync failed:', error);
      this.notifyListeners('onSyncComplete', false, error as Error);
    } finally {
      this.isSyncing = false;
    }
  }

  /**
   * Process a single sync operation
   */
  private async processSyncOperation(op: LocalSyncOperation): Promise<void> {
    try {
      console.log(`SyncService: Processing operation ${op.id}`);
      
      // Call Firebase sync function
      const result = await callFirebaseFunction('enqueueSyncOperation', {
        operation: op.operationType,
        entityType: op.entityType,
        entityId: op.entityId,
        data: JSON.parse(op.data),
        deviceId: this.deviceId,
        timestamp: op.localTimestamp
      });
      
      if (result.success) {
        // Mark as synced
        await this.db.markOperationSynced(op.id);
        console.log(`SyncService: Operation ${op.id} synced successfully`);
      } else if (result.conflict) {
        // Handle conflict
        console.log(`SyncService: Conflict detected for operation ${op.id}`);
        await this.handleConflict(op, result.conflict);
      } else {
        throw new Error(result.error || 'Unknown sync error');
      }
    } catch (error) {
      // Check if we should retry
      if (op.retryCount < MAX_RETRY_ATTEMPTS) {
        await this.db.incrementRetryCount(op.id);
        throw error; // Will be retried in next sync
      } else {
        // Max retries reached, mark as failed
        await this.db.updateSyncOperationStatus(
          op.id,
          SyncStatus.FAILED,
          'Max retries exceeded'
        );
        throw error;
      }
    }
  }

  /**
   * Handle sync conflicts
   */
  private async handleConflict(op: LocalSyncOperation, conflict: any): Promise<void> {
    // Log conflict
    await this.db.logConflict(
      op.entityType,
      op.entityId,
      JSON.parse(op.data),
      conflict.serverData,
      'auto'
    );
    
    // Notify listeners
    this.notifyListeners('onConflict', conflict);
    
    // For now, mark operation as conflict
    await this.db.updateSyncOperationStatus(
      op.id,
      SyncStatus.CONFLICT,
      'Conflict detected'
    );
  }

  /**
   * Set up network monitoring
   */
  private setupNetworkMonitoring(): void {
    this.networkListener = NetInfo.addEventListener((state: NetInfoState) => {
      console.log('SyncService: Network state changed:', state.isConnected);
      
      if (state.isConnected && !this.isSyncing) {
        // Network reconnected, trigger sync
        console.log('SyncService: Network reconnected, triggering sync');
        this.sync();
      }
    });
  }

  /**
   * Start periodic sync
   */
  private startSyncInterval(): void {
    this.syncInterval = setInterval(() => {
      if (!this.isSyncing) {
        this.sync();
      }
    }, SYNC_INTERVAL);
  }

  /**
   * Load sync state from storage
   */
  private async loadSyncState(userId: string): Promise<void> {
    try {
      const key = `${SYNC_STORAGE_KEY}_${userId}`;
      const stored = await AsyncStorage.getItem(key);
      
      if (stored) {
        this.syncState = JSON.parse(stored);
      } else {
        // Initialize new sync state
        this.syncState = {
          lastSyncTimestamp: new Date().toISOString(),
          syncVersion: 1,
          pendingOperations: 0,
          deviceId: this.deviceId,
          isSyncing: false
        };
        await this.saveSyncState();
      }
    } catch (error) {
      console.error('SyncService: Failed to load sync state:', error);
    }
  }

  /**
   * Save sync state to storage
   */
  private async saveSyncState(): Promise<void> {
    if (!this.syncState) return;
    
    try {
      const key = `${SYNC_STORAGE_KEY}_${this.syncState.deviceId}`;
      await AsyncStorage.setItem(key, JSON.stringify(this.syncState));
    } catch (error) {
      console.error('SyncService: Failed to save sync state:', error);
    }
  }

  /**
   * Notify all listeners
   */
  private notifyListeners(
    event: keyof SyncListener,
    ...args: any[]
  ): void {
    this.listeners.forEach(listener => {
      const handler = listener[event];
      if (handler) {
        handler(...args);
      }
    });
  }

  /**
   * Get sync status
   */
  getSyncStatus(): {
    isOnline: boolean;
    isSyncing: boolean;
    lastSync: string | null;
    pendingOperations: number;
  } {
    return {
      isOnline: false, // Will be updated by network listener
      isSyncing: this.isSyncing,
      lastSync: this.syncState?.lastSyncTimestamp || null,
      pendingOperations: this.syncState?.pendingOperations || 0
    };
  }

  /**
   * Force sync (useful for pull-to-refresh)
   */
  async forceSync(): Promise<void> {
    console.log('SyncService: Force sync requested');
    await this.sync();
  }

  /**
   * Clear all sync data (for logout)
   */
  async clearSyncData(): Promise<void> {
    console.log('SyncService: Clearing sync data');
    await this.db.clearSyncQueue();
    await AsyncStorage.removeItem(`${SYNC_STORAGE_KEY}_${this.deviceId}`);
    this.syncState = null;
  }
}

// Export singleton instance
export const syncService = SyncService.getInstance();