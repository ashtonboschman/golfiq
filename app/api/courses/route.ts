import { NextRequest } from 'next/server';
import { prisma } from '@/lib/db';
import { requireAuth, errorResponse, successResponse } from '@/lib/api-auth';
import { requireAdmin } from '@/lib/admin-auth';
import { GOLF_COURSE_API_PROVIDER, normalizeExternalId } from '@/lib/courses/externalIds';
import { Prisma } from '@prisma/client';
import { z } from 'zod';

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
  non_par3_holes: number | null;
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
  courseRating: string | number | null;
  slopeRating: number | null;
  bogeyRating: string | number | null;
  totalYards: number | null;
  totalMeters: number | null;
  numberOfHoles: number | null;
  nonPar3Holes: number | null;
  parTotal: number | null;
  frontCourseRating: string | number | null;
  frontSlopeRating: number | null;
  frontBogeyRating: string | number | null;
  backCourseRating: string | number | null;
  backSlopeRating: number | null;
  backBogeyRating: string | number | null;
  holes: Array<{
    id: bigint;
    holeNumber: number;
    par: number;
    yardage: number | null;
    handicap: number | null;
  }>;
};

const numberLikeSchema = z.union([
  z.number(),
  z.string().trim().regex(/^-?\d+(\.\d+)?$/, 'Must be a valid number'),
]);

const holeInputSchema = z.object({
  par: numberLikeSchema.nullable().optional(),
  yardage: numberLikeSchema.nullable().optional(),
  handicap: numberLikeSchema.nullable().optional(),
}).passthrough();

const teeInputSchema = z.object({
  id: numberLikeSchema.nullable().optional(),
  tee_name: z.string().trim().min(1).max(100),
  course_rating: numberLikeSchema.nullable().optional(),
  slope_rating: numberLikeSchema.nullable().optional(),
  bogey_rating: numberLikeSchema.nullable().optional(),
  total_yards: numberLikeSchema.nullable().optional(),
  total_meters: numberLikeSchema.nullable().optional(),
  number_of_holes: numberLikeSchema.nullable().optional(),
  par_total: numberLikeSchema.nullable().optional(),
  front_course_rating: numberLikeSchema.nullable().optional(),
  front_slope_rating: numberLikeSchema.nullable().optional(),
  front_bogey_rating: numberLikeSchema.nullable().optional(),
  back_course_rating: numberLikeSchema.nullable().optional(),
  back_slope_rating: numberLikeSchema.nullable().optional(),
  back_bogey_rating: numberLikeSchema.nullable().optional(),
  holes: z.array(holeInputSchema).max(36).optional(),
}).passthrough();

const externalIdSchema = z.string().trim().min(1, 'external_id must not be empty').max(255);
const providerSchema = z.string().trim().min(1, 'provider must not be empty').max(100);

const createCourseSchema = z.object({
  // `id` remains an accepted legacy import field, but is always an opaque
  // external identifier and is never assigned to Course.id.
  id: externalIdSchema.optional(),
  provider: providerSchema.optional(),
  external_id: externalIdSchema.optional(),
  club_name: z.string().trim().min(1).max(255),
  course_name: z.string().trim().min(1).max(255),
  location: z.object({
    address: z.string().trim().max(255).nullable().optional(),
    city: z.string().trim().max(100).nullable().optional(),
    state: z.string().trim().max(50).nullable().optional(),
    country: z.string().trim().max(50).nullable().optional(),
    latitude: numberLikeSchema.nullable().optional(),
    longitude: numberLikeSchema.nullable().optional(),
  }).passthrough().nullable().optional(),
  tees: z.object({
    male: z.array(teeInputSchema).max(20).optional(),
    female: z.array(teeInputSchema).max(20).optional(),
  }).passthrough().nullable().optional(),
}).passthrough().superRefine((data, context) => {
  const hasExplicitProvider = data.provider !== undefined;
  const hasExplicitExternalId = data.external_id !== undefined;

  if (hasExplicitProvider !== hasExplicitExternalId) {
    context.addIssue({
      code: 'custom',
      message: 'provider and external_id must be supplied together',
      path: hasExplicitProvider ? ['external_id'] : ['provider'],
    });
  }

  if (data.id && data.external_id && data.id !== data.external_id) {
    context.addIssue({
      code: 'custom',
      message: 'id and external_id must match when both are supplied',
      path: ['external_id'],
    });
  }
});

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

  (course.tees as any).forEach((tee: TeeFromDB) => {

    const gender = tee.gender === 'male' || tee.gender === 'female' ? tee.gender : 'male';

    const teeData: TeeData = {
      id: Number(tee.id),
      tee_name: tee.teeName,
      gender,
      course_rating: tee.courseRating != null ? Number(tee.courseRating) : null,
      slope_rating: tee.slopeRating ?? null,
      bogey_rating: tee.bogeyRating != null ? Number(tee.bogeyRating) : null,
      total_yards: tee.totalYards ?? null,
      total_meters: tee.totalMeters ?? null,
      number_of_holes: tee.numberOfHoles ?? null,
      non_par3_holes: tee.nonPar3Holes ?? null,
      par_total: tee.parTotal ?? null,
      front_course_rating: tee.frontCourseRating != null ? Number(tee.frontCourseRating) : null,
      front_slope_rating: tee.frontSlopeRating ?? null,
      front_bogey_rating: tee.frontBogeyRating != null ? Number(tee.frontBogeyRating) : null,
      back_course_rating: tee.backCourseRating != null ? Number(tee.backCourseRating) : null,
      back_slope_rating: tee.backSlopeRating ?? null,
      back_bogey_rating: tee.backBogeyRating != null ? Number(tee.backBogeyRating) : null,
      holes: tee.holes.map((h: any) => ({
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
    created_at: course.createdAt,
    updated_at: course.updatedAt,
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
    const rawLimit = parseInt(searchParams.get('limit') || '20', 10);
    const rawPage = parseInt(searchParams.get('page') || '1', 10);
    const limit = Number.isFinite(rawLimit) ? Math.min(Math.max(rawLimit, 1), 100) : 20;
    const page = Number.isFinite(rawPage) ? Math.max(rawPage, 1) : 1;
    const search = searchParams.get('search')?.trim().slice(0, 120);
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
            c.created_at,
            c.updated_at,
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
            AND (
              c.club_name ILIKE ${searchPattern}
              OR c.course_name ILIKE ${searchPattern}
              OR l.city ILIKE ${searchPattern}
              OR l.state ILIKE ${searchPattern}
            )
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
            c.created_at,
            c.updated_at,
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
        courses.map((c: any) => buildCourseResponse(c.id))
      );

      // Add distance to each course response
      const coursesWithDistance = courseResponses
        .filter((c: any) => c !== null)
        .map((course: any, index: any) => ({
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
              clubName: {
                contains: search,
                mode: 'insensitive' as const,
              },
            },
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
            {
              location: {
                state: {
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
      courses.map((c: any) => buildCourseResponse(c.id))
    );

    return successResponse({
      message: '',
      courses: courseResponses.filter((c: any) => c !== null),
    });
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return errorResponse('Unauthorized', 401);
    }

    console.error('GET /api/courses error:', error);
    return errorResponse('Failed to retrieve courses', 500);
  }
}

// POST - Create new course with location, tees, and holes
// Helper function to convert string to title case
function toTitleCase(str: string | null | undefined): string | null {
  if (!str) return null;
  return str
    .toLowerCase()
    .split(' ')
    .map((word: any) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

// Helper function to extract just the street address from a full address string
// Expected format: "316 Winding River Blvd, Maineville, OH 45039, USA"
// Returns just: "316 Winding River Blvd"
function extractStreetAddress(fullAddress: string | null | undefined): string | null {
  if (!fullAddress) return null;

  const parts = fullAddress.split(',').map((part: any) => part.trim());

  if (parts.length < 4) {
    // If there aren't 4 parts (address, city, state+zip, country), return the whole thing
    return fullAddress;
  }

  // Everything before the last 3 parts (city, state+zip, country) is the street address
  return parts.slice(0, parts.length - 3).join(', ');
}

type CreateCourseInput = z.infer<typeof createCourseSchema>;

type ExternalIdentity = {
  provider: string;
  externalId: string;
};

class DuplicateExternalCourseError extends Error {
  courseId: bigint;

  constructor(courseId: bigint) {
    super(`This provider course is already linked to GolfIQ course ${courseId.toString()}.`);
    this.name = 'DuplicateExternalCourseError';
    this.courseId = courseId;
  }
}

function resolveExternalIdentity(input: CreateCourseInput): ExternalIdentity | null {
  if (input.provider && input.external_id) {
    return {
      provider: input.provider.trim(),
      externalId: normalizeExternalId(input.external_id),
    };
  }

  if (input.id) {
    return {
      provider: GOLF_COURSE_API_PROVIDER,
      externalId: normalizeExternalId(input.id),
    };
  }

  return null;
}

function isUniqueConstraintError(error: unknown): boolean {
  return (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002')
    || Boolean(error && typeof error === 'object' && 'code' in error && error.code === 'P2002');
}

async function findCourseIdByExternalIdentity(identity: ExternalIdentity): Promise<bigint | null> {
  const existing = await prisma.courseExternalId.findUnique({
    where: {
      providerExternalId: identity,
    },
    select: { courseId: true },
  });

  return existing?.courseId ?? null;
}

function duplicateExternalCourseResponse(courseId: bigint) {
  return errorResponse(
    `This provider course is already linked to GolfIQ course ${courseId.toString()}.`,
    409,
  );
}

export async function POST(request: NextRequest) {
  try {
    await requireAdmin(request);

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return errorResponse('Invalid request body', 400);
    }

    if (!body || typeof body !== 'object') {
      return errorResponse('Invalid request body', 400);
    }

    const parsed = createCourseSchema.safeParse(body);
    if (!parsed.success) {
      return errorResponse(parsed.error.issues[0]?.message || 'Invalid course payload', 400);
    }

    const { club_name, course_name, location, tees } = parsed.data;
    const externalIdentity = resolveExternalIdentity(parsed.data);

    if (externalIdentity) {
      const existingCourseId = await findCourseIdByExternalIdentity(externalIdentity);
      if (existingCourseId) return duplicateExternalCourseResponse(existingCourseId);
    }

    let courseId: bigint;
    let rejectedTees: string[];

    try {
      const result = await prisma.$transaction(async (tx) => {
        if (externalIdentity) {
          const existing = await tx.courseExternalId.findUnique({
            where: {
              providerExternalId: externalIdentity,
            },
            select: { courseId: true },
          });

          if (existing) throw new DuplicateExternalCourseError(existing.courseId);
        }

        // Course.id is intentionally omitted so PostgreSQL owns internal IDs.
        const course = await tx.course.create({
          data: {
            clubName: club_name,
            courseName: course_name,
          },
        });

        if (externalIdentity) {
          await tx.courseExternalId.create({
            data: {
              courseId: course.id,
              provider: externalIdentity.provider,
              externalId: externalIdentity.externalId,
            },
          });
        }

        if (location) {
          const streetAddress = location.address ? extractStreetAddress(location.address) : null;

          await tx.location.create({
            data: {
              courseId: course.id,
              address: toTitleCase(streetAddress),
              city: toTitleCase(location.city),
              state: location.state?.toUpperCase() || null,
              country: toTitleCase(location.country),
              latitude: location.latitude ? String(location.latitude) : null,
              longitude: location.longitude ? String(location.longitude) : null,
            },
          });
        }

        const skippedTees: string[] = [];

        if (tees) {
          for (const gender of ['male', 'female'] as const) {
            const genderTees = tees[gender];
            if (!genderTees) continue;

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

              const teeName = tee_name || '';
              if (teeName.toLowerCase().includes('combo') || teeName.includes('/') || teeName.includes('-')) {
                skippedTees.push(`${teeName} (${gender})`);
                continue;
              }

              const nonPar3Count = teeHoles?.reduce(
                (count, hole) => hole.par && Number(hole.par) !== 3 ? count + 1 : count,
                0,
              ) ?? 0;

              const createdTee = await tx.tee.create({
                data: {
                  id: teeIdFromApi ? BigInt(teeIdFromApi) : undefined,
                  courseId: course.id,
                  gender,
                  teeName: toTitleCase(tee_name) || tee_name,
                  courseRating: course_rating ? String(course_rating) : null,
                  slopeRating: slope_rating ? Number(slope_rating) : null,
                  bogeyRating: bogey_rating ? String(bogey_rating) : null,
                  totalYards: total_yards ? Number(total_yards) : null,
                  totalMeters: total_meters ? Number(total_meters) : null,
                  numberOfHoles: number_of_holes ? Number(number_of_holes) : null,
                  nonPar3Holes: nonPar3Count,
                  parTotal: par_total ? Number(par_total) : null,
                  frontCourseRating: front_course_rating ? String(front_course_rating) : null,
                  frontSlopeRating: front_slope_rating ? Number(front_slope_rating) : null,
                  frontBogeyRating: front_bogey_rating ? String(front_bogey_rating) : null,
                  backCourseRating: back_course_rating ? String(back_course_rating) : null,
                  backSlopeRating: back_slope_rating ? Number(back_slope_rating) : null,
                  backBogeyRating: back_bogey_rating ? String(back_bogey_rating) : null,
                },
              });

              if (teeHoles?.length) {
                const holeData = teeHoles.map((hole, index) => ({
                  teeId: createdTee.id,
                  holeNumber: index + 1,
                  par: Number(hole.par),
                  yardage: Number(hole.yardage),
                  handicap: hole.handicap ? Number(hole.handicap) : null,
                }));
                await tx.hole.createMany({ data: holeData });
              }
            }
          }
        }

        return { courseId: course.id, rejectedTees: skippedTees };
      });

      courseId = result.courseId;
      rejectedTees = result.rejectedTees;
    } catch (error) {
      if (error instanceof DuplicateExternalCourseError) {
        return duplicateExternalCourseResponse(error.courseId);
      }

      if (externalIdentity && isUniqueConstraintError(error)) {
        const existingCourseId = await findCourseIdByExternalIdentity(externalIdentity);
        if (existingCourseId) return duplicateExternalCourseResponse(existingCourseId);
      }

      throw error;
    }

    // Build and return full course response after the transaction commits.
    const fullCourse = await buildCourseResponse(courseId);

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
    if (error instanceof Error && error.message === 'Forbidden') {
      return errorResponse('Forbidden', 403);
    }

    console.error('POST /api/courses error:', error);
    return errorResponse('Failed to create course', 500);
  }
}
