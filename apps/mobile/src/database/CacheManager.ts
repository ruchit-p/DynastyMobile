/**
 * Cache Manager for Dynasty Mobile
 * Handles cache invalidation, TTL, and memory management
 */

import * as FileSystem from 'expo-file-system';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Device from 'expo-device';
import SyncDatabase from './SyncDatabase';
import { CacheMetadata, MediaCache } from './schema';

interface CachePolicy {
  maxSize: number; // Maximum cache size in bytes
  maxAge: number; // Maximum age in milliseconds
  maxItems: number; // Maximum number of items
}

interface CacheStats {
  totalSize: number;
  itemCount: number;
  hitRate: number;
  missRate: number;
  evictionCount: number;
  lastCleanup: Date;
}

export class CacheManager {
  private static instance: CacheManager;
  private db: SyncDatabase;
  private stats: CacheStats;
  private hitCount: number = 0;
  private missCount: number = 0;
  
  // Cache policies by entity type
  private policies: Record<string, CachePolicy> = {
    mediaCache: {
      maxSize: 500 * 1024 * 1024, // 500MB
      maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
      maxItems: 1000,
    },
    stories: {
      maxSize: 50 * 1024 * 1024, // 50MB
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
      maxItems: 500,
    },
    events: {
      maxSize: 20 * 1024 * 1024, // 20MB
      maxAge: 3 * 24 * 60 * 60 * 1000, // 3 days
      maxItems: 200,
    },
    messages: {
      maxSize: 100 * 1024 * 1024, // 100MB
      maxAge: 90 * 24 * 60 * 60 * 1000, // 90 days
      maxItems: 10000,
    },
  };
  
  private constructor() {
    this.db = SyncDatabase.getInstance();
    this.stats = {
      totalSize: 0,
      itemCount: 0,
      hitRate: 0,
      missRate: 0,
      evictionCount: 0,
      lastCleanup: new Date(),
    };
  }
  
  static getInstance(): CacheManager {
    if (!CacheManager.instance) {
      CacheManager.instance = new CacheManager();
    }
    return CacheManager.instance;
  }
  
  /**
   * Initialize cache manager
   */
  async initialize(): Promise<void> {
    await this.loadStats();
    await this.performCleanup();
    
    // Schedule periodic cleanup
    setInterval(() => {
      this.performCleanup();
    }, 60 * 60 * 1000); // Every hour
  }
  
  /**
   * Get cache statistics
   */
  getStats(): CacheStats {
    return {
      ...this.stats,
      hitRate: this.hitCount / (this.hitCount + this.missCount) || 0,
      missRate: this.missCount / (this.hitCount + this.missCount) || 0,
    };
  }
  
  /**
   * Load stats from storage
   */
  private async loadStats(): Promise<void> {
    try {
      const statsJson = await AsyncStorage.getItem('cache_stats');
      if (statsJson) {
        const saved = JSON.parse(statsJson);
        this.stats = {
          ...saved,
          lastCleanup: new Date(saved.lastCleanup),
        };
      }
    } catch (error) {
      console.error('[CacheManager] Failed to load stats:', error);
    }
  }
  
  /**
   * Save stats to storage
   */
  private async saveStats(): Promise<void> {
    try {
      await AsyncStorage.setItem('cache_stats', JSON.stringify(this.stats));
    } catch (error) {
      console.error('[CacheManager] Failed to save stats:', error);
    }
  }
  
  /**
   * Record cache hit
   */
  recordHit(entityType: string, entityId: string): void {
    this.hitCount++;
    this.updateAccessMetadata(entityType, entityId);
  }
  
  /**
   * Record cache miss
   */
  recordMiss(entityType: string, entityId: string): void {
    this.missCount++;
  }
  
  /**
   * Update access metadata
   */
  private async updateAccessMetadata(entityType: string, entityId: string): Promise<void> {
    try {
      await this.db.executeSql(
        `UPDATE cacheMetadata 
         SET lastAccessedAt = ?, accessCount = accessCount + 1 
         WHERE entityType = ? AND entityId = ?`,
        [new Date().toISOString(), entityType, entityId]
      );
    } catch (error) {
      console.error('[CacheManager] Failed to update access metadata:', error);
    }
  }
  
  /**
   * Add item to cache
   */
  async addToCache(entityType: string, entityId: string, data: any, size?: number): Promise<void> {
    const id = `cache_${Date.now()}_${Math.random()}`;
    const cacheKey = `${entityType}_${entityId}`;
    const policy = this.policies[entityType] || this.policies.stories;
    const expiresAt = new Date(Date.now() + policy.maxAge).toISOString();
    
    // Calculate size if not provided
    if (!size) {
      size = JSON.stringify(data).length;
    }
    
    await this.db.executeSql(
      `INSERT INTO cacheMetadata (
        id, entityType, entityId, cacheKey, size, lastAccessedAt,
        expiresAt, accessCount, metadata
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id, entityType, entityId, cacheKey, size,
        new Date().toISOString(), expiresAt, 1, JSON.stringify({ dataType: typeof data })
      ]
    );
    
    // Update stats
    this.stats.totalSize += size;
    this.stats.itemCount++;
    
    // Check if cleanup is needed
    if (this.needsCleanup(entityType)) {
      await this.performCleanup(entityType);
    }
  }
  
  /**
   * Remove item from cache
   */
  async removeFromCache(entityType: string, entityId: string): Promise<void> {
    const result = await this.db.executeSql(
      'DELETE FROM cacheMetadata WHERE entityType = ? AND entityId = ?',
      [entityType, entityId]
    );
    
    if (result.rowsAffected > 0) {
      this.stats.itemCount--;
      await this.recalculateTotalSize();
    }
  }
  
  /**
   * Invalidate cache by entity type
   */
  async invalidateByType(entityType: string): Promise<void> {
    const result = await this.db.executeSql(
      'DELETE FROM cacheMetadata WHERE entityType = ?',
      [entityType]
    );
    
    this.stats.evictionCount += result.rowsAffected;
    await this.recalculateTotalSize();
  }
  
  /**
   * Invalidate cache by pattern
   */
  async invalidateByPattern(pattern: string): Promise<void> {
    const result = await this.db.executeSql(
      'DELETE FROM cacheMetadata WHERE cacheKey LIKE ?',
      [`%${pattern}%`]
    );
    
    this.stats.evictionCount += result.rowsAffected;
    await this.recalculateTotalSize();
  }
  
  /**
   * Check if cleanup is needed
   */
  private needsCleanup(entityType?: string): boolean {
    if (entityType) {
      const policy = this.policies[entityType];
      if (!policy) return false;
      
      // Check if specific entity type needs cleanup
      // This would require tracking size per entity type
      return false; // Simplified for now
    }
    
    // Check overall cache size
    const totalMaxSize = Object.values(this.policies)
      .reduce((sum, policy) => sum + policy.maxSize, 0);
    
    return this.stats.totalSize > totalMaxSize * 0.9; // 90% threshold
  }
  
  /**
   * Perform cache cleanup
   */
  async performCleanup(entityType?: string): Promise<void> {
    console.log('[CacheManager] Starting cleanup...');
    const startTime = Date.now();
    
    try {
      // Remove expired items
      const expiredResult = await this.db.executeSql(
        entityType
          ? 'DELETE FROM cacheMetadata WHERE entityType = ? AND expiresAt < ?'
          : 'DELETE FROM cacheMetadata WHERE expiresAt < ?',
        entityType
          ? [entityType, new Date().toISOString()]
          : [new Date().toISOString()]
      );
      
      this.stats.evictionCount += expiredResult.rowsAffected;
      
      // Clean up media cache
      const mediaExpired = await this.db.cleanExpiredMedia();
      this.stats.evictionCount += mediaExpired;
      
      // Implement LRU eviction if needed
      await this.performLRUEviction(entityType);
      
      // Recalculate total size
      await this.recalculateTotalSize();
      
      // Update stats
      this.stats.lastCleanup = new Date();
      await this.saveStats();
      
      const duration = Date.now() - startTime;
      console.log(`[CacheManager] Cleanup completed in ${duration}ms`);
    } catch (error) {
      console.error('[CacheManager] Cleanup failed:', error);
    }
  }
  
  /**
   * Perform LRU eviction
   */
  private async performLRUEviction(entityType?: string): Promise<void> {
    // Get cache policies
    const policies = entityType
      ? { [entityType]: this.policies[entityType] }
      : this.policies;
    
    for (const [type, policy] of Object.entries(policies)) {
      // Check item count
      const countResult = await this.db.executeSql(
        'SELECT COUNT(*) as count FROM cacheMetadata WHERE entityType = ?',
        [type]
      );
      
      const count = countResult.rows.item(0).count;
      if (count > policy.maxItems) {
        // Remove least recently used items
        const toRemove = count - Math.floor(policy.maxItems * 0.8); // Keep 80%
        
        const result = await this.db.executeSql(
          `DELETE FROM cacheMetadata WHERE id IN (
            SELECT id FROM cacheMetadata 
            WHERE entityType = ? 
            ORDER BY lastAccessedAt ASC 
            LIMIT ?
          )`,
          [type, toRemove]
        );
        
        this.stats.evictionCount += result.rowsAffected;
      }
      
      // Check total size for this type
      const sizeResult = await this.db.executeSql(
        'SELECT SUM(size) as totalSize FROM cacheMetadata WHERE entityType = ?',
        [type]
      );
      
      const totalSize = sizeResult.rows.item(0).totalSize || 0;
      if (totalSize > policy.maxSize) {
        // Remove items until under limit
        const targetSize = Math.floor(policy.maxSize * 0.8); // Target 80%
        
        const candidates = await this.db.executeSql(
          `SELECT id, size FROM cacheMetadata 
           WHERE entityType = ? 
           ORDER BY lastAccessedAt ASC`,
          [type]
        );
        
        let removedSize = 0;
        const idsToRemove: string[] = [];
        
        for (let i = 0; i < candidates.rows.length; i++) {
          const item = candidates.rows.item(i);
          idsToRemove.push(item.id);
          removedSize += item.size;
          
          if (totalSize - removedSize <= targetSize) {
            break;
          }
        }
        
        if (idsToRemove.length > 0) {
          const placeholders = idsToRemove.map(() => '?').join(',');
          const result = await this.db.executeSql(
            `DELETE FROM cacheMetadata WHERE id IN (${placeholders})`,
            idsToRemove
          );
          
          this.stats.evictionCount += result.rowsAffected;
        }
      }
    }
  }
  
  /**
   * Recalculate total cache size
   */
  private async recalculateTotalSize(): Promise<void> {
    const result = await this.db.executeSql(
      'SELECT COUNT(*) as count, SUM(size) as totalSize FROM cacheMetadata'
    );
    
    this.stats.itemCount = result.rows.item(0).count || 0;
    this.stats.totalSize = result.rows.item(0).totalSize || 0;
  }
  
  /**
   * Get cache usage by entity type
   */
  async getCacheUsage(): Promise<Record<string, {
    count: number;
    size: number;
    percentage: number;
  }>> {
    const usage: Record<string, any> = {};
    
    for (const entityType of Object.keys(this.policies)) {
      const result = await this.db.executeSql(
        'SELECT COUNT(*) as count, SUM(size) as totalSize FROM cacheMetadata WHERE entityType = ?',
        [entityType]
      );
      
      const count = result.rows.item(0).count || 0;
      const size = result.rows.item(0).totalSize || 0;
      const maxSize = this.policies[entityType].maxSize;
      
      usage[entityType] = {
        count,
        size,
        percentage: (size / maxSize) * 100,
      };
    }
    
    return usage;
  }
  
  /**
   * Clear all cache
   */
  async clearAllCache(): Promise<void> {
    console.log('[CacheManager] Clearing all cache...');
    
    try {
      // Clear cache metadata
      await this.db.executeSql('DELETE FROM cacheMetadata');
      
      // Clear media cache
      await this.db.executeSql('DELETE FROM mediaCache');
      
      // Clear cached files
      const cacheDir = `${FileSystem.documentDirectory}cache/`;
      const dirInfo = await FileSystem.getInfoAsync(cacheDir);
      if (dirInfo.exists) {
        await FileSystem.deleteAsync(cacheDir, { idempotent: true });
      }
      
      // Reset stats
      this.stats = {
        totalSize: 0,
        itemCount: 0,
        hitRate: 0,
        missRate: 0,
        evictionCount: 0,
        lastCleanup: new Date(),
      };
      this.hitCount = 0;
      this.missCount = 0;
      
      await this.saveStats();
      
      console.log('[CacheManager] All cache cleared');
    } catch (error) {
      console.error('[CacheManager] Failed to clear cache:', error);
      throw error;
    }
  }
  
  /**
   * Prune cache based on available storage
   */
  async pruneBasedOnStorage(): Promise<void> {
    try {
      // Expo FileSystem provides available space info
      const freeSpace = await FileSystem.getFreeDiskStorageAsync() || 0;
      // Expo doesn't provide total disk capacity, so we'll estimate based on typical device sizes
      // or use a conservative approach
      const totalSpace = freeSpace * 2; // Rough estimate: assume device is 50% full
      const usedPercentage = totalSpace > 0 ? ((totalSpace - freeSpace) / totalSpace) * 100 : 50;
      
      // If storage is above 90% full, aggressively prune cache
      if (usedPercentage > 90) {
        console.log('[CacheManager] Low storage detected, pruning cache...');
        
        // Reduce cache limits temporarily
        const originalPolicies = { ...this.policies };
        
        for (const [type, policy] of Object.entries(this.policies)) {
          this.policies[type] = {
            ...policy,
            maxSize: policy.maxSize * 0.5, // Reduce to 50%
            maxItems: Math.floor(policy.maxItems * 0.5),
          };
        }
        
        // Perform aggressive cleanup
        await this.performCleanup();
        
        // Restore original policies
        this.policies = originalPolicies;
      }
    } catch (error) {
      console.error('[CacheManager] Failed to prune based on storage:', error);
    }
  }
  
  /**
   * Optimize cache for performance
   */
  async optimizeCache(): Promise<void> {
    console.log('[CacheManager] Optimizing cache...');
    
    try {
      // Vacuum the database to reclaim space
      await this.db.executeSql('VACUUM');
      
      // Analyze tables for query optimization
      await this.db.executeSql('ANALYZE cacheMetadata');
      await this.db.executeSql('ANALYZE mediaCache');
      
      console.log('[CacheManager] Cache optimization completed');
    } catch (error) {
      console.error('[CacheManager] Failed to optimize cache:', error);
    }
  }
}

export default CacheManager;