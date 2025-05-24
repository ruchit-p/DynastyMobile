import { useState } from 'react';
import { Alert } from 'react-native';
import { getFirebaseAuth } from '../src/lib/firebase';
import { MediaEncryptionService } from '../src/services/encryption';

interface UseEncryptedMediaUploadResult {
  isUploading: boolean;
  uploadProgress: number;
  uploadedUrl: string | null;
  encryptionKey: string | null;
  error: Error | null;
  uploadEncryptedMedia: (
    uri: string,
    fileName: string,
    mimeType: string,
    chatId: string,
    onProgress?: (progress: number) => void
  ) => Promise<{ url: string; key: string } | null>;
}

export const useEncryptedMediaUpload = (): UseEncryptedMediaUploadResult => {
  const [isUploading, setIsUploading] = useState<boolean>(false);
  const [uploadProgress, setUploadProgress] = useState<number>(0);
  const [uploadedUrl, setUploadedUrl] = useState<string | null>(null);
  const [encryptionKey, setEncryptionKey] = useState<string | null>(null);
  const [error, setError] = useState<Error | null>(null);

  const uploadEncryptedMedia = async (
    uri: string,
    fileName: string,
    mimeType: string,
    chatId: string,
    onProgress?: (progress: number) => void
  ): Promise<{ url: string; key: string } | null> => {
    const auth = getFirebaseAuth();

    if (!auth.currentUser) {
      Alert.alert("Authentication Error", "You must be logged in to upload media.");
      setError(new Error("User not authenticated"));
      return null;
    }

    setIsUploading(true);
    setUploadProgress(0);
    if (onProgress) onProgress(0);
    setUploadedUrl(null);
    setEncryptionKey(null);
    setError(null);

    try {
      console.log(`[useEncryptedMediaUpload] Starting encrypted upload for: ${uri}`);
      
      // Simulate progress during encryption
      setUploadProgress(20);
      if (onProgress) onProgress(20);

      const encryptedFile = await MediaEncryptionService.getInstance().uploadEncryptedFile(
        uri,
        fileName,
        mimeType,
        chatId
      );

      setUploadProgress(100);
      if (onProgress) onProgress(100);

      setUploadedUrl(encryptedFile.encryptedUrl);
      setEncryptionKey(encryptedFile.encryptedKey);
      setIsUploading(false);

      console.log('[useEncryptedMediaUpload] Encrypted file uploaded successfully');
      
      return {
        url: encryptedFile.encryptedUrl,
        key: encryptedFile.encryptedKey
      };
    } catch (uploadError: any) {
      console.error("[useEncryptedMediaUpload] Upload error:", uploadError);
      setError(uploadError);
      setIsUploading(false);
      setUploadProgress(0);
      if (onProgress) onProgress(0);
      
      Alert.alert("Upload Error", "Failed to upload encrypted media");
      return null;
    }
  };

  return {
    isUploading,
    uploadProgress,
    uploadedUrl,
    encryptionKey,
    error,
    uploadEncryptedMedia
  };
};