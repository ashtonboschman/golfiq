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

  // Fetch baseline
  const baseline = await prisma.handicapTierBaseline.findFirst({
    where: {
      handicapMin: { lte: Number(round.handicapAtRound) },
      handicapMax: { gte: Number(round.handicapAtRound) },
    },
    orderBy: {
      handicapMin: "desc", // pick the highest possible min below handicap
    },
  });
  if (!baseline) throw new Error("Baseline not found for handicap tier");

  const totalHoles = round.tee.numberOfHoles || 18;
  const nonPar3Holes = round.tee.nonPar3Holes;
  const courseRating = round.tee.courseRating !== null ? Number(round.tee.courseRating) : 72;

  // Course difficulty calculations
  const neutralExpectedScore = 72 + Number(round.handicapAtRound);
  const slope = round.tee.slopeRating || 113;
  const coursePlayingHandicap = Number(round.handicapAtRound) * (slope / 113);
  const courseExpectedScore = (courseRating || 72) + coursePlayingHandicap;
  const courseDiffAdj = courseExpectedScore - neutralExpectedScore;

  const baselineFIR = Number(baseline.baselineFIRPct);
  const baselineGIR = Number(baseline.baselineGIRPct);
  const baselinePutts = Number(baseline.baselinePutts);
  const baselinePenalties = Number(baseline.baselinePenalties);

  // Adjusted expected stats
  const adjScore = courseExpectedScore;
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

  let sgTotal = adjScore - actualScore;
  let sgOffTee = 0,
    sgApproach = 0,
    sgPutting = 0,
    sgPenalties = 0,
    sgResidual = 0;

  let messages: string[] = [];
  const partialAnalysis =
  actualFIR === null ||
  actualGIR === null ||
  actualPutts === null ||
  actualPenalties === null;

  const puttingCap = (totalHoles / 18) * C.PUTTING_CAP;

  // Partial / Full Analysis Handling
  if (
    actualFIR !== null &&
    actualGIR !== null &&
    actualPutts !== null &&
    actualPenalties !== null
  ) {
    // Full data
    sgOffTee = (actualFIR - adjFIR) * C.STROKES_PER_FIR;
    sgApproach = (actualGIR - adjGIR) * C.STROKES_PER_GIR;

    const puttDiff = adjPutts - actualPutts;
    sgPutting =
      Math.abs(puttDiff) > puttingCap
        ? Math.sign(puttDiff) * (puttingCap + (Math.abs(puttDiff) - puttingCap) * 0.5)
        : puttDiff;

    if (Math.abs(puttDiff) > puttingCap) {
      messages.push(
        `Exceptional putting detected; strokes beyond ±${puttingCap.toFixed(2)} are counted at reduced weight`
      );
    }

    sgPenalties = (adjPenalties - actualPenalties) * C.STROKES_PER_PENALTY;
    sgResidual = sgTotal - sgOffTee - sgApproach - sgPutting - sgPenalties;
  } else {
    // Partial data handling
    messages.push("Partial analysis: missing FIR, GIR, Putts, or Penalties");

    // Compute each SG independently if data exists
    sgOffTee = actualFIR !== null ? (actualFIR - adjFIR) * C.STROKES_PER_FIR : 0;
    sgApproach = actualGIR !== null ? (actualGIR - adjGIR) * C.STROKES_PER_GIR : 0;
    sgPutting =
      actualPutts !== null
        ? (() => {
            const diff = adjPutts - actualPutts;
            return Math.abs(diff) > puttingCap
              ? Math.sign(diff) * (puttingCap + (Math.abs(diff) - puttingCap) * 0.5)
              : diff;
          })()
        : 0;
    if (actualPutts !== null && Math.abs(adjPutts - actualPutts) > puttingCap) {
      messages.push(`Extreme putting (capped at ±${puttingCap.toFixed(2)} strokes)`);
    }

    sgPenalties = actualPenalties !== null ? (adjPenalties - actualPenalties) * C.STROKES_PER_PENALTY : 0;

    // Residual goes to short game
    sgResidual = sgTotal - sgApproach - sgOffTee - sgPutting - sgPenalties;
  }

  // --- Confidence Calculation ---
  const shortGameOpps = actualGIR !== null ? totalHoles - actualGIR : 0;
  let confidence: "high" | "medium" | "low" = "high";

  if (actualGIR === null) {
    confidence = "low";
    messages.push("Missing GIR data reduces short game confidence");
  } else if (
    Math.abs(sgResidual) < C.CONFIDENCE_RESIDUAL_HIGH &&
    shortGameOpps >= totalHoles * C.CONFIDENCE_SHORTGAME_HIGH_PCT &&
    Math.abs(sgPutting) <= puttingCap * C.CONFIDENCE_PUTTING_HIGH_PCT
  ) {
    confidence = "high";
  } else if (
    Math.abs(sgResidual) >= C.CONFIDENCE_RESIDUAL_HIGH ||
    (shortGameOpps >= totalHoles * C.CONFIDENCE_SHORTGAME_MEDIUM_MIN_PCT && shortGameOpps <= totalHoles * C.CONFIDENCE_SHORTGAME_MEDIUM_MAX_PCT) ||
    (Math.abs(sgPutting) > puttingCap * C.CONFIDENCE_PUTTING_HIGH_PCT && Math.abs(sgPutting) <= puttingCap)
  ) {
    confidence = "medium";
    messages.push("Short game estimate based on residual calculation - interpret with context");
    if (shortGameOpps >= totalHoles * C.CONFIDENCE_SHORTGAME_MEDIUM_MIN_PCT && shortGameOpps <= totalHoles * C.CONFIDENCE_SHORTGAME_MEDIUM_MAX_PCT) {
      messages.push(`Only ${shortGameOpps} short game opportunities - moderate confidence`);
    }
    if (Math.abs(sgPutting) > puttingCap * C.CONFIDENCE_PUTTING_HIGH_PCT && Math.abs(sgPutting) <= puttingCap) {
      if (sgPutting > 0) {
        messages.push(
          `Strong putting performance (+${sgPutting.toFixed(2)}) may inflate short game results`
        );
      } else {
        messages.push(
          `Poor putting performance (${sgPutting.toFixed(2)}) likely contributed significantly to score`
        );
      }
    }
  } else if (
    Math.abs(sgPutting) > puttingCap ||
    Math.abs(sgResidual) > (totalHoles / 18) * C.CONFIDENCE_RESIDUAL_HIGH ||
    shortGameOpps < totalHoles * C.CONFIDENCE_SHORTGAME_MEDIUM_MIN_PCT
  ) {
    confidence = "low";
    messages.push(
      `Exceptional putting (±${sgPutting.toFixed(2)}) or limited opportunities (${shortGameOpps}) affect short game estimate`
    );
  }

  return {
    sgTotal: round2(sgTotal),
    sgOffTee: round2(sgOffTee),
    sgApproach: round2(sgApproach),
    sgPutting: round2(sgPutting),
    sgPenalties: round2(sgPenalties),
    sgResidual: round2(sgResidual),
    confidence,
    messages,
    partialAnalysis,
  };
}

// Optional: default export with real Prisma client for production use
export const calculateStrokesGainedWithPrisma = (inputs: SGInputs) =>
  calculateStrokesGained(inputs, new PrismaClient());
