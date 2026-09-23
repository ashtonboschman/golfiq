import { NextRequest } from 'next/server';
import { requireAdmin } from '@/lib/admin-auth';
import { errorResponse, successResponse } from '@/lib/api-auth';
import { compareCourseWithProvider } from '@/lib/courses/update/compare';
import { ReconciliationError } from '@/lib/courses/update/errors';
import { compareReconciliationSchema, parsePositiveCourseId } from '@/lib/courses/update/schemas';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ courseId: string }> },
) {
  try {
    await requireAdmin(request);
    const { courseId: rawCourseId } = await params;
    const courseId = parsePositiveCourseId(rawCourseId);
    const parsed = compareReconciliationSchema.safeParse(await request.json());
    if (!parsed.success) return errorResponse('Invalid comparison request.', 400);

    const comparison = await compareCourseWithProvider({
      courseId,
      manualMatches: parsed.data.manualMatches,
    });
    return successResponse({ comparison });
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') return errorResponse('Unauthorized', 401);
    if (error instanceof Error && error.message === 'Forbidden') return errorResponse('Forbidden', 403);
    if (error instanceof ReconciliationError) return errorResponse(error.message, error.status);
    if (error instanceof SyntaxError) return errorResponse('Invalid JSON request body.', 400);
    if (error instanceof Error && error.message === 'Invalid course ID.') return errorResponse(error.message, 400);
    console.error('Course reconciliation compare error:', error);
    return errorResponse('Failed to compare course data.', 500);
  }
}
