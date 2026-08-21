import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin-auth';
import { GOLF_COURSE_API_PROVIDER } from '@/lib/courses/externalIds';
import { loadGolfCourseApiCourse } from '@/lib/courses/golfCourseApiServer';
import { logApiCall } from '@/lib/utils/apiRateLimit';

async function safeLogApiUsage(input: Parameters<typeof logApiCall>[0]) {
  try {
    await logApiCall(input);
  } catch (error) {
    console.error('Failed to write api_usage_logs entry:', error);
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const userId = await requireAdmin(request);
    const { id: rawId } = await params;
    const result = await loadGolfCourseApiCourse(rawId);

    if (!result.ok) {
      await safeLogApiUsage({
        endpoint: 'golf-course-api-course-detail',
        userId,
        provider: GOLF_COURSE_API_PROVIDER,
        resultCount: null,
        status: 'error',
        errorCode: result.errorCode,
      });

      return NextResponse.json(
        { error: result.error },
        { status: result.status },
      );
    }

    await safeLogApiUsage({
      endpoint: 'golf-course-api-course-detail',
      userId,
      provider: GOLF_COURSE_API_PROVIDER,
      resultCount: 1,
      status: 'success',
      errorCode: null,
    });

    return NextResponse.json({ course: result.course });
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (error instanceof Error && error.message === 'Forbidden') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    console.error('Golf Course API detail error:', error);
    return NextResponse.json(
      { error: 'An error occurred while loading golf course details' },
      { status: 500 },
    );
  }
}
