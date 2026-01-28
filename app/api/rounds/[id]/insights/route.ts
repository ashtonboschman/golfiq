import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';

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

type SGComponentName = 'off_tee' | 'approach' | 'putting' | 'penalties';

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
): SGSelection | null {
  // Build non-null component array (exclude residual)
  const components: SGComponent[] = [];
  if (sgOffTee != null) components.push({ name: 'off_tee', value: sgOffTee, label: SG_LABELS.off_tee });
  if (sgApproach != null) components.push({ name: 'approach', value: sgApproach, label: SG_LABELS.approach });
  if (sgPutting != null) components.push({ name: 'putting', value: sgPutting, label: SG_LABELS.putting });
  if (sgPenalties != null) components.push({ name: 'penalties', value: sgPenalties, label: SG_LABELS.penalties });

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

  // Emoji logic
  const totalSG = sgTotal != null ? sgTotal : 0;
  const bestVal = bestComponent.value;

  let msg1Emoji: '🔥' | '✅';
  if (totalSG > 2.0 || bestVal > 2.0) {
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
    msg2Emoji = '⚠️';
  } else {
    msg2Emoji = (totalSG > 2.0 || message2Component.value > 2.0) ? '🔥' : '✅';
    if (totalSG <= -2.0) msg2Emoji = '✅';
  }

  // Residual note: only used in Message 3 when ALL other components are positive
  let residualNote: string | null = null;
  if (sgResidual != null && sgResidual < -1.0) {
    const allOthersPositive = components.every(c => c.value >= 0);
    if (allOthersPositive) {
      residualNote = `Residual SG is ${sgResidual.toFixed(2)}, suggesting some scoring inefficiency outside the main categories.`;
    }
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
    include: { tee: { include: { course: { include: { location: true } } } } },
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

  const last5Rounds = await prisma.round.findMany({
    where: { userId, id: { not: roundId } },
    orderBy: { date: 'desc' },
    take: 5,
    include: { tee: true },
  });

  // ---- Calculate historical averages (normalized per hole, scaled to current round) ----

  const currentHolesPlayed = round.tee.numberOfHoles || 18;

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

  if (last5Rounds.length) {
    const avgScorePerHole = last5Rounds.reduce((sum, r) => {
      const holes = r.tee.numberOfHoles || 18;
      return sum + (r.score / holes);
    }, 0) / last5Rounds.length;
    avgScore = avgScorePerHole * currentHolesPlayed;

    const avgToParPerHole = last5Rounds.reduce((sum, r) => {
      const holes = r.tee.numberOfHoles || 18;
      const toPar = r.score - (r.tee.parTotal || 72);
      return sum + (toPar / holes);
    }, 0) / last5Rounds.length;
    avgToPar = avgToParPerHole * currentHolesPlayed;

    const roundsWithFir = last5Rounds.filter((r) => r.firHit !== null && r.tee.nonPar3Holes);
    if (roundsWithFir.length)
      avgFirPct = roundsWithFir.reduce((sum, r) => sum + ((r.firHit || 0) / (r.tee.nonPar3Holes || 14)) * 100, 0) / roundsWithFir.length;

    const roundsWithGir = last5Rounds.filter((r) => r.girHit !== null && r.tee.numberOfHoles);
    if (roundsWithGir.length)
      avgGirPct = roundsWithGir.reduce((sum, r) => sum + ((r.girHit || 0) / (r.tee.numberOfHoles || 18)) * 100, 0) / roundsWithGir.length;

    const roundsWithPutts = last5Rounds.filter((r) => r.putts !== null && r.tee.numberOfHoles);
    if (roundsWithPutts.length) {
      const avgPuttsPerHole = roundsWithPutts.reduce((sum, r) => {
        const holes = r.tee.numberOfHoles || 18;
        return sum + ((r.putts || 0) / holes);
      }, 0) / roundsWithPutts.length;
      avgPutts = avgPuttsPerHole * currentHolesPlayed;
    }

    const roundsWithPenalties = last5Rounds.filter((r) => r.penalties !== null && r.tee.numberOfHoles);
    if (roundsWithPenalties.length) {
      const avgPenaltiesPerHole = roundsWithPenalties.reduce((sum, r) => {
        const holes = r.tee.numberOfHoles || 18;
        return sum + ((r.penalties || 0) / holes);
      }, 0) / roundsWithPenalties.length;
      avgPenalties = avgPenaltiesPerHole * currentHolesPlayed;
    }

    const last5SGs = await prisma.roundStrokesGained.findMany({
      where: { roundId: { in: last5Rounds.map(r => r.id) } },
    });

    const roundHolesMap = new Map<bigint, number>(last5Rounds.map(r => [r.id, r.tee.numberOfHoles || 18]));
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
  const sgSelection = hasSGData
    ? runSGSelection(
        sgComponents.sgOffTee != null ? Number(sgComponents.sgOffTee) : null,
        sgComponents.sgApproach != null ? Number(sgComponents.sgApproach) : null,
        sgComponents.sgPutting != null ? Number(sgComponents.sgPutting) : null,
        sgComponents.sgPenalties != null ? Number(sgComponents.sgPenalties) : null,
        sgComponents.sgResidual != null ? Number(sgComponents.sgResidual) : null,
        sgComponents.sgTotal != null ? Number(sgComponents.sgTotal) : null,
      )
    : null;

  // ---- Determine confidence/partial analysis ----

  const confidence = sgComponents?.confidence ?? null;
  const partialAnalysis = sgComponents?.partialAnalysis ?? false;
  const isLowConfidence = confidence === 'low' || confidence === 'medium';

  // ---- Course difficulty context ----

  const courseRating = round.tee.courseRating ? Number(round.tee.courseRating) : null;
  const slopeRating = round.tee.slopeRating ?? null;
  const mentionCourseDifficulty = (courseRating != null && courseRating > 73) || (slopeRating != null && slopeRating > 130);

  // ---- Build payload for the LLM ----

  const toPar = round.score - (round.tee.parTotal || 72);
  const totalSG = strokesGainedPayload.total ?? null;

  const payload = {
    round: {
      score: round.score,
      to_par: toPar,
      handicap_at_round: round.handicapAtRound ? Number(round.handicapAtRound) : null,
      course: {
        par: round.tee.parTotal || 72,
        rating: courseRating,
        slope: slopeRating,
        holes_played: currentHolesPlayed,
        non_par3_holes: round.tee.nonPar3Holes || 14,
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

  let messageAssignments: string;

  if (sgSelection) {
    const { best, message2, noWeaknessMode, msg1Emoji, msg2Emoji, residualNote } = sgSelection;

    messageAssignments = `MESSAGE ASSIGNMENTS (pre-computed, follow exactly):

Message 1: ${msg1Emoji} about "${best.label}" (SG: ${best.value.toFixed(2)})
- Tone: positive, motivational. This is the best-performing area.
${msg1Emoji === '🔥' ? '- Use enthusiastic praise — this was exceptional.' : '- Acknowledge solid performance positively.'}

Message 2: ${msg2Emoji} about "${message2.label}" (SG: ${message2.value.toFixed(2)})
${!noWeaknessMode
  ? `- Tone: constructive, identify this as costing strokes. This area needs improvement.
- Frame it honestly but encouragingly — the player can improve here.`
  : `- Tone: positive. This is the second-best performing area.
- Frame as another strength worth celebrating.`}

Message 3: ℹ️ Actionable recommendation
- Provide a specific, real-life practice drill or habit.
- Always motivational and encouraging.
${!noWeaknessMode ? `- Focus the recommendation on improving "${message2.label}".` : '- Focus on maintaining strengths or improving consistency.'}
${residualNote ? `- You may mention: ${residualNote}` : '- Do NOT mention residual strokes gained.'}`;

  } else if (hasSGData && totalSG != null) {
    // Has total SG but not enough individual components for algorithm
    messageAssignments = `MESSAGE ASSIGNMENTS (limited SG data):

Message 1: ${totalSG > 2.0 ? '🔥' : '✅'} about overall performance (Total SG: ${totalSG.toFixed(2)})
- Focus on overall round quality and any available stats (FIR, GIR, putts).

Message 2: ✅ about a secondary strength from raw stats
- Highlight another positive stat area. Do NOT use ⚠️ since individual SG components are not available.
- Encourage the user to log more detailed stats for deeper SG analysis.

Message 3: ℹ️ Actionable recommendation
- General practice tip based on the round's stats.
- Encourage logging more stats for future insights.`;

  } else {
    // Minimal data — no SG at all
    messageAssignments = `MESSAGE ASSIGNMENTS (minimal data, no strokes gained):

Message 1: ✅ about the round score and overall performance
- Comment on the score relative to par and the player's handicap if available.

Message 2: ✅ about any available raw stats (FIR, GIR, putts, penalties)
- If stats are available, highlight the strongest one positively.
- If no stats, provide general encouragement.

Message 3: ℹ️ Actionable recommendation
- General practice tip. Encourage logging more stats for future SG analysis.`;
  }

  // ---- Confidence/partial analysis instructions ----

  let confidenceInstructions = '';
  if (partialAnalysis) {
    confidenceInstructions = `\nCONFIDENCE NOTE: This round has partial analysis. Do NOT attribute specific performance differences to individual SG components. Focus on overall round trends. Gently note that some stats may be missing — "take these insights with a grain of salt and log more stats for a complete picture."`;
  } else if (isLowConfidence) {
    confidenceInstructions = `\nCONFIDENCE NOTE: Analysis confidence is ${confidence}. Gently mention that some stats may be incomplete — advise logging more stats for more accurate insights.`;
  }

  // ---- Course difficulty instructions ----

  let courseDifficultyInstructions = '';
  if (mentionCourseDifficulty) {
    courseDifficultyInstructions = `\nCOURSE DIFFICULTY: This course has${courseRating && courseRating > 73 ? ` a rating of ${courseRating}` : ''}${courseRating && courseRating > 73 && slopeRating && slopeRating > 130 ? ' and' : ''}${slopeRating && slopeRating > 130 ? ` a slope of ${slopeRating}` : ''}, making it above-average difficulty. You may reference this to add context to the player's performance.`;
  } else {
    courseDifficultyInstructions = `\nCOURSE DIFFICULTY: Do NOT mention course rating or slope — they are within normal range.`;
  }

  // ---- Tough round guard ----

  let toughRoundInstructions = '';
  if (totalSG != null && totalSG <= -5.0) {
    toughRoundInstructions = `\nTOUGH ROUND GUARD: Total SG is ${totalSG.toFixed(2)} (very negative). Do NOT praise raw stats like FIR, GIR, or putts. Keep tone encouraging but grounded. Message 2 MUST address the most negative SG component.`;
  }

  // ---- Build system prompt ----

  const systemPrompt = `You are a supportive golf performance analyst inside GolfIQ, a consumer golf app. Generate post-round insights for a premium user.

OUTPUT FORMAT (strict):
- Output EXACTLY 3 messages, each on its own line
- Each message starts with its assigned emoji (🔥, ✅, ⚠️, or ℹ️)
- Each message is max 3 sentences
- Plain text only — no markdown, no headings, no numbering, no labels
- Do NOT repeat the same area across messages

EMOJI RULES:
- 🔥 = exceptional performance (only when total SG > +2.0 or individual component > +2.0)
- ✅ = solid or encouraging performance
- ⚠️ = clear weakness (ONLY when an individual SG component < -1.0)
- ℹ️ = actionable recommendation (Message 3 only)
- 🔥 is FORBIDDEN when total SG ≤ -2.0
- ⚠️ is FORBIDDEN when no individual SG < -1.0

TONE:
- Always motivational, positive, and encouraging
- For tough rounds, remain supportive but don't be over-enthusiastic
- Never invent or exaggerate data — only use what's provided
- Never reference residual strokes gained in any message
- Use historical comparisons when meaningful (e.g., "better than your recent average of X")
- SG values between -1.0 and +1.0 are expected variance — never frame as weakness${confidenceInstructions}${courseDifficultyInstructions}${toughRoundInstructions}`;

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

  const insightsData = {
    messages: lines,
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
