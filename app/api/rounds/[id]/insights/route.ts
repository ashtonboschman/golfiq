import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { resolveTeeContext, type TeeSegment } from '@/lib/tee/resolveTeeContext';

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

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
type LeakageOverrideName = 'off_tee' | 'approach' | null;

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
  leakageOverride: LeakageOverrideName;
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
    sgResidual <= -2.5 &&
    (sgOffTee ?? 0) >= -1.0 &&
    (sgApproach ?? 0) >= -1.0 &&
    (sgPutting ?? 0) >= -1.0 &&
    (sgPenalties ?? 0) >= -1.0;
  if (shouldUseShortGame) {
    components.push({ name: 'short_game', value: sgResidual, label: SG_LABELS.short_game });
  }

  if (components.length < 2) return null;

  // Step 2: Find worst component (most negative < -1.0)
  const negatives = components.filter(c => c.value < -1.0);
  const noWeaknessMode = negatives.length === 0;
  let worstComponent: SGComponent | null = null;
  if (!noWeaknessMode) {
    worstComponent = negatives.reduce((min, c) => c.value < min.value ? c : min, negatives[0]);
  }

  // Step 3: Find best component (exclude worst)
  const remainingForBest = worstComponent
    ? components.filter(c => c.name !== worstComponent!.name)
    : components;
  const bestComponent = remainingForBest.reduce((max, c) => c.value > max.value ? c : max, remainingForBest[0]);

  // Step 4: Find second-best component (exclude best and worst)
  const remainingForSecond = components.filter(
    c => c.name !== bestComponent.name && (worstComponent ? c.name !== worstComponent.name : true)
  );
  const secondBestComponent = remainingForSecond.length > 0
    ? remainingForSecond.reduce((max, c) => c.value > max.value ? c : max, remainingForSecond[0])
    : null;

  // Step 5: Assign messages
  const message2Component = noWeaknessMode
    ? (secondBestComponent ?? remainingForSecond[0])
    : worstComponent!;

  if (!message2Component) return null;

  // Emoji logic (based on SG thresholds, but do not surface values in text)
  const totalSG = sgTotal != null ? sgTotal : 0;
  const bestVal = bestComponent.value;

  let msg1Emoji: '🔥' | '✅';
  if (totalSG >= 5.0 || bestVal >= 4.0) {
    msg1Emoji = '🔥';
  } else {
    msg1Emoji = '✅';
  }
  // Override: if total SG <= -2.0, never use 🔥
  if (totalSG <= -2.0) {
    msg1Emoji = '✅';
  }

  let msg2Emoji: '🔥' | '✅' | '⚠️';
  if (!noWeaknessMode) {
    // Only use ⚠️ for very large weaknesses
    msg2Emoji = message2Component.value <= largeWeaknessThreshold ? '⚠️' : '✅';
  } else {
    msg2Emoji = (totalSG >= 5.0 || message2Component.value >= 4.0) ? '🔥' : '✅';
    if (totalSG <= -2.0) msg2Emoji = '✅';
  }

  // Residual note: only used in Message 3 when short-game attribution is active
  let residualNote: string | null = null;
  if (shouldUseShortGame) {
    residualNote = 'Some shots around the green likely contributed today.';
  }

  // Default: no leakage override (stat-based overrides applied later)
  const leakageOverride: LeakageOverrideName = null;

  return {
    best: bestComponent,
    message2: message2Component,
    noWeaknessMode,
    msg1Emoji,
    msg2Emoji,
    residualNote,
    leakageOverride,
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

  const interpolateBaseline = (handicap: number, getValue: (t: any) => number): number | null => {
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
  const largeWeaknessThreshold = -2.0;
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
  const mentionCourseDifficulty = (courseRating != null && courseRating > ratingThreshold) || (slopeRating != null && slopeRating > 130);

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
  };

  // ---- Build message assignment instructions for the LLM ----

  const missingStats: string[] = [];
  if (round.advancedStats && round.firHit === null) missingStats.push('FIR');
  if (round.advancedStats && round.girHit === null) missingStats.push('GIR');
  if (round.advancedStats && round.putts === null) missingStats.push('putts');
  if (round.advancedStats && round.penalties === null) missingStats.push('penalties');

  const missingStatsNoteParts: string[] = [];
  if (!round.advancedStats) {
    missingStatsNoteParts.push('Suggest enabling Advanced Stats next time for more precise insights.');
  }
  const shouldSuggestHBH = !round.holeByHole && totalRounds !== null && totalRounds % 4 === 0;
  if (shouldSuggestHBH) {
    missingStatsNoteParts.push('Optionally suggest trying Hole-by-Hole tracking for deeper insights.');
  }
  if (missingStats.length) {
    missingStatsNoteParts.push(`If appropriate, nudge tracking ${missingStats.join(', ')} next time since they were missing.`);
  }

  const missingStatsNote = missingStatsNoteParts.length
    ? missingStatsNoteParts.join(' ')
    : '';
  const confidenceNote = '';

  const drillLibrary: Record<SGComponentName | 'general', string[]> = {
    off_tee: [
      'Try a fairway-finder drill: place two alignment sticks 10-15 yards apart and hit 8-10 balls focusing on start line and balance.',
      'Play a 3-shot window: pick a target and hit 3 balls with the same club, each finishing within a fairway-width band.',
      'Do a tempo check: hit 5 drives at 70 percent effort, then 5 at 85 percent, keeping the same start line.',
      'Use a tee-height check: hit 6 drives with consistent tee height and focus on center-face contact.',
      'Pick a fairway target and hit 10 balls, scoring 1 point for in-play and 2 points for center. Try to beat your score.',
      'Hit 6 drives with a 3-second hold on the finish to reinforce balance and a repeatable strike.',
      'Aim at the edge of the fairway you fear less and commit to that line for a full bucket.',
      'Alternate driver and 3-wood to build control: 5 of each with the same target line.',
      'Use a narrow target: visualize a 20-yard fairway and score your accuracy over 10 shots.',
      'Hit 5 shots with a lower tee and 5 with a normal tee to learn your best strike window.',
      'Do a start-line drill: place an alignment stick 10 yards ahead and start 8 of 10 shots on that line.',
      'Practice a safe miss: aim for the widest landing area and accept the same-side miss.',
    ],
    approach: [
      'Use a distance ladder drill: pick 3 targets (short, mid, long) and hit 3 balls to each, focusing on solid contact and start line.',
      'Do a 9-ball flight drill: hit 3 fades, 3 straight, 3 draws to the same target to improve control.',
      'Play a 3-2-1 challenge: hit 3 shots to a large target, 2 to a medium target, 1 to a small target.',
      'Work the middle: aim every approach at the center of the green for a full practice bucket.',
      'Hit to the front edge only: practice landing 10 shots on the front third to improve distance control.',
      'Pick two clubs for the same distance and alternate to learn how far each actually flies.',
      'Do a dispersion drill: mark a 20-yard-wide target and hit 10 balls, tracking left-right misses.',
      'Use a clock drill: hit 5 shots at 50 yards, 5 at 75, 5 at 100 to groove partial swings.',
      'Practice the safe target: always aim for the middle of the green, even if the pin is tucked.',
      'Hit 5 shots with a smooth tempo, then 5 with a slightly faster tempo to find the most consistent contact.',
      'Focus on low point control: place a towel 2 inches behind the ball and avoid hitting it.',
      'Do a green-section drill: pick left, middle, right sections and hit 3 balls to each.',
    ],
    putting: [
      'Do a 3-6-9 putting ladder: make 3 in a row from each distance before moving back to build pace control.',
      'Use a gate drill: set two tees just wider than the putter head and roll 10 putts through the gate.',
      'Speed control ladder: putt to a line 3 feet past the hole from 20, 30, and 40 feet.',
      'Circle drill: place 8 balls in a 3-foot circle and make all 8 before moving to 4 feet.',
      'Lag drill: roll 10 putts from 30-40 feet and try to finish inside a 3-foot circle.',
      'One-putt game: drop 10 balls at 6 feet and try to make 7 or more.',
      'Tee gate start-line drill: set two tees just wider than the ball and roll 10 putts through.',
      'Distance control with one ball: hit 5 putts to 10 feet, then 5 to 20 feet, tracking finish distance.',
      'Downhill control: practice 10 downhill putts and focus on stopping them inside 2 feet past.',
      'Uphill confidence: practice 10 uphill putts and aim to finish 1 foot past the hole.',
      'Three-foot pressure: make 10 in a row from 3 feet before leaving.',
      'Two-ball race: putt two balls to the same target and try to stop them within 1 foot of each other.',
    ],
    penalties: [
      'Play a "smart target" habit: pick the widest landing area off the tee and aim there for a full round to reduce penalty risk.',
      'Use a pre-shot rule: if you are between clubs, take the safer club and aim to the middle of the green.',
      'Pick a miss: decide your safe miss before every approach and commit to that target.',
      'Avoid the hero shot: when in trouble, choose the easiest route back to the fairway.',
      'Adopt a 1-club safety rule: if water or OB is in play, take one more club and aim to the safe side.',
      'Build a layup habit: if the risk is high, advance the ball to a comfortable yardage instead of forcing it.',
      'Use a safe-side aim: always favor the side with the largest bailout area.',
      'Commit to a punch-out: if blocked, take the easy route to the fairway and reset.',
      'Do a 2-shot plan: pick targets for both the tee shot and next shot before you swing.',
      'Set a penalty-free goal: aim for zero penalty strokes and accept conservative targets.',
      'Use a hazard buffer: aim 10 yards away from trouble when possible.',
      'Practice a low-traffic route: choose targets that remove the biggest miss from play.',
    ],
    general: [
      'Use a simple pre-shot routine on every swing to build consistency and cut down on avoidable mistakes.',
      'Set a single focus per shot (start line, tempo, or balance) and keep it for the whole round.',
      'Do a 5-ball reflection: after every 5 shots on the range, reset and pick one adjustment.',
      'Play a "boring golf" practice round: aim for center targets and avoid risky lines.',
      'Use a breathing reset: take one deep breath before every shot to slow down.',
      'Pick a conservative target for the entire front nine and see how it affects scoring.',
      'Track one stat for a full round and reflect on it after the round.',
      'Do a 3-shot routine: chip, pitch, and putt before every range session to stay balanced.',
      'Use a tempo count: say "one-two" on the backswing and downswing for smoother rhythm.',
      'Play a two-ball scramble on a few holes to practice decision-making under pressure.',
      'Commit to a finish hold: freeze your finish for 2 seconds on every full swing.',
      'Choose one swing key for the day and stick with it for every shot.',
    ],
    short_game: [
      'Landing spot drill: place a towel 3 yards onto the green and land 10 chips on it.',
      'Up-and-down challenge: drop 5 balls around a green and try to get 3 up-and-downs.',
      'Bump-and-run reps: hit 10 chips with an 8-iron and focus on consistent rollout.',
      'Pitch ladder: hit 5 pitch shots to 20 yards, then 25, then 30 to dial distance control.',
      'One-club short game: use a wedge only and play 10 shots with different trajectories.',
      'Par-save practice: simulate a missed green and try to get down in 2 from various lies.',
      'Low-point control: place a tee just ahead of the ball and clip it after impact.',
      'Fringe-only drill: chip from the fringe and aim to finish inside 6 feet.',
      'Three-landing drill: pick three landing spots (short/mid/long) and hit 3 balls to each.',
      'Pressure up-and-downs: do 10 reps and track how many you save; try to beat your score next time.',
      'Soft hands drill: hit 10 chips focusing on quiet wrists and smooth tempo.',
      'Trajectory ladder: hit 3 low, 3 medium, 3 high chips to the same target.',
    ],
  };

  const buildDrillTip = (area: SGComponentName | 'general', seed: number): string => {
    const list = drillLibrary[area] || drillLibrary.general;
    const idx = Math.abs(seed) % list.length;
    return list[idx];
  };

  let messageAssignments: string;

  const minuteSeed = new Date().getUTCDate() * 1440 + new Date().getUTCHours() * 60 + new Date().getUTCMinutes();
  const drillSeed = totalRounds !== null
    ? totalRounds + minuteSeed
    : Number(roundId % BigInt(997)) + minuteSeed;

  if (isEarlyRounds) {
    const lastRound = last5Rounds[0];
    const comparison =
      lastRound && round.score != null && lastRound.score != null
        ? round.score < lastRound.score
          ? 'Better than last time — that\'s progress worth celebrating.'
          : round.score > lastRound.score
            ? 'A little higher than last time, but you\'re building a baseline.'
            : 'Right in line with last time — a consistent foundation so far.'
        : 'Solid start to building your baseline.';

    if (totalRounds === 1) {
      messageAssignments = `MESSAGE ASSIGNMENTS (Round 1 onboarding):

Message 1: ✅ Congratulate the user on logging their first round.
- Do NOT label the round as "challenging" or "tough" since no baseline exists yet.
- Include at least one concrete stat from this round if available (e.g., total putts, penalties, score to par).
${comparison}

Message 2: ✅ Encourage logging more rounds to unlock a handicap and deeper insights.
${missingStatsNote}
${confidenceNote}

Message 3: ℹ️ Actionable recommendation
- Provide a simple, specific drill to take into the next round.
${buildDrillTip('general', drillSeed)}`;
    } else if (totalRounds === 2) {
      messageAssignments = `MESSAGE ASSIGNMENTS (Round 2 onboarding):

Message 1: ✅ Positive summary and compare gently to the first round (no numbers).
- Include at least one concrete stat from this round if available (e.g., total putts, penalties, score to par).
${comparison}

Message 2: ✅ Encourage one more round to unlock a handicap and deeper insights.
${missingStatsNote}
${confidenceNote}

Message 3: ℹ️ Actionable recommendation
- Provide a simple, specific drill to take into the next round.
${buildDrillTip('general', drillSeed)}`;
    } else {
      messageAssignments = `MESSAGE ASSIGNMENTS (Round 3 onboarding):

Message 1: ✅ Congratulate the user — they now have a handicap.
- Encourage them to check the dashboard for their new handicap and trends.
- Include at least one concrete stat from this round if available (e.g., total putts, penalties, score to par).

Message 2: ✅ Explain that insights will get sharper with more rounds and richer stats.
${missingStatsNote}
${confidenceNote}

Message 3: ℹ️ Actionable recommendation
- Provide a simple, specific drill to build momentum.
${buildDrillTip('general', drillSeed)}`;
    }
  } else if (sgSelection) {
    let { best, message2, noWeaknessMode, msg1Emoji, msg2Emoji, residualNote } = sgSelection;

    const firPct = round.firHit != null && currentCtx.nonPar3Holes > 0
      ? (round.firHit / currentCtx.nonPar3Holes) * 100
      : null;
    const girPct = round.girHit != null && currentCtx.holes > 0
      ? (round.girHit / currentCtx.holes) * 100
      : null;

    const offTeeLeak = firPct != null
      && message2.name !== 'off_tee'
      && (
        (baselineFirPct != null && firPct <= baselineFirPct - 8)
        || firPct <= 25
      );
    const approachLeak = girPct != null
      && message2.name !== 'approach'
      && (
        (baselineGirPct != null && girPct <= baselineGirPct - 8)
        || girPct <= 20
      );

    if (offTeeLeak) {
      message2 = { name: 'off_tee', value: -2.0, label: SG_LABELS.off_tee };
      msg2Emoji = '⚠️';
    } else if (approachLeak) {
      message2 = { name: 'approach', value: -2.0, label: SG_LABELS.approach };
      msg2Emoji = '⚠️';
    }

    messageAssignments = `MESSAGE ASSIGNMENTS (pre-computed, follow exactly):

Message 1: ${msg1Emoji} about "${best.label}"
- Tone: positive, motivational. This is the best-performing area.
- Include at least one concrete stat from this round if available (e.g., score to par, total putts, FIR/GIR). Avoid penalties in Message 1.
- If the best area is Penalties, do NOT focus Message 1 on penalties; use overall performance or another available stat instead.
- If total SG is <= -5, describe any positives as "bright spots" and avoid strong praise like "solid ball-striking" or "excellent."
- Do NOT mention penalties in Message 1 under any circumstance.
- For tough rounds, avoid phrases like "solid foundation," "back on track in no time," or anything that sounds overly optimistic.
- For tough rounds, use supportive phrasing like: "bright spots," "building blocks," "one round doesn't define you," "reset and move forward," "focus on one small improvement."
- For tough rounds, avoid: "solid foundation," "back on track in no time," "great to see," "overall performance was solid."
${msg1Emoji === '🔥' ? '- Use enthusiastic praise — this was exceptional.' : '- Acknowledge solid performance positively and coach-like.'}

Message 2: ${msg2Emoji} about "${message2.label}"
${!noWeaknessMode
  ? `- Tone: constructive or neutral depending on severity. This area needs improvement.
- Frame it honestly but encouragingly — the player can improve here.`
  : `- Tone: positive. This is the second-best performing area.
- Frame as another strength worth celebrating.`}
- If last-5 averages are available, compare qualitatively (better/worse/around your recent average). Do NOT compare short game to recent averages.
- If the area is Short Game, describe it as "short-game touch was the likely area to sharpen based on scoring patterns." Do NOT mention residual or "overall performance/score." Avoid the phrase "scoring leakage." Use this exact phrase (no variants).
- If the area is Short Game, avoid phrases like "compared to your recent rounds/average."
- If the area is Short Game, do NOT compare it to past rounds in any way (no "past rounds" or "shown before" language).
- If the area is Short Game, do NOT mention "overall performance" or "overall score" in Message 2 (including phrases like "support your overall performance").
- If the area is Short Game, avoid phrases like "overall game" or "overall play" in any message.
- If the area is Short Game, do NOT use the word "overall" anywhere.
- If the area is Short Game, avoid phrases like "lower your score," "usual standard," or "not at your level."
- If the area is Short Game, do NOT mention "scoring leakage" anywhere.
- If the area is Short Game, avoid phrases like "save strokes" or "score" in Message 2.
- If the area is Short Game, avoid phrases like "scoring potential."
- If the area is Short Game, avoid phrases like "missed strokes."
- If the area is Short Game, avoid "significant difference" phrasing; keep it fine-tuning.
- If the area is Short Game, avoid mentioning "recent average" or "past rounds" in any form.
- If the area is Short Game, avoid phrases like "better scoring" or "scoring in future rounds."
- If the area is Short Game, avoid phrases like "needs attention" or "overall scoring ability."
- If the area is Short Game, avoid phrases like "better outcomes in future rounds" or "make a difference."
- If the area is Short Game, do NOT include the residual note in Message 2 (only Message 3).
- Do NOT imply trend improvement (e.g., "more fairways," "on the right track") unless explicitly comparing to recent averages.
${missingStatsNote ? `- ${missingStatsNote}` : ''}
${confidenceNote ? `- ${confidenceNote}` : ''}

Message 3: ℹ️ Actionable recommendation
- Provide a specific, real-life practice drill or habit.
- Always motivational and encouraging.
- Suggested drill: ${!noWeaknessMode ? buildDrillTip(message2.name, drillSeed) : buildDrillTip('general', drillSeed)}
${!noWeaknessMode ? `- Focus the recommendation on improving "${message2.label}".` : '- Focus on maintaining strengths or improving consistency.'}
${residualNote ? `- You may mention: ${residualNote}` : '- Do NOT mention residual strokes gained.'}`;

  } else if (hasSGData && totalSG != null) {
    // Has total SG but not enough individual components for algorithm
    messageAssignments = `MESSAGE ASSIGNMENTS (limited SG data):

Message 1: ${totalSG >= 5.0 ? '🔥' : '✅'} about overall performance
- Focus on overall round quality and any available stats (FIR, GIR, putts).
- Include at least one concrete stat from this round if available (e.g., score to par, total putts, FIR/GIR). Avoid penalties in Message 1.

Message 2: ✅ about a secondary strength from raw stats
- Highlight another positive stat area or a neutral area to improve gently. Do NOT use ⚠️ since individual SG components are not available.
- Encourage the user to log more detailed stats for deeper SG analysis.
- If last-5 averages are available, compare qualitatively (better/worse/around your recent average).
${missingStatsNote ? `- ${missingStatsNote}` : ''}
${confidenceNote ? `- ${confidenceNote}` : ''}

Message 3: ℹ️ Actionable recommendation
- General practice tip based on the round's stats.
- Suggested drill: ${buildDrillTip('general', drillSeed)}
- Encourage logging more stats for future insights.`;

  } else {
    // Minimal data — no SG at all
    messageAssignments = `MESSAGE ASSIGNMENTS (minimal data, no strokes gained):

Message 1: ✅ about the round score and overall performance
- Comment on the score relative to par and the player's handicap if available.
- Include at least one concrete stat from this round if available (e.g., score to par, total putts, FIR/GIR). Avoid penalties in Message 1.

Message 2: ✅ about any available raw stats (FIR, GIR, putts, penalties) or a gentle nudge to log more stats
- If stats are available, highlight the strongest one positively.
- If no stats, provide general encouragement.
- If last-5 averages are available, compare qualitatively (better/worse/around your recent average).
${missingStatsNote ? `- ${missingStatsNote}` : ''}
${confidenceNote ? `- ${confidenceNote}` : ''}

Message 3: ℹ️ Actionable recommendation
- General practice tip. Encourage logging more stats for future SG analysis.
- Suggested drill: ${buildDrillTip('general', drillSeed)}`;
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
    courseDifficultyInstructions = `\nCOURSE DIFFICULTY: This course has${courseRating && courseRating > ratingThreshold ? ` a rating of ${courseRating}` : ''}${courseRating && courseRating > ratingThreshold && slopeRating && slopeRating > 130 ? ' and' : ''}${slopeRating && slopeRating > 130 ? ` a slope of ${slopeRating}` : ''}, making it above-average difficulty. You may reference this to add context to the player's performance.`;
  } else {
    courseDifficultyInstructions = `\nCOURSE DIFFICULTY: Do NOT mention course rating or slope — they are within normal range.`;
  }

  // ---- Tough round guard ----

  let toughRoundInstructions = '';
  if (totalSG != null && totalSG <= -5.0) {
    toughRoundInstructions = `\nTOUGH ROUND GUARD: This was a very tough round (well below expectations). Message 1 should acknowledge the tough day and encourage a bounce-back. Do NOT over-praise raw stats like FIR, GIR, putts, or penalties. Do NOT mention penalties at all in Message 1. Avoid saying the overall performance was solid or resilient. Keep tone encouraging but grounded. Message 2 should acknowledge the biggest struggle and suggest a path forward.`;
  }

  let belowExpectationsInstructions = '';
  if (totalSG != null && totalSG > -5.0 && totalSG <= -2.0) {
    belowExpectationsInstructions = `\nBELOW EXPECTATIONS TONE: This round was below expectations but not disastrous. Keep Message 1 clearly positive about the score, but avoid "solid/commendable/strong" descriptors (e.g., "solid round/effort/performance"), "respectable round," "great step forward," "still in touch with your game," or "strong foundation." Avoid words like "struggle" or "challenge" in any message; frame improvements as fine-tuning to shave 1-2 strokes. Avoid phrases like "solid foundation," "fantastic accomplishment," or "commendable round." Avoid "one round doesn't define you" in this band (save that for very tough rounds). Avoid claiming "good approach play" or "approach play was on point" or "ball-striking was steady" unless explicitly comparing to recent averages. Avoid phrases like "capability to play well."`;
  }

  let withinExpectationsInstructions = '';
  if (totalSG != null && totalSG > -2.0 && totalSG <= 2.0) {
    const anyBigComponent = [
      sgComponents?.sgOffTee,
      sgComponents?.sgApproach,
      sgComponents?.sgPutting,
      sgComponents?.sgPenalties,
    ].some((v) => v != null && Number(v) >= 2.0);
    const praiseGuard = anyBigComponent
      ? 'Avoid overusing superlatives; "impressive" is allowed only if it matches the clearly strong component.'
      : 'Avoid heavy praise (no "standout/stood out," "impressive," "fantastic," "great building block," or "solid overall performance").';

    withinExpectationsInstructions = `\nWITHIN EXPECTATIONS TONE: This round was within expectations. Keep Message 1 balanced and positive. ${praiseGuard} Avoid "bright spot," "positive highlight," "highlight," "standout," "shined," "impressive," "great to see," "strong performance," "strong point," "solid performance," "solid play," "solid foundation," "solid putting performance," "reliable area," "reliable aspect," "reliable," "overall performance," "strength," "positive aspect," "strong putting touch," "solid touch," "key area to rely on," "positive strides," "keep up the good work," "encouraging," "encouraging to see," or "level of performance" if it sounds overly glowing. Do NOT use the word "highlight" or "standout" in Message 1. Prefer muted phrasing like "steady," "consistent," or "nice" instead. Do NOT describe the course as challenging unless the course difficulty flag allows it. In Message 2, keep wording light and focused on fine-tuning; avoid phrases like "didn't meet your usual standard" or "needs attention." Avoid "significantly," "significant gains," "overall play," or "lower your score" phrasing in Message 2. If comparing to recent averages, keep it subdued (e.g., "around your recent average") and do not over-celebrate. Message 1 should follow this safe pattern (2-3 sentences max): "Your putting was steady today with 30 putts, and that consistency is something you can keep leaning on. Keep leaning on that consistency." Optional add-on sentence: "That kind of steady touch is useful to carry into the next round." Message 2 (short game) must be exactly these two sentences and nothing else: "This is a good area to fine-tune with a little focused practice. A few reps here can help your touch around the greens."`;
  }

  let aboveExpectationsInstructions = '';
  if (totalSG != null && totalSG > 2.0 && totalSG < 5.0) {
    aboveExpectationsInstructions = `\nABOVE EXPECTATIONS TONE: This round was above expectations. Keep Message 1 clearly positive and validating — the user should feel proud. Strong praise is OK (e.g., "highlight," "strong," "impressive"), but avoid extreme hype like "exceptional," "historic," "perfect," or "game-changer." Do NOT use "overall performance" or "overall play" in Message 2. If comparing to recent averages, numeric stats are ok (putts/FIR/GIR/score) but do NOT mention any SG numbers. Message 2 (short game) must be exactly these two sentences and nothing else: "This is a good area to fine-tune with a little focused practice. A few reps here can help your touch around the greens."`;
  }

  let highTotalWithWeakComponentInstructions = '';
  if (totalSG != null && totalSG > 2.0 && totalSG < 5.0 && sgSelection && !sgSelection.noWeaknessMode && sgSelection.message2.value <= -2.0) {
    highTotalWithWeakComponentInstructions = `\nHIGH TOTAL + WEAK COMPONENT: Total SG is strong but there is one clear weakness. Keep Message 1 positive but grounded; avoid "impressive," "highlight," "solid performance," "significantly," "showcasing your skill," "great foundation," or "strength" wording that might feel overstated. In Message 2, avoid "needs attention," "stood out," or "significantly higher/worse" phrasing; use calm, constructive language like "an area to tighten up" or "a good place to focus next."`;
  }

  // ---- Build system prompt ----

  const systemPrompt = `You are a supportive golf performance analyst inside GolfIQ, a consumer golf app. Generate post-round insights for a premium user.

OUTPUT FORMAT (strict):
- Output EXACTLY 3 messages, each on its own line
- Each message starts with its assigned emoji (🔥, ✅, ⚠️, or ℹ️)
- Each message is exactly 3 sentences
- Plain text only — no markdown, no headings, no numbering, no labels
- Message 3 should align with Message 2's focus; repetition between 2 and 3 is allowed

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
- SG values between -1.0 and +1.0 are expected variance — never frame as weakness${confidenceInstructions}${courseDifficultyInstructions}${toughRoundInstructions}${belowExpectationsInstructions}${withinExpectationsInstructions}${aboveExpectationsInstructions}${highTotalWithWeakComponentInstructions}`;

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
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      max_tokens: 1200,
      temperature: 0.7,
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

  const stripEmDashes = (text: string) => text.replace(/[—–]/g, '-');

  const applyPostRoundOverrides = (lines: string[]) => {
  const withinExpectationsShortGame = totalSG != null
    && totalSG > -2.0
    && totalSG <= 2.0
    && sgSelection?.message2.name === 'short_game'
    && lines.length >= 2;

  if (withinExpectationsShortGame) {
    const msg2Emoji = sgSelection?.msg2Emoji ?? '⚠️';
    lines[1] = `${msg2Emoji} Your short-game touch was the likely area to sharpen based on scoring patterns. This is a good area to fine-tune with a little focused practice. A few reps here can help your touch around the greens.`;
  }

  const noWeaknessMode = sgSelection?.noWeaknessMode && lines.length >= 2;
  if (noWeaknessMode) {
    if (totalSG != null && totalSG > -2.0 && totalSG <= 2.0) {
      const msg1Emoji = sgSelection?.msg1Emoji ?? '✅';
      const scoreLine = round.score != null ? ` You posted a score of ${round.score}.` : '';
      const statLine = round.putts != null
        ? ` With ${round.putts} putts, you kept things steady on the greens.`
        : (round.girHit != null ? ` Hitting ${round.girHit} greens shows steady approach play.` : '');
      lines[0] = `${msg1Emoji} You put together a steady round overall.${scoreLine}${statLine}`;
    }

    const msg2Emoji = '✅';
    const areaLabel = sgSelection?.message2.label ?? 'Another area';
    const verb = areaLabel.toLowerCase() === 'penalties' ? 'were' : 'was';
    lines[1] = `${msg2Emoji} ${areaLabel} ${verb} another steady part of your round. Keep building on that consistency. It’s a good signal that your game is trending in the right direction.`;

    const msg3Emoji = 'ℹ️';
    const areaName = sgSelection?.message2.name ?? 'general';
    const tip = buildDrillTip(areaName, drillSeed);
    lines[2] = `${msg3Emoji} ${tip}`;
  }

  const firPct = round.firHit != null && currentCtx.nonPar3Holes > 0
    ? (round.firHit / currentCtx.nonPar3Holes) * 100
    : null;
  const girPct = round.girHit != null && currentCtx.holes > 0
    ? (round.girHit / currentCtx.holes) * 100
    : null;

  const veryLowFIR = firPct != null && firPct <= 25 && lines.length >= 2;
  if (veryLowFIR) {
    const firLine = round.firHit != null && currentCtx.nonPar3Holes > 0
      ? ` Hitting ${round.firHit} fairways out of ${currentCtx.nonPar3Holes} gives you a clear place to improve.`
      : '';
    lines[1] = `⚠️ Off the tee was the main area to tighten up today.${firLine} A simple fairway-target drill can help you find more fairways.`;
    lines[2] = `ℹ️ ${buildDrillTip('off_tee', drillSeed)}`;
  }

  const veryLowGIR = girPct != null
    && lines.length >= 2
    && (
      (baselineGirPct != null && girPct <= baselineGirPct - 8)
      || girPct <= 20
    );
  if (veryLowGIR && !veryLowFIR) {
    const girLine = round.girHit != null && currentCtx.holes > 0
      ? ` Hitting ${round.girHit} greens out of ${currentCtx.holes} gives you a clear place to improve.`
      : '';
    lines[1] = `⚠️ Approach play was the main area to tighten up today.${girLine} A few focused reps can help you find more greens.`;
    lines[2] = `ℹ️ ${buildDrillTip('approach', drillSeed)}`;
  }

  const withinExpectationsPuttingLeak = totalSG != null
    && totalSG > -2.0
    && totalSG <= 2.0
    && sgSelection?.message2.name === 'putting'
    && sgSelection?.message2.value <= -2.0
    && lines.length >= 2;

  if (withinExpectationsPuttingLeak) {
    const msg2Emoji = sgSelection?.msg2Emoji ?? '⚠️';
    lines[1] = `${msg2Emoji} Putting was the main area to fine-tune today. A few focused reps can help you feel more confident on the greens. It’s a good spot to focus next round.`;
  }

  const belowExpectationsApproachLeak = totalSG != null
    && totalSG > -5.0
    && totalSG <= -2.0
    && sgSelection?.message2.name === 'approach'
    && sgSelection?.message2.value <= -2.0
    && lines.length >= 2;

  if (belowExpectationsApproachLeak) {
    const msg1Emoji = sgSelection?.msg1Emoji ?? '✅';
    const scoreLine = round.score != null ? ` You posted a score of ${round.score}.` : '';
    const girLine = round.girHit != null ? ` Hitting ${round.girHit} greens gives you a clear baseline to build from.` : '';
    lines[0] = `${msg1Emoji} It was a challenging round, but there were still some usable takeaways.${scoreLine}${girLine}`;

    const msg2Emoji = sgSelection?.msg2Emoji ?? '⚠️';
    lines[1] = `${msg2Emoji} Approach play was the main area to tighten up today. A few focused reps with mid‑irons can help you find more greens. It’s a good spot to focus next round.`;
  }

  const aboveExpectationsShortGame = totalSG != null
    && totalSG > 2.0
    && totalSG < 5.0
    && sgSelection?.message2.name === 'short_game'
    && lines.length >= 2;

  if (aboveExpectationsShortGame) {
    const msg2Emoji = sgSelection?.msg2Emoji ?? '⚠️';
    lines[1] = `${msg2Emoji} Your short-game touch was the likely area to sharpen based on scoring patterns. This is a good area to fine-tune with a little focused practice. A few reps here can help your touch around the greens.`;
  }

  const highTotalWeakComponent = totalSG != null
    && totalSG > 2.0
    && totalSG < 5.0
    && sgSelection
    && !sgSelection.noWeaknessMode
    && sgSelection.message2.value <= -2.0
    && lines.length >= 2;

  if (highTotalWeakComponent) {
    const msg1Emoji = sgSelection?.msg1Emoji ?? '✅';
    const scoreLine = round.score != null ? ` You posted a score of ${round.score}.` : '';
    const puttsLine = round.putts != null ? ` With ${round.putts} putts, you kept things steady on the greens.` : '';
    lines[0] = `${msg1Emoji} You put together a strong round overall.${scoreLine}${puttsLine}`;

    const msg2Emoji = sgSelection?.msg2Emoji ?? '⚠️';
    const areaLabel = sgSelection?.message2.label ?? 'This area';
    const verb = areaLabel.toLowerCase() === 'penalties' ? 'were' : 'was';
    lines[1] = `${msg2Emoji} ${areaLabel} ${verb} the main area to tighten up today. A few focused reps here can help you feel more in control. It’s a good spot to focus next round.`;
  }

  const toughRoundOffTeeLeak = totalSG != null
    && totalSG <= -5.0
    && round.firHit != null
    && currentCtx.nonPar3Holes > 0
    && (round.firHit / currentCtx.nonPar3Holes) * 100 <= 35
    && lines.length >= 2;

  if (toughRoundOffTeeLeak) {
    const msg1Emoji = sgSelection?.msg1Emoji ?? '✅';
    const scoreLine = round.score != null ? ` You posted a score of ${round.score}.` : '';
    const firLine = ` Hitting ${round.firHit} fairways gives you a clear baseline to build from.`;
    lines[0] = `${msg1Emoji} It was a tough round, but there were still some usable takeaways.${scoreLine}${firLine}`;

    lines[1] = `⚠️ Off the tee was the main area to tighten up today. A few focused reps can help you find more fairways. It’s a good spot to focus next round.`;
  }

  const quickScoreOnly = !round.advancedStats
    && round.firHit == null
    && round.girHit == null
    && round.putts == null
    && round.penalties == null
    && lines.length >= 2;

  if (quickScoreOnly) {
    const msg1Emoji = sgSelection?.msg1Emoji ?? '✅';
    const scoreLine = round.score != null ? ` You posted a score of ${round.score}.` : '';
    if (totalRounds === 1) {
      lines[0] = `${msg1Emoji} Congrats on logging your first round!${scoreLine} Keep your focus on the next round.`;
    } else if (totalRounds === 2) {
      const lastRound = last5Rounds[0];
      let comparison =
        lastRound && round.score != null && lastRound.score != null
          ? round.score < lastRound.score
            ? 'You posted a score of X, better than last time, and that is progress worth celebrating.'
            : round.score > lastRound.score
              ? 'You posted a score of X, a little higher than last time, and you’re building a baseline.'
              : 'You posted a score of X, right in line with last time.'
          : 'Solid progress as you build your baseline.';
      if (round.score != null) {
        comparison = comparison.replace('X', String(round.score));
      }
      lines[0] = `${msg1Emoji} Nice work getting your second round logged. ${comparison} One more round unlocks your handicap.`;
    } else if (totalRounds === 3) {
      lines[0] = `${msg1Emoji} Congrats — you’ve logged your third round and now have a handicap.${scoreLine} Check your dashboard to see it.`;
    } else {
      const toughPrefix = totalSG != null && totalSG <= -5.0 ? 'It was a challenging round, but one score doesn’t define you.' : 'Nice work getting a round logged in.';
      lines[0] = `${msg1Emoji} ${toughPrefix}${scoreLine} Keep your focus on the next round.`;
    }

    lines[1] = `✅ Logging a few extra stats next time will unlock more precise insights. Consider enabling Advanced Stats so we can highlight strengths and opportunities with more detail. It only takes a few moments and pays off quickly.`;
  }

  // Note: keep Round 2 message to exactly 3 sentences; no extra append here.

  const missingFirWithHBH = round.holeByHole
    && round.advancedStats
    && round.firHit == null
    && lines.length >= 2;

  if (missingFirWithHBH) {
    const msg1Emoji = totalSG != null && totalSG <= -5.0 ? '✅' : (sgSelection?.msg1Emoji ?? '✅');
    const scoreLine = round.score != null ? ` You posted a score of ${round.score}.` : '';
    const girLine = round.girHit != null ? ` Hitting ${round.girHit} greens gives you a clear baseline to build from.` : '';
    lines[0] = `${msg1Emoji} It was a tough round, but there were still some usable takeaways.${scoreLine}${girLine}`;

    const msg2Emoji = sgSelection?.msg2Emoji ?? '⚠️';
    const areaLabel = sgSelection?.message2.label ?? 'This area';
    lines[1] = `${msg2Emoji} ${areaLabel} was the main area to tighten up today. A few focused reps can help you feel more in control. Also, tracking FIR next time will sharpen these insights.`;
  }


  const shortGameInference = sgSelection?.message2.name === 'short_game'
    && sgSelection?.message2.value <= -2.5
    && lines.length >= 2;

  if (shortGameInference) {
    const msg2Emoji = sgSelection?.msg2Emoji ?? '⚠️';
    lines[1] = `${msg2Emoji} Your short-game touch was the likely area to sharpen based on scoring patterns. This is a good area to fine-tune with a little focused practice. A few reps here can help your touch around the greens.`;

    if (totalSG != null && totalSG <= -2.0) {
      const msg1Emoji = sgSelection?.msg1Emoji ?? '✅';
      const scoreLine = round.score != null ? ` You posted a score of ${round.score}.` : '';
      const girLine = round.girHit != null ? ` Hitting ${round.girHit} greens gives you a clear baseline to build from.` : '';
      lines[0] = `${msg1Emoji} It was a tough round, but there were still some usable takeaways.${scoreLine}${girLine}`;
    }
  }

  const round3Onboarding = totalRounds === 3 && lines.length >= 3;
  if (round3Onboarding) {
    lines[0] = `✅ Congrats - you have logged your third round and now have a handicap. You posted a score of ${round.score}. Check your dashboard to see it.`;
    lines[1] = `✅ As you log more rounds, the insights will get sharper and more personalized. More data helps us spot trends and strengths. Keep tracking your rounds to build a clearer baseline.`;
    lines[2] = `ℹ️ ${buildDrillTip('general', drillSeed)}`;
  }

    return lines.map(stripEmDashes);
  };

  const overriddenLines = applyPostRoundOverrides(lines);

  const splitSentences = (text: string) => {
    const parts = text.match(/[^.!?]+[.!?]+|[^.!?]+$/g);
    return (parts ?? [text]).map(p => p.trim()).filter(Boolean);
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
    const existingList = normalized.map(s => s.toLowerCase());
    while (normalized.length < 3) {
      const candidate = fillers[fillerIndex % fillers.length];
      fillerIndex += 1;
      const candidateLower = candidate.toLowerCase();
      if (existingList.some(existing => isTooSimilar(existing, candidateLower))) continue;
      if (skipPhrases.some(p => candidateLower.includes(p))) continue;
      normalized.push(candidate);
      existingList.push(candidateLower);
    }

    const rebuilt = normalized.join(' ').replace(/\s+/g, ' ').trim();
    return `${emoji} ${rebuilt}`;
  };

  const normalizedLines = overriddenLines.slice(0, 3).map((line, i) => ensureThreeSentences(line, i));

  const insightsData = {
    messages: normalizedLines,
    generated_at: new Date().toISOString(),
    model: 'gpt-4o-mini',
    raw_payload: payload,
  };

  // ---- Store in database ----

  const savedInsights = await prisma.roundInsight.upsert({
    where: { roundId },
    create: {
      roundId,
      userId,
      modelUsed: 'gpt-4o-mini',
      insights: insightsData,
    },
    update: {
      insights: insightsData,
      updatedAt: new Date(),
    },
  });

  return savedInsights.insights;
}
