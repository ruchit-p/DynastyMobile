import { 
  getFirestore, 
  collection,
  doc,
  query,
  where,
  orderBy,
  limit,
  onSnapshot,
  type Firestore,
  type Query,
  type DocumentData,
  type Unsubscribe,
  type FirestoreError,
  type QuerySnapshot,
  type DocumentChange,
} from 'firebase/firestore';
import { type FirebaseApp } from 'firebase/app';
import { type VaultItem } from '../types/Vault';

/**
 * Callback types for real-time updates
 */
export type VaultItemsUpdateCallback = (items: VaultItem[]) => void;
export type VaultItemChangeCallback = (changes: VaultItemChange[]) => void;
export type VaultErrorCallback = (error: FirestoreError) => void;

export interface VaultItemChange {
  type: 'added' | 'modified' | 'removed';
  item: VaultItem;
  oldIndex?: number;
  newIndex?: number;
}

export interface VaultListenerOptions {
  parentId?: string | null;
  includeDeleted?: boolean;
  includeShared?: boolean;
  orderByField?: 'createdAt' | 'updatedAt' | 'name';
  orderDirection?: 'asc' | 'desc';
}

export interface VaultRealtimeConfig {
  app: FirebaseApp;
  enableOfflinePersistence?: boolean;
  cacheSizeBytes?: number;
}

/**
 * Service for real-time vault updates using Firestore listeners
 */
export class VaultRealtimeService {
  private db: Firestore;
  private listeners: Map<string, Unsubscribe> = new Map();
  private resumeTokens: Map<string, unknown> = new Map();

  constructor(config: VaultRealtimeConfig) {
    this.db = getFirestore(config.app);
  }

  /**
   * Subscribe to real-time updates for vault items
   */
  subscribeToVaultItems(
    userId: string,
    options: VaultListenerOptions,
    onUpdate: VaultItemsUpdateCallback,
    onError?: VaultErrorCallback,
    onChange?: VaultItemChangeCallback
  ): () => void {
    const listenerId = this.generateListenerId(userId, options);
    
    // Unsubscribe existing listener if any
    this.unsubscribe(listenerId);

    // Build query
    const vaultRef = collection(this.db, 'vaultItems');
    let q: Query<DocumentData> = query(vaultRef);

    // Add filters
    q = query(q, where('userId', '==', userId));
    
    if (!options.includeDeleted) {
      q = query(q, where('isDeleted', '==', false));
    }

    if (options.parentId !== undefined) {
      q = query(q, where('parentId', '==', options.parentId));
    }

    // Add ordering
    const orderField = options.orderByField || 'createdAt';
    const orderDir = options.orderDirection || 'desc';
    q = query(q, orderBy(orderField, orderDir));

    // Include shared items if requested
    if (options.includeShared) {
      // This would require a compound query or client-side filtering
      // For now, we'll handle this in the snapshot processing
    }

    // Set up snapshot listener
    const unsubscribe = onSnapshot(
      q,
      {
        includeMetadataChanges: false,
      },
      (snapshot: QuerySnapshot<DocumentData>) => {
        try {
          // Process all documents
          const items: VaultItem[] = [];
          const changes: VaultItemChange[] = [];

          snapshot.docs.forEach((doc) => {
            const data = doc.data();
            const item = this.convertFirestoreDocToVaultItem(doc.id, data);
            
            // Apply client-side filtering for shared items if needed
            if (options.includeShared || item.userId === userId) {
              items.push(item);
            }
          });

          // Process changes if callback provided
          if (onChange && !snapshot.metadata.fromCache) {
            snapshot.docChanges().forEach((change: DocumentChange<DocumentData>) => {
              const item = this.convertFirestoreDocToVaultItem(change.doc.id, change.doc.data());
              
              changes.push({
                type: change.type,
                item,
                oldIndex: change.oldIndex,
                newIndex: change.newIndex,
              });
            });

            if (changes.length > 0) {
              onChange(changes);
            }
          }

          // Call update callback with all items
          onUpdate(items);

          // Store resume token for potential reconnection
          this.resumeTokens.set(listenerId, snapshot.metadata);
        } catch (error) {
          console.error('Error processing vault snapshot:', error);
          if (onError && error instanceof Error) {
            onError(error as FirestoreError);
          }
        }
      },
      (error: FirestoreError) => {
        console.error('Vault listener error:', error);
        if (onError) {
          onError(error);
        }
      }
    );

    // Store listener
    this.listeners.set(listenerId, unsubscribe);

    // Return unsubscribe function
    return () => this.unsubscribe(listenerId);
  }

  /**
   * Subscribe to a specific vault item
   */
  subscribeToVaultItem(
    itemId: string,
    onUpdate: (item: VaultItem | null) => void,
    onError?: VaultErrorCallback
  ): () => void {
    const listenerId = `item-${itemId}`;
    
    // Unsubscribe existing listener if any
    this.unsubscribe(listenerId);

    const unsubscribe = onSnapshot(
      doc(this.db, 'vaultItems', itemId),
      (snapshot) => {
        if (snapshot.exists()) {
          const item = this.convertFirestoreDocToVaultItem(snapshot.id, snapshot.data());
          onUpdate(item);
        } else {
          onUpdate(null);
        }
      },
      (error: FirestoreError) => {
        console.error('Vault item listener error:', error);
        if (onError) {
          onError(error);
        }
      }
    );

    this.listeners.set(listenerId, unsubscribe);
    return () => this.unsubscribe(listenerId);
  }

  /**
   * Subscribe to vault storage stats for a user
   */
  subscribeToStorageStats(
    userId: string,
    onUpdate: (stats: { totalSize: number; fileCount: number }) => void,
    onError?: VaultErrorCallback
  ): () => void {
    const listenerId = `storage-${userId}`;
    
    this.unsubscribe(listenerId);

    const unsubscribe = onSnapshot(
      doc(this.db, 'userStorageUsage', userId),
      (snapshot) => {
        if (snapshot.exists()) {
          const data = snapshot.data();
          onUpdate({
            totalSize: data.totalBytes || 0,
            fileCount: data.fileCount || 0,
          });
        } else {
          onUpdate({ totalSize: 0, fileCount: 0 });
        }
      },
      (error: FirestoreError) => {
        console.error('Storage stats listener error:', error);
        if (onError) {
          onError(error);
        }
      }
    );

    this.listeners.set(listenerId, unsubscribe);
    return () => this.unsubscribe(listenerId);
  }

  /**
   * Subscribe to vault audit logs
   */
  subscribeToAuditLogs(
    userId: string,
    options: {
      limit?: number;
      actions?: string[];
    },
    onUpdate: (logs: Array<{
      id: string;
      action: string;
      itemId?: string;
      timestamp: Date;
      metadata?: any;
    }>) => void,
    onError?: VaultErrorCallback
  ): () => void {
    const listenerId = `audit-${userId}`;
    
    this.unsubscribe(listenerId);

    let q = query(
      collection(this.db, 'vaultAuditLogs'),
      where('userId', '==', userId),
      orderBy('timestamp', 'desc')
    );

    if (options.limit) {
      q = query(q, limit(options.limit));
    }

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const logs = snapshot.docs.map(doc => {
          const data = doc.data();
          return {
            id: doc.id,
            action: data.action || 'unknown',
            itemId: data.itemId,
            timestamp: data.timestamp?.toDate() || new Date(),
            metadata: data.metadata,
          };
        });

        // Apply client-side filtering for actions if specified
        const filteredLogs = options.actions?.length
          ? logs.filter(log => options.actions!.includes(log.action))
          : logs;

        onUpdate(filteredLogs);
      },
      (error: FirestoreError) => {
        console.error('Audit logs listener error:', error);
        if (onError) {
          onError(error);
        }
      }
    );

    this.listeners.set(listenerId, unsubscribe);
    return () => this.unsubscribe(listenerId);
  }

  /**
   * Unsubscribe from a specific listener
   */
  unsubscribe(listenerId: string): void {
    const unsubscribe = this.listeners.get(listenerId);
    if (unsubscribe) {
      unsubscribe();
      this.listeners.delete(listenerId);
      this.resumeTokens.delete(listenerId);
    }
  }

  /**
   * Unsubscribe from all listeners
   */
  unsubscribeAll(): void {
    this.listeners.forEach((unsubscribe) => unsubscribe());
    this.listeners.clear();
    this.resumeTokens.clear();
  }

  /**
   * Get active listener count
   */
  getActiveListenerCount(): number {
    return this.listeners.size;
  }

  /**
   * Convert Firestore document to VaultItem
   */
  private convertFirestoreDocToVaultItem(id: string, data: DocumentData): VaultItem {
    return {
      id,
      userId: data.userId,
      ownerId: data.ownerId || data.userId,
      name: data.name,
      type: data.type,
      parentId: data.parentId || null,
      path: data.path,
      createdAt: data.createdAt?.toDate?.()?.toISOString() || new Date().toISOString(),
      updatedAt: data.updatedAt?.toDate?.()?.toISOString() || new Date().toISOString(),
      
      // File-specific fields
      fileType: data.fileType,
      size: data.size,
      storagePath: data.storagePath,
      mimeType: data.mimeType,
      
      // Encryption fields
      isEncrypted: data.isEncrypted || false,
      encryptionKeyId: data.encryptionKeyId,
      encryptedBy: data.encryptedBy,
      encryptionMetadata: data.encryptionMetadata,
      
      // Sharing & permissions
      sharedWith: data.sharedWith || [],
      permissions: data.permissions,
      accessLevel: data.accessLevel,
      
      // Cloud storage
      storageProvider: data.storageProvider,
      r2Bucket: data.r2Bucket,
      r2Key: data.r2Key,
      b2Bucket: data.b2Bucket,
      b2Key: data.b2Key,
      
      // Security scanning
      scanStatus: data.scanStatus,
      scanResults: data.scanResults,
      quarantineInfo: data.quarantineInfo,
      
      // Soft delete
      isDeleted: data.isDeleted || false,
      
      // Cached URLs
      cachedDownloadUrl: data.cachedDownloadUrl,
      cachedDownloadUrlExpiry: data.cachedDownloadUrlExpiry,
      thumbnailUrl: data.thumbnailUrl,
    };
  }

  /**
   * Generate unique listener ID
   */
  private generateListenerId(userId: string, options: VaultListenerOptions): string {
    const parts = [
      'vault',
      userId,
      options.parentId || 'root',
      options.includeDeleted ? 'with-deleted' : 'no-deleted',
      options.includeShared ? 'with-shared' : 'no-shared',
    ];
    return parts.join('-');
  }
}

/**
 * Factory function to create VaultRealtimeService instance
 */
export function createVaultRealtimeService(config: VaultRealtimeConfig): VaultRealtimeService {
  return new VaultRealtimeService(config);
}