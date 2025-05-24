/**
 * Background Sync Task for Dynasty Mobile
 * Handles periodic syncing of messages and other data when app is in background
 * Using Expo Background Task API
 */

import * as BackgroundTask from 'expo-background-task';
import * as TaskManager from 'expo-task-manager';
import { getMessageSyncService } from './MessageSyncService';
import { getFirebaseAuth } from '../lib/firebase';
import { SyncDatabase } from '../database/SyncDatabase';
import NetInfo from '@react-native-community/netinfo';

// MARK: - Constants
const BACKGROUND_SYNC_TASK_NAME = 'dynasty-background-sync';

// MARK: - Task Definition (Global Scope)
// Define the background task - this must be in global scope
TaskManager.defineTask(BACKGROUND_SYNC_TASK_NAME, async () => {
  try {
    console.log('[BackgroundSync] Background task started at:', new Date().toISOString());
    
    // Get the singleton instance and perform sync
    const syncService = BackgroundSyncTask.getInstance();
    await syncService.performSyncOperation();
    
    console.log('[BackgroundSync] Background task completed successfully');
    return BackgroundTask.BackgroundTaskResult.Success;
  } catch (error) {
    console.error('[BackgroundSync] Background task failed:', error);
    return BackgroundTask.BackgroundTaskResult.Failed;
  }
});

export class BackgroundSyncTask {
  private static instance: BackgroundSyncTask;
  private isConfigured = false;
  private isRegistered = false;

  private constructor() {}

  static getInstance(): BackgroundSyncTask {
    if (!BackgroundSyncTask.instance) {
      BackgroundSyncTask.instance = new BackgroundSyncTask();
    }
    return BackgroundSyncTask.instance;
  }

  /**
   * Configure and register background sync task
   */
  async configure(): Promise<void> {
    if (this.isConfigured) {
      console.log('[BackgroundSync] Already configured');
      return;
    }

    try {
      // Check if background tasks are available
      const status = await BackgroundTask.getStatusAsync();
      console.log('[BackgroundSync] Background task status:', BackgroundTask.BackgroundTaskStatus[status]);

      if (status === BackgroundTask.BackgroundTaskStatus.Restricted) {
        console.warn('[BackgroundSync] Background tasks are restricted on this device');
        return;
      }

      // Register the background task
      await this.registerTask();
      
      this.isConfigured = true;
      console.log('[BackgroundSync] Configuration complete');
      
    } catch (error) {
      console.error('[BackgroundSync] Configuration failed:', error);
      throw error;
    }
  }

  /**
   * Register the background task
   */
  private async registerTask(): Promise<void> {
    try {
      // Register the task with options
      // Note: If the task is already registered, this will update it
      await BackgroundTask.registerTaskAsync(BACKGROUND_SYNC_TASK_NAME, {
        minimumInterval: 15, // 15 minutes minimum interval
      });

      this.isRegistered = true;
      console.log('[BackgroundSync] Background task registered successfully');
      
    } catch (error) {
      console.error('[BackgroundSync] Failed to register background task:', error);
      throw error;
    }
  }

  /**
   * Perform background sync operation
   * This method is called by the background task
   */
  async performSyncOperation(): Promise<void> {
    console.log('[BackgroundSync] Starting sync operation...');

    try {
      // Check network connectivity
      const netInfo = await NetInfo.fetch();
      if (!netInfo.isConnected) {
        console.log('[BackgroundSync] No network connection, skipping sync');
        return;
      }

      // Check if user is authenticated
      const auth = getFirebaseAuth();
      const currentUser = auth.currentUser;
      if (!currentUser) {
        console.log('[BackgroundSync] No authenticated user, skipping sync');
        return;
      }

      const syncService = getMessageSyncService();
      const sqliteDb = SyncDatabase.getInstance();
      await sqliteDb.open();

      // 1. Process message queue
      console.log('[BackgroundSync] Processing message queue...');
      await syncService.retryFailedMessages();

      // 2. Sync recent conversations
      console.log('[BackgroundSync] Syncing conversations...');
      await syncService.syncConversations(currentUser.uid);

      // 3. Clean up expired media cache
      console.log('[BackgroundSync] Cleaning expired media...');
      const cleaned = await sqliteDb.cleanExpiredMedia();
      if (cleaned > 0) {
        console.log(`[BackgroundSync] Cleaned ${cleaned} expired media items`);
      }

      // 4. Get sync statistics
      const stats = await sqliteDb.getDatabaseStats();
      console.log('[BackgroundSync] Sync complete. Stats:', stats);

    } catch (error) {
      console.error('[BackgroundSync] Sync operation failed:', error);
      throw error;
    }
  }

  /**
   * Trigger immediate sync for testing (development only)
   */
  async triggerSyncForTesting(): Promise<boolean> {
    if (__DEV__) {
      try {
        console.log('[BackgroundSync] Triggering sync for testing...');
        const result = await BackgroundTask.triggerTaskWorkerForTestingAsync();
        console.log('[BackgroundSync] Test trigger result:', result);
        return result;
      } catch (error) {
        console.error('[BackgroundSync] Failed to trigger test sync:', error);
        return false;
      }
    } else {
      console.warn('[BackgroundSync] Test trigger only available in development mode');
      return false;
    }
  }

  /**
   * Stop and unregister background sync
   */
  async stop(): Promise<void> {
    try {
      if (this.isRegistered) {
        await BackgroundTask.unregisterTaskAsync(BACKGROUND_SYNC_TASK_NAME);
        this.isRegistered = false;
        console.log('[BackgroundSync] Background task unregistered');
      }
      
      this.isConfigured = false;
      console.log('[BackgroundSync] Background sync stopped');
      
    } catch (error) {
      console.error('[BackgroundSync] Failed to stop sync:', error);
      throw error;
    }
  }

  /**
   * Get sync status and configuration
   */
  async getStatus(): Promise<{
    available: boolean;
    configured: boolean;
    registered: boolean;
    status: BackgroundTask.BackgroundTaskStatus;
  }> {
    try {
      const status = await BackgroundTask.getStatusAsync();
      
      return {
        available: status === BackgroundTask.BackgroundTaskStatus.Available,
        configured: this.isConfigured,
        registered: this.isRegistered,
        status,
      };
    } catch (error) {
      console.error('[BackgroundSync] Failed to get status:', error);
      return {
        available: false,
        configured: this.isConfigured,
        registered: this.isRegistered,
        status: BackgroundTask.BackgroundTaskStatus.Restricted,
      };
    }
  }

  /**
   * Check if background sync is properly configured
   */
  isConfiguredAndRegistered(): boolean {
    return this.isConfigured && this.isRegistered;
  }
}

// Export singleton instance
export const backgroundSyncTask = BackgroundSyncTask.getInstance();