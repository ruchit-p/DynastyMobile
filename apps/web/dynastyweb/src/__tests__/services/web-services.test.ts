import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';

// Import services to test
import VaultService from '../../services/VaultService';
import NotificationService from '../../services/NotificationService';
import NetworkMonitor from '../../services/NetworkMonitor';
import OfflineService from '../../services/OfflineService';
import SyncQueueService from '../../services/SyncQueueService';
import CacheService from '../../services/CacheService';
import AuditLogService from '../../services/AuditLogService';
import ErrorHandlingService from '../../services/ErrorHandlingService';
import EnhancedFingerprintService from '../../services/EnhancedFingerprintService';

// Mock Firebase
jest.mock('firebase/auth');
jest.mock('firebase/firestore');
jest.mock('firebase/storage');
jest.mock('firebase/functions');

// Mock workbox-window
jest.mock('workbox-window', () => ({
  Workbox: jest.fn().mockImplementation(() => ({
    register: jest.fn().mockResolvedValue(undefined),
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
    messageSW: jest.fn().mockResolvedValue(undefined),
  })),
}));

// Mock idb
jest.mock('idb', () => ({
  openDB: jest.fn().mockResolvedValue({
    get: jest.fn(),
    put: jest.fn(),
    delete: jest.fn(),
    clear: jest.fn(),
    getAll: jest.fn().mockResolvedValue([]),
    getAllFromIndex: jest.fn().mockResolvedValue([]),
    transaction: jest.fn(),
  }),
}));

// Mock browser APIs
const mockIndexedDB = {
  open: jest.fn(() => ({
    onsuccess: null,
    onerror: null,
    result: {
      createObjectStore: jest.fn(),
      transaction: jest.fn(() => ({
        objectStore: jest.fn(() => ({
          add: jest.fn(),
          get: jest.fn(),
          put: jest.fn(),
          delete: jest.fn(),
          getAll: jest.fn(),
        })),
      })),
    },
  })),
};

Object.defineProperty(window, 'indexedDB', {
  value: mockIndexedDB,
  writable: true,
});

describe('Web Services Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    localStorage.clear();
    sessionStorage.clear();
  });

  describe('VaultService', () => {
    let vaultService: VaultService;

    beforeEach(() => {
      vaultService = new VaultService();
    });

    it('should encrypt and store vault items', async () => {
      const vaultItem = {
        name: 'Important Document',
        type: 'document',
        content: 'Sensitive information',
        tags: ['personal', 'financial'],
      };

      const encrypted = await vaultService.encryptVaultItem(vaultItem);

      expect(encrypted.encrypted).toBe(true);
      expect(encrypted.content).not.toBe(vaultItem.content);
      expect(encrypted.metadata).toEqual(
        expect.objectContaining({
          name: vaultItem.name,
          type: vaultItem.type,
          encryptedAt: expect.any(Number),
        })
      );
    });

    it('should handle secure file uploads', async () => {
      const file = new File(['test content'], 'test.pdf', { type: 'application/pdf' });
      const onProgress = jest.fn();

      const result = await vaultService.uploadSecureFile(file, {
        onProgress,
        encrypt: true,
      });

      expect(result.encrypted).toBe(true);
      expect(result.url).toMatch(/^https:\/\//);
      expect(onProgress).toHaveBeenCalledWith(
        expect.objectContaining({
          loaded: expect.any(Number),
          total: file.size,
          percentage: expect.any(Number),
        })
      );
    });

    it('should implement secure sharing', async () => {
      const vaultItemId = 'vault-123';
      const recipientIds = ['user-456', 'user-789'];
      const permissions = {
        read: true,
        write: false,
        delete: false,
        reshare: false,
      };

      const shared = await vaultService.shareVaultItem(
        vaultItemId,
        recipientIds,
        permissions
      );

      expect(shared.sharedWith).toEqual(recipientIds);
      expect(shared.permissions).toEqual(permissions);
      expect(shared.shareLinks).toHaveLength(recipientIds.length);
    });

    it('should handle vault search with encryption', async () => {
      // Add encrypted items to vault
      const items = [
        { name: 'Tax Return 2023', type: 'document' },
        { name: 'Family Photos', type: 'album' },
        { name: 'Insurance Policy', type: 'document' },
      ];

      for (const item of items) {
        await vaultService.addToVault(item);
      }

      // Search vault
      const results = await vaultService.searchVault('document');

      expect(results).toHaveLength(2);
      expect(results.every(r => r.type === 'document')).toBe(true);
    });

    it('should enforce storage quotas', async () => {
      const mockQuota = {
        used: 4.5 * 1024 * 1024 * 1024, // 4.5GB
        limit: 5 * 1024 * 1024 * 1024, // 5GB
      };

      jest.spyOn(vaultService, 'getStorageQuota').mockResolvedValue(mockQuota);

      const largeFile = new File(
        [new ArrayBuffer(600 * 1024 * 1024)], // 600MB
        'large-video.mp4'
      );

      await expect(vaultService.uploadSecureFile(largeFile)).rejects.toThrow(
        'Insufficient storage space'
      );
    });
  });

  describe('NotificationService', () => {
    let notificationService: NotificationService;

    beforeEach(() => {
      notificationService = new NotificationService();
      // Mock Notification API
      global.Notification = {
        permission: 'default',
        requestPermission: jest.fn(),
      } as unknown as Notification;
    });

    it('should request notification permission', async () => {
      global.Notification.requestPermission = jest.fn().mockResolvedValue('granted');

      const permission = await notificationService.requestPermission();

      expect(permission).toBe('granted');
      expect(global.Notification.requestPermission).toHaveBeenCalled();
    });

    it('should show browser notifications when permitted', async () => {
      global.Notification.permission = 'granted';
      const mockNotification = jest.fn();
      global.Notification = mockNotification as unknown as typeof Notification;
      mockNotification.permission = 'granted';

      await notificationService.showNotification({
        title: 'New Message',
        body: 'You have a new message from John',
        icon: '/icon.png',
        data: { messageId: 'msg-123' },
      });

      expect(mockNotification).toHaveBeenCalledWith('New Message', {
        body: 'You have a new message from John',
        icon: '/icon.png',
        data: { messageId: 'msg-123' },
      });
    });

    it('should handle notification preferences', async () => {
      const preferences = {
        messages: true,
        events: false,
        stories: true,
        familyUpdates: true,
      };

      await notificationService.updatePreferences(preferences);

      const shouldShow = await notificationService.shouldShowNotification('events');
      expect(shouldShow).toBe(false);

      const shouldShowMessage = await notificationService.shouldShowNotification('messages');
      expect(shouldShowMessage).toBe(true);
    });

    it('should queue notifications when offline', async () => {
      jest.spyOn(NetworkMonitor.prototype, 'isOnline').mockReturnValue(false);

      const notification = {
        title: 'Offline Notification',
        body: 'This will be shown when online',
      };

      await notificationService.showNotification(notification);

      const queued = await notificationService.getQueuedNotifications();
      expect(queued).toContainEqual(
        expect.objectContaining({
          title: notification.title,
          queued: true,
        })
      );
    });
  });

  describe('OfflineService', () => {
    let offlineService: OfflineService;

    beforeEach(() => {
      offlineService = new OfflineService();
    });

    it('should detect online/offline status', async () => {
      const onlineHandler = jest.fn();
      const offlineHandler = jest.fn();

      offlineService.onOnline(onlineHandler);
      offlineService.onOffline(offlineHandler);

      // Simulate going offline
      window.dispatchEvent(new Event('offline'));
      expect(offlineHandler).toHaveBeenCalled();
      expect(offlineService.isOnline()).toBe(false);

      // Simulate going online
      window.dispatchEvent(new Event('online'));
      expect(onlineHandler).toHaveBeenCalled();
      expect(offlineService.isOnline()).toBe(true);
    });

    it('should cache data for offline access', async () => {
      const data = {
        stories: [
          { id: '1', title: 'Story 1', content: 'Content 1' },
          { id: '2', title: 'Story 2', content: 'Content 2' },
        ],
        events: [
          { id: 'e1', title: 'Event 1', date: '2024-01-01' },
        ],
      };

      await offlineService.cacheForOffline('user-data', data);

      // Simulate offline
      jest.spyOn(offlineService, 'isOnline').mockReturnValue(false);

      const cached = await offlineService.getCachedData('user-data');
      expect(cached).toEqual(data);
    });

    it('should sync queued operations when coming online', async () => {
      const syncHandler = jest.fn();
      offlineService.onSync(syncHandler);

      // Queue operations while offline
      jest.spyOn(offlineService, 'isOnline').mockReturnValue(false);

      await offlineService.queueOperation({
        type: 'create-story',
        data: { title: 'Offline Story' },
      });

      await offlineService.queueOperation({
        type: 'update-event',
        data: { id: 'event-123', rsvp: 'attending' },
      });

      // Go online
      jest.spyOn(offlineService, 'isOnline').mockReturnValue(true);
      window.dispatchEvent(new Event('online'));

      await new Promise(resolve => setTimeout(resolve, 100));

      expect(syncHandler).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({ type: 'create-story' }),
          expect.objectContaining({ type: 'update-event' }),
        ])
      );
    });
  });

  describe('CacheService', () => {
    let cacheService: CacheService;

    beforeEach(() => {
      cacheService = new CacheService();
    });

    it('should implement LRU cache with size limits', async () => {
      const maxSize = 100; // 100 items
      cacheService.setMaxSize(maxSize);

      // Add more items than cache can hold
      for (let i = 0; i < 150; i++) {
        await cacheService.set(`key-${i}`, `value-${i}`);
      }

      // First 50 items should be evicted
      expect(await cacheService.get('key-0')).toBeNull();
      expect(await cacheService.get('key-49')).toBeNull();

      // Last 100 items should remain
      expect(await cacheService.get('key-50')).toBe('value-50');
      expect(await cacheService.get('key-149')).toBe('value-149');
    });

    it('should respect TTL for cached items', async () => {
      jest.useFakeTimers();

      await cacheService.set('temp-key', 'temp-value', { ttl: 60000 }); // 1 minute

      expect(await cacheService.get('temp-key')).toBe('temp-value');

      // Fast forward 2 minutes
      jest.advanceTimersByTime(120000);

      expect(await cacheService.get('temp-key')).toBeNull();

      jest.useRealTimers();
    });

    it('should handle cache invalidation patterns', async () => {
      // Add related cache entries
      await cacheService.set('user:123:profile', { name: 'John' });
      await cacheService.set('user:123:stories', ['story1', 'story2']);
      await cacheService.set('user:123:events', ['event1']);
      await cacheService.set('user:456:profile', { name: 'Jane' });

      // Invalidate all cache for user 123
      await cacheService.invalidatePattern('user:123:*');

      expect(await cacheService.get('user:123:profile')).toBeNull();
      expect(await cacheService.get('user:123:stories')).toBeNull();
      expect(await cacheService.get('user:123:events')).toBeNull();
      expect(await cacheService.get('user:456:profile')).toEqual({ name: 'Jane' });
    });
  });

  describe('AuditLogService', () => {
    let auditService: AuditLogService;

    beforeEach(() => {
      auditService = new AuditLogService();
    });

    it('should log security-relevant actions', async () => {
      const actions = [
        { type: 'login', userId: 'user-123', ip: '192.168.1.1' },
        { type: 'vault-access', resourceId: 'vault-456', userId: 'user-123' },
        { type: 'permission-change', target: 'user-789', changes: { role: 'admin' } },
      ];

      for (const action of actions) {
        await auditService.log(action);
      }

      const logs = await auditService.query({
        userId: 'user-123',
        limit: 10,
      });

      expect(logs).toHaveLength(2);
      expect(logs.every(log => log.encrypted)).toBe(true);
    });

    it('should detect suspicious patterns', async () => {
      const userId = 'user-123';

      // Simulate multiple failed login attempts
      for (let i = 0; i < 5; i++) {
        await auditService.log({
          type: 'login-failed',
          userId,
          ip: '192.168.1.1',
          reason: 'invalid-password',
        });
      }

      const analysis = await auditService.analyzeUserActivity(userId);

      expect(analysis.suspiciousActivity).toBe(true);
      expect(analysis.alerts).toContainEqual(
        expect.objectContaining({
          type: 'multiple-failed-logins',
          severity: 'high',
        })
      );
    });

    it('should export audit logs with filtering', async () => {
      // Add various audit entries
      const startDate = new Date('2024-01-01');
      const endDate = new Date('2024-01-31');

      for (let i = 0; i < 20; i++) {
        await auditService.log({
          type: 'action',
          userId: `user-${i % 3}`,
          timestamp: new Date(`2024-01-${i + 1}`).getTime(),
        });
      }

      const exported = await auditService.exportLogs({
        startDate,
        endDate,
        userIds: ['user-0', 'user-1'],
        format: 'csv',
      });

      expect(exported.format).toBe('csv');
      expect(exported.rowCount).toBeGreaterThan(0);
      expect(exported.data).toContain('user-0');
      expect(exported.data).toContain('user-1');
      expect(exported.data).not.toContain('user-2');
    });
  });

  describe('ErrorHandlingService', () => {
    let errorService: ErrorHandlingService;

    beforeEach(() => {
      errorService = new ErrorHandlingService();
      // Mock console methods
      jest.spyOn(console, 'error').mockImplementation();
      jest.spyOn(console, 'warn').mockImplementation();
    });

    afterEach(() => {
      jest.restoreAllMocks();
    });

    it('should categorize and handle different error types', async () => {
      const errors = [
        new Error('Network request failed'),
        new TypeError('Cannot read property of undefined'),
        new RangeError('Maximum call stack exceeded'),
        { code: 'auth/user-not-found', message: 'User not found' },
      ];

      const handlers = {
        network: jest.fn(),
        type: jest.fn(),
        range: jest.fn(),
        auth: jest.fn(),
      };

      errorService.onError('network', handlers.network);
      errorService.onError('type', handlers.type);
      errorService.onError('range', handlers.range);
      errorService.onError('auth', handlers.auth);

      for (const error of errors) {
        await errorService.handle(error);
      }

      expect(handlers.network).toHaveBeenCalledTimes(1);
      expect(handlers.type).toHaveBeenCalledTimes(1);
      expect(handlers.range).toHaveBeenCalledTimes(1);
      expect(handlers.auth).toHaveBeenCalledTimes(1);
    });

    it('should implement error recovery strategies', async () => {
      const recoverableError = {
        code: 'network-timeout',
        recoverable: true,
        retry: jest.fn(),
      };

      const result = await errorService.handleWithRecovery(recoverableError);

      expect(recoverableError.retry).toHaveBeenCalled();
      expect(result.recovered).toBe(true);
    });

    it('should track error metrics', async () => {
      const errors = [
        { type: 'api', endpoint: '/users' },
        { type: 'api', endpoint: '/users' },
        { type: 'api', endpoint: '/stories' },
        { type: 'ui', component: 'MediaUpload' },
      ];

      for (const error of errors) {
        await errorService.track(error);
      }

      const metrics = await errorService.getMetrics();

      expect(metrics.byType.api).toBe(3);
      expect(metrics.byType.ui).toBe(1);
      expect(metrics.byEndpoint['/users']).toBe(2);
      expect(metrics.byEndpoint['/stories']).toBe(1);
    });
  });

  describe('EnhancedFingerprintService', () => {
    let fingerprintService: EnhancedFingerprintService;

    beforeEach(() => {
      fingerprintService = new EnhancedFingerprintService();
    });

    it('should generate consistent device fingerprints', async () => {
      const fingerprint1 = await fingerprintService.getFingerprint();
      const fingerprint2 = await fingerprintService.getFingerprint();

      expect(fingerprint1.visitorId).toBe(fingerprint2.visitorId);
      expect(fingerprint1.components).toBeDefined();
      expect(fingerprint1.confidence).toBeGreaterThan(0);
    });

    it('should calculate trust scores for devices', async () => {
      const knownDevice = {
        visitorId: 'known-device-123',
        lastSeen: Date.now() - 86400000, // 1 day ago
        loginCount: 50,
        suspiciousActivity: 0,
      };

      const unknownDevice = {
        visitorId: 'unknown-device-456',
        lastSeen: null,
        loginCount: 0,
        suspiciousActivity: 0,
      };

      const knownScore = await fingerprintService.calculateTrustScore(knownDevice);
      const unknownScore = await fingerprintService.calculateTrustScore(unknownDevice);

      expect(knownScore).toBeGreaterThan(0.8);
      expect(unknownScore).toBeLessThan(0.3);
    });

    it('should detect device anomalies', async () => {
      const normalDevice = {
        visitorId: 'device-123',
        components: {
          userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)',
          language: 'en-US',
          timezone: 'America/New_York',
          screenResolution: '1920x1080',
        },
      };

      const anomalousDevice = {
        visitorId: 'device-123', // Same ID but different characteristics
        components: {
          userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64)',
          language: 'ru-RU',
          timezone: 'Europe/Moscow',
          screenResolution: '1366x768',
        },
      };

      const anomalies = await fingerprintService.detectAnomalies(
        normalDevice,
        anomalousDevice
      );

      expect(anomalies).toContainEqual(
        expect.objectContaining({
          type: 'os-change',
          severity: 'high',
        })
      );
      expect(anomalies).toContainEqual(
        expect.objectContaining({
          type: 'location-change',
          severity: 'medium',
        })
      );
    });
  });

});

describe('Web Services Integration Tests', () => {
  it('should handle complete offline-to-online sync flow', async () => {
    const offlineService = new OfflineService();
    const syncQueue = new SyncQueueService();
    const notificationService = new NotificationService();
    
    // Start offline
    jest.spyOn(offlineService, 'isOnline').mockReturnValue(false);
    
    // Queue multiple operations
    await syncQueue.add({
      type: 'create-story',
      data: { title: 'Offline Story', content: 'Created offline' },
    });
    
    await syncQueue.add({
      type: 'update-profile',
      data: { bio: 'Updated offline' },
    });
    
    await syncQueue.add({
      type: 'upload-media',
      data: { file: new Blob(['image']), metadata: { name: 'photo.jpg' } },
    });
    
    // Verify queued
    const queued = await syncQueue.getAll();
    expect(queued).toHaveLength(3);
    
    // Go online
    jest.spyOn(offlineService, 'isOnline').mockReturnValue(true);
    
    // Process sync
    const results = await syncQueue.processAll();
    
    expect(results.successful).toBe(3);
    expect(results.failed).toBe(0);
    
    // Verify notification shown
    expect(notificationService.showNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Sync Complete',
        body: '3 items synced successfully',
      })
    );
  });
  
  it('should coordinate vault encryption with audit logging', async () => {
    const vaultService = new VaultService();
    const auditService = new AuditLogService();
    
    // Enable audit hooks
    vaultService.enableAuditLogging(auditService);
    
    // Perform vault operations
    const vaultItem = {
      name: 'Sensitive Document',
      content: 'Confidential data',
    };
    
    const encrypted = await vaultService.encryptVaultItem(vaultItem);
    await vaultService.shareVaultItem(encrypted.id, ['user-789']);
    
    // Verify audit trail
    const logs = await auditService.query({ resourceId: encrypted.id });
    
    expect(logs).toContainEqual(
      expect.objectContaining({
        action: 'vault-item-created',
        encrypted: true,
      })
    );
    
    expect(logs).toContainEqual(
      expect.objectContaining({
        action: 'vault-item-shared',
        recipients: ['user-789'],
      })
    );
  });
});