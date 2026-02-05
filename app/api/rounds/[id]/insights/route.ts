import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { resolveTeeContext, type TeeSegment } from '@/lib/tee/resolveTeeContext';

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

// ---------------------------------------------------------------------------
// Thresholds and Constants
// ---------------------------------------------------------------------------

/** SG threshold below which a component is considered a weakness */
const SG_WEAKNESS_THRESHOLD = -1.0;

/** SG threshold for a "large" weakness requiring ⚠️ emoji */
const SG_LARGE_WEAKNESS_THRESHOLD = -2.0;

/** SG threshold for short-game attribution from residual */
const SG_SHORT_GAME_THRESHOLD = -2.5;

/** Total SG threshold for a "tough" round */
const SG_TOUGH_ROUND_THRESHOLD = -5.0;

/** Total SG threshold for "below expectations" (not disastrous) */
const SG_BELOW_EXPECTATIONS_THRESHOLD = -2.0;

/** Total SG threshold for "above expectations" */
const SG_ABOVE_EXPECTATIONS_THRESHOLD = 2.0;

/** Total SG threshold for exceptional performance (🔥 emoji) */
const SG_EXCEPTIONAL_THRESHOLD = 5.0;

/** Individual component SG threshold for exceptional performance */
const SG_EXCEPTIONAL_COMPONENT_THRESHOLD = 4.0;

/** Course slope rating threshold for "above-average difficulty" */
const HIGH_SLOPE_THRESHOLD = 130;

/** FIR percentage threshold for "very low" triggering override */
const VERY_LOW_FIR_PCT = 25;

/** GIR percentage threshold for "very low" triggering override */
const VERY_LOW_GIR_PCT = 20;


/** Baseline difference threshold for stat comparisons (e.g., FIR/GIR 8% below baseline) */
const BASELINE_DIFFERENCE_THRESHOLD = 8;

/** OpenAI model temperature for generation (lower = more deterministic) */
const OPENAI_TEMPERATURE = 0.2;

/** OpenAI model to use */
const OPENAI_MODEL = process.env.OPENAI_MODEL || 'gpt-5-nano';

/** Cap output tokens for post-round latency */
// Keep a sensible floor to avoid overly short responses, but allow env overrides upward.
const OPENAI_MAX_COMPLETION_TOKENS = Math.max(1600, Number(process.env.OPENAI_MAX_COMPLETION_TOKENS ?? 1600) || 1600);

/** Keep each insight message short enough to be readable on mobile */
const MAX_MESSAGE_CHARS = 320;

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
    const quoted = fixed.match(/"(?:✅|🔥|⚠️|ℹ️)[^"]*"/g);
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

  // Never return debug payloads to the client (can include numeric SG or other sensitive data).
  const { raw_payload, ...rest } = insights ?? {};

  return {
    ...rest,
    messages: messages.slice(0, visibleCount),
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
    const insights = await generateInsights(roundId, userId, entitlements);
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
  noWeaknessMode: boolean;
  msg1Emoji: '🔥' | '✅';
  msg2Emoji: '🔥' | '✅' | '⚠️';
  residualNote: string | null;
}

const SG_LABELS: Record<SGComponentName, string> = {
  off_tee: 'Off the Tee',
  approach: 'Approach',
  putting: 'Putting',
  penalties: 'Penalties',
  short_game: 'Short Game',
};

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

  const shouldUseShortGame =
    sgResidual != null &&
    sgResidual <= thresholds.shortGame &&
    (sgOffTee ?? 0) >= thresholds.weakness &&
    (sgApproach ?? 0) >= thresholds.weakness &&
    (sgPutting ?? 0) >= thresholds.weakness &&
    (sgPenalties ?? 0) >= thresholds.weakness;
  if (shouldUseShortGame) {
    components.push({ name: 'short_game', value: sgResidual, label: SG_LABELS.short_game });
  }

  if (components.length < 2) return null;

  // Step 2: Find worst component (most negative < threshold)
  const negatives = components.filter(c => c.value < thresholds.weakness);
  const noWeaknessMode = negatives.length === 0;
  let worstComponent: SGComponent | null = null;
  if (!noWeaknessMode) {
    worstComponent = negatives.reduce((min, c) => c.value < min.value ? c : min, negatives[0]);
  }

  // Step 3: Find best component (exclude worst)
  const remainingForBest = worstComponent
    ? components.filter(c => c.name !== worstComponent!.name)
    : components;
  let bestComponent = remainingForBest.reduce((max, c) => c.value > max.value ? c : max, remainingForBest[0]);

  // Step 4: Find second-best component (exclude best and worst)
  const remainingForSecond = components.filter(
    c => c.name !== bestComponent.name && (worstComponent ? c.name !== worstComponent.name : true)
  );
  const secondBestComponent = remainingForSecond.length > 0
    ? remainingForSecond.reduce((max, c) => c.value > max.value ? c : max, remainingForSecond[0])
    : null;

  // Step 4b: If best is penalties, use second-best for display (we don't want to praise penalties in Message 1)
  if (bestComponent.name === 'penalties' && secondBestComponent) {
    bestComponent = secondBestComponent;
  }

  // Step 5: Assign messages
  const message2Component = noWeaknessMode
    ? (secondBestComponent ?? remainingForSecond[0])
    : worstComponent!;

  if (!message2Component) return null;

  // Emoji logic (based on SG thresholds, but do not surface values in text)
  const totalSG = sgTotal != null ? sgTotal : 0;
  const bestVal = bestComponent.value;

  let msg1Emoji: '🔥' | '✅';
  if (totalSG >= thresholds.exceptional || bestVal >= thresholds.exceptionalComponent) {
    msg1Emoji = '🔥';
  } else {
    msg1Emoji = '✅';
  }
  // Override: if total SG <= below expectations threshold, never use 🔥
  if (totalSG <= thresholds.belowExpectations) {
    msg1Emoji = '✅';
  }

  let msg2Emoji: '🔥' | '✅' | '⚠️';
  if (!noWeaknessMode) {
    // Only use ⚠️ for large weaknesses
    msg2Emoji = message2Component.value <= thresholds.largeWeakness ? '⚠️' : '✅';
  } else {
    msg2Emoji = (totalSG >= thresholds.exceptional || message2Component.value >= thresholds.exceptionalComponent) ? '🔥' : '✅';
    if (totalSG <= thresholds.belowExpectations) msg2Emoji = '✅';
  }

  // Rule: if total SG is negative, Message 2 should be caution.
  if (sgTotal != null && sgTotal < 0) {
    msg2Emoji = '⚠️';
  }

  // Residual note: only used in Message 3 when short-game attribution is active
  let residualNote: string | null = null;
  if (shouldUseShortGame) {
    residualNote = 'Some shots around the green likely contributed today.';
  }

  return {
    best: bestComponent,
    message2: message2Component,
    noWeaknessMode,
    msg1Emoji,
    msg2Emoji,
    residualNote,
  };
}

// ---------------------------------------------------------------------------
// Main generate function
// ---------------------------------------------------------------------------

export async function generateInsights(
  roundId: bigint,
  userId: bigint,
  entitlements?: ViewerEntitlements
) {
  if (!OPENAI_API_KEY) throw new Error('OpenAI API key not configured');
  const effectiveEntitlements = entitlements ?? (await getViewerEntitlements(userId));

  // Check if insights already exist
  const existing = await prisma.roundInsight.findUnique({ where: { roundId } });
  if (existing) {
    if (existing.userId !== userId) {
      throw new Error('Unauthorized');
    }
    return limitInsightsForViewer(existing.insights, effectiveEntitlements);
  }

  // Deduplicate concurrent in-flight requests for the same round
  const key = roundId.toString();
  if (inFlightGenerations.has(key)) {
    const fullInsights = await inFlightGenerations.get(key)!;
    return limitInsightsForViewer(fullInsights, effectiveEntitlements);
  }

  const promise = generateInsightsInternal(roundId, userId).finally(() => {
    inFlightGenerations.delete(key);
  });
  inFlightGenerations.set(key, promise);

  const fullInsights = await promise;
  return limitInsightsForViewer(fullInsights, effectiveEntitlements);
}

async function generateInsightsInternal(roundId: bigint, userId: bigint) {
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

  // ---- Build message assignment instructions for the LLM ----

  const missingStats: string[] = [];
  if (round.advancedStats && round.firHit === null) missingStats.push('FIR');
  if (round.advancedStats && round.girHit === null) missingStats.push('GIR');
  if (round.advancedStats && round.putts === null) missingStats.push('putts');
  if (round.advancedStats && round.penalties === null) missingStats.push('penalties');

  // Build stats nudge (only show ~25% of the time). Only nudge when data is
  // missing or tracking mode limits insight quality, and avoid nagging.
  let statsNudge = '';
  if (shouldNudgeStats) {
    const missingStatsNoteParts: string[] = [];
    if (!round.advancedStats) {
      missingStatsNoteParts.push('You may note that tracking FIR, GIR, putts, and penalties will make insights more precise.');
    }
    if (missingStats.length) {
      missingStatsNoteParts.push(`Consider noting that tracking ${missingStats.join(', ')} next time could sharpen insights.`);
    }
    statsNudge = missingStatsNoteParts.length ? `\nSTATS TRACKING optional. Vary phrasing. ${missingStatsNoteParts.join(' ')}` : '';
  }

  const drillLibrary: Record<SGComponentName | 'general', string[]> = {
    off_tee: [
      'Fairway-finder drill with alignment sticks',
      '3-shot window to a target',
      'Tempo check at 70% and 85% effort',
      'Tee-height consistency drill',
      'Accuracy scoring game (1 point in-play, 2 points center)',
      'Finish-hold drill for balance',
      'Driver/3-wood alternating drill',
      'Narrow-target visualization',
      'Start-line drill with alignment stick',
      'Safe-miss commitment practice',
    ],
    approach: [
      'Distance ladder drill (short/mid/long targets)',
      '9-ball flight drill (fade/straight/draw)',
      '3-2-1 target challenge',
      'Center-of-green focus drill',
      'Front-edge landing practice',
      'Two-club distance comparison',
      'Dispersion tracking drill',
      'Clock drill (50/75/100 yards)',
      'Low-point control with towel',
      'Green-section targeting drill',
    ],
    putting: [
      '3-6-9 ladder drill',
      'Gate drill with tees',
      'Speed control ladder (20/30/40 feet)',
      'Circle drill from 3-4 feet',
      'Lag putting to 3-foot circle',
      '6-foot one-putt challenge',
      'Start-line gate drill',
      'Distance control practice',
      'Downhill/uphill specialty work',
      'Three-foot pressure drill',
    ],
    penalties: [
      'Smart target selection habit',
      'Pre-shot club safety rule',
      'Safe-miss decision practice',
      'Punch-out commitment drill',
      '2-shot planning routine',
      'Penalty-free round goal',
      'Hazard buffer targeting',
      'Conservative line practice',
      'Layup habit on high-risk holes',
      'Safe-side aim rule',
    ],
    general: [
      'Pre-shot routine consistency',
      'Single focus per shot drill',
      '5-ball reflection practice',
      'Conservative targeting round',
      'Tempo count drill',
      'Finish-hold commitment',
      'One swing key for the day',
      'Center-of-green targeting habit',
      'Worst-miss avoidance practice',
    ],
    short_game: [
      'Landing spot drill with towel',
      'Up-and-down challenge',
      'Bump-and-run consistency drill',
      'Pitch distance ladder',
      'One-club trajectory variety',
      'Par-save simulation',
      'Three-landing drill',
      'Pressure up-and-down tracking',
      'Fringe-only proximity practice',
      'Low-point control with tee',
    ],
  };

  const getSampleDrills = (area: SGComponentName | 'general', seed: number, count: number = 2): string[] => {
    const list = drillLibrary[area] || drillLibrary.general;
    const results: string[] = [];
    for (let i = 0; i < count && i < list.length; i++) {
      const idx = Math.abs(seed + i) % list.length;
      if (!results.includes(list[idx])) {
        results.push(list[idx]);
      }
    }
    return results;
  };

  // ---- Build drill suggestions for the prompt ----
  // Deterministic per-round seed so edits don't randomly reshuffle recommendations.
  const drillSeed = Number(roundId % BigInt(9973)) + (totalRounds ?? 0) * 17;

  // ---- Build scenario context ----
  let scenarioContext = '';

  if (isPersonalBest) {
    scenarioContext += '\nSPECIAL PERSONAL BEST. This is the player\'s best score so far. Mention it briefly in Message 1.';
  }

  if (isNearPersonalBest) {
    scenarioContext += '\nSPECIAL NEAR PERSONAL BEST. This round finished within 2 strokes of the player\'s best score. You may mention that briefly in Message 1.';
  }

  if (isFirstAtCourse) {
    scenarioContext += '\nSPECIAL FIRST AT COURSE. This is the first logged round at this course for this user. Mention it briefly only if it adds useful context.';
  }

  if (isReturnAfterBreak) {
    scenarioContext += '\nSPECIAL RETURN AFTER BREAK. This is the first round in 14+ days. Mention it briefly if it helps context.';
  }

  if (handicapTrend === 'improving') {
    scenarioContext += '\nHANDICAP TREND IMPROVING. Handicap has been dropping recently. You may mention this trend briefly.';
  } else if (handicapTrend === 'declining') {
    scenarioContext += '\nHANDICAP TREND DECLINING. Handicap has risen recently. Do NOT mention this.';
  }

  // ---- Build message assignments ----
  let messageAssignments: string;

  if (isEarlyRounds) {
    // Onboarding rounds (1-3) - consistent structure, varied language
    const lastRound = last5Rounds[0];
    let comparisonContext = '';
    if (lastRound && round.score != null && lastRound.score != null) {
      if (round.score < lastRound.score) {
        comparisonContext = 'This score is better than their last round - acknowledge this progress.';
      } else if (round.score > lastRound.score) {
        comparisonContext = 'This score is a bit higher than their last round - frame as building a baseline.';
      } else {
        comparisonContext = 'This score matches their last round - frame as consistency.';
      }
    }

    const drillSuggestions = getSampleDrills('general', drillSeed, 2);

    if (totalRounds === 1) {
      messageAssignments = `MESSAGE ASSIGNMENTS (Round 1 onboarding)

 Message 1 ✅ Welcome insight for their first round.
 - Exactly 3 sentences with clean grammar and proper punctuation. Each sentence must end with a period.
 - Do not use sentence fragments or run-on sentences.
 - Do NOT greet the user or mention the app name (no "Welcome", no "GolfIQ", no "logged").
 - Sentence 1: interpret the performance in a grounded way as a starting point (no hype, no shaming). Keep it tight.
 - Sentence 2: include the score using the compact format embedded in a sentence (e.g., "An 85 (+13) gives us a clear starting point."). Do NOT output the score as a standalone sentence like "85 (+13).".
 - Sentence 3: explain what this establishes (a reference point to measure improvement), without repeating sentence 1 or 2.
 - Keep it golf-centric. Avoid app-y phrasing like "tracked in your history", "summary", or "post-round insights show".
 - Do not label the round as tough or great. There is no baseline yet.
 - A light, friendly tone is OK. Prefer "nice work" or "good start". Avoid overhype words like "awesome", "fantastic", "impressive", or "excellent".
 - If stats are missing, acknowledge they were not tracked (no shaming).
 - If stats are missing, do NOT infer ball striking, course management, consistency, strengths, or weaknesses. Only use the score to frame the baseline.
 - Do not say or imply this is their first time playing this course. At most you may say it is their first round logged.

 Message 2 ✅ Handicap unlock message ONLY.
 - Exactly 3 sentences with clean grammar and proper punctuation. Each sentence must end with a period.
 - Keep this as a progression signal, not onboarding.
 - Do NOT use the words "profile", "dashboard", or "unlock".
 - Do NOT use the words "consistent" or "consistency".
 - Sentence 1: say their performance baseline is forming (one short sentence).
 - Sentence 2: say that after two more rounds their handicap will be calculated.
 - Sentence 3: say that future rounds can be compared against clearer expectations for their game once that baseline exists.
 - Keep it concise and non-repetitive. Do not restate the same handicap fact twice.
 - Do NOT mention weaknesses, "opportunities to gain strokes", or "tighten up scoring" in this message.
 - Do NOT guess at untracked stats.

 Message 3 ℹ️ Recommendation for the next round.
 - Exactly 3 sentences with clean grammar and proper punctuation. Each sentence must end with a period.
 - Sentence 1: start with "Next round focus" in the same sentence and suggest tracking ONE stat next round (choose one of FIR, GIR, putts, penalties). Do NOT make "Next round focus." its own sentence.
 - Sentence 2: tell them exactly what to record (keep it simple and specific).
 - Sentence 3: explain what that stat will help identify next time (one short sentence, golf-centric, confident, no internal terms).
 - Avoid tentative language like "try it once" or "see if it changes the result".
 - Drill ideas you may use or adapt ${drillSuggestions.join(', ')}`;

    } else if (totalRounds === 2) {
      messageAssignments = `MESSAGE ASSIGNMENTS (Round 2 onboarding)

Message 1 ✅ Summary of this round.
- ${comparisonContext}
- Include at least one concrete stat from this round.
- Sentence 3 must say One more round unlocks your handicap.

Message 2 ✅ Note that tracking more stats improves precision.
${statsNudge}

Message 3 ℹ️ Recommendation for the next round.
- Suggest one simple on course focus or practice idea.
- Drill ideas you may use or adapt ${drillSuggestions.join(', ')}`;

    } else {
      messageAssignments = `MESSAGE ASSIGNMENTS (Round 3 onboarding)

Message 1 ✅ Congratulate the user. They now have a handicap.
- Encourage them to check the dashboard to see it.
- Include at least one concrete stat from this round.

Message 2 ✅ Note that logging more rounds improves personalization and trend detection.
${statsNudge}

Message 3 ℹ️ Recommendation for the next round.
- Suggest one simple on course focus or practice idea.
- Drill ideas you may use or adapt ${drillSuggestions.join(', ')}`;
    }

  } else if (sgSelection) {
    // Standard round with SG data
    let { best, message2, noWeaknessMode, msg1Emoji, msg2Emoji, residualNote } = sgSelection;

    const firPct = round.firHit != null && currentCtx.nonPar3Holes > 0
      ? (round.firHit / currentCtx.nonPar3Holes) * 100
      : null;
    const girPct = round.girHit != null && currentCtx.holes > 0
      ? (round.girHit / currentCtx.holes) * 100
      : null;

    // FIR/GIR override suggestions (strong hint but LLM has flexibility)
    let statOverrideHint = '';
    const offTeeLeak = firPct != null
      && message2.name !== 'off_tee'
      && (
        (baselineFirPct != null && firPct <= baselineFirPct - BASELINE_DIFFERENCE_THRESHOLD)
        || firPct <= VERY_LOW_FIR_PCT
      );
    const approachLeak = girPct != null
      && message2.name !== 'approach'
      && (
        (baselineGirPct != null && girPct <= baselineGirPct - BASELINE_DIFFERENCE_THRESHOLD)
        || girPct <= VERY_LOW_GIR_PCT
      );

    if (offTeeLeak) {
      statOverrideHint = '\nSTRONG SUGGESTION: FIR was notably low this round. Consider focusing Message 2 on off-the-tee improvement instead of or in addition to the SG-based area.';
      message2 = { name: 'off_tee', value: -2.0, label: SG_LABELS.off_tee };
      msg2Emoji = '⚠️';
    } else if (approachLeak) {
      statOverrideHint = '\nSTRONG SUGGESTION: GIR was notably low this round. Consider focusing Message 2 on approach play improvement instead of or in addition to the SG-based area.';
      message2 = { name: 'approach', value: -2.0, label: SG_LABELS.approach };
      msg2Emoji = '⚠️';
    }

    const drillArea = !noWeaknessMode ? message2.name : 'general';
    const drillSuggestions = getSampleDrills(drillArea, drillSeed, 2);

    // Short game special instructions
    let shortGameInstructions = '';
    if (message2.name === 'short_game') {
      shortGameInstructions = `
- SHORT GAME FOCUS. This is inferred from scoring patterns. It is not directly measured.
- Phrase with uncertainty such as the data suggests short game touch may have been a factor.
- Do not compare short game to recent averages. We do not track it directly.
- Do not mention residual or strokes gained numbers.`;
    }

    messageAssignments = `MESSAGE ASSIGNMENTS (Standard round with SG driven analysis)

Message 1 ${msg1Emoji} Positive anchor on ${best.label}.
- Include at least one concrete round stat.
- If the round was below expectations or worse, acknowledge that plainly and then anchor to the best area.
- Do not mention penalties in Message 1. If penalties was best, use score, to par, FIR, GIR, or putts instead.
${scenarioContext}

Message 2 ${msg2Emoji} Main opportunity on ${message2.label}.
- If total SG is negative, this message must be ⚠️ and must point to a likely reason based on the data.
- Use uncertainty language. The data suggests. Likely. May indicate.
- Compare to recent averages only when meaningful. Meaningful means at least 2 strokes score difference, at least 2 putts difference, at least 8 percentage points FIR or GIR difference, or at least 1 penalty difference.${shortGameInstructions}${statOverrideHint}
${statsNudge}

Message 3 ℹ️ Recommendation aligned to Message 2.
- Give one specific habit or drill to try next round.
- No breathing tips. No equipment changes. No swing changes.
- Drill ideas you may use or adapt ${drillSuggestions.join(', ')}
${residualNote ? `- You may reference short game touch with uncertainty.` : ''}`;

  } else if (hasSGData && totalSG != null) {
    // Limited SG data
    const drillSuggestions = getSampleDrills('general', drillSeed, 2);

    messageAssignments = `MESSAGE ASSIGNMENTS (Limited SG data)

Message 1 ✅ Summary anchored to one concrete stat.
- Include the score and one additional stat if available.
${scenarioContext}

Message 2 ✅ Main opportunity based on tracked stats.
- Use uncertainty language and avoid over attribution.
- Compare to recent averages only when meaningful.
${statsNudge}

Message 3 ℹ️ Recommendation for the next round.
- Give one simple habit or drill.
- Drill ideas you may use or adapt ${drillSuggestions.join(', ')}`;

  } else {
    // Minimal data - no SG
    const drillSuggestions = getSampleDrills('general', drillSeed, 2);

    messageAssignments = `MESSAGE ASSIGNMENTS (Minimal data)

Message 1 ✅ Summary of the score.
- Do not label the round as good or bad without a baseline.
- Include any available stats.
${scenarioContext}

Message 2 ✅ Note what extra tracking would most improve the next insight.
${statsNudge}

Message 3 ℹ️ Recommendation for the next round.
- Give one simple habit or drill.
- Drill ideas you may use or adapt ${drillSuggestions.join(', ')}`;
  }

  // ---- Confidence/partial analysis instructions ----

  let confidenceInstructions = '';
  if (partialAnalysis) {
    confidenceInstructions = `\nCONFIDENCE NOTE: This round has partial analysis. Do NOT attribute specific performance differences to individual SG components. Focus on overall round trends.`;
  }

  // ---- Course difficulty instructions ----

  let courseDifficultyInstructions = '';
  if (mentionCourseDifficulty) {
    courseDifficultyInstructions = `\nCOURSE DIFFICULTY: This course can play tough. You may mention that briefly in Message 1 for context.`;
  } else {
    courseDifficultyInstructions = `\nCOURSE DIFFICULTY: Do NOT mention course difficulty.`;
  }

  // ---- Performance band instructions ----

  let performanceBandInstructions = '';
  if (totalSG != null && totalSG <= sgThresholds.toughRound) {
    performanceBandInstructions = `\nPERFORMANCE BAND: TOUGH ROUND
- This was a difficult day. Acknowledge it plainly in Message 1.
- Message 1 should include one genuine bright spot backed by a concrete stat.
- Avoid motivational filler and minimization.
- Message 2 should state the main struggle and why it mattered.`;
  } else if (totalSG != null && totalSG > sgThresholds.toughRound && totalSG <= sgThresholds.belowExpectations) {
    performanceBandInstructions = `\nPERFORMANCE BAND: BELOW EXPECTATIONS
- This round was below typical but not disastrous.
- Keep Message 1 balanced - avoid enthusiastic praise or strong descriptors.
- Use neutral positive language like "held up," "one area that worked," or "something to build on."
- Frame improvements as fine-tuning opportunities, not dramatic changes.
- Don't over-praise individual stats when the overall was underwhelming.
- AVOID in Message 1: "great job," "excellent," "fantastic," "impressive," "solid," "solid performance," "solid touch," "solid foundation," "strong," "really well," "positive step," "highlight," "stood out," "contributing positively."
- AVOID in Message 2: "significant difference," "major impact," "dramatically improve."
- PREFER: "steady," "held up," "one bright spot," "something to build on," "room to gain strokes."`;
  } else if (totalSG != null && totalSG > sgThresholds.belowExpectations && totalSG <= sgThresholds.aboveExpectations) {
    performanceBandInstructions = `\nPERFORMANCE BAND: WITHIN EXPECTATIONS
- This was a typical round - not exceptional, not poor.
- Use balanced language: "steady," "consistent," "nice" rather than superlatives.
- Keep comparisons to averages subdued.
- Message 2 should frame improvement areas as fine-tuning, not problems.`;
  } else if (totalSG != null && totalSG > sgThresholds.aboveExpectations && totalSG < sgThresholds.exceptional) {
    performanceBandInstructions = `\nPERFORMANCE BAND: ABOVE EXPECTATIONS
- This was a good round.
- Strong positive language is appropriate.
- Still acknowledge improvement areas constructively in Message 2.`;
  } else if (totalSG != null && totalSG >= sgThresholds.exceptional) {
    performanceBandInstructions = `\nPERFORMANCE BAND: EXCEPTIONAL
- This was an outstanding round! Full celebration is appropriate.
- Use enthusiastic language in Message 1.
- Message 2 can still mention an area to maintain or fine-tune.`;
  }

  // ---- Build system prompt ----

  const systemPrompt = `You are a golf performance analyst inside GolfIQ. Explain what happened and why, based strictly on the provided data.

OUTPUT FORMAT (strict):
- Return EXACTLY 3 lines of plain text (no JSON)
- Line 1 = Message 1, Line 2 = Message 2, Line 3 = Message 3
- Each line must start with its assigned emoji (🔥, ✅, ⚠️, or ℹ️) followed by a single space
- Each line must be EXACTLY 3 sentences (3 complete thoughts)
- The 3 sentences must not repeat the same fact. Sentence 2 must add new information beyond sentence 1. Sentence 3 must add a next step or implication beyond sentence 2.
- Grammar must be clean. Each of the 3 sentences must end with a period.
- Each line (excluding the leading emoji and space) must be <= ${MAX_MESSAGE_CHARS} characters
- Inside each message line (after the emoji), NEVER use ":" ";" "--" "—" or "–"
- Plain text only. Do not use markdown

CRITICAL RULES:
- NEVER mention penalties in Message 1, even if penalties was the strongest SG component
- If penalties is the best area, talk about FIR, putts, or overall score instead in Message 1
- Each message MUST be exactly 3 sentences (not 2, not 4+)
- Message 1 must NEVER be ⚠️ or ℹ️ (it must be ✅ or 🔥)
- If total SG for the round is negative, Message 2 must be ⚠️

${isScoreOnlyRound ? `SCORE-ONLY ROUND RULES:
- The user did NOT track FIR, GIR, putts, or penalties for this round.
- Do NOT claim anything about ball striking, course management, consistency, strengths, weaknesses, or specific areas of the game.
- You MAY interpret the score and use it to frame a baseline/starting point.
- You MAY mention progression milestones (handicap after enough rounds) and suggest tracking ONE stat next round.
` : ''}

EMOJI RULES:
- 🔥 = exceptional round (total SG >= ${sgThresholds.exceptional.toFixed(1)}) OR exceptional single component (a single component >= ${sgThresholds.exceptionalComponent.toFixed(1)}, especially putting)
- ✅ = positive anchor or strength
- ⚠️ = weakness or the largest area to improve
- ℹ️ = actionable recommendation (Message 3 only)
- 🔥 is FORBIDDEN when total SG <= ${sgThresholds.belowExpectations.toFixed(1)}

TONE:
- Strictly factual and grounded in the data
- Never invent or exaggerate data. Only use what is provided
- Avoid generic encouragement and filler. No "keep it up", "stay patient", "trust the process"
- Use exclamation marks only for exceptional performance
- Do NOT suggest equipment changes or swing changes
- Do NOT suggest breathing tips
- Avoid absolutes like "always" or "never"
- If using hypotheticals, keep them modest (around 2 strokes) and avoid precise claims
- Do NOT include any strokes gained numbers
- Use historical comparisons only when meaningful
- Include at least one concrete round stat (score, score vs par, putts, FIR/GIR, penalties) in Message 1 or 2 when available
 - In Round 1 onboarding, prefer the compact score format like "85 (+13)" and keep interpretation short.
- Numeric comparisons are OK for round stats (score, putts, FIR/GIR, penalties), but NEVER use numeric strokes gained values
- Do NOT mention penalties in Message 1; use score/to-par, FIR/GIR, or putts instead
- If referencing short game from residual, label it as inferred or suggested, not certain
- SG component values between -${Math.abs(sgThresholds.weakness).toFixed(1)} and +${Math.abs(sgThresholds.weakness).toFixed(1)} are expected variance. Never frame that range as a weakness
- IMPORTANT: Vary your phrasing across rounds. Do not reuse the same sentence structures repeatedly.
- Never mention internal field or key names from the input JSON.
- FORBIDDEN phrases anywhere: "to_par", "to par", "par phrase", "score_display", "par_phrase".
- If you reference par, use natural golf phrasing like "85 (+13)", "13 over par", "even par", or "2 under par".
- Do not guess performance in an untracked stat. If a stat is null, only say it was not tracked and how that limits attribution.${confidenceInstructions}${courseDifficultyInstructions}${performanceBandInstructions}`;

  // ---- Build user prompt ----

  const userPrompt = `Generate 3 post-round insights for this round.

${messageAssignments}

 ROUND DATA:
${JSON.stringify(payloadForLLM, null, 2)}`;

  // ---- Call OpenAI API ----

  const openaiResult = await callOpenAI({
    apiKey: OPENAI_API_KEY,
    model: OPENAI_MODEL,
    systemPrompt,
    userPrompt,
    maxOutputTokens: OPENAI_MAX_COMPLETION_TOKENS,
    temperature: OPENAI_TEMPERATURE,
  });
  const content = openaiResult.text;

  // ---- Parse response into structured format ----

  const parseJsonMessages = (raw: string): string[] | null => {
    const trimmed = raw.trim();
    const candidates: string[] = [trimmed];

    // Strip common wrappers like ```json ... ```
    const fenceMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
    if (fenceMatch?.[1]) candidates.push(fenceMatch[1].trim());

    // Attempt to extract first JSON object in the text
    const objMatch = trimmed.match(/\{[\s\S]*\}/);
    if (objMatch?.[0]) candidates.push(objMatch[0].trim());

    const normalizeJsonLike = (s: string) => {
      // Common failure mode: the model tries to avoid ":" and emits `"messages".[`
      // which is not valid JSON.
      return s
        .replace(/"messages"\s*\.\s*\[/gi, '"messages":[')
        .replace(/"messages"\s*=\s*\[/gi, '"messages":[');
    };

    for (const candidate of candidates) {
      try {
        const parsed = JSON.parse(candidate);
        const messages = parsed?.messages;
        if (Array.isArray(messages) && messages.every((m) => typeof m === 'string')) {
          return messages;
        }
      } catch {
        // ignore
      }

      // Try again with small repairs.
      try {
        const repaired = normalizeJsonLike(candidate);
        const parsed = JSON.parse(repaired);
        const messages = parsed?.messages;
        if (Array.isArray(messages) && messages.every((m) => typeof m === 'string')) {
          return messages;
        }
      } catch {
        // ignore
      }
    }

    // Last resort: extract quoted emoji-prefixed messages from malformed JSON-ish output.
    const quoted = normalizeJsonLike(trimmed).match(/"(?:✅|🔥|⚠️|ℹ️)[^"]*"/g);
    if (quoted && quoted.length >= 3) {
      return quoted.slice(0, 3).map((s) => s.slice(1, -1));
    }

    return null;
  };

  const parsedMessages = parseJsonMessages(content);
  const lines = (parsedMessages ?? content.split('\n'))
    .map((line: string) => line.trim())
    .filter((line: string) => line.length > 0);

  // ---- Post-processing helpers ----

  const stripBannedPunctuation = (text: string) => {
    return text
      .replace(/[—–]/g, '-') // no em/en dashes
      .replace(/--+/g, '-') // no double hyphen
      .replace(/[:;]/g, '.') // no colon or semicolon in message text
      .replace(/\s+/g, ' ')
      .trim();
  };

  // Replace banned phrases that LLM might still use despite AVOID instructions
  const replaceBannedPhrases = (text: string) => {
    const replacements: [RegExp, string][] = [
      // Internal key names / awkward technical phrasing
      [/\bto_par\b/gi, ''],
      [/\btoPar\b/g, ''],
      [/\bpar phrase\b/gi, 'par'],
      // App-documentation-y phrasing (keep it golf-centric)
      [/\btracked in your history\b/gi, 'saved'],
      [/\bis now tracked\b/gi, 'is saved'],
      [/\bthis summary captures\b/gi, 'this highlights'],
      [/\bthese insights show\b/gi, 'this gives us a starting point'],
      [/\bpost[- ]round insights\b/gi, 'feedback'],
      [/\bthe score shows\b/gi, 'you shot'],
      [/\ba solid base\b/gi, 'a starting point'],
      // "solid" variations
      [/\bsolid foundation\b/gi, 'something to build on'],
      [/\bgreat foundation\b/gi, 'something to build on'],
      [/\bsolid performance\b/gi, 'steady effort'],
      [/\bsolid touch\b/gi, 'good feel'],
      [/\bsolid control\b/gi, 'good control'],
      [/\bsolid effort\b/gi, 'steady effort'],
      [/\bsolid round\b/gi, 'decent round'],
      // Overly positive phrases
      [/\bgreat job\b/gi, 'nice work'],
      [/\bcontributing positively\b/gi, 'helping'],
      [/\ba highlight\b/gi, 'a bright spot'],
      [/\bwas a highlight\b/gi, 'held up well'],
      [/\bstood out\b/gi, 'held up'],
      // Generic encouragement / filler (keep it factual)
      [/\bkeep pushing forward\b/gi, 'keep going'],
      [/\bstay motivated\b/gi, 'stay consistent'],
      [/\btrust the process\b/gi, 'track the result'],
      [/\bstay patient with the process\b/gi, 'track the result'],
      [/\bkeep it up\b/gi, ''],
      [/\bkeep it simple\b/gi, 'keep it focused'],
      [/\bkeep building\b/gi, 'build on'],
      [/\byou’ve got this\b/gi, ''],
      [/\byou got this\b/gi, ''],
      // "significantly" variations (too dramatic for below-expectations)
      [/\bsignificantly enhance\b/gi, 'help improve'],
      [/\bsignificantly improve\b/gi, 'help improve'],
      [/\bsignificant improvement\b/gi, 'some improvement'],
      [/\bsignificant difference\b/gi, 'a difference'],
      // "opportunity to gain strokes" language (too SG-coded / can be unsupported when stats are missing)
      [/\bbiggest opportunity to gain strokes\b/gi, ''],
      [/\bbiggest opportunity\b/gi, ''],
      [/\bclearest place to tighten up scoring\b/gi, ''],
    ];
    let result = text;
    for (const [pattern, replacement] of replacements) {
      result = result.replace(pattern, replacement);
    }
    return result;
  };

  const replaceWeirdParWording = (text: string) => {
    // Undo LLM-internal phrasing like "to par 2" or "par phrase ...". Keep it golf-natural.
    let result = text;
    result = result.replace(/\bpar phrase of\s*/gi, '');
    result = result.replace(/\bpar phrase\b/gi, '');
    // Fix "a 13 strokes over par" after removing "par phrase"
    result = result.replace(/\ba\s+(\d+)\s+strokes?\s+(over|under)\s+par\b/gi, (_m, n, dir) => {
      const abs = Number(n);
      if (!Number.isFinite(abs) || abs <= 0) return `${formatToParPhrase(toPar)}`;
      return dir.toLowerCase() === 'under' ? `${abs} under par` : `${abs} over par`;
    });
    // Replace "to par <num>" patterns with "(+/-X)"
    result = result.replace(/\bto par\s*(-?\d+)\b/gi, (_m, n) => `(${formatToParShort(Number(n))})`);
    // Replace bare "to par" with a natural phrase using the real round value.
    result = result.replace(/\bto par\b/gi, formatToParPhrase(toPar));
    return result.replace(/\s+/g, ' ').trim();
  };

  const splitSentences = (text: string) => {
    const trimmed = text.replace(/\s+/g, ' ').trim();
    if (!trimmed) return [];

    // Replace decimal numbers temporarily to avoid splitting on decimal points
    const placeholder = '\u0000DEC\u0000';
    const decimalPattern = /(\d)\.(\d)/g;
    const protected_ = trimmed.replace(decimalPattern, `$1${placeholder}$2`);

    const restore = (s: string) => s.replace(new RegExp(placeholder, 'g'), '.').trim();

    const punctParts = protected_.match(/[^.!?]+[.!?]+|[^.!?]+$/g);
    const punct = (punctParts ?? []).map(restore).filter(Boolean);
    if (punct.length >= 2) return punct;

    // Heuristic split when the model omits punctuation (common for nano).
    // We only split on a small set of "sentence starter" words to reduce bad breaks.
    const starters = [
      'You',
      'This',
      'These',
      'As',
      'After',
      'Before',
      'Next',
      'Try',
      'For',
      'With',
      'Tracking',
      'Log',
      'Logging',
      'Keep',
      'On',
    ];
    const boundary = new RegExp(`\\s+(?=(?:${starters.join('|')})\\b)`, 'g');
    const rough = protected_.split(boundary).map(restore).filter(Boolean);
    if (rough.length >= 2) return rough;

    // Last-resort: split a long run-on into 3 chunks on whitespace.
    if (protected_.length >= 180) {
      const idx1 = Math.floor(protected_.length / 3);
      const idx2 = Math.floor((protected_.length * 2) / 3);

      const findSplit = (target: number) => {
        let left = target;
        let right = target;
        while (left > 0 || right < protected_.length - 1) {
          if (left > 0 && /\s/.test(protected_[left])) return left;
          if (right < protected_.length - 1 && /\s/.test(protected_[right])) return right;
          left -= 1;
          right += 1;
        }
        return target;
      };

      const s1 = findSplit(idx1);
      const s2 = findSplit(idx2);

      const chunks = [
        protected_.slice(0, s1),
        protected_.slice(s1, s2),
        protected_.slice(s2),
      ].map(restore).map((s) => s.trim()).filter(Boolean);

      if (chunks.length >= 2) return chunks;
    }

    return [restore(protected_)];
  };

  const normalizeEmoji = (line: string) => {
    return line
      .replace(/âœ…/g, '✅')
      .replace(/âš ï¸/g, '⚠️')
      .replace(/â„¹ï¸/g, 'ℹ️')
      .replace(/ðŸ”¥/g, '🔥');
  };

  const ensureThreeSentences = (line: string, index: number) => {
    const normalizedLine = normalizeEmoji(line);
    const match = normalizedLine.match(/^(🔥|✅|⚠️|ℹ️)\s*(.*)$/);
    if (!match) return line;

    const emoji = match[1];
    const stripTrailingTerminator = (s: string) => s.replace(/[.!?]+$/g, '').trim();

    const normalizeSentence = (s: string) => {
      let out = stripBannedPunctuation(s);
      out = out.replace(/^\s*[-,]+\s*/g, '').trim();
      if (!out) return '';

      // Fix common fragment patterns (keep it minimal and generic).
      // Example bad output: "Guide where to focus next round."
      out = out.replace(/^guide where\b/i, 'Use this to guide where');
      out = out.replace(/^guide\b/i, 'Use this to guide');

      // Normalize "aim ..." -> "Aim ..."
      out = out.replace(/^([a-z])/, (m) => m.toUpperCase());

      // Always end with a period for consistent, clean UI rendering.
      if (!/[.!?]$/.test(out)) out = `${out}.`;
      out = out.replace(/[!?]$/g, '.');
      out = out.replace(/\.\s*\./g, '.');
      return out.replace(/\s+/g, ' ').trim();
    };

    const splitClause = (sentence: string): [string, string] | null => {
      const base = stripTrailingTerminator(sentence);
      if (base.length < 90) return null;

      const mid = Math.floor(base.length / 2);
      const patterns = [
        /\bbut\b/gi,
        /\band\b/gi,
        /\bso\b/gi,
        /\bbecause\b/gi,
        /,\s+/g,
      ];

      let bestIdx: number | null = null;
      let bestDist = Number.POSITIVE_INFINITY;

      for (const re of patterns) {
        for (const m of base.matchAll(re)) {
          const idx = (m.index ?? -1);
          if (idx <= 0 || idx >= base.length - 1) continue;
          const dist = Math.abs(idx - mid);
          if (dist < bestDist) {
            bestDist = dist;
            bestIdx = idx;
          }
        }
      }

      if (bestIdx == null) return null;

      const left = base.slice(0, bestIdx).trim();
      const right = base.slice(bestIdx).replace(/^[,]\s*/g, '').replace(/^(and|but|so|because)\s+/i, '').trim();
      if (left.length < 25 || right.length < 25) return null;
      return [left, right];
    };

    let body = match[2].trim();
    // Apply these again defensively because we call ensureThreeSentences after other maps.
    body = replaceWeirdParWording(replaceBannedPhrases(stripBannedPunctuation(body)));

    // Round 1: never mention par/to-par. If the model slips, strip the scoring-relative phrase.
    if (totalRounds === 1) {
      body = body
        .replace(/\bon a par\s*\d+\s*(course)?\b/gi, '')
        .replace(/\bpar\s*\d+\b/gi, '')
        .replace(/\bto\s*par\b/gi, '')
        .replace(/\beven par\b/gi, '')
        .replace(/\b\d+\s+strokes?\s+(over|under)\s+par\b/gi, '')
        .replace(/\s+/g, ' ')
        .trim();
    }

    const sentencesRaw = splitSentences(body);
    const sentences = sentencesRaw.map(normalizeSentence).filter(Boolean);

    // If the model fails to produce 3 distinct sentences, we add a short, relevant
    // fallback sentence rather than repeating the same idea.
    const fallbackSentencesByIndex: Record<number, string[]> = {
      0: [
        'As you log more rounds, these insights can compare this score to your own baseline.',
        'With more tracked stats, these insights can be more specific about what moved your score.',
      ],
      1: [
        totalRounds <= 2
          ? 'After your third round, your handicap will be calculated.'
          : 'Tracking a couple more stats next time can make this more specific.',
        'Tracking FIR, GIR, putts, and penalties can make these insights more precise.',
      ],
      2: [
        'Track it for the full round so the next feedback can be more specific.',
        'This single stat helps us spot scoring patterns and target the next focus.',
      ],
    };

    const fallbacks = fallbackSentencesByIndex[index] ?? fallbackSentencesByIndex[2];

    const isTooSimilar = (a: string, b: string) => {
      const normalize = (s: string) => s.replace(/[^a-z0-9\s]/gi, '').toLowerCase();
      const aWords = normalize(a).split(/\s+/).filter(Boolean);
      const bWords = normalize(b).split(/\s+/).filter(Boolean);
      if (!aWords.length || !bWords.length) return false;

      const toBigrams = (words: string[]) => {
        const result: string[] = [];
        for (let i = 0; i < words.length - 1; i += 1) {
          result.push(`${words[i]} ${words[i + 1]}`);
        }
        return result;
      };

      const aTokens = new Set(aWords);
      const bTokens = new Set(bWords);
      let tokenOverlap = 0;
      for (const t of aTokens) if (bTokens.has(t)) tokenOverlap += 1;
      const tokenJaccard = tokenOverlap / (aTokens.size + bTokens.size - tokenOverlap);

      const aBigrams = new Set(toBigrams(aWords));
      const bBigrams = new Set(toBigrams(bWords));
      let bigramOverlap = 0;
      for (const t of aBigrams) if (bBigrams.has(t)) bigramOverlap += 1;
      const bigramJaccard = aBigrams.size && bBigrams.size
        ? bigramOverlap / (aBigrams.size + bBigrams.size - bigramOverlap)
        : 0;

      return tokenJaccard >= 0.45 || bigramJaccard >= 0.3;
    };

    const normalized: string[] = [];

    for (const sentence of sentences) {
      if (normalized.length >= 3) break;
      if (normalized.some(existing => isTooSimilar(existing, sentence))) continue;
      normalized.push(sentence);
    }

    // If we still have fewer than 3 sentences, prefer splitting an existing long sentence
    // instead of injecting generic filler.
    while (normalized.length < 3) {
      const longestIndex = normalized.reduce((bestI, cur, i, arr) => (arr[i].length > arr[bestI].length ? i : bestI), 0);
      const candidate = normalized[longestIndex];
      const split = splitClause(candidate);
      if (!split) break;
      const left = normalizeSentence(split[0]);
      const right = normalizeSentence(split[1]);
      if (!left || !right) break;
      normalized.splice(longestIndex, 1, left, right);
      // De-dupe again after splitting.
      for (let i = 0; i < normalized.length; i += 1) {
        for (let j = i + 1; j < normalized.length; j += 1) {
          if (isTooSimilar(normalized[i], normalized[j])) {
            normalized.splice(j, 1);
            j -= 1;
          }
        }
      }
      if (normalized.length > 3) {
        normalized.length = 3;
      }
    }

    const contains = (s: string, needle: string) => s.toLowerCase().includes(needle);
    const existingContains = (needle: string) => normalized.some((s) => contains(s, needle));

    for (const candidate of fallbacks) {
      if (normalized.length >= 3) break;

      // Avoid obvious repeats when we have to add fallback sentences.
      if (contains(candidate, 'handicap') && existingContains('handicap')) continue;
      if (contains(candidate, 'track') && existingContains('track')) continue;
      if ((contains(candidate, 'fir') || contains(candidate, 'gir')) && (existingContains('fir') || existingContains('gir'))) continue;

      const normalizedCandidate = normalizeSentence(candidate);
      if (!normalizedCandidate) continue;
      if (normalized.some((existing) => isTooSimilar(existing, normalizedCandidate))) continue;
      normalized.push(normalizedCandidate);
    }

    while (normalized.length < 3) {
      const candidate = index === 2
        ? 'Measure it next round and adjust from there.'
        : 'This will be clearer once more tracked data is available.';
      const normalizedCandidate = normalizeSentence(candidate);
      if (!normalizedCandidate) {
        normalized.push('Log another round to add context.');
        continue;
      }
      if (!normalized.some((existing) => isTooSimilar(existing, normalizedCandidate))) {
        normalized.push(normalizedCandidate);
      } else {
        normalized.push(normalizeSentence('Log another round to add context.'));
      }
    }

    // Fix common nano pattern where it emits fragments like:
    // "Next round focus." "Track putts." "Record the total number of putts for the round."
    if (index === 2 && normalized.length >= 2) {
      const s0 = stripTrailingTerminator(normalized[0]).toLowerCase();
      const s1 = stripTrailingTerminator(normalized[1]).toLowerCase();
      if (s0 === 'next round focus' && s1.startsWith('track ')) {
        const stat = s1.replace(/^track\s+/i, '').trim();
        normalized[0] = normalizeSentence(`Next round focus is to track ${stat}`);
        // Make sentence 2 more specific when it is just "Track <stat>."
        if (/^track\s+\w+\.?$/i.test(stripTrailingTerminator(normalized[1]))) {
          normalized[1] = normalizeSentence(`Record the total ${stat} for the round`);
        }
      }
    }

    // If the model outputs a standalone score sentence like "85 (+13).", merge it into the previous sentence.
    for (let i = 1; i < normalized.length; i += 1) {
      const raw = stripTrailingTerminator(normalized[i]).trim();
      if (/^\d+\s*\([+-]?\d+\)$/.test(raw)) {
        const merged = `${stripTrailingTerminator(normalized[i - 1])} ${raw}`.trim();
        normalized[i - 1] = normalizeSentence(merged);
        normalized.splice(i, 1);
        i -= 1;
      }
    }

    // Note: we intentionally do not hard-force a specific handicap sentence anymore.
    // Round 1/Message 2 is now framed as progression (not setup), so we rely on prompt constraints.

    // If we somehow have more than 3, merge extras into the 3rd sentence without
    // turning it into multiple sentences.
    while (normalized.length > 3) {
      const merged = `${stripTrailingTerminator(normalized[2])} ${stripTrailingTerminator(normalized[3])}`.trim();
      normalized.splice(2, 2, normalizeSentence(merged));
    }

    const rebuilt = normalized.slice(0, 3).join(' ').replace(/\s+/g, ' ').trim();
    return `${emoji} ${rebuilt}`;
  };

  const enforceMaxChars = (line: string) => {
    const normalizedLine = normalizeEmoji(line);
    const match = normalizedLine.match(/^(🔥|✅|⚠️|ℹ️)\s*(.*)$/);
    if (!match) return line;
    const emoji = match[1];
    let body = match[2].trim();

    if (body.length <= MAX_MESSAGE_CHARS) return `${emoji} ${body}`;

    // Prefer trimming the last sentence first to preserve the earlier thoughts.
    const sentences = splitSentences(body);
    while (sentences.length > 1 && sentences.join(' ').length > MAX_MESSAGE_CHARS) {
      sentences.pop();
    }
    body = sentences.join(' ').trim();

    if (body.length > MAX_MESSAGE_CHARS) {
      body = body.slice(0, MAX_MESSAGE_CHARS).trim();
      body = body.replace(/\s+\S*$/, '').trim(); // avoid ending mid-word
      if (!/[.!?]$/.test(body)) body = `${body}.`;
    }

    return `${emoji} ${body}`;
  };

  const allowExclamations =
    (totalSG != null && totalSG >= sgThresholds.exceptional) ||
    [sgComponents?.sgOffTee, sgComponents?.sgApproach, sgComponents?.sgPutting, sgComponents?.sgPenalties].some(
      (v) => v != null && Number(v) >= sgThresholds.exceptionalComponent,
    );

  // We generally avoid exclamation marks to keep the tone factual.
  // Exception:
  // - Truly exceptional rounds/components (rule above)
  // - Round 1 onboarding Message 1 may use a single "!" for a friendly welcome
  const stripExclamationsIfNeededByIndex = (line: string, index: number) => {
    const normalizedLine = normalizeEmoji(line);
    const match = normalizedLine.match(/^(🔥|✅|⚠️|ℹ️)\s*(.*)$/);
    if (!match) return line;

    const emoji = match[1];
    const body = match[2];

    const isWelcomeException = totalRounds === 1 && index === 0;
    if (allowExclamations || isWelcomeException) {
      // Collapse repeated exclamations and keep at most one "!" on onboarding welcome.
      let kept = body.replace(/!{2,}/g, '!');
      if (isWelcomeException) {
        let seen = false;
        kept = kept.replace(/!/g, () => {
          if (seen) return '.';
          seen = true;
          return '!';
        });
      }
      return `${emoji} ${kept}`.replace(/\.\s*\./g, '.').replace(/\s+/g, ' ').trim();
    }

    return `${emoji} ${body}`
      .replace(/!/g, '.')
      .replace(/\.\s*\./g, '.')
      .replace(/\s+/g, ' ')
      .trim();
  };

  const stripUnsupportedClaimsForScoreOnly = (line: string, index: number) => {
    if (!isScoreOnlyRound) return line;
    // Message 3 can mention the stat we want them to track next round.
    if (index === 2) return line;

    const normalizedLine = normalizeEmoji(line);
    const match = normalizedLine.match(/^(🔥|✅|⚠️|ℹ️)\s*(.*)$/);
    if (!match) return line;
    const emoji = match[1];
    let body = match[2].trim();

    // With score-only input, we must not imply shot-level truths.
    body = body
      .replace(/\bball[- ]?striking\b/gi, '')
      .replace(/\bcourse management\b/gi, '')
      .replace(/\bgame management\b/gi, '')
      .replace(/\bconsistency\b/gi, '')
      .replace(/\bconsistent\b/gi, '')
      .replace(/\bstrengths?\b/gi, '')
      .replace(/\bweakness(?:es)?\b/gi, '')
      .replace(/\boff[- ]the[- ]tee\b/gi, '')
      .replace(/\bdriving\b/gi, '')
      .replace(/\bapproach(?:es)?\b/gi, '')
      .replace(/\bshort[- ]game\b/gi, '')
      .replace(/\bputting\b/gi, '') // do not attribute putting performance without putts tracked
      .replace(/\bshown across the round\b/gi, '')
      .replace(/\bacross the round\b/gi, '')
      .replace(/\bperformance picture\b/gi, 'baseline')
      .replace(/\s+/g, ' ')
      .replace(/\s+\./g, '.')
      .trim();

    return `${emoji} ${body}`.trim();
  };

  const processedLines = lines
    .slice(0, 3)
    .map(stripBannedPunctuation)
    .map(replaceBannedPhrases)
    .map(replaceWeirdParWording)
    .map((line: string, i: number) => stripUnsupportedClaimsForScoreOnly(line, i));

  const enforceEmojiByIndex = (line: string, index: number) => {
    const normalizedLine = normalizeEmoji(line);
    const match = normalizedLine.match(/^(🔥|✅|⚠️|ℹ️)\s*(.*)$/);
    if (!match) return line;
    let emoji = match[1];
    const body = match[2].trim();

    if (index === 0) {
      // Message 1 is always a positive anchor (never ⚠️ or ℹ️).
      if (emoji === '⚠️' || emoji === 'ℹ️') emoji = '✅';

      // Avoid 🔥 in onboarding or minimal-data situations unless it's truly exceptional.
      // This prevents Round 1 score-only rounds from being over-celebrated.
      const hasTrackedStats =
        round.firHit != null ||
        round.girHit != null ||
        round.putts != null ||
        round.penalties != null;

      const canUseFire =
        hasTrackedStats &&
        (
          (totalSG != null && totalSG >= sgThresholds.exceptional) ||
          [sgComponents?.sgOffTee, sgComponents?.sgApproach, sgComponents?.sgPutting, sgComponents?.sgPenalties].some(
            (v) => v != null && Number(v) >= sgThresholds.exceptionalComponent,
          )
        );

      if (emoji === '🔥' && !canUseFire) emoji = '✅';
    }

    if (index === 1) {
      // Message 2 is analysis (never ℹ️). Use ⚠️ when total SG is negative.
      if (emoji === 'ℹ️') emoji = (totalSG != null && totalSG < 0) ? '⚠️' : '✅';
      if (totalSG != null && totalSG < 0) emoji = '⚠️';
    }

    if (index === 2) {
      // Message 3 is always the recommendation.
      emoji = 'ℹ️';
    }

    return `${emoji} ${body}`;
  };

  const normalizedLines = processedLines
    .map((line: string, i: number) => ensureThreeSentences(line, i))
    .map((line: string, i: number) => stripExclamationsIfNeededByIndex(line, i))
    .map(stripBannedPunctuation)
    .map(enforceMaxChars)
    .map((line: string, i: number) => enforceEmojiByIndex(line, i));

  // Free users see only Message 1 after round 3, but we still generate and store
  // all 3 so an upgrade reveals the rest without regeneration.
  const freeVisibleCount = isEarlyRounds ? 3 : 1;

  const insightsData = {
    messages: normalizedLines,
    generated_at: new Date().toISOString(),
    model: OPENAI_MODEL,
    free_visible_count: freeVisibleCount,
    generation_count: MAX_INSIGHTS,
    includes_numeric_sg: false,
    openai_usage: openaiResult.usage,
    raw_payload: payload,
  };

  // ---- Store in database ----

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

type OpenAICallParams = {
  apiKey: string;
  model: string;
  systemPrompt: string;
  userPrompt: string;
  maxOutputTokens: number;
  temperature: number;
};

type OpenAIUsageSummary = {
  endpoint: 'chat_completions' | 'responses';
  model: string;
  input_tokens: number | null;
  output_tokens: number | null;
  total_tokens: number | null;
  finish_reason: string | null;
  attempts: number;
  max_output_tokens: number;
};

function extractTextFromResponsesApi(data: any): string | null {
  if (typeof data?.output_text === 'string' && data.output_text.trim().length > 0) {
    return data.output_text.trim();
  }

  const outputs = Array.isArray(data?.output) ? data.output : [];
  const parts: string[] = [];

  for (const o of outputs) {
    const content = Array.isArray(o?.content) ? o.content : [];
    for (const c of content) {
      const text = typeof c?.text === 'string' ? c.text : null;
      if (text && text.trim().length > 0) parts.push(text.trim());
    }
  }

  if (parts.length === 0) return null;
  return parts.join('\n').trim();
}

function extractTextFromChatCompletionsApi(data: any): string | null {
  const msg = data?.choices?.[0]?.message;
  const content = msg?.content;

  if (typeof content === 'string') {
    const trimmed = content.trim();
    return trimmed.length > 0 ? trimmed : null;
  }

  // Some newer models may return an array of content parts.
  if (Array.isArray(content)) {
    const parts: string[] = [];
    for (const c of content) {
      const text = typeof c?.text === 'string' ? c.text : null;
      if (text && text.trim().length > 0) parts.push(text.trim());
    }
    const joined = parts.join('\n').trim();
    return joined.length > 0 ? joined : null;
  }

  // Refusals are surfaced separately on some responses.
  const refusal = typeof msg?.refusal === 'string' ? msg.refusal.trim() : '';
  return refusal.length > 0 ? refusal : null;
}

function normalizeUsageFromChat(data: any, maxOutputTokens: number, attempts: number): OpenAIUsageSummary {
  const usage = data?.usage;
  const prompt = typeof usage?.prompt_tokens === 'number' ? usage.prompt_tokens : null;
  const completion = typeof usage?.completion_tokens === 'number' ? usage.completion_tokens : null;
  const total = typeof usage?.total_tokens === 'number' ? usage.total_tokens : null;
  const finishReason = typeof data?.choices?.[0]?.finish_reason === 'string' ? data.choices[0].finish_reason : null;
  const model = typeof data?.model === 'string' ? data.model : 'unknown';

  return {
    endpoint: 'chat_completions',
    model,
    input_tokens: prompt,
    output_tokens: completion,
    total_tokens: total,
    finish_reason: finishReason,
    attempts,
    max_output_tokens: maxOutputTokens,
  };
}

function normalizeUsageFromResponses(data: any, maxOutputTokens: number, attempts: number): OpenAIUsageSummary {
  const usage = data?.usage;
  const input = typeof usage?.input_tokens === 'number' ? usage.input_tokens : null;
  const output = typeof usage?.output_tokens === 'number' ? usage.output_tokens : null;
  const total = typeof usage?.total_tokens === 'number' ? usage.total_tokens : null;
  const model = typeof data?.model === 'string' ? data.model : 'unknown';

  return {
    endpoint: 'responses',
    model,
    input_tokens: input,
    output_tokens: output,
    total_tokens: total,
    finish_reason: null,
    attempts,
    max_output_tokens: maxOutputTokens,
  };
}

async function callOpenAI(params: OpenAICallParams): Promise<{ text: string; usage: OpenAIUsageSummary | null }> {
  const { apiKey, model, systemPrompt, userPrompt, maxOutputTokens, temperature } = params;

  const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` };

  const isGpt5 = model.startsWith('gpt-5');
  const chatCompletionsUrl = 'https://api.openai.com/v1/chat/completions';
  const responsesUrl = 'https://api.openai.com/v1/responses';

  const callChatCompletions = async (opts: {
    maxCompletionTokens: number;
    reasoningEffort?: 'minimal' | 'low' | 'medium' | 'high';
    verbosity?: 'low' | 'medium' | 'high';
    includeTemperature: boolean;
  }) => {
    const body: any = {
      model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      // GPT-5 models use `max_completion_tokens` (not `max_tokens`).
      max_completion_tokens: opts.maxCompletionTokens,
    };

    if (opts.reasoningEffort) body.reasoning_effort = opts.reasoningEffort;
    if (opts.verbosity) body.verbosity = opts.verbosity;
    if (opts.includeTemperature) body.temperature = temperature;

    return fetch(chatCompletionsUrl, { method: 'POST', headers, body: JSON.stringify(body) });
  };

  // ---- GPT-5 models ----
  // In practice, some deployments of the Responses API can return "reasoning"-only output
  // unless text formatting is set exactly right. Chat Completions has been more reliable
  // for gpt-5-nano in this app, so we try it first with a compatible parameter set.
  if (isGpt5) {
    // Models before gpt-5.1 default to medium reasoning and can burn the entire
    // completion budget on reasoning. Use `minimal` to reduce empty responses.
    const chat = await callChatCompletions({
      maxCompletionTokens: maxOutputTokens,
      reasoningEffort: 'minimal',
      verbosity: 'low',
      includeTemperature: false,
    });

    if (chat.ok) {
      const chatData = await chat.json();
      const chatText = extractTextFromChatCompletionsApi(chatData);
      if (chatText) {
        return { text: chatText, usage: normalizeUsageFromChat(chatData, maxOutputTokens, 1) };
      }

      const finishReason = chatData?.choices?.[0]?.finish_reason;
      const usage = chatData?.usage;

      // If we hit the completion limit without producing visible text, retry once with a
      // larger budget. Some GPT-5 reasoning behavior can use a lot of tokens even when
      // the requested output is short.
      if (finishReason === 'length') {
        const retry = await callChatCompletions({
          maxCompletionTokens: Math.min(4096, maxOutputTokens * 3),
          reasoningEffort: 'minimal',
          verbosity: 'low',
          includeTemperature: false,
        });

        if (retry.ok) {
          const retryData = await retry.json();
          const retryText = extractTextFromChatCompletionsApi(retryData);
          if (retryText) {
            return { text: retryText, usage: normalizeUsageFromChat(retryData, Math.min(4096, maxOutputTokens * 3), 2) };
          }
        }
      }

      console.error('OpenAI Chat Completions returned no text (gpt-5):', JSON.stringify({
        id: chatData?.id,
        model: chatData?.model,
        keys: chatData && typeof chatData === 'object' ? Object.keys(chatData) : null,
        choice0: Array.isArray(chatData?.choices) ? chatData.choices[0] : null,
        usage,
      }, null, 2));
    } else {
      const err = await chat.json().catch(() => ({}));
      console.error('OpenAI Chat Completions error (gpt-5):', JSON.stringify(err, null, 2));
    }

    // If Chat Completions didn't work, fall back to the Responses API.
    const response = await fetch(responsesUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model,
        instructions: systemPrompt,
        input: userPrompt,
        max_output_tokens: maxOutputTokens,
        reasoning: { effort: 'minimal' },
        tool_choice: 'none',
        text: {
          verbosity: 'low',
          format: {
            type: 'json_schema',
            name: 'post_round_insights',
            strict: true,
            schema: {
              type: 'object',
              additionalProperties: false,
              required: ['messages'],
              properties: {
                messages: {
                  type: 'array',
                  minItems: 3,
                  maxItems: 3,
                  items: { type: 'string' },
                },
              },
            },
          },
        },
      }),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(`OpenAI API error: ${error.error?.message || 'Unknown error'}`);
    }

    const data = await response.json();
    const text = extractTextFromResponsesApi(data);
    if (!text) {
      console.error('OpenAI Responses API returned no text (gpt-5):', JSON.stringify({
        id: data?.id,
        model: data?.model,
        keys: data && typeof data === 'object' ? Object.keys(data) : null,
        output_count: Array.isArray(data?.output) ? data.output.length : null,
        output_0: Array.isArray(data?.output) ? data.output[0] : null,
        text: data?.text,
      }, null, 2));
      throw new Error('OpenAI returned no content');
    }

    return { text, usage: normalizeUsageFromResponses(data, maxOutputTokens, 1) };
  }

  // Fallback for older chat-completions models.
  const response = await fetch(chatCompletionsUrl, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      // Standard Chat Completions models use `max_tokens`.
      max_tokens: maxOutputTokens,
      temperature,
    }),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(`OpenAI API error: ${error.error?.message || 'Unknown error'}`);
  }

  const data = await response.json();
  const text = extractTextFromChatCompletionsApi(data);
  if (!text) {
    console.error('OpenAI Chat Completions returned no text:', JSON.stringify({
      id: data?.id,
      model: data?.model,
      finish_reason: data?.choices?.[0]?.finish_reason,
      keys: data && typeof data === 'object' ? Object.keys(data) : null,
    }, null, 2));
    throw new Error('OpenAI returned no content');
  }

  return { text, usage: normalizeUsageFromChat(data, maxOutputTokens, 1) };
}
