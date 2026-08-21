export type GolfCourseTeeGender = 'male' | 'female';

type ExternalCourse = {
  tees?: Partial<Record<GolfCourseTeeGender, unknown>>;
};

export function getGolfCourseTees(
  course: ExternalCourse | null | undefined,
  gender: GolfCourseTeeGender,
): any[] {
  const tees = course?.tees?.[gender];
  return Array.isArray(tees) ? tees : [];
}

export function getGolfCourseTeeCount(
  course: ExternalCourse | null | undefined,
  gender: GolfCourseTeeGender,
): number {
  const tees = course?.tees?.[gender];
  if (Array.isArray(tees)) return tees.length;
  if (typeof tees !== 'number' || !Number.isFinite(tees)) return 0;
  return Math.max(0, Math.floor(tees));
}

export function hasFullGolfCourseTeeData(course: unknown): boolean {
  if (!course || typeof course !== 'object' || Array.isArray(course)) return false;

  const tees = (course as ExternalCourse).tees;
  if (!tees || typeof tees !== 'object' || Array.isArray(tees)) return false;

  const male = tees.male;
  const female = tees.female;
  const valuesAreArrays =
    (male === undefined || Array.isArray(male)) &&
    (female === undefined || Array.isArray(female));

  return valuesAreArrays && (Array.isArray(male) || Array.isArray(female));
}

export function buildGolfCourseTeeSelections(
  course: ExternalCourse | null | undefined,
): Record<string, boolean> {
  const selections: Record<string, boolean> = {};

  for (const gender of ['male', 'female'] as const) {
    getGolfCourseTees(course, gender).forEach((_, index) => {
      selections[`${gender}-${index}`] = true;
    });
  }

  return selections;
}
