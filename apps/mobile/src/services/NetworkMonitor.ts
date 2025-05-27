/**
 * Network Monitor Service
 * Monitors network connectivity and triggers sync when connection is restored
 */

import NetInfo, { NetInfoState, NetInfoSubscription } from '@react-native-community/netinfo';
import { getMessageSyncService } from './MessageSyncService';
import { backgroundSyncTask } from './BackgroundSyncTask';
import { EventEmitter } from 'events';
import { logger } from './LoggingService';

export type NetworkStatus = 'online' | 'offline' | 'unknown';

export interface NetworkEvent {
  status: NetworkStatus;
  type: string | null;
  isInternetReachable: boolean | null;
  details: any;
}

export class NetworkMonitor extends EventEmitter {
  private static instance: NetworkMonitor;
  private subscription: NetInfoSubscription | null = null;
  private currentState: NetInfoState | null = null;
  private wasOffline = false;
  private isMonitoring = false;

  private constructor() {
    super();
  }

  static getInstance(): NetworkMonitor {
    if (!NetworkMonitor.instance) {
      NetworkMonitor.instance = new NetworkMonitor();
    }
    return NetworkMonitor.instance;
  }

  /**
   * Start monitoring network connectivity
   */
  start(): void {
    if (this.isMonitoring) {
      logger.debug('[NetworkMonitor] Already monitoring');
      return;
    }

    logger.debug('[NetworkMonitor] Starting network monitoring');

    // Get initial state
    NetInfo.fetch().then(state => {
      this.handleConnectionChange(state);
    });

    // Subscribe to network state changes
    this.subscription = NetInfo.addEventListener(state => {
      this.handleConnectionChange(state);
    });

    this.isMonitoring = true;
  }

  /**
   * Stop monitoring network connectivity
   */
  stop(): void {
    if (this.subscription) {
      this.subscription();
      this.subscription = null;
    }
    this.isMonitoring = false;
    logger.debug('[NetworkMonitor] Stopped network monitoring');
  }

  /**
   * Get current network status
   */
  getCurrentStatus(): NetworkStatus {
    if (!this.currentState) return 'unknown';
    return this.currentState.isConnected ? 'online' : 'offline';
  }

  /**
   * Get current network state
   */
  getCurrentState(): NetInfoState | null {
    return this.currentState;
  }

  /**
   * Check if internet is reachable
   */
  isInternetReachable(): boolean {
    return this.currentState?.isInternetReachable === true;
  }

  /**
   * Handle network state changes
   */
  private handleConnectionChange(state: NetInfoState): void {
    const previousState = this.currentState;
    this.currentState = state;

    // Determine network status
    const status: NetworkStatus = state.isConnected ? 'online' : 'offline';
    
    logger.debug(`[NetworkMonitor] Network state changed:`, {
      status,
      type: state.type,
      isInternetReachable: state.isInternetReachable,
    });

    // Emit network event
    const event: NetworkEvent = {
      status,
      type: state.type,
      isInternetReachable: state.isInternetReachable,
      details: state.details,
    };
    
    this.emit('networkChange', event);

    // Check if we just came back online
    if (!previousState?.isConnected && state.isConnected) {
      logger.debug('[NetworkMonitor] Connection restored');
      this.handleConnectionRestored();
    } else if (previousState?.isConnected && !state.isConnected) {
      logger.debug('[NetworkMonitor] Connection lost');
      this.wasOffline = true;
      this.emit('connectionLost');
    }
  }

  /**
   * Handle connection restored
   */
  private async handleConnectionRestored(): Promise<void> {
    if (!this.wasOffline) return;
    
    this.wasOffline = false;
    this.emit('connectionRestored');

    // Wait a bit for connection to stabilize
    setTimeout(async () => {
      try {
        logger.debug('[NetworkMonitor] Triggering sync after connection restored');
        
        // Trigger background sync
        await backgroundSyncTask.performSyncOperation();
        
        // Also try immediate sync
        const syncService = getMessageSyncService();
        await syncService.retryFailedMessages();
        
      } catch (error) {
        logger.error('[NetworkMonitor] Failed to trigger sync:', error);
      }
    }, 2000); // 2 second delay
  }

  /**
   * Force a network check
   */
  async checkConnection(): Promise<NetworkStatus> {
    const state = await NetInfo.fetch();
    this.handleConnectionChange(state);
    return state.isConnected ? 'online' : 'offline';
  }

  /**
   * Configure network monitoring settings
   */
  configure(config: {
    reachabilityUrl?: string;
    reachabilityTest?: (response: Response) => Promise<boolean>;
    reachabilityLongTimeout?: number;
    reachabilityShortTimeout?: number;
    reachabilityRequestTimeout?: number;
  }): void {
    NetInfo.configure(config);
  }
}

// Export singleton instance
export const networkMonitor = NetworkMonitor.getInstance();