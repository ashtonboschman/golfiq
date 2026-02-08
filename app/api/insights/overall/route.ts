import { NextRequest } from 'next/server';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db';
import { requireAuth, errorResponse, successResponse } from '@/lib/api-auth';
import { isPremiumUser } from '@/lib/subscription';
import { resolveTeeContext, type TeeSegment } from '@/lib/tee/resolveTeeContext';
import {
  type OverallRoundPoint,
  type StatsMode,
  computeOverallDataHash,
  computeOverallPayload,
  decorateCardEmojis,
  generateOverallCardsWithLLM,
  pickDeterministicDrillSeeded,
  shouldAutoRefreshOverall,
} from '@/lib/insights/overall';

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const OPENAI_MODEL = process.env.OPENAI_MODEL || 'gpt-4o-mini';
const OPENAI_MAX_COMPLETION_TOKENS = Math.max(1600, Number(process.env.OPENAI_MAX_COMPLETION_TOKENS ?? 1600) || 1600);
const OPENAI_TIMEOUT_MS = Math.max(12000, Number(process.env.OPENAI_TIMEOUT_MS ?? 20000) || 20000);

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

function fallbackCards(facts: any): string[] {
  const scoreCompact = facts?.analysis?.score_compact ?? '-';
  const recentAvg = facts?.analysis?.avg_score_recent;
  const baseAvg = facts?.analysis?.avg_score_baseline;
  const strength = facts?.analysis?.strength?.label ?? 'scoring';
  const opp = facts?.analysis?.opportunity?.label ?? 'consistency';
  const isWeak = Boolean(facts?.analysis?.opportunity?.isWeakness);
  const delta =
    recentAvg != null && baseAvg != null ? Math.round((recentAvg - baseAvg) * 10) / 10 : null;
  const drift =
    delta == null
      ? 'near your baseline'
      : delta < -0.5
        ? `${Math.abs(delta)} strokes better than baseline`
        : delta > 0.5
          ? `${delta} strokes above baseline`
          : 'close to baseline';

  const drill = String(facts?.recommended_drill ?? 'Use one simple pre-shot routine on every shot.').trim();
  const projectionScore = facts?.projection?.projectedScoreIn10;
  const projectionHcp = facts?.projection?.projectedHandicapIn10;

  return [
    `You finished at ${scoreCompact}, which is ${drift} based on your recent trend.`,
    isWeak
      ? `${opp} was the clearest area costing strokes in this sample, while ${strength} held up best.`
      : `${strength} led this sample and ${opp} was a secondary area to build on.`,
    `Next-round focus: commit to one clear target on every scoring shot and track execution quality hole by hole.`,
    `Practice plan: ${drill}`,
    `Course strategy: choose conservative targets when trouble is in play and avoid low-percentage recovery lines.`,
    projectionScore != null
      ? `At your current trend, a realistic short-term scoring target is around ${projectionScore} over the next ~10 rounds.`
      : `At your current trend, focus on making one repeatable gain over the next ~10 rounds.`,
    projectionHcp != null
      ? `Your handicap trend suggests a rough trajectory toward ${projectionHcp} if your current pattern holds.`
      : `Your trend is currently stable enough to build confidence with repeatable decision-making.`,
  ];
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
    orderBy: { date: 'desc' },
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

export async function generateAndStoreOverallInsights(userId: bigint, forceManualTimestamp = false) {
  const overallInsightModel = (prisma as any).overallInsight;
  if (!overallInsightModel) {
    throw new Error('Prisma client is missing model "overallInsight". Run `npx prisma generate` and restart the server.');
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      subscriptionTier: true,
      subscriptionStatus: true,
      trialEndsAt: true,
    },
  });
  if (!user) throw new Error('User not found');
  const isPremium = isPremiumUser(user);

  const roundsAll = await loadRoundsForOverall(userId);
  const rounds = isPremium ? roundsAll : roundsAll.slice(0, 20);
  const dataHash = computeOverallDataHash(rounds, isPremium);

  const existing = await overallInsightModel.findUnique({
    where: { userId },
    select: { generatedAt: true, dataHash: true },
  });

  const shouldAuto = shouldAutoRefreshOverall(existing?.generatedAt ?? null, existing?.dataHash ?? null, dataHash);
  if (!forceManualTimestamp && existing && !shouldAuto) {
    const persisted = await overallInsightModel.findUnique({ where: { userId } });
    const persistedTier = Boolean((persisted?.insights as any)?.tier_context?.isPremium);
    const persistedHasSgComponents = Boolean(
      (persisted?.insights as any)?.sg?.components &&
      typeof (persisted?.insights as any)?.sg?.components === 'object'
    );
    const persistedEfficiency = (persisted?.insights as any)?.efficiency;
    const persistedHasNewEfficiencyShape = Boolean(
      persistedEfficiency &&
      typeof persistedEfficiency === 'object' &&
      Object.prototype.hasOwnProperty.call(persistedEfficiency, 'puttsTotal') &&
      Object.prototype.hasOwnProperty.call(persistedEfficiency, 'penaltiesPerRound')
    );
    const canReusePersisted =
      persisted &&
      persistedTier === isPremium &&
      (!isPremium || persistedHasSgComponents) &&
      persistedHasNewEfficiencyShape;

    if (canReusePersisted) {
      return applyTierSafety(persisted?.insights as any, isPremium, rounds.length);
    }
  }

  if (!OPENAI_API_KEY) throw new Error('OpenAI API key not configured');
  const seed = `${userId.toString()}|${new Date().toISOString().slice(0, 10)}|${rounds.length}`;

  const draft = computeOverallPayload({
    rounds,
    isPremium,
    model: OPENAI_MODEL,
    openaiUsage: null,
    cards: Array.from({ length: 7 }, () => ''),
  });
  const drillArea = (draft.analysis.opportunity.name ?? draft.analysis.strength.name);
  const recommendedDrill = pickDeterministicDrillSeeded(drillArea, seed);
  const freeModeKpis = (() => {
    const { avgSgTotalRecent: _avgSgTotalRecent, ...rest } = draft.mode_payload.combined.kpis;
    return rest;
  })();

  const facts: any = {
    analysis: isPremium
      ? draft.analysis
      : {
          window_recent: draft.analysis.window_recent,
          window_baseline: draft.analysis.window_baseline,
          mode_for_narrative: draft.analysis.mode_for_narrative,
          performance_band: draft.analysis.performance_band,
          strength: {
            name: draft.analysis.strength.name,
            label: draft.analysis.strength.label,
          },
          opportunity: {
            name: draft.analysis.opportunity.name,
            label: draft.analysis.opportunity.label,
            isWeakness: draft.analysis.opportunity.isWeakness,
          },
          score_compact: draft.analysis.score_compact,
          avg_score_recent: draft.analysis.avg_score_recent,
          avg_score_baseline: draft.analysis.avg_score_baseline,
          rounds_recent: draft.analysis.rounds_recent,
          rounds_baseline: draft.analysis.rounds_baseline,
        },
    projection: draft.projection,
    consistency: draft.consistency,
    efficiency: draft.efficiency,
    recommended_drill: recommendedDrill,
    mode_payload_combined: isPremium ? draft.mode_payload.combined.kpis : freeModeKpis,
    tough_course_context: false,
    missing_stats: {
      fir: rounds.slice(0, 5).some((r) => r.firHit == null),
      gir: rounds.slice(0, 5).some((r) => r.girHit == null),
      putts: rounds.slice(0, 5).some((r) => r.putts == null),
      penalties: rounds.slice(0, 5).some((r) => r.penalties == null),
    },
  };

  if (isPremium) {
    facts.tier_context = draft.tier_context;
  }

  let cards: string[];
  let usage: any = null;
  try {
    const ai = await generateOverallCardsWithLLM({
      apiKey: OPENAI_API_KEY,
      model: OPENAI_MODEL,
      payloadFacts: facts,
      maxOutputTokens: OPENAI_MAX_COMPLETION_TOKENS,
      timeoutMs: OPENAI_TIMEOUT_MS,
      userSeed: seed,
    });
    cards = ai.cards;
    usage = ai.usage;
  } catch {
    cards = fallbackCards(facts);
  }

  const decorated = decorateCardEmojis(cards, draft.analysis.performance_band, draft.analysis.opportunity.isWeakness);
  const payload = computeOverallPayload({
    rounds,
    isPremium,
    model: OPENAI_MODEL,
    openaiUsage: usage,
    cards: decorated,
  });
  payload.analysis = {
    ...payload.analysis,
    score_compact: draft.analysis.score_compact,
  };
  (payload as any).recommended_drill = recommendedDrill;
  (payload as any).data_hash = dataHash;
  (payload as any).model = OPENAI_MODEL;
  const safePayload = applyTierSafety(payload as any, isPremium, rounds.length);

  await overallInsightModel.upsert({
    where: { userId },
    create: {
      userId,
      modelUsed: OPENAI_MODEL,
      insights: safePayload as any,
      dataHash,
      generatedAt: new Date(safePayload.generated_at),
      lastManualRefreshAt: forceManualTimestamp ? new Date() : null,
      updatedAt: new Date(),
    },
    update: {
      modelUsed: OPENAI_MODEL,
      insights: safePayload as any,
      dataHash,
      generatedAt: new Date(safePayload.generated_at),
      lastManualRefreshAt: forceManualTimestamp ? new Date() : undefined,
      updatedAt: new Date(),
    },
  });

  return safePayload;
}

export async function GET(request: NextRequest) {
  try {
    const overallInsightModel = (prisma as any).overallInsight;
    if (!overallInsightModel) {
      return errorResponse('Prisma client is missing model "overallInsight". Run `npx prisma generate` and restart the server.', 500);
    }

    const userId = await requireAuth(request);
    const mode = parseMode(new URL(request.url).searchParams);
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        subscriptionTier: true,
        subscriptionStatus: true,
        trialEndsAt: true,
      },
    });
    if (!user) return errorResponse('User not found', 404);

    const isPremium = isPremiumUser(user);
    const roundsAll = await loadRoundsForOverall(userId);
    const rounds = isPremium ? roundsAll : roundsAll.slice(0, 20);
    const dataHash = computeOverallDataHash(rounds, isPremium);

    const existing = await overallInsightModel.findUnique({
      where: { userId },
      select: {
        generatedAt: true,
        dataHash: true,
        insights: true,
      },
    });

    let storedInsights: any = existing?.insights ?? null;
    const persistedTier = Boolean(storedInsights?.tier_context?.isPremium);
    const hasCards = Array.isArray(storedInsights?.cards) && storedInsights.cards.length > 0;
    const needsCardRegeneration =
      !storedInsights ||
      persistedTier !== isPremium ||
      !hasCards ||
      shouldAutoRefreshOverall(existing?.generatedAt ?? null, existing?.dataHash ?? null, dataHash);

    if (needsCardRegeneration) {
      storedInsights = await generateAndStoreOverallInsights(userId, false);
    }

    const cards = Array.isArray(storedInsights?.cards) ? storedInsights.cards : [];
    const payload = computeOverallPayload({
      rounds,
      isPremium,
      model: OPENAI_MODEL,
      openaiUsage: storedInsights?.openai_usage ?? null,
      cards,
    });

    payload.generated_at =
      needsCardRegeneration
        ? (typeof storedInsights?.generated_at === 'string' ? storedInsights.generated_at : new Date().toISOString())
        : (existing?.generatedAt?.toISOString() ??
            (typeof storedInsights?.generated_at === 'string' ? storedInsights.generated_at : new Date().toISOString()));

    if (typeof storedInsights?.recommended_drill === 'string' && storedInsights.recommended_drill.trim().length > 0) {
      (payload as any).recommended_drill = storedInsights.recommended_drill;
    }
    (payload as any).data_hash = dataHash;
    (payload as any).model = OPENAI_MODEL;

    const safePayload = applyTierSafety(payload as any, isPremium, rounds.length);
    return successResponse({
      insights: safePayload,
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
