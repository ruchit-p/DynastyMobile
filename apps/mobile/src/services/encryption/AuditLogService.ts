import AsyncStorage from '@react-native-async-storage/async-storage';
import { getFirebaseDb, getFirebaseAuth } from '../../lib/firebase';
import { callFirebaseFunction } from '../../lib/errorUtils';
// import { FirebaseFirestoreTypes } from '@react-native-firebase/firestore';
import { createHash } from 'react-native-quick-crypto';
// import { Buffer } from '@craftzdog/react-native-buffer';
import NetInfo from '@react-native-community/netinfo';
import { logger } from '../LoggingService';

export enum AuditEventType {
  // Authentication Events
  LOGIN = 'auth.login',
  LOGOUT = 'auth.logout',
  LOGIN_FAILED = 'auth.login_failed',
  PASSWORD_CHANGED = 'auth.password_changed',
  TWO_FACTOR_ENABLED = 'auth.2fa_enabled',
  TWO_FACTOR_DISABLED = 'auth.2fa_disabled',
  
  // Encryption Events
  ENCRYPTION_INITIALIZED = 'encryption.initialized',
  ENCRYPTION_KEY_GENERATED = 'encryption.key_generated',
  ENCRYPTION_KEY_ROTATED = 'encryption.key_rotated',
  ENCRYPTION_KEY_BACKED_UP = 'encryption.key_backed_up',
  ENCRYPTION_KEY_RESTORED = 'encryption.key_restored',
  DEVICE_REGISTERED = 'encryption.device_registered',
  DEVICE_REMOVED = 'encryption.device_removed',
  
  // File Events
  FILE_UPLOADED = 'file.uploaded',
  FILE_DOWNLOADED = 'file.downloaded',
  FILE_DELETED = 'file.deleted',
  FILE_SHARED = 'file.shared',
  FILE_SHARE_ACCESSED = 'file.share_accessed',
  FILE_SHARE_REVOKED = 'file.share_revoked',
  FILE_ENCRYPTED = 'file.encrypted',
  FILE_DECRYPTED = 'file.decrypted',
  
  // Message Events
  MESSAGE_SENT = 'message.sent',
  MESSAGE_DELETED = 'message.deleted',
  MESSAGE_ENCRYPTED = 'message.encrypted',
  MESSAGE_DECRYPTED = 'message.decrypted',
  
  // Access Control Events
  PERMISSION_GRANTED = 'access.permission_granted',
  PERMISSION_REVOKED = 'access.permission_revoked',
  ACCESS_DENIED = 'access.denied',
  SUSPICIOUS_ACTIVITY = 'access.suspicious',
  
  // Data Events
  DATA_EXPORTED = 'data.exported',
  DATA_IMPORTED = 'data.imported',
  BACKUP_CREATED = 'data.backup_created',
  BACKUP_RESTORED = 'data.backup_restored',
  
  // Security Events
  SECURITY_ALERT = 'security.alert',
  INVALID_ACCESS_ATTEMPT = 'security.invalid_access',
  BRUTE_FORCE_DETECTED = 'security.brute_force',
  SESSION_EXPIRED = 'security.session_expired'
}

export enum AuditEventSeverity {
  INFO = 'info',
  WARNING = 'warning',
  ERROR = 'error',
  CRITICAL = 'critical'
}

interface AuditEvent {
  id: string;
  timestamp: number;
  userId?: string;
  deviceId?: string;
  eventType: AuditEventType;
  severity: AuditEventSeverity;
  description: string;
  metadata?: Record<string, any>;
  ipAddress?: string;
  userAgent?: string;
  location?: {
    latitude?: number;
    longitude?: number;
    city?: string;
    country?: string;
  };
  resourceId?: string; // ID of affected resource (file, message, etc.)
  resourceType?: string; // Type of resource
  success: boolean;
  errorMessage?: string;
  hash?: string; // Integrity hash for tamper detection
}

interface AuditLogFilter {
  userId?: string;
  eventTypes?: AuditEventType[];
  severity?: AuditEventSeverity[];
  startDate?: Date;
  endDate?: Date;
  resourceId?: string;
  success?: boolean;
  limit?: number;
}

interface AuditStatistics {
  totalEvents: number;
  eventsByType: Record<string, number>;
  eventsBySeverity: Record<string, number>;
  failedAttempts: number;
  suspiciousActivities: number;
  recentAlerts: AuditEvent[];
}

export class AuditLogService {
  private static instance: AuditLogService;
  private db = getFirebaseDb();
  private readonly AUDIT_COLLECTION = 'auditLogs';
  private readonly LOCAL_QUEUE_KEY = '@dynasty_audit_queue';
  private readonly MAX_LOCAL_QUEUE_SIZE = 1000;
  private localQueue: AuditEvent[] = [];
  private isOnline: boolean = true;
  private deviceId?: string;

  private constructor() {
    this.initializeService();
  }

  static getInstance(): AuditLogService {
    if (!AuditLogService.instance) {
      AuditLogService.instance = new AuditLogService();
    }
    return AuditLogService.instance;
  }

  private async initializeService() {
    // Load device ID
    this.deviceId = await this.getDeviceId();
    
    // Load queued events
    await this.loadQueuedEvents();
    
    // Monitor network status
    NetInfo.addEventListener(state => {
      const wasOffline = !this.isOnline;
      this.isOnline = state.isConnected ?? false;
      
      if (wasOffline && this.isOnline) {
        // Flush queued events when back online
        this.flushQueuedEvents();
      }
    });
  }

  /**
   * Log an audit event
   */
  async logEvent(
    eventType: AuditEventType,
    description: string,
    options: {
      severity?: AuditEventSeverity;
      metadata?: Record<string, any>;
      resourceId?: string;
      resourceType?: string;
      success?: boolean;
      errorMessage?: string;
    } = {}
  ): Promise<void> {
    try {
      const {
        severity = AuditEventSeverity.INFO,
        metadata,
        resourceId,
        resourceType,
        success = true,
        errorMessage
      } = options;

      // Get current user
      const auth = getFirebaseAuth();
      const userId = auth.currentUser?.uid;

      // Create audit event
      const event: AuditEvent = {
        id: this.generateEventId(),
        timestamp: Date.now(),
        userId,
        deviceId: this.deviceId,
        eventType,
        severity,
        description,
        metadata,
        resourceId,
        resourceType,
        success,
        errorMessage
      };

      // Add integrity hash
      event.hash = this.generateEventHash(event);

      // Log to Firestore if online, otherwise queue
      if (this.isOnline) {
        await this.sendEventToFirestore(event);
      } else {
        await this.queueEvent(event);
      }

      // For critical events, also send immediate notification
      if (severity === AuditEventSeverity.CRITICAL) {
        await this.notifyCriticalEvent(event);
      }
    } catch (error) {
      logger.error('Failed to log audit event:', error);
      // Don't throw - audit logging should not break app functionality
    }
  }

  /**
   * Log a security event
   */
  async logSecurityEvent(
    eventType: AuditEventType,
    description: string,
    metadata?: Record<string, any>
  ): Promise<void> {
    await this.logEvent(eventType, description, {
      severity: AuditEventSeverity.WARNING,
      metadata,
      success: false
    });
  }

  /**
   * Query audit logs
   */
  async queryLogs(filter: AuditLogFilter): Promise<AuditEvent[]> {
    try {
      let query = this.db.collection(this.AUDIT_COLLECTION)
        .orderBy('timestamp', 'desc');

      // Apply filters
      if (filter.userId) {
        query = query.where('userId', '==', filter.userId);
      }

      if (filter.eventTypes && filter.eventTypes.length > 0) {
        query = query.where('eventType', 'in', filter.eventTypes);
      }

      if (filter.severity && filter.severity.length > 0) {
        query = query.where('severity', 'in', filter.severity);
      }

      if (filter.startDate) {
        query = query.where('timestamp', '>=', filter.startDate.getTime());
      }

      if (filter.endDate) {
        query = query.where('timestamp', '<=', filter.endDate.getTime());
      }

      if (filter.resourceId) {
        query = query.where('resourceId', '==', filter.resourceId);
      }

      if (filter.success !== undefined) {
        query = query.where('success', '==', filter.success);
      }

      // Apply limit
      const limit = filter.limit || 100;
      query = query.limit(limit);

      // Execute query
      const snapshot = await query.get();
      const events: AuditEvent[] = [];

      snapshot.forEach(doc => {
        const event = doc.data() as AuditEvent;
        // Verify integrity
        if (this.verifyEventIntegrity(event)) {
          events.push(event);
        } else {
          logger.warn('Audit event integrity check failed:', event.id);
        }
      });

      return events;
    } catch (error) {
      logger.error('Failed to query audit logs:', error);
      throw error;
    }
  }

  /**
   * Get audit statistics
   */
  async getStatistics(userId?: string, days: number = 30): Promise<AuditStatistics> {
    try {
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - days);

      let query = this.db.collection(this.AUDIT_COLLECTION)
        .where('timestamp', '>=', startDate.getTime());

      if (userId) {
        query = query.where('userId', '==', userId);
      }

      const snapshot = await query.get();
      
      const stats: AuditStatistics = {
        totalEvents: 0,
        eventsByType: Record<string, never>,
        eventsBySeverity: Record<string, never>,
        failedAttempts: 0,
        suspiciousActivities: 0,
        recentAlerts: []
      };

      snapshot.forEach(doc => {
        const event = doc.data() as AuditEvent;
        
        stats.totalEvents++;
        
        // Count by type
        stats.eventsByType[event.eventType] = (stats.eventsByType[event.eventType] || 0) + 1;
        
        // Count by severity
        stats.eventsBySeverity[event.severity] = (stats.eventsBySeverity[event.severity] || 0) + 1;
        
        // Count failures
        if (!event.success) {
          stats.failedAttempts++;
        }
        
        // Count suspicious activities
        if (event.eventType === AuditEventType.SUSPICIOUS_ACTIVITY ||
            event.eventType === AuditEventType.BRUTE_FORCE_DETECTED ||
            event.eventType === AuditEventType.INVALID_ACCESS_ATTEMPT) {
          stats.suspiciousActivities++;
        }
        
        // Collect recent alerts
        if (event.severity === AuditEventSeverity.CRITICAL || 
            event.severity === AuditEventSeverity.ERROR) {
          stats.recentAlerts.push(event);
        }
      });

      // Sort recent alerts by timestamp
      stats.recentAlerts.sort((a, b) => b.timestamp - a.timestamp);
      stats.recentAlerts = stats.recentAlerts.slice(0, 10); // Keep only 10 most recent

      return stats;
    } catch (error) {
      logger.error('Failed to get audit statistics:', error);
      throw error;
    }
  }

  /**
   * Export audit logs
   */
  async exportLogs(
    filter: AuditLogFilter,
    format: 'json' | 'csv' = 'json'
  ): Promise<string> {
    try {
      const events = await this.queryLogs({ ...filter, limit: 10000 });

      if (format === 'json') {
        return JSON.stringify(events, null, 2);
      } else {
        // CSV format
        const headers = [
          'ID', 'Timestamp', 'User ID', 'Event Type', 'Severity',
          'Description', 'Success', 'Error Message'
        ];
        
        const rows = events.map(event => [
          event.id,
          new Date(event.timestamp).toISOString(),
          event.userId || '',
          event.eventType,
          event.severity,
          event.description,
          event.success.toString(),
          event.errorMessage || ''
        ]);

        const csv = [headers, ...rows]
          .map(row => row.map(cell => `"${cell}"`).join(','))
          .join('\n');

        return csv;
      }
    } catch (error) {
      logger.error('Failed to export audit logs:', error);
      throw error;
    }
  }

  /**
   * Generate event ID
   */
  private generateEventId(): string {
    return `evt_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Generate event hash for integrity
   */
  private generateEventHash(event: AuditEvent): string {
    const data = JSON.stringify({
      id: event.id,
      timestamp: event.timestamp,
      userId: event.userId,
      eventType: event.eventType,
      description: event.description,
      success: event.success
    });

    return createHash('sha256').update(data).digest('hex');
  }

  /**
   * Verify event integrity
   */
  private verifyEventIntegrity(event: AuditEvent): boolean {
    if (!event.hash) return true; // No hash to verify

    const expectedHash = this.generateEventHash(event);
    return event.hash === expectedHash;
  }

  /**
   * Send event to Firestore
   */
  private async sendEventToFirestore(event: AuditEvent): Promise<void> {
    await this.db.collection(this.AUDIT_COLLECTION).doc(event.id).set(event);
  }

  /**
   * Queue event for offline logging
   */
  private async queueEvent(event: AuditEvent): Promise<void> {
    this.localQueue.push(event);
    
    // Limit queue size
    if (this.localQueue.length > this.MAX_LOCAL_QUEUE_SIZE) {
      this.localQueue = this.localQueue.slice(-this.MAX_LOCAL_QUEUE_SIZE);
    }
    
    await this.saveQueuedEvents();
  }

  /**
   * Load queued events from storage
   */
  private async loadQueuedEvents(): Promise<void> {
    try {
      const queueData = await AsyncStorage.getItem(this.LOCAL_QUEUE_KEY);
      if (queueData) {
        this.localQueue = JSON.parse(queueData);
      }
    } catch (error) {
      logger.error('Failed to load queued audit events:', error);
    }
  }

  /**
   * Save queued events to storage
   */
  private async saveQueuedEvents(): Promise<void> {
    try {
      await AsyncStorage.setItem(
        this.LOCAL_QUEUE_KEY,
        JSON.stringify(this.localQueue)
      );
    } catch (error) {
      logger.error('Failed to save queued audit events:', error);
    }
  }

  /**
   * Flush queued events to Firestore
   */
  private async flushQueuedEvents(): Promise<void> {
    if (this.localQueue.length === 0) return;

    const eventsToSend = [...this.localQueue];
    this.localQueue = [];
    await this.saveQueuedEvents();

    // Send events in batches
    const batchSize = 100;
    for (let i = 0; i < eventsToSend.length; i += batchSize) {
      const batch = eventsToSend.slice(i, i + batchSize);
      
      try {
        const firestoreBatch = this.db.batch();
        
        batch.forEach(event => {
          const ref = this.db.collection(this.AUDIT_COLLECTION).doc(event.id);
          firestoreBatch.set(ref, event);
        });
        
        await firestoreBatch.commit();
      } catch (error) {
        logger.error('Failed to flush audit events batch:', error);
        // Re-queue failed events
        this.localQueue.push(...batch);
        await this.saveQueuedEvents();
      }
    }
  }

  /**
   * Notify about critical events
   */
  private async notifyCriticalEvent(event: AuditEvent): Promise<void> {
    try {
      await callFirebaseFunction('notifyCriticalAuditEvent', {
        event,
        timestamp: Date.now()
      });
    } catch (error) {
      logger.error('Failed to notify critical event:', error);
    }
  }

  /**
   * Get device ID
   */
  private async getDeviceId(): Promise<string> {
    try {
      let deviceId = await AsyncStorage.getItem('@dynasty_device_id');
      
      if (!deviceId) {
        deviceId = `dev_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        await AsyncStorage.setItem('@dynasty_device_id', deviceId);
      }
      
      return deviceId;
    } catch (error) {
      logger.error('Failed to get device ID:', error);
      return 'unknown';
    }
  }

  /**
   * Monitor suspicious activities
   */
  async monitorSuspiciousActivity(userId: string): Promise<{
    isSuspicious: boolean;
    reasons: string[];
  }> {
    try {
      // Check recent failed attempts
      const recentFailures = await this.queryLogs({
        userId,
        eventTypes: [
          AuditEventType.LOGIN_FAILED,
          AuditEventType.ACCESS_DENIED,
          AuditEventType.INVALID_ACCESS_ATTEMPT
        ],
        success: false,
        startDate: new Date(Date.now() - 15 * 60 * 1000) // Last 15 minutes
      });

      const reasons: string[] = [];
      
      // Too many failed attempts
      if (recentFailures.length > 5) {
        reasons.push(`${recentFailures.length} failed access attempts in last 15 minutes`);
      }

      // Check for unusual locations
      const locations = new Set(
        recentFailures
          .map(e => e.location?.country)
          .filter(Boolean)
      );
      
      if (locations.size > 2) {
        reasons.push('Access attempts from multiple countries');
      }

      // Check for rapid-fire attempts
      const timestamps = recentFailures.map(e => e.timestamp).sort();
      for (let i = 1; i < timestamps.length; i++) {
        if (timestamps[i] - timestamps[i-1] < 1000) { // Less than 1 second
          reasons.push('Rapid-fire access attempts detected');
          break;
        }
      }

      const isSuspicious = reasons.length > 0;

      if (isSuspicious) {
        await this.logSecurityEvent(
          AuditEventType.SUSPICIOUS_ACTIVITY,
          'Suspicious activity detected',
          { userId, reasons }
        );
      }

      return { isSuspicious, reasons };
    } catch (error) {
      logger.error('Failed to monitor suspicious activity:', error);
      return { isSuspicious: false, reasons: [] };
    }
  }

  /**
   * Clean up old audit logs
   */
  async cleanupOldLogs(retentionDays: number = 90): Promise<void> {
    try {
      const cutoffDate = Date.now() - (retentionDays * 24 * 60 * 60 * 1000);
      
      const snapshot = await this.db
        .collection(this.AUDIT_COLLECTION)
        .where('timestamp', '<', cutoffDate)
        .limit(500)
        .get();

      const batch = this.db.batch();
      
      snapshot.forEach(doc => {
        batch.delete(doc.ref);
      });

      await batch.commit();
      
      logger.debug(`Cleaned up ${snapshot.size} old audit logs`);
    } catch (error) {
      logger.error('Failed to cleanup old logs:', error);
    }
  }
}

export default AuditLogService;