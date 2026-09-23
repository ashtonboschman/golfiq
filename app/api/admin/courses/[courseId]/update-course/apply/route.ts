import { NextRequest } from 'next/server';
import { requireAdmin } from '@/lib/admin-auth';
import { errorResponse, successResponse } from '@/lib/api-auth';
import { applyCourseReconciliation } from '@/lib/courses/update/apply';
import { ReconciliationError } from '@/lib/courses/update/errors';
import { applyReconciliationSchema, parsePositiveCourseId } from '@/lib/courses/update/schemas';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ courseId: string }> },
) {
  try {
    const adminUserId = await requireAdmin(request);
    const { courseId: rawCourseId } = await params;
    const courseId = parsePositiveCourseId(rawCourseId);
    const parsed = applyReconciliationSchema.safeParse(await request.json());
    if (!parsed.success) return errorResponse('Invalid reconciliation selection.', 400);
    if (parsed.data.courseId !== courseId.toString()) {
      return errorResponse('Course ID does not match the request path.', 400);
    }

    const result = await applyCourseReconciliation(parsed.data, adminUserId);
    return successResponse({
      message: 'Selected course updates were applied.',
      ...result,
    });
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') return errorResponse('Unauthorized', 401);
    if (error instanceof Error && error.message === 'Forbidden') return errorResponse('Forbidden', 403);
    if (error instanceof ReconciliationError) return errorResponse(error.message, error.status);
    if (error instanceof SyntaxError) return errorResponse('Invalid JSON request body.', 400);
    if (error instanceof Error && error.message === 'Invalid course ID.') return errorResponse(error.message, 400);
    console.error('Course reconciliation apply error:', error);
    return errorResponse('Failed to apply course updates.', 500);
  }
}
