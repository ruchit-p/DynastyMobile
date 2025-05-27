/**
 * Database Migration System for Dynasty Mobile
 * Handles schema versioning and updates
 */

import SQLite from 'react-native-sqlite-storage';
import { TABLE_SCHEMAS, DATABASE_INDEXES } from './schema';
import { logger } from '../services/LoggingService';

interface Migration {
  version: number;
  name: string;
  up: (db: SQLite.SQLiteDatabase) => Promise<void>;
  down: (db: SQLite.SQLiteDatabase) => Promise<void>;
}

// Migration definitions
export const migrations: Migration[] = [
  {
    version: 1,
    name: 'initial_schema',
    up: async (db: SQLite.SQLiteDatabase) => {
      // Create all tables
      await db.executeSql(TABLE_SCHEMAS.databaseInfo);
      await db.executeSql(TABLE_SCHEMAS.users);
      await db.executeSql(TABLE_SCHEMAS.stories);
      await db.executeSql(TABLE_SCHEMAS.events);
      await db.executeSql(TABLE_SCHEMAS.familyTrees);
      await db.executeSql(TABLE_SCHEMAS.messages);
      await db.executeSql(TABLE_SCHEMAS.syncQueue);
      await db.executeSql(TABLE_SCHEMAS.conflictLog);
      await db.executeSql(TABLE_SCHEMAS.mediaCache);
      await db.executeSql(TABLE_SCHEMAS.cacheMetadata);
      
      // Create indexes
      for (const table in DATABASE_INDEXES) {
        const indexes = DATABASE_INDEXES[table as keyof typeof DATABASE_INDEXES];
        for (const indexSql of indexes) {
          await db.executeSql(indexSql);
        }
      }
      
      // Initialize database info
      await db.executeSql(
        'INSERT INTO databaseInfo (id, version, lastMigration, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?)',
        [1, 1, 1, new Date().toISOString(), new Date().toISOString()]
      );
    },
    down: async (db: SQLite.SQLiteDatabase) => {
      // Drop all tables in reverse order
      await db.executeSql('DROP TABLE IF EXISTS cacheMetadata');
      await db.executeSql('DROP TABLE IF EXISTS mediaCache');
      await db.executeSql('DROP TABLE IF EXISTS conflictLog');
      await db.executeSql('DROP TABLE IF EXISTS syncQueue');
      await db.executeSql('DROP TABLE IF EXISTS messages');
      await db.executeSql('DROP TABLE IF EXISTS familyTrees');
      await db.executeSql('DROP TABLE IF EXISTS events');
      await db.executeSql('DROP TABLE IF EXISTS stories');
      await db.executeSql('DROP TABLE IF EXISTS users');
      await db.executeSql('DROP TABLE IF EXISTS databaseInfo');
    },
  },
];

export class MigrationRunner {
  private db: SQLite.SQLiteDatabase;
  
  constructor(db: SQLite.SQLiteDatabase) {
    this.db = db;
  }
  
  /**
   * Get current database version
   */
  async getCurrentVersion(): Promise<number> {
    try {
      const [result] = await this.db.executeSql(
        'SELECT version FROM databaseInfo WHERE id = 1'
      );
      
      if (result.rows.length > 0) {
        return result.rows.item(0).version;
      }
      return 0;
    } catch (error) {
      // Table doesn't exist yet
      return 0;
    }
  }
  
  /**
   * Run pending migrations
   */
  async runMigrations(): Promise<void> {
    const currentVersion = await this.getCurrentVersion();
    const pendingMigrations = migrations.filter(m => m.version > currentVersion);
    
    if (pendingMigrations.length === 0) {
      logger.debug('[Migration] Database is up to date');
      return;
    }
    
    logger.debug(`[Migration] Running ${pendingMigrations.length} migrations...`);
    
    for (const migration of pendingMigrations) {
      logger.debug(`[Migration] Running migration ${migration.version}: ${migration.name}`);
      
      try {
        await this.db.transaction(async (tx) => {
          // Run migration within transaction
          await migration.up(tx as any);
          
          // Update database version
          if (migration.version === 1) {
            // First migration creates the table
            return;
          }
          
          await tx.executeSql(
            'UPDATE databaseInfo SET version = ?, lastMigration = ?, updatedAt = ? WHERE id = 1',
            [migration.version, migration.version, new Date().toISOString()]
          );
        });
        
        logger.debug(`[Migration] Completed migration ${migration.version}`);
      } catch (error) {
        logger.error(`[Migration] Failed to run migration ${migration.version}:`, error);
        throw error;
      }
    }
    
    logger.debug('[Migration] All migrations completed successfully');
  }
  
  /**
   * Rollback to specific version
   */
  async rollbackTo(targetVersion: number): Promise<void> {
    const currentVersion = await this.getCurrentVersion();
    
    if (targetVersion >= currentVersion) {
      throw new Error(`Cannot rollback to version ${targetVersion} from current version ${currentVersion}`);
    }
    
    const rollbackMigrations = migrations
      .filter(m => m.version > targetVersion && m.version <= currentVersion)
      .reverse();
    
    logger.debug(`[Migration] Rolling back ${rollbackMigrations.length} migrations...`);
    
    for (const migration of rollbackMigrations) {
      logger.debug(`[Migration] Rolling back migration ${migration.version}: ${migration.name}`);
      
      try {
        await this.db.transaction(async (tx) => {
          // Run rollback within transaction
          await migration.down(tx as any);
          
          // Update database version
          if (migration.version === 1) {
            // Last rollback removes the table
            return;
          }
          
          await tx.executeSql(
            'UPDATE databaseInfo SET version = ?, lastMigration = ?, updatedAt = ? WHERE id = 1',
            [targetVersion, targetVersion, new Date().toISOString()]
          );
        });
        
        logger.debug(`[Migration] Rolled back migration ${migration.version}`);
      } catch (error) {
        logger.error(`[Migration] Failed to rollback migration ${migration.version}:`, error);
        throw error;
      }
    }
    
    logger.debug('[Migration] Rollback completed successfully');
  }
  
  /**
   * Reset database (rollback all migrations)
   */
  async reset(): Promise<void> {
    logger.debug('[Migration] Resetting database...');
    await this.rollbackTo(0);
  }
  
  /**
   * Get migration history
   */
  async getMigrationHistory(): Promise<{
    version: number;
    name: string;
    appliedAt?: string;
  }[]> {
    const currentVersion = await this.getCurrentVersion();
    
    return migrations.map(m => ({
      version: m.version,
      name: m.name,
      appliedAt: m.version <= currentVersion ? 'Applied' : undefined,
    }));
  }
}

/**
 * Initialize database with migrations
 */
export async function initializeDatabase(db: SQLite.SQLiteDatabase): Promise<void> {
  const runner = new MigrationRunner(db);
  await runner.runMigrations();
}

/**
 * Check if database needs migration
 */
export async function needsMigration(db: SQLite.SQLiteDatabase): Promise<boolean> {
  const runner = new MigrationRunner(db);
  const currentVersion = await runner.getCurrentVersion();
  const latestVersion = Math.max(...migrations.map(m => m.version));
  return currentVersion < latestVersion;
}