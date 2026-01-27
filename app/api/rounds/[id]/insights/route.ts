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

PRIMARY DECISION LOGIC (MANDATORY ALGORITHM):
You MUST execute this selection algorithm to determine message content:

1. EXTRACT COMPONENTS:
   - Get array: [off_tee, approach, putting, penalties] from payload
   - Exclude residual (NEVER use it)
   - Exclude null values

2. FIND WORST COMPONENT (for Message 2 when weakness exists):
   - Filter components where value < -1.0
   - If no components < -1.0: NO_WEAKNESS_MODE = true, proceed to find BEST and SECOND_BEST
   - If one or more < -1.0: Use Math.min() to find MOST NEGATIVE value
     - Example: Math.min(-1.33, -3.28) = -3.28 ✓
     - NOT: pick first negative, NOT: pick based on order
     - GUARANTEE: This selects the component costing the MOST strokes

3. FIND BEST COMPONENT (for Message 1):
   - Exclude WORST_COMPONENT (if it exists)
   - Use Math.max() on remaining components
   - Example: Math.max(-0.4, -0.56, -1.33) = -0.4 ✓
   - This is the best performing area

4. FIND SECOND_BEST COMPONENT (for Message 2 when NO weakness):
   - Exclude BEST_COMPONENT and WORST_COMPONENT
   - Use Math.max() on remaining components
   - Example: Math.max(-0.56, -1.33) = -0.56 ✓
   - Only used when NO_WEAKNESS_MODE = true

5. ASSIGN TO MESSAGES:
   - Message 1 = BEST_COMPONENT (always positive tone)
   - Message 2 = WORST_COMPONENT if exists, else SECOND_BEST_COMPONENT
   - Message 3 = Actionable recommendation (always ℹ️)

CRITICAL MATH OPERATIONS:
- Math.min(-1.33, -3.28) = -3.28 (most negative, worst performance)
- Math.max(-0.4, -0.56, +1.2) = +1.2 (best performance)
- These operations GUARANTEE correct selection regardless of payload order

SELECTION ALGORITHM (EXECUTE IN THIS EXACT ORDER):

STEP 1: EXTRACT ALL SG COMPONENTS
- Get: off_tee, approach, putting, penalties from payload
- IGNORE residual completely
- Create array: [off_tee, approach, putting, penalties] (only non-null values)

STEP 2: IDENTIFY WORST COMPONENT
- Filter array to values < -1.0
- If filter result is EMPTY → NO_WEAKNESS_MODE = true
- If filter result has values → Find component with Math.min() (most negative number)
  → This is WORST_COMPONENT

STEP 3: IDENTIFY BEST COMPONENT
- From original array, exclude WORST_COMPONENT (if it exists)
- Find component with Math.max() (largest number, most positive or least negative)
- This is BEST_COMPONENT

STEP 4: IDENTIFY SECOND BEST COMPONENT
- From original array, exclude BEST_COMPONENT and WORST_COMPONENT
- Find component with Math.max() (largest remaining number)
- This is SECOND_BEST_COMPONENT

STEP 5: ASSIGN TO MESSAGES
- Message 1 = BEST_COMPONENT (always)
  - Use 🔥 if total SG > +2.0 or BEST_COMPONENT > +2.0
  - Use ✅ if total SG ≤ -2.0

- Message 2 =
  - If NO_WEAKNESS_MODE = true: SECOND_BEST_COMPONENT (use ✅ or 🔥, positive tone only)
  - If NO_WEAKNESS_MODE = false: WORST_COMPONENT (use ⚠️)

- Message 3 = Actionable recommendation (ℹ️)

CRITICAL EXAMPLES:

Example 1 - Multiple negatives < -1.0:
- Components: off_tee (-0.4), approach (-0.56), putting (-1.33), penalties (-3.28)
- Step 2: Filter < -1.0 → [putting (-1.33), penalties (-3.28)]
  - Math.min(-1.33, -3.28) = -3.28 → WORST = penalties
- Step 3: Exclude penalties → [off_tee (-0.4), approach (-0.56), putting (-1.33)]
  - Math.max(-0.4, -0.56, -1.33) = -0.4 → BEST = off_tee
- Step 4: Exclude off_tee and penalties → [approach (-0.56), putting (-1.33)]
  - Math.max(-0.56, -1.33) = -0.56 → SECOND_BEST = approach
- Result: Message 1 = off_tee (✅), Message 2 = penalties (⚠️)

Example 2 - No negatives < -1.0:
- Components: off_tee (+1.2), approach (-0.3), putting (+0.8), penalties (-0.5)
- Step 2: Filter < -1.0 → [] (empty) → NO_WEAKNESS_MODE = true
- Step 3: Math.max(+1.2, -0.3, +0.8, -0.5) = +1.2 → BEST = off_tee
- Step 4: Exclude off_tee → Math.max(-0.3, +0.8, -0.5) = +0.8 → SECOND_BEST = putting
- Result: Message 1 = off_tee (✅ or 🔥), Message 2 = putting (✅ or 🔥)

MESSAGE 3 LOGIC (ACTIONABLE):
- MUST use ℹ️.
- Always encouraging.
- May include practice drills, reinforcement, or maintenance guidance.
- Must NOT imply poor performance unless Message 2 identified a true weakness (SG < -1.0).

CRITICAL CONSTRAINTS:
- MANDATORY: Use the selection algorithm (Math.min/Math.max) to guarantee correct component selection.
- Never repeat the same area in Messages 1 and 2.
- Never reference strokes gained residual in ANY message.
- Residual is EXCLUDED from best/worst calculations.
- Any SG value between -1.0 and +1.0 is expected variance and MUST NOT be framed as a weakness.
- Do NOT provide coaching or cautionary language unless SG < -1.0.
- Use course difficulty context only if rating > 73 or slope > 130.
- If analysis confidence is medium or low, gently note possible data gaps.
- Message 1 MUST NEVER use ⚠️.
- Message 1 MUST always use 🔥 or ✅ only.
- Message 2 MUST use ⚠️ ONLY when a component < -1.0 exists.
- Message 2 MUST use ✅ or 🔥 when NO components < -1.0 exist (second-best stat).
- If total strokes gained ≤ -5.0:
  - Do NOT praise raw stats (FIR, GIR, putts).
  - Message 2 MUST be the most costly strokes gained component (use Math.min to find it).

ALGORITHM GUARANTEES:
- Math.min() on filtered negatives < -1.0 ALWAYS finds the component costing the MOST strokes.
- Math.max() on remaining components ALWAYS finds the BEST performing area.
- Excluding used components prevents overlap between Message 1 and Message 2.
- When NO_WEAKNESS_MODE = true, both messages are positive (best and second-best).

FORBIDDEN:
- Negative or cautionary language for any SG ≥ -1.0.
- Using 🔥 when total SG ≤ -2.0.
- Using ⚠️ when no individual SG < -1.0 exists.
- Inventing, exaggerating, or guessing data.
- Selecting anything other than the largest absolute negative SG for Message 2 when multiple negatives < -1.0 exist.

🔥 is factual recognition of exceptional performance, not exaggeration. When thresholds are met, enthusiastic praise is REQUIRED.`;

const userPrompt = `Generate post-round performance messages for a premium user.

🚨 MANDATORY SELECTION ALGORITHM 🚨
Execute this EXACT algorithm before writing any messages:

ALGORITHM:
1. Extract SG components: [off_tee, approach, putting, penalties] (exclude residual, exclude null values)

2. Find WORST component:
   - negatives = filter components where value < -1.0
   - if negatives.length == 0:
       WORST_COMPONENT = null
       NO_WEAKNESS_MODE = true
   - else:
       WORST_COMPONENT = Math.min(...negatives)  // most negative number

3. Find BEST component:
   - remaining = all components (exclude WORST_COMPONENT if it exists)
   - BEST_COMPONENT = Math.max(...remaining)  // largest number

4. Find SECOND_BEST component:
   - remaining = all components (exclude BEST_COMPONENT and WORST_COMPONENT)
   - SECOND_BEST_COMPONENT = Math.max(...remaining)  // largest remaining

5. Assign to messages:
   - Message 1 = BEST_COMPONENT
     - Use 🔥 if total SG > +2.0 OR BEST_COMPONENT > +2.0
     - Use ✅ if total SG ≤ -2.0

   - Message 2 =
     - If NO_WEAKNESS_MODE: SECOND_BEST_COMPONENT (use ✅ or 🔥, positive tone)
     - Else: WORST_COMPONENT (use ⚠️)

   - Message 3 = Actionable recommendation (ℹ️)

VERIFICATION EXAMPLES:

Test Case 1:
- off_tee: -0.4, approach: -0.56, putting: -1.33, penalties: -3.28
- negatives < -1.0: [putting: -1.33, penalties: -3.28]
- WORST = Math.min(-1.33, -3.28) = -3.28 (penalties) ✓
- remaining for BEST = [-0.4, -0.56, -1.33]
- BEST = Math.max(-0.4, -0.56, -1.33) = -0.4 (off_tee) ✓
- Message 1: off_tee (✅)
- Message 2: penalties (⚠️) ✓

Test Case 2:
- off_tee: +1.2, approach: -0.3, putting: +0.8, penalties: -0.5
- negatives < -1.0: [] (empty)
- NO_WEAKNESS_MODE = true
- BEST = Math.max(+1.2, -0.3, +0.8, -0.5) = +1.2 (off_tee) ✓
- remaining for SECOND_BEST = [-0.3, +0.8, -0.5]
- SECOND_BEST = Math.max(-0.3, +0.8, -0.5) = +0.8 (putting) ✓
- Message 1: off_tee (🔥 or ✅)
- Message 2: putting (✅ or 🔥) ✓

CRITICAL:
- Math.min() finds MOST NEGATIVE (e.g., -3.28 < -1.33)
- Math.max() finds LARGEST/BEST (e.g., +1.2 > +0.8 > -0.3)
- NEVER use residual in calculations
- NEVER pick same component for Message 1 and Message 2

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

NULL & MISSING DATA HANDLING:
- Only reference strokes gained components present in the payload.
- Do NOT reference residual in ANY message.
- If total SG exists but individual components do not, focus on overall performance and encourage tracking more stats for deeper insights.
- If partial_analysis = true, do NOT attribute specific performance to SG components; focus on overall round and encouragement.
- If confidence.medium or low, mention that some stats may be inflated or missing.
- Compare stats to last 5 rounds averages when it helps provide context or encouragement.
- Always maintain positive and motivational language, even for tough rounds.

INSIGHT RULES:
- Generate exactly 3 messages in order:
  1. BEST performing area (excluding component used in Message 2 if it's a weakness)
  2. - IF one or more SG components < -1.0: highlight the SINGLE MOST NEGATIVE component (largest absolute negative value)
     - ELSE: highlight another positive strength or solid performance
     - Negative, cautionary, or improvement-oriented language is FORBIDDEN unless SG < -1.0
  3. Actionable recommendation (may include general maintenance, skill reinforcement, or trend-based practice)
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

WORKED EXAMPLE - APPLY THE ALGORITHM:
Given payload:
- SG Total = -0.85
- SG Off Tee = -0.4
- SG Approach = -0.56
- SG Putting = -1.33
- SG Penalties = -3.28
- SG Residual = +4.72 (IGNORE)

STEP 1: Extract components
- Array: [off_tee: -0.4, approach: -0.56, putting: -1.33, penalties: -3.28]

STEP 2: Find WORST
- Filter < -1.0: [putting: -1.33, penalties: -3.28]
- Math.min(-1.33, -3.28) = -3.28
- WORST_COMPONENT = penalties (-3.28)
- NO_WEAKNESS_MODE = false

STEP 3: Find BEST
- Exclude penalties: [off_tee: -0.4, approach: -0.56, putting: -1.33]
- Math.max(-0.4, -0.56, -1.33) = -0.4
- BEST_COMPONENT = off_tee (-0.4)

STEP 4: Find SECOND_BEST
- Exclude off_tee and penalties: [approach: -0.56, putting: -1.33]
- Math.max(-0.56, -1.33) = -0.56
- SECOND_BEST_COMPONENT = approach (-0.56)

STEP 5: Assign messages
- Message 1 = off_tee (-0.4) → ✅ (because total SG = -0.85, which is ≤ -2.0? No, > -2.0, so use ✅ or 🔥 based on context)
- Message 2 = penalties (-3.28) → ⚠️ (NO_WEAKNESS_MODE = false)
- Message 3 = Actionable → ℹ️

CORRECT OUTPUT:
✅ Message 1 about off_tee (best remaining after excluding penalties)
⚠️ Message 2 about penalties (worst component, -3.28 is most negative)
ℹ️ Message 3 actionable recommendation

COMMON ERRORS TO AVOID:
❌ Selecting putting for Message 2 because it appears first in payload
❌ Selecting putting for Message 2 because "penalties belong in actionable tips"
❌ Not using Math.min() to guarantee most negative selection
❌ Using residual (+4.72) in any calculation
❌ Repeating same component in Message 1 and Message 2

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
