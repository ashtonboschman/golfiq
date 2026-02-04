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

/** OpenAI model temperature for generation (higher = more variation) */
const OPENAI_TEMPERATURE = 0.65;

/** OpenAI model to use */
const OPENAI_MODEL = 'gpt-4o-mini';

// In-flight generation lock to prevent duplicate OpenAI calls from concurrent requests
const inFlightGenerations = new Map<string, Promise<any>>();

async function getUserSession() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    throw new Error('Unauthorized');
  }
  return BigInt(session.user.id);
}

async function checkPremium(userId: bigint) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { subscriptionTier: true },
  });

  if (user?.subscriptionTier !== 'premium' && user?.subscriptionTier !== 'lifetime') {
    throw new Error('Premium subscription required for AI insights');
  }
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
    if (existingInsights) return NextResponse.json({ insights: existingInsights.insights });

    await checkPremium(userId);

    const insights = await generateInsights(roundId, userId);
    return NextResponse.json({ insights });
  } catch (error: any) {
    console.error('Error fetching insights:', error);
    return NextResponse.json(
      { message: error.message || 'Error fetching insights' },
      { status: error.message === 'Unauthorized' ? 401 : error.message.includes('Premium') ? 403 : 500 }
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

    await checkPremium(userId);

    const insights = await generateInsights(roundId, userId);
    return NextResponse.json({ insights });
  } catch (error: any) {
    console.error('Error generating insights:', error);
    return NextResponse.json(
      { message: error.message || 'Error generating insights' },
      { status: error.message === 'Unauthorized' ? 401 : error.message.includes('Premium') ? 403 : 500 }
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
  largeWeaknessThreshold: number,
): SGSelection | null {
  // Build non-null component array (exclude residual)
  const components: SGComponent[] = [];
  if (sgOffTee != null) components.push({ name: 'off_tee', value: sgOffTee, label: SG_LABELS.off_tee });
  if (sgApproach != null) components.push({ name: 'approach', value: sgApproach, label: SG_LABELS.approach });
  if (sgPutting != null) components.push({ name: 'putting', value: sgPutting, label: SG_LABELS.putting });
  if (sgPenalties != null) components.push({ name: 'penalties', value: sgPenalties, label: SG_LABELS.penalties });

  const shouldUseShortGame =
    sgResidual != null &&
    sgResidual <= SG_SHORT_GAME_THRESHOLD &&
    (sgOffTee ?? 0) >= SG_WEAKNESS_THRESHOLD &&
    (sgApproach ?? 0) >= SG_WEAKNESS_THRESHOLD &&
    (sgPutting ?? 0) >= SG_WEAKNESS_THRESHOLD &&
    (sgPenalties ?? 0) >= SG_WEAKNESS_THRESHOLD;
  if (shouldUseShortGame) {
    components.push({ name: 'short_game', value: sgResidual, label: SG_LABELS.short_game });
  }

  if (components.length < 2) return null;

  // Step 2: Find worst component (most negative < threshold)
  const negatives = components.filter(c => c.value < SG_WEAKNESS_THRESHOLD);
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
  if (totalSG >= SG_EXCEPTIONAL_THRESHOLD || bestVal >= SG_EXCEPTIONAL_COMPONENT_THRESHOLD) {
    msg1Emoji = '🔥';
  } else {
    msg1Emoji = '✅';
  }
  // Override: if total SG <= below expectations threshold, never use 🔥
  if (totalSG <= SG_BELOW_EXPECTATIONS_THRESHOLD) {
    msg1Emoji = '✅';
  }

  let msg2Emoji: '🔥' | '✅' | '⚠️';
  if (!noWeaknessMode) {
    // Only use ⚠️ for large weaknesses
    msg2Emoji = message2Component.value <= largeWeaknessThreshold ? '⚠️' : '✅';
  } else {
    msg2Emoji = (totalSG >= SG_EXCEPTIONAL_THRESHOLD || message2Component.value >= SG_EXCEPTIONAL_COMPONENT_THRESHOLD) ? '🔥' : '✅';
    if (totalSG <= SG_BELOW_EXPECTATIONS_THRESHOLD) msg2Emoji = '✅';
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

export async function generateInsights(roundId: bigint, userId: bigint) {
  if (!OPENAI_API_KEY) throw new Error('OpenAI API key not configured');

  // Check if insights already exist
  const existing = await prisma.roundInsight.findUnique({ where: { roundId } });
  if (existing) return existing.insights;

  // Deduplicate concurrent in-flight requests for the same round
  const key = roundId.toString();
  if (inFlightGenerations.has(key)) {
    return inFlightGenerations.get(key);
  }

  const promise = generateInsightsInternal(roundId, userId).finally(() => {
    inFlightGenerations.delete(key);
  });
  inFlightGenerations.set(key, promise);
  return promise;
}

async function generateInsightsInternal(roundId: bigint, userId: bigint) {
  const round = await prisma.round.findUnique({
    where: { id: roundId },
    include: { tee: { include: { course: { include: { location: true } }, holes: { select: { holeNumber: true, par: true }, orderBy: { holeNumber: 'asc' } } } } },
  });

  if (!round) throw new Error('Round not found');
  if (round.userId !== userId) throw new Error('Unauthorized access to round');

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

  const isPersonalBest = leaderboardStats?.bestScore != null && round.score <= leaderboardStats.bestScore;

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

  // Determine if we should nudge stats tracking (random ~25% of the time)
  const shouldNudgeStats = (Number(roundId) % 4) === 0;

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
  const totalRounds = leaderboardStats?.totalRounds ?? null;
  const isEarlyRounds = totalRounds !== null && totalRounds <= 3;
  const largeWeaknessThreshold = SG_LARGE_WEAKNESS_THRESHOLD;
  const sgSelection = hasSGData
    ? runSGSelection(
        sgComponents.sgOffTee != null ? Number(sgComponents.sgOffTee) : null,
        sgComponents.sgApproach != null ? Number(sgComponents.sgApproach) : null,
        sgComponents.sgPutting != null ? Number(sgComponents.sgPutting) : null,
        sgComponents.sgPenalties != null ? Number(sgComponents.sgPenalties) : null,
        sgComponents.sgResidual != null ? Number(sgComponents.sgResidual) : null,
        sgComponents.sgTotal != null ? Number(sgComponents.sgTotal) : null,
        largeWeaknessThreshold,
      )
    : null;

  // ---- Determine confidence/partial analysis ----

  const confidence = sgComponents?.confidence ?? null;
  const partialAnalysis = sgComponents?.partialAnalysis ?? false;
  const isLowConfidence = confidence === 'low' || confidence === 'medium';

  // ---- Course difficulty context ----

  const courseRating = currentCtx.courseRating;
  const slopeRating = currentCtx.slopeRating;
  const ratingThreshold = currentHolesPlayed === 9 ? currentCtx.parTotal + 0.5 : currentCtx.parTotal + 1;
  const mentionCourseDifficulty = (courseRating != null && courseRating > ratingThreshold) || (slopeRating != null && slopeRating > HIGH_SLOPE_THRESHOLD);

  // ---- Build payload for the LLM ----

  const toPar = round.score - currentCtx.parTotal;
  const totalSG = strokesGainedPayload.total ?? null;

  const payload = {
    round: {
      score: round.score,
      to_par: toPar,
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
      strokes_gained: Object.keys(strokesGainedPayload).length > 0 ? strokesGainedPayload : null,
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
            average_sg: {
              total: avgSgTotal != null ? Math.round(avgSgTotal * 100) / 100 : null,
              off_tee: avgSgOffTee != null ? Math.round(avgSgOffTee * 100) / 100 : null,
              approach: avgSgApproach != null ? Math.round(avgSgApproach * 100) / 100 : null,
              putting: avgSgPutting != null ? Math.round(avgSgPutting * 100) / 100 : null,
              penalties: avgSgPenalties != null ? Math.round(avgSgPenalties * 100) / 100 : null,
              residual: avgSgResidual != null ? Math.round(avgSgResidual * 100) / 100 : null,
            },
          },
          best_score: leaderboardStats?.bestScore ?? null,
          total_rounds: leaderboardStats?.totalRounds ?? null,
          handicap_trend: last5Rounds
            .map((r) => (r.handicapAtRound ? Number(r.handicapAtRound) : null))
            .filter((h) => h !== null)
            .reverse(),
        }
      : null,
    scenarios: {
      is_personal_best: isPersonalBest,
      is_first_at_course: isFirstAtCourse,
      is_return_after_break: isReturnAfterBreak,
      handicap_trend: handicapTrend,
    },
  };

  // ---- Build message assignment instructions for the LLM ----

  const missingStats: string[] = [];
  if (round.advancedStats && round.firHit === null) missingStats.push('FIR');
  if (round.advancedStats && round.girHit === null) missingStats.push('GIR');
  if (round.advancedStats && round.putts === null) missingStats.push('putts');
  if (round.advancedStats && round.penalties === null) missingStats.push('penalties');

  // Build stats nudge (only show ~25% of the time)
  let statsNudge = '';
  if (shouldNudgeStats) {
    const missingStatsNoteParts: string[] = [];
    if (!round.advancedStats) {
      missingStatsNoteParts.push('Consider mentioning that Advanced Stats unlocks deeper analysis.');
    }
    const shouldSuggestHBH = !round.holeByHole && totalRounds !== null && totalRounds % 4 === 0;
    if (shouldSuggestHBH) {
      missingStatsNoteParts.push('You may suggest Hole-by-Hole tracking for richer data.');
    }
    if (missingStats.length) {
      missingStatsNoteParts.push(`Consider noting that tracking ${missingStats.join(', ')} next time could sharpen insights.`);
    }
    statsNudge = missingStatsNoteParts.length ? `\nSTATS TRACKING (optional, vary phrasing): ${missingStatsNoteParts.join(' ')}` : '';
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
    ],
    general: [
      'Pre-shot routine consistency',
      'Single focus per shot drill',
      '5-ball reflection practice',
      'Conservative targeting round',
      'Breathing reset routine',
      'Tempo count drill',
      'Finish-hold commitment',
      'One swing key for the day',
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
  const minuteSeed = new Date().getUTCDate() * 1440 + new Date().getUTCHours() * 60 + new Date().getUTCMinutes();
  const drillSeed = totalRounds !== null
    ? totalRounds + minuteSeed
    : Number(roundId % BigInt(997)) + minuteSeed;

  // ---- Build scenario context ----
  let scenarioContext = '';

  if (isPersonalBest) {
    scenarioContext += '\nSPECIAL: PERSONAL BEST! This is the player\'s best score ever. Celebrate this accomplishment enthusiastically in Message 1. Use strong positive language.';
  }

  if (isFirstAtCourse) {
    scenarioContext += '\nSPECIAL: First round at this course. Acknowledge this milestone briefly (e.g., "first round at this course").';
  }

  if (isReturnAfterBreak) {
    scenarioContext += '\nSPECIAL: Returning after a break (14+ days since last round). Welcome them back to the course warmly.';
  }

  if (handicapTrend === 'improving') {
    scenarioContext += '\nHANDICAP TREND: The player\'s handicap has been dropping. You may mention this positive trend briefly.';
  } else if (handicapTrend === 'declining') {
    scenarioContext += '\nHANDICAP TREND: The player\'s handicap has risen recently. Do NOT mention this - focus on positives and improvement areas.';
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
      messageAssignments = `MESSAGE ASSIGNMENTS (Round 1 - First round onboarding):

Message 1: ✅ Welcome and congratulate the user on logging their FIRST round.
- Celebrate this milestone warmly but not excessively.
- Do NOT label the round as "challenging" or "tough" - no baseline exists yet.
- Include at least one concrete stat from this round (score, to-par, putts, etc.).
- Vary your phrasing - don't always start with "Congrats" or "Welcome."

Message 2: ✅ Encourage logging more rounds to unlock a handicap.
- Explain that 3 rounds unlocks their handicap and deeper insights.
- Keep it motivational and forward-looking.
${statsNudge}

Message 3: ℹ️ Actionable recommendation
- Suggest a simple practice drill or habit to take into the next round.
- Drill inspiration (customize or create your own): ${drillSuggestions.join(', ')}`;

    } else if (totalRounds === 2) {
      messageAssignments = `MESSAGE ASSIGNMENTS (Round 2 - Second round onboarding):

Message 1: ✅ Positive summary of this round.
- ${comparisonContext}
- Include at least one concrete stat from this round.
- Vary your phrasing - don't repeat the same structure as typical first-round messages.

Message 2: ✅ Encourage one more round to unlock their handicap.
- Build anticipation for the handicap calculation.
- Keep it brief and motivational.
${statsNudge}

Message 3: ℹ️ Actionable recommendation
- Suggest a simple practice drill or habit.
- Drill inspiration (customize or create your own): ${drillSuggestions.join(', ')}`;

    } else {
      messageAssignments = `MESSAGE ASSIGNMENTS (Round 3 - Handicap unlocked!):

Message 1: ✅ Congratulate the user - they now have a handicap!
- This is a milestone worth celebrating.
- Encourage them to check the dashboard for their new handicap.
- Include at least one concrete stat from this round.

Message 2: ✅ Explain that insights will improve with more data.
- Brief note about how more rounds = more personalized analysis.
- Keep it encouraging and forward-looking.
${statsNudge}

Message 3: ℹ️ Actionable recommendation
- Suggest a practice drill to build momentum.
- Drill inspiration (customize or create your own): ${drillSuggestions.join(', ')}`;
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
- SHORT GAME FOCUS: This is an inference from scoring patterns, not a directly measured stat.
- Phrase it as "short-game touch was likely the area to sharpen" (vary the exact wording).
- Do NOT compare to past rounds or averages (we don't have direct short-game data).
- Do NOT mention "overall performance," "score," or "residual."
- Keep the tone constructive - this is a fine-tuning opportunity.`;
    }

    messageAssignments = `MESSAGE ASSIGNMENTS (Standard round with SG analysis):

Message 1: ${msg1Emoji} about "${best.label}"
- This was the strongest area of the round.
- Tone: ${msg1Emoji === '🔥' ? 'enthusiastic praise - this was exceptional!' : 'positive and encouraging'}
- Include at least one concrete stat (score, to-par, putts, FIR, GIR).
- CRITICAL: Do NOT mention penalties in Message 1, even if penalties is the best SG component. If penalties is the best area, focus on FIR, putts, or score instead.
- Vary your phrasing - don't always use the same sentence structures.
${scenarioContext}

Message 2: ${msg2Emoji} about "${message2.label}"
${!noWeaknessMode
  ? `- This area needs improvement. Tone: constructive and encouraging.
- Frame as an opportunity to gain strokes, not a failure.`
  : `- This is another strength worth acknowledging.
- Frame as continued solid performance.`}
- Compare to recent averages when meaningful (better/worse/similar).${shortGameInstructions}${statOverrideHint}
${statsNudge}

Message 3: ℹ️ Actionable recommendation
- Provide a specific, practical drill or habit.
- ${!noWeaknessMode ? `Focus on improving "${message2.label}".` : 'Focus on maintaining strengths or overall consistency.'}
- Drill inspiration (customize or create your own): ${drillSuggestions.join(', ')}
${residualNote ? `- You may reference short-game touch if relevant.` : ''}`;

  } else if (hasSGData && totalSG != null) {
    // Limited SG data
    const drillSuggestions = getSampleDrills('general', drillSeed, 2);

    messageAssignments = `MESSAGE ASSIGNMENTS (Limited SG data):

Message 1: ${totalSG >= 5.0 ? '🔥' : '✅'} about overall performance
- Focus on overall round quality and any available stats.
- Include at least one concrete stat (score, to-par, putts, FIR, GIR).
${scenarioContext}

Message 2: ✅ about available raw stats or general encouragement
- Highlight a positive stat area if available.
- Do NOT use ⚠️ since individual SG components aren't available.
- Compare to recent averages when meaningful.
${statsNudge}

Message 3: ℹ️ Actionable recommendation
- General practice tip based on available stats.
- Drill inspiration (customize or create your own): ${drillSuggestions.join(', ')}`;

  } else {
    // Minimal data - no SG
    const drillSuggestions = getSampleDrills('general', drillSeed, 2);

    messageAssignments = `MESSAGE ASSIGNMENTS (Minimal data - no SG analysis):

Message 1: ✅ about the round score
- Comment on the score relative to par and handicap if available.
- Include any available stats positively.
${scenarioContext}

Message 2: ✅ about available stats or general encouragement
- Highlight the strongest available stat positively.
- If no detailed stats, provide general encouragement.
${statsNudge}

Message 3: ℹ️ Actionable recommendation
- General practice tip.
- Drill inspiration (customize or create your own): ${drillSuggestions.join(', ')}`;
  }

  // ---- Confidence/partial analysis instructions ----

  let confidenceInstructions = '';
  if (partialAnalysis) {
    confidenceInstructions = `\nCONFIDENCE NOTE: This round has partial analysis. Do NOT attribute specific performance differences to individual SG components. Focus on overall round trends.`;
  } else if (isLowConfidence) {
    confidenceInstructions = `\nCONFIDENCE NOTE: Analysis confidence is ${confidence}. Do NOT mention confidence in the user-facing messages unless explicitly instructed.`;
  }

  // ---- Course difficulty instructions ----

  let courseDifficultyInstructions = '';
  if (mentionCourseDifficulty) {
    courseDifficultyInstructions = `\nCOURSE DIFFICULTY: This course has${courseRating && courseRating > ratingThreshold ? ` a rating of ${courseRating}` : ''}${courseRating && courseRating > ratingThreshold && slopeRating && slopeRating > HIGH_SLOPE_THRESHOLD ? ' and' : ''}${slopeRating && slopeRating > HIGH_SLOPE_THRESHOLD ? ` a slope of ${slopeRating}` : ''}, making it above-average difficulty. You may reference this to add context to the player's performance.`;
  } else {
    courseDifficultyInstructions = `\nCOURSE DIFFICULTY: Do NOT mention course rating or slope — they are within normal range.`;
  }

  // ---- Performance band instructions ----

  let performanceBandInstructions = '';
  if (totalSG != null && totalSG <= SG_TOUGH_ROUND_THRESHOLD) {
    performanceBandInstructions = `\nPERFORMANCE BAND: TOUGH ROUND
- This was a difficult day. Acknowledge it honestly but supportively.
- Look for one genuine bright spot to mention in Message 1.
- Avoid phrases like "solid foundation" or "back on track in no time."
- Use supportive phrases like "one round doesn't define you" or "focus on one small thing."
- Message 2 should acknowledge the main struggle constructively.`;
  } else if (totalSG != null && totalSG > SG_TOUGH_ROUND_THRESHOLD && totalSG <= SG_BELOW_EXPECTATIONS_THRESHOLD) {
    performanceBandInstructions = `\nPERFORMANCE BAND: BELOW EXPECTATIONS
- This round was below typical but not disastrous.
- Keep Message 1 balanced - avoid enthusiastic praise or strong descriptors.
- Use neutral positive language like "held up," "one area that worked," or "something to build on."
- Frame improvements as fine-tuning opportunities, not dramatic changes.
- Don't over-praise individual stats when the overall was underwhelming.
- AVOID in Message 1: "great job," "excellent," "fantastic," "impressive," "solid," "solid performance," "solid touch," "solid foundation," "strong," "really well," "positive step," "highlight," "stood out," "contributing positively."
- AVOID in Message 2: "significant difference," "major impact," "dramatically improve."
- PREFER: "steady," "held up," "one bright spot," "something to build on," "room to gain strokes."`;
  } else if (totalSG != null && totalSG > SG_BELOW_EXPECTATIONS_THRESHOLD && totalSG <= SG_ABOVE_EXPECTATIONS_THRESHOLD) {
    performanceBandInstructions = `\nPERFORMANCE BAND: WITHIN EXPECTATIONS
- This was a typical round - not exceptional, not poor.
- Use balanced language: "steady," "consistent," "nice" rather than superlatives.
- Keep comparisons to averages subdued.
- Message 2 should frame improvement areas as fine-tuning, not problems.`;
  } else if (totalSG != null && totalSG > SG_ABOVE_EXPECTATIONS_THRESHOLD && totalSG < SG_EXCEPTIONAL_THRESHOLD) {
    performanceBandInstructions = `\nPERFORMANCE BAND: ABOVE EXPECTATIONS
- This was a good round - the user should feel proud.
- Strong positive language is appropriate.
- Still acknowledge improvement areas constructively in Message 2.`;
  } else if (totalSG != null && totalSG >= SG_EXCEPTIONAL_THRESHOLD) {
    performanceBandInstructions = `\nPERFORMANCE BAND: EXCEPTIONAL
- This was an outstanding round! Full celebration is appropriate.
- Use enthusiastic language in Message 1.
- Message 2 can still mention an area to maintain or fine-tune.`;
  }

  // ---- Build system prompt ----

  const systemPrompt = `You are a supportive golf performance analyst inside GolfIQ, a consumer golf app. Generate post-round insights for a premium user.

OUTPUT FORMAT (strict):
- Output EXACTLY 3 messages, each on its own line
- Each message starts with its assigned emoji (🔥, ✅, ⚠️, or ℹ️)
- Each message is EXACTLY 3 sentences - no more, no less
- Plain text only — no markdown, no headings, no numbering, no labels
- Message 3 should align with Message 2's focus; repetition between 2 and 3 is allowed

CRITICAL RULES:
- NEVER mention penalties in Message 1, even if penalties was the strongest SG component
- If penalties is the best area, talk about FIR, putts, or overall score instead in Message 1
- Each message MUST be exactly 3 sentences (not 2, not 4+)

EMOJI RULES:
- 🔥 = exceptional performance (only when total SG >= +5.0 or individual component >= +5.0)
- ✅ = solid or encouraging performance
- ⚠️ = clear weakness (ONLY when an individual SG component <= -2.0)
- ℹ️ = actionable recommendation (Message 3 only)
- 🔥 is FORBIDDEN when total SG ≤ -2.0
- ⚠️ is FORBIDDEN when no individual SG <= -2.0

TONE:
- Always motivational, positive, and encouraging
- For tough rounds, remain supportive but don't be over-enthusiastic
- Never invent or exaggerate data — only use what's provided
- Do NOT suggest equipment changes or swing changes
- Do NOT mention residual strokes gained unless explicitly instructed in Message 3
- Avoid absolutes like "always" or "never"
- If using hypotheticals, keep them modest (around 2 strokes) and avoid precise claims
- Do NOT include any strokes gained numbers or mention SG values explicitly (no totals, components, or residual values)
- Use historical comparisons when meaningful (e.g., "better than your recent average")
- Include at least one concrete round stat (score, to-par, putts, FIR/GIR, penalties) in Message 1 or 2 when available
- Compare to last-5 averages when present. Numeric comparisons are OK for round stats (score, putts, FIR/GIR), but NEVER use numeric strokes gained values.
- Do NOT mention penalties in Message 1; use score/to-par, FIR/GIR, or putts instead
- SG values between -1.0 and +1.0 are expected variance — never frame as weakness
- IMPORTANT: Vary your phrasing across rounds. Don't use the same sentence structures repeatedly.${confidenceInstructions}${courseDifficultyInstructions}${performanceBandInstructions}`;

  // ---- Build user prompt ----

  const userPrompt = `Generate 3 post-round insights for this round.

${messageAssignments}

ROUND DATA:
${JSON.stringify(payload, null, 2)}`;

  // ---- Call OpenAI API ----

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${OPENAI_API_KEY}` },
    body: JSON.stringify({
      model: OPENAI_MODEL,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      max_tokens: 1200,
      temperature: OPENAI_TEMPERATURE,
    }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(`OpenAI API error: ${error.error?.message || 'Unknown error'}`);
  }

  const data = await response.json();
  const choice = data.choices?.[0];
  const content = choice?.message?.content;

  if (!content) {
    console.error('OpenAI response structure:', JSON.stringify({
      id: data.id,
      model: data.model,
      finish_reason: choice?.finish_reason,
      refusal: choice?.message?.refusal,
      message: choice?.message,
    }, null, 2));
    throw new Error(`No insights generated from OpenAI (finish_reason: ${choice?.finish_reason ?? 'unknown'})`);
  }

  // ---- Parse response into structured format ----

  const lines = content
    .split('\n')
    .map((line: string) => line.trim())
    .filter((line: string) => line.length > 0);

  // ---- Post-processing helpers ----

  const stripEmDashes = (text: string) => text.replace(/[—–]/g, '-');

  // Replace banned phrases that LLM might still use despite AVOID instructions
  const replaceBannedPhrases = (text: string) => {
    const replacements: [RegExp, string][] = [
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
      // "significantly" variations (too dramatic for below-expectations)
      [/\bsignificantly enhance\b/gi, 'help improve'],
      [/\bsignificantly improve\b/gi, 'help improve'],
      [/\bsignificant improvement\b/gi, 'some improvement'],
      [/\bsignificant difference\b/gi, 'a difference'],
    ];
    let result = text;
    for (const [pattern, replacement] of replacements) {
      result = result.replace(pattern, replacement);
    }
    return result;
  };

  const splitSentences = (text: string) => {
    // Replace decimal numbers temporarily to avoid splitting on decimal points
    const placeholder = '\u0000DEC\u0000';
    const decimalPattern = /(\d)\.(\d)/g;
    const protected_ = text.replace(decimalPattern, `$1${placeholder}$2`);
    const parts = protected_.match(/[^.!?]+[.!?]+|[^.!?]+$/g);
    // Restore decimal points
    return (parts ?? [text]).map(p => p.replace(new RegExp(placeholder, 'g'), '.').trim()).filter(Boolean);
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
    const body = match[2].trim();
    const sentences = splitSentences(body);

    const fillersByIndex: Record<number, string[]> = {
      0: [
        'That kind of steadiness is useful to carry forward.',
        'Keep that rhythm going into the next round.',
        'Steady habits like this are worth repeating.',
      ],
      1: [
        'Small adjustments here can make this area feel more stable.',
        'A little extra attention here can help you feel more comfortable.',
        'Steady practice on this area can help you feel more in control.',
      ],
      2: [
        'Keep it simple and stay patient with the process.',
        'A few minutes of steady practice can go a long way.',
        'Stick with it and trust the routine.',
      ],
    };

    const fillers = fillersByIndex[index] ?? fillersByIndex[2];
    const skipPhrasesByIndex: Record<number, string[]> = {
      0: [
        'next round',
        'carry forward',
        'carry into',
        'keep that rhythm',
        'leaning on',
        'consistency',
      ],
      1: [],
      2: [],
    };
    const skipPhrases = skipPhrasesByIndex[index] ?? [];

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
    const keywordBucketsByIndex: Record<number, string[]> = {
      0: ['steady', 'consisten', 'carry', 'next round', 'rhythm', 'repeat', 'leaning on'],
      1: [],
      2: [],
    };
    const seenKeywords = new Set<string>();
    const keywordBuckets = keywordBucketsByIndex[index] ?? [];

    for (const sentence of sentences) {
      if (normalized.length >= 3) break;
      if (normalized.some(existing => isTooSimilar(existing, sentence))) continue;
      const lowerSentence = sentence.toLowerCase();
      const matchedKeyword = keywordBuckets.find(k => lowerSentence.includes(k));
      if (matchedKeyword && seenKeywords.has(matchedKeyword)) continue;
      normalized.push(sentence);
      if (matchedKeyword) seenKeywords.add(matchedKeyword);
    }
    let fillerIndex = 0;
    let attempts = 0;
    const maxAttempts = fillers.length * 2; // Safeguard against infinite loop
    const existingList = normalized.map(s => s.toLowerCase());
    while (normalized.length < 3 && attempts < maxAttempts) {
      const candidate = fillers[fillerIndex % fillers.length];
      fillerIndex += 1;
      attempts += 1;
      const candidateLower = candidate.toLowerCase();
      if (existingList.some(existing => isTooSimilar(existing, candidateLower))) continue;
      if (skipPhrases.some(p => candidateLower.includes(p))) continue;
      normalized.push(candidate);
      existingList.push(candidateLower);
    }
    // Force-add fillers if similarity check rejected all of them
    while (normalized.length < 3) {
      normalized.push(fillers[(normalized.length - 1) % fillers.length]);
    }

    const rebuilt = normalized.join(' ').replace(/\s+/g, ' ').trim();
    return `${emoji} ${rebuilt}`;
  };

  const processedLines = lines.slice(0, 3).map(stripEmDashes).map(replaceBannedPhrases);
  const normalizedLines = processedLines.map((line: string, i: number) => ensureThreeSentences(line, i));

  const insightsData = {
    messages: normalizedLines,
    generated_at: new Date().toISOString(),
    model: OPENAI_MODEL,
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
