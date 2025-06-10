import { r2MediaService } from '@/services/R2MediaService';

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
 * Uploads a media file to R2/Firebase Storage with compression and progress tracking
 */
export const uploadMedia = async (
  file: File,
  storyId: string,
  type: 'image' | 'video' | 'audio',
  callbacks?: UploadProgressCallback
): Promise<string> => {
  try {
    // Use R2MediaService for uploads
    return await r2MediaService.uploadStoryMedia(file, storyId, type, callbacks);
  } catch (error) {
    const finalError = error as Error;
    callbacks?.onError?.(finalError);
    throw finalError;
  }
};

/**
 * Uploads a profile picture blob to R2/Firebase Storage with progress tracking
 * This function is designed to work with Blob objects from image cropping
 */
export const uploadProfilePicture = async (
  imageBlob: Blob,
  userId: string,
  callbacks?: UploadProgressCallback
): Promise<string> => {
  try {
    // Use R2MediaService for uploads
    return await r2MediaService.uploadProfilePicture(imageBlob, userId, callbacks);
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

/**
 * Uploads event cover photos to R2/Firebase Storage
 * Uses the same path pattern as the backend: events/{eventId}/covers/{filename}
 * This is for temporary uploads before event creation - backend API requires existing eventId
 */
export const uploadEventCoverPhoto = async (
  file: File,
  eventId: string,
  callbacks?: UploadProgressCallback
): Promise<string> => {
  try {
    // Use R2MediaService for uploads
    return await r2MediaService.uploadEventCoverPhoto(file, eventId, callbacks);
  } catch (error) {
    const finalError = error as Error;
    callbacks?.onError?.(finalError);
    throw finalError;
  }
}; 