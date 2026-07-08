import { selectDashboardRoundEnvelope } from '../roundEnvelope';
import type {
  DashboardFocusRoundCandidate,
  DashboardFocusRoundCompletionStatus,
  DashboardFocusRoundContext,
} from '../roundEnvelope';
import type { DashboardTrendMode } from '../types';

const NOW = new Date('2026-07-01T12:00:00.000Z');

function makeCandidate(
  id: number,
  options: {
    date?: string;
    createdAt?: string;
    holes?: 9 | 18;
    context?: DashboardFocusRoundContext;
    status?: DashboardFocusRoundCompletionStatus;
    approach?: number | null;
    approachTracked?: boolean;
  } = {},
): DashboardFocusRoundCandidate {
  return {
    roundId: String(id),
    date: options.date ?? `2026-06-${String(id).padStart(2, '0')}T12:00:00.000Z`,
    createdAt: options.createdAt ?? `2026-06-${String(id).padStart(2, '0')}T13:00:00.000Z`,
    playedAt: options.date ?? null,
    holes: options.holes ?? 18,
    roundContext: options.context ?? 'real',
    completionStatus: options.status ?? 'completed',
    components: {
      off_the_tee: { value: 0.1, tracked: true },
      approach: {
        value: options.approach === undefined ? -0.4 : options.approach,
        tracked: options.approachTracked ?? true,
      },
      short_game: { value: 0.1, tracked: true },
      putting: { value: 0.1, tracked: true },
    },
    shortGameOpportunityEligible: true,
    sgConfidence: 'high',
    sgPartialAnalysis: false,
  };
}

function select(
  rounds: DashboardFocusRoundCandidate[],
  options: { mode?: DashboardTrendMode; context?: DashboardFocusRoundContext } = {},
) {
  return selectDashboardRoundEnvelope({
    rounds,
    mode: options.mode ?? 'combined',
    roundContext: options.context ?? 'real',
    now: NOW,
  });
}

describe('selectDashboardRoundEnvelope', () => {
  it('puts the latest five eligible rounds in the recent window', () => {
    const result = select(Array.from({ length: 10 }, (_, index) => makeCandidate(index + 1)));
    expect(result.recentRoundIds).toEqual(['10', '9', '8', '7', '6']);
    expect(result.latestEligibleRoundId).toBe('10');
  });

  it('puts the next fifteen eligible rounds in the baseline window', () => {
    const result = select(Array.from({ length: 20 }, (_, index) => makeCandidate(index + 1)));
    expect(result.baselineRoundIds).toEqual([
      '15', '14', '13', '12', '11', '10', '9', '8', '7', '6', '5', '4', '3', '2', '1',
    ]);
  });

  it('never overlaps recent and baseline IDs', () => {
    const result = select(Array.from({ length: 20 }, (_, index) => makeCandidate(index + 1)));
    expect(result.recentRoundIds.some((id) => result.baselineRoundIds.includes(id))).toBe(false);
  });

  it('uses one baseline round when six rounds are eligible', () => {
    const result = select(Array.from({ length: 6 }, (_, index) => makeCandidate(index + 1)));
    expect(result.recentRoundIds).toEqual(['6', '5', '4', '3', '2']);
    expect(result.baselineRoundIds).toEqual(['1']);
  });

  it('caps an envelope with more than twenty eligible rounds', () => {
    const rounds = Array.from({ length: 25 }, (_, index) =>
      makeCandidate(index + 1, {
        date: new Date(Date.UTC(2026, 5, index + 1)).toISOString(),
        createdAt: new Date(Date.UTC(2026, 5, index + 1, 1)).toISOString(),
      }),
    );
    const result = select(rounds);

    expect(result.recentRounds).toHaveLength(5);
    expect(result.baselineRounds).toHaveLength(15);
    expect([...result.recentRoundIds, ...result.baselineRoundIds]).toEqual(
      Array.from({ length: 20 }, (_, index) => String(25 - index)),
    );
  });

  it('preserves a partial recent window when fewer than five rounds exist', () => {
    const result = select([makeCandidate(1), makeCandidate(2), makeCandidate(3)]);
    expect(result.recentRoundIds).toEqual(['3', '2', '1']);
    expect(result.baselineRoundIds).toEqual([]);
  });

  it('keeps a recent round with missing Approach SG instead of substituting an older round', () => {
    const rounds = Array.from({ length: 7 }, (_, index) => makeCandidate(index + 1));
    rounds[6] = makeCandidate(7, { approach: null, approachTracked: false });
    const result = select(rounds);

    expect(result.recentRoundIds).toEqual(['7', '6', '5', '4', '3']);
    expect(result.recentRounds[0].components.approach).toEqual({ value: null, tracked: false });
    expect(result.baselineRoundIds).toEqual(['2', '1']);
  });

  it('does not mix simulator rounds into a real envelope', () => {
    const result = select([
      makeCandidate(1),
      makeCandidate(2, { context: 'simulator' }),
    ]);
    expect(result.recentRoundIds).toEqual(['1']);
    expect(result.excludedCounts.wrongContext).toBe(1);
  });

  it('does not mix real rounds into a practice envelope', () => {
    const result = select([
      makeCandidate(1, { context: 'practice' }),
      makeCandidate(2, { context: 'real' }),
    ], { context: 'practice' });
    expect(result.recentRoundIds).toEqual(['1']);
    expect(result.excludedCounts.wrongContext).toBe(1);
  });

  it('allows native nine-hole and eighteen-hole rounds in combined mode', () => {
    const result = select([
      makeCandidate(1, { holes: 9 }),
      makeCandidate(2, { holes: 18 }),
    ]);
    expect(result.recentRoundIds).toEqual(['2', '1']);
    expect(result.recentRounds.map((round) => round.holes)).toEqual([18, 9]);
    expect(result.recentRounds[1].components.approach.value).toBe(-0.4);
  });

  it('excludes eighteen-hole rounds from nine-hole mode', () => {
    const result = select([
      makeCandidate(1, { holes: 9 }),
      makeCandidate(2, { holes: 18 }),
    ], { mode: '9' });
    expect(result.recentRoundIds).toEqual(['1']);
    expect(result.excludedCounts.wrongMode).toBe(1);
  });

  it('excludes nine-hole rounds from eighteen-hole mode', () => {
    const result = select([
      makeCandidate(1, { holes: 9 }),
      makeCandidate(2, { holes: 18 }),
    ], { mode: '18' });
    expect(result.recentRoundIds).toEqual(['2']);
    expect(result.excludedCounts.wrongMode).toBe(1);
  });

  it('excludes future-dated rounds', () => {
    const result = select([
      makeCandidate(1),
      makeCandidate(2, { date: '2026-07-02T12:00:00.000Z' }),
    ]);
    expect(result.recentRoundIds).toEqual(['1']);
    expect(result.excludedCounts.future).toBe(1);
  });

  it.each(['active', 'incomplete', 'discarded'] as const)(
    'excludes %s rounds as incomplete',
    (status) => {
      const result = select([makeCandidate(1), makeCandidate(2, { status })]);
      expect(result.recentRoundIds).toEqual(['1']);
      expect(result.excludedCounts.incomplete).toBe(1);
    },
  );

  it('uses createdAt descending when dates match', () => {
    const date = '2026-06-20T12:00:00.000Z';
    const result = select([
      makeCandidate(1, { date, createdAt: '2026-06-20T13:00:00.000Z' }),
      makeCandidate(2, { date, createdAt: '2026-06-20T14:00:00.000Z' }),
    ]);
    expect(result.recentRoundIds).toEqual(['2', '1']);
  });

  it('uses numeric ID descending when date and createdAt match', () => {
    const date = '2026-06-20T12:00:00.000Z';
    const createdAt = '2026-06-20T13:00:00.000Z';
    const result = select([
      makeCandidate(2, { date, createdAt }),
      makeCandidate(10, { date, createdAt }),
    ]);
    expect(result.recentRoundIds).toEqual(['10', '2']);
  });

  it('excludes structurally malformed rounds', () => {
    const malformed = { ...makeCandidate(2), date: 'not-a-date' };
    const result = select([makeCandidate(1), malformed]);
    expect(result.recentRoundIds).toEqual(['1']);
    expect(result.excludedCounts.malformed).toBe(1);
  });

  it('does not mutate candidate ordering or nested SG values', () => {
    const rounds = [makeCandidate(1), makeCandidate(3), makeCandidate(2)];
    const before = structuredClone(rounds);
    select(rounds);
    expect(rounds).toEqual(before);
  });

  it('returns identical windows for identical input', () => {
    const rounds = Array.from({ length: 10 }, (_, index) => makeCandidate(index + 1));
    expect(select(rounds)).toEqual(select(rounds));
  });
});
