import { NextRequest } from 'next/server';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db';
import { requireAuth, errorResponse, successResponse } from '@/lib/api-auth';
import { isPremiumUser } from '@/lib/subscription';
import { resolveTeeContext, type TeeSegment } from '@/lib/tee/resolveTeeContext';
import {
  type OverallRoundPoint,
  OVERALL_SG_MIN_RECENT_COVERAGE,
  type StatsMode,
  buildDeterministicOverallCards,
  computeOverallDataHash,
  computeOverallPayload,
  normalizeByMode,
  pickDeterministicDrillSeeded,
  shouldAutoRefreshOverall,
} from '@/lib/insights/overall';
import { buildCachedGameTrends, computeGameTrendsInputHash } from '@/lib/insights/gameTrends/cache';
import { parseCachedGameTrends } from '@/lib/insights/gameTrends/types';
import { projectGameTrendsForViewer } from '@/lib/insights/gameTrends/presentation';
import { isShortGameOpportunityEligible, type TrendEvidenceRound } from '@/lib/insights/trendEvidence';

const OVERALL_INSIGHTS_LOAD_ERROR = 'GolfIQ couldn’t load insights right now. Please try again.';

function parseMode(searchParams: URLSearchParams): StatsMode {
  const mode = searchParams.get('statsMode');
  if (mode === '9' || mode === '18' || mode === 'combined') return mode;
  return 'combined';
}

function selectCardsForMode(payload: any, mode: StatsMode): any {
  const next = payload && typeof payload === 'object' ? { ...payload } : {};
  const rawCards = Array.isArray(next.cards) ? next.cards : [];
  const rawCardsByMode = next.cards_by_mode && typeof next.cards_by_mode === 'object'
    ? next.cards_by_mode
    : {
        combined: rawCards,
        '9': rawCards,
        '18': rawCards,
      };
  next.cards_by_mode = {
    combined: Array.isArray(rawCardsByMode.combined) ? rawCardsByMode.combined : rawCards,
    '9': Array.isArray(rawCardsByMode['9']) ? rawCardsByMode['9'] : rawCards,
    '18': Array.isArray(rawCardsByMode['18']) ? rawCardsByMode['18'] : rawCards,
  };
  next.cards = next.cards_by_mode[mode] ?? next.cards_by_mode.combined ?? rawCards;
  return next;
}

function applyTierSafety(payload: any, isPremium: boolean, roundsUsed: number): any {
  const next = payload && typeof payload === 'object'
    ? JSON.parse(JSON.stringify(payload))
    : {};
  const prevTier =
    next.tier_context && typeof next.tier_context === 'object' ? next.tier_context : {};
  next.tier_context = {
    ...prevTier,
    isPremium,
    baseline: isPremium ? 'alltime' : 'last20',
    maxRoundsUsed: isPremium ? roundsUsed : Math.min(roundsUsed, 20),
    recentWindow: 5,
  };

  const hasProjectionData = isPremium && roundsUsed >= 10;
  if (!hasProjectionData && next.projection && typeof next.projection === 'object') {
    next.projection = {
      ...next.projection,
      projectedScoreIn10: null,
      projectedHandicapIn10: null,
    };
  }
  if (next.projection_by_mode && typeof next.projection_by_mode === 'object') {
    for (const mode of Object.keys(next.projection_by_mode)) {
      const modeProjection = next.projection_by_mode[mode];
      if (!modeProjection || typeof modeProjection !== 'object') continue;
      if (!hasProjectionData) {
        next.projection_by_mode[mode] = {
          ...modeProjection,
          projectedScoreIn10: null,
          scoreLow: null,
          scoreHigh: null,
          handicapCurrent: null,
          projectedHandicapIn10: null,
          handicapLow: null,
          handicapHigh: null,
        };
      }
    }
  }

  if (!isPremium) {
    next.sg_locked = true;
    delete next.sg;
    if (next.analysis && typeof next.analysis === 'object') {
      if (next.analysis.strength && typeof next.analysis.strength === 'object') next.analysis.strength.value = null;
      if (next.analysis.opportunity && typeof next.analysis.opportunity === 'object') next.analysis.opportunity.value = null;
    }
    if (next.mode_payload && typeof next.mode_payload === 'object') {
      for (const mode of Object.keys(next.mode_payload)) {
        const modePayload = next.mode_payload[mode];
        if (modePayload?.kpis && typeof modePayload.kpis === 'object') {
          modePayload.kpis.avgSgTotalRecent = null;
        }
        if (modePayload?.narrative?.strength) modePayload.narrative.strength.value = null;
        if (modePayload?.narrative?.opportunity) modePayload.narrative.opportunity.value = null;
        if (modePayload && typeof modePayload === 'object') delete modePayload.sgComponents;
        if (modePayload?.trend && typeof modePayload.trend === 'object') delete modePayload.trend.sgTotal;
      }
    }
    if (next.projection && typeof next.projection === 'object') {
      next.projection = {
        ...next.projection,
        projectedScoreIn10: null,
        handicapCurrent: null,
        projectedHandicapIn10: null,
      };
    }
    if ('projection_ranges' in next) {
      delete next.projection_ranges;
    }
  } else {
    next.sg_locked = false;
    if (!hasProjectionData && 'projection_ranges' in next) {
      delete next.projection_ranges;
    }
  }

  return next;
}

async function loadRoundsForOverall(
  userId: bigint,
  options?: {
    maxRounds?: number | null;
    holesPlayed?: 9 | 18;
  },
): Promise<OverallRoundPoint[]> {
  const take =
    options?.maxRounds != null && Number.isFinite(options.maxRounds) && options.maxRounds > 0
      ? Math.floor(options.maxRounds)
      : undefined;
  const rounds = await prisma.round.findMany({
    where: {
      userId,
      roundContext: 'real',
      date: { lte: new Date() },
      ...(options?.holesPlayed != null ? { holesPlayed: options.holesPlayed } : {}),
    },
    include: {
      tee: { include: { holes: { select: { holeNumber: true, par: true }, orderBy: { holeNumber: 'asc' } } } },
      roundStrokesGained: true,
      roundHoles: {
        select: {
          penalties: true,
          firDirection: true,
          girDirection: true,
        },
      },
    },
    orderBy: [{ date: 'desc' }, { createdAt: 'desc' }, { id: 'desc' }],
    ...(take != null ? { take } : {}),
  });

  return rounds.map((r: any) => {
    const seg = ((r.teeSegment ?? 'full') as TeeSegment);
    const ctx = resolveTeeContext(r.tee, seg);
    const penaltiesFromHoles = Array.isArray(r.roundHoles)
      ? r.roundHoles
          .map((h: any) => (h?.penalties != null ? Number(h.penalties) : null))
          .filter((n: number | null): n is number => n != null && Number.isFinite(n))
      : [];
    const derivedPenalties =
      penaltiesFromHoles.length > 0
        ? penaltiesFromHoles.reduce((sum: number, n: number) => sum + n, 0)
        : null;

    return {
      id: r.id,
      date: r.date,
      createdAt: r.createdAt ?? r.date,
      holes: ctx.holes,
      nonPar3Holes: ctx.nonPar3Holes,
      score: Number(r.score),
      toPar: r.toPar != null ? Number(r.toPar) : Number(r.score) - ctx.parTotal,
      firHit: r.firHit != null ? Number(r.firHit) : null,
      girHit: r.girHit != null ? Number(r.girHit) : null,
      putts: r.putts != null ? Number(r.putts) : null,
      penalties: r.penalties != null ? Number(r.penalties) : derivedPenalties,
      shortGameShots: r.shortGameShots != null ? Number(r.shortGameShots) : null,
      handicapAtRound: r.handicapAtRound != null ? Number(r.handicapAtRound) : null,
      sgTotal: r.roundStrokesGained?.sgTotal != null ? Number(r.roundStrokesGained.sgTotal) : null,
      sgOffTee: r.roundStrokesGained?.sgOffTee != null ? Number(r.roundStrokesGained.sgOffTee) : null,
      sgApproach: r.roundStrokesGained?.sgApproach != null ? Number(r.roundStrokesGained.sgApproach) : null,
      sgShortGame: (r.roundStrokesGained as any)?.sgShortGame != null ? Number((r.roundStrokesGained as any).sgShortGame) : null,
      sgPutting: r.roundStrokesGained?.sgPutting != null ? Number(r.roundStrokesGained.sgPutting) : null,
      sgPenalties: r.roundStrokesGained?.sgPenalties != null ? Number(r.roundStrokesGained.sgPenalties) : null,
      sgResidual: r.roundStrokesGained?.sgResidual != null ? Number(r.roundStrokesGained.sgResidual) : null,
      sgPartialAnalysis: r.roundStrokesGained?.partialAnalysis ?? null,
      firDirections: Array.isArray(r.roundHoles)
        ? r.roundHoles.map((h: any) => h?.firDirection ?? null)
        : [],
      girDirections: Array.isArray(r.roundHoles)
        ? r.roundHoles.map((h: any) => h?.girDirection ?? null)
        : [],
      teeContextKey: [r.teeId?.toString?.() ?? r.teeId ?? 'none', seg, ctx.holes, ctx.parTotal, ctx.nonPar3Holes].join('|'),
    } as OverallRoundPoint;
  });
}

function compareOverallRoundsDescending(left: OverallRoundPoint, right: OverallRoundPoint): number {
  const dateDelta = right.date.getTime() - left.date.getTime();
  if (dateDelta !== 0) return dateDelta;
  const createdDelta = (right.createdAt ?? right.date).getTime() - (left.createdAt ?? left.date).getTime();
  if (createdDelta !== 0) return createdDelta;
  if (left.id === right.id) return 0;
  return left.id > right.id ? -1 : 1;
}

async function loadOverallRoundEnvelope(userId: bigint, isPremium: boolean): Promise<OverallRoundPoint[]> {
  if (isPremium) return loadRoundsForOverall(userId);

  // Keep free history bounded while retaining enough source rows for each mode
  // to independently resolve its latest 20-round evidence envelope.
  const [combined, nineHole, eighteenHole] = await Promise.all([
    loadRoundsForOverall(userId, { maxRounds: 20 }),
    loadRoundsForOverall(userId, { maxRounds: 20, holesPlayed: 9 }),
    loadRoundsForOverall(userId, { maxRounds: 20, holesPlayed: 18 }),
  ]);
  const boundedUnion = new Map<bigint, OverallRoundPoint>();
  for (const round of [...combined, ...nineHole, ...eighteenHole]) boundedUnion.set(round.id, round);
  return [...boundedUnion.values()].sort(compareOverallRoundsDescending);
}

function toGameTrendRounds(rounds: OverallRoundPoint[]): TrendEvidenceRound[] {
  return rounds.map((round) => ({
    roundId: round.id.toString(),
    date: round.date,
    createdAt: round.createdAt ?? round.date,
    holes: round.holes === 9 ? 9 : 18,
    roundContext: 'real',
    completed: true,
    score: round.score,
    toPar: round.toPar,
    sgPartialAnalysis: round.sgPartialAnalysis,
    shortGameOpportunityEligible: isShortGameOpportunityEligible(round.holes === 9 ? 9 : 18, round.girHit),
    components: {
      off_the_tee: round.sgOffTee,
      approach: round.sgApproach,
      short_game: round.sgShortGame ?? null,
      putting: round.sgPutting,
      penalties: round.sgPenalties,
    },
    hashContext: {
      nonPar3Holes: round.nonPar3Holes,
      firHit: round.firHit,
      girHit: round.girHit,
      putts: round.putts,
      penalties: round.penalties,
      shortGameShots: round.shortGameShots ?? null,
      teeContextKey: round.teeContextKey ?? null,
    },
  }));
}

export async function generateAndStoreOverallInsights(
  userId: bigint,
  selectedMode: StatsMode = 'combined',
  options?: {
    touchGeneratedAt?: boolean;
  },
) {
  const overallInsightModel = (prisma as any).overallInsight;
  if (!overallInsightModel) {
    throw new Error('Prisma client is missing model "overallInsight". Run `npx prisma generate` and restart the server.');
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      subscriptionTier: true,
      subscriptionStatus: true,
    },
  });
  if (!user) throw new Error('User not found');
  const isPremium = isPremiumUser(user);
  const model = 'overall-deterministic-v9';
  const leaderboardStats = await prisma.userLeaderboardStats.findUnique({
    where: { userId },
    select: { handicap: true },
  });
  const currentHandicapOverride =
    leaderboardStats?.handicap != null && Number.isFinite(Number(leaderboardStats.handicap))
      ? Number(leaderboardStats.handicap)
      : null;

  const rounds = await loadOverallRoundEnvelope(userId, isPremium);
  const gameTrendRounds = toGameTrendRounds(rounds);
  const gameTrendsInputHash = computeGameTrendsInputHash(gameTrendRounds);
  const dataHash = computeOverallDataHash(rounds, isPremium, currentHandicapOverride);

  const existing = await overallInsightModel.findUnique({
    where: { userId },
  });

  const shouldAuto = shouldAutoRefreshOverall(existing?.generatedAt ?? null, existing?.dataHash ?? null, dataHash);
  if (existing && !shouldAuto) {
    const persistedTier = Boolean((existing?.insights as any)?.tier_context?.isPremium);
    const persistedModelUsed = existing?.modelUsed != null ? String(existing.modelUsed) : null;
    const persistedCards = Array.isArray((existing?.insights as any)?.cards) ? (existing?.insights as any)?.cards : [];
    const persistedCardsByMode = (existing?.insights as any)?.cards_by_mode;
    const persistedEfficiency = (existing?.insights as any)?.efficiency;
    const persistedProjectionByMode = (existing?.insights as any)?.projection_by_mode;
    const persistedGameTrends = parseCachedGameTrends((existing?.insights as any)?.game_trends_v2);
    const persistedHasNewEfficiencyShape = Boolean(
      persistedEfficiency &&
      typeof persistedEfficiency === 'object' &&
      Object.prototype.hasOwnProperty.call(persistedEfficiency, 'shortGameShots') &&
      Object.prototype.hasOwnProperty.call(persistedEfficiency, 'puttsTotal') &&
      Object.prototype.hasOwnProperty.call(persistedEfficiency, 'penaltiesPerRound'),
    );
    const persistedHasProjectionByMode = Boolean(
      persistedProjectionByMode &&
      typeof persistedProjectionByMode === 'object' &&
      persistedProjectionByMode.combined &&
      persistedProjectionByMode['9'] &&
      persistedProjectionByMode['18'] &&
      Object.prototype.hasOwnProperty.call(persistedProjectionByMode.combined, 'projectedScoreIn10') &&
      Object.prototype.hasOwnProperty.call(persistedProjectionByMode.combined, 'scoreLow') &&
      Object.prototype.hasOwnProperty.call(persistedProjectionByMode.combined, 'scoreHigh'),
    );
    const persistedHasCardsByMode = Boolean(
      persistedCardsByMode &&
      typeof persistedCardsByMode === 'object' &&
      Array.isArray(persistedCardsByMode.combined) &&
      Array.isArray(persistedCardsByMode['9']) &&
      Array.isArray(persistedCardsByMode['18']) &&
      persistedCardsByMode.combined.length === 3 &&
      persistedCardsByMode['9'].length === 3 &&
      persistedCardsByMode['18'].length === 3,
    );

    const canReusePersisted =
      persistedModelUsed === model &&
      persistedTier === isPremium &&
      persistedCards.length === 3 &&
      persistedHasCardsByMode &&
      persistedHasNewEfficiencyShape &&
      persistedHasProjectionByMode &&
      persistedGameTrends?.inputHash === gameTrendsInputHash;

    if (canReusePersisted) {
      const safePersisted = applyTierSafety(existing?.insights as any, isPremium, rounds.length);
      if (options?.touchGeneratedAt) {
        const touchedGeneratedAt = new Date().toISOString();
        const touchedPayload = {
          ...safePersisted,
          generated_at: touchedGeneratedAt,
        };
        await overallInsightModel.update({
          where: { userId },
          data: {
            modelUsed: model,
            insights: touchedPayload as any,
            dataHash,
            generatedAt: new Date(touchedGeneratedAt),
            updatedAt: new Date(),
          },
        });
        const selected = selectCardsForMode(touchedPayload, selectedMode);
        selected.game_trends = projectGameTrendsForViewer(persistedGameTrends!.byMode[selectedMode], isPremium ? 'premium' : 'free');
        delete selected.game_trends_v2;
        return selected;
      }
      const selected = selectCardsForMode(safePersisted, selectedMode);
      selected.game_trends = projectGameTrendsForViewer(persistedGameTrends!.byMode[selectedMode], isPremium ? 'premium' : 'free');
      delete selected.game_trends_v2;
      return selected;
    }
  }

  const basePayload = computeOverallPayload({
    rounds,
    isPremium,
    model,
    cards: Array.from({ length: 3 }, () => ''),
    currentHandicapOverride,
  });

  const modes: StatsMode[] = ['combined', '9', '18'];
  const cardsByMode = {} as Record<StatsMode, string[]>;
  const recommendedDrillByMode = {} as Record<StatsMode, string>;

  for (const mode of modes) {
    const modePayload = basePayload.mode_payload?.[mode];
    const modePoints = normalizeByMode(rounds, mode)
      .sort((a, b) => +new Date(b.date) - +new Date(a.date));
    const recentWindow = modePoints.slice(0, 5);
    const trackedCounts = {
      fir: recentWindow.filter((r) => r.firHit != null).length,
      gir: recentWindow.filter((r) => r.girHit != null).length,
      putts: recentWindow.filter((r) => r.putts != null).length,
      penalties: recentWindow.filter((r) => r.penalties != null).length,
    };
    const missingStats = {
      fir: trackedCounts.fir < OVERALL_SG_MIN_RECENT_COVERAGE,
      gir: trackedCounts.gir < OVERALL_SG_MIN_RECENT_COVERAGE,
      putts: trackedCounts.putts < OVERALL_SG_MIN_RECENT_COVERAGE,
      penalties: trackedCounts.penalties < OVERALL_SG_MIN_RECENT_COVERAGE,
    };
    // Keep drill selection mode-pure: if this mode has no signal yet,
    // fall back to general drills instead of borrowing from combined mode.
    const drillArea =
      modePayload?.narrative?.opportunity?.name ??
      modePayload?.narrative?.strength?.name ??
      null;
    const drillSeed = `${userId.toString()}|${dataHash}|${rounds.length}|drill|${mode}`;
    const recommendedDrill = pickDeterministicDrillSeeded(drillArea, drillSeed);
    recommendedDrillByMode[mode] = recommendedDrill;
    cardsByMode[mode] = buildDeterministicOverallCards({
      payload: basePayload,
      recommendedDrill,
      missingStats,
      isPremium,
      mode,
    });
  }
  const cards = cardsByMode.combined;

  const payload = computeOverallPayload({
    rounds,
    isPremium,
    model,
    cards,
    cardsByMode,
    currentHandicapOverride,
  });

  payload.analysis = {
    ...payload.analysis,
    score_compact: basePayload.analysis.score_compact,
  };
  (payload as any).recommended_drill = recommendedDrillByMode.combined;
  (payload as any).recommended_drill_by_mode = recommendedDrillByMode;
  (payload as any).data_hash = dataHash;
  (payload as any).model = model;
  (payload as any).game_trends_v2 = buildCachedGameTrends(gameTrendRounds);

  const safePayload = applyTierSafety(payload as any, isPremium, rounds.length);

  await overallInsightModel.upsert({
    where: { userId },
    create: {
      userId,
      modelUsed: model,
      insights: safePayload as any,
      dataHash,
      generatedAt: new Date(safePayload.generated_at),
      updatedAt: new Date(),
    },
    update: {
      modelUsed: model,
      insights: safePayload as any,
      dataHash,
      generatedAt: new Date(safePayload.generated_at),
      updatedAt: new Date(),
    },
  });

  const selected = selectCardsForMode(safePayload, selectedMode);
  const cachedGameTrends = parseCachedGameTrends((payload as any).game_trends_v2);
  selected.game_trends = projectGameTrendsForViewer(cachedGameTrends!.byMode[selectedMode], isPremium ? 'premium' : 'free');
  delete selected.game_trends_v2;
  return selected;
}

export async function GET(request: NextRequest) {
  try {
    const overallInsightModel = (prisma as any).overallInsight;
    if (!overallInsightModel) {
      console.error('[Overall Insights] Missing generated Prisma model: overallInsight');
      return errorResponse(OVERALL_INSIGHTS_LOAD_ERROR, 500);
    }

    const userId = await requireAuth(request);
    const mode = parseMode(new URL(request.url).searchParams);
    const payload = await generateAndStoreOverallInsights(userId, mode);
    return successResponse({
      insights: payload,
      selectedMode: mode,
    });
  } catch (error: any) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2021') {
      console.error('[Overall Insights] Prisma P2021 while loading insights');
      return errorResponse(OVERALL_INSIGHTS_LOAD_ERROR, 500);
    }
    if (error instanceof Error && error.message === 'Unauthorized') return errorResponse('Unauthorized', 401);
    console.error('[Overall Insights] Unexpected failure while loading insights', error);
    return errorResponse(OVERALL_INSIGHTS_LOAD_ERROR, 500);
  }
}


