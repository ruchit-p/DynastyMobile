import { b2MediaService } from '@/services/B2MediaService';
import { errorHandler, ErrorSeverity } from '@/services/ErrorHandlingService';

interface OptimizedImage {
  original: string;
  optimized: {
    small: string; // 640w
    medium: string; // 1080w
    large: string; // 1920w
    xlarge: string; // 2560w
  };
  placeholder: string;
}

interface ImageOptimizationOptions {
  basePath?: string;
  quality?: number;
  sizes?: Array<{ width: number; suffix: string }>;
}

/**
 * Service for optimizing landing page images
 * Integrates with existing B2MediaService for cloud storage
 */
class LandingImageOptimizer {
  private static instance: LandingImageOptimizer;
  private readonly defaultSizes = [
    { width: 640, suffix: 'small' },
    { width: 1080, suffix: 'medium' },
    { width: 1920, suffix: 'large' },
    { width: 2560, suffix: 'xlarge' },
  ];

  private constructor() {}

  static getInstance(): LandingImageOptimizer {
    if (!LandingImageOptimizer.instance) {
      LandingImageOptimizer.instance = new LandingImageOptimizer();
    }
    return LandingImageOptimizer.instance;
  }

  /**
   * Upload and optimize landing images to R2/B2/Firebase
   */
  async optimizeLandingImages(
    files: File[],
    options?: ImageOptimizationOptions,
    callbacks?: {
      onProgress?: (current: number, total: number) => void;
      onError?: (error: Error, fileName: string) => void;
    }
  ): Promise<Map<string, OptimizedImage>> {
    const results = new Map<string, OptimizedImage>();
    const basePath = options?.basePath || 'landing/slideshow';
    const quality = options?.quality || 0.85;
    const sizes = options?.sizes || this.defaultSizes;

    for (let i = 0; i < files.length; i++) {
      try {
        const file = files[i];
        const baseName = file.name.replace(/\.[^/.]+$/, '');

        // Validate file
        if (!this.isValidImageFile(file)) {
          throw new Error(`Invalid image file: ${file.name}`);
        }

        // Generate optimized versions
        const optimizedUrls: Record<string, string> = {};

        for (const size of sizes) {
          try {
            const compressed = await b2MediaService.compressImage(file, {
              maxWidth: size.width,
              maxHeight: size.width, // Maintain aspect ratio
              quality,
            });

            const path = `${basePath}/${baseName}-${size.width}w.jpg`;
            const url = await this.uploadWithRetry(compressed, path, {
              type: 'landing-slideshow',
              size: size.suffix,
              originalName: file.name,
              width: size.width.toString(),
            });

            optimizedUrls[size.suffix] = url;
          } catch (error) {
            errorHandler.handleError(error, ErrorSeverity.MEDIUM, {
              action: 'optimize-image-size',
              fileName: file.name,
              size: size.suffix,
            });
            // Continue with other sizes even if one fails
          }
        }

        // Generate placeholder
        const placeholder = await this.generatePlaceholder(file);

        results.set(baseName, {
          original: URL.createObjectURL(file),
          optimized: optimizedUrls as OptimizedImage['optimized'],
          placeholder,
        });

        callbacks?.onProgress?.(i + 1, files.length);
      } catch (error) {
        const err = error as Error;
        errorHandler.handleError(err, ErrorSeverity.HIGH, {
          action: 'optimize-landing-image',
          fileName: files[i].name,
        });
        callbacks?.onError?.(err, files[i].name);
      }
    }

    return results;
  }

  /**
   * Generate a base64 blur placeholder for an image
   */
  private async generatePlaceholder(file: File): Promise<string> {
    return new Promise(resolve => {
      const img = new Image();
      const objectUrl = URL.createObjectURL(file);
      img.src = objectUrl;

      img.onload = () => {
        try {
          const canvas = document.createElement('canvas');
          const size = 10; // Very small for blur placeholder
          canvas.width = size;
          canvas.height = Math.round((size * img.height) / img.width);

          const ctx = canvas.getContext('2d');
          if (!ctx) {
            resolve('');
            return;
          }

          // Draw and blur
          ctx.filter = 'blur(2px)';
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

          // Convert to base64
          resolve(canvas.toDataURL('image/jpeg', 0.6));
        } catch (error) {
          errorHandler.handleError(error, ErrorSeverity.LOW, {
            action: 'generate-placeholder',
            fileName: file.name,
          });
          resolve('');
        } finally {
          URL.revokeObjectURL(objectUrl);
        }
      };

      img.onerror = () => {
        URL.revokeObjectURL(objectUrl);
        resolve('');
      };
    });
  }

  /**
   * Upload with retry logic
   */
  private async uploadWithRetry(
    blob: Blob,
    path: string,
    metadata: Record<string, string>,
    maxRetries = 3
  ): Promise<string> {
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        // Note: This is a simplified version. The actual implementation
        // would need to properly integrate with B2MediaService's internal methods
        return await (
          b2MediaService as unknown as {
            uploadToStorage: (
              blob: Blob,
              path: string,
              mimeType: string,
              metadata: Record<string, string>
            ) => Promise<string>;
          }
        ).uploadToStorage(blob, path, 'image/jpeg', metadata);
      } catch (error) {
        lastError = error as Error;
        if (attempt < maxRetries) {
          // Exponential backoff
          await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt) * 1000));
        }
      }
    }

    throw lastError || new Error('Upload failed after retries');
  }

  /**
   * Validate image file
   */
  private isValidImageFile(file: File): boolean {
    const validTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
    const maxSize = 50 * 1024 * 1024; // 50MB

    if (!validTypes.includes(file.type)) {
      return false;
    }

    if (file.size > maxSize) {
      return false;
    }

    return true;
  }

  /**
   * Generate export configuration for optimized images
   */
  generateExportConfig(results: Map<string, OptimizedImage>): string {
    const config = Array.from(results.entries()).map(([name, data]) => ({
      name,
      urls: data.optimized,
      placeholder: data.placeholder,
    }));

    return `// Auto-generated image configuration
export const optimizedLandingImages = ${JSON.stringify(config, null, 2)} as const;

export type LandingImageConfig = typeof optimizedLandingImages[number];
`;
  }
}

export const landingImageOptimizer = LandingImageOptimizer.getInstance();
