declare module '@react-native-community/netinfo' {
  export interface NetInfoState {
    type: string;
    isConnected: boolean | null;
    isInternetReachable: boolean | null;
    details: any;
  }

  export interface NetInfoSubscription {
    (): void;
  }

  const NetInfo: {
    addEventListener: (listener: (state: NetInfoState) => void) => NetInfoSubscription;
    fetch: () => Promise<NetInfoState>;
    configure: (config: any) => void;
    refresh: () => Promise<void>;
    useNetInfo: () => NetInfoState;
  };

  export const NetInfoStateType: {
    unknown: string;
    none: string;
    cellular: string;
    wifi: string;
    bluetooth: string;
    ethernet: string;
    wimax: string;
    vpn: string;
    other: string;
  };

  export default NetInfo;
}