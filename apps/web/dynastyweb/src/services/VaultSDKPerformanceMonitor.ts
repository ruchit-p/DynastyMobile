/**
 * Vault SDK Performance Monitoring Service
 * Provides comprehensive performance tracking for vault SDK operations
 * Integrates with existing Dynasty monitoring infrastructure
 */

import { errorHandler, ErrorSeverity } from './ErrorHandlingService';
import { auditLogService } from './AuditLogService';
import { cacheService } from './CacheService';

// Performance metric interfaces
export interface VaultOperationMetric {
  operationId: string;
  operation:
    | 'upload'
    | 'download'
    | 'delete'
    | 'share'
    | 'encrypt'
    | 'decrypt'
    | 'list'
    | 'create'
    | 'search'
    | 'move'
    | 'restore';
  startTime: number;
  endTime: number;
  duration: number;
  success: boolean;
  error?: string;
  metadata?: Record<string, unknown>;
}

export interface VaultPerformanceStats {
  totalOperations: number;
  successRate: number;
  averageLatency: number;
  averageUploadSpeed: number; // bytes per second
  averageDownloadSpeed: number; // bytes per second
  cacheHitRate: number;
  errorsByType: Record<string, number>;
  networkImpact: {
    wifi: { avgLatency: number; successRate: number };
    cellular: { avgLatency: number; successRate: number };
    slow: { avgLatency: number; successRate: number };
  };
  lastUpdated: number;
}

export interface VaultSDKComparison {
  legacyMetrics: VaultPerformanceStats;
  sdkMetrics: VaultPerformanceStats;
  improvement: {
    latencyImprovement: number; // percentage
    speedImprovement: number; // percentage
    reliabilityImprovement: number; // percentage
  };
}

class VaultSDKPerformanceMonitor {
  private static instance: VaultSDKPerformanceMonitor;
  private metrics: VaultOperationMetric[] = [];
  private activeOperations = new Map<string, { startTime: number; operation: VaultOperationMetric['operation']; metadata?: Record<string, unknown> }>();
  private maxMetricsHistory = 1000; // Keep last 1000 operations
  private statsCache: VaultPerformanceStats | null = null;
  private statsCacheExpiry = 5 * 60 * 1000; // 5 minutes

  static getInstance(): VaultSDKPerformanceMonitor {
    if (!VaultSDKPerformanceMonitor.instance) {
      VaultSDKPerformanceMonitor.instance = new VaultSDKPerformanceMonitor();
    }
    return VaultSDKPerformanceMonitor.instance;
  }

  /**
   * Start tracking a vault operation
   */
  startOperation(
    operationId: string, 
    operation: VaultOperationMetric['operation'],
    metadata?: VaultOperationMetric['metadata']
  ): void {
    try {
      const startTime = performance.now();
      
      this.activeOperations.set(operationId, {
        startTime,
        operation,
        metadata: {
          ...metadata,
          networkType: typeof window !== 'undefined' && 'connection' in navigator ? 
            (navigator.connection as any)?.effectiveType || 'unknown' : 'unknown',
        }
      });

      // Log to audit service following Dynasty patterns
      auditLogService.logVaultAccess(
        'open',
        `vault-sdk-${operationId}`,
        'system',
        {
          operation,
          startTime,
          ...metadata
        }
      );

      // Add Sentry breadcrumb (simplified for compatibility)
      try {
        if (typeof window !== 'undefined' && window.Sentry && typeof window.Sentry.captureException === 'function') {
          // Basic Sentry integration - just log the operation start
          console.debug(`Vault SDK operation started: ${operation}`, { operationId, ...metadata });
        }
      } catch {
        // Silent fail for Sentry integration
        console.debug('Sentry integration unavailable');
      }
    } catch (error) {
      errorHandler.handleError(error, ErrorSeverity.LOW, {
        action: 'start-performance-tracking',
        operationId,
        operation
      });
    }
  }

  /**
   * End tracking a vault operation and record metrics
   */
  endOperation(
    operationId: string,
    success: boolean,
    error?: string,
    additionalMetadata?: Record<string, unknown>
  ): void {
    try {
      const operationData = this.activeOperations.get(operationId);
      if (!operationData) {
        console.warn(`Performance tracking: Operation ${operationId} not found`);
        return;
      }

      const endTime = performance.now();
      const duration = endTime - operationData.startTime;

      const metric: VaultOperationMetric = {
        operationId,
        operation: operationData.operation,
        startTime: operationData.startTime,
        endTime,
        duration,
        success,
        error,
        metadata: {
          ...operationData.metadata,
          ...additionalMetadata
        }
      };

      // Store metric
      this.addMetric(metric);

      // Log completion to audit service
      auditLogService.logVaultAccess(
        success ? 'open' : 'delete',
        `vault-sdk-${operationId}`,
        'system',
        {
          operation: operationData.operation,
          duration,
          success,
          error,
          ...metric.metadata
        }
      );

      // Add Sentry tracking (simplified for compatibility)
      try {
        if (typeof window !== 'undefined' && window.Sentry && typeof window.Sentry.captureException === 'function') {
          console.debug(`Vault SDK operation ${success ? 'completed' : 'failed'}: ${operationData.operation}`, 
            { operationId, duration, success, error });
        }
      } catch {
        // Silent fail for Sentry integration
        console.debug('Sentry integration unavailable');
      }

      // Handle errors using Dynasty error handling
      if (!success && error) {
        errorHandler.handleError(
          new Error(`Vault SDK ${operationData.operation} failed: ${error}`),
          this.getErrorSeverityForOperation(operationData.operation),
          {
            action: `vault-sdk-${operationData.operation}`,
            operationId,
            duration,
            ...metric.metadata
          }
        );
      }

      this.activeOperations.delete(operationId);
      
      // Invalidate stats cache
      this.statsCache = null;

    } catch (error) {
      errorHandler.handleError(error, ErrorSeverity.LOW, {
        action: 'end-performance-tracking',
        operationId
      });
    }
  }

  /**
   * Record cache hit/miss for performance tracking
   */
  recordCacheEvent(operationId: string, hit: boolean, cacheKey?: string): void {
    try {
      const operationData = this.activeOperations.get(operationId);
      if (operationData) {
        operationData.metadata = {
          ...operationData.metadata,
          cacheHit: hit,
          cacheKey
        };
      }

      // Log cache performance
      auditLogService.logVaultAccess(
        hit ? 'open' : 'download',
        `vault-sdk-${operationId}`,
        'system',
        { cacheKey, hit }
      );
    } catch (error) {
      errorHandler.handleError(error, ErrorSeverity.LOW, {
        action: 'record-cache-event',
        operationId,
        hit
      });
    }
  }

  /**
   * Get comprehensive performance statistics
   */
  async getPerformanceStats(): Promise<VaultPerformanceStats> {
    try {
      // Return cached stats if available and not expired
      if (this.statsCache && Date.now() - this.statsCache.lastUpdated < this.statsCacheExpiry) {
        return this.statsCache;
      }

      const stats = this.calculateStats();
      
      // Cache the stats
      this.statsCache = stats;
      
      // Store in cache service for persistence
      try {
        await cacheService.set(
          'vault-performance-stats',
          stats,
          { ttl: this.statsCacheExpiry, persist: true }
        );
      } catch {
        // Silent fail for cache storage
        console.debug('Cache storage unavailable for performance stats');
      }

      return stats;
    } catch (error) {
      errorHandler.handleError(error, ErrorSeverity.MEDIUM, {
        action: 'get-performance-stats'
      });
      
      // Return default stats on error
      return this.getDefaultStats();
    }
  }

  /**
   * Get SDK vs Legacy performance comparison
   */
  async getSDKComparison(): Promise<VaultSDKComparison | null> {
    try {
      // Get cached legacy metrics for comparison
      const legacyMetrics = await cacheService.get<VaultPerformanceStats>(
        'vault-legacy-performance-stats'
      );

      if (!legacyMetrics) {
        return null;
      }

      const sdkMetrics = await this.getPerformanceStats();

      const improvement = {
        latencyImprovement: this.calculateImprovement(legacyMetrics.averageLatency, sdkMetrics.averageLatency),
        speedImprovement: this.calculateImprovement(
          legacyMetrics.averageUploadSpeed,
          sdkMetrics.averageUploadSpeed
        ),
        reliabilityImprovement: this.calculateImprovement(legacyMetrics.successRate, sdkMetrics.successRate)
      };

      return {
        legacyMetrics,
        sdkMetrics,
        improvement
      };
    } catch (error) {
      errorHandler.handleError(error, ErrorSeverity.MEDIUM, {
        action: 'get-sdk-comparison'
      });
      return null;
    }
  }

  /**
   * Get real-time operation status
   */
  getActiveOperations(): Array<{ operationId: string; operation: string; duration: number }> {
    const now = performance.now();
    return Array.from(this.activeOperations.entries()).map(([operationId, data]) => ({
      operationId,
      operation: data.operation,
      duration: now - data.startTime
    }));
  }

  /**
   * Clear metrics history (for testing or memory management)
   */
  clearMetrics(): void {
    this.metrics = [];
    this.statsCache = null;
    this.activeOperations.clear();
  }

  /**
   * Export metrics for analysis (admin only)
   */
  exportMetrics(): VaultOperationMetric[] {
    return [...this.metrics];
  }

  // Private helper methods

  private addMetric(metric: VaultOperationMetric): void {
    this.metrics.push(metric);
    
    // Maintain max history size
    if (this.metrics.length > this.maxMetricsHistory) {
      this.metrics = this.metrics.slice(-this.maxMetricsHistory);
    }
  }

  private calculateStats(): VaultPerformanceStats {
    if (this.metrics.length === 0) {
      return this.getDefaultStats();
    }

    const successfulOps = this.metrics.filter(m => m.success);
    const totalOperations = this.metrics.length;
    const successRate = (successfulOps.length / totalOperations) * 100;

    // Calculate average latency
    const totalLatency = this.metrics.reduce((sum, m) => sum + m.duration, 0);
    const averageLatency = totalLatency / totalOperations;

    // Calculate upload/download speeds
    const uploadOps = this.metrics.filter(m => m.operation === 'upload' && m.metadata?.fileSize);
    const downloadOps = this.metrics.filter(m => m.operation === 'download' && m.metadata?.fileSize);

    const averageUploadSpeed = this.calculateAverageSpeed(uploadOps);
    const averageDownloadSpeed = this.calculateAverageSpeed(downloadOps);

    // Calculate cache hit rate
    const opsWithCache = this.metrics.filter(m => m.metadata?.cacheHit !== undefined);
    const cacheHits = opsWithCache.filter(m => m.metadata?.cacheHit === true);
    const cacheHitRate = opsWithCache.length > 0 ? (cacheHits.length / opsWithCache.length) * 100 : 0;

    // Group errors by type
    const errorsByType: Record<string, number> = {};
    this.metrics.filter(m => !m.success && m.error).forEach(m => {
      const errorType = m.error || 'unknown';
      errorsByType[errorType] = (errorsByType[errorType] || 0) + 1;
    });

    // Calculate network impact
    const networkImpact = this.calculateNetworkImpact();

    return {
      totalOperations,
      successRate,
      averageLatency,
      averageUploadSpeed,
      averageDownloadSpeed,
      cacheHitRate,
      errorsByType,
      networkImpact,
      lastUpdated: Date.now()
    };
  }

  private calculateAverageSpeed(operations: VaultOperationMetric[]): number {
    if (operations.length === 0) return 0;

    const speeds = operations.map(op => {
      const sizeBytes = Number(op.metadata?.fileSize) || 0;
      const durationSeconds = op.duration / 1000;
      return durationSeconds > 0 ? sizeBytes / durationSeconds : 0;
    });

    return speeds.reduce((sum, speed) => sum + speed, 0) / speeds.length;
  }

  private calculateNetworkImpact(): VaultPerformanceStats['networkImpact'] {
    const networkTypes = ['wifi', 'cellular', 'slow'] as const;
    const impact: VaultPerformanceStats['networkImpact'] = {
      wifi: { avgLatency: 0, successRate: 0 },
      cellular: { avgLatency: 0, successRate: 0 },
      slow: { avgLatency: 0, successRate: 0 }
    };

    networkTypes.forEach(networkType => {
      const networkOps = this.metrics.filter(m => m.metadata?.networkType === networkType);
      if (networkOps.length > 0) {
        const avgLatency = networkOps.reduce((sum, op) => sum + op.duration, 0) / networkOps.length;
        const successRate = (networkOps.filter(op => op.success).length / networkOps.length) * 100;
        impact[networkType] = { avgLatency, successRate };
      }
    });

    return impact;
  }

  private calculateImprovement(oldValue: number, newValue: number): number {
    if (oldValue === 0) return newValue > 0 ? 100 : 0;
    return ((newValue - oldValue) / oldValue) * 100;
  }

  private getErrorSeverityForOperation(operation: string): ErrorSeverity {
    switch (operation) {
      case 'upload':
      case 'download':
        return ErrorSeverity.HIGH;
      case 'delete':
        return ErrorSeverity.MEDIUM;
      case 'share':
      case 'list':
        return ErrorSeverity.LOW;
      default:
        return ErrorSeverity.MEDIUM;
    }
  }

  private getDefaultStats(): VaultPerformanceStats {
    return {
      totalOperations: 0,
      successRate: 0,
      averageLatency: 0,
      averageUploadSpeed: 0,
      averageDownloadSpeed: 0,
      cacheHitRate: 0,
      errorsByType: {},
      networkImpact: {
        wifi: { avgLatency: 0, successRate: 0 },
        cellular: { avgLatency: 0, successRate: 0 },
        slow: { avgLatency: 0, successRate: 0 }
      },
      lastUpdated: Date.now()
    };
  }
}

// Export singleton instance
export const vaultSDKPerformanceMonitor = VaultSDKPerformanceMonitor.getInstance();