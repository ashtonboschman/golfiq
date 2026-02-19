import crypto from 'crypto';
import { formatDate } from '@/lib/formatters';

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

export type OverallInsightsPayload = {
  generated_at: string;
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
  refresh: {
    manual_cooldown_hours: number;
  };
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

const DRILL_LIBRARY: Record<SGComponentName | 'general', string[]> = {
  off_tee: [
    'Fairway corridor: pick a fairway target and define a 25-yard corridor. Hit 12 drives with full routine. Score 2 for inside corridor, 1 for in-play outside, 0 for penalty. Goal: 18 points.',
    'Start-line gate: set a gate 3 feet in front of the ball using two tees. Hit 10 drives starting through the gate. Track left, through, right. Goal: 7 of 10 through the gate.',
    'Driver and 3-wood split: alternate driver and 3-wood to the same target line, 6 each. Treat any ball outside a 30-yard corridor as a miss. Goal: 9 of 12 inside corridor.',
    'Finish hold: hit 9 drives and hold your finish for 3 seconds each swing. Any balance break is a failed rep. Goal: 9 clean finishes.',
    'Safe-side miss: pick a miss side and a safe side. Hit 12 drives and require every miss to finish on the safe side. Goal: 10 of 12 safe-side outcomes.',
    'Tee height test: hit 3 drives low tee, 3 normal, 3 high. Choose the best strike pattern and hit 6 more at that height. Goal: no more than 2 penalty balls total.',
    'In-play pressure set: hit 3 drives in a row that finish in play. Repeat until you complete 4 sets. Any penalty resets the set. Goal: complete 4 clean sets.',
    'Intermediate target starts: pick a target and an intermediate target. Hit 10 drives focusing only on starting over the intermediate target. Goal: 8 of 10 starts on intended line.',
    'Tempo lock: hit 12 drives at 80 to 90 percent speed with full finish. Track in-play rate and strike quality. Goal: 10 of 12 in play with consistent contact.',
    'Two-ball fairway: hit two drives back-to-back. Both must be in play to win the set. Repeat 6 sets. Goal: 4 successful sets.',
  ],
  approach: [
    'Distance ladder: pick 3 targets spaced 10 yards apart with one club. Hit 3 balls to each target in random order. Score 2 inside 10 yards, 1 inside 20. Goal: 12 points.',
    'Center-green discipline: pick a middle target and hit 12 approach shots to center. Ignore flags. Score 1 for green, 2 for center third. Goal: 14 points.',
    'Front-edge carry: pick a target and set a front carry line. Hit 10 shots that must carry the line. Score 1 for carry, 2 for carry plus green. Goal: 14 points.',
    'Random wedge set: alternate 50, 70, and 90 yards for 12 shots with full routine. Track proximity. Goal: 8 of 12 finish inside 20 feet.',
    'Trajectory split: hit 6 stock shots and 6 lower-flight shots to the same target. Track start line and contact. Goal: 9 of 12 start within one flag width of line.',
    'Strike window: define a 12-yard circle around the target. Hit 10 shots and count balls inside. Goal: 5 inside the circle.',
    'Green section control: pick left, middle, and right sections. Hit 3 shots to each section. Misses must be pin-high or safer. Goal: no more than 2 short-side misses.',
    'One-miss restart: hit 10 approaches. If any shot starts more than one flag width off your intended line, restart the set. Goal: complete 10 clean starts.',
    'Wedge tempo lock: pick one wedge distance and hit 15 balls with identical finish length. Track dispersion. Goal: 10 of 15 inside a 25-foot circle.',
    'Long-iron safety: pick a conservative target and hit 10 long-iron shots. Score 1 for in-play, 2 for green. Goal: 12 points.',
  ],
  putting: [
    'Lag ladder: putt 10 balls from 25 to 40 feet. Any ball finishing outside 3 feet is a fail. Goal: 8 of 10 inside 3 feet.',
    'Start-line gate: place two tees just wider than the ball 12 inches in front. Hit 12 putts from 6 feet starting through the gate. Goal: 10 clean starts.',
    'Speed ladder: putt 10, 15, 20, 25, and 30 feet with two balls each. Track leave distance. Goal: 8 of 10 finish inside 3 feet.',
    'Three-foot lockdown: make 20 putts from 3 feet. Any miss resets to 0. Goal: reach 20.',
    'Circle drill: place 8 balls in a 4-foot circle. Allow one miss maximum. Goal: make 7 of 8.',
    'Stop-zone control: place a tee 18 inches past the hole. Roll 12 putts from 8 feet and stop between hole and tee. Goal: 10 of 12 in the zone.',
    'Clock drill: place 6 balls at 4 feet around the hole. Make all 6 to pass. Goal: 6 of 6.',
    'One-hand tempo: hit 6 putts from 4 feet lead-hand only, then 6 trail-hand only. Count makes. Goal: 8 makes total.',
    'Distance calibration: roll 10 balls to a fringe line and stop short. Any ball crossing the line is a fail. Goal: 8 of 10 stop short.',
    'Start-spot focus: choose a spot 12 inches ahead on the line. Hit 12 putts from 5 feet rolling over the spot. Goal: 10 of 12 over the spot.',
  ],
  penalties: [
    'Risk label rule: label every full swing as green, yellow, or red. Red swings require a conservative target and one more club. Goal: zero penalty strokes for the round.',
    'Trouble punch-out: when blocked or in trees, the only target is back to fairway. Track decisions over 10 holes. Goal: 10 of 10 correct punch-outs when required.',
    'Hazard buffer: when water or OB is in play, aim to the widest safe side and accept a longer next shot. Goal: zero penalty strokes from tee shots.',
    'Par-5 discipline: pick the layup yardage first, then plan backwards on every par 5. Avoid forced carries on second shots. Goal: zero penalty strokes and no forced carries.',
    'Two-shot plan: before each tee shot, choose the next-shot target as well and commit. Track red decisions over 9 holes. Goal: zero red decisions mid-hole.',
    'Club-down safety: on any hole with a penalty zone, take one less club and prioritize in-play. Track outcomes on those holes. Goal: zero penalties on penalty-zone holes.',
    'Miss-side rule: on approaches with short-side risk, aim to the safe side and accept longer putts. Goal: zero short-side recoveries that lead to doubles.',
    'Recovery scoring: treat a recovery as successful if the next shot is from fairway or a clean angle. Track 6 recoveries. Goal: 5 successful recoveries.',
    'Decision audit: after the round, label each penalty as decision or execution. Next round, apply a conservative target on every prior decision-penalty hole. Goal: eliminate repeat decision penalties.',
    'Layup habit: when reaching requires a perfect strike, lay up to a full wedge yardage. Track 6 opportunities. Goal: 6 conservative layups executed.',
  ],
  short_game: [
    'Up-and-down set: drop 9 balls around the green with mixed lies and play each to the hole. Count saves. Goal: 5 successful up-and-downs.',
    'Landing towel: place a towel 3 yards onto the green. Chip 15 balls landing on the towel. Goal: 7 of 15 land on towel.',
    'One-bounce release: hit 12 chips designed to land once and release. Track leave distance. Goal: 8 of 12 finish inside 6 feet.',
    'Lie ladder: play 4 balls each from tight, fringe, and rough. Track leave distance. Goal: 6 of 12 inside 6 feet.',
    'Single landing spot: pick one landing spot and hit 15 chips to it. Track landing accuracy. Goal: 9 of 15 land within one clubhead of the spot.',
    'Bump-and-run set: hit 12 bump-and-runs with an 8-iron from fringe. Track proximity. Goal: 8 of 12 inside 6 feet.',
    'Pitch window: hit 12 pitches to a 15-yard landing zone. Track carry accuracy. Goal: 8 of 12 carry within plus or minus 2 yards.',
    'One-club set: use one wedge for 18 reps from mixed lies. Track leave distance. Goal: 10 of 18 inside 6 feet.',
    'Fringe choice test: from the same spot, hit 6 fringe putts and 6 chips. Record average leave for each option. Goal: choose the better option for your next-round strategy.',
    'Pressure saves: place 10 balls around the green and play each to save par. Goal: 6 of 10 saves.',
  ],
  general: [
    'Routine lock: use the same pre-shot routine on every full swing for 18 holes. Track rushed swings. Goal: zero rushed swings and full commit on every shot.',
    'Center targets only: aim at center targets on every approach for 9 holes. Track short-side misses. Goal: zero short-side misses.',
    'Miss removal: identify your biggest miss and choose targets that remove it for 18 holes. Track penalties from that miss. Goal: zero penalty strokes from that miss.',
    'Accuracy scoring: pick a range target and hit 15 balls. Score 2 inside 10 yards, 1 inside 20. Goal: 18 points.',
    'Tempo block: hit 20 balls with identical finish length and a balanced hold. Track balance breaks. Goal: 18 balanced finishes.',
    'Par-3 rule: aim center-green on every par 3. Track greens and safe pin-high misses. Goal: hit 50 percent of greens or finish pin-high safe.',
    'Smart doubles: when out of position, play for bogey instead of forcing par. Track doubles from decision errors. Goal: zero doubles from decision errors.',
    'One stat goal: pick one stat goal for the round and write it down before teeing off. Review it after and log it. Goal: record the stat and outcome after the round.',
    'Green-light only: attack pins only on green-light numbers and send all others to center. Track forced carries. Goal: eliminate forced carries.',
    'Reset between shots: after every shot, take one full breath and re-commit to the next target. Track rushed next swings. Goal: zero back-to-back rushed shots.',
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

const CARD1_VARIANTS = {
  A: [
    'Scoring trend: Latest round {scoreCompact}. Baseline scoring context is not available in this mode yet.',
    'Scoring trend: Latest round {scoreCompact}. This mode does not have enough scoring history for baseline comparison.',
    'Scoring trend: Latest round {scoreCompact}. Recent and baseline averages are not available in this mode yet.',
    'Scoring trend: Latest round {scoreCompact}. More valid score history is required before trends can be evaluated.',
    'Scoring trend: Latest round {scoreCompact}. Baseline comparison unlocks after more scored rounds in this mode.',
    'Scoring trend: Latest round {scoreCompact}. Trend analysis activates once this mode has sufficient scoring history.',
    'Scoring trend: Latest round {scoreCompact}. This scoring read remains unavailable until more rounds are logged.',
    'Scoring trend: Latest round {scoreCompact}. Additional valid rounds are required to establish a baseline trend.',
    'Scoring trend: Latest round {scoreCompact}. This mode needs more complete scoring data before comparison is possible.',
    'Scoring trend: Latest round {scoreCompact}. Score context will populate once enough valid rounds exist in this mode.',
  ],

  B: [
    'Scoring trend: Latest round {scoreCompact}. Recent scoring is aligned with your baseline, indicating a stable scoring level.',
    'Scoring trend: Latest round {scoreCompact}. Recent rounds are holding at your normal scoring level, reflecting performance stability.',
    'Scoring trend: Latest round {scoreCompact}. Scoring pace is consistent with baseline, suggesting a steady stretch.',
    'Scoring trend: Latest round {scoreCompact}. Baseline comparison shows no meaningful shift in scoring level.',
    'Scoring trend: Latest round {scoreCompact}. Your scoring profile remains steady relative to baseline.',
    'Scoring trend: Latest round {scoreCompact}. Recent scoring matches baseline, reinforcing a stable performance band.',
    'Scoring trend: Latest round {scoreCompact}. Current results reflect your established scoring level.',
    'Scoring trend: Latest round {scoreCompact}. Scoring trend is holding near baseline without material deviation.',
    'Scoring trend: Latest round {scoreCompact}. This stretch mirrors your long-term scoring average.',
    'Scoring trend: Latest round {scoreCompact}. Performance is tracking consistently with baseline expectations.',
  ],

  C: [
    'Scoring trend: Latest round {scoreCompact}. Recent scoring is {delta} strokes better than baseline, marking measurable improvement in this stretch.',
    'Scoring trend: Latest round {scoreCompact}. This recent window is outperforming baseline by {delta} strokes, signaling upward movement.',
    'Scoring trend: Latest round {scoreCompact}. Recent rounds are {delta} strokes lower than baseline, reflecting stronger-than-normal scoring.',
    'Scoring trend: Latest round {scoreCompact}. Baseline comparison shows a {delta}-stroke scoring gain, indicating positive momentum.',
    'Scoring trend: Latest round {scoreCompact}. Your scoring trend is {delta} strokes stronger than baseline, establishing a higher current level.',
    'Scoring trend: Latest round {scoreCompact}. Recent performance is producing a {delta}-stroke edge over baseline, reinforcing improvement.',
    'Scoring trend: Latest round {scoreCompact}. Scoring has shifted positively by {delta} strokes versus baseline, showing upward movement.',
    'Scoring trend: Latest round {scoreCompact}. This stretch represents a {delta}-stroke scoring advance relative to baseline.',
    'Scoring trend: Latest round {scoreCompact}. Recent results are exceeding baseline by {delta} strokes, strengthening your current profile.',
    'Scoring trend: Latest round {scoreCompact}. This recent window reflects a {delta}-stroke improvement compared to baseline.',
  ],
 
  D: [
    'Scoring trend: Latest round {scoreCompact}. Recent scoring is {delta} strokes above baseline, indicating regression versus your normal level.',
    'Scoring trend: Latest round {scoreCompact}. This recent window is trailing baseline by {delta} strokes, signaling downward movement.',
    'Scoring trend: Latest round {scoreCompact}. Recent rounds are {delta} strokes higher than baseline, reflecting a softer scoring stretch.',
    'Scoring trend: Latest round {scoreCompact}. Baseline comparison shows a {delta}-stroke scoring drop, indicating a weaker phase.',
    'Scoring trend: Latest round {scoreCompact}. Your scoring trend is {delta} strokes behind baseline, marking measurable decline.',
    'Scoring trend: Latest round {scoreCompact}. Scoring has shifted negatively by {delta} strokes versus baseline, reflecting regression.',
    'Scoring trend: Latest round {scoreCompact}. Recent performance is producing a {delta}-stroke deficit relative to baseline.',
    'Scoring trend: Latest round {scoreCompact}. This stretch is running {delta} strokes above your established scoring level.',
    'Scoring trend: Latest round {scoreCompact}. Recent results are {delta} strokes worse than baseline, signaling performance dip.',
    'Scoring trend: Latest round {scoreCompact}. This recent window represents a {delta}-stroke downturn compared to baseline.',
  ],

  E: [
    'Scoring trend: No {modeLabel} rounds logged yet in this view. Scoring context is not available.',
    'Scoring trend: Add {modeLabel} rounds to unlock baseline comparison in this mode.',
    'Scoring trend: This mode has no round history yet. Log {modeLabel} rounds to activate scoring context.',
    'Scoring trend: Scoring movement cannot be evaluated until {modeLabel} rounds are logged.',
    'Scoring trend: Baseline comparison requires {modeLabel} rounds in this view.',
    'Scoring trend: No mode-specific rounds exist yet. Log {modeLabel} rounds to establish trend.',
    'Scoring trend: This mode requires round history before scoring trend can be calculated.',
    'Scoring trend: Add {modeLabel} rounds to build a scoring trend in this view.',
    'Scoring trend: Trend analysis is unavailable until {modeLabel} rounds are present.',
    'Scoring trend: This view activates scoring context after {modeLabel} rounds are logged.',
  ],
} as const;

const CARD2_VARIANTS = {
  A: [
    'Strength: Not enough tracked detail yet to name one clear strength.',
    'Strength: More complete stat coverage is needed before one area clearly leads.',
    'Strength: Keep tracking full stats so separation across areas becomes clearer.',
    'Strength: Additional tracked rounds are required before confirming a top area.',
    'Strength: This call needs stronger coverage before it can be treated as reliable.',
    'Strength: With more complete tracking, a consistent leader will emerge.',
    'Strength: The current sample is too thin to isolate a dependable strength.',
    'Strength: More consistent stat logging will clarify your strongest component.',
    'Strength: Broader coverage is needed before one area stands apart.',
    'Strength: Add full stat tracking so the leading area is supported by stronger evidence.',
  ],

  B: [
    'Strength: {label} is your clearest edge at +{delta} strokes versus baseline, driving your strongest positive shift in this stretch.',
    'Strength: {label} is up +{delta} strokes versus baseline, marking your biggest measured improvement right now.',
    'Strength: {label} has improved by +{delta} strokes versus baseline, supporting your best recent scoring trend.',
    'Strength: {label} is delivering a +{delta}-stroke gain versus baseline, establishing it as your top positive signal in this window.',
    'Strength: {label} is +{delta} strokes better than baseline, reinforcing it as the strongest recent driver.',
    'Strength: {label} is showing a +{delta}-stroke lift versus baseline, indicating real progress in this area.',
    'Strength: {label} is trending +{delta} strokes versus baseline, providing your most meaningful upward movement.',
    'Strength: {label} is +{delta} strokes stronger than baseline, creating a clear positive tilt in this sample.',
    'Strength: {label} is up +{delta} strokes versus baseline, standing out as the clearest strength signal right now.',
    'Strength: {label} is producing a +{delta}-stroke advantage versus baseline, setting the direction for this stretch.',
  ],

  C: [
    'Strength: {label} is currently leading, though separation across components remains tight.',
    'Strength: {label} holds a narrow advantage over the rest.',
    'Strength: {label} sits first, with minimal distance between areas.',
    'Strength: {label} leads the group, but the margin is modest.',
    'Strength: {label} is ahead for now, without clear dominance.',
    'Strength: {label} ranks highest, though the spread remains compact.',
    'Strength: {label} is the narrow leader in a closely grouped set.',
    'Strength: {label} is first in line, with limited separation overall.',
    'Strength: {label} edges out the others in a tight field.',
    'Strength: {label} leads slightly, with performance levels clustered.',
  ],

  D: [
    'Strength: {label} is the current leader, though based on limited recent coverage.',
    'Strength: {label} is showing early strength within a small sample.',
    'Strength: {label} leads so far, with additional rounds needed for confirmation.',
    'Strength: {label} ranks first in early tracking, pending broader validation.',
    'Strength: {label} is on top in this sample, though coverage remains light.',
    'Strength: {label} is the early signal, with more data needed to confirm stability.',
    'Strength: {label} sits first at this stage, supported by limited rounds.',
    'Strength: {label} is leading in the current window, awaiting deeper coverage.',
    'Strength: {label} holds the top spot so far, within a thin dataset.',
    'Strength: {label} is ahead at this stage, with more tracking required to solidify it.',
  ],

  E: [
    'Strength: {label} is holding up best, even though overall results remain negative.',
    'Strength: {label} is the most resilient area in this stretch.',
    'Strength: {label} is performing strongest relative to the rest, despite trending below neutral.',
    'Strength: {label} is limiting losses better than the other components.',
    'Strength: {label} is the steadiest area during a difficult run.',
    'Strength: {label} is maintaining the highest level among the measured areas.',
    'Strength: {label} is the most stable component in this sample.',
    'Strength: {label} stands out as the strongest relative performer, even in a negative phase.',
    'Strength: {label} is showing the best relative control across components.',
    'Strength: {label} is the strongest area available in a challenging stretch.',
  ],
} as const;

const CARD3_VARIANTS = {
  A: [
    'Opportunity: Not enough tracked detail yet to name one clear next focus.',
    'Opportunity: More complete stat coverage is needed before isolating the top improvement area.',
    'Opportunity: Keep tracking full stats so the next priority separates more clearly.',
    'Opportunity: Additional tracked rounds are required before confirming a primary focus.',
    'Opportunity: This call needs stronger coverage before it can be treated as reliable.',
    'Opportunity: With broader stat tracking, the clearest improvement path will emerge.',
    'Opportunity: The current sample is too thin to isolate a dependable focus area.',
    'Opportunity: More consistent stat logging will clarify the next priority.',
    'Opportunity: Broader coverage is needed before one area stands apart as the main opportunity.',
    'Opportunity: Add full stat tracking so the next focus is supported by stronger evidence.',
  ],

  B: [
    'Opportunity: {label} is -{delta} strokes versus baseline, marking the clearest area for improvement in this stretch.',
    'Opportunity: {label} is trending -{delta} strokes versus baseline, creating the strongest downward pressure on scoring.',
    'Opportunity: {label} is -{delta} strokes below baseline, defining the primary improvement target right now.',
    'Opportunity: {label} is showing a -{delta}-stroke drop versus baseline, making it the first area to address.',
    'Opportunity: {label} is underperforming baseline by -{delta} strokes, setting the top priority in this window.',
    'Opportunity: {label} is -{delta} strokes versus baseline, representing the most meaningful gap in this sample.',
    'Opportunity: {label} has declined by -{delta} strokes versus baseline, positioning it as the main focus.',
    'Opportunity: {label} is running -{delta} strokes relative to baseline, creating the clearest opportunity for gains.',
    'Opportunity: {label} is -{delta} strokes off baseline, offering the most direct path to scoring improvement.',
    'Opportunity: {label} is producing a -{delta}-stroke deficit versus baseline, defining the priority area in this stretch.',
  ],

  C: [
    'Opportunity: {label} ranks lowest, though separation across components remains tight.',
    'Opportunity: {label} sits slightly behind the others, without a major performance gap.',
    'Opportunity: {label} is currently last, though the spread remains compact.',
    'Opportunity: {label} trails modestly, making it the next logical focus.',
    'Opportunity: {label} is behind the group, though margins remain small.',
    'Opportunity: {label} ranks lowest in a closely clustered set.',
    'Opportunity: {label} sits last, though without clear underperformance.',
    'Opportunity: {label} is the next area to refine in an otherwise balanced sample.',
    'Opportunity: {label} is slightly below the others, suggesting incremental upside.',
    'Opportunity: {label} is the cleanest next focus in a tightly grouped sample.',
  ],

  D: [
    'Opportunity: {label} is the current priority, though based on limited recent coverage.',
    'Opportunity: {label} ranks lowest in early tracking, with more rounds needed for confirmation.',
    'Opportunity: {label} is the tentative focus, pending broader validation.',
    'Opportunity: {label} sits last in this small sample, though coverage remains light.',
    'Opportunity: {label} is the early improvement signal, with additional rounds needed to confirm stability.',
    'Opportunity: {label} is currently lowest, though based on limited tracked data.',
    'Opportunity: {label} trails in early coverage, requiring more rounds to solidify the read.',
    'Opportunity: {label} is the likely next focus at this stage, pending stronger evidence.',
    'Opportunity: {label} ranks last so far, with additional tracking needed to confirm the priority.',
    'Opportunity: {label} is the early lowest component, though the dataset remains thin.',
  ],

  E: [
    'Opportunity: {label} ranks lowest so far, though separation across areas is tight.',
    'Opportunity: {label} sits last in a closely grouped sample.',
    'Opportunity: {label} is currently lowest, though margins remain narrow.',
    'Opportunity: {label} trails slightly within a tightly clustered set.',
    'Opportunity: {label} is bottom-ranked so far, though without strong separation.',
    'Opportunity: {label} ranks last in early data, with only modest differences.',
    'Opportunity: {label} is currently lowest, though the spread remains compact.',
    'Opportunity: {label} sits at the bottom of a narrow grouping.',
    'Opportunity: {label} is lowest in this sample, though differences remain small.',
    'Opportunity: {label} is bottom-ranked so far in a tightly grouped window.',
  ],
} as const;

const CARD4_VARIANTS = {
  A: [
    'Priority first: Track {missingList} every round so the plan is grounded in complete round data.',
    'Priority first: Log {missingList} each round so recommendations reflect what actually happened on course.',
    'Priority first: Add {missingList} to tighten the next recommendation.',
    'Priority first: Record {missingList} so strengths and priorities separate more clearly.',
    'Priority first: Track {missingList} consistently so your practice target stays accurate.',
    'Priority first: Log {missingList} so the top priority is backed by stronger evidence.',
    'Priority first: Capture {missingList} each round so guidance stays precise.',
    'Priority first: Add {missingList} so the next focus is based on complete stats.',
    'Priority first: Track {missingList} to reduce guesswork and sharpen takeaways.',
    'Priority first: Log {missingList} every round so the next drill fits your trends better.',
  ],
  B: [
    'Priority first: {drill}',
    'Priority first: {drill}',
    'Priority first: {drill}',
    'Priority first: {drill}',
    'Priority first: {drill}',
    'Priority first: {drill}',
    'Priority first: {drill}',
    'Priority first: {drill}',
    'Priority first: {drill}',
    'Priority first: {drill}',
  ],
  C: [
    'Priority first: {drillInline}, then track {missingList} each round so the next call is tighter.',
    'Priority first: {drillInline}, and log {missingList} so future guidance stays precise.',
    'Priority first: {drillInline}, then record {missingList} to strengthen the next recommendation.',
    'Priority first: {drillInline}, and add {missingList} so the next focus is more specific.',
    'Priority first: {drillInline}, then track {missingList} to sharpen what comes next.',
    'Priority first: {drillInline}, and log {missingList} so strengths and priorities separate more clearly.',
    'Priority first: {drillInline}, then capture {missingList} so future reads are more reliable.',
    'Priority first: {drillInline}, and keep {missingList} tracked so the plan stays accurate.',
    'Priority first: {drillInline}, then log {missingList} to reduce noise in the next cycle.',
    'Priority first: {drillInline}, with {missingList} tracked each round for better precision.',
  ],
} as const;

const CARD5_VARIANTS_BY_OPPORTUNITY: Record<
  'off_tee' | 'approach' | 'putting' | 'penalties' | 'general',
  readonly string[]
> = {
  off_tee: [
    'On-course strategy: Pick the tee line that removes the penalty side, even if it leaves a longer approach.',
    'On-course strategy: Start every tee shot with a safe-side miss plan, then aim accordingly.',
    'On-course strategy: Favor the widest landing area off the tee and let distance be secondary.',
    'On-course strategy: Choose a conservative target, then commit to a start line that keeps trouble out.',
    'On-course strategy: When hazard is in play, aim away from it and treat the safe side as success.',
    'On-course strategy: Use a fairway corridor target and play for center, not perfect.',
    'On-course strategy: If the hole is tight, club down and prioritize a playable second shot.',
    'On-course strategy: Pick an intermediate target and judge the start line, not the result.',
    'On-course strategy: When your miss is one-sided, set the target so that miss finishes safe.',
    'On-course strategy: Make "no doubles from the tee" the rule and choose lines that keep you in position.',
  ],
  approach: [
    'On-course strategy: Default to center-green unless you have a clear scoring number and a safe miss.',
    'On-course strategy: Choose the biggest green section and aim there, not at flags.',
    'On-course strategy: Remove short-siding by aiming to the safe side of the pin every time.',
    'On-course strategy: When distance is uncertain, take more club and play for the middle.',
    'On-course strategy: If the miss is trouble, aim to the opposite side and accept the longer putt.',
    'On-course strategy: Treat pin-hunting as a bonus. Center targets are the baseline.',
    'On-course strategy: Prioritize the good miss side and make that your default target line.',
    'On-course strategy: Play to the widest part of the green and keep misses in simple recovery zones.',
    'On-course strategy: On approach shots, pick a conservative landing zone and commit to that window.',
    'On-course strategy: When you are between clubs, choose the safer carry and take the middle target.',
  ],
  putting: [
    'On-course strategy: On long putts, pick a finish zone and roll everything to that pace.',
    'On-course strategy: Outside make range, speed is the priority. Leave yourself a stress-free second putt.',
    'On-course strategy: Treat every putt over 20 feet as a lag. Pace first, line second.',
    'On-course strategy: Choose a leave distance goal inside 3 feet and judge every putt by it.',
    'On-course strategy: On breaking putts, pick a start line and match pace to keep the second putt short.',
    'On-course strategy: When you are unsure on line, bias toward speed control and avoid the 3-putt.',
    'On-course strategy: Aim to finish every lag putt inside a tight circle, then clean up.',
    'On-course strategy: Commit to one pace decision per putt, firm enough to hold line and soft enough to stay close.',
    'On-course strategy: Make "no three-putts" the round rule. Pace decisions come before read details.',
    'On-course strategy: On fast greens, play to die the ball at the hole and protect the comeback putt.',
  ],
  penalties: [
    'On-course strategy: When trouble is in play, choose the target that removes the penalty option entirely.',
    'On-course strategy: Make the wide target the default near OB or water. Position over distance.',
    'On-course strategy: If the shot requires a perfect strike, switch to the conservative play immediately.',
    'On-course strategy: In recovery, advance to safety first and do not force hero lines through gaps.',
    'On-course strategy: On risk holes, plan the next shot first, then choose the tee target that supports it.',
    'On-course strategy: When hazards exist, play away from them and commit to the safe side start line.',
    'On-course strategy: Use green, yellow, red decisions. Red shots always get the conservative target.',
    'On-course strategy: If your miss brings penalty into play, club down and play the wide lane.',
    'On-course strategy: Treat bogey as the ceiling from trouble. Reset the hole with the simple shot.',
    'On-course strategy: Keep the ball playable as the only KPI on penalty holes.',
  ],
  general: [
    'On-course strategy: Pick one conservative target rule and apply it on every full swing.',
    'On-course strategy: Choose center targets and remove the biggest miss from play.',
    'On-course strategy: Make position the priority and play to the widest safe areas all round.',
    'On-course strategy: Use the same routine and the same conservative target bias on every hole.',
    'On-course strategy: When you are unsure, aim to the middle and keep outcomes simple.',
    'On-course strategy: Choose the safe side, then commit fully to that plan.',
    'On-course strategy: Avoid high-risk targets. Repeat the boring play and let scoring follow.',
    'On-course strategy: Keep decisions simple, wide targets, clean angles, no forced carries.',
    'On-course strategy: Protect the scorecard by removing doubles. Conservative targets win.',
    'On-course strategy: Apply one safe target rule for every hole and stick to it.',
  ],
};

const CARD6_VARIANTS = {
  A: [
    'Projection: Trajectory is {traj}. Upgrade to unlock projected score and handicap ranges.',
    'Projection: Current trajectory is {traj}. Upgrade to view projected ranges by mode.',
    'Projection: Trajectory is {traj}. Upgrade to unlock projected scoring and handicap targets.',
    'Projection: Trajectory is {traj}. Upgrade to see your projected score band over the next ~10 rounds.',
    'Projection: Trajectory is {traj}. Upgrade to unlock full projection detail.',
    'Projection: Trajectory is {traj}. Upgrade to view your score and handicap outlook.',
    'Projection: Trajectory is {traj}. Upgrade to unlock projection ranges and mode targets.',
    'Projection: Trajectory is {traj}. Upgrade to see your forward scoring outlook.',
    'Projection: Trajectory is {traj}. Upgrade to unlock full score and handicap projection context.',
    'Projection: Trajectory is {traj}. Upgrade to unlock complete projection insights.',
  ],
  B: [
    'Projection: At this pace, expect about {score} over the next ~10 rounds, with handicap near {hcp}.',
    'Projection: Current trend projects about {score} in ~10 rounds, with handicap near {hcp}.',
    'Projection: Pace projects about {score} over ~10 rounds, with handicap near {hcp}.',
    'Projection: Projection target is about {score} in ~10 rounds, with handicap around {hcp}.',
    'Projection: Next ~10 rounds project near {score}, with handicap near {hcp}.',
    'Projection: Current path points to about {score} over ~10 rounds, with handicap near {hcp}.',
    'Projection: Scoring projection is about {score} in ~10 rounds, with handicap near {hcp}.',
    'Projection: Trend projects about {score} over the next ~10 rounds, with handicap near {hcp}.',
    'Projection: Target pace is about {score} in ~10 rounds, with handicap near {hcp}.',
    'Projection: Current projection is about {score} over ~10 rounds, with handicap near {hcp}.',
  ],
  C: [
    'Projection: Trajectory is {traj}. Log 10 rounds to unlock projected ranges.',
    'Projection: Trajectory is {traj}. Log more rounds to unlock score and handicap projections.',
    'Projection: Trajectory is {traj}. Reach 10 rounds to activate projected targets.',
    'Projection: Trajectory is {traj}. Keep logging to unlock projection bands.',
    'Projection: Trajectory is {traj}. Add rounds to unlock mode-specific score projections.',
    'Projection: Trajectory is {traj}. Log more handicap history to unlock the handicap projection.',
    'Projection: Trajectory is {traj}. Build to 10 rounds for full projection context.',
    'Projection: Trajectory is {traj}. More rounds are needed to unlock projected ranges.',
    'Projection: Trajectory is {traj}. Keep logging rounds to unlock projection detail.',
    'Projection: Trajectory is {traj}. Log 10 rounds to enable score and handicap ranges.',
  ],
  D: [
    'Projection: Score projection is ready at about {score} over the next ~10 rounds. Handicap projection needs more handicap history.',
    'Projection: Projected score is about {score} in ~10 rounds. Add more handicap history to unlock the handicap projection.',
    'Projection: Score outlook is about {score} in ~10 rounds. Handicap projection needs a longer handicap trend.',
    'Projection: Projected score is near {score} over ~10 rounds. Handicap projection unlocks after more handicap history.',
    'Projection: Score projection is available at about {score}. Handicap projection needs more tracked handicap rounds.',
  ],
} as const;

function sanitizeCopy(text: string): string {
  return String(text ?? '')
    .replace(/\s+([.,!?;:])/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();
}

function inlineSentence(text: string): string {
  return sanitizeCopy(String(text ?? '').replace(/[.!?]+$/g, ''));
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

function renderTemplate(template: string, replacements: Record<string, string>): string {
  let output = template;
  for (const [key, value] of Object.entries(replacements)) {
    output = output.replace(new RegExp(`\\{${key}\\}`, 'g'), value);
  }
  return sanitizeCopy(output);
}

function pickVariantFromPool(
  pool: readonly string[],
  variantSeedBase: string,
  namespace: string,
  variantOffset: number,
): { text: string; index: number } {
  const safeOffset = Number.isFinite(variantOffset) ? Math.max(0, Math.floor(variantOffset)) : 0;
  const hash = crypto
    .createHash('sha256')
    .update(`${variantSeedBase}|${namespace}`)
    .digest('hex');
  const baseIndex = parseInt(hash.slice(0, 8), 16) % pool.length;
  const index = (baseIndex + safeOffset) % pool.length;
  return { text: pool[index], index };
}

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
  const hasHandicapOverride = currentHandicapOverride !== undefined;
  const handicapCurrent = hasHandicapOverride
    ? (currentHandicapOverride != null && Number.isFinite(currentHandicapOverride) ? currentHandicapOverride : null)
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
  const projectedHandicapIn10 =
    handicapCurrent != null && handicapTrendWindow.length >= HANDICAP_MIN_HISTORY_FOR_PROJECTION
      ? round1(handicapCurrent + handicapTrendShift)
      : null;

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

function deterministicDrill(area: SGComponentName | null, seed: string, rotationOffset = 0): string {
  const key = area ?? 'general';
  const list = DRILL_LIBRARY[key] ?? DRILL_LIBRARY.general;
  const h = crypto.createHash('sha256').update(seed).digest('hex');
  const baseIndex = parseInt(h.slice(0, 8), 16) % list.length;
  const safeOffset = Number.isFinite(rotationOffset) ? Math.max(0, Math.floor(rotationOffset)) : 0;
  const idx = (baseIndex + safeOffset) % list.length;
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

  const payload: OverallInsightsPayload = {
    generated_at: new Date().toISOString(),
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
    cards_locked_count: Math.max(0, args.cards.length - 1),
    refresh: {
      manual_cooldown_hours: 0,
    },
    mode_payload: modePayload,
    handicap_trend: {
      labels: handicapPoints.map((p) => p.label),
      handicap: handicapPoints.map((p) => p.value),
    },
  };

  return payload;
}

function formatMissingStatsList(missing: { fir: boolean; gir: boolean; putts: boolean; penalties: boolean }): string {
  const missingLabels = [
    missing.fir ? 'FIR' : null,
    missing.gir ? 'GIR' : null,
    missing.putts ? 'putts' : null,
    missing.penalties ? 'penalties' : null,
  ].filter((item): item is string => item != null);
  if (!missingLabels.length) return 'FIR, GIR, putts, and penalties';
  if (missingLabels.length === 1) return missingLabels[0];
  if (missingLabels.length === 2) return `${missingLabels[0]} and ${missingLabels[1]}`;
  return `${missingLabels.slice(0, -1).join(', ')}, and ${missingLabels[missingLabels.length - 1]}`;
}

function formatTrajectoryLabel(trajectory: ProjectionPayload['trajectory']): string {
  if (trajectory === 'improving') return 'improving';
  if (trajectory === 'flat') return 'flat';
  if (trajectory === 'worsening') return 'worsening';
  if (trajectory === 'volatile') return 'volatile';
  return 'not available';
}

export function buildDeterministicOverallCards(args: {
  payload: OverallInsightsPayload;
  recommendedDrill: string;
  missingStats: { fir: boolean; gir: boolean; putts: boolean; penalties: boolean };
  isPremium: boolean;
  variantSeedBase: string;
  variantOffset: number;
  mode?: StatsMode;
}): string[] {
  const analysis = args.payload.analysis;
  const mode = args.mode ?? 'combined';
  const modePayload = args.payload.mode_payload?.[mode];
  const narrative = modePayload?.narrative ?? {
    strength: analysis.strength,
    opportunity: analysis.opportunity,
  };
  const projection = args.payload.projection;
  const projectionByMode = args.payload.projection_by_mode?.[mode] ?? null;
  const missingCount =
    Number(args.missingStats.fir) +
    Number(args.missingStats.gir) +
    Number(args.missingStats.putts) +
    Number(args.missingStats.penalties);
  const missingList = formatMissingStatsList(args.missingStats);
  const variantOffset = Number.isFinite(args.variantOffset) ? Math.floor(args.variantOffset) : 0;
  const baseSeed = args.variantSeedBase || 'overall';

  const choose = (
    namespace: string,
    outcome: string,
    pool: readonly string[],
    replacements: Record<string, string>,
  ): string => {
    const picked = pickVariantFromPool(pool, baseSeed, `${namespace}|${outcome}`, variantOffset);
    const rendered = renderTemplate(picked.text, replacements);
    assertOverallCopySafe(rendered, `${namespace}:${outcome}:${picked.index}`);
    return rendered;
  };

  const formatOneDecimal = (value: number): string => (Math.round(value * 10) / 10).toFixed(1);
  const scoreNearThreshold = mode === '9' ? 0.5 : 1.0;
  const modeLabel = mode === '9' ? '9-hole' : mode === '18' ? '18-hole' : 'combined';
  const modeRoundsRecent = modePayload?.kpis.roundsRecent ?? 0;
  const scoreCompact = modePayload?.kpis.scoreCompact ?? analysis.score_compact;
  const scoreRecent = modePayload?.kpis.avgScoreRecent ?? analysis.avg_score_recent;
  const scoreBaseline = modePayload?.kpis.avgScoreBaseline ?? analysis.avg_score_baseline;

  const scoreSummary = (() => {
    if (modeRoundsRecent === 0) {
      return choose('card1', '1E', CARD1_VARIANTS.E, {
        modeLabel,
      });
    }
    const recent = scoreRecent;
    const baseline = scoreBaseline;
    if (recent == null || baseline == null) {
      return choose('card1', '1A', CARD1_VARIANTS.A, {
        scoreCompact,
      });
    }
    const delta = recent - baseline;
    if (Math.abs(delta) <= scoreNearThreshold) {
      return choose('card1', '1B', CARD1_VARIANTS.B, {
        scoreCompact,
      });
    }
    if (delta < 0) {
      return choose('card1', '1C', CARD1_VARIANTS.C, {
        scoreCompact,
        delta: formatOneDecimal(Math.abs(delta)),
      });
    }
    return choose('card1', '1D', CARD1_VARIANTS.D, {
      scoreCompact,
      delta: formatOneDecimal(delta),
    });
  })();

  const strength = (() => {
    if (!narrative.strength.label) {
      return choose('card2', '2A', CARD2_VARIANTS.A, {});
    }
    if (narrative.strength.lowCoverage) {
      return choose('card2', '2D', CARD2_VARIANTS.D, { label: narrative.strength.label });
    }
    if (narrative.strength.value != null && narrative.strength.value < 0) {
      return choose('card2', '2E', CARD2_VARIANTS.E, { label: narrative.strength.label });
    }
    if (narrative.strength.value != null && narrative.strength.value >= 0.5) {
      return choose('card2', '2B', CARD2_VARIANTS.B, {
        label: narrative.strength.label,
        delta: formatOneDecimal(Math.abs(narrative.strength.value)),
      });
    }
    return choose('card2', '2C', CARD2_VARIANTS.C, { label: narrative.strength.label });
  })();


  const opportunity = (() => {
    if (!narrative.opportunity.label) {
      return choose('card3', '3A', CARD3_VARIANTS.A, {});
    }
    if (narrative.opportunity.lowCoverage) {
      if (narrative.opportunity.isWeakness) {
        return choose('card3', '3D', CARD3_VARIANTS.D, { label: narrative.opportunity.label });
      }
      return choose('card3', '3E', CARD3_VARIANTS.E, { label: narrative.opportunity.label });
    }
    if (narrative.opportunity.isWeakness) {
      return choose('card3', '3B', CARD3_VARIANTS.B, {
        label: narrative.opportunity.label,
        delta:
          narrative.opportunity.value != null
            ? formatOneDecimal(Math.abs(narrative.opportunity.value))
            : '0.0',
      });
    }
    return choose('card3', '3C', CARD3_VARIANTS.C, { label: narrative.opportunity.label });
  })();

  const card4 = (() => {
    if (missingCount >= 3) {
      return choose('card4', '4A', CARD4_VARIANTS.A, {
        missingList,
      });
    }
    if (missingCount >= 1) {
      return choose('card4', '4C', CARD4_VARIANTS.C, {
        drillInline: inlineSentence(args.recommendedDrill),
        missingList,
      });
    }
    return choose('card4', '4B', CARD4_VARIANTS.B, {
      drill: sanitizeCopy(args.recommendedDrill),
    });
  })();

  const card5 = (() => {
    const opportunityKey =
      narrative.opportunity.name === 'off_tee' ||
      narrative.opportunity.name === 'approach' ||
      narrative.opportunity.name === 'putting' ||
      narrative.opportunity.name === 'penalties'
        ? narrative.opportunity.name
        : 'general';

    const base = choose('card5', `5${opportunityKey}`, CARD5_VARIANTS_BY_OPPORTUNITY[opportunityKey], {});

    // Avoid repetition: Card 4 owns the tracking-first nudge when lots is missing.
    if (missingCount === 0) return base;
    if (missingCount >= 3) return base;

    return sanitizeCopy(`${base} Tracking ${missingList} will make this more targeted.`);
  })();

  const card6 = (() => {
    const trajectory = formatTrajectoryLabel(projectionByMode?.trajectory ?? projection.trajectory);

    if (!args.isPremium) {
      return choose('card6', '6A', CARD6_VARIANTS.A, { traj: trajectory });
    }

    const projectedScoreForMode = projectionByMode?.projectedScoreIn10 ?? null;
    const projectedHandicap = projection.projectedHandicapIn10;

    if (projectedScoreForMode != null && projectedHandicap != null) {
      return choose('card6', '6B', CARD6_VARIANTS.B, {
        score: `${Math.round(projectedScoreForMode)}`,
        hcp: formatOneDecimal(projectedHandicap),
      });
    }

    // Partial unlock: score projection available, handicap projection not available.
    if (projectedScoreForMode != null && projectedHandicap == null) {
      return choose('card6', '6D', CARD6_VARIANTS.D, {
        score: `${Math.round(projectedScoreForMode)}`,
      });
    }

    return choose('card6', '6C', CARD6_VARIANTS.C, { traj: trajectory });
  })();

  return [scoreSummary, strength, opportunity, card4, card5, card6];
}

export function computeOverallDataHash(rounds: OverallRoundPoint[], isPremium: boolean): string {
  return buildDataHash({ rounds, isPremium });
}

export function pickDeterministicDrillSeeded(
  area: SGComponentName | null,
  roundSeed: string,
  variantOffset = 0,
): string {
  return deterministicDrill(area, roundSeed, variantOffset);
}
