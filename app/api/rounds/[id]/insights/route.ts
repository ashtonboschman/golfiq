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
import { pickDirectionalPattern, type DirectionalPatternSummary } from '@/lib/insights/directionalMiss';
import {
  buildDeterministicPostRoundInsights,
  type InsightLevel,
  type PerformanceBand,
} from '@/lib/insights/postRound/policy';
import { resolveRoundIdentity } from '@/lib/insights/roundIdentity/resolve';
import { buildWatchCard } from '@/lib/insights/roundIdentity/copyTemplates';
import { ROUND_IDENTITY_V1_VERSION } from '@/lib/insights/roundIdentity/types';
import {
  buildRoundIdentityResolverInput,
  computeCurrentRoundIdentityHash,
  getLastHistoricalRounds,
  getRoundsInHistoricalPlayOrder,
  resolveHistoryRoundContext,
  resolveRoundOrdinalContext,
  resolveRoundPlayedDateTime,
} from '@/lib/insights/roundIdentity/currentIdentityHash';

const MAX_INSIGHTS = 3;
type PostRoundConfidence = 'LOW' | 'MED' | 'HIGH';

// In-flight generation lock to prevent duplicate generation from concurrent requests.
const inFlightGenerations = new Map<string, Promise<any>>();

type ViewerEntitlements = {
  isPremium: boolean;
};
type ScoreDeltaBucket = 'better' | 'near' | 'worse';
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

function resolveDirectionalPreferredArea(componentName: unknown): 'fir' | 'gir' | null {
  if (componentName === 'off_tee') return 'fir';
  if (componentName === 'approach') return 'gir';
  return null;
}

function formatDirectionalAreaLabel(area: 'fir' | 'gir'): string {
  return area === 'gir' ? 'GIR' : 'FIR';
}

function buildPostRoundDirectionalQualifier(input: {
  pattern: DirectionalPatternSummary | null;
  confidence: PostRoundConfidence;
}): string | null {
  const { pattern, confidence } = input;
  if (!pattern) return null;
  if (confidence === 'LOW') return null;

  const area = formatDirectionalAreaLabel(pattern.area);
  const direction = pattern.dominantDirection;
  if (confidence === 'HIGH') {
    return `This round's ${area} misses were mostly ${direction} (${pattern.count}/${pattern.totalDirectionalMisses}).`;
  }

  if (pattern.confidence === 'high') {
    return `This round's ${area} misses leaned ${direction} (${pattern.count}/${pattern.totalDirectionalMisses}).`;
  }
  return `This round's ${area} misses leaned ${direction}.`;
}

function resolveStoredDirectionalPattern(insights: any): DirectionalPatternSummary | null {
  const raw = insights?.raw_payload?.directional;
  if (!raw || typeof raw !== 'object') return null;
  if (raw.area !== 'fir' && raw.area !== 'gir') return null;
  if (!['left', 'right', 'short', 'long'].includes(raw.dominant_direction)) return null;
  if (raw.confidence !== 'medium' && raw.confidence !== 'high') return null;

  const count = toFiniteNumber(raw.dominant_count);
  const totalDirectionalMisses = toFiniteNumber(raw.total_directional_misses);
  if (count == null || totalDirectionalMisses == null || count <= 0 || totalDirectionalMisses < count) return null;

  return {
    area: raw.area,
    dominantDirection: raw.dominant_direction,
    count: Math.round(count),
    totalDirectionalMisses: Math.round(totalDirectionalMisses),
    dominanceRatio: count / totalDirectionalMisses,
    confidence: raw.confidence,
    usable: true,
  };
}

function buildViewerDirectionalQualifier(
  insights: any,
  entitlements: ViewerEntitlements,
  outcome: string | null,
  confidence: PostRoundConfidence | null,
): string | null {
  if (!entitlements.isPremium || outcome !== 'M2-D' || confidence == null) return null;
  return buildPostRoundDirectionalQualifier({
    pattern: resolveStoredDirectionalPattern(insights),
    confidence,
  });
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
    return `${worstLabel} was the main area costing you strokes.`;
  }
  if (outcome === 'M2-E') {
    return `${worstLabel} was the strongest part of the round.`;
  }
  if (outcome === 'M2-C') {
    return `${worstLabel} was not a big factor in the score.`;
  }
  return sanitizeWhitespace(currentMessage);
}

function resolveStoredIdentityLevel(
  insights: any,
  key: 'story' | 'worked' | 'watch',
): InsightLevel | null {
  const level = insights?.raw_payload?.round_identity_v1?.displayLevels?.[key];
  return level === 'great' || level === 'success' || level === 'warning' || level === 'info'
    ? level
    : null;
}

function resolveViewerConfidence(insights: any): PostRoundConfidence | null {
  const identityConfidence = insights?.raw_payload?.round_identity_v1?.confidence;
  if (identityConfidence === 'building') return 'LOW';
  if (identityConfidence === 'moderate') return 'MED';
  if (identityConfidence === 'strong') return 'HIGH';

  const legacyConfidence = insights?.confidence;
  return legacyConfidence === 'LOW' || legacyConfidence === 'MED' || legacyConfidence === 'HIGH'
    ? legacyConfidence
    : null;
}

function resolveFreeIdentityMessage2(insights: any): { text: string; level: InsightLevel } | null {
  const identity = insights?.raw_payload?.round_identity_v1;
  const evidence = identity?.displayEvidence;
  if (!identity || !evidence || typeof evidence !== 'object') return null;

  const level = resolveStoredIdentityLevel(insights, 'worked');
  const strongest = evidence.strongestArea;
  const weakest = evidence.weakestArea;

  if (identity.primaryKey === 'no_clear_separator') {
    const slightlyLower = weakest?.label;
    const slightlyHigher = strongest?.label;
    if (typeof slightlyLower === 'string' && slightlyLower.trim()) {
      return {
        text: `No tracked area clearly separated. ${slightlyLower.trim()} was slightly lower, but not enough to define the round.`,
        level: 'info',
      };
    }
    if (typeof slightlyHigher === 'string' && slightlyHigher.trim()) {
      return {
        text: `No tracked area clearly separated. ${slightlyHigher.trim()} was slightly higher, but not enough to define the round.`,
        level: 'info',
      };
    }
    return {
      text: 'No tracked area separated enough to call a clear strength or leak.',
      level: 'info',
    };
  }

  const selected = level === 'success' && strongest
    ? strongest
    : level === 'warning' && weakest
      ? weakest
      : strongest ?? weakest;
  if (!selected || typeof selected.label !== 'string' || !selected.label.trim()) return null;

  const label = selected.label.trim();
  if (selected === strongest) {
    return { text: `${label} was the strongest part of the round.`, level: level ?? 'success' };
  }
  if (selected.area === 'big_numbers') {
    return { text: 'Costly holes were the clearest scoring issue.', level: level ?? 'warning' };
  }
  if (selected.area === 'penalties') {
    return { text: 'Penalty strokes were the clearest scoring issue.', level: level ?? 'warning' };
  }
  return { text: `${label} was the main area costing you strokes.`, level: level ?? 'warning' };
}

function buildFreeMessage1(
  message: string,
  insights: any,
  noBaselineHistory: boolean,
): string {
  const baseMessage = noBaselineHistory ? firstNSentences(message, 2) : sentenceOne(message);
  const scoreBucket = resolveScoreDeltaBucket(insights);
  const storyLevel = resolveStoredIdentityLevel(insights, 'story');

  if ((storyLevel === 'success' || storyLevel === 'great') && scoreBucket === 'worse') {
    return `${baseMessage} Even so, your overall performance finished above expectation.`;
  }
  if (storyLevel === 'warning' && scoreBucket === 'better') {
    return `${baseMessage} The score improved, but your overall performance still finished below expectation.`;
  }
  return baseMessage;
}

function resolveFreeIdentityMessage3(insights: any): { text: string; level: InsightLevel } | null {
  const identity = insights?.raw_payload?.round_identity_v1;
  if (!identity || typeof identity !== 'object') return null;
  const canonicalFocus = buildWatchCard(identity);
  const focus = canonicalFocus || identity.nextRoundFocus;
  if (typeof focus !== 'string' || !focus.trim()) return null;
  const trimmed = focus.trim();
  const text = /^Next round[:,]\s*/i.test(trimmed)
    ? trimmed.replace(/^Next round[:,]\s*/i, 'Next round: ')
    : `Next round: ${trimmed}`;
  return {
    text,
    level: resolveStoredIdentityLevel(insights, 'watch') ?? 'info',
  };
}

function buildViewerMessages(
  insights: any,
  normalizedMessages: string[],
  entitlements: ViewerEntitlements,
): string[] {
  const outcomes: string[] = Array.isArray(insights?.message_outcomes) ? insights.message_outcomes : [];
  const details = insights?.message_details as { m2BaseText?: string; m2ResidualIncluded?: boolean } | undefined;
  const confidence = insights?.confidence === 'LOW' || insights?.confidence === 'MED' || insights?.confidence === 'HIGH'
    ? insights.confidence as PostRoundConfidence
    : null;
  const worstLabel = resolveWorstLabel(insights);
  const noBaselineHistory = hasNoBaselineHistory(insights);

  return normalizedMessages.map((message, index) => {
    if (entitlements.isPremium && index !== 1) return message;

    if (index === 0) {
      // Free always gets a score-focused headline, not SG component precision.
      return buildFreeMessage1(message, insights, noBaselineHistory);
    }

    if (index === 1) {
      const outcome = outcomes[1] ?? null;
      const directionalQualifier = buildViewerDirectionalQualifier(
        insights,
        entitlements,
        outcome,
        confidence,
      );
      if (entitlements.isPremium) {
        return sanitizeWhitespace(`${message}${directionalQualifier ? ` ${directionalQualifier}` : ''}`);
      }
      const identityMessage = resolveFreeIdentityMessage2(insights);
      if (identityMessage) return identityMessage.text;
      const baseMessage = details?.m2BaseText ? sanitizeWhitespace(details.m2BaseText) : sanitizeWhitespace(message);
      const freeM2 = buildFreeMessage2(baseMessage, outcome, confidence, worstLabel);
      return stripSgPrecisionPhrases(`${freeM2}${directionalQualifier ? ` ${directionalQualifier}` : ''}`);
    }

    if (index === 2 && !entitlements.isPremium) {
      const identityFocus = resolveFreeIdentityMessage3(insights);
      if (identityFocus) return identityFocus.text;
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
  const nearDelta = POST_ROUND_THRESHOLDS.scoreNearDelta * resolvePostRoundStrokeScale(holesPlayed);
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
  entitlements: ViewerEntitlements,
): InsightLevel[] {
  const outcomes: string[] = Array.isArray(insights?.message_outcomes) ? insights.message_outcomes : [];
  const confidence = insights?.confidence === 'LOW' || insights?.confidence === 'MED' || insights?.confidence === 'HIGH'
    ? insights.confidence as PostRoundConfidence
    : null;

  return viewerMessages.map((message, index) => {
    if (index === 0) {
      if (!entitlements.isPremium) {
        const identityLevel = resolveStoredIdentityLevel(insights, 'story');
        if (identityLevel) return identityLevel;
      }
      return resolveMessage1Level(insights);
    }
    if (index === 1) {
      if (!entitlements.isPremium) {
        const identityMessage = resolveFreeIdentityMessage2(insights);
        if (identityMessage) return identityMessage.level;
      }
      return resolveMessage2Level({
        insights,
        outcome: outcomes[1] ?? null,
        confidence,
        message,
      });
    }
    if (index === 2) {
      if (!entitlements.isPremium) {
        const identityFocus = resolveFreeIdentityMessage3(insights);
        if (identityFocus) return identityFocus.level;
      }
      return 'info';
    }

    const rawLevel = Array.isArray(insights?.message_levels) ? insights.message_levels[index] : null;
    if (rawLevel === 'great' || rawLevel === 'success' || rawLevel === 'warning' || rawLevel === 'info') {
      return rawLevel;
    }
    return 'info';
  });
}

function buildViewerRoundIdentity(
  insights: any,
  entitlements: ViewerEntitlements,
): any | null {
  const identity = insights?.raw_payload?.round_identity_v1;
  if (!identity || typeof identity !== 'object') return null;
  return entitlements.isPremium ? identity : null;
}

function limitInsightsForViewer(insights: any, entitlements?: ViewerEntitlements): any {
  const effectiveEntitlements: ViewerEntitlements = entitlements ?? { isPremium: false };
  const rawMessages: string[] = Array.isArray(insights?.messages) ? insights.messages : [];
  const messages = rawMessages.length === 1 ? (recoverMessagesFromBlob(rawMessages[0]) ?? rawMessages) : rawMessages;
  const normalizedMessages = normalizeInsightMessages(messages).slice(0, MAX_INSIGHTS);

  const viewerMessages = buildViewerMessages(insights, normalizedMessages, effectiveEntitlements);
  const viewerLevels = buildViewerMessageLevels(insights, viewerMessages, effectiveEntitlements);
  const viewerRoundIdentity = buildViewerRoundIdentity(insights, effectiveEntitlements);
  const viewerConfidence = resolveViewerConfidence(insights);

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
    confidence: viewerConfidence ?? rest.confidence,
    round_identity_v1: viewerRoundIdentity,
    round_number:
      insights?.raw_payload?.onboarding?.round_number != null
        ? Number(insights.raw_payload.onboarding.round_number)
        : null,
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
  return { isPremium };
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

async function shouldRegenerateForRoundIdentityMismatch(
  roundId: bigint,
  userId: bigint,
  insights: any,
): Promise<boolean> {
  const identity = insights?.raw_payload?.round_identity_v1;
  if (!identity || typeof identity !== 'object') return true;
  if (identity.version !== ROUND_IDENTITY_V1_VERSION) return true;
  if (typeof identity.inputHash !== 'string' || !identity.inputHash) return true;

  const currentHash = await computeCurrentRoundIdentityHash(roundId, userId);
  if (!currentHash) return false;
  return currentHash !== identity.inputHash;
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

export async function generateInsights(
  roundId: bigint,
  userId: bigint,
  entitlements?: ViewerEntitlements,
  options?: { forceRegenerate?: boolean },
) {
  const effectiveEntitlements = entitlements ?? (await getViewerEntitlements(userId));
  const forceRegenerate = options?.forceRegenerate === true;

  const existing = await prisma.roundInsight.findUnique({ where: { roundId } });
  const existingInsights = existing?.insights as any;
  const previousVariantOffset = resolvePostRoundVariantOffset(existingInsights);
  const needsOnboardingCorrection = existing
    ? await shouldRegenerateForOnboardingMismatch(roundId, userId, existingInsights)
    : false;
  const needsRoundIdentityRefresh = existing
    ? await shouldRegenerateForRoundIdentityMismatch(roundId, userId, existingInsights)
    : false;

  if (existing) {
    if (existing.userId !== userId) {
      throw new Error('Unauthorized');
    }
    if (!forceRegenerate && !needsOnboardingCorrection && !needsRoundIdentityRefresh) {
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

  const promise = generateInsightsInternal(roundId, userId, {
    previousVariantOffset,
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
  generationOptions: {
    previousVariantOffset: number;
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
          hole: {
            select: {
              holeNumber: true,
              par: true,
            },
          },
        },
        orderBy: [{ pass: 'asc' }, { hole: { holeNumber: 'asc' } }],
      },
    },
  });

  if (!round) throw new Error('Round not found');
  if (round.userId !== userId) throw new Error('Unauthorized access to round');

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
  const { roundNumber, previousScore, totalRounds } = resolveRoundOrdinalContext(roundId, roundsInOrder);
  const variantOffset = generationOptions.previousVariantOffset;

  const toPar = Number(round.score) - currentContext.parTotal;

  const sgComponents = await prisma.roundStrokesGained.findUnique({
    where: { roundId },
  });

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

  const roundIdentityInput = buildRoundIdentityResolverInput({
    roundId,
    round,
    sgComponents,
    holesPlayed: currentHolesPlayed,
    parTotal: currentContext.parTotal,
    toPar,
    roundNumber,
    avgScore,
    fairwaysPossible: currentContext.nonPar3Holes,
  });
  const roundIdentity = resolveRoundIdentity(roundIdentityInput);

  const totalSg = sgComponents?.sgTotal != null ? Number(sgComponents.sgTotal) : null;
  const shortGameOpportunities =
    round.girHit != null && Number.isFinite(Number(round.girHit))
      ? Math.max(0, currentHolesPlayed - Number(round.girHit))
      : null;
  const minShortGameOpportunities = currentHolesPlayed <= 9 ? 2 : 4;

  const strokeScale = resolvePostRoundStrokeScale(currentHolesPlayed);
  const weaknessThreshold = POST_ROUND_THRESHOLDS.sgWeakness * strokeScale;
  const measuredSelection = runMeasuredSgSelection(
    {
      offTee: sgComponents?.sgOffTee != null ? Number(sgComponents.sgOffTee) : null,
      approach: sgComponents?.sgApproach != null ? Number(sgComponents.sgApproach) : null,
      shortGame: (sgComponents as any)?.sgShortGame != null ? Number((sgComponents as any).sgShortGame) : null,
      shortGameOpportunities,
      minShortGameOpportunities,
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

  const confidence = resolvePostRoundConfidence({
    roundNumber,
    measuredComponentCount: measuredSelection.componentCount,
    opportunityIsWeak: measuredSelection.opportunityIsWeak,
    weakSeparation: measuredSelection.weakSeparation,
    sgConfidence: sgComponents?.confidence ? String(sgComponents.confidence).toLowerCase() : null,
    missingStats,
  });

  const deterministicInsights = buildDeterministicPostRoundInsights({
    score: Number(round.score),
    toPar,
    avgScore: avgScore != null && Number.isFinite(avgScore) ? avgScore : null,
    band: computePerformanceBand(totalSg, currentHolesPlayed),
    sgTotal: totalSg,
    sgPenalties: sgComponents?.sgPenalties != null ? Number(sgComponents.sgPenalties) : null,
    sgPutting: sgComponents?.sgPutting != null ? Number(sgComponents.sgPutting) : null,
    measuredComponents: measuredSelection.components,
    bestMeasured: measuredSelection.best,
    worstMeasured: measuredSelection.opportunity,
    opportunityIsWeak: measuredSelection.opportunityIsWeak,
    residualDominant: measuredSelection.residualDominant,
    weakSeparation: measuredSelection.weakSeparation,
    missing: missingStats,
    residualValue: sgComponents?.sgResidual != null ? Number(sgComponents.sgResidual) : null,
    holesPlayed: currentHolesPlayed,
    confidence,
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

  const preferredDirectionalArea = resolveDirectionalPreferredArea(measuredSelection.opportunity?.name);
  const directionalRoundHoles = roundIdentityInput.entryMode === 'live_round'
    ? (Array.isArray((round as any).roundHoles) ? (round as any).roundHoles : [])
    : [];
  const directionalPattern = pickDirectionalPattern({
    firValues: directionalRoundHoles.map((hole: any) => hole?.firDirection ?? null),
    girValues: directionalRoundHoles.map((hole: any) => hole?.girDirection ?? null),
    preferredArea: preferredDirectionalArea,
    options: {
      minMisses: 4,
      minDominanceRatio: 0.7,
      minMargin: 2,
      highConfidenceMisses: 6,
      highConfidenceDominanceRatio: 0.78,
    },
  });
  const roundIdentityWithDirectional =
    directionalPattern && directionalPattern.confidence !== 'low' && confidence !== 'LOW'
      ? {
          ...roundIdentity,
          displayEvidence: {
            ...roundIdentity.displayEvidence,
            directional: {
              area: directionalPattern.area,
              dominantDirection: directionalPattern.dominantDirection,
              count: directionalPattern.count,
              totalDirectionalMisses: directionalPattern.totalDirectionalMisses,
              confidence: directionalPattern.confidence,
            },
          },
        }
      : roundIdentity;

  const finalMessages: [string, string, string] = [
    enforceMaxMessageChars(deterministicInsights.messages[0], POST_ROUND_MESSAGE_MAX_CHARS),
    enforceMaxMessageChars(deterministicInsights.messages[1], POST_ROUND_MESSAGE_MAX_CHARS),
    enforceMaxMessageChars(deterministicInsights.messages[2], POST_ROUND_MESSAGE_MAX_CHARS),
  ];

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
        short_game: (sgComponents as any)?.sgShortGame != null ? Number((sgComponents as any).sgShortGame) : null,
        putting: sgComponents?.sgPutting != null ? Number(sgComponents.sgPutting) : null,
        penalties: sgComponents?.sgPenalties != null ? Number(sgComponents.sgPenalties) : null,
        residual: sgComponents?.sgResidual != null ? Number(sgComponents.sgResidual) : null,
      },
      measured_selection: measuredSelection,
      missing_stats: missingStats,
      directional: directionalPattern
        ? {
            area: directionalPattern.area,
            dominant_direction: directionalPattern.dominantDirection,
            dominant_count: directionalPattern.count,
            total_directional_misses: directionalPattern.totalDirectionalMisses,
            dominance_ratio: directionalPattern.dominanceRatio,
            confidence: directionalPattern.confidence,
          }
        : null,
      round_identity_v1: roundIdentityWithDirectional,
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

