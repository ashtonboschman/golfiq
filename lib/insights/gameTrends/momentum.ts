import { GAME_TRENDS_MODE_THRESHOLDS } from './config';
import type { GameTrendsMode, ScoringMomentumEvidence } from './types';

function average(values: number[]): number | null {
  if (!values.length) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function round1(value: number | null): number | null {
  if (value == null || !Number.isFinite(value)) return null;
  const rounded = Math.sign(value) * (Math.round(Math.abs(value) * 10) / 10);
  return Object.is(rounded, -0) ? 0 : rounded;
}

export function resolveScoringMomentum(
  scoresNewestFirst: number[],
  mode: GameTrendsMode,
): ScoringMomentumEvidence {
  if (scoresNewestFirst.length < 10) {
    return {
      state: 'unavailable',
      recentCount: Math.min(scoresNewestFirst.length, 5),
      comparisonCount: Math.max(0, Math.min(scoresNewestFirst.length - 5, 5)),
      recentAverageScore: null,
      comparisonAverageScore: null,
      deltaVsPrevious: null,
    };
  }

  const recent = scoresNewestFirst.slice(0, 5);
  const comparison = scoresNewestFirst.slice(5, 10);
  const recentAverage = average(recent);
  const comparisonAverage = average(comparison);
  const delta = recentAverage != null && comparisonAverage != null
    ? recentAverage - comparisonAverage
    : null;
  const threshold = GAME_TRENDS_MODE_THRESHOLDS[mode].momentumScoreChange;
  const state = delta == null
    ? 'unavailable'
    : delta <= -threshold
      ? 'improving'
      : delta >= threshold
        ? 'worsening'
        : 'steady';

  return {
    state,
    recentCount: recent.length,
    comparisonCount: comparison.length,
    recentAverageScore: round1(recentAverage),
    comparisonAverageScore: round1(comparisonAverage),
    deltaVsPrevious: round1(delta),
  };
}
