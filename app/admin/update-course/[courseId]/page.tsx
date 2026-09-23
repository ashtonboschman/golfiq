import Link from 'next/link';
import { getServerSession } from 'next-auth';
import { notFound, redirect } from 'next/navigation';
import UpdateCourseClient from '@/components/admin/UpdateCourseClient';
import { isAdminUserId } from '@/lib/admin';
import { authOptions } from '@/lib/auth-config';
import { GOLF_COURSE_API_PROVIDER } from '@/lib/courses/externalIds';
import { prisma } from '@/lib/db';

type UpdateCoursePageProps = {
  params: Promise<{ courseId: string }>;
};

export default async function UpdateCoursePage({ params }: UpdateCoursePageProps) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id || !isAdminUserId(session.user.id)) redirect('/');
  const { courseId } = await params;
  if (!/^[1-9]\d*$/.test(courseId)) notFound();

  const course = await prisma.course.findUnique({
    where: { id: BigInt(courseId) },
    select: {
      id: true,
      clubName: true,
      courseName: true,
      externalIds: {
        where: { provider: GOLF_COURSE_API_PROVIDER },
        select: { externalId: true },
        orderBy: { id: 'asc' },
      },
    },
  });
  if (!course) notFound();

  return (
    <main className="reconciliation-admin-page">
      <section className="gps-admin-page-header gps-admin-course-page-header">
        <div>
          <p className="gps-admin-kicker">Update Course Data</p>
          <h1>{course.clubName}</h1>
          {course.courseName !== course.clubName ? <p>{course.courseName}</p> : null}
          <p>GolfCourseAPI: {course.externalIds[0]?.externalId ?? 'No Mapping'}</p>
        </div>
        <Link href="/admin/update-course" className="gps-admin-courses-link">Courses</Link>
      </section>

      <UpdateCourseClient
        courseId={course.id.toString()}
        hasSingleMapping={course.externalIds.length === 1}
      />
    </main>
  );
}
