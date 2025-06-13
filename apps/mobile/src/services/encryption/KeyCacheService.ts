/**
 * Key Cache Service for React Native
 * Caches derived PBKDF2 keys to avoid repeated expensive derivations
 */

import QuickCrypto from 'react-native-quick-crypto';

interface CachedKey {
  key: Buffer;
  timestamp: number;
  accessCount: number;
}

export class KeyCacheService {
  private static instance: KeyCacheService | null = null;
  private cache = new Map<string, CachedKey>();
  private readonly TTL = 30 * 60 * 1000; // 30 minutes
  private readonly MAX_CACHE_SIZE = 10; // Maximum number of cached keys
  private cleanupTimer: NodeJS.Timeout | null = null;

  private constructor() {
    // Start periodic cleanup
    this.startCleanupTimer();
  }

  static getInstance(): KeyCacheService {
    if (!KeyCacheService.instance) {
      KeyCacheService.instance = new KeyCacheService();
    }
    return KeyCacheService.instance;
  }

  /**
   * Get or derive a key with caching
   */
  async getOrDeriveKey(
    password: string,
    salt: Buffer,
    iterations: number,
    keyLength: number,
    digest: string,
    deriveFunction: () => Buffer
  ): Promise<Buffer> {
    const cacheKey = this.getCacheKey(password, salt, iterations);
    const cached = this.cache.get(cacheKey);

    // Check if cached and not expired
    if (cached && Date.now() - cached.timestamp < this.TTL) {
      cached.accessCount++;
      return cached.key;
    }

    // Remove expired entry if exists
    if (cached) {
      this.cache.delete(cacheKey);
    }

    // Derive new key
    const key = deriveFunction();

    // Add to cache (with size limit enforcement)
    this.addToCache(cacheKey, key);

    return key;
  }

  /**
   * Clear specific key from cache
   */
  clearKey(password: string, salt: Buffer, iterations: number): void {
    const cacheKey = this.getCacheKey(password, salt, iterations);
    this.cache.delete(cacheKey);
  }

  /**
   * Clear all cached keys
   */
  clearAll(): void {
    this.cache.clear();
  }

  /**
   * Clear expired keys
   */
  clearExpired(): void {
    const now = Date.now();
    for (const [key, cached] of this.cache.entries()) {
      if (now - cached.timestamp >= this.TTL) {
        this.cache.delete(key);
      }
    }
  }

  /**
   * Get cache statistics
   */
  getStats(): {
    size: number;
    hits: number;
    totalAccessCount: number;
  } {
    let totalAccessCount = 0;
    for (const cached of this.cache.values()) {
      totalAccessCount += cached.accessCount;
    }

    return {
      size: this.cache.size,
      hits: totalAccessCount,
      totalAccessCount
    };
  }

  /**
   * Generate cache key from password, salt, and iterations
   */
  private getCacheKey(password: string, salt: Buffer, iterations: number): string {
    // Create a unique key by hashing password + salt + iterations
    const hash = QuickCrypto.createHash('md5')
      .update(password)
      .update(salt)
      .update(iterations.toString())
      .digest('hex');
    
    return `pbkdf2_${hash}`;
  }

  /**
   * Add key to cache with size limit enforcement
   */
  private addToCache(cacheKey: string, key: Buffer): void {
    // If cache is full, remove least recently accessed
    if (this.cache.size >= this.MAX_CACHE_SIZE) {
      let leastAccessedKey: string | null = null;
      let leastAccessCount = Infinity;

      for (const [k, v] of this.cache.entries()) {
        if (v.accessCount < leastAccessCount) {
          leastAccessCount = v.accessCount;
          leastAccessedKey = k;
        }
      }

      if (leastAccessedKey) {
        this.cache.delete(leastAccessedKey);
      }
    }

    this.cache.set(cacheKey, {
      key,
      timestamp: Date.now(),
      accessCount: 1
    });
  }

  /**
   * Start periodic cleanup timer
   */
  private startCleanupTimer(): void {
    // Clear any existing timer
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
    }

    // Run cleanup every 5 minutes
    this.cleanupTimer = setInterval(() => {
      this.clearExpired();
    }, 5 * 60 * 1000);
  }

  /**
   * Destroy the cache service
   */
  destroy(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
    this.cache.clear();
    KeyCacheService.instance = null;
  }
}

// Export singleton instance getter
export const getKeyCacheService = () => KeyCacheService.getInstance();