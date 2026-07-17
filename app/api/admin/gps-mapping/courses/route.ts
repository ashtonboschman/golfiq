import { NextRequest } from 'next/server';
import { requireAdmin } from '@/lib/admin-auth';
import { errorResponse, successResponse } from '@/lib/api-auth';
import {
  getGpsMappingCoursePage,
  parseCoordinate,
  parseMappingStatusFilter,
} from '@/lib/gps/mappingCourseList';

export async function GET(request: NextRequest) {
  try {
    await requireAdmin(request);

    const { searchParams } = new URL(request.url);
    const rawPage = Number.parseInt(searchParams.get('page') ?? '1', 10);
    const page = Number.isFinite(rawPage) ? Math.max(1, rawPage) : 1;
    const query = searchParams.get('q')?.trim().slice(0, 120) ?? '';
    const status = parseMappingStatusFilter(searchParams.get('status') ?? undefined);
    const latitude = parseCoordinate(searchParams.get('lat') ?? undefined, -90, 90);
    const longitude = parseCoordinate(searchParams.get('lng') ?? undefined, -180, 180);
    const result = await getGpsMappingCoursePage({
      query,
      status,
      latitude,
      longitude,
      page,
    });

    return successResponse(result);
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return errorResponse('Unauthorized', 401);
    }
    if (error instanceof Error && error.message === 'Forbidden') {
      return errorResponse('Forbidden', 403);
    }

    console.error('GET /api/admin/gps-mapping/courses error:', error);
    return errorResponse('Failed to load GPS mapping courses', 500);
  }
}
