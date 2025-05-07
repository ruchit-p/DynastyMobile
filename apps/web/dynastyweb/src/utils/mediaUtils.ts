import { storage } from '@/lib/firebase';
import { ref, getDownloadURL, uploadBytesResumable } from 'firebase/storage';
import { getAuth } from 'firebase/auth';

/**
 * Compresses an image by:
 * - Reducing longest side to 800px while maintaining aspect ratio
 * - Applying 50% JPEG compression
 * - Skips resizing if longest side is already ≤ 800px
 */
export const compressImage = async (file: File): Promise<Blob> => {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.src = URL.createObjectURL(file);
    
    img.onload = () => {
      // 1) Identify the longest dimension
      const maxDimension = Math.max(img.width, img.height);
      
      // 2) If longest side <= 800, we skip resizing
      if (maxDimension <= 800) {
        file.arrayBuffer().then(buffer => {
          resolve(new Blob([buffer], { type: 'image/jpeg' }));
        });
        return;
      }
      
      // 3) Calculate the scale ratio
      const ratio = 800.0 / maxDimension;
      const newWidth = img.width * ratio;
      const newHeight = img.height * ratio;
      
      // 4) Create a canvas and resize the image
      const canvas = document.createElement('canvas');
      canvas.width = newWidth;
      canvas.height = newHeight;
      const ctx = canvas.getContext('2d');
      
      if (!ctx) {
        reject(new Error('Failed to get canvas context'));
        return;
      }
      
      ctx.drawImage(img, 0, 0, newWidth, newHeight);
      
      // 5) Convert to JPEG with 50% quality
      canvas.toBlob(
        (blob) => {
          if (blob) {
            resolve(blob);
          } else {
            reject(new Error('Failed to compress image'));
          }
        },
        'image/jpeg',
        0.5
      );
    };
    
    img.onerror = () => {
      reject(new Error('Failed to load image'));
    };
  });
};

/**
 * Compresses a video using the browser's MediaRecorder API
 * Targets a medium quality output
 */
export const compressVideo = async (file: File): Promise<Blob> => {
  return new Promise((resolve, reject) => {
    // Create video element to load the file
    const video = document.createElement('video');
    video.src = URL.createObjectURL(file);
    video.preload = 'metadata';
    
    video.onloadedmetadata = () => {
      // Create a MediaRecorder to re-encode the video
      const canvas = document.createElement('canvas');
      const stream = canvas.captureStream();
      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: 'video/webm;codecs=vp9',
        videoBitsPerSecond: 2500000 // 2.5 Mbps
      });
      
      const chunks: Blob[] = [];
      mediaRecorder.ondataavailable = (e) => chunks.push(e.data);
      mediaRecorder.onstop = () => {
        const blob = new Blob(chunks, { type: 'video/webm' });
        resolve(blob);
      };
      
      // Start recording and playing the video
      mediaRecorder.start();
      video.play();
      
      // Stop when video ends
      video.onended = () => {
        mediaRecorder.stop();
        video.remove();
      };
    };
    
    video.onerror = () => {
      reject(new Error('Failed to load video'));
    };
  });
};

/**
 * Compresses audio using the Web Audio API
 */
export const compressAudio = async (file: File): Promise<Blob> => {
  return new Promise((resolve, reject) => {
    const audioContext = new AudioContext();
    const reader = new FileReader();
    
    reader.onload = async () => {
      try {
        const arrayBuffer = reader.result as ArrayBuffer;
        const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
        
        // Create a new buffer with reduced quality
        const offlineContext = new OfflineAudioContext(
          audioBuffer.numberOfChannels,
          audioBuffer.length,
          22050 // Reduced sample rate
        );
        
        const source = offlineContext.createBufferSource();
        source.buffer = audioBuffer;
        source.connect(offlineContext.destination);
        source.start();
        
        const renderedBuffer = await offlineContext.startRendering();
        
        // Convert to WAV format
        const wavBlob = await new Promise<Blob>((resolve) => {
          const numberOfChannels = renderedBuffer.numberOfChannels;
          const length = renderedBuffer.length * numberOfChannels * 2;
          const buffer = new ArrayBuffer(44 + length);
          const view = new DataView(buffer);
          
          // WAV header
          writeString(view, 0, 'RIFF');
          view.setUint32(4, 36 + length, true);
          writeString(view, 8, 'WAVE');
          writeString(view, 12, 'fmt ');
          view.setUint32(16, 16, true);
          view.setUint16(20, 1, true);
          view.setUint16(22, numberOfChannels, true);
          view.setUint32(24, renderedBuffer.sampleRate, true);
          view.setUint32(28, renderedBuffer.sampleRate * 2, true);
          view.setUint16(32, numberOfChannels * 2, true);
          view.setUint16(34, 16, true);
          writeString(view, 36, 'data');
          view.setUint32(40, length, true);
          
          // Write audio data
          const offset = 44;
          for (let i = 0; i < renderedBuffer.length; i++) {
            for (let channel = 0; channel < numberOfChannels; channel++) {
              const sample = renderedBuffer.getChannelData(channel)[i];
              view.setInt16(offset + (i * numberOfChannels + channel) * 2, sample * 0x7fff, true);
            }
          }
          
          resolve(new Blob([buffer], { type: 'audio/wav' }));
        });
        
        resolve(wavBlob);
      } catch (error) {
        reject(error);
      }
    };
    
    reader.onerror = () => reject(new Error('Failed to read audio file'));
    reader.readAsArrayBuffer(file);
  });
};

// Helper function for WAV header writing
function writeString(view: DataView, offset: number, string: string) {
  for (let i = 0; i < string.length; i++) {
    view.setUint8(offset + i, string.charCodeAt(i));
  }
}

interface UploadProgressCallback {
  onProgress?: (progress: number) => void;
  onError?: (error: Error) => void;
}

/**
 * Uploads a media file to Firebase Storage with compression and progress tracking
 */
export const uploadMedia = async (
  file: File,
  storyId: string,
  type: 'image' | 'video' | 'audio',
  callbacks?: UploadProgressCallback
): Promise<string> => {
  try {
    let compressedBlob: Blob;
    let extension: string;
    let contentType: string;

    // Compress based on media type
    try {
      switch (type) {
        case 'image':
          compressedBlob = await compressImage(file);
          extension = 'jpg';
          contentType = 'image/jpeg';
          break;
        case 'video':
          if (file.size > 500 * 1024 * 1024) { // 500MB
            throw new Error('Video file size must be less than 500MB');
          }
          compressedBlob = await compressVideo(file);
          extension = 'webm';
          contentType = 'video/webm';
          break;
        case 'audio':
          if (file.size > 100 * 1024 * 1024) { // 100MB
            throw new Error('Audio file size must be less than 100MB');
          }
          compressedBlob = await compressAudio(file);
          extension = 'wav';
          contentType = 'audio/wav';
          break;
        default:
          throw new Error('Unsupported media type');
      }
    } catch (error) {
      const typedError = error as Error;
      const compressionError = new Error(
        `Failed to compress ${type}: ${typedError.message || 'Unknown error'}`
      );
      callbacks?.onError?.(compressionError);
      throw compressionError;
    }

    // Create a unique filename
    const filename = `${type}_${Date.now()}_${Math.random().toString(36).substring(2)}.${extension}`;
    const storageRef = ref(storage, `stories/${storyId}/media/${filename}`);

    // Get the current user
    const auth = getAuth();
    const userId = auth.currentUser?.uid;

    // Upload the compressed file with progress tracking
    return new Promise((resolve, reject) => {
      const uploadTask = uploadBytesResumable(storageRef, compressedBlob, {
        contentType: contentType,
        customMetadata: {
          uploadedBy: userId || 'unknown',
          storyId: storyId,
          mediaType: type
        }
      });

      uploadTask.on(
        'state_changed',
        (snapshot) => {
          const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
          callbacks?.onProgress?.(progress);
        },
        (error) => {
          const uploadError = new Error(
            `Failed to upload ${type}: ${error.message || 'Unknown error'}`
          );
          callbacks?.onError?.(uploadError);
          reject(uploadError);
        },
        async () => {
          try {
            const downloadURL = await getDownloadURL(uploadTask.snapshot.ref);
            resolve(downloadURL);
          } catch (error) {
            const urlError = new Error(
              `Failed to get download URL for ${type}: ${(error as Error).message || 'Unknown error'}`
            );
            callbacks?.onError?.(urlError);
            reject(urlError);
          }
        }
      );
    });
  } catch (error) {
    const finalError = error as Error;
    callbacks?.onError?.(finalError);
    throw finalError;
  }
};

/**
 * Uploads a profile picture blob to Firebase Storage with progress tracking
 * This function is designed to work with Blob objects from image cropping
 */
export const uploadProfilePicture = async (
  imageBlob: Blob,
  userId: string,
  callbacks?: UploadProgressCallback
): Promise<string> => {
  try {
    // Create a unique filename with timestamp
    const timestamp = Date.now();
    const randomString = Math.random().toString(36).substring(2);
    const filename = `profile_${timestamp}_${randomString}.jpg`;
    const storageRef = ref(storage, `profilePictures/${userId}/${filename}`);

    // Upload the blob with progress tracking
    return new Promise((resolve, reject) => {
      const uploadTask = uploadBytesResumable(storageRef, imageBlob, {
        contentType: 'image/jpeg',
        customMetadata: {
          uploadedBy: userId,
          uploadedAt: new Date().toISOString(),
          mediaType: 'profile'
        }
      });

      uploadTask.on(
        'state_changed',
        (snapshot) => {
          const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
          callbacks?.onProgress?.(progress);
        },
        (error) => {
          const uploadError = new Error(
            `Failed to upload profile picture: ${error.message || 'Unknown error'}`
          );
          callbacks?.onError?.(uploadError);
          reject(uploadError);
        },
        async () => {
          try {
            const downloadURL = await getDownloadURL(uploadTask.snapshot.ref);
            
            // Ensure the URL has the alt=media parameter for direct viewing
            const formattedUrl = downloadURL.includes('?') 
              ? (downloadURL.includes('alt=media') ? downloadURL : `${downloadURL}&alt=media`)
              : `${downloadURL}?alt=media`;
              
            resolve(formattedUrl);
          } catch (error) {
            const urlError = new Error(
              `Failed to get download URL for profile picture: ${(error as Error).message || 'Unknown error'}`
            );
            callbacks?.onError?.(urlError);
            reject(urlError);
          }
        }
      );
    });
  } catch (error) {
    const finalError = error as Error;
    callbacks?.onError?.(finalError);
    throw finalError;
  }
};

/**
 * Ensures Firebase Storage URLs are properly formatted for access
 * Handles both signed URLs and public URLs with alt=media parameter
 */
export const ensureAccessibleStorageUrl = (url: string): string => {
  if (!url) return url;
  
  // If it's not a Storage URL, return as is
  if (!url.includes('storage.googleapis.com') && !url.includes('firebasestorage.googleapis.com')) {
    return url;
  }
  
  // If it's already a signed URL, return as is
  if (url.includes('token=')) {
    return url;
  }
  
  // For non-signed storage URLs, ensure they have alt=media parameter
  if (url.includes('?')) {
    // URL already has parameters
    if (!url.includes('alt=media')) {
      return `${url}&alt=media`;
    }
    return url;
  } else {
    // URL has no parameters yet
    return `${url}?alt=media`;
  }
}; 