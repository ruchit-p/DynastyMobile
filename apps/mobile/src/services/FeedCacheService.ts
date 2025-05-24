import { FirebaseFirestoreTypes } from '@react-native-firebase/firestore';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getErrorMessage } from '../lib/errorUtils';

// Types
export interface FeedItem {
  id: string;
  type: 'story' | 'event' | 'announcement' | 'milestone';
  entityId: string;
  title: string;
  content?: string;
  authorId: string;
  authorName: string;
  authorAvatar?: string;
  mediaUrls?: string[];
  timestamp: FirebaseFirestoreTypes.Timestamp;
  familyId: string;
  likes: number;
  comments: number;
  isLiked?: boolean;
  visibility: 'public' | 'family' | 'private';
}

export interface FeedPage {
  items: FeedItem[];
  nextCursor?: string;
  previousCursor?: string;
  pageSize: number;
  timestamp: Date;
  ttl: number; // Time to live in milliseconds
}

export interface CacheMetadata {
  familyId: string;
  userId: string;
  lastSync: Date;
  totalItems: number;
  pages: Map<string, FeedPage>;
}

export interface FeedFilter {
  familyId?: string;
  types?: FeedItem['type'][];
  authorId?: string;
  startDate?: Date;
  endDate?: Date;
}

export interface CacheConfig {
  defaultTTL: number;
  maxCacheSize: number;
  maxItemsPerPage: number;
  enableOfflineMode: boolean;
}

// Interface
export interface IFeedCacheService {
  cacheFeedData(items: FeedItem[], cursor?: string, filter?: FeedFilter): Promise<void>;
  getCachedFeed(cursor?: string, filter?: FeedFilter): Promise<FeedPage | null>;
  invalidateCache(filter?: FeedFilter): Promise<void>;
  syncFeedUpdates(userId: string, familyId: string): Promise<void>;
  updateCacheItem(itemId: string, updates: Partial<FeedItem>): Promise<void>;
  getCacheStats(): Promise<{ size: number; items: number; lastSync: Date | null }>;
  clearExpiredCache(): Promise<void>;
  preloadFeed(userId: string, familyId: string): Promise<void>;
}

// Implementation
export class FeedCacheService implements IFeedCacheService {
  private static instance: FeedCacheService;
  private cacheMetadata: Map<string, CacheMetadata> = new Map();
  private config: CacheConfig = {
    defaultTTL: 15 * 60 * 1000, // 15 minutes
    maxCacheSize: 100 * 1024 * 1024, // 100MB
    maxItemsPerPage: 20,
    enableOfflineMode: true
  };

  private readonly CACHE_KEY_PREFIX = '@dynasty_feed_cache_';
  private readonly METADATA_KEY = '@dynasty_feed_metadata';

  private constructor() {
    console.log('[FeedCacheService] Initialized');
    this.loadMetadata();
  }

  static getInstance(): FeedCacheService {
    if (!FeedCacheService.instance) {
      FeedCacheService.instance = new FeedCacheService();
    }
    return FeedCacheService.instance;
  }

  async cacheFeedData(items: FeedItem[], cursor?: string, filter?: FeedFilter): Promise<void> {
    console.log(`[FeedCacheService] Caching ${items.length} feed items`);
    
    try {
      const cacheKey = this.getCacheKey(filter);
      const pageKey = cursor || 'initial';
      
      // Get or create metadata
      let metadata = this.cacheMetadata.get(cacheKey);
      if (!metadata) {
        metadata = {
          familyId: filter?.familyId || 'all',
          userId: '', // TODO: Get from auth context
          lastSync: new Date(),
          totalItems: 0,
          pages: new Map()
        };
        this.cacheMetadata.set(cacheKey, metadata);
      }
      
      // Create page
      const page: FeedPage = {
        items,
        nextCursor: this.generateNextCursor(items),
        previousCursor: cursor,
        pageSize: items.length,
        timestamp: new Date(),
        ttl: this.config.defaultTTL
      };
      
      metadata.pages.set(pageKey, page);
      metadata.totalItems = Array.from(metadata.pages.values())
        .reduce((sum, p) => sum + p.items.length, 0);
      metadata.lastSync = new Date();
      
      // Store in AsyncStorage
      await this.storePage(cacheKey, pageKey, page);
      await this.saveMetadata();
      
      // Check cache size and cleanup if needed
      await this.checkCacheSize();
    } catch (error) {
      console.error('[FeedCacheService] Error caching feed data:', getErrorMessage(error));
      throw error;
    }
  }

  async getCachedFeed(cursor?: string, filter?: FeedFilter): Promise<FeedPage | null> {
    console.log(`[FeedCacheService] Getting cached feed (cursor: ${cursor})`);
    
    try {
      const cacheKey = this.getCacheKey(filter);
      const pageKey = cursor || 'initial';
      
      // Check metadata
      const metadata = this.cacheMetadata.get(cacheKey);
      if (!metadata) {
        console.log('[FeedCacheService] No cached metadata found');
        return null;
      }
      
      // Check memory cache first
      const memoryPage = metadata.pages.get(pageKey);
      if (memoryPage && this.isPageValid(memoryPage)) {
        console.log('[FeedCacheService] Returning from memory cache');
        return memoryPage;
      }
      
      // Load from AsyncStorage
      const storedPage = await this.loadPage(cacheKey, pageKey);
      if (storedPage && this.isPageValid(storedPage)) {
        // Update memory cache
        metadata.pages.set(pageKey, storedPage);
        console.log('[FeedCacheService] Returning from storage cache');
        return storedPage;
      }
      
      console.log('[FeedCacheService] Cache miss or expired');
      return null;
    } catch (error) {
      console.error('[FeedCacheService] Error getting cached feed:', getErrorMessage(error));
      return null;
    }
  }

  async invalidateCache(filter?: FeedFilter): Promise<void> {
    console.log('[FeedCacheService] Invalidating cache', filter);
    
    try {
      if (filter) {
        // Invalidate specific cache
        const cacheKey = this.getCacheKey(filter);
        const metadata = this.cacheMetadata.get(cacheKey);
        
        if (metadata) {
          // Remove all pages for this filter
          for (const pageKey of metadata.pages.keys()) {
            await this.removePage(cacheKey, pageKey);
          }
          this.cacheMetadata.delete(cacheKey);
        }
      } else {
        // Invalidate all caches
        for (const [cacheKey, metadata] of this.cacheMetadata.entries()) {
          for (const pageKey of metadata.pages.keys()) {
            await this.removePage(cacheKey, pageKey);
          }
        }
        this.cacheMetadata.clear();
      }
      
      await this.saveMetadata();
    } catch (error) {
      console.error('[FeedCacheService] Error invalidating cache:', getErrorMessage(error));
      throw error;
    }
  }

  async syncFeedUpdates(userId: string, familyId: string): Promise<void> {
    console.log(`[FeedCacheService] Syncing feed updates for user: ${userId}, family: ${familyId}`);
    
    try {
      // TODO: Implement feed sync
      // 1. Get latest feed items from server
      // 2. Compare with cached items
      // 3. Update changed items
      // 4. Add new items to appropriate pages
      // 5. Remove deleted items
      
      const filter: FeedFilter = { familyId };
      const cacheKey = this.getCacheKey(filter);
      const metadata = this.cacheMetadata.get(cacheKey);
      
      if (!metadata) {
        console.log('[FeedCacheService] No cache to sync');
        return;
      }
      
      // TODO: Fetch updates since last sync
      const lastSync = metadata.lastSync;
      console.log(`[FeedCacheService] Last sync: ${lastSync.toISOString()}`);
      
      // TODO: Apply updates to cached pages
      // For now, invalidate cache to force refresh
      await this.invalidateCache(filter);
    } catch (error) {
      console.error('[FeedCacheService] Error syncing feed updates:', getErrorMessage(error));
      throw error;
    }
  }

  async updateCacheItem(itemId: string, updates: Partial<FeedItem>): Promise<void> {
    console.log(`[FeedCacheService] Updating cached item: ${itemId}`);
    
    try {
      // Update item in all cached pages
      for (const [cacheKey, metadata] of this.cacheMetadata.entries()) {
        for (const [pageKey, page] of metadata.pages.entries()) {
          const itemIndex = page.items.findIndex(item => item.id === itemId);
          
          if (itemIndex >= 0) {
            // Update item
            page.items[itemIndex] = {
              ...page.items[itemIndex],
              ...updates
            };
            
            // Update timestamp to extend TTL
            page.timestamp = new Date();
            
            // Store updated page
            await this.storePage(cacheKey, pageKey, page);
            
            console.log(`[FeedCacheService] Updated item in cache: ${cacheKey}/${pageKey}`);
          }
        }
      }
    } catch (error) {
      console.error('[FeedCacheService] Error updating cache item:', getErrorMessage(error));
      throw error;
    }
  }

  async getCacheStats(): Promise<{ size: number; items: number; lastSync: Date | null }> {
    try {
      let totalSize = 0;
      let totalItems = 0;
      let lastSync: Date | null = null;
      
      for (const metadata of this.cacheMetadata.values()) {
        totalItems += metadata.totalItems;
        
        if (!lastSync || metadata.lastSync > lastSync) {
          lastSync = metadata.lastSync;
        }
        
        // Estimate size (rough calculation)
        for (const page of metadata.pages.values()) {
          totalSize += JSON.stringify(page).length;
        }
      }
      
      return { size: totalSize, items: totalItems, lastSync };
    } catch (error) {
      console.error('[FeedCacheService] Error getting cache stats:', getErrorMessage(error));
      return { size: 0, items: 0, lastSync: null };
    }
  }

  async clearExpiredCache(): Promise<void> {
    console.log('[FeedCacheService] Clearing expired cache');
    
    try {
      const now = Date.now();
      let clearedCount = 0;
      
      for (const [cacheKey, metadata] of this.cacheMetadata.entries()) {
        const expiredPages: string[] = [];
        
        for (const [pageKey, page] of metadata.pages.entries()) {
          if (!this.isPageValid(page)) {
            expiredPages.push(pageKey);
            await this.removePage(cacheKey, pageKey);
            clearedCount++;
          }
        }
        
        // Remove expired pages from metadata
        expiredPages.forEach(key => metadata.pages.delete(key));
        
        // Remove metadata if no pages left
        if (metadata.pages.size === 0) {
          this.cacheMetadata.delete(cacheKey);
        }
      }
      
      console.log(`[FeedCacheService] Cleared ${clearedCount} expired pages`);
      await this.saveMetadata();
    } catch (error) {
      console.error('[FeedCacheService] Error clearing expired cache:', getErrorMessage(error));
      throw error;
    }
  }

  async preloadFeed(userId: string, familyId: string): Promise<void> {
    console.log(`[FeedCacheService] Preloading feed for user: ${userId}, family: ${familyId}`);
    
    try {
      // TODO: Implement feed preloading
      // 1. Fetch initial page of feed
      // 2. Cache it with extended TTL
      // 3. Optionally fetch next page in background
      
      const filter: FeedFilter = { familyId };
      
      // Check if already cached
      const existingCache = await this.getCachedFeed(undefined, filter);
      if (existingCache && this.isPageValid(existingCache)) {
        console.log('[FeedCacheService] Feed already cached and valid');
        return;
      }
      
      // TODO: Fetch from server
      console.log('[FeedCacheService] Would fetch feed from server for preloading');
      
      // Simulate preloaded data
      const mockItems: FeedItem[] = [
        {
          id: 'preload_1',
          type: 'story',
          entityId: 'story_1',
          title: 'Preloaded Story',
          content: 'This is a preloaded story for offline viewing',
          authorId: userId,
          authorName: 'Current User',
          timestamp: FirebaseFirestoreTypes.Timestamp.now(),
          familyId,
          likes: 0,
          comments: 0,
          visibility: 'family'
        }
      ];
      
      await this.cacheFeedData(mockItems, undefined, filter);
    } catch (error) {
      console.error('[FeedCacheService] Error preloading feed:', getErrorMessage(error));
      throw error;
    }
  }

  private getCacheKey(filter?: FeedFilter): string {
    if (!filter) return 'default';
    
    const parts: string[] = [];
    if (filter.familyId) parts.push(`family_${filter.familyId}`);
    if (filter.types) parts.push(`types_${filter.types.join(',')}`);
    if (filter.authorId) parts.push(`author_${filter.authorId}`);
    
    return parts.length > 0 ? parts.join('_') : 'default';
  }

  private generateNextCursor(items: FeedItem[]): string | undefined {
    if (items.length === 0) return undefined;
    
    const lastItem = items[items.length - 1];
    return `${lastItem.timestamp.toMillis()}_${lastItem.id}`;
  }

  private isPageValid(page: FeedPage): boolean {
    const now = Date.now();
    const pageAge = now - page.timestamp.getTime();
    return pageAge < page.ttl;
  }

  private async storePage(cacheKey: string, pageKey: string, page: FeedPage): Promise<void> {
    const storageKey = `${this.CACHE_KEY_PREFIX}${cacheKey}_${pageKey}`;
    await AsyncStorage.setItem(storageKey, JSON.stringify(page));
  }

  private async loadPage(cacheKey: string, pageKey: string): Promise<FeedPage | null> {
    try {
      const storageKey = `${this.CACHE_KEY_PREFIX}${cacheKey}_${pageKey}`;
      const stored = await AsyncStorage.getItem(storageKey);
      
      if (stored) {
        const page = JSON.parse(stored);
        // Convert timestamp back to Date
        page.timestamp = new Date(page.timestamp);
        return page;
      }
      
      return null;
    } catch (error) {
      console.error('[FeedCacheService] Error loading page:', getErrorMessage(error));
      return null;
    }
  }

  private async removePage(cacheKey: string, pageKey: string): Promise<void> {
    const storageKey = `${this.CACHE_KEY_PREFIX}${cacheKey}_${pageKey}`;
    await AsyncStorage.removeItem(storageKey);
  }

  private async loadMetadata(): Promise<void> {
    try {
      const stored = await AsyncStorage.getItem(this.METADATA_KEY);
      if (stored) {
        const metadata = JSON.parse(stored);
        // TODO: Reconstruct Map objects from stored data
        console.log('[FeedCacheService] Loaded metadata from storage');
      }
    } catch (error) {
      console.error('[FeedCacheService] Error loading metadata:', getErrorMessage(error));
    }
  }

  private async saveMetadata(): Promise<void> {
    try {
      // Convert Maps to serializable format
      const metadata: any = {};
      for (const [key, value] of this.cacheMetadata.entries()) {
        metadata[key] = {
          ...value,
          pages: Array.from(value.pages.keys()) // Only store page keys
        };
      }
      
      await AsyncStorage.setItem(this.METADATA_KEY, JSON.stringify(metadata));
    } catch (error) {
      console.error('[FeedCacheService] Error saving metadata:', getErrorMessage(error));
    }
  }

  private async checkCacheSize(): Promise<void> {
    const stats = await this.getCacheStats();
    
    if (stats.size > this.config.maxCacheSize) {
      console.log('[FeedCacheService] Cache size exceeded, clearing old entries');
      await this.clearExpiredCache();
      
      // If still too large, remove oldest pages
      // TODO: Implement LRU eviction
    }
  }
}

// Export singleton instance getter
export const getFeedCacheService = () => FeedCacheService.getInstance();