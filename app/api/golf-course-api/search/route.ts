import { NextRequest, NextResponse } from 'next/server';
import { checkRateLimit, logApiCall } from '@/lib/utils/apiRateLimit';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const query = searchParams.get('query');

    if (!query || query.trim().length === 0) {
      return NextResponse.json(
        { error: 'Search query is required' },
        { status: 400 }
      );
    }

    // Check rate limit (200 calls per day globally)
    const rateLimit = await checkRateLimit('golf-course-api-search', 200);

    if (!rateLimit.canProceed) {
      return NextResponse.json(
        {
          error: 'Daily API limit reached. Please try again tomorrow.',
          callsUsed: rateLimit.callsUsed,
          limit: rateLimit.limit
        },
        { status: 429 }
      );
    }

    const apiKey = process.env.GOLF_COURSE_API_KEY;
    if (!apiKey) {
      console.error('GOLF_COURSE_API_KEY is not set in environment variables');
      return NextResponse.json(
        { error: 'Golf Course API is not configured' },
        { status: 500 }
      );
    }

    // Call the Golf Course API
    // The API key format is "Key XXXXXXXXX" so we pass it directly as the Authorization header
    const apiUrl = `https://api.golfcourseapi.com/v1/search?search_query=${encodeURIComponent(query)}`;
    const response = await fetch(apiUrl, {
      headers: {
        'Authorization': apiKey, // API key already includes "Key " prefix
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Golf Course API error:', {
        status: response.status,
        statusText: response.statusText,
        body: errorText,
        headers: Object.fromEntries(response.headers.entries()),
      });
      return NextResponse.json(
        { error: `Failed to search golf courses: ${response.status} ${response.statusText}` },
        { status: response.status }
      );
    }

    const data = await response.json();

    // Log the API call (only after successful external API call)
    await logApiCall('golf-course-api-search');

    return NextResponse.json(data);
  } catch (error) {
    console.error('Search error:', error);
    return NextResponse.json(
      { error: 'An error occurred while searching' },
      { status: 500 }
    );
  }
}
