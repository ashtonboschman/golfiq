// lib/utils/strokesGained.ts
import { Prisma, PrismaClient } from "@prisma/client";
import { SG_COEFFICIENTS as C } from "./strokesGainedCoefficients";
import { resolveTeeContext, type TeeSegment } from "@/lib/tee/resolveTeeContext";

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
    include: { tee: { include: { holes: { orderBy: { holeNumber: 'asc' } } } } },
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
    orderBy: { handicap: "asc" },
  });
  if (!allBaselines.length) throw new Error("No baseline tiers found");

  const handicap = Number(round.handicapAtRound);

  // Helper: Interpolate a baseline value using linear interpolation between two handicap points
  const interpolateBaseline = (getValue: (baseline: any) => number): number => {
    // Handle edge cases: cap at boundaries
    if (handicap <= Number(allBaselines[0].handicap)) {
      // Use lowest handicap baseline (-8)
      return getValue(allBaselines[0]);
    }
    if (handicap >= Number(allBaselines[allBaselines.length - 1].handicap)) {
      // Use highest handicap baseline (54)
      return getValue(allBaselines[allBaselines.length - 1]);
    }

    // Find the two baselines that bracket the user's handicap
    let lowerBaseline = allBaselines[0];
    let upperBaseline = allBaselines[1];

    for (let i = 0; i < allBaselines.length - 1; i++) {
      const current = allBaselines[i];
      const next = allBaselines[i + 1];

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

    // Linear interpolation formula
    const ratio = (handicap - lowerHandicap) / (upperHandicap - lowerHandicap);
    return lowerValue + (upperValue - lowerValue) * ratio;
  };

  // Interpolate baseline values (these are for 18-hole rounds)
  const baselineScore18 = interpolateBaseline((t) => Number(t.baselineScore));
  const baselineFIR = interpolateBaseline((t) => Number(t.baselineFIRPct));
  const baselineGIR = interpolateBaseline((t) => Number(t.baselineGIRPct));
  const baselinePutts18 = interpolateBaseline((t) => Number(t.baselinePutts));
  const baselinePenalties18 = interpolateBaseline((t) => Number(t.baselinePenalties));

  // Resolve tee context using canonical resolver
  const teeSegment = (round.teeSegment ?? 'full') as TeeSegment;
  const ctx = resolveTeeContext(round.tee, teeSegment);
  const totalHoles = ctx.holes;

  // Guard: model only supports 9 or 18 hole rounds
  if (totalHoles < 9) {
    return {
      sgTotal: null,
      sgOffTee: null,
      sgApproach: null,
      sgPutting: null,
      sgPenalties: null,
      sgResidual: null,
      confidence: null,
      partialAnalysis: true,
      messages: ["Round has fewer than 9 holes — strokes gained not applicable"],
    };
  }

  const nonPar3Holes = ctx.nonPar3Holes;
  const courseRating = ctx.courseRating;
  const slope = ctx.slopeRating;
  // Scale baselines for 9-hole rounds (database baselines are for 18 holes)
  const holeScaling = totalHoles / 18;
  const baselinePutts = baselinePutts18 * holeScaling;
  const baselinePenalties = baselinePenalties18 * holeScaling;
  // FIR% and GIR% don't scale - they're percentages

  const normalizedCourseRating = courseRating * (18 / totalHoles);
  // Course difficulty adjustment using USGA course handicap formula
  // Baseline scores are for a neutral par 72 / rating 72 / slope 113 course
  // Additional strokes = how much harder THIS course is vs neutral for this handicap
  const ratingDelta = normalizedCourseRating - 72;           // absolute difficulty (affects everyone)
  const slopeDelta = handicap * ((slope / 113) - 1);         // dispersion multiplier (handicap-weighted)
  const courseDiffAdj = slopeDelta + ratingDelta;
  const adjScore = (baselineScore18 + courseDiffAdj) * holeScaling;

  // FIR & GIR split rating vs slope: rating affects everyone equally,
  // slope penalizes higher handicaps more (dispersion effect)
  const adjFIRPct = Math.max(0, Math.min(100, baselineFIR - ratingDelta * C.RATING_TO_FIR_PCT - slopeDelta * C.SLOPE_TO_FIR_PCT));
  const adjGIRPct = Math.max(0, Math.min(100, baselineGIR - ratingDelta * C.RATING_TO_GIR_PCT - slopeDelta * C.SLOPE_TO_GIR_PCT));

  // Convert percentages to hole counts
  const adjFIR = (adjFIRPct / 100) * nonPar3Holes;
  const adjGIR = (adjGIRPct / 100) * totalHoles;

  // Adjusted putts and penalties (scale adjustment by holeScaling since baselines are already scaled)
  const adjPutts = baselinePutts + courseDiffAdj * C.COURSE_DIFF_TO_PUTTS * holeScaling;
  const adjPenalties = Math.max(0, baselinePenalties + Math.tanh(courseDiffAdj / 6) * C.COURSE_DIFF_TO_PENALTIES * holeScaling);

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
  const girStrokeValue = C.STROKES_PER_GIR * Math.max(0.70, 1 - handicap / 80);

  // --- Compute each SG component if data exists ---
  const sgComponentsMap: Record<string, number | null> = {
    offTee: actualFIR !== null ? (actualFIR - adjFIR) * C.STROKES_PER_FIR : null,
    approach: actualGIR !== null ? (actualGIR - adjGIR) * girStrokeValue : null,
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
