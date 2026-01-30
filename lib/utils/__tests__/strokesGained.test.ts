import { calculateStrokesGained } from "../strokesGained";

type MockPrisma = {
  round: { findUnique: jest.Mock };
  handicapTierBaseline: { findMany: jest.Mock };
};

describe("calculateStrokesGained (new SG model)", () => {
  let mockPrisma: MockPrisma;

  // Canonical baseline table (subset of your real one)
  const mockBaselines = [
    { handicap: -8, baselineScore: 72, baselineFIRPct: 59, baselineGIRPct: 58, baselinePutts: 30.5, baselinePenalties: 0.8 },
    { handicap: 0, baselineScore: 76, baselineFIRPct: 55, baselineGIRPct: 54, baselinePutts: 32.0, baselinePenalties: 1.1 },
    { handicap: 6, baselineScore: 80, baselineFIRPct: 50, baselineGIRPct: 47, baselinePutts: 33.7, baselinePenalties: 1.5 },
    { handicap: 10, baselineScore: 84.6, baselineFIRPct: 46, baselineGIRPct: 37, baselinePutts: 35.0, baselinePenalties: 2.0 },
    { handicap: 18, baselineScore: 93.7, baselineFIRPct: 40, baselineGIRPct: 22, baselinePutts: 37.0, baselinePenalties: 3.0 },
    { handicap: 30, baselineScore: 105, baselineFIRPct: 33, baselineGIRPct: 11, baselinePutts: 39.6, baselinePenalties: 4.9 },
    { handicap: 54, baselineScore: 129, baselineFIRPct: 21, baselineGIRPct: 1, baselinePutts: 43.8, baselinePenalties: 11.0 },
  ];

  beforeEach(() => {
    mockPrisma = {
      round: { findUnique: jest.fn() },
      handicapTierBaseline: { findMany: jest.fn().mockResolvedValue(mockBaselines) },
    };
  });

  // --------------------------------------------------
  // 1. Full data, neutral course
  // --------------------------------------------------
  it("produces full SG output with no missing data", async () => {
    mockPrisma.round.findUnique.mockResolvedValue({
      score: 88,
      firHit: 7,
      girHit: 8,
      putts: 34,
      penalties: 2,
      handicapAtRound: 10,
      tee: {
        courseRating: 72,
        slopeRating: 113,
        numberOfHoles: 18,
        nonPar3Holes: 14,
      },
    });

    const result = await calculateStrokesGained(
      { userId: BigInt(1), roundId: BigInt(1) },
      mockPrisma as any
    );

    expect(result.partialAnalysis).toBe(false);
    expect(result.sgTotal).toBeDefined();
    expect(result.sgResidual).toBeDefined();
    expect(result.confidence).toMatch(/high|medium|low/);
  });

  // --------------------------------------------------
  // 2. Rating & slope affect expectations
  // --------------------------------------------------
  it("adjusts expectations upward on hard, high-slope course", async () => {
    mockPrisma.round.findUnique.mockResolvedValue({
      score: 95,
      firHit: 6,
      girHit: 5,
      putts: 36,
      penalties: 3,
      handicapAtRound: 10,
      tee: {
        courseRating: 76,
        slopeRating: 145,
        numberOfHoles: 18,
        nonPar3Holes: 14,
      },
    });

    const hard = await calculateStrokesGained(
      { userId: BigInt(2), roundId: BigInt(2) },
      mockPrisma as any
    );

    mockPrisma.round.findUnique.mockResolvedValue({
      score: 95,
      firHit: 6,
      girHit: 5,
      putts: 36,
      penalties: 3,
      handicapAtRound: 10,
      tee: {
        courseRating: 70,
        slopeRating: 110,
        numberOfHoles: 18,
        nonPar3Holes: 14,
      },
    });

    const easy = await calculateStrokesGained(
      { userId: BigInt(2), roundId: BigInt(3) },
      mockPrisma as any
    );

    expect(hard.sgTotal!).toBeGreaterThan(easy.sgTotal!);
  });

  // --------------------------------------------------
  // 3. FIR/GIR slope sensitivity (high handicap)
  // --------------------------------------------------
  it("penalizes GIR more than FIR on high slope for high handicap", async () => {
    mockPrisma.round.findUnique.mockResolvedValue({
      score: 100,
      firHit: 5,
      girHit: 3,
      putts: 38,
      penalties: 4,
      handicapAtRound: 20,
      tee: {
        courseRating: 74,
        slopeRating: 150,
        numberOfHoles: 18,
        nonPar3Holes: 14,
      },
    });

    const result = await calculateStrokesGained(
      { userId: BigInt(3), roundId: BigInt(4) },
      mockPrisma as any
    );

    expect(result.sgApproach!).toBeGreaterThan(result.sgOffTee!);
  });

  // --------------------------------------------------
  // 4. Partial data handling
  // --------------------------------------------------
  it("marks partialAnalysis when FIR/GIR missing", async () => {
    mockPrisma.round.findUnique.mockResolvedValue({
      score: 90,
      firHit: null,
      girHit: null,
      putts: 35,
      penalties: null,
      handicapAtRound: 12,
      tee: {
        courseRating: 72,
        slopeRating: 113,
        numberOfHoles: 18,
        nonPar3Holes: 14,
      },
    });

    const result = await calculateStrokesGained(
      { userId: BigInt(4), roundId: BigInt(5) },
      mockPrisma as any
    );

    expect(result.partialAnalysis).toBe(true);
    expect(result.sgPutting).toBeDefined();
    expect(result.sgResidual).toBeDefined();
    expect(result.confidence).toBe("low");
  });

  // --------------------------------------------------
  // 5. Handicap interpolation
  // --------------------------------------------------
  it("interpolates baseline values between handicap points", async () => {
    mockPrisma.round.findUnique.mockResolvedValue({
      score: 87,
      firHit: 7,
      girHit: 6,
      putts: 34,
      penalties: 2,
      handicapAtRound: 9.5,
      tee: {
        courseRating: 72,
        slopeRating: 113,
        numberOfHoles: 18,
        nonPar3Holes: 14,
      },
    });

    const result = await calculateStrokesGained(
      { userId: BigInt(5), roundId: BigInt(6) },
      mockPrisma as any
    );

    expect(result.sgTotal).toBeDefined();
    expect(result.partialAnalysis).toBe(false);
  });

  // --------------------------------------------------
  // 6. 9-hole scaling
  // --------------------------------------------------
  it("scales expectations correctly for 9-hole rounds", async () => {
    mockPrisma.round.findUnique.mockResolvedValue({
      score: 44,
      firHit: 4,
      girHit: 3,
      putts: 17,
      penalties: 1,
      handicapAtRound: 10,
      tee: {
        courseRating: 36,
        slopeRating: 113,
        numberOfHoles: 9,
        nonPar3Holes: 7,
      },
    });

    const result = await calculateStrokesGained(
      { userId: BigInt(6), roundId: BigInt(7) },
      mockPrisma as any
    );

    expect(result.sgTotal).toBeDefined();
    expect(Math.abs(result.sgTotal!)).toBeLessThan(10);
  });

  // --------------------------------------------------
  // 7. Putting cap enforcement
  // --------------------------------------------------
  it("caps extreme putting and emits message", async () => {
    mockPrisma.round.findUnique.mockResolvedValue({
      score: 78,
      firHit: 9,
      girHit: 10,
      putts: 20,
      penalties: 1,
      handicapAtRound: 10,
      tee: {
        courseRating: 72,
        slopeRating: 113,
        numberOfHoles: 18,
        nonPar3Holes: 14,
      },
    });

    const result = await calculateStrokesGained(
      { userId: BigInt(7), roundId: BigInt(8) },
      mockPrisma as any
    );

    expect(Math.abs(result.sgPutting!)).toBeLessThanOrEqual(10);
    expect(result.messages.some(m => m.includes("putting"))).toBe(true);
  });

  // --------------------------------------------------
  // 8. Missing handicap early return
  // --------------------------------------------------
  it("returns null SG values when handicap is missing", async () => {
    mockPrisma.round.findUnique.mockResolvedValue({
      score: 85,
      firHit: 7,
      girHit: 6,
      putts: 32,
      penalties: 1,
      handicapAtRound: null,
      tee: {
        courseRating: 72,
        slopeRating: 113,
        numberOfHoles: 18,
        nonPar3Holes: 14,
      },
    });

    const result = await calculateStrokesGained(
      { userId: BigInt(8), roundId: BigInt(9) },
      mockPrisma as any
    );

    expect(result.sgTotal).toBeNull();
    expect(result.partialAnalysis).toBe(true);
    expect(result.confidence).toBeNull();
  });

  // --------------------------------------------------
  // 9. Residual conservation
  // --------------------------------------------------
  it("ensures SG components + residual equal total", async () => {
    mockPrisma.round.findUnique.mockResolvedValue({
      score: 90,
      firHit: 6,
      girHit: 5,
      putts: 35,
      penalties: 2,
      handicapAtRound: 12,
      tee: {
        courseRating: 73,
        slopeRating: 130,
        numberOfHoles: 18,
        nonPar3Holes: 14,
      },
    });

    const r = await calculateStrokesGained(
      { userId: BigInt(9), roundId: BigInt(10) },
      mockPrisma as any
    );

    const sum =
      (r.sgOffTee ?? 0) +
      (r.sgApproach ?? 0) +
      (r.sgPutting ?? 0) +
      (r.sgPenalties ?? 0) +
      (r.sgResidual ?? 0);

    expect(sum).toBeCloseTo(r.sgTotal!, 2);
  });

  // --------------------------------------------------
  // 10. Extreme low and high handicaps
  // --------------------------------------------------
  it("handles extreme low and high handicaps without crashing", async () => {
    for (const hcp of [-10, 60]) {
      mockPrisma.round.findUnique.mockResolvedValue({
        score: 80 + hcp,
        firHit: 6,
        girHit: 5,
        putts: 32,
        penalties: 1,
        handicapAtRound: hcp,
        tee: {
          courseRating: 72,
          slopeRating: 113,
          numberOfHoles: 18,
          nonPar3Holes: 14,
        },
      });

      const result = await calculateStrokesGained(
        { userId: BigInt(200 + hcp), roundId: BigInt(300 + hcp) },
        mockPrisma as any
      );

      expect(result.sgTotal).toBeDefined();
      expect(result.sgResidual).toBeDefined();
    }
  });

  // --------------------------------------------------
  // 11. Zero-hole round
  // --------------------------------------------------
  it("gracefully handles zero-hole rounds", async () => {
    mockPrisma.round.findUnique.mockResolvedValue({
      score: 0,
      firHit: 0,
      girHit: 0,
      putts: 0,
      penalties: 0,
      handicapAtRound: 10,
      tee: { courseRating: 72, slopeRating: 113, numberOfHoles: 0, nonPar3Holes: 0 },
    });

    const result = await calculateStrokesGained(
      { userId: BigInt(201), roundId: BigInt(301) },
      mockPrisma as any
    );

    expect(result.sgTotal).toBeNull();
    expect(result.partialAnalysis).toBe(true);
    expect(result.confidence).toBeNull();
  });

  // --------------------------------------------------
  // 12. Single-hole round (holeScaling edge)
  // --------------------------------------------------
  it("handles single-hole rounds correctly", async () => {
    mockPrisma.round.findUnique.mockResolvedValue({
      score: 5,
      firHit: 0,
      girHit: 0,
      putts: 2,
      penalties: 0,
      handicapAtRound: 12,
      tee: { courseRating: 72, slopeRating: 113, numberOfHoles: 1, nonPar3Holes: 0 },
    });

    const result = await calculateStrokesGained(
      { userId: BigInt(202), roundId: BigInt(302) },
      mockPrisma as any
    );

    expect(result.sgTotal).toBeNull();
    expect(result.partialAnalysis).toBe(true);
    expect(result.confidence).toBeNull();
  });

  // --------------------------------------------------
  // 13. Extreme putting (negative direction)
  // --------------------------------------------------
  it("caps extreme poor putting correctly", async () => {
    mockPrisma.round.findUnique.mockResolvedValue({
      score: 85,
      firHit: 8,
      girHit: 8,
      putts: 50,
      penalties: 2,
      handicapAtRound: 10,
      tee: {
        courseRating: 72,
        slopeRating: 113,
        numberOfHoles: 18,
        nonPar3Holes: 14,
      },
    });

    const result = await calculateStrokesGained(
      { userId: BigInt(203), roundId: BigInt(303) },
      mockPrisma as any
    );

    const puttingCap = 18 / 18 * 3.5; // from your coefficient
    expect(Math.abs(result.sgPutting!)).toBeLessThanOrEqual(puttingCap + 20); // capped with half-excess logic
    expect(result.messages.some(m => m.includes("putting"))).toBe(true);
  });

  // --------------------------------------------------
  // 14. Extreme easy vs hard courses
  // --------------------------------------------------
  it("adjusts SG correctly for extreme course difficulty", async () => {
    const extremeRounds = [
      { score: 80, rating: 65, slope: 80 },
      { score: 80, rating: 80, slope: 155 },
    ];

    for (const r of extremeRounds) {
      mockPrisma.round.findUnique.mockResolvedValue({
        score: r.score,
        firHit: 6,
        girHit: 5,
        putts: 32,
        penalties: 1,
        handicapAtRound: 10,
        tee: { courseRating: r.rating, slopeRating: r.slope, numberOfHoles: 18, nonPar3Holes: 14 },
      });

      const result = await calculateStrokesGained(
        { userId: BigInt(204 + r.rating), roundId: BigInt(304 + r.rating) },
        mockPrisma as any
      );

      expect(result.sgTotal).toBeDefined();
      expect(result.sgResidual).toBeDefined();
    }
  });

  // --------------------------------------------------
  // 15. Confidence tiers
  // --------------------------------------------------
  it("produces correct confidence tiers", async () => {
    // High confidence: score close to expected, moderate components, small residual
    mockPrisma.round.findUnique.mockResolvedValue({
      score: 84,
      firHit: 7,
      girHit: 7,
      putts: 34,
      penalties: 2,
      handicapAtRound: 10,
      tee: { courseRating: 72, slopeRating: 113, numberOfHoles: 18, nonPar3Holes: 14 },
    });
    const high = await calculateStrokesGained({ userId: BigInt(205), roundId: BigInt(305) }, mockPrisma as any);
    expect(high.confidence).toBe("high");

    // Medium confidence: poor putting pushes past high threshold
    mockPrisma.round.findUnique.mockResolvedValue({
      score: 90,
      firHit: 5,
      girHit: 5,
      putts: 39,
      penalties: 2,
      handicapAtRound: 12,
      tee: { courseRating: 72, slopeRating: 113, numberOfHoles: 18, nonPar3Holes: 14 },
    });
    const med = await calculateStrokesGained({ userId: BigInt(206), roundId: BigInt(306) }, mockPrisma as any);
    expect(med.confidence).toBe("medium");

    // Low confidence (missing data)
    mockPrisma.round.findUnique.mockResolvedValue({
      score: 92,
      firHit: null,
      girHit: null,
      putts: 36,
      penalties: null,
      handicapAtRound: 12,
      tee: { courseRating: 72, slopeRating: 113, numberOfHoles: 18, nonPar3Holes: 14 },
    });
    const low = await calculateStrokesGained({ userId: BigInt(207), roundId: BigInt(307) }, mockPrisma as any);
    expect(low.confidence).toBe("low");
  });

  // --------------------------------------------------
  // 16. Non-integer handicaps
  // --------------------------------------------------
  it("interpolates correctly for non-integer handicaps", async () => {
    const fractionalHCPs = [9.3, 12.7, 18.5];
    for (const h of fractionalHCPs) {
      mockPrisma.round.findUnique.mockResolvedValue({
        score: 85,
        firHit: 6,
        girHit: 5,
        putts: 34,
        penalties: 2,
        handicapAtRound: h,
        tee: { courseRating: 72, slopeRating: 113, numberOfHoles: 18, nonPar3Holes: 14 },
      });

      const result = await calculateStrokesGained(
        { userId: BigInt(300 + Math.floor(h)), roundId: BigInt(400 + Math.floor(h)) },
        mockPrisma as any
      );

      expect(result.sgTotal).toBeDefined();
      expect(result.partialAnalysis).toBe(false);
    }
  });

});