import { createHash, randomBytes } from 'react-native-quick-crypto';
import { Buffer } from '@craftzdog/react-native-buffer';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getFirebaseDb } from '../../lib/firebase';
import MetadataEncryptionService from './MetadataEncryptionService';

interface SearchIndex {
  messageId: string;
  chatId: string;
  searchTokens: string[]; // Encrypted search tokens
  timestamp: number;
}

interface SearchResult {
  messageId: string;
  chatId: string;
  relevanceScore: number;
  snippet?: string;
}

export class EncryptedSearchService {
  private static instance: EncryptedSearchService;
  private db = getFirebaseDb();
  private searchKey?: Buffer;
  private readonly INDEX_STORAGE_KEY = '@dynasty_search_index';
  private readonly MAX_INDEX_SIZE = 10000; // Max indexed messages
  private readonly TOKEN_LENGTH = 3; // Trigram tokenization

  private constructor() {}

  static getInstance(): EncryptedSearchService {
    if (!EncryptedSearchService.instance) {
      EncryptedSearchService.instance = new EncryptedSearchService();
    }
    return EncryptedSearchService.instance;
  }

  /**
   * Initialize search service with user key
   */
  async initialize(userId: string) {
    try {
      // Derive search-specific key
      const salt = Buffer.from('dynasty-search-v1', 'utf8');
      const info = Buffer.from(`search-${userId}`, 'utf8');
      
      const hash = createHash('sha256');
      hash.update(Buffer.from(userId, 'utf8'));
      hash.update(salt);
      hash.update(info);
      
      this.searchKey = Buffer.from(hash.digest()).slice(0, 32);
      
      // Load existing index
      await this.loadSearchIndex();
    } catch (error) {
      console.error('Failed to initialize search service:', error);
      throw error;
    }
  }

  /**
   * Index a message for search
   */
  async indexMessage(
    messageId: string,
    chatId: string,
    content: string,
    metadata?: any
  ): Promise<void> {
    if (!this.searchKey) {
      throw new Error('Search service not initialized');
    }

    try {
      // Generate search tokens from content
      const tokens = this.tokenizeText(content);
      
      // Encrypt each token
      const encryptedTokens = await Promise.all(
        tokens.map(token => this.encryptSearchToken(token))
      );

      // Create index entry
      const indexEntry: SearchIndex = {
        messageId,
        chatId,
        searchTokens: encryptedTokens,
        timestamp: Date.now()
      };

      // Store in local index
      await this.addToLocalIndex(indexEntry);

      // Also store searchable fields in Firestore with deterministic encryption
      if (metadata) {
        const searchableIndex = await MetadataEncryptionService.createSearchableIndex(
          content,
          ['content', 'sender']
        );

        // Store in Firestore for server-side search capability
        await this.db
          .collection('searchIndex')
          .doc(messageId)
          .set({
            ...searchableIndex,
            chatId,
            timestamp: Date.now()
          });
      }
    } catch (error) {
      console.error('Failed to index message:', error);
      throw error;
    }
  }

  /**
   * Search messages
   */
  async searchMessages(query: string, chatId?: string): Promise<SearchResult[]> {
    if (!this.searchKey) {
      throw new Error('Search service not initialized');
    }

    try {
      // Tokenize search query
      const queryTokens = this.tokenizeText(query);
      
      // Encrypt query tokens
      const encryptedQueryTokens = await Promise.all(
        queryTokens.map(token => this.encryptSearchToken(token))
      );

      // Search local index
      const localResults = await this.searchLocalIndex(encryptedQueryTokens, chatId);

      // Search server index for additional results
      const serverResults = await this.searchServerIndex(query, chatId);

      // Merge and rank results
      const mergedResults = this.mergeSearchResults(localResults, serverResults);

      // Sort by relevance
      return mergedResults.sort((a, b) => b.relevanceScore - a.relevanceScore);
    } catch (error) {
      console.error('Search failed:', error);
      throw error;
    }
  }

  /**
   * Tokenize text for search
   */
  private tokenizeText(text: string): string[] {
    const normalized = text.toLowerCase().trim();
    const tokens: Set<string> = new Set();

    // Word-based tokens
    const words = normalized.split(/\s+/);
    words.forEach(word => {
      if (word.length >= this.TOKEN_LENGTH) {
        tokens.add(word);
        
        // Also add trigrams for partial matching
        for (let i = 0; i <= word.length - this.TOKEN_LENGTH; i++) {
          tokens.add(word.substr(i, this.TOKEN_LENGTH));
        }
      }
    });

    return Array.from(tokens);
  }

  /**
   * Encrypt a search token deterministically
   */
  private async encryptSearchToken(token: string): Promise<string> {
    if (!this.searchKey) {
      throw new Error('Search key not initialized');
    }

    // Use HMAC for deterministic encryption
    const hash = createHash('sha256');
    hash.update(this.searchKey);
    hash.update(Buffer.from(token, 'utf8'));
    
    return hash.digest('hex').substring(0, 16); // Truncate for storage efficiency
  }

  /**
   * Search local index
   */
  private async searchLocalIndex(
    encryptedTokens: string[],
    chatId?: string
  ): Promise<SearchResult[]> {
    const index = await this.loadSearchIndex();
    const results: Map<string, SearchResult> = new Map();

    index.forEach(entry => {
      // Filter by chat if specified
      if (chatId && entry.chatId !== chatId) return;

      // Count matching tokens
      let matches = 0;
      encryptedTokens.forEach(token => {
        if (entry.searchTokens.includes(token)) {
          matches++;
        }
      });

      if (matches > 0) {
        const relevanceScore = matches / encryptedTokens.length;
        results.set(entry.messageId, {
          messageId: entry.messageId,
          chatId: entry.chatId,
          relevanceScore
        });
      }
    });

    return Array.from(results.values());
  }

  /**
   * Search server index
   */
  private async searchServerIndex(
    query: string,
    chatId?: string
  ): Promise<SearchResult[]> {
    try {
      // Generate search hash
      const searchHash = await MetadataEncryptionService.searchEncryptedMetadata(
        query,
        'content'
      );

      // Query Firestore
      let searchQuery = this.db
        .collection('searchIndex')
        .where('content', '==', searchHash);

      if (chatId) {
        searchQuery = searchQuery.where('chatId', '==', chatId);
      }

      const snapshot = await searchQuery.limit(50).get();
      
      const results: SearchResult[] = [];
      snapshot.forEach(doc => {
        results.push({
          messageId: doc.id,
          chatId: doc.data().chatId,
          relevanceScore: 0.8 // Server results get slightly lower score
        });
      });

      return results;
    } catch (error) {
      console.error('Server search failed:', error);
      return [];
    }
  }

  /**
   * Load search index from storage
   */
  private async loadSearchIndex(): Promise<SearchIndex[]> {
    try {
      const indexData = await AsyncStorage.getItem(this.INDEX_STORAGE_KEY);
      if (!indexData) return [];
      
      return JSON.parse(indexData) as SearchIndex[];
    } catch (error) {
      console.error('Failed to load search index:', error);
      return [];
    }
  }

  /**
   * Add entry to local index
   */
  private async addToLocalIndex(entry: SearchIndex): Promise<void> {
    let index = await this.loadSearchIndex();
    
    // Remove old entry if exists
    index = index.filter(e => e.messageId !== entry.messageId);
    
    // Add new entry
    index.push(entry);
    
    // Limit index size
    if (index.length > this.MAX_INDEX_SIZE) {
      // Remove oldest entries
      index.sort((a, b) => b.timestamp - a.timestamp);
      index = index.slice(0, this.MAX_INDEX_SIZE);
    }
    
    // Save index
    await AsyncStorage.setItem(this.INDEX_STORAGE_KEY, JSON.stringify(index));
  }

  /**
   * Merge search results from different sources
   */
  private mergeSearchResults(
    localResults: SearchResult[],
    serverResults: SearchResult[]
  ): SearchResult[] {
    const merged = new Map<string, SearchResult>();
    
    // Add local results
    localResults.forEach(result => {
      merged.set(result.messageId, result);
    });
    
    // Add server results, boosting score if also found locally
    serverResults.forEach(result => {
      const existing = merged.get(result.messageId);
      if (existing) {
        // Boost relevance if found in both
        existing.relevanceScore = Math.min(1, existing.relevanceScore * 1.2);
      } else {
        merged.set(result.messageId, result);
      }
    });
    
    return Array.from(merged.values());
  }

  /**
   * Delete message from search index
   */
  async deleteFromIndex(messageId: string): Promise<void> {
    // Remove from local index
    let index = await this.loadSearchIndex();
    index = index.filter(e => e.messageId !== messageId);
    await AsyncStorage.setItem(this.INDEX_STORAGE_KEY, JSON.stringify(index));
    
    // Remove from server index
    try {
      await this.db.collection('searchIndex').doc(messageId).delete();
    } catch (error) {
      console.error('Failed to delete from server index:', error);
    }
  }

  /**
   * Clear all search data
   */
  async clearSearchData(): Promise<void> {
    // Clear local index
    await AsyncStorage.removeItem(this.INDEX_STORAGE_KEY);
    
    // Clear search key
    if (this.searchKey) {
      this.searchKey.fill(0);
      this.searchKey = undefined;
    }
  }

  /**
   * Rebuild search index from messages
   */
  async rebuildIndex(messages: { id: string; chatId: string; content: string }[]): Promise<void> {
    console.log('Rebuilding search index...');
    
    // Clear existing index
    await AsyncStorage.removeItem(this.INDEX_STORAGE_KEY);
    
    // Re-index all messages
    for (const message of messages) {
      try {
        await this.indexMessage(message.id, message.chatId, message.content);
      } catch (error) {
        console.error(`Failed to index message ${message.id}:`, error);
      }
    }
    
    console.log(`Indexed ${messages.length} messages`);
  }
}

export default EncryptedSearchService.getInstance();