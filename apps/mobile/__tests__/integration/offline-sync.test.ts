import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo from '@react-native-community/netinfo';
import firestore from '@react-native-firebase/firestore';
import functions from '@react-native-firebase/functions';
import { openDatabase } from 'react-native-sqlite-storage';

// Import services
import { OfflineQueueService } from '../../src/services/encryption/OfflineQueueService';
import NetworkMonitor from '../../src/services/NetworkMonitor';
import MessageSyncService from '../../src/services/MessageSyncService';
import EventSyncService from '../../src/services/EventSyncService';
import StorySyncService from '../../src/services/StorySyncService';
import FamilyTreeSyncService from '../../src/services/FamilyTreeSyncService';
import VaultService from '../../src/services/VaultService';
import BackgroundSyncTask from '../../src/services/BackgroundSyncTask';
import ConflictResolutionService from '../../src/services/ConflictResolutionService';
import { SyncDatabase } from '../../src/database/SyncDatabase';
import CacheManager from '../../src/database/CacheManager';

// Mock dependencies
jest.mock('@react-native-community/netinfo');
jest.mock('react-native-sqlite-storage');
jest.mock('@react-native-firebase/firestore');
jest.mock('@react-native-firebase/functions');

const mockNetInfo = NetInfo as jest.Mocked<typeof NetInfo>;
const mockOpenDatabase = openDatabase as jest.Mock;

// Mock SQLite database
const mockDb = {
  transaction: jest.fn((callback) => {
    callback({
      executeSql: jest.fn((sql, params, success, error) => {
        success({}, { rows: { raw: () => [] } });
      }),
    });
  }),
  executeSql: jest.fn(),
};

mockOpenDatabase.mockReturnValue(mockDb);

describe('Offline/Online Sync Integration Tests', () => {
  let offlineQueue: OfflineQueueService;
  let networkMonitor: NetworkMonitor;
  let syncDatabase: SyncDatabase;
  let cacheManager: CacheManager;

  beforeEach(async () => {
    jest.clearAllMocks();
    await AsyncStorage.clear();
    
    // Initialize services
    offlineQueue = OfflineQueueService.getInstance();
    networkMonitor = NetworkMonitor.getInstance();
    syncDatabase = SyncDatabase.getInstance();
    cacheManager = CacheManager.getInstance();
    
    // Start with online state
    mockNetInfo.fetch.mockResolvedValue({
      isConnected: true,
      type: 'wifi',
      details: {},
    });
  });

  describe('Offline Queue Management', () => {
    it('should queue operations when offline', async () => {
      // Go offline
      mockNetInfo.fetch.mockResolvedValue({
        isConnected: false,
        type: 'none',
        details: {},
      });
      
      await networkMonitor.checkConnection();
      
      // Try various operations
      const operations = [
        {
          type: 'CREATE_MESSAGE',
          data: {
            chatId: 'chat-123',
            content: 'Offline message',
            timestamp: Date.now(),
          },
        },
        {
          type: 'UPDATE_EVENT',
          data: {
            eventId: 'event-456',
            rsvp: 'attending',
          },
        },
        {
          type: 'CREATE_STORY',
          data: {
            title: 'Offline Story',
            content: 'Created while offline',
            media: [],
          },
        },
      ];
      
      for (const op of operations) {
        await offlineQueue.enqueue(op);
      }
      
      const queued = await offlineQueue.getAll();
      expect(queued).toHaveLength(3);
      expect(queued.every(op => op.status === 'pending')).toBe(true);
    });

    it('should persist queue across app restarts', async () => {
      // Queue operations
      await offlineQueue.enqueue({
        type: 'CREATE_MESSAGE',
        data: { content: 'Persistent message' },
      });
      
      await offlineQueue.enqueue({
        type: 'UPDATE_PROFILE',
        data: { bio: 'Updated bio' },
      });
      
      // Simulate app restart by creating new instance
      const newOfflineQueue = new OfflineQueueService();
      await newOfflineQueue.initialize();
      
      const persistedQueue = await newOfflineQueue.getAll();
      expect(persistedQueue).toHaveLength(2);
      expect(persistedQueue[0].data.content).toBe('Persistent message');
    });

    it('should handle queue size limits', async () => {
      const maxQueueSize = 100;
      offlineQueue.setMaxQueueSize(maxQueueSize);
      
      // Try to queue more than limit
      const promises = [];
      for (let i = 0; i < 120; i++) {
        promises.push(
          offlineQueue.enqueue({
            type: 'TEST_OP',
            data: { index: i },
          })
        );
      }
      
      await Promise.all(promises);
      
      const queued = await offlineQueue.getAll();
      expect(queued).toHaveLength(maxQueueSize);
      
      // Should keep most recent operations
      expect(queued[queued.length - 1].data.index).toBe(119);
    });
  });

  describe('Sync Process', () => {
    it('should process queue when coming online', async () => {
      // Start offline
      mockNetInfo.fetch.mockResolvedValue({
        isConnected: false,
        type: 'none',
        details: {},
      });
      
      // Queue operations
      await offlineQueue.enqueue({
        type: 'CREATE_MESSAGE',
        data: { chatId: 'chat-123', content: 'Test message' },
      });
      
      await offlineQueue.enqueue({
        type: 'UPDATE_EVENT',
        data: { eventId: 'event-456', title: 'Updated title' },
      });
      
      // Mock sync handlers
      const messageSyncSpy = jest.spyOn(MessageSyncService.getInstance(), 'syncMessage')
        .mockResolvedValue({ success: true });
      const eventSyncSpy = jest.spyOn(EventSyncService.getInstance(), 'syncEvent')
        .mockResolvedValue({ success: true });
      
      // Go online
      mockNetInfo.fetch.mockResolvedValue({
        isConnected: true,
        type: 'wifi',
        details: {},
      });
      
      await networkMonitor.checkConnection();
      
      // Process sync
      const syncResult = await BackgroundSyncTask.getInstance().performSync();
      
      expect(syncResult.synced).toBe(2);
      expect(syncResult.failed).toBe(0);
      expect(messageSyncSpy).toHaveBeenCalled();
      expect(eventSyncSpy).toHaveBeenCalled();
      
      // Queue should be empty
      const remainingQueue = await offlineQueue.getAll();
      expect(remainingQueue).toHaveLength(0);
    });

    it('should handle partial sync failures', async () => {
      // Queue multiple operations
      const operations = [
        { type: 'OP1', data: { id: 1 } },
        { type: 'OP2', data: { id: 2 } },
        { type: 'OP3', data: { id: 3 } },
        { type: 'OP4', data: { id: 4 } },
      ];
      
      for (const op of operations) {
        await offlineQueue.enqueue(op);
      }
      
      // Mock sync to fail for OP2 and OP4
      const syncSpy = jest.spyOn(BackgroundSyncTask.getInstance(), 'syncOperation')
        .mockImplementation(async (op) => {
          if (op.data.id === 2 || op.data.id === 4) {
            throw new Error('Sync failed');
          }
          return { success: true };
        });
      
      const result = await BackgroundSyncTask.getInstance().performSync();
      
      expect(result.synced).toBe(2);
      expect(result.failed).toBe(2);
      
      // Failed operations should remain in queue
      const remainingQueue = await offlineQueue.getAll();
      expect(remainingQueue).toHaveLength(2);
      expect(remainingQueue.map(op => op.data.id)).toEqual([2, 4]);
    });

    it('should implement retry with exponential backoff', async () => {
      jest.useFakeTimers();
      
      const operation = {
        type: 'RETRY_TEST',
        data: { content: 'Will fail initially' },
        retries: 0,
      };
      
      await offlineQueue.enqueue(operation);
      
      // Mock sync to fail first 2 times, succeed on 3rd
      let attempts = 0;
      jest.spyOn(BackgroundSyncTask.getInstance(), 'syncOperation')
        .mockImplementation(async () => {
          attempts++;
          if (attempts < 3) {
            throw new Error('Temporary failure');
          }
          return { success: true };
        });
      
      // First attempt
      await BackgroundSyncTask.getInstance().performSync();
      let queue = await offlineQueue.getAll();
      expect(queue[0].retries).toBe(1);
      expect(queue[0].nextRetry).toBeGreaterThan(Date.now());
      
      // Fast forward to next retry
      jest.advanceTimersByTime(5000);
      
      // Second attempt
      await BackgroundSyncTask.getInstance().performSync();
      queue = await offlineQueue.getAll();
      expect(queue[0].retries).toBe(2);
      
      // Fast forward to next retry
      jest.advanceTimersByTime(10000);
      
      // Third attempt (should succeed)
      await BackgroundSyncTask.getInstance().performSync();
      queue = await offlineQueue.getAll();
      expect(queue).toHaveLength(0);
      
      jest.useRealTimers();
    });
  });

  describe('Conflict Resolution', () => {
    let conflictService: ConflictResolutionService;
    
    beforeEach(() => {
      conflictService = ConflictResolutionService.getInstance();
    });
    
    it('should detect and resolve message conflicts', async () => {
      const localMessage = {
        id: 'msg-123',
        content: 'Local version',
        timestamp: 1000,
        version: 1,
        lastModified: 1000,
      };
      
      const serverMessage = {
        id: 'msg-123',
        content: 'Server version',
        timestamp: 1000,
        version: 2,
        lastModified: 2000,
      };
      
      const resolution = await conflictService.resolveConflict(
        'message',
        localMessage,
        serverMessage
      );
      
      expect(resolution.winner).toBe('server');
      expect(resolution.resolved.content).toBe('Server version');
      expect(resolution.resolved.version).toBe(2);
    });
    
    it('should merge non-conflicting changes', async () => {
      const localEvent = {
        id: 'event-123',
        title: 'Family Reunion',
        description: 'Local description',
        date: '2024-07-04',
        location: 'Original location',
        lastModified: 2000,
      };
      
      const serverEvent = {
        id: 'event-123',
        title: 'Family Reunion',
        description: 'Original description',
        date: '2024-07-04',
        location: 'Server location',
        lastModified: 1500,
      };
      
      const resolution = await conflictService.resolveConflict(
        'event',
        localEvent,
        serverEvent
      );
      
      // Should merge: local description (newer) + server location (different field)
      expect(resolution.resolved.description).toBe('Local description');
      expect(resolution.resolved.location).toBe('Server location');
    });
    
    it('should handle three-way merge for complex conflicts', async () => {
      const baseStory = {
        id: 'story-123',
        title: 'Original Title',
        content: 'Original content',
        tags: ['family', 'vacation'],
      };
      
      const localStory = {
        ...baseStory,
        title: 'Local Title',
        tags: ['family', 'vacation', 'summer'],
      };
      
      const serverStory = {
        ...baseStory,
        content: 'Server content',
        tags: ['family', 'vacation', 'beach'],
      };
      
      const resolution = await conflictService.threeWayMerge(
        baseStory,
        localStory,
        serverStory
      );
      
      expect(resolution.title).toBe('Local Title');
      expect(resolution.content).toBe('Server content');
      expect(resolution.tags).toContain('summer');
      expect(resolution.tags).toContain('beach');
    });
  });

  describe('Cache Management', () => {
    it('should cache data for offline access', async () => {
      const testData = {
        stories: [
          { id: '1', title: 'Story 1', content: 'Content 1' },
          { id: '2', title: 'Story 2', content: 'Content 2' },
        ],
        events: [
          { id: 'e1', title: 'Event 1', date: '2024-01-01' },
        ],
        familyMembers: [
          { id: 'm1', name: 'John Doe' },
          { id: 'm2', name: 'Jane Doe' },
        ],
      };
      
      // Cache data while online
      await cacheManager.cacheData('user-content', testData, {
        ttl: 3600000, // 1 hour
        priority: 'high',
      });
      
      // Go offline
      mockNetInfo.fetch.mockResolvedValue({
        isConnected: false,
        type: 'none',
        details: {},
      });
      
      // Should still access cached data
      const cached = await cacheManager.getCachedData('user-content');
      expect(cached).toEqual(testData);
    });
    
    it('should implement smart cache invalidation', async () => {
      // Cache various data
      await cacheManager.cacheData('stories:user-123', { stories: [] });
      await cacheManager.cacheData('events:user-123', { events: [] });
      await cacheManager.cacheData('stories:user-456', { stories: [] });
      await cacheManager.cacheData('profile:user-123', { name: 'John' });
      
      // Invalidate all stories
      await cacheManager.invalidatePattern('stories:*');
      
      expect(await cacheManager.getCachedData('stories:user-123')).toBeNull();
      expect(await cacheManager.getCachedData('stories:user-456')).toBeNull();
      expect(await cacheManager.getCachedData('events:user-123')).toBeDefined();
      expect(await cacheManager.getCachedData('profile:user-123')).toBeDefined();
    });
    
    it('should handle cache size limits with LRU eviction', async () => {
      const maxCacheSize = 5 * 1024 * 1024; // 5MB
      cacheManager.setMaxSize(maxCacheSize);
      
      // Add items until cache is full
      for (let i = 0; i < 10; i++) {
        const largeData = {
          id: i,
          content: 'x'.repeat(1024 * 1024), // 1MB each
        };
        await cacheManager.cacheData(`item-${i}`, largeData);
      }
      
      // First 5 items should be evicted
      expect(await cacheManager.getCachedData('item-0')).toBeNull();
      expect(await cacheManager.getCachedData('item-4')).toBeNull();
      
      // Last 5 items should remain
      expect(await cacheManager.getCachedData('item-5')).toBeDefined();
      expect(await cacheManager.getCachedData('item-9')).toBeDefined();
    });
  });

  describe('Background Sync', () => {
    it('should respect sync preferences', async () => {
      const syncPreferences = {
        wifiOnly: true,
        batteryThreshold: 0.2,
        syncInterval: 300000, // 5 minutes
        dataSaverMode: false,
      };
      
      await BackgroundSyncTask.getInstance().setPreferences(syncPreferences);
      
      // Test with cellular connection
      mockNetInfo.fetch.mockResolvedValue({
        isConnected: true,
        type: 'cellular',
        details: { cellularGeneration: '4g' },
      });
      
      const shouldSync = await BackgroundSyncTask.getInstance().shouldSync();
      expect(shouldSync).toBe(false); // WiFi only is enabled
      
      // Test with WiFi
      mockNetInfo.fetch.mockResolvedValue({
        isConnected: true,
        type: 'wifi',
        details: {},
      });
      
      const shouldSyncWifi = await BackgroundSyncTask.getInstance().shouldSync();
      expect(shouldSyncWifi).toBe(true);
    });
    
    it('should batch sync operations for efficiency', async () => {
      // Queue many small operations
      const operations = [];
      for (let i = 0; i < 50; i++) {
        operations.push({
          type: 'UPDATE_FIELD',
          data: {
            collection: 'users',
            doc: 'user-123',
            field: `field${i}`,
            value: `value${i}`,
          },
        });
      }
      
      for (const op of operations) {
        await offlineQueue.enqueue(op);
      }
      
      // Mock Firestore batch
      const batchMock = {
        update: jest.fn(),
        commit: jest.fn().mockResolvedValue(undefined),
      };
      
      jest.spyOn(firestore(), 'batch').mockReturnValue(batchMock);
      
      await BackgroundSyncTask.getInstance().performSync();
      
      // Should use batch for efficiency
      expect(firestore().batch).toHaveBeenCalled();
      expect(batchMock.update).toHaveBeenCalledTimes(50);
      expect(batchMock.commit).toHaveBeenCalledTimes(1);
    });
  });

  describe('Delta Sync', () => {
    it('should sync only changed data', async () => {
      const lastSyncTimestamp = Date.now() - 3600000; // 1 hour ago
      await syncDatabase.setLastSyncTime('stories', lastSyncTimestamp);
      
      // Mock server response with only new/updated stories
      const deltaData = {
        stories: [
          { id: 's1', title: 'New Story', createdAt: Date.now() - 1800000 },
          { id: 's2', title: 'Updated Story', updatedAt: Date.now() - 900000 },
        ],
        deletedIds: ['s3', 's4'],
      };
      
      jest.spyOn(functions(), 'httpsCallable').mockReturnValue(
        jest.fn().mockResolvedValue({ data: deltaData })
      );
      
      const syncResult = await StorySyncService.getInstance().performDeltaSync();
      
      expect(functions().httpsCallable).toHaveBeenCalledWith('sync-getDelta');
      expect(syncResult.added).toBe(1);
      expect(syncResult.updated).toBe(1);
      expect(syncResult.deleted).toBe(2);
    });
    
    it('should handle sync pagination for large datasets', async () => {
      // Mock paginated responses
      const pages = [
        {
          data: Array(100).fill(null).map((_, i) => ({ id: `item-${i}` })),
          hasMore: true,
          nextCursor: 'cursor-1',
        },
        {
          data: Array(100).fill(null).map((_, i) => ({ id: `item-${i + 100}` })),
          hasMore: true,
          nextCursor: 'cursor-2',
        },
        {
          data: Array(50).fill(null).map((_, i) => ({ id: `item-${i + 200}` })),
          hasMore: false,
          nextCursor: null,
        },
      ];
      
      let pageIndex = 0;
      jest.spyOn(functions(), 'httpsCallable').mockReturnValue(
        jest.fn().mockImplementation(() => 
          Promise.resolve({ data: pages[pageIndex++] })
        )
      );
      
      const syncResult = await EventSyncService.getInstance().syncAllEvents();
      
      expect(functions().httpsCallable).toHaveBeenCalledTimes(3);
      expect(syncResult.total).toBe(250);
    });
  });

  describe('Media Sync', () => {
    it('should queue media uploads when offline', async () => {
      // Go offline
      mockNetInfo.fetch.mockResolvedValue({
        isConnected: false,
        type: 'none',
        details: {},
      });
      
      const mediaItems = [
        {
          uri: 'file:///photo1.jpg',
          type: 'image/jpeg',
          size: 2048000,
          metadata: { storyId: 'story-123' },
        },
        {
          uri: 'file:///video1.mp4',
          type: 'video/mp4',
          size: 10485760,
          metadata: { eventId: 'event-456' },
        },
      ];
      
      for (const media of mediaItems) {
        await offlineQueue.enqueue({
          type: 'UPLOAD_MEDIA',
          data: media,
        });
      }
      
      const queued = await offlineQueue.getAll();
      expect(queued.filter(op => op.type === 'UPLOAD_MEDIA')).toHaveLength(2);
    });
    
    it('should resume interrupted uploads', async () => {
      const interruptedUpload = {
        id: 'upload-123',
        uri: 'file:///large-video.mp4',
        size: 104857600, // 100MB
        uploadedBytes: 52428800, // 50MB uploaded
        uploadUrl: 'https://storage.example.com/resumable/upload-123',
      };
      
      await syncDatabase.saveInterruptedUpload(interruptedUpload);
      
      // Mock resumable upload
      const uploadSpy = jest.spyOn(VaultService.getInstance(), 'resumeUpload')
        .mockResolvedValue({ url: 'https://cdn.example.com/video.mp4' });
      
      await BackgroundSyncTask.getInstance().resumeInterruptedUploads();
      
      expect(uploadSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          uploadUrl: interruptedUpload.uploadUrl,
          startByte: interruptedUpload.uploadedBytes,
        })
      );
    });
  });

  describe('Sync Monitoring', () => {
    it('should track sync metrics', async () => {
      // Perform various sync operations
      await offlineQueue.enqueue({ type: 'OP1', data: {} });
      await offlineQueue.enqueue({ type: 'OP2', data: {} });
      await offlineQueue.enqueue({ type: 'OP3', data: {} });
      
      // Mock one failure
      jest.spyOn(BackgroundSyncTask.getInstance(), 'syncOperation')
        .mockImplementationOnce(() => Promise.resolve({ success: true }))
        .mockImplementationOnce(() => Promise.reject(new Error('Failed')))
        .mockImplementationOnce(() => Promise.resolve({ success: true }));
      
      const startTime = Date.now();
      await BackgroundSyncTask.getInstance().performSync();
      const endTime = Date.now();
      
      const metrics = await BackgroundSyncTask.getInstance().getSyncMetrics();
      
      expect(metrics.lastSyncTime).toBeGreaterThanOrEqual(startTime);
      expect(metrics.lastSyncTime).toBeLessThanOrEqual(endTime);
      expect(metrics.successCount).toBe(2);
      expect(metrics.failureCount).toBe(1);
      expect(metrics.averageSyncTime).toBeGreaterThan(0);
    });
    
    it('should emit sync events for UI updates', async () => {
      const syncEvents: any[] = [];
      
      BackgroundSyncTask.getInstance().on('syncStart', (event) => {
        syncEvents.push({ type: 'start', ...event });
      });
      
      BackgroundSyncTask.getInstance().on('syncProgress', (event) => {
        syncEvents.push({ type: 'progress', ...event });
      });
      
      BackgroundSyncTask.getInstance().on('syncComplete', (event) => {
        syncEvents.push({ type: 'complete', ...event });
      });
      
      // Queue operations
      for (let i = 0; i < 5; i++) {
        await offlineQueue.enqueue({ type: `OP${i}`, data: {} });
      }
      
      await BackgroundSyncTask.getInstance().performSync();
      
      expect(syncEvents.find(e => e.type === 'start')).toBeDefined();
      expect(syncEvents.filter(e => e.type === 'progress')).toHaveLength(5);
      expect(syncEvents.find(e => e.type === 'complete')).toBeDefined();
      
      const completeEvent = syncEvents.find(e => e.type === 'complete');
      expect(completeEvent.synced).toBe(5);
      expect(completeEvent.failed).toBe(0);
    });
  });
});

describe('Advanced Sync Scenarios', () => {
  it('should handle complex family tree sync', async () => {
    const familyTreeService = FamilyTreeSyncService.getInstance();
    
    // Local changes
    const localChanges = {
      added: [
        { id: 'member-new-1', name: 'New Baby', parentIds: ['member-1', 'member-2'] },
      ],
      updated: [
        { id: 'member-1', name: 'John Doe', age: 35 },
      ],
      deleted: ['member-old-1'],
    };
    
    // Server changes
    const serverChanges = {
      added: [
        { id: 'member-new-2', name: 'Cousin Added', parentIds: ['member-3', 'member-4'] },
      ],
      updated: [
        { id: 'member-2', name: 'Jane Doe', occupation: 'Doctor' },
      ],
      deleted: ['member-old-2'],
    };
    
    // Mock server response
    jest.spyOn(functions(), 'httpsCallable').mockReturnValue(
      jest.fn().mockResolvedValue({ data: serverChanges })
    );
    
    const syncResult = await familyTreeService.syncFamilyTree(localChanges);
    
    // Should merge both local and server changes
    expect(syncResult.merged.added).toHaveLength(2);
    expect(syncResult.merged.updated).toHaveLength(2);
    expect(syncResult.merged.deleted).toHaveLength(2);
    expect(syncResult.conflicts).toHaveLength(0);
  });
  
  it('should handle cross-device message sync with E2E encryption', async () => {
    const messageSync = MessageSyncService.getInstance();
    
    // Device A sends encrypted message while Device B is offline
    const encryptedMessage = {
      id: 'msg-123',
      chatId: 'chat-456',
      encryptedContent: 'base64-encrypted-content',
      senderKeyDistribution: 'base64-sender-key',
      deviceId: 'device-a',
      timestamp: Date.now(),
    };
    
    // Device B comes online and syncs
    const syncResult = await messageSync.syncEncryptedMessages('device-b');
    
    expect(syncResult.newMessages).toContainEqual(
      expect.objectContaining({
        id: 'msg-123',
        requiresDecryption: true,
      })
    );
    
    // Verify key distribution message processed
    expect(syncResult.keyUpdates).toContainEqual(
      expect.objectContaining({
        deviceId: 'device-a',
        processed: true,
      })
    );
  });
});