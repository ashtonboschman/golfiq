import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-config';
import { prisma } from '@/lib/db';
import { resolveTeeContext, type TeeSegment } from '@/lib/tee/resolveTeeContext';
import { POST_ROUND_MESSAGE_MAX_CHARS, POST_ROUND_THRESHOLDS } from '@/lib/insights/config/postRound';
import { getMissingStats } from '@/lib/insights/postRound/missingStats';
import { buildOnboardingPostRoundInsights } from '@/lib/insights/postRound/onboardingPolicy';
import { runMeasuredSgSelection } from '@/lib/insights/postRound/sgSelection';
import { resolvePostRoundVariantOffset } from '@/lib/insights/postRound/variantOffset';
import {
  buildDeterministicPostRoundInsights,
  type InsightLevel,
  type PerformanceBand,
} from '@/lib/insights/postRound/policy';

const MAX_INSIGHTS = 3;

// In-flight generation lock to prevent duplicate generation from concurrent requests.
const inFlightGenerations = new Map<string, Promise<any>>();

type ViewerEntitlements = {
  isPremium: boolean;
  showStrokesGained: boolean;
};

function sanitizeWhitespace(text: string): string {
  return String(text ?? '').replace(/\s+/g, ' ').trim();
}

function splitSentencesSimple(text: string): string[] {
  const t = sanitizeWhitespace(text);
  if (!t) return [];
  const parts = t.split(/(?<=[.!?])\s+/).map((s) => s.trim()).filter(Boolean);
  return parts.length ? parts : [t];
}

function enforceMaxMessageChars(message: string, maxChars: number): string {
  const msg = sanitizeWhitespace(message);
  if (!maxChars || msg.length <= maxChars) return msg;

  const sentences = splitSentencesSimple(msg);
  if (!sentences.length) return msg.slice(0, maxChars).trim();

  const keep: string[] = [];
  for (const sentence of sentences) {
    if (keep.length === 0) {
      keep.push(sentence);
      continue;
    }
    const candidate = `${keep.join(' ')} ${sentence}`.trim();
    if (candidate.length <= maxChars) keep.push(sentence);
    else break;
  }

  let result = keep.join(' ').trim();
  if (result.length <= maxChars) return result;

  result = result.slice(0, maxChars).trimEnd();
  const lastSpace = result.lastIndexOf(' ');
  if (lastSpace > 20) result = result.slice(0, lastSpace).trimEnd();
  result = result.replace(/[,:;]+$/g, '').trimEnd();
  if (!/[.!?]$/.test(result)) result = `${result}.`;
  return result;
}

function normalizeInsightMessages(messages: string[]): string[] {
  return messages.map((message) => sanitizeWhitespace(message));
}

function recoverMessagesFromBlob(blob: string): string[] | null {
  const trimmed = String(blob ?? '').trim();
  if (!trimmed.startsWith('{')) return null;

  try {
    const parsed = JSON.parse(trimmed);
    if (Array.isArray(parsed?.messages) && parsed.messages.every((m: unknown) => typeof m === 'string')) {
      return parsed.messages;
    }
  } catch {
    // noop
  }

  const repaired = trimmed.replace(/"messages"\s*\.\s*\[/gi, '"messages":[');
  try {
    const parsed = JSON.parse(repaired);
    if (Array.isArray(parsed?.messages) && parsed.messages.every((m: unknown) => typeof m === 'string')) {
      return parsed.messages;
    }
  } catch {
    // noop
  }

  return null;
}

function getFreeVisibleCount(insights: any): number {
  const configured = Number(insights?.free_visible_count);
  if (Number.isFinite(configured) && configured > 0) {
    return Math.max(1, Math.min(MAX_INSIGHTS, configured));
  }
  return 1;
}

function limitInsightsForViewer(insights: any, entitlements?: ViewerEntitlements): any {
  const effectiveEntitlements: ViewerEntitlements = entitlements ?? { isPremium: false, showStrokesGained: true };
  const rawMessages: string[] = Array.isArray(insights?.messages) ? insights.messages : [];
  const messages = rawMessages.length === 1 ? (recoverMessagesFromBlob(rawMessages[0]) ?? rawMessages) : rawMessages;
  const normalizedMessages = normalizeInsightMessages(messages).slice(0, MAX_INSIGHTS);

  const rawLevels: InsightLevel[] = Array.isArray(insights?.message_levels)
    ? insights.message_levels.filter((level: unknown): level is InsightLevel =>
        level === 'great' || level === 'success' || level === 'warning' || level === 'info',
      )
    : [];

  const visibleCount = effectiveEntitlements.isPremium
    ? Math.min(MAX_INSIGHTS, normalizedMessages.length)
    : Math.min(getFreeVisibleCount(insights), normalizedMessages.length);

  const {
    raw_payload,
    realizer_raw,
    planner,
    planner_v2,
    realizer_ok,
    realizer_error,
    realizer_retry_count,
    fallback_used,
    drill_selected,
    drill_selected_at,
    drill_fingerprint,
    drill_reused,
    ...rest
  } = insights ?? {};

  return {
    ...rest,
    messages: normalizedMessages,
    message_levels: rawLevels.slice(0, normalizedMessages.length),
    visible_count: visibleCount,
  };
}

async function getUserSession() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    throw new Error('Unauthorized');
  }
  return BigInt(session.user.id);
}

async function getViewerEntitlements(userId: bigint): Promise<ViewerEntitlements> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      subscriptionTier: true,
    },
  });

  const isPremium = user?.subscriptionTier === 'premium' || user?.subscriptionTier === 'lifetime';
  const showStrokesGained = true;
  return { isPremium, showStrokesGained };
}

function computePerformanceBand(totalSG: number | null, holesPlayed: number): PerformanceBand {
  if (totalSG == null || !Number.isFinite(totalSG)) return 'unknown';

  const scale = holesPlayed === 9 ? 0.5 : 1;
  const tough = POST_ROUND_THRESHOLDS.sgToughRound * scale;
  const below = POST_ROUND_THRESHOLDS.sgBelowExpectations * scale;
  const above = POST_ROUND_THRESHOLDS.sgAboveExpectations * scale;
  const great = POST_ROUND_THRESHOLDS.sgExceptional * scale;

  if (totalSG <= tough) return 'tough';
  if (totalSG <= below) return 'below';
  if (totalSG < above) return 'expected';
  if (totalSG < great) return 'above';
  return 'great';
}

type RoundOrderingEntry = {
  id: bigint;
  score: number;
  date: Date;
  createdAt: Date;
};

function resolveRoundOrdinalContext(roundId: bigint, rounds: RoundOrderingEntry[]): {
  roundNumber: number;
  previousScore: number | null;
  totalRounds: number;
} {
  const index = rounds.findIndex((item) => item.id === roundId);
  if (index < 0) {
    throw new Error('Round not found in user history');
  }

  return {
    roundNumber: index + 1,
    previousScore: index > 0 ? Number(rounds[index - 1].score) : null,
    totalRounds: rounds.length,
  };
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const userId = await getUserSession();
    const { id } = await params;
    const roundId = BigInt(id);

    const existingInsights = await prisma.roundInsight.findUnique({ where: { roundId } });
    const entitlements = await getViewerEntitlements(userId);
    if (existingInsights) {
      if (existingInsights.userId !== userId) {
        throw new Error('Unauthorized');
      }
      return NextResponse.json({ insights: limitInsightsForViewer(existingInsights.insights, entitlements) });
    }

    const insights = await generateInsights(roundId, userId, entitlements);
    return NextResponse.json({ insights });
  } catch (error: any) {
    console.error('Error fetching insights:', error);
    return NextResponse.json(
      { message: error.message || 'Error fetching insights' },
      { status: error.message === 'Unauthorized' ? 401 : 500 },
    );
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const userId = await getUserSession();
    const { id } = await params;
    const roundId = BigInt(id);

    const entitlements = await getViewerEntitlements(userId);
    const insights = await generateInsights(roundId, userId, entitlements, { forceRegenerate: true, bumpVariant: true });
    return NextResponse.json({ insights });
  } catch (error: any) {
    console.error('Error generating insights:', error);
    return NextResponse.json(
      { message: error.message || 'Error generating insights' },
      { status: error.message === 'Unauthorized' ? 401 : 500 },
    );
  }
}

export async function generateInsights(
  roundId: bigint,
  userId: bigint,
  entitlements?: ViewerEntitlements,
  options?: { forceRegenerate?: boolean; bumpVariant?: boolean },
) {
  const effectiveEntitlements = entitlements ?? (await getViewerEntitlements(userId));
  const forceRegenerate = options?.forceRegenerate === true;
  const bumpVariant = options?.bumpVariant === true;

  const existing = await prisma.roundInsight.findUnique({ where: { roundId } });
  const existingInsights = existing?.insights as any;
  const previousVariantOffset = resolvePostRoundVariantOffset(existingInsights);

  if (existing) {
    if (existing.userId !== userId) {
      throw new Error('Unauthorized');
    }
    if (!forceRegenerate) {
      return limitInsightsForViewer(existing.insights, effectiveEntitlements);
    }
  }

  const key = `${userId.toString()}:${roundId.toString()}`;
  if (inFlightGenerations.has(key)) {
    const fullInsights = await inFlightGenerations.get(key)!;
    if (!forceRegenerate) {
      return limitInsightsForViewer(fullInsights, effectiveEntitlements);
    }
  }

  const promise = generateInsightsInternal(roundId, userId, effectiveEntitlements, {
    previousVariantOffset,
    forceRegenerate,
    bumpVariant,
  }).finally(() => {
    inFlightGenerations.delete(key);
  });
  inFlightGenerations.set(key, promise);

  const fullInsights = await promise;
  return limitInsightsForViewer(fullInsights, effectiveEntitlements);
}

async function generateInsightsInternal(
  roundId: bigint,
  userId: bigint,
  entitlements: ViewerEntitlements,
  generationOptions: {
    previousVariantOffset: number;
    forceRegenerate: boolean;
    bumpVariant: boolean;
  },
) {
  const round = await prisma.round.findUnique({
    where: { id: roundId },
    include: {
      tee: {
        include: {
          course: { include: { location: true } },
          holes: { select: { holeNumber: true, par: true }, orderBy: { holeNumber: 'asc' } },
        },
      },
    },
  });

  if (!round) throw new Error('Round not found');
  if (round.userId !== userId) throw new Error('Unauthorized access to round');

  const currentSegment = ((round as any).teeSegment ?? 'full') as TeeSegment;
  const currentContext = resolveTeeContext(round.tee, currentSegment);
  const currentHolesPlayed = currentContext.holes;

  const roundsInOrder = await prisma.round.findMany({
    where: { userId },
    select: { id: true, score: true, date: true, createdAt: true },
    orderBy: [{ date: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }],
  });
  const { roundNumber, previousScore, totalRounds } = resolveRoundOrdinalContext(roundId, roundsInOrder as RoundOrderingEntry[]);
  const isOnboardingRound = roundNumber <= 3;
  const shouldBumpVariant = generationOptions.forceRegenerate && generationOptions.bumpVariant && !isOnboardingRound;
  const variantOffset = shouldBumpVariant
    ? generationOptions.previousVariantOffset + 1
    : generationOptions.previousVariantOffset;

  const toPar = Number(round.score) - currentContext.parTotal;

  if (isOnboardingRound) {
    const onboardingInsights = buildOnboardingPostRoundInsights({
      roundNumber,
      score: Number(round.score),
      toPar,
      previousScore,
    });

    const finalMessages: [string, string, string] = [
      enforceMaxMessageChars(onboardingInsights.messages[0], POST_ROUND_MESSAGE_MAX_CHARS),
      enforceMaxMessageChars(onboardingInsights.messages[1], POST_ROUND_MESSAGE_MAX_CHARS),
      enforceMaxMessageChars(onboardingInsights.messages[2], POST_ROUND_MESSAGE_MAX_CHARS),
    ];

    const onboardingMissingStats = getMissingStats({
      firHit: round.firHit,
      girHit: round.girHit,
      putts: round.putts,
      penalties: round.penalties,
    });

    const insightsData = {
      messages: finalMessages,
      message_levels: onboardingInsights.messageLevels,
      message_outcomes: onboardingInsights.outcomes,
      generated_at: new Date().toISOString(),
      model: 'deterministic-v1',
      variant_offset: generationOptions.previousVariantOffset,
      free_visible_count: 3,
      generation_count: MAX_INSIGHTS,
      raw_payload: {
        round: {
          score: Number(round.score),
          to_par: toPar,
          holes_played: currentHolesPlayed,
          round_number: roundNumber,
        },
        historical: {
          avg_score: null,
          total_rounds: totalRounds,
          previous_score: previousScore,
        },
        sg: {
          total: null,
          off_tee: null,
          approach: null,
          putting: null,
          penalties: null,
          residual: null,
        },
        measured_selection: null,
        missing_stats: onboardingMissingStats,
        onboarding: {
          active: true,
          round_number: roundNumber,
        },
      },
    };

    const savedInsights = await prisma.roundInsight.upsert({
      where: { roundId },
      create: {
        roundId,
        userId,
        modelUsed: 'deterministic-v1',
        insights: insightsData,
      },
      update: {
        modelUsed: 'deterministic-v1',
        insights: insightsData,
        updatedAt: new Date(),
      },
    });

    return savedInsights.insights;
  }

  const sgComponents = await prisma.roundStrokesGained.findUnique({
    where: { roundId },
  });

  const last5Rounds = await prisma.round.findMany({
    where: { userId, id: { not: roundId } },
    orderBy: { date: 'desc' },
    take: 5,
    include: {
      tee: {
        include: {
          holes: { select: { holeNumber: true, par: true }, orderBy: { holeNumber: 'asc' } },
        },
      },
    },
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

  const totalSg = sgComponents?.sgTotal != null ? Number(sgComponents.sgTotal) : null;

  const weaknessThreshold = POST_ROUND_THRESHOLDS.sgWeakness * (currentHolesPlayed === 9 ? 0.5 : 1);
  const measuredSelection = runMeasuredSgSelection(
    {
      offTee: sgComponents?.sgOffTee != null ? Number(sgComponents.sgOffTee) : null,
      approach: sgComponents?.sgApproach != null ? Number(sgComponents.sgApproach) : null,
      putting: sgComponents?.sgPutting != null ? Number(sgComponents.sgPutting) : null,
      penalties: sgComponents?.sgPenalties != null ? Number(sgComponents.sgPenalties) : null,
      residual: sgComponents?.sgResidual != null ? Number(sgComponents.sgResidual) : null,
      total: totalSg,
    },
    weaknessThreshold,
  );

  const missingStats = getMissingStats({
    firHit: round.firHit,
    girHit: round.girHit,
    putts: round.putts,
    penalties: round.penalties,
  });

  const deterministicInsights = buildDeterministicPostRoundInsights({
    score: Number(round.score),
    toPar,
    avgScore: avgScore != null && Number.isFinite(avgScore) ? avgScore : null,
    band: computePerformanceBand(totalSg, currentHolesPlayed),
    measuredComponents: measuredSelection.components,
    bestMeasured: measuredSelection.best,
    worstMeasured: measuredSelection.opportunity,
    opportunityIsWeak: measuredSelection.opportunityIsWeak,
    residualDominant: measuredSelection.residualDominant,
    weakSeparation: measuredSelection.weakSeparation,
    missing: missingStats,
    residualValue: sgComponents?.sgResidual != null ? Number(sgComponents.sgResidual) : null,
    roundEvidence: {
      fairwaysHit: round.firHit != null ? Number(round.firHit) : null,
      fairwaysPossible: currentContext.nonPar3Holes,
      greensHit: round.girHit != null ? Number(round.girHit) : null,
      greensPossible: currentHolesPlayed,
      puttsTotal: round.putts != null ? Number(round.putts) : null,
      penaltiesTotal: round.penalties != null ? Number(round.penalties) : null,
    },
  }, {
    variantSeed: `${roundId.toString()}`,
    variantOffset,
  });

  const finalMessages: [string, string, string] = [
    enforceMaxMessageChars(deterministicInsights.messages[0], POST_ROUND_MESSAGE_MAX_CHARS),
    enforceMaxMessageChars(deterministicInsights.messages[1], POST_ROUND_MESSAGE_MAX_CHARS),
    enforceMaxMessageChars(deterministicInsights.messages[2], POST_ROUND_MESSAGE_MAX_CHARS),
  ];

  const freeVisibleCount = 1;

  const insightsData = {
    messages: finalMessages,
    message_levels: deterministicInsights.messageLevels,
    message_outcomes: deterministicInsights.outcomes,
    generated_at: new Date().toISOString(),
    model: 'deterministic-v1',
    variant_offset: variantOffset,
    free_visible_count: freeVisibleCount,
    generation_count: MAX_INSIGHTS,
    raw_payload: {
      round: {
        score: Number(round.score),
        to_par: toPar,
        holes_played: currentHolesPlayed,
      },
      historical: {
        avg_score: avgScore != null ? Math.round(avgScore * 10) / 10 : null,
        total_rounds: totalRounds,
      },
      sg: {
        total: totalSg,
        off_tee: sgComponents?.sgOffTee != null ? Number(sgComponents.sgOffTee) : null,
        approach: sgComponents?.sgApproach != null ? Number(sgComponents.sgApproach) : null,
        putting: sgComponents?.sgPutting != null ? Number(sgComponents.sgPutting) : null,
        penalties: sgComponents?.sgPenalties != null ? Number(sgComponents.sgPenalties) : null,
        residual: sgComponents?.sgResidual != null ? Number(sgComponents.sgResidual) : null,
      },
      measured_selection: measuredSelection,
      missing_stats: missingStats,
    },
  };

  const savedInsights = await prisma.roundInsight.upsert({
    where: { roundId },
    create: {
      roundId,
      userId,
      modelUsed: 'deterministic-v1',
      insights: insightsData,
    },
    update: {
      modelUsed: 'deterministic-v1',
      insights: insightsData,
      updatedAt: new Date(),
    },
  });

  return savedInsights.insights;
}
