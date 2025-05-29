// Service mock factories for Dynasty web app testing
// Provides consistent, reusable mocks for all services

import type { VaultService } from '@/services/VaultService';
import type { NotificationService } from '@/services/NotificationService';
import type { OfflineService } from '@/services/OfflineService';
import type { CacheService } from '@/services/CacheService';
import type { SyncQueueService } from '@/services/SyncQueueService';

// =============================================================================
// VAULT SERVICE MOCKS
// =============================================================================

export const createMockVaultService = (overrides: Partial<VaultService> = {}): jest.Mocked<VaultService> => ({
  // Core vault operations
  encryptVaultItem: jest.fn().mockImplementation(async (item) => ({
    ...item,
    id: `encrypted-${Date.now()}`,
    encrypted: true,
    content: `encrypted_${item.content}`,
    metadata: {
      name: item.name,
      type: item.type,
      encryptedAt: Date.now(),
      size: item.content?.length || 0,
    },
  })),

  decryptVaultItem: jest.fn().mockImplementation(async (encryptedItem) => ({
    ...encryptedItem,
    encrypted: false,
    content: encryptedItem.content?.replace('encrypted_', '') || '',
  })),

  addToVault: jest.fn().mockImplementation(async (item) => ({
    id: `vault-item-${Date.now()}`,
    ...item,
    createdAt: new Date(),
    updatedAt: new Date(),
  })),

  removeFromVault: jest.fn().mockResolvedValue(undefined),

  updateVaultItem: jest.fn().mockImplementation(async (id, updates) => ({
    id,
    ...updates,
    updatedAt: new Date(),
  })),

  getVaultItem: jest.fn().mockImplementation(async (id) => ({
    id,
    name: `Item ${id}`,
    type: 'document',
    content: 'Mock content',
    encrypted: false,
    createdAt: new Date(),
    updatedAt: new Date(),
  })),

  // File operations
  uploadSecureFile: jest.fn().mockImplementation(async (file, options = {}) => {
    const { onProgress } = options;
    
    // Simulate upload progress
    if (onProgress) {
      setTimeout(() => onProgress({ loaded: file.size * 0.5, total: file.size, percentage: 50 }), 50);
      setTimeout(() => onProgress({ loaded: file.size, total: file.size, percentage: 100 }), 100);
    }

    return {
      id: `file-${Date.now()}`,
      name: file.name,
      size: file.size,
      type: file.type,
      url: `https://storage.example.com/${file.name}`,
      encrypted: options.encrypt || false,
      uploadedAt: new Date(),
    };
  }),

  downloadSecureFile: jest.fn().mockImplementation(async (fileId) => ({
    blob: new Blob(['mock file content'], { type: 'text/plain' }),
    filename: `file-${fileId}.txt`,
    size: 17,
  })),

  deleteSecureFile: jest.fn().mockResolvedValue(undefined),

  // Search and filtering
  searchVault: jest.fn().mockImplementation(async (query) => {
    const mockItems = [
      { id: '1', name: 'Tax Document 2023', type: 'document', content: 'Tax information' },
      { id: '2', name: 'Family Photos', type: 'album', content: 'Photo collection' },
      { id: '3', name: 'Insurance Policy', type: 'document', content: 'Policy details' },
    ];

    return mockItems.filter(item => 
      item.name.toLowerCase().includes(query.toLowerCase()) ||
      item.type.toLowerCase().includes(query.toLowerCase())
    );
  }),

  getVaultItems: jest.fn().mockResolvedValue([
    { id: '1', name: 'Document 1', type: 'document', createdAt: new Date() },
    { id: '2', name: 'Photo Album', type: 'album', createdAt: new Date() },
  ]),

  // Sharing operations
  shareVaultItem: jest.fn().mockImplementation(async (itemId, recipientIds, permissions = {}) => ({
    itemId,
    sharedWith: recipientIds,
    permissions: {
      read: true,
      write: false,
      delete: false,
      reshare: false,
      ...permissions,
    },
    shareLinks: recipientIds.map(id => ({
      recipientId: id,
      shareId: `share-${Date.now()}-${id}`,
      token: `token-${Math.random().toString(36).substr(2, 9)}`,
    })),
    sharedAt: new Date(),
  })),

  unshareVaultItem: jest.fn().mockResolvedValue(undefined),

  getSharedItems: jest.fn().mockResolvedValue([
    {
      id: 'shared-1',
      name: 'Shared Document',
      sharedBy: 'user-123',
      permissions: { read: true, write: false },
      sharedAt: new Date(),
    },
  ]),

  // Storage management
  getStorageQuota: jest.fn().mockResolvedValue({
    used: 2.5 * 1024 * 1024 * 1024, // 2.5GB
    limit: 5 * 1024 * 1024 * 1024,  // 5GB
    percentage: 50,
  }),

  cleanupTempFiles: jest.fn().mockResolvedValue(undefined),

  // Backup and sync
  createBackup: jest.fn().mockImplementation(async () => ({
    backupId: `backup-${Date.now()}`,
    items: 25,
    size: 1024 * 1024 * 500, // 500MB
    createdAt: new Date(),
  })),

  restoreFromBackup: jest.fn().mockResolvedValue(undefined),

  syncVault: jest.fn().mockResolvedValue({
    synced: 10,
    conflicts: 0,
    errors: 0,
  }),

  ...overrides,
}) as jest.Mocked<VaultService>;

// =============================================================================
// NOTIFICATION SERVICE MOCKS
// =============================================================================

export const createMockNotificationService = (overrides: Partial<NotificationService> = {}): jest.Mocked<NotificationService> => ({
  // Permission management
  requestPermission: jest.fn().mockResolvedValue('granted'),
  
  getPermissionStatus: jest.fn().mockReturnValue('granted'),

  // Notification display
  showNotification: jest.fn().mockImplementation(async (notification) => {
    if (global.Notification?.permission === 'granted') {
      return new global.Notification(notification.title, {
        body: notification.body,
        icon: notification.icon,
        data: notification.data,
      });
    }
    return null;
  }),

  // Queue management for offline scenarios
  queueNotification: jest.fn().mockImplementation(async (notification) => ({
    ...notification,
    id: `queued-${Date.now()}`,
    queued: true,
    queuedAt: new Date(),
  })),

  getQueuedNotifications: jest.fn().mockResolvedValue([
    {
      id: 'queued-1',
      title: 'Offline Notification',
      body: 'This was queued while offline',
      queued: true,
      queuedAt: new Date(),
    },
  ]),

  processQueuedNotifications: jest.fn().mockResolvedValue({
    processed: 3,
    failed: 0,
  }),

  clearQueue: jest.fn().mockResolvedValue(undefined),

  // Preferences
  updatePreferences: jest.fn().mockImplementation(async (preferences) => {
    // Store in mock localStorage
    const stored = JSON.stringify(preferences);
    if (typeof window !== 'undefined') {
      window.localStorage.setItem('notification-preferences', stored);
    }
  }),

  getPreferences: jest.fn().mockResolvedValue({
    messages: true,
    events: true,
    stories: true,
    familyUpdates: true,
    email: true,
    push: true,
    sms: false,
  }),

  shouldShowNotification: jest.fn().mockImplementation(async (type) => {
    const prefs = await createMockNotificationService().getPreferences();
    return prefs[type as keyof typeof prefs] || false;
  }),

  // Subscription management
  subscribe: jest.fn().mockImplementation(async (endpoint) => ({
    subscriptionId: `sub-${Date.now()}`,
    endpoint,
    subscribed: true,
  })),

  unsubscribe: jest.fn().mockResolvedValue(undefined),

  // Badge management
  setBadgeCount: jest.fn().mockImplementation(async (count) => {
    if (navigator.setAppBadge) {
      return navigator.setAppBadge(count);
    }
  }),

  clearBadge: jest.fn().mockImplementation(async () => {
    if (navigator.clearAppBadge) {
      return navigator.clearAppBadge();
    }
  }),

  ...overrides,
}) as jest.Mocked<NotificationService>;

// =============================================================================
// OFFLINE SERVICE MOCKS
// =============================================================================

export const createMockOfflineService = (overrides: Partial<OfflineService> = {}): jest.Mocked<OfflineService> => {
  const eventListeners: { [key: string]: Function[] } = {};

  return {
    // Network status
    isOnline: jest.fn().mockReturnValue(true),
    
    getNetworkStatus: jest.fn().mockReturnValue({
      online: true,
      connectionType: 'wifi',
      effectiveType: '4g',
    }),

    // Event listeners
    onOnline: jest.fn().mockImplementation((callback) => {
      eventListeners.online = eventListeners.online || [];
      eventListeners.online.push(callback);
      return () => {
        const index = eventListeners.online.indexOf(callback);
        if (index > -1) eventListeners.online.splice(index, 1);
      };
    }),

    onOffline: jest.fn().mockImplementation((callback) => {
      eventListeners.offline = eventListeners.offline || [];
      eventListeners.offline.push(callback);
      return () => {
        const index = eventListeners.offline.indexOf(callback);
        if (index > -1) eventListeners.offline.splice(index, 1);
      };
    }),

    onSync: jest.fn().mockImplementation((callback) => {
      eventListeners.sync = eventListeners.sync || [];
      eventListeners.sync.push(callback);
      return () => {
        const index = eventListeners.sync.indexOf(callback);
        if (index > -1) eventListeners.sync.splice(index, 1);
      };
    }),

    // Cache management
    cacheForOffline: jest.fn().mockImplementation(async (key, data) => {
      const cached = {
        key,
        data,
        cachedAt: Date.now(),
        expiresAt: Date.now() + (24 * 60 * 60 * 1000), // 24 hours
      };
      
      // Mock localStorage storage
      if (typeof window !== 'undefined') {
        window.localStorage.setItem(`offline-cache-${key}`, JSON.stringify(cached));
      }
    }),

    getCachedData: jest.fn().mockImplementation(async (key) => {
      if (typeof window !== 'undefined') {
        const cached = window.localStorage.getItem(`offline-cache-${key}`);
        if (cached) {
          const parsed = JSON.parse(cached);
          if (Date.now() < parsed.expiresAt) {
            return parsed.data;
          }
        }
      }
      return null;
    }),

    clearCache: jest.fn().mockImplementation(async (key) => {
      if (typeof window !== 'undefined') {
        if (key) {
          window.localStorage.removeItem(`offline-cache-${key}`);
        } else {
          // Clear all offline cache
          const keys = Object.keys(window.localStorage).filter(k => k.startsWith('offline-cache-'));
          keys.forEach(k => window.localStorage.removeItem(k));
        }
      }
    }),

    // Operation queuing
    queueOperation: jest.fn().mockImplementation(async (operation) => {
      const queued = {
        ...operation,
        id: `op-${Date.now()}`,
        queuedAt: Date.now(),
        retries: 0,
      };
      
      if (typeof window !== 'undefined') {
        const existing = JSON.parse(window.localStorage.getItem('offline-operations') || '[]');
        existing.push(queued);
        window.localStorage.setItem('offline-operations', JSON.stringify(existing));
      }
      
      return queued;
    }),

    getQueuedOperations: jest.fn().mockImplementation(async () => {
      if (typeof window !== 'undefined') {
        return JSON.parse(window.localStorage.getItem('offline-operations') || '[]');
      }
      return [];
    }),

    processQueue: jest.fn().mockImplementation(async () => {
      const operations = await createMockOfflineService().getQueuedOperations();
      
      // Simulate processing each operation
      const results = {
        processed: operations.length,
        successful: operations.length,
        failed: 0,
        errors: [],
      };
      
      // Clear queue after processing
      if (typeof window !== 'undefined') {
        window.localStorage.setItem('offline-operations', '[]');
      }
      
      return results;
    }),

    clearQueue: jest.fn().mockImplementation(async () => {
      if (typeof window !== 'undefined') {
        window.localStorage.setItem('offline-operations', '[]');
      }
    }),

    // Sync management
    scheduleSync: jest.fn().mockResolvedValue(undefined),
    
    cancelSync: jest.fn().mockResolvedValue(undefined),

    forcSync: jest.fn().mockImplementation(async () => {
      const operations = await createMockOfflineService().getQueuedOperations();
      return createMockOfflineService().processQueue();
    }),

    ...overrides,
  } as jest.Mocked<OfflineService>;
};

// =============================================================================
// CACHE SERVICE MOCKS
// =============================================================================

export const createMockCacheService = (overrides: Partial<CacheService> = {}): jest.Mocked<CacheService> => {
  const cache = new Map<string, { value: any; expiresAt?: number; accessCount: number; lastAccessed: number }>();
  let maxSize = 1000;

  return {
    // Basic cache operations
    get: jest.fn().mockImplementation(async (key) => {
      const entry = cache.get(key);
      if (!entry) return null;
      
      if (entry.expiresAt && Date.now() > entry.expiresAt) {
        cache.delete(key);
        return null;
      }
      
      entry.accessCount++;
      entry.lastAccessed = Date.now();
      return entry.value;
    }),

    set: jest.fn().mockImplementation(async (key, value, options = {}) => {
      // Implement LRU eviction if cache is full
      if (cache.size >= maxSize) {
        // Find least recently used item
        let lruKey = '';
        let oldestAccess = Date.now();
        
        for (const [k, entry] of cache.entries()) {
          if (entry.lastAccessed < oldestAccess) {
            oldestAccess = entry.lastAccessed;
            lruKey = k;
          }
        }
        
        if (lruKey) cache.delete(lruKey);
      }
      
      const entry = {
        value,
        expiresAt: options.ttl ? Date.now() + options.ttl : undefined,
        accessCount: 0,
        lastAccessed: Date.now(),
      };
      
      cache.set(key, entry);
    }),

    delete: jest.fn().mockImplementation(async (key) => {
      return cache.delete(key);
    }),

    clear: jest.fn().mockImplementation(async () => {
      cache.clear();
    }),

    has: jest.fn().mockImplementation(async (key) => {
      return cache.has(key);
    }),

    // Size management
    size: jest.fn().mockImplementation(async () => cache.size),
    
    setMaxSize: jest.fn().mockImplementation((size) => {
      maxSize = size;
    }),

    getMaxSize: jest.fn().mockReturnValue(maxSize),

    // Pattern operations
    invalidatePattern: jest.fn().mockImplementation(async (pattern) => {
      const regex = new RegExp(pattern.replace(/\*/g, '.*'));
      const keysToDelete = Array.from(cache.keys()).filter(key => regex.test(key));
      keysToDelete.forEach(key => cache.delete(key));
      return keysToDelete.length;
    }),

    keys: jest.fn().mockImplementation(async (pattern) => {
      if (!pattern) return Array.from(cache.keys());
      
      const regex = new RegExp(pattern.replace(/\*/g, '.*'));
      return Array.from(cache.keys()).filter(key => regex.test(key));
    }),

    // Statistics
    getStats: jest.fn().mockImplementation(async () => {
      let totalAccess = 0;
      let hitCount = 0;
      
      for (const entry of cache.values()) {
        totalAccess += entry.accessCount;
        if (entry.accessCount > 0) hitCount++;
      }
      
      return {
        size: cache.size,
        maxSize,
        hitRate: totalAccess > 0 ? hitCount / totalAccess : 0,
        totalRequests: totalAccess,
        evictions: Math.max(0, totalAccess - cache.size),
      };
    }),

    // Bulk operations
    mget: jest.fn().mockImplementation(async (keys) => {
      const results = new Map();
      for (const key of keys) {
        const value = await createMockCacheService().get(key);
        if (value !== null) results.set(key, value);
      }
      return results;
    }),

    mset: jest.fn().mockImplementation(async (entries, options) => {
      for (const [key, value] of entries) {
        await createMockCacheService().set(key, value, options);
      }
    }),

    ...overrides,
  } as jest.Mocked<CacheService>;
};

// =============================================================================
// SYNC QUEUE SERVICE MOCKS
// =============================================================================

export const createMockSyncQueueService = (overrides: Partial<SyncQueueService> = {}): jest.Mocked<SyncQueueService> => {
  const queue: any[] = [];
  let isProcessing = false;

  return {
    // Queue operations
    add: jest.fn().mockImplementation(async (operation) => {
      const item = {
        id: `sync-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        ...operation,
        addedAt: Date.now(),
        retries: 0,
        priority: operation.priority || 'normal',
        status: 'pending',
      };
      
      queue.push(item);
      
      // Sort by priority
      queue.sort((a, b) => {
        const priorities = { high: 3, normal: 2, low: 1 };
        return (priorities[b.priority] || 2) - (priorities[a.priority] || 2);
      });
      
      return item;
    }),

    remove: jest.fn().mockImplementation(async (id) => {
      const index = queue.findIndex(item => item.id === id);
      if (index > -1) {
        queue.splice(index, 1);
        return true;
      }
      return false;
    }),

    get: jest.fn().mockImplementation(async (id) => {
      return queue.find(item => item.id === id) || null;
    }),

    getAll: jest.fn().mockImplementation(async (filter) => {
      if (!filter) return [...queue];
      
      return queue.filter(item => {
        if (filter.status && item.status !== filter.status) return false;
        if (filter.type && item.type !== filter.type) return false;
        if (filter.priority && item.priority !== filter.priority) return false;
        return true;
      });
    }),

    clear: jest.fn().mockImplementation(async () => {
      queue.length = 0;
    }),

    // Processing
    processAll: jest.fn().mockImplementation(async () => {
      if (isProcessing) {
        return { successful: 0, failed: 0, skipped: queue.length };
      }
      
      isProcessing = true;
      let successful = 0;
      let failed = 0;
      const errors: any[] = [];
      
      try {
        // Process each item
        const items = [...queue];
        queue.length = 0; // Clear queue
        
        for (const item of items) {
          try {
            // Simulate processing
            await new Promise(resolve => setTimeout(resolve, 10));
            
            // Simulate some failures based on retry count
            if (item.retries > 2) {
              throw new Error(`Max retries exceeded for ${item.id}`);
            }
            
            successful++;
          } catch (error) {
            failed++;
            errors.push({ item: item.id, error: error.message });
            
            // Re-queue with increased retry count if under limit
            if (item.retries < 3) {
              item.retries++;
              item.status = 'retrying';
              queue.push(item);
            }
          }
        }
        
        return { successful, failed, errors };
      } finally {
        isProcessing = false;
      }
    }),

    processOne: jest.fn().mockImplementation(async () => {
      const item = queue.shift();
      if (!item) return null;
      
      try {
        // Simulate processing
        await new Promise(resolve => setTimeout(resolve, 10));
        return { success: true, item };
      } catch (error) {
        return { success: false, item, error: error.message };
      }
    }),

    // Status
    isProcessing: jest.fn().mockReturnValue(isProcessing),
    
    size: jest.fn().mockImplementation(async () => queue.length),

    getStatus: jest.fn().mockImplementation(async () => ({
      total: queue.length,
      pending: queue.filter(i => i.status === 'pending').length,
      processing: queue.filter(i => i.status === 'processing').length,
      failed: queue.filter(i => i.status === 'failed').length,
      retrying: queue.filter(i => i.status === 'retrying').length,
      isProcessing,
    })),

    // Events
    onProgress: jest.fn().mockImplementation((callback) => {
      // Mock event listener
      return () => {}; // unsubscribe function
    }),

    onComplete: jest.fn().mockImplementation((callback) => {
      // Mock event listener
      return () => {}; // unsubscribe function
    }),

    onError: jest.fn().mockImplementation((callback) => {
      // Mock event listener
      return () => {}; // unsubscribe function
    }),

    ...overrides,
  } as jest.Mocked<SyncQueueService>;
};

// =============================================================================
// COMPOSITE SERVICE MOCK FACTORY
// =============================================================================

export const createMockServices = (overrides: {
  vault?: Partial<VaultService>;
  notification?: Partial<NotificationService>;
  offline?: Partial<OfflineService>;
  cache?: Partial<CacheService>;
  syncQueue?: Partial<SyncQueueService>;
} = {}) => ({
  vault: createMockVaultService(overrides.vault),
  notification: createMockNotificationService(overrides.notification),
  offline: createMockOfflineService(overrides.offline),
  cache: createMockCacheService(overrides.cache),
  syncQueue: createMockSyncQueueService(overrides.syncQueue),
});

// =============================================================================
// SERVICE INTEGRATION HELPERS
// =============================================================================

export const mockServiceIntegration = () => {
  const services = createMockServices();
  
  // Set up realistic interactions between services
  
  // When offline service goes offline, queue operations
  services.offline.onOffline.mockImplementation((callback) => {
    // Simulate going offline
    services.offline.isOnline.mockReturnValue(false);
    callback();
    return jest.fn();
  });
  
  // When coming back online, process queues
  services.offline.onOnline.mockImplementation((callback) => {
    services.offline.isOnline.mockReturnValue(true);
    callback();
    
    // Auto-process sync queue
    setTimeout(() => {
      services.syncQueue.processAll();
    }, 100);
    
    return jest.fn();
  });
  
  // Notification service respects offline state
  services.notification.showNotification.mockImplementation(async (notification) => {
    if (!services.offline.isOnline()) {
      return services.notification.queueNotification(notification);
    }
    
    if (global.Notification?.permission === 'granted') {
      return new global.Notification(notification.title, {
        body: notification.body,
        icon: notification.icon,
        data: notification.data,
      });
    }
    
    return null;
  });
  
  return services;
};