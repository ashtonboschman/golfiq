import { GpsMappingStatus } from '@prisma/client';
import { getServerSession } from 'next-auth';
import { redirect } from 'next/navigation';
import AdminGpsMappingCourseList from '@/components/gps/AdminGpsMappingCourseList';
import AdminGpsMappingLocationSort from '@/components/gps/AdminGpsMappingLocationSort';
import { isAdminUserId } from '@/lib/admin';
import { authOptions } from '@/lib/auth-config';
import {
  getGpsMappingCoursePage,
  parseCoordinate,
  parseMappingStatusFilter,
} from '@/lib/gps/mappingCourseList';
import { startGpsMappingForCourse } from '@/lib/gps/mappingActions';

type GpsMappingIndexPageProps = {
  searchParams?: Promise<{
    q?: string;
    lat?: string;
    lng?: string;
    status?: string;
  }>;
};

export default async function GpsMappingIndexPage({ searchParams }: GpsMappingIndexPageProps) {
  const session = await getServerSession(authOptions);

  if (!session?.user?.id || !isAdminUserId(session.user.id)) {
    redirect('/');
  }

  const resolvedSearchParams = await searchParams;
  const query = resolvedSearchParams?.q?.trim().slice(0, 120) ?? '';
  const status = parseMappingStatusFilter(resolvedSearchParams?.status);
  const latitude = parseCoordinate(resolvedSearchParams?.lat, -90, 90);
  const longitude = parseCoordinate(resolvedSearchParams?.lng, -180, 180);
  const hasUserLocation = latitude !== null && longitude !== null;
  const initialPage = await getGpsMappingCoursePage({
    query,
    status,
    latitude,
    longitude,
    page: 1,
  });

  async function startMappingAction(formData: FormData) {
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
          <p className="gps-admin-kicker">Admin GPS Mapping</p>
          <h1>Course Mapping</h1>
          <p>Start or continue Google-only GPS-lite geometry mapping for existing courses.</p>
        </div>
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

      {!initialPage.gpsMappingSchemaAvailable && (
        <section className="gps-admin-empty" role="status">
          <h2>GPS mapping tables are not in this database yet.</h2>
          <p>
            Apply migration <code>20260625153000_add_gps_mapping</code> before starting or continuing GPS
            mapping. Until then, course search is available but mapping actions are disabled.
          </p>
        </section>
      )}

      <AdminGpsMappingCourseList
        key={`${query}|${status}|${latitude ?? ''}|${longitude ?? ''}`}
        initialCourses={initialPage.courses}
        initialHasMore={initialPage.hasMore}
        gpsMappingSchemaAvailable={initialPage.gpsMappingSchemaAvailable}
        query={query}
        status={status}
        latitude={latitude}
        longitude={longitude}
        startMappingAction={startMappingAction}
      />
    </main>
  );
}
