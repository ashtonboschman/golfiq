import { NextRequest } from 'next/server';
import { errorResponse, requireAuth, successResponse } from '@/lib/api-auth';
import {
  getLiveGpsMappingForCourse,
  LiveGpsMappingError,
} from '@/lib/gps/liveMapping';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ courseId: string }> },
) {
  try {
    await requireAuth(request);
    const { courseId } = await params;
    const mapping = await getLiveGpsMappingForCourse(courseId);
    return successResponse(mapping);
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return errorResponse('Unauthorized', 401);
    }

    if (error instanceof LiveGpsMappingError) {
      return errorResponse(error.message, error.status);
    }

    console.error('GET /api/gps/live/course/[courseId] error:', error);
    return errorResponse('Database error', 500);
  }
}
