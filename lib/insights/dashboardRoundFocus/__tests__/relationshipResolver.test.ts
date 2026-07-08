import type { LatestRoundFocusCandidate } from '../latestRoundFocus';
import { resolveDashboardFocusRelationship } from '../relationshipResolver';
import type {
  DashboardTrendCategory,
  DashboardTrendResult,
  LatestRoundFocusPolarity,
} from '../types';

function componentTrend(category: DashboardTrendCategory = 'approach'): DashboardTrendResult {
  return {
    kind: 'component',
    category,
    confidence: 'strong',
    recentAverage: -0.6,
    baselineAverage: -0.2,
    baselineDelta: -0.4,
    trackedRecentCount: 5,
    negativeRecentCount: 5,
    lowestComponentCount: 5,
    separation: 0.4,
    baselineDirection: 'worse',
    reason: 'negative_declining',
  };
}

function latest(
  category: Extract<LatestRoundFocusCandidate, { kind: 'available' }>['category'] = 'approach',
  polarity: LatestRoundFocusPolarity = 'weakness',
): LatestRoundFocusCandidate {
  return {
    kind: 'available',
    sourceRoundId: '42',
    category,
    polarity,
    confidence: 'strong',
    recommendation: 'Canonical recommendation.',
    primaryKey: category === 'approach' ? 'approach_leak' : 'putting_leak',
    evidenceLevel: 'aggregate_stats',
    identityTone: 'fix',
    overallTone: 'warning',
  };
}

const missingLatest: LatestRoundFocusCandidate = {
  kind: 'unavailable',
  reason: 'missing_identity',
};

const staleLatest: LatestRoundFocusCandidate = {
  kind: 'unavailable',
  reason: 'stale_identity',
};

describe('resolveDashboardFocusRelationship', () => {
  it('keeps a strong Approach trend as trend-only without M3', () => {
    expect(resolveDashboardFocusRelationship({
      trend: componentTrend(),
      latestRoundFocus: missingLatest,
    })).toMatchObject({
      source: 'trend',
      relationship: 'trend_only',
      latestRoundReason: 'missing_identity',
    });
  });

  it('reinforces an Approach trend with an Approach M3', () => {
    expect(resolveDashboardFocusRelationship({
      trend: componentTrend('approach'),
      latestRoundFocus: latest('approach'),
    })).toMatchObject({
      source: 'trend',
      relationship: 'reinforced_by_latest_round',
      latestRound: { polarity: 'weakness' },
    });
  });

  it('marks an Approach strength latest round as improved against the Approach trend', () => {
    expect(resolveDashboardFocusRelationship({
      trend: componentTrend('approach'),
      latestRoundFocus: latest('approach', 'strength'),
    })).toMatchObject({
      source: 'trend',
      relationship: 'latest_round_improved_against_trend',
      latestRound: { category: 'approach', polarity: 'strength' },
    });
  });

  it('marks a Putting strength latest round as improved against the Putting trend', () => {
    expect(resolveDashboardFocusRelationship({
      trend: componentTrend('putting'),
      latestRoundFocus: latest('putting', 'strength'),
    })).toMatchObject({
      source: 'trend',
      relationship: 'latest_round_improved_against_trend',
    });
  });

  it('reinforces a Putting trend with a Putting weakness latest round', () => {
    expect(resolveDashboardFocusRelationship({
      trend: componentTrend('putting'),
      latestRoundFocus: latest('putting', 'weakness'),
    })).toMatchObject({
      source: 'trend',
      relationship: 'reinforced_by_latest_round',
    });
  });

  it('keeps a neutral same-category Off The Tee result inconclusive', () => {
    expect(resolveDashboardFocusRelationship({
      trend: componentTrend('off_the_tee'),
      latestRoundFocus: latest('off_the_tee', 'neutral'),
    })).toMatchObject({
      source: 'trend',
      relationship: 'latest_round_inconclusive_same_category',
      latestRound: { polarity: 'neutral' },
    });
  });

  it('marks an Approach trend and Putting M3 as conflicting', () => {
    expect(resolveDashboardFocusRelationship({
      trend: componentTrend('approach'),
      latestRoundFocus: latest('putting'),
    })).toMatchObject({
      source: 'trend',
      relationship: 'latest_round_conflicts',
      trend: { category: 'approach' },
      latestRound: { category: 'putting' },
    });
  });

  it('does not force a Penalty M3 into an Approach category', () => {
    expect(resolveDashboardFocusRelationship({
      trend: componentTrend('approach'),
      latestRoundFocus: latest('penalties'),
    })).toMatchObject({
      source: 'trend',
      relationship: 'latest_round_conflicts',
      latestRound: { category: 'penalties' },
    });
  });

  it('uses a valid Approach M3 when trend evidence is insufficient', () => {
    const trend: DashboardTrendResult = {
      kind: 'insufficient_evidence',
      confidence: 'building',
      reason: 'fewer_than_five_recent',
    };
    expect(resolveDashboardFocusRelationship({ trend, latestRoundFocus: latest('approach') })).toMatchObject({
      source: 'latest_round',
      relationship: 'latest_round_fallback',
      trendReason: 'insufficient_evidence',
    });
  });

  it.each(['strength', 'weakness'] as const)(
    'preserves %s polarity when latest-round guidance is the fallback',
    (polarity) => {
      const trend: DashboardTrendResult = {
        kind: 'insufficient_evidence',
        confidence: 'building',
        reason: 'fewer_than_five_recent',
      };
      expect(resolveDashboardFocusRelationship({
        trend,
        latestRoundFocus: latest('approach', polarity),
      })).toMatchObject({
        source: 'latest_round',
        relationship: 'latest_round_fallback',
        latestRound: { polarity },
      });
    },
  );

  it('uses a valid Penalty M3 when trend evidence is insufficient', () => {
    const trend: DashboardTrendResult = {
      kind: 'insufficient_evidence',
      confidence: 'building',
      reason: 'no_repeated_negative_component',
    };
    expect(resolveDashboardFocusRelationship({ trend, latestRoundFocus: latest('penalties') })).toMatchObject({
      source: 'latest_round',
      relationship: 'latest_round_fallback',
      latestRound: { category: 'penalties' },
    });
  });

  it('uses valid M3 guidance when the trend has no clear separator', () => {
    const trend: DashboardTrendResult = {
      kind: 'no_clear_separator',
      confidence: 'building',
      candidates: [
        { category: 'approach', recentAverage: -0.5 },
        { category: 'putting', recentAverage: -0.4 },
      ],
    };
    expect(resolveDashboardFocusRelationship({ trend, latestRoundFocus: latest('putting') })).toMatchObject({
      source: 'latest_round',
      relationship: 'latest_round_fallback',
      trendReason: 'no_clear_separator',
    });
  });

  it('keeps all-positive separate while allowing latest-round guidance', () => {
    const trend: DashboardTrendResult = { kind: 'all_positive', confidence: 'building' };
    expect(resolveDashboardFocusRelationship({
      trend,
      latestRoundFocus: latest('scoring_control', 'neutral'),
    })).toMatchObject({
      source: 'latest_round',
      relationship: 'latest_round_fallback',
      trendReason: 'all_positive',
    });
  });

  it('returns neutral for no trend and stale M3', () => {
    const trend: DashboardTrendResult = {
      kind: 'insufficient_evidence',
      confidence: 'building',
      reason: 'no_eligible_components',
    };
    expect(resolveDashboardFocusRelationship({ trend, latestRoundFocus: staleLatest })).toMatchObject({
      source: 'neutral',
      relationship: 'no_supported_focus',
      latestRoundReason: 'stale_identity',
    });
  });

  it('returns neutral for no trend and missing M3', () => {
    const trend: DashboardTrendResult = { kind: 'all_positive', confidence: 'building' };
    expect(resolveDashboardFocusRelationship({ trend, latestRoundFocus: missingLatest })).toMatchObject({
      source: 'neutral',
      relationship: 'no_supported_focus',
      latestRoundReason: 'missing_identity',
    });
  });

  it.each(['moderate', 'strong'] as const)(
    'keeps an eligible %s trend primary when M3 conflicts',
    (confidence) => {
      const trend = { ...componentTrend(), confidence } as DashboardTrendResult;
      const result = resolveDashboardFocusRelationship({ trend, latestRoundFocus: latest('putting') });
      expect(result).toMatchObject({ source: 'trend', relationship: 'latest_round_conflicts' });
    },
  );

  it('never silently replaces a strong trend with a different M3', () => {
    const trend = componentTrend('approach');
    const result = resolveDashboardFocusRelationship({ trend, latestRoundFocus: latest('big_numbers') });
    expect(result.source).toBe('trend');
    expect(result).toMatchObject({ trend });
  });

  it('preserves strength polarity for a normalized carried alias', () => {
    const latestAlias: LatestRoundFocusCandidate = {
      ...latest('approach', 'strength'),
      primaryKey: 'approach_carried',
    } as LatestRoundFocusCandidate;
    expect(resolveDashboardFocusRelationship({
      trend: componentTrend('approach'),
      latestRoundFocus: latestAlias,
    })).toMatchObject({ relationship: 'latest_round_improved_against_trend' });
  });

  it.each(['penalties', 'scoring_control', 'big_numbers', 'volatility', 'all_around'] as const)(
    'does not falsely agree with unsupported trend category %s',
    (category) => {
      expect(resolveDashboardFocusRelationship({
        trend: componentTrend('approach'),
        latestRoundFocus: latest(category),
      })).toMatchObject({ relationship: 'latest_round_conflicts' });
    },
  );

  it('does not mutate trend or M3 inputs', () => {
    const trend = componentTrend();
    const latestRoundFocus = latest('putting');
    const beforeTrend = structuredClone(trend);
    const beforeLatest = structuredClone(latestRoundFocus);

    resolveDashboardFocusRelationship({ trend, latestRoundFocus });

    expect(trend).toEqual(beforeTrend);
    expect(latestRoundFocus).toEqual(beforeLatest);
  });

  it('returns the same relationship for identical inputs', () => {
    const input = { trend: componentTrend(), latestRoundFocus: latest('putting') };
    expect(resolveDashboardFocusRelationship(input)).toEqual(resolveDashboardFocusRelationship(input));
  });
});
