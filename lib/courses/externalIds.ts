export const GOLF_COURSE_API_PROVIDER = 'golfcourseapi' as const;

export type CourseExternalIdentity = {
  provider: string;
  externalId: string;
};

export function normalizeExternalId(externalId: string): string {
  return externalId.trim();
}
