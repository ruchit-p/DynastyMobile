#!/usr/bin/env tsx

/**
 * Script to migrate landing page images to optimized cloud storage
 * Run with: npx tsx scripts/migrate-landing-images.ts
 */

import { readdir, stat } from 'fs/promises';
import { join } from 'path';
import { landingImageOptimizer } from '../src/utils/landingImageOptimizer';
import { errorHandler, ErrorSeverity } from '../src/services/ErrorHandlingService';

interface MigrationResult {
  name: string;
  status: 'success' | 'fail' | 'skip';
  message: string;
  urls?: Record<string, string>;
}

// Configuration
const IMAGE_SOURCE_DIR = join(__dirname, '../public/images/landing-slideshow');
const OUTPUT_CONFIG_PATH = join(__dirname, '../src/data/optimizedLandingImages.ts');

// Colors for console output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
};

/**
 * Format bytes to human readable
 */
function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

/**
 * Main migration function
 */
async function migrateLandingImages(): Promise<void> {
  console.log(`${colors.bright}${colors.blue}🚀 Dynasty Landing Image Migration${colors.reset}\n`);

  const results: MigrationResult[] = [];
  let totalOriginalSize = 0;
  let totalProcessed = 0;

  try {
    // Read source directory
    console.log(`Reading images from: ${colors.cyan}${IMAGE_SOURCE_DIR}${colors.reset}`);
    const files = await readdir(IMAGE_SOURCE_DIR);
    const imageFiles = files.filter(f => /\.(jpg|jpeg|png|webp)$/i.test(f));

    if (imageFiles.length === 0) {
      console.log(`${colors.yellow}⚠ No images found in source directory${colors.reset}`);
      return;
    }

    console.log(`Found ${colors.cyan}${imageFiles.length}${colors.reset} images to process\n`);

    // Process each image
    for (let i = 0; i < imageFiles.length; i++) {
      const fileName = imageFiles[i];
      const filePath = join(IMAGE_SOURCE_DIR, fileName);

      try {
        // Get file info
        const stats = await stat(filePath);
        totalOriginalSize += stats.size;

        console.log(
          `${colors.bright}[${i + 1}/${imageFiles.length}] Processing ${fileName}${colors.reset}`
        );
        console.log(`  Original size: ${formatBytes(stats.size)}`);

        // Note: In a real implementation, you would need to:
        // 1. Read the file as a File object
        // 2. Initialize Firebase/auth if needed
        // 3. Actually upload to R2

        // For now, this is a placeholder showing the structure
        results.push({
          name: fileName,
          status: 'skip',
          message: 'Manual upload required - script cannot access browser File API',
        });

        console.log(`  ${colors.yellow}⚠ Skipped - manual upload required${colors.reset}\n`);
      } catch (error) {
        const err = error as Error;
        results.push({
          name: fileName,
          status: 'fail',
          message: err.message,
        });

        console.log(`  ${colors.red}❌ Failed: ${err.message}${colors.reset}\n`);

        errorHandler.handleError(err, ErrorSeverity.HIGH, {
          action: 'migrate-landing-image',
          fileName,
        });
      }
    }

    // Generate report
    generateReport(results, totalOriginalSize);
  } catch (error) {
    console.error(`${colors.red}❌ Migration failed:${colors.reset}`, error);
    process.exit(1);
  }
}

/**
 * Generate migration report
 */
function generateReport(results: MigrationResult[], originalSize: number): void {
  console.log(`\n${colors.bright}${colors.green}📊 Migration Report${colors.reset}\n`);

  const successCount = results.filter(r => r.status === 'success').length;
  const failCount = results.filter(r => r.status === 'fail').length;
  const skipCount = results.filter(r => r.status === 'skip').length;

  console.log(`Total images: ${results.length}`);
  console.log(`✅ Successful: ${successCount}`);
  console.log(`❌ Failed: ${failCount}`);
  console.log(`⚠️  Skipped: ${skipCount}`);
  console.log(`\nOriginal total size: ${colors.yellow}${formatBytes(originalSize)}${colors.reset}`);

  // Instructions for manual process
  console.log(`\n${colors.bright}📝 Manual Migration Instructions:${colors.reset}\n`);
  console.log('Since this script runs in Node.js, it cannot directly access browser APIs.');
  console.log('To complete the migration:\n');
  console.log('1. Create an admin page with the LandingImageManager component');
  console.log('2. Upload all images through the web interface');
  console.log('3. Copy the generated configuration');
  console.log('4. Update HeroSection.tsx with the new image URLs');
  console.log('\nExample admin route:');
  console.log(`${colors.cyan}src/app/(protected)/admin/landing-images/page.tsx${colors.reset}`);

  // Generate TypeScript config template
  console.log(`\n${colors.bright}TypeScript Configuration Template:${colors.reset}\n`);
  console.log(`${colors.cyan}// src/data/landingImages.ts
export const landingImages = [
${results
  .map(
    (r, i) => `  {
    name: 'image${i + 1}',
    src: process.env.NEXT_PUBLIC_R2_URL + '/landing/slideshow/image${i + 1}',
    textTheme: 'light' as const,
    placeholder: 'data:image/jpeg;base64,...'
  }`
  )
  .join(',\n')}
] as const;${colors.reset}`);
}

// Run the migration
migrateLandingImages().catch(error => {
  console.error('Unexpected error:', error);
  process.exit(1);
});
