import crypto from 'crypto';
import { formatDate } from '@/lib/formatters';
import { callOpenAI, type OpenAIUsageSummary } from '@/lib/insights/openai';

export type StatsMode = 'combined' | '9' | '18';
export type PerformanceBand = 'tough' | 'below' | 'expected' | 'above' | 'great' | 'unknown';
export type SGComponentName = 'off_tee' | 'approach' | 'putting' | 'penalties' | 'short_game';
export type SGCostlyComponent = 'offTee' | 'approach' | 'putting' | 'penalties' | 'residual';

export type OverallRoundPoint = {
  id: bigint;
  date: Date;
  holes: number;
  nonPar3Holes: number;
  score: number;
  toPar: number | null;
  firHit: number | null;
  girHit: number | null;
  putts: number | null;
  penalties: number | null;
  handicapAtRound: number | null;
  sgTotal: number | null;
  sgOffTee: number | null;
  sgApproach: number | null;
  sgPutting: number | null;
  sgPenalties: number | null;
  sgResidual: number | null;
  sgConfidence: 'high' | 'medium' | 'low' | null;
  sgPartialAnalysis: boolean | null;
};

export type TrendSeries = {
  labels: string[];
  score: (number | null)[];
  firPct: (number | null)[];
  girPct: (number | null)[];
  sgTotal?: (number | null)[];
  handicap?: (number | null)[];
};

export type ModePayload = {
  kpis: {
    roundsRecent: number;
    avgScoreRecent: number | null;
    avgScoreBaseline: number | null;
    avgToParRecent: number | null;
    avgSgTotalRecent: number | null;
    bestScoreRecent: number | null;
    deltaVsBaseline: number | null;
  };
  consistency: {
    label: 'stable' | 'moderate' | 'volatile' | 'insufficient';
    stdDev: number | null;
  };
  efficiency: {
    fir: EfficiencyMetric;
    gir: EfficiencyMetric;
    puttsTotal: EfficiencyMetric;
    penaltiesPerRound: EfficiencyMetric;
  };
  sgComponents?: {
    recentAvg: {
      total: number | null;
      offTee: number | null;
      approach: number | null;
      putting: number | null;
      penalties: number | null;
      residual: number | null;
    };
    baselineAvg: {
      total: number | null;
      offTee: number | null;
      approach: number | null;
      putting: number | null;
      penalties: number | null;
      residual: number | null;
    };
    hasData: boolean;
  };
  trend: TrendSeries;
};

export type ProjectionPayload = {
  trajectory: 'improving' | 'flat' | 'worsening' | 'volatile' | 'unknown';
  projectedScoreIn10: number | null;
  handicapCurrent: number | null;
  projectedHandicapIn10: number | null;
};

export type ProjectionRangesPayload = {
  scoreLow: number | null;
  scoreHigh: number | null;
  handicapLow: number | null;
  handicapHigh: number | null;
};

type EfficiencyMetric = {
  recent: number | null;
  baseline: number | null;
  coverageRecent: string;
};

export type OverallInsightsPayload = {
  generated_at: string;
  analysis: {
    window_recent: number;
    window_baseline: 'last20' | 'overall';
    mode_for_narrative: 'combined';
    performance_band: PerformanceBand;
    strength: { name: SGComponentName | null; value: number | null; label: string | null };
    opportunity: { name: SGComponentName | null; value: number | null; label: string | null; isWeakness: boolean };
    score_compact: string;
    avg_score_recent: number | null;
    avg_score_baseline: number | null;
    rounds_recent: number;
    rounds_baseline: number;
  };
  tier_context: {
    isPremium: boolean;
    baseline: 'last20' | 'alltime';
    maxRoundsUsed: number;
    recentWindow: number;
  };
  consistency: {
    label: 'stable' | 'moderate' | 'volatile' | 'insufficient';
    stdDev: number | null;
  };
  efficiency: {
    fir: EfficiencyMetric;
    gir: EfficiencyMetric;
    puttsTotal: EfficiencyMetric;
    penaltiesPerRound: EfficiencyMetric;
  };
  sg_locked: boolean;
  sg?: {
    trend: {
      labels: string[];
      sgTotal: (number | null)[];
    };
    components: {
      latest: {
        total: number | null;
        offTee: number | null;
        approach: number | null;
        putting: number | null;
        penalties: number | null;
        residual: number | null;
        confidence: 'high' | 'medium' | 'low' | null;
        partialAnalysis: boolean | null;
      };
      recentAvg: {
        total: number | null;
        offTee: number | null;
        approach: number | null;
        putting: number | null;
        penalties: number | null;
        residual: number | null;
      };
      baselineAvg: {
        total: number | null;
        offTee: number | null;
        approach: number | null;
        putting: number | null;
        penalties: number | null;
        residual: number | null;
      };
      mostCostlyComponent: SGCostlyComponent | null;
      worstComponentFrequencyRecent: {
        component: SGCostlyComponent | null;
        count: number;
        window: number;
      };
      hasData: boolean;
    };
  };
  projection: ProjectionPayload;
  projection_ranges?: ProjectionRangesPayload;
  cards: string[];
  cards_locked_count: number;
  refresh: {
    manual_cooldown_hours: number;
  };
  mode_payload: Record<StatsMode, ModePayload>;
  handicap_trend: {
    labels: string[];
    handicap: (number | null)[];
  };
  openai_usage: OpenAIUsageSummary | null;
};

const SG_LABELS: Record<SGComponentName, string> = {
  off_tee: 'Off the Tee',
  approach: 'Approach',
  putting: 'Putting',
  penalties: 'Penalties',
  short_game: 'Short Game',
};

const SG_WEAKNESS_THRESHOLD = -1.0;
const SG_BELOW_EXPECTATIONS_THRESHOLD = -2.0;
const SG_TOUGH_ROUND_THRESHOLD = -5.0;
const SG_ABOVE_EXPECTATIONS_THRESHOLD = 2.0;
const SG_EXCEPTIONAL_THRESHOLD = 5.0;

const DRILL_LIBRARY: Record<SGComponentName | 'general', string[]> = {
  off_tee: [
    'Pick a fairway target and hit 10 balls, scoring 1 point for in-play and 2 points for center hits.',
    'Use an intermediate target and commit to starting every drive over it.',
    'Alternate driver and 3-wood to the same target line, 5 each.',
    'Hit 6 drives and hold your finish for 3 seconds to reinforce balance.',
    'Practice a 20-yard virtual fairway and track how many of 10 drives land in it.',
  ],
  approach: [
    'Do a distance ladder with one club (e.g., 120, 130, 140) and hit 3 to each target.',
    'Pick left, middle, and right green sections and hit 3 balls to each.',
    'Practice landing 10 shots in the front third of the green.',
    'Hit 5 shots to 50, 75, and 100 yards to groove partial wedges.',
    'Pick a center-of-green target for every approach.',
  ],
  putting: [
    'Lag putt 10 balls from 25 to 40 feet and aim to leave them inside 3 feet.',
    'Do a start-line gate drill with two tees just wider than the ball.',
    'Putt 10 balls focusing only on speed, not line, to train pace.',
    'Make 10 consecutive putts from 3 feet before leaving the practice green.',
    'Practice a circle drill and finish 10 putts inside a 3-foot circle around the hole.',
  ],
  penalties: [
    'When in trouble, punch out to the fairway instead of forcing a hero shot.',
    'If water or OB is in play, take one more club and aim to the safer side.',
    'Use a quick risk check: green light, yellow light, or red light before each shot.',
    'Adopt a layup habit and advance to a comfortable yardage.',
    'Club down near hazards and accept the middle of the green target.',
  ],
  short_game: [
    'Drop 5 balls around the green and aim to get 3 up-and-downs.',
    'Place a towel 3 yards onto the green and land 10 chips on it.',
    'Do 10 pressure up-and-downs and track how many you save.',
    'Chip from the fringe and aim to finish inside 6 feet for 10 reps.',
    'Hit 10 bump-and-runs with an 8-iron and focus on consistent rollout.',
  ],
  general: [
    'Use one simple pre-shot routine on every shot.',
    'Pick center targets and remove the biggest miss from play.',
    'Choose one swing key for the day and stick to it.',
    'Score your accuracy over 10 shots to a target and try to beat it next time.',
    'Commit to conservative targets on the front nine.',
  ],
};

function formatToParShort(toPar: number): string {
  if (toPar === 0) return 'E';
  return toPar > 0 ? `+${toPar}` : `${toPar}`;
}

function round1(v: number | null): number | null {
  if (v == null || !Number.isFinite(v)) return null;
  return Math.round(v * 10) / 10;
}

function average(nums: Array<number | null>): number | null {
  const v = nums.filter((n): n is number => n != null && Number.isFinite(n));
  if (!v.length) return null;
  return v.reduce((s, n) => s + n, 0) / v.length;
}

function averageBy<T>(rows: T[], get: (row: T) => number | null): number | null {
  return average(rows.map(get));
}

function stdDev(nums: number[]): number | null {
  if (!nums.length) return null;
  const mean = nums.reduce((s, n) => s + n, 0) / nums.length;
  const variance = nums.reduce((s, n) => s + ((n - mean) ** 2), 0) / nums.length;
  return Math.sqrt(variance);
}

function formatDateShort(d: Date): string {
  return formatDate(new Date(d).toISOString());
}

export function normalizeByMode(points: OverallRoundPoint[], mode: StatsMode): OverallRoundPoint[] {
  if (mode === '9') return points.filter((p) => p.holes === 9);
  if (mode === '18') return points.filter((p) => p.holes === 18);

  return points.map((p) => {
    if (p.holes !== 9) return p;
    const mul = 2;
    return {
      ...p,
      holes: 18,
      nonPar3Holes: p.nonPar3Holes * mul,
      score: p.score * mul,
      toPar: p.toPar != null ? p.toPar * mul : null,
      firHit: p.firHit != null ? p.firHit * mul : null,
      girHit: p.girHit != null ? p.girHit * mul : null,
      putts: p.putts != null ? p.putts * mul : null,
      penalties: p.penalties != null ? p.penalties * mul : null,
      sgTotal: p.sgTotal != null ? p.sgTotal * mul : null,
      sgOffTee: p.sgOffTee != null ? p.sgOffTee * mul : null,
      sgApproach: p.sgApproach != null ? p.sgApproach * mul : null,
      sgPutting: p.sgPutting != null ? p.sgPutting * mul : null,
      sgPenalties: p.sgPenalties != null ? p.sgPenalties * mul : null,
      sgResidual: p.sgResidual != null ? p.sgResidual * mul : null,
    };
  });
}

function computeModePayload(points: OverallRoundPoint[], isPremium: boolean): ModePayload {
  const sortedDesc = [...points].sort((a, b) => +new Date(b.date) - +new Date(a.date));
  const recent = sortedDesc.slice(0, 5);
  const baseline = isPremium ? sortedDesc : sortedDesc.slice(0, 20);
  const trend = sortedDesc.slice(0, 20).reverse();

  const avgScoreRecent = average(recent.map((p) => p.score));
  const avgScoreBaseline = average(baseline.map((p) => p.score));
  const avgToParRecent = average(recent.map((p) => p.toPar));
  const avgSgTotalRecent = isPremium ? average(recent.map((p) => p.sgTotal)) : null;
  const bestScoreRecent = recent.length ? Math.min(...recent.map((p) => p.score)) : null;
  const deltaVsBaseline =
    avgScoreRecent != null && avgScoreBaseline != null ? avgScoreRecent - avgScoreBaseline : null;

  const labels = trend.map((p) => formatDateShort(p.date));
  const score = trend.map((p) => p.score);
  const firPct = trend.map((p) => (p.firHit != null && p.nonPar3Holes > 0 ? (p.firHit / p.nonPar3Holes) * 100 : null));
  const girPct = trend.map((p) => (p.girHit != null && p.holes > 0 ? (p.girHit / p.holes) * 100 : null));
  const sgTotal = trend.map((p) => round1(p.sgTotal));
  const handicap = trend.map((p) => round1(p.handicapAtRound));
  const sgModePayload = computeSgPayload(sortedDesc);

  return {
    kpis: {
      roundsRecent: recent.length,
      avgScoreRecent: round1(avgScoreRecent),
      avgScoreBaseline: round1(avgScoreBaseline),
      avgToParRecent: round1(avgToParRecent),
      avgSgTotalRecent: round1(avgSgTotalRecent),
      bestScoreRecent,
      deltaVsBaseline: round1(deltaVsBaseline),
    },
    consistency: computeConsistency(sortedDesc),
    efficiency: computeEfficiency(sortedDesc),
    ...(sgModePayload
      ? {
          sgComponents: {
            recentAvg: sgModePayload.components.recentAvg,
            baselineAvg: sgModePayload.components.baselineAvg,
            hasData: sgModePayload.components.hasData,
          },
        }
      : {}),
    trend: {
      labels,
      score,
      firPct: firPct.map(round1),
      girPct: girPct.map(round1),
      sgTotal,
      handicap,
    },
  };
}

function computeBand(avgSg: number | null): PerformanceBand {
  if (avgSg == null || !Number.isFinite(avgSg)) return 'unknown';
  if (avgSg <= SG_TOUGH_ROUND_THRESHOLD) return 'tough';
  if (avgSg <= SG_BELOW_EXPECTATIONS_THRESHOLD) return 'below';
  if (avgSg < SG_ABOVE_EXPECTATIONS_THRESHOLD) return 'expected';
  if (avgSg < SG_EXCEPTIONAL_THRESHOLD) return 'above';
  return 'great';
}

function componentAverages(recentCombined: OverallRoundPoint[]) {
  const offTee = average(recentCombined.map((p) => p.sgOffTee));
  const approach = average(recentCombined.map((p) => p.sgApproach));
  const putting = average(recentCombined.map((p) => p.sgPutting));
  const penalties = average(recentCombined.map((p) => p.sgPenalties));
  const residual = average(recentCombined.map((p) => p.sgResidual));

  const comps: Array<{ name: SGComponentName; value: number | null }> = [
    { name: 'off_tee', value: offTee },
    { name: 'approach', value: approach },
    { name: 'putting', value: putting },
    { name: 'penalties', value: penalties },
  ];

  if (
    residual != null &&
    residual <= -2 &&
    comps.filter((c) => c.value != null).every((c) => (c.value as number) >= SG_WEAKNESS_THRESHOLD)
  ) {
    comps.push({ name: 'short_game', value: residual });
  }

  const withVals = comps.filter((c): c is { name: SGComponentName; value: number } => c.value != null);
  if (!withVals.length) {
    return {
      best: { name: null, value: null, label: null },
      opportunity: { name: null, value: null, label: null, isWeakness: false },
    };
  }

  const best = withVals.reduce((a, b) => (b.value > a.value ? b : a), withVals[0]);
  const worst = withVals.reduce((a, b) => (b.value < a.value ? b : a), withVals[0]);

  return {
    best: { name: best.name, value: round1(best.value), label: SG_LABELS[best.name] },
    opportunity: {
      name: worst.name,
      value: round1(worst.value),
      label: SG_LABELS[worst.name],
      isWeakness: worst.value < 0,
    },
  };
}

function linearSlope(values: number[]): number | null {
  if (values.length < 3) return null;
  const n = values.length;
  let sumX = 0;
  let sumY = 0;
  let sumXY = 0;
  let sumXX = 0;
  for (let i = 0; i < n; i++) {
    const x = i + 1;
    const y = values[i];
    sumX += x;
    sumY += y;
    sumXY += x * y;
    sumXX += x * x;
  }
  const denom = n * sumXX - sumX * sumX;
  if (denom === 0) return null;
  return (n * sumXY - sumX * sumY) / denom;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function percentile(values: number[], p: number): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  if (sorted.length === 1) return sorted[0];
  const pos = (sorted.length - 1) * p;
  const lower = Math.floor(pos);
  const upper = Math.ceil(pos);
  if (lower === upper) return sorted[lower];
  const weight = pos - lower;
  return sorted[lower] * (1 - weight) + sorted[upper] * weight;
}

function computeProjection(recentCombined: OverallRoundPoint[], baselineCombined: OverallRoundPoint[]): ProjectionPayload {
  const recentAvgScore = average(recentCombined.map((p) => p.score));
  const baselineAvgScore = average(baselineCombined.map((p) => p.score));
  const scoreSeries = [...recentCombined].reverse().map((p) => p.score);
  const scoreSlope = linearSlope(scoreSeries);

  const handicapSeries = [...recentCombined]
    .reverse()
    .map((p) => p.handicapAtRound)
    .filter((n): n is number => n != null);
  const handicapSlope = linearSlope(handicapSeries);
  const handicapCurrent = handicapSeries.length ? handicapSeries[handicapSeries.length - 1] : null;

  const delta = (recentAvgScore != null && baselineAvgScore != null) ? recentAvgScore - baselineAvgScore : null;
  let trajectory: ProjectionPayload['trajectory'] = 'unknown';
  if (scoreSlope != null && Math.abs(scoreSlope) >= 0.35) {
    trajectory = scoreSlope < 0 ? 'improving' : 'worsening';
  } else if (delta != null && Math.abs(delta) <= 0.8) {
    trajectory = 'flat';
  } else if (delta != null) {
    trajectory = delta < 0 ? 'improving' : 'worsening';
  } else {
    trajectory = 'volatile';
  }

  // Keep projections grounded: short-term trend with bounded movement.
  const scoreTrendShift = scoreSlope != null ? clamp(scoreSlope * 8, -4, 4) : 0;
  const projectedScoreIn10 =
    recentAvgScore != null
      ? round1(recentAvgScore + scoreTrendShift)
      : null;
  const handicapTrendShift = handicapSlope != null ? clamp(handicapSlope * 10, -3, 3) : 0;
  const projectedHandicapIn10 =
    handicapCurrent != null ? round1(handicapCurrent + handicapTrendShift) : null;

  return {
    trajectory,
    projectedScoreIn10,
    handicapCurrent: round1(handicapCurrent),
    projectedHandicapIn10,
  };
}

function deterministicDrill(area: SGComponentName | null, seed: string): string {
  const key = area ?? 'general';
  const list = DRILL_LIBRARY[key] ?? DRILL_LIBRARY.general;
  const h = crypto.createHash('sha256').update(seed).digest('hex');
  const idx = parseInt(h.slice(0, 8), 16) % list.length;
  return list[idx];
}

function buildDataHash(args: {
  rounds: OverallRoundPoint[];
  isPremium: boolean;
}): string {
  const compact = [...args.rounds]
    .sort((a, b) => +new Date(b.date) - +new Date(a.date))
    .map((r) => ({
      id: r.id.toString(),
      d: new Date(r.date).toISOString().slice(0, 10),
      h: r.holes,
      s: r.score,
      t: r.toPar,
      fir: r.firHit,
      gir: r.girHit,
      p: r.putts,
      pen: r.penalties,
      hcp: r.handicapAtRound,
      sg: r.sgTotal,
      ot: r.sgOffTee,
      ap: r.sgApproach,
      pu: r.sgPutting,
      pe: r.sgPenalties,
      rs: r.sgResidual,
    }));

  return crypto
    .createHash('sha256')
    .update(JSON.stringify({ isPremium: args.isPremium, rounds: compact }))
    .digest('hex');
}

function parseMessages(raw: string, expectedCount: number): string[] {
  const trimmed = String(raw ?? '').trim();
  if (!trimmed) return [];

  const parse = (value: string): string[] => {
    try {
      const parsed = JSON.parse(value);
      const msgs = parsed?.messages;
      if (Array.isArray(msgs) && msgs.length === expectedCount && msgs.every((m) => typeof m === 'string')) {
        return msgs.map((m) => String(m).trim());
      }
      return [];
    } catch {
      return [];
    }
  };

  const parsedDirect = parse(trimmed);
  if (parsedDirect.length === expectedCount) return parsedDirect;

  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i)?.[1];
  if (fenced) {
    const parsedFenced = parse(fenced);
    if (parsedFenced.length === expectedCount) return parsedFenced;
  }

  return [];
}

function getIsoWeekKey(date: Date): string {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil((((+d - +yearStart) / 86400000) + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(weekNo).padStart(2, '0')}`;
}

function computeConsistency(pointsCombined: OverallRoundPoint[]): OverallInsightsPayload['consistency'] {
  const vals = pointsCombined
    .slice(0, 10)
    .map((p) => p.toPar)
    .filter((n): n is number => n != null && Number.isFinite(n));

  if (vals.length < 5) {
    return { label: 'insufficient', stdDev: null };
  }

  const sd = stdDev(vals);
  if (sd == null) return { label: 'insufficient', stdDev: null };
  if (sd < 3) return { label: 'stable', stdDev: round1(sd) };
  if (sd < 5) return { label: 'moderate', stdDev: round1(sd) };
  return { label: 'volatile', stdDev: round1(sd) };
}

function computeEfficiency(pointsCombined: OverallRoundPoint[]): OverallInsightsPayload['efficiency'] {
  const recent = pointsCombined.slice(0, 5);
  const baseline = pointsCombined;
  const recentCount = recent.length;

  const metric = (get: (p: OverallRoundPoint) => number | null): EfficiencyMetric => {
    const recentVals = recent.map(get).filter((n): n is number => n != null && Number.isFinite(n));
    const baselineVals = baseline.map(get).filter((n): n is number => n != null && Number.isFinite(n));
    return {
      recent: recentVals.length ? average(recentVals) : null,
      baseline: baselineVals.length ? average(baselineVals) : null,
      coverageRecent: `${recentVals.length}/${recentCount}`,
    };
  };

  return {
    fir: metric((p) => (p.firHit != null && p.nonPar3Holes > 0 ? p.firHit / p.nonPar3Holes : null)),
    gir: metric((p) => (p.girHit != null && p.holes > 0 ? p.girHit / p.holes : null)),
    puttsTotal: metric((p) => (p.putts != null ? p.putts : null)),
    penaltiesPerRound: metric((p) => (p.penalties != null ? p.penalties : null)),
  };
}

function pickWorstComponentForRound(row: OverallRoundPoint): { component: SGCostlyComponent; value: number } | null {
  const items: Array<{ component: SGCostlyComponent; value: number | null }> = [
    { component: 'offTee', value: row.sgOffTee },
    { component: 'approach', value: row.sgApproach },
    { component: 'putting', value: row.sgPutting },
    { component: 'penalties', value: row.sgPenalties },
    { component: 'residual', value: row.sgResidual },
  ];

  const valid = items.filter((i): i is { component: SGCostlyComponent; value: number } => i.value != null && Number.isFinite(i.value));
  if (!valid.length) return null;
  return valid.reduce((a, b) => (b.value < a.value ? b : a), valid[0]);
}

function computeSgPayload(pointsCombined: OverallRoundPoint[]): NonNullable<OverallInsightsPayload['sg']> {
  const sgFrequencyWindow = 5;
  const trendRows = pointsCombined.slice(0, 20).reverse();

  const latestWithSg = pointsCombined.find((r) =>
    [r.sgTotal, r.sgOffTee, r.sgApproach, r.sgPutting, r.sgPenalties, r.sgResidual].some((n) => n != null && Number.isFinite(n))
  ) ?? null;

  const recentWindow = pointsCombined.slice(0, sgFrequencyWindow);

  const componentRows = pointsCombined.filter((r) =>
    [r.sgTotal, r.sgOffTee, r.sgApproach, r.sgPutting, r.sgPenalties, r.sgResidual].some((n) => n != null && Number.isFinite(n))
  );

  const recentRows = recentWindow.filter((r) =>
    [r.sgTotal, r.sgOffTee, r.sgApproach, r.sgPutting, r.sgPenalties, r.sgResidual].some((n) => n != null && Number.isFinite(n))
  );
  const recentRowsForAvg = recentRows.length
    ? recentRows
    : componentRows.slice(0, Math.min(sgFrequencyWindow, componentRows.length));

  const picks = recentWindow
    .map((r) => pickWorstComponentForRound(r))
    .filter((p): p is { component: SGCostlyComponent; value: number } => p != null);

  const counts = new Map<SGCostlyComponent, number>();
  const values = new Map<SGCostlyComponent, number[]>();
  for (const p of picks) {
    counts.set(p.component, (counts.get(p.component) ?? 0) + 1);
    const arr = values.get(p.component) ?? [];
    arr.push(p.value);
    values.set(p.component, arr);
  }

  let mostCostlyComponent: SGCostlyComponent | null = null;
  let bestCount = -1;
  let bestAvg = Number.POSITIVE_INFINITY;
  for (const [component, count] of counts.entries()) {
    const avg = average((values.get(component) ?? []).map((n) => n));
    const avgVal = avg ?? Number.POSITIVE_INFINITY;
    if (count > bestCount || (count === bestCount && avgVal < bestAvg)) {
      bestCount = count;
      bestAvg = avgVal;
      mostCostlyComponent = component;
    }
  }

  return {
    trend: {
      labels: trendRows.map((r) => formatDateShort(r.date)),
      sgTotal: trendRows.map((r) => round1(r.sgTotal)),
    },
    components: {
      latest: {
        total: round1(latestWithSg?.sgTotal ?? null),
        offTee: round1(latestWithSg?.sgOffTee ?? null),
        approach: round1(latestWithSg?.sgApproach ?? null),
        putting: round1(latestWithSg?.sgPutting ?? null),
        penalties: round1(latestWithSg?.sgPenalties ?? null),
        residual: round1(latestWithSg?.sgResidual ?? null),
        confidence: latestWithSg?.sgConfidence ?? null,
        partialAnalysis: latestWithSg?.sgPartialAnalysis ?? null,
      },
      recentAvg: {
        // Keep higher precision for delta-bar math in the UI.
        // Rounding at this stage can collapse meaningful deltas to zero.
        total: averageBy(recentRowsForAvg, (r) => r.sgTotal),
        offTee: averageBy(recentRowsForAvg, (r) => r.sgOffTee),
        approach: averageBy(recentRowsForAvg, (r) => r.sgApproach),
        putting: averageBy(recentRowsForAvg, (r) => r.sgPutting),
        penalties: averageBy(recentRowsForAvg, (r) => r.sgPenalties),
        residual: averageBy(recentRowsForAvg, (r) => r.sgResidual),
      },
      baselineAvg: {
        total: averageBy(componentRows, (r) => r.sgTotal),
        offTee: averageBy(componentRows, (r) => r.sgOffTee),
        approach: averageBy(componentRows, (r) => r.sgApproach),
        putting: averageBy(componentRows, (r) => r.sgPutting),
        penalties: averageBy(componentRows, (r) => r.sgPenalties),
        residual: averageBy(componentRows, (r) => r.sgResidual),
      },
      mostCostlyComponent,
      worstComponentFrequencyRecent: {
        component: mostCostlyComponent,
        count: mostCostlyComponent ? (counts.get(mostCostlyComponent) ?? 0) : 0,
        window: sgFrequencyWindow,
      },
      hasData: latestWithSg != null,
    },
  };
}

export function shouldAutoRefreshOverall(existingGeneratedAt: Date | null, prevDataHash: string | null, nextDataHash: string): boolean {
  if (!existingGeneratedAt) return true;
  if (!prevDataHash) return true;
  const sameWeek = getIsoWeekKey(existingGeneratedAt) === getIsoWeekKey(new Date());
  const changed = prevDataHash !== nextDataHash;
  return !sameWeek && changed;
}

export function computeOverallPayload(args: {
  rounds: OverallRoundPoint[];
  isPremium: boolean;
  model: string;
  openaiUsage: OpenAIUsageSummary | null;
  cards: string[];
}): OverallInsightsPayload {
  const combined = normalizeByMode(args.rounds, 'combined')
    .sort((a, b) => +new Date(b.date) - +new Date(a.date));
  const recentCombined = combined.slice(0, 5);
  const baselineCombined = combined;

  const avgSgRecent = average(recentCombined.map((r) => r.sgTotal));
  const band = computeBand(avgSgRecent);
  const strengthOpp = componentAverages(recentCombined);

  const latest = recentCombined[0];
  const avgRecent = average(recentCombined.map((r) => r.score));
  const avgBaseline = average(baselineCombined.map((r) => r.score));
  const scoreCompact =
    latest?.toPar != null ? `${latest.score} (${formatToParShort(latest.toPar)})` : `${latest?.score ?? '-'}`;

  const rawProjection = computeProjection(recentCombined, baselineCombined);
  const canProject = args.isPremium && combined.length >= 10;
  const projection: ProjectionPayload = canProject
    ? rawProjection
    : {
        ...rawProjection,
        projectedScoreIn10: null,
        projectedHandicapIn10: null,
      };

  const modes: StatsMode[] = ['combined', '9', '18'];
  const modePayload = Object.fromEntries(
    modes.map((m) => [m, computeModePayload(normalizeByMode(args.rounds, m), args.isPremium)])
  ) as Record<StatsMode, ModePayload>;

  const handicapPoints = [...combined]
    .slice(0, 20)
    .reverse()
    .map((r) => ({ label: formatDateShort(r.date), value: r.handicapAtRound }));

  const consistency = computeConsistency(combined);
  const efficiency = computeEfficiency(combined);
  const sgPayload = computeSgPayload(combined);
  const projectionRanges: ProjectionRangesPayload | undefined = (() => {
    if (projection.projectedScoreIn10 == null || projection.projectedHandicapIn10 == null) return undefined;

    const recentForRange = combined.slice(0, 10);
    const scoreValues = recentForRange
      .map((r) => r.score)
      .filter((n): n is number => Number.isFinite(n));
    const handicapValues = recentForRange
      .map((r) => r.handicapAtRound)
      .filter((n): n is number => n != null && Number.isFinite(n));

    const scoreP25 = percentile(scoreValues, 0.25);
    const scoreP75 = percentile(scoreValues, 0.75);
    const hcpP25 = percentile(handicapValues, 0.25);
    const hcpP75 = percentile(handicapValues, 0.75);

    if (scoreP25 == null || scoreP75 == null || hcpP25 == null || hcpP75 == null) return undefined;

    return {
      scoreLow: round1(Math.min(scoreP25, scoreP75)),
      scoreHigh: round1(Math.max(scoreP25, scoreP75)),
      handicapLow: round1(Math.min(hcpP25, hcpP75)),
      handicapHigh: round1(Math.max(hcpP25, hcpP75)),
    };
  })();

  const payload: OverallInsightsPayload = {
    generated_at: new Date().toISOString(),
    analysis: {
      window_recent: 5,
      window_baseline: args.isPremium ? 'overall' : 'last20',
      mode_for_narrative: 'combined',
      performance_band: band,
      strength: args.isPremium
        ? strengthOpp.best
        : { ...strengthOpp.best, value: null },
      opportunity: args.isPremium
        ? strengthOpp.opportunity
        : { ...strengthOpp.opportunity, value: null },
      score_compact: scoreCompact,
      avg_score_recent: round1(avgRecent),
      avg_score_baseline: round1(avgBaseline),
      rounds_recent: recentCombined.length,
      rounds_baseline: baselineCombined.length,
    },
    tier_context: {
      isPremium: args.isPremium,
      baseline: args.isPremium ? 'alltime' : 'last20',
      maxRoundsUsed: args.rounds.length,
      recentWindow: 5,
    },
    consistency,
    efficiency,
    sg_locked: !args.isPremium,
    sg: sgPayload,
    projection,
    ...(projectionRanges ? { projection_ranges: projectionRanges } : {}),
    cards: args.cards,
    cards_locked_count: 4,
    refresh: {
      manual_cooldown_hours: 0,
    },
    mode_payload: modePayload,
    handicap_trend: {
      labels: handicapPoints.map((p) => p.label),
      handicap: handicapPoints.map((p) => p.value),
    },
    openai_usage: args.openaiUsage,
  };

  if (!args.isPremium) {
    (Object.keys(payload.mode_payload) as StatsMode[]).forEach((mode) => {
      payload.mode_payload[mode].kpis.avgSgTotalRecent = null;
    });
  }

  return payload;
}

export function decorateCardEmojis(cards: string[], band: PerformanceBand, isWeakness: boolean): string[] {
  const msg1 = band === 'great' ? '\u{1F525}' : '\u2705';
  const msg2 = isWeakness ? '\u26A0\uFE0F' : '\u2705';
  const map = [msg1, msg2, '\u2139\uFE0F', '\u2139\uFE0F', '\u2139\uFE0F', '\u2139\uFE0F', '\u2705'];

  return cards.map((c, i) => {
    const stripped = String(c ?? '')
      .replace(/^(?:\u2705|\u26A0\uFE0F|\u2139\uFE0F|\u{1F525})\s*/u, '')
      .trim();
    return `${map[i] ?? '\u2139\uFE0F'} ${stripped}`.trim();
  });
}

export async function generateOverallCardsWithLLM(args: {
  apiKey: string;
  model: string;
  payloadFacts: any;
  maxOutputTokens: number;
  timeoutMs: number;
  userSeed: string;
}): Promise<{ cards: string[]; usage: OpenAIUsageSummary | null }> {
  const expectedCount = 7;
  const systemPrompt = [
    'You write concise golf overall insights in direct second-person voice.',
    'Return JSON only with key "messages" as an array of exactly 7 strings.',
    'Do not include emojis; emojis are added later.',
    'Each message must be 1-2 sentences, specific, and evidence-based.',
    'Message intent by index:',
    '1) weekly/overall score summary with comparison context.',
    '2) what helped (strength) OR what cost strokes (weakness), based on provided flags.',
    '3) next-round tactical focus.',
    '4) practice drill recommendation with why it helps.',
    '5) course-strategy recommendation.',
    '6) projection context in rough terms (~N rounds).',
    '7) one clear milestone/progress takeaway.',
    'Do not invent numbers or stats not provided.',
    'Avoid placeholder fragments or malformed phrases.',
  ].join('\n');

  const userPrompt = JSON.stringify({
    seed: args.userSeed,
    facts: args.payloadFacts,
    output: { messages: Array.from({ length: expectedCount }, () => '...') },
  });

  const result = await callOpenAI({
    apiKey: args.apiKey,
    model: args.model,
    systemPrompt,
    userPrompt,
    maxOutputTokens: args.maxOutputTokens,
    timeoutMs: args.timeoutMs,
    schemaName: 'overall_insights',
    jsonSchema: {
      type: 'object',
      additionalProperties: false,
      required: ['messages'],
      properties: {
        messages: {
          type: 'array',
          minItems: expectedCount,
          maxItems: expectedCount,
          items: { type: 'string' },
        },
      },
    },
  });

  const cards = parseMessages(result.text, expectedCount);
  if (cards.length !== expectedCount) {
    throw new Error('Failed to parse overall insights JSON messages');
  }
  return { cards, usage: result.usage };
}

export function computeOverallDataHash(rounds: OverallRoundPoint[], isPremium: boolean): string {
  return buildDataHash({ rounds, isPremium });
}

export function pickDeterministicDrillSeeded(area: SGComponentName | null, roundSeed: string): string {
  return deterministicDrill(area, roundSeed);
}

