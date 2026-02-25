jest.mock('@/lib/insights/overall', () => {
  const actual = jest.requireActual('@/lib/insights/overall');
  return {
    ...actual,
    pickDeterministicDrillSeeded: jest.fn(
      () => 'Mock drill line for card. Goal: hit 10 clean reps.',
    ),
  };
});

import { pickDeterministicDrillSeeded } from '@/lib/insights/overall';
import {
  buildDashboardOverallInsightsSummary,
  buildRoundFocusState,
  focusComponentLabel,
  type DashboardOverallInsightsSummary,
} from '@/lib/insights/dashboardFocus';

const mockedPickDeterministicDrillSeeded =
  pickDeterministicDrillSeeded as jest.MockedFunction<
    typeof pickDeterministicDrillSeeded
  >;

function makeSummary(
  overrides: Partial<DashboardOverallInsightsSummary> = {},
): DashboardOverallInsightsSummary {
  return {
    lastUpdatedAt: '2026-02-24T10:00:00.000Z',
    drillSeed: 'seed-hash-123',
    mode: 'combined',
    roundsRecent: 5,
    recentWindow: 5,
    scoreTrendDelta: -0.8,
    trajectoryLabel: 'Improving',
    consistencyLabel: 'Stable',
    consistencySpread: 2.1,
    projectionScore: 77.8,
    projectionScoreRange: { low: 76.9, high: 79.1 },
    projectionHandicap: 7.8,
    sgComponentDelta: {
      offTee: -0.2,
      approach: -0.4,
      putting: -0.6,
      penalties: -0.3,
      residual: 0.1,
    },
    biggestLeakComponent: 'putting',
    confidence: 'medium',
    dataQualityFlags: {
      insufficientRounds: false,
      missingScoreTrend: false,
      combinedNeedsMoreNineHoleRounds: false,
      missingComponentData: false,
      residualDominant: false,
      volatileScoring: false,
    },
    ...overrides,
  };
}

function makeInsightsPayload(mutator?: (payload: any) => void): any {
  const payload = {
    generated_at: '2026-02-24T10:00:00.000Z',
    data_hash: 'payload-hash-456',
    tier_context: { recentWindow: 5 },
    projection: {
      trajectory: 'flat',
      projectedHandicapIn10: 5.2,
    },
    projection_by_mode: {
      combined: {
        trajectory: 'flat',
        projectedScoreIn10: 78.44,
        scoreLow: 77.25,
        scoreHigh: 80.26,
      },
      '9': {
        trajectory: 'improving',
        projectedScoreIn10: 39.6,
        scoreLow: 38.9,
        scoreHigh: 40.2,
      },
      '18': {
        trajectory: 'worsening',
        projectedScoreIn10: 79.1,
        scoreLow: 77.8,
        scoreHigh: 80.4,
      },
    },
    mode_payload: {
      combined: {
        kpis: {
          roundsRecent: 5,
          avgScoreRecent: 78.2,
          avgScoreBaseline: 79.0,
          deltaVsBaseline: -0.84,
        },
        consistency: {
          label: 'stable',
          stdDev: 2.02,
        },
        sgComponents: {
          hasData: true,
          recentAvg: {
            offTee: -0.2,
            approach: -0.4,
            putting: -0.6,
            penalties: -0.3,
            residual: 0.1,
          },
          baselineAvg: {
            offTee: 0,
            approach: 0,
            putting: 0,
            penalties: 0,
            residual: 0,
          },
        },
      },
      '9': {
        kpis: {
          roundsRecent: 2,
          avgScoreRecent: 40.2,
          avgScoreBaseline: 40.6,
          deltaVsBaseline: -0.4,
        },
      },
      '18': {
        kpis: {
          roundsRecent: 5,
          avgScoreRecent: 79.8,
          avgScoreBaseline: 79.2,
          deltaVsBaseline: 0.6,
        },
      },
    },
    sg: {
      components: {
        latest: {
          confidence: 'medium',
        },
      },
    },
  };

  if (mutator) mutator(payload);
  return payload;
}

describe('dashboardFocus summary mapping', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns null for non-object payloads', () => {
    expect(buildDashboardOverallInsightsSummary(null, 'combined')).toBeNull();
    expect(buildDashboardOverallInsightsSummary(undefined, 'combined')).toBeNull();
    expect(buildDashboardOverallInsightsSummary('bad', 'combined')).toBeNull();
  });

  it('returns null when selected mode payload is missing', () => {
    const payload = makeInsightsPayload((draft) => {
      delete draft.mode_payload.combined;
    });
    expect(buildDashboardOverallInsightsSummary(payload, 'combined')).toBeNull();
  });

  it('maps and rounds core fields from payload', () => {
    const summary = buildDashboardOverallInsightsSummary(
      makeInsightsPayload(),
      'combined',
    );
    expect(summary).not.toBeNull();
    expect(summary?.scoreTrendDelta).toBe(-0.8);
    expect(summary?.consistencySpread).toBe(2);
    expect(summary?.projectionScore).toBe(78.4);
    expect(summary?.projectionScoreRange).toEqual({ low: 77.3, high: 80.3 });
    expect(summary?.projectionHandicap).toBe(5.2);
    expect(summary?.drillSeed).toBe('payload-hash-456');
    expect(summary?.recentWindow).toBe(5);
  });

  it('defaults recentWindow to 5 and drillSeed to null when missing', () => {
    const payload = makeInsightsPayload((draft) => {
      delete draft.tier_context;
      delete draft.data_hash;
    });
    const summary = buildDashboardOverallInsightsSummary(payload, 'combined');
    expect(summary?.recentWindow).toBe(5);
    expect(summary?.drillSeed).toBeNull();
  });

  it('derives trajectory label from score averages and normalizes consistency label', () => {
    const improving = makeInsightsPayload((draft) => {
      draft.mode_payload.combined.kpis.avgScoreRecent = 77.9;
      draft.mode_payload.combined.kpis.avgScoreBaseline = 79.0;
      draft.mode_payload.combined.consistency.label = 'moderate';
    });
    const summary1 = buildDashboardOverallInsightsSummary(improving, 'combined');
    expect(summary1?.trajectoryLabel).toBe('Improving');
    expect(summary1?.consistencyLabel).toBe('Moderate');

    const stable = makeInsightsPayload((draft) => {
      draft.mode_payload.combined.kpis.avgScoreRecent = 78.5;
      draft.mode_payload.combined.kpis.avgScoreBaseline = 79.0;
    });
    expect(
      buildDashboardOverallInsightsSummary(stable, 'combined')?.trajectoryLabel,
    ).toBe('Stable');

    const worsening = makeInsightsPayload((draft) => {
      draft.mode_payload.combined.kpis.avgScoreRecent = 80.2;
      draft.mode_payload.combined.kpis.avgScoreBaseline = 79.0;
    });
    expect(
      buildDashboardOverallInsightsSummary(worsening, 'combined')?.trajectoryLabel,
    ).toBe('Worsening');
  });

  it('uses mode-specific epsilon when deriving trajectory labels', () => {
    const nineStableBoundary = makeInsightsPayload((draft) => {
      draft.mode_payload['9'].kpis.avgScoreRecent = 40.5;
      draft.mode_payload['9'].kpis.avgScoreBaseline = 40.0;
    });
    expect(
      buildDashboardOverallInsightsSummary(nineStableBoundary, '9')?.trajectoryLabel,
    ).toBe('Stable');

    const nineWorsening = makeInsightsPayload((draft) => {
      draft.mode_payload['9'].kpis.avgScoreRecent = 40.6;
      draft.mode_payload['9'].kpis.avgScoreBaseline = 40.0;
    });
    expect(
      buildDashboardOverallInsightsSummary(nineWorsening, '9')?.trajectoryLabel,
    ).toBe('Worsening');
  });

  it('flags insufficient rounds when roundsRecent < 3', () => {
    const payload = makeInsightsPayload((draft) => {
      draft.mode_payload.combined.kpis.roundsRecent = 2;
    });
    const summary = buildDashboardOverallInsightsSummary(payload, 'combined');
    expect(summary?.dataQualityFlags.insufficientRounds).toBe(true);
  });

  it('flags missing score trend when delta is null', () => {
    const payload = makeInsightsPayload((draft) => {
      draft.mode_payload.combined.kpis.deltaVsBaseline = null;
    });
    const summary = buildDashboardOverallInsightsSummary(payload, 'combined');
    expect(summary?.dataQualityFlags.missingScoreTrend).toBe(true);
  });

  it('flags combinedNeedsMoreNineHoleRounds only for combined mode gate conditions', () => {
    const payload = makeInsightsPayload((draft) => {
      draft.mode_payload.combined.kpis.roundsRecent = 2;
      draft.mode_payload['9'].kpis.roundsRecent = 0;
      draft.mode_payload['18'].kpis.roundsRecent = 4;
    });
    const combinedSummary = buildDashboardOverallInsightsSummary(payload, 'combined');
    expect(combinedSummary?.dataQualityFlags.combinedNeedsMoreNineHoleRounds).toBe(
      true,
    );
    const nineSummary = buildDashboardOverallInsightsSummary(payload, '9');
    expect(nineSummary?.dataQualityFlags.combinedNeedsMoreNineHoleRounds).toBe(false);
  });

  it('does not flag combinedNeedsMoreNineHoleRounds when combined mode already has enough rounds', () => {
    const payload = makeInsightsPayload((draft) => {
      draft.mode_payload.combined.kpis.roundsRecent = 3;
      draft.mode_payload['9'].kpis.roundsRecent = 0;
      draft.mode_payload['18'].kpis.roundsRecent = 6;
    });
    const summary = buildDashboardOverallInsightsSummary(payload, 'combined');
    expect(summary?.dataQualityFlags.combinedNeedsMoreNineHoleRounds).toBe(false);
  });

  it('sanitizes malformed roundsRecent and recentWindow values', () => {
    const payload = makeInsightsPayload((draft) => {
      draft.mode_payload.combined.kpis.roundsRecent = 'not-a-number';
      draft.tier_context.recentWindow = '';
    });
    const summary = buildDashboardOverallInsightsSummary(payload, 'combined');
    expect(summary?.roundsRecent).toBe(0);
    expect(summary?.recentWindow).toBe(5);
    expect(summary?.dataQualityFlags.insufficientRounds).toBe(true);
  });

  it('flags volatile scoring by label and by spread threshold', () => {
    const byLabel = makeInsightsPayload((draft) => {
      draft.mode_payload.combined.consistency.label = 'volatile';
      draft.mode_payload.combined.consistency.stdDev = 2.0;
    });
    expect(
      buildDashboardOverallInsightsSummary(byLabel, 'combined')?.dataQualityFlags
        .volatileScoring,
    ).toBe(true);

    const bySpread = makeInsightsPayload((draft) => {
      draft.mode_payload.combined.consistency.label = 'stable';
      draft.mode_payload.combined.consistency.stdDev = 4.2;
    });
    expect(
      buildDashboardOverallInsightsSummary(bySpread, 'combined')?.dataQualityFlags
        .volatileScoring,
    ).toBe(true);
  });

  it('handles projection score range null and partial availability', () => {
    const noRange = makeInsightsPayload((draft) => {
      draft.projection_by_mode.combined.scoreLow = null;
      draft.projection_by_mode.combined.scoreHigh = null;
    });
    expect(
      buildDashboardOverallInsightsSummary(noRange, 'combined')?.projectionScoreRange,
    ).toBeNull();

    const partialRange = makeInsightsPayload((draft) => {
      draft.projection_by_mode.combined.scoreLow = null;
      draft.projection_by_mode.combined.scoreHigh = 80.31;
    });
    expect(
      buildDashboardOverallInsightsSummary(partialRange, 'combined')
        ?.projectionScoreRange,
    ).toEqual({ low: null, high: 80.3 });
  });

  it('maps sg deltas and normalizes confidence', () => {
    const payload = makeInsightsPayload((draft) => {
      draft.sg.components.latest.confidence = 'high';
      draft.mode_payload.combined.sgComponents.recentAvg.offTee = -0.26;
      draft.mode_payload.combined.sgComponents.baselineAvg.offTee = -0.2;
    });
    const summary = buildDashboardOverallInsightsSummary(payload, 'combined');
    expect(summary?.sgComponentDelta?.offTee).toBe(-0.1);
    expect(summary?.confidence).toBe('high');
  });

  it('parses numeric strings across score/projection fields', () => {
    const payload = makeInsightsPayload((draft) => {
      draft.mode_payload.combined.kpis.deltaVsBaseline = '-0.84';
      draft.projection_by_mode.combined.projectedScoreIn10 = '78.44';
      draft.projection_by_mode.combined.scoreLow = '77.25';
      draft.projection_by_mode.combined.scoreHigh = '80.26';
      draft.projection.projectedHandicapIn10 = '5.2';
      draft.tier_context.recentWindow = '7';
    });
    const summary = buildDashboardOverallInsightsSummary(payload, 'combined');
    expect(summary?.scoreTrendDelta).toBe(-0.8);
    expect(summary?.projectionScore).toBe(78.4);
    expect(summary?.projectionScoreRange).toEqual({ low: 77.3, high: 80.3 });
    expect(summary?.projectionHandicap).toBe(5.2);
    expect(summary?.recentWindow).toBe(7);
  });

  it('normalizes invalid confidence to null', () => {
    const payload = makeInsightsPayload((draft) => {
      draft.sg.components.latest.confidence = 'unknown';
    });
    const summary = buildDashboardOverallInsightsSummary(payload, 'combined');
    expect(summary?.confidence).toBeNull();
  });

  it('falls back to delta field when score averages are missing', () => {
    const payload = makeInsightsPayload((draft) => {
      delete draft.mode_payload.combined.kpis.avgScoreRecent;
      delete draft.mode_payload.combined.kpis.avgScoreBaseline;
      draft.mode_payload.combined.kpis.deltaVsBaseline = '1.2';
    });
    const summary = buildDashboardOverallInsightsSummary(payload, 'combined');
    expect(summary?.trajectoryLabel).toBe('Worsening');
  });

  it('maps generated_at to null when empty', () => {
    const payload = makeInsightsPayload((draft) => {
      draft.generated_at = '';
    });
    const summary = buildDashboardOverallInsightsSummary(payload, 'combined');
    expect(summary?.lastUpdatedAt).toBeNull();
  });

  it('sets missingComponentData when sg components are unavailable', () => {
    const payload = makeInsightsPayload((draft) => {
      draft.mode_payload.combined.sgComponents.hasData = false;
    });
    const summary = buildDashboardOverallInsightsSummary(payload, 'combined');
    expect(summary?.sgComponentDelta).toBeNull();
    expect(summary?.dataQualityFlags.missingComponentData).toBe(true);
    expect(summary?.biggestLeakComponent).toBeNull();
  });

  it('sets missingComponentData when sg components exist but all values are null', () => {
    const payload = makeInsightsPayload((draft) => {
      draft.mode_payload.combined.sgComponents = {
        hasData: true,
        recentAvg: {
          offTee: null,
          approach: null,
          putting: null,
          penalties: null,
          residual: null,
        },
        baselineAvg: {
          offTee: null,
          approach: null,
          putting: null,
          penalties: null,
          residual: null,
        },
      };
    });
    const summary = buildDashboardOverallInsightsSummary(payload, 'combined');
    expect(summary?.sgComponentDelta).toEqual({
      offTee: null,
      approach: null,
      putting: null,
      penalties: null,
      residual: null,
    });
    expect(summary?.dataQualityFlags.missingComponentData).toBe(true);
  });

  it('selects biggest leak by most negative delta', () => {
    const payload = makeInsightsPayload((draft) => {
      draft.mode_payload.combined.sgComponents.recentAvg = {
        offTee: -0.1,
        approach: -0.8,
        putting: -0.4,
        penalties: -0.2,
        residual: 0.1,
      };
    });
    const summary = buildDashboardOverallInsightsSummary(payload, 'combined');
    expect(summary?.biggestLeakComponent).toBe('approach');
  });

  it('applies tie-break ordering for near-tie component deltas', () => {
    const payload = makeInsightsPayload((draft) => {
      draft.mode_payload.combined.sgComponents.recentAvg = {
        offTee: -0.2,
        approach: -0.3,
        putting: -0.5,
        penalties: -0.55,
        residual: 0.01,
      };
    });
    const summary = buildDashboardOverallInsightsSummary(payload, 'combined');
    expect(summary?.biggestLeakComponent).toBe('penalties');
  });

  it('returns null biggestLeakComponent when no component is negative', () => {
    const payload = makeInsightsPayload((draft) => {
      draft.mode_payload.combined.sgComponents.recentAvg = {
        offTee: 0.1,
        approach: 0.2,
        putting: 0.3,
        penalties: 0.1,
        residual: -0.2,
      };
    });
    const summary = buildDashboardOverallInsightsSummary(payload, 'combined');
    expect(summary?.biggestLeakComponent).toBeNull();
  });

  it('flags residual dominance when residual is large and other components are small', () => {
    const payload = makeInsightsPayload((draft) => {
      draft.mode_payload.combined.sgComponents.recentAvg = {
        offTee: -0.05,
        approach: 0.04,
        putting: -0.02,
        penalties: 0.03,
        residual: -0.7,
      };
    });
    const summary = buildDashboardOverallInsightsSummary(payload, 'combined');
    expect(summary?.dataQualityFlags.residualDominant).toBe(true);
  });

  it('flags residual dominance when residual is large and all other components are missing', () => {
    const payload = makeInsightsPayload((draft) => {
      draft.mode_payload.combined.sgComponents = {
        hasData: true,
        recentAvg: {
          offTee: null,
          approach: null,
          putting: null,
          penalties: null,
          residual: -0.5,
        },
        baselineAvg: {
          offTee: null,
          approach: null,
          putting: null,
          penalties: null,
          residual: 0,
        },
      };
    });
    const summary = buildDashboardOverallInsightsSummary(payload, 'combined');
    expect(summary?.dataQualityFlags.residualDominant).toBe(true);
  });

  it('does not flag residual dominance when another component is material', () => {
    const payload = makeInsightsPayload((draft) => {
      draft.mode_payload.combined.sgComponents.recentAvg = {
        offTee: -0.2,
        approach: 0.04,
        putting: -0.02,
        penalties: 0.03,
        residual: -0.7,
      };
    });
    const summary = buildDashboardOverallInsightsSummary(payload, 'combined');
    expect(summary?.dataQualityFlags.residualDominant).toBe(false);
  });
});

describe('dashboardFocus state output', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedPickDeterministicDrillSeeded.mockReturnValue(
      'Mock drill line for card. Goal: hit 10 clean reps.',
    );
  });

  it('returns NEED_MORE_ROUNDS for null summary', () => {
    const state = buildRoundFocusState(null, false, false);
    expect(state).toEqual({
      kind: 'NEED_MORE_ROUNDS',
      roundsLogged: 0,
      minRounds: 3,
    });
  });

  it('returns NEED_MORE_ROUNDS for all explicit gating flags', () => {
    const base = makeSummary();
    const variants = [
      { insufficientRounds: true, missingScoreTrend: false, combinedNeedsMoreNineHoleRounds: false },
      { insufficientRounds: false, missingScoreTrend: true, combinedNeedsMoreNineHoleRounds: false },
      { insufficientRounds: false, missingScoreTrend: false, combinedNeedsMoreNineHoleRounds: true },
    ];

    variants.forEach((flags) => {
      const state = buildRoundFocusState(
        makeSummary({
          roundsRecent: 2,
          dataQualityFlags: { ...base.dataQualityFlags, ...flags },
        }),
        false,
        false,
      );
      expect(state.kind).toBe('NEED_MORE_ROUNDS');
      if (state.kind !== 'NEED_MORE_ROUNDS') return;
      expect(state.roundsLogged).toBe(2);
      expect(state.minRounds).toBe(3);
    });
  });

  it('returns READY_FREE and passes through isLimited', () => {
    const limited = buildRoundFocusState(makeSummary(), false, true);
    expect(limited.kind).toBe('READY_FREE');
    if (limited.kind !== 'READY_FREE') return;
    expect(limited.isLimited).toBe(true);

    const unlimited = buildRoundFocusState(makeSummary(), false, false);
    expect(unlimited.kind).toBe('READY_FREE');
    if (unlimited.kind !== 'READY_FREE') return;
    expect(unlimited.isLimited).toBe(false);
  });

  it('uses all score bucket copy variants for free state', () => {
    const build = (delta: number) =>
      buildRoundFocusState(
        makeSummary({
          scoreTrendDelta: delta,
          dataQualityFlags: { ...makeSummary().dataQualityFlags, volatileScoring: false },
        }),
        false,
        false,
      );

    const improving = build(-1.3);
    expect(improving.kind).toBe('READY_FREE');
    if (improving.kind !== 'READY_FREE') return;
    expect(improving.focus.headline).toBe('Build on momentum.');
    expect(improving.focus.body).toContain('1.3');

    const flat = build(-0.4);
    expect(flat.kind).toBe('READY_FREE');
    if (flat.kind !== 'READY_FREE') return;
    expect(flat.focus.headline).toBe('Turn stability into progress.');

    const worsening = build(1.1);
    expect(worsening.kind).toBe('READY_FREE');
    if (worsening.kind !== 'READY_FREE') return;
    expect(worsening.focus.headline).toBe('Stop the leak.');
  });

  it('uses score-bucket boundary values deterministically for combined mode', () => {
    const improvingBoundary = buildRoundFocusState(
      makeSummary({ scoreTrendDelta: -1 }),
      false,
      false,
    );
    expect(improvingBoundary.kind).toBe('READY_FREE');
    if (improvingBoundary.kind !== 'READY_FREE') return;
    expect(improvingBoundary.focus.headline).toBe('Turn stability into progress.');

    const worseningBoundary = buildRoundFocusState(
      makeSummary({ scoreTrendDelta: 1 }),
      false,
      false,
    );
    expect(worseningBoundary.kind).toBe('READY_FREE');
    if (worseningBoundary.kind !== 'READY_FREE') return;
    expect(worseningBoundary.focus.headline).toBe('Turn stability into progress.');
  });

  it('uses score-bucket boundary values deterministically for 9-hole mode', () => {
    const nineImproveBoundary = buildRoundFocusState(
      makeSummary({ mode: '9', scoreTrendDelta: -0.5 }),
      false,
      false,
    );
    expect(nineImproveBoundary.kind).toBe('READY_FREE');
    if (nineImproveBoundary.kind !== 'READY_FREE') return;
    expect(nineImproveBoundary.focus.headline).toBe('Turn stability into progress.');

    const nineWorsenBoundary = buildRoundFocusState(
      makeSummary({ mode: '9', scoreTrendDelta: 0.5 }),
      false,
      false,
    );
    expect(nineWorsenBoundary.kind).toBe('READY_FREE');
    if (nineWorsenBoundary.kind !== 'READY_FREE') return;
    expect(nineWorsenBoundary.focus.headline).toBe('Turn stability into progress.');
  });

  it('uses score-bucket out-of-band values for 9-hole mode', () => {
    const nineImproving = buildRoundFocusState(
      makeSummary({ mode: '9', scoreTrendDelta: -0.6 }),
      false,
      false,
    );
    expect(nineImproving.kind).toBe('READY_FREE');
    if (nineImproving.kind !== 'READY_FREE') return;
    expect(nineImproving.focus.headline).toBe('Build on momentum.');

    const nineWorsening = buildRoundFocusState(
      makeSummary({ mode: '9', scoreTrendDelta: 0.6 }),
      false,
      false,
    );
    expect(nineWorsening.kind).toBe('READY_FREE');
    if (nineWorsening.kind !== 'READY_FREE') return;
    expect(nineWorsening.focus.headline).toBe('Stop the leak.');
  });

  it('uses volatile vs stable supporting copy for score focus', () => {
    const volatileState = buildRoundFocusState(
      makeSummary({
        dataQualityFlags: { ...makeSummary().dataQualityFlags, volatileScoring: true },
      }),
      false,
      false,
    );
    expect(volatileState.kind).toBe('READY_FREE');
    if (volatileState.kind !== 'READY_FREE') return;
    expect(volatileState.focus.supportingLine).toContain('volatile');

    const stableState = buildRoundFocusState(
      makeSummary({
        dataQualityFlags: { ...makeSummary().dataQualityFlags, volatileScoring: false },
      }),
      false,
      false,
    );
    expect(stableState.kind).toBe('READY_FREE');
    if (stableState.kind !== 'READY_FREE') return;
    expect(stableState.focus.supportingLine).toContain('Stay disciplined');
  });

  it('shows basedOnCaption only when recentWindow is 5', () => {
    const withCaption = buildRoundFocusState(
      makeSummary({ recentWindow: 5 }),
      false,
      false,
    );
    expect(withCaption.kind).toBe('READY_FREE');
    if (withCaption.kind !== 'READY_FREE') return;
    expect(withCaption.focus.basedOnCaption).toBe('Based on last 5 vs baseline');

    const withoutCaption = buildRoundFocusState(
      makeSummary({ recentWindow: 10 }),
      false,
      false,
    );
    expect(withoutCaption.kind).toBe('READY_FREE');
    if (withoutCaption.kind !== 'READY_FREE') return;
    expect(withoutCaption.focus.basedOnCaption).toBeUndefined();
  });

  it('returns premium residual-focused message when residual is dominant', () => {
    const state = buildRoundFocusState(
      makeSummary({
        dataQualityFlags: { ...makeSummary().dataQualityFlags, residualDominant: true },
      }),
      true,
      false,
    );
    expect(state.kind).toBe('READY_PREMIUM');
    if (state.kind !== 'READY_PREMIUM') return;
    expect(state.focus.headline).toBe('Track 1 extra stat this round.');
    expect(state.focus.component).toBe('residual');
  });

  it('hides basedOnCaption in premium residual state when recentWindow is not 5', () => {
    const state = buildRoundFocusState(
      makeSummary({
        recentWindow: 10,
        dataQualityFlags: { ...makeSummary().dataQualityFlags, residualDominant: true },
      }),
      true,
      false,
    );
    expect(state.kind).toBe('READY_PREMIUM');
    if (state.kind !== 'READY_PREMIUM') return;
    expect(state.focus.basedOnCaption).toBeUndefined();
  });

  it('returns premium residual-focused message when component data is missing', () => {
    const state = buildRoundFocusState(
      makeSummary({
        sgComponentDelta: null,
        dataQualityFlags: { ...makeSummary().dataQualityFlags, missingComponentData: true },
      }),
      true,
      false,
    );
    expect(state.kind).toBe('READY_PREMIUM');
    if (state.kind !== 'READY_PREMIUM') return;
    expect(state.focus.component).toBe('residual');
    expect(state.focus.headline).toBe('Track 1 extra stat this round.');
  });

  it('falls back to score focus for premium when component is null/residual/missing-delta', () => {
    const noComponent = buildRoundFocusState(
      makeSummary({ biggestLeakComponent: null }),
      true,
      false,
    );
    expect(noComponent.kind).toBe('READY_PREMIUM');
    if (noComponent.kind !== 'READY_PREMIUM') return;
    expect(noComponent.focus.focusType).toBe('score');
    expect(noComponent.focus.drillLine).toBeUndefined();

    const residualComponent = buildRoundFocusState(
      makeSummary({ biggestLeakComponent: 'residual' }),
      true,
      false,
    );
    expect(residualComponent.kind).toBe('READY_PREMIUM');
    if (residualComponent.kind !== 'READY_PREMIUM') return;
    expect(residualComponent.focus.focusType).toBe('score');

    const missingComponentDelta = buildRoundFocusState(
      makeSummary({
        biggestLeakComponent: 'putting',
        sgComponentDelta: {
          offTee: -0.2,
          approach: -0.3,
          putting: null,
          penalties: -0.1,
          residual: 0.2,
        },
      }),
      true,
      false,
    );
    expect(missingComponentDelta.kind).toBe('READY_PREMIUM');
    if (missingComponentDelta.kind !== 'READY_PREMIUM') return;
    expect(missingComponentDelta.focus.focusType).toBe('score');
  });

  it('renders component-specific premium headlines and bodies', () => {
    const cases: Array<{
      component: 'offTee' | 'approach' | 'putting' | 'penalties';
      expectedHeadline: string;
      bodyFragment: string;
    }> = [
      {
        component: 'offTee',
        expectedHeadline: 'Priority: Fairway-first tee shots.',
        bodyFragment: 'Off the Tee is costing',
      },
      {
        component: 'approach',
        expectedHeadline: 'Priority: Start-line control on approaches.',
        bodyFragment: 'Approach is down',
      },
      {
        component: 'putting',
        expectedHeadline: 'Priority: Speed control.',
        bodyFragment: 'Putting is down',
      },
      {
        component: 'penalties',
        expectedHeadline: 'Priority: Zero penalty strokes.',
        bodyFragment: 'Penalties are costing',
      },
    ];

    cases.forEach(({ component, expectedHeadline, bodyFragment }) => {
      const state = buildRoundFocusState(
        makeSummary({
          biggestLeakComponent: component,
          sgComponentDelta: {
            offTee: -0.3,
            approach: -0.3,
            putting: -0.3,
            penalties: -0.3,
            residual: 0.1,
          },
        }),
        true,
        false,
      );
      expect(state.kind).toBe('READY_PREMIUM');
      if (state.kind !== 'READY_PREMIUM') return;
      expect(state.focus.headline).toBe(expectedHeadline);
      expect(state.focus.body).toContain(bodyFragment);
      expect(state.focus.drillLine).toContain('Do this next:');
    });
  });

  it('handles unexpected component ids by falling back to generic component body', () => {
    const state = buildRoundFocusState(
      makeSummary({
        biggestLeakComponent: 'unknown_component' as any,
        sgComponentDelta: {
          offTee: -0.3,
          approach: -0.2,
          putting: -0.1,
          penalties: -0.4,
          residual: -0.1,
          unknown_component: -0.9,
        } as any,
      }),
      true,
      false,
    );

    expect(state.kind).toBe('READY_PREMIUM');
    if (state.kind !== 'READY_PREMIUM') return;
    expect(state.focus.focusType).toBe('component');
    expect(state.focus.body).toContain('Most of your performance signal is untracked.');
  });

  it('adds low-confidence supporting line only for low-confidence component focus', () => {
    const lowConfidence = buildRoundFocusState(
      makeSummary({
        confidence: 'low',
        biggestLeakComponent: 'approach',
      }),
      true,
      false,
    );
    expect(lowConfidence.kind).toBe('READY_PREMIUM');
    if (lowConfidence.kind !== 'READY_PREMIUM') return;
    expect(lowConfidence.focus.supportingLine).toContain('Low confidence');

    const mediumConfidence = buildRoundFocusState(
      makeSummary({
        confidence: 'medium',
        biggestLeakComponent: 'approach',
      }),
      true,
      false,
    );
    expect(mediumConfidence.kind).toBe('READY_PREMIUM');
    if (mediumConfidence.kind !== 'READY_PREMIUM') return;
    expect(mediumConfidence.focus.supportingLine).toBeUndefined();
  });

  it('builds drill line from deterministic picker and strips Goal tail', () => {
    mockedPickDeterministicDrillSeeded.mockReturnValue(
      'Compact this drill line. Goal: hidden details should not appear.',
    );
    const state = buildRoundFocusState(
      makeSummary({
        biggestLeakComponent: 'approach',
      }),
      true,
      false,
    );

    expect(state.kind).toBe('READY_PREMIUM');
    if (state.kind !== 'READY_PREMIUM') return;
    expect(state.focus.drillLine).toBe('Do this next: Compact this drill line.');
  });

  it('uses drillSeed when present and fallback seed when missing', () => {
    buildRoundFocusState(
      makeSummary({ drillSeed: 'fixed-seed', biggestLeakComponent: 'putting' }),
      true,
      false,
    );
    expect(mockedPickDeterministicDrillSeeded).toHaveBeenCalledWith(
      'putting',
      'fixed-seed|dashboard_focus|putting',
      0,
    );

    buildRoundFocusState(
      makeSummary({
        drillSeed: null,
        mode: '9',
        lastUpdatedAt: '2026-02-24T12:00:00.000Z',
        roundsRecent: 4,
        scoreTrendDelta: -0.6,
        biggestLeakComponent: 'approach',
      }),
      true,
      false,
    );
    const lastCall = mockedPickDeterministicDrillSeeded.mock.calls.at(-1);
    expect(lastCall?.[0]).toBe('approach');
    expect(lastCall?.[1]).toContain('9|2026-02-24T12:00:00.000Z|4|-0.6|dashboard_focus|approach');
    expect(lastCall?.[2]).toBe(0);
  });
});

describe('focusComponentLabel', () => {
  it('maps all known component labels and null', () => {
    expect(focusComponentLabel('offTee')).toBe('Off the Tee');
    expect(focusComponentLabel('approach')).toBe('Approach');
    expect(focusComponentLabel('putting')).toBe('Putting');
    expect(focusComponentLabel('penalties')).toBe('Penalties');
    expect(focusComponentLabel('residual')).toBe('Residual');
    expect(focusComponentLabel(null)).toBeNull();
  });
});
