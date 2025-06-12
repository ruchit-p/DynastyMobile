# Dynasty Website Image Optimization Guide

## Current Situation

- Landing slideshow: 27 images, ~52 MB total
- Using Next.js Image component (good start!)
- Images are JPEGs in public directory
- No build-time optimization

## Comprehensive Optimization Strategy

### 1. Immediate Optimization with Sharp

First, install Sharp for build-time optimization:

```bash
npm install --save-dev sharp
```

### 2. Update next.config.js for Better Image Optimization

Add these configurations to your next.config.js:

```javascript
images: {
  // Keep existing remotePatterns...

  // Add these new configurations
  formats: ['image/avif', 'image/webp'], // Enable modern formats
  deviceSizes: [640, 750, 828, 1080, 1200, 1920, 2048, 3840],
  imageSizes: [16, 32, 48, 64, 96, 128, 256, 384],
  minimumCacheTTL: 60 * 60 * 24 * 365, // 1 year cache
}
```

### 3. Create Image Optimization Script

Create a script to optimize images before deployment:

```javascript
// scripts/optimize-images.js
const sharp = require('sharp');
const fs = require('fs').promises;
const path = require('path');

const SLIDESHOW_DIR = path.join(__dirname, '../public/images/landing-slideshow');
const OPTIMIZED_DIR = path.join(__dirname, '../public/images/landing-slideshow-optimized');

async function optimizeImages() {
  // Create optimized directory
  await fs.mkdir(OPTIMIZED_DIR, { recursive: true });

  const files = await fs.readdir(SLIDESHOW_DIR);
  const imageFiles = files.filter(f => f.endsWith('.jpg') || f.endsWith('.jpeg'));

  for (const file of imageFiles) {
    const inputPath = path.join(SLIDESHOW_DIR, file);
    const baseName = path.basename(file, path.extname(file));

    console.log(`Optimizing ${file}...`);

    // Create multiple sizes for responsive loading
    const sizes = [
      { width: 640, suffix: '-640w' },
      { width: 1080, suffix: '-1080w' },
      { width: 1920, suffix: '-1920w' },
      { width: 2560, suffix: '-2560w' },
    ];

    for (const size of sizes) {
      // JPEG (fallback)
      await sharp(inputPath)
        .resize(size.width, null, {
          withoutEnlargement: true,
          fit: 'inside',
        })
        .jpeg({
          quality: 85,
          progressive: true,
          mozjpeg: true,
        })
        .toFile(path.join(OPTIMIZED_DIR, `${baseName}${size.suffix}.jpg`));

      // WebP (modern browsers)
      await sharp(inputPath)
        .resize(size.width, null, {
          withoutEnlargement: true,
          fit: 'inside',
        })
        .webp({
          quality: 85,
          effort: 6,
        })
        .toFile(path.join(OPTIMIZED_DIR, `${baseName}${size.suffix}.webp`));

      // AVIF (newest format, best compression)
      await sharp(inputPath)
        .resize(size.width, null, {
          withoutEnlargement: true,
          fit: 'inside',
        })
        .avif({
          quality: 80,
          effort: 9,
        })
        .toFile(path.join(OPTIMIZED_DIR, `${baseName}${size.suffix}.avif`));
    }

    // Create blur placeholder
    const { data, info } = await sharp(inputPath)
      .resize(10, null, { fit: 'inside' })
      .blur()
      .toBuffer({ resolveWithObject: true });

    const base64 = `data:image/${info.format};base64,${data.toString('base64')}`;

    // Save placeholder data
    await fs.writeFile(path.join(OPTIMIZED_DIR, `${baseName}-placeholder.txt`), base64);
  }

  console.log('Image optimization complete!');
}

optimizeImages().catch(console.error);
```

### 4. Update HeroSection Component

Replace the image loading section with this optimized version:

```typescript
// src/components/landing/HeroSection.tsx

// At the top of the component, add blur placeholder data
const imagePlaceholders = {
  image1: 'data:image/jpeg;base64,...', // Add actual base64 data
  // ... add for all images
};

// Update the images array
const images = [
  {
    src: '/images/landing-slideshow-optimized/image1',
    textTheme: 'light' as const,
    placeholder: imagePlaceholders.image1,
  },
  // ... update all images
];

// Update the Image component usage
<Image
  src={`${imageData.src}-1920w.jpg`}
  alt={`Slideshow image ${index + 1}`}
  fill
  priority={index === 0}
  sizes="(max-width: 640px) 640px, (max-width: 1080px) 1080px, (max-width: 1920px) 1920px, 2560px"
  quality={90}
  placeholder="blur"
  blurDataURL={imageData.placeholder}
  style={{
    objectFit: 'cover',
    objectPosition: 'center',
  }}
/>;
```

### 5. Implement Progressive Loading

Create a custom hook for progressive image loading:

```typescript
// src/hooks/useProgressiveImage.ts
import { useState, useEffect } from 'react';

export function useProgressiveImage(lowQualitySrc: string, highQualitySrc: string) {
  const [src, setSrc] = useState(lowQualitySrc);

  useEffect(() => {
    const img = new Image();
    img.src = highQualitySrc;
    img.onload = () => {
      setSrc(highQualitySrc);
    };
  }, [highQualitySrc]);

  return src;
}
```

### 6. Consider Using a CDN

For production, consider using a CDN like Cloudflare Images or Vercel's Image Optimization:

```javascript
// Option 1: Vercel Image Optimization (automatic with Next.js)
// Already enabled when deployed to Vercel

// Option 2: Cloudflare Images integration
images: {
  loader: 'custom',
  loaderFile: './src/lib/cloudflare-loader.js',
}
```

### 7. Implement Lazy Loading for Off-Screen Images

Update your component to only load visible images:

```typescript
const [loadedImages, setLoadedImages] = useState<Set<number>>(new Set([0]));

useEffect(() => {
  // Preload next image
  const nextIndex = (currentShuffleIndex + 1) % shuffledIndices.length;
  setLoadedImages(prev => new Set([...prev, shuffledIndices[nextIndex]]));
}, [currentShuffleIndex, shuffledIndices]);

// In render:
{images.map((imageData, index) => (
  <div key={imageData.src} className={...}>
    {loadedImages.has(index) && (
      <Image ... />
    )}
  </div>
))}
```

### 8. Add to package.json scripts

```json
{
  "scripts": {
    "optimize-images": "node scripts/optimize-images.js",
    "build": "npm run optimize-images && next build"
  }
}
```

## Expected Results

- **Original**: 52 MB total
- **After optimization**: ~10-15 MB total (75% reduction)
- **Format savings**: AVIF can be 50% smaller than JPEG
- **Responsive images**: Only load size needed for viewport
- **Progressive enhancement**: Fast blur placeholders
- **Better UX**: Faster initial load, smooth transitions

## Additional Recommendations

1. **Use Cloudflare R2** for image storage (already configured in your next.config.js)
2. **Consider image sprites** for small, frequently used images
3. **Implement service worker** for offline image caching
4. **Monitor Core Web Vitals** to track improvement

## Quick Implementation Steps

1. Install sharp: `npm install --save-dev sharp`
2. Create and run the optimization script
3. Update next.config.js with image configuration
4. Update HeroSection to use optimized images
5. Deploy and measure performance improvement

This will dramatically improve your landing page load time while maintaining visual quality!
