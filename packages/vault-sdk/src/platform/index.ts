// Export platform types and adapters
export * from './types';
export { webPlatformAdapter } from './web';

// Platform detection utility
export function detectPlatform() {
  // Check for React Native environment
  if (typeof navigator !== 'undefined' && navigator.product === 'ReactNative') {
    return {
      isWeb: false,
      isReactNative: true,
      isIOS: false, // Would need Platform.OS check in RN
      isAndroid: false, // Would need Platform.OS check in RN
    };
  }
  
  // Default to web
  return {
    isWeb: true,
    isReactNative: false,
    isIOS: false,
    isAndroid: false,
  };
}