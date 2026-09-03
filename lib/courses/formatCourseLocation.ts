export type CourseLocationParts = {
  address?: string | null;
  city?: string | null;
  state?: string | null;
  country?: string | null;
};

function normalizeLocationPart(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  if (!trimmed || trimmed.toLowerCase() === 'null' || trimmed.toLowerCase() === 'undefined') {
    return null;
  }
  return trimmed;
}

export function formatCourseLocation(
  location: CourseLocationParts | null | undefined,
  fallback = '-',
): string {
  const formatted = [location?.address, location?.city, location?.state, location?.country]
    .map(normalizeLocationPart)
    .filter((part): part is string => part !== null)
    .join(', ');

  return formatted || fallback;
}
