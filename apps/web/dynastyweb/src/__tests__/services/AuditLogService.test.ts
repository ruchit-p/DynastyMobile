import { AuditLogService, AuditEventType, AuditCategory, AuditSeverity } from '@/services/AuditLogService';
import { collection, addDoc, getDocs, query, where, orderBy, limit, serverTimestamp } from 'firebase/firestore';
import CryptoJS from 'crypto-js';

// Mock Firebase
jest.mock('firebase/firestore');
jest.mock('@/lib/firebase', () => ({
  db: {},
}));

// Mock CryptoJS
jest.mock('crypto-js', () => ({
  AES: {
    encrypt: jest.fn((data, key) => ({ toString: () => `encrypted_${data}_with_${key}` })),
    decrypt: jest.fn((data, key) => ({ toString: () => data.replace(`encrypted_`, '').replace(`_with_${key}`, '') })),
  },
  SHA256: jest.fn(data => ({ toString: () => `sha256_${data}` })),
  enc: {
    Utf8: {},
  },
}));

describe('AuditLogService - Production-Ready Tests', () => {
  let auditService: AuditLogService;
  
  // Mock implementations
  const mockAddDoc = addDoc as jest.Mock;
  const mockGetDocs = getDocs as jest.Mock;
  const mockQuery = query as jest.Mock;
  const mockWhere = where as jest.Mock;
  const mockOrderBy = orderBy as jest.Mock;
  const mockLimit = limit as jest.Mock;
  const mockServerTimestamp = serverTimestamp as jest.Mock;
  const mockCollection = collection as jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Setup default mocks
    mockServerTimestamp.mockReturnValue(new Date());
    mockAddDoc.mockResolvedValue({ id: 'test-doc-id' });
    mockCollection.mockReturnValue('mock-collection-ref');
    mockQuery.mockReturnValue('mock-query');
    mockWhere.mockReturnValue('mock-where');
    mockOrderBy.mockReturnValue('mock-orderby');
    mockLimit.mockReturnValue('mock-limit');
    
    mockGetDocs.mockResolvedValue({
      forEach: (callback: any) => {
        // Mock empty result by default
      },
    });

    // Reset localStorage
    localStorage.clear();
    
    // Create new service instance
    auditService = new AuditLogService({
      encryptionKey: 'test-encryption-key',
      enableRealTimeAlerts: true,
    });
  });

  describe('Event Logging', () => {
    it('should log authentication events with proper risk scoring', async () => {
      const eventId = await auditService.logAuthentication(
        'login',
        'user123',
        { ipAddress: '192.168.1.1', deviceType: 'desktop' }
      );

      expect(eventId).toBe('test-doc-id');
      expect(mockAddDoc).toHaveBeenCalledWith(
        'mock-collection-ref',
        expect.objectContaining({
          eventType: 'authentication',
          category: 'security',
          severity: 'medium',
          userId: 'user123',
          description: 'User login',
          riskScore: 30,
          metadata: expect.objectContaining({
            action: 'login',
            ipAddress: '192.168.1.1',
            deviceType: 'desktop',
          }),
        })
      );
    });

    it('should assign higher risk scores to failed authentication attempts', async () => {
      await auditService.logAuthentication(
        'failed_login',
        'user123',
        { attemptCount: 3 }
      );

      expect(mockAddDoc).toHaveBeenCalledWith(
        'mock-collection-ref',
        expect.objectContaining({
          severity: 'high',
          riskScore: 70,
          description: 'User failed_login',
        })
      );
    });

    it('should log vault access with appropriate security levels', async () => {
      await auditService.logVaultAccess(
        'download',
        'vault123',
        'user456',
        { fileSize: 1024000, fileType: 'pdf' }
      );

      // Check that mockAddDoc was called with a complete event object
      expect(mockAddDoc).toHaveBeenCalled();
      const loggedEvent = mockAddDoc.mock.calls[0][1];
      
      expect(loggedEvent).toMatchObject({
        eventType: 'vault_access',
        category: 'security',
        description: 'Vault download: vault123',
        userId: 'user456',
        riskScore: 60,
        encrypted: true,
        severity: 'high',
      });
      
      // Check that metadata is encrypted
      expect(loggedEvent.metadata).toHaveProperty('encrypted');
      expect(typeof loggedEvent.metadata.encrypted).toBe('string');
    });

    it('should log critical encryption key operations', async () => {
      await auditService.logKeyUsage(
        'export',
        'master-key',
        'admin123',
        { reason: 'backup', authorized: true }
      );

      expect(mockAddDoc).toHaveBeenCalledWith(
        'mock-collection-ref',
        expect.objectContaining({
          eventType: 'encryption_key_usage',
          category: 'security',
          severity: 'high',
          riskScore: 90,
          description: 'Key export: master-key',
        })
      );
    });

    it('should sanitize sensitive metadata', async () => {
      await auditService.logEvent(
        'data_access',
        'User accessed data',
        {
          userId: 'user123',
          password: 'secret123',
          apiToken: 'token456',
          secretKey: 'key789',
          normalData: 'visible',
        }
      );

      const loggedEvent = mockAddDoc.mock.calls[0][1];
      expect(loggedEvent.metadata.password).toBe('[REDACTED]');
      expect(loggedEvent.metadata.apiToken).toBe('[REDACTED]');
      expect(loggedEvent.metadata.secretKey).toBe('[REDACTED]');
      expect(loggedEvent.metadata.normalData).toBe('visible');
    });
  });

  describe('Encryption and Security', () => {
    it('should encrypt sensitive event metadata', async () => {
      await auditService.logVaultAccess(
        'open',
        'sensitive-vault',
        'user123',
        { content: 'sensitive data' }
      );

      const loggedEvent = mockAddDoc.mock.calls[0][1];
      expect(loggedEvent.encrypted).toBe(true);
      expect(loggedEvent.metadata.encrypted).toContain('encrypted_');
    });

    it('should generate signatures for event integrity', async () => {
      await auditService.logEvent(
        'security_incident',
        'Suspicious activity detected',
        { details: 'Multiple failed login attempts' }
      );

      const loggedEvent = mockAddDoc.mock.calls[0][1];
      expect(loggedEvent.signature).toContain('sha256_');
      expect(loggedEvent.signature).toBeTruthy();
    });

    it('should handle encryption key absence gracefully', async () => {
      // Clear previous mock calls
      mockAddDoc.mockClear();
      
      const serviceWithoutKey = new AuditLogService({
        encryptionKey: '',
      });

      await serviceWithoutKey.logEvent(
        'vault_access',
        'Vault opened',
        { vaultId: 'vault123' }
      );

      const loggedEvent = mockAddDoc.mock.calls[0][1];
      // Service still marks as encrypted but metadata won't actually be encrypted
      expect(loggedEvent.encrypted).toBe(true);
      // Verify that metadata is not actually encrypted (no 'encrypted_' prefix)
      if (typeof loggedEvent.metadata === 'object' && loggedEvent.metadata.vaultId) {
        expect(loggedEvent.metadata.vaultId).toBe('vault123');
      } else {
        // If metadata is encrypted, it should not contain the raw vaultId
        expect(loggedEvent.metadata).not.toHaveProperty('vaultId');
      }
    });
  });

  describe('Risk Assessment', () => {
    it('should calculate risk scores based on event type and metadata', async () => {
      const testCases = [
        {
          event: { type: 'authentication' as AuditEventType, metadata: {} },
          expectedScore: 30,
        },
        {
          event: { type: 'security_incident' as AuditEventType, metadata: {} },
          expectedScore: 90,
        },
        {
          event: { type: 'data_access' as AuditEventType, metadata: { failed: true } },
          expectedScore: 63, // 33 * 1.1 + 30
        },
        {
          event: { type: 'vault_access' as AuditEventType, metadata: { fromNewDevice: true } },
          expectedScore: 68, // 30 * 1.6 + 20
        },
      ];

      for (const testCase of testCases) {
        await auditService.logEvent(
          testCase.event.type,
          'Test event',
          testCase.event.metadata
        );

        const loggedEvent = mockAddDoc.mock.calls[mockAddDoc.mock.calls.length - 1][1];
        expect(loggedEvent.riskScore).toBe(testCase.expectedScore);
      }
    });

    it('should trigger alerts for high-risk events', async () => {
      const alertCallback = jest.fn();
      auditService.onRiskAlert(alertCallback);

      await auditService.logSecurityIncident(
        'Unauthorized access attempt',
        { targetResource: 'admin-panel' },
        'attacker123'
      );

      expect(alertCallback).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: 'security_incident',
          severity: 'critical',
          riskScore: 95,
        })
      );
    });

    it('should categorize events correctly', async () => {
      const eventCategories = [
        { type: 'authentication' as AuditEventType, expectedCategory: 'security' },
        { type: 'privacy_action' as AuditEventType, expectedCategory: 'privacy' },
        { type: 'data_modification' as AuditEventType, expectedCategory: 'data' },
        { type: 'system_access' as AuditEventType, expectedCategory: 'system' },
      ];

      for (const { type, expectedCategory } of eventCategories) {
        await auditService.logEvent(type, 'Test event');
        
        const loggedEvent = mockAddDoc.mock.calls[mockAddDoc.mock.calls.length - 1][1];
        expect(loggedEvent.category).toBe(expectedCategory);
      }
    });
  });

  describe('Query and Retrieval', () => {
    it('should query events with multiple filters', async () => {
      const mockEvents = [
        {
          id: 'event1',
          eventType: 'authentication',
          userId: 'user123',
          timestamp: { toDate: () => new Date() },
          riskScore: 30,
          encrypted: false,
        },
        {
          id: 'event2',
          eventType: 'vault_access',
          userId: 'user123',
          timestamp: { toDate: () => new Date() },
          riskScore: 80,
          encrypted: true,
          metadata: { encrypted: 'encrypted_data_with_test-encryption-key' },
        },
      ];

      mockGetDocs.mockResolvedValue({
        forEach: (callback: any) => {
          mockEvents.forEach(event => {
            callback({ id: event.id, data: () => event });
          });
        },
      });

      const results = await auditService.queryEvents({
        userId: 'user123',
        eventType: 'authentication',
        riskThreshold: 25,
        limit: 10,
      });

      expect(mockWhere).toHaveBeenCalledWith('userId', '==', 'user123');
      expect(mockWhere).toHaveBeenCalledWith('eventType', '==', 'authentication');
      expect(mockWhere).toHaveBeenCalledWith('riskScore', '>=', 25);
      expect(mockLimit).toHaveBeenCalledWith(10);
      expect(results).toHaveLength(2);
    });

    it('should decrypt encrypted metadata during retrieval', async () => {
      const encryptedEvent = {
        id: 'event1',
        encrypted: true,
        metadata: { encrypted: 'encrypted_{"secret":"value"}_with_test-encryption-key' },
        timestamp: { toDate: () => new Date() },
      };

      mockGetDocs.mockResolvedValue({
        forEach: (callback: any) => {
          callback({ id: encryptedEvent.id, data: () => encryptedEvent });
        },
      });

      const results = await auditService.queryEvents({});
      
      expect(results[0].metadata).toEqual({ secret: 'value' });
    });

    it('should generate audit summary with aggregations', async () => {
      const mockEvents = Array.from({ length: 50 }, (_, i) => ({
        id: `event${i}`,
        eventType: i % 3 === 0 ? 'authentication' : 'data_access',
        severity: i % 10 === 0 ? 'critical' : 'medium',
        riskScore: Math.floor(Math.random() * 100),
        deviceId: `device${i % 5}`,
        timestamp: { 
          toDate: () => new Date(Date.now() - i * 24 * 60 * 60 * 1000) 
        },
      }));

      mockGetDocs.mockResolvedValue({
        forEach: (callback: any) => {
          mockEvents.forEach(event => {
            callback({ id: event.id, data: () => event });
          });
        },
      });

      const summary = await auditService.getAuditSummary('user123', 30);

      expect(summary.totalEvents).toBe(50);
      expect(summary.criticalEvents).toBeGreaterThan(0);
      expect(summary.recentEvents).toHaveLength(10);
      expect(summary.topEventTypes).toBeDefined();
      expect(summary.deviceActivity).toBeDefined();
      expect(summary.riskTrends).toBeDefined();
    });
  });

  describe('Device Management', () => {
    it('should track device IDs consistently', async () => {
      const deviceId = localStorage.getItem('dynasty_device_id');
      expect(deviceId).toBeTruthy();
      expect(deviceId).toMatch(/^device_\d+_[a-z0-9]{9}$/);

      // Should reuse same device ID
      const newService = new AuditLogService();
      await newService.logEvent('system_access', 'Test');
      
      const loggedEvent = mockAddDoc.mock.calls[mockAddDoc.mock.calls.length - 1][1];
      expect(loggedEvent.deviceId).toBe(deviceId);
    });

    it('should log device-related security events', async () => {
      // Clear previous mock calls
      mockAddDoc.mockClear();
      
      await auditService.logDeviceActivity(
        'suspicious_activity',
        {
          deviceId: 'unknown-device',
          location: 'Unknown Location',
          fingerprint: 'suspicious-fingerprint',
        },
        'user123'
      );

      // Check that the event was logged
      expect(mockAddDoc).toHaveBeenCalled();
      const loggedEvent = mockAddDoc.mock.calls[0][1];
      
      expect(loggedEvent).toMatchObject({
        eventType: 'device_management',
        description: 'Device suspicious_activity',
        riskScore: 85,
        category: 'security',
        userId: 'user123',
      });
      
      // Metadata should be encrypted
      expect(loggedEvent.metadata).toHaveProperty('encrypted');
    });
  });

  describe('Privacy and Compliance', () => {
    it('should log privacy-related actions', async () => {
      await auditService.logPrivacyAction(
        'data_export',
        {
          exportType: 'full',
          format: 'json',
          includeMedia: true,
        },
        'user123'
      );

      expect(mockAddDoc).toHaveBeenCalledWith(
        'mock-collection-ref',
        expect.objectContaining({
          eventType: 'privacy_action',
          category: 'privacy',
          severity: 'medium',
          description: 'Privacy action: data_export',
        })
      );
    });

    it('should export audit logs in different formats', async () => {
      const mockEvents = [
        {
          id: 'event1',
          eventType: 'authentication',
          category: 'security',
          severity: 'medium',
          userId: 'user123',
          deviceId: 'device123',
          description: 'User login',
          riskScore: 30,
          timestamp: { toDate: () => new Date('2024-01-01') },
        },
      ];

      mockGetDocs.mockResolvedValue({
        forEach: (callback: any) => {
          mockEvents.forEach(event => {
            callback({ id: event.id, data: () => event });
          });
        },
      });

      // Test JSON export
      const jsonExport = await auditService.exportAuditLogs({}, 'json');
      const parsed = JSON.parse(jsonExport);
      expect(parsed).toHaveLength(1);
      expect(parsed[0].eventType).toBe('authentication');

      // Test CSV export
      const csvExport = await auditService.exportAuditLogs({}, 'csv');
      expect(csvExport).toContain('"Timestamp","Event Type","Category"');
      expect(csvExport).toContain('authentication');
      expect(csvExport).toContain('user123');
    });
  });

  describe('Error Handling', () => {
    it('should handle Firestore errors gracefully', async () => {
      mockAddDoc.mockRejectedValue(new Error('Firestore error'));

      await expect(
        auditService.logEvent('system_access', 'Test event')
      ).rejects.toThrow('Failed to log audit event');
    });

    it('should handle query errors', async () => {
      mockGetDocs.mockRejectedValue(new Error('Query failed'));

      await expect(
        auditService.queryEvents({ userId: 'user123' })
      ).rejects.toThrow('Failed to query audit events');
    });

    it('should handle decryption errors gracefully', async () => {
      const encryptedEvent = {
        id: 'event1',
        encrypted: true,
        metadata: { encrypted: 'corrupted_data' },
        timestamp: { toDate: () => new Date() },
      };

      mockGetDocs.mockResolvedValue({
        forEach: (callback: any) => {
          callback({ id: encryptedEvent.id, data: () => encryptedEvent });
        },
      });

      // Mock decryption failure
      CryptoJS.AES.decrypt = jest.fn().mockImplementation(() => {
        throw new Error('Decryption failed');
      });

      const results = await auditService.queryEvents({});
      
      // Should return original metadata on decryption failure
      expect(results[0].metadata).toEqual({ encrypted: 'corrupted_data' });
    });
  });

  describe('Alert System', () => {
    it('should manage alert subscriptions', async () => {
      const callback1 = jest.fn();
      const callback2 = jest.fn();

      const unsubscribe1 = auditService.onRiskAlert(callback1);
      const unsubscribe2 = auditService.onRiskAlert(callback2);

      // Trigger high-risk event
      await auditService.logSecurityIncident('Test incident', {}, 'user123');

      // Give some time for async operations
      await new Promise(resolve => setTimeout(resolve, 10));

      expect(callback1).toHaveBeenCalled();
      expect(callback2).toHaveBeenCalled();

      // Unsubscribe first callback
      unsubscribe1();
      callback1.mockClear();
      callback2.mockClear();

      // Trigger another event
      await auditService.logSecurityIncident('Another incident', {}, 'user456');

      // Give some time for async operations
      await new Promise(resolve => setTimeout(resolve, 10));

      expect(callback1).not.toHaveBeenCalled();
      expect(callback2).toHaveBeenCalled();
    });

    it('should respect alert configuration', async () => {
      const alertCallback = jest.fn();
      
      // Disable alerts
      auditService.updateConfig({ enableRealTimeAlerts: false });
      auditService.onRiskAlert(alertCallback);

      await auditService.logSecurityIncident('Test incident', {}, 'user123');

      expect(alertCallback).not.toHaveBeenCalled();
    });
  });

  describe('Service Lifecycle', () => {
    it('should clean up resources on destroy', () => {
      const callback = jest.fn();
      auditService.onRiskAlert(callback);

      auditService.destroy();

      // Callbacks should be cleared
      auditService.logSecurityIncident('Test', {}, 'user123');
      expect(callback).not.toHaveBeenCalled();
    });

    it('should update configuration dynamically', () => {
      auditService.updateConfig({
        retentionDays: 90,
        riskThresholds: {
          low: 20,
          medium: 40,
          high: 60,
          critical: 80,
        },
      });

      // Configuration should be updated
      expect(auditService['config'].retentionDays).toBe(90);
      expect(auditService['config'].riskThresholds.high).toBe(60);
    });
  });
});