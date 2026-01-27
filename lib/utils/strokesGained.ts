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
    const currentMin = Number(currentTier.handicapMin);
    const currentMax = Number(currentTier.handicapMax);
    const currentMid = (currentMin + currentMax) / 2;
    const currentValue = getValue(currentTier);

    // If at the midpoint or edges, return current tier value
    if (Math.abs(handicap - currentMid) < 0.1) return currentValue;

    // Interpolate towards previous tier (lower handicap)
    if (handicap < currentMid && prevTier) {
      const prevMid = (Number(prevTier.handicapMin) + Number(prevTier.handicapMax)) / 2;
      const prevValue = getValue(prevTier);
      const ratio = (currentMid - handicap) / (currentMid - prevMid);
      return currentValue + ratio * (prevValue - currentValue);
    }

    // Interpolate towards next tier (higher handicap)
    if (handicap > currentMid && nextTier) {
      const nextMid = (Number(nextTier.handicapMin) + Number(nextTier.handicapMax)) / 2;
      const nextValue = getValue(nextTier);
      const ratio = (handicap - currentMid) / (nextMid - currentMid);
      return currentValue + ratio * (nextValue - currentValue);
    }

    // Fallback to current tier value
    return currentValue;
  };

  // Interpolate baseline values
  const baselineScore = interpolateBaseline((t) => Number(t.baselineScore));
  const baselineFIR = interpolateBaseline((t) => Number(t.baselineFIRPct));
  const baselineGIR = interpolateBaseline((t) => Number(t.baselineGIRPct));
  const baselinePutts = interpolateBaseline((t) => Number(t.baselinePutts));
  const baselinePenalties = interpolateBaseline((t) => Number(t.baselinePenalties));

  const totalHoles = round.tee.numberOfHoles || 18;
  const nonPar3Holes = round.tee.nonPar3Holes;
  const courseRating = round.tee.courseRating !== null ? Number(round.tee.courseRating) : 72;
  const slope = round.tee.slopeRating || 113;

  // Course difficulty adjustment (based on how much harder/easier than neutral)
  // Neutral course: par 72, rating 72, slope 113
  const neutralRating = 72;
  const coursePlayingHandicap = handicap * (slope / 113);
  const courseExpectedScore = courseRating + coursePlayingHandicap;
  const neutralExpectedScore = neutralRating + handicap;
  const courseDiffAdj = courseExpectedScore - neutralExpectedScore;

  // Adjusted expected stats (baseline adjusted for course difficulty)
  const adjScore = baselineScore + courseDiffAdj;
  const adjFIR = ((baselineFIR - (courseDiffAdj * C.COURSE_DIFF_TO_FIR_PCT)) / 100) * nonPar3Holes;
  const adjGIR = ((baselineGIR - (courseDiffAdj * C.COURSE_DIFF_TO_GIR_PCT)) / 100) * totalHoles;
  const adjPutts = baselinePutts + courseDiffAdj * C.COURSE_DIFF_TO_PUTTS;
  const adjPenalties = baselinePenalties + courseDiffAdj * C.COURSE_DIFF_TO_PENALTIES;

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

  // --- Confidence Calculation ---
  const shortGameOpps = actualGIR !== null ? totalHoles - actualGIR : 0;
  let confidence: "high" | "medium" | "low" = "high";

  if (actualGIR === null) {
    confidence = "low";
    messages.push("Missing GIR data reduces short game confidence");
  } else if (
    Math.abs(sgResidual) < C.CONFIDENCE_RESIDUAL_HIGH &&
    shortGameOpps >= totalHoles * C.CONFIDENCE_SHORTGAME_HIGH_PCT &&
    Math.abs(sgComponentsMap.putting ?? 0) <= puttingCap * C.CONFIDENCE_PUTTING_HIGH_PCT
  ) {
    confidence = "high";
  } else if (
    Math.abs(sgResidual) >= C.CONFIDENCE_RESIDUAL_HIGH ||
    (shortGameOpps >= totalHoles * C.CONFIDENCE_SHORTGAME_MEDIUM_MIN_PCT &&
      shortGameOpps <= totalHoles * C.CONFIDENCE_SHORTGAME_MEDIUM_MAX_PCT) ||
    (Math.abs(sgComponentsMap.putting ?? 0) > puttingCap * C.CONFIDENCE_PUTTING_HIGH_PCT &&
      Math.abs(sgComponentsMap.putting ?? 0) <= puttingCap)
  ) {
    confidence = "medium";
    messages.push("Short game estimate based on residual calculation - interpret with context");
    if (
      shortGameOpps >= totalHoles * C.CONFIDENCE_SHORTGAME_MEDIUM_MIN_PCT &&
      shortGameOpps <= totalHoles * C.CONFIDENCE_SHORTGAME_MEDIUM_MAX_PCT
    ) {
      messages.push(`Only ${shortGameOpps} short game opportunities - moderate confidence`);
    }
    if (
      Math.abs(sgComponentsMap.putting ?? 0) > puttingCap * C.CONFIDENCE_PUTTING_HIGH_PCT &&
      Math.abs(sgComponentsMap.putting ?? 0) <= puttingCap
    ) {
      if ((sgComponentsMap.putting ?? 0) > 0) {
        messages.push(
          `Strong putting performance (+${(sgComponentsMap.putting ?? 0).toFixed(2)}) may inflate short game results`
        );
      } else {
        messages.push(
          `Poor putting performance (${(sgComponentsMap.putting ?? 0).toFixed(2)}) likely contributed significantly to score`
        );
      }
    }
  } else if (
    Math.abs(sgComponentsMap.putting ?? 0) > puttingCap ||
    Math.abs(sgResidual) > (totalHoles / 18) * C.CONFIDENCE_RESIDUAL_HIGH ||
    shortGameOpps < totalHoles * C.CONFIDENCE_SHORTGAME_MEDIUM_MIN_PCT
  ) {
    confidence = "low";
    messages.push(
      `Exceptional putting (±${(sgComponentsMap.putting ?? 0).toFixed(
        2
      )}) or limited opportunities (${shortGameOpps}) affect short game estimate`
    );
  }

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
