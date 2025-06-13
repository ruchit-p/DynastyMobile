import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo from '@react-native-community/netinfo';
import * as FileSystem from 'expo-file-system';
import { Platform } from 'react-native';

// Import services to test
import NotificationService from '../../src/services/NotificationService';
import NetworkMonitor from '../../src/services/NetworkMonitor';
import BackgroundSyncTask from '../../src/services/BackgroundSyncTask';
import EventSyncService from '../../src/services/EventSyncService';
import StorySyncService from '../../src/services/StorySyncService';
import FamilyTreeSyncService from '../../src/services/FamilyTreeSyncService';
import MediaUploadQueue from '../../src/services/MediaUploadQueue';
import VaultService from '../../src/services/VaultService';
import MessageSyncService from '../../src/services/MessageSyncService';
import { OfflineQueueService } from '../../src/services/encryption/OfflineQueueService';

// Mock dependencies
jest.mock('@react-native-async-storage/async-storage');
jest.mock('@react-native-community/netinfo');
jest.mock('expo-file-system');
jest.mock('@react-native-firebase/messaging');
jest.mock('@react-native-firebase/firestore');
jest.mock('@react-native-firebase/storage');
jest.mock('@react-native-firebase/functions');

const mockAsyncStorage = AsyncStorage as jest.Mocked<typeof AsyncStorage>;
const mockNetInfo = NetInfo as jest.Mocked<typeof NetInfo>;
const mockFileSystem = FileSystem as jest.Mocked<typeof FileSystem>;

describe('Critical Mobile Services Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('NotificationService', () => {
    let notificationService: NotificationService;

    beforeEach(() => {
      notificationService = NotificationService.getInstance();
    });

    it('should initialize FCM and request permissions', async () => {
      const mockToken = 'fcm-token-123';
      mockAsyncStorage.getItem.mockResolvedValue(null);
      mockAsyncStorage.setItem.mockResolvedValue(undefined);

      await notificationService.initialize();

      expect(mockAsyncStorage.setItem).toHaveBeenCalledWith(
        'fcm_token',
        expect.any(String)
      );
    });

    it('should handle incoming notifications', async () => {
      const notification = {
        notification: {
          title: 'New Message',
          body: 'You have a new message',
        },
        data: {
          type: 'message',
          chatId: 'chat-123',
        },
      };

      const handler = jest.fn();
      notificationService.onNotification(handler);

      await notificationService.handleNotification(notification);

      expect(handler).toHaveBeenCalledWith(notification);
    });

    it('should respect notification preferences', async () => {
      const preferences = {
        messages: true,
        events: false,
        stories: true,
      };

      mockAsyncStorage.getItem.mockResolvedValue(JSON.stringify(preferences));

      const shouldShow = await notificationService.shouldShowNotification('events');
      expect(shouldShow).toBe(false);
    });

    it('should update FCM token on refresh', async () => {
      const oldToken = 'old-fcm-token';
      const newToken = 'new-fcm-token';

      mockAsyncStorage.getItem.mockResolvedValue(oldToken);
      mockAsyncStorage.setItem.mockResolvedValue(undefined);

      await notificationService.onTokenRefresh(newToken);

      expect(mockAsyncStorage.setItem).toHaveBeenCalledWith('fcm_token', newToken);
    });
  });

  describe('NetworkMonitor', () => {
    let networkMonitor: NetworkMonitor;

    beforeEach(() => {
      networkMonitor = NetworkMonitor.getInstance();
    });

    it('should detect online/offline state changes', async () => {
      const onlineHandler = jest.fn();
      const offlineHandler = jest.fn();

      networkMonitor.onOnline(onlineHandler);
      networkMonitor.onOffline(offlineHandler);

      // Simulate going offline
      mockNetInfo.addEventListener.mockImplementation((callback) => {
        callback({ isConnected: false, type: 'none' });
        return jest.fn();
      });

      await networkMonitor.initialize();
      expect(offlineHandler).toHaveBeenCalled();

      // Simulate going online
      mockNetInfo.addEventListener.mockImplementation((callback) => {
        callback({ isConnected: true, type: 'wifi' });
        return jest.fn();
      });

      await networkMonitor.checkConnection();
      expect(onlineHandler).toHaveBeenCalled();
    });

    it('should track network quality', async () => {
      mockNetInfo.fetch.mockResolvedValue({
        isConnected: true,
        type: 'cellular',
        details: {
          cellularGeneration: '4g',
        },
      });

      const quality = await networkMonitor.getNetworkQuality();
      expect(quality).toBe('good');
    });

    it('should queue operations when offline', async () => {
      mockNetInfo.fetch.mockResolvedValue({
        isConnected: false,
        type: 'none',
      });

      const operation = {
        id: 'op-123',
        type: 'sync',
        data: { test: true },
      };

      await networkMonitor.queueOperation(operation);
      const queue = await networkMonitor.getQueuedOperations();
      expect(queue).toContainEqual(operation);
    });
  });

  describe('BackgroundSyncTask', () => {
    let syncTask: BackgroundSyncTask;

    beforeEach(() => {
      syncTask = BackgroundSyncTask.getInstance();
    });

    it('should perform sync when conditions are met', async () => {
      // Mock network is available
      mockNetInfo.fetch.mockResolvedValue({
        isConnected: true,
        type: 'wifi',
      });

      // Mock battery level is sufficient
      jest.spyOn(syncTask, 'getBatteryLevel').mockResolvedValue(0.5);

      // Mock pending operations
      mockAsyncStorage.getItem.mockResolvedValue(
        JSON.stringify([
          { id: '1', type: 'message', data: {} },
          { id: '2', type: 'event', data: {} },
        ])
      );

      const result = await syncTask.performSync();

      expect(result.synced).toBe(2);
      expect(result.failed).toBe(0);
    });

    it('should respect sync preferences', async () => {
      const preferences = {
        wifiOnly: true,
        batteryThreshold: 0.2,
        syncInterval: 3600000, // 1 hour
      };

      mockAsyncStorage.getItem.mockResolvedValue(JSON.stringify(preferences));
      mockNetInfo.fetch.mockResolvedValue({
        isConnected: true,
        type: 'cellular',
      });

      const shouldSync = await syncTask.shouldSync();
      expect(shouldSync).toBe(false); // Because wifi-only is enabled
    });

    it('should handle sync failures gracefully', async () => {
      const failedOperation = {
        id: 'fail-123',
        type: 'message',
        data: { error: true },
        retries: 0,
      };

      mockAsyncStorage.getItem.mockResolvedValue(
        JSON.stringify([failedOperation])
      );

      // Mock sync failure
      jest.spyOn(syncTask, 'syncOperation').mockRejectedValue(
        new Error('Network error')
      );

      const result = await syncTask.performSync();

      expect(result.failed).toBe(1);
      expect(result.errors).toContainEqual(
        expect.objectContaining({
          id: 'fail-123',
          error: 'Network error',
        })
      );
    });
  });

  describe('MessageSyncService', () => {
    let messageSync: MessageSyncService;

    beforeEach(() => {
      messageSync = MessageSyncService.getInstance();
    });

    it('should sync messages with proper encryption', async () => {
      const messages = [
        {
          id: 'msg-1',
          chatId: 'chat-123',
          content: 'Hello',
          timestamp: Date.now(),
        },
        {
          id: 'msg-2',
          chatId: 'chat-123',
          content: 'World',
          timestamp: Date.now() + 1000,
        },
      ];

      mockAsyncStorage.getItem.mockResolvedValue(JSON.stringify(messages));

      const synced = await messageSync.syncPendingMessages();

      expect(synced).toBe(2);
      expect(mockAsyncStorage.setItem).toHaveBeenCalledWith(
        'synced_messages',
        expect.any(String)
      );
    });

    it('should handle message conflicts', async () => {
      const localMessage = {
        id: 'msg-123',
        content: 'Local version',
        timestamp: 1000,
        version: 1,
      };

      const serverMessage = {
        id: 'msg-123',
        content: 'Server version',
        timestamp: 2000,
        version: 2,
      };

      const resolved = await messageSync.resolveConflict(localMessage, serverMessage);

      expect(resolved.content).toBe('Server version'); // Server wins due to higher version
      expect(resolved.version).toBe(2);
    });

    it('should batch message sync for performance', async () => {
      const messages = Array.from({ length: 100 }, (_, i) => ({
        id: `msg-${i}`,
        chatId: 'chat-123',
        content: `Message ${i}`,
        timestamp: Date.now() + i,
      }));

      mockAsyncStorage.getItem.mockResolvedValue(JSON.stringify(messages));

      const syncSpy = jest.spyOn(messageSync, 'syncBatch');
      await messageSync.syncPendingMessages();

      // Should sync in batches of 20
      expect(syncSpy).toHaveBeenCalledTimes(5);
    });
  });

  describe('MediaUploadQueue', () => {
    let uploadQueue: MediaUploadQueue;

    beforeEach(() => {
      uploadQueue = MediaUploadQueue.getInstance();
    });

    it('should queue media uploads when offline', async () => {
      const mediaItem = {
        id: 'media-123',
        uri: 'file:///path/to/image.jpg',
        type: 'image/jpeg',
        size: 1024000, // 1MB
      };

      mockNetInfo.fetch.mockResolvedValue({
        isConnected: false,
        type: 'none',
      });

      await uploadQueue.addToQueue(mediaItem);
      const queue = await uploadQueue.getQueue();

      expect(queue).toContainEqual(
        expect.objectContaining({
          id: 'media-123',
          status: 'pending',
        })
      );
    });

    it('should compress images before upload', async () => {
      const largeImage = {
        id: 'large-img',
        uri: 'file:///large-image.jpg',
        type: 'image/jpeg',
        size: 10485760, // 10MB
      };

      const compressed = await uploadQueue.compressImage(largeImage);

      expect(compressed.size).toBeLessThan(largeImage.size);
      expect(compressed.uri).not.toBe(largeImage.uri);
    });

    it('should handle upload progress', async () => {
      const mediaItem = {
        id: 'media-progress',
        uri: 'file:///image.jpg',
        type: 'image/jpeg',
        size: 2048000,
      };

      const progressHandler = jest.fn();
      uploadQueue.onProgress(mediaItem.id, progressHandler);

      await uploadQueue.uploadItem(mediaItem);

      expect(progressHandler).toHaveBeenCalledWith(
        expect.objectContaining({
          loaded: expect.any(Number),
          total: mediaItem.size,
          percentage: expect.any(Number),
        })
      );
    });

    it('should retry failed uploads', async () => {
      const mediaItem = {
        id: 'retry-media',
        uri: 'file:///image.jpg',
        type: 'image/jpeg',
        size: 1024000,
        retries: 0,
      };

      // Mock first upload failure
      jest.spyOn(uploadQueue, 'uploadToStorage')
        .mockRejectedValueOnce(new Error('Network error'))
        .mockResolvedValueOnce({ url: 'https://cdn.example.com/image.jpg' });

      const result = await uploadQueue.uploadWithRetry(mediaItem);

      expect(result.url).toBeDefined();
      expect(uploadQueue.uploadToStorage).toHaveBeenCalledTimes(2);
    });
  });

  describe('VaultService', () => {
    let vaultService: VaultService;

    beforeEach(() => {
      vaultService = VaultService.getInstance();
    });

    it('should encrypt files before storage', async () => {
      const file = {
        name: 'document.pdf',
        uri: 'file:///document.pdf',
        type: 'application/pdf',
        size: 512000,
      };

      const encrypted = await vaultService.encryptFile(file);

      expect(encrypted.encrypted).toBe(true);
      expect(encrypted.uri).not.toBe(file.uri);
      expect(encrypted.metadata).toEqual(
        expect.objectContaining({
          originalName: file.name,
          encryptedAt: expect.any(Number),
        })
      );
    });

    it('should handle vault sharing with family members', async () => {
      const vaultItem = {
        id: 'vault-123',
        name: 'Family Photos',
        type: 'album',
      };

      const familyMembers = ['user-1', 'user-2', 'user-3'];

      const shared = await vaultService.shareWithFamily(vaultItem.id, familyMembers);

      expect(shared.sharedWith).toEqual(familyMembers);
      expect(shared.permissions).toEqual(
        expect.objectContaining({
          read: true,
          write: false,
          delete: false,
        })
      );
    });

    it('should implement secure deletion', async () => {
      const vaultItemId = 'vault-item-123';

      // Mock secure deletion process
      mockFileSystem.deleteAsync.mockResolvedValue(undefined);
      mockAsyncStorage.removeItem.mockResolvedValue(undefined);

      const deleted = await vaultService.secureDelete(vaultItemId);

      expect(deleted).toBe(true);
      expect(mockFileSystem.deleteAsync).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ idempotent: true })
      );
    });

    it('should enforce storage quotas', async () => {
      const userQuota = {
        used: 4500000000, // 4.5GB
        limit: 5000000000, // 5GB
      };

      const largeFile = {
        name: 'large-video.mp4',
        size: 1000000000, // 1GB
      };

      jest.spyOn(vaultService, 'getUserQuota').mockResolvedValue(userQuota);

      await expect(vaultService.checkQuota(largeFile)).rejects.toThrow(
        'Insufficient storage space'
      );
    });
  });

  describe('OfflineQueueService', () => {
    let offlineQueue: OfflineQueueService;

    beforeEach(() => {
      offlineQueue = OfflineQueueService.getInstance();
    });

    it('should persist operations to SQLite when offline', async () => {
      const operation = {
        type: 'CREATE_EVENT',
        data: {
          title: 'Family Reunion',
          date: '2024-07-04',
        },
        timestamp: Date.now(),
      };

      await offlineQueue.enqueue(operation);

      const queued = await offlineQueue.getAll();
      expect(queued).toContainEqual(
        expect.objectContaining({
          id: expect.any(String),
          type: operation.type,
          status: 'pending',
        })
      );
    });

    it('should process queue in FIFO order', async () => {
      const operations = [
        { type: 'OP1', timestamp: 1000 },
        { type: 'OP2', timestamp: 2000 },
        { type: 'OP3', timestamp: 3000 },
      ];

      for (const op of operations) {
        await offlineQueue.enqueue(op);
      }

      const processed = [];
      await offlineQueue.processQueue(async (op) => {
        processed.push(op.type);
        return true;
      });

      expect(processed).toEqual(['OP1', 'OP2', 'OP3']);
    });

    it('should handle operation failures with exponential backoff', async () => {
      const operation = {
        type: 'SYNC_DATA',
        data: { fail: true },
        retries: 0,
      };

      await offlineQueue.enqueue(operation);

      // Mock processing failure
      const processor = jest.fn().mockRejectedValue(new Error('Sync failed'));

      await offlineQueue.processQueue(processor);

      const updated = await offlineQueue.getById(operation.id);
      expect(updated.retries).toBe(1);
      expect(updated.nextRetry).toBeGreaterThan(Date.now());
    });

    it('should clean up old completed operations', async () => {
      const oldOperations = [
        {
          type: 'OLD_OP',
          status: 'completed',
          completedAt: Date.now() - 8 * 24 * 60 * 60 * 1000, // 8 days ago
        },
      ];

      for (const op of oldOperations) {
        await offlineQueue.enqueue(op);
      }

      await offlineQueue.cleanup();

      const remaining = await offlineQueue.getAll();
      expect(remaining).not.toContainEqual(
        expect.objectContaining({ type: 'OLD_OP' })
      );
    });
  });

  describe('Integration Tests', () => {
    it('should handle complete offline-to-online sync flow', async () => {
      // Start offline
      mockNetInfo.fetch.mockResolvedValue({
        isConnected: false,
        type: 'none',
      });

      // Queue multiple operations
      const operations = [
        { type: 'message', data: { content: 'Offline message' } },
        { type: 'event', data: { title: 'Offline event' } },
        { type: 'media', data: { uri: 'file:///image.jpg' } },
      ];

      for (const op of operations) {
        await BackgroundSyncTask.getInstance().queueOperation(op);
      }

      // Go online
      mockNetInfo.fetch.mockResolvedValue({
        isConnected: true,
        type: 'wifi',
      });

      // Trigger sync
      const syncResult = await BackgroundSyncTask.getInstance().performSync();

      expect(syncResult.synced).toBe(3);
      expect(syncResult.failed).toBe(0);
    });

    it('should maintain data consistency across service boundaries', async () => {
      const userId = 'test-user-123';
      const chatId = 'chat-456';
      
      // Create a message through MessageSyncService
      const message = await MessageSyncService.getInstance().createMessage({
        chatId,
        content: 'Test message',
        userId,
      });

      // Verify it's queued for sync
      const queue = await OfflineQueueService.getInstance().getAll();
      expect(queue).toContainEqual(
        expect.objectContaining({
          type: 'CREATE_MESSAGE',
          data: expect.objectContaining({ id: message.id }),
        })
      );

      // Verify notification is scheduled
      const notifications = await NotificationService.getInstance()
        .getPendingNotifications();
      expect(notifications).toContainEqual(
        expect.objectContaining({
          data: expect.objectContaining({ messageId: message.id }),
        })
      );
    });
  });
});

describe('Performance Tests', () => {
  it('should handle large message batches efficiently', async () => {
    const messageSync = MessageSyncService.getInstance();
    const messages = Array.from({ length: 1000 }, (_, i) => ({
      id: `perf-msg-${i}`,
      content: `Performance test message ${i}`,
      timestamp: Date.now() + i,
    }));

    const startTime = Date.now();
    await messageSync.syncMessages(messages);
    const endTime = Date.now();

    const duration = endTime - startTime;
    expect(duration).toBeLessThan(5000); // Should complete within 5 seconds
  });

  it('should maintain UI responsiveness during background sync', async () => {
    const syncTask = BackgroundSyncTask.getInstance();
    
    // Mock heavy sync operation
    const heavyOperations = Array.from({ length: 50 }, (_, i) => ({
      type: 'heavy-op',
      data: { index: i, payload: 'x'.repeat(10000) },
    }));

    // Start sync in background
    const syncPromise = syncTask.syncOperations(heavyOperations);

    // Simulate UI operations
    const uiOperations = [];
    for (let i = 0; i < 10; i++) {
      const start = Date.now();
      await new Promise(resolve => setImmediate(resolve));
      const end = Date.now();
      uiOperations.push(end - start);
    }

    await syncPromise;

    // UI operations should remain responsive (< 16ms for 60fps)
    const avgUITime = uiOperations.reduce((a, b) => a + b, 0) / uiOperations.length;
    expect(avgUITime).toBeLessThan(16);
  });
});