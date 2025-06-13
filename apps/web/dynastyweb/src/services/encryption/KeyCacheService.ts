/**
 * Key Cache Service for Performance Optimization
 * Caches derived PBKDF2 keys to avoid repeated expensive derivations
 */

interface CachedKey {
  key: CryptoKey;
  timestamp: number;
  accessCount: number;
}

export class KeyCacheService {
  private static instance: KeyCacheService | null = null;
  private cache = new Map<string, CachedKey>();
  private readonly TTL = 30 * 60 * 1000; // 30 minutes
  private readonly MAX_CACHE_SIZE = 10; // Maximum number of cached keys
  private cleanupTimer: ReturnType<typeof setInterval> | null = null;

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
    salt: Uint8Array,
    deriveFunction: () => Promise<CryptoKey>
  ): Promise<CryptoKey> {
    const cacheKey = this.getCacheKey(password, salt);
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
    const key = await deriveFunction();

    // Add to cache (with size limit enforcement)
    this.addToCache(cacheKey, key);

    return key;
  }

  /**
   * Clear specific key from cache
   */
  clearKey(password: string, salt: Uint8Array): void {
    const cacheKey = this.getCacheKey(password, salt);
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
   * Generate cache key from password and salt
   */
  private getCacheKey(password: string, salt: Uint8Array): string {
    // Create a unique key by hashing password + salt
    // Note: This is just for cache lookup, not for security
    const encoder = new TextEncoder();
    const data = encoder.encode(password + Array.from(salt).join(','));
    
    // Simple hash for cache key (not cryptographic)
    let hash = 0;
    for (let i = 0; i < data.length; i++) {
      hash = ((hash << 5) - hash) + data[i];
      hash = hash & hash; // Convert to 32-bit integer
    }
    
    return `pbkdf2_${hash}_${salt.length}`;
  }

  /**
   * Add key to cache with size limit enforcement
   */
  private addToCache(cacheKey: string, key: CryptoKey): void {
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