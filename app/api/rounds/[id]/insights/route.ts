import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

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

    // Check if insights already exist
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

export async function generateInsights(roundId: bigint, userId: bigint) {
  if (!OPENAI_API_KEY) throw new Error('OpenAI API key not configured');

  const round = await prisma.round.findUnique({
    where: { id: roundId },
    include: { tee: { include: { course: { include: { location: true } } } } },
  });

  if (!round) throw new Error('Round not found');
  if (round.userId !== userId) throw new Error('Unauthorized access to round');

  const sgComponents = await prisma.roundStrokesGained.findUnique({
    where: { roundId }
  });

  if (!sgComponents) throw new Error('Round not found');
  if (sgComponents.userId !== userId) throw new Error('Unauthorized access to round');

  const leaderboardStats = await prisma.userLeaderboardStats.findUnique({
    where: { userId },
    select: {
      bestScore: true,
      totalRounds: true
    },
  });


  const last5Rounds = await prisma.round.findMany({
    where: { userId, id: { not: roundId } },
    orderBy: { date: 'desc' },
    take: 5,
    include: { tee: true },
  });

  // Current round's holes played (for scaling averages)
  const currentHolesPlayed = round.tee.numberOfHoles || 18;

  // Averages (normalized per hole, then scaled to current round)
  let avgScore = null,
    avgToPar = null,
    avgFirPct = null,
    avgGirPct = null,
    avgPutts = null,
    avgPenalties = null,
    avgSgTotal = null,
    avgSgOffTee = null,
    avgSgApproach = null,
    avgSgPutting = null,
    avgSgPenalties = null,
    avgSgResidual = null;

  if (last5Rounds.length) {
    // Calculate per-hole averages, then scale to current round's holes
    const avgScorePerHole = last5Rounds.reduce((sum, r) => {
      const holesPlayed = r.tee.numberOfHoles || 18;
      return sum + (r.score / holesPlayed);
    }, 0) / last5Rounds.length;
    avgScore = avgScorePerHole * currentHolesPlayed;

    const avgToParPerHole = last5Rounds.reduce((sum, r) => {
      const holesPlayed = r.tee.numberOfHoles || 18;
      const toPar = r.score - (r.tee.parTotal || 72);
      return sum + (toPar / holesPlayed);
    }, 0) / last5Rounds.length;
    avgToPar = avgToParPerHole * currentHolesPlayed;

    // FIR % and GIR % are already normalized (percentages)
    const roundsWithFir = last5Rounds.filter((r) => r.firHit !== null && r.tee.nonPar3Holes);
    if (roundsWithFir.length)
      avgFirPct = roundsWithFir.reduce((sum, r) => sum + ((r.firHit || 0) / (r.tee.nonPar3Holes || 14)) * 100, 0) / roundsWithFir.length;

    const roundsWithGir = last5Rounds.filter((r) => r.girHit !== null && r.tee.numberOfHoles);
    if (roundsWithGir.length)
      avgGirPct = roundsWithGir.reduce((sum, r) => sum + ((r.girHit || 0) / (r.tee.numberOfHoles || 18)) * 100, 0) / roundsWithGir.length;

    // Normalize putts per hole, then scale to current round
    const roundsWithPutts = last5Rounds.filter((r) => r.putts !== null && r.tee.numberOfHoles);
    if (roundsWithPutts.length) {
      const avgPuttsPerHole = roundsWithPutts.reduce((sum, r) => {
        const holesPlayed = r.tee.numberOfHoles || 18;
        return sum + ((r.putts || 0) / holesPlayed);
      }, 0) / roundsWithPutts.length;
      avgPutts = avgPuttsPerHole * currentHolesPlayed;
    }

    // Normalize penalties per hole, then scale to current round
    const roundsWithPenalties = last5Rounds.filter((r) => r.penalties !== null && r.tee.numberOfHoles);
    if (roundsWithPenalties.length) {
      const avgPenaltiesPerHole = roundsWithPenalties.reduce((sum, r) => {
        const holesPlayed = r.tee.numberOfHoles || 18;
        return sum + ((r.penalties || 0) / holesPlayed);
      }, 0) / roundsWithPenalties.length;
      avgPenalties = avgPenaltiesPerHole * currentHolesPlayed;
    }

    // Fetch strokes gained for last 5 rounds and normalize per hole
    const last5SGs = await prisma.roundStrokesGained.findMany({
      where: { roundId: { in: last5Rounds.map(r => r.id) } },
    });

    // Create a map of roundId to holes played for SG normalization
    const roundHolesMap = new Map(last5Rounds.map(r => [r.id, r.tee.numberOfHoles || 18]));

    const validSgResults = last5SGs.filter((sg) => sg && sg.sgTotal !== null);

    if (validSgResults.length) {
      // Normalize each SG value by holes played, then scale to current round
      const sumSGPerHole = (fn: (sg: any) => number) => {
        return validSgResults.reduce((sum, sg) => {
          const holesPlayed = roundHolesMap.get(sg.roundId) || 18;
          return sum + (fn(sg) / holesPlayed);
        }, 0) / validSgResults.length;
      };

      avgSgTotal = sumSGPerHole((sg) => sg.sgTotal || 0) * currentHolesPlayed;
      avgSgOffTee = sumSGPerHole((sg) => sg.sgOffTee || 0) * currentHolesPlayed;
      avgSgApproach = sumSGPerHole((sg) => sg.sgApproach || 0) * currentHolesPlayed;
      avgSgPutting = sumSGPerHole((sg) => sg.sgPutting || 0) * currentHolesPlayed;
      avgSgPenalties = sumSGPerHole((sg) => sg.sgPenalties || 0) * currentHolesPlayed;
      avgSgResidual = sumSGPerHole((sg) => sg.sgResidual || 0) * currentHolesPlayed;
    }
  }

  const strokesGainedPayload: any = {};
    if (sgComponents.sgTotal != null) strokesGainedPayload.total = sgComponents.sgTotal;
    if (sgComponents.sgOffTee != null) strokesGainedPayload.off_tee = sgComponents.sgOffTee;
    if (sgComponents.sgApproach != null) strokesGainedPayload.approach = sgComponents.sgApproach;
    if (sgComponents.sgPutting != null) strokesGainedPayload.putting = sgComponents.sgPutting;
    if (sgComponents.sgPenalties != null) strokesGainedPayload.penalties = sgComponents.sgPenalties;
    if (sgComponents.sgResidual != null) strokesGainedPayload.residual = sgComponents.sgResidual;

  const payload = {
    context: { product: 'GolfIQ', insight_type: 'post_round', user_tier: 'premium' },
    round: {
      score: round.score,
      to_par: round.score - (round.tee.parTotal || 72),
      handicap_at_round: round.handicapAtRound ? Number(round.handicapAtRound) : null,
      course: {
        par: round.tee.parTotal || 72,
        rating: round.tee.courseRating ? Number(round.tee.courseRating) : null,
        slope: round.tee.slopeRating || null,
        holes_played: round.tee.numberOfHoles || 18,
        non_par3_holes: round.tee.nonPar3Holes || 14,
      },
      stats: { 
        fir_hit: round.firHit, 
        gir_hit: round.girHit, 
        putts: round.putts, 
        penalties: round.penalties
      },
      strokes_gained: strokesGainedPayload,
      confidence: {
        overall: sgComponents.confidence,
        diagnostics: sgComponents.messages,
        partial_analysis: sgComponents.partialAnalysis,
      },
    },
    history: last5Rounds.length
      ? {
          last_5_rounds: {
            average_score: avgScore,
            average_to_par: avgToPar,
            average_fir_pct: avgFirPct,
            average_gir_pct: avgGirPct,
            average_putts: avgPutts,
            average_penalties: avgPenalties,
            average_strokes_gained: {
              total: avgSgTotal,
              off_tee: avgSgOffTee,
              approach: avgSgApproach,
              putting: avgSgPutting,
              penalties: avgSgPenalties,
              residual: avgSgResidual,
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
    output_constraints: {
      max_insights: 3,
      tone: 'motivational',
      avoid_hole_by_hole: true,
      focus_on_actionable: true,
      respect_confidence: true,
    },
  };

const systemPrompt = `You are a supportive golf performance analyst inside a consumer golf app, generating post-round insights for premium users.

ROLE & EXPECTATIONS:
- Analyze rounds using only the provided, non-null data.
- Be positive, encouraging, and motivational in tone, even for tough rounds.
- Generate EXACTLY THREE insights in this order:
  1. Best performing area (always positive in framing)
  2. What is costing the most strokes OR the second-best strength
  3. Actionable recommendation with real-life practice guidance (always encouraging)

🚨 OUTPUT FORMAT IS STRICT 🚨
- Output EXACTLY 3 messages
- Each message MUST:
  - Start with an emoji (🔥, ✅, ⚠️, or ℹ️)
  - Be plain text only
- DO NOT include headings, labels, numbering, markdown, or explanations
- Any format violation makes the output INVALID

EMOJI RULES (HARD CONSTRAINTS):
- 🔥 = exceptional performance
  - MUST be used in Message 1 if total strokes gained is STRICTLY greater than +2.0
  - MUST be used in Message 1 if the best-performing individual SG component is STRICTLY greater than +2.0
- ✅ = solid or encouraging performance
  - MUST be used in Message 1 when total SG is LESS THAN OR EQUAL TO -2.0
- ⚠️ = clear weakness
  - MAY ONLY be used if at least one individual strokes gained component is STRICTLY less than -1.0
  - If no such value exists, ⚠️ is FORBIDDEN anywhere
- ℹ️ = actionable recommendation
  - MUST be used for Message 3

PRIMARY DECISION LOGIC (FOLLOW IN THIS ORDER):
1. Evaluate total strokes gained.
2. - When determining the component that “cost the most strokes,” consider ALL individual strokes gained components (off_tee, approach, putting, penalties). 
  - Select the component with the **most negative value**, even if it is penalties. 
  - Residual is ignored.
3. Determine Message 2 content using the rules below.

MESSAGE 1 LOGIC (BEST PERFORMING AREA):
- Always positive in tone.
- If total SG > +2.0, Message 1 MUST use 🔥.
- If total SG ≤ -2.0, Message 1 MUST use ✅ and avoid exaggerated praise.
- If no individual SG exists, focus on overall round context.

MESSAGE 2 LOGIC (STRICT):
- If ONE OR MORE individual strokes gained components are STRICTLY less than -1.0:
  - Message 2 MUST highlight the SINGLE MOST NEGATIVE component (most negative value).
  - Message 2 MUST use ⚠️.
  - This message represents what is holding the round back or costing the most strokes.
- If NO individual strokes gained component is less than -1.0:
  - Message 2 MUST highlight the second-best strokes gained stat or another clear positive.
  - Message 2 MUST use ✅ or 🔥.
  - Message 2 MUST NOT include advice, critique, or improvement language.

MESSAGE 3 LOGIC (ACTIONABLE):
- MUST use ℹ️.
- Always encouraging.
- May include practice drills, reinforcement, or maintenance guidance.
- Must NOT imply poor performance unless Message 2 identified a true weakness (SG < -1.0).

CRITICAL CONSTRAINTS:
- Never repeat the same area in Messages 1 and 2.
- Never reference strokes gained residual.
- Any SG value between -1.0 and +1.0 is expected variance and MUST NOT be framed as a weakness.
- Do NOT provide coaching or cautionary language unless SG < -1.0.
- Use course difficulty context only if rating > 73 or slope > 130.
- If analysis confidence is medium or low, gently note possible data gaps.
- Message 1 MUST NEVER use ⚠️.
- Message 1 MUST always use 🔥 or ✅ only.
- If total strokes gained ≤ -5.0:
  - Do NOT praise raw stats (FIR, GIR, putts).
  - Message 2 MUST be the most costly strokes gained component.

FORBIDDEN:
- Negative or cautionary language for any SG ≥ -1.0.
- Using 🔥 when total SG ≤ -2.0.
- Using ⚠️ when no individual SG < -1.0 exists.
- Inventing, exaggerating, or guessing data.

🔥 is factual recognition of exceptional performance, not exaggeration. When thresholds are met, enthusiastic praise is REQUIRED.`;

const userPrompt = `Generate post-round performance messages for a premium user.
DECISION LOGIC (MUST BE FOLLOWED IN ORDER):
1. Check all individual strokes gained components.
2. If ANY component < -1.0:
   - Message 2 highlights ONLY that area and uses ⚠️.
3. If NO component < -1.0:
   - Message 2 MUST be positive.
   - Message 2 MUST use ✅ or 🔥.
   - Message 2 MUST NOT imply improvement is needed.

🚨 OUTPUT REMINDER 🚨
- Output EXACTLY 3 messages
- Each message MUST start with an emoji
- Do NOT include headings, labels, numbering, or markdown

INPUT STRUCTURE:
- round.score = total score this round
- round.to_par = score relative to par
- round.stats.fir_hit = total fairways hit (not percentage)
- round.stats.gir_hit = total greens in regulation (not percentage)
- round.stats.putts = total putts
- round.stats.penalties = total penalties
- round.strokes_gained.* = strokes gained values for total, off_tee, approach, putting, penalties, residual
- history.last_5_rounds.average_* = averages from last 5 rounds
- round.course.rating, round.course.slope = course difficulty
- round.confidence.overall = "high", "medium", "low", or null
- round.confidence.partial_analysis = true/false
- round.confidence.advanced_stats_logged = true/false

NULL & MISSING DATA HANDLING:
- Only reference strokes gained components present in the payload.
- Do NOT reference residual.
- If total SG exists but individual components do not, focus on overall performance and encourage tracking more stats for deeper insights.
- If partial_analysis = true, do NOT attribute specific performance to SG components; focus on overall round and encouragement.
- If confidence.medium or low, mention that some stats may be inflated or missing.
- Compare stats to last 5 rounds averages when it helps provide context or encouragement.
- Always maintain positive and motivational language, even for tough rounds.

INSIGHT RULES:
- Generate exactly 3 messages in order:
  1. BEST performing area
  2. - ONLY an area needing work IF an individual strokes gained component is STRICTLY < -1.0.
     - OTHERWISE, this message MUST highlight another positive strength or solid performance.
     - Negative, cautionary, or improvement-oriented language is FORBIDDEN unless SG < -1.0.
  3. may include general maintenance, skill reinforcement, or trend-based practice even if no weaknesses exist.
- Actionable advice must not imply poor performance unless a true weakness (SG < -1.0) was identified.
- Avoid repeating areas across messages.
- Include course difficulty context when course rating > 73 or slope > 130 only. Do not mention course difficulty if these conditions are not met.
- Use numbers/statistics moderately; when meaningful to context or comparison

OUTPUT RULES:
- Each message: max 3 sentences
- Plain text only
- No headings, labels, or formatting
- Focus on clarity, encouragement, and actionable advice
- Do NOT invent any missing data or exaggerate results

${JSON.stringify(payload, null, 2)}`;


  // Call OpenAI API
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${OPENAI_API_KEY}` },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: userPrompt }],
      max_tokens: 600,
      temperature: 0.7,
    }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(`OpenAI API error: ${error.error?.message || 'Unknown error'}`);
  }

  const data = await response.json();
  const content = data.choices?.[0]?.message?.content;

  if (!content) {
    throw new Error('No insights generated from OpenAI');
  }

  // Parse the response into structured format
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

  // Store in database
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
