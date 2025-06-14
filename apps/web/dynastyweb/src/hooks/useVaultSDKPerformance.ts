/**
 * React Hook for Vault SDK Performance Monitoring
 * Provides real-time performance metrics and statistics for vault SDK operations
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import { vaultSDKPerformanceMonitor, type VaultPerformanceStats, type VaultSDKComparison } from '@/services/VaultSDKPerformanceMonitor';
import { errorHandler, ErrorSeverity } from '@/services/ErrorHandlingService';

export interface UseVaultSDKPerformanceReturn {
  // Performance Statistics
  stats: VaultPerformanceStats | null;
  comparison: VaultSDKComparison | null;
  
  // Real-time Data
  activeOperations: Array<{ operationId: string; operation: string; duration: number }>;
  
  // Loading States
  loading: boolean;
  error: string | null;
  
  // Actions
  refreshStats: () => Promise<void>;
  clearError: () => void;
  
  // Computed Values
  performanceScore: number; // 0-100 score based on multiple metrics
  healthStatus: 'excellent' | 'good' | 'fair' | 'poor';
  recommendations: string[];
}

/**
 * Hook for accessing vault SDK performance metrics
 */
export function useVaultSDKPerformance(autoRefresh = true, refreshInterval = 30000): UseVaultSDKPerformanceReturn {
  const [stats, setStats] = useState<VaultPerformanceStats | null>(null);
  const [comparison, setComparison] = useState<VaultSDKComparison | null>(null);
  const [activeOperations, setActiveOperations] = useState<Array<{ operationId: string; operation: string; duration: number }>>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refreshStats = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const [newStats, newComparison, operations] = await Promise.all([
        vaultSDKPerformanceMonitor.getPerformanceStats(),
        vaultSDKPerformanceMonitor.getSDKComparison(),
        Promise.resolve(vaultSDKPerformanceMonitor.getActiveOperations())
      ]);

      setStats(newStats);
      setComparison(newComparison);
      setActiveOperations(operations);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to fetch performance stats';
      setError(errorMessage);
      
      errorHandler.handleError(err, ErrorSeverity.LOW, {
        action: 'fetch-vault-sdk-performance-stats'
      });
    } finally {
      setLoading(false);
    }
  }, []);

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  // Calculate performance score (0-100)
  const performanceScore = useMemo(() => {
    if (!stats) return 0;

    const weights = {
      successRate: 0.3,      // 30% - Most important
      latency: 0.25,         // 25% - Response time
      cacheHitRate: 0.2,     // 20% - Efficiency  
      networkImpact: 0.15,   // 15% - Network resilience
      errorRate: 0.1         // 10% - Error frequency
    };

    // Success rate score (0-100)
    const successScore = Math.min(stats.successRate, 100);

    // Latency score (inverse relationship - lower is better)
    // Assuming good latency is under 1000ms, excellent under 500ms
    const latencyScore = Math.max(0, Math.min(100, 100 - (stats.averageLatency / 10)));

    // Cache hit rate score (0-100)
    const cacheScore = Math.min(stats.cacheHitRate, 100);

    // Network impact score (average of network performance)
    const networkScores = Object.values(stats.networkImpact).map(impact => impact.successRate);
    const networkScore = networkScores.length > 0 
      ? networkScores.reduce((sum, score) => sum + score, 0) / networkScores.length 
      : 100;

    // Error rate score (inverse of error frequency)
    const totalErrors = Object.values(stats.errorsByType).reduce((sum, count) => sum + count, 0);
    const errorRate = stats.totalOperations > 0 ? (totalErrors / stats.totalOperations) * 100 : 0;
    const errorScore = Math.max(0, 100 - errorRate * 10); // Penalize heavily for errors

    const finalScore = (
      successScore * weights.successRate +
      latencyScore * weights.latency +
      cacheScore * weights.cacheHitRate +
      networkScore * weights.networkImpact +
      errorScore * weights.errorRate
    );

    return Math.round(Math.max(0, Math.min(100, finalScore)));
  }, [stats]);

  // Determine health status based on performance score
  const healthStatus = useMemo<'excellent' | 'good' | 'fair' | 'poor'>(() => {
    if (performanceScore >= 90) return 'excellent';
    if (performanceScore >= 75) return 'good';
    if (performanceScore >= 60) return 'fair';
    return 'poor';
  }, [performanceScore]);

  // Generate recommendations based on performance data
  const recommendations = useMemo(() => {
    if (!stats) return [];

    const recs: string[] = [];

    // Success rate recommendations
    if (stats.successRate < 95) {
      recs.push('Success rate is below 95%. Check network connectivity and error logs.');
    }

    // Latency recommendations
    if (stats.averageLatency > 2000) {
      recs.push('Average latency is high. Consider optimizing network requests or file sizes.');
    }

    // Cache recommendations
    if (stats.cacheHitRate < 70) {
      recs.push('Cache hit rate is low. Review caching strategy and TTL settings.');
    }

    // Network impact recommendations
    const slowNetworkPerformance = stats.networkImpact.slow;
    if (slowNetworkPerformance.successRate < 80) {
      recs.push('Poor performance on slow networks. Implement better retry logic and smaller file chunks.');
    }

    // Error recommendations
    const totalErrors = Object.values(stats.errorsByType).reduce((sum, count) => sum + count, 0);
    if (totalErrors > stats.totalOperations * 0.05) {
      recs.push('Error rate is above 5%. Review error handling and user feedback mechanisms.');
    }

    // Speed recommendations
    if (stats.averageUploadSpeed < 1024 * 1024) { // 1MB/s
      recs.push('Upload speeds are slow. Consider implementing compression or chunked uploads.');
    }

    return recs;
  }, [stats]);

  // Auto-refresh effect
  useEffect(() => {
    refreshStats();

    if (autoRefresh) {
      const interval = setInterval(refreshStats, refreshInterval);
      return () => clearInterval(interval);
    }
  }, [refreshStats, autoRefresh, refreshInterval]);

  // Active operations polling (more frequent for real-time data)
  useEffect(() => {
    const pollActiveOperations = () => {
      try {
        const operations = vaultSDKPerformanceMonitor.getActiveOperations();
        setActiveOperations(operations);
      } catch (err) {
        // Silent fail for polling
        console.warn('Failed to poll active operations:', err);
      }
    };

    const interval = setInterval(pollActiveOperations, 1000); // Update every second
    return () => clearInterval(interval);
  }, []);

  return {
    stats,
    comparison,
    activeOperations,
    loading,
    error,
    refreshStats,
    clearError,
    performanceScore,
    healthStatus,
    recommendations
  };
}

/**
 * Hook for monitoring specific operation performance
 */
export function useVaultOperationMonitor(operationId: string) {
  const [isActive, setIsActive] = useState(false);
  const [duration, setDuration] = useState(0);

  useEffect(() => {
    const checkOperation = () => {
      const activeOps = vaultSDKPerformanceMonitor.getActiveOperations();
      const operation = activeOps.find(op => op.operationId === operationId);
      
      if (operation) {
        setIsActive(true);
        setDuration(operation.duration);
      } else {
        setIsActive(false);
        setDuration(0);
      }
    };

    const interval = setInterval(checkOperation, 100); // Check every 100ms for responsiveness
    return () => clearInterval(interval);
  }, [operationId]);

  return { isActive, duration };
}

/**
 * Hook for comparing SDK vs Legacy performance
 */
export function useVaultSDKComparison() {
  const [comparison, setComparison] = useState<VaultSDKComparison | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refreshComparison = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const comparisonData = await vaultSDKPerformanceMonitor.getSDKComparison();
      setComparison(comparisonData);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to fetch comparison data';
      setError(errorMessage);
      
      errorHandler.handleError(err, ErrorSeverity.LOW, {
        action: 'fetch-vault-sdk-comparison'
      });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshComparison();
  }, [refreshComparison]);

  return {
    comparison,
    loading,
    error,
    refreshComparison,
    hasComparison: comparison !== null
  };
}