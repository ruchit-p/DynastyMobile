/**
 * Story Cache Service
 * Implements intelligent caching for story data to improve performance
 */

import { Story } from './storyUtils';

interface CacheEntry<T> {
  data: T;
  timestamp: number;
  expiresAt: number;
}

interface StoryCacheConfig {
  storyTTL: number; // Individual story cache TTL (5 minutes)
  storyListTTL: number; // Story list cache TTL (2 minutes)
  maxCacheSize: number; // Maximum cache entries
  cleanupInterval: number; // Cache cleanup interval
}

class StoryCacheService {
  private static instance: StoryCacheService;
  private storyCache: Map<string, CacheEntry<Story>> = new Map();
  private storyListCache: Map<string, CacheEntry<Story[]>> = new Map();
  private config: StoryCacheConfig = {
    storyTTL: 5 * 60 * 1000, // 5 minutes
    storyListTTL: 2 * 60 * 1000, // 2 minutes
    maxCacheSize: 100,
    cleanupInterval: 10 * 60 * 1000, // 10 minutes
  };

  private constructor() {
    // Set up periodic cleanup
    setInterval(() => {
      this.cleanup();
    }, this.config.cleanupInterval);
  }

  static getInstance(): StoryCacheService {
    if (!StoryCacheService.instance) {
      StoryCacheService.instance = new StoryCacheService();
    }
    return StoryCacheService.instance;
  }

  // Story caching methods
  cacheStory(storyId: string, story: Story): void {
    const now = Date.now();
    this.storyCache.set(storyId, {
      data: story,
      timestamp: now,
      expiresAt: now + this.config.storyTTL,
    });

    // Enforce cache size limit
    if (this.storyCache.size > this.config.maxCacheSize) {
      this.evictOldestStories();
    }
  }

  getCachedStory(storyId: string): Story | null {
    const entry = this.storyCache.get(storyId);
    if (!entry) return null;

    const now = Date.now();
    if (now > entry.expiresAt) {
      this.storyCache.delete(storyId);
      return null;
    }

    return entry.data;
  }

  // Story list caching methods
  cacheStoryList(cacheKey: string, stories: Story[]): void {
    const now = Date.now();
    this.storyListCache.set(cacheKey, {
      data: stories,
      timestamp: now,
      expiresAt: now + this.config.storyListTTL,
    });

    // Also cache individual stories
    stories.forEach(story => {
      this.cacheStory(story.id, story);
    });
  }

  getCachedStoryList(cacheKey: string): Story[] | null {
    const entry = this.storyListCache.get(cacheKey);
    if (!entry) return null;

    const now = Date.now();
    if (now > entry.expiresAt) {
      this.storyListCache.delete(cacheKey);
      return null;
    }

    return entry.data;
  }

  // Cache key generation
  generateStoryListCacheKey(userId: string, familyTreeId: string, filters?: any): string {
    const filterStr = filters ? JSON.stringify(filters) : '';
    return `storyList:${userId}:${familyTreeId}:${filterStr}`;
  }

  generateStoryDetailCacheKey(storyId: string, userId: string): string {
    return `storyDetail:${storyId}:${userId}`;
  }

  // Cache invalidation
  invalidateStory(storyId: string): void {
    this.storyCache.delete(storyId);
  }

  invalidateStoryListsForUser(userId: string): void {
    // Remove all story lists that contain this user
    const keysToDelete: string[] = [];
    this.storyListCache.forEach((_, key) => {
      if (key.includes(userId)) {
        keysToDelete.push(key);
      }
    });
    keysToDelete.forEach(key => this.storyListCache.delete(key));
  }

  invalidateStoryListsForFamilyTree(familyTreeId: string): void {
    // Remove all story lists for this family tree
    const keysToDelete: string[] = [];
    this.storyListCache.forEach((_, key) => {
      if (key.includes(familyTreeId)) {
        keysToDelete.push(key);
      }
    });
    keysToDelete.forEach(key => this.storyListCache.delete(key));
  }

  // Story updates (for optimistic updates)
  updateCachedStoryLikes(storyId: string, liked: boolean, likeCount: number): void {
    const entry = this.storyCache.get(storyId);
    if (entry) {
      // Update the cached story data
      entry.data = {
        ...entry.data,
        likeCount,
        // Note: We'd need to track user-specific like status separately
      };
    }

    // Update story in any cached lists
    this.storyListCache.forEach((listEntry, key) => {
      const storyIndex = listEntry.data.findIndex(story => story.id === storyId);
      if (storyIndex !== -1) {
        listEntry.data[storyIndex] = {
          ...listEntry.data[storyIndex],
          likeCount,
        };
      }
    });
  }

  // Cache statistics
  getCacheStats(): {
    storyCount: number;
    storyListCount: number;
    totalMemoryUsage: number;
  } {
    return {
      storyCount: this.storyCache.size,
      storyListCount: this.storyListCache.size,
      totalMemoryUsage: this.estimateMemoryUsage(),
    };
  }

  // Cleanup and maintenance
  private cleanup(): void {
    const now = Date.now();

    // Clean expired stories
    const expiredStoryKeys: string[] = [];
    this.storyCache.forEach((entry, key) => {
      if (now > entry.expiresAt) {
        expiredStoryKeys.push(key);
      }
    });
    expiredStoryKeys.forEach(key => this.storyCache.delete(key));

    // Clean expired story lists
    const expiredListKeys: string[] = [];
    this.storyListCache.forEach((entry, key) => {
      if (now > entry.expiresAt) {
        expiredListKeys.push(key);
      }
    });
    expiredListKeys.forEach(key => this.storyListCache.delete(key));

    console.log(`Cache cleanup completed. Stories: ${this.storyCache.size}, Lists: ${this.storyListCache.size}`);
  }

  private evictOldestStories(): void {
    const entries = Array.from(this.storyCache.entries());
    entries.sort((a, b) => a[1].timestamp - b[1].timestamp);

    // Remove oldest 20% of entries
    const toRemove = Math.floor(entries.length * 0.2);
    for (let i = 0; i < toRemove; i++) {
      this.storyCache.delete(entries[i][0]);
    }
  }

  private estimateMemoryUsage(): number {
    let usage = 0;
    
    // Estimate story cache usage (rough approximation)
    this.storyCache.forEach((entry, key) => {
      usage += key.length * 2; // Unicode strings use 2 bytes per char
      usage += JSON.stringify(entry.data).length * 2;
      usage += 24; // Overhead for timestamp and expiresAt
    });

    // Estimate story list cache usage
    this.storyListCache.forEach((entry, key) => {
      usage += key.length * 2;
      usage += JSON.stringify(entry.data).length * 2;
      usage += 24;
    });

    return usage;
  }

  // Clear all caches (useful for logout or debugging)
  clearAll(): void {
    this.storyCache.clear();
    this.storyListCache.clear();
    console.log('All caches cleared');
  }
}

export const storyCacheService = StoryCacheService.getInstance();

// Hook for React components to use story caching
export function useStoryCache() {
  const cacheStory = (storyId: string, story: Story) => {
    storyCacheService.cacheStory(storyId, story);
  };

  const getCachedStory = (storyId: string): Story | null => {
    return storyCacheService.getCachedStory(storyId);
  };

  const cacheStoryList = (cacheKey: string, stories: Story[]) => {
    storyCacheService.cacheStoryList(cacheKey, stories);
  };

  const getCachedStoryList = (cacheKey: string): Story[] | null => {
    return storyCacheService.getCachedStoryList(cacheKey);
  };

  const invalidateStory = (storyId: string) => {
    storyCacheService.invalidateStory(storyId);
  };

  const generateListCacheKey = (userId: string, familyTreeId: string, filters?: any): string => {
    return storyCacheService.generateStoryListCacheKey(userId, familyTreeId, filters);
  };

  return {
    cacheStory,
    getCachedStory,
    cacheStoryList,
    getCachedStoryList,
    invalidateStory,
    generateListCacheKey,
    getCacheStats: () => storyCacheService.getCacheStats(),
    clearAll: () => storyCacheService.clearAll(),
  };
}