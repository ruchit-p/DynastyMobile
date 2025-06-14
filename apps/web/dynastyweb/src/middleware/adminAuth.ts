import { NextRequest, NextResponse } from 'next/server';
import { adminSecurity } from '@/utils/adminSecurity';

// Admin routes that require authentication
const ADMIN_PROTECTED_PATHS = [
  '/dashboard',
  '/users',
  '/analytics',
  '/settings',
  '/content',
  '/audit',
];

// Public admin routes (like login)
const ADMIN_PUBLIC_PATHS = [
  '/login',
  '/2fa',
];

// Allowed IPs for admin access (configure in environment)
const getAllowedIPs = (): string[] => {
  const ips = process.env.ADMIN_ALLOWED_IPS;
  if (!ips) return [];
  return ips.split(',').map(ip => ip.trim()).filter(Boolean);
};

export async function handleAdminAuth(request: NextRequest): Promise<NextResponse | null> {
  const pathname = request.nextUrl.pathname;
  const hostname = request.headers.get('host') || '';
  
  // Check if this is an admin subdomain request
  const isAdminSubdomain = hostname.startsWith('admin.') || hostname === 'admin.localhost:3002';
  
  if (!isAdminSubdomain) {
    return null; // Not an admin request, continue normal flow
  }

  // Check IP allowlist if configured
  const allowedIPs = getAllowedIPs();
  if (allowedIPs.length > 0) {
    const clientIP = request.headers.get('x-forwarded-for')?.split(',')[0] || 
                     request.headers.get('x-real-ip') || 
                     'unknown';
    
    if (!adminSecurity.isAllowedIP(clientIP, allowedIPs)) {
      // Return 403 Forbidden for unauthorized IPs
      return new NextResponse('Access Denied', { status: 403 });
    }
  }

  // Allow public admin paths
  if (ADMIN_PUBLIC_PATHS.some(path => pathname.startsWith(path))) {
    return null;
  }

  // Check for admin session
  const sessionCookie = request.cookies.get('admin-session');
  const authCookie = request.cookies.get('auth-token');
  
  // Redirect to login if no session
  if (!sessionCookie || !authCookie) {
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('redirect', pathname);
    return NextResponse.redirect(loginUrl);
  }

  // For protected admin routes, additional verification will be done client-side
  // This middleware handles basic routing and IP restrictions
  
  // Add security headers for admin pages
  const response = NextResponse.next();
  
  // Enhanced security headers for admin
  response.headers.set('X-Frame-Options', 'DENY');
  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('Referrer-Policy', 'same-origin');
  response.headers.set('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');
  
  // Add admin-specific CSP
  const adminCSP = [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://*.googleapis.com https://*.firebaseapp.com https://*.firebaseio.com",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com",
    "img-src 'self' data: blob: https://*.googleusercontent.com https://firebasestorage.googleapis.com",
    "connect-src 'self' https://*.googleapis.com https://*.firebaseio.com wss://*.firebaseio.com https://*.firebaseapp.com",
    "frame-ancestors 'none'",
  ].join('; ');
  
  response.headers.set('Content-Security-Policy', adminCSP);
  
  return response;
}

/**
 * Check if a request is for the admin subdomain
 */
export function isAdminRequest(request: NextRequest): boolean {
  const hostname = request.headers.get('host') || '';
  return hostname.startsWith('admin.') || hostname === 'admin.localhost:3002';
}

/**
 * Get the main app URL from admin subdomain
 */
export function getMainAppUrl(request: NextRequest): string {
  const protocol = request.headers.get('x-forwarded-proto') || 'https';
  const hostname = request.headers.get('host') || '';
  
  // Remove admin. prefix
  const mainHost = hostname.replace(/^admin\./, '');
  
  // Handle localhost
  if (mainHost === 'localhost:3002') {
    return 'http://localhost:3002';
  }
  
  return `${protocol}://${mainHost}`;
}