# Dynasty Website Image Optimization - Production Review

## Architecture Analysis

After reviewing your codebase, I've identified that my initial implementation doesn't align with your architecture. Here's what I found:

### Current Architecture

- **Storage**: Cloud-first with R2/B2/Firebase, not local files
- **Compression**: Runtime compression in `mediaUtils.ts` and `R2MediaService.ts`
- **Framework**: Next.js with built-in Image component (already in use!)
- **Code Style**: TypeScript with proper error handling
- **Security**: Strict CSP policies
- **Dependencies**: No Sharp or build-time optimization tools

### Issues with Initial Implementation

1. ❌ JavaScript instead of TypeScript
2. ❌ Local file optimization doesn't fit cloud architecture
3. ❌ Introduces new dependency (Sharp) unnecessarily
4. ❌ Doesn't leverage existing utilities
5. ❌ Security considerations not addressed

## Recommended Production-Ready Solution

### Option 1: Optimize with Existing Infrastructure (Recommended)

```typescript
// src/utils/landingImageOptimizer.ts
import { r2MediaService } from '@/services/R2MediaService';
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

class LandingImageOptimizer {
  private static instance: LandingImageOptimizer;

  static getInstance(): LandingImageOptimizer {
    if (!LandingImageOptimizer.instance) {
      LandingImageOptimizer.instance = new LandingImageOptimizer();
    }
    return LandingImageOptimizer.instance;
  }

  /**
   * Upload and optimize landing images to R2
   */
  async optimizeLandingImages(
    files: File[],
    onProgress?: (current: number, total: number) => void
  ): Promise<Map<string, OptimizedImage>> {
    const results = new Map<string, OptimizedImage>();

    for (let i = 0; i < files.length; i++) {
      try {
        const file = files[i];
        const baseName = file.name.replace(/\.[^/.]+$/, '');

        // Generate optimized versions
        const sizes = [
          { width: 640, suffix: 'small' },
          { width: 1080, suffix: 'medium' },
          { width: 1920, suffix: 'large' },
          { width: 2560, suffix: 'xlarge' },
        ];

        const optimizedUrls: any = {};

        for (const size of sizes) {
          const compressed = await r2MediaService.compressImage(file, {
            maxWidth: size.width,
            quality: 0.85,
          });

          const url = await r2MediaService.uploadToStorage(
            compressed,
            `landing/slideshow/${baseName}-${size.width}w.jpg`,
            'image/jpeg',
            {
              type: 'landing-slideshow',
              size: size.suffix,
            }
          );

          optimizedUrls[size.suffix] = url;
        }

        // Generate placeholder
        const placeholder = await this.generatePlaceholder(file);

        results.set(baseName, {
          original: URL.createObjectURL(file),
          optimized: optimizedUrls,
          placeholder,
        });

        onProgress?.(i + 1, files.length);
      } catch (error) {
        errorHandler.handleError(error, ErrorSeverity.HIGH, {
          action: 'optimize-landing-image',
          fileName: files[i].name,
        });
      }
    }

    return results;
  }

  private async generatePlaceholder(file: File): Promise<string> {
    return new Promise(resolve => {
      const img = new Image();
      img.src = URL.createObjectURL(file);

      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = 10;
        canvas.height = Math.round((10 * img.height) / img.width);

        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve('');
          return;
        }

        ctx.filter = 'blur(2px)';
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

        resolve(canvas.toDataURL('image/jpeg', 0.6));
        URL.revokeObjectURL(img.src);
      };

      img.onerror = () => {
        resolve('');
        URL.revokeObjectURL(img.src);
      };
    });
  }
}

export const landingImageOptimizer = LandingImageOptimizer.getInstance();
```

### Option 2: Optimize Next.js Configuration

```javascript
// next.config.js - Add these image optimization settings
images: {
  // ... existing remotePatterns

  formats: ['image/avif', 'image/webp'],
  deviceSizes: [640, 750, 828, 1080, 1200, 1920, 2048, 3840],
  imageSizes: [16, 32, 48, 64, 96, 128, 256, 384],
  minimumCacheTTL: 31536000, // 1 year
  dangerouslyAllowSVG: false,
  contentSecurityPolicy: "default-src 'self'; script-src 'none'; sandbox;",
}
```

### Option 3: Enhanced HeroSection Component

```typescript
// src/components/landing/HeroSection.tsx
'use client';

import { useEffect, useRef, useState, useMemo } from 'react';
import { ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/context/AuthContext';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { errorHandler, ErrorSeverity } from '@/services/ErrorHandlingService';

// Configuration for optimized images
const IMAGE_CONFIG = {
  quality: 90,
  sizes: '(max-width: 640px) 640px, (max-width: 1080px) 1080px, (max-width: 1920px) 1920px, 2560px',
  // If using R2, replace with R2 URLs
  basePath: process.env.NEXT_PUBLIC_R2_PUBLIC_URL
    ? `${process.env.NEXT_PUBLIC_R2_PUBLIC_URL}/landing/slideshow`
    : '/images/landing-slideshow',
};

const HeroSection = () => {
  // ... existing code ...

  // Memoize images array to prevent recreating on each render
  const images = useMemo(
    () =>
      [
        {
          name: 'image1',
          textTheme: 'light' as const,
          // Add actual placeholder data after generating
          placeholder: undefined,
        },
        // ... rest of images
      ].map(img => ({
        ...img,
        src: `${IMAGE_CONFIG.basePath}/${img.name}.jpg`,
      })),
    []
  );

  // Preload critical images
  useEffect(() => {
    // Preload first 3 images for faster initial load
    const preloadImages = images.slice(0, 3).map(img => {
      const link = document.createElement('link');
      link.rel = 'preload';
      link.as = 'image';
      link.href = img.src;
      link.type = 'image/jpeg';
      document.head.appendChild(link);
      return link;
    });

    return () => {
      preloadImages.forEach(link => link.remove());
    };
  }, [images]);

  // ... rest of component code ...

  return (
    <section className="relative min-h-screen flex items-center justify-center overflow-hidden">
      <div className="absolute inset-0">
        {images.map((imageData, index) => (
          <div
            key={imageData.name}
            className={`absolute inset-0 w-full h-full transition-opacity duration-1000 ease-in-out ${
              index === currentImageIndex ? 'opacity-100' : 'opacity-0'
            }`}
          >
            {loadedImages.has(index) && (
              <div className="relative w-full h-full">
                <Image
                  src={imageData.src}
                  alt={`Family moments ${index + 1}`}
                  fill
                  priority={index === 0}
                  loading={index === 0 ? 'eager' : 'lazy'}
                  sizes={IMAGE_CONFIG.sizes}
                  quality={IMAGE_CONFIG.quality}
                  placeholder={imageData.placeholder ? 'blur' : 'empty'}
                  blurDataURL={imageData.placeholder}
                  onError={() => {
                    errorHandler.handleError(
                      new Error(`Failed to load image: ${imageData.src}`),
                      ErrorSeverity.LOW,
                      { imageIndex: index }
                    );
                  }}
                  style={{
                    objectFit: 'cover',
                    objectPosition: 'center',
                  }}
                />
              </div>
            )}
          </div>
        ))}
      </div>
      {/* ... rest of component */}
    </section>
  );
};

export default HeroSection;
```

### Option 4: Admin Tool for Image Management

```typescript
// src/components/admin/LandingImageManager.tsx
'use client';

import { useState } from 'react';
import { landingImageOptimizer } from '@/utils/landingImageOptimizer';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { useToast } from '@/components/ui/use-toast';

export const LandingImageManager = () => {
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const { toast } = useToast();

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    setUploading(true);
    setProgress(0);

    try {
      const results = await landingImageOptimizer.optimizeLandingImages(files, (current, total) => {
        setProgress((current / total) * 100);
      });

      // Generate configuration for HeroSection
      const config = Array.from(results.entries()).map(([name, urls]) => ({
        name,
        urls: urls.optimized,
        placeholder: urls.placeholder,
      }));

      console.log('Image configuration:', JSON.stringify(config, null, 2));

      toast({
        title: 'Images optimized successfully',
        description: `Processed ${results.size} images`,
      });
    } catch (error) {
      toast({
        title: 'Optimization failed',
        description: error instanceof Error ? error.message : 'Unknown error',
        variant: 'destructive',
      });
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="p-6 max-w-2xl mx-auto">
      <h2 className="text-2xl font-bold mb-4">Landing Page Image Manager</h2>

      <div className="space-y-4">
        <div>
          <input
            type="file"
            multiple
            accept="image/*"
            onChange={handleFileUpload}
            disabled={uploading}
            className="hidden"
            id="image-upload"
          />
          <label htmlFor="image-upload">
            <Button asChild disabled={uploading}>
              <span>Select Images to Optimize</span>
            </Button>
          </label>
        </div>

        {uploading && (
          <div className="space-y-2">
            <Progress value={progress} />
            <p className="text-sm text-gray-600">Optimizing images... {Math.round(progress)}%</p>
          </div>
        )}
      </div>
    </div>
  );
};
```

## Security Considerations

1. **CSP Compliance**: All image sources must be whitelisted in CSP
2. **Authentication**: Admin tools must be protected
3. **Rate Limiting**: Image uploads should be rate-limited
4. **Validation**: Validate file types and sizes before processing

## Performance Best Practices

1. Use Next.js Image component (already doing ✅)
2. Implement lazy loading for off-screen images
3. Use appropriate image formats (WebP/AVIF with JPEG fallback)
4. Leverage browser caching with proper headers
5. Consider using a CDN (R2 provides this)

## Deployment Checklist

- [ ] Update CSP to allow R2 URLs if using cloud storage
- [ ] Set up proper caching headers
- [ ] Configure image optimization in next.config.js
- [ ] Test on slow connections
- [ ] Monitor Core Web Vitals
- [ ] Set up error tracking for failed image loads

## Recommended Approach

For Dynasty's architecture, I recommend:

1. **Keep using Next.js Image component** (you're already doing this right!)
2. **Upload optimized images to R2** for CDN benefits
3. **Use the admin tool** to batch optimize and upload images
4. **Update HeroSection** to use R2 URLs with proper error handling
5. **Monitor performance** with Vercel Analytics

This approach:

- ✅ Aligns with your cloud-first architecture
- ✅ Uses existing services and patterns
- ✅ Maintains security standards
- ✅ Provides better global performance via CDN
- ✅ No new dependencies needed
