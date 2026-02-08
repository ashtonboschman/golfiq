import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { resolveTeeContext, type TeeSegment } from '@/lib/tee/resolveTeeContext';
import { callOpenAI, type OpenAIUsageSummary } from '@/lib/insights/openai';
import { validateRealizedInsightsV3 } from '@/lib/insights/v3/validate';
import { buildRealizerPromptsV3, normalizeRealizerParsedOutputV3 } from '@/lib/insights/v3/prompt';
import { SG_COEFFICIENTS } from '@/lib/utils/strokesGainedCoefficients';

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

// ---------------------------------------------------------------------------
// Thresholds and Constants
// ---------------------------------------------------------------------------

/** SG threshold below which a component is considered a weakness */
const SG_WEAKNESS_THRESHOLD = -1.0;

/** SG threshold for a "large" weakness requiring âš ï¸ emoji */
const SG_LARGE_WEAKNESS_THRESHOLD = -2.0;

/** SG threshold for short-game attribution from residual */
const SG_SHORT_GAME_THRESHOLD = -2.0;

/** Total SG threshold for a "tough" round */
const SG_TOUGH_ROUND_THRESHOLD = -5.0;

/** Total SG threshold for "below expectations" (not disastrous) */
const SG_BELOW_EXPECTATIONS_THRESHOLD = -2.0;

/** Total SG threshold for "above expectations" */
const SG_ABOVE_EXPECTATIONS_THRESHOLD = 2.0;

/** Total SG threshold for exceptional performance (ðŸ”¥ emoji) */
const SG_EXCEPTIONAL_THRESHOLD = 5.0;

/** Individual component SG threshold for exceptional performance */
const SG_EXCEPTIONAL_COMPONENT_THRESHOLD = 4.0;

/** Course slope rating threshold for "above-average difficulty" */
const HIGH_SLOPE_THRESHOLD = 130;

/** FIR percentage threshold for "very low" triggering override */
const VERY_LOW_FIR_PCT = 25;

/** GIR percentage threshold for "very low" triggering override */
const VERY_LOW_GIR_PCT = 20;

/** Minimum adjusted-expectation gap (percentage points) to trigger SG opportunity nudge */
const SG_OPPORTUNITY_NUDGE_GAP_PCT = 10;

/** Maximum SG distance (strokes) between current and nudged opportunity to allow a nudge */
const SG_OPPORTUNITY_NUDGE_MARGIN = 0.6;


/** Baseline difference threshold for stat comparisons (e.g., FIR/GIR 8% below baseline) */
const BASELINE_DIFFERENCE_THRESHOLD = 8;

/** OpenAI model to use */
const OPENAI_MODEL = 'gpt-4o-mini';

/** Cap output tokens for post-round latency */
const OPENAI_MAX_COMPLETION_TOKENS = (() => {
  const raw = Number(process.env.OPENAI_MAX_COMPLETION_TOKENS ?? 280);
  if (Number.isFinite(raw)) return Math.max(160, Math.floor(raw));
  return 280;
})();
/** Hard timeout per OpenAI request to keep post-round UX responsive. */
const OPENAI_TIMEOUT_MS = (() => {
  const raw = Number(process.env.OPENAI_TIMEOUT_MS ?? 12000);
  if (Number.isFinite(raw)) return Math.max(3000, Math.floor(raw));
  return 12000;
})();

/** Keep each insight message short enough to be readable on mobile */
const MAX_MESSAGE_CHARS = 320;
/** Reuse the same drill briefly during rapid same-round regenerations when inputs are unchanged. */
const DRILL_REUSE_WINDOW_MS = 60_000;

// In-flight generation lock to prevent duplicate OpenAI calls from concurrent requests
const inFlightGenerations = new Map<string, Promise<any>>();

function formatToParShort(toPar: number): string {
  if (toPar === 0) return 'E';
  return toPar > 0 ? `+${toPar}` : `${toPar}`;
}

function formatToParPhrase(toPar: number): string {
  if (toPar === 0) return 'even par';
  const abs = Math.abs(toPar);
  const suffix = abs === 1 ? 'stroke' : 'strokes';
  return toPar > 0 ? `${abs} ${suffix} over par` : `${abs} ${suffix} under par`;
}

async function getUserSession() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    throw new Error('Unauthorized');
  }
  return BigInt(session.user.id);
}

type ViewerEntitlements = {
  isPremium: boolean;
  showStrokesGained: boolean;
};

async function getViewerEntitlements(userId: bigint): Promise<ViewerEntitlements> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      subscriptionTier: true,
      profile: { select: { showStrokesGained: true } },
    },
  });

  const isPremium = user?.subscriptionTier === 'premium' || user?.subscriptionTier === 'lifetime';
  const showStrokesGained = user?.profile?.showStrokesGained ?? true;
  return { isPremium, showStrokesGained };
}

const MAX_INSIGHTS = 3;

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

  // If an old/bad generation accidentally stored a JSON blob as a single string,
  // recover the 3 messages so the UI renders correctly (without requiring regen).
  const recoverMessagesFromBlob = (blob: string): string[] | null => {
    const trimmed = blob.trim();
    if (!trimmed.startsWith('{')) return null;

    // Common failure mode: model avoids ":" and produces `"messages".[` instead.
    const fixed = trimmed.replace(/"messages"\s*\.\s*\[/gi, '"messages":[');
    try {
      const parsed = JSON.parse(fixed);
      const msgs = parsed?.messages;
      if (Array.isArray(msgs) && msgs.every((m: any) => typeof m === 'string')) return msgs;
    } catch {
      // ignore
    }

    // Last resort: extract quoted strings that start with the expected emojis.
    const quoted = fixed.match(/"(?:âœ…|ðŸ”¥|âš ï¸|â„¹ï¸)[^"]*"/g);
    if (quoted && quoted.length >= 3) {
      return quoted.slice(0, 3).map((s) => s.slice(1, -1));
    }

    return null;
  };

  const messages =
    rawMessages.length === 1
      ? (recoverMessagesFromBlob(rawMessages[0]) ?? rawMessages)
      : rawMessages;
  const visibleCount = effectiveEntitlements.isPremium
    ? Math.min(MAX_INSIGHTS, messages.length)
    : Math.min(getFreeVisibleCount(insights), messages.length);
  const cappedMessages = messages.slice(0, MAX_INSIGHTS);

  // Never return debug payloads or internal metadata to the client.
  const {
    raw_payload,
    realizer_raw,
    planner,
    planner_v2,
    openai_usage,
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
    messages: cappedMessages,
    visible_count: visibleCount,
  };
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
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
      { status: error.message === 'Unauthorized' ? 401 : 500 }
    );
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const userId = await getUserSession();
    const { id } = await params;
    const roundId = BigInt(id);

    const entitlements = await getViewerEntitlements(userId);
    const insights = await generateInsights(roundId, userId, entitlements, { forceRegenerate: true });
    return NextResponse.json({ insights });
  } catch (error: any) {
    console.error('Error generating insights:', error);
    return NextResponse.json(
      { message: error.message || 'Error generating insights' },
      { status: error.message === 'Unauthorized' ? 401 : 500 }
    );
  }
}

// ---------------------------------------------------------------------------
// SG Selection Algorithm Types
// ---------------------------------------------------------------------------

type SGComponentName = 'off_tee' | 'approach' | 'putting' | 'penalties' | 'short_game';

interface SGComponent {
  name: SGComponentName;
  value: number;
  label: string;
}

interface SGSelection {
  best: SGComponent;
  message2: SGComponent;
  message2IsOpportunity: boolean;
  noWeaknessMode: boolean;
  msg1Emoji: 'ðŸ”¥' | 'âœ…';
  msg2Emoji: 'ðŸ”¥' | 'âœ…' | 'âš ï¸';
  residualNote: string | null;
}

type SgOpportunityNudgeSignals = {
  firGapPct: number | null;
  girGapPct: number | null;
  veryLowFir: boolean;
  veryLowGir: boolean;
};

const SG_LABELS: Record<SGComponentName, string> = {
  off_tee: 'Off the Tee',
  approach: 'Approach',
  putting: 'Putting',
  penalties: 'Penalties',
  short_game: 'Short Game',
};

function sentenceCaseAreaLabel(label: string): string {
  // "Off the Tee" reads a bit like a category tag; make it feel like a sentence.
  if (label === 'Off the Tee') return 'Off the tee';
  return label;
}

function clampPct(value: number): number {
  return Math.max(0, Math.min(100, value));
}

function computeAdjustedExpectedAccuracyPcts(args: {
  handicap: number | null;
  courseRating: number | null;
  slopeRating: number | null;
  holesPlayed: number;
  baselineFirPct: number | null;
  baselineGirPct: number | null;
}): { firPct: number | null; girPct: number | null } {
  const {
    handicap,
    courseRating,
    slopeRating,
    holesPlayed,
    baselineFirPct,
    baselineGirPct,
  } = args;

  if (
    handicap == null ||
    !Number.isFinite(handicap) ||
    courseRating == null ||
    !Number.isFinite(courseRating) ||
    slopeRating == null ||
    !Number.isFinite(slopeRating)
  ) {
    return { firPct: null, girPct: null };
  }

  const normalizedCourseRating = courseRating * (18 / holesPlayed);
  const ratingDelta = normalizedCourseRating - 72;
  const slopeDelta = handicap * ((slopeRating / 113) - 1);

  const adjustedFir =
    baselineFirPct != null && Number.isFinite(baselineFirPct)
      ? clampPct(
          baselineFirPct -
            ratingDelta * SG_COEFFICIENTS.RATING_TO_FIR_PCT -
            slopeDelta * SG_COEFFICIENTS.SLOPE_TO_FIR_PCT
        )
      : null;
  const adjustedGir =
    baselineGirPct != null && Number.isFinite(baselineGirPct)
      ? clampPct(
          baselineGirPct -
            ratingDelta * SG_COEFFICIENTS.RATING_TO_GIR_PCT -
            slopeDelta * SG_COEFFICIENTS.SLOPE_TO_GIR_PCT
        )
      : null;

  return { firPct: adjustedFir, girPct: adjustedGir };
}

function applyOpportunityNudge(args: {
  selection: SGSelection | null;
  totalSg: number | null;
  sgOffTee: number | null;
  sgApproach: number | null;
  signals: SgOpportunityNudgeSignals;
}): SGSelection | null {
  const { selection, totalSg, sgOffTee, sgApproach, signals } = args;
  if (!selection) return selection;
  if (totalSg == null || !Number.isFinite(totalSg) || totalSg >= 0) return selection;

  const current = selection.message2;
  if (!Number.isFinite(current.value) || current.value >= 0) return selection;

  type Candidate = { name: 'off_tee' | 'approach'; value: number; signalScore: number };
  const candidates: Candidate[] = [];

  const firGap = signals.firGapPct;
  if (sgOffTee != null && Number.isFinite(sgOffTee) && sgOffTee < 0) {
    const firSignalFromGap =
      firGap != null && firGap >= SG_OPPORTUNITY_NUDGE_GAP_PCT
        ? 1 + (firGap - SG_OPPORTUNITY_NUDGE_GAP_PCT)
        : 0;
    const firSignal =
      firSignalFromGap +
      (signals.veryLowFir ? 4 : 0);
    if (firSignal > 0) candidates.push({ name: 'off_tee', value: sgOffTee, signalScore: firSignal });
  }

  const girGap = signals.girGapPct;
  if (sgApproach != null && Number.isFinite(sgApproach) && sgApproach < 0) {
    const girSignalFromGap =
      girGap != null && girGap >= SG_OPPORTUNITY_NUDGE_GAP_PCT
        ? 1 + (girGap - SG_OPPORTUNITY_NUDGE_GAP_PCT)
        : 0;
    const girSignal =
      girSignalFromGap +
      (signals.veryLowGir ? 4 : 0);
    if (girSignal > 0) candidates.push({ name: 'approach', value: sgApproach, signalScore: girSignal });
  }

  if (!candidates.length) return selection;

  const target = candidates
    .sort((a, b) => b.signalScore - a.signalScore || a.value - b.value)[0];
  if (target.name === current.name) return selection;

  const closeCall = Math.abs(target.value - current.value) <= SG_OPPORTUNITY_NUDGE_MARGIN;
  if (!closeCall) return selection;

  return {
    ...selection,
    message2: {
      name: target.name,
      value: target.value,
      label: SG_LABELS[target.name],
    },
  };
}

// ---------------------------------------------------------------------------
// SG Selection Algorithm (server-side, deterministic)
// ---------------------------------------------------------------------------

function runSGSelection(
  sgOffTee: number | null,
  sgApproach: number | null,
  sgPutting: number | null,
  sgPenalties: number | null,
  sgResidual: number | null,
  sgTotal: number | null,
  thresholds: {
    weakness: number;
    largeWeakness: number;
    shortGame: number;
    aboveExpectations: number;
    belowExpectations: number;
    exceptional: number;
    exceptionalComponent: number;
  },
): SGSelection | null {
  // Build non-null component array (exclude residual)
  const components: SGComponent[] = [];
  if (sgOffTee != null) components.push({ name: 'off_tee', value: sgOffTee, label: SG_LABELS.off_tee });
  if (sgApproach != null) components.push({ name: 'approach', value: sgApproach, label: SG_LABELS.approach });
  if (sgPutting != null) components.push({ name: 'putting', value: sgPutting, label: SG_LABELS.putting });
  if (sgPenalties != null) components.push({ name: 'penalties', value: sgPenalties, label: SG_LABELS.penalties });

  // Short game is an *inference* from residual. Only attribute it when:
  // - The round was below expectation overall (sgTotal < 0),
  // - Residual is meaningfully negative,
  // - Residual is materially worse than the worst non-residual component (gap threshold),
  // - Use uncertainty language downstream ("most likely"/"suggests").
  const residualNum = sgResidual != null && Number.isFinite(sgResidual) ? sgResidual : null;
  const totalSgNumForShortGame = sgTotal != null && Number.isFinite(sgTotal) ? sgTotal : null;
  const otherNumsAll: number[] = [sgOffTee, sgApproach, sgPutting, sgPenalties]
    .filter((v): v is number => v != null && Number.isFinite(v));

  const shouldUseShortGame = (() => {
    if (residualNum == null) return false;
    if (totalSgNumForShortGame == null || totalSgNumForShortGame >= 0) return false;
    if (otherNumsAll.length < 2) return false;
    if (residualNum > thresholds.shortGame) return false;

    // Guard: only infer short game when other tracked components are not clearly weak.
    // This keeps residual from overpowering a round where an individual component explains the outcome.
    const othersNotWeak = otherNumsAll.every((v) => v >= thresholds.weakness);
    if (!othersNotWeak) return false;

    const nextWorstNonResidual = Math.min(...otherNumsAll);

    // Scale the gap threshold for 9-hole rounds (we scale weakness thresholds similarly elsewhere).
    const derivedScaleRaw = thresholds.weakness / SG_WEAKNESS_THRESHOLD;
    const derivedScale = Number.isFinite(derivedScaleRaw) && derivedScaleRaw > 0 ? derivedScaleRaw : 1.0;
    const residualGapThreshold = 1.0 * derivedScale;

    const residualWorseByGap = (nextWorstNonResidual - residualNum) >= residualGapThreshold;
    return residualWorseByGap;
  })();
  if (shouldUseShortGame) {
    components.push({ name: 'short_game', value: residualNum!, label: SG_LABELS.short_game });
  }

  if (components.length < 2) return null;

  // Step 2: Determine overall mode and extremes
  const negatives = components.filter(c => c.value < thresholds.weakness);
  const noWeaknessMode = negatives.length === 0;

  const bestRaw = components.reduce((max, c) => c.value > max.value ? c : max, components[0]);
  const worstRaw = components.reduce((min, c) => c.value < min.value ? c : min, components[0]);

  const secondBestRaw = components
    .filter(c => c.name !== bestRaw.name)
    .reduce((max, c) => c.value > max.value ? c : max, components.find(c => c.name !== bestRaw.name) ?? bestRaw);

  // Step 3: Best-for-display (never praise penalties in Message 1)
  const bestComponent: SGComponent =
    bestRaw.name === 'penalties' && secondBestRaw && secondBestRaw.name !== bestRaw.name
      ? secondBestRaw
      : bestRaw;

  // Step 4: Message 2 selection policy
  // Always use the lowest selected component for Message 2.
  // Tone/emoji are derived from sign (<0 opportunity, >=0 second positive).
  let message2Component: SGComponent | null = null;
  let message2IsOpportunity = false;
  message2Component = worstRaw;

  if (!message2Component) return null;

  // If inferred short game is lowest but a measured component is clearly weak (<= -1.5),
  // prefer the measured weakness so residual inference doesn't overpower direct evidence.
  if (message2Component.name === 'short_game') {
    const measuredCandidates = components.filter((c) => c.name !== 'short_game');
    if (measuredCandidates.length) {
      const worstMeasured = measuredCandidates.reduce((min, c) => (c.value < min.value ? c : min), measuredCandidates[0]);
      const derivedScaleRaw = thresholds.weakness / SG_WEAKNESS_THRESHOLD;
      const derivedScale = Number.isFinite(derivedScaleRaw) && derivedScaleRaw > 0 ? derivedScaleRaw : 1.0;
      const measuredWeakOverrideThreshold = -1.5 * derivedScale;
      if (Number.isFinite(worstMeasured.value) && worstMeasured.value <= measuredWeakOverrideThreshold) {
        message2Component = worstMeasured;
      }
    }
  }

  // Ensure Message 1 and Message 2 never repeat the same category (ties/degenerate rounds).
  if (message2Component.name === bestComponent.name) {
    const alt = components.filter(c => c.name !== bestComponent.name);
    if (alt.length) {
      message2Component = alt.reduce((min, c) => c.value < min.value ? c : min, alt[0]);
    }
  }
  message2IsOpportunity = Number.isFinite(message2Component.value) && message2Component.value < 0;

  // Emoji logic (based on SG thresholds, but do not surface values in text)
  const totalSG = sgTotal != null ? sgTotal : 0;
  const bestVal = bestComponent.value;

  let msg1Emoji: 'ðŸ”¥' | 'âœ…';
  if (totalSG >= thresholds.exceptional || bestVal >= thresholds.exceptionalComponent) {
    msg1Emoji = 'ðŸ”¥';
  } else {
    msg1Emoji = 'âœ…';
  }
  // Override: if total SG <= below expectations threshold, never use ðŸ”¥
  if (totalSG <= thresholds.belowExpectations) {
    msg1Emoji = 'âœ…';
  }

  let msg2Emoji: 'ðŸ”¥' | 'âœ…' | 'âš ï¸';
  if (message2IsOpportunity) {
    msg2Emoji = 'âš ï¸';
  } else {
    msg2Emoji = (totalSG >= thresholds.exceptional || message2Component.value >= thresholds.exceptionalComponent) ? 'ðŸ”¥' : 'âœ…';
    if (totalSG <= thresholds.belowExpectations) msg2Emoji = 'âœ…';
  }

  // Residual note: only used in Message 3 when short-game attribution is active
  let residualNote: string | null = null;
  if (shouldUseShortGame) {
    residualNote = 'Some shots around the green likely contributed today.';
  }

  return {
    best: bestComponent,
    message2: message2Component,
    message2IsOpportunity,
    noWeaknessMode,
    msg1Emoji,
    msg2Emoji,
    residualNote,
  };
}

// ---------------------------------------------------------------------------
// Planner + Realizer
// ---------------------------------------------------------------------------

type InsightEmoji = '\u2705' | '\u26A0\uFE0F' | '\u2139\uFE0F' | '\uD83D\uDD25';

const EMOJI_SUCCESS: InsightEmoji = '\u2705';
const EMOJI_WARN: InsightEmoji = '\u26A0\uFE0F';
const EMOJI_INFO: InsightEmoji = '\u2139\uFE0F';
const EMOJI_FIRE: InsightEmoji = '\uD83D\uDD25';

type PerformanceBand = 'tough' | 'below' | 'expected' | 'above' | 'great' | 'unknown';

type PlannedInsightKey = 'insight1' | 'insight2' | 'insight3';

type PlannedInsight = {
  key: PlannedInsightKey;
  emoji: InsightEmoji;
  // Human-readable label only; the model must not invent new topics.
  topic: string;
  // The text the model should aim to produce (template-like guidance).
  templateHint: string;
  // For validation.
  maxSentences: 2;
};

type PlannerOutput = {
  insights: {
    insight1: PlannedInsight;
    insight2: PlannedInsight;
    insight3: PlannedInsight;
  };
  onboardingMode: boolean;
  // Deterministic phrasing selector to avoid "stuck" copy while keeping identical inputs stable.
  styleVariant: number;
  allowSgLanguage: boolean;
  focus: {
    bestName: SGComponentName | null;
    opportunityName: SGComponentName | null;
    shortGameInferred: boolean;
  };
  action: {
    type: 'track' | 'drill' | 'general';
    stat: 'putts' | 'penalties' | 'GIR' | 'FIR' | null;
    drill: string | null;
  };
  // Numeric allowlist for validation (includes computed â€œrounds remainingâ€).
  allowedNumbers: number[];
  // When stats are missing, we forbid inference terms. This list is assembled by the planner.
  bannedInferenceTerms: string[];
  // Which tracked stats are present.
  present: {
    fir: boolean;
    gir: boolean;
    putts: boolean;
    penalties: boolean;
    handicap: boolean;
    sgTotal: boolean;
    sgComponents: boolean;
  };
  // For deterministic fallback.
  fallback: {
    messages: [string, string, string];
  };
};

function computePerformanceBand(totalSG: number | null, thresholds: {
  toughRound: number;
  belowExpectations: number;
  aboveExpectations: number;
  exceptional: number;
}): PerformanceBand {
  if (totalSG == null || !Number.isFinite(totalSG)) return 'unknown';
  if (totalSG <= thresholds.toughRound) return 'tough';
  if (totalSG <= thresholds.belowExpectations) return 'below';
  if (totalSG < thresholds.aboveExpectations) return 'expected';
  if (totalSG < thresholds.exceptional) return 'above';
  return 'great';
}

function splitSentencesSimple(text: string): string[] {
  const t = String(text ?? '').trim();
  if (!t) return [];
  // Split on end punctuation. Keep it intentionally simple; we only need a guardrail.
  const parts = t.split(/(?<=[.!?])\s+/).map((s) => s.trim()).filter(Boolean);
  // If the model omitted punctuation, treat as one sentence.
  return parts.length ? parts : [t];
}

function enforceMaxMessageChars(message: string, maxChars: number): string {
  const msg = String(message ?? '');
  if (!maxChars || msg.length <= maxChars) return msg;

  const prefixMatch = msg.match(/^(âœ…|âš ï¸|â„¹ï¸|ðŸ”¥)\s+/);
  const prefix = prefixMatch?.[0] ?? '';
  const body = msg.slice(prefix.length).trim();

  const sentences = splitSentencesSimple(body);
  if (sentences.length === 0) return msg.slice(0, maxChars);

  const keep: string[] = [];
  for (const s of sentences) {
    if (keep.length === 0) {
      keep.push(s);
      continue;
    }
    const candidate = `${prefix}${keep.join(' ')} ${s}`.trim();
    if (candidate.length <= maxChars) keep.push(s);
    else break;
  }

  let resultBody = keep.join(' ').trim();
  let out = `${prefix}${resultBody}`.trim();

  if (out.length <= maxChars) return out;

  // Last resort: keep a single sentence, trimmed to a word boundary, and end it cleanly.
  const limit = Math.max(0, maxChars - prefix.length);
  let truncated = resultBody.slice(0, limit).trimEnd();
  const lastSpace = truncated.lastIndexOf(' ');
  if (lastSpace > 20) truncated = truncated.slice(0, lastSpace).trimEnd();
  truncated = truncated.replace(/[,:;]+$/g, '').trimEnd();
  if (!/[.!?]$/.test(truncated)) truncated = `${truncated.replace(/[.!?]+$/g, '')}.`;
  return `${prefix}${truncated}`.trim();
}

function extractNumericLiterals(text: string): number[] {
  const matches = String(text ?? '').match(/[-+]?\d+(?:\.\d+)?/g);
  if (!matches) return [];
  const nums: number[] = [];
  for (const m of matches) {
    const n = Number(m);
    if (Number.isFinite(n)) nums.push(n);
  }
  return nums;
}

function sanitizeWhitespace(text: string): string {
  return String(text ?? '').replace(/\s+/g, ' ').trim();
}

const LEADING_INSIGHT_MARKERS_REGEX =
  /^(?:(?:\u2705|\u26A0\uFE0F|\u26A0|\u2139\uFE0F|\u2139|\uD83D\uDD25|âœ…|âš\s*ï¸|âš |â„¹\s*ï¸|â„¹|ðŸ”¥)\s*)+/u;

const BODY_EMOJI_OR_MOJIBAKE_REGEX =
  /(?:\p{Extended_Pictographic}|\uFE0F|\u200D|âœ…|âš\s*ï¸|âš |â„¹\s*ï¸|â„¹|ðŸ”¥|ðŸŽ¯|ðŸ›‘|ï¸|Â)/gu;

function sanitizeInsightBodyText(text: string): string {
  return sanitizeWhitespace(String(text ?? ''))
    .replace(BODY_EMOJI_OR_MOJIBAKE_REGEX, '')
    .replace(/[^\x20-\x7E]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function tryParseJsonObject(raw: string): any | null {
  const trimmed = String(raw ?? '').trim();
  if (!trimmed) return null;

  const candidates: string[] = [trimmed];

  const fenceMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (fenceMatch?.[1]) candidates.push(fenceMatch[1].trim());

  const objMatch = trimmed.match(/\{[\s\S]*\}/);
  if (objMatch?.[0]) candidates.push(objMatch[0].trim());

  for (const c of candidates) {
    try {
      return JSON.parse(c);
    } catch {
      // ignore
    }
  }

  // Small repair: sometimes the model outputs `{"insight1".{...}}`
  const repaired = trimmed
    .replace(/"(\w+)"\s*\.\s*\{/g, '"$1": {')
    .replace(/"(\w+)"\s*=\s*\{/g, '"$1": {');
  try {
    return JSON.parse(repaired);
  } catch {
    return null;
  }
}

function extractMessagesFromLooseText(raw: string): [string, string, string] | null {
  const text = sanitizeWhitespace(String(raw ?? ''));
  if (!text) return null;

  const markerSplit = String(raw ?? '')
    .split(/(?=(?:\u2705|\u26A0\uFE0F|\u26A0|\u2139\uFE0F|\u2139|\uD83D\uDD25|âœ…|âš\s*ï¸|âš |â„¹\s*ï¸|â„¹|ðŸ”¥))/u)
    .map((s) => sanitizeWhitespace(s))
    .filter(Boolean);
  if (markerSplit.length >= 3) {
    const candidate = markerSplit.slice(0, 3) as [string, string, string];
    return candidate;
  }

  const lines = String(raw ?? '')
    .split(/\r?\n+/)
    .map((s) => sanitizeWhitespace(s))
    .filter(Boolean);
  if (lines.length >= 3) {
    return [lines[0], lines[1], lines[2]];
  }

  const sentences = splitSentencesSimple(text);
  if (sentences.length >= 3) {
    const m1 = sentences.slice(0, Math.min(2, sentences.length)).join(' ');
    const m2 = sentences.slice(Math.min(2, sentences.length), Math.min(4, sentences.length)).join(' ');
    const m3 = sentences.slice(Math.min(4, sentences.length)).join(' ') || sentences[sentences.length - 1];
    if (m1 && m2 && m3) return [m1, m2, m3];
  }

  return null;
}

const DRILL_LIBRARY: Record<SGComponentName | 'general', string[]> = {
  off_tee: [
    'Pick a fairway target and hit 10 balls, scoring 1 point for in-play and 2 points for center hits.',
    'Use an alignment stick 10 yards ahead and start 8 of 10 drives on that line.',
    'Alternate driver and 3-wood to the same target line (5 each) to build control.',
    'Hit 6 drives and hold your finish for 3 seconds to reinforce balance.',
    'Practice a 20-yard "virtual fairway" and track how many of 10 drives land in it.',
    'Do a tempo set: 5 drives at 70 percent effort, then 5 at 85 percent, keeping the same start line.',
    'Keep tee height consistent for 6 drives and focus on center-face contact.',
    'Pick a safe-side start line and commit to it for a full bucket on the range.',
    'Use an intermediate target (a leaf or divot) and commit to starting every drive over it.',
    'When trouble is in play, take one more club and aim to the safer side of the fairway.',
  ],
  approach: [
    'Hit 5 shots to 50 yards, 5 to 75, and 5 to 100 to groove partial wedges.',
    'Pick left, middle, and right green sections and hit 3 balls to each.',
    'Practice landing 10 shots in the front third of the green to improve distance control.',
    'Do a distance ladder with one club (e.g., 120, 130, 140) and hit 3 to each target.',
    'Alternate two clubs for the same target to learn real carry distances.',
    'Place a towel 2 inches behind the ball and avoid hitting it to train low point control.',
    'Pick a center-of-green target for every approach, regardless of pin position.',
    'Use a 3-2-1 challenge: 3 shots to a large target, 2 to medium, 1 to small.',
    'Pick one start line and hit 10 shots, scoring how many start on line.',
    'Choose one swing key per approach (tempo or start line) and stick to it for a full bucket.',
  ],
  putting: [
    'Make 10 consecutive putts from 3 feet before leaving the practice green.',
    'Do a 3-6-9 ladder: make 3 in a row from each distance before moving back.',
    'Hit 10 uphill putts and aim to finish 1 foot past the hole.',
    'Hit 10 downhill putts and stop them within 2 feet past the hole.',
    'Lag putt 10 balls from 25 to 40 feet and aim to leave them inside 3 feet.',
    'Do a start-line gate drill with two tees just wider than the ball.',
    'Putt 10 balls focusing only on speed, not the line, to train pace.',
    'Practice a "circle" drill: finish 10 putts inside a 3-foot circle around the hole.',
    'Track your make rate from 4 feet until you make 8 of 10.',
    'Do a one-hand touch drill for 10 putts to improve feel.',
  ],
  penalties: [
    'When in trouble, punch out to the fairway instead of forcing a hero shot.',
    'Pick a miss before every shot and aim away from the biggest hazard.',
    'If water or OB is in play, take one more club and aim to the safer side.',
    'Adopt a layup habit: advance to a comfortable yardage instead of chasing a tight target.',
    'Play a "boring golf" round by aiming at center targets and avoiding risky lines.',
    'Commit to the easiest route back in play when blocked, even if it costs distance.',
    'Use a quick risk check: green light, yellow light, or red light before each shot.',
    'Club down near hazards and accept the middle of the green as the target.',
    'If the risk is high, pick the shot that guarantees a next shot from the fairway.',
    'Practice decision-making by playing two balls on a few holes and choosing the safer line.',
  ],
  short_game: [
    'Drop 5 balls around the green and aim to get 3 up-and-downs.',
    'Place a towel 3 yards onto the green and land 10 chips on it.',
    'Place a tee just ahead of the ball and clip it after impact to train low point control.',
    'Chip from the fringe and aim to finish inside 6 feet for 10 reps.',
    'Simulate missed greens and try to get down in 2 from 10 different lies.',
    'Hit 3 low, 3 medium, and 3 high chips to the same target.',
    'Use one wedge only and play 10 shots with different trajectories.',
    'Hit 10 bump-and-runs with an 8-iron and focus on consistent rollout.',
    'Do 10 pressure up-and-downs and track how many you save.',
    'Hit a pitch ladder: 5 shots to 20 yards, then 25, then 30, focusing on distance control.',
  ],
  general: [
    'Pick center targets and remove the biggest miss from play.',
    'Hold your finish for 2 seconds on every full swing to reinforce balance.',
    'Use one simple pre-shot routine on every shot.',
    'Choose one swing key for the day (tempo or start line) and stick to it.',
    'Commit to conservative targets on the front nine and note how it affects scoring.',
    'Aim at the largest bailout area and commit to that target line.',
    'Pick an intermediate target and start every shot over it for a full bucket.',
    'Score your accuracy over 10 shots to a target and try to beat it next time.',
    'Alternate clubs to the same target to learn your true carry distances.',
    'Practice a safe-side aim habit when the trouble is on one side.',
  ],
};

function hashStringToInt(input: string): number {
  // Simple stable 32-bit hash (djb2 variant).
  let h = 5381;
  const s = String(input ?? '');
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) + h) ^ s.charCodeAt(i);
  }
  return h | 0;
}

function mix32(n: number): number {
  // Thomas Wang integer hash (32-bit).
  let x = n | 0;
  x = (x ^ (x >>> 16)) >>> 0;
  x = Math.imul(x, 0x7feb352d) >>> 0;
  x = (x ^ (x >>> 15)) >>> 0;
  x = Math.imul(x, 0x846ca68b) >>> 0;
  x = (x ^ (x >>> 16)) >>> 0;
  return x >>> 0;
}

function normalizeDrillForMatch(text: string): string {
  return sanitizeWhitespace(String(text ?? '')).toLowerCase().replace(/[.!?]+$/g, '').trim();
}

const ALL_KNOWN_DRILLS: string[] = Array.from(
  new Set(Object.values(DRILL_LIBRARY).flat().map((d) => sanitizeWhitespace(d)))
);

function extractReferencedDrillsFromInsights(insights: any): string[] {
  const messages = Array.isArray(insights?.messages) ? insights.messages : [];
  if (!messages.length) return [];

  const haystack = messages.map((m: any) => normalizeDrillForMatch(String(m ?? ''))).join(' ');
  if (!haystack) return [];

  const hits: string[] = [];
  for (const drill of ALL_KNOWN_DRILLS) {
    const needle = normalizeDrillForMatch(drill);
    if (needle && haystack.includes(needle)) hits.push(drill);
  }
  return hits;
}

function pickDrillAvoidingRecent(
  area: SGComponentName | 'general',
  seed: number,
  recentlyUsed: Set<string>
): string {
  const list = DRILL_LIBRARY[area] ?? DRILL_LIBRARY.general;
  if (!list.length) return '';

  const start = mix32(seed) % list.length;
  for (let offset = 0; offset < list.length; offset++) {
    const candidate = list[(start + offset) % list.length];
    if (!recentlyUsed.has(candidate)) return candidate;
  }
  return list[start];
}

function buildPlannerOutput(args: {
  scoreCompact: string; // e.g. "85 (+13)"
  totalRounds: number | null;
  isScoreOnlyRound: boolean;
  lastRoundComparison: 'better' | 'same' | 'worse' | null;
  avgScore: number | null;
  scoreDiffVsAvg: number | null;
  bestScore: number | null;
  bestDelta: number | null;
  nextTrackStat: 'putts' | 'penalties' | 'GIR' | 'FIR' | null;
  performanceBand: PerformanceBand;
  sgTotalValue: number | null;
  message2ShouldWarn: boolean;
  hasTrackedWeakness: boolean;
  handicapValue: number | null;
  allowSgLanguage: boolean;
  styleVariant: number;
  firHitCount: number | null;
  girHitCount: number | null;
  firPct: number | null;
  girPct: number | null;
  puttsCount: number | null;
  penaltiesCount: number | null;
  sgFocus: null | {
    bestName: SGComponentName;
    bestLabel: string;
    bestValue: number;
    opportunityName: SGComponentName;
    opportunityLabel: string;
    opportunityValue: number;
    shortGameInferred: boolean;
  };
  weaknessThreshold: number;
  drillSuggestion: string | null;
  allowedNumbers: number[];
  hasFir: boolean;
  hasGir: boolean;
  hasPutts: boolean;
  hasPenalties: boolean;
  hasHandicap: boolean;
  hasSgTotal: boolean;
  hasSgComponents: boolean;
}): PlannerOutput {
  const rounds = args.totalRounds;
  const isOnboarding = rounds != null && rounds <= 3;
  const scoreOnly = (() => {
    const m = String(args.scoreCompact ?? '').match(/^\d+/);
    return m?.[0] ?? String(args.scoreCompact ?? '');
  })();
  const styleVariant = Number.isFinite(args.styleVariant)
    ? Math.abs(Math.trunc(args.styleVariant)) % 4
    : 0;
  const roundsRemainingForHandicap =
    rounds != null && rounds < 3 ? Math.max(0, 3 - rounds) : 0;

  const bannedInferenceTerms: string[] = [];
  if (args.isScoreOnlyRound && isOnboarding) {
    bannedInferenceTerms.push(
      'ball striking',
      'course management',
      'game management',
      'strength',
      'weakness',
      'struggled',
      'struggle',
      'performed well',
      // Never acknowledge internal validation mechanics.
      'score string',
      'known score',
      'stated score',
      'confirming',
      'cited result',
      'no additional claims',
      'handicap progression',
      'progression shows',
    );
  }
  if (args.sgFocus && Number.isFinite(args.sgFocus.bestValue) && args.sgFocus.bestValue <= 0) {
    // If the "best" SG component is still negative, avoid calling it a strength/strongest.
    bannedInferenceTerms.push('strongest', 'strength', 'bright spot');
  }
  // If a stat is missing AND we do not have SG components, we forbid attributing performance to that area.
  // If SG is present, it's valid to discuss that area without quoting the missing stat count.
  // We still allow *mentioning the stat name* as a tracking suggestion (e.g., "track putts").
  if (!args.hasSgComponents) {
    if (!args.hasFir) bannedInferenceTerms.push('off the tee', 'driving', 'driver', 'tee shot', 'fairway accuracy');
    if (!args.hasGir) bannedInferenceTerms.push('approach play', 'approach shots', 'iron play', 'ball striking');
    if (!args.hasPutts) bannedInferenceTerms.push('putting', 'three putt', 'pace control', 'green reading');
    if (!args.hasPenalties) bannedInferenceTerms.push('penalty-free', 'hazard', 'out of bounds', 'ob');
  }
  // Always forbid internal key names / weird phrasing.
  bannedInferenceTerms.push('to_par', 'to par', 'par phrase', 'score_display', 'par_phrase');
  // Avoid internal/system narration.
  bannedInferenceTerms.push('round summary', 'score display', 'milestone');
  // Avoid template-y labels.
  bannedInferenceTerms.push('primary opportunity', 'secondary focus');
  if (!args.allowSgLanguage) {
    // Settings may hide strokes gained from the UI. Keep the logic, but avoid SG-specific terminology.
    bannedInferenceTerms.push('strokes gained', 'strokes-gained', 'residual', 'breakdown');
  }

  const present = {
    fir: args.hasFir,
    gir: args.hasGir,
    putts: args.hasPutts,
    penalties: args.hasPenalties,
    handicap: args.hasHandicap,
    sgTotal: args.hasSgTotal,
    sgComponents: args.hasSgComponents,
  };

  const focus: PlannerOutput['focus'] = {
    bestName: args.sgFocus?.bestName ?? null,
    opportunityName: args.sgFocus?.opportunityName ?? null,
    shortGameInferred: Boolean(args.sgFocus?.shortGameInferred),
  };

  // ---- Deterministic templates (fallback) ----

  const inferredTrackedWeakness =
    Boolean(
      args.sgFocus &&
      Number.isFinite(args.sgFocus.opportunityValue) &&
      args.sgFocus.opportunityValue <= args.weaknessThreshold
    );

  const insight2Emoji: InsightEmoji = isOnboarding
    ? EMOJI_SUCCESS
    : (
        args.message2ShouldWarn || inferredTrackedWeakness
          ? EMOJI_WARN
          : EMOJI_SUCCESS
      );
  const insight1Emoji: InsightEmoji =
    !isOnboarding && args.performanceBand === 'great' ? EMOJI_FIRE : EMOJI_SUCCESS;

  const stat = args.nextTrackStat ?? 'putts';
  const statHow =
    stat === 'putts'
      ? 'recording the total number of putts you take for the round'
      : stat === 'penalties'
        ? 'recording the total number of penalties for the round'
        : stat === 'GIR'
          ? 'recording how many greens you hit in regulation'
          : 'recording how many fairways you hit on non-par-3 holes';

  const shouldPenaltyFocus =
    (args.penaltiesCount ?? 0) >= 2 ||
    ((args.penaltiesCount ?? 0) === 1 &&
      args.firPct != null &&
      Number.isFinite(args.firPct) &&
      args.firPct < 50);
  // Round 1 should stay baseline-first. Only elevate penalties when clearly meaningful.
  const shouldPenaltyFocusRound1 = (args.penaltiesCount ?? 0) >= 2;

  let fallback1: string;
  let fallback2: string;
  let fallback3: string;

  if (isOnboarding) {
    // Round 1â€“3 must feel consistent and never read like internal validation.
    // Avoid diagnosing performance; earn that only once expectations exist.
    if (rounds === 2) {
      const cmp = args.lastRoundComparison;
      if (cmp === 'better') {
      fallback1 = `âœ… You improved on your previous round. A score of ${scoreOnly} shows early progress as your baseline forms.`;
    } else if (cmp === 'same') {
      fallback1 = `âœ… You matched your previous score this round. A score of ${scoreOnly} keeps your early baseline stable.`;
    } else if (cmp === 'worse') {
      fallback1 = `âœ… You finished slightly higher than your previous round. A score of ${scoreOnly} is still useful for shaping your baseline.`;
    } else {
        fallback1 = `âœ… A score of ${scoreOnly} adds another useful data point to your early baseline.`;
      }
    } else if (rounds === 3) {
      fallback1 = `âœ… A score of ${scoreOnly} closes out onboarding and gives you a clearer early scoring profile.`;
    } else {
      // Default Round 1 onboarding copy. Keep the language stable; only numbers change.
      fallback1 = `âœ… Nice work logging your first round. A score of ${scoreOnly} sets your first baseline for future comparisons.`;
    }

    const handicapLockedLine =
      roundsRemainingForHandicap === 1
        ? `âœ… You are one round away from unlocking your handicap. After that, your insights can compare rounds against your handicap baseline.`
        : `âœ… You are ${roundsRemainingForHandicap} rounds away from unlocking your handicap. Once unlocked, your insights can compare rounds against your handicap baseline.`;

    const handicapUnlockedLine = `âœ… Your handicap is now unlocked. You can view it anytime on your Dashboard.`;

    fallback2 = roundsRemainingForHandicap > 0 ? handicapLockedLine : handicapUnlockedLine;
    if (args.nextTrackStat) {
      fallback3 = `â„¹ï¸ Next round focus: track ${stat} by ${statHow}. This will make your next insight more specific.`;
    } else if (args.drillSuggestion) {
      const why = (() => {
        if (args.sgFocus) {
          switch (args.sgFocus.opportunityName) {
            case 'putting':
              return 'This targets pace control and makes more second putts routine.';
            case 'approach':
              return 'This sharpens distance control into greens and improves repeatable contact.';
            case 'off_tee':
              return 'This tightens your start line and helps keep more tee shots in play.';
            case 'penalties':
              return 'This reinforces safe targets and lowers big-number risk.';
            case 'short_game':
              return 'This improves touch on chips and pitches and helps convert more saves.';
            default:
              return 'This keeps your focus simple and improves repeatability under pressure.';
          }
        }
        return 'This keeps your focus simple and improves repeatability under pressure.';
      })();
      const drill = String(args.drillSuggestion).trim();
      const drillWithPunct = /[.!?]$/.test(drill) ? drill : `${drill}.`;
      fallback3 = `â„¹ï¸ Next round focus: ${drillWithPunct} ${why}`;
    } else {
      // Round 1: when advanced stats exist, use them to choose the next focus,
      // but do NOT diagnose performance quality without comparisons/expectations.
      if (rounds === 1) {
        if (shouldPenaltyFocusRound1) {
          fallback3 = `â„¹ï¸ Next round focus: choose safer targets off the tee and avoid forced shots to reduce penalty risk. This protects your score without adding swing thoughts.`;
        } else if (
          args.firPct != null &&
          args.girPct != null &&
          Number.isFinite(args.firPct) &&
          Number.isFinite(args.girPct) &&
          args.girPct < args.firPct
        ) {
          fallback3 = `â„¹ï¸ Next round focus: aim for conservative green targets so your approach misses stay manageable. This reduces short-sided misses while your baseline forms.`;
        } else {
          fallback3 = `â„¹ï¸ Next round focus: use one pre-shot routine on every shot to keep your decisions consistent. That helps stabilize early scoring.`;
        }
      } else if (rounds === 2 || rounds === 3) {
        // Round 2â€“3: still no diagnosis, but we can pick a single focus informed by tracked stats.
        if (rounds === 3) {
          // Round 3 is a milestone; keep the focus low-judgment and aligned to the most actionable tracked stat.
          if (args.hasPutts && args.puttsCount != null && Number.isFinite(args.puttsCount) && args.puttsCount >= 36) {
            fallback3 = `â„¹ï¸ Next round focus: use a simple pace routine on the greens (read, one rehearsal, then commit). This should reduce long second putts and three-putt risk.`;
          } else if ((args.penaltiesCount ?? 0) >= 3) {
            fallback3 = `â„¹ï¸ Next round focus: choose safer tee targets and avoid forced shots to reduce penalty risk. This keeps more holes playable and protects your score.`;
          } else if (args.hasGir) {
            fallback3 = `â„¹ï¸ Next round focus: aim for conservative green targets to keep approach outcomes predictable. That should leave you more makeable first putts.`;
          } else {
            fallback3 = `â„¹ï¸ Next round focus: use one pre-shot routine on every shot to keep your decisions consistent. That helps stabilize scoring as expectations begin to form.`;
          }
        } else {
          if (shouldPenaltyFocus) {
            fallback3 = `â„¹ï¸ Next round focus: choose safer targets off the tee and avoid forced shots to reduce penalty risk. This protects your score without overthinking.`;
          } else if (args.hasPutts) {
            fallback3 = `â„¹ï¸ Next round focus: use a simple pace routine on the greens (read, one rehearsal, then commit). This keeps first-putt speed more predictable and second putts shorter.`;
          } else if (args.hasGir) {
            fallback3 = `â„¹ï¸ Next round focus: aim for conservative green targets to keep approach misses manageable. This reduces short-sided misses and improves scoring chances.`;
          } else {
            fallback3 = `â„¹ï¸ Next round focus: use one pre-shot routine on every shot to keep your decisions consistent. A consistent routine helps reduce avoidable mistakes.`;
          }
        }
      } else {
        fallback3 = `â„¹ï¸ Next round focus: pick one simple target for each shot and commit to it. Clear targets reduce indecision and keep misses smaller.`;
      }
    }
  } else if (args.sgFocus && args.hasSgTotal) {
    const bestLabel = sentenceCaseAreaLabel(args.sgFocus.bestLabel);
    const oppLabel = sentenceCaseAreaLabel(args.sgFocus.opportunityLabel);
    const bestIsPositive = Number.isFinite(args.sgFocus.bestValue) && args.sgFocus.bestValue > 0;
    const strengthPhrase = bestIsPositive ? 'was the strongest area' : 'held up best';

    const supportFor = (area: SGComponentName): string | null => {
      switch (area) {
        case 'off_tee':
          return args.firHitCount != null ? `with ${args.firHitCount} fairways hit` : null;
        case 'approach':
          return args.girHitCount != null ? `with ${args.girHitCount} greens in regulation` : null;
        case 'putting':
          return args.puttsCount != null ? `with ${args.puttsCount} putts` : null;
        case 'penalties':
          return args.penaltiesCount != null ? `with ${args.penaltiesCount} penalties` : null;
        default:
          return null;
      }
    };

    const bestSupport = supportFor(args.sgFocus.bestName);
    const oppSupport = supportFor(args.sgFocus.opportunityName);

    const bestClause = `${bestLabel} ${strengthPhrase}${bestSupport ? ` ${bestSupport}` : ''}.`;
    const bestWhy = (() => {
      if (!bestIsPositive) {
        return 'It still lost strokes, but it was the least costly area in this round.';
      }
      switch (args.sgFocus.bestName) {
        case 'off_tee':
          return 'Keeping tee shots in play created simpler scoring chances on approach shots.';
        case 'approach':
          return 'More controlled approach outcomes reduced pressure on short-game saves.';
        case 'putting':
          return 'Better pace and conversion on the greens kept holes from slipping further.';
        case 'penalties':
          return 'Avoiding penalty damage protected the scorecard from high-cost holes.';
        case 'short_game':
          return 'Cleaner recovery shots around the green prevented extra dropped strokes.';
        default:
          return 'That was the clearest area limiting additional score loss in this round.';
      }
    })();
    if (styleVariant === 1) {
      fallback1 =
        args.performanceBand === 'tough'
          ? `âœ… In a tough round at ${args.scoreCompact}, ${bestClause} ${bestWhy}`
          : `âœ… In this round (${args.scoreCompact}), ${bestClause} ${bestWhy}`;
    } else if (styleVariant === 2) {
      fallback1 =
        args.performanceBand === 'tough'
          ? `âœ… ${bestLabel} ${strengthPhrase} in a tough round at ${args.scoreCompact}${bestSupport ? `, ${bestSupport.replace(/^with\\s+/i, '')}` : ''}. ${bestWhy}`
          : `âœ… ${bestLabel} ${strengthPhrase} at ${args.scoreCompact}${bestSupport ? `, ${bestSupport.replace(/^with\\s+/i, '')}` : ''}. ${bestWhy}`;
    } else if (styleVariant === 3) {
      fallback1 =
        args.performanceBand === 'tough'
          ? `âœ… ${args.scoreCompact} came on a difficult day, and ${bestClause} ${bestWhy}`
          : `âœ… At ${args.scoreCompact}, ${bestClause} ${bestWhy}`;
    } else {
      fallback1 =
        args.performanceBand === 'tough'
          ? `âœ… Tough round at ${args.scoreCompact}, but ${bestClause} ${bestWhy}`
          : `âœ… At ${args.scoreCompact}, ${bestClause} ${bestWhy}`;
    }
    const opportunityWhy = (() => {
      switch (args.sgFocus.opportunityName) {
        case 'off_tee':
          return 'Misses from the tee forced recovery shots and reduced realistic birdie looks.';
        case 'approach':
          return 'Approach outcomes left too many difficult up-and-down attempts.';
        case 'putting':
          return 'Too many strokes on the green turned makeable pars into bogey pressure.';
        case 'penalties':
          return 'Penalty mistakes created avoidable high-cost holes and stalled momentum.';
        case 'short_game':
          if (args.girHitCount != null && args.girHitCount <= 6) {
            return `With only ${args.girHitCount} greens hit, recovery execution around the green had a larger effect on scoring.`;
          }
          return 'Around-the-green execution on untracked shots likely decided several holes.';
        default:
          return 'This area had the clearest leverage for lowering score next round.';
      }
    })();
    const opportunityDirection = (() => {
      switch (args.sgFocus.opportunityName) {
        case 'off_tee':
          return 'Prioritize a safer tee target line to keep more holes playable.';
        case 'approach':
          return 'Prioritize center-green targets before attacking pin locations.';
        case 'putting':
          return 'Prioritize pace control to shrink second-putt distance.';
        case 'penalties':
          return 'Prioritize conservative decisions whenever trouble is in play.';
        case 'short_game':
          return 'Prioritize contact and landing spot control around the green.';
        default:
          return 'Prioritize one simple decision-making rule and commit to it.';
      }
    })();
    fallback2 =
      insight2Emoji === EMOJI_WARN
        ? (() => {
            const isPenalties = oppLabel === 'Penalties';
            const isShortGameInferred = args.sgFocus?.shortGameInferred && args.sgFocus.opportunityName === 'short_game';
            const verb = isPenalties ? 'were' : 'was';

            if (isShortGameInferred) {
              const s1 = args.allowSgLanguage
                ? `âš ï¸ ${oppLabel} ${verb} the most likely source of lost strokes in this round, inferred from the residual gap versus tracked components.`
                : `âš ï¸ ${oppLabel} ${verb} the most likely source of lost strokes in this round, inferred from the untracked portion.`;
              const s2 = `${opportunityWhy} ${opportunityDirection}`;
              return `${s1} ${s2}`;
            }

            const s1 = `âš ï¸ ${oppLabel} ${verb} the largest source of scoring drag and the clearest place to gain strokes next round${oppSupport ? `, ${oppSupport}` : ''}.`;
            const s2 = `${opportunityWhy} ${opportunityDirection}`;
            return `${s1} ${s2}`;
          })()
        : `âœ… ${oppLabel} was another area to build on. A small step here can help keep scoring more predictable.`;
    if (args.nextTrackStat) {
      fallback3 = `â„¹ï¸ Next round focus: track ${stat} by ${statHow}. This single input meaningfully improves insight accuracy.`;
    } else if (args.drillSuggestion) {
      const why = (() => {
        switch (args.sgFocus.opportunityName) {
          case 'putting':
            return 'This targets pace control and makes more second putts routine.';
          case 'approach':
            return 'This sharpens distance control into greens and improves repeatable contact.';
          case 'off_tee':
            return 'This tightens your start line and helps keep more tee shots in play.';
          case 'penalties':
            return 'This reinforces safe targets and lowers big-number risk.';
          case 'short_game':
            return 'This improves touch on chips and pitches and helps convert more saves.';
          default:
            return 'This keeps your focus simple and improves repeatability under pressure.';
        }
      })();
      const drill = String(args.drillSuggestion).trim();
      const drillWithPunct = /[.!?]$/.test(drill) ? drill : `${drill}.`;
      const drillLead =
        styleVariant === 1
          ? 'â„¹ï¸ Next round priority:'
          : styleVariant === 2
            ? 'â„¹ï¸ Practice focus for next round:'
            : styleVariant === 3
              ? 'â„¹ï¸ Next session focus:'
              : 'â„¹ï¸ Next round focus:';
      fallback3 = `${drillLead} ${drillWithPunct} ${why}`;
    } else {
      fallback3 = `â„¹ï¸ Next round focus: pick one simple target for each shot and commit to it. Clear targets reduce indecision and keep misses smaller.`;
    }
  } else {
    // Minimal signal (score-only): use score context, SG band, and history context without over-attribution.
    const avgScoreRounded = args.avgScore != null && Number.isFinite(args.avgScore)
      ? Math.round(args.avgScore)
      : null;
    const diffVsAvgRounded = args.scoreDiffVsAvg != null && Number.isFinite(args.scoreDiffVsAvg)
      ? Math.round(args.scoreDiffVsAvg)
      : null;
    const absDiffVsAvg = diffVsAvgRounded != null ? Math.abs(diffVsAvgRounded) : null;

    if (args.bestDelta != null && Number.isFinite(args.bestDelta) && args.bestDelta <= 0) {
      fallback1 = args.bestScore != null
        ? `âœ… ${args.scoreCompact} matched or improved your best recorded score of ${Math.round(args.bestScore)}. That confirms this scoring level is reachable in your current form.`
        : `âœ… ${args.scoreCompact} matched or improved your best recorded score. That confirms this scoring level is reachable in your current form.`;
    } else if (args.bestDelta != null && Number.isFinite(args.bestDelta) && args.bestDelta <= 2) {
      fallback1 = args.bestScore != null
        ? `âœ… ${args.scoreCompact} finished within ${Math.round(args.bestDelta)} of your best recorded score of ${Math.round(args.bestScore)}. That keeps your scoring ceiling in immediate range.`
        : `âœ… ${args.scoreCompact} finished within ${Math.round(args.bestDelta)} of your best recorded score. That keeps your scoring ceiling in immediate range.`;
    } else if (avgScoreRounded != null && absDiffVsAvg != null && absDiffVsAvg >= 2) {
      if (diffVsAvgRounded! < 0) {
        fallback1 = `âœ… ${args.scoreCompact} came in about ${absDiffVsAvg} strokes better than your recent average of ${avgScoreRounded}. That is a meaningful step ahead of your current scoring pattern.`;
      } else {
        fallback1 = `âœ… ${args.scoreCompact} was about ${absDiffVsAvg} strokes above your recent average of ${avgScoreRounded}. That helps isolate where the round drifted from your normal scoring level.`;
      }
    } else {
      fallback1 = `âœ… ${args.scoreCompact} adds another data point to stabilize your scoring profile as your sample grows.`;
    }

    if (insight2Emoji === EMOJI_WARN) {
      fallback2 = `âš ï¸ This round finished below expectation for your current handicap context. Tracking a few core stats next round will show where the extra strokes came from.`;
    } else if (args.performanceBand === 'great' || args.performanceBand === 'above') {
      fallback2 = `âœ… This round finished above expectation for your current handicap context. Tracking core stats next round will show which parts of play drove that result.`;
    } else {
      fallback2 = `âœ… This round landed close to expectation for your current handicap context. More tracked stats will separate stable scoring from round-to-round variance.`;
    }

    const statWhy =
      stat === 'putts'
        ? 'Putting totals are usually the fastest way to explain score swings in score-only rounds.'
        : stat === 'penalties'
          ? 'Penalty count quickly identifies avoidable score leakage.'
          : stat === 'GIR'
            ? 'GIR helps separate approach quality from short-game pressure.'
            : 'FIR helps explain tee-shot pressure across the round.';
    if (args.nextTrackStat) {
      fallback3 = `â„¹ï¸ Next round focus: track ${stat} by ${statHow}. ${statWhy}`;
    } else if (args.drillSuggestion) {
      const drill = String(args.drillSuggestion).trim();
      const drillWithPunct = /[.!?]$/.test(drill) ? drill : `${drill}.`;
      fallback3 = `â„¹ï¸ Next round focus: ${drillWithPunct} This is a simple way to make the next round's feedback more specific.`;
    } else {
      fallback3 = `â„¹ï¸ Next round focus: pick center targets and remove the biggest miss from play. Clear targets reduce indecision and keep misses smaller.`;
    }
  }

  // Round 4+ fallback is emergency-only. Keep it short, neutral, and unscripted.
  if (!isOnboarding) {
    fallback1 = `${EMOJI_SUCCESS} ${args.scoreCompact} is now in your round history and contributes to your performance baseline.`;
    fallback2 =
      insight2Emoji === EMOJI_WARN
        ? `${EMOJI_WARN} The scoring result came in below expectation for your current handicap context. One more fully tracked round will tighten attribution.`
        : `${EMOJI_SUCCESS} The scoring result is within or above expectation for your current handicap context. One more fully tracked round will sharpen attribution.`;
    if (args.nextTrackStat) {
      fallback3 = `${EMOJI_INFO} Next round focus: track ${stat} by ${statHow}. This is the fastest way to improve the precision of your next insight.`;
    } else if (args.drillSuggestion) {
      const drill = String(args.drillSuggestion).trim();
      const drillWithPunct = /[.!?]$/.test(drill) ? drill : `${drill}.`;
      fallback3 = `${EMOJI_INFO} Next round focus: ${drillWithPunct} Keep this as the single priority for the next session.`;
    } else {
      fallback3 = `${EMOJI_INFO} Next round focus: choose one repeatable decision rule and commit to it on every hole.`;
    }
  }

  const insights: PlannerOutput['insights'] = {
    insight1: {
      key: 'insight1',
      emoji: insight1Emoji,
      topic: (isOnboarding || !args.sgFocus) ? 'score context' : `strength: ${args.sgFocus.bestLabel}`,
      templateHint: args.sgFocus
        ? `Write 1â€“2 sentences anchored to "${args.scoreCompact}" and the planned strength area "${args.sgFocus.bestLabel}". Include why it mattered using only provided facts.`
        : (rounds === 2 && args.isScoreOnlyRound
            ? `Write 1â€“2 sentences that compare this round to the previous score. Anchor to "${args.scoreCompact}" and do not diagnose why the score changed.`
            : `Write 1â€“2 sentences anchored to "${args.scoreCompact}". Explain why it matters, and do not claim strengths or weaknesses without supporting stats.`),
      maxSentences: 2,
    },
    insight2: {
      key: 'insight2',
      emoji: insight2Emoji,
      topic: isOnboarding ? 'handicap milestone' : (insight2Emoji === EMOJI_WARN ? 'main opportunity' : 'secondary takeaway'),
      templateHint:
        isOnboarding
          ? `Write 1 sentence about the handicap milestone. If the user has fewer than 3 rounds, mention the exact remaining round count (${roundsRemainingForHandicap}). Avoid system narration.`
          : (args.sgFocus
              ? `Write 1â€“2 sentences focused on "${args.sgFocus.opportunityLabel}". Include why it mattered, and use uncertainty language if the planner marks it as inferred.`
              : `Write 1â€“2 sentences. If using a weakness framing, include why it mattered and only reference stats that are present.`),
      maxSentences: 2,
    },
    insight3: {
      key: 'insight3',
      emoji: EMOJI_INFO,
      topic: 'next round focus',
      templateHint: args.nextTrackStat
        ? `Write 1â€“2 sentences recommending tracking "${stat}" by ${statHow}. If you add a second sentence, explain why it improves feedback.`
        : (args.drillSuggestion
            ? `Write 1â€“2 sentences. Sentence 1 must recommend this drill exactly: "${args.drillSuggestion}". If you add a second sentence, explain why it helps.`
            : `Write 1â€“2 sentences recommending one concrete next-round focus. If you add a second sentence, explain why it helps.`),
      maxSentences: 2,
    },
  };

  return {
    insights,
    onboardingMode: isOnboarding,
    styleVariant,
    allowSgLanguage: args.allowSgLanguage,
    focus,
    action: {
      type: args.nextTrackStat ? 'track' : (args.drillSuggestion ? 'drill' : 'general'),
      stat: args.nextTrackStat,
      drill: args.drillSuggestion,
    },
    allowedNumbers: Array.from(new Set([
      ...args.allowedNumbers,
      roundsRemainingForHandicap,
      args.handicapValue ?? NaN,
      ...(args.drillSuggestion ? extractNumericLiterals(args.drillSuggestion) : []),
    ]))
      .filter((n) => Number.isFinite(n)),
    bannedInferenceTerms: Array.from(new Set(bannedInferenceTerms.map((s) => s.toLowerCase()))),
    present,
    fallback: { messages: [fallback1, fallback2, fallback3] },
  };
}

function isServerLevelOutageError(message: string): boolean {
  const m = String(message ?? '').toLowerCase();
  return (
    m.includes('timed out') ||
    m.includes('abort') ||
    m.includes('fetch failed') ||
    m.includes('network') ||
    m.includes('status 429') ||
    m.includes('status 500') ||
    m.includes('status 502') ||
    m.includes('status 503') ||
    m.includes('status 504')
  );
}

function buildRound4EmergencyFallback(nextTrackStat: 'putts' | 'penalties' | 'GIR' | 'FIR' | null): [string, string, string] {
  const trackLine =
    nextTrackStat === 'putts'
      ? 'track putts by recording the total number of putts you take for the round'
      : nextTrackStat === 'penalties'
        ? 'track penalties by recording the total number of penalties for the round'
        : nextTrackStat === 'GIR'
          ? 'track GIR by recording how many greens you hit in regulation'
          : nextTrackStat === 'FIR'
            ? 'track FIR by recording how many fairways you hit on non-par-3 holes'
            : 'choose one repeatable decision rule and apply it on every full swing';

  return [
    '\u2705 Your round is saved, but insight generation is temporarily unavailable.',
    '\u26A0\uFE0F We could not produce full attribution due to a temporary service issue. Retry once in a moment.',
    `\u2139\uFE0F Next round focus: ${trackLine}.`,
  ];
}

type PresentStatsForV3 = {
  fir: boolean;
  gir: boolean;
  putts: boolean;
  penalties: boolean;
};

function repairV3MessagesForMissingStats(
  messages: [string, string, string],
  present: PresentStatsForV3,
  action: { type: 'track' | 'drill' | 'general'; stat: 'putts' | 'penalties' | 'GIR' | 'FIR' | null }
): [string, string, string] {
  const puttRe = /\b(putt|putts|putting|on the green|on the greens)\b/i;
  const firRe = /\b(off the tee|off-the-tee|tee shot|driver|driving|fairway|fairways|fir)\b/i;
  const girRe = /\b(approach|approach play|approach shots|iron play|green(s)? in regulation|gir)\b/i;
  const penRe = /\b(penalt(y|ies)|penalty|hazard|ob|out of bounds)\b/i;

  const replaceKeepingEmoji = (msg: string, body: string): string => {
    const m = sanitizeWhitespace(msg);
    const match = m.match(/^(\u2705|\u26A0\uFE0F|\u2139\uFE0F|\uD83D\uDD25)\s+/u);
    const emoji = match?.[1] ?? '\u2705';
    return `${emoji} ${body}`;
  };

  let m1 = messages[0];
  let m2 = messages[1];
  let m3 = messages[2];

  const hasMissingRef = (text: string): boolean =>
    (!present.putts && puttRe.test(text)) ||
    (!present.fir && firRe.test(text)) ||
    (!present.gir && girRe.test(text)) ||
    (!present.penalties && penRe.test(text));

  const stripMissingStatSentences = (msg: string): string => {
    const body = sanitizeWhitespace(String(msg ?? '')).replace(/^(?:✅|⚠️|ℹ️|🔥)\s+/u, '');
    const sentences = splitSentencesSimple(body);
    const kept = sentences.filter((s) => !hasMissingRef(s));
    if (kept.length) return sanitizeWhitespace(kept.join(' '));

    // Last resort: redact missing-area terms in-place without replacing with a canned template.
    let redacted = body;
    if (!present.putts) redacted = redacted.replace(puttRe, 'round context');
    if (!present.fir) redacted = redacted.replace(firRe, 'round context');
    if (!present.gir) redacted = redacted.replace(girRe, 'round context');
    if (!present.penalties) redacted = redacted.replace(penRe, 'round context');
    redacted = sanitizeWhitespace(redacted)
      .replace(/\b(your|this|that)\s+round context\s+stats?\b/gi, 'one key stat')
      .replace(/\bround context\s+stats?\b/gi, 'round context')
      .replace(/\bthat area\b/gi, 'round context')
      .replace(/\barea area\b/gi, 'area')
      .replace(/\bmore stable area area\b/gi, 'more stable area');
    return redacted || body;
  };

  if (hasMissingRef(m1)) m1 = replaceKeepingEmoji(m1, stripMissingStatSentences(m1));
  if (hasMissingRef(m2)) m2 = replaceKeepingEmoji(m2, stripMissingStatSentences(m2));

  if (action.type === 'track') {
    const trackingVerbRe = /\b(track|record|log|capture|count|enter|note)\b/i;
    const mentionsStat = (() => {
      if (action.stat === 'putts') return /\b(putt|putts|putting)\b/i;
      if (action.stat === 'penalties') return /\b(penalt(y|ies)|penalty)\b/i;
      if (action.stat === 'GIR') return /\b(gir|green(s)? in regulation)\b/i;
      if (action.stat === 'FIR') return /\b(fir|fairway|fairways)\b/i;
      return /\b\B\b/;
    })();

    const bodyOk = trackingVerbRe.test(m3) && mentionsStat.test(m3);
    if (!bodyOk) {
      const statText =
        action.stat === 'putts'
          ? 'track your total putts'
          : action.stat === 'penalties'
            ? 'track your total penalties'
            : action.stat === 'GIR'
              ? 'track your greens in regulation'
              : action.stat === 'FIR'
                ? 'track your fairways hit'
                : 'track one key stat';
      m3 = replaceKeepingEmoji(
        m3,
        `Next round focus: ${statText}. This improves next-round insight precision.`
      );
    }
  }

  return [m1, m2, m3];
}

function forcePlannedEmojis(
  messages: [string, string, string],
  insights: Record<'insight1' | 'insight2' | 'insight3', { emoji: string }>
): [string, string, string] {
  const stripLeadingInsightEmoji = (msg: string): string =>
    sanitizeWhitespace(String(msg ?? '')).replace(LEADING_INSIGHT_MARKERS_REGEX, '').trim();

  const b1 = sanitizeInsightBodyText(stripLeadingInsightEmoji(messages[0]));
  const b2 = sanitizeInsightBodyText(stripLeadingInsightEmoji(messages[1]));
  const b3 = sanitizeInsightBodyText(stripLeadingInsightEmoji(messages[2]));

  return [
    `${insights.insight1.emoji} ${b1}`.trim(),
    `${insights.insight2.emoji} ${b2}`.trim(),
    `${insights.insight3.emoji} ${b3}`.trim(),
  ];
}

function applyV3LanguagePolicy(
  messages: [string, string, string],
  opts: {
    measuredOpportunity: boolean;
    opportunityIsWeak: boolean;
    opportunityValue: number | null;
    bestName: SGComponentName | null;
    opportunityName: SGComponentName | null;
    opportunitySupportPhrase?: string | null;
    allowCourseDifficultyLanguage: boolean;
    nearNeutralRound: boolean;
    scoreOnlyMode: boolean;
  }
): [string, string, string] {
  const replaceBodyKeepingEmoji = (msg: string, body: string): string => {
    const m = sanitizeWhitespace(msg);
    const match = m.match(/^(\u2705|\u26A0\uFE0F|\u2139\uFE0F|\uD83D\uDD25)\s+/u);
    const emoji = match?.[1] ?? '\u2705';
    return `${emoji} ${sanitizeWhitespace(body)}`;
  };
  const getBody = (msg: string): string =>
    sanitizeWhitespace(String(msg ?? '')).replace(/^(?:\u2705|\u26A0\uFE0F|\u2139\uFE0F|\uD83D\uDD25)\s+/u, '');
  const areaMentionRegex = (area: SGComponentName): RegExp => {
    if (area === 'off_tee') return /\b(off the tee|off-the-tee|tee shot|driver|driving|fairway|fairways|fir)\b/i;
    if (area === 'approach') return /\b(approach|approach play|approach shots|iron play|greens?\s+in\s+regulation|gir)\b/i;
    if (area === 'putting') return /\b(putt|putts|putting|on the green|on the greens)\b/i;
    if (area === 'penalties') return /\b(penalt(y|ies)|penalty|hazard|ob|out of bounds)\b/i;
    return /\b(short game|around the green|chip|chips|chipping|pitch|pitches|pitching|up-and-down)\b/i;
  };
  const areaLabel = (area: SGComponentName): string => sentenceCaseAreaLabel(SG_LABELS[area]);
  const AREA_NAMES: SGComponentName[] = ['off_tee', 'approach', 'putting', 'penalties', 'short_game'];

  const normalizeCommon = (text: string): string =>
    sanitizeWhitespace(String(text ?? ''))
      // GIR can imply opportunities, but "birdie opportunities" is an over-claim.
      .replace(/\bbirdie opportunities\b/gi, 'scoring opportunities')
      // Fix common run-on phrasing from the model.
      .replace(/,\s*hitting\s+(\d+\s+greens?\s+in\s+regulation)\s+helped\b/gi, '. Hitting $1 helped')
      .replace(/\bmore stable area feature\b/gi, 'more stable area')
      // Avoid vague golf jargon that adds no actionable signal.
      .replace(/\bball[- ]striking\b/gi, 'shot execution')
      // Avoid competitive framing language for post-round feedback tone.
      .replace(/\bcompetitive total\b/gi, 'round score')
      .replace(/\bcompetitive score\b/gi, 'round score')
      .replace(/\bcompetitive edge\b/gi, 'scoring stability')
      // Keep phrasing concrete instead of generic.
      .replace(/\boverall performance\b/gi, 'your score')
      .replace(/\bscoring potential\b/gi, 'scoring outcomes')
      .replace(/\b(\d+)\s+putts?\s+made\b/gi, '$1 putts')
      .replace(/\bmore stable area area\b/gi, 'more stable area')
      .replace(/\btracked data\b/gi, 'round context')
      .replace(/\btracked stats\b/gi, 'round context')
      .replace(/\byour your\b/gi, 'your');

  const normalizeMeasuredOpportunity = (text: string): string =>
    text
      // For measured opportunity areas (not inferred short game), keep wording definitive.
      .replace(/\bcan have cost(?:ing)?\b/gi, 'cost')
      .replace(/\bmost likely\b/gi, 'clearly')
      .replace(/\blikely\b/gi, 'clearly')
      .replace(/\bsuggests\b/gi, 'shows')
      .replace(/\bmay\b/gi, 'can');

  let out: [string, string, string] = [
    normalizeCommon(messages[0]),
    normalizeCommon(messages[1]),
    normalizeCommon(messages[2]),
  ];

  if (!opts.allowCourseDifficultyLanguage) {
    out = [
      out[0].replace(/\bthroughout a challenging course\b/gi, 'throughout the round')
        .replace(/\bon a challenging course\b/gi, 'in this round')
        .replace(/\bchallenging course\b/gi, 'course setup'),
      out[1].replace(/\bthroughout a challenging course\b/gi, 'throughout the round')
        .replace(/\bon a challenging course\b/gi, 'in this round')
        .replace(/\bchallenging course\b/gi, 'course setup'),
      out[2].replace(/\bthroughout a challenging course\b/gi, 'throughout the round')
        .replace(/\bon a challenging course\b/gi, 'in this round')
        .replace(/\bchallenging course\b/gi, 'course setup'),
    ];
  }

  if (opts.nearNeutralRound) {
    out = [
      out[0]
        .replace(/\bstandout(?: aspect| part)?\b/gi, 'more stable area')
        .replace(/\bshowcasing your strong ability\b/gi, 'showing steadier execution')
        .replace(/\bstrong ability\b/gi, 'steady execution')
        .replace(/\bstrong performance\b/gi, 'solid execution')
        .replace(/\bdefined your round\b/gi, 'was a helpful part of your round'),
      out[1]
        .replace(/\bsignificant issue with penalties\b/gi, 'clear penalty opportunity')
        .replace(/\bgreatly improve your overall score\b/gi, 'improve your score')
        .replace(/\bsignificantly impacted\b/gi, 'raised')
        .replace(/\bmaterially raised\b/gi, 'raised')
        .replace(/\bseverely\b/gi, '')
        .replace(/\s{2,}/g, ' ')
        .trim(),
      out[2],
    ];
  }

  if (opts.measuredOpportunity) {
    out[1] = normalizeMeasuredOpportunity(out[1]);
  }

  // Low-impact measured negatives (e.g., around -0.5 to -1.4) should still read as actionable,
  // but avoid severe framing language that overstates the impact.
  if (
    opts.opportunityIsWeak &&
    opts.opportunityValue != null &&
    Number.isFinite(opts.opportunityValue) &&
    Math.abs(opts.opportunityValue) < 1.5
  ) {
    out[1] = out[1]
      .replace(/\bmajor issue\b/gi, 'clear opportunity area')
      .replace(/\bsignificant (?:issue|weakness|opportunity)\b/gi, 'clear opportunity')
      .replace(/\bsevere(?:ly)?\b/gi, '')
      .replace(/\s{2,}/g, ' ')
      .trim();
  }

  // Message 1 should stay scoped to the planned strength area when provided.
  if (opts.bestName) {
    const body = getBody(out[0]);
    const sentences = splitSentencesSimple(body);
    const kept = sentences.filter((s) => {
      const mentionsAnyArea = AREA_NAMES.some((a) => areaMentionRegex(a).test(s));
      if (!mentionsAnyArea) return true;
      return areaMentionRegex(opts.bestName!).test(s);
    }).map((s) => {
      // Avoid mixed-area sentences such as "Approach was strong ... even though you had 35 putts."
      // Message 1 should stay scoped to the planned best area.
      const mentionsOtherArea = AREA_NAMES
        .filter((a) => a !== opts.bestName)
        .some((a) => areaMentionRegex(a).test(s));
      if (!mentionsOtherArea) return s;

      const trimmed = s
        .replace(/\b(?:even though|although|though|despite|while|but)\b[\s\S]*$/i, '')
        // Remove common cross-area fragments that slip into a strength sentence.
        .replace(/\bfrom the fairway\b/gi, '')
        .replace(/\bfrom fairway lies\b/gi, '')
        .replace(/\bwith\s+\d+\s+putts?\b/gi, '')
        .replace(/\bwith\s+\d+\s+penalt(?:y|ies)\b/gi, '')
        .replace(/\s+,/g, ',')
        .trim();
      return trimmed;
    }).filter(Boolean);
    if (kept.length > 0) {
      out[0] = replaceBodyKeepingEmoji(out[0], kept.join(' '));
    }
  }

  // Non-weak opportunity should read as a second positive takeaway, not hidden weakness math.
  if (!opts.opportunityIsWeak && !opts.scoreOnlyMode) {
    let body2 = getBody(out[1]);
    body2 = body2
      .replace(/\b(?:save|saved|saving|gain|gained|gaining|recover|recovered|recovering)\b[^.]*\bstrokes?\b/gi, 'support lower scores')
      .replace(/\b(?:around|about|roughly|nearly|approximately|approx\.?)\s*\d+\s*strokes?\b/gi, '')
      .replace(/~\s*\d+\s*strokes?\b/gi, '')
      .replace(/\bcan help shave off(?:\s+\w+){0,4}\b/gi, 'can help support lower scores next round')
      .replace(/\bhelp shave off(?:\s+\w+){0,4}\b/gi, 'help support lower scores next round')
      .replace(/\bshave off(?:\s+\w+){0,4}\b/gi, 'support lower scores next round')
      .replace(/\bopportunity area\b/gi, 'secondary area')
      .replace(/\b(?:significant|clear|major)\s+opportunity\b/gi, 'secondary area')
      .replace(/\b(?:weak|weaker|weakest)\b/gi, 'secondary')
      .replace(/\broom for improvement\b/gi, 'another area to build on')
      .replace(/\bpotential for (?:even )?better performance\b/gi, 'another area to build on')
      .replace(/\bshowed potential for growth\b/gi, 'was another area you can build on')
      .replace(/\bpotential for growth\b/gi, 'another area to build on')
      .replace(/\bneeds improvement\b/gi, 'can keep building')
      .replace(/\bneeds work\b/gi, 'can keep building')
      .replace(/\b(?:struggle|struggled|struggling)\b/gi, 'can keep improving')
      .replace(/\bimproving this area by can\b/gi, 'improving this area can')
      .replace(/\bpotentially support\b/gi, 'support')
      .replace(/\b(?:cost|costing|lost|loss|leak|drag|hurt)\b[^.]*\./gi, 'Building on this area can support more consistent scoring next round.')
      .replace(/\b(?:focusing|working)\s+on\s+(?:improving|this area)\b[^.]*\./gi, 'Building on this area can support more consistent scoring next round.')
      .replace(/\bwhile\b[^.]*\bsolid\b[^.]*\./gi, 'This was another area you can build on.')
      // Remove dangling approximation fragments left after stroke phrase cleanup.
      .replace(/\bwith\s+(?:about|around|roughly|nearly|approximately|approx\.?)\b\s*(?=[.!,]|$)/gi, '')
      .replace(/\bwith\s+(?:about|around|roughly|nearly|approximately|approx\.?)\s+Building on this area\b/gi, 'Building on this area')
      .replace(/\b(?:about|around|roughly|nearly|approximately|approx\.?)\s+Building on this area\b/gi, 'Building on this area')
      .replace(/\bcan still be a second area to build on\b/gi, 'was another area you can build on')
      .replace(/\bfocus on improving your next round\b/gi, 'keep building this area next round')
      .replace(/\byou can support lower scores(?:\s+in this area)?\b/gi, 'this can support lower scores')
      .replace(/\bwith just to gain in this area\b/gi, 'with room to build in this area')
      .replace(/\bwith just impact from this,?\s*focusing on this will further lower your score next round\.?/gi, 'A small step here can support more consistent scoring next round.')
      .replace(/\bfocusing on this will further lower your score next round\b/gi, 'A small step here can support more consistent scoring next round')
      .replace(/;/g, '.')
      .replace(/,\s*Building on this area/gi, '. Building on this area')
      .replace(/\s+/g, ' ')
      .replace(/\s+([,.;!?])/g, '$1')
      .replace(/\.\s*This was another area you can build on\./gi, '.')
      .replace(/\bThis was another area you can build on\.\s*This was another area you can build on\./gi, 'This was another area you can build on.')
      .replace(/,\s*support lower scores(?:\s+next round)?/gi, ', and this can support lower scores next round')
      .replace(/^\s*support lower scores(?:\s+next round)?/i, 'Building this area can support lower scores next round')
      .replace(/\bsupport lower scores compared to your recent play\b/gi, 'support steadier scoring versus your recent rounds')
      .trim();

    // Remove duplicate/near-duplicate sentences caused by aggressive phrase repairs.
    const dedupeSentences = (text: string): string => {
      const seen = new Set<string>();
      const unique: string[] = [];
      for (const s of splitSentencesSimple(text)) {
        const key = s.toLowerCase().replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, ' ').trim();
        if (!key) continue;
        if (seen.has(key)) continue;
        seen.add(key);
        unique.push(s);
      }
      return unique.join(' ').trim();
    };
    body2 = dedupeSentences(body2);

    if (opts.opportunityName) {
      const mentionsOpportunity = areaMentionRegex(opts.opportunityName).test(body2);
      if (!mentionsOpportunity) {
        body2 = `${areaLabel(opts.opportunityName)} was another area you can build on. ${body2}`.trim();
      }

      const hasOtherAreaMention = AREA_NAMES
        .filter((a) => a !== opts.opportunityName)
        .some((a) => areaMentionRegex(a).test(body2));

      if (hasOtherAreaMention) {
        body2 = body2
          .replace(/\b(?:even though|although|though|despite|while|but)\b[\s\S]*$/i, '')
          .replace(/\s+/g, ' ')
          .trim();
      }
    }

    if (!/[.!?]$/.test(body2)) body2 = `${body2}.`;

    const supportPhrase = sanitizeWhitespace(opts.opportunitySupportPhrase ?? '');
    const areaText = opts.opportunityName ? areaLabel(opts.opportunityName) : 'This area';
    const supportText = supportPhrase ? `, ${supportPhrase}` : '';
    const stripEndPunct = (s: string): string => s.replace(/[.!?]+$/g, '').trim();
    const pick = <T,>(items: T[]): T => items[Math.floor(Math.random() * items.length)];
    const closers = [
      'A small step here can support more consistent scoring next round.',
      'A bit of progress here can help keep your scoring more repeatable next round.',
      'Building this area can help stabilize scoring in your next round.',
      'Steady gains here can make your scoring pattern more repeatable next round.',
      'Progress in this area can help your next-round scoring hold up under pressure.',
    ];
    const fullRewriteVariants = [
      `${areaText} was a second strength you can build from${supportText}. ${pick(closers)}`,
      `${areaText} gave you another positive signal${supportText}. ${pick(closers)}`,
      `${areaText} held up as a secondary strength${supportText}. ${pick(closers)}`,
      `${areaText} was another area that supported your scoring${supportText}. ${pick(closers)}`,
    ];
    const nonWeakQualityIssue =
      /\b(represented a secondary area|potential for (?:even )?better performance|showed potential for growth|overall performed well|strong but|there'?s an opportunity|can keep improving)\b/i.test(body2) ||
      /\bthere'?s (?:a|an)\s+\w+\s+opportunity\b/i.test(body2) ||
      /\bsecondary area to build upon,\s*as\b/i.test(body2) ||
      /\b(?:weak|weaker|room for improvement|needs improvement|needs work)\b/i.test(body2) ||
      /\bbuild upon\b/i.test(body2) ||
      /\bfocus on improving your next round\b/i.test(body2) ||
      /\bwith solid putting performance,\s*there'?s potential to build on that\b/i.test(body2) ||
      /\bwith just to gain in this area\b/i.test(body2) ||
      /\bwith just impact from this\b/i.test(body2) ||
      /\.\s*with\b/i.test(body2) ||
      /\bfocusing on this will further lower your score next round\b/i.test(body2) ||
      /\bby can\b/i.test(body2) ||
      /\b(?:another area you can build on\.)\s*(?:this was another area you can build on\.)/i.test(body2) ||
      /\b,\s*and this can support lower scores next round,\s*and this can support lower scores next round\b/i.test(body2);
    const hasBuildForwardPhrase = /\b(another area you can build on|secondary area|build on|keep building|support more consistent scoring|support steadier scoring|support lower scores|stabilize scoring|repeatable)\b/i.test(body2);

    // Keep valid LLM phrasing when possible; only rewrite bad non-weak messages.
    if (nonWeakQualityIssue || body2.length < 35) {
      body2 = pick(fullRewriteVariants);
    } else if (!hasBuildForwardPhrase) {
      const sentences = splitSentencesSimple(body2);
      if (sentences.length >= 2) {
        sentences[sentences.length - 1] = pick(closers);
        body2 = sentences.slice(0, 2).join(' ');
      } else {
        body2 = `${stripEndPunct(body2)}. ${pick(closers)}`;
      }
    }
    out[1] = replaceBodyKeepingEmoji(out[1], body2);
  }

  if (opts.scoreOnlyMode) {
    const skillAreaRe = /\b(off the tee|off-the-tee|tee shot|driver|driving|fairway|fairways|fir|approach|approach play|approach shots|iron play|greens?\s+in\s+regulation|gir|putt|putts|putting|penalt(y|ies)|penalty|hazard|ob|out of bounds|short game|around the green|chip|chips|chipping|pitch|pitches|pitching|up-and-down)\b/i;
    const badScoreOnlyPhraseRe = /\b(this area|that area|tracked data|tracked stats|specific strength area|build(?:ing)? this area|support steadier scoring|support more consistent scoring)\b/i;

    const scrubScoreOnly = (text: string): string =>
      sanitizeWhitespace(String(text ?? ''))
        .replace(/\b(this|that)\s+area\b/gi, 'your scoring trend')
        .replace(/\btracked data\b/gi, 'scoring data')
        .replace(/\btracked stats\b/gi, 'scoring data')
        .replace(/\bmissing scoring trend\b/gi, 'missing tracked stats')
        .replace(/\bkeep building this area\b/gi, 'keep your process steady')
        .replace(/\bbuild(?:ing)? (?:on|this area)\b/gi, 'staying consistent')
        .replace(/\broom for improvement\b/gi, 'a clear next step')
        .replace(/\s+/g, ' ')
        .trim();

    const keepScoreOnlySentences = (text: string): string => {
      const sentences = splitSentencesSimple(scrubScoreOnly(text))
        .map((s) => sanitizeWhitespace(s))
        .filter(Boolean);
      const filtered = sentences.filter((s) => !skillAreaRe.test(s) && !badScoreOnlyPhraseRe.test(s));
      return sanitizeWhitespace((filtered.length ? filtered : sentences.slice(0, 1)).slice(0, 2).join(' '));
    };

    const b1 = keepScoreOnlySentences(getBody(out[0]));
    let b2 = keepScoreOnlySentences(getBody(out[1]));
    if (!b2) b2 = sanitizeWhitespace(getBody(out[1]));
    out[0] = replaceBodyKeepingEmoji(out[0], b1);
    out[1] = replaceBodyKeepingEmoji(out[1], b2);
  }

  // Keep Message 3 format consistent for UI readability.
  {
    const b3 = getBody(out[2]);
    if (!/^next round focus:/i.test(b3)) {
      out[2] = replaceBodyKeepingEmoji(out[2], `Next round focus: ${b3.replace(/^[.:\-\s]+/, '')}`);
    }
  }

  out = [
    replaceBodyKeepingEmoji(out[0], sanitizeInsightBodyText(getBody(out[0]))),
    replaceBodyKeepingEmoji(out[1], sanitizeInsightBodyText(getBody(out[1]))),
    replaceBodyKeepingEmoji(out[2], sanitizeInsightBodyText(getBody(out[2]))),
  ];

  return out;
}

// ---------------------------------------------------------------------------
// Main generate function
// ---------------------------------------------------------------------------

export async function generateInsights(
  roundId: bigint,
  userId: bigint,
  entitlements?: ViewerEntitlements,
  options?: { forceRegenerate?: boolean }
) {
  const effectiveEntitlements = entitlements ?? (await getViewerEntitlements(userId));
  const forceRegenerate = options?.forceRegenerate === true;

  // Check if insights already exist
  const existing = await prisma.roundInsight.findUnique({ where: { roundId } });
  if (existing) {
    if (existing.userId !== userId) {
      throw new Error('Unauthorized');
    }
    if (!forceRegenerate) {
      return limitInsightsForViewer(existing.insights, effectiveEntitlements);
    }
  }

  // Deduplicate concurrent in-flight requests.
  // Force-regeneration must not get coalesced with a non-force in-flight run,
  // or it can return stale wording after a stats edit.
  const key = forceRegenerate
    ? `${userId.toString()}:${roundId.toString()}:force`
    : `${userId.toString()}:${roundId.toString()}`;
  if (inFlightGenerations.has(key)) {
    const fullInsights = await inFlightGenerations.get(key)!;
    return limitInsightsForViewer(fullInsights, effectiveEntitlements);
  }

  const promise = generateInsightsInternal(roundId, userId, effectiveEntitlements, { forceRegenerate }).finally(() => {
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
  options?: { forceRegenerate?: boolean },
) {
  const forceRegenerate = options?.forceRegenerate === true;
  // Unified engine:
  // - Rounds 1-3: deterministic onboarding
  // - Rounds 4+: LLM-first (v3 behavior)
  const round = await prisma.round.findUnique({
    where: { id: roundId },
    include: { tee: { include: { course: { include: { location: true } }, holes: { select: { holeNumber: true, par: true }, orderBy: { holeNumber: 'asc' } } } } },
  });

  if (!round) throw new Error('Round not found');
  if (round.userId !== userId) throw new Error('Unauthorized access to round');

  const isScoreOnlyRound =
    round.firHit == null &&
    round.girHit == null &&
    round.putts == null &&
    round.penalties == null;

  const sgComponents = await prisma.roundStrokesGained.findUnique({
    where: { roundId },
  });

  const leaderboardStats = await prisma.userLeaderboardStats.findUnique({
    where: { userId },
    select: { bestScore: true, totalRounds: true },
  });

  const baselineTiers = await prisma.handicapTierBaseline.findMany({
    orderBy: { handicap: 'asc' },
  });

  type BaselineTier = (typeof baselineTiers)[number];
  const interpolateBaseline = (handicap: number, getValue: (t: BaselineTier) => number): number | null => {
    if (!baselineTiers.length) return null;
    if (handicap <= Number(baselineTiers[0].handicap)) {
      return getValue(baselineTiers[0]);
    }
    if (handicap >= Number(baselineTiers[baselineTiers.length - 1].handicap)) {
      return getValue(baselineTiers[baselineTiers.length - 1]);
    }

    let lowerBaseline = baselineTiers[0];
    let upperBaseline = baselineTiers[1];

    for (let i = 0; i < baselineTiers.length - 1; i++) {
      const current = baselineTiers[i];
      const next = baselineTiers[i + 1];
      if (handicap >= Number(current.handicap) && handicap <= Number(next.handicap)) {
        lowerBaseline = current;
        upperBaseline = next;
        break;
      }
    }

    const lowerHandicap = Number(lowerBaseline.handicap);
    const upperHandicap = Number(upperBaseline.handicap);
    const lowerValue = getValue(lowerBaseline);
    const upperValue = getValue(upperBaseline);
    const ratio = (handicap - lowerHandicap) / (upperHandicap - lowerHandicap);
    return lowerValue + (upperValue - lowerValue) * ratio;
  };

  const handicapAtRound = round.handicapAtRound != null ? Number(round.handicapAtRound) : null;
  const baselineFirPct = handicapAtRound != null
    ? interpolateBaseline(handicapAtRound, (t) => Number(t.baselineFIRPct))
    : null;
  const baselineGirPct = handicapAtRound != null
    ? interpolateBaseline(handicapAtRound, (t) => Number(t.baselineGIRPct))
    : null;

  const last5Rounds = await prisma.round.findMany({
    where: { userId, id: { not: roundId } },
    orderBy: { date: 'desc' },
    take: 5,
    include: { tee: { include: { holes: { select: { holeNumber: true, par: true }, orderBy: { holeNumber: 'asc' } } } } },
  });

  // ---- Calculate historical averages (normalized per hole, scaled to current round) ----

  const currentTeeSegment = ((round as any).teeSegment ?? 'full') as TeeSegment;
  const currentCtx = resolveTeeContext(round.tee, currentTeeSegment);
  const currentHolesPlayed = currentCtx.holes;

  let avgScore: number | null = null;
  let avgToPar: number | null = null;
  let avgFirPct: number | null = null;
  let avgGirPct: number | null = null;
  let avgPutts: number | null = null;
  let avgPenalties: number | null = null;
  let avgSgTotal: number | null = null;
  let avgSgOffTee: number | null = null;
  let avgSgApproach: number | null = null;
  let avgSgPutting: number | null = null;
  let avgSgPenalties: number | null = null;
  let avgSgResidual: number | null = null;

  // Pre-resolve tee contexts for historical rounds
  const last5Contexts = last5Rounds.map(r => {
    const seg = ((r as any).teeSegment ?? 'full') as TeeSegment;
    return resolveTeeContext(r.tee, seg);
  });

  if (last5Rounds.length) {
    const avgScorePerHole = last5Rounds.reduce((sum, r, i) => {
      return sum + (r.score / last5Contexts[i].holes);
    }, 0) / last5Rounds.length;
    avgScore = avgScorePerHole * currentHolesPlayed;

    const avgToParPerHole = last5Rounds.reduce((sum, r, i) => {
      const toPar = r.score - last5Contexts[i].parTotal;
      return sum + (toPar / last5Contexts[i].holes);
    }, 0) / last5Rounds.length;
    avgToPar = avgToParPerHole * currentHolesPlayed;

    const roundsWithFir = last5Rounds.map((r, i) => ({ r, ctx: last5Contexts[i] })).filter(({ r, ctx }) => r.firHit !== null && ctx.nonPar3Holes > 0);
    if (roundsWithFir.length)
      avgFirPct = roundsWithFir.reduce((sum, { r, ctx }) => sum + ((r.firHit || 0) / ctx.nonPar3Holes) * 100, 0) / roundsWithFir.length;

    const roundsWithGir = last5Rounds.map((r, i) => ({ r, ctx: last5Contexts[i] })).filter(({ r, ctx }) => r.girHit !== null && ctx.holes > 0);
    if (roundsWithGir.length)
      avgGirPct = roundsWithGir.reduce((sum, { r, ctx }) => sum + ((r.girHit || 0) / ctx.holes) * 100, 0) / roundsWithGir.length;

    const roundsWithPutts = last5Rounds.map((r, i) => ({ r, ctx: last5Contexts[i] })).filter(({ r }) => r.putts !== null);
    if (roundsWithPutts.length) {
      const avgPuttsPerHole = roundsWithPutts.reduce((sum, { r, ctx }) => {
        return sum + ((r.putts || 0) / ctx.holes);
      }, 0) / roundsWithPutts.length;
      avgPutts = avgPuttsPerHole * currentHolesPlayed;
    }

    const roundsWithPenalties = last5Rounds.map((r, i) => ({ r, ctx: last5Contexts[i] })).filter(({ r }) => r.penalties !== null);
    if (roundsWithPenalties.length) {
      const avgPenaltiesPerHole = roundsWithPenalties.reduce((sum, { r, ctx }) => {
        return sum + ((r.penalties || 0) / ctx.holes);
      }, 0) / roundsWithPenalties.length;
      avgPenalties = avgPenaltiesPerHole * currentHolesPlayed;
    }

    const last5SGs = await prisma.roundStrokesGained.findMany({
      where: { roundId: { in: last5Rounds.map(r => r.id) } },
    });

    const roundHolesMap = new Map<bigint, number>(last5Rounds.map((r, i) => [r.id, last5Contexts[i].holes]));
    const validSgResults = last5SGs.filter((sg) => sg && sg.sgTotal !== null);

    if (validSgResults.length) {
      const sumSGPerHole = (fn: (sg: typeof validSgResults[0]) => number) => {
        return validSgResults.reduce((sum, sg) => {
          const holes: number = roundHolesMap.get(sg.roundId) ?? 18;
          return sum + (fn(sg) / holes);
        }, 0) / validSgResults.length;
      };

      avgSgTotal = sumSGPerHole((sg) => Number(sg.sgTotal) || 0) * currentHolesPlayed;
      avgSgOffTee = sumSGPerHole((sg) => Number(sg.sgOffTee) || 0) * currentHolesPlayed;
      avgSgApproach = sumSGPerHole((sg) => Number(sg.sgApproach) || 0) * currentHolesPlayed;
      avgSgPutting = sumSGPerHole((sg) => Number(sg.sgPutting) || 0) * currentHolesPlayed;
      avgSgPenalties = sumSGPerHole((sg) => Number(sg.sgPenalties) || 0) * currentHolesPlayed;
      avgSgResidual = sumSGPerHole((sg) => Number(sg.sgResidual) || 0) * currentHolesPlayed;
    }
  }

  // ---- Detect special scenarios ----

  const bestScore = leaderboardStats?.bestScore ?? null;
  const bestDelta = bestScore != null ? round.score - bestScore : null;
  const isPersonalBest = bestDelta != null && bestDelta <= 0;
  const isNearPersonalBest = bestDelta != null && bestDelta > 0 && bestDelta <= 2;

  // First round at this course
  const priorRoundsAtCourse = await prisma.round.count({
    where: { userId, courseId: round.tee.course.id, id: { not: roundId } },
  });
  const isFirstAtCourse = priorRoundsAtCourse === 0;

  // Returning after a break (no rounds in last 14 days before this one)
  const twoWeeksAgo = new Date(round.date);
  twoWeeksAgo.setDate(twoWeeksAgo.getDate() - 14);
  const recentRoundsBeforeThis = await prisma.round.count({
    where: { userId, date: { gte: twoWeeksAgo, lt: round.date }, id: { not: roundId } },
  });
  const isReturnAfterBreak = recentRoundsBeforeThis === 0 && (leaderboardStats?.totalRounds ?? 0) > 3;

  // Handicap trend (compare last 3 handicaps)
  let handicapTrend: 'improving' | 'declining' | 'stable' | null = null;
  const handicapHistory = last5Rounds
    .slice(0, 3)
    .map((r) => (r.handicapAtRound != null ? Number(r.handicapAtRound) : null))
    .filter((h): h is number => h !== null);

  if (handicapHistory.length >= 2 && handicapAtRound != null) {
    const avgPrior = handicapHistory.reduce((a, b) => a + b, 0) / handicapHistory.length;
    const diff = handicapAtRound - avgPrior;
    if (diff <= -1.5) handicapTrend = 'improving';
    else if (diff >= 1.5) handicapTrend = 'declining';
    else handicapTrend = 'stable';
  }

  let totalRounds: number | null = leaderboardStats?.totalRounds ?? null;
  if (totalRounds === null) {
    totalRounds = await prisma.round.count({ where: { userId } });
  }

  // Determine if we should nudge stats tracking (~25% of the time), per user round count.
  // This avoids tying nudges to a global roundId sequence across all users.
  const shouldNudgeStats = totalRounds != null ? (totalRounds % 4) === 0 : false;

  // ---- Build strokes gained payload (only non-null values) ----

  const strokesGainedPayload: Record<string, number> = {};
  if (sgComponents?.sgTotal != null) strokesGainedPayload.total = Number(sgComponents.sgTotal);
  if (sgComponents?.sgOffTee != null) strokesGainedPayload.off_tee = Number(sgComponents.sgOffTee);
  if (sgComponents?.sgApproach != null) strokesGainedPayload.approach = Number(sgComponents.sgApproach);
  if (sgComponents?.sgPutting != null) strokesGainedPayload.putting = Number(sgComponents.sgPutting);
  if (sgComponents?.sgPenalties != null) strokesGainedPayload.penalties = Number(sgComponents.sgPenalties);
  if (sgComponents?.sgResidual != null) strokesGainedPayload.residual = Number(sgComponents.sgResidual);

  // ---- Run SG selection algorithm (server-side, deterministic) ----

  const hasSGData = sgComponents && sgComponents.sgTotal != null;
  const isEarlyRounds = totalRounds !== null && totalRounds <= 3;

  // SG bands are scaled for 9-hole rounds (half the thresholds).
  const sgScale = currentHolesPlayed === 9 ? 0.5 : 1;
  const sgThresholds = {
    weakness: SG_WEAKNESS_THRESHOLD * sgScale,
    largeWeakness: SG_LARGE_WEAKNESS_THRESHOLD * sgScale,
    shortGame: SG_SHORT_GAME_THRESHOLD * sgScale,
    toughRound: SG_TOUGH_ROUND_THRESHOLD * sgScale,
    belowExpectations: SG_BELOW_EXPECTATIONS_THRESHOLD * sgScale,
    aboveExpectations: SG_ABOVE_EXPECTATIONS_THRESHOLD * sgScale,
    exceptional: SG_EXCEPTIONAL_THRESHOLD * sgScale,
    exceptionalComponent: SG_EXCEPTIONAL_COMPONENT_THRESHOLD * sgScale,
  };
  const sgSelection = hasSGData
    ? runSGSelection(
        sgComponents.sgOffTee != null ? Number(sgComponents.sgOffTee) : null,
        sgComponents.sgApproach != null ? Number(sgComponents.sgApproach) : null,
        sgComponents.sgPutting != null ? Number(sgComponents.sgPutting) : null,
        sgComponents.sgPenalties != null ? Number(sgComponents.sgPenalties) : null,
        sgComponents.sgResidual != null ? Number(sgComponents.sgResidual) : null,
        sgComponents.sgTotal != null ? Number(sgComponents.sgTotal) : null,
        sgThresholds,
      )
    : null;

  // ---- Determine confidence/partial analysis ----

  const partialAnalysis = sgComponents?.partialAnalysis ?? false;

  // ---- Course difficulty context ----

  const courseRating = currentCtx.courseRating;
  const slopeRating = currentCtx.slopeRating;
  const ratingThreshold = currentHolesPlayed === 9 ? currentCtx.parTotal + 0.5 : currentCtx.parTotal + 1;
  const mentionCourseDifficulty = (courseRating != null && courseRating > ratingThreshold) || (slopeRating != null && slopeRating > HIGH_SLOPE_THRESHOLD);

  // ---- Build payload for the LLM ----

  const toPar = round.score - currentCtx.parTotal;
  const totalSG = strokesGainedPayload.total ?? null;

  const roundFirPct = round.firHit != null && currentCtx.nonPar3Holes > 0
    ? (round.firHit / currentCtx.nonPar3Holes) * 100
    : null;
  const roundGirPct = round.girHit != null && currentCtx.holes > 0
    ? (round.girHit / currentCtx.holes) * 100
    : null;

  const diffs = {
    score: avgScore != null ? round.score - avgScore : null,
    to_par: avgToPar != null ? toPar - avgToPar : null,
    putts: avgPutts != null && round.putts != null ? round.putts - avgPutts : null,
    penalties: avgPenalties != null && round.penalties != null ? round.penalties - avgPenalties : null,
    fir_pct: avgFirPct != null && roundFirPct != null ? roundFirPct - avgFirPct : null,
    gir_pct: avgGirPct != null && roundGirPct != null ? roundGirPct - avgGirPct : null,
  };

  const meaningfulComparisons = {
    score: diffs.score != null && Math.abs(diffs.score) >= 2,
    putts: diffs.putts != null && Math.abs(diffs.putts) >= 2,
    penalties: diffs.penalties != null && Math.abs(diffs.penalties) >= 1,
    fir_pct: diffs.fir_pct != null && Math.abs(diffs.fir_pct) >= BASELINE_DIFFERENCE_THRESHOLD,
    gir_pct: diffs.gir_pct != null && Math.abs(diffs.gir_pct) >= BASELINE_DIFFERENCE_THRESHOLD,
  };

  const payload = {
    round: {
      score: round.score,
      to_par: toPar,
      score_display: `${round.score} (${formatToParShort(toPar)})`,
      par_phrase: formatToParPhrase(toPar),
      handicap_at_round: round.handicapAtRound ? Number(round.handicapAtRound) : null,
      course: {
        par: currentCtx.parTotal,
        rating: courseRating,
        slope: slopeRating,
        holes_played: currentHolesPlayed,
        non_par3_holes: currentCtx.nonPar3Holes,
      },
      stats: {
        fir_hit: round.firHit,
        gir_hit: round.girHit,
        putts: round.putts,
        penalties: round.penalties,
      },
      strokes_gained: null,
    },
    history: last5Rounds.length
      ? {
          last_5_rounds: {
            count: last5Rounds.length,
            average_score: avgScore != null ? Math.round(avgScore * 10) / 10 : null,
            average_to_par: avgToPar != null ? Math.round(avgToPar * 10) / 10 : null,
            average_fir_pct: avgFirPct != null ? Math.round(avgFirPct * 10) / 10 : null,
            average_gir_pct: avgGirPct != null ? Math.round(avgGirPct * 10) / 10 : null,
            average_putts: avgPutts != null ? Math.round(avgPutts * 10) / 10 : null,
            average_penalties: avgPenalties != null ? Math.round(avgPenalties * 10) / 10 : null,
            average_sg: null,
            comparisons: {
              diffs: {
                score: diffs.score != null ? Math.round(diffs.score * 10) / 10 : null,
                to_par: diffs.to_par != null ? Math.round(diffs.to_par * 10) / 10 : null,
                putts: diffs.putts != null ? Math.round(diffs.putts * 10) / 10 : null,
                penalties: diffs.penalties != null ? Math.round(diffs.penalties * 10) / 10 : null,
                fir_pct: diffs.fir_pct != null ? Math.round(diffs.fir_pct * 10) / 10 : null,
                gir_pct: diffs.gir_pct != null ? Math.round(diffs.gir_pct * 10) / 10 : null,
              },
              meaningful: meaningfulComparisons,
            },
          },
          best_score: bestScore,
          total_rounds: totalRounds,
          handicap_trend: last5Rounds
            .map((r) => (r.handicapAtRound ? Number(r.handicapAtRound) : null))
            .filter((h) => h !== null)
            .reverse(),
        }
      : null,
    scenarios: {
      is_personal_best: isPersonalBest,
      is_near_personal_best: isNearPersonalBest,
      is_first_at_course: isFirstAtCourse,
      is_return_after_break: isReturnAfterBreak,
      handicap_trend: handicapTrend,
    },
  };

  // Payload sent to the LLM should avoid internal key names / concepts we don't want echoed
  // (e.g., "to_par", "score_display", "par_phrase"). We keep the full payload for storage/debug,
  // but send a simplified version to improve output quality.
  const payloadForLLM: any = JSON.parse(JSON.stringify(payload));
  if (payloadForLLM?.round) {
    delete payloadForLLM.round.to_par;
    delete payloadForLLM.round.score_display;
    delete payloadForLLM.round.par_phrase;
    if (payloadForLLM.round.course) {
      delete payloadForLLM.round.course.par;
    }
    // Provide a single, user-facing scoring string without exposing internal key names.
    payloadForLLM.round.score_compact = `${round.score} (${formatToParShort(toPar)})`;
  }
  if (payloadForLLM?.history?.last_5_rounds) {
    delete payloadForLLM.history.last_5_rounds.average_to_par;
    if (payloadForLLM.history.last_5_rounds?.comparisons?.diffs) {
      delete payloadForLLM.history.last_5_rounds.comparisons.diffs.to_par;
    }
  }
  if (payloadForLLM?.scenarios) {
    // Avoid language like "first time at this course" (we only know first logged round).
    delete payloadForLLM.scenarios.is_first_at_course;
  }

  const scoreCompact = `${round.score} (${formatToParShort(toPar)})`;
  const roundsRemainingForHandicap = totalRounds != null && totalRounds < 3 ? Math.max(0, 3 - totalRounds) : 0;

    const firPct =
      round.firHit != null && currentCtx.nonPar3Holes > 0
        ? (Number(round.firHit) / currentCtx.nonPar3Holes) * 100
        : null;
    const girPct =
      round.girHit != null && currentCtx.holes > 0
        ? (Number(round.girHit) / currentCtx.holes) * 100
        : null;

    const nextTrackStat: 'putts' | 'penalties' | 'GIR' | 'FIR' | null =
      round.putts == null
        ? 'putts'
        : round.penalties == null
          ? 'penalties'
          : round.girHit == null
            ? 'GIR'
            : round.firHit == null
              ? 'FIR'
              : null;

    const performanceBand = computePerformanceBand(totalSG, {
      toughRound: sgThresholds.toughRound,
      belowExpectations: sgThresholds.belowExpectations,
      aboveExpectations: sgThresholds.aboveExpectations,
      exceptional: sgThresholds.exceptional,
    });

    const sgFocus =
      hasSGData && sgSelection
        ? {
            bestName: sgSelection.best.name,
            bestLabel: sgSelection.best.label,
            bestValue: sgSelection.best.value,
            opportunityName: sgSelection.message2.name,
            opportunityLabel: sgSelection.message2.label,
            opportunityValue: sgSelection.message2.value,
            shortGameInferred: sgSelection.message2.name === 'short_game',
          }
        : null;
    const message2IsOpportunity = Boolean(
      sgSelection &&
      Number.isFinite(sgSelection.message2.value) &&
      sgSelection.message2.value < 0
    );
    const hasTrackedWeakness = Boolean(
      message2IsOpportunity &&
      sgSelection &&
      Number.isFinite(sgSelection.message2.value) &&
      sgSelection.message2.value <= sgThresholds.weakness
    );
    const message2ShouldWarn = hasTrackedWeakness || performanceBand === 'tough' || performanceBand === 'below';
    const allowCourseDifficultyLanguage =
      mentionCourseDifficulty &&
      (performanceBand === 'tough' || performanceBand === 'below') &&
      !hasTrackedWeakness;
    const opportunityImpactStrokesRounded =
      (sgFocus && Number.isFinite(sgFocus.opportunityValue) && Math.abs(sgFocus.opportunityValue) >= 1.5)
        ? Math.max(1, Math.round(Math.abs(sgFocus.opportunityValue)))
        : null;

    const drillSeed = hashStringToInt([
      roundId.toString(),
      userId.toString(),
      String(totalRounds ?? ''),
      String(sgFocus?.opportunityName ?? ''),
      String(Math.round(Number(sgComponents?.sgTotal ?? 0) * 100)),
      String(Math.round(Number(sgComponents?.sgResidual ?? 0) * 100)),
      String(round.score),
      String(round.firHit ?? ''),
      String(round.girHit ?? ''),
      String(round.putts ?? ''),
      String(round.penalties ?? ''),
    ].join('|'));
    // Keep onboarding rounds (1-3) deterministic and milestone-focused.
    // Drill prescriptions start once the user is past onboarding.
    const allowDrillSuggestion = totalRounds != null && totalRounds >= 4;
    let drillSuggestion: string | null = null;
    let drillSelectedAtIso: string | null = null;
    let drillFingerprint: string | null = null;
    let drillReused = false;
    let priorRoundDrillFingerprint: string | null = null;
    let priorRoundDrillRecent: string[] = [];
    if (allowDrillSuggestion && nextTrackStat == null && sgFocus) {
      drillFingerprint = [
        roundId.toString(),
        userId.toString(),
        String(round.score),
        String(round.firHit ?? ''),
        String(round.girHit ?? ''),
        String(round.putts ?? ''),
        String(round.penalties ?? ''),
        String(sgFocus.opportunityName),
        String(Math.round(Number(sgFocus.opportunityValue ?? 0) * 100) / 100),
        String(Math.round(Number(sgComponents?.sgTotal ?? 0) * 100) / 100),
        String(Math.round(Number(sgComponents?.sgResidual ?? 0) * 100) / 100),
      ].join('|');

      const currentInsightRow = await prisma.roundInsight.findUnique({
        where: { roundId },
        select: { insights: true },
      });
      const currentInsight: any = currentInsightRow?.insights ?? null;
      const previousDrill = typeof currentInsight?.drill_selected === 'string'
        ? sanitizeWhitespace(currentInsight.drill_selected)
        : null;
      const previousFingerprint = typeof currentInsight?.drill_fingerprint === 'string'
        ? currentInsight.drill_fingerprint
        : null;
      priorRoundDrillFingerprint = previousFingerprint;
      priorRoundDrillRecent = Array.isArray(currentInsight?.drill_recent)
        ? currentInsight.drill_recent
            .filter((d: any) => typeof d === 'string')
            .map((d: string) => sanitizeWhitespace(d))
            .filter(Boolean)
        : [];
      const previousSelectedAt = typeof currentInsight?.drill_selected_at === 'string'
        ? currentInsight.drill_selected_at
        : null;
      const previousSelectedAtMs = previousSelectedAt ? Date.parse(previousSelectedAt) : NaN;
      const nowMs = Date.now();
      const withinReuseWindow =
        Number.isFinite(previousSelectedAtMs) &&
        nowMs - previousSelectedAtMs >= 0 &&
        nowMs - previousSelectedAtMs < DRILL_REUSE_WINDOW_MS;

      const canReusePreviousDrill =
        Boolean(previousDrill) &&
        Boolean(previousFingerprint) &&
        previousFingerprint === drillFingerprint &&
        !forceRegenerate &&
        withinReuseWindow;

      if (canReusePreviousDrill) {
        drillSuggestion = previousDrill;
        drillSelectedAtIso = previousSelectedAt;
        drillReused = true;
      } else {
      const area = sgFocus.opportunityName;
      const areaDrills = new Set(DRILL_LIBRARY[area] ?? DRILL_LIBRARY.general);
      const recentInsights = await prisma.roundInsight.findMany({
        where: { userId },
        orderBy: { updatedAt: 'desc' },
        take: 8,
        select: { insights: true },
      });

      const recentlyUsedForArea = new Set<string>();
      for (const row of recentInsights) {
        const refs = extractReferencedDrillsFromInsights(row.insights);
        for (const drill of refs) {
          if (areaDrills.has(drill)) recentlyUsedForArea.add(drill);
        }
      }
      // On explicit regenerate, force rotation away from the current round's last drill
      // when inputs/fingerprint are unchanged.
      if (
        forceRegenerate &&
        previousDrill &&
        previousFingerprint &&
        previousFingerprint === drillFingerprint &&
        areaDrills.has(previousDrill)
      ) {
        recentlyUsedForArea.add(previousDrill);
      }
      if (
        forceRegenerate &&
        previousFingerprint &&
        previousFingerprint === drillFingerprint &&
        priorRoundDrillRecent.length
      ) {
        for (const d of priorRoundDrillRecent) {
          if (areaDrills.has(d)) recentlyUsedForArea.add(d);
        }
      }

      drillSuggestion = pickDrillAvoidingRecent(area, drillSeed, recentlyUsedForArea);
        drillSelectedAtIso = new Date().toISOString();
      }
    }

    const lastRoundComparison: 'better' | 'same' | 'worse' | null = (() => {
      if (totalRounds !== 2) return null;
      if (!last5Rounds.length) return null;

      const last = last5Rounds[0];
      const lastCtx = last5Contexts[0];
      if (!lastCtx?.holes || lastCtx.holes <= 0) return null;

      const currentPerHole = round.score / currentHolesPlayed;
      const lastPerHole = last.score / lastCtx.holes;
      if (!Number.isFinite(currentPerHole) || !Number.isFinite(lastPerHole)) return null;

      if (currentPerHole < lastPerHole) return 'better';
      if (currentPerHole > lastPerHole) return 'worse';
      return 'same';
    })();

    // Deterministic style variant:
    // - same inputs => same phrasing
    // - material round edits (score/stats/SG focus) => likely different phrasing
    const styleVariant = (() => {
      const seedSource = [
        roundId.toString(),
        userId.toString(),
        String(round.score),
        String(toPar),
        String(round.putts ?? ''),
        String(round.penalties ?? ''),
        String(round.firHit ?? ''),
        String(round.girHit ?? ''),
        String(round.handicapAtRound ?? ''),
        String(sgFocus?.bestName ?? ''),
        String(sgFocus?.opportunityName ?? ''),
        String(Math.round(Number(sgComponents?.sgTotal ?? 0) * 100)),
        String(Math.round(Number(sgComponents?.sgOffTee ?? 0) * 100)),
        String(Math.round(Number(sgComponents?.sgApproach ?? 0) * 100)),
        String(Math.round(Number(sgComponents?.sgPutting ?? 0) * 100)),
        String(Math.round(Number(sgComponents?.sgPenalties ?? 0) * 100)),
        String(Math.round(Number(sgComponents?.sgResidual ?? 0) * 100)),
      ].join('|');
      return mix32(hashStringToInt(seedSource)) % 4;
    })();

    const planner = buildPlannerOutput({
      scoreCompact,
      totalRounds,
      isScoreOnlyRound,
      lastRoundComparison,
      avgScore,
      scoreDiffVsAvg: diffs.score,
      bestScore,
      bestDelta,
      nextTrackStat,
      performanceBand,
      sgTotalValue: totalSG != null ? Number(totalSG) : null,
      message2ShouldWarn,
      hasTrackedWeakness,
      handicapValue: handicapAtRound,
      allowSgLanguage: entitlements.showStrokesGained,
      styleVariant,
      firHitCount: round.firHit != null ? Number(round.firHit) : null,
      girHitCount: round.girHit != null ? Number(round.girHit) : null,
      firPct,
      girPct,
      puttsCount: round.putts != null ? Number(round.putts) : null,
      penaltiesCount: round.penalties != null ? Number(round.penalties) : null,
      sgFocus,
      weaknessThreshold: sgThresholds.weakness,
      drillSuggestion,
      allowedNumbers: [
        Number(round.score),
        Number(toPar),
        Number(roundsRemainingForHandicap),
        ...(avgScore != null ? [avgScore, Math.round(avgScore * 10) / 10, Math.round(avgScore)] : []),
        ...(diffs.score != null ? [diffs.score, Math.round(diffs.score * 10) / 10, Math.round(diffs.score)] : []),
        ...(bestScore != null ? [bestScore, Math.round(bestScore)] : []),
        ...(bestDelta != null ? [bestDelta, Math.round(bestDelta * 10) / 10, Math.round(bestDelta)] : []),
        ...(totalSG != null ? [totalSG, Math.round(totalSG * 10) / 10, Math.round(totalSG * 100) / 100] : []),
        ...(sgComponents?.sgOffTee != null ? [Number(sgComponents.sgOffTee), Math.round(Number(sgComponents.sgOffTee) * 10) / 10] : []),
        ...(sgComponents?.sgApproach != null ? [Number(sgComponents.sgApproach), Math.round(Number(sgComponents.sgApproach) * 10) / 10] : []),
        ...(sgComponents?.sgPutting != null ? [Number(sgComponents.sgPutting), Math.round(Number(sgComponents.sgPutting) * 10) / 10] : []),
        ...(sgComponents?.sgPenalties != null ? [Number(sgComponents.sgPenalties), Math.round(Number(sgComponents.sgPenalties) * 10) / 10] : []),
        ...(sgComponents?.sgResidual != null ? [Number(sgComponents.sgResidual), Math.round(Number(sgComponents.sgResidual) * 10) / 10] : []),
        ...(handicapAtRound != null ? [Number(handicapAtRound)] : []),
        ...(round.firHit != null ? [Number(round.firHit)] : []),
        ...(round.girHit != null ? [Number(round.girHit)] : []),
        ...(round.putts != null ? [Number(round.putts)] : []),
        ...(round.penalties != null ? [Number(round.penalties)] : []),
        ...(drillSuggestion ? extractNumericLiterals(drillSuggestion) : []),
      ],
      hasFir: round.firHit != null,
      hasGir: round.girHit != null,
      hasPutts: round.putts != null,
      hasPenalties: round.penalties != null,
      hasHandicap: handicapAtRound != null,
      hasSgTotal: totalSG != null,
      hasSgComponents: sgComponents?.sgOffTee != null || sgComponents?.sgApproach != null || sgComponents?.sgPutting != null || sgComponents?.sgPenalties != null,
    });

    const useLlmRound = totalRounds != null && totalRounds > 3;
    let finalMessages: [string, string, string] = useLlmRound
      ? (['\u2705 Loading insight.', '\u26A0\uFE0F Loading insight.', '\u2139\uFE0F Loading insight.'] as [string, string, string])
      : planner.fallback.messages;
    let openaiUsage: OpenAIUsageSummary | null = null;
    let realizerOk = !useLlmRound;
    let realizerError: string | null = null;
    let realizerRetryCount = 0;
    let fallbackUsed = false;
    const scoreOnlyMode = !planner.present.fir && !planner.present.gir && !planner.present.putts && !planner.present.penalties;

    if (useLlmRound) {
      if (!OPENAI_API_KEY) {
        finalMessages = buildRound4EmergencyFallback(nextTrackStat);
        realizerError = 'OpenAI API key missing';
        fallbackUsed = true;
      } else {
        try {
          const { systemPrompt, userPrompt } = buildRealizerPromptsV3(payloadForLLM, planner.allowSgLanguage, {
            actionType: planner.action.type,
            nextTrackStat: planner.action.stat,
            drillSuggestion: planner.action.drill,
            allowCourseDifficultyMention: allowCourseDifficultyLanguage,
            scoreCompact,
            scoreDiffVsAvg: diffs.score != null && Number.isFinite(diffs.score) ? Math.round(diffs.score * 10) / 10 : null,
            totalSg: totalSG != null && Number.isFinite(totalSG) ? Number(totalSG) : null,
            scoreOnlyMode,
            insight2Emoji: planner.insights.insight2.emoji,
            hasOpportunityFocus: planner.focus.opportunityName != null,
            focus: {
              bestLabel: sgFocus?.bestLabel ?? null,
              opportunityLabel: sgFocus?.opportunityLabel ?? null,
              shortGameInferred: planner.focus.shortGameInferred,
              opportunityIsWeak: hasTrackedWeakness,
              opportunityImpactStrokesRounded,
            },
            present: {
              fir: planner.present.fir,
              gir: planner.present.gir,
              putts: planner.present.putts,
              penalties: planner.present.penalties,
            },
          });
          const toNode = (msg: string) => {
            const m = sanitizeWhitespace(msg);
            const match = m.match(/^(?:\u2705|\u26A0\uFE0F|\u2139\uFE0F|\uD83D\uDD25)\s+(.*)$/u);
            return {
              emoji: (m.split(/\s+/)[0] ?? '\u2705') as InsightEmoji,
              text: sanitizeWhitespace(match?.[1] ?? m),
            };
          };

          const validateMessages = (messages: [string, string, string]) =>
            validateRealizedInsightsV3(
              {
                insights: planner.insights,
                allowedNumbers: planner.allowedNumbers,
                action: planner.action,
                focus: {
                  ...planner.focus,
                  opportunityIsWeak: hasTrackedWeakness,
                  opportunityImpactStrokesRounded,
                },
                allowSgLanguage: planner.allowSgLanguage,
                present: {
                  fir: planner.present.fir,
                  gir: planner.present.gir,
                  putts: planner.present.putts,
                  penalties: planner.present.penalties,
                },
              },
              {
                insight1: toNode(messages[0]),
                insight2: toNode(messages[1]),
                insight3: toNode(messages[2]),
              },
            );

          const opportunitySupportPhrase = (() => {
            const name = planner.focus.opportunityName;
            if (!name) return null;
            if (name === 'putting' && round.putts != null) return `with ${Number(round.putts)} putts`;
            if (name === 'approach' && round.girHit != null) return `with ${Number(round.girHit)} greens in regulation`;
            if (name === 'off_tee' && round.firHit != null) return `with ${Number(round.firHit)} fairways hit`;
            if (name === 'penalties' && round.penalties != null) return `with ${Number(round.penalties)} penalties`;
            return null;
          })();

          const runRealizer = async (prompt: string): Promise<{
            messages: [string, string, string] | null;
            candidate: [string, string, string] | null;
            usage: OpenAIUsageSummary | null;
            error: string | null;
          }> => {
            const openaiResult = await callOpenAI({
              apiKey: OPENAI_API_KEY,
              model: OPENAI_MODEL,
              systemPrompt,
              userPrompt: prompt,
              maxOutputTokens: OPENAI_MAX_COMPLETION_TOKENS,
              timeoutMs: OPENAI_TIMEOUT_MS,
            });

            const parsed = tryParseJsonObject(openaiResult.text);
            const realizedMessages =
              normalizeRealizerParsedOutputV3(parsed) ??
              normalizeRealizerParsedOutputV3(openaiResult.text) ??
              extractMessagesFromLooseText(openaiResult.text);
            if (!realizedMessages) {
              return {
                messages: null,
                candidate: null,
                usage: openaiResult.usage,
                error: 'Failed to parse JSON messages',
              };
            }

            const repairedMessages = repairV3MessagesForMissingStats(
              realizedMessages,
              {
                fir: planner.present.fir,
                gir: planner.present.gir,
                putts: planner.present.putts,
                penalties: planner.present.penalties,
              },
              planner.action,
            );

            const normalizedMessages = forcePlannedEmojis(repairedMessages, planner.insights);
            const policyAdjustedMessages = applyV3LanguagePolicy(normalizedMessages, {
              measuredOpportunity: !planner.focus.shortGameInferred,
              opportunityIsWeak: hasTrackedWeakness,
              opportunityValue:
                sgFocus && Number.isFinite(sgFocus.opportunityValue)
                  ? Number(sgFocus.opportunityValue)
                  : null,
              bestName: planner.focus.bestName,
              opportunityName: planner.focus.opportunityName,
              opportunitySupportPhrase,
              allowCourseDifficultyLanguage,
              nearNeutralRound: totalSG != null && Number.isFinite(totalSG) && Math.abs(totalSG) <= 1.5,
              scoreOnlyMode,
            });

            const validation = validateMessages(policyAdjustedMessages);
            if (!validation.ok) {
              return { messages: null, candidate: policyAdjustedMessages, usage: openaiResult.usage, error: validation.reason };
            }

            return { messages: policyAdjustedMessages, candidate: policyAdjustedMessages, usage: openaiResult.usage, error: null };
          };

          const firstPass = await runRealizer(userPrompt);
          openaiUsage = firstPass.usage;

          if (firstPass.messages) {
            finalMessages = firstPass.messages;
            realizerOk = true;
          } else {
            const softCandidate = firstPass.candidate;
            if (!softCandidate) {
              finalMessages = buildRound4EmergencyFallback(nextTrackStat);
              realizerOk = false;
              realizerError = `V3 realizer failed: ${firstPass.error ?? 'unknown validation error'}`;
              fallbackUsed = true;
            } else {
              if (scoreOnlyMode) {
                const scoreOnlyRepairPrompt = [
                  userPrompt,
                  '',
                  'REPAIR INSTRUCTIONS:',
                  '- Rewrite all 3 messages so they pass the constraints.',
                  '- Keep this score-only: do not attribute to specific skill areas.',
                  '- Message 3 must start with "Next round focus:".',
                  '- Return only valid JSON schema {"messages":["...","...","..."]}.',
                  '',
                  'PREVIOUS INVALID OUTPUT:',
                  JSON.stringify(softCandidate),
                  '',
                  `VALIDATION FAILURE: ${firstPass.error ?? 'unknown validation error'}`,
                ].join('\n');

                realizerRetryCount = 1;
                const secondPass = await runRealizer(scoreOnlyRepairPrompt);
                openaiUsage = secondPass.usage ?? openaiUsage;

                if (secondPass.messages) {
                  finalMessages = secondPass.messages;
                  realizerOk = true;
                  realizerError = null;
                  fallbackUsed = false;
                } else {
                  finalMessages = softCandidate;
                  realizerOk = false;
                  realizerError = `Soft-accepted after score-only retry failure: ${secondPass.error ?? firstPass.error ?? 'unknown validation error'}`;
                  fallbackUsed = false;
                }
              } else {
                finalMessages = softCandidate;
                realizerOk = false;
                realizerError = `Soft-accepted after single-pass validation failure: ${firstPass.error ?? 'unknown validation error'}`;
                fallbackUsed = false;
              }
            }
          }
        } catch (err: any) {
          const message = err?.message || String(err);
          if (isServerLevelOutageError(message)) {
            finalMessages = buildRound4EmergencyFallback(nextTrackStat);
            realizerError = message;
            fallbackUsed = true;
          } else {
            throw err;
          }
        }
      }
    }

    // Hard cap message length for mobile readability. Keep whole sentences whenever possible.
    finalMessages = [
      enforceMaxMessageChars(finalMessages[0], MAX_MESSAGE_CHARS),
      enforceMaxMessageChars(finalMessages[1], MAX_MESSAGE_CHARS),
      enforceMaxMessageChars(finalMessages[2], MAX_MESSAGE_CHARS),
    ] as [string, string, string];

    // Free users see only Message 1 after round 3, but we still generate and store
    // all 3 so an upgrade reveals the rest without regeneration.
    const freeVisibleCount = isEarlyRounds ? 3 : 1;

    const insightsData = {
      // Keep a short recent drill list for same-round force-regeneration rotation.
      // This prevents immediate repeats while preserving deterministic behavior otherwise.
      drill_recent:
        drillSuggestion && drillFingerprint
          ? (() => {
              const seed =
                priorRoundDrillFingerprint &&
                priorRoundDrillFingerprint === drillFingerprint &&
                priorRoundDrillRecent.length
                  ? priorRoundDrillRecent
                  : [];
              const merged = [sanitizeWhitespace(drillSuggestion), ...seed]
                .filter(Boolean)
                .filter((v, i, arr) => arr.indexOf(v) === i);
              return merged.slice(0, 4);
            })()
          : [],
      messages: finalMessages,
      generated_at: new Date().toISOString(),
      model: OPENAI_MODEL,
      free_visible_count: freeVisibleCount,
      generation_count: MAX_INSIGHTS,
      openai_usage: openaiUsage,
      planner: planner.insights,
      realizer_ok: realizerOk,
      realizer_error: realizerError,
      realizer_retry_count: realizerRetryCount,
      fallback_used: fallbackUsed,
      drill_selected: drillSuggestion,
      drill_selected_at: drillSelectedAtIso,
      drill_fingerprint: drillFingerprint,
      drill_reused: drillReused,
      raw_payload: payload,
    };

  const savedInsights = await prisma.roundInsight.upsert({
    where: { roundId },
    create: {
      roundId,
      userId,
      modelUsed: OPENAI_MODEL,
      insights: insightsData,
    },
    update: {
      insights: insightsData,
      updatedAt: new Date(),
    },
  });

  return savedInsights.insights;
}


