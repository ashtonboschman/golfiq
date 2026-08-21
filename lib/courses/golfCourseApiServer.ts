import { hasFullGolfCourseTeeData } from '@/lib/courses/golfCourseApi';

const COURSE_ID_PATTERN = /^[0-9abcdefghjkmnpqrstvwxyz]{8}$/i;

type GolfCourseApiLoadResult =
  | { ok: true; courseId: string; course: Record<string, unknown> }
  | { ok: false; status: number; error: string; errorCode: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

export async function loadGolfCourseApiCourse(rawId: string): Promise<GolfCourseApiLoadResult> {
  const courseId = rawId.trim().toLowerCase();
  if (!COURSE_ID_PATTERN.test(courseId)) {
    return {
      ok: false,
      status: 400,
      error: 'Invalid provider course ID',
      errorCode: 'invalid_course_id',
    };
  }

  const apiKey = process.env.GOLF_COURSE_API_KEY;
  if (!apiKey) {
    console.error('GOLF_COURSE_API_KEY is not set in environment variables');
    return {
      ok: false,
      status: 500,
      error: 'Golf Course API is not configured',
      errorCode: 'missing_api_key',
    };
  }

  const response = await fetch(`https://api.golfcourseapi.com/v1/courses/${courseId}`, {
    headers: {
      Authorization: apiKey,
    },
  });

  if (!response.ok) {
    return {
      ok: false,
      status: response.status,
      error: `Failed to load golf course details: ${response.status} ${response.statusText}`,
      errorCode: `upstream_${response.status}`,
    };
  }

  const data: unknown = await response.json();
  const rawCourse = isRecord(data) && isRecord(data.course) ? data.course : data;

  if (!isRecord(rawCourse) || !hasFullGolfCourseTeeData(rawCourse)) {
    return {
      ok: false,
      status: 502,
      error: 'Golf Course API returned incomplete tee details',
      errorCode: 'invalid_upstream_shape',
    };
  }

  return {
    ok: true,
    courseId,
    course: {
      ...rawCourse,
      id: String(rawCourse.id ?? courseId).trim(),
    },
  };
}
