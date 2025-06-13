import { useState, useEffect } from 'react';
import FilePreviewService from '../src/services/encryption/FilePreviewService';

interface UseEncryptedPreviewOptions {
  width?: number;
  height?: number;
  quality?: number;
  enabled?: boolean;
}

interface PreviewResult {
  previewUri: string | null;
  isLoading: boolean;
  error: Error | null;
  refresh: () => void;
}

export function useEncryptedPreview(
  fileId: string | undefined,
  fileUri: string | undefined,
  mimeType: string | undefined,
  options: UseEncryptedPreviewOptions = {}
): PreviewResult {
  const [previewUri, setPreviewUri] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const { enabled = true } = options;

  const loadPreview = async () => {
    if (!fileId || !fileUri || !mimeType || !enabled) {
      setPreviewUri(null);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const preview = await FilePreviewService.getEncryptedPreview(
        fileId,
        fileUri,
        mimeType,
        options
      );
      
      if (preview) {
        // Decrypt preview for display
        const decrypted = await FilePreviewService.decryptPreview(fileId);
        setPreviewUri(decrypted?.uri || null);
      } else {
        setPreviewUri(null);
      }
    } catch (err) {
      console.error('Failed to load encrypted preview:', err);
      setError(err as Error);
      setPreviewUri(null);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadPreview();

    // Cleanup function to remove temporary decrypted files
    return () => {
      // FilePreviewService handles cleanup internally
    };
  }, [fileId, fileUri, mimeType, enabled]);

  return {
    previewUri,
    isLoading,
    error,
    refresh: loadPreview
  };
}