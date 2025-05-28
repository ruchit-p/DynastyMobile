import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { email, password, firstName, lastName } = body;

    // TODO: Implement actual Firebase user creation
    // For now, return a mock response
    if (!email || !password || !firstName || !lastName) {
      return NextResponse.json(
        { error: 'All fields are required' },
        { status: 400 }
      );
    }

    // Mock successful response
    return NextResponse.json({
      success: true,
      message: 'Signup endpoint ready for Firebase integration',
      user: {
        email,
        firstName,
        lastName,
        id: 'mock-user-id'
      }
    });
  } catch (error) {
    console.error('Signup error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}