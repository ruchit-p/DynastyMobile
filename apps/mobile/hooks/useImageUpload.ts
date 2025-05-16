import { useState } from 'react';
import { Alert } from 'react-native';
import { getFirebaseAuth, getFirebaseStorage } from '../src/lib/firebase'; // Use getters from lib
import storage, { FirebaseStorageTypes, TaskState } from '@react-native-firebase/storage';

interface UseImageUploadResult {
  isUploading: boolean;
  uploadProgress: number; // Percentage 0-100 for the current upload task
  uploadedUrl: string | null;
  error: Error | null;
  uploadImage: (
    uri: string, 
    pathPrefix: string, 
    onProgress?: (progress: number) => void // Optional progress callback
  ) => Promise<string | null>;
}

export const useImageUpload = (): UseImageUploadResult => {
  const [isUploading, setIsUploading] = useState<boolean>(false);
  const [uploadProgress, setUploadProgress] = useState<number>(0);
  const [uploadedUrl, setUploadedUrl] = useState<string | null>(null);
  const [error, setError] = useState<Error | null>(null);

  const uploadImage = async (
    uri: string, 
    pathPrefix: string = 'uploads',
    onProgress?: (progress: number) => void
  ): Promise<string | null> => {
    const auth = getFirebaseAuth(); // Get auth instance
    const storage = getFirebaseStorage(); // Get storage instance

    if (!auth.currentUser) {
      Alert.alert("Authentication Error", "You must be logged in to upload images.");
      setError(new Error("User not authenticated"));
      return null;
    }

    setIsUploading(true);
    setUploadProgress(0);
    if (onProgress) onProgress(0);
    setUploadedUrl(null);
    setError(null);

    const fileExtension = uri.split('.').pop() || 'jpg';
    // Use pathPrefix as the base, then userId, then a timestamp and original extension
    const fileName = `${pathPrefix}/${auth.currentUser.uid}-${Date.now()}.${fileExtension}`;
    const reference = storage.ref(fileName);

    console.log(`[useImageUpload] Starting upload for: ${uri} to ${fileName}`);

    return new Promise<string | null>((resolve, reject) => {
      const task = reference.putFile(uri);

      task.on('state_changed', 
        (snapshot: FirebaseStorageTypes.TaskSnapshot) => {
          const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
          setUploadProgress(progress);
          if (onProgress) onProgress(progress);
          console.log(`[useImageUpload] Upload is ${progress}% done`);

          switch (snapshot.state) {
            case TaskState.PAUSED: // Corrected: Use directly imported TaskState
              console.log('[useImageUpload] Upload is paused');
              break;
            case TaskState.RUNNING: // Corrected: Use directly imported TaskState
              console.log('[useImageUpload] Upload is running');
              break;
          }
        }, 
        (uploadError: Error) => {
          console.error("[useImageUpload] Upload error:", uploadError);
          setError(uploadError);
          setIsUploading(false);
          setUploadProgress(0);
          if (onProgress) onProgress(0);
          reject(uploadError); // Reject the promise
        }, 
        async () => {
          try {
            const downloadURL = await reference.getDownloadURL();
            setUploadedUrl(downloadURL);
            setIsUploading(false);
            setUploadProgress(100);
            if (onProgress) onProgress(100);
            console.log('[useImageUpload] File available at', downloadURL);
            resolve(downloadURL); // Resolve the promise with the URL
          } catch (finalError: any) {
            console.error("[useImageUpload] Error getting download URL:", finalError);
            setError(finalError);
            setIsUploading(false);
            setUploadProgress(0);
            if (onProgress) onProgress(0);
            reject(finalError); // Reject the promise
          }
        }
      );
    }).catch(err => {
      // Ensure any rejection from the promise chain is handled and returns null
      // setError should already be set by the reject handler inside the promise.
      // setIsUploading and setUploadProgress should also be reset.
      console.error("[useImageUpload] Promise catch block after upload attempt:", err.message);
      return null;
    });
  };

  return { isUploading, uploadProgress, uploadedUrl, error, uploadImage };
}; 