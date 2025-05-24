/**
 * SQLite Database Schema for Dynasty Mobile App
 * Designed for offline-first operation with Firebase sync
 */

export interface DatabaseInfo {
  version: number;
  lastMigration: number;
  createdAt: string;
  updatedAt: string;
}

// Base fields for all synced entities
export interface SyncableEntity {
  id: string;
  localId?: string; // For items created offline
  createdAt: string;
  updatedAt: string;
  lastSyncedAt?: string;
  syncVersion: number;
  isDirty: boolean;
  isDeleted: boolean;
  deviceId: string;
}

// User table - cached user profiles
export interface LocalUser extends SyncableEntity {
  email: string;
  firstName: string;
  lastName: string;
  displayName?: string;
  photoURL?: string;
  phoneNumber?: string;
  dateOfBirth?: string;
  gender?: string;
  bio?: string;
  profileVisibility: 'family' | 'friends' | 'private';
  notificationSettings: string; // JSON
  familyIds: string; // JSON array
  metadata: string; // JSON for additional fields
}

// Story table
export interface LocalStory extends SyncableEntity {
  authorId: string;
  title: string;
  content: string; // JSON array of blocks
  summary?: string;
  coverImage?: string;
  visibility: 'public' | 'family' | 'private' | 'custom';
  viewerIds?: string; // JSON array
  tags?: string; // JSON array
  location?: string; // JSON object
  eventDate?: string;
  mediaItems: string; // JSON array of media references
  reactions: string; // JSON object
  commentCount: number;
  viewCount: number;
  isArchived: boolean;
  metadata: string; // JSON
}

// Event table
export interface LocalEvent extends SyncableEntity {
  organizerId: string;
  title: string;
  description?: string;
  startDate: string;
  endDate: string;
  location: string; // JSON object with address, coordinates
  visibility: 'public' | 'family' | 'private' | 'custom';
  viewerIds?: string; // JSON array
  capacity?: number;
  rsvpEnabled: boolean;
  guestList: string; // JSON array of guest objects
  coverImage?: string;
  mediaItems: string; // JSON array
  recurring?: string; // JSON object for recurring rules
  reminders: string; // JSON array
  metadata: string; // JSON
}

// Family tree table - denormalized for performance
export interface LocalFamilyTree extends SyncableEntity {
  familyId: string;
  name: string;
  description?: string;
  members: string; // JSON array of member objects
  relationships: string; // JSON array of relationship objects
  settings: string; // JSON object
  version: number;
  metadata: string; // JSON
}

// Message table - for encrypted chat
export interface LocalMessage extends SyncableEntity {
  conversationId: string;
  senderId: string;
  recipientId?: string; // For direct messages
  recipientIds?: string; // JSON array for group messages
  encryptedContent: string;
  messageType: 'text' | 'image' | 'video' | 'audio' | 'file';
  mediaUrl?: string;
  deliveryStatus: 'pending' | 'sent' | 'delivered' | 'read' | 'failed';
  readBy?: string; // JSON object with userId: timestamp
  replyToId?: string;
  metadata: string; // JSON
}

// Sync queue for offline operations
export interface SyncQueueItem {
  id: string;
  operationType: 'create' | 'update' | 'delete';
  entityType: 'user' | 'story' | 'event' | 'familyTree' | 'message';
  entityId: string;
  data: string; // JSON payload
  retryCount: number;
  maxRetries: number;
  lastAttempt?: string;
  error?: string;
  priority: number; // Higher = more important
  createdAt: string;
  deviceId: string;
}

// Conflict log for sync conflicts
export interface ConflictLog {
  id: string;
  entityType: string;
  entityId: string;
  localVersion: string; // JSON
  remoteVersion: string; // JSON
  conflictType: 'update-update' | 'delete-update' | 'create-create';
  resolveStrategy?: 'local' | 'remote' | 'merge' | 'manual';
  resolvedAt?: string;
  resolvedBy?: string;
  metadata: string; // JSON
  createdAt: string;
  deviceId: string;
}

// Media cache table
export interface MediaCache {
  id: string;
  url: string;
  localPath: string;
  mimeType: string;
  size: number;
  thumbnailPath?: string;
  lastAccessedAt: string;
  expiresAt?: string;
  downloadedAt: string;
  metadata: string; // JSON
}

// Cache metadata table
export interface CacheMetadata {
  id: string;
  entityType: string;
  entityId: string;
  cacheKey: string;
  size: number;
  lastAccessedAt: string;
  expiresAt?: string;
  accessCount: number;
  metadata: string; // JSON
}

// Database indexes configuration
export const DATABASE_INDEXES = {
  users: [
    'CREATE INDEX idx_users_email ON users(email)',
    'CREATE INDEX idx_users_sync ON users(isDirty, lastSyncedAt)',
  ],
  stories: [
    'CREATE INDEX idx_stories_author ON stories(authorId)',
    'CREATE INDEX idx_stories_visibility ON stories(visibility)',
    'CREATE INDEX idx_stories_sync ON stories(isDirty, lastSyncedAt)',
    'CREATE INDEX idx_stories_created ON stories(createdAt DESC)',
  ],
  events: [
    'CREATE INDEX idx_events_organizer ON events(organizerId)',
    'CREATE INDEX idx_events_date ON events(startDate)',
    'CREATE INDEX idx_events_sync ON events(isDirty, lastSyncedAt)',
  ],
  familyTrees: [
    'CREATE INDEX idx_family_trees_family ON familyTrees(familyId)',
    'CREATE INDEX idx_family_trees_sync ON familyTrees(isDirty, lastSyncedAt)',
  ],
  messages: [
    'CREATE INDEX idx_messages_conversation ON messages(conversationId)',
    'CREATE INDEX idx_messages_sender ON messages(senderId)',
    'CREATE INDEX idx_messages_status ON messages(deliveryStatus)',
    'CREATE INDEX idx_messages_sync ON messages(isDirty, lastSyncedAt)',
    'CREATE INDEX idx_messages_created ON messages(createdAt DESC)',
  ],
  syncQueue: [
    'CREATE INDEX idx_sync_queue_priority ON syncQueue(priority DESC, createdAt)',
    'CREATE INDEX idx_sync_queue_entity ON syncQueue(entityType, entityId)',
    'CREATE INDEX idx_sync_queue_retry ON syncQueue(retryCount, lastAttempt)',
  ],
  conflictLog: [
    'CREATE INDEX idx_conflicts_entity ON conflictLog(entityType, entityId)',
    'CREATE INDEX idx_conflicts_unresolved ON conflictLog(resolvedAt) WHERE resolvedAt IS NULL',
  ],
  mediaCache: [
    'CREATE INDEX idx_media_cache_url ON mediaCache(url)',
    'CREATE INDEX idx_media_cache_access ON mediaCache(lastAccessedAt)',
    'CREATE INDEX idx_media_cache_expires ON mediaCache(expiresAt)',
  ],
  cacheMetadata: [
    'CREATE INDEX idx_cache_meta_entity ON cacheMetadata(entityType, entityId)',
    'CREATE INDEX idx_cache_meta_key ON cacheMetadata(cacheKey)',
    'CREATE INDEX idx_cache_meta_access ON cacheMetadata(lastAccessedAt)',
  ],
};

// Table creation SQL
export const TABLE_SCHEMAS = {
  databaseInfo: `
    CREATE TABLE IF NOT EXISTS databaseInfo (
      id INTEGER PRIMARY KEY,
      version INTEGER NOT NULL,
      lastMigration INTEGER NOT NULL,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL
    )
  `,
  
  users: `
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      localId TEXT,
      email TEXT NOT NULL,
      firstName TEXT NOT NULL,
      lastName TEXT NOT NULL,
      displayName TEXT,
      photoURL TEXT,
      phoneNumber TEXT,
      dateOfBirth TEXT,
      gender TEXT,
      bio TEXT,
      profileVisibility TEXT NOT NULL DEFAULT 'family',
      notificationSettings TEXT NOT NULL DEFAULT '{}',
      familyIds TEXT NOT NULL DEFAULT '[]',
      metadata TEXT NOT NULL DEFAULT '{}',
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL,
      lastSyncedAt TEXT,
      syncVersion INTEGER NOT NULL DEFAULT 0,
      isDirty INTEGER NOT NULL DEFAULT 0,
      isDeleted INTEGER NOT NULL DEFAULT 0,
      deviceId TEXT NOT NULL
    )
  `,
  
  stories: `
    CREATE TABLE IF NOT EXISTS stories (
      id TEXT PRIMARY KEY,
      localId TEXT,
      authorId TEXT NOT NULL,
      title TEXT NOT NULL,
      content TEXT NOT NULL,
      summary TEXT,
      coverImage TEXT,
      visibility TEXT NOT NULL DEFAULT 'family',
      viewerIds TEXT,
      tags TEXT DEFAULT '[]',
      location TEXT,
      eventDate TEXT,
      mediaItems TEXT NOT NULL DEFAULT '[]',
      reactions TEXT NOT NULL DEFAULT '{}',
      commentCount INTEGER NOT NULL DEFAULT 0,
      viewCount INTEGER NOT NULL DEFAULT 0,
      isArchived INTEGER NOT NULL DEFAULT 0,
      metadata TEXT NOT NULL DEFAULT '{}',
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL,
      lastSyncedAt TEXT,
      syncVersion INTEGER NOT NULL DEFAULT 0,
      isDirty INTEGER NOT NULL DEFAULT 0,
      isDeleted INTEGER NOT NULL DEFAULT 0,
      deviceId TEXT NOT NULL
    )
  `,
  
  events: `
    CREATE TABLE IF NOT EXISTS events (
      id TEXT PRIMARY KEY,
      localId TEXT,
      organizerId TEXT NOT NULL,
      title TEXT NOT NULL,
      description TEXT,
      startDate TEXT NOT NULL,
      endDate TEXT NOT NULL,
      location TEXT NOT NULL,
      visibility TEXT NOT NULL DEFAULT 'family',
      viewerIds TEXT,
      capacity INTEGER,
      rsvpEnabled INTEGER NOT NULL DEFAULT 0,
      guestList TEXT NOT NULL DEFAULT '[]',
      coverImage TEXT,
      mediaItems TEXT NOT NULL DEFAULT '[]',
      recurring TEXT,
      reminders TEXT NOT NULL DEFAULT '[]',
      metadata TEXT NOT NULL DEFAULT '{}',
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL,
      lastSyncedAt TEXT,
      syncVersion INTEGER NOT NULL DEFAULT 0,
      isDirty INTEGER NOT NULL DEFAULT 0,
      isDeleted INTEGER NOT NULL DEFAULT 0,
      deviceId TEXT NOT NULL
    )
  `,
  
  familyTrees: `
    CREATE TABLE IF NOT EXISTS familyTrees (
      id TEXT PRIMARY KEY,
      localId TEXT,
      familyId TEXT NOT NULL,
      name TEXT NOT NULL,
      description TEXT,
      members TEXT NOT NULL DEFAULT '[]',
      relationships TEXT NOT NULL DEFAULT '[]',
      settings TEXT NOT NULL DEFAULT '{}',
      version INTEGER NOT NULL DEFAULT 1,
      metadata TEXT NOT NULL DEFAULT '{}',
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL,
      lastSyncedAt TEXT,
      syncVersion INTEGER NOT NULL DEFAULT 0,
      isDirty INTEGER NOT NULL DEFAULT 0,
      isDeleted INTEGER NOT NULL DEFAULT 0,
      deviceId TEXT NOT NULL
    )
  `,
  
  messages: `
    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      localId TEXT,
      conversationId TEXT NOT NULL,
      senderId TEXT NOT NULL,
      recipientId TEXT,
      recipientIds TEXT,
      encryptedContent TEXT NOT NULL,
      messageType TEXT NOT NULL DEFAULT 'text',
      mediaUrl TEXT,
      deliveryStatus TEXT NOT NULL DEFAULT 'pending',
      readBy TEXT DEFAULT '{}',
      replyToId TEXT,
      metadata TEXT NOT NULL DEFAULT '{}',
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL,
      lastSyncedAt TEXT,
      syncVersion INTEGER NOT NULL DEFAULT 0,
      isDirty INTEGER NOT NULL DEFAULT 0,
      isDeleted INTEGER NOT NULL DEFAULT 0,
      deviceId TEXT NOT NULL
    )
  `,
  
  syncQueue: `
    CREATE TABLE IF NOT EXISTS syncQueue (
      id TEXT PRIMARY KEY,
      operationType TEXT NOT NULL,
      entityType TEXT NOT NULL,
      entityId TEXT NOT NULL,
      data TEXT NOT NULL,
      retryCount INTEGER NOT NULL DEFAULT 0,
      maxRetries INTEGER NOT NULL DEFAULT 3,
      lastAttempt TEXT,
      error TEXT,
      priority INTEGER NOT NULL DEFAULT 0,
      createdAt TEXT NOT NULL,
      deviceId TEXT NOT NULL
    )
  `,
  
  conflictLog: `
    CREATE TABLE IF NOT EXISTS conflictLog (
      id TEXT PRIMARY KEY,
      entityType TEXT NOT NULL,
      entityId TEXT NOT NULL,
      localVersion TEXT NOT NULL,
      remoteVersion TEXT NOT NULL,
      conflictType TEXT NOT NULL,
      resolveStrategy TEXT,
      resolvedAt TEXT,
      resolvedBy TEXT,
      metadata TEXT NOT NULL DEFAULT '{}',
      createdAt TEXT NOT NULL,
      deviceId TEXT NOT NULL
    )
  `,
  
  mediaCache: `
    CREATE TABLE IF NOT EXISTS mediaCache (
      id TEXT PRIMARY KEY,
      url TEXT NOT NULL UNIQUE,
      localPath TEXT NOT NULL,
      mimeType TEXT NOT NULL,
      size INTEGER NOT NULL,
      thumbnailPath TEXT,
      lastAccessedAt TEXT NOT NULL,
      expiresAt TEXT,
      downloadedAt TEXT NOT NULL,
      metadata TEXT NOT NULL DEFAULT '{}'
    )
  `,
  
  cacheMetadata: `
    CREATE TABLE IF NOT EXISTS cacheMetadata (
      id TEXT PRIMARY KEY,
      entityType TEXT NOT NULL,
      entityId TEXT NOT NULL,
      cacheKey TEXT NOT NULL,
      size INTEGER NOT NULL,
      lastAccessedAt TEXT NOT NULL,
      expiresAt TEXT,
      accessCount INTEGER NOT NULL DEFAULT 1,
      metadata TEXT NOT NULL DEFAULT '{}'
    )
  `,
};