jest.mock('server-only', () => ({}), { virtual: true });

import { findConservativeTeeMatches, type MatchableLocalTee } from '@/lib/courses/update/matching';
import { normalizeGolfCourseApiCourse } from '@/lib/courses/update/normalize';

function rawTee(name: string) {
  return {
    tee_name: name,
    course_rating: 34,
    slope_rating: 110,
    total_yards: 2700,
    total_meters: 2469,
    number_of_holes: 9,
    par_total: 36,
    holes: Array.from({ length: 9 }, () => ({ par: 4, yardage: 300 })),
  };
}

function provider(name = 'Blue.', gender: 'male' | 'female' = 'male') {
  return normalizeGolfCourseApiCourse({
    id: '00hgpgma', club_name: 'Club', course_name: 'Course',
    tees: { male: gender === 'male' ? [rawTee(name)] : [], female: gender === 'female' ? [rawTee(name)] : [] },
  }, '00hgpgma').tees[0];
}

function local(id: string, name: string, gender: 'male' | 'female' = 'male'): MatchableLocalTee {
  return {
    id, name, teeName: name, gender, courseRating: 34, slopeRating: 110, numberOfHoles: 9,
    holes: Array.from({ length: 9 }, (_, index) => ({ holeNumber: index + 1, par: 4, yardage: 300 })),
  } as MatchableLocalTee;
}

describe('conservative tee matching', () => {
  it('automatically matches one exact normalized gender/name', () => {
    const tee = provider('Blue');
    const result = findConservativeTeeMatches([tee], [local('1', ' blue ')]);
    expect(result.matches).toEqual([{ localTeeId: '1', providerTeeKey: tee.providerTeeKey, method: 'exact-name' }]);
  });

  it('does not cross gender boundaries', () => {
    const tee = provider('Blue', 'female');
    const result = findConservativeTeeMatches([tee], [local('1', 'Blue', 'male')]);
    expect(result.matches).toEqual([]);
    expect(result.suggestions.get(tee.providerTeeKey)).toBeUndefined();
  });

  it('shows punctuation drift as a suggestion instead of an automatic match', () => {
    const tee = provider('Blue.');
    const result = findConservativeTeeMatches([tee], [local('1', 'Blue')]);
    expect(result.matches).toEqual([]);
    expect(result.suggestions.get(tee.providerTeeKey)).toEqual(['1']);
  });

  it('leaves duplicate exact names unresolved', () => {
    const tee = provider('Blue');
    const result = findConservativeTeeMatches([tee], [local('1', 'Blue'), local('2', 'Blue')]);
    expect(result.matches).toEqual([]);
    expect(result.suggestions.get(tee.providerTeeKey)).toEqual(['1', '2']);
  });

  it('does not auto-match the first of duplicate provider names', () => {
    const first = provider('Blue');
    const secondCourse = normalizeGolfCourseApiCourse({
      id: '00hgpgma', club_name: 'Club', course_name: 'Course',
      tees: { male: [rawTee('Blue'), rawTee('Blue')], female: [] },
    }, '00hgpgma');
    const result = findConservativeTeeMatches(secondCourse.tees, [local('1', 'Blue')]);

    expect(first.descriptor.normalizedName).toBe('blue');
    expect(result.matches).toEqual([]);
    expect(result.suggestions.size).toBe(2);
  });

  it('accepts one explicit same-gender manual match for the current operation', () => {
    const tee = provider('Blue.');
    const result = findConservativeTeeMatches(
      [tee],
      [local('1', 'Blue')],
      new Map([[tee.providerTeeKey, '1']]),
    );
    expect(result.matches[0].method).toBe('manual');
  });
});
