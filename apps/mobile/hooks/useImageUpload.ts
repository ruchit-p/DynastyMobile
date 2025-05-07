import { useState } from 'react';
import { Alert } from 'react-native';
// import { getStorage, ref, uploadBytesResumable, getDownloadURL, UploadTaskSnapshot } from "firebase/storage"; // Firebase Storage
// import { auth, app as firebaseApp } from '../src/lib/firebase'; // Firebase App & Auth

interface UseImageUploadResult {
  isUploading: boolean;
  uploadProgress: number; // Percentage 0-100
  uploadedUrl: string | null;
  error: Error | null;
  uploadImage: (uri: string, pathPrefix: string) => Promise<string | null>;
}

export const useImageUpload = (): UseImageUploadResult => {
  const [isUploading, setIsUploading] = useState<boolean>(false);
  const [uploadProgress, setUploadProgress] = useState<number>(0);
  const [uploadedUrl, setUploadedUrl] = useState<string | null>(null);
  const [error, setError] = useState<Error | null>(null);

  const uploadImage = async (uri: string, pathPrefix: string = 'uploads'): Promise<string | null> => {
    // if (!auth.currentUser) { // Firebase Auth check commented out
    //   Alert.alert("Authentication Error", "You must be logged in to upload images.");
    //   setError(new Error("User not authenticated"));
    //   return null;
    // }

    console.log(`[MockUpload] Request to upload: ${uri} with prefix: ${pathPrefix}`);
    setIsUploading(true);
    setUploadProgress(0);
    setUploadedUrl(null);
    setError(null);

    // Simulate upload process
    return new Promise((resolve) => {
      let currentProgress = 0;
      const interval = setInterval(() => {
        currentProgress += 20;
        setUploadProgress(currentProgress);
        console.log(`[MockUpload] Progress: ${currentProgress}%`);
        if (currentProgress >= 100) {
          clearInterval(interval);
          setIsUploading(false);
          setUploadedUrl(uri); // Return the local URI as the "uploaded" URL
          console.log(`[MockUpload] Complete. Returning local URI: ${uri}`);
          resolve(uri);
        }
      }, 200); // Simulate 1 second upload (200ms * 5 steps)
    });

    /* Firebase Upload Logic - Commented Out
    try {
      // --- Fetch Blob --- //
      const blob: Blob = await new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.onload = () => resolve(xhr.response);
        xhr.onerror = (e) => {
          console.error("XHR Error:", e);
          reject(new TypeError("Network request failed"));
        };
        xhr.responseType = "blob";
        xhr.open("GET", uri, true);
        xhr.send(null);
      });

      // --- Prepare Upload --- //
      const storage = getStorage(firebaseApp);
      const fileExtension = uri.split('.').pop() || 'jpg';
      const fileName = `${pathPrefix}/${auth.currentUser.uid}-${Date.now()}.${fileExtension}`;
      const storageRef = ref(storage, fileName);
      const uploadTask = uploadBytesResumable(storageRef, blob);

      // --- Monitor Upload --- //
      return new Promise<string | null>((resolve, reject) => {
        uploadTask.on('state_changed',
          (snapshot: UploadTaskSnapshot) => {
            const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
            setUploadProgress(progress);
            console.log('Upload is ' + progress + '% done');
          },
          (uploadError: Error) => {
            console.error("Upload error:", uploadError);
            // @ts-ignore - Close blob if possible
            if (blob.close) { (blob as any).close(); }
            setError(uploadError); 
            setIsUploading(false);
            reject(uploadError);
          },
          async () => {
            // --- Complete --- //
            // @ts-ignore - Close blob if possible
            if (blob.close) { (blob as any).close(); }
            try {
                const downloadURL = await getDownloadURL(uploadTask.snapshot.ref);
                setUploadedUrl(downloadURL);
                setIsUploading(false);
                console.log('File available at', downloadURL);
                resolve(downloadURL);
            } catch (finalError) {
                 console.error("Error getting download URL:", finalError);
                 setError(finalError as Error);
                 setIsUploading(false);
                 reject(finalError);
            }
          }
        );
      });
    } catch (processError) {
      console.error("Error during upload process: ", processError);
      setError(processError as Error);
      setIsUploading(false);
      Alert.alert("Upload Failed", "Could not upload image. Please try again.");
      return null;
    }
    */
  };

  return { isUploading, uploadProgress, uploadedUrl, error, uploadImage };
}; 