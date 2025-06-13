// Mock for @react-native-community/netinfo
export default {
  addEventListener: jest.fn((callback) => {
    // Call the callback immediately with a connected state
    callback({ isConnected: true, type: 'wifi' });
    // Return unsubscribe function
    return jest.fn();
  }),
  fetch: jest.fn(() => Promise.resolve({ 
    isConnected: true, 
    type: 'wifi',
    isInternetReachable: true,
    details: {}
  })),
  configure: jest.fn(),
  refresh: jest.fn(() => Promise.resolve()),
  useNetInfo: jest.fn(() => ({ 
    isConnected: true, 
    type: 'wifi',
    isInternetReachable: true,
    details: {}
  })),
};

export const NetInfoStateType = {
  unknown: 'unknown',
  none: 'none',
  cellular: 'cellular',
  wifi: 'wifi',
  bluetooth: 'bluetooth',
  ethernet: 'ethernet',
  wimax: 'wimax',
  vpn: 'vpn',
  other: 'other',
};