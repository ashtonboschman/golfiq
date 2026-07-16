import { DASHBOARD_TREND_CONFIG } from './config';
import { compareStableIdsDescending } from '@/lib/insights/trendEvidence';
import type { DashboardTrendMode, TrendRoundInput } from './types';

export type DashboardFocusRoundContext = 'real' | 'simulator' | 'practice';
export type DashboardFocusRoundCompletionStatus =
  | 'completed'
  | 'active'
  | 'incomplete'
  | 'discarded';

export type DashboardFocusRoundCandidate = Omit<TrendRoundInput, 'holes'> & {
  holes: TrendRoundInput['holes'] | null;
  date: string | Date;
  createdAt: string | Date;
  roundContext: DashboardFocusRoundContext;
  completionStatus: DashboardFocusRoundCompletionStatus;
};

type ValidDashboardFocusRoundCandidate = DashboardFocusRoundCandidate & {
  holes: TrendRoundInput['holes'];
};

export type SelectDashboardRoundEnvelopeInput = {
  rounds: DashboardFocusRoundCandidate[];
  mode: DashboardTrendMode;
  roundContext: DashboardFocusRoundContext;
  now?: Date;
};

export type DashboardRoundEnvelope = {
  recentRounds: TrendRoundInput[];
  baselineRounds: TrendRoundInput[];
  latestEligibleRoundId: string | null;
  recentRoundIds: string[];
  baselineRoundIds: string[];
  excludedCounts: {
    future: number;
    wrongContext: number;
    wrongMode: number;
    incomplete: number;
    malformed: number;
  };
};

type EligibleCandidate = {
  source: ValidDashboardFocusRoundCandidate;
  dateMs: number;
  createdAtMs: number;
};

function isFiniteDate(value: unknown): value is string | Date {
  if (!(typeof value === 'string' || value instanceof Date)) return false;
  return Number.isFinite(new Date(value).getTime());
}
function hasValidTrendShape(
  round: DashboardFocusRoundCandidate,
): round is ValidDashboardFocusRoundCandidate {
  if (typeof round.roundId !== 'string' || round.roundId.trim().length === 0) return false;
  if (!isFiniteDate(round.date) || !isFiniteDate(round.createdAt)) return false;
  if (round.holes !== 9 && round.holes !== 18) return false;
  if (!round.components || typeof round.components !== 'object') return false;

  const categories = ['off_the_tee', 'approach', 'short_game', 'putting'] as const;
  return categories.every((category) => {
    const component = round.components[category];
    if (!component || typeof component !== 'object') return false;
    if (typeof component.tracked !== 'boolean') return false;
    return component.value == null || (typeof component.value === 'number' && Number.isFinite(component.value));
  });
}

function modeMatches(round: ValidDashboardFocusRoundCandidate, mode: DashboardTrendMode): boolean {
  if (mode === '9') return round.holes === 9;
  if (mode === '18') return round.holes === 18;
  return round.holes === 9 || round.holes === 18;
}

function toTrendRound(round: ValidDashboardFocusRoundCandidate): TrendRoundInput {
  return {
    roundId: round.roundId,
    playedAt: round.date,
    holes: round.holes,
    components: {
      off_the_tee: { ...round.components.off_the_tee },
      approach: { ...round.components.approach },
      short_game: { ...round.components.short_game },
      putting: { ...round.components.putting },
    },
    residual: round.residual ? { ...round.residual } : undefined,
    shortGameOpportunityEligible: round.shortGameOpportunityEligible,
    sgPartialAnalysis: round.sgPartialAnalysis,
  };
}

export function selectDashboardRoundEnvelope(
  input: SelectDashboardRoundEnvelopeInput,
): DashboardRoundEnvelope {
  const nowMs = (input.now ?? new Date()).getTime();
  const excludedCounts = {
    future: 0,
    wrongContext: 0,
    wrongMode: 0,
    incomplete: 0,
    malformed: 0,
  };
  const eligible: EligibleCandidate[] = [];

  for (const round of input.rounds) {
    if (!hasValidTrendShape(round)) {
      excludedCounts.malformed += 1;
      continue;
    }
    if (round.completionStatus !== 'completed') {
      excludedCounts.incomplete += 1;
      continue;
    }
    if (round.roundContext !== input.roundContext) {
      excludedCounts.wrongContext += 1;
      continue;
    }
    if (!modeMatches(round, input.mode)) {
      excludedCounts.wrongMode += 1;
      continue;
    }

    const dateMs = new Date(round.date).getTime();
    if (dateMs > nowMs) {
      excludedCounts.future += 1;
      continue;
    }

    eligible.push({
      source: round,
      dateMs,
      createdAtMs: new Date(round.createdAt).getTime(),
    });
  }

  eligible.sort((left, right) => {
    if (left.dateMs !== right.dateMs) return right.dateMs - left.dateMs;
    if (left.createdAtMs !== right.createdAtMs) return right.createdAtMs - left.createdAtMs;
    return compareStableIdsDescending(left.source.roundId, right.source.roundId);
  });

  const recentCandidates = eligible.slice(0, DASHBOARD_TREND_CONFIG.recentWindowSize);
  const baselineCandidates = eligible.slice(
    DASHBOARD_TREND_CONFIG.recentWindowSize,
    DASHBOARD_TREND_CONFIG.recentWindowSize + DASHBOARD_TREND_CONFIG.baselineWindowMax,
  );
  const recentRounds = recentCandidates.map(({ source }) => toTrendRound(source));
  const baselineRounds = baselineCandidates.map(({ source }) => toTrendRound(source));
  const recentRoundIds = recentRounds.map((round) => round.roundId);
  const baselineRoundIds = baselineRounds.map((round) => round.roundId);

  return {
    recentRounds,
    baselineRounds,
    latestEligibleRoundId: recentRoundIds[0] ?? null,
    recentRoundIds,
    baselineRoundIds,
    excludedCounts,
  };
}
