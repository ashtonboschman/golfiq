jest.mock('server-only', () => ({}), { virtual: true });
jest.mock('@/lib/db', () => ({ prisma: {} }));

import { Prisma } from '@prisma/client';
import { buildCourseComparison } from '@/lib/courses/update/compare';
import { normalizeGolfCourseApiCourse } from '@/lib/courses/update/normalize';
import type { LocalCourseState } from '@/lib/courses/update/state';

function providerRaw(name = 'Blue', overrides: Record<string, unknown> = {}) {
  return {
    id: '00hgpgma',
    club_name: 'Club',
    course_name: 'Course',
    tees: {
      male: [{
        tee_name: name,
        course_rating: 34,
        slope_rating: 110,
        total_yards: 2700,
        total_meters: 2469,
        number_of_holes: 9,
        par_total: 36,
        holes: Array.from({ length: 9 }, () => ({ par: 4, yardage: 300 })),
        ...overrides,
      }],
      female: [],
    },
  };
}

function localState({
  completedRounds = 0,
  activeLiveSessions = 0,
  malformed = false,
}: {
  completedRounds?: number;
  activeLiveSessions?: number;
  malformed?: boolean;
} = {}): LocalCourseState {
  const now = new Date('2026-09-18T12:00:00.000Z');
  return {
    id: BigInt(1), clubName: 'Club', courseName: 'Course', updatedAt: now,
    externalIds: [{ id: BigInt(1), provider: 'golfcourseapi', externalId: '00hgpgma', createdAt: now, lastSeenAt: now }],
    tees: [{
      id: BigInt(10), courseId: BigInt(1), gender: 'male', teeName: 'Blue',
      courseRating: new Prisma.Decimal(35), slopeRating: 115, totalYards: 2700,
      totalMeters: 2469, numberOfHoles: 9, parTotal: 36, nonPar3Holes: 9, updatedAt: now,
      holes: malformed ? [] : Array.from({ length: 9 }, (_, index) => ({
        id: BigInt(100 + index), teeId: BigInt(10), holeNumber: index + 1,
        par: 4, yardage: index === 0 ? 299 : 300, handicap: index + 1, updatedAt: now,
      })),
      completedRoundCount: completedRounds,
      activeLiveSessionCount: activeLiveSessions,
    }],
  };
}

describe('course reconciliation comparison', () => {
  it('finds tee and hole changes while keeping provider-missing handicap non-selectable', () => {
    const provider = normalizeGolfCourseApiCourse(providerRaw(), '00hgpgma');
    const comparison = buildCourseComparison(localState(), provider);
    const tee = comparison.matchedTees[0];

    expect(tee.fields.find((field) => field.field === 'courseRating')).toMatchObject({ status: 'changed', selectable: true });
    expect(tee.holes[0].fields.find((field) => field.field === 'yardage')).toMatchObject({ status: 'changed', selectable: true });
    expect(tee.holes[0].fields.find((field) => field.field === 'handicap')).toMatchObject({
      status: 'missingProvider', selectable: false,
    });
  });

  it('keeps differences selectable and exposes warning metadata for completed rounds', () => {
    const provider = normalizeGolfCourseApiCourse(providerRaw(), '00hgpgma');
    const comparison = buildCourseComparison(localState({ completedRounds: 14 }), provider);
    const tee = comparison.matchedTees[0];

    expect(tee.historicalUse).toEqual({
      completedRoundCount: 14,
      activeLiveSessionCount: 0,
      blockedByActiveSession: false,
    });
    expect(tee.fields.find((field) => field.field === 'courseRating')?.selectable).toBe(true);
    expect(comparison.summary.activeSessionBlockedTees).toBe(0);
  });

  it.each([
    { completedRounds: 0, activeLiveSessions: 1 },
    { completedRounds: 3, activeLiveSessions: 1 },
  ])('makes every difference read-only when an active live session uses the tee (%o)', (usage) => {
    const provider = normalizeGolfCourseApiCourse(providerRaw(), '00hgpgma');
    const comparison = buildCourseComparison(localState(usage), provider);
    const tee = comparison.matchedTees[0];

    expect(tee.historicalUse.blockedByActiveSession).toBe(true);
    expect([...tee.fields, ...tee.holes.flatMap((hole) => hole.fields)].every((field) => !field.selectable)).toBe(true);
    expect(tee.fields.find((field) => field.field === 'courseRating')?.disabledReason)
      .toBe('This tee cannot be updated while an active live round is using it.');
    expect(comparison.summary.activeSessionBlockedTees).toBe(1);
  });

  it('does not crash and blocks a malformed local tee', () => {
    const provider = normalizeGolfCourseApiCourse(providerRaw(), '00hgpgma');
    const tee = buildCourseComparison(localState({ malformed: true }), provider).matchedTees[0];

    expect(tee.malformedLocalData).toBe(true);
    expect(tee.fields.every((field) => !field.selectable)).toBe(true);
  });

  it('keeps punctuation drift unresolved until an admin explicitly matches it', () => {
    const provider = normalizeGolfCourseApiCourse(providerRaw('Blue.'), '00hgpgma');
    const initial = buildCourseComparison(localState(), provider);
    expect(initial.matchedTees).toHaveLength(0);
    expect(initial.unmatchedProviderTees[0].suggestedLocalTeeIds).toEqual(['10']);
    expect(initial.localOnlyTees).toHaveLength(1);

    const manual = buildCourseComparison(localState(), provider, [{
      providerTeeKey: provider.tees[0].providerTeeKey,
      localTeeId: '10',
    }]);
    expect(manual.matchedTees[0].matchMethod).toBe('manual');
    expect(manual.matchedTees[0].fields.find((field) => field.field === 'teeName')?.status).toBe('changed');
  });
});
