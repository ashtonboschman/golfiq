import Link from 'next/link';
import { getServerSession } from 'next-auth';
import { redirect } from 'next/navigation';
import { isAdminUserId } from '@/lib/admin';
import { authOptions } from '@/lib/auth-config';
import { GOLF_COURSE_API_PROVIDER } from '@/lib/courses/externalIds';
import { prisma } from '@/lib/db';

type UpdateCourseIndexProps = {
  searchParams?: Promise<{ q?: string }>;
};

export default async function UpdateCourseIndex({ searchParams }: UpdateCourseIndexProps) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id || !isAdminUserId(session.user.id)) redirect('/');

  const query = (await searchParams)?.q?.trim().slice(0, 120) ?? '';
  const courses = await prisma.course.findMany({
    where: {
      externalIds: { some: { provider: GOLF_COURSE_API_PROVIDER } },
      ...(query ? {
        OR: [
          { clubName: { contains: query, mode: 'insensitive' as const } },
          { courseName: { contains: query, mode: 'insensitive' as const } },
          { location: { city: { contains: query, mode: 'insensitive' as const } } },
          { location: { state: { contains: query, mode: 'insensitive' as const } } },
        ],
      } : {}),
    },
    select: {
      id: true,
      clubName: true,
      courseName: true,
      location: { select: { city: true, state: true } },
      externalIds: {
        where: { provider: GOLF_COURSE_API_PROVIDER },
        select: { externalId: true },
        orderBy: { id: 'asc' },
      },
      _count: { select: { tees: true } },
    },
    orderBy: [{ clubName: 'asc' }, { courseName: 'asc' }, { id: 'asc' }],
    take: 100,
  });

  return (
    <main className="reconciliation-admin-page">
      <section className="gps-admin-page-header">
        <div>
          <p className="gps-admin-kicker">Admin Course Data</p>
          <h1>Update Course Data</h1>
          <p>Compare GolfIQ scorecards with GolfCourseAPI without overwriting local data automatically.</p>
        </div>
      </section>

      <form className="gps-admin-search" action="/admin/update-course">
        <div className="gps-admin-search-controls">
          <label className="gps-admin-search-field" htmlFor="reconciliation-course-search">
            <span>Search Courses</span>
            <input
              id="reconciliation-course-search"
              type="search"
              name="q"
              defaultValue={query}
              placeholder="Club, course, city, or state"
            />
          </label>
          <button type="submit" className="btn btn-primary">Search</button>
        </div>
      </form>

      {courses.length ? (
        <section className="reconciliation-course-list" aria-label="Mapped courses">
          {courses.map((course) => {
            const location = [course.location?.city, course.location?.state].filter(Boolean).join(', ');
            return (
              <article className="card reconciliation-course-card" key={course.id.toString()}>
                <div>
                  <h2>{course.clubName}</h2>
                  {course.courseName !== course.clubName ? <p>{course.courseName}</p> : null}
                  {location ? <p>{location}</p> : null}
                  <p className="reconciliation-meta">
                    {course._count.tees} tees · {course.externalIds[0]?.externalId ?? 'Missing Mapping'}
                  </p>
                </div>
                <Link className="btn btn-primary" href={`/admin/update-course/${course.id.toString()}`}>
                  Update Course
                </Link>
              </article>
            );
          })}
        </section>
      ) : (
        <section className="gps-admin-empty">
          <h2>No mapped courses found.</h2>
          <p>Try a different search or import a GolfCourseAPI course first.</p>
        </section>
      )}
    </main>
  );
}
