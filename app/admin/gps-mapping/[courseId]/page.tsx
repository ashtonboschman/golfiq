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
  const locationLabel = payload.course.location
    ? [
        payload.course.location.city,
        payload.course.location.state,
        payload.course.location.country,
      ].filter(Boolean).join(', ')
    : '';
  const courseNameDiffersFromClub = payload.course.courseName.trim().toLowerCase()
    !== payload.course.clubName.trim().toLowerCase();
  const courseDetails = [
    courseNameDiffersFromClub ? payload.course.courseName : '',
    locationLabel,
  ].filter(Boolean).join(' | ');

  async function startMapping() {
    'use server';
    await startGpsMappingForCourse(courseId);
    redirect(`/admin/gps-mapping/${courseId}`);
  }

  return (
    <div className="gps-admin-page">
      <section className="gps-admin-page-header gps-admin-course-page-header">
        <div>
          <p className="gps-admin-kicker">Admin GPS Mapping</p>
          <h1>{payload.course.clubName}</h1>
          {courseDetails && <p>{courseDetails}</p>}
          {payload.mappedCourse && (
            <p className="gps-admin-course-source">
              Source: {payload.mappedCourse.source.toLowerCase().replaceAll('_', ' ')}
            </p>
          )}
        </div>
        <div className="gps-admin-heading-actions">
          {payload.mappedCourse && (
            <span className={`gps-admin-status-pill${
              payload.mappedCourse.mappingStatus === 'READY'
                || payload.mappedCourse.mappingStatus === 'VERIFIED'
                ? ' is-ready'
                : ''
            }`}>
              {payload.mappedCourse.mappingStatus.toLowerCase()}
            </span>
          )}
          <Link href="/admin/gps-mapping" className="gps-admin-courses-link">
            Courses
          </Link>
        </div>
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
