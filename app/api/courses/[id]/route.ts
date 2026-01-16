import { NextRequest } from 'next/server';
import { prisma } from '@/lib/db';
import { requireAuth, errorResponse, successResponse } from '@/lib/api-auth';
import { Hole } from '@prisma/client';

type HoleResponse = {
  id: number;
  hole_number: number;
  par: number;
  yardage: number | null;
  handicap: number | null;
};

type TeeResponse = {
  id: number;
  tee_name: string;
  gender: 'male' | 'female';
  course_rating: number | null;
  slope_rating: number | null;
  bogey_rating: number | null;
  total_yards: number | null;
  total_meters: number | null;
  number_of_holes: number | null;
  par_total: number | null;
  front_course_rating: number | null;
  front_slope_rating: number | null;
  front_bogey_rating: number | null;
  back_course_rating: number | null;
  back_slope_rating: number | null;
  back_bogey_rating: number | null;
  holes: HoleResponse[];
};

type CourseResponse = {
  id: number;
  club_name: string;
  course_name: string;
  created_date: string;
  updated_date: string;
  location: {
    state: string;
    country: string;
    address: string | null;
    city: string | null;
    latitude: number | null;
    longitude: number | null;
  };
  tees: {
    male: TeeResponse[];
    female: TeeResponse[];
  };
};

async function buildCourseResponse(
  courseId: bigint
): Promise<CourseResponse | null> {
  const course = await prisma.course.findUnique({
    where: { id: courseId },
    include: {
      location: true,
      tees: {
        include: {
          holes: {
            orderBy: { holeNumber: 'asc' },
          },
        },
        orderBy: { id: 'asc' },
      },
    },
  });

  if (!course) return null;

  const tees: CourseResponse['tees'] = { male: [], female: [] };

  for (const tee of course.tees) {
    if (tee.gender !== 'male' && tee.gender !== 'female') {
      continue;
    }

    const teeData: TeeResponse = {
      id: Number(tee.id),
      tee_name: tee.teeName,
      gender: tee.gender,
      course_rating: tee.courseRating ? Number(tee.courseRating) : null,
      slope_rating: tee.slopeRating,
      bogey_rating: tee.bogeyRating ? Number(tee.bogeyRating) : null,
      total_yards: tee.totalYards,
      total_meters: tee.totalMeters,
      number_of_holes: tee.numberOfHoles,
      par_total: tee.parTotal,
      front_course_rating: tee.frontCourseRating
        ? Number(tee.frontCourseRating)
        : null,
      front_slope_rating: tee.frontSlopeRating,
      front_bogey_rating: tee.frontBogeyRating
        ? Number(tee.frontBogeyRating)
        : null,
      back_course_rating: tee.backCourseRating
        ? Number(tee.backCourseRating)
        : null,
      back_slope_rating: tee.backSlopeRating,
      back_bogey_rating: tee.backBogeyRating
        ? Number(tee.backBogeyRating)
        : null,
      holes: tee.holes.map((h: Hole) => ({
        id: Number(h.id),
        hole_number: h.holeNumber,
        par: h.par,
        yardage: h.yardage,
        handicap: h.handicap,
      })),
    };

    tees[tee.gender].push(teeData);
  }

  return {
    id: Number(course.id),
    club_name: course.clubName,
    course_name: course.courseName,
    created_date: course.createdDate.toISOString(),
    updated_date: course.updatedDate.toISOString(),
    location: {
      state: course.location?.state ?? 'Unknown',
      country: course.location?.country ?? 'Unknown',
      address: course.location?.address ?? null,
      city: course.location?.city ?? null,
      latitude: course.location?.latitude
        ? Number(course.location.latitude)
        : null,
      longitude: course.location?.longitude
        ? Number(course.location.longitude)
        : null,
    },
    tees,
  };
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
): Promise<Response> {
  try {
    await requireAuth(request);

    const { id } = await context.params;

    if (!id) {
      return errorResponse('Missing course id', 400);
    }

    let courseId: bigint;
    try {
      courseId = BigInt(id);
    } catch {
      return errorResponse('Invalid course id', 400);
    }

    const course = await buildCourseResponse(courseId);

    if (!course) {
      return errorResponse(`Course with ID ${id} not found`, 404);
    }

    return successResponse({ message: '', course });
  } catch (error: unknown) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return errorResponse('Unauthorized', 401);
    }

    console.error('GET /api/courses/:id error:', error);
    return errorResponse('Failed to retrieve course', 500);
  }
}