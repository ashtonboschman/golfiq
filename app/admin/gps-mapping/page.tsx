import Link from 'next/link';
import type { Prisma } from '@prisma/client';
import { getServerSession } from 'next-auth';
import { redirect } from 'next/navigation';
import { isAdminUserId } from '@/lib/admin';
import { authOptions } from '@/lib/auth-config';
import { prisma } from '@/lib/db';
import { startGpsMappingForCourse } from '@/lib/gps/mappingActions';
import { isGpsMappingSchemaAvailable } from '@/lib/gps/schemaStatus';

type GpsMappingIndexPageProps = {
  searchParams?: Promise<{
    q?: string;
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
};

function statusLabel(status: string | null | undefined) {
  return status ? status.toLowerCase() : 'not started';
}

export default async function GpsMappingIndexPage({ searchParams }: GpsMappingIndexPageProps) {
  const session = await getServerSession(authOptions);

  if (!session?.user?.id || !isAdminUserId(session.user.id)) {
    redirect('/');
  }

  const resolvedSearchParams = await searchParams;
  const query = resolvedSearchParams?.q?.trim() ?? '';
  const gpsMappingSchemaAvailable = await isGpsMappingSchemaAvailable();

  const courseWhere: Prisma.CourseWhereInput | undefined = query
    ? {
        OR: [
          { clubName: { contains: query, mode: 'insensitive' } },
          { courseName: { contains: query, mode: 'insensitive' } },
          { location: { city: { contains: query, mode: 'insensitive' } } },
          { location: { state: { contains: query, mode: 'insensitive' } } },
        ],
      }
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
  } as const;

  const courses: CourseListItem[] = gpsMappingSchemaAvailable
    ? await prisma.course.findMany({
        where: courseWhere,
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
        orderBy: [{ clubName: 'asc' }, { courseName: 'asc' }],
        take: 60,
      }) as CourseListItem[]
    : (await prisma.course.findMany({
        where: courseWhere,
        select: baseCourseSelect,
        orderBy: [{ clubName: 'asc' }, { courseName: 'asc' }],
        take: 60,
      })).map((course) => ({ ...course, mappedCourse: null }));

  async function startMapping(formData: FormData) {
    'use server';
    const courseId = formData.get('courseId');
    if (typeof courseId !== 'string') throw new Error('Missing course id.');
    await startGpsMappingForCourse(courseId);
    redirect(`/admin/gps-mapping/${courseId}`);
  }

  return (
    <main className="gps-admin-page">
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
        <label htmlFor="gps-course-search">Search Courses</label>
        <div>
          <input
            id="gps-course-search"
            type="search"
            name="q"
            defaultValue={query}
            placeholder="Club, course, city, or state"
          />
          <button type="submit" className="btn btn-primary">Search</button>
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
        {courses.map((course) => {
          const holeNumbers = new Set(course.tees.flatMap((tee) => tee.holes.map((hole) => hole.holeNumber)));
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
                </span>
              </div>
              {!gpsMappingSchemaAvailable ? (
                <button type="button" className="btn btn-secondary" disabled>
                  Migration Required
                </button>
              ) : course.mappedCourse ? (
                <Link href={`/admin/gps-mapping/${course.id.toString()}`} className="btn btn-primary">
                  Continue Mapping
                </Link>
              ) : (
                <form action={startMapping}>
                  <input type="hidden" name="courseId" value={course.id.toString()} />
                  <button type="submit" className="btn btn-secondary">Start Mapping</button>
                </form>
              )}
            </article>
          );
        })}
      </section>
    </main>
  );
}
