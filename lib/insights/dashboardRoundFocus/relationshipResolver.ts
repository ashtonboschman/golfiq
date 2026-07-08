import type { LatestRoundFocusCandidate } from './latestRoundFocus';
import type { DashboardTrendResult } from './types';

export type ComponentDashboardTrendResult = Extract<DashboardTrendResult, { kind: 'component' }>;
export type AvailableLatestRoundFocus = Extract<LatestRoundFocusCandidate, { kind: 'available' }>;

export type DashboardFocusResolution =
  | {
      source: 'trend';
      relationship: 'trend_only';
      trend: ComponentDashboardTrendResult;
      latestRoundReason: Extract<LatestRoundFocusCandidate, { kind: 'unavailable' }>['reason'];
    }
  | {
      source: 'trend';
      relationship: 'reinforced_by_latest_round';
      trend: ComponentDashboardTrendResult;
      latestRound: AvailableLatestRoundFocus;
    }
  | {
      source: 'trend';
      relationship: 'latest_round_improved_against_trend';
      trend: ComponentDashboardTrendResult;
      latestRound: AvailableLatestRoundFocus;
    }
  | {
      source: 'trend';
      relationship: 'latest_round_inconclusive_same_category';
      trend: ComponentDashboardTrendResult;
      latestRound: AvailableLatestRoundFocus;
    }
  | {
      source: 'trend';
      relationship: 'latest_round_conflicts';
      trend: ComponentDashboardTrendResult;
      latestRound: AvailableLatestRoundFocus;
    }
  | {
      source: 'latest_round';
      relationship: 'latest_round_fallback';
      latestRound: AvailableLatestRoundFocus;
      trendReason: Exclude<DashboardTrendResult['kind'], 'component'>;
    }
  | {
      source: 'neutral';
      relationship: 'no_supported_focus';
      trend: Exclude<DashboardTrendResult, { kind: 'component' }>;
      latestRoundReason: Extract<LatestRoundFocusCandidate, { kind: 'unavailable' }>['reason'];
    };

export type ResolveDashboardFocusRelationshipInput = {
  trend: DashboardTrendResult;
  latestRoundFocus: LatestRoundFocusCandidate;
};

export function resolveDashboardFocusRelationship(
  input: ResolveDashboardFocusRelationshipInput,
): DashboardFocusResolution {
  if (input.trend.kind === 'component') {
    if (input.latestRoundFocus.kind === 'unavailable') {
      return {
        source: 'trend',
        relationship: 'trend_only',
        trend: input.trend,
        latestRoundReason: input.latestRoundFocus.reason,
      };
    }

    if (
      input.latestRoundFocus.category === input.trend.category &&
      input.latestRoundFocus.polarity === 'weakness'
    ) {
      return {
        source: 'trend',
        relationship: 'reinforced_by_latest_round',
        trend: input.trend,
        latestRound: input.latestRoundFocus,
      };
    }

    if (
      input.latestRoundFocus.category === input.trend.category &&
      input.latestRoundFocus.polarity === 'strength'
    ) {
      return {
        source: 'trend',
        relationship: 'latest_round_improved_against_trend',
        trend: input.trend,
        latestRound: input.latestRoundFocus,
      };
    }

    if (input.latestRoundFocus.category === input.trend.category) {
      return {
        source: 'trend',
        relationship: 'latest_round_inconclusive_same_category',
        trend: input.trend,
        latestRound: input.latestRoundFocus,
      };
    }

    return {
      source: 'trend',
      relationship: 'latest_round_conflicts',
      trend: input.trend,
      latestRound: input.latestRoundFocus,
    };
  }

  if (input.latestRoundFocus.kind === 'available') {
    return {
      source: 'latest_round',
      relationship: 'latest_round_fallback',
      latestRound: input.latestRoundFocus,
      trendReason: input.trend.kind,
    };
  }

  return {
    source: 'neutral',
    relationship: 'no_supported_focus',
    trend: input.trend,
    latestRoundReason: input.latestRoundFocus.reason,
  };
}
