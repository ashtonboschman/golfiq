// lib/utils/strokesGained.ts
import { Prisma, PrismaClient } from "@prisma/client";
import { SG_COEFFICIENTS as C } from "./strokesGainedCoefficients";

export type SGComponents = {
  sgTotal: number | null;
  sgOffTee: number | null;
  sgApproach: number | null;
  sgPutting: number | null;
  sgPenalties: number | null;
  sgResidual: number | null;
  confidence: "high" | "medium" | "low" | null;
  messages: string[];
  partialAnalysis: boolean;
};

interface SGInputs {
  userId: bigint;
  roundId: bigint;
}

const round2 = (num: number) => Math.round(num * 100) / 100;

// Allow injection of Prisma client (for testing)
export async function calculateStrokesGained(
  { userId, roundId }: SGInputs,
  prisma: PrismaClient
): Promise<SGComponents> {
  // Fetch round data
  const round = await prisma.round.findUnique({
    where: { id: roundId },
    include: { tee: true },
  });
  if (!round) throw new Error("Round not found");

  if (round.handicapAtRound === null) {
    return {
      sgTotal: null,
      sgOffTee: null,
      sgApproach: null,
      sgPutting: null,
      sgPenalties: null,
      sgResidual: null,
      confidence: null,
      partialAnalysis: true,
      messages: [],
    };
  }

  // Fetch all baselines for interpolation
  const allBaselines = await prisma.handicapTierBaseline.findMany({
    orderBy: { handicapMin: "asc" },
  });
  if (!allBaselines.length) throw new Error("No baseline tiers found");

  const handicap = Number(round.handicapAtRound);

  // Find current tier and adjacent tiers
  const currentTierIndex = allBaselines.findIndex(
    (b) => handicap >= Number(b.handicapMin) && handicap <= Number(b.handicapMax)
  );
  if (currentTierIndex === -1) throw new Error("Baseline not found for handicap tier");

  const currentTier = allBaselines[currentTierIndex];
  const prevTier = currentTierIndex > 0 ? allBaselines[currentTierIndex - 1] : null;
  const nextTier = currentTierIndex < allBaselines.length - 1 ? allBaselines[currentTierIndex + 1] : null;

 // Helper: Interpolate a baseline value based on handicap position
  const interpolateBaseline = (getValue: (tier: any) => number): number => {
    const h = handicap;

    const curMin = Number(currentTier.handicapMin);
    const curMax = Number(currentTier.handicapMax);
    const curValue = getValue(currentTier);

    const isEliteTier = curMin <= -5 && curMax <= 1;

    console.log("INTERPOLATION:", {
      handicap: h,
      tier: { min: curMin, max: curMax },
      eliteLocked: isEliteTier,
    });

    /**
     * 🔒 ELITE / SCRATCH LOCK
     * Do NOT interpolate elite players toward worse tiers.
     * They may only interpolate within the elite band.
     */
    if (isEliteTier) {
      return curValue;
    }

    /**
     * Interpolate toward LOWER handicap tier (better player)
     */
    if (h < curMin && prevTier) {
      const prevMin = Number(prevTier.handicapMin);
      const prevMax = Number(prevTier.handicapMax);

      const ratio =
        (curMin - h) / (curMin - prevMax); // normalize across boundary

      const prevValue = getValue(prevTier);

      return curValue + ratio * (prevValue - curValue);
    }

    /**
     * Interpolate toward HIGHER handicap tier (worse player)
     */
    if (h > curMax && nextTier) {
      const nextMin = Number(nextTier.handicapMin);
      const nextMax = Number(nextTier.handicapMax);

      const ratio =
        (h - curMax) / (nextMin - curMax); // normalize across boundary

      const nextValue = getValue(nextTier);

      return curValue + ratio * (nextValue - curValue);
    }

    /**
     * Inside tier → return baseline
     */
    return curValue;
  };

  // Interpolate baseline values (these are for 18-hole rounds)
  const baselineScore18 = interpolateBaseline((t) => Number(t.baselineScore));
  const baselineFIR = interpolateBaseline((t) => Number(t.baselineFIRPct));
  const baselineGIR = interpolateBaseline((t) => Number(t.baselineGIRPct));
  const baselinePutts18 = interpolateBaseline((t) => Number(t.baselinePutts));
  const baselinePenalties18 = interpolateBaseline((t) => Number(t.baselinePenalties));

  const totalHoles = round.tee.numberOfHoles || 18;
  const nonPar3Holes = round.tee.nonPar3Holes;
  const courseRating = round.tee.courseRating !== null ? Number(round.tee.courseRating) : 72;
  const slope = round.tee.slopeRating || 113;

  // Scale baselines for 9-hole rounds (database baselines are for 18 holes)
  const holeScaling = totalHoles / 18;
  const baselineScore = baselineScore18 * holeScaling;
  const baselinePutts = baselinePutts18 * holeScaling;
  const baselinePenalties = baselinePenalties18 * holeScaling;
  // FIR% and GIR% don't scale - they're percentages

  // Course difficulty adjustment (based on how much harder/easier than neutral)
  // Neutral course: rating 72 for 18 holes (36 for 9), slope 113
  const neutralRating = 72 * holeScaling;
  const neutralSlope = 113;
  const ratingWeight = Math.max(0.3, Math.min(1.0, (handicap + 5) / 10));

  // Course difficulty adjustment components
  // Difficulty = how much harder the course is than neutral
  const ratingDelta = (courseRating - neutralRating) * ratingWeight;
  const slopeDelta = handicap * ((slope / neutralSlope) - 1);
  const courseDiffAdj = ratingDelta + slopeDelta;

  // Course expected score (baseline + course adjustment)
  const courseExpectedScore = baselineScore + courseDiffAdj;

  // Adjusted expected stats (baseline adjusted for course difficulty)
  const adjScore = courseExpectedScore;

  // Calculate adjusted percentages with clamping (0-100)
  const adjFIRPct = Math.max(0, Math.min(100, baselineFIR - (courseDiffAdj * C.COURSE_DIFF_TO_FIR_PCT)));
  const adjGIRPct = Math.max(0, Math.min(100, baselineGIR - (courseDiffAdj * C.COURSE_DIFF_TO_GIR_PCT)));

  // Convert percentages to hole counts
  const adjFIR = (adjFIRPct / 100) * nonPar3Holes;
  const adjGIR = (adjGIRPct / 100) * totalHoles;

  // Adjusted putts and penalties
  const adjPutts = baselinePutts + courseDiffAdj * C.COURSE_DIFF_TO_PUTTS;
  const adjPenalties = Math.max(0, baselinePenalties + courseDiffAdj * C.COURSE_DIFF_TO_PENALTIES);

  // Actual round stats
  const actualScore = round.score;
  const actualFIR = round.firHit ?? null;
  const actualGIR = round.girHit ?? null;
  const actualPutts = round.putts ?? null;
  const actualPenalties = round.penalties ?? null;

  const sgTotal = adjScore - actualScore;
  const messages: string[] = [];
  const partialAnalysis =
    actualFIR === null || actualGIR === null || actualPutts === null || actualPenalties === null;

  const puttingCap = (totalHoles / 18) * C.PUTTING_CAP;

  // --- Compute each SG component if data exists ---
  const sgComponentsMap: Record<string, number | null> = {
    offTee: actualFIR !== null ? (actualFIR - adjFIR) * C.STROKES_PER_FIR : null,
    approach: actualGIR !== null ? (actualGIR - adjGIR) * C.STROKES_PER_GIR : null,
    putting:
      actualPutts !== null
        ? (() => {
            const diff = adjPutts - actualPutts;
            if (Math.abs(diff) > puttingCap) {
              messages.push(
                `Extreme putting (capped at ±${puttingCap.toFixed(2)} strokes)`
              );
              return Math.sign(diff) * (puttingCap + (Math.abs(diff) - puttingCap) * 0.5);
            }
            return diff;
          })()
        : null,
    penalties: actualPenalties !== null ? (adjPenalties - actualPenalties) * C.STROKES_PER_PENALTY : null,
  };

  if (partialAnalysis) {
    messages.push("Partial analysis: missing FIR, GIR, Putts, or Penalties");
  }

  // --- Residual always fills remainder ---
  const knownSGSum = Object.values(sgComponentsMap)
    .filter((v): v is number => v !== null)
    .reduce((sum, v) => sum + v, 0);
  const sgResidual = sgTotal - knownSGSum;

  // --- Overall Confidence Calculation ---
  const shortGameOpps = actualGIR !== null ? totalHoles - actualGIR : 0;
  let confidence: "high" | "medium" | "low" = "low"; // default low
  const essentialDataMissing =
    actualGIR === null || actualPutts === null || actualPenalties === null;

  if (essentialDataMissing) {
    confidence = "low";
    messages.push("Missing essential data reduces overall confidence");
  } else {
    const puttingValue = sgComponentsMap.putting ?? 0;

    // Residual check
    const residualHigh = Math.abs(sgResidual) < C.CONFIDENCE_RESIDUAL_HIGH;

    // Short game opportunities check
    const shortGameHigh = shortGameOpps >= totalHoles * C.CONFIDENCE_SHORTGAME_HIGH_PCT;
    const shortGameMedium =
      shortGameOpps >= totalHoles * C.CONFIDENCE_SHORTGAME_MEDIUM_MIN_PCT &&
      shortGameOpps <= totalHoles * C.CONFIDENCE_SHORTGAME_MEDIUM_MAX_PCT;

    // Putting check
    const puttingHigh = Math.abs(puttingValue) <= puttingCap * C.CONFIDENCE_PUTTING_HIGH_PCT;
    const puttingMedium =
      Math.abs(puttingValue) > puttingCap * C.CONFIDENCE_PUTTING_HIGH_PCT &&
      Math.abs(puttingValue) <= puttingCap;

    // --- Determine confidence ---
    if (residualHigh && shortGameHigh && puttingHigh) {
      confidence = "high";
    } else if (residualHigh || shortGameMedium || puttingMedium) {
      confidence = "medium";
      messages.push("Short game estimate based on residual calculation - interpret with context");

      if (shortGameMedium) {
        messages.push(
          `Only ${shortGameOpps} short game opportunities - moderate confidence`
        );
      }

      if (puttingMedium) {
        messages.push(
          puttingValue > 0
            ? `Strong putting performance (+${puttingValue.toFixed(
                2
              )}) may inflate short game results`
            : `Poor putting performance (${puttingValue.toFixed(
                2
              )}) likely contributed significantly to score`
        );
      }
    } else {
      confidence = "low";
      messages.push(
        `Residual, putting, and short game opportunities indicate low confidence (${shortGameOpps} short game opportunities, putting ${puttingValue.toFixed(
          2
        )}, residual ${sgResidual.toFixed(2)})`
      );
    }
  }

  console.log("HANDICAP:", handicap);
  console.log("TIER:", {
    current: {
      min: currentTier.handicapMin,
      max: currentTier.handicapMax,
    },
    prev: prevTier
      ? { min: prevTier.handicapMin, max: prevTier.handicapMax }
      : null,
    next: nextTier
      ? { min: nextTier.handicapMin, max: nextTier.handicapMax }
      : null,
  });

  console.log("RATING DELTA:", courseRating - neutralRating);
  console.log("SLOPE DELTA:", slope - neutralSlope);
  console.log("RATING WEIGHT:", ratingWeight);
  console.log("COURSE DIFF ADJ:", courseDiffAdj);

  console.log('Baseline score: ' + baselineScore)
  console.log('Baseline fir: ' + baselineFIR)
  console.log('Baseline gir: ' + baselineGIR)
  console.log('Baseline putts: ' + baselinePutts)
  console.log('Baseline penalties: ' + baselinePenalties)

  console.log('Adj score: ' + adjScore)
  console.log('Adj fir: ' + adjFIR)
  console.log('Adj gir: ' + adjGIR)
  console.log('Adj putts: ' + adjPutts)
  console.log('Adj penalties: ' + adjPenalties)

  console.log('Actual score: ' + actualScore)
  console.log('Actual fir: ' + actualFIR)
  console.log('Actual gir: ' + actualGIR)
  console.log('Actual putts: ' + actualPutts)
  console.log('Actual penalties: ' + actualPenalties)
  console.log('Confidence: '+ confidence)
  console.log('Partial analysis: '+ partialAnalysis)
  console.log('Messages: '+ messages)

  // --- Round and return ---
  return {
    sgTotal: round2(sgTotal),
    sgOffTee: sgComponentsMap.offTee !== null ? round2(sgComponentsMap.offTee) : null,
    sgApproach: sgComponentsMap.approach !== null ? round2(sgComponentsMap.approach) : null,
    sgPutting: sgComponentsMap.putting !== null ? round2(sgComponentsMap.putting) : null,
    sgPenalties: sgComponentsMap.penalties !== null ? round2(sgComponentsMap.penalties) : null,
    sgResidual: round2(sgResidual),
    confidence,
    messages,
    partialAnalysis,
  };
}

// Optional: default export with real Prisma client for production use
export const calculateStrokesGainedWithPrisma = (inputs: SGInputs) =>
  calculateStrokesGained(inputs, new PrismaClient());
