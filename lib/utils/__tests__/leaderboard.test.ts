import { recalcLeaderboard } from "../leaderboard";
import { prisma } from "@/lib/db";
import { normalizeRoundsByMode, calculateHandicap } from "../handicap";
import { resolveTeeContext } from "@/lib/tee/resolveTeeContext";

jest.mock("@/lib/db", () => ({
  prisma: {
    round: { findMany: jest.fn() },
    userLeaderboardStats: { upsert: jest.fn() },
  },
}));

jest.mock("../handicap", () => ({
  normalizeRoundsByMode: jest.fn((rounds: any[]) => rounds),
  calculateHandicap: jest.fn(() => 12.3),
}));

jest.mock("@/lib/tee/resolveTeeContext", () => ({
  resolveTeeContext: jest.fn(() => ({
    holes: 18,
    courseRating: 72,
    slopeRating: 113,
    bogeyRating: null,
    parTotal: 72,
    nonPar3Holes: 14,
    holeRange: [],
  })),
}));

const mockedPrisma = prisma as unknown as {
  round: { findMany: jest.Mock };
  userLeaderboardStats: { upsert: jest.Mock };
};

const mockedNormalize = normalizeRoundsByMode as unknown as jest.Mock;
const mockedHandicap = calculateHandicap as unknown as jest.Mock;
const mockedResolve = resolveTeeContext as unknown as jest.Mock;

describe("leaderboard utils", () => {
  beforeEach(() => {
    mockedPrisma.round.findMany.mockReset();
    mockedPrisma.userLeaderboardStats.upsert.mockReset();
    mockedNormalize.mockClear();
    mockedHandicap.mockClear();
    mockedResolve.mockClear();
  });

  it("clears stats when user has no rounds", async () => {
    mockedPrisma.round.findMany.mockResolvedValue([]);

    await recalcLeaderboard(BigInt(1));

    expect(mockedPrisma.userLeaderboardStats.upsert).toHaveBeenCalledWith({
      where: { userId: BigInt(1) },
      create: {
        userId: BigInt(1),
        averageScore: null,
        bestScore: null,
        averageToPar: null,
        bestToPar: null,
        handicap: null,
        totalRounds: 0,
      },
      update: {
        averageScore: null,
        bestScore: null,
        averageToPar: null,
        bestToPar: null,
        handicap: null,
        totalRounds: 0,
      },
    });
  });

  it("clears stats when no valid rounds exist", async () => {
    mockedPrisma.round.findMany.mockResolvedValue([
      { score: null, toPar: null, teeSegment: "full", tee: {} },
    ]);

    await recalcLeaderboard(BigInt(2));

    expect(mockedPrisma.userLeaderboardStats.upsert).toHaveBeenCalled();
    expect(mockedHandicap).not.toHaveBeenCalled();
  });

  it("derives toPar when missing using tee context", async () => {
    mockedResolve.mockReturnValueOnce({
      holes: 18,
      courseRating: 72,
      slopeRating: 113,
      bogeyRating: null,
      parTotal: 70,
      nonPar3Holes: 12,
      holeRange: [],
    });

    mockedPrisma.round.findMany.mockResolvedValue([
      {
        score: 80,
        toPar: null,
        firHit: 7,
        girHit: 8,
        putts: 32,
        penalties: 2,
        date: new Date("2026-02-01"),
        teeSegment: "full",
        tee: {},
      },
    ]);

    await recalcLeaderboard(BigInt(4));

    expect(mockedPrisma.userLeaderboardStats.upsert).toHaveBeenCalledWith({
      where: { userId: BigInt(4) },
      create: {
        userId: BigInt(4),
        averageScore: 80,
        bestScore: 80,
        averageToPar: 10,
        bestToPar: 10,
        handicap: 12.3,
        totalRounds: 1,
      },
      update: {
        averageScore: 80,
        bestScore: 80,
        averageToPar: 10,
        bestToPar: 10,
        handicap: 12.3,
        totalRounds: 1,
      },
    });
  });

  it("aggregates stats and writes leaderboard summary", async () => {
    mockedPrisma.round.findMany.mockResolvedValue([
      {
        score: 80,
        toPar: 8,
        firHit: 7,
        girHit: 8,
        putts: 32,
        penalties: 2,
        date: new Date("2026-02-01"),
        teeSegment: "full",
        tee: {},
      },
      {
        score: 76,
        toPar: 4,
        firHit: 8,
        girHit: 9,
        putts: 30,
        penalties: 1,
        date: new Date("2026-02-02"),
        teeSegment: "full",
        tee: {},
      },
    ]);

    await recalcLeaderboard(BigInt(3));

    expect(mockedNormalize).toHaveBeenCalledWith(expect.any(Array), "combined");
    expect(mockedHandicap).toHaveBeenCalled();
    expect(mockedPrisma.userLeaderboardStats.upsert).toHaveBeenCalledWith({
      where: { userId: BigInt(3) },
      create: {
        userId: BigInt(3),
        averageScore: 78,
        bestScore: 76,
        averageToPar: 6,
        bestToPar: 4,
        handicap: 12.3,
        totalRounds: 2,
      },
      update: {
        averageScore: 78,
        bestScore: 76,
        averageToPar: 6,
        bestToPar: 4,
        handicap: 12.3,
        totalRounds: 2,
      },
    });
  });
});
