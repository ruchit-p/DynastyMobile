/**
 * Platform-specific interfaces for vault operations
 */

/**
 * Platform detection
 */
export interface Platform {
  isWeb: boolean;
  isReactNative: boolean;
  isIOS: boolean;
  isAndroid: boolean;
}

/**
 * File system interface for different platforms
 */
export interface FileSystemAdapter {
  readFile(path: string): Promise<Uint8Array>;
  writeFile(path: string, data: Uint8Array): Promise<void>;
  deleteFile(path: string): Promise<void>;
  exists(path: string): Promise<boolean>;
  getSize(path: string): Promise<number>;
  createDirectory(path: string): Promise<void>;
}

/**
 * Secure storage interface for different platforms
 */
export interface SecureStorageAdapter {
  setItem(key: string, value: string): Promise<void>;
  getItem(key: string): Promise<string | null>;
  removeItem(key: string): Promise<void>;
  clear(): Promise<void>;
}

/**
 * Network adapter for different platforms
 */
export interface NetworkAdapter {
  isConnected(): Promise<boolean>;
  getConnectionType(): Promise<'wifi' | 'cellular' | 'ethernet' | 'none'>;
  onNetworkChange(callback: (isConnected: boolean) => void): () => void;
}

/**
 * Crypto adapter for different platforms
 */
export interface CryptoAdapter {
  generateKey(): Promise<Uint8Array>;
  encrypt(data: Uint8Array, key: Uint8Array): Promise<Uint8Array>;
  decrypt(encryptedData: Uint8Array, key: Uint8Array): Promise<Uint8Array>;
  hash(data: Uint8Array): Promise<Uint8Array>;
  randomBytes(length: number): Uint8Array;
}

/**
 * Main platform adapter interface
 */
export interface PlatformAdapter {
  platform: Platform;
  fileSystem: FileSystemAdapter;
  secureStorage: SecureStorageAdapter;
  network: NetworkAdapter;
  crypto: CryptoAdapter;
}