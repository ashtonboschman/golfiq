import { GpsCourseRequestStatus } from '@prisma/client';
import { NextRequest } from 'next/server';
import { z } from 'zod';
import { errorResponse, requireAuth, successResponse } from '@/lib/api-auth';
import { prisma } from '@/lib/db';
import { getLiveGpsAvailabilityForCourse } from '@/lib/gps/liveMapping';

const courseIdSchema = z.union([
  z.number().int().positive(),
  z.string().trim().regex(/^[1-9]\d*$/, 'Invalid courseId'),
]);

function parseCourseId(value: unknown) {
  const parsed = courseIdSchema.safeParse(value);
  if (!parsed.success) return null;

  try {
    return BigInt(parsed.data);
  } catch {
    return null;
  }
}

async function courseExists(courseId: bigint) {
  return prisma.course.findUnique({
    where: { id: courseId },
    select: { id: true },
  });
}

function handleError(error: unknown, method: 'GET' | 'POST') {
  if (error instanceof Error && error.message === 'Unauthorized') {
    return errorResponse('Unauthorized', 401);
  }

  console.error(`${method} /api/gps/course-requests error:`, error);
  return errorResponse('Unable to process GPS mapping request', 500);
}

export async function GET(request: NextRequest) {
  try {
    const userId = await requireAuth(request);
    const courseId = parseCourseId(new URL(request.url).searchParams.get('courseId'));
    if (!courseId) return errorResponse('Invalid courseId', 400);
    if (!await courseExists(courseId)) return errorResponse('Course not found', 404);

    const [currentRequest, requestCount] = await Promise.all([
      prisma.gpsCourseRequest.findUnique({
        where: { courseId_userId: { courseId, userId } },
        select: { status: true },
      }),
      prisma.gpsCourseRequest.count({
        where: { courseId, status: GpsCourseRequestStatus.REQUESTED },
      }),
    ]);

    return successResponse({
      requestedByCurrentUser: currentRequest?.status === GpsCourseRequestStatus.REQUESTED,
      status: currentRequest?.status ?? null,
      requestCount,
    });
  } catch (error) {
    return handleError(error, 'GET');
  }
}

export async function POST(request: NextRequest) {
  try {
    const userId = await requireAuth(request);
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return errorResponse('Invalid request body', 400);
    }

    const courseId = parseCourseId(
      body && typeof body === 'object' && 'courseId' in body
        ? (body as { courseId?: unknown }).courseId
        : undefined,
    );
    if (!courseId) return errorResponse('Invalid courseId', 400);
    if (!await courseExists(courseId)) return errorResponse('Course not found', 404);

    const availability = await getLiveGpsAvailabilityForCourse(courseId);
    if (availability.available && availability.coverage === 'full') {
      return errorResponse('Live GPS is already available for this course', 409);
    }

    const gpsRequest = await prisma.gpsCourseRequest.upsert({
      where: { courseId_userId: { courseId, userId } },
      create: {
        courseId,
        userId,
        status: GpsCourseRequestStatus.REQUESTED,
      },
      update: { status: GpsCourseRequestStatus.REQUESTED },
      select: { status: true },
    });

    return successResponse({
      requested: gpsRequest.status === GpsCourseRequestStatus.REQUESTED,
      status: gpsRequest.status,
      message: 'GPS mapping requested',
    });
  } catch (error) {
    return handleError(error, 'POST');
  }
}
