import { Message } from './encryption/ChatEncryptionService';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Image } from 'react-native';
import { logger } from './LoggingService';

interface CachedMessage extends Message {
  cachedAt: number;
  decryptedMediaUri?: string;
}

interface MessageCache {
  [messageId: string]: CachedMessage;
}

class MessageOptimizationService {
  private static instance: MessageOptimizationService;
  private messageCache: MessageCache = {};
  private mediaCache: Map<string, string> = new Map();
  private pendingDecryptions: Map<string, Promise<any>> = new Map();
  private cacheExpiryTime = 30 * 60 * 1000; // 30 minutes
  private maxCacheSize = 500; // Maximum messages in cache
  private preloadQueue: string[] = [];
  private isPreloading = false;

  private constructor() {
    this.loadCacheFromStorage();
    this.startCacheCleanup();
  }

  static getInstance(): MessageOptimizationService {
    if (!MessageOptimizationService.instance) {
      MessageOptimizationService.instance = new MessageOptimizationService();
    }
    return MessageOptimizationService.instance;
  }

  /**
   * Load cache from AsyncStorage
   */
  private async loadCacheFromStorage() {
    try {
      const cachedData = await AsyncStorage.getItem('@message_cache');
      if (cachedData) {
        const parsed = JSON.parse(cachedData);
        // Only load non-expired messages
        const now = Date.now();
        Object.entries(parsed).forEach(([key, value]: [string, any]) => {
          if (now - value.cachedAt < this.cacheExpiryTime) {
            this.messageCache[key] = value;
          }
        });
      }
    } catch (error) {
      logger.error('Failed to load message cache:', error);
    }
  }

  /**
   * Save cache to AsyncStorage (debounced)
   */
  private saveCacheTimer: NodeJS.Timeout | null = null;
  private async saveCache() {
    if (this.saveCacheTimer) {
      clearTimeout(this.saveCacheTimer);
    }

    this.saveCacheTimer = setTimeout(async () => {
      try {
        // Limit cache size before saving
        this.limitCacheSize();
        await AsyncStorage.setItem('@message_cache', JSON.stringify(this.messageCache));
      } catch (error) {
        logger.error('Failed to save message cache:', error);
      }
    }, 5000); // Save after 5 seconds of inactivity
  }

  /**
   * Limit cache size by removing oldest entries
   */
  private limitCacheSize() {
    const entries = Object.entries(this.messageCache);
    if (entries.length > this.maxCacheSize) {
      // Sort by cachedAt timestamp
      entries.sort((a, b) => a[1].cachedAt - b[1].cachedAt);
      
      // Remove oldest entries
      const toRemove = entries.slice(0, entries.length - this.maxCacheSize);
      toRemove.forEach(([key]) => {
        delete this.messageCache[key];
      });
    }
  }

  /**
   * Start periodic cache cleanup
   */
  private startCacheCleanup() {
    setInterval(() => {
      const now = Date.now();
      Object.entries(this.messageCache).forEach(([key, value]) => {
        if (now - value.cachedAt > this.cacheExpiryTime) {
          delete this.messageCache[key];
        }
      });
      this.saveCache();
    }, 5 * 60 * 1000); // Clean up every 5 minutes
  }

  /**
   * Cache a decrypted message
   */
  cacheMessage(message: Message) {
    this.messageCache[message.id] = {
      ...message,
      cachedAt: Date.now(),
    };
    this.saveCache();
  }

  /**
   * Get cached message
   */
  getCachedMessage(messageId: string): CachedMessage | null {
    const cached = this.messageCache[messageId];
    if (cached) {
      const now = Date.now();
      if (now - cached.cachedAt < this.cacheExpiryTime) {
        return cached;
      } else {
        delete this.messageCache[messageId];
      }
    }
    return null;
  }

  /**
   * Preload media for visible messages
   */
  async preloadMedia(messages: Message[]) {
    const mediaMessages = messages.filter(m => 
      (m.type === 'media' || m.type === 'voice') && m.media?.encryptedUrl
    );

    // Queue for preloading
    mediaMessages.forEach(msg => {
      if (!this.mediaCache.has(msg.id) && !this.preloadQueue.includes(msg.id)) {
        this.preloadQueue.push(msg.id);
      }
    });

    // Start preloading if not already running
    if (!this.isPreloading) {
      this.processPreloadQueue();
    }
  }

  /**
   * Process preload queue
   */
  private async processPreloadQueue() {
    if (this.isPreloading || this.preloadQueue.length === 0) {
      return;
    }

    this.isPreloading = true;

    while (this.preloadQueue.length > 0) {
      const messageId = this.preloadQueue.shift();
      if (!messageId || this.mediaCache.has(messageId)) continue;

      try {
        const message = this.getCachedMessage(messageId);
        if (message?.media?.encryptedUrl) {
          // Preload image into React Native Image cache
          await Image.prefetch(message.media.encryptedUrl);
          this.mediaCache.set(messageId, message.media.encryptedUrl);
        }
      } catch (error) {
        logger.error(`Failed to preload media for message ${messageId}:`, error);
      }

      // Small delay to avoid blocking
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    this.isPreloading = false;
  }

  /**
   * Get media from cache
   */
  getCachedMedia(messageId: string): string | null {
    return this.mediaCache.get(messageId) || null;
  }

  /**
   * Batch decrypt messages with deduplication
   */
  async batchDecryptMessages(
    encryptedMessages: any[], 
    decryptFunction: (msg: any) => Promise<Message>
  ): Promise<Message[]> {
    const results: Message[] = [];

    await Promise.all(
      encryptedMessages.map(async (encMsg) => {
        try {
          // Check cache first
          const cached = this.getCachedMessage(encMsg.id);
          if (cached) {
            results.push(cached);
            return;
          }

          // Check if already decrypting
          const pendingKey = `decrypt_${encMsg.id}`;
          let decryptPromise = this.pendingDecryptions.get(pendingKey);
          
          if (!decryptPromise) {
            // Start new decryption
            decryptPromise = decryptFunction(encMsg);
            this.pendingDecryptions.set(pendingKey, decryptPromise);
          }

          const decrypted = await decryptPromise;
          this.pendingDecryptions.delete(pendingKey);
          
          // Cache the result
          this.cacheMessage(decrypted);
          results.push(decrypted);
        } catch (error) {
          logger.error(`Failed to decrypt message ${encMsg.id}:`, error);
        }
      })
    );

    return results;
  }

  /**
   * Calculate optimal batch size based on device performance
   */
  getOptimalBatchSize(): number {
    // TODO: Implement device performance detection
    // For now, return a conservative batch size
    return 20;
  }

  /**
   * Clear cache for a specific chat
   */
  clearChatCache(chatId: string) {
    Object.keys(this.messageCache).forEach(key => {
      if (this.messageCache[key].chatId === chatId) {
        delete this.messageCache[key];
      }
    });
    this.saveCache();
  }

  /**
   * Clear all caches
   */
  async clearAllCache() {
    this.messageCache = {};
    this.mediaCache.clear();
    this.pendingDecryptions.clear();
    this.preloadQueue = [];
    await AsyncStorage.removeItem('@message_cache');
  }

  /**
   * Get cache statistics
   */
  getCacheStats() {
    return {
      messageCount: Object.keys(this.messageCache).length,
      mediaCacheCount: this.mediaCache.size,
      pendingDecryptions: this.pendingDecryptions.size,
      preloadQueueSize: this.preloadQueue.length,
    };
  }
}

export default MessageOptimizationService.getInstance();