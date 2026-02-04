export const mockBaselines = [
  { handicap: -8, baselineScore: 72, baselineFIRPct: 59, baselineGIRPct: 58, baselinePutts: 30.5, baselinePenalties: 0.8 },
  { handicap: 0, baselineScore: 76, baselineFIRPct: 55, baselineGIRPct: 54, baselinePutts: 32.0, baselinePenalties: 1.1 },
  { handicap: 6, baselineScore: 80, baselineFIRPct: 50, baselineGIRPct: 47, baselinePutts: 33.7, baselinePenalties: 1.5 },
  { handicap: 10, baselineScore: 84.6, baselineFIRPct: 46, baselineGIRPct: 37, baselinePutts: 35.0, baselinePenalties: 2.0 },
  { handicap: 18, baselineScore: 93.7, baselineFIRPct: 40, baselineGIRPct: 22, baselinePutts: 37.0, baselinePenalties: 3.0 },
  { handicap: 30, baselineScore: 105, baselineFIRPct: 33, baselineGIRPct: 11, baselinePutts: 39.6, baselinePenalties: 4.9 },
  { handicap: 54, baselineScore: 129, baselineFIRPct: 21, baselineGIRPct: 1, baselinePutts: 43.8, baselinePenalties: 11.0 },
];

export const baseTee18 = {
  courseRating: 72,
  slopeRating: 113,
  numberOfHoles: 18,
  nonPar3Holes: 14,
  parTotal: 72,
  frontCourseRating: 36,
  frontSlopeRating: 113,
  frontBogeyRating: null,
  backCourseRating: 36,
  backSlopeRating: 113,
  backBogeyRating: null,
  bogeyRating: null,
  holes: Array.from({ length: 18 }, (_, i) => ({
    holeNumber: i + 1,
    par: i % 3 === 0 ? 3 : i % 3 === 1 ? 4 : 5,
  })),
};

export const baseTee9 = {
  courseRating: 36,
  slopeRating: 113,
  numberOfHoles: 9,
  nonPar3Holes: 7,
  parTotal: 36,
  frontCourseRating: null,
  frontSlopeRating: null,
  frontBogeyRating: null,
  backCourseRating: null,
  backSlopeRating: null,
  backBogeyRating: null,
  bogeyRating: null,
  holes: Array.from({ length: 9 }, (_, i) => ({
    holeNumber: i + 1,
    par: i % 3 === 0 ? 3 : i % 3 === 1 ? 4 : 5,
  })),
};

type RoundInput = {
  score: number;
  firHit: number | null;
  girHit: number | null;
  putts: number | null;
  penalties: number | null;
  handicapAtRound: number | null;
  teeSegment?: "full" | "front9" | "back9" | "double9";
  tee?: typeof baseTee18 | typeof baseTee9 | Record<string, unknown>;
};

export function makeRound(input: RoundInput) {
  const teeSegment = input.teeSegment ?? "full";
  let tee = input.tee ?? baseTee18;

  if (teeSegment === "double9") {
    tee = { ...baseTee9 };
  }

  return {
    teeSegment,
    tee,
    ...input,
  };
}
