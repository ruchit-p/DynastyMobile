import { NextRequest, NextResponse } from 'next/server';
import { kv } from '@vercel/kv';

// Using Node.js runtime for better compatibility
// export const runtime = 'edge';

const FIREBASE_FUNCTIONS_URL = process.env.NEXT_PUBLIC_FIREBASE_FUNCTIONS_URL || 
  `https://us-central1-${process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID}.cloudfunctions.net`;

export async function GET(request: NextRequest) {
  // Support pagination via query params
  const searchParams = request.nextUrl.searchParams;
  const page = searchParams.get('page') || '1';
  const limit = searchParams.get('limit') || '10';
  
  // Cache key includes pagination params
  const cacheKey = `public:feed:preview:${page}:${limit}`;
  
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

  // Cache miss - fetch from Firebase
  // Note: In production, you'd create a public Firebase function for this
  // For now, returning mock data structure
  try {
    // TODO: Replace with actual Firebase function call
    // const response = await fetch(`${FIREBASE_FUNCTIONS_URL}/getPublicFeed`, {
    //   method: 'POST',
    //   headers: { 'Content-Type': 'application/json' },
    //   body: JSON.stringify({ page: parseInt(page), limit: parseInt(limit) })
    // });
    
    // Mock response structure
    const feedData = {
      stories: [
        {
          id: 'mock-story-1',
          title: 'Welcome to Dynasty',
          content: 'This is a sample public story.',
          authorName: 'Dynasty Team',
          createdAt: new Date().toISOString(),
          privacy: 'public',
          likes: 42,
          commentCount: 5,
          media: [],
        },
      ],
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: 1,
        hasMore: false,
      },
      featuredFamilies: [
        {
          id: 'featured-1',
          name: 'Sample Family',
          memberCount: 25,
          storyCount: 150,
        },
      ],
    };

    // Cache for 5 minutes
    try {
      await kv.set(cacheKey, feedData, { ex: 300 });
    } catch (error) {
      console.error('Cache write error:', error);
    }

    return NextResponse.json({
      ...feedData,
      cached: false,
    });
  } catch (error) {
    console.error('Failed to fetch public feed:', error);
    
    // Return cached data if available, even if expired
    try {
      const staleCache = await kv.get(cacheKey);
      if (staleCache) {
        return NextResponse.json({
          ...staleCache,
          cached: true,
          stale: true,
        });
      }
    } catch {
      // Ignore cache errors
    }
    
    return NextResponse.json(
      { error: 'Failed to fetch public feed' },
      { status: 500 }
    );
  }
}

// Invalidate cache endpoint
export async function POST(request: NextRequest) {
  try {
    // Clear all public feed cache entries
    const keys = await kv.keys('public:feed:preview:*');
    
    if (keys.length > 0) {
      await Promise.all(keys.map(key => kv.del(key)));
    }
    
    return NextResponse.json({ 
      success: true, 
      cleared: keys.length 
    });
  } catch (error) {
    console.error('Cache invalidation error:', error);
    return NextResponse.json(
      { error: 'Failed to invalidate cache' },
      { status: 500 }
    );
  }
}