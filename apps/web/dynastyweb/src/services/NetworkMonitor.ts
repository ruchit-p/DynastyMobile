// Network Monitor Service for Dynasty Web App
// Handles online/offline detection and automatic sync

import React from 'react';
import { errorHandler, ErrorSeverity } from './ErrorHandlingService';

export type NetworkStatus = 'online' | 'offline' | 'slow';
export type NetworkListener = (status: NetworkStatus) => void;

interface NetworkSpeed {
  downlink: number; // Mbps
  effectiveType: '4g' | '3g' | '2g' | 'slow-2g';
  rtt: number; // Round-trip time in ms
}

class NetworkMonitor {
  private static instance: NetworkMonitor;
  private listeners: Set<NetworkListener> = new Set();
  private currentStatus: NetworkStatus = 'online';
  private syncCallbacks: Set<() => Promise<void>> = new Set();
  private isMonitoring = false;
  private connectionCheckInterval?: NodeJS.Timeout;
  private lastOnlineTime?: number;

  private constructor() {
    if (typeof window !== 'undefined') {
      this.currentStatus = navigator.onLine ? 'online' : 'offline';
    }
  }

  static getInstance(): NetworkMonitor {
    if (!NetworkMonitor.instance) {
      NetworkMonitor.instance = new NetworkMonitor();
    }
    return NetworkMonitor.instance;
  }

  start() {
    if (this.isMonitoring || typeof window === 'undefined') return;

    this.isMonitoring = true;

    // Listen to browser online/offline events
    window.addEventListener('online', this.handleOnline);
    window.addEventListener('offline', this.handleOffline);

    // Check connection quality periodically
    this.startConnectionQualityCheck();

    // Initial status check
    this.checkNetworkStatus();
  }

  stop() {
    if (!this.isMonitoring || typeof window === 'undefined') return;

    this.isMonitoring = false;

    window.removeEventListener('online', this.handleOnline);
    window.removeEventListener('offline', this.handleOffline);

    if (this.connectionCheckInterval) {
      clearInterval(this.connectionCheckInterval);
      this.connectionCheckInterval = undefined;
    }
  }

  private handleOnline = async () => {
    this.lastOnlineTime = Date.now();
    await this.updateStatus('online');
    await this.triggerSync();
  };

  private handleOffline = () => {
    this.updateStatus('offline');
  };

  private startConnectionQualityCheck() {
    // Check connection quality every 30 seconds
    this.connectionCheckInterval = setInterval(() => {
      this.checkNetworkStatus();
    }, 30000) as unknown as NodeJS.Timeout;
  }

  private async checkNetworkStatus() {
    if (!navigator.onLine) {
      this.updateStatus('offline');
      return;
    }

    try {
      // Try to reach Firebase
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);

      await fetch('https://www.googleapis.com/generate_204', {
        method: 'HEAD',
        mode: 'no-cors',
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      // Check connection speed if available
      const networkInfo = this.getNetworkInfo();
      if (networkInfo && networkInfo.effectiveType === 'slow-2g') {
        this.updateStatus('slow');
      } else {
        this.updateStatus('online');
      }
    } catch {
      // If we can't reach the server, we're effectively offline
      this.updateStatus('offline');
    }
  }

  private getNetworkInfo(): NetworkSpeed | null {
    if (typeof window === 'undefined') return null;

    // Use Network Information API if available
    const nav = navigator as {
      connection?: { downlink?: number; effectiveType?: string; rtt?: number };
    };
    if ('connection' in nav && nav.connection) {
      const connection = nav.connection;
      return {
        downlink: connection.downlink || 0,
        effectiveType: (connection.effectiveType || '4g') as '4g' | '3g' | '2g' | 'slow-2g',
        rtt: connection.rtt || 0,
      };
    }

    return null;
  }

  private updateStatus(status: NetworkStatus) {
    if (this.currentStatus === status) return;

    const previousStatus = this.currentStatus;
    this.currentStatus = status;

    // Notify all listeners
    this.listeners.forEach(listener => {
      try {
        listener(status);
      } catch (error) {
        errorHandler.handleError(error, ErrorSeverity.LOW, {
          action: 'network-status-listener',
          context: { status, previousStatus },
        });
      }
    });
  }

  private async triggerSync() {
    if (this.syncCallbacks.size === 0) return;

    console.log('Triggering sync after coming online...');

    // Execute all sync callbacks
    const promises = Array.from(this.syncCallbacks).map(callback => {
      return callback().catch(error => {
        errorHandler.handleError(error, ErrorSeverity.MEDIUM, {
          action: 'network-sync-callback',
        });
      });
    });

    await Promise.allSettled(promises);
  }

  // Public API
  getStatus(): NetworkStatus {
    return this.currentStatus;
  }

  isOnline(): boolean {
    return this.currentStatus === 'online';
  }

  isOffline(): boolean {
    return this.currentStatus === 'offline';
  }

  getTimeSinceLastOnline(): number | null {
    return this.lastOnlineTime ? Date.now() - this.lastOnlineTime : null;
  }

  addListener(listener: NetworkListener): () => void {
    this.listeners.add(listener);

    // Return unsubscribe function
    return () => {
      this.listeners.delete(listener);
    };
  }

  addSyncCallback(callback: () => Promise<void>): () => void {
    this.syncCallbacks.add(callback);

    // Return unsubscribe function
    return () => {
      this.syncCallbacks.delete(callback);
    };
  }

  // Utility method to wait for online status
  async waitForOnline(timeout = 30000): Promise<boolean> {
    if (this.isOnline()) return true;

    return new Promise(resolve => {
      const timeoutId = setTimeout(() => {
        cleanup();
        resolve(false);
      }, timeout);

      const cleanup = this.addListener(status => {
        if (status === 'online') {
          clearTimeout(timeoutId);
          cleanup();
          resolve(true);
        }
      });
    });
  }
}

// Export singleton instance
export const networkMonitor = NetworkMonitor.getInstance();

// Export class for testing
export default NetworkMonitor;

// React hook for network status
export function useNetworkStatus() {
  const [status, setStatus] = React.useState<NetworkStatus>(() =>
    NetworkMonitor.getInstance().getStatus()
  );

  React.useEffect(() => {
    const monitor = NetworkMonitor.getInstance();
    const unsubscribe = monitor.addListener(setStatus);

    // Start monitoring if not already started
    monitor.start();

    return unsubscribe;
  }, []);

  return {
    status,
    isOnline: status === 'online',
    isOffline: status === 'offline',
    isSlow: status === 'slow',
  };
}
