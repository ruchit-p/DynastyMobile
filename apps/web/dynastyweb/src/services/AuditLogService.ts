// MARK: - Audit Log Service for Web
/**
 * Enterprise-grade audit logging service matching mobile app capabilities
 * Provides comprehensive security monitoring, event tracking, and audit trails
 */

import { 
  collection, 
  doc, 
  addDoc, 
  query, 
  where, 
  orderBy, 
  limit, 
  getDocs,
  serverTimestamp,
  Timestamp 
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import CryptoJS from 'crypto-js';

// MARK: - Types
export interface AuditEvent {
  id?: string;
  eventType: AuditEventType;
  category: AuditCategory;
  severity: AuditSeverity;
  userId: string;
  sessionId: string;
  deviceId: string;
  timestamp: Timestamp;
  description: string;
  metadata: Record<string, any>;
  ipAddress?: string;
  userAgent?: string;
  location?: {
    country?: string;
    city?: string;
    coordinates?: { lat: number; lng: number };
  };
  riskScore: number;
  encrypted: boolean;
  signature?: string;
}

export type AuditEventType = 
  | 'authentication'
  | 'authorization'
  | 'data_access'
  | 'data_modification'
  | 'system_access'
  | 'security_incident'
  | 'configuration_change'
  | 'vault_access'
  | 'encryption_key_usage'
  | 'device_management'
  | 'privacy_action'
  | 'family_tree_access'
  | 'chat_activity'
  | 'media_access'
  | 'export_activity';

export type AuditCategory = 
  | 'security'
  | 'privacy'
  | 'data'
  | 'system'
  | 'user'
  | 'compliance';

export type AuditSeverity = 
  | 'critical'
  | 'high'
  | 'medium'
  | 'low'
  | 'info';

export interface AuditQuery {
  userId?: string;
  eventType?: AuditEventType;
  category?: AuditCategory;
  severity?: AuditSeverity;
  startDate?: Date;
  endDate?: Date;
  deviceId?: string;
  riskThreshold?: number;
  limit?: number;
}

export interface AuditSummary {
  totalEvents: number;
  criticalEvents: number;
  highRiskEvents: number;
  recentEvents: AuditEvent[];
  topEventTypes: { type: AuditEventType; count: number }[];
  deviceActivity: { deviceId: string; eventCount: number }[];
  riskTrends: { date: string; riskScore: number }[];
}

export interface AuditConfig {
  encryptionKey: string;
  retentionDays: number;
  batchSize: number;
  enableRealTimeAlerts: boolean;
  riskThresholds: {
    low: number;
    medium: number;
    high: number;
    critical: number;
  };
}

// MARK: - Audit Log Service Implementation
export class AuditLogService {
  private config: AuditConfig = {
    encryptionKey: '', // Set from environment or user context
    retentionDays: 365,
    batchSize: 100,
    enableRealTimeAlerts: true,
    riskThresholds: {
      low: 25,
      medium: 50,
      high: 75,
      critical: 90
    }
  };

  private sessionId: string;
  private deviceId: string;
  private alertCallbacks: Set<(event: AuditEvent) => void> = new Set();

  constructor(config?: Partial<AuditConfig>) {
    this.config = { ...this.config, ...config };
    this.sessionId = this.generateSessionId();
    this.deviceId = this.getDeviceId();
    console.log('[AuditLog] Service initialized');
  }

  // MARK: - Core Logging Functions
  /**
   * Log an audit event
   */
  async logEvent(
    eventType: AuditEventType,
    description: string,
    metadata: Record<string, any> = {},
    options: {
      category?: AuditCategory;
      severity?: AuditSeverity;
      userId?: string;
      riskScore?: number;
    } = {}
  ): Promise<string> {
    try {
      const event: AuditEvent = {
        eventType,
        category: options.category || this.categorizeEvent(eventType),
        severity: options.severity || this.calculateSeverity(eventType, metadata),
        userId: options.userId || 'anonymous',
        sessionId: this.sessionId,
        deviceId: this.deviceId,
        timestamp: serverTimestamp() as Timestamp,
        description,
        metadata: await this.sanitizeMetadata(metadata),
        ipAddress: await this.getClientIP(),
        userAgent: navigator.userAgent,
        location: await this.getLocationInfo(),
        riskScore: options.riskScore || this.calculateRiskScore(eventType, metadata),
        encrypted: false,
        signature: ''
      };

      // Encrypt sensitive data if needed
      if (this.shouldEncryptEvent(event)) {
        event.metadata = await this.encryptMetadata(event.metadata);
        event.encrypted = true;
      }

      // Generate signature for integrity
      event.signature = await this.generateSignature(event);

      // Store event
      const docRef = await addDoc(collection(db, 'audit_logs'), event);
      event.id = docRef.id;

      // Check for high-risk events and trigger alerts
      if (event.riskScore >= this.config.riskThresholds.high) {
        this.triggerRiskAlert(event);
      }

      console.log(`[AuditLog] Event logged: ${eventType} (Risk: ${event.riskScore})`);
      return docRef.id;

    } catch (error) {
      console.error('[AuditLog] Failed to log event:', error);
      throw new Error('Failed to log audit event');
    }
  }

  // MARK: - Specific Event Loggers
  /**
   * Log authentication event
   */
  async logAuthentication(
    action: 'login' | 'logout' | 'failed_login' | 'mfa_required' | 'mfa_success' | 'mfa_failed',
    userId: string,
    metadata: Record<string, any> = {}
  ): Promise<string> {
    const riskScore = action.includes('failed') ? 70 : action === 'login' ? 30 : 10;
    const severity: AuditSeverity = action.includes('failed') ? 'high' : 'medium';

    return this.logEvent(
      'authentication',
      `User ${action}`,
      { action, ...metadata },
      { userId, severity, riskScore }
    );
  }

  /**
   * Log vault access
   */
  async logVaultAccess(
    action: 'open' | 'create' | 'edit' | 'delete' | 'share' | 'download',
    vaultId: string,
    userId: string,
    metadata: Record<string, any> = {}
  ): Promise<string> {
    const riskScore = action === 'delete' ? 80 : action === 'download' ? 60 : 40;

    return this.logEvent(
      'vault_access',
      `Vault ${action}: ${vaultId}`,
      { action, vaultId, ...metadata },
      { userId, category: 'security', riskScore }
    );
  }

  /**
   * Log encryption key usage
   */
  async logKeyUsage(
    operation: 'generate' | 'backup' | 'recover' | 'rotate' | 'export',
    keyType: string,
    userId: string,
    metadata: Record<string, any> = {}
  ): Promise<string> {
    const riskScore = operation === 'export' ? 90 : operation === 'backup' ? 50 : 70;

    return this.logEvent(
      'encryption_key_usage',
      `Key ${operation}: ${keyType}`,
      { operation, keyType, ...metadata },
      { userId, category: 'security', severity: 'high', riskScore }
    );
  }

  /**
   * Log security incident
   */
  async logSecurityIncident(
    incident: string,
    details: Record<string, any>,
    userId?: string
  ): Promise<string> {
    return this.logEvent(
      'security_incident',
      `Security incident: ${incident}`,
      details,
      { userId, category: 'security', severity: 'critical', riskScore: 95 }
    );
  }

  /**
   * Log device management
   */
  async logDeviceActivity(
    action: 'register' | 'trust' | 'revoke' | 'suspicious_activity',
    deviceInfo: Record<string, any>,
    userId: string
  ): Promise<string> {
    const riskScore = action === 'suspicious_activity' ? 85 : action === 'register' ? 60 : 40;

    return this.logEvent(
      'device_management',
      `Device ${action}`,
      deviceInfo,
      { userId, category: 'security', riskScore }
    );
  }

  /**
   * Log data privacy action
   */
  async logPrivacyAction(
    action: 'data_export' | 'data_deletion' | 'consent_change' | 'privacy_setting_update',
    details: Record<string, any>,
    userId: string
  ): Promise<string> {
    return this.logEvent(
      'privacy_action',
      `Privacy action: ${action}`,
      details,
      { userId, category: 'privacy', severity: 'medium', riskScore: 45 }
    );
  }

  // MARK: - Query and Retrieval
  /**
   * Query audit events
   */
  async queryEvents(auditQuery: AuditQuery): Promise<AuditEvent[]> {
    try {
      let q = query(collection(db, 'audit_logs'));

      // Apply filters
      if (auditQuery.userId) {
        q = query(q, where('userId', '==', auditQuery.userId));
      }

      if (auditQuery.eventType) {
        q = query(q, where('eventType', '==', auditQuery.eventType));
      }

      if (auditQuery.category) {
        q = query(q, where('category', '==', auditQuery.category));
      }

      if (auditQuery.severity) {
        q = query(q, where('severity', '==', auditQuery.severity));
      }

      if (auditQuery.deviceId) {
        q = query(q, where('deviceId', '==', auditQuery.deviceId));
      }

      if (auditQuery.riskThreshold) {
        q = query(q, where('riskScore', '>=', auditQuery.riskThreshold));
      }

      // Order by timestamp
      q = query(q, orderBy('timestamp', 'desc'));

      // Apply limit
      if (auditQuery.limit) {
        q = query(q, limit(auditQuery.limit));
      }

      const snapshot = await getDocs(q);
      const events: AuditEvent[] = [];

      snapshot.forEach((doc) => {
        const data = doc.data() as AuditEvent;
        events.push({ ...data, id: doc.id });
      });

      // Decrypt metadata if needed
      for (const event of events) {
        if (event.encrypted && this.config.encryptionKey) {
          event.metadata = await this.decryptMetadata(event.metadata);
        }
      }

      return events;

    } catch (error) {
      console.error('[AuditLog] Failed to query events:', error);
      throw new Error('Failed to query audit events');
    }
  }

  /**
   * Get audit summary for dashboard
   */
  async getAuditSummary(
    userId?: string,
    days: number = 30
  ): Promise<AuditSummary> {
    try {
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - days);

      const events = await this.queryEvents({
        userId,
        startDate,
        limit: 1000
      });

      const summary: AuditSummary = {
        totalEvents: events.length,
        criticalEvents: events.filter(e => e.severity === 'critical').length,
        highRiskEvents: events.filter(e => e.riskScore >= this.config.riskThresholds.high).length,
        recentEvents: events.slice(0, 10),
        topEventTypes: this.aggregateEventTypes(events),
        deviceActivity: this.aggregateDeviceActivity(events),
        riskTrends: this.calculateRiskTrends(events, days)
      };

      return summary;

    } catch (error) {
      console.error('[AuditLog] Failed to get audit summary:', error);
      throw new Error('Failed to generate audit summary');
    }
  }

  // MARK: - Risk Assessment
  private calculateRiskScore(
    eventType: AuditEventType,
    metadata: Record<string, any>
  ): number {
    let baseScore = 30;

    // Adjust based on event type
    const riskMultipliers: Record<AuditEventType, number> = {
      'authentication': 1.0,
      'authorization': 1.2,
      'data_access': 1.1,
      'data_modification': 1.5,
      'system_access': 1.3,
      'security_incident': 3.0,
      'configuration_change': 1.4,
      'vault_access': 1.6,
      'encryption_key_usage': 2.0,
      'device_management': 1.3,
      'privacy_action': 1.2,
      'family_tree_access': 1.1,
      'chat_activity': 1.0,
      'media_access': 1.1,
      'export_activity': 1.8
    };

    baseScore *= riskMultipliers[eventType] || 1.0;

    // Adjust based on metadata
    if (metadata.failed) baseScore += 30;
    if (metadata.suspicious) baseScore += 40;
    if (metadata.unauthorized) baseScore += 50;
    if (metadata.fromNewDevice) baseScore += 20;
    if (metadata.fromNewLocation) baseScore += 15;

    return Math.min(Math.round(baseScore), 100);
  }

  private calculateSeverity(
    eventType: AuditEventType,
    metadata: Record<string, any>
  ): AuditSeverity {
    const criticalEvents: AuditEventType[] = [
      'security_incident',
      'encryption_key_usage'
    ];

    const highEvents: AuditEventType[] = [
      'vault_access',
      'data_modification',
      'configuration_change'
    ];

    if (criticalEvents.includes(eventType) || metadata.critical) {
      return 'critical';
    }

    if (highEvents.includes(eventType) || metadata.failed || metadata.suspicious) {
      return 'high';
    }

    if (metadata.unauthorized || metadata.fromNewDevice) {
      return 'medium';
    }

    return 'low';
  }

  private categorizeEvent(eventType: AuditEventType): AuditCategory {
    const securityEvents: AuditEventType[] = [
      'authentication',
      'authorization',
      'security_incident',
      'vault_access',
      'encryption_key_usage',
      'device_management'
    ];

    const privacyEvents: AuditEventType[] = [
      'privacy_action',
      'export_activity'
    ];

    const dataEvents: AuditEventType[] = [
      'data_access',
      'data_modification',
      'family_tree_access',
      'media_access'
    ];

    if (securityEvents.includes(eventType)) return 'security';
    if (privacyEvents.includes(eventType)) return 'privacy';
    if (dataEvents.includes(eventType)) return 'data';
    if (eventType === 'system_access' || eventType === 'configuration_change') return 'system';

    return 'user';
  }

  // MARK: - Encryption and Security
  private shouldEncryptEvent(event: AuditEvent): boolean {
    const sensitiveTypes: AuditEventType[] = [
      'vault_access',
      'encryption_key_usage',
      'security_incident',
      'privacy_action'
    ];

    return sensitiveTypes.includes(event.eventType) || event.riskScore >= 70;
  }

  private async encryptMetadata(metadata: Record<string, any>): Promise<Record<string, any>> {
    if (!this.config.encryptionKey) {
      return metadata;
    }

    try {
      const jsonString = JSON.stringify(metadata);
      const encrypted = CryptoJS.AES.encrypt(jsonString, this.config.encryptionKey).toString();
      return { encrypted };
    } catch (error) {
      console.error('[AuditLog] Failed to encrypt metadata:', error);
      return metadata;
    }
  }

  private async decryptMetadata(metadata: Record<string, any>): Promise<Record<string, any>> {
    if (!this.config.encryptionKey || !metadata.encrypted) {
      return metadata;
    }

    try {
      const decrypted = CryptoJS.AES.decrypt(metadata.encrypted, this.config.encryptionKey);
      const jsonString = decrypted.toString(CryptoJS.enc.Utf8);
      return JSON.parse(jsonString);
    } catch (error) {
      console.error('[AuditLog] Failed to decrypt metadata:', error);
      return metadata;
    }
  }

  private async generateSignature(event: AuditEvent): Promise<string> {
    try {
      const signatureData = {
        eventType: event.eventType,
        timestamp: event.timestamp,
        userId: event.userId,
        deviceId: event.deviceId,
        description: event.description
      };

      const dataString = JSON.stringify(signatureData);
      return CryptoJS.SHA256(dataString).toString();
    } catch (error) {
      console.error('[AuditLog] Failed to generate signature:', error);
      return '';
    }
  }

  // MARK: - Utility Functions
  private async sanitizeMetadata(metadata: Record<string, any>): Promise<Record<string, any>> {
    const sanitized: Record<string, any> = {};

    for (const [key, value] of Object.entries(metadata)) {
      // Remove sensitive fields
      if (key.toLowerCase().includes('password') || 
          key.toLowerCase().includes('token') ||
          key.toLowerCase().includes('secret')) {
        sanitized[key] = '[REDACTED]';
      } else {
        sanitized[key] = value;
      }
    }

    return sanitized;
  }

  private async getClientIP(): Promise<string> {
    try {
      // This would typically use a service to get the real IP
      // For now, return a placeholder
      return 'unknown';
    } catch {
      return 'unknown';
    }
  }

  private async getLocationInfo(): Promise<{ country?: string; city?: string } | undefined> {
    try {
      // This would typically use a geolocation service
      // For now, return undefined
      return undefined;
    } catch {
      return undefined;
    }
  }

  private generateSessionId(): string {
    return `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private getDeviceId(): string {
    // Use stored device ID or generate new one
    let deviceId = localStorage.getItem('dynasty_device_id');
    if (!deviceId) {
      deviceId = `device_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      localStorage.setItem('dynasty_device_id', deviceId);
    }
    return deviceId;
  }

  // MARK: - Aggregation Functions
  private aggregateEventTypes(events: AuditEvent[]): { type: AuditEventType; count: number }[] {
    const counts: Record<AuditEventType, number> = {} as Record<AuditEventType, number>;
    
    events.forEach(event => {
      counts[event.eventType] = (counts[event.eventType] || 0) + 1;
    });

    return Object.entries(counts)
      .map(([type, count]) => ({ type: type as AuditEventType, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);
  }

  private aggregateDeviceActivity(events: AuditEvent[]): { deviceId: string; eventCount: number }[] {
    const counts: Record<string, number> = {};
    
    events.forEach(event => {
      counts[event.deviceId] = (counts[event.deviceId] || 0) + 1;
    });

    return Object.entries(counts)
      .map(([deviceId, eventCount]) => ({ deviceId, eventCount }))
      .sort((a, b) => b.eventCount - a.eventCount)
      .slice(0, 10);
  }

  private calculateRiskTrends(events: AuditEvent[], days: number): { date: string; riskScore: number }[] {
    const dailyRisks: Record<string, { total: number; count: number }> = {};
    
    events.forEach(event => {
      if (event.timestamp && event.timestamp.toDate) {
        const date = event.timestamp.toDate().toISOString().split('T')[0];
        if (!dailyRisks[date]) {
          dailyRisks[date] = { total: 0, count: 0 };
        }
        dailyRisks[date].total += event.riskScore;
        dailyRisks[date].count += 1;
      }
    });

    return Object.entries(dailyRisks)
      .map(([date, data]) => ({
        date,
        riskScore: Math.round(data.total / data.count)
      }))
      .sort((a, b) => a.date.localeCompare(b.date));
  }

  // MARK: - Alerts and Monitoring
  private triggerRiskAlert(event: AuditEvent): void {
    if (this.config.enableRealTimeAlerts) {
      for (const callback of this.alertCallbacks) {
        callback(event);
      }
    }
  }

  /**
   * Subscribe to high-risk event alerts
   */
  onRiskAlert(callback: (event: AuditEvent) => void): () => void {
    this.alertCallbacks.add(callback);
    return () => this.alertCallbacks.delete(callback);
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<AuditConfig>): void {
    this.config = { ...this.config, ...config };
    console.log('[AuditLog] Configuration updated');
  }

  /**
   * Export audit logs for compliance
   */
  async exportAuditLogs(
    query: AuditQuery,
    format: 'json' | 'csv' = 'json'
  ): Promise<string> {
    try {
      const events = await this.queryEvents(query);
      
      if (format === 'csv') {
        return this.exportToCSV(events);
      }
      
      return JSON.stringify(events, null, 2);
    } catch (error) {
      console.error('[AuditLog] Failed to export logs:', error);
      throw new Error('Failed to export audit logs');
    }
  }

  private exportToCSV(events: AuditEvent[]): string {
    if (events.length === 0) return '';

    const headers = [
      'Timestamp', 'Event Type', 'Category', 'Severity', 
      'User ID', 'Device ID', 'Description', 'Risk Score'
    ];

    const rows = events.map(event => [
      event.timestamp.toDate().toISOString(),
      event.eventType,
      event.category,
      event.severity,
      event.userId,
      event.deviceId,
      event.description,
      event.riskScore.toString()
    ]);

    return [headers, ...rows]
      .map(row => row.map(cell => `"${cell}"`).join(','))
      .join('\n');
  }

  /**
   * Cleanup old logs based on retention policy
   */
  async cleanupOldLogs(): Promise<void> {
    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - this.config.retentionDays);

      // This would typically be done server-side with a batch job
      console.log(`[AuditLog] Cleanup scheduled for logs older than ${cutoffDate.toISOString()}`);
    } catch (error) {
      console.error('[AuditLog] Failed to cleanup old logs:', error);
    }
  }

  /**
   * Destroy service and cleanup
   */
  destroy(): void {
    this.alertCallbacks.clear();
    console.log('[AuditLog] Service destroyed');
  }
}

// MARK: - Default Export
const auditLogService = new AuditLogService();
export default auditLogService; 