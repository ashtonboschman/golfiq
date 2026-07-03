import Link from 'next/link';
import { GpsCourseRequestStatus, GpsMappingStatus, Prisma } from '@prisma/client';
import { getServerSession } from 'next-auth';
import { redirect } from 'next/navigation';
import AdminGpsMappingLocationSort from '@/components/gps/AdminGpsMappingLocationSort';
import { isAdminUserId } from '@/lib/admin';
import { authOptions } from '@/lib/auth-config';
import { prisma } from '@/lib/db';
import { startGpsMappingForCourse } from '@/lib/gps/mappingActions';
import { isGpsMappingSchemaAvailable } from '@/lib/gps/schemaStatus';

type GpsMappingIndexPageProps = {
  searchParams?: Promise<{
    q?: string;
    lat?: string;
    lng?: string;
    status?: string;
  }>;
};

type CourseListItem = {
  id: bigint;
  clubName: string;
  courseName: string;
  mappedCourse: {
    id: bigint;
    mappingStatus: string;
    updatedAt: Date;
    holes: Array<{ id: bigint }>;
  } | null;
  location: {
    city: string | null;
    state: string | null;
    country: string | null;
  } | null;
  tees: Array<{
    holes: Array<{ holeNumber: number }>;
  }>;
  _count: {
    gpsCourseRequests: number;
  };
};

const courseNameOrder = [
  { clubName: 'asc' },
  { courseName: 'asc' },
] satisfies Prisma.CourseOrderByWithRelationInput[];

const mappingStatusFilters = [
  'ALL',
  'NOT_STARTED',
  GpsMappingStatus.DRAFT,
  GpsMappingStatus.READY,
  GpsMappingStatus.VERIFIED,
  GpsMappingStatus.DISABLED,
] as const;

type MappingStatusFilter = (typeof mappingStatusFilters)[number];

function parseCoordinate(value: string | undefined, minimum: number, maximum: number) {
  if (!value) return null;
  const coordinate = Number(value);
  return Number.isFinite(coordinate) && coordinate >= minimum && coordinate <= maximum
    ? coordinate
    : null;
}

function parseMappingStatusFilter(value: string | undefined): MappingStatusFilter {
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

async function getNearbyCourseIds(
  query: string,
  latitude: number,
  longitude: number,
  status: MappingStatusFilter,
  gpsMappingSchemaAvailable: boolean,
) {
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
    c.course_name ASC
    LIMIT 60
  `);

  return rows.map((row) => row.id);
}

function statusLabel(status: string | null | undefined) {
  if (!status) return 'not started';
  return status === GpsMappingStatus.DRAFT ? 'in progress' : status.toLowerCase();
}

export default async function GpsMappingIndexPage({ searchParams }: GpsMappingIndexPageProps) {
  const session = await getServerSession(authOptions);

  if (!session?.user?.id || !isAdminUserId(session.user.id)) {
    redirect('/');
  }

  const resolvedSearchParams = await searchParams;
  const query = resolvedSearchParams?.q?.trim() ?? '';
  const status = parseMappingStatusFilter(resolvedSearchParams?.status);
  const latitude = parseCoordinate(resolvedSearchParams?.lat, -90, 90);
  const longitude = parseCoordinate(resolvedSearchParams?.lng, -180, 180);
  const hasUserLocation = latitude !== null && longitude !== null;
  const gpsMappingSchemaAvailable = await isGpsMappingSchemaAvailable();

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
    ? await getNearbyCourseIds(
        query,
        latitude,
        longitude,
        status,
        gpsMappingSchemaAvailable,
      )
    : null;
  const effectiveCourseWhere: Prisma.CourseWhereInput | undefined = nearbyCourseIds
    ? { id: { in: nearbyCourseIds } }
    : courseWhere;

  const fetchedCourses: CourseListItem[] = gpsMappingSchemaAvailable
    ? await prisma.course.findMany({
        where: effectiveCourseWhere,
        select: {
          ...baseCourseSelect,
          mappedCourse: {
            select: {
              id: true,
              mappingStatus: true,
              updatedAt: true,
              holes: {
                select: { id: true },
              },
            },
          },
        },
        orderBy: nearbyCourseIds ? undefined : courseNameOrder,
        take: nearbyCourseIds ? undefined : 60,
      }) as CourseListItem[]
    : (await prisma.course.findMany({
        where: effectiveCourseWhere,
        select: baseCourseSelect,
        orderBy: nearbyCourseIds ? undefined : courseNameOrder,
        take: nearbyCourseIds ? undefined : 60,
      })).map((course) => ({ ...course, mappedCourse: null }));

  const courses = nearbyCourseIds
    ? nearbyCourseIds
        .map((courseId) => fetchedCourses.find((course) => course.id === courseId))
        .filter((course): course is CourseListItem => Boolean(course))
    : fetchedCourses;

  async function startMapping(formData: FormData) {
    'use server';
    const courseId = formData.get('courseId');
    if (typeof courseId !== 'string') throw new Error('Missing course id.');
    await startGpsMappingForCourse(courseId);
    redirect(`/admin/gps-mapping/${courseId}`);
  }

  return (
    <main className="gps-admin-page">
      <AdminGpsMappingLocationSort hasLocation={hasUserLocation} query={query} status={status} />
      <section className="gps-admin-page-header">
        <div>
          <p className="gps-prototype-kicker">Admin GPS Mapping</p>
          <h1>Course Mapping</h1>
          <p>Start or continue Google-only GPS-lite geometry mapping for existing courses.</p>
        </div>
        <Link href="/admin/gps-hole-prototype" className="btn btn-secondary">
          Prototype
        </Link>
      </section>

      <form className="gps-admin-search" action="/admin/gps-mapping">
        {hasUserLocation && (
          <>
            <input type="hidden" name="lat" value={latitude} />
            <input type="hidden" name="lng" value={longitude} />
          </>
        )}
        <div className="gps-admin-search-controls">
          <label className="gps-admin-search-field" htmlFor="gps-course-search">
            <span>Search Courses</span>
            <input
              id="gps-course-search"
              type="search"
              name="q"
              defaultValue={query}
              placeholder="Club, course, city, or state"
            />
          </label>
          <label className="gps-admin-search-field" htmlFor="gps-mapping-status">
            <span>Mapping Status</span>
            <select id="gps-mapping-status" name="status" defaultValue={status}>
              <option value="ALL">All Statuses</option>
              <option value="NOT_STARTED">Not Started</option>
              <option value={GpsMappingStatus.DRAFT}>In Progress</option>
              <option value={GpsMappingStatus.READY}>Ready</option>
              <option value={GpsMappingStatus.VERIFIED}>Verified</option>
              <option value={GpsMappingStatus.DISABLED}>Disabled</option>
            </select>
          </label>
          <button type="submit" className="btn btn-primary">Apply</button>
        </div>
      </form>

      {!gpsMappingSchemaAvailable && (
        <section className="gps-admin-empty" role="status">
          <h2>GPS mapping tables are not in this database yet.</h2>
          <p>
            Apply migration <code>20260625153000_add_gps_mapping</code> before starting or continuing GPS
            mapping. Until then, course search is available but mapping actions are disabled.
          </p>
        </section>
      )}

      <section className="gps-admin-course-list" aria-label="GPS mapping courses">
        {courses.length === 0 && (
          <div className="gps-admin-empty" role="status">
            <h2>No courses match these filters.</h2>
            <p>Try another search or mapping status.</p>
          </div>
        )}
        {courses.map((course) => {
          const holeNumbers = new Set(course.tees.flatMap((tee) => tee.holes.map((hole) => hole.holeNumber)));
          const isFinishedMapping = course.mappedCourse?.mappingStatus === GpsMappingStatus.READY
            || course.mappedCourse?.mappingStatus === GpsMappingStatus.VERIFIED;
          return (
            <article key={course.id.toString()} className="gps-admin-course-row">
              <div>
                <h2>{course.clubName}</h2>
                <p>
                  {course.courseName}
                  {course.location
                    ? ` | ${[course.location.city, course.location.state, course.location.country].filter(Boolean).join(', ')}`
                    : ''}
                </p>
                <span>
                  {holeNumbers.size || 0} scorecard holes | GPS status:{' '}
                  <strong>{statusLabel(course.mappedCourse?.mappingStatus)}</strong>
                  {course.mappedCourse ? ` | ${course.mappedCourse.holes.length} mapped holes` : ''}
                  {course._count.gpsCourseRequests > 0
                    ? ` | Requested by ${course._count.gpsCourseRequests} ${course._count.gpsCourseRequests === 1 ? 'user' : 'users'}`
                    : ''}
                </span>
              </div>
              <div className="gps-admin-course-action">
                {!gpsMappingSchemaAvailable ? (
                  <button type="button" className="btn btn-secondary" disabled>
                    Migration Required
                  </button>
                ) : course.mappedCourse ? (
                  <Link
                    href={`/admin/gps-mapping/${course.id.toString()}`}
                    className={`btn ${isFinishedMapping ? 'btn-save' : 'btn-primary'}`}
                  >
                    {isFinishedMapping ? 'Edit Mapping' : 'Continue Mapping'}
                  </Link>
                ) : (
                  <form action={startMapping}>
                    <input type="hidden" name="courseId" value={course.id.toString()} />
                    <button type="submit" className="btn btn-secondary">Start Mapping</button>
                  </form>
                )}
              </div>
            </article>
          );
        })}
      </section>
    </main>
  );
}
