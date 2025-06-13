import { useState, useEffect, useCallback } from 'react';
import { OfflineFileCacheService } from '../src/services/encryption/OfflineFileCacheService';
import NetInfo from '@react-native-community/netinfo';
import { logger } from '../src/services/LoggingService';

interface UseOfflineFileOptions {
  autoCache?: boolean;
  pin?: boolean;
  expiresAt?: number;
}

interface OfflineFileResult {
  fileUri: string | null;
  isCached: boolean;
  isLoading: boolean;
  error: Error | null;
  isOnline: boolean;
  cacheFile: () => Promise<void>;
  removeFromCache: () => Promise<void>;
  pinFile: (pin: boolean) => Promise<void>;
}

export function useOfflineFile(
  fileId: string | undefined,
  remoteUri: string | undefined,
  metadata?: {
    fileName: string;
    fileSize: number;
    mimeType: string;
  },
  options: UseOfflineFileOptions = {}
): OfflineFileResult {
  const [fileUri, setFileUri] = useState<string | null>(null);
  const [isCached, setIsCached] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [isOnline, setIsOnline] = useState(true);

  const { autoCache = false, pin = false, expiresAt } = options;

  // Check network status
  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener(state => {
      setIsOnline(state.isConnected ?? false);
    });

    return unsubscribe;
  }, []);

  // Check if file is cached
  const checkCachedFile = useCallback(async () => {
    if (!fileId) return;

    try {
      const cached = await OfflineFileCacheService.getCachedFile(fileId);
      if (cached) {
        setFileUri(cached);
        setIsCached(true);
      } else {
        setIsCached(false);
        
        // Use remote URI if online
        if (isOnline && remoteUri) {
          setFileUri(remoteUri);
        } else {
          setFileUri(null);
        }
      }
    } catch (err) {
      console.error('Failed to check cached file:', err);
      setError(err as Error);
    }
  }, [fileId, remoteUri, isOnline]);

  // Cache file manually
  const cacheFile = useCallback(async () => {
    if (!fileId || !remoteUri || !metadata) {
      throw new Error('Missing required parameters for caching');
    }

    setIsLoading(true);
    setError(null);

    try {
      const cached = await OfflineFileCacheService.cacheFile(
        fileId,
        remoteUri,
        metadata,
        { pin, expiresAt }
      );

      if (cached) {
        setIsCached(true);
        const decryptedUri = await OfflineFileCacheService.getCachedFile(fileId);
        setFileUri(decryptedUri);
      }
    } catch (err) {
      console.error('Failed to cache file:', err);
      setError(err as Error);
    } finally {
      setIsLoading(false);
    }
  }, [fileId, remoteUri, metadata, pin, expiresAt]);

  // Remove from cache
  const removeFromCache = useCallback(async () => {
    if (!fileId) return;

    try {
      await OfflineFileCacheService.removeCachedFile(fileId);
      setIsCached(false);
      
      // Revert to remote URI if online
      if (isOnline && remoteUri) {
        setFileUri(remoteUri);
      } else {
        setFileUri(null);
      }
    } catch (err) {
      console.error('Failed to remove from cache:', err);
      setError(err as Error);
    }
  }, [fileId, remoteUri, isOnline]);

  // Pin/unpin file
  const pinFile = useCallback(async (shouldPin: boolean) => {
    if (!fileId) return;

    try {
      const success = await OfflineFileCacheService.pinFile(fileId, shouldPin);
      if (!success && shouldPin && remoteUri && metadata) {
        // If file isn't cached yet, cache it first
        await cacheFile();
      }
    } catch (err) {
      console.error('Failed to pin file:', err);
      setError(err as Error);
    }
  }, [fileId, remoteUri, metadata, cacheFile]);

  // Initialize
  useEffect(() => {
    checkCachedFile();
  }, [checkCachedFile]);

  // Auto-cache if enabled
  useEffect(() => {
    if (autoCache && !isCached && fileId && remoteUri && metadata && !isLoading) {
      cacheFile();
    }
  }, [autoCache, isCached, fileId, remoteUri, metadata, isLoading, cacheFile]);

  return {
    fileUri,
    isCached,
    isLoading,
    error,
    isOnline,
    cacheFile,
    removeFromCache,
    pinFile
  };
}