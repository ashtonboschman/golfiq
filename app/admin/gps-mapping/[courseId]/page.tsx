import Link from 'next/link';
import { getServerSession } from 'next-auth';
import { redirect } from 'next/navigation';
import AdminGpsMappingCourseClient from '@/components/gps/AdminGpsMappingCourseClient';
import { isAdminUserId } from '@/lib/admin';
import { authOptions } from '@/lib/auth-config';
import type { GpsScorecardHole } from '@/lib/gps/adminMappingTypes';
import {
  duplicateGpsFrontNineToBackNine,
  getGpsMappedCourse,
  markGpsMappedCourseReady,
  markGpsMappedHoleReady,
  recalculateGpsCourseBounds,
  saveGpsMappedHoleDraft,
  startGpsMappingForCourse,
} from '@/lib/gps/mappingActions';

type GpsMappingCoursePageProps = {
  params: Promise<{
    courseId: string;
  }>;
};

function deriveScorecardHoles(payload: Awaited<ReturnType<typeof getGpsMappedCourse>>): GpsScorecardHole[] {
  const holesByNumber = new Map<number, GpsScorecardHole>();

  payload.course.tees.forEach((tee) => {
    tee.holes.forEach((hole) => {
      if (holesByNumber.has(hole.holeNumber)) return;
      holesByNumber.set(hole.holeNumber, {
        holeNumber: hole.holeNumber,
        par: hole.par,
        yardage: hole.yardage,
        handicap: hole.handicap,
      });
    });
  });

  return Array.from(holesByNumber.values()).sort((a, b) => a.holeNumber - b.holeNumber);
}

export default async function GpsMappingCoursePage({ params }: GpsMappingCoursePageProps) {
  const session = await getServerSession(authOptions);

  if (!session?.user?.id || !isAdminUserId(session.user.id)) {
    redirect('/');
  }

  const { courseId } = await params;
  const payload = await getGpsMappedCourse(courseId);
  const scorecardHoles = deriveScorecardHoles(payload);

  async function startMapping() {
    'use server';
    await startGpsMappingForCourse(courseId);
    redirect(`/admin/gps-mapping/${courseId}`);
  }

  return (
    <div className="gps-admin-page">
      <section className="gps-admin-page-header">
        <div>
          <p className="gps-prototype-kicker">Admin GPS Mapping</p>
          <h1>{payload.course.clubName}</h1>
          <p>
            {payload.course.courseName}
            {payload.course.location
              ? ` | ${[
                  payload.course.location.city,
                  payload.course.location.state,
                  payload.course.location.country,
                ].filter(Boolean).join(', ')}`
              : ''}
          </p>
        </div>
        <Link href="/admin/gps-mapping" className="btn btn-secondary">
          All Courses
        </Link>
      </section>

      {!payload.mappedCourse ? (
        <section className="gps-admin-empty">
          <h2>GPS mapping has not started for this course.</h2>
          <p>
            This will create a draft mapped course record. Hole geometry is added one hole at a time.
          </p>
          <form action={startMapping}>
            <button type="submit" className="btn btn-primary">Start Mapping</button>
          </form>
        </section>
      ) : (
        <AdminGpsMappingCourseClient
          course={payload.course}
          mappedCourse={payload.mappedCourse}
          scorecardHoles={scorecardHoles}
          googleMapsKey={process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY}
          actions={{
            saveDraft: saveGpsMappedHoleDraft,
            markHoleReady: markGpsMappedHoleReady,
            markCourseReady: markGpsMappedCourseReady,
            recalculateBounds: recalculateGpsCourseBounds,
            duplicateFrontNine: duplicateGpsFrontNineToBackNine,
          }}
        />
      )}
    </div>
  );
}
