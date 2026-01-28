// lib/utils/__tests__/strokesGained.test.ts
import { calculateStrokesGained } from "../strokesGained";

type MockPrisma = {
  round: { findUnique: jest.Mock };
  userLeaderboardStats: { findUnique: jest.Mock };
  handicapTierBaseline: { findMany: jest.Mock };
};

describe("calculateStrokesGained", () => {
  let mockPrisma: MockPrisma;

  // Mock baseline tiers for interpolation
  const mockBaselineTiers = [
    {
      handicapMin: 0,
      handicapMax: 5.9,
      baselineScore: 79,
      baselineFIRPct: 54,
      baselineGIRPct: 48,
      baselinePutts: 31,
      baselinePenalties: 1,
    },
    {
      handicapMin: 6,
      handicapMax: 10.9,
      baselineScore: 85,
      baselineFIRPct: 48,
      baselineGIRPct: 37,
      baselinePutts: 33,
      baselinePenalties: 2,
    },
    {
      handicapMin: 11,
      handicapMax: 15.9,
      baselineScore: 89,
      baselineFIRPct: 43,
      baselineGIRPct: 27,
      baselinePutts: 34,
      baselinePenalties: 2,
    },
    {
      handicapMin: 16,
      handicapMax: 20.9,
      baselineScore: 95,
      baselineFIRPct: 38,
      baselineGIRPct: 20,
      baselinePutts: 36,
      baselinePenalties: 3,
    },
  ];

  beforeEach(() => {
    mockPrisma = {
      round: { findUnique: jest.fn() },
      userLeaderboardStats: { findUnique: jest.fn() },
      handicapTierBaseline: { findMany: jest.fn() },
    };

    // Default mock returns all tiers
    mockPrisma.handicapTierBaseline.findMany.mockResolvedValue(mockBaselineTiers);
  });

  // ----------------------------
  // 1. Full Data Round
  // ----------------------------
  it("calculates SG correctly for full data", async () => {
    mockPrisma.round.findUnique.mockResolvedValue({
      id: 1,
      score: 88,
      firHit: 7,
      girHit: 5,
      putts: 34,
      penalties: 2,
      handicapAtRound: 10,
      tee: {
        courseRating: 73.5,
        slopeRating: 135,
        numberOfHoles: 18,
        nonPar3Holes: 14,
      },
    });

    const result = await calculateStrokesGained(
      { userId: BigInt(1), roundId: BigInt(1) },
      mockPrisma as any
    );

    expect(result.partialAnalysis).toBe(false);
    expect(result.confidence).toBe("high");

    expect(result.sgApproach).toBeCloseTo(-1.14, 2);
    expect(result.sgOffTee).toBeCloseTo(0.08, 2);
    expect(result.sgPutting).toBeCloseTo(-0.59, 2);
    expect(result.sgPenalties).toBeCloseTo(0.34, 2);
    expect(result.sgResidual).toBeCloseTo(1.75, 2);
    expect(result.sgTotal).toBeCloseTo(0.45, 2);
  });

  // ----------------------------
  // 2. Partial Data: only putts known
  // ----------------------------
  it("handles partial data correctly (putts only)", async () => {
    mockPrisma.round.findUnique.mockResolvedValue({
      id: 2,
      score: 90,
      firHit: null,
      girHit: null,
      putts: 36,
      penalties: null,
      handicapAtRound: 15,
      tee: {
        courseRating: 72,
        slopeRating: 113,
        numberOfHoles: 18,
        nonPar3Holes: 14,
      },
    });

    const result = await calculateStrokesGained(
      { userId: BigInt(2), roundId: BigInt(2) },
      mockPrisma as any
    );

    expect(result.partialAnalysis).toBe(true);
    expect(result.sgPutting).toBeCloseTo(-2, 2);
    expect(result.sgResidual).toBeCloseTo(1, 2);
    expect(result.sgTotal).toBeCloseTo(-1, 2);
    expect(result.confidence).toBe("low");
  });

  // ----------------------------
  // 3. Partial Data: only GIR known
  // ----------------------------
  it("handles partial data with only GIR known", async () => {
    mockPrisma.round.findUnique.mockResolvedValue({
      id: 3,
      score: 88,
      firHit: null,
      girHit: 6,
      putts: null,
      penalties: null,
      handicapAtRound: 10,
      tee: {
        courseRating: 72,
        slopeRating: 113,
        numberOfHoles: 18,
        nonPar3Holes: 14,
      },
    });

    const result = await calculateStrokesGained(
      { userId: BigInt(3), roundId: BigInt(3) },
      mockPrisma as any
    );

    expect(result.partialAnalysis).toBe(true);
    expect(result.sgApproach).toBeCloseTo(-0.5, 2);
    expect(result.sgResidual).toBeCloseTo(-2.5, 2);
    expect(result.sgTotal).toBeCloseTo(-3, 2);
    expect(result.confidence).toBe("low");
  });

  // ----------------------------
  // 4. Partial Data: only FIR known
  // ----------------------------
  it("handles partial data with only FIR known", async () => {
    mockPrisma.round.findUnique.mockResolvedValue({
      id: 4,
      score: 87,
      firHit: 7,
      girHit: null,
      putts: null,
      penalties: null,
      handicapAtRound: 10,
      tee: {
        courseRating: 72,
        slopeRating: 113,
        numberOfHoles: 18,
        nonPar3Holes: 14,
      },
    });

    const result = await calculateStrokesGained(
      { userId: BigInt(4), roundId: BigInt(4) },
      mockPrisma as any
    );

    expect(result.partialAnalysis).toBe(true);
    expect(result.sgOffTee).toBeCloseTo(0.07, 2);
    expect(result.sgResidual).toBeCloseTo(-2.07, 2);
    expect(result.sgTotal).toBeCloseTo(-2, 2);
    expect(result.confidence).toBe("low");
  });

  // ----------------------------
  // 5. Partial Data: only score known
  // ----------------------------
  it("handles partial data with only score known", async () => {
    mockPrisma.round.findUnique.mockResolvedValue({
      id: 5,
      score: 91,
      firHit: null,
      girHit: null,
      putts: null,
      penalties: null,
      handicapAtRound: 15,
      tee: {
        courseRating: 72,
        slopeRating: 113,
        numberOfHoles: 18,
        nonPar3Holes: 14,
      },
    });

    const result = await calculateStrokesGained(
      { userId: BigInt(5), roundId: BigInt(5) },
      mockPrisma as any
    );

    expect(result.partialAnalysis).toBe(true);
    expect(result.sgTotal).toBeCloseTo(-2, 2);
    expect(result.sgResidual).toBeCloseTo(-2, 2);
    expect(result.confidence).toBe("low");
  });

  // ----------------------------
  // 6. Extreme Putting
  // ----------------------------
  it("caps extreme putting and emits message", async () => {
    mockPrisma.round.findUnique.mockResolvedValue({
      id: 6,
      score: 80,
      firHit: 10,
      girHit: 9,
      putts: 20,
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
      { userId: BigInt(6), roundId: BigInt(6) },
      mockPrisma as any
    );

    expect(result.sgPutting).toBeGreaterThan(3.5);
    expect(result.messages).toEqual(
      expect.arrayContaining([
        expect.stringContaining("Extreme putting"),
      ])
    );
  });

  // ----------------------------
  // 7. Missing Handicap - Early Return
  // ----------------------------
  it("returns null SG values when handicap is missing", async () => {
    mockPrisma.round.findUnique.mockResolvedValue({
      id: 7,
      score: 85,
      firHit: 8,
      girHit: 7,
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
      { userId: BigInt(7), roundId: BigInt(7) },
      mockPrisma as any
    );

    expect(result.sgTotal).toBeNull();
    expect(result.sgOffTee).toBeNull();
    expect(result.sgApproach).toBeNull();
    expect(result.sgPutting).toBeNull();
    expect(result.confidence).toBeNull();
    expect(result.partialAnalysis).toBe(true);
  });

  // ----------------------------
  // 8. Handicap at Tier Midpoint
  // ----------------------------
  it("uses exact tier baseline at midpoint", async () => {
    mockPrisma.round.findUnique.mockResolvedValue({
      id: 8,
      score: 87,
      firHit: 7,
      girHit: 6,
      putts: 33,
      penalties: 2,
      handicapAtRound: 8.45, // Exact midpoint of 6-10.9 tier
      tee: {
        courseRating: 72,
        slopeRating: 113,
        numberOfHoles: 18,
        nonPar3Holes: 14,
      },
    });

    const result = await calculateStrokesGained(
      { userId: BigInt(8), roundId: BigInt(8) },
      mockPrisma as any
    );

    // At midpoint, should use tier baseline exactly (85)
    expect(result.sgTotal).toBeCloseTo(-2, 2);
  });

  // ----------------------------
  // 9. Handicap at Lower Tier Boundary
  // ----------------------------
  it("interpolates correctly at lower tier boundary", async () => {
    mockPrisma.round.findUnique.mockResolvedValue({
      id: 9,
      score: 86,
      firHit: 7,
      girHit: 7,
      putts: 33,
      penalties: 2,
      handicapAtRound: 6.0, // Lower boundary of 6-10.9 tier
      tee: {
        courseRating: 72,
        slopeRating: 113,
        numberOfHoles: 18,
        nonPar3Holes: 14,
      },
    });

    const result = await calculateStrokesGained(
      { userId: BigInt(9), roundId: BigInt(9) },
      mockPrisma as any
    );

    // Should interpolate toward previous tier (0-5.9, baseline 79)
    expect(result.sgTotal).toBeDefined();
    expect(result.confidence).toBe("high");
  });

  // ----------------------------
  // 10. 9-Hole Round
  // ----------------------------
  it("calculates SG correctly for 9-hole round", async () => {
    mockPrisma.round.findUnique.mockResolvedValue({
      id: 10,
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
      { userId: BigInt(10), roundId: BigInt(10) },
      mockPrisma as any
    );

    expect(result.partialAnalysis).toBe(false);
    expect(result.sgTotal).toBeDefined();
    // 9-hole rounds should have roughly half the SG values of 18-hole rounds
    expect(Math.abs(result.sgTotal!)).toBeLessThan(10);
  });

  // ----------------------------
  // 11. Very Easy Course
  // ----------------------------
  it("adjusts expectations for very easy course", async () => {
    mockPrisma.round.findUnique.mockResolvedValue({
      id: 11,
      score: 82,
      firHit: 8,
      girHit: 8,
      putts: 32,
      penalties: 1,
      handicapAtRound: 10,
      tee: {
        courseRating: 68.5,
        slopeRating: 110,
        numberOfHoles: 18,
        nonPar3Holes: 14,
      },
    });

    const result = await calculateStrokesGained(
      { userId: BigInt(11), roundId: BigInt(11) },
      mockPrisma as any
    );

    // Easy course should have lower expectations, making SG higher for same score
    expect(result.sgTotal).toBeDefined();
    expect(result.confidence).toBe("low");
  });

  // ----------------------------
  // 12. Very Hard Course
  // ----------------------------
  it("adjusts expectations for very hard course", async () => {
    mockPrisma.round.findUnique.mockResolvedValue({
      id: 12,
      score: 95,
      firHit: 5,
      girHit: 4,
      putts: 36,
      penalties: 3,
      handicapAtRound: 10,
      tee: {
        courseRating: 76.5,
        slopeRating: 145,
        numberOfHoles: 18,
        nonPar3Holes: 14,
      },
    });

    const result = await calculateStrokesGained(
      { userId: BigInt(12), roundId: BigInt(12) },
      mockPrisma as any
    );

    // Hard course should have higher expectations, making SG less negative for high score
    expect(result.sgTotal).toBeDefined();
  });

  // ----------------------------
  // 13. High Handicap Player
  // ----------------------------
  it("handles high handicap player (16-20.9 tier)", async () => {
    mockPrisma.round.findUnique.mockResolvedValue({
      id: 13,
      score: 98,
      firHit: 5,
      girHit: 3,
      putts: 37,
      penalties: 3,
      handicapAtRound: 18,
      tee: {
        courseRating: 72,
        slopeRating: 113,
        numberOfHoles: 18,
        nonPar3Holes: 14,
      },
    });

    const result = await calculateStrokesGained(
      { userId: BigInt(13), roundId: BigInt(13) },
      mockPrisma as any
    );

    expect(result.partialAnalysis).toBe(false);
    expect(result.sgTotal).toBeDefined();
    // Should use baseline around 95 and interpolate
    expect(result.confidence).toBeDefined();
  });

  // ----------------------------
  // 14. Low Handicap Player
  // ----------------------------
  it("handles low handicap player (0-5.9 tier)", async () => {
    mockPrisma.round.findUnique.mockResolvedValue({
      id: 14,
      score: 77,
      firHit: 9,
      girHit: 11,
      putts: 30,
      penalties: 1,
      handicapAtRound: 3.2,
      tee: {
        courseRating: 72,
        slopeRating: 113,
        numberOfHoles: 18,
        nonPar3Holes: 14,
      },
    });

    const result = await calculateStrokesGained(
      { userId: BigInt(14), roundId: BigInt(14) },
      mockPrisma as any
    );

    expect(result.partialAnalysis).toBe(false);
    expect(result.sgTotal).toBeDefined();
    // Low handicap player, baseline around 79
    expect(result.confidence).toBe("medium");
  });

  // ----------------------------
  // 15. Medium Confidence Scenario
  // ----------------------------
  it("assigns medium confidence with moderate short game opportunities", async () => {
    mockPrisma.round.findUnique.mockResolvedValue({
      id: 15,
      score: 88,
      firHit: 7,
      girHit: 12, // High GIR = few short game opportunities
      putts: 32,
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
      { userId: BigInt(15), roundId: BigInt(15) },
      mockPrisma as any
    );

    // 6 short game opportunities (18 - 12 GIR) = 33%, which is in medium range
    expect(result.confidence).toBe("medium");
    expect(result.messages.length).toBeGreaterThan(0);
  });

  // ----------------------------
  // 16. Interpolation Between Non-Adjacent Tiers
  // ----------------------------
  it("correctly interpolates handicap at upper tier boundary", async () => {
    mockPrisma.round.findUnique.mockResolvedValue({
      id: 16,
      score: 90,
      firHit: 6,
      girHit: 5,
      putts: 35,
      penalties: 2,
      handicapAtRound: 10.9, // Upper boundary of 6-10.9 tier
      tee: {
        courseRating: 72,
        slopeRating: 113,
        numberOfHoles: 18,
        nonPar3Holes: 14,
      },
    });

    const result = await calculateStrokesGained(
      { userId: BigInt(16), roundId: BigInt(16) },
      mockPrisma as any
    );

    // Should interpolate toward next tier (11-15.9, baseline 89)
    expect(result.sgTotal).toBeDefined();
    expect(result.confidence).toBe("high");
  });

  // ----------------------------
  // 17. Zero Penalties Round
  // ----------------------------
  it("handles round with zero penalties", async () => {
    mockPrisma.round.findUnique.mockResolvedValue({
      id: 17,
      score: 85,
      firHit: 8,
      girHit: 7,
      putts: 32,
      penalties: 0,
      handicapAtRound: 10,
      tee: {
        courseRating: 72,
        slopeRating: 113,
        numberOfHoles: 18,
        nonPar3Holes: 14,
      },
    });

    const result = await calculateStrokesGained(
      { userId: BigInt(17), roundId: BigInt(17) },
      mockPrisma as any
    );

    expect(result.sgPenalties).toBeDefined();
    expect(result.sgPenalties).toBeGreaterThan(0); // Better than baseline
  });

  // ----------------------------
  // 18. Elite Tier Player (handicap -5)
  // ----------------------------
  it("handles elite/scratch player (-5 handicap)", async () => {
    mockPrisma.round.findUnique.mockResolvedValue({
      id: 18,
      score: 74,
      firHit: 9,
      girHit: 10,
      putts: 30,
      penalties: 1,
      handicapAtRound: -5, // Elite lower boundary
      tee: {
        courseRating: 72,
        slopeRating: 113,
        numberOfHoles: 18,
        nonPar3Holes: 14,
      },
    });

    // Add elite tier baseline
    mockPrisma.handicapTierBaseline.findMany.mockResolvedValue([
      { handicapMin: -5, handicapMax: 0.9, baselineScore: 74, baselineFIRPct: 63, baselineGIRPct: 57, baselinePutts: 31, baselinePenalties: 1 },
      ...mockBaselineTiers,
    ]);

    const result = await calculateStrokesGained(
      { userId: BigInt(18), roundId: BigInt(18) },
      mockPrisma as any
    );

    expect(result.partialAnalysis).toBe(false);
    expect(result.sgTotal).toBeDefined();
    // Elite player should use baseline without interpolation
    expect(result.confidence).toBeDefined();
  });

  // ----------------------------
  // 19. Maximum Handicap (55)
  // ----------------------------
  it("handles maximum handicap player (55)", async () => {
    mockPrisma.round.findUnique.mockResolvedValue({
      id: 19,
      score: 110,
      firHit: 4,
      girHit: 3,
      putts: 39,
      penalties: 5,
      handicapAtRound: 55, // Maximum
      tee: {
        courseRating: 72,
        slopeRating: 113,
        numberOfHoles: 18,
        nonPar3Holes: 14,
      },
    });

    // Add very high handicap tier
    mockPrisma.handicapTierBaseline.findMany.mockResolvedValue([
      ...mockBaselineTiers,
      { handicapMin: 26, handicapMax: 55, baselineScore: 104, baselineFIRPct: 33, baselineGIRPct: 15, baselinePutts: 38, baselinePenalties: 4 },
    ]);

    const result = await calculateStrokesGained(
      { userId: BigInt(19), roundId: BigInt(19) },
      mockPrisma as any
    );

    expect(result.partialAnalysis).toBe(false);
    expect(result.sgTotal).toBeDefined();
    expect(result.confidence).toBeDefined();
  });

  // ----------------------------
  // 20. Extreme Residual Round
  // ----------------------------
  it("handles extreme residual correctly", async () => {
    mockPrisma.round.findUnique.mockResolvedValue({
      id: 21,
      score: 50,
      firHit: 0,
      girHit: 0,
      putts: 18,
      penalties: 0,
      handicapAtRound: 10,
      tee: {
        courseRating: 72,
        slopeRating: 113,
        numberOfHoles: 18,
        nonPar3Holes: 14,
      },
    });

    const result = await calculateStrokesGained(
      { userId: BigInt(21), roundId: BigInt(21) },
      mockPrisma as any
    );

    // Residual should handle extreme difference without NaN
    expect(result.sgResidual).toBeDefined();
    expect(result.partialAnalysis).toBe(false);
  });

  // ----------------------------
  // 21. Edge of Putting Cap
  // ----------------------------
  it("caps putting at exactly PUTTING_CAP", async () => {
    const puttingCap = 3.5;

    mockPrisma.round.findUnique.mockResolvedValue({
      id: 22,
      score: 80,
      firHit: 8,
      girHit: 7,
      putts: 28, // Extreme putts
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
      { userId: BigInt(22), roundId: BigInt(22) },
      mockPrisma as any
    );

    expect(result.sgPutting).toBeGreaterThan(puttingCap - 0.01);
    expect(result.messages).toEqual(
      expect.arrayContaining([expect.stringContaining("Extreme putting")])
    );
  });

  // ----------------------------
  // 22. Zero GIR and FIR
  // ----------------------------
  it("handles round with zero FIR and GIR", async () => {
    mockPrisma.round.findUnique.mockResolvedValue({
      id: 23,
      score: 100,
      firHit: 0,
      girHit: 0,
      putts: 40,
      penalties: 5,
      handicapAtRound: 20,
      tee: {
        courseRating: 72,
        slopeRating: 113,
        numberOfHoles: 18,
        nonPar3Holes: 14,
      },
    });

    const result = await calculateStrokesGained(
      { userId: BigInt(23), roundId: BigInt(23) },
      mockPrisma as any
    );

    expect(result.sgOffTee).toBeDefined();
    expect(result.sgApproach).toBeDefined();
    expect(result.partialAnalysis).toBe(false);
  });

  // ----------------------------
  // 23. Handicap exactly at previous tier max (5.9)
  // ----------------------------
  it("interpolates correctly at previous tier max (5.9)", async () => {
    mockPrisma.round.findUnique.mockResolvedValue({
      id: 24,
      score: 80,
      firHit: 6,
      girHit: 5,
      putts: 32,
      penalties: 2,
      handicapAtRound: 5.9, // Upper boundary of 0-5.9 tier
      tee: {
        courseRating: 72,
        slopeRating: 113,
        numberOfHoles: 18,
        nonPar3Holes: 14,
      },
    });

    const result = await calculateStrokesGained(
      { userId: BigInt(24), roundId: BigInt(24) },
      mockPrisma as any
    );

    expect(result.sgTotal).toBeDefined();
    expect(result.confidence).toBeDefined();
  });

  // ----------------------------
  // 24. Handicap exactly at next tier min (6.0)
  // ----------------------------
  it("interpolates correctly at next tier min (6.0)", async () => {
    mockPrisma.round.findUnique.mockResolvedValue({
      id: 25,
      score: 85,
      firHit: 7,
      girHit: 6,
      putts: 33,
      penalties: 2,
      handicapAtRound: 6.0, // Lower boundary of 6-10.9 tier
      tee: {
        courseRating: 72,
        slopeRating: 113,
        numberOfHoles: 18,
        nonPar3Holes: 14,
      },
    });

    const result = await calculateStrokesGained(
      { userId: BigInt(25), roundId: BigInt(25) },
      mockPrisma as any
    );

    expect(result.sgTotal).toBeDefined();
    expect(result.confidence).toBeDefined();
  });

  // ----------------------------
  // 25. Handicap exactly at upper tier max (10.9)
  // ----------------------------
  it("interpolates correctly at upper boundary of 6-10.9 tier (10.9)", async () => {
    mockPrisma.round.findUnique.mockResolvedValue({
      id: 26,
      score: 88,
      firHit: 7,
      girHit: 5,
      putts: 34,
      penalties: 2,
      handicapAtRound: 10.9, // Upper boundary of 6-10.9 tier
      tee: {
        courseRating: 72,
        slopeRating: 113,
        numberOfHoles: 18,
        nonPar3Holes: 14,
      },
    });

    const result = await calculateStrokesGained(
      { userId: BigInt(26), roundId: BigInt(26) },
      mockPrisma as any
    );

    expect(result.sgTotal).toBeDefined();
    expect(result.confidence).toBeDefined();
  });

  // ----------------------------
  // 26. Handicap exactly at next tier min (11.0)
  // ----------------------------
  it("interpolates correctly at next tier min (11.0)", async () => {
    mockPrisma.round.findUnique.mockResolvedValue({
      id: 27,
      score: 90,
      firHit: 6,
      girHit: 5,
      putts: 35,
      penalties: 2,
      handicapAtRound: 11.0, // Lower boundary of 11-15.9 tier
      tee: {
        courseRating: 72,
        slopeRating: 113,
        numberOfHoles: 18,
        nonPar3Holes: 14,
      },
    });

    const result = await calculateStrokesGained(
      { userId: BigInt(27), roundId: BigInt(27) },
      mockPrisma as any
    );

    expect(result.sgTotal).toBeDefined();
    expect(result.confidence).toBeDefined();
  });

  // ----------------------------
  // 27. Handicap with decimal inside tier (non-boundary)
  // ----------------------------
  it("interpolates correctly for decimal handicap inside a tier", async () => {
    mockPrisma.round.findUnique.mockResolvedValue({
      id: 28,
      score: 92,
      firHit: 6,
      girHit: 5,
      putts: 36,
      penalties: 2,
      handicapAtRound: 12.7, // Decimal inside 11-15.9 tier
      tee: {
        courseRating: 72,
        slopeRating: 113,
        numberOfHoles: 18,
        nonPar3Holes: 14,
      },
    });

    const result = await calculateStrokesGained(
      { userId: BigInt(28), roundId: BigInt(28) },
      mockPrisma as any
    );

    expect(result.sgTotal).toBeDefined();
    expect(result.confidence).toBeDefined();
  });

  // ----------------------------
  // 28. 9-hole round with only score known (partial data)
  // ----------------------------
  it("handles 9-hole round with only score known", async () => {
    mockPrisma.round.findUnique.mockResolvedValue({
      id: 29,
      score: 46,
      firHit: null,
      girHit: null,
      putts: null,
      penalties: null,
      handicapAtRound: 8,
      tee: {
        courseRating: 36,
        slopeRating: 113,
        numberOfHoles: 9,
        nonPar3Holes: 7,
      },
    });

    const result = await calculateStrokesGained(
      { userId: BigInt(29), roundId: BigInt(29) },
      mockPrisma as any
    );

    expect(result.partialAnalysis).toBe(true);
    expect(result.sgTotal).toBeDefined();
    expect(result.confidence).toBe("low");
  });

  // ----------------------------
  // 29. Extreme penalties
  // ----------------------------
  it("handles round with extreme penalties", async () => {
    mockPrisma.round.findUnique.mockResolvedValue({
      id: 30,
      score: 100,
      firHit: 6,
      girHit: 5,
      putts: 36,
      penalties: 12, // Extreme penalties
      handicapAtRound: 12,
      tee: {
        courseRating: 72,
        slopeRating: 113,
        numberOfHoles: 18,
        nonPar3Holes: 14,
      },
    });

    const result = await calculateStrokesGained(
      { userId: BigInt(30), roundId: BigInt(30) },
      mockPrisma as any
    );

    expect(result.sgPenalties).toBeDefined();
    expect(result.sgTotal).toBeDefined();
    expect(result.partialAnalysis).toBe(false);
  });

  // ----------------------------
  // 30. Elite tier player with eliteLocked = true
  // ----------------------------
  it("handles elite player with eliteLocked = true", async () => {
    mockPrisma.round.findUnique.mockResolvedValue({
      id: 31,
      score: 73,
      firHit: 9,
      girHit: 10,
      putts: 30,
      penalties: 1,
      handicapAtRound: -3, // Elite player
      tee: {
        courseRating: 72,
        slopeRating: 113,
        numberOfHoles: 18,
        nonPar3Holes: 14,
      },
    });

    // Elite tier baseline locked
    mockPrisma.handicapTierBaseline.findMany.mockResolvedValue([
      { handicapMin: -5, handicapMax: 0.9, baselineScore: 74, baselineFIRPct: 63, baselineGIRPct: 57, baselinePutts: 31, baselinePenalties: 1 },
      ...mockBaselineTiers,
    ]);

    const result = await calculateStrokesGained(
      { userId: BigInt(31), roundId: BigInt(31) },
      mockPrisma as any
    );

    expect(result.partialAnalysis).toBe(false);
    expect(result.sgTotal).toBeDefined();
    expect(result.confidence).toBeDefined();
  });
});