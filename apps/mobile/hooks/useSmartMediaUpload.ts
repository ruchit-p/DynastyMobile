import { useState, useEffect } from 'react';
import { useImageUpload } from './useImageUpload';
import { useEncryptedMediaUpload } from './useEncryptedMediaUpload';
import { shouldEncryptStories, shouldEncryptEvents, shouldEncryptVault } from '../src/lib/encryptionUtils';
import { useEncryption } from '../src/contexts/EncryptionContext';

export type MediaContext = 'story' | 'event' | 'vault' | 'chat' | 'general';

interface UseSmartMediaUploadResult {
  isUploading: boolean;
  uploadProgress: number;
  uploadedUrl: string | null;
  encryptionKey: string | null;
  error: Error | null;
  isEncrypted: boolean;
  uploadMedia: (
    uri: string,
    context: MediaContext,
    metadata?: {
      fileName?: string;
      mimeType?: string;
      chatId?: string;
      pathPrefix?: string;
    },
    onProgress?: (progress: number) => void
  ) => Promise<{ url: string; key?: string } | null>;
}

/**
 * Smart media upload hook that automatically handles encryption based on context and user settings
 */
export const useSmartMediaUpload = (): UseSmartMediaUploadResult => {
  const { isEncryptionReady } = useEncryption();
  const regularUpload = useImageUpload();
  const encryptedUpload = useEncryptedMediaUpload();
  
  const [shouldEncrypt, setShouldEncrypt] = useState<Record<MediaContext, boolean>>({
    story: false,
    event: false,
    vault: true,
    chat: true, // Chat is always encrypted when encryption is ready
    general: false,
  });

  // Load encryption settings
  useEffect(() => {
    const loadSettings = async () => {
      const [stories, events, vault] = await Promise.all([
        shouldEncryptStories(),
        shouldEncryptEvents(),
        shouldEncryptVault(),
      ]);
      
      setShouldEncrypt({
        story: stories,
        event: events,
        vault: vault,
        chat: true,
        general: false,
      });
    };
    
    loadSettings();
  }, []);

  const uploadMedia = async (
    uri: string,
    context: MediaContext,
    metadata?: {
      fileName?: string;
      mimeType?: string;
      chatId?: string;
      pathPrefix?: string;
    },
    onProgress?: (progress: number) => void
  ): Promise<{ url: string; key?: string } | null> => {
    const useEncryption = isEncryptionReady && shouldEncrypt[context];
    
    if (useEncryption && context === 'chat' && metadata?.chatId) {
      // Use encrypted upload for chat
      const result = await encryptedUpload.uploadEncryptedMedia(
        uri,
        metadata.fileName || 'media',
        metadata.mimeType || 'image/jpeg',
        metadata.chatId,
        onProgress
      );
      
      return result;
    } else if (useEncryption && (context === 'story' || context === 'event' || context === 'vault')) {
      // For non-chat contexts, we need to create a pseudo-chatId or use a different approach
      // For now, use a context-specific folder
      const pseudoChatId = `${context}s/${new Date().getFullYear()}`;
      
      const result = await encryptedUpload.uploadEncryptedMedia(
        uri,
        metadata?.fileName || 'media',
        metadata?.mimeType || 'image/jpeg',
        pseudoChatId,
        onProgress
      );
      
      return result;
    } else {
      // Use regular upload
      const pathPrefix = metadata?.pathPrefix || context;
      const url = await regularUpload.uploadImage(uri, pathPrefix, onProgress);
      
      return url ? { url } : null;
    }
  };

  // Determine which upload service is active
  const isUploading = regularUpload.isUploading || encryptedUpload.isUploading;
  const uploadProgress = regularUpload.isUploading 
    ? regularUpload.uploadProgress 
    : encryptedUpload.uploadProgress;
  const uploadedUrl = regularUpload.uploadedUrl || encryptedUpload.uploadedUrl;
  const error = regularUpload.error || encryptedUpload.error;

  return {
    isUploading,
    uploadProgress,
    uploadedUrl,
    encryptionKey: encryptedUpload.encryptionKey,
    error,
    isEncrypted: false, // Will be determined when uploadMedia is called
    uploadMedia,
  };
};