import { GAME_TRENDS_MODE_THRESHOLDS } from './config';
import type { GameTrendsMode, GameTrendsV2Canonical, StabilityState } from './types';

function round1(value: number | null): number | null {
  if (value == null || !Number.isFinite(value)) return null;
  const rounded = Math.round(value * 10) / 10;
  return Object.is(rounded, -0) ? 0 : rounded;
}

function range(values: number[]): number | null {
  if (!values.length) return null;
  return Math.max(...values) - Math.min(...values);
}

function populationStandardDeviation(values: number[]): number | null {
  if (!values.length) return null;
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  const variance = values.reduce((sum, value) => sum + ((value - mean) ** 2), 0) / values.length;
  return Math.sqrt(variance);
}

export function resolveCanonicalStability(args: {
  normalizedToParValues: number[];
  mode: GameTrendsMode;
  hasEligibleRounds: boolean;
}): GameTrendsV2Canonical['stability'] {
  const values = args.normalizedToParValues
    .filter(Number.isFinite)
    .slice(0, 5);

  if (!args.hasEligibleRounds) {
    return { state: 'unavailable', confidence: 'building', evidence: { recentCount: 0, standardDeviation: null, scoreRange: null } };
  }
  if (values.length < 5) {
    return {
      state: 'building',
      confidence: 'building',
      evidence: { recentCount: values.length, standardDeviation: null, scoreRange: round1(range(values)) },
    };
  }

  const standardDeviation = populationStandardDeviation(values) ?? 0;
  const thresholds = GAME_TRENDS_MODE_THRESHOLDS[args.mode];
  const comparisonValue = Math.round(standardDeviation * 1_000_000) / 1_000_000;
  const state: StabilityState = comparisonValue < thresholds.stabilityVariable
    ? 'stable'
    : comparisonValue < thresholds.stabilityVolatile
      ? 'variable'
      : 'volatile';

  return {
    state,
    confidence: 'strong',
    evidence: {
      recentCount: values.length,
      standardDeviation: round1(standardDeviation),
      scoreRange: round1(range(values)),
    },
  };
}
