import { FirebaseFirestoreTypes } from '@react-native-firebase/firestore';
import { getErrorMessage } from '../lib/errorUtils';
import { getFirebaseDb } from '../lib/firebase';

// Types
export interface UserProfile {
  id: string;
  email: string;
  displayName?: string;
  profileImageUrl?: string;
  phoneNumber?: string;
  dateOfBirth?: Date;
  gender?: string;
  bio?: string;
  lastModified: FirebaseFirestoreTypes.Timestamp;
}

export interface UserSettings {
  userId: string;
  notifications: {
    push: boolean;
    email: boolean;
    sms: boolean;
  };
  privacy: {
    profileVisibility: 'public' | 'family' | 'private';
    showEmail: boolean;
    showPhone: boolean;
  };
  lastModified: FirebaseFirestoreTypes.Timestamp;
}

export interface SyncOperation {
  id: string;
  type: 'create' | 'update' | 'delete';
  entityType: 'profile' | 'settings';
  data: any;
  timestamp: Date;
  status: 'pending' | 'syncing' | 'completed' | 'failed';
  retryCount: number;
}

export interface ConflictResolution {
  strategy: 'local' | 'remote' | 'merge' | 'manual';
  resolvedData?: any;
}

// Interface
export interface IUserSyncService {
  syncUserProfile(userId: string): Promise<void>;
  syncUserSettings(userId: string): Promise<void>;
  resolveUserConflicts(localData: any, remoteData: any): Promise<ConflictResolution>;
  queueOperation(operation: Omit<SyncOperation, 'id' | 'status' | 'retryCount'>): Promise<string>;
  processQueue(): Promise<void>;
  getQueueStatus(): Promise<{ pending: number; failed: number }>;
}

// Implementation
export class UserSyncService implements IUserSyncService {
  private static instance: UserSyncService;
  private syncQueue: Map<string, SyncOperation> = new Map();
  private isSyncing = false;

  private constructor() {
    console.log('[UserSyncService] Initialized');
  }

  static getInstance(): UserSyncService {
    if (!UserSyncService.instance) {
      UserSyncService.instance = new UserSyncService();
    }
    return UserSyncService.instance;
  }

  async syncUserProfile(userId: string): Promise<void> {
    console.log(`[UserSyncService] Syncing user profile for userId: ${userId}`);
    
    try {
      // TODO: Implement actual sync logic
      // 1. Get local profile from AsyncStorage/SQLite
      // 2. Get remote profile from Firestore
      // 3. Compare timestamps and resolve conflicts
      // 4. Update local or remote based on resolution
      // 5. Update sync metadata
      
      const db = getFirebaseDb();
      const userDoc = await db.collection('users').doc(userId).get();
      
      if (userDoc.exists) {
        const remoteProfile = userDoc.data() as UserProfile;
        console.log(`[UserSyncService] Remote profile found:`, remoteProfile);
        
        // TODO: Compare with local data and sync
        // For now, just log the operation
        await this.queueOperation({
          type: 'update',
          entityType: 'profile',
          data: remoteProfile,
          timestamp: new Date()
        });
      }
    } catch (error) {
      console.error('[UserSyncService] Error syncing user profile:', getErrorMessage(error));
      throw error;
    }
  }

  async syncUserSettings(userId: string): Promise<void> {
    console.log(`[UserSyncService] Syncing user settings for userId: ${userId}`);
    
    try {
      // TODO: Implement settings sync
      // 1. Get local settings
      // 2. Get remote settings from Firestore
      // 3. Merge based on lastModified timestamps
      // 4. Handle notification token updates
      // 5. Update privacy settings atomically
      
      const db = getFirebaseDb();
      const settingsDoc = await db.collection('userSettings').doc(userId).get();
      
      if (settingsDoc.exists) {
        const remoteSettings = settingsDoc.data() as UserSettings;
        console.log(`[UserSyncService] Remote settings found:`, remoteSettings);
        
        // TODO: Implement merge logic
        await this.queueOperation({
          type: 'update',
          entityType: 'settings',
          data: remoteSettings,
          timestamp: new Date()
        });
      }
    } catch (error) {
      console.error('[UserSyncService] Error syncing user settings:', getErrorMessage(error));
      throw error;
    }
  }

  async resolveUserConflicts(localData: any, remoteData: any): Promise<ConflictResolution> {
    console.log('[UserSyncService] Resolving conflicts between:', { localData, remoteData });
    
    try {
      // TODO: Implement conflict resolution strategies
      // 1. Compare lastModified timestamps
      // 2. For profile: prefer most recent unless manual merge needed
      // 3. For settings: merge non-conflicting fields, prefer local for privacy
      // 4. Handle special cases (e.g., profile image conflicts)
      
      const localTimestamp = localData.lastModified?.toMillis() || 0;
      const remoteTimestamp = remoteData.lastModified?.toMillis() || 0;
      
      if (localTimestamp > remoteTimestamp) {
        return {
          strategy: 'local',
          resolvedData: localData
        };
      } else if (remoteTimestamp > localTimestamp) {
        return {
          strategy: 'remote',
          resolvedData: remoteData
        };
      } else {
        // TODO: Implement merge strategy
        return {
          strategy: 'merge',
          resolvedData: { ...remoteData, ...localData }
        };
      }
    } catch (error) {
      console.error('[UserSyncService] Error resolving conflicts:', getErrorMessage(error));
      throw error;
    }
  }

  async queueOperation(operation: Omit<SyncOperation, 'id' | 'status' | 'retryCount'>): Promise<string> {
    const id = `op_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const syncOp: SyncOperation = {
      ...operation,
      id,
      status: 'pending',
      retryCount: 0
    };
    
    this.syncQueue.set(id, syncOp);
    console.log(`[UserSyncService] Queued operation ${id}:`, syncOp);
    
    // TODO: Persist queue to AsyncStorage for reliability
    
    return id;
  }

  async processQueue(): Promise<void> {
    if (this.isSyncing) {
      console.log('[UserSyncService] Already processing queue');
      return;
    }
    
    this.isSyncing = true;
    console.log('[UserSyncService] Processing sync queue...');
    
    try {
      const pendingOps = Array.from(this.syncQueue.values())
        .filter(op => op.status === 'pending' || op.status === 'failed');
      
      for (const op of pendingOps) {
        try {
          op.status = 'syncing';
          console.log(`[UserSyncService] Processing operation ${op.id}`);
          
          // TODO: Implement actual sync based on operation type
          // For now, simulate processing
          await new Promise(resolve => setTimeout(resolve, 100));
          
          op.status = 'completed';
          this.syncQueue.delete(op.id);
        } catch (error) {
          console.error(`[UserSyncService] Failed to process operation ${op.id}:`, error);
          op.status = 'failed';
          op.retryCount++;
          
          // TODO: Implement exponential backoff
          if (op.retryCount >= 3) {
            console.error(`[UserSyncService] Operation ${op.id} failed after 3 retries`);
            // TODO: Move to dead letter queue
          }
        }
      }
    } finally {
      this.isSyncing = false;
    }
  }

  async getQueueStatus(): Promise<{ pending: number; failed: number }> {
    const operations = Array.from(this.syncQueue.values());
    return {
      pending: operations.filter(op => op.status === 'pending').length,
      failed: operations.filter(op => op.status === 'failed').length
    };
  }
}

// Export singleton instance getter
export const getUserSyncService = () => UserSyncService.getInstance();