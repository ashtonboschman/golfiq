import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-auth';
import { checkRateLimit, logApiCall } from '@/lib/utils/apiRateLimit';

const GOLF_COURSE_API_PROVIDER = 'golf_course_api';

async function safeLogApiUsage(input: Parameters<typeof logApiCall>[0]) {
  try {
    await logApiCall(input);
  } catch (error) {
    console.error('Failed to write api_usage_logs entry:', error);
  }
}

export async function GET(request: NextRequest) {
  try {
    const userId = await requireAuth(request);

    const { searchParams } = new URL(request.url);
    const query = searchParams.get('query');
    const trimmedQuery = query?.trim() ?? '';
    const usedLocation = searchParams.has('lat') || searchParams.has('lng');

    if (!trimmedQuery) {
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
    const apiUrl = `https://api.golfcourseapi.com/v1/search?search_query=${encodeURIComponent(trimmedQuery)}`;
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

      await safeLogApiUsage({
        endpoint: 'golf-course-api-search',
        userId,
        provider: GOLF_COURSE_API_PROVIDER,
        searchQuery: trimmedQuery,
        usedLocation,
        resultCount: null,
        status: 'error',
        errorCode: `upstream_${response.status}`,
      });

      return NextResponse.json(
        { error: `Failed to search golf courses: ${response.status} ${response.statusText}` },
        { status: response.status }
      );
    }

    const data = await response.json();
    const resultCount = Array.isArray(data?.courses) ? data.courses.length : 0;

    await safeLogApiUsage({
      endpoint: 'golf-course-api-search',
      userId,
      provider: GOLF_COURSE_API_PROVIDER,
      searchQuery: trimmedQuery,
      usedLocation,
      resultCount,
      status: 'success',
      errorCode: null,
    });

    return NextResponse.json(data);
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    console.error('Search error:', error);
    return NextResponse.json(
      { error: 'An error occurred while searching' },
      { status: 500 }
    );
  }
}
