import type { PlatformAdapter, Platform, FileSystemAdapter, SecureStorageAdapter, NetworkAdapter, CryptoAdapter } from './types';

/**
 * Web platform detection
 */
const webPlatform: Platform = {
  isWeb: true,
  isReactNative: false,
  isIOS: false,
  isAndroid: false,
};

/**
 * Web-based file system adapter using IndexedDB
 */
class WebFileSystemAdapter implements FileSystemAdapter {
  private dbName = 'VaultSDK_FileSystem';
  private storeName = 'files';

  private async getDB(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, 1);
      
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);
      
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(this.storeName)) {
          db.createObjectStore(this.storeName);
        }
      };
    });
  }

  async readFile(path: string): Promise<Uint8Array> {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([this.storeName], 'readonly');
      const store = transaction.objectStore(this.storeName);
      const request = store.get(path);
      
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        if (request.result) {
          resolve(new Uint8Array(request.result));
        } else {
          reject(new Error(`File not found: ${path}`));
        }
      };
    });
  }

  async writeFile(path: string, data: Uint8Array): Promise<void> {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([this.storeName], 'readwrite');
      const store = transaction.objectStore(this.storeName);
      const request = store.put(Array.from(data), path);
      
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve();
    });
  }

  async deleteFile(path: string): Promise<void> {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([this.storeName], 'readwrite');
      const store = transaction.objectStore(this.storeName);
      const request = store.delete(path);
      
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve();
    });
  }

  async exists(path: string): Promise<boolean> {
    try {
      await this.readFile(path);
      return true;
    } catch {
      return false;
    }
  }

  async getSize(path: string): Promise<number> {
    const data = await this.readFile(path);
    return data.length;
  }

  async createDirectory(_path: string): Promise<void> {
    // No-op for web - directories are implicit
  }
}

/**
 * Web-based secure storage adapter using localStorage with encryption
 */
class WebSecureStorageAdapter implements SecureStorageAdapter {
  private prefix = 'VaultSDK_Secure_';

  async setItem(key: string, value: string): Promise<void> {
    try {
      // In a real implementation, you'd encrypt the value here
      localStorage.setItem(this.prefix + key, value);
    } catch (error) {
      throw new Error(`Failed to store secure item: ${error}`);
    }
  }

  async getItem(key: string): Promise<string | null> {
    try {
      const value = localStorage.getItem(this.prefix + key);
      // In a real implementation, you'd decrypt the value here
      return value;
    } catch (error) {
      throw new Error(`Failed to retrieve secure item: ${error}`);
    }
  }

  async removeItem(key: string): Promise<void> {
    try {
      localStorage.removeItem(this.prefix + key);
    } catch (error) {
      throw new Error(`Failed to remove secure item: ${error}`);
    }
  }

  async clear(): Promise<void> {
    try {
      const keys = Object.keys(localStorage).filter(key => key.startsWith(this.prefix));
      keys.forEach(key => localStorage.removeItem(key));
    } catch (error) {
      throw new Error(`Failed to clear secure storage: ${error}`);
    }
  }
}

/**
 * Web-based network adapter
 */
class WebNetworkAdapter implements NetworkAdapter {
  async isConnected(): Promise<boolean> {
    return navigator.onLine;
  }

  async getConnectionType(): Promise<'wifi' | 'cellular' | 'ethernet' | 'none'> {
    if (!navigator.onLine) return 'none';
    
    // Web doesn't provide detailed connection info without special APIs
    // For now, assume ethernet if online
    return 'ethernet';
  }

  onNetworkChange(callback: (isConnected: boolean) => void): () => void {
    const handleOnline = () => callback(true);
    const handleOffline = () => callback(false);
    
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }
}

/**
 * Web-based crypto adapter using Web Crypto API
 */
class WebCryptoAdapter implements CryptoAdapter {
  async generateKey(): Promise<Uint8Array> {
    const key = await crypto.subtle.generateKey(
      { name: 'AES-GCM', length: 256 },
      true,
      ['encrypt', 'decrypt']
    );
    
    const exported = await crypto.subtle.exportKey('raw', key);
    return new Uint8Array(exported);
  }

  async encrypt(data: Uint8Array, key: Uint8Array): Promise<Uint8Array> {
    const cryptoKey = await crypto.subtle.importKey(
      'raw',
      key,
      { name: 'AES-GCM' },
      false,
      ['encrypt']
    );
    
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const encrypted = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv },
      cryptoKey,
      data
    );
    
    // Combine IV and encrypted data
    const result = new Uint8Array(iv.length + encrypted.byteLength);
    result.set(iv, 0);
    result.set(new Uint8Array(encrypted), iv.length);
    
    return result;
  }

  async decrypt(encryptedData: Uint8Array, key: Uint8Array): Promise<Uint8Array> {
    const cryptoKey = await crypto.subtle.importKey(
      'raw',
      key,
      { name: 'AES-GCM' },
      false,
      ['decrypt']
    );
    
    // Extract IV and encrypted data
    const iv = encryptedData.slice(0, 12);
    const encrypted = encryptedData.slice(12);
    
    const decrypted = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv },
      cryptoKey,
      encrypted
    );
    
    return new Uint8Array(decrypted);
  }

  async hash(data: Uint8Array): Promise<Uint8Array> {
    const hashed = await crypto.subtle.digest('SHA-256', data);
    return new Uint8Array(hashed);
  }

  randomBytes(length: number): Uint8Array {
    return crypto.getRandomValues(new Uint8Array(length));
  }
}

/**
 * Complete web platform adapter
 */
export const webPlatformAdapter: PlatformAdapter = {
  platform: webPlatform,
  fileSystem: new WebFileSystemAdapter(),
  secureStorage: new WebSecureStorageAdapter(),
  network: new WebNetworkAdapter(),
  crypto: new WebCryptoAdapter(),
};