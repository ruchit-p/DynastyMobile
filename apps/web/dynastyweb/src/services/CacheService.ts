// Cache Service for Dynasty Web App
// Provides data caching with TTL for offline support

import React from 'react';
import { errorHandler, ErrorSeverity } from './ErrorHandlingService';

export interface CacheEntry<T = unknown> {
  data: T;
  timestamp: number;
  ttl: number; // Time to live in milliseconds
  key: string;
}

export interface CacheOptions {
  ttl?: number; // Default: 30 minutes
  persist?: boolean; // Whether to persist to IndexedDB
}

class CacheService {
  private static instance: CacheService;
  private memoryCache = new Map<string, CacheEntry>();
  private db?: IDBDatabase;
  private defaultTTL = 30 * 60 * 1000; // 30 minutes
  private cleanupInterval?: NodeJS.Timeout;

  private constructor() {
    this.initializeDatabase();
    this.startCleanupTask();
  }

  static getInstance(): CacheService {
    if (!CacheService.instance) {
      CacheService.instance = new CacheService();
    }
    return CacheService.instance;
  }

  private async initializeDatabase() {
    if (typeof window === 'undefined') return;

    try {
      const request = indexedDB.open('DynastyCache', 1);

      request.onerror = () => {
        errorHandler.handleError(
          new Error('Failed to open cache database'),
          ErrorSeverity.MEDIUM
        );
      };

      request.onsuccess = () => {
        this.db = request.result;
        this.loadPersistedCache();
      };

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        
        if (!db.objectStoreNames.contains('cache')) {
          const store = db.createObjectStore('cache', { keyPath: 'key' });
          store.createIndex('timestamp', 'timestamp', { unique: false });
        }
      };
    } catch (error) {
      errorHandler.handleError(error, ErrorSeverity.MEDIUM, {
        action: 'cache-init'
      });
    }
  }

  private async loadPersistedCache() {
    if (!this.db) return;

    try {
      const transaction = this.db.transaction(['cache'], 'readonly');
      const store = transaction.objectStore('cache');
      const request = store.getAll();

      request.onsuccess = () => {
        const entries = request.result as CacheEntry[];
        const now = Date.now();

        entries.forEach(entry => {
          if (this.isValidEntry(entry, now)) {
            this.memoryCache.set(entry.key, entry);
          }
        });
      };
    } catch (error) {
      errorHandler.handleError(error, ErrorSeverity.LOW, {
        action: 'load-persisted-cache'
      });
    }
  }

  private startCleanupTask() {
    // Clean up expired entries every 5 minutes
    this.cleanupInterval = setInterval(() => {
      this.cleanupExpiredEntries();
    }, 5 * 60 * 1000) as unknown as NodeJS.Timeout;
  }

  private async cleanupExpiredEntries() {
    const now = Date.now();
    const expiredKeys: string[] = [];

    // Clean memory cache
    this.memoryCache.forEach((entry, key) => {
      if (!this.isValidEntry(entry, now)) {
        expiredKeys.push(key);
      }
    });

    expiredKeys.forEach(key => this.memoryCache.delete(key));

    // Clean persisted cache
    if (this.db) {
      try {
        const transaction = this.db.transaction(['cache'], 'readwrite');
        const store = transaction.objectStore('cache');
        
        expiredKeys.forEach(key => store.delete(key));
      } catch (error) {
        console.error('Failed to cleanup persisted cache:', error);
      }
    }
  }

  private isValidEntry(entry: CacheEntry, now: number): boolean {
    return now - entry.timestamp < entry.ttl;
  }

  async set<T>(
    key: string,
    data: T,
    options: CacheOptions = {}
  ): Promise<void> {
    const entry: CacheEntry<T> = {
      key,
      data,
      timestamp: Date.now(),
      ttl: options.ttl || this.defaultTTL
    };

    // Always set in memory cache
    this.memoryCache.set(key, entry);

    // Persist to IndexedDB if requested
    if (options.persist && this.db) {
      try {
        const transaction = this.db.transaction(['cache'], 'readwrite');
        const store = transaction.objectStore('cache');
        await store.put(entry);
      } catch (error) {
        errorHandler.handleError(error, ErrorSeverity.LOW, {
          action: 'cache-persist',
          context: { key }
        });
      }
    }
  }

  get<T>(key: string): T | null {
    const entry = this.memoryCache.get(key);
    
    if (!entry) return null;
    
    if (this.isValidEntry(entry, Date.now())) {
      return entry.data as T;
    }

    // Remove expired entry
    this.memoryCache.delete(key);
    return null;
  }

  async getOrSet<T>(
    key: string,
    fetcher: () => Promise<T>,
    options: CacheOptions = {}
  ): Promise<T> {
    // Check cache first
    const cached = this.get<T>(key);
    if (cached !== null) {
      return cached;
    }

    // Fetch and cache
    try {
      const data = await fetcher();
      await this.set(key, data, options);
      return data;
    } catch (error) {
      errorHandler.handleError(error, ErrorSeverity.MEDIUM, {
        action: 'cache-fetch',
        context: { key }
      });
      throw error;
    }
  }

  invalidate(key: string): void {
    this.memoryCache.delete(key);
    
    if (this.db) {
      try {
        const transaction = this.db.transaction(['cache'], 'readwrite');
        const store = transaction.objectStore('cache');
        store.delete(key);
      } catch (error) {
        console.error('Failed to invalidate persisted cache:', error);
      }
    }
  }

  invalidatePattern(pattern: string | RegExp): void {
    const regex = typeof pattern === 'string' ? new RegExp(pattern) : pattern;
    const keysToDelete: string[] = [];

    this.memoryCache.forEach((_, key) => {
      if (regex.test(key)) {
        keysToDelete.push(key);
      }
    });

    keysToDelete.forEach(key => this.invalidate(key));
  }

  clear(): void {
    this.memoryCache.clear();
    
    if (this.db) {
      try {
        const transaction = this.db.transaction(['cache'], 'readwrite');
        const store = transaction.objectStore('cache');
        store.clear();
      } catch (error) {
        console.error('Failed to clear persisted cache:', error);
      }
    }
  }

  // Generate cache keys with consistent formatting
  static generateKey(...parts: (string | number | undefined)[]): string {
    return parts.filter(p => p !== undefined).join(':');
  }

  // Common cache key generators
  static keys = {
    user: (userId: string) => CacheService.generateKey('user', userId),
    familyTree: (familyTreeId: string) => CacheService.generateKey('familyTree', familyTreeId),
    stories: (familyTreeId: string, page?: number) => 
      CacheService.generateKey('stories', familyTreeId, page),
    story: (storyId: string) => CacheService.generateKey('story', storyId),
    events: (familyTreeId: string, page?: number) => 
      CacheService.generateKey('events', familyTreeId, page),
    event: (eventId: string) => CacheService.generateKey('event', eventId),
    notifications: (userId: string, page?: number) => 
      CacheService.generateKey('notifications', userId, page),
    vaultItems: (userId: string, folderId?: string) => 
      CacheService.generateKey('vault', userId, folderId),
  };

  destroy() {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
    if (this.db) {
      this.db.close();
    }
    this.memoryCache.clear();
  }
}

// Export singleton instance
export const cacheService = CacheService.getInstance();

// Export cache key generators
export const cacheKeys = CacheService.keys;

// React hook for cached data
export function useCachedData<T>(
  key: string,
  fetcher: () => Promise<T>,
  options: CacheOptions = {}
) {
  const [data, setData] = React.useState<T | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<Error | null>(null);

  const refresh = React.useCallback(async (force = false) => {
    const cache = CacheService.getInstance();
    
    if (force) {
      cache.invalidate(key);
    }

    setLoading(true);
    setError(null);

    try {
      const result = await cache.getOrSet(key, fetcher, options);
      setData(result);
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to fetch data'));
    } finally {
      setLoading(false);
    }
  }, [key, fetcher, options]);

  React.useEffect(() => {
    refresh();
  }, [refresh]);

  return { data, loading, error, refresh };
}