const sharp = require('sharp');
const fs = require('fs').promises;
const path = require('path');

const SLIDESHOW_DIR = path.join(__dirname, '../public/images/landing-slideshow');
const OPTIMIZED_DIR = path.join(__dirname, '../public/images/landing-slideshow-optimized');

// Color for console output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
};

async function getImageSize(filePath) {
  const stats = await fs.stat(filePath);
  return stats.size;
}

function formatBytes(bytes) {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

async function optimizeImages() {
  console.log(`${colors.bright}${colors.blue}🖼️  Dynasty Image Optimizer${colors.reset}\n`);

  try {
    // Create optimized directory
    await fs.mkdir(OPTIMIZED_DIR, { recursive: true });
    console.log(`${colors.green}✓${colors.reset} Created output directory: ${OPTIMIZED_DIR}\n`);

    const files = await fs.readdir(SLIDESHOW_DIR);
    const imageFiles = files.filter(f => f.match(/\.(jpg|jpeg|png)$/i));

    if (imageFiles.length === 0) {
      console.log(`${colors.yellow}⚠${colors.reset} No images found in ${SLIDESHOW_DIR}`);
      return;
    }

    console.log(`Found ${colors.cyan}${imageFiles.length}${colors.reset} images to optimize\n`);

    let totalOriginalSize = 0;
    let totalOptimizedSize = 0;
    const placeholderData = {};

    for (let i = 0; i < imageFiles.length; i++) {
      const file = imageFiles[i];
      const inputPath = path.join(SLIDESHOW_DIR, file);
      const baseName = path.basename(file, path.extname(file));

      const originalSize = await getImageSize(inputPath);
      totalOriginalSize += originalSize;

      console.log(
        `${colors.bright}[${i + 1}/${imageFiles.length}] Processing ${file}${colors.reset}`
      );
      console.log(`  Original size: ${formatBytes(originalSize)}`);

      // Get original dimensions
      const metadata = await sharp(inputPath).metadata();
      console.log(`  Dimensions: ${metadata.width}x${metadata.height}`);

      // Define responsive sizes
      const sizes = [
        { width: 640, suffix: '-640w' },
        { width: 1080, suffix: '-1080w' },
        { width: 1920, suffix: '-1920w' },
        { width: 2560, suffix: '-2560w' },
      ];

      let fileOptimizedSize = 0;

      for (const size of sizes) {
        // Skip if image is smaller than target size
        if (metadata.width < size.width) continue;

        // JPEG (fallback) - Progressive with mozjpeg
        const jpegPath = path.join(OPTIMIZED_DIR, `${baseName}${size.suffix}.jpg`);
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
          .toFile(jpegPath);

        const jpegSize = await getImageSize(jpegPath);
        fileOptimizedSize += jpegSize;

        // WebP (modern browsers)
        const webpPath = path.join(OPTIMIZED_DIR, `${baseName}${size.suffix}.webp`);
        await sharp(inputPath)
          .resize(size.width, null, {
            withoutEnlargement: true,
            fit: 'inside',
          })
          .webp({
            quality: 85,
            effort: 6,
          })
          .toFile(webpPath);

        const webpSize = await getImageSize(webpPath);

        // AVIF (newest format, best compression)
        const avifPath = path.join(OPTIMIZED_DIR, `${baseName}${size.suffix}.avif`);
        await sharp(inputPath)
          .resize(size.width, null, {
            withoutEnlargement: true,
            fit: 'inside',
          })
          .avif({
            quality: 80,
            effort: 9,
          })
          .toFile(avifPath);

        const avifSize = await getImageSize(avifPath);

        console.log(
          `  ${size.width}px: JPEG ${formatBytes(jpegSize)} | WebP ${formatBytes(
            webpSize
          )} | AVIF ${formatBytes(avifSize)}`
        );
      }

      // Create blur placeholder (10px wide, maintaining aspect ratio)
      const { data, info } = await sharp(inputPath)
        .resize(10, null, { fit: 'inside' })
        .blur(2)
        .jpeg({ quality: 60 })
        .toBuffer({ resolveWithObject: true });

      const base64 = `data:image/${info.format};base64,${data.toString('base64')}`;
      placeholderData[baseName] = base64;

      // Save just the base64 string (not the full data URL) for smaller file
      await fs.writeFile(
        path.join(OPTIMIZED_DIR, `${baseName}-placeholder.txt`),
        data.toString('base64')
      );

      totalOptimizedSize += fileOptimizedSize;

      const savings = (((originalSize - fileOptimizedSize) / originalSize) * 100).toFixed(1);
      console.log(`  ${colors.green}✓ Saved ${savings}%${colors.reset}\n`);
    }

    // Generate placeholder data module
    const placeholderModule = `// Auto-generated blur placeholder data
export const imagePlaceholders = ${JSON.stringify(placeholderData, null, 2)};
`;

    await fs.writeFile(path.join(OPTIMIZED_DIR, 'placeholders.ts'), placeholderModule);

    // Summary
    console.log(`${colors.bright}${colors.green}✨ Optimization Complete!${colors.reset}\n`);
    console.log(
      `Original total size: ${colors.yellow}${formatBytes(totalOriginalSize)}${colors.reset}`
    );
    console.log(
      `Optimized total size: ${colors.green}${formatBytes(totalOptimizedSize)}${colors.reset}`
    );
    console.log(
      `Total savings: ${colors.green}${(
        ((totalOriginalSize - totalOptimizedSize) / totalOriginalSize) *
        100
      ).toFixed(1)}%${colors.reset}`
    );
    console.log(`\nOptimized images saved to: ${colors.cyan}${OPTIMIZED_DIR}${colors.reset}`);

    // Next steps
    console.log(`\n${colors.bright}Next steps:${colors.reset}`);
    console.log('1. Update your component to use the optimized images');
    console.log('2. Import the placeholders from placeholders.ts');
    console.log('3. Use appropriate srcset for responsive loading');
    console.log('4. Consider moving originals to a backup folder');
  } catch (error) {
    console.error(`${colors.bright}${colors.red}❌ Error:${colors.reset}`, error.message);
    process.exit(1);
  }
}

// Check if sharp is installed
async function checkDependencies() {
  try {
    require.resolve('sharp');
  } catch (e) {
    console.log(`${colors.yellow}Sharp not found. Installing...${colors.reset}`);
    const { execSync } = require('child_process');
    execSync('npm install --save-dev sharp', { stdio: 'inherit' });
  }
}

// Run the optimizer
(async () => {
  await checkDependencies();
  await optimizeImages();
})();
