import { prisma } from '@/lib/db';
import { resolveTeeContext, type TeeSegment } from '@/lib/tee/resolveTeeContext';
import { resolveRoundEntryMode } from './evidence';
import { applyPlayedHoleOrder, hasCompleteHoleScores } from './features';
import { buildRoundIdentityInputHash } from './resolve';
import type { RoundIdentityHoleInput, RoundIdentityResolverInput } from './types';

export type RoundIdentityHistoryContext = 'real' | 'simulator' | 'practice';

export type RoundOrderingEntry = {
  id: bigint;
  score: number;
  date: Date;
};

export function resolveHistoryRoundContext(raw: unknown): RoundIdentityHistoryContext {
  if (raw === 'simulator' || raw === 'practice' || raw === 'real') return raw;
  return 'real';
}
export function resolveRoundOrdinalContext(roundId: bigint, rounds: RoundOrderingEntry[]): {
  roundNumber: number;
  previousScore: number | null;
  totalRounds: number;
} {
  const index = rounds.findIndex((item) => item.id === roundId);
  if (index < 0) throw new Error('Round not found in user history');
  return {
    roundNumber: index + 1,
    previousScore: index > 0 ? Number(rounds[index - 1].score) : null,
    totalRounds: rounds.length,
  };
}

export function resolveRoundPlayedDateTime(round: { date?: Date | string | null }): Date {
  const rawDate = round?.date;
  const playedAt = rawDate instanceof Date ? rawDate : rawDate != null ? new Date(rawDate) : null;
  if (!playedAt || Number.isNaN(playedAt.getTime())) {
    throw new Error('Round missing valid played date-time');
  }
  return playedAt;
}

export async function getRoundsInHistoricalPlayOrder(input: {
  userId: bigint;
  roundContext: RoundIdentityHistoryContext;
  targetRoundId: bigint;
  targetRoundDate: Date;
}): Promise<RoundOrderingEntry[]> {
  const rounds = await prisma.round.findMany({
    where: {
      userId: input.userId,
      roundContext: input.roundContext,
      OR: [{ date: { lt: input.targetRoundDate } }, { id: input.targetRoundId }],
    },
    select: { id: true, score: true, date: true },
    orderBy: [{ date: 'asc' }, { id: 'asc' }],
  });
  return rounds as RoundOrderingEntry[];
}

export async function getLastHistoricalRounds(input: {
  userId: bigint;
  roundContext: RoundIdentityHistoryContext;
  targetRoundId: bigint;
  targetRoundDate: Date;
  take: number;
}) {
  return prisma.round.findMany({
    where: {
      userId: input.userId,
      roundContext: input.roundContext,
      id: { not: input.targetRoundId },
      date: { lt: input.targetRoundDate },
    },
    orderBy: [{ date: 'desc' }, { id: 'desc' }],
    take: input.take,
    include: {
      tee: {
        include: {
          holes: { select: { holeNumber: true, par: true }, orderBy: { holeNumber: 'asc' } },
        },
      },
    },
  });
}

export function mapRoundIdentityHoles(input: {
  entryMode: ReturnType<typeof resolveRoundEntryMode>;
  holesPlayed: number;
  roundHoles: any[];
  startHoleNumber?: number | null;
}): { roundHoles: RoundIdentityHoleInput[]; hasTrustedHoleByHole: boolean } {
  if (input.entryMode !== 'live_round') {
    return { roundHoles: [], hasTrustedHoleByHole: false };
  }

  const canonical: RoundIdentityHoleInput[] = Array.isArray(input.roundHoles)
    ? input.roundHoles.map((hole: any) => ({
        holeNumber: hole?.hole?.holeNumber != null ? Number(hole.hole.holeNumber) : null,
        par: hole?.hole?.par != null ? Number(hole.hole.par) : null,
        score: hole?.score != null ? Number(hole.score) : null,
        pass: hole?.pass != null ? Number(hole.pass) : null,
        firHit: hole?.firHit != null ? Number(hole.firHit) : null,
        girHit: hole?.girHit != null ? Number(hole.girHit) : null,
        putts: hole?.putts != null ? Number(hole.putts) : null,
        penalties: hole?.penalties != null ? Number(hole.penalties) : null,
        chips: hole?.chips != null ? Number(hole.chips) : null,
        greensideBunkerShots:
          hole?.greensideBunkerShots != null ? Number(hole.greensideBunkerShots) : null,
        firDirection: hole?.firDirection ?? null,
        girDirection: hole?.girDirection ?? null,
      }))
    : [];
  const mapped = applyPlayedHoleOrder(canonical, input.startHoleNumber);
  const hasTrustedHoleByHole = hasCompleteHoleScores({
    holesPlayed: input.holesPlayed,
    roundHoles: mapped,
  });
  return {
    roundHoles: hasTrustedHoleByHole ? mapped : [],
    hasTrustedHoleByHole,
  };
}

export function buildRoundIdentityResolverInput(input: {
  roundId: bigint;
  round: any;
  sgComponents: any | null;
  holesPlayed: number;
  parTotal: number;
  toPar: number;
  roundNumber: number;
  avgScore: number | null;
  fairwaysPossible: number;
}): RoundIdentityResolverInput {
  const entryMode = resolveRoundEntryMode(input.round?.holeByHole);
  const mappedHoles = mapRoundIdentityHoles({
    entryMode,
    holesPlayed: input.holesPlayed,
    roundHoles: input.round?.roundHoles ?? [],
    startHoleNumber: input.round?.finalizedLiveRoundSession?.startHoleNumber ?? null,
  });
  const normalizedSgConfidence = input.sgComponents?.confidence
    ? String(input.sgComponents.confidence).toLowerCase()
    : null;
  const sgConfidence =
    normalizedSgConfidence === 'high' ||
    normalizedSgConfidence === 'medium' ||
    normalizedSgConfidence === 'low'
      ? normalizedSgConfidence
      : null;

  return {
    roundId: input.roundId.toString(),
    score: Number(input.round.score),
    parTotal: input.parTotal,
    toPar: input.toPar,
    holesPlayed: input.holesPlayed,
    teeSegment: input.round?.teeSegment ?? null,
    roundContext: input.round?.roundContext ?? null,
    roundsLifetime: input.roundNumber,
    avgScoreRecent: input.avgScore != null && Number.isFinite(input.avgScore) ? input.avgScore : null,
    handicapAtRound:
      input.round?.handicapAtRound != null ? Number(input.round.handicapAtRound) : null,
    fairwaysPossible: input.fairwaysPossible,
    firHit: input.round?.firHit != null ? Number(input.round.firHit) : null,
    girHit: input.round?.girHit != null ? Number(input.round.girHit) : null,
    putts: input.round?.putts != null ? Number(input.round.putts) : null,
    penalties: input.round?.penalties != null ? Number(input.round.penalties) : null,
    chips: input.round?.chips != null ? Number(input.round.chips) : null,
    greensideBunkerShots:
      input.round?.greensideBunkerShots != null ? Number(input.round.greensideBunkerShots) : null,
    shortGameShots:
      input.round?.shortGameShots != null ? Number(input.round.shortGameShots) : null,
    sgTotal: input.sgComponents?.sgTotal != null ? Number(input.sgComponents.sgTotal) : null,
    sgOffTee: input.sgComponents?.sgOffTee != null ? Number(input.sgComponents.sgOffTee) : null,
    sgApproach:
      input.sgComponents?.sgApproach != null ? Number(input.sgComponents.sgApproach) : null,
    sgShortGame:
      input.sgComponents?.sgShortGame != null ? Number(input.sgComponents.sgShortGame) : null,
    sgPutting: input.sgComponents?.sgPutting != null ? Number(input.sgComponents.sgPutting) : null,
    sgPenalties:
      input.sgComponents?.sgPenalties != null ? Number(input.sgComponents.sgPenalties) : null,
    sgResidual:
      input.sgComponents?.sgResidual != null ? Number(input.sgComponents.sgResidual) : null,
    sgConfidence,
    sgPartialAnalysis:
      input.sgComponents?.partialAnalysis != null ? Boolean(input.sgComponents.partialAnalysis) : null,
    entryMode,
    roundHoles: mappedHoles.roundHoles,
    hasTrustedHoleByHole: mappedHoles.hasTrustedHoleByHole,
  };
}

export async function computeCurrentRoundIdentityHash(
  roundId: bigint,
  userId: bigint,
): Promise<string | null> {
  const round = await prisma.round.findUnique({
    where: { id: roundId },
    include: {
      tee: {
        include: {
          holes: { select: { holeNumber: true, par: true }, orderBy: { holeNumber: 'asc' } },
        },
      },
      finalizedLiveRoundSession: { select: { startHoleNumber: true } },
      roundHoles: {
        select: {
          pass: true,
          score: true,
          firHit: true,
          girHit: true,
          putts: true,
          penalties: true,
          chips: true,
          greensideBunkerShots: true,
          firDirection: true,
          girDirection: true,
          hole: { select: { holeNumber: true, par: true } },
        },
        orderBy: [{ pass: 'asc' }, { hole: { holeNumber: 'asc' } }],
      },
    },
  });
  if (!round || round.userId !== userId) return null;

  const currentSegment = ((round as any).teeSegment ?? 'full') as TeeSegment;
  const currentContext = resolveTeeContext(round.tee, currentSegment);
  const currentHolesPlayed = currentContext.holes;
  const historyRoundContext = resolveHistoryRoundContext((round as any).roundContext);
  const targetRoundDate = resolveRoundPlayedDateTime(round as any);
  const roundsInOrder = await getRoundsInHistoricalPlayOrder({
    userId,
    roundContext: historyRoundContext,
    targetRoundId: roundId,
    targetRoundDate,
  });
  const { roundNumber } = resolveRoundOrdinalContext(roundId, roundsInOrder);
  const last5Rounds = await getLastHistoricalRounds({
    userId,
    roundContext: historyRoundContext,
    targetRoundId: roundId,
    targetRoundDate,
    take: 5,
  });
  let avgScore: number | null = null;
  if (last5Rounds.length > 0) {
    const avgScorePerHole =
      last5Rounds.reduce((sum, item) => {
        const seg = ((item as any).teeSegment ?? 'full') as TeeSegment;
        const ctx = resolveTeeContext(item.tee, seg);
        return sum + Number(item.score) / ctx.holes;
      }, 0) / last5Rounds.length;
    avgScore = avgScorePerHole * currentHolesPlayed;
  }
  const sgComponents = await prisma.roundStrokesGained.findUnique({ where: { roundId } });
  const resolverInput = buildRoundIdentityResolverInput({
    roundId,
    round,
    sgComponents,
    holesPlayed: currentHolesPlayed,
    parTotal: currentContext.parTotal,
    toPar: Number(round.score) - currentContext.parTotal,
    roundNumber,
    avgScore,
    fairwaysPossible: currentContext.nonPar3Holes,
  });
  return buildRoundIdentityInputHash(resolverInput);
}
