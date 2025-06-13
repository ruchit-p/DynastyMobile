import NetInfo, { NetInfoState, NetInfoSubscription } from '@react-native-community/netinfo';
import { logger } from './LoggingService';

type NetworkChangeListener = (isOnline: boolean, state: NetInfoState) => void;

class NetworkService {
  private static instance: NetworkService;
  private listeners: Set<NetworkChangeListener> = new Set();
  private currentState: NetInfoState | null = null;
  private subscription: NetInfoSubscription | null = null;
  private isInitialized = false;

  private constructor() {}

  static getInstance(): NetworkService {
    if (!NetworkService.instance) {
      NetworkService.instance = new NetworkService();
    }
    return NetworkService.instance;
  }

  /**
   * Initialize network monitoring
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) {
      logger.debug('NetworkService: Already initialized');
      return;
    }

    logger.debug('NetworkService: Initializing...');
    
    // Get initial state
    this.currentState = await NetInfo.fetch();
    logger.debug('NetworkService: Initial state:', {
      isConnected: this.currentState.isConnected,
      type: this.currentState.type
    });

    // Subscribe to changes
    this.subscription = NetInfo.addEventListener((state: NetInfoState) => {
      const wasOnline = this.currentState?.isConnected ?? false;
      const isOnline = state.isConnected ?? false;
      
      this.currentState = state;
      
      // Only notify if online status changed
      if (wasOnline !== isOnline) {
        logger.debug(`NetworkService: Network ${isOnline ? 'connected' : 'disconnected'}`);
        this.notifyListeners(isOnline, state);
      }
    });

    this.isInitialized = true;
    logger.debug('NetworkService: Initialization complete');
  }

  /**
   * Clean up resources
   */
  cleanup(): void {
    if (this.subscription) {
      this.subscription();
      this.subscription = null;
    }
    this.listeners.clear();
    this.isInitialized = false;
  }

  /**
   * Add a network change listener
   */
  addListener(listener: NetworkChangeListener): () => void {
    this.listeners.add(listener);
    
    // Immediately notify with current state
    if (this.currentState) {
      listener(this.currentState.isConnected ?? false, this.currentState);
    }
    
    // Return unsubscribe function
    return () => {
      this.listeners.delete(listener);
    };
  }

  /**
   * Get current network state
   */
  getCurrentState(): NetInfoState | null {
    return this.currentState;
  }

  /**
   * Check if currently online
   */
  isOnline(): boolean {
    return this.currentState?.isConnected ?? false;
  }

  /**
   * Check if internet is reachable (not just connected to network)
   */
  isInternetReachable(): boolean | null {
    return this.currentState?.isInternetReachable ?? null;
  }

  /**
   * Get connection type
   */
  getConnectionType(): string {
    return this.currentState?.type ?? 'unknown';
  }

  /**
   * Force refresh network state
   */
  async refresh(): Promise<NetInfoState> {
    this.currentState = await NetInfo.fetch();
    return this.currentState;
  }

  /**
   * Configure network state checking
   */
  static configure(config: {
    reachabilityUrl?: string;
    reachabilityTest?: (response: Response) => Promise<boolean>;
    reachabilityLongTimeout?: number;
    reachabilityShortTimeout?: number;
    reachabilityRequestTimeout?: number;
    reachabilityShouldRun?: () => boolean;
    shouldFetchWiFiSSID?: boolean;
    useNativeReachability?: boolean;
  }): void {
    NetInfo.configure(config);
  }

  /**
   * Notify all listeners of network change
   */
  private notifyListeners(isOnline: boolean, state: NetInfoState): void {
    this.listeners.forEach(listener => {
      try {
        listener(isOnline, state);
      } catch (error) {
        logger.error('NetworkService: Error in listener:', error);
      }
    });
  }
}

// Export singleton instance
export const networkService = NetworkService.getInstance();

// Export convenience hook
export { useNetworkStatus } from '../hooks/useNetworkStatus';