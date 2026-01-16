import { NextRequest } from 'next/server';
import { prisma } from '@/lib/db';
import { requireAuth, errorResponse, successResponse } from '@/lib/api-auth';

// GET all tees (optional ?course_id=) with holes
export async function GET(request: NextRequest) {
  try {
    await requireAuth(request);

    const { searchParams } = new URL(request.url);
    const courseIdParam = searchParams.get('course_id');

    const whereClause = courseIdParam
      ? { courseId: BigInt(courseIdParam) }
      : {};

    const tees = await prisma.tee.findMany({
      where: whereClause,
      include: {
        holes: {
          orderBy: { holeNumber: 'asc' },
        },
      },
      orderBy: [{ courseId: 'asc' }, { id: 'asc' }],
    });

    // Format response to match original API structure
    const formattedTees = tees.map((tee: any) => ({
      id: Number(tee.id),
      course_id: Number(tee.courseId),
      gender: tee.gender,
      tee_name: tee.teeName,
      course_rating: tee.courseRating ? Number(tee.courseRating) : null,
      slope_rating: tee.slopeRating,
      bogey_rating: tee.bogeyRating ? Number(tee.bogeyRating) : null,
      total_yards: tee.totalYards,
      total_meters: tee.totalMeters,
      number_of_holes: tee.numberOfHoles,
      par_total: tee.parTotal,
      front_course_rating: tee.frontCourseRating ? Number(tee.frontCourseRating) : null,
      front_slope_rating: tee.frontSlopeRating,
      front_bogey_rating: tee.frontBogeyRating ? Number(tee.frontBogeyRating) : null,
      back_course_rating: tee.backCourseRating ? Number(tee.backCourseRating) : null,
      back_slope_rating: tee.backSlopeRating,
      back_bogey_rating: tee.backBogeyRating ? Number(tee.backBogeyRating) : null,
      holes: tee.holes.map((h: any) => ({
        id: Number(h.id),
        tee_id: Number(h.teeId),
        hole_number: h.holeNumber,
        par: h.par,
        yardage: h.yardage,
        handicap: h.handicap,
      })),
    }));

    return successResponse({ tees: formattedTees });
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return errorResponse('Unauthorized', 401);
    }

    console.error('GET /api/tees error:', error);
    return errorResponse('Database error', 500);
  }
}
