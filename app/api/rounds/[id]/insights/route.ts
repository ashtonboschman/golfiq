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

  const last5Rounds = await prisma.round.findMany({
    where: { userId, id: { not: roundId } },
    orderBy: { date: 'desc' },
    take: 5,
    include: { tee: true },
  });

  // Averages
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
    avgSgResidual = null;

  if (last5Rounds.length) {
    avgScore = last5Rounds.reduce((sum, r) => sum + r.score, 0) / last5Rounds.length;
    avgToPar = last5Rounds.reduce((sum, r) => sum + (r.score - (r.tee.parTotal || 72)), 0) / last5Rounds.length;

    const roundsWithFir = last5Rounds.filter((r) => r.firHit !== null && r.tee.nonPar3Holes);
    if (roundsWithFir.length)
      avgFirPct = roundsWithFir.reduce((sum, r) => sum + ((r.firHit || 0) / (r.tee.nonPar3Holes || 14)) * 100, 0) / roundsWithFir.length;

    const roundsWithGir = last5Rounds.filter((r) => r.girHit !== null && r.tee.numberOfHoles);
    if (roundsWithGir.length)
      avgGirPct = roundsWithGir.reduce((sum, r) => sum + ((r.girHit || 0) / (r.tee.numberOfHoles || 18)) * 100, 0) / roundsWithGir.length;

    const roundsWithPutts = last5Rounds.filter((r) => r.putts !== null);
    if (roundsWithPutts.length)
      avgPutts = roundsWithPutts.reduce((sum, r) => sum + (r.putts || 0), 0) / roundsWithPutts.length;

    const roundsWithPenalties = last5Rounds.filter((r) => r.penalties !== null);
    if (roundsWithPenalties.length)
      avgPenalties = roundsWithPenalties.reduce((sum, r) => sum + (r.penalties || 0), 0) / roundsWithPenalties.length;

    const last5SGs = await prisma.roundStrokesGained.findMany({
      where: { roundId: { in: last5Rounds.map(r => r.id) } },
    });
    const validSgResults = last5SGs.filter((sg) => sg && sg.sgTotal !== null);

    if (validSgResults.length) {
      const sumSG = (fn: (sg: any) => number) => validSgResults.reduce((sum, sg) => sum + fn(sg), 0) / validSgResults.length;
      avgSgTotal = sumSG((sg) => sg.sgTotal || 0);
      avgSgOffTee = sumSG((sg) => sg.sgOffTee || 0);
      avgSgApproach = sumSG((sg) => sg.sgApproach || 0);
      avgSgPutting = sumSG((sg) => sg.sgPutting || 0);
      avgSgResidual = sumSG((sg) => sg.sgResidual || 0);
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
      stats: { fir_hit: round.firHit, gir_hit: round.girHit, putts: round.putts, penalties: round.penalties },
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
              residual: avgSgResidual,
            },
          },
          best_score: Math.min(...last5Rounds.map((r) => r.score)),
          worst_score: Math.max(...last5Rounds.map((r) => r.score)),
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

  const systemPrompt = `You are a golf performance analyst inside a consumer golf app, generating post-round insights for premium users.

ROLE & EXPECTATIONS:
- Analyze rounds using only the provided, non-null data.
- Do NOT calculate, estimate, or invent missing values.
- Use previous rounds for trends only if the metric exists in both current and historical rounds.
- Highlight positives, weaknesses, and actionable recommendations in exactly three messages.
- Insights must be personal and specific to this round.

CONFIDENCE & EMOJIS:
- 🔥 = exceptional/high impact positive (assertive language)
- ✅ = solid/good performance (contextual language)
- ⚠️ = major concern / needs work (always for SG < -2.0)
- ℹ️ = observations or low confidence / tracking recommendations

FORMAT:
[emoji] [2-3 complete sentences about this round]
[emoji] [2-3 complete sentences about this round]
[emoji] [2-3 complete sentences actionable practice recommendation]

RULES:
- Each insight: 2-3 complete sentences.
- Reference numbers/statistics only when it clarifies the insight.
- Do NOT use double dashes (--) or add headings, metadata, or extra commentary.
- Always return exactly three insights; if data is missing, use observations instead.
`;

  const userPrompt = `Generate post-round performance messages for a premium user. 

INPUT:
- score, to_par, course details (always present)
- stats: fir_hit, gir_hit, putts, penalties (may be null)
- strokes_gained: sgTotal, sgOffTee, sgApproach, sgPutting, sgResidual (may be null)
- confidence: "high", "medium", "low"
- partialAnalysis: boolean (true = incomplete data)
- history: last 5 rounds (may be null)

NULL HANDLING:
- If a stat is null, it was NOT tracked. Do NOT mention it.
- Only recommend tracking advanced stats (fir_hit, gir_hit, putts, penalties) if ALL are null.
- Only mention strokes gained if the value exists.
- Use descriptive stats (percentages, counts) instead of SG when SG magnitude ≤ 1.0.

STROKES GAINED THRESHOLDS:
| SG Value          | Insight Type                  |
|------------------|-------------------------------|
| < -2.0           | ⚠️ Major loss (must mention)  |
| -2.0 to -1.0     | ⚠️ Minor concern               |
| -1.0 to 1.0      | Use stat or % instead          |
| > 1.0            | 🔥 Positive                    |

ANALYSIS ORDER:
1. Identify largest stroke losses (most negative SG values).
2. If any SG < -2.0 → first insight MUST address this major loss with ⚠️.
3. Highlight strongest positive areas (SG > 1.0 or high percentages).
4. Provide actionable recommendations based on biggest weaknesses or trend declines.
5. Compare to history only for metrics that exist in both current and past rounds.

OUTPUT RULES:
- Exactly three messages: 
   1. Positive / strengths (or minor positives if round was poor)
   2. Weaknesses / stroke losses
   3. Actionable practice recommendations
- Insights must be personal, reference numbers when relevant, and specific to this round.
- Do NOT recommend tracking stats if they were already tracked.
- Follow confidence mapping from system prompt.

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
