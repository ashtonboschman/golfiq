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

function normalizeSgConfidence(raw: unknown): 'high' | 'medium' | 'low' | null {
  if (raw == null) return null;
  if (typeof raw === 'number' && Number.isFinite(raw)) {
    if (raw >= 0.8) return 'high';
    if (raw >= 0.5) return 'medium';
    return 'low';
  }
  const value = String(raw).trim().toLowerCase();
  if (value === 'high') return 'high';
  if (value === 'medium' || value === 'med') return 'medium';
  if (value === 'low') return 'low';
  return null;
}

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
  const next = payload && typeof payload === 'object' ? { ...payload } : {};
  const prevTier =
    next.tier_context && typeof next.tier_context === 'object' ? next.tier_context : {};
  next.tier_context = {
    ...prevTier,
    isPremium,
    baseline: isPremium ? 'alltime' : 'last20',
    maxRoundsUsed: roundsUsed,
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
        };
      }
    }
  }

  if (!isPremium) {
    next.sg_locked = true;
    if (next.mode_payload && typeof next.mode_payload === 'object') {
      for (const mode of Object.keys(next.mode_payload)) {
        const modePayload = next.mode_payload[mode];
        if (modePayload?.kpis && typeof modePayload.kpis === 'object') {
          modePayload.kpis.avgSgTotalRecent = null;
        }
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

async function loadRoundsForOverall(userId: bigint): Promise<OverallRoundPoint[]> {
  const rounds = await prisma.round.findMany({
    where: { userId },
    include: {
      tee: { include: { holes: { select: { holeNumber: true, par: true }, orderBy: { holeNumber: 'asc' } } } },
      roundStrokesGained: true,
      roundHoles: {
        select: {
          penalties: true,
        },
      },
    },
    orderBy: [{ date: 'desc' }, { updatedAt: 'desc' }, { id: 'desc' }],
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
      holes: ctx.holes,
      nonPar3Holes: ctx.nonPar3Holes,
      score: Number(r.score),
      toPar: r.toPar != null ? Number(r.toPar) : Number(r.score) - ctx.parTotal,
      firHit: r.firHit != null ? Number(r.firHit) : null,
      girHit: r.girHit != null ? Number(r.girHit) : null,
      putts: r.putts != null ? Number(r.putts) : null,
      penalties: r.penalties != null ? Number(r.penalties) : derivedPenalties,
      handicapAtRound: r.handicapAtRound != null ? Number(r.handicapAtRound) : null,
      sgTotal: r.roundStrokesGained?.sgTotal != null ? Number(r.roundStrokesGained.sgTotal) : null,
      sgOffTee: r.roundStrokesGained?.sgOffTee != null ? Number(r.roundStrokesGained.sgOffTee) : null,
      sgApproach: r.roundStrokesGained?.sgApproach != null ? Number(r.roundStrokesGained.sgApproach) : null,
      sgPutting: r.roundStrokesGained?.sgPutting != null ? Number(r.roundStrokesGained.sgPutting) : null,
      sgPenalties: r.roundStrokesGained?.sgPenalties != null ? Number(r.roundStrokesGained.sgPenalties) : null,
      sgResidual: r.roundStrokesGained?.sgResidual != null ? Number(r.roundStrokesGained.sgResidual) : null,
      sgConfidence: normalizeSgConfidence(r.roundStrokesGained?.confidence),
      sgPartialAnalysis: r.roundStrokesGained?.partialAnalysis ?? null,
    } as OverallRoundPoint;
  });
}

export async function generateAndStoreOverallInsights(
  userId: bigint,
  forceManualTimestamp = false,
  selectedMode: StatsMode = 'combined',
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
  const model = 'overall-deterministic-v1';
  const leaderboardStats = await prisma.userLeaderboardStats.findUnique({
    where: { userId },
    select: { handicap: true },
  });
  const currentHandicapOverride =
    leaderboardStats?.handicap != null && Number.isFinite(Number(leaderboardStats.handicap))
      ? Number(leaderboardStats.handicap)
      : null;

  const roundsAll = await loadRoundsForOverall(userId);
  const rounds = isPremium ? roundsAll : roundsAll.slice(0, 20);
  const dataHash = computeOverallDataHash(rounds, isPremium);

  const existing = await overallInsightModel.findUnique({
    where: { userId },
  });

  const previousVariantOffset = Number.isFinite(Number(existing?.variantOffset))
    ? Math.max(0, Math.floor(Number(existing?.variantOffset)))
    : 0;
  const dataHashChanged = !existing || existing.dataHash !== dataHash;
  const variantOffset = forceManualTimestamp
    ? previousVariantOffset + 1
    : dataHashChanged
      ? 0
      : previousVariantOffset;

  const shouldAuto = shouldAutoRefreshOverall(existing?.generatedAt ?? null, existing?.dataHash ?? null, dataHash);
  if (!forceManualTimestamp && existing && !shouldAuto) {
    const persistedTier = Boolean((existing?.insights as any)?.tier_context?.isPremium);
    const persistedModelUsed = existing?.modelUsed != null ? String(existing.modelUsed) : null;
    const persistedCards = Array.isArray((existing?.insights as any)?.cards) ? (existing?.insights as any)?.cards : [];
    const persistedCardsByMode = (existing?.insights as any)?.cards_by_mode;
    const persistedEfficiency = (existing?.insights as any)?.efficiency;
    const persistedProjectionByMode = (existing?.insights as any)?.projection_by_mode;
    const persistedHasNewEfficiencyShape = Boolean(
      persistedEfficiency &&
      typeof persistedEfficiency === 'object' &&
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
      persistedCardsByMode.combined.length === 6 &&
      persistedCardsByMode['9'].length === 6 &&
      persistedCardsByMode['18'].length === 6,
    );

    const canReusePersisted =
      persistedModelUsed === model &&
      persistedTier === isPremium &&
      persistedCards.length === 6 &&
      persistedHasCardsByMode &&
      persistedHasNewEfficiencyShape &&
      persistedHasProjectionByMode;

    if (canReusePersisted) {
      const safePersisted = applyTierSafety(existing?.insights as any, isPremium, rounds.length);
      return selectCardsForMode(safePersisted, selectedMode);
    }
  }

  const basePayload = computeOverallPayload({
    rounds,
    isPremium,
    model,
    cards: Array.from({ length: 6 }, () => ''),
    currentHandicapOverride,
  });

  const variantSeedBase = `${userId.toString()}|${dataHash}|${rounds.length}`;
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
    const recommendedDrill = pickDeterministicDrillSeeded(drillArea, drillSeed, variantOffset);
    recommendedDrillByMode[mode] = recommendedDrill;
    cardsByMode[mode] = buildDeterministicOverallCards({
      payload: basePayload,
      recommendedDrill,
      missingStats,
      isPremium,
      variantSeedBase: `${variantSeedBase}|${mode}`,
      variantOffset,
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

  const safePayload = applyTierSafety(payload as any, isPremium, rounds.length);

  await overallInsightModel.upsert({
    where: { userId },
    create: {
      userId,
      modelUsed: model,
      insights: safePayload as any,
      dataHash,
      variantOffset,
      generatedAt: new Date(safePayload.generated_at),
      lastManualRefreshAt: forceManualTimestamp ? new Date() : null,
      updatedAt: new Date(),
    },
    update: {
      modelUsed: model,
      insights: safePayload as any,
      dataHash,
      variantOffset,
      generatedAt: new Date(safePayload.generated_at),
      lastManualRefreshAt: forceManualTimestamp ? new Date() : undefined,
      updatedAt: new Date(),
    },
  });

  return selectCardsForMode(safePayload, selectedMode);
}

export async function GET(request: NextRequest) {
  try {
    const overallInsightModel = (prisma as any).overallInsight;
    if (!overallInsightModel) {
      return errorResponse('Prisma client is missing model "overallInsight". Run `npx prisma generate` and restart the server.', 500);
    }

    const userId = await requireAuth(request);
    const mode = parseMode(new URL(request.url).searchParams);
    const payload = await generateAndStoreOverallInsights(userId, false, mode);
    return successResponse({
      insights: payload,
      selectedMode: mode,
    });
  } catch (error: any) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2021') {
      return errorResponse('Database table "overall_insights" is missing. Apply the latest SQL migration.', 500);
    }
    if (error.message === 'Unauthorized') return errorResponse('Unauthorized', 401);
    return errorResponse(error.message || 'Failed to load overall insights', 500);
  }
}


