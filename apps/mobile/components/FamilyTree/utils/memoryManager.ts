import { TreeCalculationCache } from './calculations';
import type { MemoryStatus } from '../types';

export class MemoryManager {
  private memoryWarningThreshold = 0.8;
  private lastCleanup = Date.now();
  private cleanupInterval = 30000;

  checkMemoryUsage(): MemoryStatus {
    const usage = this.getMemoryUsage();
    
    if (usage.percentage > this.memoryWarningThreshold) {
      this.performCleanup();
    }
    
    return {
      used: usage.used,
      total: usage.total,
      percentage: usage.percentage,
      needsCleanup: usage.percentage > this.memoryWarningThreshold,
    };
  }

  private getMemoryUsage(): { used: number; total: number; percentage: number } {
    // React Native doesn't provide direct memory APIs
    // This would need native module implementation
    // For now, return mock data
    return {
      used: 200 * 1024 * 1024, // 200MB
      total: 512 * 1024 * 1024, // 512MB
      percentage: 0.39,
    };
  }

  private performCleanup(): void {
    const now = Date.now();
    if (now - this.lastCleanup < this.cleanupInterval) return;
    
    this.lastCleanup = now;
    
    // Clear caches
    TreeCalculationCache.getInstance().clear();
    
    // Force garbage collection if available
    if ((global as any).gc) {
      (global as any).gc();
    }
    
    console.log('[MemoryManager] Cleanup performed');
  }

  dispose(): void {
    TreeCalculationCache.getInstance().clear();
  }
}