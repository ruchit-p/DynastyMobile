/**
 * SQLite Database Wrapper for Dynasty Mobile
 * Provides CRUD operations and query builders
 */

import SQLite from 'react-native-sqlite-storage';
import DeviceInfo from 'react-native-device-info';
import { 
  LocalUser, 
  LocalStory, 
  LocalEvent, 
  LocalFamilyTree, 
  LocalMessage,
  SyncQueueItem,
  ConflictLog,
  MediaCache,
  CacheMetadata,
  SyncableEntity
} from './schema';
import { initializeDatabase, needsMigration } from './migrations';

SQLite.enablePromise(true);

export interface QueryOptions {
  where?: Record<string, any>;
  orderBy?: string;
  limit?: number;
  offset?: number;
}

export class SyncDatabase {
  private static instance: SyncDatabase;
  private db: SQLite.SQLiteDatabase | null = null;
  private deviceId: string;
  
  private constructor() {
    this.deviceId = DeviceInfo.getUniqueId();
  }
  
  static getInstance(): SyncDatabase {
    if (!SyncDatabase.instance) {
      SyncDatabase.instance = new SyncDatabase();
    }
    return SyncDatabase.instance;
  }
  
  /**
   * Open database connection
   */
  async open(): Promise<void> {
    if (this.db) {
      return;
    }
    
    try {
      this.db = await SQLite.openDatabase({
        name: 'dynasty.db',
        location: 'default',
      });
      
      // Check and run migrations
      if (await needsMigration(this.db)) {
        await initializeDatabase(this.db);
      }
      
      console.log('[Database] Connection opened successfully');
    } catch (error) {
      console.error('[Database] Failed to open connection:', error);
      throw error;
    }
  }
  
  /**
   * Close database connection
   */
  async close(): Promise<void> {
    if (this.db) {
      await this.db.close();
      this.db = null;
      console.log('[Database] Connection closed');
    }
  }
  
  /**
   * Execute raw SQL query
   */
  async executeSql(sql: string, params: any[] = []): Promise<SQLite.ResultSet> {
    if (!this.db) {
      throw new Error('Database not initialized');
    }
    
    const [result] = await this.db.executeSql(sql, params);
    return result;
  }
  
  /**
   * Begin transaction
   */
  async transaction<T>(callback: (tx: SQLite.Transaction) => Promise<T>): Promise<T> {
    if (!this.db) {
      throw new Error('Database not initialized');
    }
    
    return new Promise((resolve, reject) => {
      this.db!.transaction(
        async (tx) => {
          try {
            const result = await callback(tx);
            resolve(result);
          } catch (error) {
            reject(error);
          }
        },
        (error) => reject(error)
      );
    });
  }
  
  /**
   * Build WHERE clause from options
   */
  private buildWhereClause(where?: Record<string, any>): { sql: string; params: any[] } {
    if (!where || Object.keys(where).length === 0) {
      return { sql: '', params: [] };
    }
    
    const conditions: string[] = [];
    const params: any[] = [];
    
    for (const [key, value] of Object.entries(where)) {
      if (value === null) {
        conditions.push(`${key} IS NULL`);
      } else if (Array.isArray(value)) {
        const placeholders = value.map(() => '?').join(',');
        conditions.push(`${key} IN (${placeholders})`);
        params.push(...value);
      } else {
        conditions.push(`${key} = ?`);
        params.push(value);
      }
    }
    
    return {
      sql: ' WHERE ' + conditions.join(' AND '),
      params,
    };
  }
  
  /**
   * Build query from options
   */
  private buildQuery(table: string, options: QueryOptions = {}): { sql: string; params: any[] } {
    let sql = `SELECT * FROM ${table}`;
    const params: any[] = [];
    
    // Add WHERE clause
    const whereClause = this.buildWhereClause(options.where);
    sql += whereClause.sql;
    params.push(...whereClause.params);
    
    // Add ORDER BY
    if (options.orderBy) {
      sql += ` ORDER BY ${options.orderBy}`;
    }
    
    // Add LIMIT
    if (options.limit) {
      sql += ` LIMIT ${options.limit}`;
    }
    
    // Add OFFSET
    if (options.offset) {
      sql += ` OFFSET ${options.offset}`;
    }
    
    return { sql, params };
  }
  
  /**
   * Mark entity as dirty for sync
   */
  private async markDirty(table: string, id: string): Promise<void> {
    await this.executeSql(
      `UPDATE ${table} SET isDirty = 1, updatedAt = ? WHERE id = ?`,
      [new Date().toISOString(), id]
    );
  }
  
  /**
   * Generic query method
   */
  async query<T>(table: string, options: QueryOptions = {}): Promise<T[]> {
    const { sql, params } = this.buildQuery(table, options);
    const result = await this.executeSql(sql, params);
    
    const items: T[] = [];
    for (let i = 0; i < result.rows.length; i++) {
      items.push(result.rows.item(i));
    }
    
    return items;
  }
  
  /**
   * Generic insert method
   */
  async insert(table: string, data: any): Promise<void> {
    const fields = Object.keys(data);
    const placeholders = fields.map(() => '?').join(', ');
    const values = fields.map(field => data[field]);
    
    const sql = `INSERT INTO ${table} (${fields.join(', ')}) VALUES (${placeholders})`;
    await this.executeSql(sql, values);
  }
  
  /**
   * Generic update method
   */
  async update(table: string, data: any, where: Record<string, any>): Promise<void> {
    const fields = Object.keys(data).map(key => `${key} = ?`);
    const values = Object.keys(data).map(key => data[key]);
    
    const whereClause = this.buildWhereClause(where);
    values.push(...whereClause.params);
    
    const sql = `UPDATE ${table} SET ${fields.join(', ')}${whereClause.sql}`;
    await this.executeSql(sql, values);
  }
  
  /**
   * Generic upsert method
   */
  async upsert(table: string, data: any, conflictFields: string[]): Promise<void> {
    // Check if record exists
    const whereClause: any = {};
    conflictFields.forEach(field => {
      whereClause[field] = data[field];
    });
    
    const existing = await this.query(table, { where: whereClause, limit: 1 });
    
    if (existing.length > 0) {
      // Update existing record
      const updateData = { ...data };
      conflictFields.forEach(field => delete updateData[field]);
      await this.update(table, updateData, whereClause);
    } else {
      // Insert new record
      await this.insert(table, data);
    }
  }
  
  // User operations
  async getUser(id: string): Promise<LocalUser | null> {
    const result = await this.executeSql('SELECT * FROM users WHERE id = ?', [id]);
    return result.rows.length > 0 ? result.rows.item(0) : null;
  }
  
  async upsertUser(user: Partial<LocalUser>): Promise<void> {
    const existingUser = await this.getUser(user.id!);
    const now = new Date().toISOString();
    
    if (existingUser) {
      await this.executeSql(
        `UPDATE users SET 
          email = ?, firstName = ?, lastName = ?, displayName = ?, 
          photoURL = ?, phoneNumber = ?, dateOfBirth = ?, gender = ?,
          bio = ?, profileVisibility = ?, notificationSettings = ?,
          familyIds = ?, metadata = ?, updatedAt = ?, isDirty = 1
        WHERE id = ?`,
        [
          user.email, user.firstName, user.lastName, user.displayName,
          user.photoURL, user.phoneNumber, user.dateOfBirth, user.gender,
          user.bio, user.profileVisibility, user.notificationSettings,
          user.familyIds, user.metadata, now, user.id
        ]
      );
    } else {
      await this.executeSql(
        `INSERT INTO users (
          id, email, firstName, lastName, displayName, photoURL,
          phoneNumber, dateOfBirth, gender, bio, profileVisibility,
          notificationSettings, familyIds, metadata, createdAt, updatedAt,
          syncVersion, isDirty, isDeleted, deviceId
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          user.id, user.email, user.firstName, user.lastName, user.displayName,
          user.photoURL, user.phoneNumber, user.dateOfBirth, user.gender,
          user.bio, user.profileVisibility || 'family', 
          user.notificationSettings || '{}', user.familyIds || '[]',
          user.metadata || '{}', now, now, 0, 1, 0, this.deviceId
        ]
      );
    }
  }
  
  // Story operations
  async getStory(id: string): Promise<LocalStory | null> {
    const result = await this.executeSql('SELECT * FROM stories WHERE id = ?', [id]);
    return result.rows.length > 0 ? result.rows.item(0) : null;
  }
  
  async getStories(options: QueryOptions = {}): Promise<LocalStory[]> {
    const { sql, params } = this.buildQuery('stories', {
      ...options,
      where: { ...options.where, isDeleted: 0 },
    });
    
    const result = await this.executeSql(sql, params);
    const stories: LocalStory[] = [];
    
    for (let i = 0; i < result.rows.length; i++) {
      stories.push(result.rows.item(i));
    }
    
    return stories;
  }
  
  async createStory(story: Omit<LocalStory, keyof SyncableEntity>): Promise<string> {
    const id = story.localId || `local_${Date.now()}_${Math.random()}`;
    const now = new Date().toISOString();
    
    await this.executeSql(
      `INSERT INTO stories (
        id, localId, authorId, title, content, summary, coverImage,
        visibility, viewerIds, tags, location, eventDate, mediaItems,
        reactions, commentCount, viewCount, isArchived, metadata,
        createdAt, updatedAt, syncVersion, isDirty, isDeleted, deviceId
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id, id, story.authorId, story.title, story.content, story.summary,
        story.coverImage, story.visibility, story.viewerIds, story.tags || '[]',
        story.location, story.eventDate, story.mediaItems || '[]',
        story.reactions || '{}', story.commentCount || 0, story.viewCount || 0,
        story.isArchived ? 1 : 0, story.metadata || '{}', now, now, 0, 1, 0, this.deviceId
      ]
    );
    
    // Add to sync queue
    await this.addToSyncQueue('create', 'story', id, story);
    
    return id;
  }
  
  async updateStory(id: string, updates: Partial<LocalStory>): Promise<void> {
    const fields = Object.keys(updates)
      .filter(key => !['id', 'createdAt', 'deviceId'].includes(key))
      .map(key => `${key} = ?`);
    
    const values = Object.keys(updates)
      .filter(key => !['id', 'createdAt', 'deviceId'].includes(key))
      .map(key => updates[key as keyof LocalStory]);
    
    values.push(new Date().toISOString(), id);
    
    await this.executeSql(
      `UPDATE stories SET ${fields.join(', ')}, updatedAt = ?, isDirty = 1 WHERE id = ?`,
      values
    );
    
    // Add to sync queue
    await this.addToSyncQueue('update', 'story', id, updates);
  }
  
  async deleteStory(id: string): Promise<void> {
    await this.executeSql(
      'UPDATE stories SET isDeleted = 1, isDirty = 1, updatedAt = ? WHERE id = ?',
      [new Date().toISOString(), id]
    );
    
    // Add to sync queue
    await this.addToSyncQueue('delete', 'story', id, {});
  }
  
  // Event operations
  async getEvent(id: string): Promise<LocalEvent | null> {
    const result = await this.executeSql('SELECT * FROM events WHERE id = ?', [id]);
    return result.rows.length > 0 ? result.rows.item(0) : null;
  }
  
  async getEvents(options: QueryOptions = {}): Promise<LocalEvent[]> {
    const { sql, params } = this.buildQuery('events', {
      ...options,
      where: { ...options.where, isDeleted: 0 },
    });
    
    const result = await this.executeSql(sql, params);
    const events: LocalEvent[] = [];
    
    for (let i = 0; i < result.rows.length; i++) {
      events.push(result.rows.item(i));
    }
    
    return events;
  }
  
  async createEvent(event: Omit<LocalEvent, keyof SyncableEntity>): Promise<string> {
    const id = event.localId || `local_${Date.now()}_${Math.random()}`;
    const now = new Date().toISOString();
    
    await this.executeSql(
      `INSERT INTO events (
        id, localId, organizerId, title, description, startDate, endDate,
        location, visibility, viewerIds, capacity, rsvpEnabled, guestList,
        coverImage, mediaItems, recurring, reminders, metadata,
        createdAt, updatedAt, syncVersion, isDirty, isDeleted, deviceId
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id, id, event.organizerId, event.title, event.description,
        event.startDate, event.endDate, event.location, event.visibility,
        event.viewerIds, event.capacity, event.rsvpEnabled ? 1 : 0,
        event.guestList || '[]', event.coverImage, event.mediaItems || '[]',
        event.recurring, event.reminders || '[]', event.metadata || '{}',
        now, now, 0, 1, 0, this.deviceId
      ]
    );
    
    // Add to sync queue
    await this.addToSyncQueue('create', 'event', id, event);
    
    return id;
  }
  
  async updateEvent(id: string, updates: Partial<LocalEvent>): Promise<void> {
    await this.markDirty('events', id);
    // Similar implementation to updateStory
    await this.addToSyncQueue('update', 'event', id, updates);
  }
  
  async deleteEvent(id: string): Promise<void> {
    await this.executeSql(
      'UPDATE events SET isDeleted = 1, isDirty = 1, updatedAt = ? WHERE id = ?',
      [new Date().toISOString(), id]
    );
    
    await this.addToSyncQueue('delete', 'event', id, {});
  }
  
  // Message operations
  async getMessage(id: string): Promise<LocalMessage | null> {
    const result = await this.executeSql('SELECT * FROM messages WHERE id = ?', [id]);
    return result.rows.length > 0 ? result.rows.item(0) : null;
  }
  
  async getAllMessages(options: QueryOptions = {}): Promise<LocalMessage[]> {
    return this.query<LocalMessage>('messages', options);
  }
  
  async createMessage(message: Omit<LocalMessage, keyof SyncableEntity>): Promise<string> {
    const id = message.localId || `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const now = new Date().toISOString();
    
    const fullMessage: LocalMessage = {
      ...message,
      id,
      localId: id,
      createdAt: now,
      updatedAt: now,
      lastSyncedAt: undefined,
      syncVersion: 0,
      isDirty: true,
      isDeleted: false,
      deviceId: this.deviceId
    };
    
    await this.insert('messages', fullMessage);
    
    // Add to sync queue
    await this.addToSyncQueue('create', 'message', id, message);
    
    return id;
  }
  
  async updateMessage(id: string, updates: Partial<LocalMessage>): Promise<void> {
    const safeUpdates = { ...updates };
    delete safeUpdates.id;
    delete safeUpdates.createdAt;
    delete safeUpdates.deviceId;
    
    safeUpdates.updatedAt = new Date().toISOString();
    safeUpdates.isDirty = true;
    
    await this.update('messages', safeUpdates, { id });
    
    // Add to sync queue
    await this.addToSyncQueue('update', 'message', id, updates);
  }
  
  async getMessages(conversationId: string, options: QueryOptions = {}): Promise<LocalMessage[]> {
    const { sql, params } = this.buildQuery('messages', {
      ...options,
      where: { conversationId, isDeleted: 0, ...options.where },
      orderBy: options.orderBy || 'createdAt DESC',
    });
    
    const result = await this.executeSql(sql, params);
    const messages: LocalMessage[] = [];
    
    for (let i = 0; i < result.rows.length; i++) {
      messages.push(result.rows.item(i));
    }
    
    return messages;
  }
  
  async updateMessageStatus(id: string, status: string): Promise<void> {
    await this.executeSql(
      'UPDATE messages SET deliveryStatus = ?, updatedAt = ?, isDirty = 1 WHERE id = ?',
      [status, new Date().toISOString(), id]
    );
  }
  
  // Sync queue operations
  async addToSyncQueue(
    operationType: string,
    entityType: string,
    entityId: string,
    data: any,
    priority: number = 0
  ): Promise<void> {
    const id = `sync_${Date.now()}_${Math.random()}`;
    
    await this.executeSql(
      `INSERT INTO syncQueue (
        id, operationType, entityType, entityId, data, priority,
        createdAt, deviceId
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id, operationType, entityType, entityId, JSON.stringify(data),
        priority, new Date().toISOString(), this.deviceId
      ]
    );
  }
  
  async getSyncQueue(limit: number = 50): Promise<SyncQueueItem[]> {
    const result = await this.executeSql(
      `SELECT * FROM syncQueue 
       WHERE retryCount < maxRetries 
       ORDER BY priority DESC, createdAt ASC 
       LIMIT ?`,
      [limit]
    );
    
    const items: SyncQueueItem[] = [];
    for (let i = 0; i < result.rows.length; i++) {
      items.push(result.rows.item(i));
    }
    
    return items;
  }
  
  async updateSyncQueueItem(id: string, updates: Partial<SyncQueueItem>): Promise<void> {
    const fields = Object.keys(updates).map(key => `${key} = ?`);
    const values = Object.values(updates);
    values.push(id);
    
    await this.executeSql(
      `UPDATE syncQueue SET ${fields.join(', ')} WHERE id = ?`,
      values
    );
  }
  
  async removeSyncQueueItem(id: string): Promise<void> {
    await this.executeSql('DELETE FROM syncQueue WHERE id = ?', [id]);
  }
  
  // Conflict management
  async logConflict(conflict: Omit<ConflictLog, 'id' | 'createdAt'>): Promise<void> {
    const id = `conflict_${Date.now()}_${Math.random()}`;
    
    await this.executeSql(
      `INSERT INTO conflictLog (
        id, entityType, entityId, localVersion, remoteVersion,
        conflictType, resolveStrategy, resolvedAt, resolvedBy,
        metadata, createdAt, deviceId
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id, conflict.entityType, conflict.entityId, conflict.localVersion,
        conflict.remoteVersion, conflict.conflictType, conflict.resolveStrategy,
        conflict.resolvedAt, conflict.resolvedBy, conflict.metadata || '{}',
        new Date().toISOString(), this.deviceId
      ]
    );
  }
  
  async getUnresolvedConflicts(): Promise<ConflictLog[]> {
    const result = await this.executeSql(
      'SELECT * FROM conflictLog WHERE resolvedAt IS NULL ORDER BY createdAt DESC'
    );
    
    const conflicts: ConflictLog[] = [];
    for (let i = 0; i < result.rows.length; i++) {
      conflicts.push(result.rows.item(i));
    }
    
    return conflicts;
  }
  
  async resolveConflict(id: string, strategy: string): Promise<void> {
    await this.executeSql(
      'UPDATE conflictLog SET resolveStrategy = ?, resolvedAt = ? WHERE id = ?',
      [strategy, new Date().toISOString(), id]
    );
  }
  
  // Media cache operations
  async getCachedMedia(url: string): Promise<MediaCache | null> {
    const result = await this.executeSql(
      'SELECT * FROM mediaCache WHERE url = ?',
      [url]
    );
    
    if (result.rows.length > 0) {
      const media = result.rows.item(0);
      
      // Update last accessed time
      await this.executeSql(
        'UPDATE mediaCache SET lastAccessedAt = ? WHERE id = ?',
        [new Date().toISOString(), media.id]
      );
      
      return media;
    }
    
    return null;
  }
  
  async cacheMedia(media: Omit<MediaCache, 'id'>): Promise<void> {
    const id = `media_${Date.now()}_${Math.random()}`;
    
    await this.executeSql(
      `INSERT INTO mediaCache (
        id, url, localPath, mimeType, size, thumbnailPath,
        lastAccessedAt, expiresAt, downloadedAt, metadata
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id, media.url, media.localPath, media.mimeType, media.size,
        media.thumbnailPath, media.lastAccessedAt, media.expiresAt,
        media.downloadedAt, media.metadata || '{}'
      ]
    );
  }
  
  async cleanExpiredMedia(): Promise<number> {
    const result = await this.executeSql(
      'DELETE FROM mediaCache WHERE expiresAt < ?',
      [new Date().toISOString()]
    );
    
    return result.rowsAffected;
  }
  
  // Get entities pending sync
  async getPendingSyncEntities(entityType: string, limit: number = 100): Promise<any[]> {
    const result = await this.executeSql(
      `SELECT * FROM ${entityType} WHERE isDirty = 1 AND isDeleted = 0 LIMIT ?`,
      [limit]
    );
    
    const entities: any[] = [];
    for (let i = 0; i < result.rows.length; i++) {
      entities.push(result.rows.item(i));
    }
    
    return entities;
  }
  
  // Mark entities as synced
  async markSynced(entityType: string, id: string, syncVersion: number): Promise<void> {
    await this.executeSql(
      `UPDATE ${entityType} SET isDirty = 0, syncVersion = ?, lastSyncedAt = ? WHERE id = ?`,
      [syncVersion, new Date().toISOString(), id]
    );
  }
  
  // Get database statistics
  async getDatabaseStats(): Promise<{
    users: number;
    stories: number;
    events: number;
    messages: number;
    pendingSync: number;
    conflicts: number;
    cacheSize: number;
  }> {
    const stats = {
      users: 0,
      stories: 0,
      events: 0,
      messages: 0,
      pendingSync: 0,
      conflicts: 0,
      cacheSize: 0,
    };
    
    // Count entities
    const tables = ['users', 'stories', 'events', 'messages'];
    for (const table of tables) {
      const result = await this.executeSql(
        `SELECT COUNT(*) as count FROM ${table} WHERE isDeleted = 0`
      );
      stats[table as keyof typeof stats] = result.rows.item(0).count;
    }
    
    // Count pending sync items
    const syncResult = await this.executeSql(
      'SELECT COUNT(*) as count FROM syncQueue'
    );
    stats.pendingSync = syncResult.rows.item(0).count;
    
    // Count unresolved conflicts
    const conflictResult = await this.executeSql(
      'SELECT COUNT(*) as count FROM conflictLog WHERE resolvedAt IS NULL'
    );
    stats.conflicts = conflictResult.rows.item(0).count;
    
    // Calculate cache size
    const cacheResult = await this.executeSql(
      'SELECT SUM(size) as totalSize FROM mediaCache'
    );
    stats.cacheSize = cacheResult.rows.item(0).totalSize || 0;
    
    return stats;
  }
}

export default SyncDatabase;