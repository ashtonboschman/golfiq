import {
  buildDashboardOverallInsightsSummary,
  buildRoundFocusState,
  focusComponentLabel,
  type DashboardOverallInsightsSummary,
} from '@/lib/insights/dashboardFocus';

function makeSummary(
  overrides: Partial<DashboardOverallInsightsSummary> = {},
): DashboardOverallInsightsSummary {
  return {
    lastUpdatedAt: '2026-02-24T10:00:00.000Z',
    drillSeed: 'seed-hash-123',
    recommendationText: null,
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
    efficiencyDelta: {
      firPctPoints: 2,
      girPctPoints: -1,
      putts: -0.2,
      penalties: 0.3,
    },
    statCoverage: {
      fir: { tracked: 5, total: 5 },
      gir: { tracked: 5, total: 5 },
      putts: { tracked: 5, total: 5 },
      penalties: { tracked: 5, total: 5 },
    },
    biggestLeakComponent: 'putting',
    confidence: 'medium',
    dataQualityFlags: {
      insufficientRounds: false,
      missingScoreTrend: false,
      combinedNeedsMoreNineHoleRounds: false,
      missingComponentData: false,
      partialRecentStats: false,
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
    cards_by_mode: {
      combined: [
        'Scoring trend: Stable.',
        'Strength: Approach.',
        'Opportunity: Putting.',
        'Priority first: Focus on pace control from 25-40 feet.',
        'On-course strategy: Leave uphill looks when possible.',
      ],
      '9': [
        'Scoring trend: Stable.',
        'Strength: GIR.',
        'Opportunity: Penalties.',
        'Priority first: Play to wider targets on trouble holes.',
        'On-course strategy: Choose the safer side of fairways.',
      ],
      '18': [
        'Scoring trend: Stable.',
        'Strength: GIR.',
        'Opportunity: Putting.',
        'Priority first: Control speed to tap-in range.',
        'On-course strategy: Favor center-green targets.',
      ],
    },
    cards: [
      'Scoring trend: Stable.',
      'Strength: Approach.',
      'Opportunity: Putting.',
      'Priority first: Focus on pace control from 25-40 feet.',
      'On-course strategy: Leave uphill looks when possible.',
    ],
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
        efficiency: {
          fir: { recent: 0.52, baseline: 0.5, coverageRecent: '5/5' },
          gir: { recent: 0.44, baseline: 0.45, coverageRecent: '5/5' },
          puttsTotal: { recent: 31.8, baseline: 32.0, coverageRecent: '5/5' },
          penaltiesPerRound: { recent: 1.3, baseline: 1.0, coverageRecent: '5/5' },
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
    expect(summary?.recommendationText).toBe('Focus on pace control from 25-40 feet.');
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

  it('falls back to shared cards for recommendation text when cards_by_mode is missing', () => {
    const payload = makeInsightsPayload((draft) => {
      delete draft.cards_by_mode;
      draft.cards[3] = 'Priority first: Build speed control first.';
    });
    const summary = buildDashboardOverallInsightsSummary(payload, 'combined');
    expect(summary?.recommendationText).toBe('Build speed control first.');
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

  it('flags insufficient rounds when roundsRecent < 5', () => {
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
      draft.mode_payload.combined.kpis.roundsRecent = 5;
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
    expect(summary?.sgComponentDelta?.offTee).toBeCloseTo(-0.06);
    expect(summary?.confidence).toBe('high');
  });

  it('maps recent stat coverage and flags partial recent stats', () => {
    const payload = makeInsightsPayload((draft) => {
      draft.mode_payload.combined.efficiency.fir.coverageRecent = '2/5';
      draft.mode_payload.combined.efficiency.gir.coverageRecent = '5/5';
      draft.mode_payload.combined.efficiency.puttsTotal.coverageRecent = '4/5';
      draft.mode_payload.combined.efficiency.penaltiesPerRound.coverageRecent = '1/5';
    });
    const summary = buildDashboardOverallInsightsSummary(payload, 'combined');
    expect(summary?.statCoverage).toEqual({
      fir: { tracked: 2, total: 5 },
      gir: { tracked: 5, total: 5 },
      putts: { tracked: 4, total: 5 },
      penalties: { tracked: 1, total: 5 },
    });
    expect(summary?.dataQualityFlags.partialRecentStats).toBe(true);
  });

  it('treats residual-only SG as missing component data', () => {
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
    expect(summary?.dataQualityFlags.missingComponentData).toBe(true);
    expect(summary?.dataQualityFlags.residualDominant).toBe(true);
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
  });

  it('returns LOW-confidence early guidance for null summary', () => {
    const state = buildRoundFocusState(null, false, false);
    expect(state.kind).toBe('READY_FREE');
    if (state.kind !== 'READY_FREE') return;
    expect(state.focus.outcome).toBe('early_guidance');
    expect(state.focus.confidence).toBe('low');
    expect(state.focus.headline).toBe('Start with solid decisions.');
    expect(state.focus.body).toBe('Early rounds usually come down to missed greens and a few costly holes.');
    expect(state.focus.nextRound).toBe('Play to the widest target.');
  });

  it('no longer returns locked state for historical data gating flags', () => {
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
      expect(['READY_FREE', 'READY_PREMIUM']).toContain(state.kind);
    });
  });

  it('passes through isLimited for READY_FREE states', () => {
    const limited = buildRoundFocusState(makeSummary(), false, true);
    expect(limited.kind).toBe('READY_FREE');
    if (limited.kind !== 'READY_FREE') return;
    expect(limited.isLimited).toBe(true);
  });

  it('uses SG opportunity mode from the lowest SG component for free without SG numeric precision', () => {
    const state = buildRoundFocusState(
      makeSummary({
        sgComponentDelta: {
          offTee: -0.1,
          approach: -0.22,
          putting: -0.17,
          penalties: -0.05,
          residual: -0.6,
        },
      }),
      false,
      false,
    );

    expect(state.kind).toBe('READY_FREE');
    if (state.kind !== 'READY_FREE') return;
    expect(state.focus.outcome).toBe('component_opportunity');
    expect(state.focus.headline).toBe('Approach is your biggest scoring opportunity.');
    expect(state.focus.body).toBe('This area is costing you the most strokes.');
    expect(state.focus.nextRound).toBe('Play to the center of the green.');
    expect(state.focus.component).toBe('approach');
  });

  it('uses SG strength mode when no opportunity exists and SG >= +0.15', () => {
    const state = buildRoundFocusState(
      makeSummary({
        sgComponentDelta: {
          offTee: 0.12,
          approach: 0.18,
          putting: 0.16,
          penalties: 0.03,
          residual: -0.4,
        },
      }),
      true,
      false,
    );

    expect(state.kind).toBe('READY_PREMIUM');
    if (state.kind !== 'READY_PREMIUM') return;
    expect(state.focus.outcome).toBe('component_strength');
    expect(state.focus.headline).toBe('Approach is driving your improvement.');
    expect(state.focus.body).toBe('This area is gaining about 0.2 strokes per round.');
    expect(state.focus.nextRound).toBe('Keep trusting your approach shots.');
    expect(state.focus.component).toBe('approach');
  });

  it('uses balanced mode instead of naming an opportunity when component deltas are too close', () => {
    const state = buildRoundFocusState(
      makeSummary({
        sgComponentDelta: {
          offTee: -0.04,
          approach: -0.16,
          putting: -0.15,
          penalties: 0.02,
          residual: 0,
        },
      }),
      true,
      false,
    );

    expect(state.kind).toBe('READY_PREMIUM');
    if (state.kind !== 'READY_PREMIUM') return;
    expect(state.focus.outcome).toBe('component_balanced');
    expect(state.focus.headline).toBe('Your game is well balanced.');
    expect(state.focus.body).toBe('No area clearly stands out as a weakness.');
  });

  it('uses balanced mode when all SG components are between -0.15 and +0.15', () => {
    const state = buildRoundFocusState(
      makeSummary({
        sgComponentDelta: {
          offTee: -0.05,
          approach: 0.02,
          putting: 0.14,
          penalties: -0.14,
          residual: 0.8,
        },
      }),
      true,
      false,
    );

    expect(state.kind).toBe('READY_PREMIUM');
    if (state.kind !== 'READY_PREMIUM') return;
    expect(state.focus.outcome).toBe('component_balanced');
    expect(state.focus.headline).toBe('Your game is well balanced.');
    expect(state.focus.body).toBe('No area clearly stands out as a weakness.');
    expect(state.focus.nextRound).toBe('Make simple decisions.');
    expect(state.focus.component).toBeNull();
  });

  it('uses SG-only logic and does not let raw putts delta override putting SG opportunity', () => {
    const state = buildRoundFocusState(
      makeSummary({
        sgComponentDelta: {
          offTee: 0.1,
          approach: 0.08,
          putting: -0.2,
          penalties: 0.05,
          residual: 0.3,
        },
        efficiencyDelta: {
          firPctPoints: 4,
          girPctPoints: 3,
          putts: -0.4, // raw stats look good, but SG says opportunity
          penalties: -0.3,
        },
      }),
      false,
      false,
    );

    expect(state.kind).toBe('READY_FREE');
    if (state.kind !== 'READY_FREE') return;
    expect(state.focus.outcome).toBe('component_opportunity');
    expect(state.focus.headline).toBe('Putting is your biggest scoring opportunity.');
    expect(state.focus.body).toBe('This area is costing you the most strokes.');
    expect(state.focus.nextRound).toBe('Focus on lag speed.');
    expect(state.focus.component).toBe('putting');
  });

  it('uses SG thresholds inclusively at -0.15 and +0.15', () => {
    const opportunityBoundary = buildRoundFocusState(
      makeSummary({
        sgComponentDelta: {
          offTee: -0.15,
          approach: 0.01,
          putting: 0.02,
          penalties: 0.03,
          residual: 0.0,
        },
      }),
      false,
      false,
    );
    expect(opportunityBoundary.kind).toBe('READY_FREE');
    if (opportunityBoundary.kind !== 'READY_FREE') return;
    expect(opportunityBoundary.focus.headline).toBe('Off the Tee is your biggest scoring opportunity.');

    const strengthBoundary = buildRoundFocusState(
      makeSummary({
        sgComponentDelta: {
          offTee: 0.15,
          approach: 0.02,
          putting: 0.03,
          penalties: 0.01,
          residual: 0.0,
        },
      }),
      true,
      false,
    );
    expect(strengthBoundary.kind).toBe('READY_PREMIUM');
    if (strengthBoundary.kind !== 'READY_PREMIUM') return;
    expect(strengthBoundary.focus.outcome).toBe('component_strength');
    expect(strengthBoundary.focus.headline).toBe('Off the Tee is driving your improvement.');
  });

  it('uses strongest-area strength copy when scoring trend is worsening', () => {
    const state = buildRoundFocusState(
      makeSummary({
        scoreTrendDelta: 1.4,
        sgComponentDelta: {
          offTee: 0.12,
          approach: 0.18,
          putting: 0.16,
          penalties: 0.03,
          residual: -0.4,
        },
      }),
      true,
      false,
    );

    expect(state.kind).toBe('READY_PREMIUM');
    if (state.kind !== 'READY_PREMIUM') return;
    expect(state.focus.outcome).toBe('component_strength');
    expect(state.focus.headline).toBe('Approach is your strongest area.');
    expect(state.focus.body).toBe('This area is gaining about 0.2 strokes per round.');
  });

  it('uses penalty avoidance grammar for penalties component headlines', () => {
    const state = buildRoundFocusState(
      makeSummary({
        sgComponentDelta: {
          offTee: -0.05,
          approach: -0.06,
          putting: -0.04,
          penalties: -0.4,
          residual: 0.0,
        },
      }),
      false,
      false,
    );

    expect(state.kind).toBe('READY_FREE');
    if (state.kind !== 'READY_FREE') return;
    expect(state.focus.outcome).toBe('component_opportunity');
    expect(state.focus.headline).toBe('Penalty avoidance is your biggest scoring opportunity.');
  });

  it('uses score-only focus when SG data is missing but score trend is available', () => {
    const state = buildRoundFocusState(
      makeSummary({
        sgComponentDelta: null,
      }),
      false,
      false,
    );

    expect(state.kind).toBe('READY_FREE');
    if (state.kind !== 'READY_FREE') return;
    expect(state.focus.outcome).toBe('score_only_stable');
    expect(state.focus.headline).toBe('Your scoring is stable.');
    expect(state.focus.body).toBe('Pick one area next round.');
    expect(state.focus.nextRound).toBe('Commit to one focus.');
    expect(state.focus.component).toBeNull();
  });

  it('does not name a component when recent tracking only covers two stat areas', () => {
    const state = buildRoundFocusState(
      makeSummary({
        confidence: 'medium',
        sgComponentDelta: {
          offTee: null,
          approach: null,
          putting: -0.4,
          penalties: -0.2,
          residual: -0.6,
        },
        statCoverage: {
          fir: { tracked: 0, total: 5 },
          gir: { tracked: 0, total: 5 },
          putts: { tracked: 5, total: 5 },
          penalties: { tracked: 5, total: 5 },
        },
        dataQualityFlags: {
          ...makeSummary().dataQualityFlags,
          partialRecentStats: true,
        },
      }),
      true,
      false,
    );

    expect(state.kind).toBe('READY_PREMIUM');
    if (state.kind !== 'READY_PREMIUM') return;
    expect(state.focus.outcome).toBe('score_only_stable');
    expect(state.focus.headline).toBe('Your scoring is stable.');
    expect(state.focus.nextRound).toBe('Commit to one focus.');
    expect(state.focus.component).toBeNull();
  });

  it('uses early guidance when SG confidence is low', () => {
    const state = buildRoundFocusState(
      makeSummary({
        confidence: 'low',
        sgComponentDelta: {
          offTee: -0.5,
          approach: -0.4,
          putting: -0.6,
          penalties: -0.2,
          residual: -1.2,
        },
        statCoverage: {
          fir: { tracked: 5, total: 5 },
          gir: { tracked: 5, total: 5 },
          putts: { tracked: 5, total: 5 },
          penalties: { tracked: 5, total: 5 },
        },
      }),
      false,
      false,
    );

    expect(state.kind).toBe('READY_FREE');
    if (state.kind !== 'READY_FREE') return;
    expect(state.focus.outcome).toBe('early_guidance');
    expect(state.focus.headline).toBe('Start with solid decisions.');
    expect(state.focus.body).toBe('Early rounds usually come down to missed greens and a few costly holes.');
    expect(state.focus.nextRound).toBe('Play to the widest target.');
    expect(state.focus.component).toBeNull();
  });

  it('uses early guidance for low-confidence combined mixed-signal states', () => {
    const state = buildRoundFocusState(
      makeSummary({
        confidence: 'low',
        roundsRecent: 3,
        scoreTrendDelta: 0.2,
        dataQualityFlags: {
          ...makeSummary().dataQualityFlags,
          combinedNeedsMoreNineHoleRounds: true,
        },
      }),
      false,
      false,
    );

    expect(state.kind).toBe('READY_FREE');
    if (state.kind !== 'READY_FREE') return;
    expect(state.focus.outcome).toBe('early_guidance');
    expect(state.focus.headline).toBe('Start with solid decisions.');
    expect(state.focus.body).toBe('Early rounds usually come down to missed greens and a few costly holes.');
    expect(state.focus.nextRound).toBe('Play to the widest target.');
  });

  it('does not name a component when residual is dominant', () => {
    const state = buildRoundFocusState(
      makeSummary({
        sgComponentDelta: {
          offTee: -0.05,
          approach: -0.04,
          putting: -0.02,
          penalties: -0.03,
          residual: -0.8,
        },
        dataQualityFlags: {
          ...makeSummary().dataQualityFlags,
          residualDominant: true,
        },
      }),
      true,
      false,
    );

    expect(state.kind).toBe('READY_PREMIUM');
    if (state.kind !== 'READY_PREMIUM') return;
    expect(state.focus.outcome).toBe('score_only_stable');
    expect(state.focus.headline).toBe('Your scoring is stable.');
    expect(state.focus.component).toBeNull();
  });

  it('uses low-confidence early guidance when rounds are minimal', () => {
    const state = buildRoundFocusState(
      makeSummary({
        roundsRecent: 1,
        scoreTrendDelta: null,
        confidence: null,
      }),
      false,
      false,
    );
    expect(state.kind).toBe('READY_FREE');
    if (state.kind !== 'READY_FREE') return;
    expect(state.focus.outcome).toBe('early_guidance');
    expect(state.focus.confidence).toBe('low');
    expect(state.focus.headline).toBe('Start with solid decisions.');
  });

  it('uses a concise recommendation as next-round nudge when safe to render', () => {
    const state = buildRoundFocusState(
      makeSummary({
        recommendationText: 'Focus on center-green targets',
        sgComponentDelta: {
          offTee: -0.05,
          approach: -0.2,
          putting: 0.02,
          penalties: -0.01,
          residual: 0,
        },
      }),
      true,
      false,
    );
    expect(state.kind).toBe('READY_PREMIUM');
    if (state.kind !== 'READY_PREMIUM') return;
    expect(state.focus.nextRound).toBe('Focus on center-green targets.');
  });

  it('falls back to component nudge when recommendation is too long', () => {
    const state = buildRoundFocusState(
      makeSummary({
        recommendationText:
          'Roll 10 balls to a fringe line and stop short, then score your distance control over each set.',
        sgComponentDelta: {
          offTee: -0.08,
          approach: -0.19,
          putting: -0.05,
          penalties: 0,
          residual: 0.03,
        },
      }),
      true,
      false,
    );
    expect(state.kind).toBe('READY_PREMIUM');
    if (state.kind !== 'READY_PREMIUM') return;
    expect(state.focus.nextRound).toBe('Play to the center of the green.');
  });

  it('never uses generic momentum headline copy', () => {
    const state = buildRoundFocusState(makeSummary(), false, false);
    expect(state.kind).toBe('READY_FREE');
    if (state.kind !== 'READY_FREE') return;
    expect(state.focus.headline).not.toBe('Build on momentum.');
    expect(state.focus.headline).not.toBe('Keep improving.');
    expect(state.focus.headline).not.toBe('Stay consistent.');
  });

  it('keeps Next Round copy short and single-action', () => {
    const states = [
      buildRoundFocusState(makeSummary(), true, false),
      buildRoundFocusState(makeSummary(), false, false),
      buildRoundFocusState(null, true, false),
      buildRoundFocusState(null, false, false),
    ];

    for (const state of states) {
      const nextRound = state.focus.nextRound;
      const normalized = nextRound.replace(/[.!?]+$/g, '').trim();
      const words = normalized.split(/\s+/).filter(Boolean);
      expect(normalized.toLowerCase()).not.toContain('track ');
      expect(normalized.toLowerCase()).not.toContain('tracking');
      expect(normalized).not.toContain(',');
      expect(normalized.toLowerCase()).not.toMatch(/\band\b/);
      expect(normalized.toLowerCase()).not.toMatch(/\bthen\b/);
      expect(normalized.toLowerCase()).not.toMatch(/\bfor\b/);
      expect(words.length).toBeLessThanOrEqual(12);
    }
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


