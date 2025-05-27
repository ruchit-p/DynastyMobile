import { randomBytes, createCipheriv, createDecipheriv, createHash } from 'react-native-quick-crypto';
import { Buffer } from '@craftzdog/react-native-buffer';
import * as FileSystem from 'expo-file-system';
import * as ImageManipulator from 'expo-image-manipulator';
import { getFirebaseStorage, getFirebaseAuth } from '../../lib/firebase';
import { AuditLogService } from './AuditLogService';
import { logger } from '../LoggingService';

// Constants
const ALGORITHM = 'aes-256-gcm';
const KEY_LENGTH = 32; // 256 bits
const IV_LENGTH = 16; // 128 bits
const CHUNK_SIZE = 64 * 1024; // 64KB chunks for large files

export interface EncryptedFile {
  encryptedUrl: string; // Firebase Storage URL
  encryptedKey: string; // Base64 encrypted key (encrypted with Signal Protocol)
  metadata: {
    fileName: string;
    fileSize: number;
    mimeType: string;
    iv: string; // Base64
    tag: string; // Base64
  };
}

export interface FileEncryptionResult {
  encryptedData: Uint8Array;
  key: Buffer;
  iv: Buffer;
  tag: Buffer;
}

export class MediaEncryptionService {
  private static instance: MediaEncryptionService;

  private constructor() {}

  static getInstance(): MediaEncryptionService {
    if (!MediaEncryptionService.instance) {
      MediaEncryptionService.instance = new MediaEncryptionService();
    }
    return MediaEncryptionService.instance;
  }

  /**
   * Generate a random encryption key
   */
  generateKey(): Buffer {
    return Buffer.from(randomBytes(KEY_LENGTH));
  }

  /**
   * Generate a random IV
   */
  generateIV(): Buffer {
    return Buffer.from(randomBytes(IV_LENGTH));
  }

  /**
   * Encrypt a file in memory (for small files)
   */
  async encryptFile(
    fileData: Uint8Array,
    key?: Buffer
  ): Promise<FileEncryptionResult> {
    try {
      // Generate key and IV if not provided
      const encryptionKey = key || this.generateKey();
      const iv = this.generateIV();

      // Create cipher
      const cipher = createCipheriv(ALGORITHM, encryptionKey, iv);
      
      // Encrypt data
      const encrypted = Buffer.concat([
        cipher.update(Buffer.from(fileData)),
        cipher.final()
      ]);
      
      // Get authentication tag
      const tag = cipher.getAuthTag();

      return {
        encryptedData: new Uint8Array(encrypted),
        key: encryptionKey,
        iv,
        tag
      };
    } catch (error) {
      logger.error('Failed to encrypt file:', error);
      throw error;
    }
  }

  /**
   * Decrypt a file in memory (for small files)
   */
  async decryptFile(
    encryptedData: Uint8Array,
    key: Buffer,
    iv: Buffer,
    tag: Buffer
  ): Promise<Uint8Array> {
    try {
      // Create decipher
      const decipher = createDecipheriv(ALGORITHM, key, iv);
      decipher.setAuthTag(tag);

      // Decrypt data
      const decrypted = Buffer.concat([
        decipher.update(Buffer.from(encryptedData)),
        decipher.final()
      ]);

      return new Uint8Array(decrypted);
    } catch (error) {
      logger.error('Failed to decrypt file:', error);
      throw error;
    }
  }

  /**
   * Encrypt a large file using streaming (for files > 10MB)
   */
  async encryptLargeFile(
    inputUri: string,
    outputUri: string,
    key?: Buffer
  ): Promise<{ key: Buffer; iv: Buffer; tag: Buffer }> {
    try {
      const encryptionKey = key || this.generateKey();
      const iv = this.generateIV();
      
      // Read file info
      const fileInfo = await FileSystem.getInfoAsync(inputUri);
      if (!fileInfo.exists) {
        throw new Error('Input file does not exist');
      }

      // Create cipher
      const cipher = createCipheriv(ALGORITHM, encryptionKey, iv);
      
      // Process file in chunks
      const fileSize = fileInfo.size || 0;
      let processedBytes = 0;
      const encryptedChunks: Uint8Array[] = [];

      while (processedBytes < fileSize) {
        const chunkSize = Math.min(CHUNK_SIZE, fileSize - processedBytes);
        
        // Read chunk
        const chunk = await FileSystem.readAsStringAsync(inputUri, {
          encoding: FileSystem.EncodingType.Base64,
          position: processedBytes,
          length: chunkSize
        });
        
        const chunkBuffer = Buffer.from(chunk, 'base64');
        const encryptedChunk = cipher.update(chunkBuffer);
        encryptedChunks.push(new Uint8Array(encryptedChunk));
        
        processedBytes += chunkSize;
      }

      // Finalize encryption
      const finalChunk = cipher.final();
      if (finalChunk.length > 0) {
        encryptedChunks.push(new Uint8Array(finalChunk));
      }

      // Get authentication tag
      const tag = cipher.getAuthTag();

      // Combine all chunks
      const totalLength = encryptedChunks.reduce((sum, chunk) => sum + chunk.length, 0);
      const encryptedData = new Uint8Array(totalLength);
      let offset = 0;
      
      for (const chunk of encryptedChunks) {
        encryptedData.set(chunk, offset);
        offset += chunk.length;
      }

      // Write encrypted file
      await FileSystem.writeAsStringAsync(
        outputUri,
        Buffer.from(encryptedData).toString('base64'),
        { encoding: FileSystem.EncodingType.Base64 }
      );

      return { key: encryptionKey, iv, tag };
    } catch (error) {
      logger.error('Failed to encrypt large file:', error);
      throw error;
    }
  }

  /**
   * Upload encrypted file to Firebase Storage
   */
  async uploadEncryptedFile(
    fileUri: string,
    fileName: string,
    mimeType: string,
    chatId: string
  ): Promise<EncryptedFile> {
    try {
      const auth = getFirebaseAuth();
      if (!auth.currentUser) {
        throw new Error('User not authenticated');
      }

      // Read file
      const fileData = await FileSystem.readAsStringAsync(fileUri, {
        encoding: FileSystem.EncodingType.Base64
      });
      const fileBuffer = Buffer.from(fileData, 'base64');

      // Encrypt file
      const encryptionResult = await this.encryptFile(new Uint8Array(fileBuffer));

      // Generate unique file name
      const timestamp = Date.now();
      const hashedName = createHash('sha256')
        .update(`${fileName}_${timestamp}`)
        .digest('hex');
      const encryptedFileName = `encrypted_${hashedName}`;

      // Upload to Firebase Storage
      const storage = getFirebaseStorage();
      const storageRef = storage.ref(`chats/${chatId}/media/${encryptedFileName}`);
      
      const metadata = {
        contentType: 'application/octet-stream', // Generic binary type
        customMetadata: {
          originalName: fileName,
          originalType: mimeType,
          encrypted: 'true'
        }
      };

      await storageRef.put(encryptionResult.encryptedData, metadata);
      const downloadUrl = await storageRef.getDownloadURL();

      const result = {
        encryptedUrl: downloadUrl,
        encryptedKey: encryptionResult.key.toString('base64'), // This will be encrypted with Signal Protocol
        metadata: {
          fileName,
          fileSize: fileBuffer.length,
          mimeType,
          iv: encryptionResult.iv.toString('base64'),
          tag: encryptionResult.tag.toString('base64')
        }
      };
      
      // Log successful file upload
      await AuditLogService.getInstance().logEvent(
        'file_uploaded',
        'Encrypted file uploaded successfully',
        {
          userId: auth.currentUser.uid,
          resourceId: encryptedFileName,
          metadata: {
            chatId,
            fileName,
            fileSize: fileBuffer.length,
            mimeType,
            encrypted: true
          }
        }
      );
      
      return result;
    } catch (error) {
      logger.error('Failed to upload encrypted file:', error);
      
      // Log file upload failure
      await AuditLogService.getInstance().logEvent(
        'file_upload_failed',
        'Failed to upload encrypted file',
        {
          userId: getFirebaseAuth().currentUser?.uid,
          metadata: {
            chatId,
            fileName,
            mimeType,
            error: error.message
          }
        }
      );
      
      throw error;
    }
  }

  /**
   * Download and decrypt file from Firebase Storage
   */
  async downloadAndDecryptFile(
    encryptedUrl: string,
    key: string, // Base64
    iv: string, // Base64
    tag: string, // Base64
    outputUri?: string
  ): Promise<string> {
    try {
      // Download encrypted file
      const response = await fetch(encryptedUrl);
      if (!response.ok) {
        throw new Error('Failed to download encrypted file');
      }

      const encryptedData = await response.arrayBuffer();
      
      // Decrypt file
      const decryptedData = await this.decryptFile(
        new Uint8Array(encryptedData),
        Buffer.from(key, 'base64'),
        Buffer.from(iv, 'base64'),
        Buffer.from(tag, 'base64')
      );

      // Generate output path if not provided
      const finalOutputUri = outputUri || 
        `${FileSystem.cacheDirectory}decrypted_${Date.now()}_file`;

      // Save decrypted file
      await FileSystem.writeAsStringAsync(
        finalOutputUri,
        Buffer.from(decryptedData).toString('base64'),
        { encoding: FileSystem.EncodingType.Base64 }
      );

      return finalOutputUri;
    } catch (error) {
      logger.error('Failed to download and decrypt file:', error);
      throw error;
    }
  }

  /**
   * Delete encrypted file from Firebase Storage
   */
  async deleteEncryptedFile(encryptedUrl: string): Promise<void> {
    try {
      const storage = getFirebaseStorage();
      const fileRef = storage.refFromURL(encryptedUrl);
      await fileRef.delete();
    } catch (error) {
      logger.error('Failed to delete encrypted file:', error);
      // Don't throw - file might already be deleted
    }
  }

  /**
   * Generate a thumbnail for an image (encrypted)
   */
  async generateEncryptedThumbnail(
    imageUri: string,
    maxWidth: number = 200,
    maxHeight: number = 200
  ): Promise<FileEncryptionResult> {
    try {
      // Check if the file is an image
      const fileInfo = await FileSystem.getInfoAsync(imageUri);
      if (!fileInfo.exists) {
        throw new Error('File does not exist');
      }

      // Resize image to create thumbnail
      const manipulatedImage = await ImageManipulator.manipulateAsync(
        imageUri,
        [{ resize: { width: maxWidth, height: maxHeight } }],
        { compress: 0.7, format: ImageManipulator.SaveFormat.JPEG, base64: true }
      );

      if (!manipulatedImage.base64) {
        throw new Error('Failed to generate thumbnail base64');
      }

      // Convert base64 to Uint8Array
      const thumbnailBuffer = Buffer.from(manipulatedImage.base64, 'base64');
      const thumbnailData = new Uint8Array(thumbnailBuffer);

      // Encrypt the thumbnail
      const encryptionResult = await this.encryptFile(thumbnailData);

      // Update metadata to indicate it's a thumbnail
      encryptionResult.encryptedFilename = `thumb_${encryptionResult.encryptedFilename}`;

      return encryptionResult;
    } catch (error) {
      logger.error('Failed to generate encrypted thumbnail:', error);
      throw error;
    }
  }

  /**
   * Generate a thumbnail for a video (encrypted)
   */
  async generateEncryptedVideoThumbnail(
    videoUri: string,
    maxWidth: number = 200,
    maxHeight: number = 200
  ): Promise<FileEncryptionResult | null> {
    try {
      // Video thumbnail generation requires expo-av or similar
      // For now, return null to indicate no thumbnail available
      // In production, you would:
      // 1. Use expo-av to extract a frame from the video
      // 2. Convert the frame to an image
      // 3. Resize and encrypt it like an image thumbnail
      logger.debug('Video thumbnail generation not yet implemented');
      return null;
    } catch (error) {
      logger.error('Failed to generate video thumbnail:', error);
      return null;
    }
  }

  /**
   * Calculate file hash (for deduplication)
   */
  calculateFileHash(fileData: Uint8Array): string {
    const hash = createHash('sha256');
    hash.update(Buffer.from(fileData));
    return hash.digest('hex');
  }

  /**
   * Get MIME type from file URI
   */
  private getMimeTypeFromUri(uri: string): string {
    const extension = uri.split('.').pop()?.toLowerCase() || '';
    
    const mimeTypes: { [key: string]: string } = {
      // Images
      'jpg': 'image/jpeg',
      'jpeg': 'image/jpeg',
      'png': 'image/png',
      'gif': 'image/gif',
      'webp': 'image/webp',
      'bmp': 'image/bmp',
      'svg': 'image/svg+xml',
      
      // Videos
      'mp4': 'video/mp4',
      'mov': 'video/quicktime',
      'avi': 'video/x-msvideo',
      'mkv': 'video/x-matroska',
      'webm': 'video/webm',
      
      // Audio
      'mp3': 'audio/mpeg',
      'wav': 'audio/wav',
      'ogg': 'audio/ogg',
      'm4a': 'audio/mp4',
      'aac': 'audio/aac',
      
      // Documents
      'pdf': 'application/pdf',
      'doc': 'application/msword',
      'docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'txt': 'text/plain',
      'json': 'application/json',
    };
    
    return mimeTypes[extension] || 'application/octet-stream';
  }

  /**
   * Validate file size and type before encryption
   */
  async validateFile(
    fileUri: string,
    maxSizeMB: number = 100,
    allowedMimeTypes?: string[]
  ): Promise<{ isValid: boolean; error?: string }> {
    try {
      const fileInfo = await FileSystem.getInfoAsync(fileUri);
      
      if (!fileInfo.exists) {
        return { isValid: false, error: 'File does not exist' };
      }

      // Check file size
      const fileSizeMB = (fileInfo.size || 0) / (1024 * 1024);
      if (fileSizeMB > maxSizeMB) {
        return { 
          isValid: false, 
          error: `File too large. Maximum size is ${maxSizeMB}MB` 
        };
      }

      // Check mime type if allowed types are specified
      if (allowedMimeTypes && allowedMimeTypes.length > 0) {
        const mimeType = this.getMimeTypeFromUri(fileUri);
        if (!allowedMimeTypes.includes(mimeType)) {
          return {
            isValid: false,
            error: `File type not allowed. Allowed types: ${allowedMimeTypes.join(', ')}`
          };
        }
      }

      return { isValid: true };
    } catch (error) {
      logger.error('Failed to validate file:', error);
      return { isValid: false, error: 'Failed to validate file' };
    }
  }
}

export default MediaEncryptionService.getInstance();
