import 'server-only';

import { loadGolfCourseApiCourse } from '@/lib/courses/golfCourseApiServer';
import { ReconciliationError } from './errors';
import { normalizeGolfCourseApiCourse } from './normalize';

export async function fetchNormalizedGolfCourseApiCourse(exactExternalCourseId: string) {
  const result = await loadGolfCourseApiCourse(exactExternalCourseId);
  if (!result.ok) {
    throw new ReconciliationError(result.error, result.status, result.errorCode);
  }
  const normalized = normalizeGolfCourseApiCourse(result.course, exactExternalCourseId);
  const blockingIssue = normalized.issues.find((issue) =>
    issue.includes('different course identity') || issue.includes('grouped tee arrays'),
  );
  if (blockingIssue) {
    throw new ReconciliationError(blockingIssue, 502, 'invalid_upstream_shape');
  }
  return normalized;
}
