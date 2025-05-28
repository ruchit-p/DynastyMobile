import { Platform } from 'react-native';
import * as FileSystem from 'expo-file-system';
import * as Crypto from 'expo-crypto';
import { Buffer } from 'buffer';
import Libsignal from '../../specs/NativeLibsignal';
import Libsignal from '../../specs/NativeLibsignal';

/**
 * Signal Protocol Attachment Encryption
 * 
 * Attachments in Signal are encrypted using AES-256 in CBC mode with PKCS#7 padding.
 * The encrypted attachment includes:
 * - AES key (32 bytes)
 * - HMAC key (32 bytes) 
 * - IV (16 bytes)
 * - Encrypted data
 * - HMAC (32 bytes)
 */

export interface EncryptedAttachment {
  data: string; // Base64 encoded encrypted data
  key: string; // Base64 encoded concatenated keys (AES key + HMAC key)
  digest: string; // Base64 encoded HMAC digest
  size: number; // Original file size
  fileName?: string;
  contentType?: string;
}

export interface AttachmentPointer {
  id?: string; // Server-assigned attachment ID
  contentType?: string;
  key: string; // Base64 encoded key material
  size: number;
  thumbnail?: string; // Base64 encoded thumbnail
  digest: string; // Base64 encoded digest
  fileName?: string;
  flags?: number;
  width?: number;
  height?: number;
  caption?: string;
  blurHash?: string;
}

export class AttachmentCrypto {
  private static readonly KEY_SIZE = 64; // 32 bytes AES + 32 bytes HMAC
  private static readonly IV_SIZE = 16;
  
  /**
   * Encrypt an attachment file
   * @param fileUri The URI of the file to encrypt
   * @param contentType The MIME type of the file
   * @returns Encrypted attachment data
   */
  static async encryptAttachment(
    fileUri: string,
    contentType?: string
  ): Promise<EncryptedAttachment> {
    try {
      // Read the file
      const fileInfo = await FileSystem.getInfoAsync(fileUri);
      if (!fileInfo.exists) {
        throw new Error('File does not exist');
      }
      
      // Read file as base64
      const fileBase64 = await FileSystem.readAsStringAsync(fileUri, {
        encoding: FileSystem.EncodingType.Base64,
      });
      
      // Convert to buffer
      const fileBuffer = Buffer.from(fileBase64, 'base64');
      
      // Generate keys
      const keys = await this.generateAttachmentKeys();
      const aesKey = keys.slice(0, 32);
      const hmacKey = keys.slice(32, 64);
      const iv = await this.generateIV();
      
      // Encrypt the data
      // Note: React Native doesn't have built-in AES-CBC, so we need to use a native module
      // For now, we'll use a placeholder that you'll need to implement
      const encryptedData = await this.aesEncrypt(fileBuffer, aesKey, iv);
      
      // Calculate HMAC
      const hmac = await this.calculateHMAC(encryptedData, hmacKey);
      
      // Get filename from URI
      const fileName = fileUri.split('/').pop();
      
      return {
        data: encryptedData.toString('base64'),
        key: keys.toString('base64'),
        digest: hmac.toString('base64'),
        size: fileInfo.size || 0,
        fileName,
        contentType,
      };
    } catch (error) {
      console.error('Failed to encrypt attachment:', error);
      throw error;
    }
  }
  
  /**
   * Decrypt an attachment
   * @param encryptedData Base64 encoded encrypted data
   * @param key Base64 encoded key material
   * @param digest Base64 encoded HMAC digest
   * @returns Decrypted data as base64
   */
  static async decryptAttachment(
    encryptedData: string,
    key: string,
    digest: string
  ): Promise<string> {
    try {
      // Decode from base64
      const dataBuffer = Buffer.from(encryptedData, 'base64');
      const keyBuffer = Buffer.from(key, 'base64');
      const digestBuffer = Buffer.from(digest, 'base64');
      
      // Split keys
      const aesKey = keyBuffer.slice(0, 32);
      const hmacKey = keyBuffer.slice(32, 64);
      
      // Extract IV (first 16 bytes of encrypted data)
      const iv = dataBuffer.slice(0, 16);
      const ciphertext = dataBuffer.slice(16);
      
      // Verify HMAC
      const calculatedHmac = await this.calculateHMAC(dataBuffer, hmacKey);
      if (!calculatedHmac.equals(digestBuffer)) {
        throw new Error('HMAC verification failed');
      }
      
      // Decrypt
      const decrypted = await this.aesDecrypt(ciphertext, aesKey, iv);
      
      return decrypted.toString('base64');
    } catch (error) {
      console.error('Failed to decrypt attachment:', error);
      throw error;
    }
  }
  
  /**
   * Create an attachment pointer for sending to server
   * @param encrypted The encrypted attachment
   * @param attachmentId Server-assigned ID (after upload)
   * @returns Attachment pointer to include in message
   */
  static createAttachmentPointer(
    encrypted: EncryptedAttachment,
    attachmentId?: string
  ): AttachmentPointer {
    return {
      id: attachmentId,
      contentType: encrypted.contentType,
      key: encrypted.key,
      size: encrypted.size,
      digest: encrypted.digest,
      fileName: encrypted.fileName,
    };
  }
  
  /**
   * Generate thumbnail for image/video attachments
   * @param fileUri The URI of the media file
   * @param maxSize Maximum dimension for thumbnail
   * @returns Base64 encoded thumbnail
   */
  static async generateThumbnail(
    fileUri: string,
    maxSize: number = 150
  ): Promise<string | undefined> {
    // This would need to be implemented using expo-image-manipulator
    // or a native module for video thumbnails
    console.warn('Thumbnail generation not implemented');
    return undefined;
  }
  
  // Private helper methods
  
  private static async generateAttachmentKeys(): Promise<Buffer> {
    // Use native module to generate secure random keys
    const keyBase64 = await Libsignal.generateAttachmentKey();
    return Buffer.from(keyBase64, 'base64');
  }
  
  private static async generateIV(): Promise<Buffer> {
    // Use native module to generate secure random IV
    const ivBase64 = await Libsignal.generateIV();
    return Buffer.from(ivBase64, 'base64');
  }
  
  private static async calculateHMAC(
    data: Buffer,
    key: Buffer
  ): Promise<Buffer> {
    // Use native module for HMAC-SHA256
    const hmacBase64 = await Libsignal.calculateHMAC(
      data.toString('base64'),
      key.toString('base64')
    );
    
    return Buffer.from(hmacBase64, 'base64');
  }
  
  /**
   * AES-256-CBC encryption using native module
   */
  private static async aesEncrypt(
    data: Buffer,
    key: Buffer,
    iv: Buffer
  ): Promise<Buffer> {
    // Use the native module for AES encryption
    const encrypted = await Libsignal.encryptAttachment(
      data.toString('base64'),
      key.toString('base64'),
      iv.toString('base64')
    );
    
    return Buffer.from(encrypted, 'base64');
  }
  
  /**
   * AES-256-CBC decryption using native module
   */
  private static async aesDecrypt(
    data: Buffer,
    key: Buffer,
    iv: Buffer
  ): Promise<Buffer> {
    // Use the native module for AES decryption
    const decrypted = await Libsignal.decryptAttachment(
      data.toString('base64'),
      key.toString('base64'),
      iv.toString('base64')
    );
    
    return Buffer.from(decrypted, 'base64');
  }
}

/**
 * Helper class for handling attachment uploads/downloads
 */
export class AttachmentService {
  private baseUrl: string;
  
  constructor(baseUrl: string) {
    this.baseUrl = baseUrl;
  }
  
  /**
   * Upload an encrypted attachment to the server
   * @param encrypted The encrypted attachment
   * @returns Attachment ID from server
   */
  async uploadAttachment(encrypted: EncryptedAttachment): Promise<string> {
    // Create form data
    const formData = new FormData();
    
    // Add the encrypted file as a blob
    const blob = {
      uri: `data:application/octet-stream;base64,${encrypted.data}`,
      type: 'application/octet-stream',
      name: encrypted.fileName || 'attachment',
    } as any;
    
    formData.append('file', blob);
    formData.append('contentType', encrypted.contentType || 'application/octet-stream');
    formData.append('digest', encrypted.digest);
    
    // Upload to server
    const response = await fetch(`${this.baseUrl}/attachments`, {
      method: 'POST',
      body: formData,
      headers: {
        // Add authentication headers
      },
    });
    
    if (!response.ok) {
      throw new Error(`Upload failed: ${response.status}`);
    }
    
    const result = await response.json();
    return result.id;
  }
  
  /**
   * Download an encrypted attachment from the server
   * @param attachmentId The attachment ID
   * @returns Base64 encoded encrypted data
   */
  async downloadAttachment(attachmentId: string): Promise<string> {
    const response = await fetch(`${this.baseUrl}/attachments/${attachmentId}`, {
      headers: {
        // Add authentication headers
      },
    });
    
    if (!response.ok) {
      throw new Error(`Download failed: ${response.status}`);
    }
    
    const blob = await response.blob();
    
    // Convert blob to base64
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const base64 = reader.result as string;
        // Remove data URL prefix
        const base64Data = base64.split(',')[1];
        resolve(base64Data);
      };
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  }
}

/**
 * Example usage for sending an attachment
 */
export async function sendEncryptedAttachment(
  fileUri: string,
  contentType: string,
  recipientId: string,
  deviceId: number
): Promise<void> {
  try {
    // 1. Encrypt the attachment
    const encrypted = await AttachmentCrypto.encryptAttachment(fileUri, contentType);
    
    // 2. Upload to server
    const attachmentService = new AttachmentService('https://api.dynastyapp.com');
    const attachmentId = await attachmentService.uploadAttachment(encrypted);
    
    // 3. Create attachment pointer
    const pointer = AttachmentCrypto.createAttachmentPointer(encrypted, attachmentId);
    
    // 4. Include pointer in your encrypted message
    const message = {
      text: '',
      attachments: [pointer],
    };
    
    // 5. Encrypt and send the message using Signal Protocol
    // (This would use the existing message encryption)
    
    console.log('Attachment sent successfully');
  } catch (error) {
    console.error('Failed to send attachment:', error);
    throw error;
  }
}

/**
 * Example usage for receiving an attachment
 */
export async function receiveEncryptedAttachment(
  pointer: AttachmentPointer
): Promise<string> {
  try {
    // 1. Download encrypted data from server
    const attachmentService = new AttachmentService('https://api.dynastyapp.com');
    const encryptedData = await attachmentService.downloadAttachment(pointer.id!);
    
    // 2. Decrypt the attachment
    const decryptedBase64 = await AttachmentCrypto.decryptAttachment(
      encryptedData,
      pointer.key,
      pointer.digest
    );
    
    // 3. Save to local file system
    const localUri = FileSystem.documentDirectory + (pointer.fileName || 'attachment');
    await FileSystem.writeAsStringAsync(localUri, decryptedBase64, {
      encoding: FileSystem.EncodingType.Base64,
    });
    
    return localUri;
  } catch (error) {
    console.error('Failed to receive attachment:', error);
    throw error;
  }
}
