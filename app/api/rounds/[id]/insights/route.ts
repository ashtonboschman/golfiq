import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-config';
import { prisma } from '@/lib/db';
import { isPremiumUser } from '@/lib/subscription';
import { resolveTeeContext, type TeeSegment } from '@/lib/tee/resolveTeeContext';
import {
  POST_ROUND_MESSAGE_MAX_CHARS,
  POST_ROUND_RESIDUAL,
  POST_ROUND_THRESHOLDS,
  resolvePostRoundStrokeScale,
} from '@/lib/insights/config/postRound';
import { getMissingStats } from '@/lib/insights/postRound/missingStats';
import { runMeasuredSgSelection } from '@/lib/insights/postRound/sgSelection';
import { resolvePostRoundVariantOffset } from '@/lib/insights/postRound/variantOffset';
import {
  buildDeterministicPostRoundInsights,
  type InsightLevel,
  type PerformanceBand,
} from '@/lib/insights/postRound/policy';

const MAX_INSIGHTS = 3;
type PostRoundConfidence = 'LOW' | 'MED' | 'HIGH';

// In-flight generation lock to prevent duplicate generation from concurrent requests.
const inFlightGenerations = new Map<string, Promise<any>>();

type ViewerEntitlements = {
  isPremium: boolean;
  showStrokesGained: boolean;
};
type ScoreDeltaBucket = 'better' | 'near' | 'worse';
type RoundContextKey = 'real' | 'simulator' | 'practice';

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

function stripSgPrecisionPhrases(text: string): string {
  let out = sanitizeWhitespace(text);
  out = out.replace(/\b(?:at|of|about)\s*[+-]?\d+(?:\.\d)?\s+strokes?\b/gi, '');
  out = out.replace(/\b[+-]?\d+(?:\.\d)?\s+strokes?\s+gained\b/gi, '');
  out = out.replace(/\bstrokes?\s+gained\b/gi, 'strokes');
  out = out.replace(/\s+([.,!?;:])/g, '$1').trim();
  return out;
}

function sentenceOne(text: string): string {
  const sentences = splitSentencesSimple(text);
  return sanitizeWhitespace(sentences[0] ?? text);
}

function firstNSentences(text: string, count: number): string {
  const sentences = splitSentencesSimple(text);
  if (!sentences.length) return sanitizeWhitespace(text);
  return sanitizeWhitespace(sentences.slice(0, Math.max(1, count)).join(' '));
}

function hasNoBaselineHistory(insights: any): boolean {
  const avg = insights?.raw_payload?.historical?.avg_score;
  return avg == null || !Number.isFinite(Number(avg));
}

function toTitleCaseLabel(value: string | null | undefined): string | null {
  if (!value || typeof value !== 'string') return null;
  return value
    .split('_')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function resolveWorstLabel(insights: any): string {
  const fromSelection = insights?.raw_payload?.measured_selection?.opportunity?.label;
  if (typeof fromSelection === 'string' && fromSelection.trim().length > 0) return fromSelection.trim();
  const fromName = insights?.raw_payload?.measured_selection?.opportunity?.name;
  return toTitleCaseLabel(fromName) ?? 'One area';
}

function buildFreeMessage2(
  currentMessage: string,
  outcome: string | null,
  confidence: PostRoundConfidence | null,
  worstLabel: string,
): string {
  if (confidence === 'LOW') return sanitizeWhitespace(currentMessage);

  if (outcome === 'M2-D') {
    return `${worstLabel} was the biggest source of lost strokes.`;
  }
  if (outcome === 'M2-E') {
    return `${worstLabel} was the strongest part of the round.`;
  }
  if (outcome === 'M2-C') {
    return `${worstLabel} didn't make much difference to your score.`;
  }
  return sanitizeWhitespace(currentMessage);
}

function buildViewerMessages(
  insights: any,
  normalizedMessages: string[],
  entitlements: ViewerEntitlements,
): string[] {
  if (entitlements.isPremium) return normalizedMessages;

  const outcomes: string[] = Array.isArray(insights?.message_outcomes) ? insights.message_outcomes : [];
  const details = insights?.message_details as { m2BaseText?: string; m2ResidualIncluded?: boolean } | undefined;
  const confidence = insights?.confidence === 'LOW' || insights?.confidence === 'MED' || insights?.confidence === 'HIGH'
    ? insights.confidence as PostRoundConfidence
    : null;
  const worstLabel = resolveWorstLabel(insights);
  const noBaselineHistory = hasNoBaselineHistory(insights);

  return normalizedMessages.map((message, index) => {
    if (index === 0) {
      // Free always gets a score-focused headline, not SG component precision.
      if (noBaselineHistory) {
        // Keep the setup phrase for first/no-history rounds.
        return firstNSentences(message, 2);
      }
      return sentenceOne(message);
    }

    if (index === 1) {
      const baseMessage = details?.m2BaseText ? sanitizeWhitespace(details.m2BaseText) : sanitizeWhitespace(message);
      const freeM2 = buildFreeMessage2(baseMessage, outcomes[1] ?? null, confidence, worstLabel);
      return stripSgPrecisionPhrases(freeM2);
    }

    return stripSgPrecisionPhrases(message);
  });
}

function toFiniteNumber(value: unknown): number | null {
  if (value == null) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function resolveHolesPlayedForLeveling(insights: any): number {
  const raw = toFiniteNumber(insights?.raw_payload?.round?.holes_played);
  if (raw != null && raw > 0) return Math.round(raw);
  return 18;
}

function resolveScoreDeltaBucket(insights: any): ScoreDeltaBucket | null {
  const score = toFiniteNumber(insights?.raw_payload?.round?.score);
  const avgScore = toFiniteNumber(insights?.raw_payload?.historical?.avg_score);
  if (score == null || avgScore == null) return null;

  const holesPlayed = resolveHolesPlayedForLeveling(insights);
  const nearDelta = 1.5 * resolvePostRoundStrokeScale(holesPlayed);
  const delta = score - avgScore;
  if (Math.abs(delta) <= nearDelta) return 'near';
  return delta > 0 ? 'worse' : 'better';
}

function resolveMessage1Level(insights: any): InsightLevel {
  const bucket = resolveScoreDeltaBucket(insights);
  if (bucket === 'better') return 'great';
  if (bucket === 'worse') return 'warning';
  return 'success';
}

function resolveMeasuredComponentCount(insights: any): number {
  const fromCount = toFiniteNumber(insights?.raw_payload?.measured_selection?.componentCount);
  if (fromCount != null) return Math.max(0, Math.round(fromCount));

  if (Array.isArray(insights?.raw_payload?.measured_selection?.components)) {
    return insights.raw_payload.measured_selection.components.length;
  }
  return 0;
}

function resolveMessage2Level(input: {
  insights: any;
  outcome: string | null;
  confidence: PostRoundConfidence | null;
  message: string;
}): InsightLevel {
  const { insights, outcome, confidence, message } = input;

  if (outcome === 'M2-D') return 'warning';
  if (outcome === 'M2-E') return 'success';
  if (outcome === 'M2-C') return 'info';

  // M2-A and unknown variants.
  if (confidence === 'LOW') return 'info';

  const measuredCount = resolveMeasuredComponentCount(insights);
  if (measuredCount === 0) {
    const bucket = resolveScoreDeltaBucket(insights);
    return bucket === 'worse' ? 'warning' : 'success';
  }

  // Grounded/broad explanatory M2 for measured stats should stay informational by default.
  // Allow warning only for clearly penalty-risk oriented wording.
  if (
    /\bpenalt(?:y|ies)\b/i.test(message) &&
    /(pressure|trouble|risk|protect)/i.test(message)
  ) {
    return 'warning';
  }
  return 'info';
}

function buildViewerMessageLevels(
  insights: any,
  viewerMessages: string[],
): InsightLevel[] {
  const outcomes: string[] = Array.isArray(insights?.message_outcomes) ? insights.message_outcomes : [];
  const confidence = insights?.confidence === 'LOW' || insights?.confidence === 'MED' || insights?.confidence === 'HIGH'
    ? insights.confidence as PostRoundConfidence
    : null;

  return viewerMessages.map((message, index) => {
    if (index === 0) return resolveMessage1Level(insights);
    if (index === 1) {
      return resolveMessage2Level({
        insights,
        outcome: outcomes[1] ?? null,
        confidence,
        message,
      });
    }
    if (index === 2) return 'info';

    const rawLevel = Array.isArray(insights?.message_levels) ? insights.message_levels[index] : null;
    if (rawLevel === 'great' || rawLevel === 'success' || rawLevel === 'warning' || rawLevel === 'info') {
      return rawLevel;
    }
    return 'info';
  });
}

function limitInsightsForViewer(insights: any, entitlements?: ViewerEntitlements): any {
  const effectiveEntitlements: ViewerEntitlements = entitlements ?? { isPremium: false, showStrokesGained: true };
  const rawMessages: string[] = Array.isArray(insights?.messages) ? insights.messages : [];
  const messages = rawMessages.length === 1 ? (recoverMessagesFromBlob(rawMessages[0]) ?? rawMessages) : rawMessages;
  const normalizedMessages = normalizeInsightMessages(messages).slice(0, MAX_INSIGHTS);

  const visibleCount = effectiveEntitlements.isPremium
    ? Math.min(MAX_INSIGHTS, normalizedMessages.length)
    : Math.min(MAX_INSIGHTS, normalizedMessages.length);

  const viewerMessages = buildViewerMessages(insights, normalizedMessages, effectiveEntitlements);
  const viewerLevels = buildViewerMessageLevels(insights, viewerMessages);

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
    messages: viewerMessages,
    message_levels: viewerLevels.slice(0, viewerMessages.length),
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

function isUnauthorizedError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const message = error.message.toLowerCase();
  return message === 'unauthorized' || message.includes('unauthorized access');
}

async function getViewerEntitlements(userId: bigint): Promise<ViewerEntitlements> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      subscriptionTier: true,
      subscriptionStatus: true,
    },
  });

  const isPremium = user ? isPremiumUser(user) : false;
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
  createdAt: Date;
};

function resolveHistoryRoundContext(raw: unknown): RoundContextKey {
  if (raw === 'simulator' || raw === 'practice' || raw === 'real') return raw;
  return 'real';
}

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

async function getRoundsInLoggedOrder(
  userId: bigint,
  roundContext: RoundContextKey,
): Promise<RoundOrderingEntry[]> {
  const rounds = await prisma.round.findMany({
    where: { userId, roundContext },
    select: { id: true, score: true, createdAt: true },
    // Onboarding should follow logging sequence, not play-date sequence.
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
  });
  return rounds as RoundOrderingEntry[];
}

function isOnboardingInsight(insights: any): boolean {
  return Boolean(insights?.raw_payload?.onboarding?.active);
}

async function shouldRegenerateForOnboardingMismatch(
  _roundId: bigint,
  _userId: bigint,
  insights: any,
): Promise<boolean> {
  if (!isOnboardingInsight(insights)) {
    return false;
  }

  // Onboarding has been retired. Regenerate any legacy onboarding payload.
  return true;
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const userId = await getUserSession();
    const { id } = await params;
    const roundId = BigInt(id);

    const entitlements = await getViewerEntitlements(userId);
    const insights = await generateInsights(roundId, userId, entitlements);
    return NextResponse.json({ insights });
  } catch (error: any) {
    console.error('Error fetching insights:', error);
    const isUnauthorized = isUnauthorizedError(error);
    return NextResponse.json(
      { message: isUnauthorized ? 'Unauthorized' : 'Error fetching insights' },
      { status: isUnauthorized ? 401 : 500 },
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
    const isUnauthorized = isUnauthorizedError(error);
    return NextResponse.json(
      { message: isUnauthorized ? 'Unauthorized' : 'Error generating insights' },
      { status: isUnauthorized ? 401 : 500 },
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
  const needsOnboardingCorrection = existing
    ? await shouldRegenerateForOnboardingMismatch(roundId, userId, existingInsights)
    : false;

  if (existing) {
    if (existing.userId !== userId) {
      throw new Error('Unauthorized');
    }
    if (!forceRegenerate && !needsOnboardingCorrection) {
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
  const historyRoundContext = resolveHistoryRoundContext((round as any).roundContext);

  const roundsInOrder = await getRoundsInLoggedOrder(userId, historyRoundContext);
  const { roundNumber, previousScore, totalRounds } = resolveRoundOrdinalContext(roundId, roundsInOrder);
  const isOnboardingRound = false;
  const shouldBumpVariant = generationOptions.forceRegenerate && generationOptions.bumpVariant && !isOnboardingRound;
  const variantOffset = shouldBumpVariant
    ? generationOptions.previousVariantOffset + 1
    : generationOptions.previousVariantOffset;

  const toPar = Number(round.score) - currentContext.parTotal;

  const sgComponents = await prisma.roundStrokesGained.findUnique({
    where: { roundId },
  });

  const last5Rounds = await prisma.round.findMany({
    where: { userId, roundContext: historyRoundContext, id: { not: roundId } },
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

  const strokeScale = resolvePostRoundStrokeScale(currentHolesPlayed);
  const weaknessThreshold = POST_ROUND_THRESHOLDS.sgWeakness * strokeScale;
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
    {
      dominanceAbsoluteFloor: POST_ROUND_RESIDUAL.dominanceAbsoluteFloor * strokeScale,
      weakSeparationDelta: POST_ROUND_RESIDUAL.weakSeparationDelta * strokeScale,
      totalFloorForRatio: POST_ROUND_RESIDUAL.dominanceAbsoluteFloor * strokeScale,
    },
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
    holesPlayed: currentHolesPlayed,
    confidence: resolvePostRoundConfidence({
      roundNumber,
      measuredComponentCount: measuredSelection.componentCount,
      opportunityIsWeak: measuredSelection.opportunityIsWeak,
      weakSeparation: measuredSelection.weakSeparation,
      sgConfidence: sgComponents?.confidence ? String(sgComponents.confidence).toLowerCase() : null,
      missingStats,
    }),
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

  const confidence = resolvePostRoundConfidence({
    roundNumber,
    measuredComponentCount: measuredSelection.componentCount,
    opportunityIsWeak: measuredSelection.opportunityIsWeak,
    weakSeparation: measuredSelection.weakSeparation,
    sgConfidence: sgComponents?.confidence ? String(sgComponents.confidence).toLowerCase() : null,
    missingStats,
  });

  const insightsData = {
    messages: finalMessages,
    message_levels: deterministicInsights.messageLevels,
    message_outcomes: deterministicInsights.outcomes,
    message_details: deterministicInsights.messageDetails ?? undefined,
    confidence,
    generated_at: new Date().toISOString(),
    model: 'post-round-deterministic-v1',
    variant_offset: variantOffset,
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
        previous_score: previousScore,
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
      onboarding: {
        active: false,
        round_number: roundNumber,
      },
    },
  };

  const savedInsights = await prisma.roundInsight.upsert({
    where: { roundId },
    create: {
      roundId,
      userId,
      modelUsed: 'post-round-deterministic-v1',
      insights: insightsData,
    },
    update: {
      modelUsed: 'post-round-deterministic-v1',
      insights: insightsData,
      updatedAt: new Date(),
    },
  });

  return savedInsights.insights;
}

function resolvePostRoundConfidence(input: {
  roundNumber: number;
  measuredComponentCount: number;
  opportunityIsWeak: boolean;
  weakSeparation: boolean;
  sgConfidence: string | null;
  missingStats: ReturnType<typeof getMissingStats>;
}): PostRoundConfidence {
  const scoreOnly = input.measuredComponentCount === 0;
  if (
    input.roundNumber <= 2 ||
    input.measuredComponentCount < 2 ||
    scoreOnly ||
    input.sgConfidence === 'low'
  ) {
    return 'LOW';
  }

  const hasPartialStats =
    input.missingStats.fir ||
    input.missingStats.gir ||
    input.missingStats.putts ||
    input.missingStats.penalties;
  const noStrongOpportunity = !input.opportunityIsWeak;
  if (hasPartialStats || input.weakSeparation || noStrongOpportunity) {
    return 'MED';
  }

  return 'HIGH';
}

