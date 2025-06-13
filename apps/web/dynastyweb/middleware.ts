import { NextRequest, NextResponse } from 'next/server';
import { checkRateLimit } from './src/lib/rate-limit';
import { subscriptionRateLimit } from './src/middleware/subscription-rate-limit';

export async function middleware(request: NextRequest) {
  // Skip auth check for the auth check endpoint itself to prevent infinite loop
  if (request.nextUrl.pathname === '/api/auth/check') {
    // Continue to the auth check handler
  }

  // Rate limiting for subscription-related routes
  if (request.nextUrl.pathname.startsWith('/checkout') || 
      request.nextUrl.pathname.includes('/api/subscription')) {
    const { success, response } = await subscriptionRateLimit(request, 'checkout');
    if (!success && response) {
      return response;
    }
  }
  
  if (request.nextUrl.pathname.includes('/account-settings/subscription') ||
      request.nextUrl.pathname.includes('/api/billing')) {
    const { success, response } = await subscriptionRateLimit(request, 'management');
    if (!success && response) {
      return response;
    }
  }

  // Rate limiting for API routes
  if (request.nextUrl.pathname.startsWith('/api/')) {
    // Determine rate limit type based on the API endpoint
    let rateLimitType: 'auth' | 'api' | 'media' | 'write' | 'sensitive' = 'api';
    
    if (request.nextUrl.pathname.includes('/auth/')) {
      rateLimitType = 'auth';
    } else if (request.nextUrl.pathname.includes('/upload/') || request.nextUrl.pathname.includes('/media/')) {
      rateLimitType = 'media';
    } else if (request.method !== 'GET') {
      rateLimitType = 'write';
    } else if (request.nextUrl.pathname.includes('/password/') || request.nextUrl.pathname.includes('/reset/')) {
      rateLimitType = 'sensitive';
    }
    
    const rateLimitResponse = await checkRateLimit(request, {
      type: rateLimitType,
      skipForAdmin: false, // We'll implement admin detection later
    });
    
    if (rateLimitResponse) {
      return rateLimitResponse;
    }
  }
  
  const response = NextResponse.next();
  // Environment detection based on hostname and environment variable
  const hostname = request.headers.get('host') || '';
  const isDevelopment = hostname.includes('localhost') || hostname.includes('127.0.0.1');
  // Check both hostname and environment variable for staging detection
  const isStaging = hostname.includes('dynastytest.com') || process.env.NEXT_PUBLIC_ENVIRONMENT === 'staging';
  const isProduction = hostname.includes('mydynastyapp.com') && process.env.NEXT_PUBLIC_ENVIRONMENT !== 'staging';
  
  // Generate nonce for CSP
  const nonce = Buffer.from(globalThis.crypto.randomUUID()).toString('base64');
  
  // CSP configuration based on environment
  const cspDirectives = (isDevelopment || isStaging) ? [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'unsafe-eval' 'unsafe-inline' https://*.googleapis.com https://*.gstatic.com https://*.google.com https://*.firebaseapp.com https://*.firebaseio.com https://js.stripe.com https://*.sentry.io https://www.googletagmanager.com https://fpnpmcdn.net https://va.vercel-scripts.com https://vercel.live`,
    "connect-src 'self' https://*.googleapis.com https://*.google.com https://firebasestorage.googleapis.com https://*.firebaseio.com wss://*.firebaseio.com https://*.firebaseapp.com https://us-central1-dynasty-dev-1b042.cloudfunctions.net https://identitytoolkit.googleapis.com https://securetoken.googleapis.com https://nominatim.openstreetmap.org https://*.ingest.sentry.io https://*.ingest.us.sentry.io https://www.google-analytics.com https://*.google-analytics.com https://*.googletagmanager.com https://react-circle-flags.pages.dev https://fpnpmcdn.net https://vitals.vercel-insights.com https://va.vercel-scripts.com https://vercel.live https://api.stripe.com https://checkout.stripe.com http://127.0.0.1:* http://localhost:*",
    "img-src 'self' data: blob: https://*.googleusercontent.com https://firebasestorage.googleapis.com https://storage.googleapis.com https://*.firebaseapp.com https://tile.openstreetmap.org https://*.tile.openstreetmap.org https://hatscripts.github.io https://react-circle-flags.pages.dev",
    `style-src 'self' 'nonce-${nonce}' 'unsafe-inline' https://fonts.googleapis.com`,
    "font-src 'self' https://fonts.gstatic.com",
    "frame-src 'self' https://*.firebaseapp.com https://*.google.com https://vercel.live http://127.0.0.1:* http://localhost:*",
    "worker-src 'self' blob:",
    `script-src-elem 'self' 'nonce-${nonce}' 'unsafe-inline' https://*.googleapis.com https://*.gstatic.com https://*.google.com https://*.firebaseapp.com https://*.firebaseio.com https://js.stripe.com https://*.sentry.io https://www.googletagmanager.com https://fpnpmcdn.net https://va.vercel-scripts.com https://vercel.live`,
  ] : [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic' https://*.googleapis.com https://*.gstatic.com https://*.google.com https://*.firebaseapp.com https://*.firebaseio.com https://js.stripe.com https://*.sentry.io https://www.googletagmanager.com https://va.vercel-scripts.com https://vercel.live`,
    "connect-src 'self' https://*.googleapis.com https://*.google.com https://firebasestorage.googleapis.com https://*.firebaseio.com wss://*.firebaseio.com https://*.firebaseapp.com https://us-central1-dynasty-eba63.cloudfunctions.net https://identitytoolkit.googleapis.com https://securetoken.googleapis.com https://nominatim.openstreetmap.org https://*.ingest.sentry.io https://*.ingest.us.sentry.io https://www.google-analytics.com https://*.google-analytics.com https://*.googletagmanager.com https://vitals.vercel-insights.com https://va.vercel-scripts.com https://vercel.live https://api.stripe.com https://checkout.stripe.com",
    "img-src 'self' data: blob: https://*.googleusercontent.com https://firebasestorage.googleapis.com https://storage.googleapis.com https://*.firebaseapp.com https://tile.openstreetmap.org https://*.tile.openstreetmap.org https://hatscripts.github.io https://react-circle-flags.pages.dev",
    `style-src 'self' 'nonce-${nonce}' https://fonts.googleapis.com`,
    "font-src 'self' https://fonts.gstatic.com",
    "frame-src 'self' https://*.firebaseapp.com https://*.google.com https://vercel.live",
    "worker-src 'self' blob:",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "upgrade-insecure-requests",
  ];
  
  const csp = cspDirectives.join('; ');
  
  // Set security headers
  response.headers.set('Content-Security-Policy', csp);
  response.headers.set('X-Frame-Options', 'DENY');
  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  response.headers.set('X-XSS-Protection', '1; mode=block');
  response.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  
  // HSTS (only in production)
  if (isProduction) {
    response.headers.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');
  }
  
  // CORS headers for API routes (Firebase Functions handle their own CORS)
  if (request.nextUrl.pathname.startsWith('/api') && !request.nextUrl.pathname.includes('firebase-callable')) {
    response.headers.set('Access-Control-Allow-Origin', process.env.NEXT_PUBLIC_APP_URL || '*');
    response.headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    response.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    response.headers.set('Access-Control-Allow-Credentials', 'true');
    response.headers.set('Access-Control-Max-Age', '86400');
  }

  // Handle preflight requests
  if (request.method === 'OPTIONS') {
    return new NextResponse(null, { status: 200, headers: response.headers });
  }
  
  // Add nonce to request headers for use in components
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-nonce', nonce);
  
  // Create a new response with the modified request
  const modifiedResponse = NextResponse.next({
    request: {
      headers: requestHeaders,
    },
  });
  
  // Copy all the security headers from the original response
  response.headers.forEach((value, key) => {
    modifiedResponse.headers.set(key, value);
  });
  
  return modifiedResponse;
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public folder
     * Now includes API routes for rate limiting
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\..*|manifest).*)',
  ],
};