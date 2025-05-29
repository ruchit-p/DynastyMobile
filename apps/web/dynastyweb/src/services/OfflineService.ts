// MARK: - Offline Service for Web
/**
 * Comprehensive offline capabilities service matching mobile app functionality
 * Handles service workers, background sync, and offline data management
 */

import { openDB, DBSchema, IDBPDatabase } from 'idb';
import { Workbox } from 'workbox-window';

// MARK: - Types
export interface OfflineAction {
  id: string;
  type: 'message' | 'reaction' | 'media_upload' | 'profile_update' | 'vault_update';
  data: Record<string, unknown>;
  timestamp: number;
  retryCount: number;
  maxRetries: number;
  priority: 'high' | 'medium' | 'low';
}


export interface CachedData {
  key: string;
  data: unknown;
  timestamp: number;
  expiry?: number;
  tags: string[];
}

export interface OfflineConfig {
  maxCacheSize: number; // bytes
  maxOfflineActions: number;
  syncRetryDelay: number; // milliseconds
  enableBackgroundSync: boolean;
  enableMediaCaching: boolean;
}

// MARK: - Database Schema
interface DynastyOfflineDB extends DBSchema {
  actions: {
    key: string;
    value: OfflineAction;
    indexes: { 'by-type': string; 'by-timestamp': number; 'by-priority': string };
  };
  cache: {
    key: string;
    value: CachedData;
    indexes: { 'by-timestamp': number; 'by-tags': string };
  };
  media: {
    key: string;
    value: { id: string; blob: Blob; metadata: Record<string, unknown>; timestamp: number };
    indexes: { 'by-timestamp': number };
  };
}

// MARK: - Offline Service Implementation
export class OfflineService {
  private db: IDBPDatabase<DynastyOfflineDB> | null = null;
  private workbox: Workbox | null = null;
  private isOnline: boolean = navigator.onLine;
  private syncQueue: OfflineAction[] = [];
  private syncInProgress: boolean = false;
  
  private config: OfflineConfig = {
    maxCacheSize: 50 * 1024 * 1024, // 50MB
    maxOfflineActions: 1000,
    syncRetryDelay: 5000,
    enableBackgroundSync: true,
    enableMediaCaching: true
  };

  private onlineCallbacks: Set<() => void> = new Set();
  private offlineCallbacks: Set<() => void> = new Set();
  private syncCallbacks: Set<(action: OfflineAction) => void> = new Set();

  constructor(config?: Partial<OfflineConfig>) {
    this.config = { ...this.config, ...config };
    this.initialize();
  }

  // MARK: - Initialization
  private async initialize(): Promise<void> {
    try {
      // Initialize database
      await this.initializeDatabase();
      
      // Initialize service worker
      await this.initializeServiceWorker();
      
      // Setup network listeners
      this.setupNetworkListeners();
      
      // Process pending sync queue
      if (this.isOnline) {
        this.processSyncQueue();
      }

      console.log('[Offline] Service initialized successfully');
    } catch (error) {
      console.error('[Offline] Failed to initialize service:', error);
      throw new Error('Failed to initialize offline service');
    }
  }

  private async initializeDatabase(): Promise<void> {
    try {
      this.db = await openDB<DynastyOfflineDB>('dynasty-offline', 1, {
        upgrade(db) {
          // Actions store
          const actionsStore = db.createObjectStore('actions', { keyPath: 'id' });
          actionsStore.createIndex('by-type', 'type');
          actionsStore.createIndex('by-timestamp', 'timestamp');
          actionsStore.createIndex('by-priority', 'priority');


          // Cache store
          const cacheStore = db.createObjectStore('cache', { keyPath: 'key' });
          cacheStore.createIndex('by-timestamp', 'timestamp');
          cacheStore.createIndex('by-tags', 'tags', { multiEntry: true });

          // Media store
          const mediaStore = db.createObjectStore('media', { keyPath: 'id' });
          mediaStore.createIndex('by-timestamp', 'timestamp');
        }
      });

      console.log('[Offline] Database initialized');
    } catch (error) {
      console.error('[Offline] Failed to initialize database:', error);
      throw error;
    }
  }

  private async initializeServiceWorker(): Promise<void> {
    try {
      if ('serviceWorker' in navigator && this.config.enableBackgroundSync) {
        this.workbox = new Workbox('/sw.js');

        // Listen for service worker messages
        this.workbox.addEventListener('message', (event) => {
          if (event.data.type === 'BACKGROUND_SYNC') {
            this.handleBackgroundSync(event.data.payload);
          }
        });

        // Register service worker
        await this.workbox.register();
        console.log('[Offline] Service worker registered');
      }
    } catch (error) {
      console.error('[Offline] Failed to register service worker:', error);
    }
  }

  private setupNetworkListeners(): void {
    window.addEventListener('online', this.handleOnline.bind(this));
    window.addEventListener('offline', this.handleOffline.bind(this));
  }

  // MARK: - Network Status Management
  private handleOnline(): void {
    this.isOnline = true;
    console.log('[Offline] Network online - starting sync');
    
    // Notify listeners
    for (const callback of this.onlineCallbacks) {
      callback();
    }

    // Process sync queue
    this.processSyncQueue();
  }

  private handleOffline(): void {
    this.isOnline = false;
    console.log('[Offline] Network offline - enabling offline mode');
    
    // Notify listeners
    for (const callback of this.offlineCallbacks) {
      callback();
    }
  }

  // MARK: - Offline Actions Management
  /**
   * Queue an action for later sync when online
   */
  async queueAction(action: Omit<OfflineAction, 'id' | 'timestamp' | 'retryCount'>): Promise<string> {
    try {
      if (!this.db) {
        throw new Error('Database not initialized');
      }

      const offlineAction: OfflineAction = {
        ...action,
        id: this.generateActionId(),
        timestamp: Date.now(),
        retryCount: 0
      };

      // Store in database
      await this.db.add('actions', offlineAction);
      
      // Add to sync queue
      this.syncQueue.push(offlineAction);

      // Try to sync immediately if online
      if (this.isOnline && !this.syncInProgress) {
        this.processSyncQueue();
      }

      console.log(`[Offline] Action queued: ${offlineAction.type} (${offlineAction.id})`);
      return offlineAction.id;

    } catch (error) {
      console.error('[Offline] Failed to queue action:', error);
      throw new Error('Failed to queue offline action');
    }
  }

  /**
   * Process the sync queue
   */
  private async processSyncQueue(): Promise<void> {
    if (this.syncInProgress || !this.isOnline || !this.db) {
      return;
    }

    this.syncInProgress = true;

    try {
      // Get all pending actions
      const pendingActions = await this.db.getAllFromIndex('actions', 'by-timestamp');
      
      // Sort by priority and timestamp
      const sortedActions = pendingActions.sort((a, b) => {
        const priorityOrder = { high: 0, medium: 1, low: 2 };
        const priorityDiff = priorityOrder[a.priority] - priorityOrder[b.priority];
        return priorityDiff !== 0 ? priorityDiff : a.timestamp - b.timestamp;
      });

      // Process each action
      for (const action of sortedActions) {
        try {
          await this.syncAction(action);
          
          // Remove from database on success
          await this.db.delete('actions', action.id);
          
          // Notify sync callbacks
          for (const callback of this.syncCallbacks) {
            callback(action);
          }

        } catch (error) {
          console.error(`[Offline] Failed to sync action ${action.id}:`, error);
          
          // Increment retry count
          action.retryCount++;
          
          if (action.retryCount >= action.maxRetries) {
            // Mark as failed and remove
            await this.db.delete('actions', action.id);
            console.warn(`[Offline] Action ${action.id} exceeded max retries and was removed`);
          } else {
            // Update retry count
            await this.db.put('actions', action);
          }
        }

        // Small delay between actions
        await new Promise(resolve => setTimeout(resolve, 100));
      }

    } catch (error) {
      console.error('[Offline] Error processing sync queue:', error);
    } finally {
      this.syncInProgress = false;
    }
  }

  /**
   * Sync individual action
   */
  private async syncAction(action: OfflineAction): Promise<void> {
    switch (action.type) {
      case 'message':
        await this.syncMessage(action);
        break;
      case 'reaction':
        await this.syncReaction(action);
        break;
      case 'media_upload':
        await this.syncMediaUpload(action);
        break;
      case 'profile_update':
        await this.syncProfileUpdate(action);
        break;
      case 'vault_update':
        await this.syncVaultUpdate(action);
        break;
      default:
        throw new Error(`Unknown action type: ${action.type}`);
    }
  }

  // MARK: - Specific Sync Handlers
  private async syncMessage(action: OfflineAction): Promise<void> {
    // Implementation would call actual API to send message
    console.log(`[Offline] Syncing message: ${action.id}`);
    
    // Simulate API call
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // TODO: Implement message status updates
    // The database schema doesn't include a 'messages' store yet
    // if (this.db && action.data.messageId) {
    //   const message = await this.db.get('messages', action.data.messageId);
    //   if (message) {
    //     message.status = 'sent';
    //     await this.db.put('messages', message);
    //   }
    // }
  }

  private async syncReaction(action: OfflineAction): Promise<void> {
    console.log(`[Offline] Syncing reaction: ${action.id}`);
    // Implementation would call actual API
    await new Promise(resolve => setTimeout(resolve, 500));
  }

  private async syncMediaUpload(action: OfflineAction): Promise<void> {
    console.log(`[Offline] Syncing media upload: ${action.id}`);
    // Implementation would upload media to storage
    await new Promise(resolve => setTimeout(resolve, 2000));
  }

  private async syncProfileUpdate(action: OfflineAction): Promise<void> {
    console.log(`[Offline] Syncing profile update: ${action.id}`);
    // Implementation would update user profile
    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  private async syncVaultUpdate(action: OfflineAction): Promise<void> {
    console.log(`[Offline] Syncing vault update: ${action.id}`);
    // Implementation would sync vault changes
    await new Promise(resolve => setTimeout(resolve, 1500));
  }

  // MARK: - Offline Messages

  // MARK: - Cache Management
  /**
   * Cache data with expiry
   */
  async cacheData(key: string, data: unknown, tags: string[] = [], expiry?: number): Promise<void> {
    try {
      if (!this.db) {
        return;
      }

      const cachedData: CachedData = {
        key,
        data,
        timestamp: Date.now(),
        expiry,
        tags
      };

      await this.db.put('cache', cachedData);
      
      // Clean up expired cache
      this.cleanupExpiredCache();

    } catch (error) {
      console.error('[Offline] Failed to cache data:', error);
    }
  }

  /**
   * Get cached data
   */
  async getCachedData(key: string): Promise<unknown | null> {
    try {
      if (!this.db) {
        return null;
      }

      const cached = await this.db.get('cache', key);
      
      if (!cached) {
        return null;
      }

      // Check expiry
      if (cached.expiry && Date.now() > cached.expiry) {
        await this.db.delete('cache', key);
        return null;
      }

      return cached.data;
    } catch (error) {
      console.error('[Offline] Failed to get cached data:', error);
      return null;
    }
  }

  /**
   * Clear cache by tags
   */
  async clearCacheByTags(tags: string[]): Promise<void> {
    try {
      if (!this.db) {
        return;
      }

      const tx = this.db.transaction('cache', 'readwrite');
      const index = tx.store.index('by-tags');

      for (const tag of tags) {
        const entries = await index.getAll(tag);
        for (const entry of entries) {
          await tx.store.delete(entry.key);
        }
      }

      await tx.done;
    } catch (error) {
      console.error('[Offline] Failed to clear cache by tags:', error);
    }
  }

  // MARK: - Media Caching
  /**
   * Cache media file
   */
  async cacheMedia(id: string, blob: Blob, metadata: Record<string, unknown>): Promise<void> {
    try {
      if (!this.db || !this.config.enableMediaCaching) {
        return;
      }

      await this.db.put('media', {
        id,
        blob,
        metadata,
        timestamp: Date.now()
      });

      console.log(`[Offline] Media cached: ${id}`);
    } catch (error) {
      console.error('[Offline] Failed to cache media:', error);
    }
  }

  /**
   * Get cached media
   */
  async getCachedMedia(id: string): Promise<{ blob: Blob; metadata: Record<string, unknown> } | null> {
    try {
      if (!this.db) {
        return null;
      }

      const cached = await this.db.get('media', id);
      return cached ? { blob: cached.blob, metadata: cached.metadata } : null;
    } catch (error) {
      console.error('[Offline] Failed to get cached media:', error);
      return null;
    }
  }

  // MARK: - Background Sync
  private async handleBackgroundSync(payload: Record<string, unknown>): Promise<void> {
    console.log('[Offline] Handling background sync:', payload);
    
    // Process specific background sync events
    switch (payload.type) {
      case 'message-sync':
        await this.processSyncQueue();
        break;
      case 'cache-cleanup':
        await this.cleanupExpiredCache();
        break;
      default:
        console.log('[Offline] Unknown background sync type:', payload.type);
    }
  }

  // MARK: - Cleanup
  private async cleanupExpiredCache(): Promise<void> {
    try {
      if (!this.db) {
        return;
      }

      const now = Date.now();
      const tx = this.db.transaction('cache', 'readwrite');
      const store = tx.store;
      
      let cursor = await store.openCursor();
      
      while (cursor) {
        const cached = cursor.value;
        
        if (cached.expiry && now > cached.expiry) {
          await cursor.delete();
        }
        
        cursor = await cursor.continue();
      }

      await tx.done;
    } catch (error) {
      console.error('[Offline] Failed to cleanup expired cache:', error);
    }
  }

  // MARK: - Event Listeners
  /**
   * Add online event listener
   */
  onOnline(callback: () => void): () => void {
    this.onlineCallbacks.add(callback);
    return () => this.onlineCallbacks.delete(callback);
  }

  /**
   * Add offline event listener
   */
  onOffline(callback: () => void): () => void {
    this.offlineCallbacks.add(callback);
    return () => this.offlineCallbacks.delete(callback);
  }

  /**
   * Add sync event listener
   */
  onSync(callback: (action: OfflineAction) => void): () => void {
    this.syncCallbacks.add(callback);
    return () => this.syncCallbacks.delete(callback);
  }

  // MARK: - Utilities
  private generateActionId(): string {
    return `action_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Get network status
   */
  isNetworkOnline(): boolean {
    return this.isOnline;
  }

  /**
   * Get sync queue status
   */
  async getSyncQueueStatus(): Promise<{
    pending: number;
    failed: number;
    totalSize: number;
  }> {
    try {
      if (!this.db) {
        return { pending: 0, failed: 0, totalSize: 0 };
      }

      const actions = await this.db.getAll('actions');
      const pending = actions.filter(a => a.retryCount < a.maxRetries).length;
      const failed = actions.filter(a => a.retryCount >= a.maxRetries).length;

      return {
        pending,
        failed,
        totalSize: actions.length
      };
    } catch (error) {
      console.error('[Offline] Failed to get sync queue status:', error);
      return { pending: 0, failed: 0, totalSize: 0 };
    }
  }

  /**
   * Force sync now
   */
  async forcSync(): Promise<void> {
    if (this.isOnline) {
      await this.processSyncQueue();
    }
  }

  /**
   * Clear all offline data
   */
  async clearAllOfflineData(): Promise<void> {
    try {
      if (!this.db) {
        return;
      }

      const tx = this.db.transaction(['actions', 'cache', 'media'], 'readwrite');
      
      await Promise.all([
        tx.objectStore('actions').clear(),
        tx.objectStore('cache').clear(),
        tx.objectStore('media').clear()
      ]);

      await tx.done;
      
      this.syncQueue = [];
      console.log('[Offline] All offline data cleared');

    } catch (error) {
      console.error('[Offline] Failed to clear offline data:', error);
    }
  }

  /**
   * Get storage usage
   */
  async getStorageUsage(): Promise<{ used: number; quota: number }> {
    try {
      if ('storage' in navigator && 'estimate' in navigator.storage) {
        const estimate = await navigator.storage.estimate();
        return {
          used: estimate.usage || 0,
          quota: estimate.quota || 0
        };
      }
      
      return { used: 0, quota: 0 };
    } catch (error) {
      console.error('[Offline] Failed to get storage usage:', error);
      return { used: 0, quota: 0 };
    }
  }

  /**
   * Cleanup and destroy service
   */
  destroy(): void {
    try {
      // Remove event listeners
      window.removeEventListener('online', this.handleOnline.bind(this));
      window.removeEventListener('offline', this.handleOffline.bind(this));

      // Clear callbacks
      this.onlineCallbacks.clear();
      this.offlineCallbacks.clear();
      this.syncCallbacks.clear();

      // Close database
      if (this.db) {
        this.db.close();
        this.db = null;
      }

      console.log('[Offline] Service destroyed');
    } catch (error) {
      console.error('[Offline] Error during cleanup:', error);
    }
  }
}

// MARK: - Default Export
const offlineService = new OfflineService();
export default offlineService; 