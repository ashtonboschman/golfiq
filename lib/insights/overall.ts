import crypto from 'crypto';
import { formatDate } from '@/lib/formatters';

export type StatsMode = 'combined' | '9' | '18';
export type PerformanceBand = 'tough' | 'below' | 'expected' | 'above' | 'great' | 'unknown';
export type SGComponentName = 'off_tee' | 'approach' | 'putting' | 'penalties' | 'short_game';
export type SGCostlyComponent = 'offTee' | 'approach' | 'putting' | 'penalties' | 'residual';
export const OVERALL_SG_MIN_RECENT_COVERAGE = 3;
export const OVERALL_SG_MIN_RECENT_COVERAGE_FOR_SELECTION = 1;

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

const DRILL_LIBRARY: Record<SGComponentName | 'general', string[]> = {
  off_tee: [
    'Pick a fairway target and define a 25-yard corridor. Hit 12 drives with full routine. Score 2 points for inside corridor, 1 for in-play outside corridor, 0 for penalty. Goal: 18 points.',
    'Set a start-line gate 3 feet in front of the ball using two tees. Hit 10 drives starting through the gate. Track: left, through, right. Goal: 7 through the gate.',
    'Alternate driver and 3-wood to the same target line, 6 each. Treat any ball outside a 30-yard corridor as a miss. Goal: 9 of 12 inside corridor.',
    'Hit 9 drives and hold your finish for 3 seconds on every swing. Any balance break is a rep failure. Goal: 9 clean finishes.',
    'Pick a miss side and a safe side. Hit 12 drives and require every miss to finish on the safe side. Goal: 10 of 12 safe-side outcomes.',
    'Tee height test: hit 3 drives low tee, 3 normal, 3 high. Choose the best contact pattern and hit 6 more at that height. Goal: no more than 2 penalty balls total.',
    'Fairway pressure set: hit 3 drives in a row that finish in play. Repeat until completed 4 times. Any penalty resets the set. Goal: complete 4 clean sets.',
    'Pick a target and an intermediate target. Hit 10 drives focusing only on starting over the intermediate target. Goal: 8 of 10 starts on intended line.',
    'Tempo lock: hit 12 drives at 80 to 90 percent speed with full finish. Track in-play rate. Goal: 10 of 12 in play with consistent strike.',
    'Two-ball fairway: hit two drives back-to-back. Both must be in play to score the set. Repeat 6 sets. Goal: 4 successful sets.',
  ],
  approach: [
    'Distance ladder with one club: pick 3 targets spaced 10 yards apart. Hit 3 balls to each target in random order. Score 2 for inside 10 yards of target, 1 for inside 20. Goal: 12 points.',
    'Center-green discipline: pick a middle target and hit 12 approach swings. Ignore flags. Score 1 for green hit, 2 for center-third. Goal: 14 points.',
    'Front-edge control: pick a target and require the ball to carry a front line. Hit 10 shots. Score 1 for carry, 2 for carry plus green. Goal: 14 points.',
    'Random yardage wedge set: alternate 50, 70, 90 yards for 12 shots. Use full routine. Goal: 8 of 12 finish inside 20 feet.',
    'Trajectory split: hit 6 stock shots and 6 lower-flight shots to the same target. Track start line and contact. Goal: 9 of 12 start within one flag width of line.',
    'Strike window: draw a 12-yard circle around the target. Hit 10 shots. Count inside results. Goal: 5 inside the circle.',
    'Green section control: pick left, middle, right sections. Hit 3 to each section. A miss must be pin-high or safer. Goal: no more than 2 short-side misses.',
    'One-miss rule: hit 10 approaches. If any shot misses the target line by more than one flag width at start, restart the set. Goal: complete 10 clean starts.',
    'Wedge tempo lock: pick one wedge distance and hit 15 balls with identical finish length. Goal: 10 of 15 inside a 25-foot circle.',
    'Long-iron safety: pick a conservative target and hit 10 shots. Score 1 for in-play, 2 for green. Goal: 12 points.',
  ],
  putting: [
    'Lag ladder: putt 10 balls from 25 to 40 feet. Any ball outside 3 feet is a fail. Goal: 8 of 10 inside 3 feet.',
    'Start-line gate: place two tees just wider than the ball 12 inches in front. Hit 12 putts from 6 feet starting through the gate. Goal: 10 clean starts.',
    'Speed ladder: putt 10, 15, 20, 25, 30 feet, two balls each. Goal: 8 of 10 finish inside 3 feet.',
    'Three-foot lockdown: make 20 putts from 3 feet. Any miss resets to 0. Goal: reach 20.',
    'Circle drill: place 8 balls in a 4-foot circle. Allow one miss max. Goal: make 7 of 8.',
    'Stop-zone drill: place a tee 18 inches past the hole. Roll 12 putts from 8 feet. Goal: 10 of 12 stop between hole and tee.',
    'Clock drill: 6 balls at 4 feet around the hole. Make all 6 to pass. Goal: 6 of 6.',
    'One-hand tempo: make 6 putts from 4 feet with lead hand only, then 6 with trail hand only. Goal: 8 makes total.',
    'Distance calibration: roll 10 balls to a fringe line and stop short. Any ball crossing the line is a fail. Goal: 8 of 10 stop short.',
    'Start-spot focus: choose a spot 12 inches ahead on the line. Hit 12 putts from 5 feet. Goal: 10 of 12 roll over the spot.',
  ],
  penalties: [
    'Pre-shot risk rule: label every full swing as green, yellow, or red. Red shots require a conservative target and one more club. Goal: zero penalty strokes for the round.',
    'Trouble rule: when blocked or in trees, the only target is back to fairway. Track decisions for 10 holes. Goal: 10 of 10 punch-outs when required.',
    'Hazard buffer: when water or OB is in play, aim to the widest safe side and accept a longer next shot. Goal: no penalty strokes from tee shots.',
    'Par-5 discipline: pick the layup yardage first, then plan backwards. Execute that plan on every par 5. Goal: no penalty strokes and no forced carries on second shots.',
    'Two-shot plan: before each tee shot, choose the next shot target as well. Commit to the plan for 9 holes. Goal: zero red decisions mid-hole.',
    'Club-down near trouble: on any hole with a penalty zone, take one less club and prioritize in-play. Goal: no penalties on those holes.',
    'Miss-side rule: for approaches with short-side risk, aim to the safe side and accept longer putts. Goal: zero short-side recoveries that lead to doubles.',
    'Recovery scoring: treat a recovery as successful if the next shot is from fairway or clean angle. Track 6 recoveries. Goal: 5 successful recoveries.',
    'Decision audit: after the round, mark each penalty as decision or execution. Next round, apply conservative target on every prior decision penalty hole. Goal: remove repeated decision penalties.',
    'Layup habit: when reaching requires a perfect strike, lay up to a full wedge yardage. Track 6 opportunities. Goal: 6 conservative layups executed.',
  ],
  short_game: [
    'Up-and-down set: drop 9 balls around the green with mixed lies. Play each to the hole. Goal: 5 successful up-and-downs.',
    'Landing towel: place a towel 3 yards onto the green. Chip 15 balls landing on the towel. Goal: 7 of 15 land on towel.',
    'One-bounce release: hit 12 chips designed to land once and release. Goal: 8 of 12 finish inside 6 feet.',
    'Lie ladder: play 4 balls each from tight, fringe, rough. Goal: 6 of 12 inside 6 feet.',
    'Single landing spot: pick one landing spot and hit 15 chips. Goal: 9 of 15 land within one clubhead of the spot.',
    'Bump-and-run set: hit 12 reps with an 8-iron from fringe. Goal: 8 of 12 inside 6 feet.',
    'Pitch window: hit 12 pitches to a 15-yard landing zone. Goal: 8 of 12 carry within plus or minus 2 yards of intended.',
    'One-club set: use one wedge for 18 reps from mixed lies. Goal: 10 of 18 inside 6 feet.',
    'Fringe choice test: from the same spot, hit 6 fringe putts and 6 chips. Record average leave. Goal: choose the better option for your next round strategy.',
    'Pressure saves: place 10 balls around the green. You must save par on 6 to pass. Goal: 6 of 10 saves.',
  ],
  general: [
    'Routine lock: use the same pre-shot routine on every full swing for 18 holes. Goal: zero rushed swings and full commit on every shot.',
    'Center targets only: aim at center targets on every approach for 9 holes. Goal: zero short-side misses.',
    'One miss removal: identify the biggest miss and choose targets that remove it for 18 holes. Goal: zero penalty strokes from that miss.',
    'Accuracy scoring: pick a range target and hit 15 balls. Score 2 for inside a 10-yard circle, 1 for inside 20. Goal: 18 points.',
    'Tempo block: hit 20 balls with identical finish length and balanced hold. Goal: 18 balanced finishes.',
    'Par-3 rule: center-green target on every par 3. Goal: hit 50 percent of greens or finish pin-high safe.',
    'Smart doubles: when out of position, play for bogey instead of forcing par. Goal: no doubles from decision errors.',
    'Track one stat goal: pick one stat for the round and write it down before teeing off. Goal: review it after the round and log it.',
    'Green-light only: only attack pins on green-light numbers. All other shots go to center. Goal: eliminate forced carries and short-side misses.',
    'Reset between shots: after every shot, take one full breath and re-commit to the next target. Goal: no back-to-back rushed shots.',
  ],
};

const OVERALL_COPY_BANNED_TOKENS = ['could', 'might', 'consider', 'seems', 'challenge', '—', '–', '&mdash;'] as const;

const CARD1_VARIANTS = {
  A: [
    'Scoring trend: latest round {scoreCompact}. Keep logging so your overall average reflects your true scoring.',
    'Scoring trend: latest round {scoreCompact}. Add more rounds so your overall average reflects your normal scoring.',
    'Scoring trend: latest round {scoreCompact}. Build more history so your overall average and recent rounds stabilize.',
    'Scoring trend: latest round {scoreCompact}. Keep tracking so the overall vs recent comparison tightens up.',
    'Scoring trend: latest round {scoreCompact}. More rounds will lock in a reliable overall average.',
    'Scoring trend: latest round {scoreCompact}. Log consistently so your overall average is not driven by outliers.',
    'Scoring trend: latest round {scoreCompact}. Add more rounds so the scoring trend becomes signal, not noise.',
    'Scoring trend: latest round {scoreCompact}. Keep logging to strengthen overall vs recent comparisons.',
    'Scoring trend: latest round {scoreCompact}. Record your next rounds so your overall average becomes accurate.',
    'Scoring trend: latest round {scoreCompact}. Continue tracking so trend insights match your true level.',
  ],
  B: [
    'Scoring trend: latest round {scoreCompact}. Recent scoring is holding your overall average pace.',
    'Scoring trend: latest round {scoreCompact}. Recent rounds are stable versus your overall average.',
    'Scoring trend: latest round {scoreCompact}. Your scoring level is matching your overall average.',
    'Scoring trend: latest round {scoreCompact}. Recent results are tracking close to your overall average.',
    'Scoring trend: latest round {scoreCompact}. Overall versus recent comparison shows steady scoring.',
    'Scoring trend: latest round {scoreCompact}. Your recent scoring is consistent with your overall average.',
    'Scoring trend: latest round {scoreCompact}. The recent average is aligned with your overall average.',
    'Scoring trend: latest round {scoreCompact}. Scoring pace is steady versus your overall average.',
    'Scoring trend: latest round {scoreCompact}. Recent scoring is level with your overall average.',
    'Scoring trend: latest round {scoreCompact}. Overall average and recent scoring are in sync.',
  ],
  C: [
    'Scoring trend: latest round {scoreCompact}. Recent scoring is ahead of your overall average by {delta} strokes.',
    'Scoring trend: latest round {scoreCompact}. You are beating your overall average by {delta} strokes in recent rounds.',
    'Scoring trend: latest round {scoreCompact}. Recent rounds are outperforming your overall average by {delta} strokes.',
    'Scoring trend: latest round {scoreCompact}. Recent scoring has moved {delta} strokes lower than your overall average.',
    'Scoring trend: latest round {scoreCompact}. Overall versus recent comparison shows a {delta} stroke scoring gain.',
    'Scoring trend: latest round {scoreCompact}. Recent scoring is separating from your overall average by {delta} strokes.',
    'Scoring trend: latest round {scoreCompact}. The recent average is {delta} strokes better than your overall average.',
    'Scoring trend: latest round {scoreCompact}. Your scoring trend is {delta} strokes under your overall average.',
    'Scoring trend: latest round {scoreCompact}. Recent scoring is operating {delta} strokes better than your overall average.',
    'Scoring trend: latest round {scoreCompact}. Recent results show a {delta} stroke advantage versus your overall average.',
  ],
  D: [
    'Scoring trend: latest round {scoreCompact}. Recent scoring is above your overall average by {delta} strokes.',
    'Scoring trend: latest round {scoreCompact}. Recent rounds are trailing your overall average by {delta} strokes.',
    'Scoring trend: latest round {scoreCompact}. Recent scoring is running {delta} strokes higher than your overall average.',
    'Scoring trend: latest round {scoreCompact}. Overall versus recent comparison shows a {delta} stroke scoring drop.',
    'Scoring trend: latest round {scoreCompact}. Recent scoring is off your overall average pace by {delta} strokes.',
    'Scoring trend: latest round {scoreCompact}. The recent average is {delta} strokes higher than your overall average.',
    'Scoring trend: latest round {scoreCompact}. Recent results are {delta} strokes above your overall average.',
    'Scoring trend: latest round {scoreCompact}. Recent scoring is trailing your overall average by {delta} strokes.',
    'Scoring trend: latest round {scoreCompact}. Recent rounds are {delta} strokes worse than your overall average.',
    'Scoring trend: latest round {scoreCompact}. Recent scoring is operating {delta} strokes above your overall average.',
  ],
} as const;

const CARD2_VARIANTS = {
  A: [
    'Strength: keep tracking SG for a few more rounds so we can confirm your top edge.',
    'Strength: add SG inputs on your next rounds so a strength can be identified.',
    'Strength: not enough SG-tracked rounds yet to rank your best area.',
    'Strength: log more SG rounds so your strength call is based on real trend, not a small sample.',
    'Strength: once SG is tracked for more rounds, we will flag the area that is performing best.',
    'Strength: SG tracking is still light. Add a few more rounds to unlock a clear strength.',
    'Strength: keep SG tracking consistent so strength detection is reliable.',
    'Strength: record SG for a few more rounds to unlock a measured strength.',
    'Strength: build more SG history so the strength label reflects your true game.',
    'Strength: we need more SG-tracked rounds before calling a strength from your tracked rounds.',
  ],

  B: [
    'Strength: {label} is your clearest edge versus your overall average right now. Keep leaning on it.',
    'Strength: {label} is creating the biggest scoring advantage versus your overall average in recent rounds.',
    'Strength: {label} is where you are winning strokes versus your overall average most consistently.',
    'Strength: {label} is separating your scores from your overall average. Protect it under pressure.',
    'Strength: {label} is carrying your best stretch versus your overall average. Stay committed to that pattern.',
    'Strength: {label} is your most dependable scoring asset versus your overall average in the recent stretch.',
    'Strength: {label} is your top lever for scoring versus your overall average. Keep the same decision rule here.',
    'Strength: {label} is producing your strongest results versus your overall average across tracked rounds.',
    'Strength: {label} is leading by recent vs overall SG among components in this window.',
    'Strength: {label} is the strongest measured edge versus your overall average right now.',
  ],

  C: [
    'Strength: {label} is your current leader versus your overall average, even if the gap is small.',
    'Strength: {label} is slightly ahead of the other areas versus your overall average in recent rounds.',
    'Strength: {label} is your front-runner versus your overall average. Keep it steady and repeatable.',
    'Strength: {label} is ranking first versus your overall average in the recent stretch.',
    'Strength: {label} is your best-performing area relative to your overall average so far.',
    'Strength: {label} is on top versus your overall average, with tight separation across components.',
    'Strength: {label} is your best area versus your overall average. Treat it as your anchor on tough holes.',
    'Strength: {label} is leading by recent vs overall SG, with only a small margin.',
    'Strength: {label} is the highest-ranked component versus your overall average in the current sample.',
    'Strength: {label} is your best edge versus your overall average at the moment.',
  ],

  D: [
    'Strength: {label} leads so far versus your overall average, based on a small number of SG-tracked rounds.',
    'Strength: {label} is the early leader versus your overall average. Keep tracking to confirm it.',
    'Strength: {label} is on top in the current sample versus your overall average, with limited coverage.',
    'Strength: {label} is your early edge versus your overall average. Repeat the same process next round.',
    'Strength: {label} ranks first so far versus your overall average, but the recent sample is still small.',
    'Strength: {label} is leading the pack versus your overall average at this stage of tracking.',
    'Strength: {label} shows the strongest early signal versus your overall average in recent rounds.',
    'Strength: {label} is currently highest versus your overall average, based on limited tracked rounds.',
    'Strength: {label} leads by recent vs overall SG so far, with limited recent coverage.',
    'Strength: {label} holds the early advantage versus your overall average. Keep SG inputs consistent.',
  ],
} as const;

const CARD3_VARIANTS = {
  A: [
    'Opportunity: track SG for a few more rounds so we can confirm the biggest gap.',
    'Opportunity: add SG inputs on your next rounds so we can identify your main scoring leak.',
    'Opportunity: not enough SG-tracked rounds yet to rank your lowest area.',
    'Opportunity: log more SG rounds so the opportunity call is based on trend, not a small sample.',
    'Opportunity: once SG is tracked for more rounds, we will flag the area losing the most.',
    'Opportunity: SG tracking is still light. Add a few more rounds to unlock a clear opportunity.',
    'Opportunity: keep SG tracking consistent so opportunity detection is reliable.',
    'Opportunity: record SG for a few more rounds to unlock a measured opportunity.',
    'Opportunity: build more SG history so the opportunity label reflects your true pattern.',
    'Opportunity: we need more SG-tracked rounds before ranking opportunities from your tracked rounds.',
  ],

  B: [
    'Opportunity: {label} is the main leak versus your overall average right now. Simplify this area first.',
    'Opportunity: {label} is where strokes are getting away versus your overall average in recent rounds.',
    'Opportunity: {label} is the biggest scoring drag versus your overall average. Make your safe choice here.',
    'Opportunity: {label} is costing the most versus your overall average. Protect your scorecard with one rule.',
    'Opportunity: {label} is the clearest gap versus your overall average. Reduce mistakes before chasing upside.',
    'Opportunity: {label} is the priority fix versus your overall average. Take the high-percentage option.',
    'Opportunity: {label} is under your overall average more than any other area in the recent stretch.',
    'Opportunity: {label} is lowest by recent vs overall SG among components right now.',
    'Opportunity: {label} is the most urgent lever versus your overall average. Keep decisions boring here.',
    'Opportunity: {label} is the largest measurable drop versus your overall average in this window.',
  ],

  C: [
    'Opportunity: {label} has the most available upside versus your overall average in the current stretch.',
    'Opportunity: {label} is your lowest-ranked area versus your overall average, even without a clear leak.',
    'Opportunity: {label} is the next area to push forward relative to your overall average.',
    'Opportunity: {label} is where tightening execution beats hunting highlight shots.',
    'Opportunity: {label} is the cleanest place to save strokes versus your overall average with one simple habit.',
    'Opportunity: {label} is the weakest relative performer versus your overall average right now.',
    'Opportunity: {label} has the lowest recent vs overall SG among components in the sample.',
    'Opportunity: {label} ranks lowest by recent vs overall SG in the current stretch.',
    'Opportunity: {label} is the next focus versus your overall average. Keep the miss on the safe side.',
    'Opportunity: {label} offers the clearest improvement path versus your overall average right now.',
  ],

  D: [
    'Opportunity: {label} ranks lowest so far versus your overall average, based on a small number of SG-tracked rounds.',
    'Opportunity: {label} is the early gap versus your overall average. Keep tracking to confirm it.',
    'Opportunity: {label} sits lowest in the current sample versus your overall average, with limited coverage.',
    'Opportunity: {label} is the early weakness versus your overall average. Apply one conservative rule here.',
    'Opportunity: {label} ranks last so far versus your overall average, but the recent sample is still small.',
    'Opportunity: {label} is trailing the pack versus your overall average at this stage of tracking.',
    'Opportunity: {label} shows the weakest early signal versus your overall average in recent rounds.',
    'Opportunity: {label} is currently lowest by recent vs overall SG with limited coverage.',
    'Opportunity: {label} is the current gap versus your overall average in a small window. Keep it simple next round.',
    'Opportunity: {label} is the lowest measured area versus your overall average so far. Track more rounds to lock it in.',
  ],

  E: [
    'Opportunity: {label} ranks lowest so far versus your overall average, based on a small number of SG-tracked rounds.',
    'Opportunity: {label} is lowest in the current sample versus your overall average, with limited coverage.',
    'Opportunity: {label} is the early lowest-ranked component versus your overall average in the tracking stretch.',
    'Opportunity: {label} sits lowest relative to your overall average in the current sample.',
    'Opportunity: {label} is the lowest area so far versus your overall average, based on a small sample.',
    'Opportunity: {label} shows the narrowest early separation versus your overall average across components.',
    'Opportunity: {label} is currently lowest by recent vs overall SG in early coverage.',
    'Opportunity: {label} ranks last by recent vs overall SG so far in limited tracking.',
    'Opportunity: {label} is the current lowest area versus your overall average at this stage. Keep tracking to confirm.',
    'Opportunity: {label} is the weakest measured component versus your overall average so far, based on limited rounds.',
  ],
} as const;

const CARD4_VARIANTS = {
  A: [
    'Priority first: track {missingList} every round so the practice plan is based on complete tracking.',
    'Priority first: log {missingList} each round so recommendations reflect your real rounds.',
    'Priority first: add {missingList} to your next rounds so we can point you to the right drills.',
    'Priority first: record {missingList} consistently so your biggest scoring leaks show up clearly.',
    'Priority first: track {missingList} so your next drill matches what you actually do on the course.',
    'Priority first: log {missingList} so we have enough tracking to label strengths and leaks with confidence.',
    'Priority first: capture {missingList} each round so the practice plan stays aligned to your logs.',
    'Priority first: add {missingList} so recommendations stay consistent from round to round.',
    'Priority first: log {missingList} each round so the practice targets stay accurate.',
    'Priority first: track {missingList} so the next drill is based on your tracked results.',
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
    'Priority first: {drillInline}, then log {missingList} each round so the next drill is more precise.',
    'Priority first: {drillInline}, and track {missingList} so recommendations match your tracking.',
    'Priority first: {drillInline}, then record {missingList} so the next callout is more accurate.',
    'Priority first: {drillInline}, and log {missingList} so the plan stays consistent.',
    'Priority first: {drillInline}, then add {missingList} so we can narrow the next focus.',
    'Priority first: {drillInline}, and track {missingList} so your next recommendation is tighter.',
    'Priority first: {drillInline}, then record {missingList} so we can pinpoint the biggest leak.',
    'Priority first: {drillInline}, and log {missingList} consistently so trends are easier to trust.',
    'Priority first: {drillInline}, with {missingList} tracked each round so the next drill fits better.',
    'Priority first: {drillInline}, plus {missingList} logged each round so targeting improves.',
  ],
} as const;

const CARD5_TRACK_FIRST_VARIANTS = [
  'On-course strategy: keep targets conservative and prioritize complete tracking this week.',
  'On-course strategy: play to wide targets and finish each round with complete tracking.',
  'On-course strategy: remove penalty risk first, then log the round so recommendations stay accurate.',
  'On-course strategy: use center targets and log full stats each round for better next steps.',
  'On-course strategy: keep decisions simple and complete tracking in your next rounds.',
  'On-course strategy: commit to safe lines and record missing stats across every round.',
  'On-course strategy: prioritize in-play outcomes and clean tracking before chasing birdies.',
  'On-course strategy: keep misses on the safe side and complete tracking every round.',
  'On-course strategy: use conservative targets and log full inputs so we can spot the real leaks.',
  'On-course strategy: play the widest options and complete tracking to unlock sharper recommendations.',
] as const;

const CARD5_LOW_COVERAGE_VARIANTS = [
  'On-course strategy: {strategyInline}, and track {missingList} each round to tighten targeting.',
  'On-course strategy: {strategyInline}, and log {missingList} each round to improve recommendation quality.',
  'On-course strategy: {strategyInline}, and record {missingList} each round for better drill fit.',
  'On-course strategy: {strategyInline}, and add {missingList} to each round to improve fit.',
  'On-course strategy: {strategyInline}, with {missingList} tracked each round to strengthen targeting.',
  'On-course strategy: {strategyInline}, and keep {missingList} logged each round to tighten inputs.',
  'On-course strategy: {strategyInline}, while tracking {missingList} each round for better alignment.',
  'On-course strategy: {strategyInline}, and include {missingList} each round to improve specificity.',
  'On-course strategy: {strategyInline}, and capture {missingList} each round to sharpen the next callout.',
  'On-course strategy: {strategyInline}, plus {missingList} each round so recommendations are based on your tracking.',
] as const;

const CARD5_VARIANTS_BY_OPPORTUNITY: Record<'off_tee' | 'approach' | 'putting' | 'penalties' | 'general', readonly string[]> = {
  off_tee: [
    'On-course strategy: choose the tee-shot line that keeps the ball in play, even if it leaves a longer approach.',
    'On-course strategy: favor the widest landing area off the tee and accept a longer second shot.',
    'On-course strategy: pick the safe side off the tee and keep the biggest miss out of play.',
    'On-course strategy: aim at a conservative tee target and prioritize in-play starts.',
    'On-course strategy: choose the line that removes hazard risk off the tee and commit.',
    'On-course strategy: set a fairway corridor target and accept center outcomes.',
    'On-course strategy: take the safer tee line and keep penalties off the card.',
    'On-course strategy: play to the widest tee landing area and keep the ball in play.',
    'On-course strategy: aim for the center fairway line and eliminate the hazard side.',
    'On-course strategy: use conservative tee targets and keep the ball playable on every hole.',
  ],
  approach: [
    'On-course strategy: bias to center-green targets unless you have a clear scoring number.',
    'On-course strategy: default to center-green and accept two-putt pars.',
    'On-course strategy: choose a middle target on approaches and remove short-siding.',
    'On-course strategy: aim to the fat side of the green and keep misses simple.',
    'On-course strategy: play approaches to center targets and avoid low-percentage pins.',
    'On-course strategy: take the safe green section and eliminate short-side misses.',
    'On-course strategy: favor center-green lines and accept longer birdie putts.',
    'On-course strategy: use center targets on approaches and protect against big misses.',
    'On-course strategy: pick the conservative green target and commit to it.',
    'On-course strategy: prioritize center-green approaches and keep the ball on the putting surface.',
  ],
  putting: [
    'On-course strategy: on putts outside make range, prioritize pace to finish inside a stress-free second-putt distance.',
    'On-course strategy: outside short range, prioritize speed to leave a simple second putt.',
    'On-course strategy: focus on lag pace first and keep second putts inside 3 feet.',
    'On-course strategy: on long putts, pick a pace target and leave a short cleanup.',
    'On-course strategy: prioritize speed control and eliminate three-putts.',
    'On-course strategy: choose a pace goal on every long putt and finish close.',
    'On-course strategy: on putts over 20 feet, roll for pace and accept tap-ins.',
    'On-course strategy: take the safe line and focus on speed to reduce three-putts.',
    'On-course strategy: keep long putts inside a tight leave zone and clean up.',
    'On-course strategy: putt for pace first and keep the second putt routine simple.',
  ],
  penalties: [
    'On-course strategy: when trouble is in play, take the conservative target that removes penalty risk.',
    'On-course strategy: remove penalty zones from your plan and play to the widest target.',
    'On-course strategy: choose the safe line near hazards and accept longer birdie chances.',
    'On-course strategy: when hazards exist, aim away from them and keep the ball in play.',
    'On-course strategy: pick a conservative target on risk holes and commit fully.',
    'On-course strategy: near OB or water, club for safety and play the wide target.',
    'On-course strategy: avoid hero shots and take the simple advance option.',
    'On-course strategy: prioritize in-play outcomes and accept conservative targets.',
    'On-course strategy: reduce risk decisions and keep penalties off the card.',
    'On-course strategy: choose the low-risk target and keep the ball playable.',
  ],
  general: [
    'On-course strategy: keep one conservative target rule and apply it on every full swing.',
    'On-course strategy: pick center targets and remove the biggest miss from play.',
    'On-course strategy: choose conservative targets and commit to one routine.',
    'On-course strategy: aim for wide targets and keep the ball in play all round.',
    'On-course strategy: use center targets and accept simple outcomes.',
    'On-course strategy: take the safe target on every full shot and repeat it.',
    'On-course strategy: keep decisions simple and avoid high-risk targets.',
    'On-course strategy: play to the widest landing areas and protect your scorecard.',
    'On-course strategy: commit to conservative targets and remove penalty risk.',
    'On-course strategy: apply one safe target rule for every hole and stick to it.',
  ],
};

const CARD6_VARIANTS = {
  A: [
    'Projection: trajectory is {traj}. Upgrade to unlock projected scoring and handicap ranges.',
    'Projection: current trajectory is {traj}. Upgrade for score and handicap projections.',
    'Projection: trajectory shows {traj}. Upgrade to unlock projection ranges.',
    'Projection: trajectory is {traj}. Upgrade to view projected scoring in 10 rounds.',
    'Projection: trajectory is {traj}. Upgrade to unlock handicap projection ranges.',
    'Projection: trajectory is {traj}. Upgrade to see projected score bands by mode.',
    'Projection: trajectory is {traj}. Upgrade to unlock full projection detail.',
    'Projection: trajectory is {traj}. Upgrade to unlock score and handicap targets.',
    'Projection: trajectory is {traj}. Upgrade for projected score and handicap tracking.',
    'Projection: trajectory is {traj}. Upgrade to view projections and ranges.',
  ],
  B: [
    'Projection: at current trajectory, target about {score} over the next ~10 rounds with handicap near {hcp}.',
    'Projection: current trend projects about {score} in the next ~10 rounds with handicap near {hcp}.',
    'Projection: scoring pace targets about {score} over ~10 rounds with handicap around {hcp}.',
    'Projection: projected target is about {score} in ~10 rounds with handicap near {hcp}.',
    'Projection: next ~10 rounds target is about {score}, with handicap tracking near {hcp}.',
    'Projection: current trajectory points to about {score} over ~10 rounds with handicap near {hcp}.',
    'Projection: projected scoring target is about {score} with handicap near {hcp} over ~10 rounds.',
    'Projection: current trend targets about {score} over the next ~10 rounds, handicap near {hcp}.',
    'Projection: projection target is about {score} in ~10 rounds with handicap near {hcp}.',
    'Projection: current pace targets about {score} with handicap near {hcp} over ~10 rounds.',
  ],
  C: [
    'Projection: trajectory is {traj}. Log at least 10 rounds to unlock projected ranges.',
    'Projection: trajectory is {traj}. Add rounds to unlock score and handicap projections.',
    'Projection: trajectory is {traj}. Reach 10 rounds to unlock projection targets.',
    'Projection: trajectory is {traj}. Log more rounds to unlock projection bands.',
    'Projection: trajectory is {traj}. Add rounds to unlock score projections by mode.',
    'Projection: trajectory is {traj}. Log additional rounds to unlock handicap projection.',
    'Projection: trajectory is {traj}. Build to 10 rounds for projection ranges.',
    'Projection: trajectory is {traj}. More rounds unlock projected targets.',
    'Projection: trajectory is {traj}. Keep logging to unlock projected score and handicap.',
    'Projection: trajectory is {traj}. Log 10 rounds to unlock projection ranges.',
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

function assertOverallCopySafe(text: string, context: string): void {
  if (process.env.NODE_ENV === 'production') return;
  const normalized = String(text ?? '').toLowerCase();
  const token = OVERALL_COPY_BANNED_TOKENS.find((entry) => normalized.includes(entry.toLowerCase()));
  if (token) {
    throw new Error(`Banned overall copy token "${token}" in ${context}: ${text}`);
  }
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

function componentAverages(recentCombined: OverallRoundPoint[], baselineCombined: OverallRoundPoint[]) {
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
      const baselineVals = baselineCombined
        .map(def.get)
        .filter((n): n is number => n != null && Number.isFinite(n));
      const recentAvg = average(recentVals);
      const baselineAvg = average(baselineVals);
      if (recentAvg == null || baselineAvg == null) {
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
  const worst = withVals.reduce((a, b) => (b.value < a.value ? b : a), withVals[0]);

  return {
    best: {
      name: best.name,
      value: round1(best.value),
      label: SG_LABELS[best.name],
      coverageRecent: best.coverageRecent,
      lowCoverage: best.coverageRecent < OVERALL_SG_MIN_RECENT_COVERAGE,
    },
    opportunity: {
      name: worst.name,
      value: round1(worst.value),
      label: SG_LABELS[worst.name],
      isWeakness: worst.value < 0,
      coverageRecent: worst.coverageRecent,
      lowCoverage: worst.coverageRecent < OVERALL_SG_MIN_RECENT_COVERAGE,
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
  const scoreTrendShift = scoreSlope != null ? clamp(scoreSlope * 4, -2, 2) : 0;
  const projectedScoreIn10 =
    recentAvgScore != null && baselineAvgScore != null
      ? round1((recentAvgScore * 0.7) + (baselineAvgScore * 0.3) + scoreTrendShift)
      : recentAvgScore != null
        ? round1(recentAvgScore + scoreTrendShift)
      : null;
  const handicapTrendShift = handicapSlope != null ? clamp(handicapSlope * 8, -0.8, 1.2) : 0;
  const projectedHandicapIn10 =
    handicapCurrent != null ? round1(handicapCurrent + handicapTrendShift) : null;

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
  return prevDataHash !== nextDataHash;
}

export function computeOverallPayload(args: {
  rounds: OverallRoundPoint[];
  isPremium: boolean;
  model: string;
  cards: string[];
  currentHandicapOverride?: number | null;
}): OverallInsightsPayload {
  const combined = normalizeByMode(args.rounds, 'combined')
    .sort((a, b) => +new Date(b.date) - +new Date(a.date));
  const recentCombined = combined.slice(0, 5);
  const baselineCombined = combined;

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
  const efficiency = computeEfficiency(combined);
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
    projection_by_mode: projectionByMode,
    cards: args.cards,
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

function formatTrackedStatsList(missing: { fir: boolean; gir: boolean; putts: boolean; penalties: boolean }): string {
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
  return 'stable';
}

export function buildDeterministicOverallCards(args: {
  payload: OverallInsightsPayload;
  recommendedDrill: string;
  missingStats: { fir: boolean; gir: boolean; putts: boolean; penalties: boolean };
  isPremium: boolean;
  variantSeedBase: string;
  variantOffset: number;
}): string[] {
  const analysis = args.payload.analysis;
  const projection = args.payload.projection;
  const missingCount =
    Number(args.missingStats.fir) +
    Number(args.missingStats.gir) +
    Number(args.missingStats.putts) +
    Number(args.missingStats.penalties);
  const missingList = formatTrackedStatsList(args.missingStats);
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

  const scoreSummary = (() => {
    const recent = analysis.avg_score_recent;
    const baseline = analysis.avg_score_baseline;
    if (recent == null || baseline == null) {
      return choose('card1', '1A', CARD1_VARIANTS.A, {
        scoreCompact: analysis.score_compact,
      });
    }
    const delta = recent - baseline;
    if (Math.abs(delta) < 0.2) {
      return choose('card1', '1B', CARD1_VARIANTS.B, {
        scoreCompact: analysis.score_compact,
      });
    }
    if (delta < 0) {
      return choose('card1', '1C', CARD1_VARIANTS.C, {
        scoreCompact: analysis.score_compact,
        delta: formatOneDecimal(Math.abs(delta)),
      });
    }
    return choose('card1', '1D', CARD1_VARIANTS.D, {
      scoreCompact: analysis.score_compact,
      delta: formatOneDecimal(delta),
    });
  })();

  const strength = (() => {
    if (!analysis.strength.label) {
      return choose('card2', '2A', CARD2_VARIANTS.A, {});
    }
    if (analysis.strength.lowCoverage) {
      return choose('card2', '2D', CARD2_VARIANTS.D, { label: analysis.strength.label });
    }
    if (analysis.strength.value != null && analysis.strength.value >= 0.5) {
      return choose('card2', '2B', CARD2_VARIANTS.B, { label: analysis.strength.label });
    }
    return choose('card2', '2C', CARD2_VARIANTS.C, { label: analysis.strength.label });
  })();

  const opportunity = (() => {
    if (!analysis.opportunity.label) {
      return choose('card3', '3A', CARD3_VARIANTS.A, {});
    }
    if (analysis.opportunity.lowCoverage) {
      if (analysis.opportunity.isWeakness) {
        return choose('card3', '3D', CARD3_VARIANTS.D, { label: analysis.opportunity.label });
      }
      return choose('card3', '3E', CARD3_VARIANTS.E, { label: analysis.opportunity.label });
    }
    if (analysis.opportunity.isWeakness) {
      return choose('card3', '3B', CARD3_VARIANTS.B, { label: analysis.opportunity.label });
    }
    return choose('card3', '3C', CARD3_VARIANTS.C, { label: analysis.opportunity.label });
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
    if (missingCount >= 3) {
      return choose('card5', '5A', CARD5_TRACK_FIRST_VARIANTS, {});
    }

    const opportunityKey =
      analysis.opportunity.name === 'off_tee' ||
      analysis.opportunity.name === 'approach' ||
      analysis.opportunity.name === 'putting' ||
      analysis.opportunity.name === 'penalties'
        ? analysis.opportunity.name
        : 'general';
    if (missingCount >= 1) {
      const strategyPick = pickVariantFromPool(
        CARD5_VARIANTS_BY_OPPORTUNITY[opportunityKey],
        baseSeed,
        `card5|5${opportunityKey}|strategy`,
        variantOffset,
      );
      const strategyInline = inlineSentence(strategyPick.text.replace(/^On-course strategy:\s*/i, ''));
      return choose('card5', `5${opportunityKey}|low`, CARD5_LOW_COVERAGE_VARIANTS, {
        strategyInline,
        missingList,
      });
    }
    return choose('card5', `5${opportunityKey}`, CARD5_VARIANTS_BY_OPPORTUNITY[opportunityKey], {});
  })();

  const card6 = (() => {
    const trajectory = formatTrajectoryLabel(projection.trajectory);
    if (!args.isPremium) {
      return choose('card6', '6A', CARD6_VARIANTS.A, { traj: trajectory });
    }
    if (projection.projectedScoreIn10 != null && projection.projectedHandicapIn10 != null) {
      return choose('card6', '6B', CARD6_VARIANTS.B, {
        score: `${Math.round(projection.projectedScoreIn10)}`,
        hcp: formatOneDecimal(projection.projectedHandicapIn10),
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
