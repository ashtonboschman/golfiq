jest.mock('server-only', () => ({}), { virtual: true });

import { normalizeGolfCourseApiCourse } from '@/lib/courses/update/normalize';

function courseWithTee(tee: Record<string, unknown>, gender: 'male' | 'female' = 'male') {
  return {
    id: '00hgpgma',
    club_name: 'Test Club',
    course_name: 'Test Course',
    tees: { male: gender === 'male' ? [tee] : [], female: gender === 'female' ? [tee] : [] },
  };
}

function validTee(holeCount = 9) {
  return {
    tee_name: ' Blue. ',
    course_rating: 34.2,
    slope_rating: 112,
    total_yards: 3000,
    total_meters: 2743,
    number_of_holes: holeCount,
    par_total: holeCount === 9 ? 36 : 72,
    holes: Array.from({ length: holeCount }, (_, index) => ({
      par: 4,
      yardage: 300 + index,
      ...(index === 0 ? { handicap: 1 } : {}),
    })),
  };
}

describe('GolfCourseAPI reconciliation normalization', () => {
  it('normalizes gender grouping and derives hole numbers from position', () => {
    const result = normalizeGolfCourseApiCourse(courseWithTee(validTee(), 'female'), '00hgpgma');
    const tee = result.tees[0];

    expect(result.externalCourseId).toBe('00hgpgma');
    expect(tee.gender).toBe('female');
    expect(tee.providerTeeId).toBeNull();
    expect(tee.descriptor.normalizedName).toBe('blue.');
    expect(tee.holeNumberSource).toBe('array-position');
    expect(tee.holes.map((hole) => hole.holeNumber)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect(tee.holes[1].handicap.state).toBe('absent');
  });

  it('preserves absent, null, zero-invalid, and valid states', () => {
    const tee = validTee();
    delete (tee as Partial<typeof tee>).course_rating;
    Object.assign(tee, { slope_rating: null, total_yards: 0 });
    const normalized = normalizeGolfCourseApiCourse(courseWithTee(tee), '00hgpgma').tees[0];

    expect(normalized.courseRating.state).toBe('absent');
    expect(normalized.slopeRating.state).toBe('null');
    expect(normalized.totalYards.state).toBe('invalid');
    expect(normalized.totalMeters.state).toBe('valid');
  });

  it.each([9, 18])('supports a complete %i-hole tee', (holeCount) => {
    const tee = normalizeGolfCourseApiCourse(courseWithTee(validTee(holeCount)), '00hgpgma').tees[0];
    expect(tee.supported).toBe(true);
  });

  it('rejects unsupported and incomplete hole arrays without throwing', () => {
    const unsupported = normalizeGolfCourseApiCourse(courseWithTee(validTee(12)), '00hgpgma').tees[0];
    const incompleteRaw = validTee(18);
    incompleteRaw.holes.pop();
    const incomplete = normalizeGolfCourseApiCourse(courseWithTee(incompleteRaw), '00hgpgma').tees[0];

    expect(unsupported.supported).toBe(false);
    expect(unsupported.issues.join(' ')).toMatch(/9-hole or 18-hole/i);
    expect(incomplete.supported).toBe(false);
    expect(incomplete.issues.join(' ')).toMatch(/expected 18 holes/i);
  });

  it('reports invalid numeric fields and aggregate inconsistencies', () => {
    const raw = validTee();
    raw.holes[0] = { par: 8, yardage: -1, handicap: 19 };
    raw.par_total = 99;
    const tee = normalizeGolfCourseApiCourse(courseWithTee(raw), '00hgpgma').tees[0];

    expect(tee.supported).toBe(false);
    expect(tee.issues.join(' ')).toMatch(/hole 1/i);
    expect(tee.warnings.join(' ')).toMatch(/par total/i);
  });

  it('rejects a mismatched response identity while preserving the exact requested ID', () => {
    const result = normalizeGolfCourseApiCourse(courseWithTee(validTee()), 'AbCd1234');
    expect(result.externalCourseId).toBe('AbCd1234');
    expect(result.issues).toContain('GolfCourseAPI returned a different course identity than requested.');
  });
});
