import 'dotenv/config';
import { prisma } from '../lib/db';
import { recalcLeaderboard } from '../lib/utils/leaderboard';
import { calculateNetScore } from '../lib/utils/handicap';
import { calculateStrokesGained } from '../lib/utils/strokesGained';
import { deriveShortGameMetrics } from '../lib/utils/shortGameMetrics';
import { generateInsights } from '../app/api/rounds/[id]/insights/route';
import { generateAndStoreOverallInsights } from '../app/api/insights/overall/route';
import { resolveTeeContext, type TeeSegment } from '../lib/tee/resolveTeeContext';

type RoundSeed = {
  date: string;
  courseName: string;
  par: number;
  courseRating: number;
  slope: number;
  score: number;
  toPar: number;
  firHit: number;
  firPossible: number;
  girHit: number;
  girPossible: number;
  putts: number;
  penalties: number;
  chipsTarget?: number;
  greensideBunkerShotsTarget?: number;
  entryMode: 'live' | 'after';
  note?: string;
};

const ROUND_CONTEXT = 'real' as const;
const TEE_SEGMENT: TeeSegment = 'full';
const FORCE_LIVE_ENTRY_MODE = true;
const SHORT_GAME_PROFILE = 'bunker-light-missed-green-min1-v2';
const FIR_MISS_DISTRIBUTION = {
  miss_left: 0.17,
  miss_right: 0.78,
  miss_short: 0.05,
  miss_long: 0,
} as const;
const GIR_MISS_DISTRIBUTION = {
  miss_left: 0.15,
  miss_right: 0.75,
  miss_short: 0.07,
  miss_long: 0.03,
} as const;
const BIRDIE_TARGETS_BY_ROUND = [
  0, 0, 0, 0, 0, 1,
  0, 1, 1, 0, 1, 1,
  1, 1, 1, 1, 1, 1, 1, 1,
  3, 1, 1, 2, 2,
] as const;
const UP_AND_DOWN_TARGETS_BY_ROUND = [
  0, 0, 0, 0, 0, 0, 1, 1,
  1, 1, 1, 1, 1, 1, 1, 1,
  1, 1, 2, 1, 2, 2, 1, 2, 2,
] as const;
const SAND_SAVE_TARGETS_BY_ROUND = [
  0, 0, 0, 0, 0, 0, 0, 0,
  0, 0, 0, 0, 0, 0, 0, 0,
  1, 0, 0, 0, 1, 0, 0, 1, 1,
] as const;
const PAR5_SWAP_TARGETS_BY_ROUND = [
  0, 0, 0, 0, 0, 1, 1, 1, 1, 1,
  1, 1, 2, 2, 2, 2, 2, 2, 2, 2,
  3, 3, 3, 4, 4,
] as const;
const MISS_DIRECTION_KEYS = ['miss_left', 'miss_right', 'miss_short', 'miss_long'] as const;
type MissDirection = (typeof MISS_DIRECTION_KEYS)[number];
type MissDirectionCounts = Record<MissDirection, number>;
type ScoringProfileCounts = {
  birdiePlus: number;
  par: number;
  bogey: number;
  doublePlus: number;
  totalHoles: number;
};
type ParTypeSummaryCounts = Record<3 | 4 | 5, { holes: number; totalScore: number }>;

// 25-round improving season profile with a curated demo arc:
// rough early season -> improving mid -> strong late with one wobble.
const SEASON_25_ROUNDS: RoundSeed[] = [
  { date: '2026-05-03', courseName: 'Portage Golf Club', par: 70, courseRating: 70.3, slope: 123, score: 95, toPar: 25, firHit: 5, firPossible: 14, girHit: 3, girPossible: 18, putts: 39, penalties: 5, chipsTarget: 18, greensideBunkerShotsTarget: 3, entryMode: 'live', note: 'Early season rust; penalty-heavy.' },
  { date: '2026-05-08', courseName: 'MacGregor', par: 70, courseRating: 68.2, slope: 114, score: 92, toPar: 22, firHit: 5, firPossible: 12, girHit: 4, girPossible: 18, putts: 38, penalties: 4, chipsTarget: 17, greensideBunkerShotsTarget: 2, entryMode: 'after' },
  { date: '2026-05-14', courseName: 'Bridges', par: 72, courseRating: 72.7, slope: 127, score: 96, toPar: 24, firHit: 4, firPossible: 14, girHit: 3, girPossible: 18, putts: 40, penalties: 5, chipsTarget: 18, greensideBunkerShotsTarget: 3, entryMode: 'live', note: 'Noticeably bad round #1.' },
  { date: '2026-05-19', courseName: 'Gladstone', par: 72, courseRating: 71.1, slope: 113, score: 90, toPar: 18, firHit: 6, firPossible: 14, girHit: 5, girPossible: 18, putts: 37, penalties: 3, chipsTarget: 16, greensideBunkerShotsTarget: 2, entryMode: 'after' },
  { date: '2026-05-24', courseName: 'MacGregor', par: 70, courseRating: 68.2, slope: 114, score: 91, toPar: 21, firHit: 5, firPossible: 12, girHit: 5, girPossible: 18, putts: 38, penalties: 4, chipsTarget: 16, greensideBunkerShotsTarget: 2, entryMode: 'after' },
  { date: '2026-05-29', courseName: 'Blumberg', par: 72, courseRating: 70.2, slope: 121, score: 93, toPar: 21, firHit: 5, firPossible: 14, girHit: 4, girPossible: 18, putts: 39, penalties: 4, chipsTarget: 17, greensideBunkerShotsTarget: 2, entryMode: 'after', note: 'Plateau stretch #1 starts.' },
  { date: '2026-06-03', courseName: 'MacGregor', par: 70, courseRating: 68.2, slope: 114, score: 88, toPar: 18, firHit: 6, firPossible: 12, girHit: 5, girPossible: 18, putts: 36, penalties: 3, chipsTarget: 15, greensideBunkerShotsTarget: 2, entryMode: 'live' },
  { date: '2026-06-08', courseName: 'Portage Golf Club', par: 70, courseRating: 70.3, slope: 123, score: 89, toPar: 19, firHit: 5, firPossible: 14, girHit: 5, girPossible: 18, putts: 37, penalties: 3, chipsTarget: 15, greensideBunkerShotsTarget: 2, entryMode: 'after' },
  { date: '2026-06-13', courseName: 'MacGregor', par: 70, courseRating: 68.2, slope: 114, score: 86, toPar: 16, firHit: 7, firPossible: 12, girHit: 6, girPossible: 18, putts: 36, penalties: 2, chipsTarget: 14, greensideBunkerShotsTarget: 2, entryMode: 'after' },
  { date: '2026-06-19', courseName: 'Bridges', par: 72, courseRating: 72.7, slope: 127, score: 91, toPar: 19, firHit: 4, firPossible: 14, girHit: 4, girPossible: 18, putts: 38, penalties: 4, chipsTarget: 16, greensideBunkerShotsTarget: 2, entryMode: 'after', note: 'Noticeably bad round #2.' },
  { date: '2026-06-24', courseName: 'MacGregor', par: 70, courseRating: 68.2, slope: 114, score: 84, toPar: 14, firHit: 6, firPossible: 12, girHit: 7, girPossible: 18, putts: 34, penalties: 2, chipsTarget: 13, greensideBunkerShotsTarget: 1, entryMode: 'live', note: 'Breakthrough round #1.' },
  { date: '2026-06-29', courseName: 'Gladstone', par: 72, courseRating: 71.1, slope: 113, score: 86, toPar: 14, firHit: 6, firPossible: 14, girHit: 6, girPossible: 18, putts: 35, penalties: 2, chipsTarget: 14, greensideBunkerShotsTarget: 1, entryMode: 'after' },
  { date: '2026-07-04', courseName: 'MacGregor', par: 70, courseRating: 68.2, slope: 114, score: 84, toPar: 14, firHit: 6, firPossible: 12, girHit: 7, girPossible: 18, putts: 34, penalties: 2, chipsTarget: 13, greensideBunkerShotsTarget: 1, entryMode: 'after', note: 'Plateau stretch #2 starts.' },
  { date: '2026-07-10', courseName: 'Portage Golf Club', par: 70, courseRating: 70.3, slope: 123, score: 82, toPar: 12, firHit: 7, firPossible: 14, girHit: 7, girPossible: 18, putts: 34, penalties: 1, chipsTarget: 12, greensideBunkerShotsTarget: 1, entryMode: 'live' },
  { date: '2026-07-16', courseName: 'MacGregor', par: 70, courseRating: 68.2, slope: 114, score: 83, toPar: 13, firHit: 6, firPossible: 12, girHit: 6, girPossible: 18, putts: 35, penalties: 2, chipsTarget: 13, greensideBunkerShotsTarget: 1, entryMode: 'after' },
  { date: '2026-07-22', courseName: 'Blumberg', par: 72, courseRating: 70.2, slope: 121, score: 84, toPar: 12, firHit: 6, firPossible: 14, girHit: 6, girPossible: 18, putts: 35, penalties: 2, chipsTarget: 13, greensideBunkerShotsTarget: 1, entryMode: 'after' },
  { date: '2026-07-28', courseName: 'MacGregor', par: 70, courseRating: 68.2, slope: 114, score: 80, toPar: 10, firHit: 7, firPossible: 12, girHit: 8, girPossible: 18, putts: 33, penalties: 1, chipsTarget: 10, greensideBunkerShotsTarget: 1, entryMode: 'live', note: 'Breakthrough round #2.' },
  { date: '2026-08-02', courseName: 'Bridges', par: 72, courseRating: 72.7, slope: 127, score: 85, toPar: 13, firHit: 6, firPossible: 14, girHit: 7, girPossible: 18, putts: 34, penalties: 2, chipsTarget: 11, greensideBunkerShotsTarget: 1, entryMode: 'after' },
  { date: '2026-08-08', courseName: 'MacGregor', par: 70, courseRating: 68.2, slope: 114, score: 81, toPar: 11, firHit: 6, firPossible: 12, girHit: 8, girPossible: 18, putts: 34, penalties: 1, chipsTarget: 10, greensideBunkerShotsTarget: 1, entryMode: 'after' },
  { date: '2026-08-14', courseName: 'Gladstone', par: 72, courseRating: 71.1, slope: 113, score: 83, toPar: 11, firHit: 6, firPossible: 14, girHit: 7, girPossible: 18, putts: 35, penalties: 2, chipsTarget: 11, greensideBunkerShotsTarget: 1, entryMode: 'after' },
  { date: '2026-08-20', courseName: 'MacGregor', par: 70, courseRating: 68.2, slope: 114, score: 77, toPar: 7, firHit: 9, firPossible: 12, girHit: 10, girPossible: 18, putts: 31, penalties: 0, chipsTarget: 8, greensideBunkerShotsTarget: 1, entryMode: 'live', note: 'Career day; everything clicked.' },
  { date: '2026-08-26', courseName: 'Portage Golf Club', par: 70, courseRating: 70.3, slope: 123, score: 82, toPar: 12, firHit: 6, firPossible: 14, girHit: 7, girPossible: 18, putts: 35, penalties: 2, chipsTarget: 11, greensideBunkerShotsTarget: 1, entryMode: 'after' },
  { date: '2026-09-01', courseName: 'MacGregor', par: 70, courseRating: 68.2, slope: 114, score: 83, toPar: 13, firHit: 6, firPossible: 12, girHit: 7, girPossible: 18, putts: 34, penalties: 2, chipsTarget: 11, greensideBunkerShotsTarget: 1, entryMode: 'after', note: 'Late-season steady round.' },
  { date: '2026-09-08', courseName: 'Blumberg', par: 72, courseRating: 70.2, slope: 121, score: 81, toPar: 9, firHit: 7, firPossible: 14, girHit: 8, girPossible: 18, putts: 35, penalties: 2, chipsTarget: 9, greensideBunkerShotsTarget: 1, entryMode: 'live' },
  { date: '2026-09-14', courseName: 'MacGregor', par: 70, courseRating: 68.2, slope: 114, score: 80, toPar: 10, firHit: 7, firPossible: 12, girHit: 8, girPossible: 18, putts: 33, penalties: 1, chipsTarget: 10, greensideBunkerShotsTarget: 1, entryMode: 'after', note: 'Strong finish.' },
];

type TeeWithHoles = Awaited<ReturnType<typeof findTeeForRound>>;

function getArg(name: string): string | undefined {
  const eqPrefix = `--${name}=`;
  const eqArg = process.argv.find((arg) => arg.startsWith(eqPrefix));
  if (eqArg) return eqArg.slice(eqPrefix.length);
  const idx = process.argv.findIndex((arg) => arg === `--${name}`);
  if (idx === -1) return undefined;
  return process.argv[idx + 1];
}

function hasFlag(name: string): boolean {
  return process.argv.includes(`--${name}`);
}

function hashToSeed(input: string): number {
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function makeRng(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state += 0x6d2b79f5;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pickWeightedIndex(weights: number[], rng: () => number): number {
  const total = weights.reduce((sum, w) => sum + Math.max(0, w), 0);
  if (total <= 0) return 0;
  const r = rng() * total;
  let acc = 0;
  for (let i = 0; i < weights.length; i++) {
    acc += Math.max(0, weights[i]);
    if (r <= acc) return i;
  }
  return weights.length - 1;
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function toDateKeyUtc(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function deriveShortGameShots(chips: number | null | undefined, greensideBunkerShots: number | null | undefined): number | null {
  if (chips == null && greensideBunkerShots == null) return null;
  return (chips ?? 0) + (greensideBunkerShots ?? 0);
}

function emptyMissDirectionCounts(): MissDirectionCounts {
  return {
    miss_left: 0,
    miss_right: 0,
    miss_short: 0,
    miss_long: 0,
  };
}

function emptyScoringProfileCounts(): ScoringProfileCounts {
  return {
    birdiePlus: 0,
    par: 0,
    bogey: 0,
    doublePlus: 0,
    totalHoles: 0,
  };
}

function emptyParTypeSummaryCounts(): ParTypeSummaryCounts {
  return {
    3: { holes: 0, totalScore: 0 },
    4: { holes: 0, totalScore: 0 },
    5: { holes: 0, totalScore: 0 },
  };
}

function pickMissDirection(seedKey: string, distribution: Record<MissDirection, number>): MissDirection {
  const seed = hashToSeed(seedKey);
  const rng = makeRng(seed);
  const roll = rng();
  let acc = 0;
  for (const key of MISS_DIRECTION_KEYS) {
    acc += distribution[key];
    if (roll <= acc) return key;
  }
  return 'miss_right';
}

function logMissDirectionSummary(firMissCounts: MissDirectionCounts, girMissCounts: MissDirectionCounts): void {
  const totalFirMisses = MISS_DIRECTION_KEYS.reduce((sum, key) => sum + firMissCounts[key], 0);
  const totalGirMisses = MISS_DIRECTION_KEYS.reduce((sum, key) => sum + girMissCounts[key], 0);
  const pct = (count: number, total: number) => (total > 0 ? ((count / total) * 100).toFixed(1) : '0.0');

  console.log('\nMiss direction summary:');
  console.log(`FIR misses total: ${totalFirMisses}`);
  for (const key of MISS_DIRECTION_KEYS) {
    console.log(`  FIR ${key}: ${firMissCounts[key]} (${pct(firMissCounts[key], totalFirMisses)}%)`);
  }
  console.log(`GIR misses total: ${totalGirMisses}`);
  for (const key of MISS_DIRECTION_KEYS) {
    console.log(`  GIR ${key}: ${girMissCounts[key]} (${pct(girMissCounts[key], totalGirMisses)}%)`);
  }
}

function logScoringProfileSummary(profileCounts: ScoringProfileCounts): void {
  const total = profileCounts.totalHoles;
  const pct = (count: number) => (total > 0 ? ((count / total) * 100).toFixed(1) : '0.0');
  console.log('\nScoring profile summary:');
  console.log(`Total holes: ${total}`);
  console.log(`  Birdie+: ${profileCounts.birdiePlus} (${pct(profileCounts.birdiePlus)}%)`);
  console.log(`  Par: ${profileCounts.par} (${pct(profileCounts.par)}%)`);
  console.log(`  Bogey: ${profileCounts.bogey} (${pct(profileCounts.bogey)}%)`);
  console.log(`  Double+: ${profileCounts.doublePlus} (${pct(profileCounts.doublePlus)}%)`);
}

function logParTypeScoringSummary(parTypeCounts: ParTypeSummaryCounts): void {
  console.log('\nPar-type scoring summary:');
  for (const par of [3, 4, 5] as const) {
    const row = parTypeCounts[par];
    const avgScore = row.holes > 0 ? row.totalScore / row.holes : null;
    const relToPar = avgScore != null ? avgScore - par : null;
    const avgText = avgScore != null ? avgScore.toFixed(2) : 'n/a';
    const relText = relToPar != null
      ? `${relToPar >= 0 ? '+' : ''}${relToPar.toFixed(2)}`
      : 'n/a';
    console.log(`  Par ${par}: avg ${avgText} (${relText} vs par)`);
  }
}

function formatRate(rate: { opportunities: number; successes: number; percentage: number | null }): string {
  const pct = rate.percentage != null ? `${rate.percentage.toFixed(2)}%` : 'n/a';
  return `${rate.successes}/${rate.opportunities} (${pct})`;
}

function logRecoverySummary(metrics: ReturnType<typeof deriveShortGameMetrics>): void {
  console.log('\nRecovery summary:');
  console.log(`  Up & Down: ${formatRate(metrics.upAndDown)}`);
  console.log(`  Sand Save: ${formatRate(metrics.sandSave)}`);
}

function applyDeterministicBirdieShaping(
  scores: number[],
  parValues: number[],
  roundIndex: number,
  rng: () => number,
): void {
  const targetBirdies = BIRDIE_TARGETS_BY_ROUND[roundIndex] ?? 0;
  if (targetBirdies <= 0) return;

  const pickWeightedFrom = (indices: number[], weights: number[]): number => {
    const picked = pickWeightedIndex(weights, rng);
    return indices[Math.min(Math.max(picked, 0), indices.length - 1)];
  };

  let created = 0;
  while (created < targetBirdies) {
    const birdieCandidates = scores
      .map((score, idx) => ({ idx, score, par: parValues[idx] }))
      .filter((h) => h.score >= h.par && h.score <= h.par + 1);
    if (!birdieCandidates.length) break;

    const candidateIdxs = birdieCandidates.map((h) => h.idx);
    const candidateWeights = birdieCandidates.map((h) => {
      // Prefer turning pars to birdies. Bogey->birdie remains possible when needed.
      if (h.score === h.par) return 2.4;
      return 0.8;
    });
    const birdieIdx = pickWeightedFrom(candidateIdxs, candidateWeights);
    const birdiePar = parValues[birdieIdx];
    const decrement = scores[birdieIdx] - (birdiePar - 1);
    if (decrement <= 0) break;
    scores[birdieIdx] = birdiePar - 1;

    for (let step = 0; step < decrement; step++) {
      const compensationCandidates = scores
        .map((score, idx) => ({ idx, delta: score - parValues[idx] }))
        .filter((h) => h.idx !== birdieIdx);
      if (!compensationCandidates.length) break;
      const compIdxs = compensationCandidates.map((h) => h.idx);
      const compWeights = compensationCandidates.map((h) => {
        const base = 1 + Math.max(0, h.delta) * 0.9;
        const cap = h.delta >= 4 ? 0.35 : 1;
        return base * cap;
      });
      const compIdx = pickWeightedFrom(compIdxs, compWeights);
      scores[compIdx] += 1;
    }

    created += 1;
  }
}

function applyDeterministicRecoveryShaping(input: {
  scores: number[];
  parValues: number[];
  putts: number[];
  gir: number[];
  chips: number[];
  greensideBunkerShots: number[];
  roundIndex: number;
  rng: () => number;
}): void {
  const {
    scores,
    parValues,
    putts,
    gir,
    chips,
    greensideBunkerShots,
    roundIndex,
    rng,
  } = input;

  const targetUpAndDown = UP_AND_DOWN_TARGETS_BY_ROUND[roundIndex] ?? 0;
  const targetSandSave = SAND_SAVE_TARGETS_BY_ROUND[roundIndex] ?? 0;

  if (targetUpAndDown <= 0 && targetSandSave <= 0) return;

  const shortGameShotsAt = (idx: number) => chips[idx] + greensideBunkerShots[idx];
  const usedForSave = new Set<number>();

  const pickWeightedFrom = (indices: number[], weights: number[]): number => {
    const picked = pickWeightedIndex(weights, rng);
    return indices[Math.min(Math.max(picked, 0), indices.length - 1)];
  };

  const compensateScoreDelta = (delta: number, blocked: Set<number>): boolean => {
    let remaining = delta;
    while (remaining > 0) {
      const candidates = scores
        .map((score, idx) => ({ idx, deltaToPar: score - parValues[idx] }))
        .filter((h) => !blocked.has(h.idx));
      if (!candidates.length) return false;
      const idxs = candidates.map((h) => h.idx);
      const weights = candidates.map((h) => {
        const overParWeight = h.deltaToPar > 0 ? 1.7 + h.deltaToPar * 0.8 : 0.6;
        const alreadyBig = h.deltaToPar >= 4 ? 0.35 : 1;
        return overParWeight * alreadyBig;
      });
      const chosen = pickWeightedFrom(idxs, weights);
      scores[chosen] += 1;
      remaining -= 1;
    }
    return true;
  };

  const forceScoreAtOrBelowPar = (idx: number, blocked: Set<number>): boolean => {
    const over = scores[idx] - parValues[idx];
    if (over <= 0) return true;
    const localBlocked = new Set(blocked);
    localBlocked.add(idx);
    const ok = compensateScoreDelta(over, localBlocked);
    if (!ok) return false;
    scores[idx] = parValues[idx];
    return true;
  };

  const reducePuttsToOne = (idx: number, blocked: Set<number>): boolean => {
    if (putts[idx] <= 1) return true;
    let reductionsNeeded = putts[idx] - 1;
    putts[idx] = 1;

    while (reductionsNeeded > 0) {
      const candidates = putts
        .map((value, holeIdx) => ({ idx: holeIdx, putts: value, deltaToPar: scores[holeIdx] - parValues[holeIdx] }))
        .filter((h) => h.idx !== idx && !blocked.has(h.idx) && h.putts < 4);
      if (!candidates.length) return false;
      const idxs = candidates.map((h) => h.idx);
      const weights = candidates.map((h) => 1 + (h.deltaToPar > 0 ? h.deltaToPar * 0.7 : 0.2));
      const chosen = pickWeightedFrom(idxs, weights);
      putts[chosen] += 1;
      reductionsNeeded -= 1;
    }
    return true;
  };

  const upAndDownCandidates = (includeBunker: boolean): number[] =>
    scores
      .map((_, idx) => idx)
      .filter(
        (idx) =>
          gir[idx] === 0 &&
          shortGameShotsAt(idx) === 1 &&
          !usedForSave.has(idx) &&
          (includeBunker || greensideBunkerShots[idx] === 0),
      );

  let upAndDownCreated = 0;
  while (upAndDownCreated < targetUpAndDown) {
    const candidates = upAndDownCandidates(false);
    if (!candidates.length) break;

    const weights = candidates.map((idx) => {
      const atOrBelowPar = scores[idx] <= parValues[idx] ? 2.2 : 0.7;
      const puttWeight = putts[idx] <= 1 ? 1.8 : putts[idx] === 2 ? 1.2 : 0.8;
      const bunkerWeight = greensideBunkerShots[idx] > 0 ? 0.2 : 1.15;
      return atOrBelowPar * puttWeight * bunkerWeight;
    });
    const chosen = pickWeightedFrom(candidates, weights);

    const blocked = new Set<number>(usedForSave);
    const scoreOk = forceScoreAtOrBelowPar(chosen, blocked);
    const puttOk = scoreOk ? reducePuttsToOne(chosen, blocked) : false;
    if (!scoreOk || !puttOk) {
      break;
    }

    usedForSave.add(chosen);
    if (gir[chosen] === 0 && shortGameShotsAt(chosen) === 1 && putts[chosen] <= 1 && scores[chosen] <= parValues[chosen]) {
      upAndDownCreated += 1;
    }
  }

  const sandCandidates = (): number[] =>
    scores
      .map((_, idx) => idx)
      .filter((idx) => greensideBunkerShots[idx] > 0);

  let sandCreated = 0;
  while (sandCreated < targetSandSave) {
    const candidates = sandCandidates().filter((idx) => !usedForSave.has(idx));
    if (!candidates.length) break;

    const weights = candidates.map((idx) => {
      const atOrBelowPar = scores[idx] <= parValues[idx] ? 2.5 : 0.8;
      const oneBunker = greensideBunkerShots[idx] === 1 ? 1.3 : 0.9;
      const missedGreenWeight = gir[idx] === 0 ? 1.15 : 0.8;
      return atOrBelowPar * oneBunker * missedGreenWeight;
    });
    const chosen = pickWeightedFrom(candidates, weights);
    const blocked = new Set<number>(usedForSave);
    const scoreOk = forceScoreAtOrBelowPar(chosen, blocked);
    if (!scoreOk) break;

    usedForSave.add(chosen);
    if (greensideBunkerShots[chosen] > 0 && scores[chosen] <= parValues[chosen]) {
      sandCreated += 1;
    }
  }
}

function applyDeterministicSandSaveBalancing(input: {
  scores: number[];
  parValues: number[];
  greensideBunkerShots: number[];
  roundIndex: number;
  rng: () => number;
}): void {
  const {
    scores,
    parValues,
    greensideBunkerShots,
    roundIndex,
    rng,
  } = input;

  const targetSandSave = SAND_SAVE_TARGETS_BY_ROUND[roundIndex] ?? 0;
  const maxAllowedSaves = targetSandSave + (roundIndex >= 18 ? 1 : 0);

  const pickWeightedFrom = (indices: number[], weights: number[]): number => {
    const picked = pickWeightedIndex(weights, rng);
    return indices[Math.min(Math.max(picked, 0), indices.length - 1)];
  };

  const sandSaveCandidates = () =>
    scores
      .map((score, idx) => ({
        idx,
        par: parValues[idx],
        score,
        bunker: greensideBunkerShots[idx],
      }))
      .filter((h) => h.bunker > 0 && h.score <= h.par);

  let current = sandSaveCandidates();
  let excess = current.length - maxAllowedSaves;
  if (excess <= 0) return;

  while (excess > 0) {
    const degradeCandidates = sandSaveCandidates();
    if (!degradeCandidates.length) break;

    const degradeIdxs = degradeCandidates.map((h) => h.idx);
    const degradeWeights = degradeCandidates.map((h) => {
      const delta = h.score - h.par;
      // Prefer turning a "par save" into bogey before touching birdies.
      if (delta === 0) return 2.2;
      return 0.7;
    });
    const degradeIdx = pickWeightedFrom(degradeIdxs, degradeWeights);
    scores[degradeIdx] += 1;

    const compensationCandidates = scores
      .map((score, idx) => ({ idx, par: parValues[idx], score, delta: score - parValues[idx] }))
      .filter((h) => h.idx !== degradeIdx && h.delta >= 1);
    if (!compensationCandidates.length) break;
    const compIdxs = compensationCandidates.map((h) => h.idx);
    const compWeights = compensationCandidates.map((h) => {
      const parWeight = h.par === 4 ? 1.5 : h.par === 3 ? 1.2 : 0.9;
      return parWeight * (1 + h.delta * 0.85);
    });
    const compIdx = pickWeightedFrom(compIdxs, compWeights);
    scores[compIdx] -= 1;

    current = sandSaveCandidates();
    excess = current.length - maxAllowedSaves;
  }
}

function applyDeterministicParTypeShaping(
  scores: number[],
  parValues: number[],
  roundIndex: number,
  rng: () => number,
): void {
  const targetSwaps = PAR5_SWAP_TARGETS_BY_ROUND[roundIndex] ?? 0;
  if (targetSwaps <= 0) return;

  const pickWeightedFrom = (indices: number[], weights: number[]): number => {
    const picked = pickWeightedIndex(weights, rng);
    return indices[Math.min(Math.max(picked, 0), indices.length - 1)];
  };

  let swapsApplied = 0;
  const progress = roundIndex / Math.max(1, SEASON_25_ROUNDS.length - 1);
  const par3CompShare = clamp(0.14 + progress * 0.12, 0.12, 0.3);

  while (swapsApplied < targetSwaps) {
    const improveCandidates = scores
      .map((score, idx) => ({ idx, par: parValues[idx], delta: score - parValues[idx] }))
      .filter((h) => h.par === 5 && h.delta >= 1);
    if (!improveCandidates.length) break;

    const improveIdxs = improveCandidates.map((h) => h.idx);
    const improveWeights = improveCandidates.map((h) => {
      if (h.delta >= 3) return 3.2;
      if (h.delta === 2) return 2.4;
      return 1.6;
    });
    const improveIdx = pickWeightedFrom(improveIdxs, improveWeights);

    const preferPar3Comp = rng() < par3CompShare;
    const compPrimaryPar = preferPar3Comp ? 3 : 4;
    const compFallbackPar = preferPar3Comp ? 4 : 3;
    const makeCompCandidates = (par: number) =>
      scores
        .map((score, idx) => ({ idx, par: parValues[idx], delta: score - parValues[idx] }))
        .filter((h) => h.par === par && h.idx !== improveIdx && h.delta <= 2);

    let compCandidates = makeCompCandidates(compPrimaryPar);
    if (!compCandidates.length) compCandidates = makeCompCandidates(compFallbackPar);
    if (!compCandidates.length) break;

    const compIdxs = compCandidates.map((h) => h.idx);
    const compWeights = compCandidates.map((h) => {
      if (h.delta <= -1) return 0.15;
      if (h.delta === 0) return 2.3;
      if (h.delta === 1) return 1.5;
      return 0.8;
    });
    const compIdx = pickWeightedFrom(compIdxs, compWeights);

    scores[improveIdx] -= 1;
    scores[compIdx] += 1;
    swapsApplied += 1;
  }
}

function calculateDifferential(score: number, courseRating: number, slope: number): number {
  return ((score - courseRating) * 113) / slope;
}

function calculateRollingHandicap(differentials: number[]): number | null {
  const handicapTable: Record<number, { count: number; adjustment: number }> = {
    1: { count: 0, adjustment: 0 },
    2: { count: 0, adjustment: 0 },
    3: { count: 1, adjustment: -2 },
    4: { count: 1, adjustment: -1 },
    5: { count: 1, adjustment: 0 },
    6: { count: 2, adjustment: -1 },
    7: { count: 2, adjustment: 0 },
    8: { count: 2, adjustment: 0 },
    9: { count: 3, adjustment: 0 },
    10: { count: 3, adjustment: 0 },
    11: { count: 3, adjustment: 0 },
    12: { count: 4, adjustment: 0 },
    13: { count: 4, adjustment: 0 },
    14: { count: 4, adjustment: 0 },
    15: { count: 5, adjustment: 0 },
    16: { count: 5, adjustment: 0 },
    17: { count: 6, adjustment: 0 },
    18: { count: 6, adjustment: 0 },
    19: { count: 7, adjustment: 0 },
  };

  if (differentials.length < 3) return null;

  if (differentials.length >= 20) {
    const recent20 = differentials.slice(-20);
    const lowest8 = [...recent20].sort((a, b) => a - b).slice(0, 8);
    return round1(lowest8.reduce((sum, d) => sum + d, 0) / lowest8.length);
  }

  const entry = handicapTable[differentials.length];
  const lowestN = [...differentials].sort((a, b) => a - b).slice(0, entry.count);
  const base = lowestN.length
    ? lowestN.reduce((sum, d) => sum + d, 0) / lowestN.length
    : 0;
  return round1(base + entry.adjustment);
}

async function findTeeForRound(round: RoundSeed) {
  const canonicalName = round.courseName.replace(/\s+golf club$/i, '').trim();
  const nameCandidates = Array.from(
    new Set([round.courseName.trim(), canonicalName].filter(Boolean)),
  );

  const candidates = await prisma.tee.findMany({
    where: {
      numberOfHoles: 18,
      parTotal: round.par,
      slopeRating: round.slope,
      nonPar3Holes: round.firPossible,
      course: {
        OR: nameCandidates.flatMap((name) => ([
          { clubName: { contains: name, mode: 'insensitive' as const } },
          { courseName: { contains: name, mode: 'insensitive' as const } },
        ])),
      },
    },
    include: {
      course: { select: { clubName: true, courseName: true } },
      holes: { select: { id: true, holeNumber: true, par: true }, orderBy: { holeNumber: 'asc' } },
    },
  });

  if (!candidates.length) {
    const nearMatches = await prisma.tee.findMany({
      where: {
        numberOfHoles: 18,
        parTotal: round.par,
        slopeRating: round.slope,
      },
      include: {
        course: { select: { clubName: true, courseName: true } },
      },
      take: 10,
    });
    const nearText = nearMatches
      .map((tee) => {
        const rating = tee.courseRating != null ? Number(tee.courseRating) : null;
        return `${tee.course.clubName} / ${tee.course.courseName} [tee=${tee.teeName}, rating=${rating}, slope=${tee.slopeRating}, par=${tee.parTotal}, nonPar3=${tee.nonPar3Holes}]`;
      })
      .join('\n');
    throw new Error(
      `No tee match for "${round.courseName}" (${round.courseRating}/${round.slope}, par ${round.par}, FIR ${round.firPossible}).\nClosest slope/par candidates:\n${nearText || 'none'}`,
    );
  }

  const sorted = [...candidates].sort((a, b) => {
    const aRating = a.courseRating != null ? Number(a.courseRating) : Number.POSITIVE_INFINITY;
    const bRating = b.courseRating != null ? Number(b.courseRating) : Number.POSITIVE_INFINITY;
    const aDiff = Math.abs(aRating - round.courseRating);
    const bDiff = Math.abs(bRating - round.courseRating);
    return aDiff - bDiff;
  });

  return sorted[0];
}

function buildLiveRoundHoles(round: RoundSeed, tee: NonNullable<TeeWithHoles>, roundIndex: number) {
  const holes = tee.holes;
  if (holes.length !== round.girPossible) {
    throw new Error(
      `Tee ${tee.id.toString()} has ${holes.length} holes, expected ${round.girPossible} for ${round.date}`,
    );
  }

  const seed = hashToSeed(`${round.date}|${round.courseName}|${round.score}`);
  const rng = makeRng(seed);
  const parValues = holes.map((h) => h.par);
  const scores = [...parValues];
  let remaining = round.toPar;

  // For very poor rounds, force 1-2 blow-up holes before distributing.
  if (remaining >= 15) {
    const blowups = Math.min(2, Math.floor((remaining - 11) / 4));
    for (let i = 0; i < blowups; i++) {
      const index = Math.floor(rng() * scores.length);
      scores[index] += 2;
      remaining -= 2;
    }
  }

  while (remaining > 0) {
    const weights = scores.map((score, idx) => {
      const delta = score - parValues[idx];
      if (delta >= 3) return 0.3;
      if (delta === 2) return 0.8;
      if (delta === 1) return 1.2;
      return 2.0;
    });
    const chosen = pickWeightedIndex(weights, rng);
    scores[chosen] += 1;
    remaining -= 1;
  }

  // Deterministically shape birdie availability for a believable season arc
  // while preserving each round's exact aggregate score.
  applyDeterministicBirdieShaping(scores, parValues, roundIndex, rng);
  // Nudge par-type scoring split toward a more believable profile:
  // par 5s as relative opportunity, par 4s as primary challenge.
  applyDeterministicParTypeShaping(scores, parValues, roundIndex, rng);

  const putts = Array(scores.length).fill(2);
  let puttDelta = round.putts - putts.reduce((sum, v) => sum + v, 0);
  while (puttDelta !== 0) {
    const index = Math.floor(rng() * putts.length);
    if (puttDelta > 0 && putts[index] < 4) {
      putts[index] += 1;
      puttDelta -= 1;
    } else if (puttDelta < 0 && putts[index] > 1) {
      putts[index] -= 1;
      puttDelta += 1;
    }
  }

  const penalties = Array(scores.length).fill(0);
  for (let i = 0; i < round.penalties; i++) {
    const weights = scores.map((score, idx) => {
      const delta = score - parValues[idx];
      return 1 + delta + penalties[idx] * 0.5;
    });
    const chosen = pickWeightedIndex(weights, rng);
    penalties[chosen] += 1;
  }

  const gir = Array(scores.length).fill(0);
  const girOrder = scores
    .map((score, idx) => ({
      idx,
      rank:
        (score - parValues[idx]) +
        (putts[idx] > 2 ? 0.5 : 0) +
        (penalties[idx] > 0 ? 0.8 : 0) +
        rng() * 0.15,
    }))
    .sort((a, b) => a.rank - b.rank);
  for (let i = 0; i < round.girHit && i < girOrder.length; i++) {
    gir[girOrder[i].idx] = 1;
  }

  const fir = holes.map((h) => (h.par > 3 ? 0 : null as number | null));
  const firCandidates = holes
    .map((h, idx) => ({ idx, par: h.par }))
    .filter((h) => h.par > 3)
    .map((h) => ({
      idx: h.idx,
      rank:
        penalties[h.idx] * 0.9 +
        (scores[h.idx] - parValues[h.idx]) * 0.7 +
        rng() * 0.1,
    }))
    .sort((a, b) => a.rank - b.rank);
  for (let i = 0; i < round.firHit && i < firCandidates.length; i++) {
    fir[firCandidates[i].idx] = 1;
  }

  const missedGreens = Math.max(0, round.girPossible - round.girHit);
  const progress = roundIndex / Math.max(1, SEASON_25_ROUNDS.length - 1);
  const quality = clamp((22 - round.toPar) / 13, 0, 1);

  // Keep short-game workload realistic: each missed GIR must require >=1 short-game shot,
  // with a subtle season trend from ~1.3 early toward ~1.05-1.10 late.
  const targetRatioBase = 1.3 - progress * 0.22;
  const targetRatioQualityAdj = (1 - quality) * 0.06 - quality * 0.02;
  const targetRatioNoise = (rng() - 0.5) * 0.07;
  const ratioMin = 1.24 - progress * 0.22;
  const ratioMax = 1.36 - progress * 0.24;
  const targetRatio = clamp(targetRatioBase + targetRatioQualityAdj + targetRatioNoise, ratioMin, ratioMax);
  const targetShortGameShotsBase = missedGreens > 0
    ? Math.max(missedGreens, Math.round(missedGreens * targetRatio))
    : 0;

  const bunkerRateBase = 0.14 - progress * 0.05;
  const bunkerRateQualityAdj = (1 - quality) * 0.03;
  const bunkerRateNoise = (rng() - 0.5) * 0.03;
  const bunkerRate = clamp(bunkerRateBase + bunkerRateQualityAdj + bunkerRateNoise, 0.06, 0.2);
  const targetBunkerShotsBase = missedGreens > 0
    ? clamp(Math.round(missedGreens * bunkerRate), 0, 3)
    : 0;
  const targetBunkerShots = round.greensideBunkerShotsTarget != null
    ? clamp(round.greensideBunkerShotsTarget, 0, 3)
    : targetBunkerShotsBase;
  const targetShortGameShots = round.chipsTarget != null || round.greensideBunkerShotsTarget != null
    ? Math.max(
      missedGreens > 0 ? missedGreens : 0,
      (round.chipsTarget ?? 0) + (round.greensideBunkerShotsTarget ?? targetBunkerShots),
    )
    : targetShortGameShotsBase;

  const chips = Array(scores.length).fill(0);
  const greensideBunkerShots = Array(scores.length).fill(0);
  const shortGameCandidateIdxs = scores
    .map((_, idx) => idx)
    .filter((idx) => gir[idx] === 0);

  for (let i = 0; i < targetBunkerShots; i++) {
    if (!shortGameCandidateIdxs.length) break;
    const weights = shortGameCandidateIdxs.map((idx) => {
      const delta = scores[idx] - parValues[idx];
      const overParWeight = delta > 0 ? delta * 0.65 : 0.2;
      return 1 + overParWeight + penalties[idx] * 0.85 + greensideBunkerShots[idx] * 0.8;
    });
    const chosen = shortGameCandidateIdxs[pickWeightedIndex(weights, rng)];
    greensideBunkerShots[chosen] += 1;
  }

  for (const idx of shortGameCandidateIdxs) {
    if (chips[idx] + greensideBunkerShots[idx] === 0) {
      chips[idx] = 1;
    }
  }

  let currentShortGameShots = chips.reduce((sum, value) => sum + value, 0)
    + greensideBunkerShots.reduce((sum, value) => sum + value, 0);
  let extrasRemaining = Math.max(0, targetShortGameShots - currentShortGameShots);
  while (extrasRemaining > 0 && shortGameCandidateIdxs.length) {
    const weights = shortGameCandidateIdxs.map((idx) => {
      const delta = scores[idx] - parValues[idx];
      const congestionPenalty = chips[idx] + greensideBunkerShots[idx] >= 3 ? 0.25 : 1;
      return (
        (1.35 + (delta > 0 ? delta * 0.5 : 0.15) + (putts[idx] <= 1 ? 0.55 : 0) + penalties[idx] * 0.2) *
        congestionPenalty
      );
    });
    const chosen = shortGameCandidateIdxs[pickWeightedIndex(weights, rng)];
    chips[chosen] += 1;
    extrasRemaining -= 1;
  }

  // Shape a modest number of deterministic saves so dashboard short-game
  // percentages look realistic while preserving round-level aggregate targets.
  applyDeterministicRecoveryShaping({
    scores,
    parValues,
    putts,
    gir,
    chips,
    greensideBunkerShots,
    roundIndex,
    rng,
  });
  applyDeterministicSandSaveBalancing({
    scores,
    parValues,
    greensideBunkerShots,
    roundIndex,
    rng,
  });

  const scoreTotal = scores.reduce((sum, n) => sum + n, 0);
  const firTotal = fir.reduce<number>((sum, n) => sum + (n ?? 0), 0);
  const girTotal = gir.reduce((sum, n) => sum + n, 0);
  const puttTotal = putts.reduce((sum, n) => sum + n, 0);
  const penaltyTotal = penalties.reduce((sum, n) => sum + n, 0);
  if (
    scoreTotal !== round.score ||
    firTotal !== round.firHit ||
    girTotal !== round.girHit ||
    puttTotal !== round.putts ||
    penaltyTotal !== round.penalties
  ) {
    throw new Error(
      `Live-hole generation mismatch for ${round.date}: got score=${scoreTotal}, fir=${firTotal}, gir=${girTotal}, putts=${puttTotal}, penalties=${penaltyTotal}`,
    );
  }

  return holes.map((hole, idx) => {
    const firDirection =
      fir[idx] === 0
        ? pickMissDirection(`${round.date}|${round.courseName}|fir|${hole.holeNumber}`, FIR_MISS_DISTRIBUTION)
        : null;
    const girDirection =
      gir[idx] === 0
        ? pickMissDirection(`${round.date}|${round.courseName}|gir|${hole.holeNumber}`, GIR_MISS_DISTRIBUTION)
        : null;

    return {
    holeId: hole.id,
    holeNumber: hole.holeNumber,
    par: hole.par,
    pass: 1,
    score: scores[idx],
    firHit: fir[idx],
    firDirection,
    girHit: gir[idx],
    girDirection,
    putts: putts[idx],
    penalties: penalties[idx],
    chips: chips[idx],
    greensideBunkerShots: greensideBunkerShots[idx],
    };
  });
}

async function recalcRoundTotals(roundId: bigint): Promise<void> {
  const round = await prisma.round.findUnique({
    where: { id: roundId },
    select: {
      userId: true,
      teeSegment: true,
      tee: {
        include: {
          holes: {
            select: { holeNumber: true, par: true },
            orderBy: { holeNumber: 'asc' },
          },
        },
      },
    },
  });
  if (!round) return;

  const holes = await prisma.roundHole.findMany({
    where: { roundId },
    select: {
      score: true,
      firHit: true,
      girHit: true,
      putts: true,
      penalties: true,
      chips: true,
      greensideBunkerShots: true,
    },
  });
  if (!holes.length) return;

  const segment = (round.teeSegment ?? 'full') as TeeSegment;
  const ctx = resolveTeeContext(round.tee, segment);
  const totalScore = holes.reduce((sum, h) => sum + h.score, 0);
  const toPar = totalScore - ctx.parTotal;

  const userStats = await prisma.userLeaderboardStats.findUnique({
    where: { userId: round.userId },
    select: { handicap: true },
  });
  const net = calculateNetScore(
    totalScore,
    userStats?.handicap != null ? Number(userStats.handicap) : null,
    ctx,
  );

  const sumField = <K extends keyof (typeof holes)[number]>(field: K) => {
    const vals = holes.map((h) => h[field]).filter((v): v is number => v !== null);
    return vals.length ? vals.reduce((sum, n) => sum + n, 0) : null;
  };

  await prisma.round.update({
    where: { id: roundId },
    data: {
      score: totalScore,
      toPar,
      netScore: net.netScore,
      netToPar: net.netToPar,
      firHit: sumField('firHit'),
      girHit: sumField('girHit'),
      putts: sumField('putts'),
      penalties: sumField('penalties'),
      chips: sumField('chips'),
      greensideBunkerShots: sumField('greensideBunkerShots'),
      shortGameShots: deriveShortGameShots(sumField('chips'), sumField('greensideBunkerShots')),
    },
  });
}

async function replaceExistingSeedWindow(userId: bigint, dryRun: boolean): Promise<void> {
  const seasonStart = new Date(`${SEASON_25_ROUNDS[0].date}T00:00:00.000Z`);
  const seasonEnd = new Date(`${SEASON_25_ROUNDS[SEASON_25_ROUNDS.length - 1].date}T23:59:59.999Z`);
  const seasonSignatures = new Set(
    SEASON_25_ROUNDS.map((r) => `${r.date}|${r.score}|${r.toPar}`),
  );

  const existingRounds = await prisma.round.findMany({
    where: {
      userId,
      roundContext: ROUND_CONTEXT,
      date: {
        gte: seasonStart,
        lte: seasonEnd,
      },
    },
    select: {
      id: true,
      date: true,
      score: true,
      toPar: true,
    },
  });

  const roundIdsToDelete = existingRounds
    .filter((round) => {
      const dateKey = toDateKeyUtc(round.date);
      return seasonSignatures.has(`${dateKey}|${round.score}|${round.toPar ?? 0}`);
    })
    .map((round) => round.id);

  if (!roundIdsToDelete.length) {
    console.log('Replace mode: no matching existing seeded rounds found.');
    return;
  }

  if (dryRun) {
    console.log(`[dry-run] Replace mode would remove ${roundIdsToDelete.length} existing rounds before reseed.`);
    return;
  }

  await prisma.round.deleteMany({
    where: {
      id: { in: roundIdsToDelete },
    },
  });
  console.log(`Replace mode: removed ${roundIdsToDelete.length} existing rounds before reseed.`);
}

type SeedOptions = {
  dryRun: boolean;
  withInsights: boolean;
  replaceExisting: boolean;
};

async function seedRoundsForUser(userId: bigint, options: SeedOptions): Promise<void> {
  const { dryRun, withInsights, replaceExisting } = options;
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, username: true, subscriptionTier: true },
  });
  if (!user) throw new Error(`User ${userId.toString()} not found`);

  const teeCache = new Map<string, NonNullable<TeeWithHoles>>();

  let created = 0;
  const diffs: number[] = [];
  const createdRoundIds: bigint[] = [];
  const firMissCounts = emptyMissDirectionCounts();
  const girMissCounts = emptyMissDirectionCounts();
  const scoringProfileCounts = emptyScoringProfileCounts();
  const parTypeSummaryCounts = emptyParTypeSummaryCounts();
  const shortGameRounds: Array<{ shortGameShots: number | null }> = [];
  const shortGameHoles: Array<{
    par: number | null;
    score: number | null;
    girHit: number | null;
    putts: number | null;
    chips: number | null;
    greensideBunkerShots: number | null;
  }> = [];

  if (replaceExisting) {
    await replaceExistingSeedWindow(userId, dryRun);
  }

  console.log(`Seeding ${SEASON_25_ROUNDS.length} rounds for user ${user.username} (${user.id.toString()})`);
  console.log(`Dry run: ${dryRun ? 'yes' : 'no'} | Insights: ${withInsights ? 'yes' : 'no'} | Live mode forced: ${FORCE_LIVE_ENTRY_MODE ? 'yes' : 'no'} | Short game profile: ${SHORT_GAME_PROFILE}`);

  for (const [roundIndex, round] of SEASON_25_ROUNDS.entries()) {
    const clampedFirHit = round.firHit > round.firPossible ? round.firPossible : round.firHit;
    if (clampedFirHit !== round.firHit) {
      console.warn(`[seed-adjust] Clamped FIR for ${round.date} ${round.courseName}: ${round.firHit} -> ${clampedFirHit} (possible=${round.firPossible})`);
    }
    const effectiveRound: RoundSeed = {
      ...round,
      firHit: clampedFirHit,
    };

    if (effectiveRound.toPar !== effectiveRound.score - effectiveRound.par) {
      throw new Error(`toPar mismatch for ${effectiveRound.date}: expected ${effectiveRound.score - effectiveRound.par}, got ${effectiveRound.toPar}`);
    }
    if (effectiveRound.firHit > effectiveRound.firPossible || effectiveRound.girHit > effectiveRound.girPossible) {
      throw new Error(`Stat cap exceeded for ${effectiveRound.date}`);
    }

    const cacheKey = `${effectiveRound.courseName}|${effectiveRound.courseRating}|${effectiveRound.slope}|${effectiveRound.par}|${effectiveRound.firPossible}`;
    let tee = teeCache.get(cacheKey);
    if (!tee) {
      tee = await findTeeForRound(effectiveRound);
      teeCache.set(cacheKey, tee);
      const teeRating = tee.courseRating != null ? Number(tee.courseRating) : null;
      console.log(
        `Resolved tee: ${effectiveRound.courseName} -> tee ${tee.id.toString()} (${tee.course.clubName}/${tee.course.courseName}, ${tee.teeName}, rating ${teeRating}, slope ${tee.slopeRating})`,
      );
    }

    const roundDate = new Date(`${effectiveRound.date}T12:00:00.000Z`);
    const ctx = resolveTeeContext(tee as any, TEE_SEGMENT);
    if (ctx.holes !== 18) {
      throw new Error(`Resolved tee ${tee.id.toString()} is not 18 holes for ${effectiveRound.date}`);
    }

    const differential = calculateDifferential(effectiveRound.score, effectiveRound.courseRating, effectiveRound.slope);
    diffs.push(differential);
    const projectedHcp = calculateRollingHandicap(diffs);
    const mode = FORCE_LIVE_ENTRY_MODE ? 'live' : effectiveRound.entryMode;
    const holesPayload = buildLiveRoundHoles(effectiveRound, tee, roundIndex);
    const seededChips = holesPayload.reduce((sum, hole) => sum + hole.chips, 0);
    const seededBunker = holesPayload.reduce((sum, hole) => sum + hole.greensideBunkerShots, 0);
    shortGameRounds.push({ shortGameShots: seededChips + seededBunker });
    holesPayload.forEach((hole) => {
      const delta = hole.score - hole.par;
      if (delta <= -1) {
        scoringProfileCounts.birdiePlus += 1;
      } else if (delta === 0) {
        scoringProfileCounts.par += 1;
      } else if (delta === 1) {
        scoringProfileCounts.bogey += 1;
      } else {
        scoringProfileCounts.doublePlus += 1;
      }
      scoringProfileCounts.totalHoles += 1;
      if (hole.firHit === 0 && hole.firDirection) {
        firMissCounts[hole.firDirection] += 1;
      }
      if (hole.girHit === 0 && hole.girDirection) {
        girMissCounts[hole.girDirection] += 1;
      }
      if (hole.par === 3 || hole.par === 4 || hole.par === 5) {
        parTypeSummaryCounts[hole.par].holes += 1;
        parTypeSummaryCounts[hole.par].totalScore += hole.score;
      }
      shortGameHoles.push({
        par: hole.par,
        score: hole.score,
        girHit: hole.girHit,
        putts: hole.putts,
        chips: hole.chips,
        greensideBunkerShots: hole.greensideBunkerShots,
      });
    });

    if (dryRun) {
      console.log(
        `[dry-run] ${round.date} ${round.courseName} ${round.score} (${round.toPar > 0 ? `+${round.toPar}` : round.toPar}) mode=${mode} chips=${seededChips} gsb=${seededBunker} diff=${round1(differential).toFixed(1)} hcp=${projectedHcp ?? 'n/a'}`,
      );
      continue;
    }

    const userStats = await prisma.userLeaderboardStats.findUnique({
      where: { userId },
      select: { handicap: true },
    });
    const handicapAtRound = userStats?.handicap ?? null;

    const initialScore = mode === 'live' ? 0 : effectiveRound.score;
    const initialToPar = initialScore - ctx.parTotal;
    const net = calculateNetScore(
      initialScore,
      handicapAtRound != null ? Number(handicapAtRound) : null,
      ctx,
    );

    const createdRound = await prisma.round.create({
      data: {
        userId,
        courseId: tee.courseId,
        teeId: tee.id,
        teeSegment: TEE_SEGMENT,
        holesPlayed: ctx.holes,
        roundContext: ROUND_CONTEXT,
        holeByHole: mode === 'live',
        date: roundDate,
        score: initialScore,
        toPar: initialToPar,
        netScore: net.netScore,
        netToPar: net.netToPar,
        firHit: mode === 'live' ? null : effectiveRound.firHit,
        girHit: mode === 'live' ? null : effectiveRound.girHit,
        putts: mode === 'live' ? null : effectiveRound.putts,
        penalties: mode === 'live' ? null : effectiveRound.penalties,
        chips: null,
        greensideBunkerShots: null,
        shortGameShots: null,
        notes: effectiveRound.note ?? null,
        handicapAtRound,
      },
    });

    if (mode === 'live') {
      await prisma.roundHole.createMany({
        data: holesPayload.map((h) => ({
          roundId: createdRound.id,
          holeId: h.holeId,
          pass: h.pass,
          score: h.score,
          firHit: h.firHit,
          firDirection: h.firDirection,
          girHit: h.girHit,
          girDirection: h.girDirection,
          putts: h.putts,
          penalties: h.penalties,
          chips: h.chips,
          greensideBunkerShots: h.greensideBunkerShots,
        })),
      });
      await recalcRoundTotals(createdRound.id);
    }

    const sg = await calculateStrokesGained({ userId, roundId: createdRound.id }, prisma as any);
    await prisma.roundStrokesGained.create({
      data: {
        roundId: createdRound.id,
        userId,
        sgTotal: sg.sgTotal,
        sgOffTee: sg.sgOffTee,
        sgApproach: sg.sgApproach,
        sgShortGame: sg.sgShortGame,
        sgPutting: sg.sgPutting,
        sgPenalties: sg.sgPenalties,
        sgResidual: sg.sgResidual,
        confidence: sg.confidence,
        messages: sg.messages,
        partialAnalysis: sg.partialAnalysis,
      },
    });

    await recalcLeaderboard(userId);

    if (withInsights) {
      if (user.subscriptionTier === 'premium' || user.subscriptionTier === 'lifetime') {
        await generateInsights(createdRound.id, userId);
      }
      await generateAndStoreOverallInsights(userId);
    }

    createdRoundIds.push(createdRound.id);
    created += 1;
    console.log(
      `Created #${created.toString().padStart(2, '0')} ${effectiveRound.date} ${effectiveRound.courseName} ${effectiveRound.score} mode=${mode} chips=${seededChips} gsb=${seededBunker} diff=${round1(differential).toFixed(1)} projected_hcp=${projectedHcp ?? 'n/a'}`,
    );
  }

  if (dryRun) {
    const finalHcp = calculateRollingHandicap(diffs);
    const recovery = deriveShortGameMetrics({ rounds: shortGameRounds, holes: shortGameHoles });
    console.log(`\nDry run complete. Final projected handicap from season model: ${finalHcp ?? 'n/a'}`);
    logScoringProfileSummary(scoringProfileCounts);
    logParTypeScoringSummary(parTypeSummaryCounts);
    logRecoverySummary(recovery);
    logMissDirectionSummary(firMissCounts, girMissCounts);
    return;
  }

  const latestStats = await prisma.userLeaderboardStats.findUnique({
    where: { userId },
    select: { handicap: true, totalRounds: true, averageScore: true, averageToPar: true },
  });
  console.log('\nSeed complete.');
  console.log(`Created rounds: ${created}`);
  console.log(`Round IDs: ${createdRoundIds.map((id) => id.toString()).join(', ')}`);
  console.log(`Leaderboard handicap: ${latestStats?.handicap != null ? Number(latestStats.handicap).toFixed(1) : 'n/a'}`);
  console.log(`Total rounds on leaderboard: ${latestStats?.totalRounds ?? 0}`);
  console.log(`Average score: ${latestStats?.averageScore != null ? Number(latestStats.averageScore).toFixed(1) : 'n/a'}`);
  console.log(`Average to par: ${latestStats?.averageToPar != null ? Number(latestStats.averageToPar).toFixed(1) : 'n/a'}`);
  const recovery = deriveShortGameMetrics({ rounds: shortGameRounds, holes: shortGameHoles });
  logScoringProfileSummary(scoringProfileCounts);
  logParTypeScoringSummary(parTypeSummaryCounts);
  logRecoverySummary(recovery);
  logMissDirectionSummary(firMissCounts, girMissCounts);
}

function parseUserIds(): bigint[] {
  const singleUserIdArg = getArg('userId');
  const multipleUserIdsArg = getArg('userIds');
  const rawParts = [
    ...(singleUserIdArg ? [singleUserIdArg] : []),
    ...(multipleUserIdsArg ? multipleUserIdsArg.split(',') : []),
  ];

  const cleaned = rawParts
    .map((part) => part.trim())
    .filter(Boolean);

  if (!cleaned.length) return [];
  if (cleaned.some((part) => !/^\d+$/.test(part))) {
    throw new Error('All user ids must be numeric. Example: --userIds 2,3');
  }

  const unique = Array.from(new Set(cleaned));
  return unique.map((id) => BigInt(id));
}

async function main() {
  const dryRun = hasFlag('dryRun');
  const skipInsights = hasFlag('skipInsights');
  const replaceExisting = hasFlag('replace');

  let userIds: bigint[] = [];
  try {
    userIds = parseUserIds();
  } catch (error) {
    console.error(error instanceof Error ? error.message : 'Failed to parse user ids');
    process.exit(1);
  }

  if (!userIds.length) {
    console.error('Usage: tsx scripts/seed-test-rounds.ts --userId <numeric_user_id> [--dryRun] [--skipInsights] [--replace]');
    console.error('   or: tsx scripts/seed-test-rounds.ts --userIds <id1,id2,...> [--dryRun] [--skipInsights] [--replace]');
    process.exit(1);
  }

  try {
    for (const userId of userIds) {
      await seedRoundsForUser(userId, {
        dryRun,
        withInsights: !skipInsights,
        replaceExisting,
      });
    }
    process.exit(0);
  } catch (error) {
    console.error('Failed to seed test rounds:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
