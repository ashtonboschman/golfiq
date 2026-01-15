import { NextRequest } from 'next/server';
import { prisma } from '@/lib/db';
import { requireAuth, errorResponse, successResponse } from '@/lib/api-auth';

// GET single tee by ID with holes
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAuth(request);
    const { id } = await params;
    const teeId = BigInt(id);

    const tee = await prisma.tee.findUnique({
      where: { id: teeId },
      include: {
        holes: {
          orderBy: { holeNumber: 'asc' },
        },
      },
    });

    if (!tee) {
      return errorResponse('Tee not found', 404);
    }

    // Format response - return as array to match original API
    const formattedTee = {
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
      holes: tee.holes.map(h => ({
        id: Number(h.id),
        tee_id: Number(h.teeId),
        hole_number: h.holeNumber,
        par: h.par,
        yardage: h.yardage,
        handicap: h.handicap,
      })),
    };

    return successResponse({ tees: [formattedTee] });
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return errorResponse('Unauthorized', 401);
    }

    console.error('GET /api/tees/:id error:', error);
    return errorResponse('Database error', 500);
  }
}
