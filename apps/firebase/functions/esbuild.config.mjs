import esbuild from 'esbuild';
import { readFileSync } from 'fs';
import path from 'path';

// Read package.json to automatically detect external dependencies
const packageJson = JSON.parse(
  readFileSync(path.resolve('./package.json'), 'utf-8')
);

// Define which dependencies should be kept external (not bundled)
// These are typically provided by the Firebase Functions runtime or are too large to bundle
const externalDependencies = [
  // Firebase packages (provided by runtime)
  'firebase-admin',
  'firebase-functions',
  
  // AWS SDK packages (large and available in runtime)
  '@aws-sdk/client-pinpoint-sms-voice-v2',
  '@aws-sdk/client-s3',
  '@aws-sdk/client-ses',
  '@aws-sdk/client-sns',
  '@aws-sdk/s3-request-presigner',
  
  // Large external services
  '@googlemaps/google-maps-services-js',
  '@notionhq/client',
  'stripe',
  
  // Workspace packages (resolve at runtime)
  '@dynasty/vault-sdk',
  
  // Dynamic imports that should be external
  'nanoid',
  
  // Node.js built-in modules
  'crypto',
  'fs',
  'path',
  'url',
  'util',
  'events',
  'stream',
  'buffer',
  'querystring',
  'http',
  'https',
  'os',
  'zlib',
];

const buildOptions = {
  entryPoints: ['src/index.ts'],
  bundle: true,
  outdir: 'lib',
  platform: 'node',
  target: 'node20', // Firebase Functions Node.js 20 runtime
  format: 'cjs', // CommonJS to match current setup
  external: externalDependencies,
  minify: process.env.NODE_ENV === 'production', // Only minify in production
  sourcemap: process.env.NODE_ENV !== 'production', // Source maps in dev only
  metafile: true, // Generate build metadata for analysis
  logLevel: 'info',
  splitting: false, // Firebase Functions doesn't support ES modules splitting
  treeShaking: true, // Remove unused code
  
  // Define environment variables at build time
  define: {
    'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV || 'development'),
  },
  
  // Keep dynamic imports as-is (for conditional migrations)
  mainFields: ['main', 'module'],
  
  // Resolve TypeScript paths
  resolveExtensions: ['.ts', '.js', '.json'],
};

async function build() {
  try {
    console.log('🔨 Building Firebase Functions with esbuild...');
    console.log(`📦 Mode: ${process.env.NODE_ENV || 'development'}`);
    console.log(`📍 Target: ${buildOptions.target}`);
    console.log(`🎯 Platform: ${buildOptions.platform}`);
    console.log(`📄 Format: ${buildOptions.format}`);
    console.log(`🗜️  Minify: ${buildOptions.minify}`);
    console.log(`🗺️  Source maps: ${buildOptions.sourcemap}`);
    
    const result = await esbuild.build(buildOptions);
    
    if (result.metafile) {
      // Log bundle size information
      const bundleSize = Object.values(result.metafile.outputs)[0]?.bytes || 0;
      console.log(`📊 Bundle size: ${(bundleSize / 1024 / 1024).toFixed(2)} MB`);
      
      // Optionally write metafile for analysis
      if (process.env.ESBUILD_ANALYZE) {
        await import('fs').then(fs => 
          fs.writeFileSync('build-meta.json', JSON.stringify(result.metafile, null, 2))
        );
        console.log('📋 Build metadata written to build-meta.json');
      }
    }
    
    console.log('✅ Build completed successfully!');
  } catch (error) {
    console.error('❌ Build failed:', error);
    process.exit(1);
  }
}

// Run build if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  build();
}

export { build, buildOptions };