import { GpsCourseRequestStatus, GpsMappingStatus, Prisma } from '@prisma/client';
import { prisma } from '@/lib/db';
import { isGpsMappingSchemaAvailable } from '@/lib/gps/schemaStatus';

export const GPS_MAPPING_COURSES_PAGE_SIZE = 20;

export const mappingStatusFilters = [
  'ALL',
  'NOT_STARTED',
  GpsMappingStatus.DRAFT,
  GpsMappingStatus.READY,
  GpsMappingStatus.VERIFIED,
  GpsMappingStatus.DISABLED,
] as const;

export type MappingStatusFilter = (typeof mappingStatusFilters)[number];

export type GpsMappingCourseListItem = {
  id: string;
  clubName: string;
  courseName: string;
  location: {
    city: string | null;
    state: string | null;
    country: string | null;
  } | null;
  holeCount: number;
  mappedCourse: {
    mappingStatus: string;
    mappedHoleCount: number;
  } | null;
  requestCount: number;
};

type CourseQueryResult = {
  id: bigint;
  clubName: string;
  courseName: string;
  mappedCourse: {
    mappingStatus: string;
    holes: Array<{ id: bigint }>;
  } | null;
  location: GpsMappingCourseListItem['location'];
  tees: Array<{
    holes: Array<{ holeNumber: number }>;
  }>;
  _count: {
    gpsCourseRequests: number;
  };
};

type GetGpsMappingCoursePageArgs = {
  query: string;
  status: MappingStatusFilter;
  latitude: number | null;
  longitude: number | null;
  page: number;
};

const courseNameOrder = [
  { clubName: 'asc' },
  { courseName: 'asc' },
  { id: 'asc' },
] satisfies Prisma.CourseOrderByWithRelationInput[];

export function parseCoordinate(value: string | undefined, minimum: number, maximum: number) {
  if (!value) return null;
  const coordinate = Number(value);
  return Number.isFinite(coordinate) && coordinate >= minimum && coordinate <= maximum
    ? coordinate
    : null;
}

export function parseMappingStatusFilter(value: string | undefined): MappingStatusFilter {
  return mappingStatusFilters.includes(value as MappingStatusFilter)
    ? value as MappingStatusFilter
    : 'ALL';
}

function mappingStatusWhere(
  status: MappingStatusFilter,
  gpsMappingSchemaAvailable: boolean,
): Prisma.CourseWhereInput | undefined {
  if (status === 'ALL') return undefined;

  if (!gpsMappingSchemaAvailable) {
    return status === 'NOT_STARTED' ? undefined : { id: { in: [] } };
  }

  if (status === 'NOT_STARTED') {
    return { mappedCourse: { is: null } };
  }

  return { mappedCourse: { is: { mappingStatus: status } } };
}

async function getNearbyCourseIds({
  query,
  latitude,
  longitude,
  status,
  gpsMappingSchemaAvailable,
  skip,
  take,
}: {
  query: string;
  latitude: number;
  longitude: number;
  status: MappingStatusFilter;
  gpsMappingSchemaAvailable: boolean;
  skip: number;
  take: number;
}) {
  const searchPattern = `%${query}%`;
  const searchFilter = query
    ? Prisma.sql`
        AND (
          c.club_name ILIKE ${searchPattern}
          OR c.course_name ILIKE ${searchPattern}
          OR l.city ILIKE ${searchPattern}
          OR l.state ILIKE ${searchPattern}
        )
      `
    : Prisma.empty;
  const mappingJoin = gpsMappingSchemaAvailable
    ? Prisma.sql`LEFT JOIN mapped_courses mc ON c.id = mc.course_id`
    : Prisma.empty;
  const statusFilter = !gpsMappingSchemaAvailable
    ? status === 'ALL' || status === 'NOT_STARTED'
      ? Prisma.empty
      : Prisma.sql`AND FALSE`
    : status === 'ALL'
      ? Prisma.empty
      : status === 'NOT_STARTED'
        ? Prisma.sql`AND mc.id IS NULL`
        : Prisma.sql`AND mc.mapping_status = ${status}::"GpsMappingStatus"`;

  const rows = await prisma.$queryRaw<Array<{ id: bigint }>>(Prisma.sql`
    SELECT c.id
    FROM courses c
    INNER JOIN locations l ON c.id = l.course_id
    ${mappingJoin}
    WHERE l.latitude IS NOT NULL
      AND l.longitude IS NOT NULL
      ${searchFilter}
      ${statusFilter}
    ORDER BY (
      6371 * acos(
        LEAST(
          1.0,
          cos(radians(${latitude})) * cos(radians(l.latitude::float))
            * cos(radians(l.longitude::float) - radians(${longitude}))
            + sin(radians(${latitude})) * sin(radians(l.latitude::float))
        )
      )
    ) ASC,
    c.club_name ASC,
    c.course_name ASC,
    c.id ASC
    LIMIT ${take}
    OFFSET ${skip}
  `);

  return rows.map((row) => row.id);
}

function toCourseListItem(course: CourseQueryResult): GpsMappingCourseListItem {
  const holeNumbers = new Set(
    course.tees.flatMap((tee) => tee.holes.map((hole) => hole.holeNumber)),
  );

  return {
    id: course.id.toString(),
    clubName: course.clubName,
    courseName: course.courseName,
    location: course.location,
    holeCount: holeNumbers.size,
    mappedCourse: course.mappedCourse
      ? {
          mappingStatus: course.mappedCourse.mappingStatus,
          mappedHoleCount: course.mappedCourse.holes.length,
        }
      : null,
    requestCount: course._count.gpsCourseRequests,
  };
}

export async function getGpsMappingCoursePage({
  query,
  status,
  latitude,
  longitude,
  page,
}: GetGpsMappingCoursePageArgs) {
  const gpsMappingSchemaAvailable = await isGpsMappingSchemaAvailable();
  const safePage = Math.max(1, Math.floor(page));
  const skip = (safePage - 1) * GPS_MAPPING_COURSES_PAGE_SIZE;
  const take = GPS_MAPPING_COURSES_PAGE_SIZE + 1;
  const hasUserLocation = latitude !== null && longitude !== null;
  const searchWhere: Prisma.CourseWhereInput | undefined = query
    ? {
        OR: [
          { clubName: { contains: query, mode: 'insensitive' } },
          { courseName: { contains: query, mode: 'insensitive' } },
          { location: { city: { contains: query, mode: 'insensitive' } } },
          { location: { state: { contains: query, mode: 'insensitive' } } },
        ],
      }
    : undefined;
  const statusWhere = mappingStatusWhere(status, gpsMappingSchemaAvailable);
  const courseWhere: Prisma.CourseWhereInput | undefined = searchWhere || statusWhere
    ? { AND: [searchWhere ?? {}, statusWhere ?? {}] }
    : undefined;
  const baseCourseSelect = {
    id: true,
    clubName: true,
    courseName: true,
    location: {
      select: {
        city: true,
        state: true,
        country: true,
      },
    },
    tees: {
      select: {
        holes: {
          select: { holeNumber: true },
        },
      },
    },
    _count: {
      select: {
        gpsCourseRequests: {
          where: { status: GpsCourseRequestStatus.REQUESTED },
        },
      },
    },
  } as const;

  const nearbyCourseIds = hasUserLocation
    ? await getNearbyCourseIds({
        query,
        latitude,
        longitude,
        status,
        gpsMappingSchemaAvailable,
        skip,
        take,
      })
    : null;
  const effectiveCourseWhere: Prisma.CourseWhereInput | undefined = nearbyCourseIds
    ? { id: { in: nearbyCourseIds } }
    : courseWhere;
  const fetchedCourses: CourseQueryResult[] = gpsMappingSchemaAvailable
    ? await prisma.course.findMany({
        where: effectiveCourseWhere,
        select: {
          ...baseCourseSelect,
          mappedCourse: {
            select: {
              mappingStatus: true,
              holes: {
                select: { id: true },
              },
            },
          },
        },
        orderBy: nearbyCourseIds ? undefined : courseNameOrder,
        skip: nearbyCourseIds ? undefined : skip,
        take: nearbyCourseIds ? undefined : take,
      }) as CourseQueryResult[]
    : (await prisma.course.findMany({
        where: effectiveCourseWhere,
        select: baseCourseSelect,
        orderBy: nearbyCourseIds ? undefined : courseNameOrder,
        skip: nearbyCourseIds ? undefined : skip,
        take: nearbyCourseIds ? undefined : take,
      })).map((course) => ({ ...course, mappedCourse: null }));
  const orderedCourses = nearbyCourseIds
    ? nearbyCourseIds
        .map((courseId) => fetchedCourses.find((course) => course.id === courseId))
        .filter((course): course is CourseQueryResult => Boolean(course))
    : fetchedCourses;
  const hasMore = orderedCourses.length > GPS_MAPPING_COURSES_PAGE_SIZE;

  return {
    courses: orderedCourses.slice(0, GPS_MAPPING_COURSES_PAGE_SIZE).map(toCourseListItem),
    hasMore,
    gpsMappingSchemaAvailable,
  };
}
