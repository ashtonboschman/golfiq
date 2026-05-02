import 'dotenv/config';
import { prisma } from '../lib/db';
import { recalcLeaderboard } from '../lib/utils/leaderboard';
import { calculateNetScore } from '../lib/utils/handicap';
import { calculateStrokesGained } from '../lib/utils/strokesGained';
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
  entryMode: 'live' | 'after';
  note?: string;
};

const ROUND_CONTEXT = 'real' as const;
const TEE_SEGMENT: TeeSegment = 'full';

// 25-round improving season profile: ~15 -> ~11 handicap, with realistic variance.
const SEASON_25_ROUNDS: RoundSeed[] = [
  { date: '2026-05-03', courseName: 'Portage Golf Club', par: 70, courseRating: 70.3, slope: 123, score: 89, toPar: 19, firHit: 6, firPossible: 14, girHit: 4, girPossible: 18, putts: 37, penalties: 4, entryMode: 'live', note: 'Early season rust; penalty-heavy.' },
  { date: '2026-05-08', courseName: 'MacGregor', par: 70, courseRating: 68.2, slope: 114, score: 86, toPar: 16, firHit: 6, firPossible: 12, girHit: 5, girPossible: 18, putts: 36, penalties: 3, entryMode: 'after' },
  { date: '2026-05-14', courseName: 'Bridges', par: 72, courseRating: 72.7, slope: 127, score: 94, toPar: 22, firHit: 5, firPossible: 14, girHit: 3, girPossible: 18, putts: 38, penalties: 5, entryMode: 'live', note: 'Noticeably bad round #1.' },
  { date: '2026-05-19', courseName: 'Gladstone', par: 72, courseRating: 71.1, slope: 113, score: 88, toPar: 16, firHit: 6, firPossible: 14, girHit: 6, girPossible: 18, putts: 36, penalties: 2, entryMode: 'after' },
  { date: '2026-05-24', courseName: 'MacGregor', par: 70, courseRating: 68.2, slope: 114, score: 85, toPar: 15, firHit: 6, firPossible: 12, girHit: 6, girPossible: 18, putts: 35, penalties: 2, entryMode: 'after' },
  { date: '2026-05-29', courseName: 'Blumberg', par: 72, courseRating: 70.2, slope: 121, score: 88, toPar: 16, firHit: 5, firPossible: 14, girHit: 5, girPossible: 18, putts: 36, penalties: 4, entryMode: 'after', note: 'Plateau stretch #1 starts.' },
  { date: '2026-06-03', courseName: 'MacGregor', par: 70, courseRating: 68.2, slope: 114, score: 84, toPar: 14, firHit: 6, firPossible: 12, girHit: 6, girPossible: 18, putts: 35, penalties: 2, entryMode: 'live' },
  { date: '2026-06-08', courseName: 'Portage Golf Club', par: 70, courseRating: 70.3, slope: 123, score: 86, toPar: 16, firHit: 5, firPossible: 14, girHit: 5, girPossible: 18, putts: 36, penalties: 3, entryMode: 'after' },
  { date: '2026-06-13', courseName: 'MacGregor', par: 70, courseRating: 68.2, slope: 114, score: 83, toPar: 13, firHit: 7, firPossible: 12, girHit: 6, girPossible: 18, putts: 35, penalties: 2, entryMode: 'after' },
  { date: '2026-06-19', courseName: 'Bridges', par: 72, courseRating: 72.7, slope: 127, score: 91, toPar: 19, firHit: 4, firPossible: 14, girHit: 4, girPossible: 18, putts: 37, penalties: 4, entryMode: 'after', note: 'Noticeably bad round #2.' },
  { date: '2026-06-24', courseName: 'MacGregor', par: 70, courseRating: 68.2, slope: 114, score: 81, toPar: 11, firHit: 6, firPossible: 12, girHit: 8, girPossible: 18, putts: 33, penalties: 2, entryMode: 'live', note: 'Breakthrough round #1.' },
  { date: '2026-06-29', courseName: 'Gladstone', par: 72, courseRating: 71.1, slope: 113, score: 85, toPar: 13, firHit: 6, firPossible: 14, girHit: 6, girPossible: 18, putts: 35, penalties: 2, entryMode: 'after' },
  { date: '2026-07-04', courseName: 'MacGregor', par: 70, courseRating: 68.2, slope: 114, score: 82, toPar: 12, firHit: 6, firPossible: 12, girHit: 7, girPossible: 18, putts: 34, penalties: 2, entryMode: 'after', note: 'Plateau stretch #2 starts.' },
  { date: '2026-07-10', courseName: 'Portage Golf Club', par: 70, courseRating: 70.3, slope: 123, score: 82, toPar: 12, firHit: 7, firPossible: 14, girHit: 7, girPossible: 18, putts: 34, penalties: 1, entryMode: 'live' },
  { date: '2026-07-16', courseName: 'MacGregor', par: 70, courseRating: 68.2, slope: 114, score: 82, toPar: 12, firHit: 6, firPossible: 12, girHit: 6, girPossible: 18, putts: 35, penalties: 2, entryMode: 'after' },
  { date: '2026-07-22', courseName: 'Blumberg', par: 72, courseRating: 70.2, slope: 121, score: 84, toPar: 12, firHit: 6, firPossible: 14, girHit: 6, girPossible: 18, putts: 35, penalties: 2, entryMode: 'after' },
  { date: '2026-07-28', courseName: 'MacGregor', par: 70, courseRating: 68.2, slope: 114, score: 80, toPar: 10, firHit: 7, firPossible: 12, girHit: 8, girPossible: 18, putts: 33, penalties: 1, entryMode: 'live', note: 'Breakthrough round #2.' },
  { date: '2026-08-02', courseName: 'Bridges', par: 72, courseRating: 72.7, slope: 127, score: 85, toPar: 13, firHit: 6, firPossible: 14, girHit: 7, girPossible: 18, putts: 34, penalties: 2, entryMode: 'after' },
  { date: '2026-08-08', courseName: 'MacGregor', par: 70, courseRating: 68.2, slope: 114, score: 80, toPar: 10, firHit: 6, firPossible: 12, girHit: 8, girPossible: 18, putts: 34, penalties: 1, entryMode: 'after' },
  { date: '2026-08-14', courseName: 'Gladstone', par: 72, courseRating: 71.1, slope: 113, score: 84, toPar: 12, firHit: 6, firPossible: 14, girHit: 7, girPossible: 18, putts: 35, penalties: 2, entryMode: 'after' },
  { date: '2026-08-20', courseName: 'MacGregor', par: 70, courseRating: 68.2, slope: 114, score: 79, toPar: 9, firHit: 7, firPossible: 12, girHit: 8, girPossible: 18, putts: 33, penalties: 1, entryMode: 'live' },
  { date: '2026-08-26', courseName: 'Portage Golf Club', par: 70, courseRating: 70.3, slope: 123, score: 82, toPar: 12, firHit: 6, firPossible: 14, girHit: 7, girPossible: 18, putts: 35, penalties: 2, entryMode: 'after' },
  { date: '2026-09-01', courseName: 'MacGregor', par: 70, courseRating: 68.2, slope: 114, score: 84, toPar: 14, firHit: 5, firPossible: 12, girHit: 5, girPossible: 18, putts: 36, penalties: 3, entryMode: 'after', note: 'Late-season setback.' },
  { date: '2026-09-08', courseName: 'Blumberg', par: 72, courseRating: 70.2, slope: 121, score: 81, toPar: 9, firHit: 7, firPossible: 14, girHit: 8, girPossible: 18, putts: 35, penalties: 2, entryMode: 'live' },
  { date: '2026-09-14', courseName: 'MacGregor', par: 70, courseRating: 68.2, slope: 114, score: 79, toPar: 9, firHit: 6, firPossible: 12, girHit: 8, girPossible: 18, putts: 34, penalties: 1, entryMode: 'after' },
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

function buildLiveRoundHoles(round: RoundSeed, tee: NonNullable<TeeWithHoles>) {
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

  return holes.map((hole, idx) => ({
    holeId: hole.id,
    pass: 1,
    score: scores[idx],
    firHit: fir[idx],
    girHit: gir[idx],
    putts: putts[idx],
    penalties: penalties[idx],
  }));
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
    select: { score: true, firHit: true, girHit: true, putts: true, penalties: true },
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
    },
  });
}

async function seedRoundsForUser(userId: bigint, dryRun: boolean, withInsights: boolean): Promise<void> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, username: true, subscriptionTier: true },
  });
  if (!user) throw new Error(`User ${userId.toString()} not found`);

  const teeCache = new Map<string, NonNullable<TeeWithHoles>>();

  let created = 0;
  const diffs: number[] = [];
  const createdRoundIds: bigint[] = [];

  console.log(`Seeding ${SEASON_25_ROUNDS.length} rounds for user ${user.username} (${user.id.toString()})`);
  console.log(`Dry run: ${dryRun ? 'yes' : 'no'} | Insights: ${withInsights ? 'yes' : 'no'}`);

  for (const round of SEASON_25_ROUNDS) {
    if (round.toPar !== round.score - round.par) {
      throw new Error(`toPar mismatch for ${round.date}: expected ${round.score - round.par}, got ${round.toPar}`);
    }
    if (round.firHit > round.firPossible || round.girHit > round.girPossible) {
      throw new Error(`Stat cap exceeded for ${round.date}`);
    }

    const cacheKey = `${round.courseName}|${round.courseRating}|${round.slope}|${round.par}|${round.firPossible}`;
    let tee = teeCache.get(cacheKey);
    if (!tee) {
      tee = await findTeeForRound(round);
      teeCache.set(cacheKey, tee);
      const teeRating = tee.courseRating != null ? Number(tee.courseRating) : null;
      console.log(
        `Resolved tee: ${round.courseName} -> tee ${tee.id.toString()} (${tee.course.clubName}/${tee.course.courseName}, ${tee.teeName}, rating ${teeRating}, slope ${tee.slopeRating})`,
      );
    }

    const roundDate = new Date(`${round.date}T12:00:00.000Z`);
    const ctx = resolveTeeContext(tee as any, TEE_SEGMENT);
    if (ctx.holes !== 18) {
      throw new Error(`Resolved tee ${tee.id.toString()} is not 18 holes for ${round.date}`);
    }

    const differential = calculateDifferential(round.score, round.courseRating, round.slope);
    diffs.push(differential);
    const projectedHcp = calculateRollingHandicap(diffs);

    if (dryRun) {
      console.log(
        `[dry-run] ${round.date} ${round.courseName} ${round.score} (${round.toPar > 0 ? `+${round.toPar}` : round.toPar}) mode=${round.entryMode} diff=${round1(differential).toFixed(1)} hcp=${projectedHcp ?? 'n/a'}`,
      );
      continue;
    }

    const userStats = await prisma.userLeaderboardStats.findUnique({
      where: { userId },
      select: { handicap: true },
    });
    const handicapAtRound = userStats?.handicap ?? null;

    const initialScore = round.entryMode === 'live' ? 0 : round.score;
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
        holeByHole: round.entryMode === 'live',
        date: roundDate,
        score: initialScore,
        toPar: initialToPar,
        netScore: net.netScore,
        netToPar: net.netToPar,
        firHit: round.entryMode === 'live' ? null : round.firHit,
        girHit: round.entryMode === 'live' ? null : round.girHit,
        putts: round.entryMode === 'live' ? null : round.putts,
        penalties: round.entryMode === 'live' ? null : round.penalties,
        notes: round.note ?? null,
        handicapAtRound,
      },
    });

    if (round.entryMode === 'live') {
      const holesPayload = buildLiveRoundHoles(round, tee);
      await prisma.roundHole.createMany({
        data: holesPayload.map((h) => ({
          roundId: createdRound.id,
          holeId: h.holeId,
          pass: h.pass,
          score: h.score,
          firHit: h.firHit,
          girHit: h.girHit,
          putts: h.putts,
          penalties: h.penalties,
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
      `Created #${created.toString().padStart(2, '0')} ${round.date} ${round.courseName} ${round.score} mode=${round.entryMode} diff=${round1(differential).toFixed(1)} projected_hcp=${projectedHcp ?? 'n/a'}`,
    );
  }

  if (dryRun) {
    const finalHcp = calculateRollingHandicap(diffs);
    console.log(`\nDry run complete. Final projected handicap from season model: ${finalHcp ?? 'n/a'}`);
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
}

async function main() {
  const userIdArg = getArg('userId');
  const dryRun = hasFlag('dryRun');
  const skipInsights = hasFlag('skipInsights');

  if (!userIdArg || !/^\d+$/.test(userIdArg)) {
    console.error('Usage: tsx scripts/seed-test-rounds.ts --userId <numeric_user_id> [--dryRun] [--skipInsights]');
    process.exit(1);
  }

  const userId = BigInt(userIdArg);

  try {
    await seedRoundsForUser(userId, dryRun, !skipInsights);
    process.exit(0);
  } catch (error) {
    console.error('Failed to seed test rounds:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
