// Sync Queue Service for Dynasty Web App
// Manages offline operations and syncs when online

import React from 'react';
import { networkMonitor } from './NetworkMonitor';
import { errorHandler, ErrorSeverity } from './ErrorHandlingService';
import { httpsCallable } from 'firebase/functions';
import { functions } from '@/lib/firebase';

export interface SyncOperation {
  id: string;
  type: 'create' | 'update' | 'delete';
  collection: string;
  documentId?: string;
  data?: unknown;
  timestamp: number;
  retryCount: number;
  userId: string;
  metadata?: Record<string, unknown>;
}

export interface SyncResult {
  success: boolean;
  error?: string;
  conflictResolution?: 'client_wins' | 'server_wins' | 'merged';
}

class SyncQueueService {
  private static instance: SyncQueueService;
  private db?: IDBDatabase;
  private isProcessing = false;
  private maxRetries = 3;
  private syncInterval?: NodeJS.Timeout;

  private constructor() {
    this.initializeDatabase();
    this.setupNetworkListener();
  }

  static getInstance(): SyncQueueService {
    if (!SyncQueueService.instance) {
      SyncQueueService.instance = new SyncQueueService();
    }
    return SyncQueueService.instance;
  }

  private async initializeDatabase() {
    if (typeof window === 'undefined') return;

    try {
      const request = indexedDB.open('DynastySyncQueue', 1);

      request.onerror = () => {
        errorHandler.handleError(
          new Error('Failed to open sync queue database'),
          ErrorSeverity.HIGH
        );
      };

      request.onsuccess = () => {
        this.db = request.result;
        this.startPeriodicSync();
      };

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        
        if (!db.objectStoreNames.contains('operations')) {
          const store = db.createObjectStore('operations', { keyPath: 'id' });
          store.createIndex('timestamp', 'timestamp', { unique: false });
          store.createIndex('userId', 'userId', { unique: false });
          store.createIndex('retryCount', 'retryCount', { unique: false });
        }
      };
    } catch (error) {
      errorHandler.handleError(error, ErrorSeverity.HIGH, {
        action: 'sync-queue-init'
      });
    }
  }

  private setupNetworkListener() {
    // Sync when coming back online
    networkMonitor.addSyncCallback(async () => {
      await this.processSyncQueue();
    });
  }

  private startPeriodicSync() {
    // Process sync queue every 5 minutes if online
    this.syncInterval = setInterval(async () => {
      if (networkMonitor.isOnline()) {
        await this.processSyncQueue();
      }
    }, 5 * 60 * 1000) as unknown as NodeJS.Timeout;
  }

  async enqueueOperation(
    operation: Omit<SyncOperation, 'id' | 'timestamp' | 'retryCount'>
  ): Promise<string> {
    if (!this.db) {
      throw new Error('Sync queue database not initialized');
    }

    const id = `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const syncOp: SyncOperation = {
      ...operation,
      id,
      timestamp: Date.now(),
      retryCount: 0
    };

    try {
      const transaction = this.db.transaction(['operations'], 'readwrite');
      const store = transaction.objectStore('operations');
      await store.add(syncOp);

      // Try to sync immediately if online
      if (networkMonitor.isOnline()) {
        setTimeout(() => this.processSyncQueue(), 100);
      }

      return id;
    } catch (error) {
      errorHandler.handleError(error, ErrorSeverity.MEDIUM, {
        action: 'enqueue-sync-operation',
        context: { operation }
      });
      throw error;
    }
  }

  async processSyncQueue(): Promise<void> {
    if (this.isProcessing || !this.db || !networkMonitor.isOnline()) {
      return;
    }

    this.isProcessing = true;

    try {
      const operations = await this.getPendingOperations();
      
      for (const operation of operations) {
        try {
          const result = await this.processOperation(operation);
          
          if (result.success) {
            await this.removeOperation(operation.id);
          } else {
            await this.handleFailedOperation(operation, result.error);
          }
        } catch (error) {
          await this.handleFailedOperation(
            operation,
            error instanceof Error ? error.message : 'Unknown error'
          );
        }
      }
    } catch (error) {
      errorHandler.handleError(error, ErrorSeverity.MEDIUM, {
        action: 'process-sync-queue'
      });
    } finally {
      this.isProcessing = false;
    }
  }

  private async getPendingOperations(): Promise<SyncOperation[]> {
    if (!this.db) return [];

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(['operations'], 'readonly');
      const store = transaction.objectStore('operations');
      const request = store.getAll();

      request.onsuccess = () => {
        const operations = request.result as SyncOperation[];
        // Sort by timestamp to maintain order
        operations.sort((a, b) => a.timestamp - b.timestamp);
        resolve(operations);
      };

      request.onerror = () => reject(request.error);
    });
  }

  private async processOperation(operation: SyncOperation): Promise<SyncResult> {
    try {
      const processSyncQueue = httpsCallable(functions, 'processSyncQueue');
      const result = await processSyncQueue({
        operations: [operation]
      });

      const data = result.data as { results?: Array<{ success?: boolean; error?: string; conflictResolution?: string }> };
      return {
        success: data.results?.[0]?.success || false,
        error: data.results?.[0]?.error,
        conflictResolution: data.results?.[0]?.conflictResolution as 'client_wins' | 'server_wins' | 'merged' | undefined
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to process operation'
      };
    }
  }

  private async removeOperation(id: string): Promise<void> {
    if (!this.db) return;

    const transaction = this.db.transaction(['operations'], 'readwrite');
    const store = transaction.objectStore('operations');
    await store.delete(id);
  }

  private async handleFailedOperation(
    operation: SyncOperation,
    error?: string
  ): Promise<void> {
    if (!this.db) return;

    operation.retryCount++;

    if (operation.retryCount >= this.maxRetries) {
      // Move to dead letter queue or notify user
      errorHandler.handleError(
        new Error(`Sync operation failed after ${this.maxRetries} retries: ${error}`),
        ErrorSeverity.HIGH,
        {
          action: 'sync-operation-failed',
          context: { operation }
        }
      );
      await this.removeOperation(operation.id);
    } else {
      // Update retry count
      const transaction = this.db.transaction(['operations'], 'readwrite');
      const store = transaction.objectStore('operations');
      await store.put(operation);
    }
  }

  async getQueuedOperations(userId?: string): Promise<SyncOperation[]> {
    const operations = await this.getPendingOperations();
    
    if (userId) {
      return operations.filter(op => op.userId === userId);
    }
    
    return operations;
  }

  async clearQueue(userId?: string): Promise<void> {
    if (!this.db) return;

    const operations = await this.getQueuedOperations(userId);
    const transaction = this.db.transaction(['operations'], 'readwrite');
    const store = transaction.objectStore('operations');

    for (const op of operations) {
      await store.delete(op.id);
    }
  }

  async getQueueSize(): Promise<number> {
    const operations = await this.getPendingOperations();
    return operations.length;
  }

  getIsProcessing(): boolean {
    return this.isProcessing;
  }

  destroy() {
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
    }
    if (this.db) {
      this.db.close();
    }
  }
}

// Export singleton instance
export const syncQueue = SyncQueueService.getInstance();

// React hook for sync queue status
export function useSyncQueue() {
  const [queueSize, setQueueSize] = React.useState(0);
  const [isProcessing, setIsProcessing] = React.useState(false);

  React.useEffect(() => {
    const syncQueue = SyncQueueService.getInstance();

    const updateStatus = async () => {
      const size = await syncQueue.getQueueSize();
      setQueueSize(size);
      setIsProcessing(syncQueue.getIsProcessing());
    };

    // Update status initially
    updateStatus();

    // Update periodically
    const interval = setInterval(updateStatus, 5000);

    return () => clearInterval(interval);
  }, []);

  return {
    queueSize,
    isProcessing,
    hasPendingOperations: queueSize > 0
  };
}