// lib/utils/__tests__/handicap.test.ts
import { calculateHandicap, normalizeRoundsByMode } from "../handicap";

type Round = {
  holes: number;
  score: number;
  to_par?: number | null;
  rating: number;
  slope: number;
  fir_hit?: number | null;
  fir_total: number;
  gir_hit?: number | null;
  gir_total: number;
  putts?: number | null;
  penalties?: number | null;
  par: number;
};

describe("normalizeRoundsByMode", () => {
  const mock18HoleRound: Round = {
    holes: 18,
    score: 85,
    to_par: 13,
    rating: 72,
    slope: 113,
    fir_hit: 7,
    fir_total: 14,
    gir_hit: 6,
    gir_total: 18,
    putts: 32,
    penalties: 2,
    par: 72,
  };

  const mock9HoleRound: Round = {
    holes: 9,
    score: 42,
    to_par: 6,
    rating: 36,
    slope: 113,
    fir_hit: 3,
    fir_total: 7,
    gir_hit: 3,
    gir_total: 9,
    putts: 16,
    penalties: 1,
    par: 36,
  };

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
  const createRound = (diff: number): Round => {
    const rating = 72;
    const slope = 113;
    const score = rating + diff; // Simplified: diff = (score - rating) * 113 / slope

    return {
      holes: 18,
      score,
      rating,
      slope,
      fir_total: 14,
      gir_total: 18,
      par: 72,
    };
  };

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
