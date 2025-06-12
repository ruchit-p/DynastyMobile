/**
 * Load testing utilities for subscription system
 * Provides tools for performance monitoring and load generation
 */

import { performance } from 'perf_hooks';

export interface LoadTestResult {
  totalOperations: number;
  successfulOperations: number;
  failedOperations: number;
  totalTimeMs: number;
  averageTimeMs: number;
  minTimeMs: number;
  maxTimeMs: number;
  operationsPerSecond: number;
  percentile95Ms: number;
  percentile99Ms: number;
  errors: string[];
}

export interface LoadTestConfig {
  concurrency: number;
  totalOperations: number;
  timeoutMs?: number;
  warmupOperations?: number;
  rampUpTimeMs?: number;
}

/**
 * Load test executor with comprehensive metrics
 */
export class LoadTestExecutor {
  private results: number[] = [];
  private errors: string[] = [];
  private startTime: number = 0;

  /**
   * Execute load test with given configuration
   */
  async executeLoadTest<T>(
    operationFactory: () => Promise<T>,
    config: LoadTestConfig
  ): Promise<LoadTestResult> {
    const {
      concurrency,
      totalOperations,
      timeoutMs = 60000,
      warmupOperations = 0,
      rampUpTimeMs = 0,
    } = config;

    // Warm-up phase
    if (warmupOperations > 0) {
      await this.executeWarmup(operationFactory, warmupOperations);
    }

    // Reset metrics for actual test
    this.results = [];
    this.errors = [];
    this.startTime = performance.now();

    // Calculate batch sizes for concurrency
    const batches = Math.ceil(totalOperations / concurrency);
    const allPromises: Promise<void>[] = [];

    for (let batch = 0; batch < batches; batch++) {
      const batchPromises: Promise<void>[] = [];
      const operationsInBatch = Math.min(concurrency, totalOperations - batch * concurrency);

      for (let i = 0; i < operationsInBatch; i++) {
        const promise = this.executeOperation(operationFactory, timeoutMs);
        batchPromises.push(promise);
      }

      // Add ramp-up delay between batches
      if (rampUpTimeMs > 0 && batch > 0) {
        await this.delay(rampUpTimeMs / batches);
      }

      allPromises.push(...batchPromises);
    }

    // Wait for all operations to complete
    await Promise.all(allPromises);

    return this.calculateResults();
  }

  /**
   * Execute sustained load test over a duration
   */
  async executeSustainedLoad<T>(
    operationFactory: () => Promise<T>,
    durationMs: number,
    operationsPerSecond: number
  ): Promise<LoadTestResult> {
    this.results = [];
    this.errors = [];
    this.startTime = performance.now();

    const intervalMs = 1000 / operationsPerSecond;
    const endTime = this.startTime + durationMs;

    const promises: Promise<void>[] = [];
    let lastOperationTime = this.startTime;

    while (performance.now() < endTime) {
      const now = performance.now();

      // Maintain consistent rate
      if (now - lastOperationTime >= intervalMs) {
        const promise = this.executeOperation(operationFactory, 10000);
        promises.push(promise);
        lastOperationTime = now;
      }

      // Small delay to prevent tight loop
      await this.delay(1);
    }

    // Wait for remaining operations
    await Promise.all(promises);

    return this.calculateResults();
  }

  /**
   * Execute burst load test (high intensity, short duration)
   */
  async executeBurstLoad<T>(
    operationFactory: () => Promise<T>,
    burstSize: number,
    burstCount: number,
    delayBetweenBurstsMs: number
  ): Promise<LoadTestResult> {
    this.results = [];
    this.errors = [];
    this.startTime = performance.now();

    for (let burst = 0; burst < burstCount; burst++) {
      // Execute burst
      const burstPromises = Array.from({ length: burstSize }, () =>
        this.executeOperation(operationFactory, 10000)
      );

      await Promise.all(burstPromises);

      // Delay between bursts (except for last burst)
      if (burst < burstCount - 1) {
        await this.delay(delayBetweenBurstsMs);
      }
    }

    return this.calculateResults();
  }

  /**
   * Execute single operation with timing
   */
  private async executeOperation<T>(
    operationFactory: () => Promise<T>,
    timeoutMs: number
  ): Promise<void> {
    const startTime = performance.now();

    try {
      // Create timeout promise
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error('Operation timeout')), timeoutMs);
      });

      // Race operation against timeout
      await Promise.race([operationFactory(), timeoutPromise]);

      const endTime = performance.now();
      this.results.push(endTime - startTime);
    } catch (error) {
      const endTime = performance.now();
      this.results.push(endTime - startTime); // Include failed operation time
      this.errors.push(error instanceof Error ? error.message : String(error));
    }
  }

  /**
   * Execute warmup operations
   */
  private async executeWarmup<T>(
    operationFactory: () => Promise<T>,
    warmupOperations: number
  ): Promise<void> {
    const warmupPromises = Array.from(
      { length: warmupOperations },
      () => operationFactory().catch(() => {}) // Ignore warmup errors
    );

    await Promise.all(warmupPromises);

    // Small delay after warmup
    await this.delay(100);
  }

  /**
   * Calculate comprehensive test results
   */
  private calculateResults(): LoadTestResult {
    const endTime = performance.now();
    const totalTimeMs = endTime - this.startTime;
    const totalOperations = this.results.length;
    const successfulOperations = totalOperations - this.errors.length;
    const failedOperations = this.errors.length;

    if (this.results.length === 0) {
      return {
        totalOperations: 0,
        successfulOperations: 0,
        failedOperations: 0,
        totalTimeMs,
        averageTimeMs: 0,
        minTimeMs: 0,
        maxTimeMs: 0,
        operationsPerSecond: 0,
        percentile95Ms: 0,
        percentile99Ms: 0,
        errors: this.errors,
      };
    }

    // Sort results for percentile calculations
    const sortedResults = [...this.results].sort((a, b) => a - b);

    const averageTimeMs = this.results.reduce((sum, time) => sum + time, 0) / this.results.length;
    const minTimeMs = Math.min(...this.results);
    const maxTimeMs = Math.max(...this.results);
    const operationsPerSecond = (totalOperations / totalTimeMs) * 1000;

    // Calculate percentiles
    const percentile95Index = Math.floor(sortedResults.length * 0.95);
    const percentile99Index = Math.floor(sortedResults.length * 0.99);
    const percentile95Ms = sortedResults[percentile95Index] || 0;
    const percentile99Ms = sortedResults[percentile99Index] || 0;

    return {
      totalOperations,
      successfulOperations,
      failedOperations,
      totalTimeMs,
      averageTimeMs,
      minTimeMs,
      maxTimeMs,
      operationsPerSecond,
      percentile95Ms,
      percentile99Ms,
      errors: [...new Set(this.errors)], // Deduplicate errors
    };
  }

  /**
   * Utility delay function
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

/**
 * Memory usage monitor
 */
export class MemoryMonitor {
  private snapshots: Array<{ timestamp: number; usage: NodeJS.MemoryUsage }> = [];
  private monitoring = false;
  private intervalId?: NodeJS.Timeout;

  /**
   * Start monitoring memory usage
   */
  startMonitoring(intervalMs: number = 1000): void {
    if (this.monitoring) return;

    this.monitoring = true;
    this.snapshots = [];

    this.intervalId = setInterval(() => {
      this.snapshots.push({
        timestamp: Date.now(),
        usage: process.memoryUsage(),
      });
    }, intervalMs);
  }

  /**
   * Stop monitoring and return results
   */
  stopMonitoring(): MemoryUsageReport {
    if (!this.monitoring) {
      throw new Error('Memory monitoring is not active');
    }

    this.monitoring = false;
    if (this.intervalId) {
      clearInterval(this.intervalId);
    }

    return this.generateReport();
  }

  /**
   * Generate memory usage report
   */
  private generateReport(): MemoryUsageReport {
    if (this.snapshots.length === 0) {
      throw new Error('No memory snapshots available');
    }

    const heapUsedValues = this.snapshots.map(s => s.usage.heapUsed);
    const heapTotalValues = this.snapshots.map(s => s.usage.heapTotal);
    const rssValues = this.snapshots.map(s => s.usage.rss);

    return {
      duration: this.snapshots[this.snapshots.length - 1].timestamp - this.snapshots[0].timestamp,
      snapshots: this.snapshots.length,
      heapUsed: {
        min: Math.min(...heapUsedValues),
        max: Math.max(...heapUsedValues),
        average: heapUsedValues.reduce((sum, val) => sum + val, 0) / heapUsedValues.length,
      },
      heapTotal: {
        min: Math.min(...heapTotalValues),
        max: Math.max(...heapTotalValues),
        average: heapTotalValues.reduce((sum, val) => sum + val, 0) / heapTotalValues.length,
      },
      rss: {
        min: Math.min(...rssValues),
        max: Math.max(...rssValues),
        average: rssValues.reduce((sum, val) => sum + val, 0) / rssValues.length,
      },
      peakMemoryUsage: Math.max(...rssValues),
      memoryGrowth: rssValues[rssValues.length - 1] - rssValues[0],
    };
  }
}

export interface MemoryUsageReport {
  duration: number;
  snapshots: number;
  heapUsed: MemoryStats;
  heapTotal: MemoryStats;
  rss: MemoryStats;
  peakMemoryUsage: number;
  memoryGrowth: number;
}

interface MemoryStats {
  min: number;
  max: number;
  average: number;
}

/**
 * Cold start monitor for Firebase Functions
 */
export class ColdStartMonitor {
  private static instance: ColdStartMonitor;
  private coldStarts: Array<{ timestamp: number; duration: number }> = [];
  private functionStartTime: number = Date.now();

  static getInstance(): ColdStartMonitor {
    if (!ColdStartMonitor.instance) {
      ColdStartMonitor.instance = new ColdStartMonitor();
    }
    return ColdStartMonitor.instance;
  }

  /**
   * Record a cold start
   */
  recordColdStart(duration: number): void {
    this.coldStarts.push({
      timestamp: Date.now(),
      duration,
    });
  }

  /**
   * Simulate cold start by measuring function initialization time
   */
  measureInitializationTime(): number {
    return Date.now() - this.functionStartTime;
  }

  /**
   * Get cold start statistics
   */
  getColdStartStats(): ColdStartStats {
    if (this.coldStarts.length === 0) {
      return {
        totalColdStarts: 0,
        averageDuration: 0,
        minDuration: 0,
        maxDuration: 0,
        coldStartsInLastHour: 0,
      };
    }

    const durations = this.coldStarts.map(cs => cs.duration);
    const oneHourAgo = Date.now() - 60 * 60 * 1000;
    const recentColdStarts = this.coldStarts.filter(cs => cs.timestamp > oneHourAgo);

    return {
      totalColdStarts: this.coldStarts.length,
      averageDuration: durations.reduce((sum, d) => sum + d, 0) / durations.length,
      minDuration: Math.min(...durations),
      maxDuration: Math.max(...durations),
      coldStartsInLastHour: recentColdStarts.length,
    };
  }

  /**
   * Reset cold start tracking
   */
  reset(): void {
    this.coldStarts = [];
    this.functionStartTime = Date.now();
  }
}

export interface ColdStartStats {
  totalColdStarts: number;
  averageDuration: number;
  minDuration: number;
  maxDuration: number;
  coldStartsInLastHour: number;
}

/**
 * Performance assertion helpers
 */
export class PerformanceAssertions {
  /**
   * Assert operation completes within time limit
   */
  static async assertWithinTimeLimit<T>(
    operation: () => Promise<T>,
    timeLimitMs: number,
    errorMessage?: string
  ): Promise<T> {
    const startTime = performance.now();
    const result = await operation();
    const duration = performance.now() - startTime;

    if (duration > timeLimitMs) {
      throw new Error(
        errorMessage || `Operation took ${duration.toFixed(2)}ms, expected under ${timeLimitMs}ms`
      );
    }

    return result;
  }

  /**
   * Assert operations per second meets minimum threshold
   */
  static assertOperationsPerSecond(
    result: LoadTestResult,
    minimumOpsPerSecond: number,
    errorMessage?: string
  ): void {
    if (result.operationsPerSecond < minimumOpsPerSecond) {
      throw new Error(
        errorMessage ||
          `Operations per second ${result.operationsPerSecond.toFixed(
            2
          )} below minimum ${minimumOpsPerSecond}`
      );
    }
  }

  /**
   * Assert error rate is below threshold
   */
  static assertErrorRate(
    result: LoadTestResult,
    maxErrorRatePercent: number,
    errorMessage?: string
  ): void {
    const errorRate = (result.failedOperations / result.totalOperations) * 100;

    if (errorRate > maxErrorRatePercent) {
      throw new Error(
        errorMessage ||
          `Error rate ${errorRate.toFixed(2)}% exceeds maximum ${maxErrorRatePercent}%`
      );
    }
  }

  /**
   * Assert percentile response time is below threshold
   */
  static assertPercentileResponseTime(
    result: LoadTestResult,
    percentile: 95 | 99,
    maxTimeMs: number,
    errorMessage?: string
  ): void {
    const actualTime = percentile === 95 ? result.percentile95Ms : result.percentile99Ms;

    if (actualTime > maxTimeMs) {
      throw new Error(
        errorMessage ||
          `${percentile}th percentile response time ${actualTime.toFixed(
            2
          )}ms exceeds maximum ${maxTimeMs}ms`
      );
    }
  }

  /**
   * Assert memory usage is within limits
   */
  static assertMemoryUsage(
    report: MemoryUsageReport,
    maxMemoryMB: number,
    errorMessage?: string
  ): void {
    const peakMemoryMB = report.peakMemoryUsage / (1024 * 1024);

    if (peakMemoryMB > maxMemoryMB) {
      throw new Error(
        errorMessage ||
          `Peak memory usage ${peakMemoryMB.toFixed(2)}MB exceeds maximum ${maxMemoryMB}MB`
      );
    }
  }
}

/**
 * Utility functions for load testing
 */
export const LoadTestUtils = {
  /**
   * Generate test data for load testing
   */
  generateTestUsers(count: number): Array<{ userId: string; email: string }> {
    return Array.from({ length: count }, (_, i) => ({
      userId: `load-test-user-${i}-${Date.now()}`,
      email: `loadtest${i}@example.com`,
    }));
  },

  /**
   * Generate realistic delay
   */
  randomDelay(minMs: number, maxMs: number): Promise<void> {
    const delay = Math.random() * (maxMs - minMs) + minMs;
    return new Promise(resolve => setTimeout(resolve, delay));
  },

  /**
   * Format load test results for console output
   */
  formatResults(result: LoadTestResult): string {
    return `
Load Test Results:
==================
Total Operations: ${result.totalOperations}
Successful: ${result.successfulOperations} (${(
      (result.successfulOperations / result.totalOperations) *
      100
    ).toFixed(2)}%)
Failed: ${result.failedOperations} (${(
      (result.failedOperations / result.totalOperations) *
      100
    ).toFixed(2)}%)
Total Time: ${result.totalTimeMs.toFixed(2)}ms
Average Time: ${result.averageTimeMs.toFixed(2)}ms
Min Time: ${result.minTimeMs.toFixed(2)}ms
Max Time: ${result.maxTimeMs.toFixed(2)}ms
Operations/Second: ${result.operationsPerSecond.toFixed(2)}
95th Percentile: ${result.percentile95Ms.toFixed(2)}ms
99th Percentile: ${result.percentile99Ms.toFixed(2)}ms
${
  result.errors.length > 0
    ? `Errors: ${result.errors.slice(0, 5).join(', ')}${result.errors.length > 5 ? '...' : ''}`
    : 'No Errors'
}
`;
  },

  /**
   * Format memory report for console output
   */
  formatMemoryReport(report: MemoryUsageReport): string {
    return `
Memory Usage Report:
====================
Duration: ${report.duration}ms
Snapshots: ${report.snapshots}
Peak Memory: ${(report.peakMemoryUsage / (1024 * 1024)).toFixed(2)}MB
Memory Growth: ${(report.memoryGrowth / (1024 * 1024)).toFixed(2)}MB
Heap Used (Avg): ${(report.heapUsed.average / (1024 * 1024)).toFixed(2)}MB
Heap Total (Avg): ${(report.heapTotal.average / (1024 * 1024)).toFixed(2)}MB
RSS (Avg): ${(report.rss.average / (1024 * 1024)).toFixed(2)}MB
`;
  },
};
