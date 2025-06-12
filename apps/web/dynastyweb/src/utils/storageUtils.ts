// Storage utilities for Dynasty Web App
// Unified interface for working with different storage providers (Firebase, R2, B2)

/**
 * Storage provider types supported by Dynasty
 */
export type StorageProvider = 'firebase' | 'r2' | 'b2';

/**
 * Storage URL validation and parsing utilities
 */
export class StorageUtils {
  /**
   * Validates if a URL is from an allowed storage domain
   */
  static isValidStorageUrl(url: string): boolean {
    try {
      const parsedUrl = new URL(url);

      // Must be HTTPS
      if (parsedUrl.protocol !== 'https:') {
        return false;
      }

      const hostname = parsedUrl.hostname.toLowerCase();

      // Check for known storage domains
      const allowedPatterns = [
        // Firebase Storage domains
        'firebasestorage.googleapis.com',
        'storage.googleapis.com',
        '.firebasestorage.app',

        // R2 (Cloudflare) domains
        '.r2.cloudflarestorage.com',
        '.r2.dev',
        'cloudflare-ipfs.com',
        'cloudflarestorage.com',

        // B2 (Backblaze) domains
        's3.us-west-004.backblazeb2.com',
        's3.us-west-002.backblazeb2.com',
        's3.us-east-005.backblazeb2.com',
        's3.eu-central-003.backblazeb2.com',
        'backblazeb2.com',
        '.b2-api.com',
        '.b2.com',

        // S3-compatible URLs (for B2)
        'amazonaws.com',
      ];

      // Check if hostname matches any allowed pattern
      return allowedPatterns.some(pattern => {
        if (pattern.startsWith('.')) {
          // Match subdomain pattern
          return hostname.endsWith(pattern.substring(1)) || hostname === pattern.substring(1);
        }
        // Exact match or contains
        return hostname === pattern || hostname.includes(pattern);
      });
    } catch {
      return false;
    }
  }

  /**
   * Detect storage provider from URL
   */
  static detectStorageProvider(url: string): StorageProvider | null {
    try {
      const parsedUrl = new URL(url);
      const hostname = parsedUrl.hostname.toLowerCase();

      // Firebase Storage
      if (hostname.includes('firebasestorage') || hostname.includes('storage.googleapis.com')) {
        return 'firebase';
      }

      // R2 (Cloudflare)
      if (hostname.includes('r2.') || hostname.includes('cloudflarestorage.com')) {
        return 'r2';
      }

      // B2 (Backblaze)
      if (
        hostname.includes('backblazeb2.com') ||
        hostname.includes('b2-api.com') ||
        hostname.includes('b2.com') ||
        hostname.includes('us-west-004') ||
        hostname.includes('us-west-002') ||
        hostname.includes('us-east-005') ||
        hostname.includes('eu-central-003')
      ) {
        return 'b2';
      }

      return null;
    } catch {
      return null;
    }
  }

  /**
   * Generate optimized URL for Next.js Image component
   */
  static getOptimizedImageUrl(
    url: string,
    options?: {
      width?: number;
      height?: number;
      quality?: number;
      format?: 'webp' | 'avif' | 'jpeg' | 'png';
    }
  ): string {
    const provider = this.detectStorageProvider(url);

    // For B2 and R2, we can use query parameters for some optimizations
    if (provider === 'b2' || provider === 'r2') {
      const urlObj = new URL(url);

      // Add optimization parameters if supported
      if (options?.width) {
        urlObj.searchParams.set('w', options.width.toString());
      }
      if (options?.height) {
        urlObj.searchParams.set('h', options.height.toString());
      }
      if (options?.quality && options.quality < 100) {
        urlObj.searchParams.set('q', options.quality.toString());
      }

      return urlObj.toString();
    }

    // For Firebase Storage, return as-is (Next.js will handle optimization)
    return url;
  }

  /**
   * Extract file key/path from storage URL
   */
  static extractFileKey(url: string): string | null {
    try {
      const parsedUrl = new URL(url);
      const provider = this.detectStorageProvider(url);

      switch (provider) {
        case 'firebase':
          // Firebase: /v0/b/{bucket}/o/{path}
          const firebasePath = parsedUrl.pathname.match(/\/o\/(.+)$/);
          return firebasePath ? decodeURIComponent(firebasePath[1]) : null;

        case 'r2':
          // R2: Usually /{bucket}/{key} or direct key
          return parsedUrl.pathname.substring(1); // Remove leading /

        case 'b2':
          // B2: /{bucket}/{key} format
          const pathParts = parsedUrl.pathname.substring(1).split('/');
          return pathParts.length > 1 ? pathParts.slice(1).join('/') : pathParts[0];

        default:
          return parsedUrl.pathname.substring(1);
      }
    } catch {
      return null;
    }
  }

  /**
   * Generate thumbnail URL if supported by provider
   */
  static getThumbnailUrl(url: string, size: 'small' | 'medium' | 'large' = 'medium'): string {
    const provider = this.detectStorageProvider(url);

    // Size mappings
    const sizeMap = {
      small: { width: 150, height: 150 },
      medium: { width: 300, height: 300 },
      large: { width: 600, height: 600 },
    };

    const { width, height } = sizeMap[size];

    if (provider === 'b2' || provider === 'r2') {
      // For B2/R2, try to use query parameters for resizing
      return this.getOptimizedImageUrl(url, { width, height, quality: 80 });
    }

    // For Firebase, return original (could be enhanced with Cloud Functions)
    return url;
  }

  /**
   * Check if URL supports direct manipulation (resizing, format conversion)
   */
  static supportsDirectManipulation(url: string): boolean {
    const provider = this.detectStorageProvider(url);
    return provider === 'b2' || provider === 'r2';
  }

  /**
   * Generate signed URL for secure access (if needed)
   */
  static async getSignedUrl(url: string, expiresInMinutes: number = 60): Promise<string> {
    const provider = this.detectStorageProvider(url);

    // For Firebase, URLs are already signed if needed
    if (provider === 'firebase') {
      return url;
    }

    // For B2/R2, we might need to generate signed URLs for private content
    // This would typically be done through the backend
    // Note: expiresInMinutes would be used when implementing actual signed URL generation
    // For now, return the original URL assuming it's public or already signed
    console.debug(
      `Signed URL requested for ${provider} with ${expiresInMinutes} minutes expiration`
    );
    return url;
  }

  /**
   * Parse metadata from storage URL if available
   */
  static parseUrlMetadata(url: string): {
    provider: StorageProvider | null;
    bucket?: string;
    key?: string;
    region?: string;
    isPublic?: boolean;
    isSigned?: boolean;
  } {
    try {
      const parsedUrl = new URL(url);
      const provider = this.detectStorageProvider(url);
      const hostname = parsedUrl.hostname.toLowerCase();

      let bucket: string | undefined;
      let key: string | undefined;
      let region: string | undefined;
      const isPublic = true; // Default assumption
      const isSigned =
        parsedUrl.searchParams.has('X-Amz-Signature') ||
        parsedUrl.searchParams.has('Signature') ||
        parsedUrl.searchParams.has('token');

      switch (provider) {
        case 'firebase':
          const firebaseMatch = hostname.match(/^(.+)\.firebasestorage\.googleapis\.com$/);
          bucket = firebaseMatch ? firebaseMatch[1] : undefined;
          key = this.extractFileKey(url) || undefined;
          break;

        case 'r2':
          // R2 format: https://{accountId}.r2.cloudflarestorage.com/{bucket}/{key}
          const r2Match = hostname.match(/^(.+)\.r2\.cloudflarestorage\.com$/);
          if (r2Match) {
            const pathParts = parsedUrl.pathname.substring(1).split('/');
            bucket = pathParts[0];
            key = pathParts.slice(1).join('/');
          }
          break;

        case 'b2':
          // B2 format: https://s3.{region}.backblazeb2.com/{bucket}/{key}
          const b2Match = hostname.match(/^s3\.(.+)\.backblazeb2\.com$/);
          if (b2Match) {
            region = b2Match[1];
            const pathParts = parsedUrl.pathname.substring(1).split('/');
            bucket = pathParts[0];
            key = pathParts.slice(1).join('/');
          }
          break;
      }

      return {
        provider,
        bucket,
        key,
        region,
        isPublic,
        isSigned,
      };
    } catch {
      return { provider: null };
    }
  }

  /**
   * Validate file type for upload
   */
  static isValidFileType(file: File, allowedTypes?: string[]): boolean {
    if (!allowedTypes) {
      // Default allowed types - be restrictive for security
      allowedTypes = [
        'image/jpeg',
        'image/png',
        'image/gif',
        'image/webp',
        'video/mp4',
        'video/webm',
        'audio/mp3',
        'audio/wav',
        'audio/ogg',
        'application/pdf',
        'text/plain',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      ];
    }

    return allowedTypes.includes(file.type);
  }

  /**
   * Get maximum file size for provider
   */
  static getMaxFileSize(provider: StorageProvider): number {
    switch (provider) {
      case 'firebase':
        return 32 * 1024 * 1024; // 32MB (Firebase Storage limit for web)
      case 'r2':
        return 5 * 1024 * 1024 * 1024; // 5GB (Cloudflare R2 limit)
      case 'b2':
        return 10 * 1024 * 1024 * 1024 * 1024; // 10TB (Backblaze B2 limit, but we'll use practical limit)
      default:
        return 100 * 1024 * 1024; // 100MB default
    }
  }

  /**
   * Format file size for display
   */
  static formatFileSize(bytes: number): string {
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    let size = bytes;
    let unitIndex = 0;

    while (size >= 1024 && unitIndex < units.length - 1) {
      size /= 1024;
      unitIndex++;
    }

    return `${size.toFixed(unitIndex > 0 ? 1 : 0)} ${units[unitIndex]}`;
  }

  /**
   * Get file icon based on MIME type
   */
  static getFileIcon(mimeType?: string): string {
    if (!mimeType) return '📄';

    if (mimeType.startsWith('image/')) return '🖼️';
    if (mimeType.startsWith('video/')) return '🎥';
    if (mimeType.startsWith('audio/')) return '🎵';
    if (mimeType.includes('pdf')) return '📑';
    if (mimeType.includes('word') || mimeType.includes('document')) return '📝';
    if (mimeType.includes('sheet') || mimeType.includes('excel')) return '📊';
    if (mimeType.includes('presentation') || mimeType.includes('powerpoint')) return '📈';
    if (mimeType.includes('zip') || mimeType.includes('archive')) return '🗜️';
    if (mimeType.includes('text')) return '📝';
    if (mimeType.includes('json') || mimeType.includes('xml')) return '📋';

    return '📄';
  }

  /**
   * Check if file is an image that can be displayed
   */
  static isDisplayableImage(mimeType: string): boolean {
    return [
      'image/jpeg',
      'image/jpg',
      'image/png',
      'image/gif',
      'image/webp',
      'image/svg+xml',
    ].includes(mimeType.toLowerCase());
  }

  /**
   * Check if file is a video that can be played
   */
  static isPlayableVideo(mimeType: string): boolean {
    return ['video/mp4', 'video/webm', 'video/ogg'].includes(mimeType.toLowerCase());
  }

  /**
   * Check if file is audio that can be played
   */
  static isPlayableAudio(mimeType: string): boolean {
    return [
      'audio/mp3',
      'audio/mpeg',
      'audio/wav',
      'audio/ogg',
      'audio/aac',
      'audio/flac',
    ].includes(mimeType.toLowerCase());
  }

  /**
   * Generate cache key for storage operations
   */
  static generateCacheKey(operation: string, provider: StorageProvider, path: string): string {
    return `storage:${provider}:${operation}:${btoa(path).replace(/[^a-zA-Z0-9]/g, '')}`;
  }

  /**
   * Estimate upload time based on file size and provider
   */
  static estimateUploadTime(fileSize: number, provider: StorageProvider): number {
    // Rough estimates in seconds based on provider performance
    const speedMbps = {
      firebase: 5, // Conservative estimate
      r2: 10, // Good performance
      b2: 8, // Good B2 performance
    };

    const fileSizeMb = fileSize / (1024 * 1024);
    const speedMbPerSecond = speedMbps[provider] / 8; // Convert Mbps to MB/s

    return Math.ceil(fileSizeMb / speedMbPerSecond);
  }
}

/**
 * Storage configuration utilities
 */
export class StorageConfig {
  /**
   * Get recommended storage provider for file type
   */
  static getRecommendedProvider(file: File): StorageProvider {
    const fileSize = file.size;
    const mimeType = file.type;

    // Large files -> B2 (cost effective for large storage)
    if (fileSize > 100 * 1024 * 1024) {
      // > 100MB
      return 'b2';
    }

    // Media files -> R2 (good CDN performance)
    if (mimeType.startsWith('image/') || mimeType.startsWith('video/')) {
      return 'r2';
    }

    // Small files or development -> Firebase
    return 'firebase';
  }

  /**
   * Get upload configuration for provider
   */
  static getUploadConfig(provider: StorageProvider) {
    return {
      firebase: {
        chunkSize: 256 * 1024, // 256KB chunks
        maxRetries: 3,
        timeout: 60000, // 1 minute
        concurrency: 1,
      },
      r2: {
        chunkSize: 5 * 1024 * 1024, // 5MB chunks
        maxRetries: 5,
        timeout: 300000, // 5 minutes
        concurrency: 3,
      },
      b2: {
        chunkSize: 10 * 1024 * 1024, // 10MB chunks (B2 minimum)
        maxRetries: 5,
        timeout: 600000, // 10 minutes
        concurrency: 2,
      },
    }[provider];
  }
}

// Export utility functions as default
export default StorageUtils;
