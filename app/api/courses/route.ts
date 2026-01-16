import { NextRequest } from 'next/server';
import { prisma } from '@/lib/db';
import { requireAuth, errorResponse, successResponse } from '@/lib/api-auth';

type HoleData = {
  id: number;
  hole_number: number;
  par: number;
  yardage: number | null;
  handicap: number | null;
};

type TeeData = {
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
  holes: HoleData[];
};

type TeeFromDB = {
  id: bigint;
  teeName: string;
  gender: 'male' | 'female';
  courseRating: string | null;
  slopeRating: number | null;
  bogeyRating: string | null;
  totalYards: number | null;
  totalMeters: number | null;
  numberOfHoles: number | null;
  parTotal: number | null;
  frontCourseRating: string | null;
  frontSlopeRating: number | null;
  frontBogeyRating: string | null;
  backCourseRating: string | null;
  backSlopeRating: number | null;
  backBogeyRating: string | null;
  holes: Array<{
    id: bigint;
    holeNumber: number;
    par: number;
    yardage: number | null;
    handicap: number | null;
  }>;
};

// Helper to build full course response with tees and holes
async function buildCourseResponse(courseId: bigint | string) {
  const course = await prisma.course.findUnique({
    where: { id: typeof courseId === 'string' ? BigInt(courseId) : courseId },
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

  // Group tees by gender
  const tees: { male: TeeData[]; female: TeeData[] } = { male: [], female: [] };

  course.tees.forEach((tee) => {

    const gender = tee.gender === 'male' || tee.gender === 'female' ? tee.gender : 'male';

    const teeData: TeeData = {
      id: Number(tee.id),
      tee_name: tee.teeName,
      gender,
      course_rating: tee.courseRating ? Number(tee.courseRating) : null,
      slope_rating: tee.slopeRating ?? null,
      bogey_rating: tee.bogeyRating ? Number(tee.bogeyRating) : null,
      total_yards: tee.totalYards ?? null,
      total_meters: tee.totalMeters ?? null,
      number_of_holes: tee.numberOfHoles ?? null,
      par_total: tee.parTotal ?? null,
      front_course_rating: tee.frontCourseRating ? Number(tee.frontCourseRating) : null,
      front_slope_rating: tee.frontSlopeRating ?? null,
      front_bogey_rating: tee.frontBogeyRating ? Number(tee.frontBogeyRating) : null,
      back_course_rating: tee.backCourseRating ? Number(tee.backCourseRating) : null,
      back_slope_rating: tee.backSlopeRating ?? null,
      back_bogey_rating: tee.backBogeyRating ? Number(tee.backBogeyRating) : null,
      holes: tee.holes.map((h) => ({
        id: Number(h.id),
        hole_number: h.holeNumber,
        par: h.par,
        yardage: h.yardage ?? null,
        handicap: h.handicap ?? null,
      })),
    };

    tees[gender].push(teeData);
  });

  return {
    id: Number(course.id),
    club_name: course.clubName,
    course_name: course.courseName,
    verified: course.verified,
    created_date: course.createdDate,
    updated_date: course.updatedDate,
    location: {
      state: course.location?.state || 'Unknown',
      country: course.location?.country || 'Unknown',
      address: course.location?.address || null,
      city: course.location?.city || null,
      latitude: course.location?.latitude ? Number(course.location.latitude) : null,
      longitude: course.location?.longitude ? Number(course.location.longitude) : null,
    },
    tees,
  };
}

// GET all courses
export async function GET(request: NextRequest) {
  try {
    await requireAuth(request);

    const { searchParams } = new URL(request.url);
    const limit = parseInt(searchParams.get('limit') || '20');
    const page = parseInt(searchParams.get('page') || '1');
    const search = searchParams.get('search');
    const userLat = searchParams.get('lat');
    const userLng = searchParams.get('lng');

    const skip = (page - 1) * limit;

    // If user location is provided, use raw SQL with distance calculation
    if (userLat && userLng) {
      const lat = parseFloat(userLat);
      const lng = parseFloat(userLng);

      if (isNaN(lat) || isNaN(lng)) {
        return errorResponse('Invalid latitude or longitude', 400);
      }

      // Raw SQL query with Haversine formula for distance calculation
      let courses: any[];

      if (search) {
        const searchPattern = `%${search}%`;
        courses = await prisma.$queryRaw`
          SELECT
            c.id,
            c.course_name,
            c.club_name,
            c.verified,
            c.created_date,
            c.updated_date,
            l.state,
            l.country,
            l.address,
            l.city,
            l.latitude,
            l.longitude,
            (
              6371 * acos(
                LEAST(1.0,
                  cos(radians(${lat})) * cos(radians(l.latitude::float)) *
                  cos(radians(l.longitude::float) - radians(${lng})) +
                  sin(radians(${lat})) * sin(radians(l.latitude::float))
                )
              )
            ) as distance
          FROM courses c
          LEFT JOIN locations l ON c.id = l.course_id
          WHERE l.latitude IS NOT NULL
            AND l.longitude IS NOT NULL
            AND (c.club_name ILIKE ${searchPattern} OR c.course_name ILIKE ${searchPattern} OR l.city ILIKE ${searchPattern})
          ORDER BY distance ASC, c.club_name ASC
          LIMIT ${limit}
          OFFSET ${skip}
        `;
      } else {
        courses = await prisma.$queryRaw`
          SELECT
            c.id,
            c.course_name,
            c.club_name,
            c.verified,
            c.created_date,
            c.updated_date,
            l.state,
            l.country,
            l.address,
            l.city,
            l.latitude,
            l.longitude,
            (
              6371 * acos(
                LEAST(1.0,
                  cos(radians(${lat})) * cos(radians(l.latitude::float)) *
                  cos(radians(l.longitude::float) - radians(${lng})) +
                  sin(radians(${lat})) * sin(radians(l.latitude::float))
                )
              )
            ) as distance
          FROM courses c
          LEFT JOIN locations l ON c.id = l.course_id
          WHERE l.latitude IS NOT NULL AND l.longitude IS NOT NULL
          ORDER BY distance ASC, c.club_name ASC
          LIMIT ${limit}
          OFFSET ${skip}
        `;
      }

      if (!courses.length) {
        return successResponse({ message: 'No courses found', courses: [] });
      }

      // Build full course responses
      const courseResponses = await Promise.all(
        courses.map(c => buildCourseResponse(c.id))
      );

      // Add distance to each course response
      const coursesWithDistance = courseResponses
        .filter(c => c !== null)
        .map((course, index) => ({
          ...course,
          distance: courses[index]?.distance ? Number(courses[index].distance) : undefined,
        }));

      return successResponse({
        message: '',
        courses: coursesWithDistance,
      });
    }

    // Fallback to regular query without distance sorting
    const where = search
      ? {
          OR: [
            {
              courseName: {
                contains: search,
                mode: 'insensitive' as const,
              },
            },
            {
              location: {
                city: {
                  contains: search,
                  mode: 'insensitive' as const,
                },
              },
            },
          ],
        }
      : {};

    const courses = await prisma.course.findMany({
      where,
      include: {
        location: true,
      },
      orderBy: { clubName: 'asc' },
      take: limit,
      skip,
    });

    if (!courses.length) {
      return successResponse({ message: 'No courses found', courses: [] });
    }

    // Build full course responses
    const courseResponses = await Promise.all(
      courses.map(c => buildCourseResponse(c.id))
    );

    return successResponse({
      message: '',
      courses: courseResponses.filter(c => c !== null),
    });
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return errorResponse('Unauthorized', 401);
    }

    console.error('GET /api/courses error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return errorResponse(`Failed to retrieve courses: ${errorMessage}`, 500);
  }
}

// POST - Create new course with location, tees, and holes
// Helper function to convert string to title case
function toTitleCase(str: string | null | undefined): string | null {
  if (!str) return null;
  return str
    .toLowerCase()
    .split(' ')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

// Helper function to extract just the street address from a full address string
// Expected format: "316 Winding River Blvd, Maineville, OH 45039, USA"
// Returns just: "316 Winding River Blvd"
function extractStreetAddress(fullAddress: string | null | undefined): string | null {
  if (!fullAddress) return null;

  const parts = fullAddress.split(',').map(part => part.trim());

  if (parts.length < 4) {
    // If there aren't 4 parts (address, city, state+zip, country), return the whole thing
    return fullAddress;
  }

  // Everything before the last 3 parts (city, state+zip, country) is the street address
  return parts.slice(0, parts.length - 3).join(', ');
}

export async function POST(request: NextRequest) {
  try {
    await requireAuth(request);

    const body = await request.json();
    const { id: courseIdFromApi, club_name, course_name, location, tees } = body;

    if (!courseIdFromApi || !club_name || !course_name) {
      return errorResponse('Course ID, club name, and course name are required', 400);
    }

    // Check if course already exists
    const existing = await prisma.course.findUnique({
      where: { id: BigInt(courseIdFromApi) },
    });

    if (existing) {
      return errorResponse('Course with this ID already exists', 409);
    }

    // Create course
    const course = await prisma.course.create({
      data: {
        id: BigInt(courseIdFromApi),
        clubName: club_name,
        courseName: course_name,
      },
    });

    // Create location if provided
    if (location) {
      // Extract just the street address from the full address string
      const streetAddress = location.address ? extractStreetAddress(location.address) : null;

      await prisma.location.create({
        data: {
          courseId: course.id,
          address: toTitleCase(streetAddress),
          city: toTitleCase(location.city),
          state: location.state?.toUpperCase() || null, // State codes should be uppercase (e.g., MB, CA)
          country: toTitleCase(location.country),
          latitude: location.latitude ? String(location.latitude) : null,
          longitude: location.longitude ? String(location.longitude) : null,
        },
      });
    }

    // Track rejected tees for user feedback
    const rejectedTees: string[] = [];

    // Create tees and holes if provided
    if (tees) {

      for (const gender of ['male', 'female']) {
        const genderTees = tees[gender];
        if (!genderTees || !Array.isArray(genderTees)) continue;

        for (const tee of genderTees) {
          const {
            id: teeIdFromApi,
            tee_name,
            course_rating,
            slope_rating,
            bogey_rating,
            total_yards,
            total_meters,
            number_of_holes,
            par_total,
            front_course_rating,
            front_slope_rating,
            front_bogey_rating,
            back_course_rating,
            back_slope_rating,
            back_bogey_rating,
            holes: teeHoles,
          } = tee;

          // Validate tee name - reject "Combo" or tees containing "/" or "-"
          const teeName = tee_name || '';
          if (teeName.toLowerCase().includes('combo') || teeName.includes('/') || teeName.includes('-')) {
            rejectedTees.push(`${teeName} (${gender})`);
            continue; // Skip this tee
          }

          const createdTee = await prisma.tee.create({
            data: {
              id: teeIdFromApi ? BigInt(teeIdFromApi) : undefined,
              courseId: course.id,
              gender: gender as 'male' | 'female',
              teeName: toTitleCase(tee_name) || tee_name,
              courseRating: course_rating ? String(course_rating) : null,
              slopeRating: slope_rating || null,
              bogeyRating: bogey_rating ? String(bogey_rating) : null,
              totalYards: total_yards || null,
              totalMeters: total_meters || null,
              numberOfHoles: number_of_holes || null,
              parTotal: par_total || null,
              frontCourseRating: front_course_rating ? String(front_course_rating) : null,
              frontSlopeRating: front_slope_rating || null,
              frontBogeyRating: front_bogey_rating ? String(front_bogey_rating) : null,
              backCourseRating: back_course_rating ? String(back_course_rating) : null,
              backSlopeRating: back_slope_rating || null,
              backBogeyRating: back_bogey_rating ? String(back_bogey_rating) : null,
            },
          });

          // Create holes for this tee
          if (teeHoles && Array.isArray(teeHoles) && teeHoles.length > 0) {
            for (let i = 0; i < teeHoles.length; i++) {
              const { par, yardage, handicap } = teeHoles[i];
              await prisma.hole.create({
                data: {
                  teeId: createdTee.id,
                  holeNumber: i + 1,
                  par: par || null,
                  yardage: yardage || null,
                  handicap: handicap || null,
                },
              });
            }
          }
        }
      }
    }

    // Build and return full course response
    const fullCourse = await buildCourseResponse(course.id);

    let message = 'Course created successfully';
    if (rejectedTees.length > 0) {
      message += `. Note: ${rejectedTees.length} tee(s) were skipped (Combo or "/" tees): ${rejectedTees.join(', ')}`;
    }

    return successResponse({
      message,
      course: fullCourse,
      rejectedTees: rejectedTees.length > 0 ? rejectedTees : undefined,
    });
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return errorResponse('Unauthorized', 401);
    }

    console.error('POST /api/courses error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return errorResponse('Failed to create course: ' + errorMessage, 500);
  }
}
