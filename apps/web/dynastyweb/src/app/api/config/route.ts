import { NextRequest, NextResponse } from 'next/server';
import { kv } from '@vercel/kv';

// Using Node.js runtime for better compatibility
// export const runtime = 'edge';

// App configuration that changes infrequently
const getAppConfig = () => ({
  features: {
    vault: true,
    encryption: true,
    premiumEvents: true,
    stories: true,
    familyTree: true,
    historyBook: true,
    notifications: true,
    mfa: true,
    imageOptimization: true,
    offlineMode: false, // Can be toggled for maintenance
  },
  limits: {
    maxFileSize: 100 * 1024 * 1024, // 100MB
    maxImageSize: 10 * 1024 * 1024, // 10MB
    maxVideoSize: 100 * 1024 * 1024, // 100MB
    maxFamilyMembers: 100,
    maxStoriesPerMonth: 50,
    maxEventsPerMonth: 20,
    maxVaultStorage: 5 * 1024 * 1024 * 1024, // 5GB for free tier
  },
  subscriptions: {
    freeTier: {
      maxFamilyMembers: 10,
      maxStoriesPerMonth: 10,
      maxEventsPerMonth: 5,
      maxVaultStorage: 1 * 1024 * 1024 * 1024, // 1GB
    },
    premiumTier: {
      maxFamilyMembers: 100,
      maxStoriesPerMonth: 100,
      maxEventsPerMonth: 50,
      maxVaultStorage: 50 * 1024 * 1024 * 1024, // 50GB
    },
    enterpriseTier: {
      maxFamilyMembers: -1, // Unlimited
      maxStoriesPerMonth: -1,
      maxEventsPerMonth: -1,
      maxVaultStorage: -1,
    },
  },
  security: {
    mfaRequired: false,
    passwordMinLength: 8,
    passwordRequireUppercase: true,
    passwordRequireLowercase: true,
    passwordRequireNumbers: true,
    passwordRequireSymbols: true,
    sessionTimeout: 30 * 24 * 60 * 60, // 30 days in seconds
    maxLoginAttempts: 5,
    lockoutDuration: 30 * 60, // 30 minutes in seconds
  },
  maintenance: {
    enabled: false,
    message: '',
    allowedIPs: [], // IPs allowed during maintenance
  },
  api: {
    version: '1.0.0',
    deprecations: [],
  },
  supportedCountries: [
    'US', 'CA', 'GB', 'AU', 'NZ', 'IE', // English-speaking countries
    'FR', 'DE', 'ES', 'IT', 'PT', // European countries
    // Add more as needed
  ],
  fileTypes: {
    images: ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.heic', '.heif'],
    videos: ['.mp4', '.mov', '.avi', '.mkv', '.webm'],
    documents: ['.pdf', '.doc', '.docx', '.txt'],
    audio: ['.mp3', '.wav', '.m4a', '.aac'],
  },
  socialLogin: {
    google: true,
    apple: true,
    facebook: false, // Can be enabled later
    twitter: false,
  },
});

export async function GET() {
  const cacheKey = 'app:config:v1';
  
  try {
    // Check cache first
    const cached = await kv.get(cacheKey);
    
    if (cached) {
      return NextResponse.json({
        ...cached,
        cached: true,
      });
    }
  } catch (error) {
    console.error('Cache read error:', error);
  }

  // Get fresh config
  const config = getAppConfig();
  
  // Add dynamic values if needed
  const dynamicConfig = {
    ...config,
    timestamp: new Date().toISOString(),
    environment: process.env.VERCEL_ENV || 'development',
  };

  // Cache for 1 hour
  try {
    await kv.set(cacheKey, dynamicConfig, { ex: 3600 });
  } catch (error) {
    console.error('Cache write error:', error);
  }

  return NextResponse.json({
    ...dynamicConfig,
    cached: false,
  });
}

// Force refresh endpoint (requires admin auth in production)
export async function POST(request: NextRequest) {
  try {
    // TODO: Add admin authentication check here
    const authHeader = request.headers.get('authorization');
    
    // Simple check for now - replace with proper admin auth
    if (!authHeader || authHeader !== `Bearer ${process.env.ADMIN_API_KEY}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Clear cache
    await kv.del('app:config:v1');
    
    // Return fresh config
    const config = getAppConfig();
    const dynamicConfig = {
      ...config,
      timestamp: new Date().toISOString(),
      environment: process.env.VERCEL_ENV || 'development',
    };
    
    // Re-cache
    await kv.set('app:config:v1', dynamicConfig, { ex: 3600 });
    
    return NextResponse.json({
      ...dynamicConfig,
      cached: false,
      refreshed: true,
    });
  } catch (error) {
    console.error('Config refresh error:', error);
    return NextResponse.json(
      { error: 'Failed to refresh config' },
      { status: 500 }
    );
  }
}