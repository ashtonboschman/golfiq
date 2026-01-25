// lib/utils/__tests__/strokesGained.test.ts
import { calculateStrokesGained } from "../strokesGained";

type MockPrisma = {
  round: { findUnique: jest.Mock };
  userLeaderboardStats: { findUnique: jest.Mock };
  handicapTierBaseline: { findFirst: jest.Mock };
};

describe("calculateStrokesGained", () => {
  let mockPrisma: MockPrisma;

  beforeEach(() => {
    mockPrisma = {
      round: { findUnique: jest.fn() },
      userLeaderboardStats: { findUnique: jest.fn() },
      handicapTierBaseline: { findFirst: jest.fn() },
    };
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

    mockPrisma.handicapTierBaseline.findFirst.mockResolvedValue({
      handicapMin: 6,
      handicapMax: 10.9,
      baselineScore: 85,
      baselineFIRPct: 48,
      baselineGIRPct: 37,      
      baselinePutts: 33,
      baselinePenalties: 2,
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
    expect(result.sgResidual).toBeCloseTo(-1.25, 2);
    expect(result.sgTotal).toBeCloseTo(-2.55, 2);
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

    mockPrisma.handicapTierBaseline.findFirst.mockResolvedValue({
      handicapMin: 11,
      handicapMax: 15.9,
      baselineScore: 89,
      baselineFIRPct: 43,
      baselineGIRPct: 27,
      baselinePutts: 34,
      baselinePenalties: 2,
    });

    const result = await calculateStrokesGained(
      { userId: BigInt(2), roundId: BigInt(2) },
      mockPrisma as any
    );

    expect(result.partialAnalysis).toBe(true);
    expect(result.sgPutting).toBeCloseTo(-2, 2);
    expect(result.sgResidual).toBeCloseTo(-1, 2);
    expect(result.sgTotal).toBeCloseTo(-3, 2);
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

    mockPrisma.handicapTierBaseline.findFirst.mockResolvedValue({
      handicapMin: 6,
      handicapMax: 10.9,
      baselineScore: 85,
      baselineFIRPct: 48,
      baselineGIRPct: 37,
      baselinePutts: 33,
      baselinePenalties: 2,
    });

    const result = await calculateStrokesGained(
      { userId: BigInt(3), roundId: BigInt(3) },
      mockPrisma as any
    );

    expect(result.partialAnalysis).toBe(true);
    expect(result.sgApproach).toBeCloseTo(-0.5, 2);
    expect(result.sgResidual).toBeCloseTo(-5.5, 2);
    expect(result.sgTotal).toBeCloseTo(-6, 2);
    expect(result.confidence).toBe("medium");
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

    mockPrisma.handicapTierBaseline.findFirst.mockResolvedValue({
      handicapMin: 6,
      handicapMax: 10.9,
      baselineScore: 85,
      baselineFIRPct: 48,
      baselineGIRPct: 37,      
      baselinePutts: 33,
      baselinePenalties: 2,
    });

    const result = await calculateStrokesGained(
      { userId: BigInt(4), roundId: BigInt(4) },
      mockPrisma as any
    );

    expect(result.partialAnalysis).toBe(true);
    expect(result.sgOffTee).toBeCloseTo(0.07, 2);
    expect(result.sgResidual).toBeCloseTo(-5.07, 2);
    expect(result.sgTotal).toBeCloseTo(-5, 2);
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

    mockPrisma.handicapTierBaseline.findFirst.mockResolvedValue({
      handicapMin: 11,
      handicapMax: 15.9,
      baselineScore: 89,
      baselineFIRPct: 43,
      baselineGIRPct: 27,      
      baselinePutts: 34,
      baselinePenalties: 2,
    });

    const result = await calculateStrokesGained(
      { userId: BigInt(5), roundId: BigInt(5) },
      mockPrisma as any
    );

    expect(result.partialAnalysis).toBe(true);
    expect(result.sgTotal).toBeCloseTo(-4, 2);
    expect(result.sgResidual).toBeCloseTo(-4, 2);
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

    mockPrisma.handicapTierBaseline.findFirst.mockResolvedValue({
      handicapMin: 6,
      handicapMax: 10.9,
      baselineScore: 85,
      baselineFIRPct: 48,
      baselineGIRPct: 37,      
      baselinePutts: 33,
      baselinePenalties: 2,
    });

    const result = await calculateStrokesGained(
      { userId: BigInt(6), roundId: BigInt(6) },
      mockPrisma as any
    );

    expect(result.sgPutting).toBeGreaterThan(3.5);
    expect(result.messages).toEqual(
      expect.arrayContaining([
        expect.stringContaining("Exceptional putting"),
      ])
    );
  });
});