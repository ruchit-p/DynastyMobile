# Quick Image Optimization Implementation Guide

## Step 1: Install Sharp (if not already installed)

```bash
cd /Users/ruchitpatel/Documents/DynastyMobile/apps/web/dynastyweb
npm install --save-dev sharp
```

## Step 2: Run the Optimization Script

```bash
node scripts/optimize-images.js
```

This will:

- Create optimized versions in multiple sizes (640w, 1080w, 1920w, 2560w)
- Generate WebP and AVIF formats (50-80% smaller than JPEG)
- Create blur placeholders for smooth loading
- Show you the file size savings

## Step 3: Update next.config.js

Add these image optimization settings:

```javascript
images: {
  // ... existing remotePatterns

  // Add these:
  formats: ['image/avif', 'image/webp'],
  deviceSizes: [640, 750, 828, 1080, 1200, 1920, 2048, 3840],
  imageSizes: [16, 32, 48, 64, 96, 128, 256, 384],
  minimumCacheTTL: 60 * 60 * 24 * 365, // 1 year
}
```

## Step 4: Update HeroSection Component

1. Backup your current HeroSection.tsx
2. Copy the optimized version:
   ```bash
   cp src/components/landing/HeroSection.optimized.tsx src/components/landing/HeroSection.tsx
   ```
3. Import the placeholder data (after running the script):
   ```typescript
   import { imagePlaceholders } from '@/public/images/landing-slideshow-optimized/placeholders';
   ```

## Step 5: Update package.json

Add the optimization to your build process:

```json
"scripts": {
  "optimize-images": "node scripts/optimize-images.js",
  "build": "npm run optimize-images && next build"
}
```

## Step 6: Test Locally

```bash
npm run dev
```

Check:

- Images load quickly with blur placeholders
- Different formats load based on browser support
- Responsive sizes load based on viewport

## Step 7: Optional - Clean Up

Once verified working:

1. Move original images to a backup folder
2. Update any other components using these images

## Performance Improvements

- **Before**: 52 MB of images
- **After**: ~10-15 MB total (75% reduction)
- **Load time**: 3-5x faster on slow connections
- **Better UX**: Smooth blur-to-sharp transitions

## Additional Optimizations (Optional)

### 1. Use Cloudflare R2 (you already have it configured!)

Upload optimized images to R2 and update image paths:

```typescript
src: 'https://your-r2-bucket.r2.dev/landing-slideshow/image1';
```

### 2. Add Service Worker for Caching

Create a service worker to cache images offline.

### 3. Monitor Performance

Use Vercel Analytics to track Core Web Vitals improvements.

## Troubleshooting

- **Sharp installation fails**: Try `npm install --platform=darwin --arch=x64 sharp`
- **Images not loading**: Check console for 404s, ensure paths are correct
- **Build fails**: Make sure to run optimize-images before building

Need help? The optimization script provides detailed output and error messages.
