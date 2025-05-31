/** @type {import('next').NextConfig} */
const nextConfig = {
  typescript: {
    tsconfigPath: './tsconfig.json',
  },
  transpilePackages: ['ui', 'utils'],
  
  // Environment variables
  env: {
    NEXT_PUBLIC_USE_FIREBASE_EMULATOR: process.env.NODE_ENV === 'development' ? 'true' : 'false',
  },
  
  // Turbopack configuration (replaces webpack config)
  experimental: {
    turbo: {
      resolveAlias: {
        'react-native$': 'react-native-web',
      },
      resolveExtensions: [
        '.web.js',
        '.web.jsx',
        '.web.ts',
        '.web.tsx',
        '.js',
        '.jsx',
        '.ts',
        '.tsx',
        '.json',
      ],
    },
  },
  
  // Add security headers for development to allow Firebase emulator connections
  async headers() {
    if (process.env.NODE_ENV === 'development') {
      return [
        {
          source: '/:path*',
          headers: [
            {
              key: 'Content-Security-Policy',
              value: [
                "default-src 'self'",
                "script-src 'self' 'unsafe-eval' 'unsafe-inline' https://*.googleapis.com https://*.gstatic.com https://*.google.com https://*.firebaseapp.com https://*.firebaseio.com https://js.stripe.com https://*.sentry.io https://www.googletagmanager.com https://fpnpmcdn.net",
                "connect-src 'self' https://*.googleapis.com https://*.google.com https://firebasestorage.googleapis.com https://*.firebaseio.com wss://*.firebaseio.com https://*.firebaseapp.com https://identitytoolkit.googleapis.com https://securetoken.googleapis.com https://nominatim.openstreetmap.org https://*.ingest.sentry.io https://*.ingest.us.sentry.io https://www.google-analytics.com https://*.google-analytics.com https://*.googletagmanager.com https://react-circle-flags.pages.dev https://fpnpmcdn.net https://api.fpjs.io https://*.fpjs.io http://127.0.0.1:* http://localhost:*",
                "img-src 'self' data: blob: https://*.googleusercontent.com https://firebasestorage.googleapis.com https://storage.googleapis.com https://*.firebaseapp.com https://tile.openstreetmap.org https://*.tile.openstreetmap.org https://hatscripts.github.io https://react-circle-flags.pages.dev",
                "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
                "font-src 'self' https://fonts.gstatic.com",
                "frame-src 'self' https://*.firebaseapp.com https://*.google.com http://127.0.0.1:* http://localhost:*",
                "worker-src 'self' blob:",
                "script-src-elem 'self' 'unsafe-inline' https://*.googleapis.com https://*.gstatic.com https://*.google.com https://*.firebaseapp.com https://*.firebaseio.com https://js.stripe.com https://*.sentry.io https://www.googletagmanager.com https://fpnpmcdn.net",
              ].join('; '),
            },
          ],
        },
      ];
    }
    return [];
  },
  
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'firebasestorage.googleapis.com',
        port: '',
        pathname: '/**',
      },
      {
        protocol: 'http',
        hostname: '127.0.0.1',
        port: '9199',
        pathname: '/**',
      },
      {
        protocol: 'http',
        hostname: '127.0.0.1',
        port: '*',
        pathname: '/**',
      },
      {
        protocol: 'http',
        hostname: 'localhost',
        port: '*',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'storage.googleapis.com',
        port: '',
        pathname: '/**',
      },
    ],
  },
}

// Injected content via Sentry wizard below
const { withSentryConfig } = require("@sentry/nextjs");

// Only apply Sentry configuration if not using Turbopack in development
const shouldUseSentry = process.env.NODE_ENV === 'production' || 
                       !process.argv.includes('--turbopack');

const finalConfig = shouldUseSentry ? withSentryConfig(
  nextConfig,
  {
    // For all available options, see:
    // https://www.npmjs.com/package/@sentry/webpack-plugin#options

    org: "mydynastyapp",
    project: "dynasty",

    // Only print logs for uploading source maps in CI
    silent: !process.env.CI,

    // For all available options, see:
    // https://docs.sentry.io/platforms/javascript/guides/nextjs/manual-setup/

    // Upload a larger set of source maps for prettier stack traces (increases build time)
    widenClientFileUpload: true,

    // Route browser requests to Sentry through a Next.js rewrite to circumvent ad-blockers
    tunnelRoute: "/monitoring",

    // Automatically tree-shake Sentry logger statements to reduce bundle size
    disableLogger: true,

    // Enables automatic instrumentation of Vercel Cron Monitors. (Does not yet work with App Router route handlers.)
    // See the following for more information:
    // https://docs.sentry.io/product/crons/
    // https://vercel.com/docs/cron-jobs
    automaticVercelMonitors: true,
  }
) : nextConfig;

module.exports = finalConfig;
