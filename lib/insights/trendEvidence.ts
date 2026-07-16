export type TrendEvidenceMode = 'combined' | '9' | '18';
export type TrendEvidenceComponent =
  | 'off_the_tee'
  | 'approach'
  | 'short_game'
  | 'putting'
  | 'penalties';

export const TREND_EVIDENCE_COMPONENTS: TrendEvidenceComponent[] = [
  'off_the_tee',
  'approach',
  'short_game',
  'putting',
  'penalties',
];

export type TrendEvidenceRound = {
  roundId: string;
  date: string | Date;
  createdAt: string | Date;
  holes: 9 | 18;
  roundContext: 'real' | 'simulator' | 'practice';
  completed: boolean;
  score: number;
  toPar: number | null;
  sgPartialAnalysis: boolean | null;
  shortGameOpportunityEligible: boolean;
  components: Record<TrendEvidenceComponent, number | null>;
  hashContext?: Record<string, unknown>;
};

export type ComponentTrendEvidence = {
  component: TrendEvidenceComponent;
  values: number[];
  average: number | null;
  trackedCount: number;
  positiveCount: number;
  negativeCount: number;
  rankedHighestCount: number;
  rankedLowestCount: number;
};

export function compareStableIdsDescending(left: string, right: string): number {
  if (/^\d+$/.test(left) && /^\d+$/.test(right)) {
    const leftId = BigInt(left);
    const rightId = BigInt(right);
    if (leftId === rightId) return 0;
    return leftId > rightId ? -1 : 1;
  }
  return right.localeCompare(left);
}

export function compareTrendRoundsDescending(
  left: Pick<TrendEvidenceRound, 'roundId' | 'date' | 'createdAt'>,
  right: Pick<TrendEvidenceRound, 'roundId' | 'date' | 'createdAt'>,
): number {
  const dateDelta = new Date(right.date).getTime() - new Date(left.date).getTime();
  if (dateDelta !== 0) return dateDelta;
  const createdDelta = new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime();
  if (createdDelta !== 0) return createdDelta;
  return compareStableIdsDescending(left.roundId, right.roundId);
}

export function selectEligibleTrendRounds(args: {
  rounds: TrendEvidenceRound[];
  mode: TrendEvidenceMode;
  now?: Date;
  limit?: number;
}): TrendEvidenceRound[] {
  const nowMs = (args.now ?? new Date()).getTime();
  return args.rounds
    .filter((round) => {
      if (!round.completed || round.roundContext !== 'real') return false;
      const dateMs = new Date(round.date).getTime();
      const createdAtMs = new Date(round.createdAt).getTime();
      if (!Number.isFinite(dateMs) || !Number.isFinite(createdAtMs) || dateMs > nowMs) return false;
      if (round.holes !== 9 && round.holes !== 18) return false;
      if (args.mode === '9') return round.holes === 9;
      if (args.mode === '18') return round.holes === 18;
      return true;
    })
    .sort(compareTrendRoundsDescending)
    .slice(0, args.limit ?? Number.POSITIVE_INFINITY);
}

export function normalizeTrendValue(value: number | null, holes: 9 | 18, mode: TrendEvidenceMode): number | null {
  if (value == null || !Number.isFinite(value)) return null;
  return mode === 'combined' && holes === 9 ? value * 2 : value;
}

export function isSgComponentAvailable(args: {
  value: number | null;
  eligible?: boolean;
}): boolean {
  return args.eligible !== false && args.value != null && Number.isFinite(args.value);
}

export function isShortGameOpportunityEligible(holes: 9 | 18, girHit: number | null): boolean {
  if (girHit == null || !Number.isFinite(girHit)) return false;
  return Math.max(0, holes - girHit) >= (holes === 9 ? 2 : 4);
}

function average(values: number[]): number | null {
  if (!values.length) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

export function buildComponentTrendEvidence(
  rounds: TrendEvidenceRound[],
  mode: TrendEvidenceMode,
): Record<TrendEvidenceComponent, ComponentTrendEvidence> {
  const evidence = Object.fromEntries(
    TREND_EVIDENCE_COMPONENTS.map((component) => [component, {
      component,
      values: [],
      average: null,
      trackedCount: 0,
      positiveCount: 0,
      negativeCount: 0,
      rankedHighestCount: 0,
      rankedLowestCount: 0,
    }]),
  ) as unknown as Record<TrendEvidenceComponent, ComponentTrendEvidence>;

  for (const round of rounds) {
    const usable: Array<{ component: TrendEvidenceComponent; value: number }> = [];
    for (const component of TREND_EVIDENCE_COMPONENTS) {
      const value = normalizeTrendValue(round.components[component], round.holes, mode);
      const available = isSgComponentAvailable({
        value,
        eligible: component !== 'short_game' || round.shortGameOpportunityEligible,
      });
      if (!available || value == null) continue;
      const target = evidence[component];
      target.values.push(value);
      target.trackedCount += 1;
      if (value > 0) target.positiveCount += 1;
      if (value < 0) target.negativeCount += 1;
      usable.push({ component, value });
    }

    if (usable.length) {
      const highest = Math.max(...usable.map((entry) => entry.value));
      const lowest = Math.min(...usable.map((entry) => entry.value));
      const highestRows = usable.filter((entry) => entry.value === highest);
      const lowestRows = usable.filter((entry) => entry.value === lowest);
      if (highestRows.length === 1) evidence[highestRows[0].component].rankedHighestCount += 1;
      if (lowestRows.length === 1) evidence[lowestRows[0].component].rankedLowestCount += 1;
    }
  }

  for (const component of TREND_EVIDENCE_COMPONENTS) {
    evidence[component].average = average(evidence[component].values);
  }
  return evidence;
}

export function componentSeparation(
  selected: ComponentTrendEvidence,
  alternatives: ComponentTrendEvidence[],
  direction: 'highest' | 'lowest',
): number | null {
  if (selected.average == null) return null;
  const values = alternatives
    .filter((entry) => entry.component !== selected.component && entry.average != null)
    .map((entry) => entry.average as number);
  if (!values.length) return Math.abs(selected.average);
  const comparator = direction === 'highest' ? Math.max(...values) : Math.min(...values);
  return direction === 'highest' ? selected.average - comparator : comparator - selected.average;
}
