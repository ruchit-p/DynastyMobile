/** @type {import('next').NextConfig} */
const nextConfig = {
  typescript: {
    tsconfigPath: './tsconfig.json',
    // Ignore TypeScript errors during build (for deployment)
    ignoreBuildErrors: true,
  },
  eslint: {
    // Ignore ESLint errors during build (for deployment)
    ignoreDuringBuilds: true,
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
    const commonHeaders = [
      {
        key: 'X-Content-Type-Options',
        value: 'nosniff'
      },
      {
        key: 'X-Frame-Options',
        value: 'SAMEORIGIN'
      },
      {
        key: 'X-XSS-Protection',
        value: '1; mode=block'
      },
      {
        key: 'Referrer-Policy',
        value: 'strict-origin-when-cross-origin'
      }
    ];

    const productionHeaders = [
      ...commonHeaders,
      {
        key: 'Strict-Transport-Security',
        value: 'max-age=31536000; includeSubDomains'
      },
      {
        key: 'Permissions-Policy',
        value: 'camera=(), microphone=(), geolocation=(), interest-cohort=()'
      }
    ];

    // Enhanced security for vault paths
    const vaultHeaders = [
      {
        source: '/vault/:path*',
        headers: [
          ...productionHeaders,
          {
            key: 'Content-Security-Policy',
            value: [
              "default-src 'self'",
              "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://*.googleapis.com https://*.gstatic.com https://*.google.com https://*.firebaseapp.com https://*.firebaseio.com https://*.sentry.io",
              "connect-src 'self' https://*.googleapis.com https://*.google.com https://firebasestorage.googleapis.com https://*.firebaseio.com wss://*.firebaseio.com https://*.firebaseapp.com https://identitytoolkit.googleapis.com https://securetoken.googleapis.com https://*.cloudflarestorage.com https://*.r2.cloudflarestorage.com",
              "img-src 'self' data: blob: https://*.googleusercontent.com https://firebasestorage.googleapis.com https://storage.googleapis.com https://*.firebaseapp.com https://*.cloudflarestorage.com https://*.r2.cloudflarestorage.com https://*.r2.dev",
              "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
              "font-src 'self' https://fonts.gstatic.com data:",
              "frame-src 'none'",
              "object-src 'none'",
              "base-uri 'self'",
              "form-action 'self'",
              "frame-ancestors 'none'",
              "worker-src 'self' blob:",
              "upgrade-insecure-requests"
            ].join('; '),
          },
          {
            key: 'X-Frame-Options',
            value: 'DENY' // Stricter for vault
          },
          {
            key: 'Cache-Control',
            value: 'no-store, no-cache, must-revalidate, private' // No caching for vault
          }
        ],
      },
    ];

    if (process.env.NODE_ENV === 'development') {
      return [
        {
          source: '/:path*',
          headers: [
            {
              key: 'Content-Security-Policy',
              value: [
                "default-src 'self'",
                "script-src 'self' 'unsafe-eval' 'unsafe-inline' https://*.googleapis.com https://*.gstatic.com https://*.google.com https://*.firebaseapp.com https://*.firebaseio.com https://js.stripe.com https://*.sentry.io https://www.googletagmanager.com https://fpnpmcdn.net https://va.vercel-scripts.com",
                "connect-src 'self' https://*.googleapis.com https://*.google.com https://firebasestorage.googleapis.com https://*.firebaseio.com wss://*.firebaseio.com https://*.firebaseapp.com https://identitytoolkit.googleapis.com https://securetoken.googleapis.com https://nominatim.openstreetmap.org https://*.ingest.sentry.io https://*.ingest.us.sentry.io https://www.google-analytics.com https://*.google-analytics.com https://*.googletagmanager.com https://react-circle-flags.pages.dev https://fpnpmcdn.net https://api.fpjs.io https://*.fpjs.io http://127.0.0.1:* http://localhost:*",
                "img-src 'self' data: blob: https://*.googleusercontent.com https://firebasestorage.googleapis.com https://storage.googleapis.com https://*.firebaseapp.com https://tile.openstreetmap.org https://*.tile.openstreetmap.org https://hatscripts.github.io https://react-circle-flags.pages.dev https://*.r2.cloudflarestorage.com https://*.r2.dev",
                "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
                "font-src 'self' https://fonts.gstatic.com",
                "frame-src 'self' https://*.firebaseapp.com https://*.google.com http://127.0.0.1:* http://localhost:*",
                "worker-src 'self' blob:",
                "script-src-elem 'self' 'unsafe-inline' https://*.googleapis.com https://*.gstatic.com https://*.google.com https://*.firebaseapp.com https://*.firebaseio.com https://js.stripe.com https://*.sentry.io https://www.googletagmanager.com https://fpnpmcdn.net https://va.vercel-scripts.com",
              ].join('; '),
            },
            ...commonHeaders
          ],
        },
      ];
    }
    
    // Production headers
    return [
      ...vaultHeaders,
      {
        source: '/:path*',
        headers: productionHeaders
      }
    ];
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
      // R2 Cloudflare Storage domains
      {
        protocol: 'https',
        hostname: '*.r2.cloudflarestorage.com',
        port: '',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: '*.r2.dev',
        port: '',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'pub-*',
        port: '',
        pathname: '/**',
      },
    ],
  },
}

// Injected content via Sentry wizard below
const { withSentryConfig } = require("@sentry/nextjs");

// Only apply Sentry configuration if auth token is available
// This prevents build failures when SENTRY_AUTH_TOKEN is not set
const shouldUseSentry = !!process.env.SENTRY_AUTH_TOKEN;

const finalConfig = shouldUseSentry ? withSentryConfig(
  nextConfig,
  {
    // For all available options, see:
    // https://www.npmjs.com/package/@sentry/webpack-plugin#options

    org: "mydynastyapp",
    project: "dynasty",

    // Only print logs for uploading source maps in CI
    silent: !process.env.CI,

    // Disable Sentry's internal telemetry
    telemetry: false,

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
