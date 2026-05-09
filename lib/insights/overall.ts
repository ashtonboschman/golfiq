import crypto from 'crypto';
import { formatDate } from '@/lib/formatters';
import {
  pickDirectionalPattern,
  type DirectionalMissRawValue,
  type DirectionalPatternSummary,
} from '@/lib/insights/directionalMiss';
import {
  classifyBalancedComponents,
  classifyVolatilitySignal,
  downgradePersistenceTierForWeakness,
  resolvePersistenceTierFromFrequency,
} from '@/lib/insights/sharedSignals';

export type StatsMode = 'combined' | '9' | '18';
export type PerformanceBand = 'tough' | 'below' | 'expected' | 'above' | 'great' | 'unknown';
export type SGComponentName = 'off_tee' | 'approach' | 'putting' | 'penalties' | 'short_game';
export type SGCostlyComponent = 'offTee' | 'approach' | 'putting' | 'penalties' | 'residual';
export const OVERALL_SG_MIN_RECENT_COVERAGE = 3;
export const OVERALL_SG_MIN_RECENT_COVERAGE_FOR_SELECTION = 1;
export const OVERALL_RECENT_WINDOW = 5;
export const OVERALL_EARLY_SAMPLE_MAX_ROUNDS = 5;
export const OVERALL_CONSISTENCY_WINDOW = 5;

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
  firDirections: DirectionalMissRawValue[];
  girDirections: DirectionalMissRawValue[];
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
    scoreCompact: string;
  };
  narrative: {
    strength: {
      name: SGComponentName | null;
      value: number | null;
      label: string | null;
      coverageRecent: number | null;
      lowCoverage: boolean;
    };
    opportunity: {
      name: SGComponentName | null;
      value: number | null;
      label: string | null;
      isWeakness: boolean;
      coverageRecent: number | null;
      lowCoverage: boolean;
    };
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
  directional?: {
    fir: DirectionalPatternSummary | null;
    gir: DirectionalPatternSummary | null;
    dominant: DirectionalPatternSummary | null;
  };
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

export type ProjectionByModeEntry = {
  trajectory: ProjectionPayload['trajectory'];
  projectedScoreIn10: number | null;
  scoreLow: number | null;
  scoreHigh: number | null;
  roundsUsed: number;
};

type EfficiencyMetric = {
  recent: number | null;
  baseline: number | null;
  coverageRecent: string;
};

type OverallConfidence = 'high' | 'medium' | 'low';

export type OverallInsightsPayload = {
  generated_at: string;
  confidence?: OverallConfidence;
  analysis: {
    window_recent: number;
    window_baseline: 'last20' | 'overall';
    mode_for_narrative: 'combined';
    performance_band: PerformanceBand;
    strength: {
      name: SGComponentName | null;
      value: number | null;
      label: string | null;
      coverageRecent: number | null;
      lowCoverage: boolean;
    };
    opportunity: {
      name: SGComponentName | null;
      value: number | null;
      label: string | null;
      isWeakness: boolean;
      coverageRecent: number | null;
      lowCoverage: boolean;
    };
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
  projection_by_mode: Record<StatsMode, ProjectionByModeEntry>;
  cards: string[];
  cards_by_mode: Record<StatsMode, string[]>;
  cards_locked_count: number;
  mode_payload: Record<StatsMode, ModePayload>;
  handicap_trend: {
    labels: string[];
    handicap: (number | null)[];
  };
};

const SG_LABELS: Record<SGComponentName, string> = {
  off_tee: 'Off the Tee',
  approach: 'Approach',
  putting: 'Putting',
  penalties: 'Penalties',
  short_game: 'Short Game',
};

const SG_BELOW_EXPECTATIONS_THRESHOLD = -2.0;
const SG_TOUGH_ROUND_THRESHOLD = -5.0;
const SG_ABOVE_EXPECTATIONS_THRESHOLD = 2.0;
const SG_EXCEPTIONAL_THRESHOLD = 5.0;
const HANDICAP_MIN_HISTORY_FOR_PROJECTION = 5;
const HANDICAP_SCORE_LINK_MIN_POINTS = 8;
const HANDICAP_SCORE_BLEND_WEIGHT = 0.85;
const HANDICAP_SLOPE_BLEND_WEIGHT = 0.15;
const HANDICAP_SCORE_SHIFT_MAX = 1.0;
const HANDICAP_PROJECTED_SHIFT_MIN = -1.2;
const HANDICAP_PROJECTED_SHIFT_MAX = 1.2;

const DRILL_LIBRARY: Record<SGComponentName | 'general', string[]> = {
  off_tee: [
    'Fairway target area: Pick a target and define a 25-yard target area. Hit 12 drives with full routine. Score 2 = inside the target area, 1 = in play but outside the area, 0 = clear trouble (would be lost ball or penalty). Goal: 18 points.',
    'Start-line gate: Set a gate 3 feet in front of the ball with two tees. Hit 10 drives starting through the gate. Goal: 7 of 10 through the gate.',
    'Driver and 3-wood split: Alternate driver and 3-wood to the same target line, 6 each. Track in-play rate and target area. Goal: 9 of 12 in play, with at least 6 inside a 30-yard target area.',
    'Finish hold: Hit 9 drives and hold your finish for 3 seconds. Any balance break is a failed rep. Goal: 9 clean finishes.',
    'Safe-side miss: Pick a safe side and a danger side. Hit 12 drives. Any miss must finish on the safe side. Goal: 10 of 12 safe-side results.',
    'Tee height test: Hit 3 drives low tee, 3 normal, 3 high. Choose the best strike pattern and hit 6 more at that height. Goal: 7 of 9 solid strikes and zero clear trouble balls.',
    'In-play pressure set: Hit 3 drives in a row that finish in play. Repeat until you complete 4 sets. Any clear trouble ball resets the set. Goal: complete 4 sets.',
    'Intermediate target starts: Pick a downrange target and an intermediate target. Hit 10 drives focusing only on start line over the intermediate target. Goal: 8 of 10 on intended start line.',
    'Tempo lock: Hit 12 drives at 80 to 90 percent speed with full finish. Track strike quality and in-play rate. Goal: 10 of 12 in play with consistent contact.',
    'Two-ball fairway: Hit two drives back-to-back to the same target. Both must finish in play to win the set. Repeat 6 sets. Goal: 4 successful sets.',
  ],

  approach: [
    'Distance ladder: Pick 3 targets spaced 10 yards apart with one club. Hit 3 balls to each target in random order. Score 2 = inside 10 yards, 1 = inside 20. Goal: 12 points.',
    'Center-green discipline: Pick a middle target and hit 12 approach shots to center. Ignore flags. Score 1 = green, 2 = center third. Goal: 14 points.',
    'Front-edge carry: Pick a target and a front carry line. Hit 10 shots that must carry the line. Score 1 = carry, 2 = carry plus green. Goal: 14 points.',
    'Random wedge set: Alternate 50, 70, and 90 yards for 12 shots with full routine. Goal: 8 of 12 inside 20 feet.',
    'Trajectory split: Hit 6 stock shots and 6 lower flight shots to the same target. Track start line and contact. Goal: 9 of 12 start within one flag width of your line.',
    'Strike window: Define a 12-yard circle around the target. Hit 10 shots and count balls inside. Goal: 5 inside the circle.',
    'Green section control: Pick left, middle, and right sections. Hit 3 shots to each section. Misses must be pin-high or safer. Goal: no more than 2 short-side misses.',
    'Clean start set: Hit 10 approaches. If any shot starts more than one flag width off your intended line, restart the set. Goal: complete 10 clean starts.',
    'Wedge tempo lock: Pick one wedge distance. Hit 15 balls with identical finish length. Goal: 10 of 15 inside a 25-foot circle.',
    'Long-iron safety: Pick a conservative target and hit 10 long-iron shots. Score 1 = in play, 2 = green. Goal: 12 points.',
  ],

  putting: [
    'Lag ladder: Putt 10 balls from 25 to 40 feet. Any ball finishing outside 3 feet is a fail. Goal: 8 of 10 inside 3 feet.',
    'Start-line gate: Place two tees just wider than the ball 12 inches in front. Hit 12 putts from 6 feet starting through the gate. Goal: 10 clean starts.',
    'Speed ladder: Putt 10, 15, 20, 25, and 30 feet with two balls each. Goal: 8 of 10 finish inside 3 feet.',
    'Three-foot lockdown: Make 20 putts from 3 feet. Any miss resets to 0. Goal: reach 20.',
    'Circle drill: Place 8 balls in a 4-foot circle. Allow one miss maximum. Goal: make 7 of 8.',
    'Stop-zone control: Place a tee 18 inches past the hole. Roll 12 putts from 8 feet and finish between hole and tee. Goal: 10 of 12 in the zone.',
    'Clock drill: Place 6 balls at 4 feet around the hole. Make all 6 to pass. Goal: 6 of 6.',
    'One-hand tempo: Hit 6 putts from 4 feet lead-hand only, then 6 trail-hand only. Goal: 8 makes total.',
    'Distance calibration: Roll 10 balls to a fringe line and stop short. Any ball crossing the line is a fail. Goal: 8 of 10 stop short.',
    'Start-spot focus: Pick a spot 12 inches ahead on the line. Hit 12 putts from 5 feet rolling over the spot. Goal: 10 of 12 over the spot.',
  ],

  penalties: [
    'Risk label rule: Label every full swing as green, yellow, or red. Red swings require a conservative target and one more club. Goal: zero penalty strokes next round.',
    'Trouble punch-out: When blocked or in trees, the only target is back to fairway. Track decisions over 10 holes. Goal: 10 of 10 correct punch-outs when required.',
    'Hazard buffer: When water or OB is in play, aim to the widest safe side and accept the longer next shot. Goal: zero penalty strokes from tee shots.',
    'Par-5 discipline: Pick the layup yardage first, then plan backwards on every par 5. Goal: zero penalty strokes and zero forced carries on second shots.',
    'Two-shot plan: Before each tee shot, choose the next-shot target as well and commit. Goal: zero mid-hole target changes after a miss.',
    'Club-down safety: On any hole with a penalty zone, take one less club and prioritize in-play. Goal: zero penalties on those holes.',
    'Miss-side rule: On approaches with short-side risk, aim to the safe side and accept longer putts. Goal: zero short-side recoveries that lead to doubles.',
    'Recovery scoring: A recovery is successful if the next shot is from fairway or a clean angle. Track up to 6 recoveries. Goal: 5 successful recoveries.',
    'Decision audit: After the round, label each penalty as decision or shot. Next round, apply a conservative target on every decision-penalty hole. Goal: eliminate repeat decision penalties.',
    'Layup habit: When reaching requires a perfect strike, lay up to a full wedge yardage. Track up to 6 opportunities. Goal: 6 conservative layups executed.',
  ],

  short_game: [
    'Up-and-down set: Drop 9 balls around the green with mixed lies and play each to the hole. Count saves. Goal: 5 successful up-and-downs.',
    'Landing towel: Place a towel 3 yards onto the green. Chip 15 balls landing on the towel. Goal: 7 of 15 land on towel.',
    'One-bounce release: Hit 12 chips designed to land once and release. Goal: 8 of 12 finish inside 6 feet.',
    'Lie ladder: Play 4 balls each from tight, fringe, and rough. Goal: 6 of 12 inside 6 feet.',
    'Single landing spot: Pick one landing spot and hit 15 chips to it. Goal: 9 of 15 land within one clubhead of the spot.',
    'Bump-and-run set: Hit 12 bump-and-runs with an 8-iron from fringe. Goal: 8 of 12 inside 6 feet.',
    'Pitch window: Hit 12 pitches to a 15-yard landing zone. Goal: 8 of 12 carry within plus or minus 2 yards.',
    'One-club set: Use one wedge for 18 reps from mixed lies. Goal: 10 of 18 inside 6 feet.',
    'Fringe choice test: From the same spot, hit 6 fringe putts and 6 chips. Record average leave for each. Goal: choose the better option for next-round strategy.',
    'Pressure saves: Place 10 balls around the green and play each to save par. Goal: 6 of 10 saves.',
  ],

  general: [
    'Routine lock: Use the same pre-shot routine on every full swing for 18 holes. Track rushed swings. Goal: zero rushed swings and full commit on every shot.',
    'Center targets only: Aim at center targets on every approach for 9 holes. Track short-side misses. Goal: zero short-side misses.',
    'Miss removal: Identify your biggest miss and choose targets that remove it for 18 holes. Track penalties from that miss. Goal: zero penalty strokes from that miss.',
    'Accuracy scoring: Pick a range target and hit 15 balls. Score 2 = inside 10 yards, 1 = inside 20. Goal: 18 points.',
    'Tempo block: Hit 20 balls with identical finish length and a balanced hold. Goal: 18 balanced finishes.',
    'Par-3 rule: Aim center-green on every par 3. Goal: hit 50 percent of greens or finish pin-high on the safe side.',
    'Smart doubles: When out of position, play for bogey instead of forcing par. Goal: zero doubles from decision errors.',
    'One stat goal: Pick one stat goal for the round and write it down before teeing off. Goal: review it after and log the result.',
    "Green-light only: Attack pins only on green-light numbers and send all others to center. Goal: zero forced carries when you're between clubs.",
    'Reset between shots: After every shot, take one full breath and re-commit to the next target. Goal: zero rushed next swings.',
  ],
};

const OVERALL_COPY_BANNED_TOKENS = [
  'could',
  'might',
  'consider',
  'seems',
  'challenge',
  '\u2014',
  '\u2013',
  '&mdash;',
  '—',
  '–',
] as const;

function sanitizeCopy(text: string): string {
  return String(text ?? '')
    .replace(/\s+([.,!?;:])/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeForGuard(text: string): string {
  return String(text ?? '').normalize('NFKC').toLowerCase();
}

function assertOverallCopySafe(text: string, context: string): void {
  const normalized = normalizeForGuard(text);
  const token = OVERALL_COPY_BANNED_TOKENS.find((entry) => normalized.includes(normalizeForGuard(entry)));
  if (!token) return;

  const err = new Error(`Banned overall copy token "${token}" in ${context}: ${text}`);
  if (process.env.NODE_ENV === 'production') {
    console.error(err);
    return;
  }
  throw err;
}

function formatToParShort(toPar: number): string {
  if (toPar === 0) return 'E';
  return toPar > 0 ? `+${toPar}` : `${toPar}`;
}

function round1(v: number | null): number | null {
  if (v == null || !Number.isFinite(v)) return null;
  return Math.round(v * 10) / 10;
}

function scoreToPer18(score: number | null, holes: number | null | undefined): number | null {
  if (score == null || !Number.isFinite(score)) return null;
  if (holes == null || !Number.isFinite(holes) || holes <= 0) return null;
  return (score * 18) / holes;
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
  const recent = sortedDesc.slice(0, OVERALL_RECENT_WINDOW);
  const baseline = isPremium ? sortedDesc : sortedDesc.slice(0, 20);
  const trend = sortedDesc.slice(0, 20).reverse();

  const avgScoreRecent = average(recent.map((p) => p.score));
  const avgScoreBaseline = average(baseline.map((p) => p.score));
  const avgToParRecent = average(recent.map((p) => p.toPar));
  const avgSgTotalRecent = isPremium ? average(recent.map((p) => p.sgTotal)) : null;
  const bestScoreRecent = recent.length ? Math.min(...recent.map((p) => p.score)) : null;
  const deltaVsBaseline =
    avgScoreRecent != null && avgScoreBaseline != null ? avgScoreRecent - avgScoreBaseline : null;
  const latest = sortedDesc[0];
  const scoreCompact =
    latest?.toPar != null ? `${latest.score} (${formatToParShort(latest.toPar)})` : `${latest?.score ?? '-'}`;
  const strengthOpp = componentAverages(recent, baseline);

  const labels = trend.map((p) => formatDateShort(p.date));
  const score = trend.map((p) => p.score);
  const firPct = trend.map((p) => (p.firHit != null && p.nonPar3Holes > 0 ? (p.firHit / p.nonPar3Holes) * 100 : null));
  const girPct = trend.map((p) => (p.girHit != null && p.holes > 0 ? (p.girHit / p.holes) * 100 : null));
  const sgTotal = trend.map((p) => round1(p.sgTotal));
  const handicap = trend.map((p) => round1(p.handicapAtRound));
  const sgModePayload = computeSgPayload(sortedDesc);
  const recentFirDirections = recent.flatMap((point) => point.firDirections ?? []);
  const recentGirDirections = recent.flatMap((point) => point.girDirections ?? []);
  const directionalFir = pickDirectionalPattern({
    firValues: recentFirDirections,
    girValues: [],
    preferredArea: 'fir',
    options: {
      minMisses: 4,
      minDominanceRatio: 0.65,
      minMargin: 2,
      highConfidenceMisses: 6,
      highConfidenceDominanceRatio: 0.75,
    },
  });
  const directionalGir = pickDirectionalPattern({
    firValues: [],
    girValues: recentGirDirections,
    preferredArea: 'gir',
    options: {
      minMisses: 4,
      minDominanceRatio: 0.65,
      minMargin: 2,
      highConfidenceMisses: 6,
      highConfidenceDominanceRatio: 0.75,
    },
  });
  const directionalDominant = pickDirectionalPattern({
    firValues: recentFirDirections,
    girValues: recentGirDirections,
    options: {
      minMisses: 4,
      minDominanceRatio: 0.65,
      minMargin: 2,
      highConfidenceMisses: 6,
      highConfidenceDominanceRatio: 0.75,
    },
  });

  return {
    kpis: {
      roundsRecent: recent.length,
      avgScoreRecent: round1(avgScoreRecent),
      avgScoreBaseline: round1(avgScoreBaseline),
      avgToParRecent: round1(avgToParRecent),
      avgSgTotalRecent: round1(avgSgTotalRecent),
      bestScoreRecent,
      deltaVsBaseline: round1(deltaVsBaseline),
      scoreCompact,
    },
    narrative: {
      strength: isPremium
        ? strengthOpp.best
        : { ...strengthOpp.best, value: null },
      opportunity: isPremium
        ? strengthOpp.opportunity
        : { ...strengthOpp.opportunity, value: null },
    },
    consistency: computeConsistency(sortedDesc),
    efficiency: computeEfficiency(sortedDesc, baseline),
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
    directional: {
      fir: directionalFir?.area === 'fir' ? directionalFir : null,
      gir: directionalGir?.area === 'gir' ? directionalGir : null,
      dominant: directionalDominant,
    },
  };
}

function formatDirectionalArea(area: 'fir' | 'gir'): string {
  return area === 'gir' ? 'GIR' : 'FIR';
}

function formatDirectionalDirection(direction: 'left' | 'right' | 'short' | 'long'): string {
  return direction;
}

function buildOverallDirectionalQualifier(args: {
  pattern: DirectionalPatternSummary | null;
  confidence: OverallConfidence;
  isPremium: boolean;
}): string | null {
  const { pattern, confidence, isPremium } = args;
  if (!pattern || confidence === 'low') return null;

  const area = formatDirectionalArea(pattern.area);
  const direction = formatDirectionalDirection(pattern.dominantDirection);
  if (confidence === 'high') {
    if (isPremium) {
      return `Recent ${area} misses are consistently skewing ${direction} (${pattern.count}/${pattern.totalDirectionalMisses} recorded misses).`;
    }
    return `Recent ${area} misses are consistently skewing ${direction}.`;
  }

  if (pattern.confidence === 'high' && isPremium) {
    return `Recent ${area} misses are leaning ${direction} (${pattern.count}/${pattern.totalDirectionalMisses} recorded misses).`;
  }
  return `Recent ${area} misses are leaning ${direction}.`;
}

function computeBand(avgSg: number | null): PerformanceBand {
  if (avgSg == null || !Number.isFinite(avgSg)) return 'unknown';
  if (avgSg <= SG_TOUGH_ROUND_THRESHOLD) return 'tough';
  if (avgSg <= SG_BELOW_EXPECTATIONS_THRESHOLD) return 'below';
  if (avgSg < SG_ABOVE_EXPECTATIONS_THRESHOLD) return 'expected';
  if (avgSg < SG_EXCEPTIONAL_THRESHOLD) return 'above';
  return 'great';
}

function componentAverages(recentCombined: OverallRoundPoint[], baselineCombined: OverallRoundPoint[]) {
  const useRecentAbsoluteValues = baselineCombined.length <= OVERALL_EARLY_SAMPLE_MAX_ROUNDS;
  const componentDefs: Array<{
    name: SGComponentName;
    get: (p: OverallRoundPoint) => number | null;
  }> = [
    { name: 'off_tee', get: (p) => p.sgOffTee },
    { name: 'approach', get: (p) => p.sgApproach },
    { name: 'putting', get: (p) => p.sgPutting },
    { name: 'penalties', get: (p) => p.sgPenalties },
  ];

  const deltas = componentDefs
    .map((def) => {
      const recentVals = recentCombined
        .map(def.get)
        .filter((n): n is number => n != null && Number.isFinite(n));
      const coverageRecent = recentVals.length;
      if (coverageRecent < OVERALL_SG_MIN_RECENT_COVERAGE_FOR_SELECTION) {
        return {
          name: def.name,
          value: null as number | null,
          coverageRecent,
        };
      }
      const recentAvg = average(recentVals);
      if (recentAvg == null) {
        return {
          name: def.name,
          value: null as number | null,
          coverageRecent,
        };
      }
      if (useRecentAbsoluteValues) {
        return {
          name: def.name,
          value: recentAvg,
          coverageRecent,
        };
      }
      const baselineVals = baselineCombined
        .map(def.get)
        .filter((n): n is number => n != null && Number.isFinite(n));
      const baselineAvg = average(baselineVals);
      if (baselineAvg == null) {
        return {
          name: def.name,
          value: null as number | null,
          coverageRecent,
        };
      }
      return {
        name: def.name,
        value: recentAvg - baselineAvg,
        coverageRecent,
      };
    });

  const withVals = deltas.filter(
    (c): c is { name: SGComponentName; value: number; coverageRecent: number } => c.value != null,
  );
  if (!withVals.length) {
    return {
      best: { name: null, value: null, label: null, coverageRecent: null, lowCoverage: false },
      opportunity: {
        name: null,
        value: null,
        label: null,
        isWeakness: false,
        coverageRecent: null,
        lowCoverage: false,
      },
    };
  }

  const best = withVals.reduce((a, b) => (b.value > a.value ? b : a), withVals[0]);
  const worstDistinct = [...withVals]
    .sort((a, b) => a.value - b.value)
    .find((component) => component.name !== best.name) ?? null;

  return {
    best: {
      name: best.name,
      value: round1(best.value),
      label: SG_LABELS[best.name],
      coverageRecent: best.coverageRecent,
      lowCoverage: best.coverageRecent < OVERALL_SG_MIN_RECENT_COVERAGE,
    },
    opportunity: {
      name: worstDistinct?.name ?? null,
      value: worstDistinct ? round1(worstDistinct.value) : null,
      label: worstDistinct ? SG_LABELS[worstDistinct.name] : null,
      isWeakness: worstDistinct ? worstDistinct.value < 0 : false,
      coverageRecent: worstDistinct?.coverageRecent ?? null,
      lowCoverage: worstDistinct ? worstDistinct.coverageRecent < OVERALL_SG_MIN_RECENT_COVERAGE : false,
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

function computeProjection(
  recentCombined: OverallRoundPoint[],
  baselineCombined: OverallRoundPoint[],
  currentHandicapOverride?: number | null,
): ProjectionPayload {
  const recentAvgScore = average(recentCombined.map((p) => p.score));
  const baselineAvgScore = average(baselineCombined.map((p) => p.score));
  const scoreSeries = [...recentCombined].reverse().map((p) => p.score);
  const scoreSlope = linearSlope(scoreSeries);

  // Handicap uses a longer, dedicated window than scoring so projections are
  // anchored to true current index and not overreacting to a short sample.
  const newestHandicap = baselineCombined[0]?.handicapAtRound;
  const derivedHandicapCurrent =
    newestHandicap != null && Number.isFinite(newestHandicap) ? newestHandicap : null;
  const hasHandicapOverride =
    currentHandicapOverride != null && Number.isFinite(currentHandicapOverride);
  const handicapCurrent = hasHandicapOverride
    ? currentHandicapOverride
    : derivedHandicapCurrent;
  const handicapTrendWindow = baselineCombined
    .slice(0, 12)
    .map((p) => p.handicapAtRound)
    .filter((n): n is number => n != null && Number.isFinite(n));
  const handicapSlope = linearSlope([...handicapTrendWindow].reverse());

  const delta = (recentAvgScore != null && baselineAvgScore != null) ? recentAvgScore - baselineAvgScore : null;
  const isEarlySample = baselineCombined.length <= OVERALL_EARLY_SAMPLE_MAX_ROUNDS;
  let trajectory: ProjectionPayload['trajectory'] = 'unknown';
  if (isEarlySample) {
    trajectory = delta != null ? 'flat' : 'unknown';
  } else if (scoreSlope != null && Math.abs(scoreSlope) >= 0.35) {
    trajectory = scoreSlope < 0 ? 'improving' : 'worsening';
  } else if (delta != null && Math.abs(delta) <= 0.8) {
    trajectory = 'flat';
  } else if (delta != null) {
    trajectory = delta < 0 ? 'improving' : 'worsening';
  } else {
    trajectory = 'unknown';
  }

  // Keep projections grounded: short-term trend with bounded movement.
  const scoreTrendShift = scoreSlope != null ? clamp(scoreSlope * 4, -2, 2) : 0;
  const projectedScoreIn10 =
    recentAvgScore != null && baselineAvgScore != null
      ? round1((recentAvgScore * 0.7) + (baselineAvgScore * 0.3) + scoreTrendShift)
      : recentAvgScore != null
        ? round1(recentAvgScore + scoreTrendShift)
      : null;
  const handicapTrendShift = handicapSlope != null ? clamp(handicapSlope * 8, -0.8, 1.2) : 0;
  const handicapFromSlopeOnly =
    handicapCurrent != null && handicapTrendWindow.length >= HANDICAP_MIN_HISTORY_FOR_PROJECTION
      ? handicapCurrent + handicapTrendShift
      : null;

  const scoreProjectionWindow = baselineCombined.slice(0, 20);
  const scorePer18History = scoreProjectionWindow
    .map((row) => scoreToPer18(row.score, row.holes))
    .filter((value): value is number => value != null && Number.isFinite(value));
  const handicapHistory = scoreProjectionWindow
    .map((row) => row.handicapAtRound)
    .filter((value): value is number => value != null && Number.isFinite(value));
  const recentAvgScorePer18 = average(
    recentCombined.map((row) => scoreToPer18(row.score, row.holes)),
  );
  const recentAvgHoles = average(recentCombined.map((row) => row.holes));
  const projectedScorePer18 =
    projectedScoreIn10 != null && recentAvgHoles != null && recentAvgHoles > 0
      ? (projectedScoreIn10 * 18) / recentAvgHoles
      : null;

  let handicapFromScoreOnly: number | null = null;
  if (
    handicapCurrent != null &&
    projectedScorePer18 != null &&
    recentAvgScorePer18 != null &&
    scorePer18History.length >= HANDICAP_SCORE_LINK_MIN_POINTS &&
    handicapHistory.length >= HANDICAP_SCORE_LINK_MIN_POINTS
  ) {
    const scoreStd = stdDev(scorePer18History);
    const handicapStd = stdDev(handicapHistory);
    const scoreToHandicapScale =
      scoreStd != null && handicapStd != null && scoreStd >= 0.35
        ? clamp(handicapStd / scoreStd, 0.15, 0.85)
        : 0.4;
    const projectedScoreShift = projectedScorePer18 - recentAvgScorePer18;
    const handicapShiftFromScore = clamp(
      projectedScoreShift * scoreToHandicapScale,
      -HANDICAP_SCORE_SHIFT_MAX,
      HANDICAP_SCORE_SHIFT_MAX,
    );
    handicapFromScoreOnly = handicapCurrent + handicapShiftFromScore;
  }

  let projectedHandicapRaw: number | null = null;
  if (handicapFromScoreOnly != null && handicapFromSlopeOnly != null) {
    projectedHandicapRaw =
      (handicapFromScoreOnly * HANDICAP_SCORE_BLEND_WEIGHT) +
      (handicapFromSlopeOnly * HANDICAP_SLOPE_BLEND_WEIGHT);
  } else if (handicapFromScoreOnly != null) {
    projectedHandicapRaw = handicapFromScoreOnly;
  } else if (handicapFromSlopeOnly != null) {
    projectedHandicapRaw = handicapFromSlopeOnly;
  }

  if (projectedHandicapRaw != null && handicapCurrent != null) {
    if (trajectory === 'improving') {
      projectedHandicapRaw = Math.min(projectedHandicapRaw, handicapCurrent);
    } else if (trajectory === 'worsening') {
      projectedHandicapRaw = Math.max(projectedHandicapRaw, handicapCurrent);
    }
    projectedHandicapRaw = clamp(
      projectedHandicapRaw,
      handicapCurrent + HANDICAP_PROJECTED_SHIFT_MIN,
      handicapCurrent + HANDICAP_PROJECTED_SHIFT_MAX,
    );
  }

  const projectedHandicapIn10 = round1(projectedHandicapRaw);

  return {
    trajectory,
    projectedScoreIn10,
    handicapCurrent: round1(handicapCurrent),
    projectedHandicapIn10,
  };
}

function computeProjectionByMode(
  pointsByMode: OverallRoundPoint[],
  isPremium: boolean,
  currentHandicapOverride?: number | null,
): ProjectionByModeEntry {
  const sortedDesc = [...pointsByMode].sort((a, b) => +new Date(b.date) - +new Date(a.date));
  const recent = sortedDesc.slice(0, 5);
  const raw = computeProjection(recent, sortedDesc, currentHandicapOverride);
  const canProjectScore = isPremium && sortedDesc.length >= 10;
  const projectedScoreIn10 = canProjectScore ? raw.projectedScoreIn10 : null;

  if (projectedScoreIn10 == null) {
    return {
      trajectory: raw.trajectory,
      projectedScoreIn10: null,
      scoreLow: null,
      scoreHigh: null,
      roundsUsed: sortedDesc.length,
    };
  }

  const recentForRange = sortedDesc.slice(0, 10);
  const scoreValues = recentForRange
    .map((r) => r.score)
    .filter((n): n is number => Number.isFinite(n));
  const scoreP25 = percentile(scoreValues, 0.25);
  const scoreP75 = percentile(scoreValues, 0.75);
  if (scoreP25 == null || scoreP75 == null) {
    return {
      trajectory: raw.trajectory,
      projectedScoreIn10,
      scoreLow: null,
      scoreHigh: null,
      roundsUsed: sortedDesc.length,
    };
  }

  const scoreHalfIqr = Math.abs(scoreP75 - scoreP25) / 2;
  const scoreWindow = clamp(scoreHalfIqr, 1.2, 3);
  return {
    trajectory: raw.trajectory,
    projectedScoreIn10,
    scoreLow: round1(projectedScoreIn10 - scoreWindow),
    scoreHigh: round1(projectedScoreIn10 + scoreWindow),
    roundsUsed: sortedDesc.length,
  };
}

function deterministicDrill(area: SGComponentName | null, seed: string): string {
  const key = area ?? 'general';
  const list = DRILL_LIBRARY[key] ?? DRILL_LIBRARY.general;
  const h = crypto.createHash('sha256').update(seed).digest('hex');
  const idx = parseInt(h.slice(0, 8), 16) % list.length;
  const selected = sanitizeCopy(list[idx]);
  assertOverallCopySafe(selected, `drill:${key}:${idx}`);
  return selected;
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

function computeConsistency(pointsCombined: OverallRoundPoint[]): OverallInsightsPayload['consistency'] {
  const vals = pointsCombined
    .slice(0, OVERALL_CONSISTENCY_WINDOW)
    .map((p) => p.toPar)
    .filter((n): n is number => n != null && Number.isFinite(n));

  if (vals.length < OVERALL_CONSISTENCY_WINDOW) {
    return { label: 'insufficient', stdDev: null };
  }

  const sd = stdDev(vals);
  if (sd == null) return { label: 'insufficient', stdDev: null };
  if (sd < 3) return { label: 'stable', stdDev: round1(sd) };
  if (sd < 5) return { label: 'moderate', stdDev: round1(sd) };
  return { label: 'volatile', stdDev: round1(sd) };
}

function computeEfficiency(
  pointsCombined: OverallRoundPoint[],
  baselineCombined: OverallRoundPoint[],
): OverallInsightsPayload['efficiency'] {
  const recent = pointsCombined.slice(0, 5);
  const baseline = baselineCombined;
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
  return prevDataHash !== nextDataHash;
}

export function computeOverallPayload(args: {
  rounds: OverallRoundPoint[];
  isPremium: boolean;
  model: string;
  cards: string[];
  cardsByMode?: Record<StatsMode, string[]>;
  currentHandicapOverride?: number | null;
}): OverallInsightsPayload {
  const combined = normalizeByMode(args.rounds, 'combined')
    .sort((a, b) => +new Date(b.date) - +new Date(a.date));
  const recentCombined = combined.slice(0, OVERALL_RECENT_WINDOW);
  const baselineCombined = args.isPremium ? combined : combined.slice(0, 20);

  const avgSgRecent = average(recentCombined.map((r) => r.sgTotal));
  const band = computeBand(avgSgRecent);
  const strengthOpp = componentAverages(recentCombined, baselineCombined);

  const latest = recentCombined[0];
  const avgRecent = average(recentCombined.map((r) => r.score));
  const avgBaseline = average(baselineCombined.map((r) => r.score));
  const scoreCompact =
    latest?.toPar != null ? `${latest.score} (${formatToParShort(latest.toPar)})` : `${latest?.score ?? '-'}`;

  const rawProjection = computeProjection(
    recentCombined,
    baselineCombined,
    args.currentHandicapOverride,
  );
  const canProject = args.isPremium && combined.length >= 10;
  const projection: ProjectionPayload = canProject
    ? rawProjection
    : {
        ...rawProjection,
        projectedScoreIn10: null,
        projectedHandicapIn10: null,
      };

  const modes: StatsMode[] = ['combined', '9', '18'];
  const modePoints = Object.fromEntries(
    modes.map((m) => [m, normalizeByMode(args.rounds, m)]),
  ) as Record<StatsMode, OverallRoundPoint[]>;
  const modePayload = Object.fromEntries(
    modes.map((m) => [m, computeModePayload(modePoints[m], args.isPremium)]),
  ) as Record<StatsMode, ModePayload>;
  const projectionByMode = Object.fromEntries(
    modes.map((m) => [m, computeProjectionByMode(modePoints[m], args.isPremium, args.currentHandicapOverride)]),
  ) as Record<StatsMode, ProjectionByModeEntry>;

  const handicapPoints = [...combined]
    .slice(0, 20)
    .reverse()
    .map((r) => ({ label: formatDateShort(r.date), value: r.handicapAtRound }));

  const consistency = computeConsistency(combined);
  const efficiency = computeEfficiency(combined, baselineCombined);
  const sgPayload = computeSgPayload(combined);
  const projectionRanges: ProjectionRangesPayload | undefined = (() => {
    if (projection.projectedScoreIn10 == null || projection.projectedHandicapIn10 == null) return undefined;

    const recentForRange = combined.slice(0, 10);
    const scoreValues = recentForRange
      .map((r) => r.score)
      .filter((n): n is number => Number.isFinite(n));
    const handicapValues = combined
      .slice(0, 12)
      .map((r) => r.handicapAtRound)
      .filter((n): n is number => n != null && Number.isFinite(n));

    const scoreP25 = percentile(scoreValues, 0.25);
    const scoreP75 = percentile(scoreValues, 0.75);
    const hcpP25 = percentile(handicapValues, 0.25);
    const hcpP75 = percentile(handicapValues, 0.75);

    if (scoreP25 == null || scoreP75 == null || hcpP25 == null || hcpP75 == null) return undefined;
    const scoreHalfIqr = Math.abs(scoreP75 - scoreP25) / 2;
    const handicapHalfIqr = Math.abs(hcpP75 - hcpP25) / 2;
    const scoreWindow = clamp(scoreHalfIqr, 1.2, 3);
    const handicapWindow = clamp(handicapHalfIqr, 0.4, 1.2);
    const rawHandicapLow = projection.projectedHandicapIn10 - handicapWindow;
    const rawHandicapHigh = projection.projectedHandicapIn10 + handicapWindow;
    const minRealisticLow =
      projection.handicapCurrent != null ? projection.handicapCurrent - 1.0 : rawHandicapLow;
    const boundedHandicapLow = Math.max(rawHandicapLow, minRealisticLow);
    const boundedHandicapHigh = Math.max(rawHandicapHigh, boundedHandicapLow);

    return {
      scoreLow: round1(projection.projectedScoreIn10 - scoreWindow),
      scoreHigh: round1(projection.projectedScoreIn10 + scoreWindow),
      handicapLow: round1(boundedHandicapLow),
      handicapHigh: round1(boundedHandicapHigh),
    };
  })();

  const confidence: OverallConfidence = (() => {
    const combinedPayload = modePayload.combined;
    if (!combinedPayload) return 'low';
    const combinedRoundsRecent = combinedPayload.kpis.roundsRecent ?? 0;
    if (combinedRoundsRecent <= 2) return 'low';
    if (combinedRoundsRecent <= 4) return 'medium';

    const parseCoverage = (coverage: string | undefined): number => {
      if (!coverage || typeof coverage !== 'string') return 0;
      const [trackedRaw] = coverage.split('/');
      const tracked = Number.parseInt(trackedRaw ?? '0', 10);
      return Number.isFinite(tracked) ? tracked : 0;
    };

    const trackedSignals = [
      parseCoverage(combinedPayload.efficiency?.fir?.coverageRecent),
      parseCoverage(combinedPayload.efficiency?.gir?.coverageRecent),
      parseCoverage(combinedPayload.efficiency?.puttsTotal?.coverageRecent),
      parseCoverage(combinedPayload.efficiency?.penaltiesPerRound?.coverageRecent),
    ].filter((count) => count >= OVERALL_SG_MIN_RECENT_COVERAGE).length;

    const hasReliableConsistency = combinedPayload.consistency?.label !== 'insufficient';
    const hasSgContext = Boolean(sgPayload?.components?.hasData);
    const hasDeepHistory = (baselineCombined.length ?? 0) >= 10;

    if (hasReliableConsistency && trackedSignals >= 2 && (hasSgContext || hasDeepHistory)) {
      return 'high';
    }
    return 'medium';
  })();

  const payload: OverallInsightsPayload = {
    generated_at: new Date().toISOString(),
    confidence,
    analysis: {
      window_recent: OVERALL_RECENT_WINDOW,
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
      recentWindow: OVERALL_RECENT_WINDOW,
    },
    consistency,
    efficiency,
    sg_locked: !args.isPremium,
    sg: sgPayload,
    projection,
    ...(projectionRanges ? { projection_ranges: projectionRanges } : {}),
    projection_by_mode: projectionByMode,
    cards: args.cards,
    cards_by_mode: args.cardsByMode ?? {
      combined: [...args.cards],
      '9': [...args.cards],
      '18': [...args.cards],
    },
    cards_locked_count: 0,
    mode_payload: modePayload,
    handicap_trend: {
      labels: handicapPoints.map((p) => p.label),
      handicap: handicapPoints.map((p) => p.value),
    },
  };

  return payload;
}

export function buildDeterministicOverallCards(args: {
  payload: OverallInsightsPayload;
  recommendedDrill: string;
  missingStats: { fir: boolean; gir: boolean; putts: boolean; penalties: boolean };
  isPremium: boolean;
  mode?: StatsMode;
}): string[] {
  const analysis = args.payload.analysis;
  const mode = args.mode ?? 'combined';
  const modePayload = args.payload.mode_payload?.[mode];
  const narrative = modePayload?.narrative ?? {
    strength: analysis.strength,
    opportunity: analysis.opportunity,
  };

  const formatOneDecimal = (value: number): string => (Math.round(value * 10) / 10).toFixed(1);
  const scoreNearThreshold = mode === '9' ? 0.5 : 1.0;
  const modeRoundsRecent = modePayload?.kpis.roundsRecent ?? 0;
  const scoreRecent = modePayload?.kpis.avgScoreRecent ?? analysis.avg_score_recent;
  const scoreBaseline = modePayload?.kpis.avgScoreBaseline ?? analysis.avg_score_baseline;
  const consistency = modePayload?.consistency ?? args.payload.consistency;
  const confidence = args.payload.confidence ?? 'low';
  const scoreRangeTrigger = mode === '9' ? 3 : 6;
  const scoreRangeModerateTrigger = mode === '9' ? 2 : 4;
  const recentScores = (modePayload?.trend?.score ?? [])
    .slice(-OVERALL_RECENT_WINDOW)
    .filter((value): value is number => value != null && Number.isFinite(value));
  const recentScoreRange = recentScores.length
    ? Math.max(...recentScores) - Math.min(...recentScores)
    : null;
  const worstFrequency = args.payload.sg?.components?.worstComponentFrequencyRecent;
  const persistenceTier = resolvePersistenceTierFromFrequency(
    worstFrequency?.count,
    worstFrequency?.window,
  );
  const sgDeltas = (() => {
    const sgComponents = modePayload?.sgComponents;
    if (!sgComponents?.hasData) return [] as number[];
    const deltas = [
      sgComponents.recentAvg?.offTee != null && sgComponents.baselineAvg?.offTee != null
        ? sgComponents.recentAvg.offTee - sgComponents.baselineAvg.offTee
        : null,
      sgComponents.recentAvg?.approach != null && sgComponents.baselineAvg?.approach != null
        ? sgComponents.recentAvg.approach - sgComponents.baselineAvg.approach
        : null,
      sgComponents.recentAvg?.putting != null && sgComponents.baselineAvg?.putting != null
        ? sgComponents.recentAvg.putting - sgComponents.baselineAvg.putting
        : null,
      sgComponents.recentAvg?.penalties != null && sgComponents.baselineAvg?.penalties != null
        ? sgComponents.recentAvg.penalties - sgComponents.baselineAvg.penalties
        : null,
    ];
    return deltas.filter((value): value is number => value != null && Number.isFinite(value));
  })();
  const balancedState = classifyBalancedComponents({
    deltas: sgDeltas,
    options: {
      opportunityThreshold: -0.25,
      strengthThreshold: 0.25,
      tieSeparationThreshold: 0.08,
      neutralBandAbs: 0.25,
    },
  });
  const balancedBySharedSignal =
    balancedState.reason === 'neutral_band' || balancedState.reason === 'opportunity_tie';
  const volatilitySignal = classifyVolatilitySignal({
    consistencyLabel: consistency.label,
    stdDev: consistency.stdDev,
    scoreRange: recentScoreRange,
    options: {
      strongStdDev: 3,
      moderateStdDev: 2,
      strongScoreRange: scoreRangeTrigger,
      moderateScoreRange: scoreRangeModerateTrigger,
    },
  });
  const directionalQualifier = buildOverallDirectionalQualifier({
    pattern: modePayload?.directional?.dominant ?? null,
    confidence,
    isPremium: args.isPremium,
  });

  const card1 = (() => {
    if (modeRoundsRecent === 0 || scoreRecent == null || scoreBaseline == null || modeRoundsRecent < 3) {
      return 'Early score trends are forming. Keep logging rounds to confirm your long-term scoring direction.';
    }
    const delta = scoreRecent - scoreBaseline;
    if (Math.abs(delta) <= scoreNearThreshold) {
      if (confidence === 'high') {
        return 'Your recent rounds are close to your normal scoring range, and this looks stable over time.';
      }
      if (confidence === 'medium') {
        return 'Your recent rounds are close to your normal scoring range. The trend is holding steady.';
      }
      return 'Your recent rounds are close to your normal scoring range. This trend is still early.';
    }
    if (delta < 0) {
      if (confidence === 'high') {
        if (args.isPremium) {
          return `Your recent rounds are outperforming your recent baseline by about ${formatOneDecimal(Math.abs(delta))} strokes, and this has become a persistent trend.`;
        }
        return 'Your recent rounds are outperforming your recent baseline, and this has become a persistent trend.';
      }
      if (confidence === 'medium') {
      return 'Your recent rounds are trending better than your normal scoring range. This is becoming an emerging trend.';
      }
    return 'Your recent rounds are trending better than your normal scoring range, but this trend is still early.';
    }
    if (confidence === 'high') {
      if (args.isPremium) {
        return `Your recent rounds are above your recent baseline by about ${formatOneDecimal(delta)} strokes, and this has become a persistent trend.`;
      }
      return 'Your recent rounds are above your recent baseline, and this has become a persistent trend.';
    }
    if (confidence === 'medium') {
      return 'Your recent rounds are trending above your normal scoring range. This is becoming an emerging trend.';
    }
    return 'Your recent rounds are trending above your normal scoring range, but this trend is still early.';
  })();

  const card2 = (() => {
    const strongestLabel = narrative.strength.label;
    const strongestValue = narrative.strength.value;
    const weakestLabel = narrative.opportunity.label;
    const weakestValue = narrative.opportunity.value;
    const weakestIsWeakness = narrative.opportunity.isWeakness;
    const lowCoverage = narrative.opportunity.lowCoverage || narrative.strength.lowCoverage;
    const weakestAbs = weakestValue != null && Number.isFinite(weakestValue) ? Math.abs(weakestValue) : null;
    const strongestAbs = strongestValue != null && Number.isFinite(strongestValue) ? Math.abs(strongestValue) : null;
    const weakBalancedProfile =
      balancedBySharedSignal ||
      (weakestAbs != null && weakestAbs < 0.25);
    const strengthBalancedProfile =
      balancedBySharedSignal ||
      (strongestAbs != null && strongestAbs < 0.25);
    const moderateRelativeWeakness =
      weakestIsWeakness &&
      weakestAbs != null &&
      weakestAbs >= 0.15 &&
      weakestAbs < 0.3 &&
      balancedState.reason !== 'neutral_band';

    if (lowCoverage || (!weakestLabel && !strongestLabel)) {
      if (confidence === 'high') {
        return 'Score trends are clearer than shot-pattern detail right now. Logging fairways, greens, putts, and penalties will sharpen the long-term diagnosis.';
      }
      if (confidence === 'medium') {
        return 'Score trends are emerging, but shot-pattern detail is still limited. Logging fairways, greens, putts, and penalties will sharpen this read.';
      }
      return 'Score trends are forming, but shot-pattern detail is still light. A few more tracked rounds will sharpen this read.';
    }

    if (weakestLabel && weakestIsWeakness) {
      if (weakBalancedProfile) {
        if (moderateRelativeWeakness) {
          if (confidence === 'high') {
            return `${weakestLabel} is still your weakest relative area, even though your overall profile remains fairly balanced.`;
          }
          if (confidence === 'medium') {
            return `${weakestLabel} looks slightly weaker than the rest, though your overall profile is still fairly balanced.`;
          }
          return `${weakestLabel} may be a slight relative weakness, but this pattern is still early.`;
        }
        if (confidence === 'high') {
          return 'Your profile is balanced, so scoring ceiling gains will come from marginal improvements across multiple areas.';
        }
        if (confidence === 'medium') {
          return 'Your components are fairly balanced, so scores are moving from small round-to-round changes rather than one clear leak.';
        }
        return 'No single component clearly separates from the rest yet. Small gains across multiple areas can still move scoring.';
      }
      if (confidence === 'low') {
        return `${weakestLabel} may be quietly limiting scoring recently, but this pattern is still early.`;
      }
      if (confidence === 'medium') {
        if (args.isPremium && weakestValue != null && Number.isFinite(weakestValue) && weakestAbs != null && weakestAbs >= 0.3) {
          return `${weakestLabel} is emerging as the main area holding scores back. You're losing about ${formatOneDecimal(Math.abs(weakestValue))} strokes versus your recent baseline.`;
        }
        return `${weakestLabel} is emerging as the clearest area limiting recent scoring.`;
      }
      const effectivePersistenceTier = downgradePersistenceTierForWeakness({
        tier: persistenceTier,
        currentDelta: weakestValue,
        recoveringWeaknessThreshold: 0.3,
      });
      if (effectivePersistenceTier === 'persistent') {
        if (args.isPremium && weakestValue != null && Number.isFinite(weakestValue) && weakestAbs != null && weakestAbs >= 0.3) {
          return `${weakestLabel} has been the most persistent scoring weakness over recent rounds. You're losing about ${formatOneDecimal(Math.abs(weakestValue))} strokes versus your recent baseline.`;
        }
        return `${weakestLabel} has been the most persistent scoring weakness over recent rounds.`;
      }
      if (effectivePersistenceTier === 'emerging') {
        return `${weakestLabel} is emerging as the clearest scoring leak across recent rounds.`;
      }
      return `${weakestLabel} is the current weak spot, but it has not repeated enough to call it persistent.`;
    }

    if (strongestLabel && strongestValue != null && Number.isFinite(strongestValue) && strongestValue > 0.15) {
      if (strengthBalancedProfile) {
        if (confidence === 'high') {
          return 'Your profile is balanced, so scoring ceiling gains will come from marginal improvements across multiple areas.';
        }
        if (confidence === 'medium') {
          return 'Your components are fairly balanced, so scores are moving from small round-to-round changes rather than one clear leak.';
        }
        return 'No single component clearly separates from the rest yet. Small gains across multiple areas can still move scoring.';
      }
      if (confidence === 'low') {
        return `${strongestLabel} is helping your score recently, but this pattern is still early.`;
      }
      if (confidence === 'medium') {
        return `${strongestLabel} is helping your score and starting to show up as a reliable trend.`;
      }
      if (args.isPremium) {
        return `${strongestLabel} is helping your score and has become a stable long-term strength. You're gaining about ${formatOneDecimal(Math.abs(strongestValue))} strokes versus your usual level.`;
      }
      return `${strongestLabel} is helping your score and has become a stable long-term strength.`;
    }

    if (confidence === 'high') {
      return 'Your profile is balanced, so scoring ceiling gains will come from marginal improvements across multiple areas.';
    }
    if (confidence === 'medium') {
      return 'Your components are fairly balanced, so scores are moving from small round-to-round changes rather than one clear leak.';
    }
    return 'No single component clearly separates from the rest yet. Small gains across multiple areas can still move scoring.';
  })();

  const card2WithDirection = directionalQualifier
    ? `${card2} ${directionalQualifier}`
    : card2;

  const card3 = (() => {
    const stdDev = consistency.stdDev;
    if (volatilitySignal.severity === 'strong') {
      if (confidence === 'high') {
        if (volatilitySignal.hasCeilingFloorGap) {
          return 'Your scoring is inconsistent: the ceiling is strong, but the floor is still low. Volatility is the clearest long-term pattern affecting your averages.';
        }
        return 'Your scoring is inconsistent, and volatility is now the clearest long-term pattern affecting your averages.';
      }
      if (confidence === 'medium') {
        return 'Your scoring is inconsistent, and this volatility is becoming a meaningful pattern across recent rounds.';
      }
      return 'Your scoring is moving around more than usual. Keep logging rounds to confirm whether volatility is the main trend.';
    }

    if (volatilitySignal.severity === 'moderate') {
      if (confidence === 'high') {
        return 'Your scoring still has enough movement to cap average gains, even without extreme volatility.';
      }
      if (confidence === 'medium') {
        return 'Your scoring has moderate movement from round to round, and that is becoming part of the overall pattern.';
      }
      return 'Your scoring has some movement from round to round, and this pattern is still forming.';
    }

    if (stdDev != null && Number.isFinite(stdDev) && stdDev <= 1.5) {
      if (confidence === 'high') {
        return 'Your scoring is consistent, and that stability has become a reliable base for long-term improvement.';
      }
      if (confidence === 'medium') {
        return 'Your scoring is becoming more consistent, which gives your improvement a steadier base.';
      }
      return 'Your scoring is showing early signs of consistency, but this pattern is still forming.';
    }

    if (consistency.label === 'stable') {
      if (confidence === 'high') {
        return 'Your scoring is consistent, and that stability has become a reliable base for long-term improvement.';
      }
      if (confidence === 'medium') {
        return 'Your scoring is becoming more consistent, which gives your improvement a steadier base.';
      }
      return 'Your scoring is showing early signs of consistency, but this pattern is still forming.';
    }

    return 'Consistency signals are still forming. A few more rounds will clarify whether stability or volatility is your long-term trend.';
  })();

  return [card1, card2WithDirection, card3].map((card, index) => {
    assertOverallCopySafe(card, `overall_card_${index + 1}`);
    return card;
  });
}

export function computeOverallDataHash(rounds: OverallRoundPoint[], isPremium: boolean): string {
  return buildDataHash({ rounds, isPremium });
}

export function pickDeterministicDrillSeeded(
  area: SGComponentName | null,
  roundSeed: string,
): string {
  return deterministicDrill(area, roundSeed);
}

