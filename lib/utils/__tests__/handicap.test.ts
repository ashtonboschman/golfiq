// lib/utils/__tests__/handicap.test.ts
import { calculateHandicap, calculateNetScore, calculateNetScoreLegacy, normalizeRoundsByMode } from "../handicap";
import { createRound, mock18HoleRound, mock9HoleRound, type RoundFixture } from "../__fixtures__/handicapFixtures";

type Round = RoundFixture;

describe("normalizeRoundsByMode", () => {
  // ----------------------------
  // Combined Mode Tests
  // ----------------------------
  describe("combined mode", () => {
    it("doubles 9-hole round stats", () => {
      const result = normalizeRoundsByMode([mock9HoleRound], "combined");

      expect(result).toHaveLength(1);
      expect(result[0].holes).toBe(18);
      expect(result[0].score).toBe(84); // 42 * 2
      expect(result[0].to_par).toBe(12); // 6 * 2
      expect(result[0].net_score).toBe(80); // 40 * 2
      expect(result[0].fir_hit).toBe(6); // 3 * 2
      expect(result[0].fir_total).toBe(14); // 7 * 2
      expect(result[0].gir_hit).toBe(6); // 3 * 2
      expect(result[0].gir_total).toBe(18); // 9 * 2
      expect(result[0].putts).toBe(32); // 16 * 2
      expect(result[0].penalties).toBe(2); // 1 * 2
      expect(result[0].rating).toBe(72); // 36 * 2
      expect(result[0].par).toBe(72); // 36 * 2
    });

    it("leaves 18-hole rounds unchanged", () => {
      const result = normalizeRoundsByMode([mock18HoleRound], "combined");

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual(mock18HoleRound);
    });

    it("preserves net_score for 18-hole rounds", () => {
      const roundWithNet: Round = { ...mock18HoleRound, net_score: 80 };
      const result = normalizeRoundsByMode([roundWithNet], "combined");

      expect(result).toHaveLength(1);
      expect(result[0].net_score).toBe(80);
    });

    it("handles mixed 9 and 18 hole rounds", () => {
      const result = normalizeRoundsByMode(
        [mock18HoleRound, mock9HoleRound],
        "combined"
      );

      expect(result).toHaveLength(2);
      expect(result[0].holes).toBe(18);
      expect(result[0].score).toBe(85);
      expect(result[1].holes).toBe(18);
      expect(result[1].score).toBe(84);
    });

    it("handles null stat values correctly", () => {
      const roundWithNulls: Round = {
        ...mock9HoleRound,
        to_par: null,
        fir_hit: null,
        gir_hit: null,
        putts: null,
        penalties: null,
      };

      const result = normalizeRoundsByMode([roundWithNulls], "combined");

      expect(result[0].to_par).toBeNull();
      expect(result[0].fir_hit).toBeNull();
      expect(result[0].gir_hit).toBeNull();
      expect(result[0].putts).toBeNull();
      expect(result[0].penalties).toBeNull();
    });
  });

  // ----------------------------
  // 9-Hole Mode Tests
  // ----------------------------
  describe("9-hole mode", () => {
    it("filters only 9-hole rounds", () => {
      const result = normalizeRoundsByMode(
        [mock18HoleRound, mock9HoleRound],
        "9"
      );

      expect(result).toHaveLength(1);
      expect(result[0].holes).toBe(9);
      expect(result[0].score).toBe(42);
    });

    it("returns empty array when no 9-hole rounds exist", () => {
      const result = normalizeRoundsByMode([mock18HoleRound], "9");

      expect(result).toHaveLength(0);
    });

    it("returns multiple 9-hole rounds", () => {
      const result = normalizeRoundsByMode(
        [mock9HoleRound, mock9HoleRound, mock18HoleRound],
        "9"
      );

      expect(result).toHaveLength(2);
      expect(result[0].holes).toBe(9);
      expect(result[1].holes).toBe(9);
    });
  });

  // ----------------------------
  // 18-Hole Mode Tests
  // ----------------------------
  describe("18-hole mode", () => {
    it("filters only 18-hole rounds", () => {
      const result = normalizeRoundsByMode(
        [mock18HoleRound, mock9HoleRound],
        "18"
      );

      expect(result).toHaveLength(1);
      expect(result[0].holes).toBe(18);
      expect(result[0].score).toBe(85);
    });

    it("returns empty array when no 18-hole rounds exist", () => {
      const result = normalizeRoundsByMode([mock9HoleRound], "18");

      expect(result).toHaveLength(0);
    });

    it("returns multiple 18-hole rounds", () => {
      const result = normalizeRoundsByMode(
        [mock18HoleRound, mock18HoleRound, mock9HoleRound],
        "18"
      );

      expect(result).toHaveLength(2);
      expect(result[0].holes).toBe(18);
      expect(result[1].holes).toBe(18);
    });
  });
});

describe("calculateHandicap", () => {
  // Helper to create a round with specific differential
  // ----------------------------
  // Insufficient Rounds
  // ----------------------------
  it("returns null with fewer than 3 rounds", () => {
    expect(calculateHandicap([])).toBeNull();
    expect(calculateHandicap([createRound(10)])).toBeNull();
    expect(calculateHandicap([createRound(10), createRound(12)])).toBeNull();
  });

  // ----------------------------
  // 3 Rounds (uses lowest 1 with -2 adjustment)
  // ----------------------------
  it("calculates handicap with 3 rounds", () => {
    const rounds = [createRound(10), createRound(12), createRound(8)];

    const result = calculateHandicap(rounds);

    // Lowest 1: 8.0, adjustment: -2
    // Handicap = 8.0 - 2 = 6.0
    expect(result).toBeCloseTo(6.0, 1);
  });

  // ----------------------------
  // 4 Rounds (uses lowest 1 with -1 adjustment)
  // ----------------------------
  it("calculates handicap with 4 rounds", () => {
    const rounds = [
      createRound(10),
      createRound(12),
      createRound(8),
      createRound(14),
    ];

    const result = calculateHandicap(rounds);

    // Lowest 1: 8.0, adjustment: -1
    // Handicap = 8.0 - 1 = 7.0
    expect(result).toBeCloseTo(7.0, 1);
  });

  // ----------------------------
  // 5 Rounds (uses lowest 1 with 0 adjustment)
  // ----------------------------
  it("calculates handicap with 5 rounds", () => {
    const rounds = [
      createRound(10),
      createRound(12),
      createRound(8),
      createRound(14),
      createRound(9),
    ];

    const result = calculateHandicap(rounds);

    // Lowest 1: 8.0, adjustment: 0
    // Handicap = 8.0
    expect(result).toBeCloseTo(8.0, 1);
  });

  // ----------------------------
  // 6 Rounds (uses lowest 2 with -1 adjustment)
  // ----------------------------
  it("calculates handicap with 6 rounds", () => {
    const rounds = [
      createRound(10),
      createRound(12),
      createRound(8),
      createRound(14),
      createRound(9),
      createRound(11),
    ];

    const result = calculateHandicap(rounds);

    // Lowest 2: 8.0, 9.0, average = 8.5, adjustment: -1
    // Handicap = 8.5 - 1 = 7.5
    expect(result).toBeCloseTo(7.5, 1);
  });

  // ----------------------------
  // 9 Rounds (uses lowest 3 with 0 adjustment)
  // ----------------------------
  it("calculates handicap with 9 rounds", () => {
    const rounds = Array.from({ length: 9 }, (_, i) => createRound(8 + i));

    const result = calculateHandicap(rounds);

    // Lowest 3: 8.0, 9.0, 10.0, average = 9.0
    // Handicap = 9.0
    expect(result).toBeCloseTo(9.0, 1);
  });

  // ----------------------------
  // 15 Rounds (uses lowest 5 with 0 adjustment)
  // ----------------------------
  it("calculates handicap with 15 rounds", () => {
    const rounds = Array.from({ length: 15 }, (_, i) => createRound(8 + i));

    const result = calculateHandicap(rounds);

    // Lowest 5: 8.0, 9.0, 10.0, 11.0, 12.0, average = 10.0
    // Handicap = 10.0
    expect(result).toBeCloseTo(10.0, 1);
  });

  // ----------------------------
  // 20+ Rounds (uses lowest 8 from recent 20)
  // ----------------------------
  it("calculates handicap with 20 rounds", () => {
    const rounds = Array.from({ length: 20 }, (_, i) => createRound(8 + i));

    const result = calculateHandicap(rounds);

    // Recent 20: all of them
    // Lowest 8: 8.0, 9.0, 10.0, 11.0, 12.0, 13.0, 14.0, 15.0
    // Average = 11.5
    expect(result).toBeCloseTo(11.5, 1);
  });

  it("uses only recent 20 rounds when more than 20 exist", () => {
    // 25 rounds, but only recent 20 should be used
    const rounds = Array.from({ length: 25 }, (_, i) => createRound(5 + i));

    const result = calculateHandicap(rounds);

    // Recent 20: diffs 10-29 (indices 5-24)
    // Lowest 8: 10.0, 11.0, 12.0, 13.0, 14.0, 15.0, 16.0, 17.0
    // Average = 13.5
    expect(result).toBeCloseTo(13.5, 1);
  });

  // ----------------------------
  // Slope and Rating Adjustments
  // ----------------------------
  it("adjusts for course slope", () => {
    const rounds = [
      {
        holes: 18,
        score: 85,
        rating: 72,
        slope: 130, // Harder course
        fir_total: 14,
        gir_total: 18,
        par: 72,
      },
      {
        holes: 18,
        score: 85,
        rating: 72,
        slope: 100, // Easier course
        fir_total: 14,
        gir_total: 18,
        par: 72,
      },
      {
        holes: 18,
        score: 85,
        rating: 72,
        slope: 113, // Standard
        fir_total: 14,
        gir_total: 18,
        par: 72,
      },
    ];

    const result = calculateHandicap(rounds);

    // Diff 1: (85 - 72) * 113 / 130 = 11.29
    // Diff 2: (85 - 72) * 113 / 100 = 14.69
    // Diff 3: (85 - 72) * 113 / 113 = 13.0
    // Lowest 1: 11.29, adjustment: -2
    // Handicap = 11.29 - 2 = 9.29
    expect(result).toBeCloseTo(9.3, 1);
  });

  it("adjusts for course rating", () => {
    const rounds = [
      {
        holes: 18,
        score: 85,
        rating: 75, // Harder rating
        slope: 113,
        fir_total: 14,
        gir_total: 18,
        par: 72,
      },
      {
        holes: 18,
        score: 85,
        rating: 70, // Easier rating
        slope: 113,
        fir_total: 14,
        gir_total: 18,
        par: 72,
      },
      {
        holes: 18,
        score: 85,
        rating: 72, // Standard
        slope: 113,
        fir_total: 14,
        gir_total: 18,
        par: 72,
      },
    ];

    const result = calculateHandicap(rounds);

    // Diff 1: (85 - 75) * 113 / 113 = 10.0
    // Diff 2: (85 - 70) * 113 / 113 = 15.0
    // Diff 3: (85 - 72) * 113 / 113 = 13.0
    // Lowest 1: 10.0, adjustment: -2
    // Handicap = 10.0 - 2 = 8.0
    expect(result).toBeCloseTo(8.0, 1);
  });

  // ----------------------------
  // Edge Cases
  // ----------------------------
  it("caps handicap at 54.0", () => {
    const rounds = Array.from({ length: 3 }, () => createRound(60));

    const result = calculateHandicap(rounds);

    // Lowest 1: 60.0, adjustment: -2
    // Handicap = 60.0 - 2 = 58.0, but capped at 54.0
    expect(result).toBe(54.0);
  });

  it("rounds to one decimal place", () => {
    const rounds = [
      createRound(10.456),
      createRound(12.789),
      createRound(8.123),
    ];

    const result = calculateHandicap(rounds);

    // Should round to 1 decimal place
    expect(result).toBe(Math.round((result || 0) * 10) / 10);
  });

  it("handles negative differentials", () => {
    const rounds = [createRound(-5), createRound(-3), createRound(-2)];

    const result = calculateHandicap(rounds);

    // Lowest 1: -5.0, adjustment: -2
    // Handicap = -5.0 - 2 = -7.0
    expect(result).toBeCloseTo(-7.0, 1);
  });

  it("handles zero differentials", () => {
    const rounds = [createRound(0), createRound(1), createRound(2)];

    const result = calculateHandicap(rounds);

    // Lowest 1: 0.0, adjustment: -2
    // Handicap = 0.0 - 2 = -2.0
    expect(result).toBeCloseTo(-2.0, 1);
  });

  it("handles missing slope (defaults to 113)", () => {
    const rounds = [
      {
        holes: 18,
        score: 85,
        rating: 72,
        slope: undefined as any,
        fir_total: 14,
        gir_total: 18,
        par: 72,
      },
      createRound(12),
      createRound(14),
    ];

    const result = calculateHandicap(rounds);

    // First round: (85 - 72) * 113 / 113 = 13.0
    // Should treat undefined slope as 113
    expect(result).toBeDefined();
  });

  it("handles missing rating (defaults to 72)", () => {
    const rounds = [
      {
        holes: 18,
        score: 85,
        rating: undefined as any,
        slope: 113,
        fir_total: 14,
        gir_total: 18,
        par: 72,
      },
      createRound(12),
      createRound(14),
    ];

    const result = calculateHandicap(rounds);

    // First round: (85 - 72) * 113 / 113 = 13.0
    // Should treat undefined rating as 72
    expect(result).toBeDefined();
  });
});

describe("calculateNetScore", () => {
  it("returns nulls when handicap is null", () => {
    const ctx = {
      holes: 18,
      slopeRating: 113,
      courseRating: 72,
      parTotal: 72,
    };

    expect(calculateNetScore(85, null, ctx)).toEqual({ netScore: null, netToPar: null });
  });

  it("calculates net score for 18 holes", () => {
    const ctx = {
      holes: 18,
      slopeRating: 113,
      courseRating: 72,
      parTotal: 72,
    };

    const result = calculateNetScore(85, 10, ctx);
    expect(result.netScore).toBe(75);
    expect(result.netToPar).toBe(3);
  });

  it("scales course handicap for 9-hole rounds", () => {
    const ctx = {
      holes: 9,
      slopeRating: 113,
      courseRating: 36,
      parTotal: 36,
    };

    const result = calculateNetScore(40, 10, ctx);
    expect(result.netScore).toBe(35);
    expect(result.netToPar).toBe(-1);
  });

  it("applies slope and rating adjustments for 18 holes", () => {
    const ctx = {
      holes: 18,
      slopeRating: 130,
      courseRating: 74,
      parTotal: 72,
    };

    const result = calculateNetScore(90, 12, ctx);

    // courseHandicap = round(12 * (130/113) + (74 - 72)) = round(15.81) = 16
    // netScore = 90 - 16 = 74, netToPar = 74 - 72 = 2
    expect(result.netScore).toBe(74);
    expect(result.netToPar).toBe(2);
  });

  it("applies slope and rating adjustments for 9 holes", () => {
    const ctx = {
      holes: 9,
      slopeRating: 120,
      courseRating: 36.5,
      parTotal: 36,
    };

    const result = calculateNetScore(44, 18, ctx);

    // courseHandicap = round(18 * (120/113) * 0.5 + (36.5 - 36)) = round(10.06) = 10
    // netScore = 44 - 10 = 34, netToPar = 34 - 36 = -2
    expect(result.netScore).toBe(34);
    expect(result.netToPar).toBe(-2);
  });

  it("handles negative handicap indexes", () => {
    const ctx = {
      holes: 18,
      slopeRating: 113,
      courseRating: 72,
      parTotal: 72,
    };

    const result = calculateNetScore(70, -2.4, ctx);

    // courseHandicap = round(-2.4) = -2
    // netScore = 70 - (-2) = 72, netToPar = 0
    expect(result.netScore).toBe(72);
    expect(result.netToPar).toBe(0);
  });
});

describe("calculateNetScoreLegacy", () => {
  it("matches calculateNetScore for 18-hole inputs", () => {
    const ctx = {
      holes: 18,
      slopeRating: 113,
      courseRating: 72,
      parTotal: 72,
    };

    const legacy = calculateNetScoreLegacy(85, 10, 72, 72, 113);
    const modern = calculateNetScore(85, 10, ctx);

    expect(legacy).toEqual(modern);
  });

  it("returns nulls when any input is null", () => {
    expect(calculateNetScoreLegacy(85, null, 72, 72, 113)).toEqual({
      netScore: null,
      netToPar: null,
    });
    expect(calculateNetScoreLegacy(85, 10, null, 72, 113)).toEqual({
      netScore: null,
      netToPar: null,
    });
    expect(calculateNetScoreLegacy(85, 10, 72, null, 113)).toEqual({
      netScore: null,
      netToPar: null,
    });
    expect(calculateNetScoreLegacy(85, 10, 72, 72, null)).toEqual({
      netScore: null,
      netToPar: null,
    });
  });
});

describe("integration-style checks", () => {
  it("calculates handicap for a realistic round set (golden test)", () => {
    const rounds: Round[] = [
      { holes: 18, score: 92, rating: 71.1, slope: 125, fir_total: 14, gir_total: 18, par: 72 },
      { holes: 18, score: 88, rating: 69.2, slope: 117, fir_total: 14, gir_total: 18, par: 72 },
      { holes: 18, score: 95, rating: 72.4, slope: 130, fir_total: 14, gir_total: 18, par: 72 },
      { holes: 18, score: 90, rating: 70.0, slope: 118, fir_total: 14, gir_total: 18, par: 72 },
      { holes: 18, score: 86, rating: 69.2, slope: 117, fir_total: 14, gir_total: 18, par: 72 },
    ];

    const result = calculateHandicap(rounds);

    // Diffs (approx): 19.0, 18.2, 20.0, 19.2, 16.2
    // 5 rounds => lowest 1, adjustment 0 => 16.2
    expect(result).toBeCloseTo(16.2, 1);
  });

  it("computes net score with real tee context values", () => {
    const ctx = {
      holes: 18,
      slopeRating: 117,
      courseRating: 69.2,
      parTotal: 72,
    };

    const result = calculateNetScore(90, 14.2, ctx);

    // courseHandicap = round(14.2 * (117/113) + (69.2 - 72)) = round(11.9) = 12
    // netScore = 90 - 12 = 78, netToPar = 78 - 72 = 6
    expect(result.netScore).toBe(78);
    expect(result.netToPar).toBe(6);
  });

  it("rounds course handicap at .5 boundaries", () => {
    const ctx = {
      holes: 18,
      slopeRating: 113,
      courseRating: 72,
      parTotal: 72,
    };

    // courseHandicap = round(10.5) = 11
    const result = calculateNetScore(85, 10.5, ctx);
    expect(result.netScore).toBe(74);
    expect(result.netToPar).toBe(2);
  });

  it("normalizes 9-hole rounds before handicap calculation", () => {
    const rounds: Round[] = [
      { holes: 9, score: 44, rating: 36, slope: 113, fir_total: 7, gir_total: 9, par: 36 },
      { holes: 9, score: 42, rating: 36, slope: 113, fir_total: 7, gir_total: 9, par: 36 },
      { holes: 9, score: 40, rating: 36, slope: 113, fir_total: 7, gir_total: 9, par: 36 },
    ];

    const normalized = normalizeRoundsByMode(rounds, "combined");
    const result = calculateHandicap(normalized);

    // Scores become 88, 84, 80 with rating 72
    // Diffs: 16, 12, 8 -> lowest 1 (8) with -2 adjustment => 6.0
    expect(result).toBeCloseTo(6.0, 1);
  });
});
